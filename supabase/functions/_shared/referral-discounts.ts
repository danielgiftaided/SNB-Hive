import { mixMatchRpc } from "./mix-match-storage.ts";
import { bookings, gc } from "./gocardless-bookings.ts";
import { bookingToday } from "./class-config.ts";

export const REFERRAL_SAVING = 875;
export const REFERRAL_RENEWAL_AMOUNT = 2625;
const names: Record<string,string> = { zumba:"Zumba",boxfit:"BoxFit",mix_match:"Mix & Match" };
export const discountState = (action:string,details:Record<string,unknown>) => mixMatchRpc("referral_discount_state",{p_action:action,p_details:details});
const nextMonth = (month:string) => new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),1,12)).toISOString().slice(0,7);

// GET-only discovery. Public booking rows are merely search hints; mandate
// customer email must match the private registration email before any billing
// action is offered. The user's £35 subscription is never amended or paused.
async function listProvider(resource:string) {
  const rows:any[]=[];let after="";
  for(let page=0;page<20;page++) {
    const result=await gc(`/${resource}?${new URLSearchParams({limit:"100",...(after?{after}:{})})}`);
    rows.push(...result[resource]);after=result.meta?.cursors?.after;
    if(!after)return rows;
  }
  throw new Error("There are too many payment records to verify safely. Please contact Shams.");
}
export async function referralMembershipOptions(memberId:string) {
  const identity=await discountState("identity",{member_id:memberId});
  const rows=await bookings({user_id:`eq.${memberId}`,select:"*"});
  const roots=new Set(rows.filter(row=>String(row.plan).toLowerCase().includes("membership")).map(row=>row.payment_group_id||row.id));
  if(!roots.size)return [];
  const [subscriptions,payments,assigned]=await Promise.all([listProvider("subscriptions"),listProvider("payments"),discountState("list",{member_id:memberId})]);
  const options=[];
  for(const subscription of subscriptions) {
    const sessionId=subscription.metadata?.session_id;
    if(!roots.has(subscription.metadata?.booking_id)||!names[sessionId]||subscription.status!=="active"||Number(subscription.amount)!==3500||subscription.currency!=="GBP"||subscription.interval_unit!=="monthly"||Number(subscription.interval||1)!==1||Number(subscription.day_of_month)!==1||!subscription.links?.mandate)continue;
    const {mandates:mandate}=await gc(`/mandates/${encodeURIComponent(subscription.links.mandate)}`);
    if(!mandate.links?.customer)continue;
    const {customers:customer}=await gc(`/customers/${encodeURIComponent(mandate.links.customer)}`);
    if(String(customer.email||"").trim().toLowerCase()!==identity.email)continue;
    let month=nextMonth(bookingToday().slice(0,7));
    if(subscription.start_date?.slice(0,7)>month)month=subscription.start_date.slice(0,7);
    for(let attempts=0;attempts<24;attempts++) {
      const collection=payments.find(p=>p.links?.subscription===subscription.id&&p.charge_date?.slice(0,7)===month&&p.status!=="cancelled");
      const booked=assigned.some((job:any)=>job.subscription_id===subscription.id&&job.month===month);
      if(!booked&&(!collection||collection.status==="pending_submission"))break;
      month=nextMonth(month);
      if(attempts===23)throw new Error("No eligible membership payment was found. Please contact Shams.");
    }
    const chargeDate=payments.find(p=>p.links?.subscription===subscription.id&&p.charge_date?.slice(0,7)===month&&p.status==="pending_submission")?.charge_date
      || subscription.upcoming_payments?.find((p:any)=>p.charge_date?.slice(0,7)===month)?.charge_date || `${month}-01`;
    if(subscription.end_date&&subscription.end_date<chargeDate)continue;
    await discountState("cache_membership",{member_id:memberId,subscription_id:subscription.id,session_id:sessionId,mandate_id:subscription.links.mandate,next_charge_date:chargeDate});
    options.push({id:subscription.id,session_id:sessionId,name:names[sessionId],month,charge_date:chargeDate,
      payment_id:payments.find(p=>p.links?.subscription===subscription.id&&p.charge_date?.slice(0,7)===month&&p.status==="pending_submission")?.id});
  }
  return options;
}

export async function verifiedReferralReplacement(paymentId:string,payment:any) {
  const job=await discountState("replacement",{payment_id:paymentId});
  if(!job)return null;
  if(payment.metadata?.referral_discount_id!==job.id||Number(payment.amount)!==REFERRAL_RENEWAL_AMOUNT||payment.currency!=="GBP"||payment.links?.mandate!==job.mandate_id)throw new Error("The referral replacement payment could not be verified");
  return job;
}

// Cancel only a not-yet-submitted £35 collection. Then create ONE canonical
// £26.25 payment on the same mandate. Stable provider idempotency handles lost
// responses and concurrent webhook/dashboard retries. Existing future £35
// subscription charges continue untouched, without amendment-count limits.
export async function processReferralRenewal(paymentId:string,subscription:any,payment:any) {
  if(payment.metadata?.referral_discount_id) {
    const verified=await verifiedReferralReplacement(paymentId,payment);
    if(!verified||verified.subscription_id!==subscription.id)throw new Error("This payment does not match a membership credit");
    return {replacement:verified};
  }
  const job=await discountState("for_payment",{subscription_id:subscription.id,month:String(payment.charge_date).slice(0,7),payment_id:paymentId});
  if(!job)return {};
  if(job.original_payment_id&&job.original_payment_id!==paymentId)return {};
  if(job.replacement_payment_id)return {redirect:job.replacement_payment_id};
  if(Number(payment.amount)!==3500||payment.currency!=="GBP"||payment.links?.subscription!==subscription.id||subscription.links?.mandate!==job.mandate_id||subscription.currency!=="GBP"||Number(subscription.amount)!==3500)throw new Error("The original membership collection could not be verified");
  if(payment.status!=="pending_submission"&&!(payment.status==="cancelled"&&job.original_payment_id===paymentId&&job.state==="cancelling")) {
    if(["submitted","confirmed","paid_out","failed","cancelled","customer_approval_denied"].includes(payment.status))await discountState("postpone",{id:job.id});
    return {};
  }
  await discountState("claim",{id:job.id,payment_id:paymentId});
  if(payment.status!=="cancelled") {
    try { const cancelled=await gc(`/payments/${encodeURIComponent(paymentId)}/actions/cancel`,{method:"POST",body:JSON.stringify({data:{metadata:{referral_discount_id:job.id}}})}); if(cancelled.payments?.status!=="cancelled")throw new Error("The full collection was not cancelled"); }
    catch(error) {
      const fresh=(await gc(`/payments/${encodeURIComponent(paymentId)}`)).payments;
      if(fresh.status!=="cancelled") {
        if(["submitted","confirmed","paid_out"].includes(fresh.status)){await discountState("postpone",{id:job.id});return {};}
        throw error;
      }
    }
  }
  // If the original date is no longer available after a prolonged outage,
  // preserve its membership month but use the mandate's next possible date.
  const {mandates:mandate}=await gc(`/mandates/${encodeURIComponent(job.mandate_id)}`);
  const chargeDate=mandate.next_possible_charge_date>payment.charge_date?mandate.next_possible_charge_date:payment.charge_date;
  const {payments:replacement}=await gc("/payments",{method:"POST",headers:{"Idempotency-Key":`referral-renewal-${job.id}`},body:JSON.stringify({payments:{amount:REFERRAL_RENEWAL_AMOUNT,currency:"GBP",charge_date:chargeDate,
    description:`SNB Hive ${names[job.session_id]} membership - referral credit`,links:{mandate:job.mandate_id},metadata:{referral_discount_id:job.id,original_payment_id:paymentId}}})});
  if(Number(replacement.amount)!==REFERRAL_RENEWAL_AMOUNT||replacement.currency!=="GBP"||replacement.links?.mandate!==job.mandate_id)throw new Error("The reduced payment did not match the requested membership credit");
  await discountState("replace",{id:job.id,payment_id:replacement.id});
  return {redirect:replacement.id};
}

export async function applyReferralMembershipCredit(memberId:string,creditId:string,subscriptionId:string) {
  const existing=await discountState("list",{member_id:memberId});
  const previous=existing.find((job:any)=>job.id===creditId);
  if(previous) {
    if(previous.subscription_id!==subscriptionId)throw new Error("This credit is already assigned to another membership");
    if(previous.state==="cancelling") {
      const job=await discountState("for_payment",{subscription_id:subscriptionId,month:previous.month,payment_id:""});
      if(job?.original_payment_id) {
        const [{payments:payment},{subscriptions:subscription}]=await Promise.all([gc(`/payments/${encodeURIComponent(job.original_payment_id)}`),gc(`/subscriptions/${encodeURIComponent(subscriptionId)}`)]);
        await processReferralRenewal(job.original_payment_id,subscription,payment);
      }
    }
    return (await discountState("list",{member_id:memberId})).find((item:any)=>item.id===creditId);
  }
  const options=await referralMembershipOptions(memberId),option=options.find(item=>item.id===subscriptionId);
  if(!option)throw new Error("No eligible monthly membership was found. Refresh your memberships or contact Shams.");
  const job=await discountState("reserve",{member_id:memberId,credit_id:creditId,subscription_id:subscriptionId,month:option.month});
  // Already-created collections can be reduced immediately while cancellable.
  // Future collections are handled before allocation by their created webhook.
  if(option.payment_id) {
    const [{payments:payment},{subscriptions:subscription}]=await Promise.all([gc(`/payments/${encodeURIComponent(option.payment_id)}`),gc(`/subscriptions/${encodeURIComponent(subscriptionId)}`)]);
    await processReferralRenewal(option.payment_id,subscription,payment);
  }
  return (await discountState("list",{member_id:memberId})).find((item:any)=>item.id===creditId) || job;
}
