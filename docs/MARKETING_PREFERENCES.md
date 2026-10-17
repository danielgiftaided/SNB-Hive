# Email and WhatsApp preferences

Registration offers two independent, optional, unticked choices, separate from the required terms checkbox:

- Email class news, events and offers.
- An invitation to the SNB Hive WhatsApp group for class news, events and offers.

Neither choice is needed to register or book. Existing members remain opted out until they choose otherwise. New email opt-ins become eligible for marketing after the normal account email-verification step. A temporary preference-save failure does not prevent verified account access; the member can confirm their existing choice using Save preferences in Account or on their next verified sign-in.

The supplied WhatsApp invitation is shared by the app and mailer in `supabase/functions/_shared/whatsapp-config.ts`. If the group link changes, update that shared default, or set both the frontend build variable `VITE_WHATSAPP_GROUP_URL` and mailer secret `WHATSAPP_GROUP_URL` to the same replacement link. Only HTTPS `chat.whatsapp.com` invitations are accepted. After verification, a member who selected WhatsApp sees **Join WhatsApp group** below the welcome area on Classes. The same invitation remains under **Account → Communication preferences**. Nobody is automatically added or sent a WhatsApp message. The notice explains that standard-group members see each other's phone numbers, and that the choice does not cover SMS, marketing calls or separate promotional WhatsApp messages. The member must leave an existing WhatsApp group in WhatsApp; changing the app preference cannot remove them from it.

## Verification and welcome emails

New registrations receive a verification-code email first. Completing verification starts a separate **Welcome to SNB Hive!** email immediately, with a friendly account introduction to regular BoxFit/Zumba classes, tasters for new class members and the three-week Self Defence course. This is a one-off account introduction; it does not enable future marketing. Only members whose stored WhatsApp choice is true receive the group invitation in that welcome, alongside the phone-number visibility notice. Existing invitation panels in Classes and Account remain available.

Only users inserted after `20261017010000_signup_welcome.sql` are enrolled; there is no welcome backfill for existing members. A private signup record stores a digest of the emailed code with a server-side 15-minute expiry. The mailer verifies that proof and resolves the saved identity and WhatsApp choice itself. New verification codes replace earlier ones. A first verified sign-in can complete an unfinished signup; password reset and subsequent sign-ins do not send another welcome.

The app queues delivery after successful verification without blocking account access. Failures retry every minute while the app is open, on focus and after refresh. The server freezes the delivery recipient and uses a stable Resend idempotency key, then records `sent_at` and clears the code digest. Retries after an ambiguous acknowledgement reuse the same payload/key. Automatic retries stop after 23 hours, within Resend's 24-hour deduplication window. If a prolonged outage prevents delivery, check the mailer logs, Resend delivery history and the private signup record before manually retrying; no background scheduler or historical bulk email is introduced.

## Recording and changing choices

`public.users` stores each current channel choice, the consent version, latest change time/source and email-verification marker. A database trigger records each explicit signup choice or changed channel, including the exact wording, source and a server timestamp, in `snb_private.marketing_consent_events`. Ordinary browser roles cannot read, insert or change that audit table or the private unsubscribe tokens. Existing users and cached older registration forms without the consent version are not treated as consenting.

Account changes use `save_marketing_preferences` and write only channels the member actually changed. The existing app's member session is retained; this change does not replace the app's account-authentication system. Profile/password upserts cannot overwrite marketing preferences, both in the adapter and in the database trigger. This prevents stale tabs or cached older app versions from undoing an unsubscribe. An email-only opt-out does not change WhatsApp, and a WhatsApp-only edit does not restore email consent.

## Marketing and booking email

The admin Members tab displays and exports both choices in separate columns. The existing send-to-all tool now targets verified email opt-ins only. The mail handler rechecks current consent on the server for every `blast` message; a stale admin selection cannot include someone who has since withdrawn. Missing consent, missing unsubscribe setup or a failed consent lookup prevents marketing delivery. Member bookings, verification, payment, cancellation and admin service notifications retain their existing delivery paths.

Every marketing email includes an unsubscribe link and `List-Unsubscribe` / `List-Unsubscribe-Post` headers. The public `marketing-unsubscribe` function uses an unguessable per-member token held in a private table and requires no login. A GET displays a confirmation button without changing preferences, so link scanners do not opt people out. A confirmation POST or mail-client one-click POST disables email marketing and records withdrawal; repeated requests are safe. The private recipient and unsubscribe RPCs are callable only by the service role. Invalid links or database failures show a clear failure instead of claiming success.

When sending promotions outside the app, honour the recorded current email choices and include a working opt-out mechanism in that system as well. The app does not synchronize external mailing lists or WhatsApp membership.

## Deployment

Merge deploys `20261017000000_marketing_consent.sql` and `20261017010000_signup_welcome.sql` through the existing Edge Functions workflow, checks that all six RPCs exist, deploys public `marketing-unsubscribe`, then deploys the mailer. Deploy the frontend after the migration is confirmed. No new provider credentials are required. The private consent tables deliberately have no browser read/write grants; the mailer uses the existing Supabase service key. The normal app account/session model is unchanged.

## Verification

Use Node 24 and the existing repository checkout. Run:

```bash
npm run test:marketing-database -- /workspace/.snb-database-tests/node_modules/@electric-sql/pglite/dist/index.js
npm run test:signup-welcome -- /workspace/.snb-database-tests/node_modules/@electric-sql/pglite/dist/index.js
npm run test:marketing-email
npm run test:email-branding
npm run build
```

For fixture-only browser checks, start Vite in a persistent terminal:

```bash
VITE_SUPABASE_URL=https://fixture.supabase.test VITE_SUPABASE_ANON_KEY=test-public-key VITE_WHATSAPP_GROUP_URL=https://chat.whatsapp.com/FixtureInvite123 npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Then run `PYTHONDONTWRITEBYTECODE=1 python scripts/test-marketing-ui.py` and `PYTHONDONTWRITEBYTECODE=1 python scripts/test-admin-exports-ui.py`. The tests intercept API/email requests; no real messages are sent and no WhatsApp group is joined.
