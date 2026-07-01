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
| Pay-as-you-go price | `PAYG_PRICE` | e.g. `7.50` |
| Retreats | `DEFAULT_RETREATS` array | dates, price, deposit, capacity |
| Stripe payment URLs | `STRIPE_LINKS` object | paste your real Stripe links |
| Admin dashboard passcode | `ADMIN_PASSCODE` | **change this before going live** |

---

## 3. Setting up Stripe Payment Links

1. Log into **dashboard.stripe.com**
2. Go to **Products → Payment Links → + New**
3. Create one link for each payment type:

| Name | Type | Amount |
|---|---|---|
| SNB Hive — Pay As You Go | One-off payment | £7.50 |
| SNB Hive — Membership 1 Class | Recurring · monthly | £26.00 |
| SNB Hive — Membership 2 Classes | Recurring · monthly | £45.00 |
| SNB Hive — Retreat Deposit | One-off payment | your deposit amount |
| SNB Hive — Retreat Full | One-off payment | your full retreat price |

4. Copy each link URL and paste into `STRIPE_LINKS` in `src/App.jsx`

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
| Payments | Stripe Payment Links |
| Hosting | Vercel (recommended) |

---

## Security notes

- **Passwords** are hashed with SHA-256 in the browser. Fine for an MVP,
  but production-grade auth requires bcrypt with salt and a backend.
- **Admin passcode** is readable in the page source. A real admin login
  needs server-side verification.
- **HTTPS is required** for password hashing (`crypto.subtle`).
  Vercel provides HTTPS automatically on all deployments.
