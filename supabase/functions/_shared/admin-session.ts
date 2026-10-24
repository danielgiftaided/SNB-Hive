const encoder = new TextEncoder();
const SESSION_LIFETIME = 8 * 60 * 60 * 1000;
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const decode = (value: string) => Uint8Array.from(atob(value.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
async function key() {
  const secret=Deno.env.get("ADMIN_MFA_SECRET");
  if(!secret)throw new Error("Admin authentication is not configured");
  return crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
export async function issueAdminSession(email: string) {
  const expiresAt=Date.now()+SESSION_LIFETIME;
  const payload=encode(encoder.encode(JSON.stringify({purpose:"admin-class-booking",email,expiresAt})));
  return {access_token:`${payload}.${encode(new Uint8Array(await crypto.subtle.sign("HMAC",await key(),encoder.encode(payload))))}`,expires_at:expiresAt};
}
export async function verifyAdminSession(token: unknown): Promise<string | null> {
  if(typeof token!=="string" || token.length>2048)return null;
  try {
    const parts=token.split(".");if(parts.length!==2)return null;
    if(!await crypto.subtle.verify("HMAC",await key(),decode(parts[1]),encoder.encode(parts[0])))return null;
    const value=JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const email=(Deno.env.get("ADMIN_EMAIL")||"").trim().toLowerCase();
    if(!email || value.purpose!=="admin-class-booking" || value.email!==email || !Number.isFinite(value.expiresAt) || value.expiresAt<=Date.now() || value.expiresAt>Date.now()+SESSION_LIFETIME)return null;
    return email;
  } catch {return null;}
}
