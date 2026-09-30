export const MEMBERSHIP_MONTHLY_AMOUNT = 3500;
const LESSONS_PER_MEMBERSHIP_MONTH = 4;

/**
 * Return the value of the weekly lessons on and after the chosen first lesson.
 *
 * A monthly membership is always valued as four weekly lessons, including in
 * calendar months that contain five occurrences of the lesson's weekday. A £35
 * Friday membership therefore values every remaining lesson at £8.75.
 */
export function proratedMembershipAmount(date = new Date(), monthlyAmount = MEMBERSHIP_MONTHLY_AMOUNT) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lessonWeekday = date.getUTCDay();
  let remainingLessons = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    if (new Date(Date.UTC(year, month, day)).getUTCDay() === lessonWeekday) {
      if (day >= date.getUTCDate()) remainingLessons += 1;
    }
  }

  return Math.round(monthlyAmount * remainingLessons / LESSONS_PER_MEMBERSHIP_MONTH);
}
