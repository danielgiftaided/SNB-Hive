export const UNDATED_BOOKING = "undated";

// A checkout attempt is not a booking. GoCardless can leave the browser flow
// before payment is authorised, so these rows exist only to let the server
// validate checkout and must not reserve a place or appear to the customer.
export function bookingIsActive(booking) {
  if (!booking || booking.status === "cancelled" || booking.status === "pending_checkout") return false;

  // Class rows are written before the browser is sent to GoCardless. Older
  // checkout deployments require pending_payment rather than pending_checkout,
  // so distinguish a completed checkout by the payment reference which the
  // signed webhook adds when the billing request is fulfilled.
  if (booking.type === "class" && booking.status === "pending_payment") {
    return Boolean(booking.gocardlessPaymentId);
  }

  return true;
}

export function normalizedBookingDate(value) {
  if (!value) return "";
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] || "";
}

export function bookingMatchesClassDate(booking, selectedDate) {
  const bookingDate = normalizedBookingDate(booking?.bookingDate);
  return selectedDate === UNDATED_BOOKING ? !bookingDate : bookingDate === selectedDate;
}

export function classBookingDates(bookings, sessionId, upcomingDates) {
  const dated = bookings
    .filter(booking => booking.sessionId === sessionId && bookingIsActive(booking))
    .map(booking => normalizedBookingDate(booking.bookingDate))
    .filter(Boolean);
  const dates = [...new Set([...upcomingDates, ...dated])].sort();
  const hasUndated = bookings.some(booking =>
    booking.sessionId === sessionId && bookingIsActive(booking) &&
    !normalizedBookingDate(booking.bookingDate));
  return hasUndated ? [...dates, UNDATED_BOOKING] : dates;
}
