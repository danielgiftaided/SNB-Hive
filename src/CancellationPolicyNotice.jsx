export default function CancellationPolicyNotice() {
  return (
    <div role="note" aria-label="Cancellation Policy" className="ff-body w-full space-y-2 text-xs leading-relaxed text-stone-500">
      <p className="font-semibold text-stone-600">Cancellation Policy</p>
      <p>Cancel at least <strong>24 hours before your class</strong> and your class credit will be returned to your account. Cancellations made within 24 hours of the class and non-attendance are charged in full and the credit will not be returned.</p>
      <p>If SNB Hive cancels a class, your credit will be restored or, for a separately purchased class, you can choose a replacement, account credit or refund.</p>
      <p>Three late cancellations/no-shows within 60 days may result in a 14-day restriction on advance bookings.</p>
      <p>By booking, you agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-stone-700">SNB Hive Class, Booking &amp; Membership Terms and Conditions</a>.</p>
    </div>
  );
}
