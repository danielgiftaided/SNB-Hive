# Manual class bookings

In **Admin → Classes**, select an upcoming lesson and press **Add member**.
Search for an existing registered member, choose the date and record the place
as complimentary or already paid separately. For a separate payment, enter the
amount actually received. Adding a member does not collect money through
GoCardless and does not create a membership subscription.

Zumba and BoxFit use the same four available dates as customer checkout.
The Tasters card adds the selected activity's taster, subject to the existing
new-member and lifetime taster rules. Self Defence adds one place for all three
course sessions. Classes without confirmed dates and historical registers do
not offer this action.

Each saved booking reserves capacity, appears in the member's My bookings,
and sends a confirmation to the member and Shams. Full classes and duplicate
active places are rejected on the server. Existing admin/customer cancellation
controls continue to send cancellation notifications. A failed confirmation
email leaves the place saved; **Retry confirmation** uses the same booking and
provider idempotency keys. Use **Done** to leave that saved reservation.

The bookings attention banner has been removed. Payment restore/check actions,
row statuses and the outcome of a requested restore remain available.

## Deployment

The existing Deploy Edge Functions workflow, on merge to main, applies
`20261024000000_admin_class_bookings.sql`, checks its readiness, and deploys
`admin-auth`, `admin-class-booking` and `send-email`. The usual frontend release
must also include this change. The existing taster and course migrations are
prerequisites; the workflow retains its existing prerequisite steps.

No new secrets are required. Successful admin password + email-code verification
now issues a signed eight-hour token using `ADMIN_MFA_SECRET`; the server checks
its signature, expiry, purpose and configured `ADMIN_EMAIL` before invoking the
service-only booking RPC. The browser never receives the service key. The new
private audit table records the acting admin, member, date, payment record and
request ID. Existing browser-only admin sessions must sign in again when they
first use Add member. The existing 30-minute idle sign-out still applies.

This adds authorization to the new enrollment action; it does not migrate the
app's other existing admin controls to a different authentication system.

## Isolated verification

```bash
npm run build
npm run check:edge-functions
# Supply an installed @electric-sql/pglite dist/index.js, as with other SQL tests.
npm run test:admin-class-bookings -- /path/to/@electric-sql/pglite/dist/index.js

# Separate terminal, using fixtures only:
VITE_SUPABASE_URL=https://fixture.supabase.test VITE_SUPABASE_ANON_KEY=test-public-key npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
PYTHONDONTWRITEBYTECODE=1 python scripts/test-admin-class-bookings-ui.py
```

The SQL/handler tests use embedded PostgreSQL and intercepted mail requests;
they never write to Supabase or send real notifications/payments. The browser
tests cover desktop/mobile enrollment, retry, member visibility and legacy
admin reauthentication. Existing booking, email, allocation and schedule tests
should also pass.
