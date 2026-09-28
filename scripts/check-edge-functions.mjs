import { readFile } from "node:fs/promises";

const functions = [
  "supabase/functions/gocardless-checkout/index.ts",
  "supabase/functions/gocardless-webhook/index.ts",
  "supabase/functions/send-email/index.ts",
  "supabase/functions/admin-auth/index.ts",
];

let failed = false;
for (const file of functions) {
  const source = await readFile(file, "utf8");
  const remoteImport = source.match(
    /(?:\b(?:from|import)\s*|\bimport\s*\(\s*)["']https?:\/\//,
  );
  if (remoteImport) {
    console.error(`FAIL ${file}: remote URL import found; Supabase may need DNS access to bundle it.`);
    failed = true;
  } else {
    console.log(`PASS ${file}: no remote URL imports`);
  }
}

if (failed) {
  console.error("Update to the latest repository version before deploying the Edge Functions.");
  process.exit(1);
}
