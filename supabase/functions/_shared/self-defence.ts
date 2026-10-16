import { SELF_DEFENCE_PRICE, SELF_DEFENCE_TEMPLATE } from "./class-config.ts";

// The offer ends as 1 November begins in Europe/London (GMT).
export const SELF_DEFENCE_EARLY_BIRD_END = "2026-11-01T00:00:00Z";
export const SELF_DEFENCE_CAPACITY = 11;
// Public checkout links supplied for the single-place and pair offers.
export const SELF_DEFENCE_EARLY_BIRD_TEMPLATES = {
  1: "BRT01M52CXM1QR3SW3E8SDDVBA2S8",
  2: "BRT01M52CW19MA693B5SXHZ9WAW1B",
} as const;

export function selfDefenceQuote(places: unknown = 1, now = new Date()) {
  if (typeof places !== "number" || !Number.isInteger(places) || places < 1 || places > SELF_DEFENCE_CAPACITY) return null;
  const earlyBird = now.getTime() < Date.parse(SELF_DEFENCE_EARLY_BIRD_END);
  const templatePlaces = places === 1 ? 1 : 2;
  return {
    places, earlyBird,
    amount: (earlyBird ? Math.floor(places / 2) * 150 + (places % 2) * 80 : places * SELF_DEFENCE_PRICE) * 100,
    templateName: earlyBird ? `Self Defence Early Bird x${templatePlaces}` : SELF_DEFENCE_TEMPLATE,
    templateId: earlyBird ? SELF_DEFENCE_EARLY_BIRD_TEMPLATES[templatePlaces] : undefined,
    templateVariable: earlyBird ? `GOCARDLESS_SELF_DEFENCE_EARLY_BIRD_X${templatePlaces}_TEMPLATE_ID` : "GOCARDLESS_SELF_DEFENCE_TEMPLATE_ID",
  };
}
