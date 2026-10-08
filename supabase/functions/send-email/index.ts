import { corsHeaders, json } from "../_shared/http.ts";
import { CLASS_BANK_ACCOUNT } from "../_shared/class-config.ts";

const RESEND_API = "https://api.resend.com/emails";
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") || "shams@snbhive.com";
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "shams@snbhive.com";
const BOOKING_EMAIL = "shams@snbhive.com";
const LOGO_URL = Deno.env.get("EMAIL_LOGO_URL") || "https://snbhive.com/logo-email.png";

type Payload = Record<string, unknown>;
type Message = { to: string; subject: string; html: string; attachments?: Attachment[] };
type Attachment = { filename: string; content: string };

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
  <body style="margin:0;background:#f0e8cc;font-family:Arial,Helvetica,sans-serif;color:#1B2B26">
  <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:36px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
  <tr><td align="center" style="background:#e46478;padding:30px;border-radius:16px 16px 0 0"><img src="${LOGO_URL}" width="210" alt="SNB Hive" style="display:block;max-width:100%;height:auto"><p style="margin:14px 0 0;color:#f0e8cc;font-size:11px;letter-spacing:2px;text-transform:uppercase">Women's Fitness and Wellness</p></td></tr>
  <tr><td style="background:#fff;padding:38px 36px"><p style="margin:0 0 12px;color:#C99A4B;font-size:10px;font-weight:bold;letter-spacing:3px;text-transform:uppercase">SNB Hive</p><h1 style="margin:0 0 18px;font-size:23px;line-height:1.35">${escapeHtml(title)}</h1>${content}</td></tr>
  <tr><td align="center" style="background:#e46478;padding:22px;border-radius:0 0 16px 16px;color:#fff;font-size:12px">Questions? Reply to this email or contact <a href="mailto:${ADMIN_EMAIL}" style="color:#f0e8cc">${ADMIN_EMAIL}</a></td></tr>
  </table></td></tr></table></body></html>`;
}

function paragraph(text: unknown) {
  return `<p style="margin:0 0 22px;color:#555550;font-size:15px;line-height:1.7">${escapeHtml(text)}</p>`;
}

function details(rows: [string, unknown][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0e8cc;border-radius:12px"><tr><td style="padding:10px 22px">${rows.map(([label, entry]) => `<p style="margin:10px 0;color:#1B2B26;font-size:14px"><span style="display:block;color:#8A8478;font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">${escapeHtml(label)}</span>${escapeHtml(entry || "Not provided")}</p>`).join("")}</td></tr></table>`;
}

function codeBox(code: unknown) {
  return `<div style="margin:20px 0;padding:26px;text-align:center;background:#f0e8cc;border-radius:12px"><p style="margin:0 0 8px;color:#8A8478;font-size:10px;text-transform:uppercase;letter-spacing:2px">Your code</p><strong style="font:700 42px 'Courier New',monospace;letter-spacing:10px;color:#e46478">${escapeHtml(code)}</strong><p style="margin:12px 0 0;color:#8A8478;font-size:12px">Expires in 15 minutes</p></div>`;
}

function bookingRows(p: Payload): [string, unknown][] {
  const rows: [string, unknown][] = [
    ["Member", p.user_name ?? p.name], ["Email", p.user_email ?? p.email],
    ["Phone", p.user_phone ?? p.phone], ["Class", p.session_name],
    ["Booking type", p.plan], ["Amount", `£${value(p.amount, "0")}`],
  ];
  if (p.booking_dates || p.booking_date) rows.splice(4, 0, ["Lesson date(s)", p.booking_dates ?? p.booking_date]);
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
      return [{ to, subject: "Welcome to SNB Hive — verify your email", html: shell("Confirm your SNB Hive account", `Welcome, ${value(p.to_name, "there")}!`, paragraph("Enter this code in the app to finish creating your account.") + codeBox(p.code)) }];
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
      const directDebit = !plan.toLowerCase().includes("bank transfer") && (plan.toLowerCase().includes("membership") || plan.toLowerCase().includes("pay as you go"));
      const customer = { to, subject: `Payment and booking confirmed — ${value(p.session_name)} 🐝`, html: shell("Your payment and class booking are confirmed", directDebit ? "Payment setup complete — you're booked!" : "Payment successful — you're booked!", paragraph(directDebit ? `Hi ${value(p.name, "there")}, your payment setup is complete. Your booking is confirmed and marked Paid for the dates below. GoCardless will collect your Direct Debit automatically; you do not need to pay or book again.` : `Hi ${value(p.name, "there")}, thank you! Your ${plan.toLowerCase().includes("taster") ? "taster booking" : "course booking"} and payment have both been confirmed in this email.`) + details(bookingRows(p))) };
      const admin = { to: BOOKING_EMAIL, subject: `💳 Payment confirmed: ${value(p.name)} — ${value(p.session_name)}`, html: shell("A class payment was confirmed", directDebit ? "Payment setup confirmed" : "Payment received", paragraph("This booking is now marked Paid in the admin portal.") + details(bookingRows(p))) };
      return [customer, admin];
    }
    case "blast":
      return [{ to, subject: value(p.subject), html: shell(value(p.subject), value(p.subject), paragraph(`Hi ${value(p.to_name, "there")},`) + paragraph(p.message)) }];
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
    body: JSON.stringify({ from: `Shams B <${SENDER_EMAIL}>`, to: [message.to], reply_to: ADMIN_EMAIL, subject: message.subject, html: message.html, ...(message.attachments?.length ? { attachments: message.attachments } : {}) }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const payload = await request.json();
    const messages = messagesFor(payload);
    const category = payload.type === "booking_confirmation" ? "booking" : payload.type === "payment_confirmation" ? "payment" : "";
    await Promise.all(messages.map((message, index) => send(message, category && payload.gocardless_payment_id ? `${category}-${value(payload.gocardless_payment_id)}-${index}` : undefined)));
    console.log(`[send-email] sent type=${value(payload.type)} messages=${messages.length}`);
    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email could not be sent";
    console.error("[send-email]", message);
    return json({ error: message }, 500);
  }
});
