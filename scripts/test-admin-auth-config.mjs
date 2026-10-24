import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// Actual authentication handler, intercepted delivery and metadata-only CLI
// fixtures. No hosted accounts, passwords or notifications are accessed.
const env = {
  ADMIN_EMAIL: "admin@example.test", ADMIN_PASSWORD_HASH: createHash("sha256").update("saltfixture-password").digest("hex"),
  ADMIN_PASSWORD_SALT: "salt", ADMIN_MFA_SECRET: "fixture-signing-secret", RESEND_API_KEY: "fixture-mail-key",
};
const settings = { ...env }, originalDeno = globalThis.Deno, originalFetch = globalThis.fetch, originalError = console.error;
let handler, code, sent = 0;
const logs = [];
globalThis.Deno = { env: { get: name => env[name] }, serve: fn => { handler = fn; } };
console.error = (...values) => logs.push(values.join(" "));
globalThis.fetch = async (url, init) => {
  assert.equal(url, "https://api.resend.com/emails");
  const body = JSON.parse(init.body);
  assert.deepEqual(body.to, [settings.ADMIN_EMAIL]);
  code = body.html.match(/letter-spacing:8px">(\d{6})/)[1]; sent++;
  return new Response('{"id":"fixture"}');
};
const request = body => handler(new Request("https://fixture.test/admin-auth", { method: "POST", body: JSON.stringify(body) }));
const login = () => request({ step: "login", email: settings.ADMIN_EMAIL, password: "fixture-password" });
const directory = await mkdtemp(join(tmpdir(), "snb-admin-config-"));
try {
  await import("../supabase/functions/admin-auth/index.ts");
  const app = await readFile("src/App.jsx", "utf8");
  const helpers = app.slice(app.indexOf("function isEdgeFunctionMissing("), app.indexOf("function genCode("));
  const display = new Function(`${helpers}; return emailDeliveryError;`)();
  for (const missing of ["ADMIN_EMAIL", "ADMIN_PASSWORD_HASH", "ADMIN_MFA_SECRET"]) {
    for (const value of [undefined, "", "  "]) {
      if (value === undefined) delete env[missing]; else env[missing] = value;
      const response = await login(), body = await response.json();
      assert.equal(response.status, 503);
      assert.equal(body.code, "ADMIN_AUTH_NOT_CONFIGURED");
      assert.match(logs.at(-1), new RegExp(`Missing required settings: ${missing}$`));
      assert.match(display(new Error(body.error), "admin sign-in code"), /Admin sign-in needs configuring in Supabase/);
      assert.equal(sent, 0, "Never attempt code delivery when authentication settings are missing");
      for (const secret of ["fixture-password", settings.ADMIN_PASSWORD_HASH, settings.ADMIN_MFA_SECRET]) {
        assert.ok(!logs.at(-1).includes(secret)); assert.ok(!JSON.stringify(body).includes(secret));
      }
    }
    env[missing] = settings[missing];
  }
  delete env.ADMIN_EMAIL; delete env.ADMIN_MFA_SECRET;
  assert.equal((await login()).status, 503);
  assert.match(logs.at(-1), /Missing required settings: ADMIN_EMAIL, ADMIN_MFA_SECRET$/);
  Object.assign(env, settings);
  assert.equal((await request({ step: "login", email: settings.ADMIN_EMAIL, password: "wrong" })).status, 401);
  assert.equal(sent, 0);
  const response = await login(), body = await response.json();
  assert.equal(response.status, 200); assert.equal(sent, 1); assert.ok(body.challenge);
  assert.equal((await request({ step: "verify_mfa", email: settings.ADMIN_EMAIL, challenge: body.challenge, code: "000000" })).status, 401);
  const verified = await (await request({ step: "verify_mfa", email: settings.ADMIN_EMAIL, challenge: body.challenge, code })).json();
  assert.equal(verified.success, true); assert.ok(verified.access_token);
  const { verifyAdminSession } = await import("../supabase/functions/_shared/admin-session.ts");
  assert.equal(await verifyAdminSession(verified.access_token), settings.ADMIN_EMAIL);
  assert.match(display(new Error("Admin authentication is not configured"), "admin sign-in code"), /Admin sign-in needs configuring/,
    "The frontend also explains errors from the currently deployed handler");
  assert.match(display(new Error("Resend 429"), "admin sign-in code"), /wait a minute/i);
  console.log("PASS actual auth: missing/empty settings named without values, actionable sign-in message, delivery withheld, credentials/MFA and signed admin sessions preserved");

  const file = join(directory, "secret-names.json");
  const names = ["ADMIN_EMAIL", "ADMIN_PASSWORD_HASH", "ADMIN_MFA_SECRET", "RESEND_API_KEY"];
  const run = () => spawnSync(process.execPath, ["scripts/check-admin-secret-names.mjs", file], { encoding: "utf8" });
  for (const missing of [null, ...names]) {
    await writeFile(file, JSON.stringify(names.filter(name => name !== missing).map(name => ({ name, digest: "private-digest-fixture" }))));
    const result = run();
    assert.equal(result.status, missing ? 1 : 0);
    if (missing) assert.match(result.stderr, new RegExp(`Missing Supabase admin secret names: ${missing}\\.`));
    assert.ok(!(result.stdout + result.stderr).includes("private-digest-fixture"));
  }
  for (const invalid of ["not json", "null", "{}", '[{"value":"private-value-fixture"}]']) {
    await writeFile(file, invalid);
    const result = run(); assert.equal(result.status, 1);
    assert.ok(!(result.stdout + result.stderr).includes("private-value-fixture"));
  }
  const workflow = await readFile(".github/workflows/deploy-payment-functions.yml", "utf8");
  assert.ok(workflow.indexOf("name: Check required admin secret names") < workflow.indexOf("name: Deploy admin authentication"));
  assert.ok(workflow.includes('supabase secrets list --project-ref "$SUPABASE_PROJECT_REF" --output json > "$RUNNER_TEMP/admin-secret-names.json"'));
  assert.ok(workflow.includes('- "scripts/check-admin-secret-names.mjs"'));
  console.log("PASS deployment guard: required names only, no values/digests printed, fails closed for missing or unreadable metadata before admin-auth deployment");
} finally {
  globalThis.Deno = originalDeno; globalThis.fetch = originalFetch; console.error = originalError;
  await rm(directory, { recursive: true, force: true });
}
