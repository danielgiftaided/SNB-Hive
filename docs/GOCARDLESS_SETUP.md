# GoCardless setup for Zumba — step by step

The app is already configured to offer these choices when a customer presses
**Book** on Zumba:

- **Pay as you go:** £10, collected once by Direct Debit
- **Monthly membership:** a prorated first payment for the remaining weekly
  lessons in the joining month, calculated at one quarter of the monthly price
  per lesson even in five-Friday months, then £35 on the 1st of each month by
  Direct Debit

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

Apply the repository's database migrations to that project before deploying or
testing the payment functions:

```bash
npx supabase db push
```

Do not skip this command. The booking flow writes `booking_date` and
`payment_group_id`, and the webhook records `gocardless_payment_id`. Deploying
the website without applying the migrations causes checkout to stop before any
payment is taken.

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
npx supabase functions deploy gocardless-sync --no-verify-jwt
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
7. In **My bookings**, the booking begins as **Awaiting payment**. Completed setup immediately reserves the chosen dates, through the return-page server check or the signed `billing_requests.fulfilled` webhook. The customer and Shams receive booking confirmations. It stays **Awaiting payment** until `payments.paid_out`, which marks it **Paid** and sends payment receipts.
8. In the GoCardless sandbox dashboard, verify that the customer, mandate, and
   £10 payment were created.

## 6. Test the £35 monthly membership journey

Use a different test customer, or cancel the first test booking before trying
again, because the app prevents one customer from booking Zumba twice.

1. Press **Book** on Zumba.
2. Select **Monthly membership — £35/month**.
3. Check that **Prorated first payment** shows the joining month's proportional
   amount, then press
   **Continue to payment**.
4. Complete the GoCardless sandbox authorization.
5. Confirm the app returns to `/payment-complete` and immediately reserves the chosen start date and all subsequent classes in that month. Check the member/admin lists and booking emails. Payment remains **Awaiting payment** until **Paid Out**.
6. In GoCardless, verify the prorated one-off payment and a subscription named
   `SNB Hive Zumba monthly membership` exist and that the subscription amount
   is £35 monthly with collection day set to the 1st of the next month. Scheduled recurring payments enrol the full charge month before payout.

The webhook uses an idempotency key, so a webhook retry will not intentionally
create a second subscription for the same booking.

## 7. Check logs if a test does not work

### Checkout does not open and the booking popup shows an error

If the reason says `Could not find the 'booking_date' column of 'bookings' in
the schema cache`, the live database has not received the booking migrations.
From the linked repository, run:

```bash
npx supabase db push
```

Wait a few seconds for the API schema to reload, then retry the booking. The
latest repair migration explicitly reloads the PostgREST schema cache. Do not
manually mark the migration as applied without running its SQL.

If `npx supabase db push` is unavailable, repair the live project directly:

1. Open **Supabase Dashboard → SQL Editor → New query** for the same project
   used by `VITE_SUPABASE_URL`.
2. Paste the complete contents of
   `supabase/migrations/20261001000000_ensure_booking_checkout_schema.sql` and
   choose **Run**.
3. Run this verification query. It must return all three rows before testing
   checkout again:

   ```sql
   select column_name
   from information_schema.columns
   where table_schema = 'public'
     and table_name = 'bookings'
     and column_name in (
       'booking_date',
       'payment_group_id',
       'gocardless_payment_id'
     )
   order by column_name;
   ```

Redeploying the website or Edge Functions alone cannot add database columns;
the migration SQL must run against the live database.

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

### Keep the checkout function in sync with the website

The repository includes the **Deploy payment Edge Functions** GitHub Actions
workflow. It deploys `gocardless-checkout` and `gocardless-webhook` whenever a
change to either payment function or their shared modules reaches `main`. This
prevents a newly deployed website from continuing to call an older checkout
implementation—the situation reported in the popup as `legacy_edge_function`.

Configure these once in **GitHub → Settings → Secrets and variables → Actions**:

| Repository secret | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | A Supabase personal access token with access to the existing SNB Hive project. |
| `SUPABASE_PROJECT_REF` | The existing project's reference from the Supabase dashboard URL or Project Settings. |

After adding the secrets, open **GitHub → Actions → Deploy payment Edge
Functions → Run workflow** to replace the currently deployed legacy function
immediately. Confirm that both deploy steps pass before retrying the booking.
Future payment-function changes deploy automatically after they are merged to
`main`; a Vercel deployment by itself does not update Supabase Edge Functions.

> **The workflow is not listed in the Actions tab yet:** GitHub only offers a
> manually triggered workflow after its YAML file exists on the repository's
> default branch. First merge the pull request that adds
> `.github/workflows/deploy-payment-functions.yml` into `main`, then reload the
> Actions tab. The merge itself triggers the first deployment because the
> workflow watches changes to its own file. If the pull request or workflow
> file is not visible on GitHub at all, the branch containing the commit has
> not been pushed to that GitHub repository; push/publish the branch before
> trying to merge it.

To repair checkout immediately without waiting for the GitHub workflow, use a
terminal in this repository after completing the CLI login and project-linking
steps above:

```bash
npx supabase functions deploy gocardless-checkout
npx supabase functions deploy gocardless-webhook
```

Successful CLI deployment and successful GitHub Actions deployment are
equivalent; only one is required to replace the legacy function.

Open **Supabase Dashboard → Edge Functions** and inspect the logs for both
`gocardless-checkout` and `gocardless-webhook`.

Common causes are:

| Symptom | Check |
|---|---|
| HTTP 422 with `No more than 3 properties are allowed` | An outdated `gocardless-checkout` function is deployed. The corrected billing request sends only `booking_id`, `payment_group_id`, and `payment_plan`; redeploy it with `npx supabase functions deploy gocardless-checkout`. |
| `GoCardless is not configured` | `GOCARDLESS_ACCESS_TOKEN` is missing from Supabase secrets. |
| `Invalid redirect origin: expected …, received …` | Compare the two public origins. Set `APP_URL` to the received origin only when it is the intended production/customer-facing domain. Check `https` and `www`; never allow-list a random preview domain just to bypass the check. |
| `Invalid redirect URL` | The app sent a missing or malformed return/exit URL. Confirm Vercel deployed the latest merged frontend commit and hard-refresh the production site. |
| `Invalid APP_URL: …` | Set `APP_URL` to the valid `https://` production/customer-facing origin, then redeploy checkout. |
| `Booking could not be verified (…)` | Deploy the current checkout function, then use the reason in parentheses and the matching function log; the saved booking is missing or has an unexpected group, session, status, or PAYG amount. |
| Webhook shows `Invalid signature` | The secret belongs to a different endpoint/environment or was copied incorrectly. |
| Booking stays at **Awaiting payment** | Check the webhook endpoint delivery in GoCardless, then inspect `gocardless-webhook` logs. |
| Sandbox request reaches the live API | `GOCARDLESS_API_URL` must be `https://api-sandbox.gocardless.com`. |

#### Does “Booking could not be verified” require SQL?

Usually, **no**. This message means the checkout function could read the saved
booking, but rejected one of its values. The current function adds a reason in
parentheses (`missing_booking`, `missing_payment_group`, `wrong_session`,
`wrong_status`, or `wrong_amount`) and writes the same reason to its log. Deploy
the current function before testing again:

```bash
npx supabase functions deploy gocardless-checkout
```

Only run the repair migration when the original save error or function log says
that `booking_date`, `payment_group_id`, or `gocardless_payment_id` is missing.
In that case, use `npx supabase db push`, or run the complete migration in the
SQL Editor as described above. Do not run an `update bookings ...` statement to
force a row to `pending_payment` or change its amount: checkout deliberately
verifies these server-side values before asking GoCardless to take payment.

If the deployed function reports one of the validation reasons, retry once and
then open **Supabase Dashboard → Edge Functions → gocardless-checkout → Logs**.
The `Booking not ready for checkout` entry contains `validation_issue`, status,
session, and group size. Those fields determine whether the production website
is stale or whether the booking write needs investigation; no database secret
or access token is needed to diagnose it.

Do not mark the webhook as working merely because checkout returned to the app.
The return page calls `gocardless-sync`, which verifies the original checkout server-side and allocates the booking/subscription through the same handler as the signed webhook. A return URL by itself proves nothing. Verify both the immediate allocation and the later `payments.paid_out` update. See [rollout and legacy recovery](CLASS_BOOKING_CHANGES.md#rollout-order), including the additional SQL columns and sync function required by PR #46.

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
- Completed payment setup reserves the class dates immediately. The SNB Hive
  admin dashboard keeps **Awaiting payment** until the **paid_out** webhook
  marks it **Paid** and sends both payout receipts. Collection confirmation
  alone does not mark it Paid. Use **Restore completed bookings** to recheck
  existing rows against their original GoCardless checkout without another charge.
- If prices change, update both customer-facing and server-side prices together:
  1. `PAYG_PRICE` and `MEMBERSHIP_TIERS` in `src/App.jsx`;
  2. `PRICES` in `supabase/functions/gocardless-checkout/index.ts` for PAYG,
     and `MEMBERSHIP_MONTHLY_AMOUNT` in
     `supabase/functions/_shared/membership.ts` for membership.
- After any price/code change, run a sandbox test again before deploying live.
