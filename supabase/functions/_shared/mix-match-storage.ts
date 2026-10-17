export async function mixMatchRpc(name: string, body: Record<string, unknown>) {
  const base = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) throw new Error("Membership storage is not configured");
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, { method:"POST",
    headers:{ apikey:key, Authorization:`Bearer ${key}`, "Content-Type":"application/json" }, body:JSON.stringify(body) });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.message || "Membership dates could not be saved. Please retry.");
  }
  return await response.json();
}
