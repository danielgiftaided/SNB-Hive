import { corsHeaders } from "../_shared/http.ts";

function page(token: string, done = false, error = false) {
  const text = done ? "You have unsubscribed from SNB Hive marketing emails." : error ? "This unsubscribe link could not be used. Please try again or contact shams@snbhive.com." : "You can stop SNB Hive marketing emails here.";
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SNB Hive email preferences</title><style>body{margin:0;background:#ede7dd;color:#2b2e2c;font:16px/1.5 system-ui;min-height:100vh;display:grid;place-items:center}main{box-sizing:border-box;background:white;border:1px solid #d6cfbf;border-radius:24px;padding:28px;width:calc(100% - 32px);max-width:460px}h1{font-family:Georgia,serif;font-size:26px}button{border:0;border-radius:30px;padding:14px 24px;background:#4b5d4e;color:white;font-size:16px;cursor:pointer}a{color:#4b5d4e}</style><main><h1>SNB Hive email preferences</h1><p>${text}</p><p>Essential account, booking and payment emails will continue.</p>${!done ? `<form method="post" action="?token=${encodeURIComponent(token)}"><button>Unsubscribe from marketing emails</button></form>` : ""}<p><a href="mailto:shams@snbhive.com">Contact SNB Hive</a></p></main></html>`;
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers:corsHeaders });
  if (!["GET", "POST"].includes(request.method)) return new Response("Method not allowed", { status:405, headers:corsHeaders });
  const token = new URL(request.url).searchParams.get("token") || "";
  const headers = { ...corsHeaders, "Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store", "Referrer-Policy":"no-referrer" };
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response(page("", false, true), { status:400, headers });
  // GET is read-only: link scanners must not silently change preferences.
  if (request.method === "GET") return new Response(page(token), { headers });
  try {
    const base = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!base || !key) throw new Error("Unsubscribe service is not configured");
    const response = await fetch(`${base}/rest/v1/rpc/unsubscribe_marketing_email`, { method:"POST",
      headers:{ apikey:key, Authorization:`Bearer ${key}`, "Content-Type":"application/json" }, body:JSON.stringify({ p_token:token }) });
    if (!response.ok || await response.json() !== true) throw new Error("Could not update preferences");
    return new Response(page(token, true), { headers });
  } catch {
    return new Response(page(token, false, true), { status:503, headers });
  }
});
