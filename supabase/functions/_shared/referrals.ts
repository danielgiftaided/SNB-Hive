import { verifiedReferralReplacement } from "./referral-discounts.ts";
import { mixMatchRpc } from "./mix-match-storage.ts";
import { bookings, gc, type Booking } from "./gocardless-bookings.ts";

// The UI's Paid status means mandate setup, not bank collection. Referrals
// deliberately wait for the provider's actual confirmed/paid_out status.
export async function qualifyReferralPayment(paymentId: string, payment: { status:string; amount?:number; currency?:string; created_at?:string; metadata?:{booking_id?:string}; links?:{subscription?:string} }) {
  if (!["confirmed","paid_out"].includes(payment.status)) return;
  const reduction=(payment as any).metadata?.referral_discount_id ? await verifiedReferralReplacement(paymentId,payment) : null;
  const subscriptionId=payment.links?.subscription || reduction?.subscription_id;
  const subscription = subscriptionId ? (await gc(`/subscriptions/${encodeURIComponent(subscriptionId)}`)).subscriptions : null;
  let rootId = subscription?.metadata?.booking_id || payment.metadata?.booking_id;
  if (!rootId) {
    const [row] = await bookings({ gocardless_payment_id:`eq.${paymentId}`, select:"*", limit:"1" });
    rootId = row?.payment_group_id || row?.id;
  }
  if (!rootId) return;
  // Binding was recorded by checkout before the browser left the app; mutable
  // public booking rows cannot redirect a reward to a different member later.
  const binding = await mixMatchRpc("referral_checkout_for_booking", { p_booking_id:rootId });
  if (!binding) return;
  const { billing_requests:request } = await gc(`/billing_requests/${encodeURIComponent(binding.billing_request_id)}`);
  if (request.status !== "fulfilled" || request.metadata?.booking_id !== rootId || !["membership","mix_match"].includes(request.metadata?.payment_plan)) return;
  if (subscription) {
    const mandate = request.links?.mandate_request_mandate || request.mandate_request?.links?.mandate;
    if (!mandate || subscription.links?.mandate !== mandate || subscription.interval_unit !== "monthly" || Number(subscription.amount) !== 3500 || subscription.currency !== "GBP") return;
  } else if ((request.links?.payment_request_payment || request.payment_request?.links?.payment) !== paymentId) return;
  if ((!subscription && Number(request.payment_request?.amount) !== Number(payment.amount)) || (subscription && Number(payment.amount) !== (reduction ? 2625 : 3500)) || !payment.created_at) return;
  await mixMatchRpc("award_referral_reward", { p_details:{ billing_request_id:binding.billing_request_id,
    payment_id:paymentId,status:payment.status,amount:payment.amount,currency:payment.currency,created_at:payment.created_at } });
  await sendReferralRewardNotices(undefined,paymentId);
}

export async function sendReferralBookingNotice(booking: Booking) {
  if (booking.booking_confirmation_sent_at || booking.status === "cancelled") return;
  const base = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const response = await fetch(`${base}/functions/v1/send-email`, { method:"POST", headers:{ apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json" },
    body:JSON.stringify({ ...booking,type:"booking_confirmation",booking_dates:booking.booking_date }) });
  if (!response.ok) throw new Error("Referral booking confirmation email could not be sent");
  await bookings({ id:`eq.${booking.id}` }, { method:"PATCH",body:JSON.stringify({ booking_confirmation_sent_at:new Date().toISOString() }) });
}

export async function referralHash(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  return [...bytes].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

export async function sendReferralRewardNotices(memberId?:string,paymentId?:string) {
  const notices=await mixMatchRpc("referral_reward_notices",{p_member_id:memberId||null,p_payment_id:paymentId||null});
  const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  for(const notice of notices) {
    const response=await fetch(`${base}/functions/v1/send-email`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({type:"referral_reward",reward_id:notice.id,to_email:notice.email,to_name:notice.name})});
    if(!response.ok)throw new Error("Referral reward email could not be sent");
    await mixMatchRpc("mark_referral_reward_notice",{p_credit_id:notice.id});
  }
}
