import { createHash, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { emitKeypressEvents } from "node:readline";
import { resolve } from "node:path";

// Run locally in a private terminal. Never accept passwords through arguments,
// print them, send them over the network or overwrite an existing secrets file.
async function readPassword(label) {
  const input = process.stdin, output = process.stdout;
  if (!input.isTTY || !output.isTTY) throw new Error("Run this helper in an interactive terminal; piped passwords are not accepted.");
  emitKeypressEvents(input);
  const wasRaw = input.isRaw;
  input.setRawMode(true); input.resume(); output.write(label);
  return new Promise((resolvePassword, reject) => {
    let password = "";
    const cleanup = () => {
      input.removeListener("keypress", onKey);
      input.setRawMode(!!wasRaw); input.pause(); output.write("\n");
    };
    const onKey = (text, key = {}) => {
      if (key.ctrl && ["c", "d"].includes(key.name)) { cleanup(); reject(new Error("Setup cancelled; no file saved.")); return; }
      if (key.name === "return" || key.name === "enter") { cleanup(); resolvePassword(password); return; }
      if (key.name === "backspace") { password = Array.from(password).slice(0, -1).join(""); return; }
      if (!key.ctrl && !key.meta && text) password += text.replace(/[\u0000-\u001f\u007f]/g, "");
    };
    input.on("keypress", onKey);
  });
}

try {
  console.log("Choose the admin password you want to use. Password entry is hidden.");
  const password = await readPassword("Admin password: ");
  if (!password) throw new Error("A password is required; no file saved.");
  const confirmation = await readPassword("Confirm password: ");
  if (confirmation !== password) throw new Error("The passwords do not match; no file saved.");
  const salt = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(salt + password).digest("hex");
  const signingSecret = randomBytes(32).toString("hex");
  const file = resolve(".env.admin.local");
  await writeFile(file, `ADMIN_PASSWORD_SALT=${salt}\nADMIN_PASSWORD_HASH=${hash}\nADMIN_MFA_SECRET=${signingSecret}\n`, { flag: "wx", mode: 0o600 });
  console.log(`Saved three admin settings to ${file}. No values have been printed.`);
  console.log("Copy all three entries into Supabase → Edge Functions → Secrets, or import this file with Supabase CLI.");
  console.log("Keep your existing ADMIN_EMAIL and email/payment settings. Do not share or commit this local file.");
} catch (error) {
  if (error?.code === "EEXIST") console.error(".env.admin.local already exists. No settings were overwritten. Move it somewhere safe before generating a replacement.");
  else console.error(error instanceof Error ? error.message : "Could not generate admin settings.");
  process.exitCode = 1;
}
