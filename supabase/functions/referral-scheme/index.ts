import { referralMembershipOptions, applyReferralMembershipCredit, discountState } from "../_shared/referral-discounts.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { mixMatchRpc } from "../_shared/mix-match-storage.ts";
import { classPaymentConfig } from "../_shared/class-config.ts";
import { bookings } from "../_shared/gocardless-bookings.ts";
import { sendReferralBookingNotice, sendReferralRewardNotices, referralHash } from "../_shared/referrals.ts";

// Dashboard/redemption require an opaque token issued after a server-generated
// email challenge. A browser member ID/session alone cannot spend credits.
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers:corsHeaders });
  if (request.method !== "POST") return json({ error:"Method not allowed" },405);
  try {
    const p = await request.json();
    if (typeof p.member_id !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(p.member_id)) return json({ error:"Invalid member reference" },400);
    if (p.action === "request_access") {
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6,"0");
      const recipient = await mixMatchRpc("prepare_referral_access", { p_member_id:p.member_id,p_code_hash:await referralHash(`${p.member_id}:${code}`) });
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, { method:"POST",headers:{Authorization:`Bearer ${key}`,apikey:key,"Content-Type":"application/json"},
        body:JSON.stringify({ type:"referral_access",to_email:recipient.email,to_name:recipient.name,code }) });
      if (!response.ok) throw new Error("Could not send your referral access code. Please wait one minute and try again.");
      return json({ success:true });
    }
    if (p.action === "verify_access") {
      if (typeof p.code !== "string" || !/^\d{6}$/.test(p.code)) return json({ error:"Enter the six-digit code from your email" },400);
      const token = [...crypto.getRandomValues(new Uint8Array(32))].map(byte=>byte.toString(16).padStart(2,"0")).join("");
      const verified = await mixMatchRpc("verify_referral_access", { p_member_id:p.member_id,p_code_hash:await referralHash(`${p.member_id}:${p.code}`),p_token_hash:await referralHash(token) });
      if (!verified) return json({ error:"Incorrect or expired code. Request a new code after five attempts." },400);
      return json({ success:true,access_token:token });
    }
    if (typeof p.access_token !== "string" || !/^[a-f0-9]{64}$/.test(p.access_token) || !await mixMatchRpc("authorize_referral_access",{p_member_id:p.member_id,p_token_hash:await referralHash(p.access_token)})) return json({ error:"Verify your email to access your referral rewards",requires_verification:true },401);
    if (p.action === "sign_out") {
      await mixMatchRpc("revoke_referral_access",{p_member_id:p.member_id,p_token_hash:await referralHash(p.access_token)});
      return json({success:true});
    }
    if (p.action === "dashboard") {
      const dashboard = await mixMatchRpc("referral_dashboard", { p_member_id:p.member_id });
      if (!dashboard) return json({ error:"Member account not found" },404);
      // Retry a missed confirmation without making another reservation.
      const pending = await bookings({ user_id:`eq.${p.member_id}`,plan:"eq.Referral reward",status:"eq.confirmed",booking_confirmation_sent_at:"is.null",select:"*" });
      for (const row of pending) { try { await sendReferralBookingNotice(row); } catch { /* Retry on next visit. */ } }
      let noticePending=false;
      try {await sendReferralRewardNotices(p.member_id);} catch {noticePending=true;}
      const discounts=await discountState("list",{member_id:p.member_id});
      let memberships=[],membershipError="";
      if(dashboard.credits.length) {
        try {memberships=await referralMembershipOptions(p.member_id);} catch(error) {membershipError=error instanceof Error?error.message:"Memberships could not be checked";}
      }
      return json({...dashboard,discounts,memberships,membership_error:membershipError,reward_email_pending:noticePending});
    }
    if(p.action==="release_membership_credit") {
      if(typeof p.credit_id!=="string"||!/^[a-f0-9-]{36}$/i.test(p.credit_id))return json({error:"Choose a membership credit"},400);
      await discountState("release",{member_id:p.member_id,credit_id:p.credit_id});
      return json({success:true});
    }
    if(p.action==="membership_credit") {
      if(typeof p.credit_id!=="string"||!/^[a-f0-9-]{36}$/i.test(p.credit_id)||typeof p.subscription_id!=="string"||!/^SB[a-zA-Z0-9_-]+$/.test(p.subscription_id))return json({error:"Choose a free credit and an eligible membership"},400);
      const job=await applyReferralMembershipCredit(p.member_id,p.credit_id,p.subscription_id);
      return json({success:true,discount:job});
    }
    if (p.action !== "redeem" || typeof p.credit_id !== "string" || !/^[a-f0-9-]{36}$/i.test(p.credit_id) ||
      typeof p.booking_date !== "string" || !classPaymentConfig(p.session_id)?.dates.includes(p.booking_date)) return json({ error:"Choose an available Zumba or BoxFit date" },400);
    const saved = await mixMatchRpc("redeem_referral_reward", { p_member_id:p.member_id,p_credit_id:p.credit_id,p_session_id:p.session_id,p_booking_date:p.booking_date });
    const [row] = await bookings({ id:`eq.${saved.booking_id}`,user_id:`eq.${p.member_id}`,select:"*",limit:"1" });
    if (!row) throw new Error("Your booking could not be found. Refresh before trying again.");
    let emailPending = false;
    try { await sendReferralBookingNotice(row); } catch { emailPending = true; }
    return json({ ...saved,success:true,email_pending:emailPending });
  } catch(error) { return json({ error:error instanceof Error ? error.message : "Referral scheme could not be loaded" },400); }
});
