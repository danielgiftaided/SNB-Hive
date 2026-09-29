export const UNDATED_BOOKING = "undated";

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
    .filter(booking => booking.sessionId === sessionId && booking.status !== "cancelled")
    .map(booking => normalizedBookingDate(booking.bookingDate))
    .filter(Boolean);
  const dates = [...new Set([...upcomingDates, ...dated])].sort();
  const hasUndated = bookings.some(booking =>
    booking.sessionId === sessionId && booking.status !== "cancelled" &&
    !normalizedBookingDate(booking.bookingDate));
  return hasUndated ? [...dates, UNDATED_BOOKING] : dates;
}
