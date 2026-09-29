export type CheckoutPlan = "payg" | "membership";

type BookingRow = Record<string, unknown>;

export function bookingRowsAreValid(
  booking: BookingRow | null,
  rows: BookingRow[],
  plan: CheckoutPlan,
  paygAmount: number,
) {
  return Boolean(booking) && rows.length > 0 && rows.every(row =>
    row && row.session_id === "zumba" &&
    (row.status === "pending_checkout" || row.status === "pending_payment") &&
    (plan !== "payg" || Math.round(Number(row.amount) * 100) === paygAmount)
  );
}
