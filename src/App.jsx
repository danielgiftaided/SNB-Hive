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
  { id: "zumba",    name: "Zumba",                  tagline: "High-energy dance cardio",  day: "Monday",    time: "6:30–7:30pm", capacity: 20, icon: "music",   color: "#C99A4B", venue: "6 Dispensary Lane, London E8 1FT",                          venueMap: "https://www.google.com/maps/search/?api=1&query=6+Dispensary+Lane+London+E8+1FT" },
  { id: "boxing",   name: "Boxing",                  tagline: "Pad work & conditioning",   day: "Tuesday",   time: "7:00–8:00pm", capacity: 20, icon: "flame",   color: "#9B5B45", venue: "SCK Fitness, 439 High Road, Leyton, London E10 5EL",         venueMap: "https://www.google.com/maps/search/?api=1&query=SCK+Fitness+439+High+Road+Leyton+London+E10+5EL" },
  { id: "somatic",  name: "Somatic",                 tagline: "Move, breathe, reconnect",  day: "Wednesday", time: "6:00–7:00pm", capacity: 20, icon: "flower",  color: "#7C9885", venue: "6 Dispensary Lane, London E8 1FT",                          venueMap: "https://www.google.com/maps/search/?api=1&query=6+Dispensary+Lane+London+E8+1FT" },
  { id: "strength", name: "Strength & Conditioning", tagline: "Build strength, build power",day: "Thursday",  time: "7:00–8:00pm", capacity: 20, icon: "dumbbell",color: "#1F4A42", venue: "SCK Fitness, 439 High Road, Leyton, London E10 5EL",         venueMap: "https://www.google.com/maps/search/?api=1&query=SCK+Fitness+439+High+Road+Leyton+London+E10+5EL" },
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
          <img src={LOGO} alt="SNB Hive" className="h-24 mx-auto mb-2" />
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
      </div>

      {cls.venue && (
        <a href={cls.venueMap} target="_blank" rel="noopener noreferrer"
          className="ff-body inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 transition -mt-1">
          <MapPin size={11}/> {cls.venue}
        </a>
      )}

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
                {session.venue && (
                  <p className="mt-1">
                    <span className="font-medium">Venue:</span>{" "}
                    <a href={session.venueMap} target="_blank" rel="noopener noreferrer"
                      className="underline hover:text-stone-800">{session.venue}</a>
                  </p>
                )}
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
            <img src={LOGO} alt="SNB Hive" className="h-11" />
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
