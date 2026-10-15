import { CLASS_TASTERS, TASTER_AMOUNT } from "./class-config.ts";

type Template = {
  id: string; name: string; payment_request_amount: string | number | null;
  payment_request_currency: string | null; payment_request_scheme?: string | null;
  payment_request_description?: string | null; mandate_request_scheme?: string | null;
  mandate_request_currency?: string | null;
};

// Reusable template links cannot carry each booking's allocation metadata.
// Read the named template and create a dedicated, idempotent billing request
// with its payment settings and the app's own verified return/booking metadata.
export async function tasterPaymentRequest(sessionId: keyof typeof CLASS_TASTERS) {
  const name = CLASS_TASTERS[sessionId].templateName;
  const token = Deno.env.get("GOCARDLESS_ACCESS_TOKEN");
  if (!token) throw new Error("GoCardless is not configured");
  const base = Deno.env.get("GOCARDLESS_API_URL") || "https://api.gocardless.com";
  const configuredId = Deno.env.get(`GOCARDLESS_${sessionId.toUpperCase()}_TASTER_TEMPLATE_ID`)?.trim();
  async function read(path: string) {
    const response = await fetch(`${base}${path}`, { headers: {
      Authorization: `Bearer ${token}`, "GoCardless-Version": "2015-07-06",
    } });
    if (!response.ok) throw new Error(`GoCardless could not read the ${name} template.`);
    return await response.json();
  }
  let template: Template | undefined;
  if (configuredId) {
    template = (await read(`/billing_request_templates/${encodeURIComponent(configuredId)}`)).billing_request_templates;
  } else {
    let after = "";
    const matches: Template[] = [];
    for (let page = 0; page < 20; page++) {
      const result = await read(`/billing_request_templates?${new URLSearchParams({ limit: "100", ...(after ? { after } : {}) })}`);
      if (!Array.isArray(result.billing_request_templates)) throw new Error("GoCardless returned an invalid template list.");
      matches.push(...result.billing_request_templates.filter((item: Template) =>
        item.name?.trim().toLowerCase() === name.toLowerCase()));
      after = result.meta?.cursors?.after;
      if (!after) break;
    }
    if (after) throw new Error(`Set the template ID for ${name}; the template list is too long to search.`);
    if (matches.length !== 1) throw new Error(`Expected exactly one GoCardless template named ${name}. Check its name or configure its template ID.`);
    template = matches[0];
  }
  if (!template?.id || template.name?.trim().toLowerCase() !== name.toLowerCase() ||
      Number(template.payment_request_amount) !== TASTER_AMOUNT || template.payment_request_currency !== "GBP" ||
      (template.payment_request_scheme && template.payment_request_scheme !== "bacs") ||
      (template.mandate_request_scheme && template.mandate_request_scheme !== "bacs") ||
      (template.mandate_request_currency && template.mandate_request_currency !== "GBP")) {
    throw new Error(`The ${name} template must be a £5 GBP Direct Debit payment.`);
  }
  return {
    templateId: template.id,
    paymentRequest: { amount: TASTER_AMOUNT, currency: "GBP", scheme: "bacs",
      description: template.payment_request_description || name },
  };
}
