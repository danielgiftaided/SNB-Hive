import { CLASS_PAYMENTS, bookingToday, classHasFinished, classDatesInMonth } from "./class-config.ts";

export const MIX_MATCH_AMOUNT = 3500;
export const MIX_MATCH_TEMPLATE_ID = "BRT01M5574NTKNCPZ6E02F03RB290";
export const MIX_MATCH_PLAN = "Mix & Match - Hive 4 Membership";
export const MIX_MATCH_CLASS_IDS = ["zumba", "boxfit"] as const;
export type MixMatchClass = typeof MIX_MATCH_CLASS_IDS[number];
export type MixMatchSelection = Record<MixMatchClass, string[]>;

export function isMixMatchPlan(value: unknown) {
  return String(value || "").trim().toLowerCase() === MIX_MATCH_PLAN.toLowerCase();
}

// A membership offers every scheduled, unfinished date in its calendar month.
// The normal PAYG/taster four-date rolling window does not limit this picker.
export function mixMatchMonths(now = new Date()): string[] {
  const first = new Date(`${bookingToday(now).slice(0, 7)}-01T12:00:00Z`);
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return [first, next].map(date => date.toISOString().slice(0, 7)).filter(month =>
    MIX_MATCH_CLASS_IDS.every(id => mixMatchDates(id, month, now).length >= 2));
}

export function mixMatchDates(id: MixMatchClass, month: string, now = new Date()): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  return classDatesInMonth(id, `${month}-01`).filter(date =>
    date >= CLASS_PAYMENTS[id].dates[0] && !classHasFinished(id, date, now));
}

export function mixMatchSelectionIssue(selection: MixMatchSelection, month: string, now = new Date()): string | null {
  if (!/^\d{4}-\d{2}$/.test(month) || !mixMatchMonths(now).includes(month)) return "Please choose an available membership month.";
  for (const id of MIX_MATCH_CLASS_IDS) {
    const dates = selection[id];
    const name = id === "zumba" ? "Zumba" : "BoxFit";
    if (!Array.isArray(dates) || dates.length !== 2 || new Set(dates).size !== 2) return `Please choose exactly two ${name} dates.`;
    if (dates.some(date => !mixMatchDates(id, month, now).includes(date))) return `Please choose available ${name} dates in the selected month.`;
  }
  return null;
}

// Check saved rows again on the server. Caller-supplied prices, dates, class
// counts or a booking group containing another member must never set the tariff.
export function mixMatchBookingIssue(anchor: Record<string, unknown>, rows: Record<string, unknown>[], now = new Date(), historical = false): string | null {
  if (!isMixMatchPlan(anchor.plan) || rows.length !== 4 || rows.some(row => !isMixMatchPlan(row.plan))) return "Mix & Match requires exactly four class bookings.";
  if (new Set(rows.map(row => row.id)).size !== 4 || !rows.some(row => row.id === anchor.id)) return "The Mix & Match booking group is invalid.";
  if (!anchor.user_id || !anchor.email || rows.some(row => row.user_id !== anchor.user_id ||
    String(row.email || "").trim().toLowerCase() !== String(anchor.email).trim().toLowerCase())) return "All four lessons must belong to the same member.";
  if (rows.some(row => !MIX_MATCH_CLASS_IDS.includes(row.session_id as MixMatchClass))) return "Mix & Match is available only for Zumba and BoxFit.";
  const amounts = rows.map(row => Number(row.amount));
  if (amounts.some(amount => !Number.isFinite(amount) || amount < 0) ||
    amounts.reduce((sum, amount) => sum + Math.round(amount * 100), 0) !== MIX_MATCH_AMOUNT) return "The Mix & Match price must be £35.";
  const month = String(anchor.booking_date || "").slice(0, 7);
  const selection = Object.fromEntries(MIX_MATCH_CLASS_IDS.map(id =>
    [id, rows.filter(row => row.session_id === id).map(row => String(row.booking_date || ""))])) as MixMatchSelection;
  if (historical) {
    if (!/^\d{4}-\d{2}$/.test(month)) return "The membership month is invalid.";
    for (const id of MIX_MATCH_CLASS_IDS) {
      const dates = selection[id];
      if (dates.length !== 2 || new Set(dates).size !== 2 || dates.some(date => !classDatesInMonth(id, month + "-01").includes(date))) return "Mix & Match requires two dates for each class in one month.";
    }
    return null;
  }
  return mixMatchSelectionIssue(selection, month, now);
}
