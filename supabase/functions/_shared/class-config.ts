// Shared by the browser and payment functions so prices and dates agree.
import { weeklyDatesInMonth } from "./membership-bookings.ts";
export const CLASS_PAYMENTS = {
  zumba: {
    name: "Zumba",
    dates: ["2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"],
    weekday: 5,
  },
  boxfit: {
    name: "BoxFit",
    dates: ["2026-10-15", "2026-10-22", "2026-10-29"],
    weekday: 4,
  },
} as const;

export const PAYG_AMOUNT = 1000;
export const TASTER_AMOUNT = PAYG_AMOUNT / 2;
export const SELF_DEFENCE_DATES = ["2026-11-18", "2026-11-25", "2026-12-02"];
export const SELF_DEFENCE_PRICE = 90;
export const CLASS_BANK_ACCOUNT = {
  accountName: "SNB Hive LTD",
  accountNumber: "33053251",
  sortCode: "040605",
};

export function bookingToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function upcomingBookingDates(dates: readonly string[], today = bookingToday()): string[] {
  return dates.filter(date => date.slice(0, 10) >= today);
}

// Historical payment recovery uses the original month, independent of today.
export function classDatesInMonth(id: unknown, month: string): string[] {
  if (typeof id !== "string" || !Object.hasOwn(CLASS_PAYMENTS, id)) return [];
  const config = CLASS_PAYMENTS[id as keyof typeof CLASS_PAYMENTS];
  return weeklyDatesInMonth(month, config.weekday).filter(date =>
    date.slice(0, 7) !== config.dates[0].slice(0, 7) || date >= config.dates[0]);
}

export function classPaymentConfig(id: unknown, now = new Date()): { name: string; dates: string[]; weekday: number | null } | null {
  if (typeof id !== "string" || !Object.hasOwn(CLASS_PAYMENTS, id)) return null;
  const config = CLASS_PAYMENTS[id as keyof typeof CLASS_PAYMENTS];
  const today = bookingToday(now);
  const firstMonth = today > config.dates[0] ? today : config.dates[0];
  let dates = upcomingBookingDates(classDatesInMonth(id, firstMonth), today);
  if (!dates.length) {
    const nextMonth = new Date(`${firstMonth}T12:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
    dates = classDatesInMonth(id, nextMonth.toISOString().slice(0, 10));
  }
  return { ...config, dates };
}
