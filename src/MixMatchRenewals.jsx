import { useEffect, useRef, useState } from "react";
import MixMatchDates from "./MixMatchDates.jsx";
import { useBookingTime } from "./use-booking-day.js";
import { useCheckoutPolicy } from "./use-checkout-policy.jsx";
import { bookingToday } from "../supabase/functions/_shared/class-config.ts";
import { MIX_MATCH_CLASS_IDS, isMixMatchPlan, mixMatchDates, mixMatchSelectionIssue } from "../supabase/functions/_shared/mix-match.ts";
import { bookingBelongsToUser, customerBookingIsVisible } from "./booking-utils.js";

function RenewalDateDialog({ membership, user, invoke, onClose, onSaved }) {
  const dialog = useRef(null);
  const now = useBookingTime();
  const [selection, setSelection] = useState({ zumba:[], boxfit:[] });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const { requestPolicy, policyDialog } = useCheckoutPolicy({ confirmationLabel:"Confirm class dates" });
  useEffect(() => { dialog.current.showModal(); }, []);
  useEffect(() => {
    setSelection(previous => Object.fromEntries(MIX_MATCH_CLASS_IDS.map(id => [id, previous[id].filter(date => mixMatchDates(id, membership.month, now).includes(date))])));
  }, [now, membership.month]);
  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (!await requestPolicy()) return;
      const choices = MIX_MATCH_CLASS_IDS.flatMap(session_id => selection[session_id].map(booking_date => ({ session_id, booking_date })));
      const result = await invoke("mix-match-membership", { action:"select", member_id:user.id, membership_id:membership.id, choices });
      if (!result.success) throw new Error("Your dates could not be confirmed. Please retry.");
      await onSaved(result); onClose();
    } catch(error) { setError(error.message || "Your dates could not be saved. Please retry."); }
    finally { setBusy(false); }
  }
  return <>
    <dialog ref={dialog} aria-label="Choose Mix & Match renewal dates" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} className="ff-body m-auto w-[calc(100%-2rem)] max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-xl backdrop:bg-black/40">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="ff-display text-xl font-semibold text-stone-800">Your Mix &amp; Match dates</h2><button onClick={onClose} disabled={busy} aria-label="Close renewal dates" className="text-sm text-stone-500">Close</button></div>
      <MixMatchDates month={membership.month} selection={selection} now={now} fixedMonth onMonthChange={() => {}} onSelectionChange={setSelection}/>
      <p className="mt-4 text-sm text-stone-600">Your monthly payment covers these four classes. There is no additional charge.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <button disabled={busy || !!mixMatchSelectionIssue(selection, membership.month, now)} onClick={save} className="mt-4 w-full rounded-full bg-[#4b5d4e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save class dates"}</button>
    </dialog>
    {policyDialog}
  </>;
}

export default function MixMatchRenewals({ user, bookings, invoke, onSaved }) {
  const [months, setMonths] = useState([]), [editing, setEditing] = useState(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const key = bookings.filter(booking => isMixMatchPlan(booking.plan) && bookingBelongsToUser(booking, user) && customerBookingIsVisible(booking)).map(booking => booking.id).sort().join("|");
  async function refresh() {
    if (!key) return;
    try { const result = await invoke("mix-match-membership", { action:"list", member_id:user.id }); setMonths(result.months || []); setError(""); }
    catch { setError("We couldn't load your Mix & Match dates. Please retry."); }
  }
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!key) { if (active) setMonths([]); return; }
      try { const result = await invoke("mix-match-membership", { action:"list", member_id:user.id }); if (active) { setMonths(result.months || []); setError(""); } }
      catch { if (active) setError("We couldn't load your Mix & Match dates. Please retry."); }
    };
    load(); window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, [user.id, key]);
  const pending = months.filter(month => !month.selected_at && month.month >= bookingToday().slice(0, 7));
  if (!pending.length && !error && !notice) return null;
  return <section aria-label="Mix & Match membership" className="ff-body mb-4 rounded-2xl border border-stone-200 bg-white p-5">
    <h3 className="ff-display text-lg font-semibold text-stone-800">Mix &amp; Match membership</h3>
    {pending.map(month => <div key={month.id} className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-stone-600">Choose your 2 Zumba and 2 BoxFit classes for {new Intl.DateTimeFormat("en-GB", { month:"long", year:"numeric", timeZone:"Europe/London" }).format(new Date(`${month.month}-01T12:00:00Z`))}.</p>
      <button onClick={() => setEditing(month)} className="rounded-full bg-[#4b5d4e] px-4 py-2.5 text-sm font-semibold text-white">Choose dates</button>
    </div>)}
    {error && <div role="alert" className="mt-3 text-sm text-red-600">{error} <button onClick={refresh} className="underline">Retry</button></div>}
    {notice && <p role="status" className="mt-3 text-sm text-stone-600">{notice}</p>}
    {editing && <RenewalDateDialog membership={editing} user={user} invoke={invoke} onClose={() => setEditing(null)} onSaved={async result => {
      setMonths(current => current.filter(month => month.id !== result.id));
      setNotice(result.email_pending ? "Your classes are booked. The confirmation email is delayed; contact Shams if you need help." : "Your four classes are booked. Confirmation emails have been sent.");
      await onSaved?.();
    }}/>}
  </section>;
}
