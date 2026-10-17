import { corsHeaders, json } from "../_shared/http.ts";
import { CLASS_BANK_ACCOUNT } from "../_shared/class-config.ts";
import { EMAIL_LOGO_CONTENT } from "../_shared/email-logo.ts";
import { whatsappGroupUrl } from "../_shared/whatsapp-config.ts";

const RESEND_API = "https://api.resend.com/emails";
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") || "shams@snbhive.com";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "shams@snbhive.com";
const BOOKING_EMAIL = "shams@snbhive.com";
const LOGO_ID = "snb-hive-logo";
const BRAND = {
  background: "#ede7dd",
  surface: "#f3efe4",
  accent: "#4b5d4e",
  ink: "#2b2e2c",
  border: "#d6cfbf",
  muted: "#5c5844",
};

type Payload = Record<string, unknown>;
type Message = { to: string; subject: string; html: string; attachments?: Attachment[]; headers?: Record<string, string> };
type Attachment = { filename: string; content: string; content_id?: string };

function value(input: unknown, fallback = "") {
  return String(input ?? fallback);
}

function escapeHtml(input: unknown) {
  return value(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shell(preheader: string, title: string, content: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:${BRAND.background};font-family:Inter,Arial,Helvetica,sans-serif;color:${BRAND.ink}">
  <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:36px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;border:1px solid ${BRAND.border};border-radius:16px">
  <tr><td align="center" style="background:${BRAND.surface};padding:30px;border-radius:16px 16px 0 0"><img src="cid:${LOGO_ID}" width="210" alt="SNB Hive" style="display:block;max-width:100%;height:auto"><p style="margin:14px 0 0;color:${BRAND.muted};font-size:11px;letter-spacing:2px;text-transform:uppercase">Women's Fitness and Wellness</p></td></tr>
  <tr><td style="background:#fff;padding:32px 24px;overflow-wrap:anywhere"><p style="margin:0 0 12px;color:${BRAND.accent};font-size:10px;font-weight:bold;letter-spacing:3px;text-transform:uppercase">SNB Hive</p><h1 style="margin:0 0 18px;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:500;line-height:1.2;color:${BRAND.ink}">${escapeHtml(title)}</h1>${content}</td></tr>
  <tr><td align="center" style="background:${BRAND.accent};padding:22px;border-radius:0 0 16px 16px;color:#fff;font-size:12px;line-height:1.6">Questions? Reply to this email or contact <a href="mailto:${escapeHtml(ADMIN_EMAIL)}" style="color:#fff">${escapeHtml(ADMIN_EMAIL)}</a></td></tr>
  </table></td></tr></table></body></html>`;
}

function paragraph(text: unknown) {
  return `<p style="margin:0 0 22px;color:${BRAND.ink};font-size:15px;line-height:1.7">${escapeHtml(text)}</p>`;
}

function details(rows: [string, unknown][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px"><tr><td style="padding:10px 22px">${rows.map(([label, entry]) => `<p style="margin:10px 0;color:${BRAND.ink};font-size:14px;overflow-wrap:anywhere"><span style="display:block;color:${BRAND.muted};font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">${escapeHtml(label)}</span>${escapeHtml(entry || "Not provided")}</p>`).join("")}</td></tr></table>`;
}

function codeBox(code: unknown) {
  return `<div style="margin:20px 0;padding:22px 12px;text-align:center;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px"><p style="margin:0 0 8px;color:${BRAND.muted};font-size:10px;text-transform:uppercase;letter-spacing:2px">Your code</p><strong style="font:700 36px 'Courier New',monospace;letter-spacing:6px;color:${BRAND.accent}">${escapeHtml(code)}</strong><p style="margin:12px 0 0;color:${BRAND.muted};font-size:12px">Expires in 15 minutes</p></div>`;
}

function bookingRows(p: Payload): [string, unknown][] {
  const rows: [string, unknown][] = [
    ["Member", p.user_name ?? p.name], ["Email", p.user_email ?? p.email],
    ["Phone", p.user_phone ?? p.phone], ["Class", p.session_name],
    ["Booking type", p.plan], ["Amount", `£${value(p.amount, "0")}`],
  ];
  if (p.num_people) rows.push(["Places", p.num_people]);
  if (p.booking_dates || p.booking_date) rows.splice(4, 0, ["Lesson date(s)", p.booking_schedule || p.booking_dates || p.booking_date]);
  return rows;
}

function calendarAttachment(p: Payload): Attachment[] | undefined {
  if (!p.ics_start || !p.ics_end) return undefined;
  const clean = (input: unknown) => value(input).replaceAll("\\", "\\\\").replaceAll(",", "\\,").replaceAll(";", "\\;").replaceAll("\n", "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SNB Hive//Booking//EN", "METHOD:REQUEST",
    "BEGIN:VEVENT", `UID:snbhive-${clean(p.session_id || crypto.randomUUID())}@snbhive.com`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
    `DTSTART:${clean(p.ics_start)}`, `DTEND:${clean(p.ics_end)}`,
    `SUMMARY:${clean(p.session_name || "SNB Hive booking")}`, `LOCATION:${clean(p.venue)}`,
    `ORGANIZER;CN=SNB Hive:mailto:${SENDER_EMAIL}`, `ATTENDEE;CN=${clean(p.to_name)}:mailto:${clean(p.to_email)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return [{ filename: "snb-hive-booking.ics", content: btoa(unescape(encodeURIComponent(ics))) }];
}

function messagesFor(p: Payload): Message[] {
  const type = value(p.type);
  const to = value(p.to_email ?? p.email);
  switch (type) {
    case "verify":
      return [{ to, subject: "Verify your SNB Hive email", html: shell("Confirm your SNB Hive account", "Verify your email", paragraph(`Hi ${value(p.to_name, "there")}, enter this code in the app to finish creating your account. If you did not request an account, you can safely ignore this email.`) + codeBox(p.code)) }];
    case "welcome": {
      const group = p.whatsapp_opt_in === true ? whatsappGroupUrl(Deno.env.get("WHATSAPP_GROUP_URL")) : "";
      const invitation = group ? paragraph("You asked for an invitation to our WhatsApp group. Joining is optional. Your phone number will be visible to other group members.") +
        `<p style="margin:0 0 22px"><a href="${escapeHtml(group)}" style="color:${BRAND.accent};font-weight:bold">Join the SNB Hive WhatsApp group</a></p>` + paragraph("You can manage your communication preferences in Account. If you join the group, you can leave at any time in WhatsApp.") : "";
      return [{ to, subject: "Welcome to SNB Hive!", html: shell("Your account is ready — welcome to the Hive", `Welcome, ${value(p.to_name, "there")}!`,
        paragraph("Your email is verified and your SNB Hive account is ready. We're happy to have you with us!") +
        paragraph("SNB Hive is a welcoming community for women to socialise, nurture their wellbeing and blossom. In the booking app, you'll find our regular BoxFit and Zumba classes, tasters for new class members, and our three-week Self Defence course.") +
        paragraph("The Classes page shows current dates, times and availability. You can view confirmed bookings in My bookings and manage your details in Account.") + invitation +
        paragraph("If you need a hand getting started or have a question about a class, just reply to this email. We look forward to meeting you!") + paragraph("Shams and the SNB Hive team")) }];
    }
    case "reset":
      return [{ to, subject: "Reset your SNB Hive password", html: shell("Your password reset code", "Let's get you back in", paragraph("Enter this code in the app to choose a new password. If you did not request this, you can safely ignore this email.") + codeBox(p.code)) }];
    case "login_mfa":
    case "admin_mfa":
      return [{ to, subject: type === "admin_mfa" ? "Your SNB Hive admin login code" : "Your SNB Hive sign-in code", html: shell("Your secure sign-in code", "Verify it's really you", paragraph("Enter this code to finish signing in. If this was not you, please reset your password.") + codeBox(p.code)) }];
    case "admin":
      return [{ to: ADMIN_EMAIL, subject: `🐝 New member: ${value(p.user_name)}`, html: shell("A new member joined SNB Hive", `${value(p.user_name)} just joined SNB Hive`, paragraph("A new member has created an account.") + details([["Name", p.user_name], ["Email", p.user_email], ["Mobile", p.user_phone], ["Joined", p.signup_time]])) }];
    case "admin_booking":
      return [{ to: BOOKING_EMAIL, subject: `🐝 New class booking: ${value(p.user_name)} — ${value(p.session_name)}`, html: shell("A member booked a class", `New booking for ${value(p.session_name)}`, paragraph("A member has just booked a class. Their details are below.") + details([...bookingRows(p), ["Status", p.status], ["Booked", p.booked_at]])) }];
    case "bank_transfer_booking": {
      const kind = value(p.plan).toLowerCase().includes("taster") ? "taster" : "course";
      const transfer = details([
        ["Account name", CLASS_BANK_ACCOUNT.accountName], ["Account number", CLASS_BANK_ACCOUNT.accountNumber],
        ["Sort code", CLASS_BANK_ACCOUNT.sortCode], ["Reference", p.user_name ?? p.to_name],
      ]);
      const customer = { to, subject: `Booking received — ${value(p.session_name)} (awaiting bank transfer)`, html: shell("Your booking is saved", "Your place is reserved — please pay by bank transfer", paragraph(`Hi ${value(p.to_name, "there")}, please transfer £${value(p.amount)} using your name as the reference. Your booking is awaiting payment until we receive your transfer.`) + details([...bookingRows(p), ["Time", p.time], ["Venue", p.venue]]) + transfer) };
      const admin = { to: BOOKING_EMAIL, subject: `New ${kind} booking: ${value(p.user_name)} — ${value(p.session_name)}`, html: shell(`A member booked a ${kind}`, "Booking — awaiting bank transfer", details([...bookingRows(p), ["Status", p.status], ["Transfer reference", p.user_name]])) };
      return [customer, admin];
    }
    case "booking_cancelled": {
      const cancellationDetails: [string, unknown][] = [
        ["Member", p.user_name], ["Email", p.user_email], ["Phone", p.user_phone],
        ["Class", p.session_name], ["Lesson date", p.booking_date], ["Cancelled", p.cancelled_at],
      ];
      if (p.num_people) cancellationDetails.push(["Places", p.num_people]);
      const customer = { to, subject: `Your ${value(p.session_name)} booking has been cancelled`, html: shell("Your booking has been cancelled", "Booking cancellation confirmed", paragraph(`Hi ${value(p.to_name, "there")}, this email confirms that your booking has been cancelled. Your place in ${value(p.session_name)} is no longer reserved.`) + details(cancellationDetails.slice(3))) };
      const admin = { to: BOOKING_EMAIL, subject: `Booking cancelled: ${value(p.user_name)} — ${value(p.session_name)}`, html: shell("A booking was cancelled", `${value(p.session_name)} booking cancelled`, paragraph("A booking has just been cancelled. Their details are below.") + details(cancellationDetails)) };
      return [customer, admin];
    }
    case "confirm_taster":
      return [{ to, subject: `Your ${value(p.session_name)} booking is confirmed! 🐝`, html: shell("Your class booking is confirmed", `You're booked for ${value(p.session_name)}!`, paragraph(`Hi ${value(p.to_name, "there")}, your place is confirmed. We can't wait to see you!`) + details([["Class", p.session_name], ["When", `${value(p.day)} · ${value(p.time)}`], ["Venue", p.venue], ["What to bring", p.what_to_bring]])), attachments: calendarAttachment(p) }];
    case "confirm_workshop": {
      const customer = { to, subject: `You're in — ${value(p.session_name)} is booked! 🎨🐝`, html: shell("Your workshop booking is confirmed", `You're coming to ${value(p.session_name)}!`, paragraph(`Hi ${value(p.to_name, "there")}, your workshop place is confirmed. Payment instructions: £${value(p.price)} to SNB Hive Ltd, sort code 04-06-05, account 33053251.`) + details([["Workshop", p.session_name], ["When", `${value(p.day)} · ${value(p.time)}`], ["Venue", p.venue], ["People", p.num_people]])), attachments: calendarAttachment(p) };
      const admin = { to: BOOKING_EMAIL, subject: `🎨 New workshop booking: ${value(p.to_name)} — ${value(p.session_name)}`, html: shell("A workshop was booked", `New booking for ${value(p.session_name)}`, details([["Name", p.to_name], ["Email", p.to_email], ["People", p.num_people], ["Total", `£${value(p.price)}`], ["Guests", p.guests]])) };
      return [customer, admin];
    }
    case "booking_confirmation": {
      const customer = { to, subject: `You're booked — ${value(p.session_name)} 🐝`, html: shell("Your class places are reserved", "Your booking is confirmed", paragraph(`Hi ${value(p.name, "there")}, your payment setup is complete and your places are reserved for the dates below. ${p.status === "paid" ? "Your booking is marked Paid." : "We're checking your original payment setup."} You do not need to book or pay again.`) + details(bookingRows(p))) };
      const admin = { to: BOOKING_EMAIL, subject: `New booking: ${value(p.name)} — ${value(p.session_name)}`, html: shell("Class places reserved", p.status === "paid" ? "Booking confirmed — paid" : "Booking confirmed — awaiting payment", details([...bookingRows(p), ["Status", p.status === "paid" ? "Paid" : "Awaiting payment"]])) };
      return [customer, admin];
    }
    case "payment_confirmation": {
      const plan = value(p.plan);
      const directDebit = !plan.toLowerCase().includes("bank transfer") && (plan.toLowerCase().includes("membership") || plan.toLowerCase().includes("pay as you go") || ["taster (gocardless)", "course (gocardless)"].includes(plan.toLowerCase()));
      const customer = { to, subject: `Payment and booking confirmed — ${value(p.session_name)} 🐝`, html: shell("Your payment and class booking are confirmed", directDebit ? "Payment setup complete — you're booked!" : "Payment successful — you're booked!", paragraph(directDebit ? `Hi ${value(p.name, "there")}, your payment setup is complete. Your booking is confirmed and marked Paid for the dates below. GoCardless will collect your Direct Debit automatically; you do not need to pay or book again.` : `Hi ${value(p.name, "there")}, thank you! Your ${plan.toLowerCase().includes("taster") ? "taster booking" : "course booking"} and payment have both been confirmed in this email.`) + details(bookingRows(p))) };
      const admin = { to: BOOKING_EMAIL, subject: `💳 Payment confirmed: ${value(p.name)} — ${value(p.session_name)}`, html: shell("A class payment was confirmed", directDebit ? "Payment setup confirmed" : "Payment received", paragraph("This booking is now marked Paid in the admin portal.") + details(bookingRows(p))) };
      return [customer, admin];
    }
    case "mix_match_renewal": {
      const month = /^\d{4}-\d{2}$/.test(value(p.membership_month)) ? new Intl.DateTimeFormat("en-GB", { month:"long", year:"numeric", timeZone:"Europe/London" }).format(new Date(`${value(p.membership_month)}-01T12:00:00Z`)) : "this month";
      return [
        { to, subject:"Mix & Match membership renewed — choose your dates", html:shell("Your monthly membership is ready", "Choose your four classes", paragraph(`Hi ${value(p.name, "there")}, your £35 Mix & Match membership has renewed for ${month}. Your Direct Debit payment setup has been accepted; GoCardless will collect it automatically.`) + paragraph("Open My bookings in the booking app and choose exactly two Zumba dates and two BoxFit dates in your membership month. No lesson dates are reserved until you save your choices. There is no extra payment when you choose your dates.")) },
        { to:BOOKING_EMAIL, subject:`Mix & Match renewal: ${value(p.name)} — ${month}`, html:shell("A Mix & Match membership renewed", "Membership renewed — dates to be chosen", details([["Member",p.name],["Email",p.email],["Membership month",month],["Amount","£35"],["Classes","2 Zumba and 2 BoxFit — awaiting date selection"]])) },
      ];
    }
    case "blast":
      return [{ to, subject: value(p.subject), html: shell(value(p.subject), value(p.subject), paragraph(`Hi ${value(p.to_name, "there")},`) + paragraph(p.message) + `<p style="font-size:12px;color:${BRAND.muted}">You asked to receive SNB Hive class news, events and offers. <a href="${escapeHtml(p.unsubscribe_url)}" style="color:${BRAND.accent}">Unsubscribe from marketing emails</a>. Essential booking emails will continue.</p>`),
        headers:{ "List-Unsubscribe":`<${value(p.unsubscribe_url)}>`, "List-Unsubscribe-Post":"List-Unsubscribe=One-Click" } }];
    default:
      throw new Error(`Unknown email type: ${type}`);
  }
}

async function send(message: Message, idempotencyKey?: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  if (!message.to) throw new Error("Recipient email is required");
  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body: JSON.stringify({ from: `Shams B <${SENDER_EMAIL}>`, to: [message.to], reply_to: ADMIN_EMAIL, subject: message.subject, html: message.html, ...(message.headers ? { headers:message.headers } : {}), attachments: [{ filename: "logo-pink-gold.png", content: EMAIL_LOGO_CONTENT, content_id: LOGO_ID }, ...(message.attachments || [])] }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
}

async function signupRpc(name: string, body: Payload) {
  const base = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) throw new Error("Signup email delivery is not configured");
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, { method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Signup email delivery could not complete ${name}`);
  return await response.json();
}

async function signupCodeHash(email: unknown, code: unknown) {
  if (!/^\d{6}$/.test(value(code))) throw new Error("A six-digit verification code is required");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${value(email).trim().toLowerCase()}:${value(code)}`));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const payload = await request.json();
    if (["verify", "login_mfa"].includes(payload.type)) {
      await signupRpc("prepare_signup_verification", { p_email: value(payload.to_email).trim().toLowerCase(),
        p_code_hash: await signupCodeHash(payload.to_email, payload.code) });
    }
    if (payload.type === "welcome") {
      const recipient = await signupRpc("signup_welcome_recipient", { p_email: value(payload.to_email).trim().toLowerCase(),
        p_code_hash: await signupCodeHash(payload.to_email, payload.code) });
      if (!recipient) return json({ success: true, skipped: true, reason: "no_pending_welcome" });
      // Never trust caller-supplied identity, consent, invitation or delivery key.
      const trusted = { type: "welcome", to_email: recipient.email, to_name: recipient.name, whatsapp_opt_in: recipient.whatsapp_opt_in };
      await send(messagesFor(trusted)[0], `signup-welcome-${recipient.delivery_key}`);
      if (await signupRpc("mark_signup_welcome_sent", { p_user_id: recipient.id, p_delivery_key: recipient.delivery_key }) !== true) {
        throw new Error("Welcome email delivery acknowledgement could not be saved");
      }
      console.log("[send-email] sent type=welcome messages=1");
      return json({ success: true });
    }
    if (payload.type === "blast") {
      const base = Deno.env.get("SUPABASE_URL");
      const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!base || !key) throw new Error("Marketing preferences are not configured");
      const response = await fetch(`${base}/rest/v1/rpc/marketing_email_recipient`, { method:"POST",
        headers:{ apikey:key, Authorization:`Bearer ${key}`, "Content-Type":"application/json" },
        body:JSON.stringify({ p_email:value(payload.to_email).trim().toLowerCase() }) });
      if (!response.ok) throw new Error("Could not verify marketing consent. No marketing email was sent.");
      const recipient = await response.json();
      if (!recipient) return json({ success:true, skipped:true, reason:"not_opted_in" });
      if (!/^[a-f0-9]{64}$/.test(recipient.token || "")) throw new Error("Could not create an unsubscribe link. No marketing email was sent.");
      payload.to_email = recipient.email; payload.to_name = recipient.name;
      payload.unsubscribe_url = `${base}/functions/v1/marketing-unsubscribe?token=${recipient.token}`;
    }
    const messages = messagesFor(payload);
    const category = payload.type === "booking_confirmation" ? "booking" : payload.type === "payment_confirmation" ? "payment" : payload.type === "mix_match_renewal" ? "mix-renewal" : "";
    await Promise.all(messages.map((message, index) => send(message, category && payload.gocardless_payment_id ? `${category}-${value(payload.gocardless_payment_id)}-${index}` : undefined)));
    console.log(`[send-email] sent type=${value(payload.type)} messages=${messages.length}`);
    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email could not be sent";
    console.error("[send-email]", message);
    return json({ error: message }, 500);
  }
});
