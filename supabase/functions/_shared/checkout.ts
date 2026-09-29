export type CheckoutPlan = "payg" | "membership";

type BookingRow = Record<string, unknown>;

export type BookingValidationIssue =
  | "missing_booking"
  | "missing_payment_group"
  | "wrong_session"
  | "wrong_status"
  | "wrong_amount";

export function bookingRowsValidationIssue(
  booking: BookingRow | null,
  rows: BookingRow[],
  plan: CheckoutPlan,
  paygAmount: number,
): BookingValidationIssue | null {
  if (!booking) return "missing_booking";
  if (rows.length === 0) return "missing_payment_group";
  if (rows.some(row => !row || row.session_id !== "zumba")) return "wrong_session";
  if (rows.some(row => !(row.status === "pending_checkout" || row.status === "pending_payment"))) {
    return "wrong_status";
  }
  if (plan === "payg" && rows.some(row => Math.round(Number(row.amount) * 100) !== paygAmount)) {
    return "wrong_amount";
  }
  return null;
}

export function bookingRowsAreValid(
  booking: BookingRow | null,
  rows: BookingRow[],
  plan: CheckoutPlan,
  paygAmount: number,
) {
  return bookingRowsValidationIssue(booking, rows, plan, paygAmount) === null;
}
