import { useEffect, useState } from "react";
import storage from "./storage.js";
import { EMAIL_MARKETING_COPY, WHATSAPP_MARKETING_COPY, WHATSAPP_PRIVACY_COPY, WHATSAPP_GROUP_URL, emailMarketingEligible } from "./marketing.js";

export function marketingSnapshot(user) {
  return Object.fromEntries(Object.entries(user).filter(([key]) => key.startsWith("marketing")));
}

export function MarketingChoices({ choices, onChange, disabled = false, registration = false }) {
  return <fieldset disabled={disabled} className="ff-body flex flex-col gap-3">
    <legend className="mb-2 text-sm font-medium text-stone-700">Stay in touch{registration ? "" : " (optional)"}</legend>
    <label className="flex items-start gap-2.5 text-xs text-stone-600 leading-relaxed cursor-pointer">
      <input name="emailMarketing" type="checkbox" checked={choices.email} onChange={event => onChange({ ...choices, email:event.target.checked })} className="mt-0.5 shrink-0"/>
      <span>{EMAIL_MARKETING_COPY}</span>
    </label>
    <label className="flex items-start gap-2.5 text-xs text-stone-600 leading-relaxed cursor-pointer">
      <input name="whatsappMarketing" type="checkbox" checked={choices.whatsapp} onChange={event => onChange({ ...choices, whatsapp:event.target.checked })} aria-describedby={registration ? undefined : "whatsapp-privacy"} className="mt-0.5 shrink-0"/>
      <span>{WHATSAPP_MARKETING_COPY}</span>
    </label>
    {!registration && <p id="whatsapp-privacy" className="text-xs text-stone-500">{WHATSAPP_PRIVACY_COPY}</p>}
    {!registration && <p className="text-xs text-stone-500">Both choices are optional. Change them in Account at any time or use the unsubscribe link in marketing emails. Booking emails will still be sent.</p>}
  </fieldset>;
}

export function WhatsAppInvitation({ user }) {
  if (user?.marketingWhatsappOptIn !== true) return null;
  return <section aria-label="WhatsApp invitation" className="ff-body rounded-2xl border border-stone-200 bg-white p-5 mb-4 text-sm text-stone-600">
    <h3 className="ff-display text-lg font-semibold text-stone-800">Join the SNB Hive WhatsApp group</h3>
    <p className="mt-2">You asked to join our group for class news, events and offers. Joining is optional.</p>
    <p className="mt-2 text-xs">{WHATSAPP_PRIVACY_COPY}</p>
    {WHATSAPP_GROUP_URL ? <a href={WHATSAPP_GROUP_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-full bg-[#4b5d4e] px-4 py-2.5 font-semibold text-white">Join WhatsApp group</a>
      : <p className="mt-3">Your preference is saved. The group invitation will be available here soon.</p>}
    <p className="mt-2 text-xs">Manage this choice in Account. If you have already joined, leave the group in WhatsApp to stop receiving its messages.</p>
  </section>;
}

export default function MarketingPreferences({ user, onChange }) {
  const [saved, setSaved] = useState(null);
  const [choices, setChoices] = useState({ email:false, whatsapp:false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function load() {
    setError(""); setBusy(true);
    try {
      const latest = await storage.getUser(user.id);
      setSaved(latest); setChoices({ email:latest.marketingEmailOptIn === true, whatsapp:latest.marketingWhatsappOptIn === true });
    } catch { setError("Couldn't load your communication preferences. Please retry."); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, [user.id]);
  async function save() {
    setMessage(""); setError(""); setBusy(true);
    try {
      if (choices.email === (saved.marketingEmailOptIn === true) && choices.whatsapp === (saved.marketingWhatsappOptIn === true) && !(choices.email && !emailMarketingEligible(saved))) {
        setMessage("No changes to save."); return;
      }
      // Write only the channel the member actually changed. Editing WhatsApp
      // must not undo an email unsubscribe made on another device.
      const changes = { marketingConsentSource:"account" };
      if (choices.email !== (saved.marketingEmailOptIn === true)) {
        changes.marketingEmailOptIn = choices.email;
        changes.marketingEmailConfirmedAt = choices.email ? new Date().toISOString() : null;
      }
      if (choices.email && !emailMarketingEligible(saved)) changes.marketingEmailConfirmedAt = new Date().toISOString();
      if (choices.whatsapp !== (saved.marketingWhatsappOptIn === true)) changes.marketingWhatsappOptIn = choices.whatsapp;
      const updated = await storage.updateMarketingPreferences(user.id, changes);
      setSaved(updated); setChoices({ email:updated.marketingEmailOptIn === true, whatsapp:updated.marketingWhatsappOptIn === true });
      await onChange(updated);
      setMessage("Your communication preferences have been saved.");
    } catch { setError("Couldn't save your preferences. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm flex flex-col gap-3">
    <h3 className="ff-display text-base font-semibold text-stone-800">Communication preferences</h3>
    <MarketingChoices choices={choices} onChange={setChoices} disabled={busy || !saved}/>
    {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    {!saved && error && <button onClick={load} className="text-sm underline">Retry preferences</button>}
    {message && <p role="status" className="text-xs text-green-700">{message}</p>}
    <button onClick={save} disabled={busy || !saved} className="ff-body rounded-full bg-[#4b5d4e] py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save preferences"}</button>
    {saved?.marketingWhatsappOptIn === true && <WhatsAppInvitation user={saved}/>}
    <p className="text-xs text-stone-500">Turning off WhatsApp here does not remove you from a group you have already joined. Leave the group in WhatsApp to stop its messages.</p>
  </section>;
}
