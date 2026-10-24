import { useEffect, useRef, useState } from "react";
import { classBookingSchedule, SELF_DEFENCE_DATES } from "../supabase/functions/_shared/class-config.ts";
import { selfDefenceQuote } from "../supabase/functions/_shared/self-defence.ts";
import { useBookingTime } from "./use-booking-day.js";

const formatDate = value => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric", timeZone:"Europe/London" });

export default function AdminAddMember({ session, date, kind, members, adminSession, invoke, onSaved, onClose, onReauthenticate }) {
  const dialog = useRef(null), requestId = useRef(crypto.randomUUID());
  const now = useBookingTime();
  const course = kind === "course";
  const dates = classBookingSchedule(session, now);
  const [selectedDate, setDate] = useState(course ? SELF_DEFENCE_DATES[0] : date);
  const [query, setQuery] = useState("");
  const [memberId, setMember] = useState("");
  const [payment, setPayment] = useState("complimentary");
  const [amount, setAmount] = useState(course ? (selfDefenceQuote(1, now).amount / 100).toFixed(2) : kind === "taster" ? "5.00" : "10.00");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [saved, setSaved] = useState(false), [needsLogin, setNeedsLogin] = useState(false);
  const payload = useRef(null);
  const expired = !adminSession?.accessToken || !(adminSession.expiresAt > Date.now()) || needsLogin;
  const matches = members.filter(member => `${member.name} ${member.email}`.toLowerCase().includes(query.trim().toLowerCase()));
  const available = course ? dates.length > 0 : dates.includes(selectedDate);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (busy || expired) return;
    if (!saved) {
      if (!members.some(member => member.id === memberId)) return setError("Choose a registered member.");
      if (!available) return setError("Choose a currently available lesson date.");
      if (payment === "paid" && (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > 10000)) return setError("Enter the amount already paid, up to £10,000.");
      payload.current = { request_id:requestId.current, member_id:memberId, session_id:session.id,
        booking_date:selectedDate, kind, amount_pence:payment === "paid" ? Math.round(Number(amount) * 100) : 0 };
    }
    setBusy(true); setError("");
    try {
      const result = await invoke("admin-class-booking", { ...payload.current, admin_token:adminSession.accessToken });
      setSaved(true);
      onSaved(result.booking);
      if (result.email_pending) setError("The place is saved, but confirmation emails could not be completed. Retry confirmation below; this will not add another place.");
      else onClose();
    } catch (failure) {
      if (/sign in.*again/i.test(failure.message)) setNeedsLogin(true);
      setError(failure.message || "The member could not be added. Please retry.");
    } finally { setBusy(false); }
  }

  return <dialog ref={dialog} aria-labelledby="add-member-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="ff-body w-[calc(100%-2rem)] max-w-lg max-h-[90dvh] rounded-2xl p-0 backdrop:bg-black/40">
    <form onSubmit={submit} aria-busy={busy} className="p-6 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 id="add-member-title" className="ff-display text-xl font-semibold">Add member — {session.name}{kind === "taster" ? " taster" : ""}</h2>
        <button type="button" disabled={busy} onClick={onClose} aria-label="Close add member" className="px-2 text-xl">×</button>
      </div>
      {expired ? <><p>Sign in again to add members securely.</p><button type="button" onClick={onReauthenticate} className="rounded-full bg-[#1F4A42] text-white px-4 py-2">Sign in again</button></> : <>
        <fieldset disabled={busy || saved} className="flex flex-col gap-4 disabled:opacity-70">
          <label className="text-sm">Search members
            <input autoFocus value={query} onChange={event => setQuery(event.target.value)} type="search" className="mt-1 block w-full rounded-lg border border-stone-300 p-2"/>
          </label>
          <label className="text-sm">Member
            <select required value={memberId} onChange={event => setMember(event.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 bg-white p-2">
              <option value="">Choose a member</option>
              {members.filter(member => member.id === memberId || matches.includes(member)).map(member => <option key={member.id} value={member.id}>{member.name} — {member.email}</option>)}
            </select>
          </label>
          {!matches.length && <p className="text-sm text-stone-500">No matching registered members.</p>}
          {course ? <div className="text-sm"><p>One place for the full three-week course:</p><ul>{SELF_DEFENCE_DATES.map(value => <li key={value}>{formatDate(value)}</li>)}</ul><p>{session.time}</p></div> :
            <label className="text-sm" htmlFor="manual-lesson-date">Lesson date
              <select id="manual-lesson-date" required value={selectedDate} onChange={event => setDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 bg-white p-2">
                {!dates.includes(selectedDate) && <option value="">Choose a date</option>}
                {dates.map(value => <option key={value} value={value}>{formatDate(value)}</option>)}
              </select><span aria-hidden="true" className="mt-1 block text-stone-500">{session.time}</span>
            </label>}
          <label className="text-sm">Payment record
            <select value={payment} onChange={event => setPayment(event.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 bg-white p-2">
              <option value="complimentary">Complimentary — no payment required</option>
              <option value="paid">Already paid separately</option>
            </select>
          </label>
          {payment === "paid" && <label className="text-sm">Amount already paid (£)
            <input type="number" required min="0.01" max="10000" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-stone-300 p-2"/>
          </label>}
        </fieldset>
        <p className="text-xs text-stone-500">One place will be reserved and a confirmation sent to the member and Shams. No GoCardless charge will be made.</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy || (!saved && (!memberId || !available))} className="rounded-full bg-[#1F4A42] text-white px-4 py-2 disabled:opacity-50">
          {busy ? "Saving…" : saved ? "Retry confirmation" : "Add member"}
        </button>
        {saved && <button type="button" disabled={busy} onClick={onClose}>Done</button>}
      </>}
    </form>
  </dialog>;
}
