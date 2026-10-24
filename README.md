# SNB Hive — Booking System

A custom booking app for fitness classes (Zumba, BoxFit, Self Defence, Strength & Conditioning)
and women's wellness retreats. Built with React + Vite + Tailwind CSS.

Current class booking rules and deployment steps for the £5 tasters,
live BoxFit and £90 Self Defence GoCardless course are in
[`docs/CLASS_BOOKING_CHANGES.md`](docs/CLASS_BOOKING_CHANGES.md).

Registration opt-ins, communication preferences, WhatsApp invitation placement and marketing unsubscribe deployment are documented in [Marketing preferences](docs/MARKETING_PREFERENCES.md).

Manual admin enrollment and deployment are documented in [Admin class bookings](docs/ADMIN_CLASS_BOOKINGS.md).

## Mobile app

The staged plan for turning this web app into downloadable iOS and Android
apps is in [`docs/MOBILE_APP_PLAN.md`](docs/MOBILE_APP_PLAN.md). It describes
the shared-code Capacitor approach, the work order, release gates, and the
decisions that must be made before native projects are generated.

---

## Project file structure

```
snb-hive-booking/            ← your project root
├── .gitignore
├── README.md
├── index.html               ← page shell (do not edit)
├── package.json             ← dependencies and scripts
├── vite.config.js           ← build config
├── tailwind.config.js       ← CSS config
├── postcss.config.js        ← CSS config
├── public/
│   └── logo-pink-gold.png   ← app logo and tab icon
└── src/
    ├── main.jsx             ← React entry point (do not edit)
    ├── index.css            ← Tailwind directives (do not edit)
    ├── storage.js           ← data persistence adapter (swap here for Supabase)
    └── App.jsx              ← ALL your booking logic and UI lives here
```

---

## 1. First-time setup (run once)

```bash
# Clone your GitHub repo to your computer
git clone https://github.com/YOUR_USERNAME/snb-hive-booking.git
cd snb-hive-booking

# Install dependencies
npm install

# Start the local development server
npm run dev
```

Open your browser at **http://localhost:5173** — the app loads instantly.

---

## 2. Customising your app

Open **`src/App.jsx`** and edit the CONFIG block at the very top of the file.
Every value here flows automatically through the whole app.

| Setting | Location in App.jsx | What to change |
|---|---|---|
| Business name & tagline | `BRAND` object | `name: "SNB Hive"` |
| Class schedule | `DEFAULT_CLASSES` array | `day`, `time`, `capacity` per class |
| Membership tiers | `MEMBERSHIP_TIERS` array | `price` per tier |
| Pay-as-you-go price | `PAYG_PRICE` | currently `10` |
| Retreats | `DEFAULT_RETREATS` array | dates, price, deposit, capacity |
| Paid classes | `PAID_CLASS_IDS` | Zumba only by default |
| Admin dashboard passcode | `ADMIN_PASSCODE` | **change this before going live** |

---

## 3. Setting up GoCardless for Zumba

Payments use a server-side Supabase Edge Function so the GoCardless access
token is never exposed in the browser. Pay as you go creates a £10 one-off
Direct Debit payment. Membership creates a Direct Debit mandate and then a
£35 monthly subscription after the customer completes the hosted GoCardless
flow. Only Zumba is enabled in `PAID_CLASS_IDS`.

### Sandbox first

1. In the GoCardless sandbox dashboard, create an access token and a webhook
   endpoint. Use this endpoint URL:
   `https://YOUR_PROJECT.supabase.co/functions/v1/gocardless-webhook`.
2. Copy the webhook secret shown by GoCardless.
3. Install and log in to the Supabase CLI, link the production project, then
   add secrets (do not put these values in `.env` or Vercel):

```bash
supabase secrets set \
  GOCARDLESS_ACCESS_TOKEN=YOUR_SANDBOX_TOKEN \
  GOCARDLESS_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET \
  GOCARDLESS_API_URL=https://api-sandbox.gocardless.com \
  APP_URL=https://YOUR-LIVE-DOMAIN
```

4. Apply [the allocation SQL](supabase/SQL_EDITOR_BOOKING_ALLOCATION.sql) to the
   existing project, then deploy the payment and confirmation functions:

```bash
supabase functions deploy gocardless-checkout
supabase functions deploy gocardless-webhook --no-verify-jwt
supabase functions deploy gocardless-sync --no-verify-jwt
supabase functions deploy send-email --no-verify-jwt
```

5. Make a Zumba pay-as-you-go booking with a GoCardless sandbox test bank
   account. Confirm that checkout returns to `/payment-complete` and that the
   selected dates are allocated and marked `paid` immediately after verified
   successful GoCardless setup, without waiting for `payments.paid_out`.
   Repeat for membership: every remaining class that month should be reserved,
   and a £35 subscription should start on the first of the next month.
   Open admin Bookings to recover existing completed checkouts; see the
   [rollout and recovery instructions](docs/CLASS_BOOKING_CHANGES.md#rollout-order).

### Go live

Create a live access token and live webhook in the GoCardless dashboard, then
replace the three GoCardless secrets. The production API URL is
`https://api.gocardless.com`. Redeploying is not required after changing
secrets. Keep `APP_URL` set to the exact public origin (for example,
`https://book.snbhive.com`, with no trailing slash).

The prices are deliberately validated in both the app and the Edge Function.
If the Zumba price changes, update `PAYG_PRICE`/`MEMBERSHIP_TIERS` in
`src/App.jsx` and `PRICES` in
`supabase/functions/gocardless-checkout/index.ts` together.

---

## 4. Push your changes to GitHub

```bash
# If this is the first time pushing this project:
cd snb-hive-booking
git init
git add .
git commit -m "Initial commit — SNB Hive booking app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/snb-hive-booking.git
git push -u origin main

# Every time you make changes after that:
git add .
git commit -m "Describe what you changed"
git push
```

Replace `YOUR_USERNAME` with your actual GitHub username.

---

## 5. Deploy to Vercel (free — takes 2 minutes)

1. Go to **vercel.com** and sign up with your GitHub account
2. Click **Add New Project**
3. Select your `snb-hive-booking` repository
4. Leave all settings as default — Vercel detects Vite automatically
5. Click **Deploy**
6. Your live URL appears: `snb-hive-booking.vercel.app`

**Custom domain** (e.g. `book.snbhive.com`):
Vercel dashboard → your project → **Settings → Domains → Add Domain**

Every time you push a change to GitHub, Vercel redeploys automatically.

Production builds include `app-version.json` with the same release ID embedded
in the JavaScript. The app checks it before mounting, when a saved tab returns
(including browser back/forward restoration), when connectivity returns, and
once a minute while visible. A newer release loads automatically through a
cache-busting navigation; login storage and referral/payment URL parameters
are preserved. Updates wait while a form has unsaved input, a booking dialog
is open, payment confirmation is running, or the user has interacted within
10 seconds. Closing the form/dialog lets a pending update proceed. Failed or
slow checks leave the app usable; repeated stale HTML cannot cause a reload
loop. Vite development mode does not run release checks.

`vercel.json` requires fresh validation of HTML and unversioned public files,
keeps those responses out of the CDN cache, and disables storage of the release
manifest. Content-hashed files under `/assets/` remain cached
for a year. Keep these rules if deploying through another host or CDN.
The first deployment of this mechanism cannot update JavaScript already open
from a release that predates these checks; those tabs need one normal reload.
Future releases are detected automatically.

Run `npm run test:app-updates` with Python Playwright and Chromium available to
exercise two actual production builds, restored tabs, update deferral and
failed/stale responses. All booking/email requests are intercepted fixtures.

---

## 6. Admin dashboard

The admin dashboard is available at `/admin` and uses server-side password
checking plus an emailed one-time code. Deploy the `admin-auth` Edge Function
and set these Supabase function secrets before attempting to sign in:

- `ADMIN_EMAIL` — the admin sign-in email address
- `ADMIN_PASSWORD_HASH` — SHA-256 of the salt immediately followed by the password
- `ADMIN_PASSWORD_SALT` — a long random string (recommended)
- `ADMIN_MFA_SECRET` — a separate long random string used to sign MFA challenges
- `RESEND_API_KEY` and `SENDER_EMAIL` — used to deliver the one-time code

For example, generate the password hash locally (replace both example values):

```bash
node -e "const c=require('node:crypto'); console.log(c.createHash('sha256').update('YOUR_SALT'+'YOUR_PASSWORD').digest('hex'))"
supabase secrets set ADMIN_EMAIL=you@example.com ADMIN_PASSWORD_HASH=THE_HASH ADMIN_PASSWORD_SALT=YOUR_SALT ADMIN_MFA_SECRET=ANOTHER_LONG_RANDOM_VALUE RESEND_API_KEY=re_xxx SENDER_EMAIL=shams@snbhive.com
supabase functions deploy admin-auth
supabase functions deploy send-email --no-verify-jwt
```

### Admin sign-in says it is not configured

`[admin-auth] Admin authentication is not configured` means at least one of
`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` or `ADMIN_MFA_SECRET` is missing or empty.
The function stops before it checks the password or tries to send an email.

In the correct Supabase project, open **Edge Functions → Secrets** and restore
only the missing settings. `ADMIN_EMAIL` is the admin's sign-in email;
`ADMIN_PASSWORD_HASH` must be the SHA-256 hash of the existing salt followed by
the intended password. Preserve an existing `ADMIN_PASSWORD_SALT` when restoring
its matching hash. `ADMIN_MFA_SECRET` is a separate long random signing secret,
not the admin password or a six-digit code. Generate a missing signing secret
locally with a password manager or a cryptographic random generator; do not
share its value in chat, logs or the repository.

If the previous deployed authentication function worked without these settings,
the current error can be a compatibility problem introduced by deploying the
repository's implementation over that function. This repository does not contain
its earlier source. Re-deploying an older repository commit does not establish
that the original live function has been restored. The recovery below configures
the replacement and can use the **same admin email and password**, without
claiming to recover the original implementation.

If `ADMIN_PASSWORD_HASH` and `ADMIN_MFA_SECRET` are both absent, download
[`tools/admin-setup.html`](tools/admin-setup.html) and open the saved file directly
in your browser. This standalone helper is not part of the deployed app. Enter
your existing admin password twice to keep using it, generate settings, then
copy the three generated name/value pairs into **Supabase → Edge Functions →
Secrets**. Keep `ADMIN_EMAIL` and the other existing settings. Save all three
and retry sign-in. No Node installation or frontend release is required.
The file makes no network requests, uses browser cryptography and does not store
or send passwords/settings. The generated salt must be saved alongside its hash.
This is a recovery option for the current function, not a rollback.

Alternatively, run this in a private local terminal from the repository folder:

```bash
node scripts/generate-admin-config.mjs
```

Enter and confirm your chosen admin password (entry is hidden). The helper makes
a matching random salt/password hash and a separate random MFA signing secret,
saving all three to `.env.admin.local` with owner-only permissions. It does not
send anything, print values or overwrite an existing file. The file is excluded
by `.gitignore`. Open it privately and add its three name/value pairs to Supabase
**Edge Functions → Secrets**, preserving your existing `ADMIN_EMAIL`,
`RESEND_API_KEY` and other settings. Use the chosen password to sign in. This
replaces the admin password configuration only; customer passwords are unaffected.

If a working hash or salt already exists, restore its matching settings rather
than generating replacements unnecessarily. The helper is intended for setup or
an intentional admin password reset, not for recovering a missing MFA secret alone.

Save the restored settings and try signing in again. Restoring configuration
for the already deployed function does not require a frontend release. If the
names already exist, check for empty values and confirm the project is the one
used by the deployed app.

The handler now logs the exact missing **names only**. The frontend distinguishes
this configuration problem from email-delivery failures, including errors from
the older handler. The deployment workflow checks the names of required admin
and email settings before replacing `admin-auth`; listing secret metadata does
not inspect values or prove that the credentials work. Missing names or an
unreadable response stop deployment. These safeguards do not create or repair
live secrets automatically.

Run `npm run test:admin-auth-config` for isolated missing-setting, sign-in/MFA,
error-display and deployment-guard checks. `npm run test:admin-browser-setup`
checks the standalone helper on desktop/mobile, including using its settings
against the actual password/MFA/session handler with a fixture password. This
browser test uses a loopback-only fixture server because the managed test browser
disables local-file navigation. No real accounts or emails are used.

The app uses its own member sessions rather than Supabase Auth, so `send-email`
must be deployed without Supabase JWT verification. The function sends booking
cancellation confirmations to both the member and `ADMIN_EMAIL` (which defaults
to `shams@snbhive.com`). Keep `RESEND_API_KEY` and the verified `SENDER_EMAIL`
configured as Supabase secrets. Once the `SUPABASE_ACCESS_TOKEN` and
`SUPABASE_PROJECT_REF` repository secrets are configured, pushes to `main` that
change the email function automatically deploy the new version through GitHub
Actions. This prevents the deployed mailer from falling behind the email types
used by the app.

All notifications share the booking app's cream and sage email template. The
transparent pink and gold app logo is bundled as an inline email attachment,
so messages do not depend on a separate website image or `EMAIL_LOGO_URL`.
After changing `public/logo-pink-gold.png`, run `npm run sync:email-logo` and
`npm run test:email-branding`, and commit the generated
`supabase/functions/_shared/email-logo.ts` alongside the updated app asset.
The existing Edge Function workflow redeploys the mailer when either its
template or bundled logo changes.

There is deliberately no default admin password in the browser bundle.

The dashboard shows:
- Revenue summary (confirmed vs awaiting payment)
- Every booking with name, email, phone, class, plan, amount
- Filter by status, search by name/email
- Mark as paid / cancel / restore bookings
- Export all bookings to CSV

---

## 7. Upgrade to shared database (Supabase)

> **Why you need this for a real booking system:**
> The default setup uses localStorage, so data lives in the browser.
> Bookings made by Customer A on their phone won't show on your admin
> dashboard on a different device. Supabase gives you a shared database
> so all users see the same data.

### Step 1 — Create a Supabase project

1. Go to **supabase.com** → New project (free tier, no credit card needed)
2. Give it a name, pick a region close to you, set a database password

### Step 2 — Create your tables

In the Supabase dashboard, go to **SQL Editor** and run:

```sql
-- Users table
create table users (
  id           text primary key,
  name         text not null,
  email        text unique not null,
  phone        text,
  password_hash text not null,
  salt         text,
  created_at   timestamptz default now()
);

-- Bookings table
create table bookings (
  id           text primary key,
  session_id   text,
  session_name text,
  type         text,
  user_id      text references users(id),
  name         text,
  email        text,
  phone        text,
  plan         text,
  amount       numeric,
  status       text default 'pending_payment',
  booking_date date,
  payment_group_id text,
  gocardless_payment_id text,
  created_at   timestamptz default now()
);

-- Allow public read/write (fine for a prototype — tighten with RLS for production)
alter table users   enable row level security;
alter table bookings enable row level security;
create policy "public access" on users   for all using (true) with check (true);
create policy "public access" on bookings for all using (true) with check (true);
```

### Step 3 — Get your API keys

Supabase dashboard → **Project Settings → API**

Copy:
- **Project URL** (looks like `https://xxxx.supabase.co`)
- **anon public key** (long string starting with `eyJ...`)

### Step 4 — Add keys to your project

Create a file called `.env` in your project root (this file is in .gitignore — never commit it):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJYOUR-ANON-KEY
```

### Step 5 — Install Supabase client

```bash
npm install @supabase/supabase-js
```

### Step 6 — Switch the storage adapter

Open **`src/storage.js`**, delete the localStorage adapter block at the top,
and uncomment the Supabase adapter block at the bottom of the file.
The App.jsx does not need any changes.

### Step 7 — Add your env variables to Vercel

Vercel dashboard → your project → **Settings → Environment Variables**

Add:
- `VITE_SUPABASE_URL` = your project URL
- `VITE_SUPABASE_ANON_KEY` = your anon key

Redeploy (or push a commit) and you're live with a shared database.

### Step 8 — Deploy email and admin authentication

User sign-in sends an emailed verification code, so `send-email` must be
deployed even for existing member accounts. The admin page additionally needs
`admin-auth`. Follow the secret setup in section 6, then deploy both functions.
If either function is missing or Resend is not configured, the app now reports
an email-service/configuration error instead of a generic sign-in failure.

If sign-in reports that the email service credentials need updating, confirm
that `RESEND_API_KEY` is a current Resend API key (beginning with `re_`) in the
**Supabase project's Edge Function secrets**, not only in Vercel. If the app
reports that the sender is not verified, verify the `SENDER_EMAIL` domain in
Resend. Secrets can be replaced and the functions redeployed with:

```bash
supabase secrets set RESEND_API_KEY=re_xxx SENDER_EMAIL=login@your-verified-domain.example
supabase functions deploy send-email
supabase functions deploy admin-auth
```

Also make sure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in
Vercel and redeploy the site after changing either Vite variable.

---

## Tech stack

| Layer | Tool |
|---|---|
| UI framework | React 18 |
| Build tool | Vite 5 |
| Styling | Tailwind CSS 3 |
| Icons | lucide-react 0.383.0 |
| Data (default) | localStorage (per-browser) |
| Data (production) | Supabase (shared Postgres) |
| Payments | GoCardless Billing Requests + Direct Debit |
| Hosting | Vercel (recommended) |

---

## Security notes

- **Passwords** are hashed with SHA-256 in the browser. Fine for an MVP,
  but production-grade auth requires bcrypt with salt and a backend.
- **Admin credentials** are checked only in the `admin-auth` Edge Function;
  never expose its secrets as `VITE_` environment variables.
- **HTTPS is required** for password hashing (`crypto.subtle`).
  Vercel provides HTTPS automatically on all deployments.

Mix & Match (two Zumba + two BoxFit dates for £35, renewing monthly) is documented in [MIX_MATCH_MEMBERSHIP.md](docs/MIX_MATCH_MEMBERSHIP.md), including the pinned GoCardless template, renewal date selection, deployment and fixture checks.
