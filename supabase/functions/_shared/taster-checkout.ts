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
  if (!template?.id || template.name?.trim().toLowerCase() !== name.toLowerCase()) {
    throw new Error(`The configured template does not match ${name}.`);
  }
  // The app owns the taster tariff. Reusable template amounts must neither
  // override it nor be compared to payment API minor units: a template can
  // return "5"/"5.00", while this billing request must always send 500p.
  // The saved booking's £5 amount is independently validated before this call.
  const currency = template.payment_request_currency?.trim().toUpperCase();
  if (currency && currency !== "GBP") throw new Error(`The ${name} template uses ${currency}. Set its payment currency to GBP.`);
  const paymentScheme = template.payment_request_scheme?.trim().toLowerCase();
  const mandateScheme = template.mandate_request_scheme?.trim().toLowerCase();
  const mandateCurrency = template.mandate_request_currency?.trim().toUpperCase();
  if (paymentScheme && !["bacs", "faster_payments"].includes(paymentScheme)) {
    throw new Error(`The ${name} template uses unsupported payment scheme ${paymentScheme}. Choose UK Direct Debit or Pay by Bank + DD Set up.`);
  }
  if (mandateScheme && mandateScheme !== "bacs") throw new Error(`The ${name} template uses mandate scheme ${mandateScheme}. Choose Bacs for UK Direct Debit.`);
  if (mandateCurrency && mandateCurrency !== "GBP") throw new Error(`The ${name} template uses mandate currency ${mandateCurrency}. Set it to GBP.`);
  const ukMandate = mandateScheme === "bacs" || (!mandateScheme && mandateCurrency === "GBP");
  if (paymentScheme === "faster_payments" && !ukMandate) {
    throw new Error(`The ${name} template offers Pay by Bank without a UK Direct Debit setup. Enable Bacs Direct Debit setup for this template.`);
  }
  return {
    templateId: template.id,
    // Dashboard "Pay by Bank + DD Set up" templates combine Faster Payments
    // with a Bacs mandate. The booking app collects the £5 by Direct Debit,
    // so use that mandate's Bacs scheme rather than its instant-payment leg.
    // Match the existing PAYG request contract: the mandate selects Bacs.
    // Do not pass a separate payment_request.scheme for the DD payment.
    paymentRequest: { amount: TASTER_AMOUNT, currency: "GBP",
      description: template.payment_request_description || name },
    mandateRequest: { scheme: "bacs" },
  };
}
