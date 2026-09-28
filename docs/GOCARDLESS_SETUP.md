# GoCardless setup for Zumba — step by step

The app is already configured to offer these choices when a customer presses
**Book** on Zumba:

- **Pay as you go:** £10, collected once by Direct Debit
- **Monthly membership:** £35, collected monthly by Direct Debit

The customer chooses an option in the booking popup and is then redirected to
GoCardless to enter and authorise her bank details. Bank details and the
GoCardless access token never pass through the browser application.

> Start with the GoCardless sandbox. Do not switch to live credentials until
> both test journeys work from beginning to end.

## Do I need another Supabase account or project?

**No.** Use the existing Supabase account and the existing SNB Hive project.
The payment functions are deployed alongside the app's current database and
use the same project URL and keys. Do not create a second Supabase account or a
second project for GoCardless.

The only new Supabase items are:

- three Edge Functions: `gocardless-checkout`, `gocardless-webhook`, and
  `send-email`; and
- the payment secrets `APP_URL`, `GOCARDLESS_ACCESS_TOKEN`,
  `GOCARDLESS_API_URL`, and `GOCARDLESS_WEBHOOK_SECRET`, plus the email
  secrets `RESEND_API_KEY`, `SENDER_EMAIL`, and `ADMIN_EMAIL`.

When the instructions below say to link a project, select the existing SNB Hive
project—the same project that contains the `users` and `bookings` tables and
whose `VITE_SUPABASE_URL` is already configured in Vercel.

## 1. Gather the four values you need

Have these ready before running any commands:

| Value | Where it comes from | Example |
|---|---|---|
| Supabase project reference | Supabase dashboard URL or **Project Settings → General** | `abcdefghijklmnop` |
| Public app origin | The production/custom-domain origin customers actually visit | `https://book.snbhive.com` |
| GoCardless access token | GoCardless sandbox dashboard, under **Developers → Access tokens** | Keep secret |
| GoCardless webhook secret | Created in step 4 below | Keep secret |

The app must already have `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` configured in Vercel. These are the same values used
by the existing booking database.

### Before continuing: where do I type the commands?

Commands beginning with `npx supabase` are entered in a terminal on the
computer where the SNB Hive repository is checked out—not in the GoCardless,
Supabase, or Vercel dashboard.

1. Open Terminal on macOS/Linux, PowerShell on Windows, or the terminal built
   into VS Code.
2. Change into the SNB Hive project folder. For example:

   ```bash
   cd path/to/SNB-Hive
   ```

3. Check that you are in the correct folder:

   ```bash
   pwd
   ```

   On Windows PowerShell, `Get-Location` can be used instead. The displayed
   path should end in `SNB-Hive`.
4. Check that Node.js is installed:

   ```bash
   node --version
   npm --version
   ```

   Both commands should print a version number. If either command is not found,
   install the current Node.js LTS release before continuing.
5. Keep this terminal open. Run every `npx supabase ...` command below from
   this same project folder.

Whenever a command contains words such as `YOUR_PROJECT_REFERENCE` or
`PASTE_SANDBOX_TOKEN_HERE`, replace the entire placeholder—including the
capital letters—with the real value. Do not type the placeholder literally.

## 2. Install and connect the Supabase CLI

From the repository root, log in and link the CLI to the existing Supabase
project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REFERENCE
```

The login command opens a Supabase authorization page or asks for a Supabase
personal access token. The link command may ask for the database password that
was chosen when the Supabase project was created.

Confirm that the project is linked:

```bash
npx supabase projects list
```

The intended project should have a marker beside it.

## 3. Create a GoCardless sandbox access token

1. Sign in to the **GoCardless sandbox dashboard** (not the live dashboard).
2. Open **Developers → Access tokens**.
3. Choose **Create access token**.
4. Give it a recognizable name such as `SNB Hive Supabase sandbox`.
5. Grant read/write access if GoCardless asks for a scope.
6. Copy the token immediately and store it in a password manager. Do not put it
   in `.env`, Vercel, source code, email, or a screenshot.

Set the sandbox token and the app URL in Supabase. The webhook secret is added
after the endpoint is created:

```bash
npx supabase secrets set \
  GOCARDLESS_ACCESS_TOKEN='PASTE_SANDBOX_TOKEN_HERE' \
  GOCARDLESS_API_URL='https://api-sandbox.gocardless.com' \
  APP_URL='https://YOUR-LIVE-DOMAIN'
```

`APP_URL` must be the exact customer-facing production/custom-domain origin:
include `https://`, do not add a page path or query string, and match the
hostname exactly (including `www` versus non-`www`). Do not use a temporary
Vercel preview URL. A trailing slash or harmless surrounding whitespace is
normalized by the function.

## 4. Deploy the functions and register the webhook

Deploy checkout first:

```bash
npx supabase functions deploy gocardless-checkout
npx supabase functions deploy send-email
```

Deploy the webhook without Supabase JWT verification. GoCardless cannot send a
Supabase login token; authenticity is checked instead using GoCardless's signed
`Webhook-Signature` header.

```bash
npx supabase functions deploy gocardless-webhook --no-verify-jwt
```

If the CLI previously reported `failed to bundle function`, pull the latest
repository changes and run the command again. The functions intentionally use
the built-in Supabase REST API rather than downloading a third-party client
package while bundling. If it still fails, rerun with debug output:

Before redeploying, verify that your Codespace actually contains the corrected
files:

```bash
npm run check:edge-functions
head -n 1 supabase/functions/gocardless-webhook/index.ts
```

Both checks must pass. The first line printed by `head` must start with
`const GC_API`; it must **not** contain `esm.sh`. If the output still contains
`https://esm.sh/@supabase/supabase-js@2`, the Codespace is on the older version
of the branch. Use the Codespace Source Control **Sync Changes/Pull** action,
then run the two checks again. Do not retry deployment until the old import is
gone—the same DNS bundling error will repeat.

Then deploy again:

```bash
npx supabase functions deploy gocardless-webhook --no-verify-jwt
```

Only if the corrected file passes the check but deployment still fails, rerun
with debug output:

```bash
npx supabase functions deploy gocardless-webhook --no-verify-jwt --debug
```

Copy the lines immediately above `failed to bundle function` when asking for
help. Never copy an access token, webhook secret, database password, or a line
containing an `Authorization` header.

Now create the endpoint in the **GoCardless sandbox dashboard**:

1. Open **Developers → Webhook endpoints**.
2. Choose **Add webhook endpoint**.
3. Enter this URL, replacing the project reference:

   ```text
   https://YOUR_PROJECT_REFERENCE.supabase.co/functions/v1/gocardless-webhook
   ```

4. Give it a name such as `SNB Hive sandbox`.
5. Copy the webhook secret displayed by GoCardless.
6. Save/enable the endpoint.
7. Add that secret to Supabase:

   ```bash
   npx supabase secrets set GOCARDLESS_WEBHOOK_SECRET='PASTE_WEBHOOK_SECRET_HERE'
   ```

Confirm all four custom secret names exist (the command does not print their
values):

```bash
npx supabase secrets list
```

You should see `APP_URL`, `GOCARDLESS_ACCESS_TOKEN`,
`GOCARDLESS_API_URL`, and `GOCARDLESS_WEBHOOK_SECRET`.

## 5. Test the £10 pay-as-you-go journey

1. Open the deployed app and sign in as a test customer.
2. Find **Zumba** and press **Book**.
3. In the popup, select **Pay as you go — £10.00**.
4. Check that **Due now** shows **£10.00**, then press
   **Continue to payment**.
5. The browser should go directly to a page hosted by GoCardless. Complete it
   using sandbox test bank details supplied by GoCardless—never use a real bank
   account in sandbox.
6. GoCardless should return the browser to `/payment-complete`, where the app
   shows the short booking reference.
7. In **My bookings**, the booking begins as **Awaiting payment**. After the
   signed `billing_requests.fulfilled` webhook is processed it changes to
   **Paid**. The customer and Shams each receive a confirmation email.
8. In the GoCardless sandbox dashboard, verify that the customer, mandate, and
   £10 payment were created.

## 6. Test the £35 monthly membership journey

Use a different test customer, or cancel the first test booking before trying
again, because the app prevents one customer from booking Zumba twice.

1. Press **Book** on Zumba.
2. Select **Monthly membership — £35/month**.
3. Check that **Monthly payment** shows **£35.00**, then press
   **Continue to payment**.
4. Complete the GoCardless sandbox authorization.
5. Confirm the app returns to `/payment-complete` and the booking eventually
   changes to **Paid**, and that the membership confirmation emails arrive.
6. In GoCardless, verify that a mandate and a subscription named
   `SNB Hive Zumba monthly membership` exist and that the subscription amount
   is £35 monthly.

The webhook uses an idempotency key, so a webhook retry will not intentionally
create a second subscription for the same booking.

## 7. Check logs if a test does not work

### Checkout does not open and the booking popup shows an error

The popup now shows the safe reason returned by `gocardless-checkout`. Copy
that reason (for example, `Invalid redirect origin: expected
https://book.snbhive.com, received https://www.snbhive.com`, `Booking lookup
failed`, or `GoCardless is not configured`) when asking for help. The origins
are public URLs; the message does not contain credentials.

To find the matching server-side diagnostic:

1. Open **Supabase Dashboard → Edge Functions → gocardless-checkout → Logs**.
2. Retry **Continue to payment** once, then refresh the logs.
3. Open the newest entry at the same time as the retry. A failed database
   lookup includes the booking reference, HTTP status, and Supabase response.
   An origin mismatch includes `expected_origin`, `received_origin`, and
   `request_origin`; it does not include request authorization headers.
4. Share only the popup reason and that log entry after removing personal
   information. Never share access tokens, webhook secrets, service-role keys,
   database passwords, or `Authorization` headers.

If the popup still shows only the old generic message, confirm Vercel deployed
the commit containing this troubleshooting section and redeploy
`gocardless-checkout` before testing again.

Open **Supabase Dashboard → Edge Functions** and inspect the logs for both
`gocardless-checkout` and `gocardless-webhook`.

Common causes are:

| Symptom | Check |
|---|---|
| `GoCardless is not configured` | `GOCARDLESS_ACCESS_TOKEN` is missing from Supabase secrets. |
| `Invalid redirect origin: expected …, received …` | Compare the two public origins. Set `APP_URL` to the received origin only when it is the intended production/customer-facing domain. Check `https` and `www`; never allow-list a random preview domain just to bypass the check. |
| `Invalid redirect URL` | The app sent a missing or malformed return/exit URL. Confirm Vercel deployed the latest merged frontend commit and hard-refresh the production site. |
| `Invalid APP_URL: …` | Set `APP_URL` to the valid `https://` production/customer-facing origin, then redeploy checkout. |
| `Booking could not be verified` | The saved booking is not Zumba, is no longer pending, or its amount does not match £10/£35. |
| Webhook shows `Invalid signature` | The secret belongs to a different endpoint/environment or was copied incorrectly. |
| Booking stays at **Awaiting payment** | Check the webhook endpoint delivery in GoCardless, then inspect `gocardless-webhook` logs. |
| Sandbox request reaches the live API | `GOCARDLESS_API_URL` must be `https://api-sandbox.gocardless.com`. |

Do not mark the webhook as working merely because checkout returned to the app.
The return page is customer-facing confirmation; the signed webhook is what
confirms the database booking and creates a membership subscription.

## 8. Switch from sandbox to live

Only do this after both sandbox journeys pass.

1. Make sure the GoCardless live account is fully verified and able to collect
   Bacs Direct Debit payments.
2. In the **live GoCardless dashboard**, create a new live access token. Sandbox
   credentials do not work against the live API.
3. In the live dashboard, create a new webhook endpoint using the same Supabase
   function URL. Copy its new live webhook secret.
4. Replace the Supabase secrets and production API URL:

   ```bash
   npx supabase secrets set \
     GOCARDLESS_ACCESS_TOKEN='PASTE_LIVE_TOKEN_HERE' \
     GOCARDLESS_WEBHOOK_SECRET='PASTE_LIVE_WEBHOOK_SECRET_HERE' \
     GOCARDLESS_API_URL='https://api.gocardless.com' \
     APP_URL='https://YOUR-LIVE-DOMAIN'
   ```

5. You do not normally need to redeploy after changing secrets, but redeploying
   both functions is safe if you want to ensure the latest code is live:

   ```bash
   npx supabase functions deploy gocardless-checkout
   npx supabase functions deploy gocardless-webhook --no-verify-jwt
   ```

6. Make one real £10 booking with an account you control. Confirm the booking,
   webhook delivery, payment, and booking status before sharing the Book button
   publicly.
7. Then test one real membership and cancel it in the GoCardless dashboard once
   the £35 subscription has been verified, unless it is intended to remain
   active.

## 9. Ongoing administration

- GoCardless controls the collection timeline; Direct Debit is not instant like
  a card payment.
- Use the GoCardless dashboard to inspect or cancel mandates, payments, and
  subscriptions. Changing the booking status in SNB Hive does not cancel a
  GoCardless mandate or subscription.
- The SNB Hive admin dashboard shows the booking state. The webhook changes a
  successfully authorized booking from **Awaiting payment** to **Paid** and
  asks `send-email` to notify both the customer and Shams.
- If prices change, update all three locations together:
  1. `PAYG_PRICE` and `MEMBERSHIP_TIERS` in `src/App.jsx`;
  2. `PRICES` in `supabase/functions/gocardless-checkout/index.ts`;
  3. the subscription amount in
     `supabase/functions/gocardless-webhook/index.ts`.
- After any price/code change, run a sandbox test again before deploying live.
