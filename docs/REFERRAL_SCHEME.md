# Referral Scheme

Every existing and newly registered member has a stable, randomly generated `HIVE-…` code and a shareable booking-app link. The new customer **Referral Scheme** tab provides copy/share actions, pending/earned counts and available free lessons. Other members' names and payment details are not returned in referral progress.

## Customer journey

1. A member verifies access to Referral Scheme with an emailed code, once per browser session, then copies or shares their link. A friend follows `https://<booking-app>/?ref=HIVE-…`. Registration opens with the code filled in; the browser remembers it across reloads until an account is created. Someone registering on another device can enter the same code manually. Normal app arrivals still open Sign in.
2. The code is consumed only when creating a new account. Invalid codes fail with an explanation before any account is created. Profile updates cannot add or change referral attribution. The same account/email cannot refer itself.
3. When the friend purchases a single-class monthly membership or Mix & Match, the checkout service privately binds the original billing request, booking group and member. PAYG, tasters and Self Defence do not qualify.
4. A reward is earned when GoCardless reports a positive GBP membership payment as **confirmed** or **paid_out**. Direct Debit setup, `pending_submission`, `submitted`, failed/abandoned payments and the browser's local Paid label do not award a reward. Prorated first payments qualify. A later confirmed renewal can qualify if no earlier payment did, but each referred account can earn its referrer only one reward across all memberships.
5. The referrer selects one available credit and a regular Zumba or BoxFit date in Referral Scheme. The shared cancellation-policy popup precedes redemption. No GoCardless request is made. The server locks the credit, checks ownership, date, duplicate reservation and class capacity, and creates a £0 confirmed booking. Both member and Shams receive the usual branded booking confirmation, explicitly describing a free referral lesson. The admin booking list/export shows `Referral reward`, and the customer sees `Referral reward · Free lesson` in My bookings.
6. The normal cancellation action/email remains available. Cancellation at least 24 hours before the London class start returns the reward once. A later cancellation consumes it. Restoring a cancelled reward booking is blocked; returned rewards must be booked again through Referral Scheme to avoid creating two reservations with one credit.

Unused rewards have no expiry in this version, cannot be transferred or exchanged for cash, and are usable for one regular Zumba/BoxFit place only. There is no cap on distinct successful referrals. This is a new scheme: existing members can refer new registrations, but old registrations are not retrospectively attributed. Rewards appear when the referral tab is opened/refreshed; there is no separate reward-earned marketing email. Undelivered free-lesson booking confirmations retry when the member visits the tab.

## Storage and payment verification

`20261017040000_referral_scheme.sql` backfills stable private codes for existing users and installs private attribution, checkout binding and redemption tables. The `users.referral_signup_code` input is consumed by a trigger and stored as NULL, so public user rows do not expose a referral graph. Service-only RPCs issue and spend credits. A unique referred-member row and payment reference, conditional award update, row locks and deterministic redemption IDs protect repeated or concurrent requests. Cancellation restores credits within the same database transaction as cancelling the reservation.

The payment helper re-fetches the canonical GoCardless billing request and, for renewals, the actual subscription. It verifies the membership plan, fulfilled request, original payment or matching monthly subscription/mandate, amount/currency and provider creation time after registration. Mutating public booking ownership after checkout cannot redirect the bound referral. Confirmed-payment webhooks and existing server reconciliation use the same helper.

The app's existing custom browser login and public user/booking storage are retained. The new referral API separately requires a server-generated, emailed six-digit code before returning an opaque, member-bound access token. Requesting codes is limited to once per minute and ten per UTC day, with five verification attempts and a 15-minute expiry. Tokens are hashed server-side, expire after 30 days, live in browser sessionStorage, and are cleared/revoked on sign-out. An ID or forged browser session alone cannot read or redeem referrals. The access email is snapshotted privately at signup (or rollout for existing members), so editing a public user row cannot redirect the code. Email address changes for this feature require an authorised service-side update; the current Account page only changes name/phone.

This does not migrate the rest of the app to server-verified authentication/RLS. Existing booking cancellation still uses the shared public booking workflow. Self-referral checks cover the same account/email; this feature cannot prove two different email addresses belong to different real people.

## Deployment

The existing Edge Functions workflow applies the migration, checks all nine service RPCs, deploys `referral-scheme` and then the updated mailer/payment handlers. Deploy this backend successfully **before the frontend**, since referred signup and membership checkout now depend on the migration. Re-running the migration preserves codes, existing attribution and rewards. No new secrets or GoCardless templates are needed. No live changes or messages are made by the fixture tests.

## Verification

```sh
npm run test:referral-scheme -- /path/to/@electric-sql/pglite/dist/index.js
npm run test:mix-match-payments -- /path/to/@electric-sql/pglite/dist/index.js
npm run test:gocardless-allocation
npm run test:gocardless-checkout
npm run test:email-branding
npm run build
npm run check:edge-functions
```

With the fixture Vite server on port 5174, run `PYTHONDONTWRITEBYTECODE=1 python scripts/test-referral-ui.py`. This covers invitation registration, remembered/manual codes, sharing, reward selection, policy ordering, full-class retry, confirmed My bookings and mobile/desktop layout. The SQL/handler tests exercise actual signed webhooks, both membership types, repeat events, initial-payment/renewal checks, private privileges, ownership, capacity, mail outages and timely/late credit restoration.
