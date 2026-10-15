import { CLASS_TASTERS, TASTER_AMOUNT } from "./class-config.ts";
import { templatePaymentRequest } from "./template-checkout.ts";

export function tasterPaymentRequest(sessionId: keyof typeof CLASS_TASTERS) {
  return templatePaymentRequest(CLASS_TASTERS[sessionId].templateName, TASTER_AMOUNT,
    `GOCARDLESS_${sessionId.toUpperCase()}_TASTER_TEMPLATE_ID`);
}
