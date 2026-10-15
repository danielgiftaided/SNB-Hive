# Class booking changes

- Boxing is removed from the available class catalogue. Historical bookings remain intact.
- BoxFit is live with an active Book button and the same £10 PAYG / £35 monthly GoCardless plans as Zumba. October dates are **Thursday 15 October, Thursday 22 October and Thursday 29 October 2026, 13:00–14:00**. The card shows Thursdays and the class time; the exact dates appear after pressing Book. Dates come from the shared payment configuration so the picker, checkout and enrolments agree. All lessons and membership renewals use Thursdays from 15 October onward.
- BoxFit's historical tasters no longer appear in the Classes register, counts or date list and do not block a member from booking the new paid classes. Their booking/member records remain available in booking history. The new GoCardless tasters do count in the live class register/capacity.
- Self Defence costs £90 for the full course on Wednesday 18 November, Wednesday 25 November and Wednesday 2 December 2026, 12:00–14:00. Existing waitlist entries do not block a course booking or count as reserved places.
- Customer and admin cards share the order Zumba, BoxFit, Reformer Pilates, Self Defence, Somatic, Strength & Conditioning, Tasters, with two columns on larger screens and one on mobile. Both use the same timetable, course details and upcoming date source. Unconfirmed classes have no invented lesson dates. The customer Tasters card is absent when neither class remains eligible.
- BoxFit and Zumba tasters are available together through the Tasters card for £5 each by GoCardless. The old separate bank-transfer Zumba taster offer remains retired; its historical bookings remain available for payment/cancellation and admin history.
- Self Defence and historical Zumba taster confirmations use these bank details: SNB Hive LTD, account 33053251, sort code 040605, reference the member's name. Reserving saves an awaiting-payment booking visible in My bookings. Administrators mark it Paid after receiving the transfer.
- Every member can book one lifetime taster per class. The database retains a claim by class, normalized email and member ID, including historical free tasters. The first saved bank-transfer taster uses eligibility immediately; cancellation and deletion do not restore it. A failed database write does not consume eligibility. The migration preserves historical duplicates and prevents new ones.
- Reservation confirmations, payment receipts and cancellation emails go to the member and `shams@snbhive.com`, even if the admin login email differs. Member and administrator cancellations both notify these recipients. Marking either bank transfer Paid sends a receipt to both. Email delivery failures are reported in the UI.
- Ordinary Zumba and live BoxFit payments retain GoCardless. Failed payment receipts remain retryable through its signed webhook; Resend idempotency keys prevent repeats during a retry.

## Shared £5 taster card (15 October 2026)

The customer card offers a class dropdown followed by one lesson date. Choices come from exactly the same `classBookingSchedule` as the live weekly class; expired dates roll over in London time. There is no monthly taster plan and checkout permits exactly one date/class at £5. An unfinished GoCardless attempt remains available: pressing Back without entering details does not remove that taster. The class disappears only when its booking is confirmed/paid or has a verified payment reference. The other class remains available; after completing both tasters the whole card is absent. Ordinary £10 PAYG and £35 memberships remain available independently.

Past free/paid/bank-transfer tasters and cancelled/deleted bookings retain their lifetime claim. A pending GoCardless reservation also keeps its claim to prevent duplicate rows, but remains available to resume through its original booking ID until completed. Eligibility matches member ID or normalized email. The existing first-class Zumba restriction is preserved: a previously completed regular Zumba booking also removes Zumba taster eligibility. A failed booking insert does not use eligibility. If availability/history cannot be read, the app hides the offer until a successful refresh.

The admin Classes tab always contains the Tasters card, with the two-class dropdown, the live class dates and taster registrations/statuses for the selected date. New GoCardless tasters also appear in their regular class register and share its capacity. Historical BoxFit tasters retain their existing history-only treatment.

GoCardless checkout reads the exact named billing-request template (`Boxfit Taster` or `Zumba Taster`) using the existing server token. Both pure Direct Debit and dashboard **Pay by Bank + DD Set up** templates are accepted. For a hybrid template the app uses its Bacs mandate setup and creates a **£5 GBP Bacs Direct Debit payment**, rather than using the template's Faster Payments leg. The app's server configuration owns the taster price: template amount formatting/settings never change or block it. In particular, a template value `5` or `5.00` must not be interpreted as 5p; the actual billing request always sends integer `500` (pence), after validating the saved booking is £5. Explicitly different currencies or non-UK mandate settings are rejected with the exact field identified. Pay-by-Bank-only templates without a Bacs mandate remain incompatible with this Direct Debit flow.

It creates a dedicated billing request with booking/group/plan metadata needed by the signed webhook and recovery flow. It does not redirect to a reusable template link, which cannot carry the booking's unique allocation metadata. The template ID is included in payment-request metadata; billing-request metadata retains the provider's three-field limit. A missing/ambiguous/incompatible template stops checkout before creating a payment. Retrying an existing saved taster retains its booking ID and provider idempotency keys. Taster confirmation emails describe accepted Direct Debit setup rather than claiming that the money has settled.

Taster payment requests use the same shape as the ordinary PAYG checkout: `mandate_request.scheme` selects Bacs, while the payment request supplies amount/currency/description/metadata without an extra `scheme` property. Provider failures return `GOCARDLESS_API_ERROR` with the HTTP status, rejected field/reason and stage (`billing_request`, `authorisation_flow` or `resume_…`) instead of the generic checkout error. The same diagnostic fields are logged under `[gocardless-checkout]`, together with the checkout version and provider request ID when supplied. Non-JSON failures are reported with their stage/status; raw response bodies, headers, credentials and arbitrary provider metadata are omitted. The exact cause of any live rejection must be read from those provider diagnostics rather than inferred from the generic error or runtime shutdown entries.

Template IDs are optional server secrets: `GOCARDLESS_BOXFIT_TASTER_TEMPLATE_ID` and `GOCARDLESS_ZUMBA_TASTER_TEMPLATE_ID`. Set them if an account has duplicate template names or cannot list templates; the selected template's name, currency and UK mandate settings are still checked. New required secrets are not introduced. The private GoCardless account/templates cannot be verified from the development environment; confirm both named templates in the target account and perform a sandbox checkout after deployment.

Checkout errors and browser Back keep the original pending booking. Resume from the home Tasters card, retry in the dialog or use **Continue taster payment** in My bookings. All reuse its ID and provider idempotency keys; none creates another booking/payment. The home card initially selects the saved date if it remains available. A different available date updates that same unfinished booking; the server checks any saved GoCardless request is still pending and without a payment reference, then conditionally updates only a reservation that has not been completed by a concurrent webhook. Verified setup stores the canonical payment ID, marks the single lesson Paid and sends the existing member/admin receipt. No subscription or extra monthly dates are created.

The existing deployment workflow transactionally reapplies the idempotent lifetime/regular-Zumba guards, installs `20261015000000_taster_card_eligibility.sql`, then applies `20261015010000_resume_unfinished_tasters.sql` before deploying Edge Functions. These expose only per-class boolean flags through `class_taster_eligibility`; the claims table remains private. The new migration changes only eligibility logic and restores existing unfinished attempts without editing booking/claim records. Completed/cancelled/deleted tasters remain protected. Manual deployments must apply those four migrations in that order, then deploy checkout, sync and webhook as well as the frontend.

Validation commands: `npm run test:class-taster-checkout`, `npm run test:gocardless-allocation`, `npm run test:booking-utils`, `npm run test:taster-database -- <PGlite module path>`, and `python scripts/test-taster-card-ui.py` against the fixture Vite server documented below. These cover named templates, £5 validation, duplicate/plan bypasses, lifetime claims, visibility, admin/live registers, retries, canonical payment IDs, receipts and London midnight expiry.

## Historical first-time Zumba taster rollout (offer now retired)

Before merging/deploying this change, copy the entire [`supabase/SQL_EDITOR_ZUMBA_TASTER_ELIGIBILITY.sql`](../supabase/SQL_EDITOR_ZUMBA_TASTER_ELIGIBILITY.sql) into the existing Supabase SQL Editor and Run. The original lifetime-taster schema must already be present. This script adds eligibility claims and replaces trigger functions; it does not delete or update any booking. It is safe to rerun. The equivalent CLI migration is `20261008010000_regular_zumba_taster_eligibility.sql`, and the full class/taster SQL includes the rule for fresh installations. The deployment workflow does not apply these schema/eligibility scripts.

If the SQL Editor warns about a table called `existing`, cancel and replace the query with the current file. The previous function used a local variable named `existing` with `SELECT INTO`, which appears to be misidentified as table creation by the editor. The current file uses `IF EXISTS` and replaces triggers without `DROP TRIGGER`. It explicitly enables RLS on the private eligibility claims and preserves the bookings table's existing RLS and access grants; automatic "Run and enable RLS" rewriting is not needed for this script.

Then merge/deploy the frontend. Zumba and BoxFit are first; Somatic and Strength & Conditioning are the final two cards. Book taster stays grey for a member with a completed regular Zumba booking, matched by member ID or normalized email. Completion means Paid/confirmed, or a pending/cancelled booking carrying its actual `PM...` payment reference. Unfinished checkout attempts do not make a new member ineligible. Other classes do not affect Zumba eligibility.

The database retains the completed regular booking's eligibility claim even after cancellation/deletion and rejects a new Zumba taster written directly through the API. Existing taster rows can still receive payments, be cancelled or resume their original reservation; the script does not retroactively cancel them. A taster customer can still move on to full-price PAYG/monthly Zumba. The £5 bank-transfer method, one-lifetime-taster limit and member/Shams confirmation/cancellation emails continue to apply.

## BoxFit launch rollout

The BoxFit launch builds on merged PR #46 and needs no additional Supabase SQL or credentials. Merge/deploy the launch PR so both the frontend and shared configuration used by checkout/webhook/sync are updated. The existing deployment workflow redeploys payment/email functions when the shared configuration changes.

PAYG selects one or multiple of the three October dates at £10 each. Membership selects a joining date and enrols every remaining confirmed class that month. Zumba's four-lesson valuation applies: 15 October costs £26.25 initially (three lessons), 22 October £17.50 (two), and 29 October £8.75 (one). The recurring subscription is £35 from the first of the next month and allocates Thursdays in that charge month. Successful verified setup immediately appears as Paid in My bookings and admin. Confirmation and cancellation emails use the same handlers and member/Shams recipients as Zumba.

Confirm after deployment that the BoxFit Classes selector offers 15, 22 and 29 October with no old taster-only or undated entries, then check PAYG and monthly booking/return/cancellation flows. Historical tasters stay in the full Bookings history, and Zumba's live tasters still count toward their selected Zumba lesson.

## Automatic date rollover

The browser and checkout function share weekly schedule generation. Booking choices contain the remaining lessons in the current month; after its last lesson, the next month opens automatically. Today is still available; earlier dates disappear at the end of their London calendar day. Open screens refresh at least once per minute and on focus/visibility changes.

My bookings shows upcoming dates only. A course shows its remaining dates and closes when all dates have passed. Stored bookings, amounts, statuses, membership/payment references, undated records and admin history are retained. Initial membership recovery uses the original booking month even when its dates are now historical.

Admin **Lesson date** selectors contain exactly the current customer schedule and refresh when the London day changes. **Previous / other dates** opens saved dates outside that schedule, including undated records. Whole-course Self Defence enrolments appear on each remaining course lesson, rather than being restricted to their initial booking date.

The approved correction in [`20261012000000_move_boxfit_booking_dates.sql`](../supabase/migrations/20261012000000_move_boxfit_booking_dates.sql) moves BoxFit PAYG/membership dates from 20→22 and 27→29 October 2026. Only dates change: booking/group/payment IDs, amounts and statuses are retained. Cancellation markers follow the Thursday dates so recovery does not reopen their places. Historical tasters, other classes and other dates are untouched. Membership recovery uses the Thursday schedule after the correction.

The existing Edge Function workflow applies this idempotent SQL through the Supabase Management API, using the already-configured project reference/access token, before deploying checkout/webhook/sync. A failed SQL request stops those deployments. This specific data correction runs on each workflow invocation; it is not a general schema migration runner. If manual deployment is needed, run the same SQL in the existing project's SQL Editor **before** deploying the updated shared payment functions. Review the workflow's moved-booking count after merge.

Run `python scripts/test-admin-class-schedule-ui.py` against the fixture-only server to compare both screens, date rollover and course registers. Run `npm run test:boxfit-date-migration -- /path/to/@electric-sql/pglite/dist/index.js` for the isolated PostgreSQL migration regression.

## Supabase SQL file to copy

Open [`supabase/SQL_EDITOR_CLASS_BOOKINGS.sql`](../supabase/SQL_EDITOR_CLASS_BOOKINGS.sql), copy **the entire file**, and paste it into **Supabase Dashboard → SQL Editor → New query → Run**, in the existing SNB Hive project.

The file adds any missing booking-date/payment columns, receipt tracking, and the private lifetime-claims table/trigger. It preserves bookings and backfills taster history. It runs in a transaction and is safe to run again. The existing `public.bookings` table must already exist; this file does not create a new project or replace existing tables.

If using the Supabase CLI instead, apply the committed migrations to the correctly linked project with `supabase db push`. The SQL Editor file and CLI migration can both be applied safely; the trigger is replaced idempotently.

## Immediate Paid bookings and existing member recovery (PR #46)

Apply [`supabase/SQL_EDITOR_BOOKING_ALLOCATION.sql`](../supabase/SQL_EDITOR_BOOKING_ALLOCATION.sql) **before merging/deploying PR #46**. Copy the entire file into a new query in the existing Supabase project's SQL Editor and Run. It adds checkout-reference and email-tracking columns, preserves every existing booking/status, and is safe to run again. The equivalent CLI migration is `20261008000000_checkout_allocation_tracking.sql`. The initial class/taster SQL already applied does not need to be repeated.

After the member completes GoCardless setup, the signed fulfillment webhook or the return page's server-side check allocates the class dates immediately. The return page verifies the original GoCardless checkout and redirects directly to My bookings. Both member and admin lists and the class register immediately show the booking as **Paid**. This is the portal convention for successfully authorised payment setup: a fulfilled checkout with a provider payment in **pending_submission**, **submitted**, **confirmed** or **paid_out**. It does not mean GoCardless has already settled the funds to the business bank account; Direct Debit collection and payout follow its timetable. An unfinished checkout or declined/failed/cancelled payment does not become Paid or reserve a new place.

PAYG reserves only the selected date(s). A monthly membership reserves its selected start date and every subsequent scheduled class in that month, preserving the existing proration. The server also fills missing dates in legacy membership groups. Scheduled subscription payments allocate every class in their charge month when GoCardless creates/submits the payment, rather than waiting for collection or payout. The next subscription charge starts on the first of the following month, so the initial prorated payment is not charged again for the same month.

One combined payment-setup and booking confirmation is sent to the member and Shams as soon as places are allocated and marked Paid. It lists all allocated dates. Payout does not trigger a second confirmation. Saved tracking and Resend idempotency keys permit email retries without new charges. An email outage does not prevent the return page from showing a successfully allocated booking; the webhook can retry notification delivery.

The integration uses GoCardless's actual `payment_request_payment` and `mandate_request_mandate` links. The old `payment_request` link is a request ID and cannot match a `payments/paid_out` event. Checkout now saves its billing-request ID for reliable verification and repair.

### Restore the bookings already affected

Existing pending rows with actual `PM...` payment references become active class reservations under the new display rule. When an admin opens **Bookings**, automatic recovery checks all eligible Direct Debit groups against GoCardless, including pending checkout, pending payment, confirmed and already-Paid members; **Restore completed bookings** reruns this check. The per-row **Check original payment** action can retry one group. Members also automatically check all their eligible groups when opening My bookings. Unresolved bookings show Contact Shams; the manual payment-check button is no longer shown to members. Admin retry tools remain available.

Recovery finds the original fulfilled billing request using its saved ID or server-side booking metadata. It repairs NULL/incorrect payment references and fills missing monthly dates, retaining the original member, amount and history. It never requests a new one-off payment and cannot overwrite an existing cancellation. It creates the already-authorized monthly subscription only if the original subscription setup was missing; provider idempotency prevents duplicates.

For the reported 9 October 2026 Zumba records, this covers both referenced rows and the NULL-reference row **if its original checkout was completed**. A NULL value alone does not prove that checkout was abandoned. If a group is still reported as needing checking, inspect its original GoCardless billing request before advising another payment. Automatic legacy lookup examines up to 2,000 fulfilled requests per check; if the original request lies outside that history, locate its ID in GoCardless and retry the signed fulfillment webhook. The original booking rows remain visible in the complete admin history throughout.

Recovery marks verified successful existing bookings Paid immediately, without waiting for payout, and fills missing dates even for membership groups already marked Paid. Existing canonical payment references can also be verified directly if the old fulfilled request cannot be found. Intentional cancellations remain cancelled, and incomplete or failed/declined payments are not marked Paid. No SQL statement blindly changes payment status.

### SQL Editor results and diagnostics

The old empty `pg_notify` result asks PostgREST to refresh its schema; it does not delete booking rows. The copyable SQL now uses `NOTIFY` directly. For read-only investigation, run [`supabase/SQL_EDITOR_BOOKING_DIAGNOSTICS.sql`](../supabase/SQL_EDITOR_BOOKING_DIAGNOSTICS.sql). Each SELECT has a results tab with counts, complete history, lesson dates, group/payment/checkout references, policies and triggers. It changes nothing. Do not share member details publicly.

Admin history/CSV include paid, booked, pending, unfinished, waitlisted and cancelled records. Booking reads fetch all pages, including records beyond Supabase's normal 1,000-row response limit. Failed reads retain the last successful list and show Retry; member/admin views refresh on realtime events, browser focus and a visible-page timer. Historical email capitalization/whitespace does not hide a member's booking.

## Rollout order

1. Run the allocation SQL above in the existing project **before merging**; the GitHub deployment workflow does not apply database migrations.
2. Merge PR #46. The workflow deploys the changed functions/shared code. If deploying manually, deploy all four:

   ```sh
   supabase functions deploy send-email --no-verify-jwt
   supabase functions deploy gocardless-checkout
   supabase functions deploy gocardless-webhook --no-verify-jwt
   supabase functions deploy gocardless-sync --no-verify-jwt
   ```

3. Deploy the frontend with its normal `VITE_SUPABASE_URL` and browser-safe `VITE_SUPABASE_ANON_KEY`. The new sync function uses the existing server-side GoCardless/Supabase configuration. Tasters and Self Defence still use bank transfer.
4. Ensure the existing signed GoCardless webhook receives billing-request fulfillment and payment created/submitted/confirmed/paid_out events. The existing webhook URL and signing secret remain in use.
5. Open **/admin → Bookings** to run automatic recovery. Read its restored/needs-checking counts, then verify the affected 9 October members in **Classes → Zumba → 9 October**. Monthly members should also be present on every subsequent date in their joining month. Use the restore button to retry any interrupted recovery; do not request another payment.
6. Validate new PAYG single/multiple-date and mid-month membership journeys in GoCardless sandbox: bookings appear as Paid on return and remain Paid through confirmed collection and payout. Verify the combined confirmation reaches the member and Shams once; later payout must not duplicate it. Bank-transfer/taster cancellation and lifetime eligibility checks continue to apply.

Production provider/database access is not available in the development fixtures; actual recovery runs in the deployed app using its server-side credentials. The isolated tests prove the repair path without editing live members or charging them.

## Local validation

Node.js 24 or newer runs the existing direct TypeScript imports.

```sh
npm run test:booking-utils
npm run test:booking-dates
npm run test:booking-reader
npm run test:membership-proration
npm run test:gocardless-checkout
npm run test:gocardless-webhook
npm run test:gocardless-allocation
npm run test:class-bookings
npm run check:edge-functions
npm run build
```

`test:class-bookings` exercises the actual mail and checkout handlers. `test:gocardless-allocation` exercises signed webhooks and the return/recovery handler: allocation before payout, chosen PAYG dates, monthly initial/renewal dates, canonical payment/mandate links, NULL-reference recovery, concurrency, cancellations, email retries, out-of-order events, invalid returns and immediate Paid after verified setup. Expected provider-failure messages are emitted by failure tests.

Test the actual copyable SQL file in isolated embedded PostgreSQL without adding a database dependency to the app:

```sh
npm install --prefix /tmp/snb-database-tests --no-package-lock --no-audit --no-fund @electric-sql/pglite@0.3.14
npm run test:taster-database -- /tmp/snb-database-tests/node_modules/@electric-sql/pglite/dist/index.js supabase/SQL_EDITOR_CLASS_BOOKINGS.sql
```

This runs the allocation SQL and class/taster SQL twice and checks every original booking field remains unchanged across paid, pending, cancelled, historical taster and removed-class records. It also runs the new eligibility SQL twice and checks completed PAYG/membership history, member/email identity, direct browser bypass, pending bank-transfer claims, cancellation/deletion, continued updates to existing tasters, separate classes, claim-table permissions and read-only diagnostics. Omit the final SQL-file argument to test the CLI migration instead. `test:booking-reader` checks more than 1,000 records and refuses failed or partially downloaded lists.

The optional browser regression script requires Python Playwright and Chromium at `/usr/bin/chromium`. In one terminal, start Vite using these **fixture** settings; in another, run the script from the repository root:

```sh
VITE_SUPABASE_URL=https://fixture.supabase.test VITE_SUPABASE_ANON_KEY=test-public-key npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
# Second terminal:
python scripts/test-class-booking-ui.py
python scripts/test-booking-date-ui.py
```

Both browser scripts refuse non-fixture settings and intercept the fixture API. The class regression covers the removed Zumba taster offer, Thursday BoxFit, desktop/mobile layouts, bank-transfer save retries, legacy payment/cancellation emails, paginated admin history and CSV, failed-refresh preservation, verified checkout returns, PAYG selection and monthly proration/allocation. The date regression simulates London midnight from a different browser timezone, checks stale selections and expired bookings disappear without database writes, opens November automatically, preserves membership signup protection and closes completed courses.
