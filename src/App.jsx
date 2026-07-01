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

// ── TASTER MODE ───────────────────────────────────────────────────────
// true  = simple "Book taster" flow, no pricing or payments shown
// false = full booking with PAYG / membership / Stripe payment
// Change this one line to switch between the two modes.
const TASTER_MODE = true;

/* ===================================================================== */

const INK  = "#1B2B26";
const TEAL = "#1F4A42";
const GOLD = "#C99A4B";
const BG   = "#F5F3EC";

const ICONS = { music: Music2, flame: Flame, flower: Flower2, dumbbell: Dumbbell };
const LOGO  = "data:image/png;base64,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";

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
          <img src={LOGO} alt="SNB Hive" className="h-24 mx-auto mb-2" style={{ mixBlendMode:"multiply" }} />
          <p className="ff-body text-sm text-stone-500">{BRAND.tagline}</p>
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

function ClassCard({ cls, booked, onBook, bookingType }) {
  const Icon = ICONS[cls.icon] || Sparkles;
  const full = booked >= cls.capacity;
  const spotsLeft = Math.max(cls.capacity - booked, 0);
  const isMember  = bookingType === "membership";
  const isPayg    = bookingType === "payg";
  const isBooked  = !!bookingType;
  const showRing  = !isBooked && spotsLeft <= 5;
  const disabled  = full || isMember;

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
        {isMember && <Pill icon={Check}><span style={{ color:TEAL }}>Member</span></Pill>}
        {isPayg   && <Pill icon={Check}><span style={{ color:TEAL }}>Attended</span></Pill>}
      </div>

      <div className="flex items-center justify-end pt-2 border-t border-stone-100">
        <button onClick={() => onBook(cls)} disabled={disabled}
          className="ff-body inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full transition disabled:cursor-not-allowed"
          style={{ backgroundColor:disabled?"#E3DFD3":TEAL, color:disabled?"#8A8478":"#FFF", opacity: disabled ? 0.7 : 1 }}>
          {full ? "Full" : isMember ? "Booked" : TASTER_MODE ? "Book taster" : "Book"}{!disabled && <ArrowRight size={14}/>}
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
  const [step, setStep]           = useState(1);
  const [plan, setPlan]           = useState(type==="class" ? "payg" : "deposit");
  const [activities, setAct]      = useState(1);
  const [selectedClasses, setSel] = useState([session.id]);
  const [saving, setSaving]       = useState(false);
  const [paymentUrl, setPUrl]     = useState("");
  const [error, setError]         = useState("");

  function toggleClass(id) {
    if (id === session.id) return; // primary class always stays selected
    setSel(prev => prev.includes(id)
      ? prev.filter(x => x !== id)
      : prev.length < activities ? [...prev, id] : prev
    );
  }

  // Reset selected classes when activity count changes
  function changeActivities(n) {
    setAct(n);
    setSel([session.id]); // keep primary, clear extras
  }

  const needsClassPicker = plan === "membership" && activities === 2;
  const pickerReady      = !needsClassPicker || selectedClasses.length === 2;

  const amount = type==="class"
    ? (plan==="payg" ? PAYG_PRICE : MEMBERSHIP_TIERS.find(t=>t.activities===activities)?.price)
    : (plan==="deposit" ? session.deposit : session.price);

  async function handleConfirm() {
    // ── TASTER MODE — no payment, instant confirmation ──
    if (TASTER_MODE) {
      setSaving(true); setError("");
      try {
        await onConfirm({
          id: uid(), sessionId: session.id, sessionName: session.name, type,
          userId: currentUser.id, name: currentUser.name,
          email: currentUser.email, phone: currentUser.phone,
          plan: "Taster", amount: 0,
          status: "confirmed", createdAt: new Date().toISOString(),
        });
        setStep(2);
      } catch { setError("Couldn't save your booking — please try again."); }
      finally { setSaving(false); }
      return;
    }

    // ── FULL BOOKING MODE ──────────────────────────────────────────────
    if (needsClassPicker && selectedClasses.length < 2) {
      return setError("Please choose your second class before continuing.");
    }
    setSaving(true); setError("");
    try {
      const url = type==="class"
        ? (plan==="payg" ? STRIPE_LINKS.payg : STRIPE_LINKS.membership[activities])
        : (plan==="deposit" ? STRIPE_LINKS.retreatDeposit[session.id] : STRIPE_LINKS.retreatFull[session.id]);

      const planLabel = type==="class"
        ? (plan==="payg" ? "Pay as you go" : `Membership — ${activities} class${activities>1?"es":""}`)
        : (plan==="deposit" ? "Deposit" : "Paid in full");

      const base = {
        type, userId: currentUser.id, name: currentUser.name,
        email: currentUser.email, phone: currentUser.phone,
        plan: planLabel, status: "pending_payment", createdAt: new Date().toISOString(),
      };

      if (plan === "membership" && activities === 2) {
        const classes = DEFAULT_CLASSES.filter(c => selectedClasses.includes(c.id));
        for (let i = 0; i < classes.length; i++) {
          const cls = classes[i];
          await onConfirm({
            ...base, id: uid(),
            sessionId: cls.id, sessionName: cls.name,
            amount: cls.id === session.id ? amount : 0,
          });
        }
      } else {
        await onConfirm({
          ...base, id: uid(),
          sessionId: session.id, sessionName: session.name,
          amount,
        });
      }

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
          {step === 1 && TASTER_MODE && type==="class" && (
            <div className="flex flex-col gap-5">
              <div className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
                Booking as <span className="font-semibold">{currentUser.name}</span> ({currentUser.email})
              </div>
              <div className="rounded-xl border border-stone-100 p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: (ICONS[DEFAULT_CLASSES.find(c=>c.id===session.id)?.icon] ? DEFAULT_CLASSES.find(c=>c.id===session.id)?.color : TEAL) + "1A" }}>
                  <Sparkles size={16} style={{ color: TEAL }}/>
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color:INK }}>{session.name}</p>
                  <p className="text-xs text-stone-500 mt-0.5">{session.day} · {session.time}</p>
                  <p className="text-xs text-stone-400 mt-1">Free taster session — come and give it a try</p>
                </div>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button onClick={handleConfirm} disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 font-semibold text-sm py-3 rounded-full transition"
                style={{ backgroundColor:TEAL, color:"#fff" }}>
                {saving ? <Loader2 size={15} className="animate-spin"/> : <>Confirm taster booking <Check size={15}/></>}
              </button>
            </div>
          )}

          {step === 1 && !TASTER_MODE && (
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
                {plan==="membership" && (<>
                  <div className="grid grid-cols-2 gap-2 pl-1">
                    {MEMBERSHIP_TIERS.map(t => (
                      <button key={t.activities} onClick={() => changeActivities(t.activities)}
                        className="rounded-lg border px-3 py-2 text-xs font-medium text-left transition"
                        style={{ borderColor:activities===t.activities?GOLD:"#E7E2D5", backgroundColor:activities===t.activities?"#FBF3E3":"#fff" }}>
                        {t.activities} class{t.activities>1?"es":""}<br/>
                        <span className="font-semibold">£{t.price}/mo</span>
                      </button>
                    ))}
                  </div>

                  {activities === 2 && (
                    <div className="rounded-xl border border-stone-200 p-3.5">
                      <p className="text-xs font-semibold text-stone-700 mb-2.5">
                        Choose your 2 classes — pick one more to go with <strong>{session.name}</strong>
                      </p>
                      <div className="flex flex-col gap-2">
                        {DEFAULT_CLASSES.map(cls => {
                          const isPrimary  = cls.id === session.id;
                          const isSelected = selectedClasses.includes(cls.id);
                          return (
                            <button key={cls.id} onClick={() => toggleClass(cls.id)}
                              disabled={isPrimary}
                              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-left transition disabled:cursor-default"
                              style={{
                                backgroundColor: isSelected ? "#E9F1EC" : "#F8F7F4",
                                border: `1.5px solid ${isSelected ? TEAL : "#E3DFD3"}`,
                              }}>
                              <div className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                                style={{ backgroundColor: isSelected ? TEAL : "#E3DFD3" }}>
                                {isSelected && <Check size={12} color="white"/>}
                              </div>
                              <div className="flex-1">
                                <span className="font-medium" style={{ color: INK }}>{cls.name}</span>
                                <span className="text-stone-400 text-xs"> · {cls.day}</span>
                              </div>
                              {isPrimary && <span className="text-xs text-stone-400">Current</span>}
                            </button>
                          );
                        })}
                      </div>
                      {selectedClasses.length < 2 && (
                        <p className="text-xs text-amber-600 mt-2">Select 1 more class to continue</p>
                      )}
                    </div>
                  )}
                </>)}
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

          {step === 2 && TASTER_MODE && (
            <div className="flex flex-col items-center text-center gap-4 py-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor:"#E9F1EC" }}>
                <Check size={26} style={{ color:TEAL }}/>
              </div>
              <div>
                <h4 className="ff-display text-xl font-semibold" style={{ color:INK }}>Taster booked!</h4>
                <p className="ff-body text-sm text-stone-500 mt-1">
                  You're coming to <strong>{session.name}</strong>
                </p>
              </div>
              <div className="w-full rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600 text-left">
                <p><span className="font-medium">Session:</span> {session.name}</p>
                <p className="mt-1"><span className="font-medium">When:</span> {session.day} · {session.time}</p>
                <p className="mt-1"><span className="font-medium">Name:</span> {currentUser.name}</p>
              </div>
              <p className="text-xs text-stone-400">We'll be in touch with everything you need to know before your first session.</p>
              <button onClick={onClose}
                className="w-full inline-flex items-center justify-center font-semibold text-sm py-3 rounded-full"
                style={{ backgroundColor:TEAL, color:"#fff" }}>
                Great, see you there!
              </button>
            </div>
          )}

          {step === 2 && !TASTER_MODE && (
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
  function getUserBookingType(id) {
    if (!currentUser) return null;
    const b = bookings.find(b => b.sessionId===id && b.status!=="cancelled"
      && (b.userId===currentUser.id || b.email===currentUser.email));
    if (!b) return null;
    return (b.plan || "").toLowerCase().includes("membership") ? "membership" : "payg";
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
          <div className="shrink-0 flex items-center gap-2">
            <img src={LOGO} alt="SNB Hive" className="h-11" style={{ mixBlendMode:"multiply" }} />
            <p className="ff-body text-xs text-stone-500 hidden sm:block">{BRAND.tagline}</p>
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
                    bookingType={getUserBookingType(cls.id)}
                    onBook={() => { setModalSession(cls); setModalType("class"); }}/>
                ))}
              </div>
            : tab==="retreats"
              ? <div className="flex flex-col gap-4">
                  {DEFAULT_RETREATS.map(r => (
                    <RetreatCard key={r.id} retreat={r} booked={bookedCount(r.id)}
                      isSignedUp={!!getUserBookingType(r.id)}
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
