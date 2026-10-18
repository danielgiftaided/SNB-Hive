# Referral Scheme

Every existing and newly registered member has a stable, randomly generated `HIVE-…` code and a shareable booking-app link. The customer **Referral Scheme** tab provides copy/share actions and referral progress. Earned **free Pay as you go credits** also appear in **My bookings**, where they can book a regular lesson or reduce one membership payment. Other members' names and payment details are not returned in referral progress.

## Customer journey

1. A member verifies access to Referral Scheme with an emailed code, once per browser session, then copies or shares their link. A friend follows `https://<booking-app>/?ref=HIVE-…`. Registration opens with the code filled in; the browser remembers it across reloads until an account is created. Someone registering on another device can enter the same code manually. Normal app arrivals still open Sign in.
2. The code is consumed only when creating a new account. Invalid codes fail with an explanation before any account is created. Profile updates cannot add or change referral attribution. The same account/email cannot refer itself.
3. When the friend purchases a single-class monthly membership or Mix & Match, the checkout service privately binds the original billing request, booking group and member. PAYG, tasters and Self Defence do not qualify.
4. A reward is earned when GoCardless reports a positive GBP membership payment as **confirmed** or **paid_out**. Direct Debit setup, `pending_submission`, `submitted`, failed/abandoned payments and the browser's local Paid label do not award a reward. Prorated first payments qualify. A later confirmed renewal can qualify if no earlier payment did, but each referred account can earn its referrer only one reward across all memberships.
5. When the reward is earned, the referrer and Shams each receive a branded eligibility email. A dedicated credit entry appears in My bookings without reserving a lesson date. These wallet entries are excluded from admin class-booking counts and exports. The referrer selects one available credit and a regular Zumba or BoxFit date in My bookings or Referral Scheme. The shared cancellation-policy popup precedes redemption. No GoCardless request is made. The server locks the credit, checks ownership, date, duplicate reservation and class capacity, and creates a £0 confirmed booking. Both member and Shams receive the usual branded booking confirmation, explicitly describing a free referral lesson. The admin booking list/export shows `Referral reward`, and the customer sees `Referral reward · Free lesson` in My bookings.
6. The normal cancellation action/email remains available. Cancellation at least 24 hours before the London class start returns the reward once. A later cancellation consumes it. Restoring a cancelled reward booking is blocked; returned rewards must be booked again through Referral Scheme to avoid creating two reservations with one credit.

Unused rewards have no expiry, cannot be transferred or exchanged for cash, and cover either one regular Zumba/BoxFit place **or one £8.75 membership reduction**. There is no cap on distinct successful referrals. This is a new scheme: existing members can refer new registrations, but old registrations are not retrospectively attributed. Reward emails are transactional eligibility notifications and are retried through payment reconciliation and authenticated credit views, using saved acknowledgement markers and per-recipient mail-provider idempotency. Undelivered free-lesson booking confirmations also retry when the member visits the credit view. Existing earned rewards receive backfilled credit entries; unsent eligibility notices can be delivered on subsequent payment reconciliation or a verified visit to credits.

## One-off membership reduction

An active Zumba, BoxFit or Mix & Match member can choose **£8.75 off one monthly membership payment** instead of a free extra lesson. The selected month costs **£26.25** and includes the usual lessons; later months remain **£35**. One credit is allowed per subscription/month; more rewards can be assigned to later eligible months. A reserved credit cannot also be spent on a class. Until processing starts, **Use this credit for a lesson instead** releases the reservation. Once a bank-payment replacement starts, the credit stays assigned; **Retry reduced payment** safely resumes an interrupted operation.

GoCardless payment amounts cannot be edited. The implementation leaves the recurring subscription amount/schedule unchanged: it cancels one verified £35 collection **only while `pending_submission`**, then creates an idempotent £26.25 one-off payment against the same mandate. The replacement funds that original membership month, including the exact 2+2 Mix & Match entitlement. Already-allocated dates and cancellations are preserved when payment references are replaced. Receipts show the provider amount even if a cancelled lesson carried the group's original price.

If the next collection is already submitted/collected, the app offers the next eligible month. A submission race also postpones the credit and records an explanatory note. An interrupted cancellation/create operation is stored privately and retried by signed webhooks or the authenticated retry action; the £35 collection must be confirmed cancelled before a replacement can be created. A stable GoCardless idempotency key prevents a lost response from creating two £26.25 payments. Subsequent subscription payments continue at £35 without changing the subscription, so recurring amendment limits do not accumulate.

Membership search uses public booking rows only as hints, then verifies the live subscription and mandate/customer email against the private account email. Subscriptions must be active £35 GBP monthly plans billing on day 1. If the provider email differs, a bank mandate has changed, or an account has unusually large provider history (more than 2,000 records), Shams must check the link before a reduction can be offered; the free-lesson option remains available. Membership cancellation/bank-account changes after a credit is assigned may require staff assistance; queued credits can be released in the app before processing.

Provider contracts were checked against GoCardless's official generated [payment service](https://github.com/gocardless/gocardless-pro-python/blob/master/gocardless_pro/services/payments_service.py) (metadata-only updates, cancel only before submission, create against a mandate) and [subscription service](https://github.com/gocardless/gocardless-pro-python/blob/master/gocardless_pro/services/subscriptions_service.py) (persistent amount updates have amendment limits). No live provider changes are made during development.

## Storage and payment verification

`20261017040000_referral_scheme.sql` backfills stable private codes for existing users and installs private attribution, checkout binding and redemption tables. The `users.referral_signup_code` input is consumed by a trigger and stored as NULL, so public user rows do not expose a referral graph. Service-only RPCs issue and spend credits. A unique referred-member row and payment reference, conditional award update, row locks and deterministic redemption IDs protect repeated or concurrent requests. Cancellation restores credits within the same database transaction as cancelling the reservation.

The payment helper re-fetches the canonical GoCardless billing request and, for renewals, the actual subscription. It verifies the membership plan, fulfilled request, original payment or matching monthly subscription/mandate, amount/currency and provider creation time after registration. Mutating public booking ownership after checkout cannot redirect the bound referral. Confirmed-payment webhooks and existing server reconciliation use the same helper.

The app's existing custom browser login and public user/booking storage are retained. The new referral API separately requires a server-generated, emailed six-digit code before returning an opaque, member-bound access token. Requesting codes is limited to once per minute and ten per UTC day, with five verification attempts and a 15-minute expiry. Tokens are hashed server-side, expire after 30 days, live in browser sessionStorage, and are cleared/revoked on sign-out. An ID or forged browser session alone cannot read or redeem referrals. The access email is snapshotted privately at signup (or rollout for existing members), so editing a public user row cannot redirect the code. Email address changes for this feature require an authorised service-side update; the current Account page only changes name/phone.

This does not migrate the rest of the app to server-verified authentication/RLS. Existing booking cancellation still uses the shared public booking workflow. Self-referral checks cover the same account/email; this feature cannot prove two different email addresses belong to different real people.

## Deployment

The existing Edge Functions workflow applies the original referral migration followed by `20261018000000_referral_membership_credits.sql`, applies those two files in one transaction so reservation protection is never temporarily removed on redeployment, checks the original nine and four new service RPCs, deploys `referral-scheme` and then the updated mailer/payment handlers. Deploy this backend successfully **before the frontend**, since referred signup and membership checkout now depend on the migration. Re-running the migration preserves codes, existing attribution and rewards. No new secrets or GoCardless templates are needed. No live changes or messages are made by the fixture tests.

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

With the fixture Vite server on port 5174, run `PYTHONDONTWRITEBYTECODE=1 python scripts/test-referral-ui.py`. This covers invitation registration, sharing, credit visibility in My bookings, reward selection, class-policy ordering, full-class retries and all three membership options at desktop/mobile sizes. The SQL/handler tests exercise actual signed webhooks, both membership types, repeat events, initial-payment/renewal checks, private privileges, ownership, capacity, mail outages, timely/late credit restoration, actual £26.25 replacements, submitted-payment cutoffs, lost-response/provider-outage recovery and unchanged following-month £35 renewals.
