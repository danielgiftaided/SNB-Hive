import { corsHeaders, json } from "../_shared/http.ts";

const encoder = new TextEncoder();
const RESEND_API = "https://api.resend.com/emails";
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") || "").trim().toLowerCase();
const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL") || "shams@snbhive.com";

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function base64url(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64url(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), character => character.charCodeAt(0)));
}

async function signature(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function createChallenge(email: string, code: string, secret: string) {
  const payload = base64url(JSON.stringify({ email, codeHash: await sha256(code), expiresAt: Date.now() + 15 * 60 * 1000 }));
  return `${payload}.${await signature(payload, secret)}`;
}

async function sendCode(email: string, code: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Shams B <${SENDER_EMAIL}>`, to: [email], reply_to: SENDER_EMAIL,
      subject: "Your SNB Hive admin login code",
      html: `<p>Your SNB Hive admin sign-in code is:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p><p>It expires in 15 minutes. If this was not you, you can ignore this email.</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const passwordHash = (Deno.env.get("ADMIN_PASSWORD_HASH") || "").toLowerCase();
    const passwordSalt = Deno.env.get("ADMIN_PASSWORD_SALT") || "";
    const challengeSecret = Deno.env.get("ADMIN_MFA_SECRET") || "";
    if (!ADMIN_EMAIL || !passwordHash || !challengeSecret) throw new Error("Admin authentication is not configured");

    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    if (body.step === "login") {
      const suppliedHash = await sha256(passwordSalt + String(body.password || ""));
      if (!safeEqual(email, ADMIN_EMAIL) || !safeEqual(suppliedHash, passwordHash)) {
        return json({ error: "Invalid credentials" }, 401);
      }
      const code = crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000;
      const challenge = await createChallenge(email, String(code), challengeSecret);
      await sendCode(email, String(code));
      return json({ mfaRequired: true, challenge });
    }

    if (body.step === "verify_mfa") {
      const [payload, providedSignature] = String(body.challenge || "").split(".");
      if (!payload || !providedSignature || !safeEqual(providedSignature, await signature(payload, challengeSecret))) {
        return json({ error: "Invalid or expired code" }, 401);
      }
      const challenge = JSON.parse(decodeBase64url(payload));
      const valid = challenge.email === ADMIN_EMAIL && email === ADMIN_EMAIL && challenge.expiresAt >= Date.now() &&
        safeEqual(challenge.codeHash, await sha256(String(body.code || "")));
      if (!valid) return json({ error: "Invalid or expired code" }, 401);
      return json({ success: true, admin: { email: ADMIN_EMAIL } });
    }
    return json({ error: "Invalid authentication step" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication failed";
    console.error("[admin-auth]", message);
    return json({ error: message }, message.includes("not configured") ? 503 : 500);
  }
});
