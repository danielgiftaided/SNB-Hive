import { corsHeaders, json } from "../_shared/http.ts";
import { mixMatchRpc } from "../_shared/mix-match-storage.ts";
import { MIX_MATCH_CLASS_IDS, mixMatchSelectionIssue, type MixMatchSelection } from "../_shared/mix-match.ts";
import { sendBookingNotice } from "../_shared/gocardless-bookings.ts";

// Uses the same custom member-session identity as Account preferences. Payment
// entitlements are private and can only be funded by the verified GC service.
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers:corsHeaders });
  if (request.method !== "POST") return json({ error:"Method not allowed" }, 405);
  try {
    const payload = await request.json();
    if (typeof payload.member_id !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(payload.member_id)) return json({ error:"Invalid member reference" }, 400);
    if (payload.action === "list") {
      return json({ months:await mixMatchRpc("mix_match_months_for_member", { p_member_id:payload.member_id }) });
    }
    if (payload.action !== "select" || typeof payload.membership_id !== "string" || !Array.isArray(payload.choices)) return json({ error:"Invalid membership date selection" }, 400);
    const months = await mixMatchRpc("mix_match_months_for_member", { p_member_id:payload.member_id });
    const month = months.find((item: { id:string }) => item.id === payload.membership_id);
    if (!month) return json({ error:"This paid membership is not available for this member" }, 400);
    if (!month.selected_at) {
      if (payload.choices.length !== 4 || payload.choices.some((choice: { session_id:unknown }) => !MIX_MATCH_CLASS_IDS.includes(choice?.session_id as "zumba" | "boxfit"))) return json({ error:"Choose two Zumba and two BoxFit dates" }, 400);
      const selection = Object.fromEntries(MIX_MATCH_CLASS_IDS.map(id => [id,payload.choices.filter((choice: {session_id:string}) => choice.session_id === id).map((choice: {booking_date:string}) => choice.booking_date)])) as MixMatchSelection;
      const issue = mixMatchSelectionIssue(selection, month.month);
      if (issue) return json({ error:issue }, 400);
    }
    const saved = await mixMatchRpc("select_mix_match_dates", { p_member_id:payload.member_id, p_membership_id:payload.membership_id, p_choices:payload.choices });
    let emailPending = false;
    try { await sendBookingNotice(saved.payment_id, "booking_confirmation"); }
    catch { emailPending = true; }
    return json({ success:true, ...saved, email_pending:emailPending });
  } catch(error) {
    const message = error instanceof Error ? error.message : "Membership dates could not be saved";
    return json({ error:message }, 400);
  }
});
