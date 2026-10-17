# Mix & Match — Hive 4 membership

Zumba and BoxFit's Book screens offer a third payment option alongside PAYG and the existing single-class monthly membership. Mix & Match costs £35 and requires exactly two distinct Zumba dates and two distinct BoxFit dates in one selected calendar month. It does not permit 3:1 or 4:0. The picker shows every scheduled, unfinished date in the selected month, including four Zumba and four BoxFit dates in a four-week month and any fifth occurrence in a five-week month. It respects London's class finish times and offers the current and following calendar month when both activities have at least two available dates. The PAYG/taster rolling window does not limit Mix & Match. Changing month clears the choices.

The first payment is the full £35 for the four selected lessons, without the single-class membership's first-month proration. The cancellation-policy popup appears before checkout. One payment group contains four dated class rows; only its anchor carries the £35 amount. Checkout and the server validate the split, month, available dates, price and shared member identity. An unfinished checkout remains hidden from My bookings.

## GoCardless

The supplied billing request template is pinned by ID:

- Name: `Mix & Match - Hive 4 Membership`
- Template: `BRT01M5574NTKNCPZ6E02F03RB290`
- Link: https://pay.gocardless.com/BRT01M5574NTKNCPZ6E02F03RB290
- Optional server override: `GOCARDLESS_MIX_MATCH_TEMPLATE_ID`

The app follows the existing template checkout pattern: it reads the template's payment settings, creates a booking-specific £35 GBP Bacs billing request with allocation metadata, and saves the billing-request ID. The earlier PL identifier is not used as a billing request template ID.

Accepted initial payment setup marks only the chosen four lessons Paid and sends the combined booking/payment confirmation to the member and Shams. The app creates one £35 monthly subscription, named as above, on the 1st starting in the calendar month after the selected lessons. For example, four October lessons start renewal on 1 November; selecting November lessons starts renewal on 1 December. Retries reuse the original subscription key. Future-month recovery never creates a duplicate initial subscription or expands this membership into every weekly class.

## Choosing renewed dates

Each accepted recurring £35 GBP payment creates a private monthly entitlement in `snb_private.mix_match_months` and a Paid membership summary in bookings. This summary records the payment and amount in the admin booking list/export without reserving a place on either class. The member and Shams receive a renewal email explaining that dates still need to be selected.

A Choose dates panel appears on Classes and in My bookings. The renewal month is fixed. The member chooses two Zumba and two BoxFit dates, accepts the booking policy, and saves without making another payment. An atomic service-role RPC replaces the summary with four dated class reservations, maintaining a £35 total. The member and Shams receive one booking confirmation listing each class and date.

The private entitlement and database transaction prevent repeated/concurrent submissions from consuming a payment twice. Allocation checks the class weekday, month, distinct dates, current London finish time and available capacity (Zumba 12, BoxFit 18); invalid or full dates roll back the allocation. The endpoint also checks the full scheduled dates for the chosen month. If there are no longer two upcoming dates for each activity in the paid month, the panel directs the member to Shams for help. It does not assign dates, move credits to another month or change the 2:2 split automatically.

Only the GoCardless service may fund a renewal. Browser roles cannot read or write the private entitlement table or execute its RPCs directly. The dates endpoint uses the app's existing custom member-session identity model, as Account preferences do; this change does not replace that authentication model. Existing class cancellation and notification handling is retained. Members contact Shams to manage recurring membership payments, as explained before purchase.

## Deployment and verification

The existing Edge Functions workflow applies `20261017030000_mix_match_memberships.sql`, verifies all three membership RPCs, deploys `mix-match-membership`, and deploys the mailer/checkout/webhook/sync. Confirm successful backend deployment before deploying the frontend. No new credentials are needed. The existing Resend/GoCardless/Supabase configuration is reused.

Fixture-only checks:

```bash
npm run test:mix-match
npm run test:mix-match-payments -- /workspace/.snb-database-tests/node_modules/@electric-sql/pglite/dist/index.js
npm run test:gocardless-allocation
npm run test:class-taster-checkout
npm run test:self-defence-checkout
npm run test:email-branding
npm run check:edge-functions
npm run build
```

With the documented fixture Vite server on port 5174, run `PYTHONDONTWRITEBYTECODE=1 python scripts/test-mix-match-ui.py`. The tests cover both class entry points and renewal selection at desktop/mobile widths, including retry failures, fixed month, exact split, payment/policy ordering and confirmed class rows. The payment test runs the actual handlers, SQL migration and deployment payload, including monthly subscriptions, signed webhook retries, mail outages, atomic allocation/capacity checks and saved cancellation preservation. It uses simulated GoCardless/Resend requests; no real payments or messages are sent.
