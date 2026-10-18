import { useEffect, useState } from "react";
import { Gift, Copy, Share2, Loader2 } from "lucide-react";
import { classPaymentConfig } from "../supabase/functions/_shared/class-config.ts";
import { useBookingTime } from "./use-booking-day.js";
import { useCheckoutPolicy } from "./use-checkout-policy.jsx";
import { referralLink, referralAccess, saveReferralAccess, clearReferralAccess } from "./referrals.js";

const dateLabel = date => new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`));
export default function ReferralScheme({ user, invoke, onBooked, creditsOnly=false, refreshKey="" }) {
  const [token,setToken]=useState(()=>referralAccess(user.id)), [code,setCode]=useState(""), [sent,setSent]=useState(false), [checking,setChecking]=useState(false);
  const [data,setData]=useState(null), [error,setError]=useState(""), [message,setMessage]=useState("");
  const [loading,setLoading]=useState(true), [saving,setSaving]=useState(false);
  const [useFor,setUseFor]=useState("lesson"), [membership,setMembership]=useState("");
  const [credit,setCredit]=useState(""), [session,setSession]=useState("zumba"), [date,setDate]=useState("");
  const now=useBookingTime(), dates=classPaymentConfig(session,now)?.dates || [];
  const {requestPolicy,policyDialog}=useCheckoutPolicy({confirmationLabel:"Book free lesson"});
  async function load(accessToken=token) {
    if (!accessToken) {setLoading(false);return;}
    setLoading(true);setError("");
    try { setData(await invoke("referral-scheme",{action:"dashboard",member_id:user.id,access_token:accessToken})); }
    catch(e) {
      if(e.message.includes("Verify your email to access")){clearReferralAccess(user.id);setToken("");setData(null);setSent(false);}
      else setError(e.message);
    }
    finally { setLoading(false); }
  }
  useEffect(()=>{const refresh=()=>load();refresh();window.addEventListener("focus",refresh);return()=>window.removeEventListener("focus",refresh);},[user.id,token,refreshKey]);
  async function requestCode() {
    setChecking(true);setError("");setMessage("");
    try {await invoke("referral-scheme",{action:"request_access",member_id:user.id});setSent(true);setMessage("A six-digit code has been sent to your account email.");}
    catch(e){setError(e.message);}finally{setChecking(false);}
  }
  async function verifyCode() {
    setChecking(true);setError("");
    try {
      const result=await invoke("referral-scheme",{action:"verify_access",member_id:user.id,code});
      saveReferralAccess(user.id,result.access_token);setToken(result.access_token);setCode("");setMessage("");
    }catch(e){setError(e.message);}finally{setChecking(false);}
  }
  useEffect(()=>{
    if(!data)return;
    if(!data.memberships?.some(item=>item.id===membership))setMembership("");
    if(!data.memberships?.length)setUseFor("lesson");
  },[data]);
  useEffect(()=>{if(date && !dates.includes(date))setDate("");},[session,now]);
  async function copy(value,label) {
    try { await navigator.clipboard.writeText(value);setMessage(`${label} copied.`); }
    catch { setMessage(`Copy your ${label.toLowerCase()} from the box above.`); }
  }
  async function share() {
    const url=referralLink(data.code);
    if (!navigator.share) return copy(url,"Referral link");
    try {await navigator.share({title:"Join me at SNB Hive",text:"Join SNB Hive using my referral link. When your first monthly membership payment is confirmed, I receive a free Zumba or BoxFit lesson.",url});}
    catch(e){if(e.name!=="AbortError")setMessage("You can copy your referral link instead.");}
  }
  async function redeem() {
    if(saving || !credit || (useFor === "membership" ? !membership : !dates.includes(date)))return;
    setSaving(true);setError("");setMessage("");
    try {
      if(useFor === "membership") {
        const result=await invoke("referral-scheme",{action:"membership_credit",member_id:user.id,access_token:token,credit_id:credit,subscription_id:membership});
        const month=new Intl.DateTimeFormat("en-GB",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${result.discount.month.slice(0,7)}-01T12:00:00Z`));
        setCredit("");setMessage(`Your credit is assigned to your ${month} membership payment: £26.25 instead of £35. Later months remain £35.`);
        await load();onBooked?.();return;
      }
      if(!await requestPolicy())return;
      const result=await invoke("referral-scheme",{action:"redeem",member_id:user.id,access_token:token,credit_id:credit,session_id:session,booking_date:date});
      setCredit("");setDate("");
      setMessage(`Your free lesson is booked. See My bookings for the details.${result.email_pending ? " Your confirmation email is delayed; we will retry when you visit this tab." : " Confirmation emails have been sent to you and Shams."}`);
      await load();onBooked?.();
    }catch(e){setError(e.message);}finally{setSaving(false);}
  }
  async function changeMembershipCredit(discount,release) {
    setSaving(true);setError("");setMessage("");
    try {
      await invoke("referral-scheme",{action:release?"release_membership_credit":"membership_credit",member_id:user.id,access_token:token,credit_id:discount.id,subscription_id:discount.subscription_id});
      if(release){setUseFor("lesson");setMembership("");setCredit(discount.id);}
      setMessage(release?"Your credit is available again for a free Zumba or BoxFit lesson.":"Your reduced payment has been checked. See its status below.");
      await load();onBooked?.();
    }catch(e){setError(e.message);}finally{setSaving(false);}
  }
  return <section className="ff-body space-y-5" aria-labelledby={creditsOnly ? "booking-credit-title" : "referral-title"}>
    <div><h1 id={creditsOnly ? "booking-credit-title" : "referral-title"} className="ff-display text-2xl font-semibold text-stone-800">{creditsOnly ? "Your referral credits" : "Referral Scheme"}</h1>
      <p className="mt-2 text-sm text-stone-600">{creditsOnly ? "Use your free Pay as you go credit for Zumba or BoxFit, or reduce an eligible monthly payment by £8.75." : "Invite a friend to the Hive. When their first monthly membership payment is confirmed, you earn a free Zumba or BoxFit lesson."}</p></div>
    {!token && <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
      <h2 className="ff-display text-xl font-semibold">Verify access to your rewards</h2>
      <p className="text-sm text-stone-600">We’ll email a code to your account address to protect your free lesson credits. You only need to do this once per browser session.</p>
      {sent && <div><label htmlFor="referral-access-code" className="text-sm font-medium">Referral access code</label><input id="referral-access-code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} className="mt-1 w-full rounded-xl border border-stone-200 p-3 text-sm"/>
        <button onClick={verifyCode} disabled={checking || code.length!==6} className="mt-3 min-h-11 rounded-full bg-[#4b5d4e] px-5 text-sm font-semibold text-white disabled:opacity-50">{checking?"Checking…":"Verify referral access"}</button></div>}
      <button onClick={requestCode} disabled={checking} className="min-h-11 rounded-full border border-stone-300 px-5 text-sm disabled:opacity-50">{sent?"Resend access code":"Email me an access code"}</button>
    </div>}
    {loading && !data && <Loader2 aria-label="Loading referrals" className="animate-spin text-stone-400"/>}
    {data && <>
      {!creditsOnly && <><div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-4">
        <div className="flex items-center gap-2 text-[#4b5d4e]"><Gift size={22}/><h2 className="ff-display text-xl font-semibold">Share the Hive</h2></div>
        <p className="text-sm text-stone-600">Your friend can register through your link and their referral code will be filled in automatically. They can also enter your code when registering.</p>
        <div><label htmlFor="referral-link" className="text-sm font-medium">Your referral link</label>
          <input id="referral-link" readOnly value={referralLink(data.code)} className="mt-1 w-full min-w-0 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm" onFocus={e=>e.target.select()}/></div>
        <div className="flex flex-wrap gap-3">
          <button onClick={()=>copy(referralLink(data.code),"Referral link")} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-stone-300 px-4 text-sm"><Copy size={16}/>Copy link</button>
          <button onClick={share} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#4b5d4e] px-4 text-sm font-semibold text-white"><Share2 size={16}/>Share invitation</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm"><span>Your code: <strong className="tracking-wide">{data.code}</strong></span><button onClick={()=>copy(data.code,"Referral code")} className="min-h-11 underline">Copy code</button></div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center" aria-label="Your referral progress">
        {[["Pending",data.pending],["Rewards earned",data.earned],["Free lessons",data.credits.length]].map(([label,count])=><div key={label} className="rounded-xl border border-stone-200 bg-white px-2 py-4"><strong className="block text-2xl text-[#4b5d4e]">{count}</strong><span className="text-xs text-stone-600">{label}</span></div>)}
      </div>
      </>}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
        <h2 className="ff-display text-xl font-semibold">Free Pay as you go credits</h2>
        {data.credits.length===0 ? <p className="text-sm text-stone-600">{data.discounts?.length ? "Your credit is assigned to a membership payment. See the details below." : data.earned > 0 ? "You’ve used your available free lessons. New rewards will appear here after another friend’s first membership payment is confirmed." : "Your rewards will appear here once GoCardless confirms a referred friend’s first membership payment. Confirmation can take a few working days."}</p> : <>
          <p className="text-sm text-stone-600">Use one credit for a free regular Zumba or BoxFit lesson. If you already have that class in a monthly membership, you can reduce an eligible membership payment from £35 to £26.25 instead. Mix & Match is included.</p>
          <div><label htmlFor="referral-credit" className="text-sm font-medium">Free lesson credit</label><select id="referral-credit" value={credit} onChange={e=>setCredit(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 p-3 text-sm"><option value="">Choose a credit</option>{data.credits.map((c,i)=><option key={c.id} value={c.id}>Free lesson {i+1}</option>)}</select></div>
          <fieldset className="space-y-2"><legend className="text-sm font-medium mb-2">Use this credit for</legend>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="credit-use" value="lesson" checked={useFor==="lesson"} onChange={()=>setUseFor("lesson")}/>A free Zumba or BoxFit lesson</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="credit-use" value="membership" checked={useFor==="membership"} onChange={()=>setUseFor("membership")} disabled={!data.memberships?.length}/>£8.75 off one monthly membership payment</label>
          </fieldset>
          {data.membership_error && <p className="text-xs text-amber-800">Your free lesson is available, but memberships could not be checked: {data.membership_error}</p>}
          {useFor==="membership" ? <>
            <label htmlFor="referral-membership" className="text-sm font-medium block">Membership and month</label>
            <select id="referral-membership" value={membership} onChange={e=>setMembership(e.target.value)} className="w-full rounded-xl border border-stone-200 p-3 text-sm"><option value="">Choose a membership</option>{data.memberships?.map(m=><option key={m.id} value={m.id}>{m.name} — {new Intl.DateTimeFormat("en-GB",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${m.month}-01T12:00:00Z`))} — £26.25</option>)}</select>
            <p className="text-xs text-stone-500">One credit reduces one monthly collection by £8.75. Your usual classes stay included and later payments remain £35. If bank processing has already started, the next eligible month is used.</p>
          </> : <>
          <div><label htmlFor="referral-class" className="text-sm font-medium">Class</label><select id="referral-class" value={session} onChange={e=>{setSession(e.target.value);setDate("");}} className="mt-1 w-full rounded-xl border border-stone-200 p-3 text-sm"><option value="zumba">Zumba — Fridays, 12:00–13:00</option><option value="boxfit">BoxFit — Thursdays, 13:00–14:00</option></select></div>
          <p className="text-xs text-stone-500">Hackney Central</p>
          <div><label htmlFor="referral-date" className="text-sm font-medium">Lesson date</label><select id="referral-date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-200 p-3 text-sm"><option value="">Choose a date</option>{dates.map(d=><option key={d} value={d}>{dateLabel(d)}</option>)}</select></div>
          </>}
          <button disabled={saving || !credit || (useFor==="membership" ? !membership : !date)} onClick={redeem} className="min-h-11 rounded-full bg-[#4b5d4e] px-5 text-sm font-semibold text-white disabled:opacity-50">{saving?"Saving…":useFor==="membership"?"Apply £8.75 membership credit":"Book free lesson"}</button>
        </>}
      </div>
      {!!data.discounts?.length && <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
        <h2 className="ff-display text-xl font-semibold">Membership credits</h2>
        {data.discounts.map(d=><div key={d.id} className="text-sm text-stone-600"><strong>{d.session_id==="mix_match"?"Mix & Match":d.session_id==="zumba"?"Zumba":"BoxFit"} — {new Intl.DateTimeFormat("en-GB",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(`${d.month}-01T12:00:00Z`))}</strong><p>£26.25 instead of £35 · {d.state==="applied"?"Credit applied":d.state==="queued"?"Credit reserved for this payment":"Reduced payment processing"}</p>{d.note && <p className="mt-1 text-xs">{d.note}</p>}{d.state==="queued" && <button onClick={()=>changeMembershipCredit(d,true)} disabled={saving} className="mt-2 min-h-11 text-xs underline disabled:opacity-50">Use this credit for a lesson instead</button>}{d.state==="cancelling" && <button onClick={()=>changeMembershipCredit(d,false)} disabled={saving} className="mt-2 min-h-11 text-xs underline disabled:opacity-50">Retry reduced payment</button>}</div>)}
      </div>}
      <p className="text-xs leading-relaxed text-stone-500">For new registrations only. Single-class monthly memberships and Mix &amp; Match qualify. One reward per referred member, after their first confirmed payment; Pay as you go, tasters and Self Defence purchases do not qualify. Self-referrals are excluded. A credit can be used once, for a lesson or one £8.75 membership reduction. Rewards are personal, have no cash value and can be used subject to class availability. For a free lesson booked with this credit, cancel at least 24 hours before the class to have the credit returned.</p>
    </>}
    {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} <button onClick={()=>load()} disabled={loading || !token} className="underline">Refresh referrals</button></div>}
    {message && <p role="status" className="rounded-xl bg-[#e9f1ec] p-3 text-sm text-[#4b5d4e]">{message}</p>}
    {policyDialog}
  </section>;
}
