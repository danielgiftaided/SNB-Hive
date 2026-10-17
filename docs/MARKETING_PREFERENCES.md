# Email and WhatsApp preferences

Registration offers two independent, optional, unticked choices, separate from the required terms checkbox:

- Email class news, events and offers.
- An invitation to the SNB Hive WhatsApp group for class news, events and offers.

Neither choice is needed to register or book. Existing members remain opted out until they choose otherwise. New email opt-ins become eligible for marketing after the normal account email-verification step. A temporary preference-save failure does not prevent verified account access; the member can confirm their existing choice using Save preferences in Account or on their next verified sign-in.

The supplied WhatsApp invitation is the default in `src/marketing.js`. A build-time `VITE_WHATSAPP_GROUP_URL` can override it when the group link changes. Only HTTPS `chat.whatsapp.com` invitations are accepted. After verification, a member who selected WhatsApp sees **Join WhatsApp group** below the welcome area on Classes. The same invitation remains under **Account → Communication preferences**. Nobody is automatically added or sent a WhatsApp message. The notice explains that standard-group members see each other's phone numbers, and that the choice does not cover SMS, marketing calls or separate promotional WhatsApp messages. The member must leave an existing WhatsApp group in WhatsApp; changing the app preference cannot remove them from it.

## Recording and changing choices

`public.users` stores each current channel choice, the consent version, latest change time/source and email-verification marker. A database trigger records each explicit signup choice or changed channel, including the exact wording, source and a server timestamp, in `snb_private.marketing_consent_events`. Ordinary browser roles cannot read, insert or change that audit table or the private unsubscribe tokens. Existing users and cached older registration forms without the consent version are not treated as consenting.

Account changes use `save_marketing_preferences` and write only channels the member actually changed. The existing app's member session is retained; this change does not replace the app's account-authentication system. Profile/password upserts cannot overwrite marketing preferences, both in the adapter and in the database trigger. This prevents stale tabs or cached older app versions from undoing an unsubscribe. An email-only opt-out does not change WhatsApp, and a WhatsApp-only edit does not restore email consent.

## Marketing and booking email

The admin Members tab displays and exports both choices in separate columns. The existing send-to-all tool now targets verified email opt-ins only. The mail handler rechecks current consent on the server for every `blast` message; a stale admin selection cannot include someone who has since withdrawn. Missing consent, missing unsubscribe setup or a failed consent lookup prevents marketing delivery. Member bookings, verification, payment, cancellation and admin service notifications retain their existing delivery paths.

Every marketing email includes an unsubscribe link and `List-Unsubscribe` / `List-Unsubscribe-Post` headers. The public `marketing-unsubscribe` function uses an unguessable per-member token held in a private table and requires no login. A GET displays a confirmation button without changing preferences, so link scanners do not opt people out. A confirmation POST or mail-client one-click POST disables email marketing and records withdrawal; repeated requests are safe. The private recipient and unsubscribe RPCs are callable only by the service role. Invalid links or database failures show a clear failure instead of claiming success.

When sending promotions outside the app, honour the recorded current email choices and include a working opt-out mechanism in that system as well. The app does not synchronize external mailing lists or WhatsApp membership.

## Deployment

Merge deploys `20261017000000_marketing_consent.sql` through the existing Edge Functions workflow, checks that all three RPCs exist, deploys public `marketing-unsubscribe`, then deploys the mailer. Deploy the frontend after the migration is confirmed. No new provider credentials are required. The private consent tables deliberately have no browser read/write grants; the mailer uses the existing Supabase service key. The normal app account/session model is unchanged.

## Verification

Use Node 24 and the existing repository checkout. Run:

```bash
npm run test:marketing-database -- /workspace/.snb-database-tests/node_modules/@electric-sql/pglite/dist/index.js
npm run test:marketing-email
npm run test:email-branding
npm run build
```

For fixture-only browser checks, start Vite in a persistent terminal:

```bash
VITE_SUPABASE_URL=https://fixture.supabase.test VITE_SUPABASE_ANON_KEY=test-public-key VITE_WHATSAPP_GROUP_URL=https://chat.whatsapp.com/FixtureInvite123 npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Then run `PYTHONDONTWRITEBYTECODE=1 python scripts/test-marketing-ui.py` and `PYTHONDONTWRITEBYTECODE=1 python scripts/test-admin-exports-ui.py`. The tests intercept API/email requests; no real messages are sent and no WhatsApp group is joined.
