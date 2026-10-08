// Keep the database boundary explicit and independently testable. Checkout
// verification reads these snake_case columns directly through PostgREST.
const SNAKE = {
  passwordHash: "password_hash",
  createdAt: "created_at",
  sessionId: "session_id",
  sessionName: "session_name",
  userId: "user_id",
  fitnessType: "fitness_type",
  sessionsPerWeek: "sessions_per_week",
  classSize: "class_size",
  bookingDate: "booking_date",
  paymentGroupId: "payment_group_id",
  gocardlessPaymentId: "gocardless_payment_id",
  gocardlessBillingRequestId: "gocardless_billing_request_id",
  bookingConfirmationSentAt: "booking_confirmation_sent_at",
  paymentConfirmationSentAt: "payment_confirmation_sent_at",
  workshopType: "workshop_type",
  otherType: "other_type",
  numPeople: "num_people",
};

const CAMEL = Object.fromEntries(Object.entries(SNAKE).map(([key, value]) => [value, key]));

export const toSnake = object =>
  Object.fromEntries(Object.entries(object).map(([key, value]) => [SNAKE[key] || key, value]));

export const toCamel = object =>
  Object.fromEntries(Object.entries(object).map(([key, value]) => [CAMEL[key] || key, value]));

export const bookingRowsForUpsert = value => value.map(toSnake);
