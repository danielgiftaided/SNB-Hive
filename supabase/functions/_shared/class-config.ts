// Shared by the browser and payment functions so prices and dates agree.
export const CLASS_PAYMENTS = {
  zumba: {
    name: "Zumba",
    dates: ["2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"],
    weekday: 5,
  },
  boxfit: {
    name: "BoxFit",
    // Opening lesson is a Thursday; subsequent lessons/renewals are Tuesdays.
    dates: ["2026-10-15", "2026-10-20", "2026-10-27"],
    weekday: 2,
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

export function classPaymentConfig(id: unknown): { name: string; dates: readonly string[]; weekday: number | null } | null {
  return typeof id === "string" && Object.hasOwn(CLASS_PAYMENTS, id)
    ? CLASS_PAYMENTS[id as keyof typeof CLASS_PAYMENTS]
    : null;
}
