export function singleMembershipBooking({ base, bookingId, session, amount, bookingDate, paymentGroupId = bookingId }) {
  return {
    ...base,
    id: bookingId,
    sessionId: session.id,
    sessionName: session.name,
    amount,
    bookingDate,
    paymentGroupId,
  };
}

export function checkoutErrorDetail(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown checkout error");
  if (message === "Booking could not be verified") {
    return "Booking could not be verified (legacy_edge_function). The checkout service is out of date; please contact support.";
  }
  return message;
}
