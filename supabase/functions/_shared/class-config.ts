// Shared by the browser and payment functions so prices and dates agree.
import { weeklyDatesInMonth } from "./membership-bookings.ts";
export const CLASS_PAYMENTS = {
  zumba: {
    name: "Zumba",
    dates: ["2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"],
    weekday: 5,
    startTime: "11:30",
    endTime: "12:30",
  },
  boxfit: {
    name: "BoxFit",
    dates: ["2026-10-15", "2026-10-22", "2026-10-29"],
    weekday: 4,
    startTime: "13:30",
    endTime: "14:30",
  },
} as const;

export function classTimeLabel(id: unknown): string | null {
  if (typeof id !== "string" || !Object.hasOwn(CLASS_PAYMENTS, id)) return null;
  const config = CLASS_PAYMENTS[id as keyof typeof CLASS_PAYMENTS];
  return `${config.startTime}–${config.endTime}`;
}

export const UPCOMING_CLASS_COUNT = 4;
export const PAYG_AMOUNT = 1000;
export const TASTER_AMOUNT = 500;
export const CLASS_TASTERS = {
  boxfit: { templateName: "Boxfit Taster" },
  zumba: { templateName: "Zumba Taster" },
} as const;
export const SELF_DEFENCE_DATES = ["2026-11-18", "2026-11-25", "2026-12-02"];
export const SELF_DEFENCE_PRICE = 90;
export const SELF_DEFENCE_TEMPLATE = "Self Defence - 3 Week Course";

export function coursePaymentConfig(id: unknown, now = new Date()) {
  if (id !== "self_defence") return null;
  return { name: "Self Defence", dates: upcomingBookingDates(SELF_DEFENCE_DATES, bookingToday(now)), weekday: null };
}
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

// Customer booking choices and the admin's current lesson list use this same
// schedule. Unconfirmed classes have no invented dates.
export function classBookingSchedule(session: { id?: unknown; courseDates?: readonly string[] }, reference: Date | string = new Date()): string[] {
  const now = reference instanceof Date ? reference : new Date(`${reference}T00:00:00Z`);
  return classPaymentConfig(session.id, now)?.dates
    || upcomingBookingDates(session.courseDates || [], bookingToday(now));
}

// Historical payment recovery uses the original month, independent of today.
export function classDatesInMonth(id: unknown, month: string): string[] {
  if (typeof id !== "string" || !Object.hasOwn(CLASS_PAYMENTS, id)) return [];
  const config = CLASS_PAYMENTS[id as keyof typeof CLASS_PAYMENTS];
  return weeklyDatesInMonth(month, config.weekday).filter(date =>
    date.slice(0, 7) !== config.dates[0].slice(0, 7) || date >= config.dates[0]);
}

// Compare wall-clock time in London, including British Summer Time. A class
// remains available until its advertised finish; the exact finish is excluded.
export function classHasFinished(id: unknown, date: string, now = new Date()): boolean {
  if (typeof id !== "string" || !Object.hasOwn(CLASS_PAYMENTS, id)) return false;
  const today = bookingToday(now);
  if (date !== today) return date < today;
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(now);
  return time >= CLASS_PAYMENTS[id as keyof typeof CLASS_PAYMENTS].endTime;
}

export function classPaymentConfig(id: unknown, now = new Date()): { name: string; dates: string[]; weekday: number | null } | null {
  if (typeof id !== "string" || !Object.hasOwn(CLASS_PAYMENTS, id)) return null;
  const config = CLASS_PAYMENTS[id as keyof typeof CLASS_PAYMENTS];
  const today = bookingToday(now);
  const first = today > config.dates[0] ? today : config.dates[0];
  // UTC arithmetic on date-only values keeps weekly dates stable across DST;
  // class finish eligibility is checked separately using London's local time.
  const cursor = new Date(`${first}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + ((config.weekday - cursor.getUTCDay() + 7) % 7));
  if (classHasFinished(id, cursor.toISOString().slice(0, 10), now)) cursor.setUTCDate(cursor.getUTCDate() + 7);
  const dates: string[] = [];
  for (let index = 0; index < UPCOMING_CLASS_COUNT; index++) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return { ...config, dates };
}
