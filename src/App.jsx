import { useState, useEffect, useCallback } from "react";
import {
  Calendar, MapPin, Clock, Check, X, ArrowRight, ChevronLeft,
  Loader2, Sparkles, Info, RotateCcw, Music2, Flame, Dumbbell, Flower2,
  ShieldCheck, Search, ArrowUpRight, Lock, Download, Eye, EyeOff, LogOut,
  Banknote, Hourglass, Ban, Undo2, LayoutDashboard
} from "lucide-react";
import storage from "./storage.js";

/* =====================================================================
   CONFIG — edit these to customise the app.
   Swap STRIPE_LINKS values for your real Stripe Payment Link URLs.
   Change ADMIN_PASSCODE before sharing with anyone.
   ===================================================================== */

const BRAND = {
  name: "SNB Hive",
  tagline: "Fitness classes & women's retreats",
};

const DEFAULT_CLASSES = [
  { id: "zumba",    name: "Zumba",                  tagline: "High-energy dance cardio",  day: "Mondays",    time: "6:30–7:30pm", capacity: 20, icon: "music",   color: "#C99A4B" },
  { id: "boxing",   name: "Boxing",                  tagline: "Pad work & conditioning",   day: "Tuesdays",   time: "7:00–8:00pm", capacity: 20, icon: "flame",   color: "#9B5B45" },
  { id: "yoga",     name: "Yoga",                    tagline: "Strength, breath, stillness",day: "Wednesdays", time: "6:00–7:00pm", capacity: 20, icon: "flower",  color: "#7C9885" },
  { id: "strength", name: "Strength & Conditioning", tagline: "Build strength, build power",day: "Thursdays",  time: "7:00–8:00pm", capacity: 20, icon: "dumbbell",color: "#1F4A42" },
];

// 2 membership tiers only
const MEMBERSHIP_TIERS = [
  { activities: 1, price: 26 },
  { activities: 2, price: 45 },
];

const PAYG_PRICE = 7.50;

const DEFAULT_RETREATS = [
  { id: "retreat-1", name: "Women's Wellness Retreat", location: "Surrey Hills", dates: "Fri 18 – Sun 20 Sept", price: 950, deposit: 300, capacity: 15 },
];

const STRIPE_LINKS = {
  payg: "https://buy.stripe.com/REPLACE_PAYG",
  membership: { 1: "https://buy.stripe.com/REPLACE_MEMBERSHIP_1", 2: "https://buy.stripe.com/REPLACE_MEMBERSHIP_2" },
  retreatDeposit: { "retreat-1": "https://buy.stripe.com/REPLACE_RETREAT_DEPOSIT" },
  retreatFull:    { "retreat-1": "https://buy.stripe.com/REPLACE_RETREAT_FULL" },
};

// Change before sharing — note: NOT real security (anyone who views source can read it).
// A real backend login is required before this goes live publicly.
const ADMIN_PASSCODE = "admin123";

/* ===================================================================== */

const INK  = "#1B2B26";
const TEAL = "#1F4A42";
const GOLD = "#C99A4B";
const BG   = "#F5F3EC";

const ICONS = { music: Music2, flame: Flame, flower: Flower2, dumbbell: Dumbbell };

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function hashPassword(pw) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch { return btoa(pw); }
}

function exportCSV(bookings) {
  const headers = ["Name","Email","Phone","Session","Type","Plan","Amount (£)","Status","Booked at"];
  const esc = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const rows = bookings.map(b => [b.name,b.email,b.phone,b.sessionName,b.type,b.plan,b.amount,b.status,b.createdAt]);
  const csv = [headers,...rows].map(r => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8;" }));
  const a = Object.assign(document.createElement("a"), { href:url, download:`snb-bookings-${new Date().toISOString().slice(0,10)}.csv` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

const STATUS_META = {
  paid:            { label: "Paid",             bg: "#E9F1EC", fg: TEAL,      icon: Banknote },
  pending_payment: { label: "Awaiting payment", bg: "#FBF3E3", fg: "#9A7426", icon: Hourglass },
  cancelled:       { label: "Cancelled",        bg: "#F3E7E5", fg: "#9B3A2E", icon: Ban },
};

/* ---- shared UI primitives ---- */

function Fonts() {
  return <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap');
    .ff-display { font-family:'Fraunces',serif; }
    .ff-body    { font-family:'Inter',sans-serif; }
  `}</style>;
}

function Pill({ children, icon: Icon }) {
  return (
    <span className="ff-body inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-stone-100 text-stone-600">
      {Icon && <Icon size={12} />}{children}
    </span>
  );
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending_payment;
  return (
    <span className="ff-body inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor:m.bg, color:m.fg }}>
      <m.icon size={11} /> {m.label}
    </span>
  );
}

function CapacityRing({ booked, capacity, color }) {
  const pct = Math.min(1, capacity ? booked / capacity : 0);
  const r = 22, c = 2 * Math.PI * r;
  const full = pct >= 1;
  return (
    <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
      <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#E3DFD3" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={full?"#B3261E":color}
          strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c*(1-pct)}
          style={{ transition:"stroke-dashoffset 0.4s ease" }} />
      </svg>
      <div className="absolute text-center leading-none">
        <div className="ff-body font-semibold text-xs" style={{ color:full?"#B3261E":INK }}>{Math.max(capacity-booked,0)}</div>
        <div className="ff-body text-[9px] text-stone-500">left</div>
      </div>
    </div>
  );
}

/* ---- AUTH SCREEN ---- */

function AuthScreen({ onAuth }) {
  const [mode, setMode]       = useState("register");
  const [form, setForm]       = useState({ name:"", email:"", phone:"", password:"", confirm:"" });
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  function f(k, v) { setForm(p => ({...p, [k]:v})); setError(""); }

  async function getUsers() {
    return (await storage.get("snb_users")) || [];
  }

  async function handleRegister() {
    if (!form.name.trim()) return setError("Please enter your full name.");
    if (!/\S+@\S+\.\S+/.test(form.email)) return setError("Please enter a valid email address.");
    if (form.phone.replace(/\D/g,"").length < 10) return setError("Please enter a valid mobile number.");
    if (form.password.length < 8)  return setError("Password must be at least 8 characters.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      const users = await getUsers();
      if (users.find(u => u.email.toLowerCase() === form.email.trim().toLowerCase()))
        return setError("An account with that email already exists — please sign in.");
      const passwordHash = await hashPassword(form.password);
      const user = { id:uid(), name:form.name.trim(), email:form.email.trim().toLowerCase(), phone:form.phone.trim(), passwordHash, createdAt:new Date().toISOString() };
      await storage.set("snb_users", [...users, user]);
      const session = { id:user.id, name:user.name, email:user.email, phone:user.phone };
      await storage.set("snb_session", session);
      onAuth(session);
    } catch { setError("Something went wrong — please try again."); }
    finally { setLoading(false); }
  }

  async function handleLogin() {
    if (!/\S+@\S+\.\S+/.test(form.email)) return setError("Please enter a valid email address.");
    if (!form.password) return setError("Please enter your password.");
    setLoading(true);
    try {
      const users = await getUsers();
      const user = users.find(u => u.email.toLowerCase() === form.email.trim().toLowerCase());
      if (!user) return setError("No account found with that email address.");
      const hash = await hashPassword(form.password);
      if (user.passwordHash !== hash) return setError("Incorrect password — please try again.");
      const session = { id:user.id, name:user.name, email:user.email, phone:user.phone };
      await storage.set("snb_session", session);
      onAuth(session);
    } catch { setError("Something went wrong — please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-4 py-10" style={{ backgroundColor:BG }}>
      <Fonts />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="ff-display text-3xl font-semibold" style={{ color:INK }}>{BRAND.name}</h1>
          <p className="ff-body text-sm text-stone-500 mt-1">{BRAND.tagline}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
          {/* mode toggle */}
          <div className="flex gap-1 bg-stone-100 rounded-full p-1 mb-6">
            {[["register","Create account"],["login","Sign in"]].map(([k,label]) => (
              <button key={k} onClick={() => { setMode(k); setError(""); setForm({name:"",email:"",phone:"",password:"",confirm:""}); }}
                className="ff-body flex-1 text-sm font-medium py-1.5 rounded-full transition"
                style={{ backgroundColor:mode===k?"#fff":"transparent", color:mode===k?INK:"#8A8478", boxShadow:mode===k?"0 1px 2px rgba(0,0,0,0.08)":"none" }}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-4">
            {mode === "register" && (
              <div>
                <label className="ff-body text-sm font-medium text-stone-700">Full name</label>
                <input value={form.name} onChange={e => f("name",e.target.value)}
                  className="ff-body mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  placeholder="Your full name" autoComplete="name" />
              </div>
            )}

            <div>
              <label className="ff-body text-sm font-medium text-stone-700">
                Email address{mode==="register" ? " — this is your username" : ""}
              </label>
              <input value={form.email} onChange={e => f("email",e.target.value)} type="email"
                className="ff-body mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                placeholder="you@example.com" autoComplete="email" />
            </div>

            {mode === "register" && (
              <div>
                <label className="ff-body text-sm font-medium text-stone-700">Mobile number</label>
                <input value={form.phone} onChange={e => f("phone",e.target.value)} type="tel"
                  className="ff-body mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  placeholder="07…" autoComplete="tel" />
              </div>
            )}

            <div>
              <label className="ff-body text-sm font-medium text-stone-700">Password</label>
              <div className="relative mt-1">
                <input value={form.password} onChange={e => f("password",e.target.value)}
                  type={showPw?"text":"password"}
                  className="ff-body w-full rounded-xl border border-stone-200 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2"
                  placeholder={mode==="register"?"At least 8 characters":"Your password"}
                  autoComplete={mode==="register"?"new-password":"current-password"}
                  onKeyDown={e => { if(e.key==="Enter" && mode==="login") handleLogin(); }} />
                <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            {mode === "register" && (
              <div>
                <label className="ff-body text-sm font-medium text-stone-700">Confirm password</label>
                <input value={form.confirm} onChange={e => f("confirm",e.target.value)}
                  type={showPw?"text":"password"}
                  className="ff-body mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  placeholder="Repeat password" autoComplete="new-password" />
              </div>
            )}

            {error && <div className="ff-body text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

            <button
              onClick={mode==="register" ? handleRegister : handleLogin}
              disabled={loading}
              className="ff-body inline-flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-full transition disabled:opacity-50"
              style={{ backgroundColor:TEAL, color:"#fff" }}>
              {loading ? <Loader2 size={15} className="animate-spin"/> : mode==="register" ? "Create my account" : "Sign in"}
              {!loading && <ArrowRight size={15}/>}
            </button>
          </div>
        </div>

        <p className="ff-body text-xs text-stone-400 text-center mt-4">
          Your details are stored securely and used only for booking management.
        </p>
      </div>
    </div>
  );
}

/* ---- CLASS CARD
   - No pricing shown
   - Capacity ring visible ONLY when spotsLeft ≤ 5 AND user is not already booked
   ---- */

function ClassCard({ cls, booked, onBook, isSignedUp }) {
  const Icon = ICONS[cls.icon] || Sparkles;
  const full = booked >= cls.capacity;
  const spotsLeft = Math.max(cls.capacity - booked, 0);
  const showRing = !isSignedUp && spotsLeft <= 5;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col gap-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor:cls.color+"1A" }}>
            <Icon size={20} style={{ color:cls.color }}/>
          </div>
          <div>
            <h3 className="ff-display text-lg font-semibold" style={{ color:INK }}>{cls.name}</h3>
            <p className="ff-body text-sm text-stone-500">{cls.tagline}</p>
          </div>
        </div>
        {showRing && <CapacityRing booked={booked} capacity={cls.capacity} color={cls.color}/>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Pill icon={Calendar}>{cls.day}</Pill>
        <Pill icon={Clock}>{cls.time}</Pill>
        {isSignedUp && <Pill icon={Check}><span style={{ color:TEAL }}>You're booked</span></Pill>}
      </div>

      <div className="flex items-center justify-end pt-2 border-t border-stone-100">
        <button onClick={() => onBook(cls)} disabled={full}
          className="ff-body inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor:full?"#E3DFD3":TEAL, color:full?"#8A8478":"#FFF" }}>
          {full ? "Full" : isSignedUp ? "Book again" : "Book"}{!full && <ArrowRight size={14}/>}
        </button>
      </div>
    </div>
  );
}

/* ---- RETREAT CARD — same capacity ring logic ---- */

function RetreatCard({ retreat, booked, onBook, isSignedUp }) {
  const full = booked >= retreat.capacity;
  const spotsLeft = Math.max(retreat.capacity - booked, 0);
  const showRing = !isSignedUp && spotsLeft <= 5;

  return (
    <div className="rounded-2xl p-6 flex flex-col gap-4 shadow-sm text-white relative overflow-hidden" style={{ backgroundColor:TEAL }}>
      <svg className="absolute inset-0 opacity-[0.07]" width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          <pattern id="lattice" width="34" height="34" patternUnits="userSpaceOnUse">
            <path d="M17 0 L34 17 L17 34 L0 17 Z" fill="none" stroke="white" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lattice)"/>
      </svg>

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <Pill icon={Sparkles}><span className="text-stone-600">Retreat</span></Pill>
          <h3 className="ff-display text-2xl font-semibold mt-2">{retreat.name}</h3>
        </div>
        {showRing && <CapacityRing booked={booked} capacity={retreat.capacity} color={GOLD}/>}
      </div>

      <div className="relative flex flex-wrap gap-2">
        <Pill icon={MapPin}><span className="text-stone-600">{retreat.location}</span></Pill>
        <Pill icon={Calendar}><span className="text-stone-600">{retreat.dates}</span></Pill>
        {isSignedUp && <Pill icon={Check}><span style={{ color:TEAL }}>You're booked</span></Pill>}
      </div>

      <div className="relative flex items-center justify-between pt-3 border-t border-white/15">
        <div className="ff-body text-sm text-white/85">
          <span className="font-semibold text-white">£{retreat.price}</span> total · £{retreat.deposit} deposit to secure
        </div>
        <button onClick={() => onBook(retreat)} disabled={full}
          className="ff-body inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full transition disabled:opacity-50"
          style={{ backgroundColor:full?"rgba(255,255,255,0.2)":GOLD, color:full?"#fff":INK }}>
          {full ? "Full" : "Reserve a spot"}{!full && <ArrowRight size={14}/>}
        </button>
      </div>
    </div>
  );
}

/* ---- BOOKING MODAL
   - Details pre-filled from logged-in user
   - 2 membership tiers only
   - PAYG £7.50
   - 5-minute hold (not 30)
   ---- */

function BookingModal({ session, type, currentUser, onClose, onConfirm }) {
  const [step, setStep] = useState(1);
  const [plan, setPlan]      = useState(type==="class" ? "payg" : "deposit");
  const [activities, setAct] = useState(1);
  const [saving, setSaving]  = useState(false);
  const [paymentUrl, setPUrl]= useState("");
  const [error, setError]    = useState("");

  const amount = type==="class"
    ? (plan==="payg" ? PAYG_PRICE : MEMBERSHIP_TIERS.find(t=>t.activities===activities)?.price)
    : (plan==="deposit" ? session.deposit : session.price);

  async function handleConfirm() {
    setSaving(true); setError("");
    try {
      const url = type==="class"
        ? (plan==="payg" ? STRIPE_LINKS.payg : STRIPE_LINKS.membership[activities])
        : (plan==="deposit" ? STRIPE_LINKS.retreatDeposit[session.id] : STRIPE_LINKS.retreatFull[session.id]);

      await onConfirm({
        id: uid(), sessionId: session.id, sessionName: session.name, type,
        userId: currentUser.id, name: currentUser.name,
        email: currentUser.email, phone: currentUser.phone,
        plan: type==="class"
          ? (plan==="payg" ? "Pay as you go" : `Membership — ${activities} class${activities>1?"es":""}`)
          : (plan==="deposit" ? "Deposit" : "Paid in full"),
        amount, status: "pending_payment", createdAt: new Date().toISOString(),
      });
      setPUrl(url); setStep(2);
    } catch { setError("Couldn't save your booking — please try again."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="ff-body bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-stone-100">
          {step > 1 && step < 2
            ? <button onClick={() => setStep(s=>s-1)} className="text-stone-400"><ChevronLeft size={20}/></button>
            : <div className="w-5"/>}
          <h4 className="font-semibold text-sm text-stone-700">{session.name}</h4>
          <button onClick={onClose} className="text-stone-400"><X size={20}/></button>
        </div>

        <div className="p-5">
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
                Booking as <span className="font-semibold">{currentUser.name}</span> ({currentUser.email})
              </div>

              {type==="class" ? (<>
                <label className="text-sm font-medium text-stone-700">How would you like to pay?</label>
                <button onClick={() => setPlan("payg")} className="text-left rounded-xl border-2 p-3.5 transition"
                  style={{ borderColor:plan==="payg"?TEAL:"#E7E2D5" }}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Pay as you go</span>
                    {plan==="payg" && <Check size={16} style={{ color:TEAL }}/>}
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">£{PAYG_PRICE.toFixed(2)} for this single session</p>
                </button>
                <button onClick={() => setPlan("membership")} className="text-left rounded-xl border-2 p-3.5 transition"
                  style={{ borderColor:plan==="membership"?TEAL:"#E7E2D5" }}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Monthly membership</span>
                    {plan==="membership" && <Check size={16} style={{ color:TEAL }}/>}
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">£26/month for 1 class · £45/month for 2 classes</p>
                </button>
                {plan==="membership" && (
                  <div className="grid grid-cols-2 gap-2 pl-1">
                    {MEMBERSHIP_TIERS.map(t => (
                      <button key={t.activities} onClick={() => setAct(t.activities)}
                        className="rounded-lg border px-3 py-2 text-xs font-medium text-left transition"
                        style={{ borderColor:activities===t.activities?GOLD:"#E7E2D5", backgroundColor:activities===t.activities?"#FBF3E3":"#fff" }}>
                        {t.activities} class{t.activities>1?"es":""}<br/>
                        <span className="font-semibold">£{t.price}/mo</span>
                      </button>
                    ))}
                  </div>
                )}
              </>) : (<>
                <label className="text-sm font-medium text-stone-700">How would you like to pay?</label>
                <button onClick={() => setPlan("deposit")} className="text-left rounded-xl border-2 p-3.5 transition"
                  style={{ borderColor:plan==="deposit"?TEAL:"#E7E2D5" }}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Pay deposit now</span>
                    {plan==="deposit" && <Check size={16} style={{ color:TEAL }}/>}
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">£{session.deposit} now — balance due closer to the date</p>
                </button>
                <button onClick={() => setPlan("full")} className="text-left rounded-xl border-2 p-3.5 transition"
                  style={{ borderColor:plan==="full"?TEAL:"#E7E2D5" }}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Pay in full</span>
                    {plan==="full" && <Check size={16} style={{ color:TEAL }}/>}
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">£{session.price} total, nothing more to pay</p>
                </button>
              </>)}

              <div className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3 mt-1">
                <span className="text-sm text-stone-600">Due now</span>
                <span className="font-semibold text-base" style={{ color:INK }}>
                  £{typeof amount==="number" ? amount.toFixed(2) : amount}
                </span>
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <button onClick={handleConfirm} disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 font-semibold text-sm py-3 rounded-full transition"
                style={{ backgroundColor:TEAL, color:"#fff" }}>
                {saving ? <Loader2 size={15} className="animate-spin"/> : <>Hold my spot <ArrowRight size={15}/></>}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor:"#E9F1EC" }}>
                <ShieldCheck size={24} style={{ color:TEAL }}/>
              </div>
              <h4 className="ff-display text-lg font-semibold" style={{ color:INK }}>Your spot is held</h4>
              <p className="text-sm text-stone-500 leading-relaxed">
                We've reserved your place for <strong>5 minutes</strong>. Complete payment securely on Stripe to confirm it — your spot is released if payment isn't completed in time.
              </p>
              <a href={paymentUrl} target="_blank" rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-1.5 font-semibold text-sm py-3 rounded-full mt-2"
                style={{ backgroundColor:GOLD, color:INK }}>
                Continue to secure payment <ArrowUpRight size={15}/>
              </a>
              <button onClick={onClose} className="text-xs text-stone-400 mt-1 underline">Close — I'll pay later</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- MY BOOKINGS ---- */

function MyBookings({ bookings, currentUser }) {
  const mine = bookings.filter(b => b.userId===currentUser.id || b.email===currentUser.email);
  return (
    <div className="max-w-md mx-auto flex flex-col gap-3">
      {mine.length===0
        ? <p className="text-sm text-stone-500 text-center py-12">You don't have any bookings yet.</p>
        : mine.slice().reverse().map(b => (
          <div key={b.id} className="bg-white rounded-xl border border-stone-200 p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{b.sessionName}</span>
              <StatusBadge status={b.status}/>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              {b.plan} · £{typeof b.amount==="number" ? b.amount.toFixed(2) : b.amount}
            </p>
          </div>
        ))
      }
    </div>
  );
}

/* ---- ADMIN PASSCODE GATE ---- */

function AdminPasscodeGate({ onUnlock, onClose }) {
  const [value, setValue] = useState("");
  const [err, setErr]     = useState(false);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="ff-body bg-white rounded-2xl w-full max-w-xs p-6 flex flex-col items-center gap-3 text-center">
        <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor:"#E9F1EC" }}>
          <Lock size={18} style={{ color:TEAL }}/>
        </div>
        <h4 className="ff-display font-semibold" style={{ color:INK }}>Admin access</h4>
        <p className="text-xs text-stone-500 -mt-1">Prototype passcode — not real security.</p>
        <input type="password" value={value} autoFocus
          onChange={e => { setValue(e.target.value); setErr(false); }}
          onKeyDown={e => e.key==="Enter" && (value===ADMIN_PASSCODE ? onUnlock() : setErr(true))}
          className="w-full text-center rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none"
          placeholder="Passcode"/>
        {err && <p className="text-xs text-red-600">Incorrect passcode.</p>}
        <div className="flex gap-2 w-full mt-1">
          <button onClick={onClose} className="flex-1 text-sm font-medium py-2.5 rounded-full border border-stone-200 text-stone-600">Cancel</button>
          <button onClick={() => value===ADMIN_PASSCODE ? onUnlock() : setErr(true)}
            className="flex-1 text-sm font-semibold py-2.5 rounded-full" style={{ backgroundColor:TEAL, color:"#fff" }}>
            Unlock
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- ADMIN DASHBOARD ---- */

function AdminDashboard({ bookings, onMarkPaid, onMarkPending, onCancel, onRestore, onClose }) {
  const [statusFilter, setFilter] = useState("all");
  const [query, setQuery]         = useState("");

  const filtered = bookings.filter(b => {
    if (statusFilter!=="all" && b.status!==statusFilter) return false;
    if (query && !(`${b.name} ${b.email} ${b.sessionName}`.toLowerCase().includes(query.toLowerCase()))) return false;
    return true;
  }).slice().reverse();

  const active       = bookings.filter(b => b.status!=="cancelled");
  const totalPaid    = active.filter(b=>b.status==="paid").reduce((s,b)=>s+Number(b.amount||0),0);
  const totalPending = active.filter(b=>b.status==="pending_payment").reduce((s,b)=>s+Number(b.amount||0),0);
  const classCount   = active.filter(b=>b.type==="class").length;
  const retreatCount = active.filter(b=>b.type==="retreat").length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2 sm:p-4">
      <div className="ff-body bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-stone-100 z-10">
          <h4 className="ff-display text-lg font-semibold flex items-center gap-2" style={{ color:INK }}>
            <LayoutDashboard size={18}/> Admin dashboard
          </h4>
          <button onClick={onClose}><X size={20} className="text-stone-400"/></button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          <div className="ff-body flex items-start gap-2 text-xs rounded-xl px-3.5 py-2.5" style={{ backgroundColor:"#FBF3E3", color:"#7A5C20" }}>
            <Info size={13} className="mt-0.5 shrink-0"/>
            <p>Mark bookings as "Paid" once payment appears in your Stripe dashboard. Stripe webhooks will automate this in the live version.</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label:"Confirmed revenue",  val:`£${totalPaid.toFixed(2)}`,    fg:TEAL },
              { label:"Awaiting payment",   val:`£${totalPending.toFixed(2)}`, fg:"#9A7426" },
              { label:"Class bookings",     val:classCount,                    fg:INK },
              { label:"Retreat bookings",   val:retreatCount,                  fg:INK },
            ].map(c => (
              <div key={c.label} className="rounded-xl border border-stone-200 p-3.5">
                <p className="text-xs text-stone-500">{c.label}</p>
                <p className="ff-display text-xl font-semibold" style={{ color:c.fg }}>{c.val}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex gap-1.5 flex-wrap">
              {["all","paid","pending_payment","cancelled"].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className="text-xs font-medium px-3 py-1.5 rounded-full transition"
                  style={{ backgroundColor:statusFilter===s?TEAL:"#F3F1EA", color:statusFilter===s?"#fff":"#6B6457" }}>
                  {s==="all" ? "All" : STATUS_META[s].label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"/>
                <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, email, class…"
                  className="rounded-full border border-stone-200 pl-8 pr-3 py-1.5 text-xs w-44 sm:w-56 focus:outline-none"/>
              </div>
              <button onClick={() => exportCSV(bookings)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-stone-200 text-stone-600 hover:bg-stone-50">
                <Download size={13}/> Export CSV
              </button>
            </div>
          </div>

          {filtered.length===0
            ? <p className="text-sm text-stone-500 py-10 text-center">No bookings match this filter.</p>
            : <div className="flex flex-col gap-2">
                {filtered.map(b => (
                  <div key={b.id} className="flex flex-wrap items-center gap-3 border border-stone-100 rounded-xl px-3.5 py-3">
                    <div className="min-w-[140px] flex-1">
                      <p className="font-medium text-sm">{b.name}</p>
                      <p className="text-xs text-stone-400">{b.email}{b.phone ? ` · ${b.phone}` : ""}</p>
                    </div>
                    <div className="min-w-[140px] flex-1">
                      <p className="text-sm font-medium">{b.sessionName}</p>
                      <p className="text-xs text-stone-400">{b.plan}</p>
                    </div>
                    <div className="text-sm font-semibold w-16 text-right">
                      £{typeof b.amount==="number" ? b.amount.toFixed(2) : b.amount}
                    </div>
                    <StatusBadge status={b.status}/>
                    <div className="flex gap-1.5 ml-auto">
                      {b.status==="pending_payment" && (
                        <button onClick={() => onMarkPaid(b.id)} title="Mark paid" className="p-1.5 rounded-lg hover:bg-stone-100" style={{ color:TEAL }}><Check size={15}/></button>
                      )}
                      {b.status==="paid" && (
                        <button onClick={() => onMarkPending(b.id)} title="Mark awaiting" className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400"><Undo2 size={15}/></button>
                      )}
                      {b.status!=="cancelled"
                        ? <button onClick={() => onCancel(b.id)} title="Cancel" className="p-1.5 rounded-lg hover:bg-stone-100 text-red-500"><Ban size={15}/></button>
                        : <button onClick={() => onRestore(b.id)} title="Restore" className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400"><RotateCcw size={15}/></button>
                      }
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  );
}

/* ---- MAIN APP ---- */

export default function BookingApp() {
  const [currentUser, setCurrentUser]       = useState(null);
  const [authLoading, setAuthLoading]       = useState(true);
  const [tab, setTab]                       = useState("classes");
  const [bookings, setBookings]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [modalSession, setModalSession]     = useState(null);
  const [modalType, setModalType]           = useState(null);
  const [showAdminGate, setShowAdminGate]   = useState(false);
  const [adminUnlocked, setAdminUnlocked]   = useState(false);
  const [adminOpen, setAdminOpen]           = useState(false);
  const [showBanner, setShowBanner]         = useState(true);

  // Restore session on load
  useEffect(() => {
    (async () => {
      const s = await storage.get("snb_session");
      if (s) setCurrentUser(s);
      setAuthLoading(false);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let b = [];
      b = (await storage.get("bookings")) || [];
      setBookings(b);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (currentUser) load(); }, [currentUser, load]);

  function bookedCount(id) {
    return bookings.filter(b => b.sessionId===id && b.status!=="cancelled").length;
  }
  function isUserBooked(id) {
    if (!currentUser) return false;
    return bookings.some(b => b.sessionId===id && b.status!=="cancelled"
      && (b.userId===currentUser.id || b.email===currentUser.email));
  }

  async function persist(next) { setBookings(next); await storage.set("bookings", next); }
  async function handleConfirmBooking(r) { await persist([...bookings, r]); }
  async function updateStatus(id, s)     { await persist(bookings.map(b => b.id===id ? {...b, status:s} : b)); }
  async function handleSignOut()         {
    await storage.remove("snb_session");
    setCurrentUser(null); setBookings([]);
  }
  async function resetDemo()             { await persist([]); }

  // Loading spinner while checking session
  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor:BG }}>
      <Fonts/><Loader2 className="animate-spin text-stone-400"/>
    </div>
  );

  // Not logged in — show registration / login
  if (!currentUser) return <AuthScreen onAuth={s => { setCurrentUser(s); }}/>;

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor:BG }}>
      <Fonts/>

      <header className="sticky top-0 z-30 backdrop-blur bg-white/85 border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="shrink-0">
            <h1 className="ff-display text-lg font-semibold" style={{ color:INK }}>{BRAND.name}</h1>
            <p className="ff-body text-xs text-stone-500">{BRAND.tagline}</p>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex gap-1 bg-stone-100 rounded-full p-1">
              {[["classes","Classes"],["retreats","Retreats"],["bookings","My bookings"]].map(([k,label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className="ff-body text-sm font-medium px-3.5 py-1.5 rounded-full transition"
                  style={{ backgroundColor:tab===k?"#fff":"transparent", color:tab===k?INK:"#8A8478", boxShadow:tab===k?"0 1px 2px rgba(0,0,0,0.08)":"none" }}>
                  {label}
                </button>
              ))}
            </nav>
            <button onClick={handleSignOut} title="Sign out"
              className="p-2 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-100">
              <LogOut size={16}/>
            </button>
          </div>
        </div>
      </header>

      {showBanner && (
        <div className="max-w-3xl mx-auto px-4 pt-4">
          <div className="ff-body flex items-start gap-2.5 text-xs rounded-xl px-4 py-3" style={{ backgroundColor:"#FBF3E3", color:"#7A5C20" }}>
            <Info size={15} className="mt-0.5 shrink-0"/>
            <p className="flex-1">
              Hi {currentUser.name.split(" ")[0]}! This is a working prototype — bookings save for real and count against capacity. Wire up your Stripe Payment Links before going live.
            </p>
            <button onClick={() => setShowBanner(false)}><X size={14}/></button>
          </div>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-6">
        {loading
          ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-stone-400"/></div>
          : tab==="classes"
            ? <div className="grid sm:grid-cols-2 gap-4">
                {DEFAULT_CLASSES.map(cls => (
                  <ClassCard key={cls.id} cls={cls} booked={bookedCount(cls.id)}
                    isSignedUp={isUserBooked(cls.id)}
                    onBook={() => { setModalSession(cls); setModalType("class"); }}/>
                ))}
              </div>
            : tab==="retreats"
              ? <div className="flex flex-col gap-4">
                  {DEFAULT_RETREATS.map(r => (
                    <RetreatCard key={r.id} retreat={r} booked={bookedCount(r.id)}
                      isSignedUp={isUserBooked(r.id)}
                      onBook={() => { setModalSession(r); setModalType("retreat"); }}/>
                  ))}
                </div>
              : <MyBookings bookings={bookings} currentUser={currentUser}/>
        }
      </main>

      <footer className="max-w-3xl mx-auto px-4 py-8 flex items-center justify-between text-xs text-stone-400">
        <button onClick={() => adminUnlocked ? setAdminOpen(true) : setShowAdminGate(true)}
          className="inline-flex items-center gap-1 underline hover:text-stone-600">
          <Lock size={12}/> Admin dashboard
        </button>
        <button onClick={resetDemo} className="inline-flex items-center gap-1 hover:text-stone-600">
          <RotateCcw size={12}/> Reset demo bookings
        </button>
      </footer>

      {modalSession && (
        <BookingModal session={modalSession} type={modalType} currentUser={currentUser}
          onClose={() => setModalSession(null)} onConfirm={handleConfirmBooking}/>
      )}
      {showAdminGate && (
        <AdminPasscodeGate
          onUnlock={() => { setAdminUnlocked(true); setShowAdminGate(false); setAdminOpen(true); }}
          onClose={() => setShowAdminGate(false)}/>
      )}
      {adminOpen && (
        <AdminDashboard bookings={bookings}
          onMarkPaid={id => updateStatus(id,"paid")}
          onMarkPending={id => updateStatus(id,"pending_payment")}
          onCancel={id => updateStatus(id,"cancelled")}
          onRestore={id => updateStatus(id,"pending_payment")}
          onClose={() => setAdminOpen(false)}/>
      )}
    </div>
  );
}
