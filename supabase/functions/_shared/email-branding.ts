// All app emails use this layout and inline copy of the booking app logo.
import { EMAIL_LOGO_CONTENT } from "./email-logo.ts";

const RESEND_API = "https://api.resend.com/emails";
const LOGO_ID = "snb-hive-logo";
export const BRAND = {
  background: "#ede7dd",
  surface: "#f3efe4",
  accent: "#4b5d4e",
  ink: "#2b2e2c",
  border: "#d6cfbf",
  muted: "#5c5844",
};

export type Message = { to: string; subject: string; html: string; attachments?: Attachment[]; headers?: Record<string, string>; replyTo?: string };
export type Attachment = { filename: string; content: string; content_id?: string };

export function value(input: unknown, fallback = "") {
  return String(input ?? fallback);
}

export function escapeHtml(input: unknown) {
  return value(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function shell(preheader: string, title: string, content: string) {
  const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "shams@snbhive.com";
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

export function paragraph(text: unknown) {
  return `<p style="margin:0 0 22px;color:${BRAND.ink};font-size:15px;line-height:1.7">${escapeHtml(text)}</p>`;
}

export function details(rows: [string, unknown][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px"><tr><td style="padding:10px 22px">${rows.map(([label, entry]) => `<p style="margin:10px 0;color:${BRAND.ink};font-size:14px;overflow-wrap:anywhere"><span style="display:block;color:${BRAND.muted};font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase">${escapeHtml(label)}</span>${escapeHtml(entry || "Not provided")}</p>`).join("")}</td></tr></table>`;
}

export function codeBox(code: unknown) {
  return `<div style="margin:20px 0;padding:22px 12px;text-align:center;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px"><p style="margin:0 0 8px;color:${BRAND.muted};font-size:10px;text-transform:uppercase;letter-spacing:2px">Your code</p><strong style="font:700 36px 'Courier New',monospace;letter-spacing:6px;color:${BRAND.accent}">${escapeHtml(code)}</strong><p style="margin:12px 0 0;color:${BRAND.muted};font-size:12px">Expires in 15 minutes</p></div>`;
}

export function signInCodeMessage(to: string, code: unknown, admin = false): Message {
  return { to, subject: admin ? "Your SNB Hive admin login code" : "Your SNB Hive sign-in code",
    html: shell("Your secure sign-in code", "Verify it's really you",
      paragraph(admin
        ? "Enter this code to finish signing in to the admin dashboard. If this was not you, you can ignore this email."
        : "Enter this code to finish signing in. If this was not you, please reset your password.") + codeBox(code)) };
}

export async function sendBrandedEmail(message: Message, idempotencyKey?: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  if (!message.to) throw new Error("Recipient email is required");
  if (!message.html.includes(`src="cid:${LOGO_ID}"`)) throw new Error("The SNB Hive branded email layout is required");
  const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") || "shams@snbhive.com";
  const replyTo = message.replyTo ?? (Deno.env.get("ADMIN_EMAIL") || "shams@snbhive.com");
  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    body: JSON.stringify({ from: `Shams B <${SENDER_EMAIL}>`, to: [message.to], reply_to: replyTo, subject: message.subject, html: message.html, ...(message.headers ? { headers:message.headers } : {}), attachments: [{ filename: "logo-pink-gold.png", content: EMAIL_LOGO_CONTENT, content_id: LOGO_ID }, ...(message.attachments || [])] }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
}
