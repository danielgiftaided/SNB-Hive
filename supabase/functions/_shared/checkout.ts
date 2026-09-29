export type CheckoutPlan = "payg" | "membership";

type BookingRow = Record<string, unknown>;

export type BookingValidationIssue =
  | "missing_booking"
  | "missing_payment_group"
  | "wrong_payment_group"
  | "wrong_plan"
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
  if (booking.payment_group_id !== booking.id || rows.some(row => row?.payment_group_id !== booking.payment_group_id)) {
    return "wrong_payment_group";
  }
  const expectedPlan = plan === "membership" ? "membership" : "pay as you go";
  if (typeof booking.plan !== "string" || !booking.plan.toLowerCase().includes(expectedPlan) ||
      rows.some(row => typeof row?.plan !== "string" || !row.plan.toLowerCase().includes(expectedPlan))) {
    return "wrong_plan";
  }
  // Checkout is only initiated from the Zumba booking. A two-activity
  // membership deliberately puts the member's second class in the same
  // payment group, so requiring every row to have the Zumba session id makes
  // that valid group impossible to verify. PAYG rows, on the other hand, are
  // all individual Zumba dates and must remain restricted to that session.
  if (booking.session_id !== "zumba") return "wrong_session";
  if (plan === "payg" && rows.some(row => !row || row.session_id !== "zumba")) {
    return "wrong_session";
  }
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

// A membership amount is fixed by the Edge Function, rather than supplied by
// the browser. If the browser's successful insert is not visible to the
// service-role REST read yet, it is therefore safe to start the authorisation
// flow after the lookup retries are exhausted. The signed webhook will attach
// the payment to that same booking id once GoCardless fulfils the request.
// PAYG must remain fail-closed because its total comes from the saved rows.
export function canStartCheckoutAfterLookupFailure(
  plan: CheckoutPlan,
  issue: BookingValidationIssue,
) {
  return plan === "membership" && issue === "missing_booking";
}
