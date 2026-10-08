# Class booking changes

- Boxing is removed from the available class catalogue. Historical bookings remain intact.
- BoxFit is live with an active Book button and the same £10 PAYG / £35 monthly GoCardless plans as Zumba. October dates are **Thursday 15 October, Tuesday 20 October and Tuesday 27 October 2026, 13:00–14:00**. Dates come from the shared payment configuration so the card, picker, checkout and enrolments agree. The opening Thursday is an exception; subsequent membership renewal months use Tuesdays.
- BoxFit's historical tasters no longer appear in the Classes register, counts or date list and do not block a member from booking the new paid classes. Their booking/member records remain available in booking history; no database deletion or SQL migration is needed.
- Self Defence costs £90 for the full course on Wednesday 18 November, Wednesday 25 November and Wednesday 2 December 2026, 12:00–14:00. Existing waitlist entries do not block a course booking or count as reserved places.
- The separate Zumba taster card uses Zumba's venue, time and current dates from the shared configuration. It costs £5 (half the PAYG price), supports exactly one date, and **uses bank transfer with no GoCardless call or setup**. Tasters count with Zumba in the admin date view and do not prevent subsequent full-price bookings.
- Both Self Defence and Zumba tasters show these bank details: SNB Hive LTD, account 33053251, sort code 040605, reference the member's name. Reserving saves an awaiting-payment booking visible in My bookings. Administrators mark it Paid after receiving the transfer.
- Every member can book one lifetime taster per class. The database retains a claim by class, normalized email and member ID, including historical free tasters. The first saved bank-transfer taster uses eligibility immediately; cancellation and deletion do not restore it. A failed database write does not consume eligibility. The migration preserves historical duplicates and prevents new ones.
- Reservation confirmations, payment receipts and cancellation emails go to the member and `shams@snbhive.com`, even if the admin login email differs. Member and administrator cancellations both notify these recipients. Marking either bank transfer Paid sends a receipt to both. Email delivery failures are reported in the UI.
- Ordinary Zumba and live BoxFit payments retain GoCardless. Failed payment receipts remain retryable through its signed webhook; Resend idempotency keys prevent repeats during a retry.

## BoxFit launch rollout

The BoxFit launch builds on merged PR #46 and needs no additional Supabase SQL or credentials. Merge/deploy the launch PR so both the frontend and shared configuration used by checkout/webhook/sync are updated. The existing deployment workflow redeploys payment/email functions when the shared configuration changes.

PAYG selects one or multiple of the three October dates at £10 each. Membership selects a joining date and enrols every remaining confirmed class that month. Zumba's four-lesson valuation applies: 15 October costs £26.25 initially (three lessons), 20 October £17.50 (two), and 27 October £8.75 (one). The recurring subscription is £35 from the first of the next month and allocates Tuesdays in that charge month. Successful verified setup immediately appears as Paid in My bookings and admin. Confirmation and cancellation emails use the same handlers and member/Shams recipients as Zumba.

Confirm after deployment that the BoxFit Classes selector offers 15, 20 and 27 October with no old taster-only or undated entries, then check PAYG and monthly booking/return/cancellation flows. Historical tasters stay in the full Bookings history, and Zumba's live tasters still count toward their selected Zumba lesson.

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

Existing pending rows with actual `PM...` payment references become active class reservations under the new display rule. When an admin opens **Bookings**, automatic recovery checks all eligible Direct Debit groups against GoCardless, including pending checkout, pending payment, confirmed and already-Paid members; **Restore completed bookings** reruns this check. The per-row **Check original payment** action can retry one group. Members also automatically check all their eligible groups when opening My bookings and can use **Check my payment setup** to retry.

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

This runs the allocation SQL and class/taster SQL twice and checks every original booking field remains unchanged across paid, pending, cancelled, historical taster and removed-class records. It also checks member/email identity, pending bank-transfer claims, cancellation/deletion, separate classes, claim-table permissions and read-only diagnostics. Omit the final SQL-file argument to test the CLI migration instead. `test:booking-reader` checks more than 1,000 records and refuses failed or partially downloaded lists.

The optional browser regression script requires Python Playwright and Chromium at `/usr/bin/chromium`. In one terminal, start Vite using these **fixture** settings; in another, run the script from the repository root:

```sh
VITE_SUPABASE_URL=https://fixture.supabase.test VITE_SUPABASE_ANON_KEY=test-public-key npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
# Second terminal:
python scripts/test-class-booking-ui.py
```

It refuses non-fixture settings and intercepts the fixture API. It covers desktop/mobile cards, bank details, a single-date bank-transfer taster, failed-save retry, lifetime eligibility after cancellation, full-price Zumba availability and admin payment/cancellation email requests. It also verifies paginated admin history, pending/cancelled filters and CSV, failed-refresh preservation, initial error/retry, immediate allocation on return, PAYG date selection, monthly proration/dates, automatic member/admin recovery of the reported three bookings and immediate Paid status. It asserts no GoCardless request occurs for tasters.
