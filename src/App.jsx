import { useState, useEffect, useCallback, useRef } from "react";
import {
  Calendar, MapPin, Clock, Check, X, ArrowRight, ChevronLeft,
  Loader2, Sparkles, RotateCcw, Music2, Flame, Dumbbell, Flower2,
  ShieldCheck, Search, ArrowUpRight, Lock, Download, Eye, EyeOff, LogOut,
  Banknote, Hourglass, Ban, Undo2, LayoutDashboard, Mail, Send, Bell
} from "lucide-react";
import storage from "./storage.js";

/* =====================================================================
   CONFIG — edit these to customise the app.
   Swap STRIPE_LINKS values for your real Stripe Payment Link URLs.
   Change ADMIN_PASSCODE before sharing with anyone.
   ===================================================================== */

const BRAND = {
  name: "SNB Hive",
  tagline: "Women's Fitness and Wellness Classes & Retreats",
};

const DEFAULT_CLASSES = [
  { id:"zumba",    name:"Zumba",                  tagline:"High-energy dance cardio",  day:"Fri 10 Jul", time:"12:00–12:45pm", capacity:20, icon:"music",   color:"#C99A4B",
    venue:"6 Dispensary Lane, London E8 1FT",              venueMap:"https://www.google.com/maps/search/?api=1&query=6+Dispensary+Lane+London+E8+1FT",
    whatToBring:"Wear comfortable clothes and grip socks", icsStart:"20260710T110000Z", icsEnd:"20260710T114500Z", description:"Zumba is about much more than fitness. It's about community, confidence, and feeling good. Dance has been shown to support memory, coordination, and emotional wellbeing, and music and dance can help get through some of the most challenging times in life.\n\nIt has the power to bring people together, lift spirits, and remind us that exercise doesn't have to feel like a chore — it can be something you genuinely look forward to.\n\nZumba is based on repetitive movements throughout each song, so you don't need to be an experienced dancer or technically advanced to join in. It's all about having fun while getting fit.\n\nThe routines are repeated for about 6 weeks, which allows people to learn the moves and build their confidence and then new routines are introduced gradually over time. That repetition helps build confidence because your body begins to associate the movements with the music, allowing you to learn naturally without pressure. It's a welcoming, supportive environment." },
  { id:"boxing",   name:"Boxing",                  tagline:"Pad work, Co-ordination",   day:"Mon 6 Jul",  time:"1:30–2:30pm", capacity:20, icon:"flame",   color:"#9B5B45",
    venue:"SCK Fitness, 439 High Road, Leyton, London E10 5EL", venueMap:"https://www.google.com/maps/search/?api=1&query=SCK+Fitness+439+High+Road+Leyton+London+E10+5EL",
    whatToBring:"Wear comfortable workout clothes and trainers. Bring a water bottle", icsStart:"20260706T123000Z", icsEnd:"20260706T133000Z", description:"Boxing is one of the most effective full-body workouts, combining cardiovascular fitness, strength, coordination and stress relief in a fun and empowering way.\n\nThis class is not about fighting or competition. Instead, it uses boxing drills, pad work and fitness exercises to help women improve their health, build confidence and enjoy movement in a supportive environment.\n\nBenefits include:\n• Increased calorie burn and support with weight loss goals\n• Improved cardiovascular fitness and stamina\n• Increased confidence and self-belief\n• A healthy outlet for stress and frustration\n• Improved coordination and balance\n• Stronger core and full-body conditioning\n• Improved mood and mental wellbeing\n\nMany women find boxing incredibly empowering because it allows them to release stress, develop resilience and discover strengths they never knew they had.\n\nSuitable for beginners and all fitness levels." },
  { id:"somatic",  name:"Somatic",                 tagline:"Move, breathe, reconnect",  day:"Thu 9 Jul",  time:"1:30–2:30pm", capacity:20, icon:"flower",  color:"#7C9885",
    venue:"6 Dispensary Lane, London E8 1FT",              venueMap:"https://www.google.com/maps/search/?api=1&query=6+Dispensary+Lane+London+E8+1FT",
    whatToBring:"Loose comfortable clothing and grip socks. Bring a water bottle.", icsStart:"20260709T123000Z", icsEnd:"20260709T133000Z", description:"Modern life places enormous demands on women. Many spend their days caring for others, managing households, working, raising children and carrying responsibilities that leave little time for themselves.\n\nThis class offers a gentle opportunity to slow down, reconnect with the body and create space for rest, reflection and renewal.\n\nThrough gentle movement, stretching, breathing exercises and guided relaxation, participants are supported in releasing physical tension and calming the nervous system.\n\nBenefits include:\n• Reduced stress and feelings of overwhelm\n• Improved sleep quality\n• Relief from physical tension and tightness\n• Improved body awareness\n• Support for emotional wellbeing\n• A greater sense of calm and balance\n• Time to pause and reconnect with oneself\n• Improved ability to manage the demands of everyday life\n\nSessions may also include gentle reminders around gratitude, self-care, reflection and caring for the body.\n\nFor many women, this class becomes a rare opportunity to simply pause, breathe and be present without expectation or pressure.\n\nSuitable for all ages, abilities and fitness levels.\n\nBecause when women are supported, strengthened and given space to care for themselves, they are better able to care for those around them." },
  { id:"strength", name:"Strength & Conditioning", tagline:"Build strength, build power", day:"Wed 8 Jul",  time:"1:30–2:30pm", capacity:20, icon:"dumbbell",color:"#1F4A42",
    venue:"SCK Fitness, 439 High Road, Leyton, London E10 5EL", venueMap:"https://www.google.com/maps/search/?api=1&query=SCK+Fitness+439+High+Road+Leyton+London+E10+5EL",
    whatToBring:"Gym clothes and trainers and bring a water bottle.", icsStart:"20260708T123000Z", icsEnd:"20260708T133000Z", description:"Strength training is one of the most beneficial forms of exercise for women, particularly as we navigate the demands of motherhood, work and daily life.\n\nThis class focuses on building functional strength, improving mobility and helping women feel stronger and more capable in their everyday activities.\n\nUsing bodyweight exercises, resistance bands and light equipment, sessions are designed to be accessible while still providing an effective workout.\n\nBenefits include:\n• Increased muscle tone and strength\n• Support with sustainable fat loss and body composition goals\n• Improved posture and reduced aches and pains\n• Better balance and stability\n• Increased energy levels\n• Stronger bones and joints\n• Improved confidence in daily movement\n• Support for healthy ageing and long-term wellbeing\n\nRather than focusing on appearance alone, this class encourages women to appreciate what their bodies can do and develop strength that carries into everyday life.\n\nSuitable for all fitness levels and can be adapted to individual needs." },
];

// 2 membership tiers only
const PILATES_BASE = {
  name: "Pilates", tagline: "Strength, Core, Balance",
  color: "#9b7ecb",
  venue: "6 Dispensary Lane, London E8 1FT",
  venueMap: "https://www.google.com/maps/search/?api=1&query=6+Dispensary+Lane+London+E8+1FT",
  whatToBring: "Wear comfortable clothes and grip socks",
};
const PILATES_SESSIONS = [
  { id:"pilates_fri", day:"Fri 10 Jul", time:"9:15–10:00am", capacity:3, icsStart:"20260710T081500Z", icsEnd:"20260710T090000Z" },
  { id:"pilates_thu", day:"Thursday",   time:"9:15–10:00am", capacity:4, icsStart:null,             icsEnd:null },
];

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

// Admin passcode lives in Vercel env var VITE_ADMIN_PASSCODE — never in source code.
let ADMIN_PASSCODE = "CHANGE_ME_IN_VERCEL";
try { ADMIN_PASSCODE = import.meta.env.VITE_ADMIN_PASSCODE || "CHANGE_ME_IN_VERCEL"; } catch {}

// ── TASTER MODE ───────────────────────────────────────────────────────
// true  = simple "Book taster" flow, no pricing or payments shown
// false = full booking with PAYG / membership / Stripe payment
// Change this one line to switch between the two modes.
const TASTER_MODE = true;
// Set to true to stop new taster bookings across every class (existing
// bookings/cancellations are unaffected — this only blocks NEW bookings).
// Flip back to false whenever you want to reopen taster bookings.
const TASTERS_CLOSED = true;
const PILATES_REDIRECT = "https://backoffice.bsport.io/login/customer?membership=4849&next=%2Fc%2F4849%2Fbooking%2F%26membership%3D4849";

/* ===================================================================== */

const INK  = "#1B2B26";
const TEAL = "#e46478";
const GOLD = "#C99A4B";
const BG   = "#f0e8cc";

const ICONS = { music: Music2, flame: Flame, flower: Flower2, dumbbell: Dumbbell };
// Logo points to your actual file: public/7 (1).png
// The space and parentheses are URL-encoded below, since raw spaces/special
// characters aren't valid in a URL/path as-is.
const LOGO  = "/7%20(1).png";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ── Supabase Edge Function caller ─────────────────────────────────────────────
// Calls the send-email function deployed on Supabase.
// Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel env vars.
async function callEdgeFunction(name, data) {
  let url = "", key = "";
  try {
    url = import.meta.env.VITE_SUPABASE_URL || "";
    key = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
  } catch {}
  if (!url) throw new Error("EDGE_NOT_CONFIGURED");
  const res = await fetch(url + "/functions/v1/" + name, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(name + " returned " + res.status + ": " + errText);
  }
  return res.json();
}

function genCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }

// ── Salted password hashing ───────────────────────────────────────────────
function generateSalt() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2,"0")).join("");
}
async function hashPassword(pw, salt = "") {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + pw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
  } catch { return btoa(salt + pw); }
}

// ── Login lockout (5 failures = 10 min lock, stored in localStorage) ─────
function getAttempts(email) {
  try { return JSON.parse(localStorage.getItem("la_"+email) || '{"n":0,"until":0}'); }
  catch { return {n:0,until:0}; }
}
function recordFailure(email) {
  const a = getAttempts(email); a.n++;
  if (a.n >= 5) { a.until = Date.now() + 600000; a.n = 0; }
  localStorage.setItem("la_"+email, JSON.stringify(a));
}
function clearAttempts(email) { localStorage.removeItem("la_"+email); }
function lockMsg(email) {
  const a = getAttempts(email);
  if (a.until <= Date.now()) return null;
  const m = Math.ceil((a.until - Date.now())/60000);
  return `Too many failed attempts. Try again in ${m} minute${m!==1?"s":""}.`;
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
  paid:            { label: "Paid",             bg: "#e46478", fg: "#f0e8cc", icon: Banknote },
  confirmed:       { label: "Booked",           bg: "#e46478", fg: "#f0e8cc", icon: Check },
  waitlisted:      { label: "Waitlisted",       bg: "#FBF3E3", fg: "#9A7426", icon: Hourglass },
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
  const [mode, setMode]           = useState("register"); // register | login | forgot | verify | new_password
  const [resetMode, setResetMode] = useState(false);      // true = verify is for password reset
  const [verifyEmail, setVEmail]  = useState("");
  const [code, setCode]           = useState("");
  const [form, setForm]           = useState({ name:"", email:"", phone:"", password:"", confirm:"" });
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");
  const [agreed, setAgreed]       = useState(false);

  function f(k, v) { setForm(p => ({...p, [k]:v})); setError(""); setSuccess(""); }
  function switchMode(m) { setMode(m); setError(""); setSuccess(""); setCode(""); setAgreed(false); }

  async function getUsers() { return (await storage.get("snb_users")) || []; }

  async function handleRegister() {
    if (!form.name.trim()) return setError("Please enter your full name.");
    if (!/\S+@\S+\.\S+/.test(form.email)) return setError("Please enter a valid email address.");
    if (form.phone.replace(/\D/g,"").length < 10) return setError("Please enter a valid mobile number.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    if (!agreed) return setError("Please agree to the Privacy Policy and Terms & Conditions to continue.");
    setLoading(true);
    try {
      const users = await getUsers();
      if (users.find(u => u.email.toLowerCase() === form.email.trim().toLowerCase()))
        return setError("An account with that email already exists — please sign in.");
      const salt = generateSalt();
      const passwordHash = await hashPassword(form.password, salt);
      const user = { id:uid(), name:form.name.trim(), email:form.email.trim().toLowerCase(), phone:form.phone.trim(), passwordHash, salt, createdAt:new Date().toISOString() };
      await storage.set("snb_users", [...users, user]);
      const session = { id:user.id, name:user.name, email:user.email, phone:user.phone };
      // Send verification code — required before login is granted
      try {
        const code = genCode();
        await storage.set("vc_" + user.email, { code, exp: Date.now() + 900000 }); // 15 min expiry
        await callEdgeFunction("send-email", { type:"verify", to_email:user.email, to_name:user.name, code });
        // Notify admin (non-blocking — failure here doesn't prevent signup)
        callEdgeFunction("send-email", { type:"admin", user_name:user.name, user_email:user.email, user_phone:user.phone, signup_time:new Date().toLocaleString("en-GB") })
          .then(() => console.log("[SNB] Admin notified of new signup"))
          .catch(e => console.error("[SNB admin notify FAILED]:", e.message));
        await storage.set("snb_session", session);
        setVEmail(user.email);
        setResetMode(false);
        switchMode("verify");
      } catch(e) {
        // Email send failed — show a clear message, do NOT log user in without verification
        const isConfig = e.message.includes("EDGE_NOT_CONFIGURED") || e.message.includes("404");
        setError(isConfig
          ? "Email service not set up yet. Please contact shams@snbhive.com to complete your registration."
          : "Couldn't send your verification email — please try again in a moment.");
      }
    } catch(e) { if (!error) setError("Something went wrong — please try again."); }
    finally { setLoading(false); }
  }

  async function handleLogin() {
    if (!/\S+@\S+\.\S+/.test(form.email)) return setError("Please enter a valid email address.");
    if (!form.password) return setError("Please enter your password.");
    const email = form.email.trim().toLowerCase();
    const lock = lockMsg(email);
    if (lock) return setError(lock);
    setLoading(true);
    try {
      const users = await getUsers();
      const user = users.find(u => u.email.toLowerCase() === email);
      if (!user) { recordFailure(email); return setError("No account found with that email address."); }
      const hash = await hashPassword(form.password, user.salt || "");
      if (user.passwordHash !== hash) { recordFailure(email); return setError("Incorrect password — please try again."); }
      clearAttempts(email);
      // Silently upgrade to salted hash on first login if old account
      if (!user.salt) {
        const ns = generateSalt(); const nh = await hashPassword(form.password, ns);
        await storage.set("snb_users", users.map(u => u.email===email ? {...u, salt:ns, passwordHash:nh} : u)).catch(()=>{});
      }
      const session = { id:user.id, name:user.name, email:user.email, phone:user.phone, expiresAt: Date.now()+30*24*60*60*1000 };
      await storage.set("snb_session", session);
      onAuth(session);
    } catch { setError("Something went wrong — please try again."); }
    finally { setLoading(false); }
  }

  async function handleForgot() {
    if (!/\S+@\S+\.\S+/.test(form.email)) return setError("Please enter a valid email address.");
    setLoading(true);
    try {
      const email = form.email.trim().toLowerCase();
      const code = genCode();
      await storage.set("vc_" + email, { code, exp: Date.now() + 900000 });
      // Send reset code to the entered email.
      // Security is enforced by the verification step — only the person
      // who receives the email can enter the correct code.
      await callEdgeFunction("send-email", { type:"reset", to_email:email, code });
      setVEmail(email);
      setResetMode(true);
      switchMode("verify");
    } catch(e) {
      const isConfig = e.message.includes("EDGE_NOT_CONFIGURED") || e.message.includes("404");
      setError(isConfig
        ? "Password reset emails are not set up yet. Contact shams@snbhive.com for help."
        : "Couldn't send reset email — please try again.");
    }
    finally { setLoading(false); }
  }

  async function handleVerify() {
    if (!code || code.length !== 6) return setError("Please enter the 6-digit code from your email.");
    setLoading(true);
    try {
      const stored = await storage.get("vc_" + verifyEmail);
      if (!stored || !stored.code) return setError("Code not found — please request a new one.");
      if (stored.exp < Date.now()) return setError("Code expired — please request a new one.");
      if (stored.code !== code) return setError("Incorrect code. Please try again.");
      await storage.remove("vc_" + verifyEmail);
      if (resetMode) {
        setResetMode(false);
        switchMode("new_password");
      } else {
        const users = await getUsers();
        const user = users.find(u => u.email === verifyEmail);
        if (user) { const s = {id:user.id,name:user.name,email:user.email,phone:user.phone}; await storage.set("snb_session",s); onAuth(s); }
      }
    } catch(e) { if (!e.message.includes("code")) setError("Something went wrong — please try again."); }
    finally { setLoading(false); }
  }

  async function handleNewPassword() {
    if (!form.password || form.password.length < 8) return setError("Password must be at least 8 characters.");
    if (form.password !== form.confirm) return setError("Passwords don\'t match.");
    setLoading(true);
    try {
      const users = await getUsers();
      const ns = generateSalt();
      const hash = await hashPassword(form.password, ns);
      await storage.set("snb_users", users.map(u => u.email===verifyEmail ? {...u, passwordHash:hash, salt:ns} : u));
      setSuccess("Password updated! Please sign in.");
      setForm(p => ({...p, email:verifyEmail, password:"", confirm:""}));
      switchMode("login");
    } catch { setError("Something went wrong — please try again."); }
    finally { setLoading(false); }
  }

  async function handleResendCode() {
    setLoading(true); setError("");
    try {
      const newCode = genCode();
      await storage.set("vc_" + verifyEmail, { code: newCode, exp: Date.now() + 900000 });
      const users = await getUsers();
      const user  = users.find(u => u.email === verifyEmail);
      if (resetMode) {
        await callEdgeFunction("send-email", { type:"reset", to_email:verifyEmail, code:newCode });
      } else {
        await callEdgeFunction("send-email", { type:"verify", to_email:verifyEmail, to_name:user?.name||"", code:newCode });
      }
      setSuccess("New code sent — check your email.");
    } catch { setError("Could not resend. Make sure EmailJS is configured."); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-4 py-10" style={{ backgroundColor:BG }}>
      <Fonts/>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center rounded-2xl px-6 py-4 mb-3" style={{ backgroundColor:BG }}>
            <img src={LOGO} alt="SNB Hive" style={{ height:"160px" }} onError={e => { e.target.style.display = "none"; }}/>
          </div>
          <p className="ff-body text-sm text-stone-500">{BRAND.tagline}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">

          {/* register / login */}
          {(mode==="register" || mode==="login") && (<>
            <div className="flex gap-1 bg-stone-100 rounded-full p-1 mb-6">
              {[["register","Create account"],["login","Sign in"]].map(([k,label]) => (
                <button key={k} onClick={() => switchMode(k)}
                  className="ff-body flex-1 text-sm font-medium py-1.5 rounded-full transition"
                  style={{ backgroundColor:mode===k?"#fff":"transparent", color:mode===k?INK:"#8A8478", boxShadow:mode===k?"0 1px 2px rgba(0,0,0,0.08)":"none" }}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-4">
              {mode==="register" && (
                <div>
                  <label className="ff-body text-sm font-medium text-stone-700">Full name <span style={{color:"#B3261E",marginLeft:"2px"}}>*</span></label>
                  <input value={form.name} onChange={e=>f("name",e.target.value)} required
                    className="ff-body mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    placeholder="Your full name" autoComplete="name"/>
                </div>
              )}
              <div>
                <label className="ff-body text-sm font-medium text-stone-700">
                  Email address{mode==="register" ? " — this is your username" : ""}<span style={{color:"#B3261E",marginLeft:"2px"}}>*</span>
                </label>
                <input value={form.email} onChange={e=>f("email",e.target.value)} type="email"
                  className="ff-body mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  placeholder="you@example.com" autoComplete="email"/>
              </div>
              {mode==="register" && (
                <div>
                  <label className="ff-body text-sm font-medium text-stone-700">Mobile number <span style={{color:"#B3261E",marginLeft:"2px"}}>*</span></label>
                  <input value={form.phone} onChange={e=>f("phone",e.target.value)} type="tel" required
                    className="ff-body mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    placeholder="07…" autoComplete="tel"/>
                </div>
              )}
              <div>
                <label className="ff-body text-sm font-medium text-stone-700">Password <span style={{color:"#B3261E",marginLeft:"2px"}}>*</span></label>
                <div className="relative mt-1">
                  <input value={form.password} onChange={e=>f("password",e.target.value)} type={showPw?"text":"password"}
                    className="ff-body w-full rounded-xl border border-stone-200 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2"
                    placeholder={mode==="register"?"At least 8 characters":"Your password"}
                    autoComplete={mode==="register"?"new-password":"current-password"}
                    onKeyDown={e=>{if(e.key==="Enter"&&mode==="login")handleLogin();}}/>
                  <button onClick={()=>setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">
                    {showPw?<EyeOff size={16}/>:<Eye size={16}/>}
                  </button>
                </div>
              </div>
              {mode==="register" && (
                <div>
                  <label className="ff-body text-sm font-medium text-stone-700">Confirm password <span style={{color:"#B3261E",marginLeft:"2px"}}>*</span></label>
                  <input value={form.confirm} onChange={e=>f("confirm",e.target.value)} type={showPw?"text":"password"} required
                    className="ff-body mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    placeholder="Repeat password" autoComplete="new-password"/>
                </div>
              )}
              {mode==="register" && (
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                    className="mt-0.5 rounded shrink-0"/>
                  <span className="ff-body text-xs text-stone-600 leading-relaxed">
                    I agree to the{" "}
                    <a href="/terms" target="_blank" className="underline hover:text-stone-800">Terms & Conditions</a>
                    {" "}and{" "}
                    <a href="/privacy" target="_blank" className="underline hover:text-stone-800">Privacy Policy</a>.
                    {" "}<span style={{color:"#B3261E"}}>*</span>
                  </span>
                </label>
              )}
              {error   && <div className="ff-body text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
              {success && <div className="ff-body text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{success}</div>}
              <button onClick={mode==="register"?handleRegister:handleLogin} disabled={loading}
                className="ff-body inline-flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-full transition disabled:opacity-50"
                style={{ backgroundColor:TEAL, color:"#fff" }}>
                {loading?<Loader2 size={15} className="animate-spin"/>:mode==="register"?"Create my account":"Sign in"}
                {!loading&&<ArrowRight size={15}/>}
              </button>
              {mode==="login" && (
                <button onClick={()=>switchMode("forgot")} className="ff-body text-xs text-stone-400 hover:text-stone-600 text-center mt-1">
                  Forgot your password?
                </button>
              )}
            </div>
          </>)}

          {/* forgot password */}
          {mode==="forgot" && (
            <div className="flex flex-col gap-4">
              <div className="text-center mb-1">
                <h3 className="ff-display font-semibold" style={{color:INK}}>Reset your password</h3>
                <p className="ff-body text-xs text-stone-500 mt-1">Enter your email and we'll send a reset code</p>
              </div>
              <div>
                <label className="ff-body text-sm font-medium text-stone-700">Email address</label>
                <input value={form.email} onChange={e=>f("email",e.target.value)} type="email"
                  className="ff-body mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  placeholder="you@example.com" autoComplete="email"/>
              </div>
              {error   && <div className="ff-body text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
              {success && <div className="ff-body text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{success}</div>}
              <button onClick={handleForgot} disabled={loading}
                className="ff-body inline-flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-full transition disabled:opacity-50"
                style={{ backgroundColor:TEAL, color:"#fff" }}>
                {loading?<Loader2 size={15} className="animate-spin"/>:<>Send reset code <ArrowRight size={15}/></>}
              </button>
              <button onClick={()=>switchMode("login")} className="ff-body text-xs text-stone-400 hover:text-stone-600 text-center">
                Back to sign in
              </button>
            </div>
          )}

          {/* verify email — signup or reset */}
          {mode==="verify" && (
            <div className="flex flex-col gap-4">
              <div className="text-center mb-1">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{backgroundColor:"#E9F1EC"}}>
                  <Mail size={20} style={{color:TEAL}}/>
                </div>
                <h3 className="ff-display font-semibold" style={{color:INK}}>Check your email</h3>
                <p className="ff-body text-xs text-stone-500 mt-1">
                  We sent a 6-digit code to<br/><strong>{verifyEmail}</strong>
                </p>
              </div>
              <div>
                <label className="ff-body text-sm font-medium text-stone-700">Verification code</label>
                <input value={code} onChange={e=>{setCode(e.target.value.replace(/\D/g,"").slice(0,6));setError("");}}
                  type="text" inputMode="numeric" maxLength={6}
                  className="ff-body mt-1 w-full rounded-xl border border-stone-200 px-3 py-3 text-center tracking-[0.5em] text-lg font-semibold focus:outline-none focus:ring-2"
                  placeholder="000000"/>
              </div>
              {error   && <div className="ff-body text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
              {success && <div className="ff-body text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">{success}</div>}
              <button onClick={handleVerify} disabled={loading||code.length!==6}
                className="ff-body inline-flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-full transition disabled:opacity-50"
                style={{ backgroundColor:TEAL, color:"#fff" }}>
                {loading?<Loader2 size={15} className="animate-spin"/>:<>Verify <Check size={15}/></>}
              </button>
              <div className="flex items-center justify-between">
                <button onClick={handleResendCode} disabled={loading} className="ff-body text-xs text-stone-400 hover:text-stone-600">
                  Resend code
                </button>
                <button onClick={()=>switchMode(resetMode?"forgot":"register")} className="ff-body text-xs text-stone-400 hover:text-stone-600">
                  Go back
                </button>
              </div>
            </div>
          )}

          {/* new password after reset */}
          {mode==="new_password" && (
            <div className="flex flex-col gap-4">
              <div className="text-center mb-1">
                <h3 className="ff-display font-semibold" style={{color:INK}}>Set a new password</h3>
              </div>
              <div>
                <label className="ff-body text-sm font-medium text-stone-700">New password</label>
                <div className="relative mt-1">
                  <input value={form.password} onChange={e=>f("password",e.target.value)} type={showPw?"text":"password"}
                    className="ff-body w-full rounded-xl border border-stone-200 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2"
                    placeholder="At least 8 characters" autoComplete="new-password"/>
                  <button onClick={()=>setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">
                    {showPw?<EyeOff size={16}/>:<Eye size={16}/>}
                  </button>
                </div>
              </div>
              <div>
                <label className="ff-body text-sm font-medium text-stone-700">Confirm new password</label>
                <input value={form.confirm} onChange={e=>f("confirm",e.target.value)} type={showPw?"text":"password"}
                  className="ff-body mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                  placeholder="Repeat password" autoComplete="new-password"/>
              </div>
              {error && <div className="ff-body text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
              <button onClick={handleNewPassword} disabled={loading}
                className="ff-body inline-flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-full transition disabled:opacity-50"
                style={{ backgroundColor:TEAL, color:"#fff" }}>
                {loading?<Loader2 size={15} className="animate-spin"/>:<>Update password <Check size={15}/></>}
              </button>
            </div>
          )}

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

function ClassCard({ cls, booked, onBook, bookingType, onWaitlist }) {
  const Icon = ICONS[cls.icon] || Sparkles;
  const full = booked >= cls.capacity;
  const spotsLeft = Math.max(cls.capacity - booked, 0);
  const isMember  = bookingType === "membership";
  const isPayg    = bookingType === "payg";
  const isBooked  = !!bookingType;
  const isClosed  = TASTER_MODE && TASTERS_CLOSED && !isBooked;
  const showRing  = !isBooked && spotsLeft <= 5;
  const disabled  = full || isMember || (TASTER_MODE && isBooked) || isClosed;

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
        {isMember && !TASTER_MODE && <Pill icon={Check}><span style={{ color:TEAL }}>Member</span></Pill>}
      </div>

      {cls.venue && (
        <a href={cls.venueMap} target="_blank" rel="noopener noreferrer"
          className="ff-body inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 transition -mt-1">
          <MapPin size={11}/> {cls.venue}
        </a>
      )}

      <div className="flex items-center justify-end pt-2 border-t border-stone-100 mt-auto">
        <button onClick={() => onBook(cls)} disabled={disabled}
          className="ff-body inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full transition disabled:cursor-not-allowed"
          style={{
            backgroundColor: (TASTER_MODE && isBooked) ? "#D4EBD9" : (full || isClosed) ? "#E3DFD3" : TEAL,
            color: (TASTER_MODE && isBooked) ? "#2D6B40" : (full || isClosed) ? "#8A8478" : "#FFF",
            opacity: disabled ? 0.85 : 1
          }}>
          {full ? "Full"
            : (TASTER_MODE && isBooked) ? "Taster booked"
            : isClosed ? "Tasters closed"
            : TASTER_MODE ? "Book taster" : "Book"}
          {!disabled && <ArrowRight size={14}/>}
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

  const isPilates = TASTER_MODE && (session.id || "").startsWith("pilates_");
  const redirectedRef = useRef(false);

  // Show the "you're about to be redirected" notice first (step 2 renders
  // immediately), then open the Pilates registration page in a new tab a
  // few seconds later — giving the user time to actually read the notice
  // before the tab opens. Note: the longer this delay, the more likely some
  // browsers are to block the new tab as a popup, since it's less tightly
  // tied to the user's original click — 4s is a reasonable middle ground.
  useEffect(() => {
    if (step !== 2 || !isPilates || redirectedRef.current) return;
    const t = setTimeout(() => {
      redirectedRef.current = true;
      window.open(PILATES_REDIRECT, "_blank", "noopener,noreferrer");
    }, 4000);
    return () => clearTimeout(t);
  }, [step, isPilates]);

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
        // Open the Pilates registration page shortly after the confirmation
        // screen appears (handled below in a useEffect) so the user sees the
        // notice first, rather than the tab opening before they've read it.
        // Send confirmation email with calendar invite (non-blocking)
        callEdgeFunction("send-email", {
          type: "confirm_taster",
          to_email: currentUser.email, to_name: currentUser.name,
          session_name: session.name, day: session.day, time: session.time,
          venue: session.venue || "", what_to_bring: session.whatToBring || "",
          ics_start: session.icsStart, ics_end: session.icsEnd,
        }).catch(() => {});
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

              {isPilates ? (
                /* ── Pilates: redirect to bsport to complete registration ── */
                <>
                  <div>
                    <h4 className="ff-display text-xl font-semibold" style={{ color:INK }}>Taster booked!</h4>
                    <p className="ff-body text-sm text-stone-500 mt-1">
                      Your <strong>{session.name}</strong> taster is confirmed.
                    </p>
                  </div>
                  <div className="w-full rounded-xl px-4 py-4 text-left" style={{ backgroundColor:"#FBF3E3", border:"1px solid #C99A4B" }}>
                    <p className="ff-body text-sm font-semibold" style={{ color:"#7A5C20" }}>
                      One more step — complete your registration
                    </p>
                    <p className="ff-body text-sm mt-1.5" style={{ color:"#9A7426" }}>
                      We're about to open our Pilates booking portal in a new tab so you can
                      sign up or log in there to finalise your place. If it doesn't open,
                      check your browser's popup settings for this site.
                    </p>
                  </div>
                </>
              ) : (
                /* ── Regular taster confirmation ── */
                <>
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
                  {session.description && (
                    <div className="w-full text-left">
                      <p className="ff-body text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">About this class</p>
                      <div className="max-h-48 overflow-y-auto rounded-xl bg-stone-50 px-4 py-3 flex flex-col gap-1.5">
                        {session.description.split("\n").filter(l => l.trim()).map((line, i) => (
                          line.startsWith("•")
                            ? <div key={i} className="flex items-start gap-2">
                                <span className="ff-body text-xs shrink-0 mt-0.5" style={{color:TEAL}}>•</span>
                                <span className="ff-body text-xs text-stone-600">{line.slice(1).trim()}</span>
                              </div>
                            : <p key={i} className="ff-body text-xs text-stone-600 leading-relaxed">{line}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-stone-400">We'll be in touch with everything you need to know before your first session.</p>
                  <button onClick={onClose}
                    className="w-full inline-flex items-center justify-center font-semibold text-sm py-3 rounded-full"
                    style={{ backgroundColor:TEAL, color:"#fff" }}>
                    Great, see you there!
                  </button>
                </>
              )}
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

// Resolves display info (day, time, venue, icon, colour) for any sessionId —
// covers both regular classes (DEFAULT_CLASSES) and Pilates sessions, which
// live in a separate PILATES_SESSIONS/PILATES_BASE structure.
function getSessionInfo(sessionId) {
  const cls = DEFAULT_CLASSES.find(c => c.id === sessionId);
  if (cls) return cls;
  const pilatesSession = PILATES_SESSIONS.find(p => p.id === sessionId);
  if (pilatesSession) return { ...PILATES_BASE, ...pilatesSession, icon: "sparkles" };
  return null;
}

function MyBookings({ bookings, currentUser, onCancel }) {
  const [confirmCancel, setConfirmCancel] = useState(null);
  const mine = bookings
    .filter(b => b.userId===currentUser.id || b.email===currentUser.email)
    .filter(b => b.status !== "cancelled");
  return (
    <div className="max-w-md mx-auto flex flex-col gap-3">
      {mine.length===0
        ? <div className="text-center py-12">
            <p className="text-sm text-stone-500">No bookings yet.</p>
            <p className="text-xs text-stone-400 mt-1">Book a taster session to see it here.</p>
          </div>
        : mine.slice().reverse().map(b => {
          const cls = getSessionInfo(b.sessionId);
          const Icon = cls ? (ICONS[cls.icon] || Sparkles) : Sparkles;
          return (
            <div key={b.id} className="bg-white rounded-xl border border-stone-200 p-4 flex gap-3 items-start">
              {cls && (
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: cls.color + "1A" }}>
                  <Icon size={16} style={{ color: cls.color }}/>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-sm" style={{ color: INK }}>{b.sessionName}</span>
                  <StatusBadge status={b.status}/>
                </div>
                {cls && <p className="text-xs text-stone-500 mt-1">{cls.day} · {cls.time}</p>}
                {cls?.venue && (
                  <a href={cls.venueMap} target="_blank" rel="noopener noreferrer"
                    className="ff-body flex w-fit items-center gap-1 text-xs text-stone-400 hover:text-stone-600 hover:underline mt-1 transition">
                    <MapPin size={10}/> {cls.venue}
                  </a>
                )}
                {confirmCancel === b.id ? (
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-xs text-stone-500">Cancel this taster?</p>
                    <button onClick={() => { onCancel(b.id); setConfirmCancel(null); }}
                      className="ff-body text-xs font-semibold text-red-600 hover:underline">Yes</button>
                    <button onClick={() => setConfirmCancel(null)}
                      className="ff-body text-xs text-stone-400 hover:underline">No</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmCancel(b.id)}
                    className="ff-body mt-2 text-xs text-stone-400 hover:text-red-500 hover:underline transition">
                    Cancel booking
                  </button>
                )}
              </div>
            </div>
          );
        })
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
  const [statusFilter, setFilter]   = useState("all");
  const [query, setQuery]           = useState("");
  const [notifSubject, setNSubject] = useState("");
  const [notifMessage, setNMessage] = useState("");
  const [notifStatus, setNStatus]   = useState("idle"); // idle | sending | sent | error

  async function handleSendBlast() {
    if (!notifSubject.trim() || !notifMessage.trim()) return;
    setNStatus("sending");
    try {
      const users = (await storage.get("snb_users")) || [];
      let sent = 0;
      for (const u of users) {
        await callEdgeFunction("send-email", { type:"blast", to_email:u.email, to_name:u.name, subject:notifSubject, message:notifMessage });
        sent++;
        setNStatus(`sending_${sent}_${users.length}`);
        await new Promise(r => setTimeout(r, 200)); // small delay between sends
      }
      setNStatus("sent");
      setTimeout(() => setNStatus("idle"), 5000);
    } catch(e) {
      setNStatus(e.message==="EDGE_NOT_CONFIGURED" ? "not_configured" : "error");
      setTimeout(() => setNStatus("idle"), 5000);
    }
  }

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

/* ---- WELCOME HERO ---- */

function WelcomeHero({ currentUser }) {
  const firstName = (currentUser?.name || "").split(" ")[0] || "there";
  // First visit ever → "Welcome"; all subsequent logins → "Welcome back"
  const visitKey  = "snb_visited_" + currentUser.email;
  const isFirst   = !localStorage.getItem(visitKey);
  useEffect(() => { if (isFirst) localStorage.setItem(visitKey, "1"); }, []);
  return (
    <div className="rounded-2xl overflow-hidden mb-6 relative" style={{ backgroundColor: TEAL }}>
      <svg className="absolute inset-0 opacity-[0.07] w-full h-full" preserveAspectRatio="none">
        <defs><pattern id="wh" width="34" height="34" patternUnits="userSpaceOnUse">
          <path d="M17 0 L34 17 L17 34 L0 17 Z" fill="none" stroke="white" strokeWidth="1"/>
        </pattern></defs>
        <rect width="100%" height="100%" fill="url(#wh)"/>
      </svg>
      <div className="relative p-6 sm:p-8">
        <p className="ff-body text-sm font-medium mb-1" style={{ color: BG }}>{isFirst ? "Welcome" : "Welcome back"}, {firstName} 👋</p>
        <h2 className="ff-display text-xl sm:text-2xl font-semibold leading-snug" style={{ color: BG }}>
          Women&apos;s Fitness &amp; Wellness Classes
        </h2>
        <p className="ff-body text-sm mt-2 leading-relaxed max-w-sm" style={{ color: "rgba(240,232,204,0.8)" }}>
          Join our welcoming community. Browse our taster sessions below — they&apos;re free and a great
          way to try a new class before committing.
        </p>
      </div>
    </div>
  );
}

/* ---- ACCOUNT PAGE ---- */

function AccountPage({ currentUser, onUpdate }) {
  const [form, setForm]     = useState({ name: currentUser.name, phone: currentUser.phone || "" });
  const [pw, setPw]         = useState({ current:"", next:"", confirm:"" });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwS]  = useState(false);
  const [msg, setMsg]       = useState("");
  const [pwMsg, setPwMsg]   = useState("");

  async function saveDetails() {
    if (!form.name.trim()) return setMsg("Name is required.");
    setSaving(true);
    try {
      const users = (await storage.get("snb_users")) || [];
      const updated = users.map(u => u.id===currentUser.id ? {...u, name:form.name.trim(), phone:form.phone.trim()} : u);
      await storage.set("snb_users", updated);
      const session = {...currentUser, name:form.name.trim(), phone:form.phone.trim(), expiresAt:Date.now()+30*24*60*60*1000};
      await storage.set("snb_session", session);
      onUpdate(session);
      setMsg("✓ Details saved.");
    } catch { setMsg("Something went wrong — please try again."); }
    finally { setSaving(false); setTimeout(() => setMsg(""), 4000); }
  }

  async function changePassword() {
    if (!pw.current) return setPwMsg("Enter your current password.");
    if (pw.next.length < 8) return setPwMsg("New password must be at least 8 characters.");
    if (pw.next !== pw.confirm) return setPwMsg("Passwords don\'t match.");
    setPwS(true);
    try {
      const users = (await storage.get("snb_users")) || [];
      const user = users.find(u => u.id === currentUser.id);
      if (!user) return setPwMsg("User not found.");
      const cHash = await hashPassword(pw.current, user.salt || "");
      if (cHash !== user.passwordHash) return setPwMsg("Current password is incorrect.");
      const ns = generateSalt(); const nh = await hashPassword(pw.next, ns);
      await storage.set("snb_users", users.map(u => u.id===currentUser.id ? {...u, passwordHash:nh, salt:ns} : u));
      setPw({current:"", next:"", confirm:""});
      setPwMsg("✓ Password changed.");
    } catch { setPwMsg("Something went wrong — please try again."); }
    finally { setPwS(false); setTimeout(() => setPwMsg(""), 4000); }
  }

  const inputCls = "ff-body mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2";
  const card = "bg-white rounded-2xl border border-stone-200 p-5 shadow-sm flex flex-col gap-3";

  return (
    <div className="max-w-md mx-auto flex flex-col gap-4">
      <div className={card}>
        <h3 className="ff-display text-base font-semibold" style={{color:INK}}>Your details</h3>
        <div>
          <label className="ff-body text-sm font-medium text-stone-700">Full name</label>
          <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className={inputCls}/>
        </div>
        <div>
          <label className="ff-body text-sm font-medium text-stone-700">Email address</label>
          <input value={currentUser.email} disabled className={inputCls+" bg-stone-50 text-stone-400 cursor-not-allowed"}/>
          <p className="ff-body text-xs text-stone-400 mt-1">Email cannot be changed. Contact shams@snbhive.com if needed.</p>
        </div>
        <div>
          <label className="ff-body text-sm font-medium text-stone-700">Mobile number</label>
          <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} type="tel" className={inputCls}/>
        </div>
        {msg && <p className={"ff-body text-xs px-3 py-2 rounded-lg " + (msg.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>{msg}</p>}
        <button onClick={saveDetails} disabled={saving}
          className="ff-body font-semibold text-sm py-2.5 rounded-full disabled:opacity-50"
          style={{backgroundColor:TEAL,color:"#fff"}}>{saving ? "Saving…" : "Save changes"}</button>
      </div>

      <div className={card}>
        <h3 className="ff-display text-base font-semibold" style={{color:INK}}>Change password</h3>
        {[["current","Current password",""],["next","New password","At least 8 characters"],["confirm","Confirm new password",""]].map(([k,label,ph]) => (
          <div key={k}>
            <label className="ff-body text-sm font-medium text-stone-700">{label}</label>
            <div className="relative mt-1">
              <input value={pw[k]} onChange={e=>setPw({...pw,[k]:e.target.value})} type={showPw?"text":"password"} placeholder={ph}
                className={inputCls+" pr-10"}/>
              {k==="current" && (
                <button onClick={()=>setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">
                  {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              )}
            </div>
          </div>
        ))}
        {pwMsg && <p className={"ff-body text-xs px-3 py-2 rounded-lg " + (pwMsg.startsWith("✓") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>{pwMsg}</p>}
        <button onClick={changePassword} disabled={pwSaving}
          className="ff-body font-semibold text-sm py-2.5 rounded-full disabled:opacity-50"
          style={{backgroundColor:TEAL,color:"#fff"}}>{pwSaving ? "Updating…" : "Change password"}</button>
      </div>
    </div>
  );
}

/* ---- POLICY PAGES ---- */

function PolicyPage({ title, children }) {
  return (
    <div className="min-h-screen" style={{backgroundColor:BG}}>
      <Fonts/>
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center rounded-2xl px-5 py-3" style={{ backgroundColor:BG }}>
            <img src={LOGO} alt="SNB Hive" style={{ height:"88px" }} onError={e => { e.target.style.display = "none"; }}/>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-stone-200 p-8 shadow-sm">
          <h1 className="ff-display text-2xl font-semibold mb-6" style={{color:INK}}>{title}</h1>
          <div className="ff-body text-sm text-stone-600 leading-relaxed flex flex-col gap-4">{children}</div>
        </div>
        <p className="ff-body text-xs text-stone-400 text-center mt-4">
          Questions? Contact <a href="mailto:shams@snbhive.com" className="underline">shams@snbhive.com</a>
        </p>
      </div>
    </div>
  );
}

function PrivacyPage() {
  return (
    <PolicyPage title="Privacy Policy">
      <p><strong>Who we are:</strong> SNB Hive (operated by Sunlight Events). Contact: shams@snbhive.com</p>
      <p><strong>What we collect:</strong> Your name, email address, and mobile number when you create an account, and booking details when you register for a class or retreat.</p>
      <p><strong>Why we collect it:</strong> To manage your bookings, send you confirmation emails, and notify you of class updates. We do not sell your data to third parties.</p>
      <p><strong>How we store it:</strong> Your data is stored securely in Supabase (EU-based servers). Passwords are stored as salted hashes — we cannot read your password.</p>
      <p><strong>How long we keep it:</strong> We keep your data for as long as you have an active account. You can request deletion at any time by emailing shams@snbhive.com.</p>
      <p><strong>Your rights (UK GDPR):</strong> You have the right to access, correct, or delete your personal data. Contact us at shams@snbhive.com to exercise these rights.</p>
      <p><strong>Last updated:</strong> July 2026</p>
    </PolicyPage>
  );
}

function TermsPage() {
  return (
    <PolicyPage title="Terms & Conditions">
      <p><strong>1. Taster sessions</strong> — Taster sessions are free and subject to availability. Booking a taster does not guarantee a place on a regular class.</p>
      <p><strong>2. Cancellations</strong> — Please cancel at least 24 hours in advance if you cannot attend. This allows us to offer your place to someone on the waitlist.</p>
      <p><strong>3. Health & safety</strong> — By booking a taster you confirm you are in good health and able to participate. Please inform the instructor of any injuries before the session.</p>
      <p><strong>4. Your account</strong> — You are responsible for keeping your login details secure. Contact shams@snbhive.com immediately if you suspect unauthorised access.</p>
      <p><strong>5. Changes</strong> — We reserve the right to change session dates, times or venues. We will notify you by email if this affects a booking you have made.</p>
      <p><strong>6. Governing law</strong> — These terms are governed by the laws of England and Wales.</p>
      <p><strong>Last updated:</strong> July 2026</p>
    </PolicyPage>
  );
}


function PilatesCard({ bookedFri, bookedThu, bookingTypeFri, bookingTypeThu, onBook }) {
  const color = PILATES_BASE.color;

  function SessionPanel({ session, booked, bookingType }) {
    const isBooked = bookingType === "membership";
    const full = booked >= session.capacity;
    const isClosed = TASTER_MODE && TASTERS_CLOSED && !isBooked;
    const disabled = full || isBooked || isClosed;
    return (
      <div className="border border-stone-100 rounded-xl p-4 flex flex-col items-center text-center gap-3">
        <div className="flex flex-wrap justify-center gap-1.5">
          <Pill icon={Calendar}>{session.day}</Pill>
          <Pill icon={Clock}>{session.time}</Pill>
        </div>
        <button onClick={() => !disabled && onBook({...PILATES_BASE, ...session})} disabled={disabled}
          className="ff-body w-full text-sm font-semibold py-2 rounded-full transition disabled:cursor-not-allowed mt-auto"
          style={{ backgroundColor: isBooked ? "#D4EBD9" : (full || isClosed) ? "#E3DFD3" : TEAL, color: isBooked ? "#2D6B40" : (full || isClosed) ? "#8A8478" : "#FFF" }}>
          {full ? "Full" : isBooked ? "Taster booked" : isClosed ? "Tasters closed" : "Book taster"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm mt-4">
      <div className="flex flex-col items-center text-center gap-2 mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: color+"1A" }}>
          <Sparkles size={20} style={{ color }}/>
        </div>
        <div>
          <h3 className="ff-display text-lg font-semibold" style={{ color: INK }}>{PILATES_BASE.name}</h3>
          <p className="ff-body text-sm text-stone-500">{PILATES_BASE.tagline}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <SessionPanel session={PILATES_SESSIONS[0]} booked={bookedFri} bookingType={bookingTypeFri}/>
        <SessionPanel session={PILATES_SESSIONS[1]} booked={bookedThu} bookingType={bookingTypeThu}/>
      </div>
      {PILATES_BASE.venue && (
        <div className="flex justify-center">
          <a href={PILATES_BASE.venueMap} target="_blank" rel="noopener noreferrer"
            className="ff-body inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-600 transition mb-1">
            <MapPin size={11}/> {PILATES_BASE.venue}
          </a>
        </div>
      )}
    </div>
  );
}

function ComingSoon() {
  return (
    <div className="max-w-lg mx-auto flex flex-col gap-5 py-4">

      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor:TEAL+"1A" }}>
          <Sparkles size={28} style={{ color:TEAL }}/>
        </div>
        <h2 className="ff-display text-2xl font-semibold" style={{ color:INK }}>Women's Spa Retreat</h2>
        <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor:TEAL+"1A", color:TEAL }}>
          <Bell size={12}/> Coming soon — July / August
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm flex flex-col gap-4">
        <p className="ff-body text-sm text-stone-600 leading-relaxed">Our retreats are built around women's needs.</p>
        <p className="ff-body text-sm text-stone-600 leading-relaxed">
          If you're looking for some time away, to relax, reset and unwind for a night or two, this is the
          perfect opportunity to do that without the stress of travelling abroad.
        </p>
        <p className="ff-body text-sm text-stone-600 leading-relaxed">
          We organise quality retreats with access to spa facilities like an indoor pool, sauna and much
          more, so that all you need to do is turn up and enjoy.
        </p>
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor:TEAL+"1A" }}>
          <p className="ff-body text-sm font-semibold leading-relaxed" style={{ color:TEAL }}>
            We're currently planning a retreat for July/August. If you're interested, let us know as soon
            as possible — spaces are limited.
          </p>
        </div>
      </div>

      {/* CTA */}
      <a href={"mailto:shams@snbhive.com?subject=Retreat%20Interest%20%E2%80%94%20July%2FAugust"}
        className="w-full inline-flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-full"
        style={{ backgroundColor:TEAL, color:"#fff" }}>
        <Mail size={15}/> Register your interest
      </a>
      <p className="ff-body text-xs text-stone-400 text-center -mt-2">
        All registered members will also receive an email notification when retreat bookings open.
      </p>
    </div>
  );
}

/* ---- ADMIN PAGE (accessed at /admin — never linked from the user site) ---- */

function AdminPage() {
  const [unlocked, setUnlocked] = useState(() =>
    sessionStorage.getItem("snb_admin_auth") === ADMIN_PASSCODE
  );
  const [input, setInput]       = useState("");
  const [err, setErr]           = useState(false);
  const [bookings, setBookings]   = useState([]);
  const [members, setMembers]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [adminTab, setAdminTab]   = useState("bookings");
  const [statusFilter, setFilter] = useState("all");
  const [query, setQuery]         = useState("");
  const [memberQuery, setMQuery]  = useState("");
  const [notifSubject, setNSubject] = useState("");
  const [notifMessage, setNMessage] = useState("");
  const [notifStatus, setNStatus]   = useState("idle");

  // Load bookings + members once unlocked
  useEffect(() => {
    if (!unlocked) return;
    setLoading(true);
    Promise.all([
      storage.get("bookings"),
      storage.get("snb_users"),
    ]).then(([b, u]) => {
      setBookings(b || []);
      setMembers(u || []);
    }).finally(() => setLoading(false));
  }, [unlocked]);

  function handleUnlock() {
    if (input === ADMIN_PASSCODE) {
      sessionStorage.setItem("snb_admin_auth", ADMIN_PASSCODE);
      setUnlocked(true);
    } else {
      setErr(true);
    }
  }

  async function updateStatus(id, status) {
    const next = bookings.map(b => b.id === id ? { ...b, status } : b);
    setBookings(next);
    await storage.set("bookings", next);
  }

  async function handleSendBlast() {
    if (!notifSubject.trim() || !notifMessage.trim()) return;
    setNStatus("sending");
    try {
      const users = (await storage.get("snb_users")) || [];
      let sent = 0;
      for (const u of users) {
        await callEdgeFunction("send-email", { type:"blast", to_email:u.email, to_name:u.name, subject:notifSubject, message:notifMessage });
        sent++;
        setNStatus(`sending_${sent}_${users.length}`);
        await new Promise(r => setTimeout(r, 200));
      }
      setNStatus("sent");
      setTimeout(() => setNStatus("idle"), 5000);
    } catch(e) {
      setNStatus(e.message === "EDGE_NOT_CONFIGURED" ? "not_configured" : "error");
      setTimeout(() => setNStatus("idle"), 5000);
    }
  }

  // ── Passcode screen ───────────────────────────────────────────────────
  if (!unlocked) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
         style={{ backgroundColor: BG }}>
      <Fonts/>
      <div className="w-full max-w-xs">
        <div className="text-center mb-8">
          <div className="mx-auto mb-3 flex justify-center">
            <div className="flex items-center justify-center rounded-2xl overflow-hidden" style={{ backgroundColor:BG, padding:"14px 28px" }}>
              <img src={LOGO} alt="SNB Hive" style={{ height:"288px" }} onError={e => { e.target.style.display = "none"; }}/>
            </div>
          </div>
          <p className="ff-body text-sm font-semibold" style={{ color: INK }}>Admin Dashboard</p>
        </div>
        <div className="bg-white rounded-2xl border border-stone-200 p-6 flex flex-col gap-4 shadow-sm">
          <div>
            <label className="ff-body text-sm font-medium text-stone-700">Passcode</label>
            <input type="password" value={input} autoFocus
              onChange={e => { setInput(e.target.value); setErr(false); }}
              onKeyDown={e => e.key === "Enter" && handleUnlock()}
              className="ff-body mt-1 w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm text-center tracking-widest focus:outline-none focus:ring-2"
              placeholder="••••••••"/>
          </div>
          {err && <p className="ff-body text-xs text-red-600 text-center">Incorrect passcode.</p>}
          <button onClick={handleUnlock}
            className="ff-body font-semibold text-sm py-3 rounded-full"
            style={{ backgroundColor: TEAL, color: "#fff" }}>
            Sign in
          </button>
          <p className="ff-body text-xs text-center mt-2 rounded-lg px-2 py-1.5"
             style={{ backgroundColor: import.meta.env.VITE_SUPABASE_URL ? "#E9F1EC" : "#F3E7E5",
                      color: import.meta.env.VITE_SUPABASE_URL ? "#1F4A42" : "#9B3A2E" }}>
            {import.meta.env.VITE_SUPABASE_URL ? "✓ Supabase connected" : "✗ VITE_SUPABASE_URL missing — check Vercel env vars & redeploy"}
          </p>
        </div>
      </div>
    </div>
  );

  // ── Dashboard ─────────────────────────────────────────────────────────
  const filtered = bookings.filter(b => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (query && !(`${b.name} ${b.email} ${b.sessionName}`.toLowerCase().includes(query.toLowerCase()))) return false;
    return true;
  }).slice().reverse();

  const active       = bookings.filter(b => b.status !== "cancelled");
  const totalPaid    = active.filter(b => b.status === "paid").reduce((s,b) => s + Number(b.amount||0), 0);
  const totalPending = active.filter(b => b.status === "pending_payment").reduce((s,b) => s + Number(b.amount||0), 0);
  const classCount   = active.filter(b => b.type === "class").length;
  const retreatCount = active.filter(b => b.type === "retreat").length;

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG }}>
      <Fonts/>

      {/* Header */}
      <div style={{ backgroundColor: TEAL }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-xl overflow-hidden" style={{ backgroundColor:BG, padding:"6px 14px" }}>
              <img src={LOGO} alt="SNB Hive" style={{ height:"56px" }} onError={e => { e.target.style.display = "none"; }}/>
            </div>
            <div>
              <p className="ff-display text-base font-semibold" style={{ color: GOLD }}>SNB Hive</p>
              <p className="ff-body text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>Admin Dashboard</p>
            </div>
          </div>
          <button onClick={() => { sessionStorage.removeItem("snb_admin_auth"); setUnlocked(false); }}
            className="ff-body text-xs px-3 py-1.5 rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#fff" }}>
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total members",      value: members.length,                 color: TEAL },
            { label: "Confirmed revenue",  value: `£${totalPaid.toFixed(2)}`,    color: TEAL },
            { label: "Awaiting payment",   value: `£${totalPending.toFixed(2)}`, color: "#9A7426" },
            { label: "Class bookings",     value: classCount,                     color: INK },
            { label: "Retreat bookings",   value: retreatCount,                   color: INK },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-stone-200 p-4 shadow-sm">
              <p className="ff-body text-xs text-stone-500">{s.label}</p>
              <p className="ff-display text-2xl font-semibold mt-1" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 bg-stone-100 rounded-full p-1 w-fit">
          {[["bookings","Bookings"],["members","Members"],["classes","Classes"]].map(([key, label]) => {
            const count = key==="members" ? members.length : key==="classes" ? DEFAULT_CLASSES.length : bookings.filter(b=>b.status!=="cancelled").length;
            return (
              <button key={key} onClick={() => setAdminTab(key)}
                className="ff-body text-sm font-medium px-5 py-1.5 rounded-full transition"
                style={{
                  backgroundColor: adminTab===key ? "#fff" : "transparent",
                  color: adminTab===key ? INK : "#8A8478",
                  boxShadow: adminTab===key ? "0 1px 2px rgba(0,0,0,0.08)" : "none"
                }}>
                {label} ({count})
              </button>
            );
          })}
        </div>

        {/* ── BOOKINGS TAB ── */}
        {adminTab === "bookings" && <>

        {/* Filters + search */}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex gap-1.5 flex-wrap">
            {["all","paid","pending_payment","cancelled"].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className="ff-body text-xs font-medium px-3 py-1.5 rounded-full transition"
                style={{ backgroundColor: statusFilter===s ? TEAL : "#F3F1EA", color: statusFilter===s ? "#fff" : "#6B6457" }}>
                {s === "all" ? "All" : STATUS_META[s]?.label || s}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"/>
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search name, email, class…"
                className="ff-body rounded-full border border-stone-200 pl-8 pr-3 py-1.5 text-xs w-48 focus:outline-none"/>
            </div>
            <button onClick={() => {
              const headers = ["Name","Email","Phone","Session","Plan","Amount","Status","Booked at"];
              const rows = bookings.map(b => [b.name,b.email,b.phone,b.sessionName,b.plan,b.amount,b.status,b.createdAt]);
              const csv = [headers,...rows].map(r => r.map(v => `"${String(v||"").replace(/"/g,'""')}"`).join(",")).join("\n");
              const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv],{type:"text/csv"})), download: `snb-bookings-${new Date().toISOString().slice(0,10)}.csv` });
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
            }} className="ff-body inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-stone-200 bg-white text-stone-600 hover:bg-stone-50">
              <Download size={13}/> Export CSV
            </button>
          </div>
        </div>

        {/* Bookings table */}
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-stone-300"/></div>
          ) : filtered.length === 0 ? (
            <p className="ff-body text-sm text-stone-400 text-center py-16">No bookings match this filter.</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {filtered.map(b => (
                <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-stone-50 transition">
                  <div className="min-w-[160px] flex-1">
                    <p className="ff-body font-medium text-sm" style={{ color: INK }}>{b.name}</p>
                    <p className="ff-body text-xs text-stone-400">{b.email}{b.phone ? ` · ${b.phone}` : ""}</p>
                  </div>
                  <div className="min-w-[140px] flex-1">
                    <p className="ff-body text-sm font-medium">{b.sessionName}</p>
                    <p className="ff-body text-xs text-stone-400">{b.plan}</p>
                  </div>
                  <div className="ff-body text-sm font-semibold w-16 text-right">
                    £{typeof b.amount === "number" ? b.amount.toFixed(2) : b.amount}
                  </div>
                  <StatusBadge status={b.status}/>
                  <div className="flex gap-1 ml-auto">
                    {b.status === "pending_payment" && (
                      <button onClick={() => updateStatus(b.id,"paid")} title="Mark paid"
                        className="p-1.5 rounded-lg hover:bg-stone-100" style={{ color: TEAL }}>
                        <Check size={15}/>
                      </button>
                    )}
                    {b.status === "paid" && (
                      <button onClick={() => updateStatus(b.id,"pending_payment")} title="Undo"
                        className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400">
                        <Undo2 size={15}/>
                      </button>
                    )}
                    {b.status !== "cancelled"
                      ? <button onClick={() => updateStatus(b.id,"cancelled")} title="Cancel"
                          className="p-1.5 rounded-lg hover:bg-stone-100 text-red-400"><Ban size={15}/></button>
                      : <button onClick={() => updateStatus(b.id,"pending_payment")} title="Restore"
                          className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400"><RotateCcw size={15}/></button>
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Send notification */}
        <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm flex flex-col gap-3">
          <p className="ff-body text-sm font-semibold flex items-center gap-2" style={{ color: INK }}>
            <Bell size={15}/> Send notification to all members
          </p>
          <input value={notifSubject} onChange={e => setNSubject(e.target.value)}
            placeholder="Subject — e.g. New class added!"
            className="ff-body w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2"/>
          <textarea value={notifMessage} onChange={e => setNMessage(e.target.value)}
            placeholder="Your message to all members…" rows={4}
            className="ff-body w-full rounded-xl border border-stone-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 resize-none"/>
          {notifStatus === "not_configured" && (
            <p className="ff-body text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              Email not configured — deploy the Supabase Edge Function and add secrets.
            </p>
          )}
          {notifStatus.startsWith("sending_") && (() => {
            const [,sent,total] = notifStatus.split("_");
            return <p className="ff-body text-xs text-stone-500">Sending… {sent} of {total}</p>;
          })()}
          {notifStatus === "sent"  && <p className="ff-body text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">✓ Notification sent to all members!</p>}
          {notifStatus === "error" && <p className="ff-body text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">Failed — please try again.</p>}
          <button onClick={handleSendBlast}
            disabled={notifStatus==="sending"||!notifSubject.trim()||!notifMessage.trim()}
            className="ff-body inline-flex items-center justify-center gap-2 font-semibold text-sm py-2.5 rounded-full disabled:opacity-50"
            style={{ backgroundColor: TEAL, color: "#fff" }}>
            {notifStatus.startsWith("sending") ? <Loader2 size={14} className="animate-spin"/> : <><Send size={14}/> Send to all members</>}
          </button>
        </div>

        </> /* end bookings tab */}

        {/* ── MEMBERS TAB ── */}
        {adminTab === "members" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"/>
                <input value={memberQuery} onChange={e => setMQuery(e.target.value)}
                  placeholder="Search name, email or phone…"
                  className="ff-body w-full rounded-full border border-stone-200 pl-8 pr-3 py-1.5 text-xs focus:outline-none"/>
              </div>
              <button onClick={() => {
                const headers = ["Name","Email","Phone","Signed Up"];
                const rows = members.map(m => [m.name, m.email, m.phone||"", m.createdAt ? new Date(m.createdAt).toLocaleDateString("en-GB") : ""]);
                const csv = [headers,...rows].map(r => r.map(v => `"${String(v||"").replace(/"/g,"")}`).join(",")).join("\n");
                const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv],{type:"text/csv"})), download: "snb-members.csv" });
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
              }} className="ff-body inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-stone-200 bg-white text-stone-600 hover:bg-stone-50">
                <Download size={13}/> Export CSV
              </button>
            </div>

            <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="grid grid-cols-4 gap-4 px-4 py-2.5 bg-stone-50 border-b border-stone-100">
                {["Full Name","Email","Mobile","Signed Up"].map(h => (
                  <p key={h} className="ff-body text-xs font-semibold text-stone-500 uppercase tracking-wide">{h}</p>
                ))}
              </div>
              {members.length === 0 ? (
                <p className="ff-body text-sm text-stone-400 text-center py-12">No members yet.</p>
              ) : members
                .filter(m => !memberQuery || (m.name+" "+m.email+" "+(m.phone||"")).toLowerCase().includes(memberQuery.toLowerCase()))
                .slice().sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0))
                .map(m => (
                  <div key={m.id} className="grid grid-cols-4 gap-4 px-4 py-3 border-b border-stone-50 hover:bg-stone-50 transition last:border-0">
                    <p className="ff-body text-sm font-medium" style={{ color: INK }}>{m.name}</p>
                    <p className="ff-body text-sm text-stone-500 truncate">{m.email}</p>
                    <p className="ff-body text-sm text-stone-500">{m.phone || "—"}</p>
                    <p className="ff-body text-sm text-stone-500">
                      {m.createdAt ? new Date(m.createdAt).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}) : "—"}
                    </p>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* ── CLASSES TAB ── */}
        {adminTab === "classes" && (
          <div className="grid sm:grid-cols-2 gap-4">
            {DEFAULT_CLASSES.map(cls => {
              const Icon = ICONS[cls.icon] || Sparkles;
              const clsBookings = bookings
                .filter(b => b.sessionId === cls.id && b.status !== "cancelled")
                .sort((a,b) => new Date(a.createdAt||0) - new Date(b.createdAt||0));
              const pct = Math.min(100, cls.capacity ? (clsBookings.length / cls.capacity) * 100 : 0);
              const full = clsBookings.length >= cls.capacity;
              return (
                <div key={cls.id} className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                  {/* Class header */}
                  <div className="p-4 border-b border-stone-100 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ backgroundColor: cls.color + "1A" }}>
                        <Icon size={18} style={{ color: cls.color }}/>
                      </div>
                      <div>
                        <p className="ff-body font-semibold text-sm" style={{ color: INK }}>{cls.name}</p>
                        <p className="ff-body text-xs text-stone-400 mt-0.5">{cls.day} · {cls.time}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="ff-display text-2xl font-bold" style={{ color: full ? "#B3261E" : TEAL }}>
                        {clsBookings.length}
                      </p>
                      <p className="ff-body text-xs text-stone-400">of {cls.capacity}</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="px-4 pt-3 pb-2">
                    <div className="w-full bg-stone-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all"
                        style={{ width: pct + "%", backgroundColor: full ? "#B3261E" : cls.color }}/>
                    </div>
                    <p className="ff-body text-xs mt-1.5" style={{ color: full ? "#B3261E" : "#8A8478" }}>
                      {full ? "Class full" : `${cls.capacity - clsBookings.length} spaces remaining`}
                    </p>
                  </div>

                  {/* Registered members list */}
                  <div className="px-4 pb-4">
                    {clsBookings.length === 0 ? (
                      <p className="ff-body text-xs text-stone-400 py-2 text-center italic">No registrations yet</p>
                    ) : (
                      <div>
                        <p className="ff-body text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Registered</p>
                        <div className="flex flex-col divide-y divide-stone-50">
                          {clsBookings.map((b, i) => (
                            <div key={b.id} className="flex items-center justify-between py-2">
                              <div className="flex items-center gap-2">
                                <span className="ff-body text-xs text-stone-400 w-5 text-right shrink-0">{i+1}.</span>
                                <span className="ff-body text-sm font-medium" style={{ color: INK }}>{b.name}</span>
                              </div>
                              <span className="ff-body text-xs text-stone-400 truncate ml-2">{b.email}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

/* ---- MAIN APP ---- */

// ── Top-level router ─────────────────────────────────────────────────────────
// /admin  → AdminPage  (private, passcode protected)
// /       → BookingApp (public-facing booking site)
export default function App() {
  const path = window.location.pathname;
  if (path.startsWith("/admin"))   return <AdminPage/>;
  if (path.startsWith("/privacy")) return <PrivacyPage/>;
  if (path.startsWith("/terms"))   return <TermsPage/>;
  return <BookingApp/>;
}

function BookingApp() {
  const [currentUser, setCurrentUser]       = useState(null);
  const [authLoading, setAuthLoading]       = useState(true);
  const [tab, setTab]                       = useState("classes");
  const [bookings, setBookings]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [modalSession, setModalSession]     = useState(null);
  const [modalType, setModalType]           = useState(null);

  // Restore session on load — check expiry
  useEffect(() => {
    (async () => {
      try {
        const s = await storage.get("snb_session");
        if (s) {
          if (s.expiresAt && s.expiresAt < Date.now()) {
            await storage.remove("snb_session"); // expired — force re-login
          } else {
            setCurrentUser(s);
          }
        }
      } catch {}
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
    const plan = (b.plan || "").toLowerCase();
    if (plan.includes("membership") || plan.includes("taster")) return "membership";
    return "payg";
  }

  async function persist(next) { setBookings(next); await storage.set("bookings", next); }
  async function handleConfirmBooking(r) { await persist([...bookings, r]); }
  async function updateStatus(id, s)     { await persist(bookings.map(b => b.id===id ? {...b, status:s} : b)); }
  async function handleSignOut() {
    await storage.remove("snb_session");
    setCurrentUser(null); setBookings([]);
  }
  async function cancelMyBooking(id) {
    await persist(bookings.map(b => b.id===id ? {...b, status:"cancelled"} : b));
  }
  async function joinWaitlist(cls) {
    if (!currentUser) return;
    await persist([...bookings, {
      id:uid(), sessionId:cls.id, sessionName:cls.name, type:"class",
      userId:currentUser.id, name:currentUser.name, email:currentUser.email, phone:currentUser.phone,
      plan:"Waitlist", amount:0, status:"waitlisted", createdAt:new Date().toISOString(),
    }]);
    alert("You\'ve been added to the waitlist for " + cls.name + ". We\'ll contact you if a spot opens.");
  }

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

      <header className="sticky top-0 z-30 border-b border-stone-200" style={{ backgroundColor:BG }}>
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <div className="shrink-0 flex items-center gap-2">
            <img src={LOGO} alt="SNB Hive" style={{ height:"56px" }} onError={e => { e.target.style.display = "none"; }}/>
            <p className="ff-body text-xs text-stone-500 hidden sm:block">{BRAND.tagline}</p>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex gap-1 bg-stone-200 rounded-full p-1">
              {[["classes","Classes"],["retreats","Retreats"],["bookings","My bookings"],["account","Account"]].map(([k,label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className="ff-body text-sm font-medium px-3.5 py-1.5 rounded-full transition"
                  style={{ backgroundColor:tab===k?"#fff":"transparent", color:tab===k?INK:"#6B6457", boxShadow:tab===k?"0 1px 2px rgba(0,0,0,0.08)":"none" }}>
                  {label}
                </button>
              ))}
            </nav>
            <button onClick={handleSignOut} title="Sign out"
              className="p-2 rounded-full text-stone-400 hover:text-stone-600 hover:bg-stone-200 transition">
              <LogOut size={16}/>
            </button>
          </div>
        </div>
      </header>



      <main className="max-w-3xl mx-auto px-4 py-6">
        {loading
          ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-stone-400"/></div>
          : tab==="classes"
            ? <>
                <WelcomeHero currentUser={currentUser}/>
                {TASTER_MODE && TASTERS_CLOSED && (
                  <div className="rounded-xl px-4 py-3 mb-4 flex items-center gap-2.5" style={{ backgroundColor:"#F3E7E5", border:"1px solid #E3C4BE" }}>
                    <Bell size={15} style={{ color:"#9B3A2E" }}/>
                    <p className="ff-body text-sm" style={{ color:"#9B3A2E" }}>
                      Taster sessions are currently closed for new bookings. Check back soon!
                    </p>
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-4">
                  {DEFAULT_CLASSES.map(cls => (
                    <ClassCard key={cls.id} cls={cls} booked={bookedCount(cls.id)}
                      bookingType={getUserBookingType(cls.id)}
                      onBook={() => { setModalSession(cls); setModalType("class"); }}
                      onWaitlist={TASTER_MODE ? null : joinWaitlist}/>
                  ))}
                </div>
                <PilatesCard
                  bookedFri={bookedCount("pilates_fri")}
                  bookedThu={bookedCount("pilates_thu")}
                  bookingTypeFri={getUserBookingType("pilates_fri")}
                  bookingTypeThu={getUserBookingType("pilates_thu")}
                  onBook={session => { setModalSession(session); setModalType("class"); }}/>
              </>
            : tab==="retreats"
              ? <ComingSoon/>
              : tab==="account"
                ? <AccountPage currentUser={currentUser} onUpdate={s => setCurrentUser(s)}/>
                : <MyBookings bookings={bookings} currentUser={currentUser} onCancel={cancelMyBooking}/>
        }
      </main>



      {modalSession && (
        <BookingModal session={modalSession} type={modalType} currentUser={currentUser}
          onClose={() => setModalSession(null)} onConfirm={handleConfirmBooking}/>
      )}

    </div>
  );
}
