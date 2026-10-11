import { readFile, writeFile } from "node:fs/promises";

const logo = await readFile(new URL("../public/logo-pink-gold.png", import.meta.url));
const module = `// Generated from public/logo-pink-gold.png by npm run sync:email-logo.\n// Keep this bundled copy in sync when the app logo changes.\nexport const EMAIL_LOGO_CONTENT = ${JSON.stringify(logo.toString("base64"))};\n`;
await writeFile(new URL("../supabase/functions/_shared/email-logo.ts", import.meta.url), module);
console.log("Bundled the booking app logo for email notifications.");
