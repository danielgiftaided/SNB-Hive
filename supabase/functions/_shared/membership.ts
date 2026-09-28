export const MEMBERSHIP_MONTHLY_AMOUNT = 3500;

/** Return the inclusive calendar-day share of this month, in pence. */
export function proratedMembershipAmount(date = new Date(), monthlyAmount = MEMBERSHIP_MONTHLY_AMOUNT) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const remainingDays = daysInMonth - date.getUTCDate() + 1;
  return Math.round(monthlyAmount * remainingDays / daysInMonth);
}
