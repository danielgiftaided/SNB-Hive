import { corsHeaders, json } from "../_shared/http.ts";
import { verifyAdminSession } from "../_shared/admin-session.ts";
import { classPaymentConfig, SELF_DEFENCE_DATES, bookingToday } from "../_shared/class-config.ts";
import { mixMatchRpc } from "../_shared/mix-match-storage.ts";
import { bookings } from "../_shared/gocardless-bookings.ts";

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  try {
    const body=await request.json(),admin=await verifyAdminSession(body.admin_token);
    if(!admin)return json({error:'Please sign in to the admin app again before adding members'},401);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.request_id||'') || typeof body.member_id!=='string'
      || !['class','taster','course'].includes(body.kind) || !Number.isInteger(body.amount_pence) || body.amount_pence<0 || body.amount_pence>1000000)return json({error:'Check the member, booking type and amount'},400);
    const course=body.session_id==='self_defence';
    if(course ? body.kind!=='course'||body.booking_date!==SELF_DEFENCE_DATES[0]||!SELF_DEFENCE_DATES.some(date=>date>=bookingToday())
      : body.kind==='course'||!classPaymentConfig(body.session_id)?.dates.includes(body.booking_date))return json({error:'Choose a currently available lesson date'},400);
    const booking=await mixMatchRpc('admin_add_class_booking',{p_details:{request_id:body.request_id,member_id:body.member_id,session_id:body.session_id,
      booking_date:body.booking_date,kind:body.kind,amount_pence:body.amount_pence,admin_email:admin}});
    let emailPending=false;
    if(!booking.booking_confirmation_sent_at)try {
      const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,base=Deno.env.get('SUPABASE_URL');
      const response=await fetch(`${base}/functions/v1/send-email`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
        body:JSON.stringify({...booking,type:'booking_confirmation',booking_dates:course?SELF_DEFENCE_DATES.join(', '):booking.booking_date})});
      if(!response.ok)throw new Error('Confirmation email could not be sent');
      await bookings({id:`eq.${booking.id}`},{method:'PATCH',body:JSON.stringify({booking_confirmation_sent_at:new Date().toISOString()})});
    } catch {emailPending=true;}
    return json({success:true,booking,email_pending:emailPending});
  }catch(error){return json({error:error instanceof Error?error.message:'The member could not be added'},400);}
});
