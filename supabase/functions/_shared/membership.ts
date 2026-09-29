export const MEMBERSHIP_MONTHLY_AMOUNT = 3500;

/**
 * Return the value of the weekly lessons on and after the chosen first lesson.
 *
 * A monthly membership splits evenly across every occurrence of that lesson's
 * weekday in the calendar month. For example, a £35 Friday membership costs £7
 * per lesson in a five-Friday month and £8.75 per lesson in a four-Friday month.
 */
export function proratedMembershipAmount(date = new Date(), monthlyAmount = MEMBERSHIP_MONTHLY_AMOUNT) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lessonWeekday = date.getUTCDay();
  let lessonsInMonth = 0;
  let remainingLessons = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    if (new Date(Date.UTC(year, month, day)).getUTCDay() === lessonWeekday) {
      lessonsInMonth += 1;
      if (day >= date.getUTCDate()) remainingLessons += 1;
    }
  }

  return Math.round(monthlyAmount * remainingLessons / lessonsInMonth);
}
