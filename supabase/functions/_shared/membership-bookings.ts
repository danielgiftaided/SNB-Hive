const isoDate = (date: Date) => date.toISOString().slice(0, 10);

/** Return every Friday in the UTC month containing the supplied date. */
export function fridayDatesInMonth(value: string | Date): string[] {
  return weeklyDatesInMonth(value, 5);
}

/** Return each occurrence of a class weekday (0 = Sunday) in a UTC month. */
export function weeklyDatesInMonth(value: string | Date, weekday: number): string[] {
  const source = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(source.getTime()) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return [];
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const cursor = new Date(Date.UTC(year, month, 1, 12));
  cursor.setUTCDate(1 + ((weekday - cursor.getUTCDay() + 7) % 7));
  const dates: string[] = [];
  while (cursor.getUTCMonth() === month) {
    dates.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return dates;
}

/** Initial membership enrolment starts with the selected (non-past) lesson. */
export function membershipDatesFrom(startDate: string, availableDates: string[]): string[] {
  const month = String(startDate).slice(0, 7);
  return availableDates.filter(date => date.slice(0, 7) === month && date >= startDate);
}
