export const UNDATED_BOOKING = "undated";

export function bookingBelongsToUser(booking, user) {
  if (!booking || !user) return false;
  if (user.id && booking.userId === user.id) return true;
  const email = String(user.email || "").trim().toLowerCase();
  return !!email && String(booking.email || "").trim().toLowerCase() === email;
}

// A checkout attempt is not a booking. GoCardless can leave the browser flow
// before payment is authorised, so these rows exist only to let the server
// validate checkout and must not reserve a place or appear as confirmed.
export function bookingIsActive(booking) {
  if (!booking || booking.status === "cancelled" || booking.status === "pending_checkout") return false;

  // A GoCardless payment reference is attached when the mandate/checkout is
  // fulfilled, which can happen before any money is collected. Only the
  // payments/confirmed webhook changes a paid class to `paid`, so every
  // pending class must stay outside confirmed reservations regardless of
  // whether it has a payment reference. My bookings shows it separately.
  if (booking.type === "class" && booking.status === "pending_payment" &&
      !String(booking.plan || "").toLowerCase().includes("bank transfer")) return false;

  return true;
}

export function classPaymentIsPending(booking) {
  return booking?.type === "class" && booking.status === "pending_payment" &&
    !String(booking.plan || "").toLowerCase().includes("bank transfer");
}

export function isTasterBooking(booking) {
  return String(booking?.plan || "").toLowerCase().includes("taster");
}

// Cancellation does not restore eligibility. An unfinished checkout can resume
// its original booking, rather than creating a second lifetime taster.
export function userTasterBooking(bookings, user, sessionId) {
  const mine = bookings.filter(booking => booking.sessionId === sessionId && isTasterBooking(booking) &&
    bookingBelongsToUser(booking, user));
  return mine.find(tasterBookingUsed) || mine[0] || null;
}

export function tasterBookingUsed(booking) {
  return !!booking && (String(booking.plan || "").toLowerCase().includes("bank transfer") || !!booking.gocardlessPaymentId ||
    !["pending_checkout", "pending_payment"].includes(booking.status));
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
