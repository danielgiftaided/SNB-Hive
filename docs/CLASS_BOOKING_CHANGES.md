# Class booking changes

- Boxing is removed from the available class catalogue. Historical bookings remain intact.
- BoxFit uses the same £10 PAYG / £35 monthly GoCardless plans and proration as Zumba. Its Book button is greyed out, and server checkout rejects it while dates are empty. To open it, confirm dates, time and weekday, update `CLASS_PAYMENTS.boxfit` in `supabase/functions/_shared/class-config.ts`, update the display schedule in `src/App.jsx`, and set `bookingPaused` to false.
- Self Defence costs £90 for the full course on Wednesday 18 November, Wednesday 25 November and Wednesday 2 December 2026, 12:00–14:00. Existing waitlist entries do not block a course booking or count as reserved places.
- The separate Zumba taster card uses Zumba's venue, time and current dates from the shared configuration. It costs £5 (half the PAYG price), supports exactly one date, and **uses bank transfer with no GoCardless call or setup**. Tasters count with Zumba in the admin date view and do not prevent subsequent full-price bookings.
- Both Self Defence and Zumba tasters show these bank details: SNB Hive LTD, account 33053251, sort code 040605, reference the member's name. Reserving saves an awaiting-payment booking visible in My bookings. Administrators mark it Paid after receiving the transfer.
- Every member can book one lifetime taster per class. The database retains a claim by class, normalized email and member ID, including historical free tasters. The first saved bank-transfer taster uses eligibility immediately; cancellation and deletion do not restore it. A failed database write does not consume eligibility. The migration preserves historical duplicates and prevents new ones.
- Reservation confirmations, payment receipts and cancellation emails go to the member and `shams@snbhive.com`, even if the admin login email differs. Member and administrator cancellations both notify these recipients. Marking either bank transfer Paid sends a receipt to both. Email delivery failures are reported in the UI.
- Ordinary Zumba and future BoxFit payments retain GoCardless. Failed payment receipts remain retryable through its signed webhook; Resend idempotency keys prevent repeats during a retry.

## Supabase SQL file to copy

Open [`supabase/SQL_EDITOR_CLASS_BOOKINGS.sql`](../supabase/SQL_EDITOR_CLASS_BOOKINGS.sql), copy **the entire file**, and paste it into **Supabase Dashboard → SQL Editor → New query → Run**, in the existing SNB Hive project.

The file adds any missing booking-date/payment columns, receipt tracking, and the private lifetime-claims table/trigger. It preserves bookings and backfills taster history. It runs in a transaction and is safe to run again. The existing `public.bookings` table must already exist; this file does not create a new project or replace existing tables.

If using the Supabase CLI instead, apply the committed migrations to the correctly linked project with `supabase db push`. The SQL Editor file and CLI migration can both be applied safely; the trigger is replaced idempotently.

## Missing bookings and SQL Editor results

An empty `pg_notify` result from the original SQL is expected: it asks PostgREST to reload its schema after adding columns. It does not delete or alter booking records. The copyable file now uses `NOTIFY` directly to avoid that confusing result column. There is no need to re-run the setup SQL just to fix the display.

The admin Bookings tab and CSV now include the complete history, with filters for paid, booked, awaiting payment, unfinished checkout, waitlisted and cancelled rows. The Classes view and capacity counters still include only active reservations. Unconfirmed Direct Debit attempts remain excluded from members' confirmed bookings until the payment webhook confirms collection. Member booking lists now refresh on realtime events, returning to the browser and every 15 seconds while visible.

Members' My bookings also shows `pending_payment` Direct Debit rows in a separate **Payments awaiting confirmation** section, without counting them as paid or reserving places. Rows with payment references show **Awaiting payment**; rows without a payment reference include **Payment setup needs checking** and a contact link. No additional payment or checkout request is made by showing these records. Once a verified payment webhook marks a row paid, it moves to the normal booking list. Bank-transfer bookings retain their normal reservation/payment flow. Admin rows flag missing payment references and show the recorded lesson date; CSV exports include that date too.

For the reported 9 October 2026 Zumba rows, the member-side hiding was caused by `pending_payment`, not the SQL. Two rows have payment references and one is NULL. Check the two referenced payments in GoCardless. If collection is still pending, leave their status awaiting payment. If GoCardless confirms collection but Supabase is still pending, check delivery of the signed `payments/confirmed` webhook and retry that event. For the NULL reference, check the checkout/billing-request metadata against the existing booking ID before advising another payment. A delayed or failed `billing_requests/fulfilled` webhook can leave a reference missing; NULL alone does not prove the member abandoned payment. Where both events were missed, retry fulfillment before confirmation. These checks require production GoCardless/Supabase access; this PR does not change production payment statuses.

Booking reads fetch all pages, including records older than Supabase's default 1,000-row response limit. Failed schema/network reads display an error and Retry button, retain the last successfully loaded list, and do not masquerade as an empty table or use a partial list.

Member ownership checks match either the saved member ID or the normalized email, so historical bookings with differently capitalized/spaced email addresses still appear.

To investigate specific missing records, copy **the entire** [`supabase/SQL_EDITOR_BOOKING_DIAGNOSTICS.sql`](../supabase/SQL_EDITOR_BOOKING_DIAGNOSTICS.sql) into a new query in the existing project's SQL Editor. This runs in a read-only transaction, returns total/status counts, complete history, policies and triggers, and changes nothing. Each SELECT has a separate results tab. Do not post member details publicly.

If the missing records exist in SQL but do not appear after deploying this frontend fix, compare their actual status, class and recorded lesson date with the screen's filters. If the rows are absent from `public.bookings`, this frontend fix cannot reconstruct them; investigate database/API logs and backups before restoring the specific records. Do not mark payments paid or disable policies simply to make rows appear. Production rows and delivery cannot be verified by the isolated tests.

## Deploy after applying SQL

1. Deploy the updated email function:

   ```sh
   supabase functions deploy send-email --no-verify-jwt
   ```

2. For the regular Zumba and future BoxFit payment changes in this PR, deploy the updated payment functions:

   ```sh
   supabase functions deploy gocardless-checkout
   supabase functions deploy gocardless-webhook --no-verify-jwt
   ```

   Zumba tasters and Self Defence do not invoke these payment functions and need no GoCardless credentials. Their confirmations use the existing Supabase-side Resend sender/key configuration.

3. Build/deploy the frontend with its normal `VITE_SUPABASE_URL` and browser-safe `VITE_SUPABASE_ANON_KEY`. Never put provider/service-role secrets in `VITE_` variables.
4. Validate with approved test accounts: reserve a £5 Zumba taster, check both emails, mark its bank transfer Paid and check both receipts, cancel it and check both cancellation emails, and verify another taster is refused. Repeat the course reservation/payment/cancellation checks for Self Defence. Test regular Direct Debit changes with GoCardless sandbox credentials only.

Apply SQL before releasing the frontend to enforce taster eligibility. The GitHub workflow redeploys changed email/payment functions and shared modules; it does **not** apply database migrations. Local fixtures do not validate live email delivery.

## Local validation

Node.js 24 or newer runs the existing direct TypeScript imports.

```sh
npm run test:booking-utils
npm run test:booking-reader
npm run test:membership-proration
npm run test:gocardless-checkout
npm run test:gocardless-webhook
npm run test:class-bookings
npm run check:edge-functions
npm run build
```

`test:class-bookings` exercises real email, checkout and signed webhook handlers using HTTP fixtures: bank-transfer taster/course emails and recipients, rejecting GoCardless tasters, ordinary PAYG 409/idempotency recovery, receipt failure/retry, paused BoxFit and weekday-based membership/proration. Expected provider-failure messages are emitted by failure tests.

Test the actual copyable SQL file in isolated embedded PostgreSQL without adding a database dependency to the app:

```sh
npm install --prefix /tmp/snb-database-tests --no-package-lock --no-audit --no-fund @electric-sql/pglite@0.3.14
npm run test:taster-database -- /tmp/snb-database-tests/node_modules/@electric-sql/pglite/dist/index.js supabase/SQL_EDITOR_CLASS_BOOKINGS.sql
```

This runs the SQL twice and checks every original booking field remains unchanged across paid, pending, cancelled, historical taster and removed-class records. It also checks member/email identity, pending bank-transfer claims, cancellation/deletion, separate classes, claim-table permissions and read-only diagnostics. Omit the final SQL-file argument to test the CLI migration instead. `test:booking-reader` checks more than 1,000 records and refuses failed or partially downloaded lists.

The optional browser regression script requires Python Playwright and Chromium at `/usr/bin/chromium`. In one terminal, start Vite using these **fixture** settings; in another, run the script from the repository root:

```sh
VITE_SUPABASE_URL=https://fixture.supabase.test VITE_SUPABASE_ANON_KEY=test-public-key npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
# Second terminal:
python scripts/test-class-booking-ui.py
```

It refuses non-fixture settings and intercepts the fixture API. It covers desktop/mobile cards, bank details, a single-date bank-transfer taster, failed-save retry, lifetime eligibility after cancellation, full-price Zumba availability and admin payment/cancellation email requests. It also verifies paginated admin history, pending/cancelled filters and CSV, failed-refresh preservation, initial error/retry and member payment refreshes. It asserts no GoCardless request occurs for tasters.
