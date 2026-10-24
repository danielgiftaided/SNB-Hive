import { readFileSync } from "node:fs";

// Supabase CLI returns names and digests, never secret values. Read this
// metadata privately and print only missing setting names.
const required = ["ADMIN_EMAIL", "ADMIN_PASSWORD_HASH", "ADMIN_MFA_SECRET", "RESEND_API_KEY"];
try {
  const metadata = JSON.parse(readFileSync(process.argv[2], "utf8"));
  if (!Array.isArray(metadata) || metadata.some(item => !item || typeof item.name !== "string")) {
    throw new Error("Unexpected Supabase secret metadata format");
  }
  const names = new Set(metadata.map(item => item.name));
  const missing = required.filter(name => !names.has(name));
  if (missing.length) {
    console.error(`Missing Supabase admin secret names: ${missing.join(", ")}. Configure these in Edge Functions → Secrets before deploying admin-auth.`);
    process.exitCode = 1;
  } else {
    console.log("Required admin secret names are present. Their values have not been inspected or validated.");
  }
} catch {
  console.error("Could not check Supabase admin secret names. Stop before deploying admin-auth; no secret metadata has been printed.");
  process.exitCode = 1;
}
