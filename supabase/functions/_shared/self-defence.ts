import { SELF_DEFENCE_PRICE, SELF_DEFENCE_TEMPLATE } from "./class-config.ts";

// 31 October 2026 23:59:59 Europe/London is GMT; exclude midnight on 1 November.
export const SELF_DEFENCE_EARLY_BIRD_END = "2026-11-01T00:00:00Z";
export const SELF_DEFENCE_CAPACITY = 11;

export function selfDefenceQuote(places: unknown = 1, now = new Date()) {
  if (typeof places !== "number" || !Number.isInteger(places) || places < 1 || places > 2) return null;
  const earlyBird = now.getTime() < Date.parse(SELF_DEFENCE_EARLY_BIRD_END);
  return {
    places, earlyBird,
    amount: (earlyBird ? (places === 2 ? 150 : 80) : places * SELF_DEFENCE_PRICE) * 100,
    templateName: earlyBird ? `Self Defence Early Bird x${places} - £${places === 2 ? 150 : 80}` : SELF_DEFENCE_TEMPLATE,
    templateVariable: earlyBird ? `GOCARDLESS_SELF_DEFENCE_EARLY_BIRD_X${places}_TEMPLATE_ID` : "GOCARDLESS_SELF_DEFENCE_TEMPLATE_ID",
  };
}
