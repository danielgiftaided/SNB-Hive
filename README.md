# SNB Hive — Booking System

A custom booking app for fitness classes (Zumba, Boxing, Yoga, Strength & Conditioning)
and women's wellness retreats. Built with React + Vite + Tailwind CSS.

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
│   └── favicon.svg          ← tab icon
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

For the complete click-by-click and command-by-command setup, sandbox testing,
live cutover, troubleshooting, and ongoing administration guide, see
**[`docs/GOCARDLESS_SETUP.md`](docs/GOCARDLESS_SETUP.md)**.

Use the **existing SNB Hive Supabase account and project**—a separate Supabase
account or payment project is not required.

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

4. Deploy both functions:

```bash
supabase functions deploy gocardless-checkout
supabase functions deploy gocardless-webhook --no-verify-jwt
```

5. Make a Zumba pay-as-you-go booking with a GoCardless sandbox test bank
   account. Confirm that checkout returns to `/payment-complete` and that the
   booking changes from `pending_payment` to `confirmed` after the signed
   `billing_requests.fulfilled` webhook arrives. Repeat for membership and
   verify a £35 monthly subscription appears in GoCardless.

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

---

## 6. Admin dashboard

Click **"Admin dashboard"** in the footer of the app.
Default passcode: `admin123`

**Change `ADMIN_PASSCODE` in `src/App.jsx` before sharing the live link with anyone.**

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
- **Admin passcode** is readable in the page source. A real admin login
  needs server-side verification.
- **HTTPS is required** for password hashing (`crypto.subtle`).
  Vercel provides HTTPS automatically on all deployments.
