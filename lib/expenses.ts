/** Shared by the daily, weekly and history summaries. Bounds are inclusive.
 * Expenses belong to dates, not rides: days without rides must still count.
 */
export function expenseTotal(
  expenses: ReadonlyArray<{ date: string; amount: number }>,
  bounds: readonly string[] | null = null,
) {
  const cents = expenses.reduce((sum, expense) => {
    if (bounds && (expense.date < bounds[0] || expense.date > bounds[1])) return sum;
    return sum + Math.round(expense.amount * 100);
  }, 0);
  return cents / 100;
}


/**
 * Company fees are due once per Tuesday–Monday income week, on Tuesday.
 * They count even for a week with no rides. When "all dates" is selected,
 * include weeks containing dated records plus the current income week;
 * do not assume historical gaps were active weeks.
 */
export function weeklyCompanyFeeTotal(
  weeklyFee: number,
  bounds: readonly string[] | null,
  activityDates: ReadonlyArray<string>,
  currentDate: string,
): number {
  if (!Number.isFinite(weeklyFee) || weeklyFee <= 0) return 0;
  const cents = Math.round(weeklyFee * 100);
  const parseDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(value + "T12:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
      ? date : null;
  };
  const current = parseDate(currentDate);
  if (!current) return 0;
  const tuesdayOf = (date: Date) => {
    const start = new Date(date);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 5) % 7));
    return start.toISOString().slice(0, 10);
  };
  let count = 0;
  if (bounds) {
    const start = parseDate(bounds[0] || "");
    const end = parseDate(bounds[1] || "");
    if (!start || !end || start > end) return 0;
    // History must not report future company charges as already incurred.
    const last = end < current ? end : current;
    const cursor = new Date(start);
    cursor.setUTCDate(cursor.getUTCDate() + ((2 - cursor.getUTCDay() + 7) % 7));
    while (cursor <= last) {
      count++;
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  } else {
    const weeks = new Set<string>([tuesdayOf(current)]);
    for (const value of activityDates) {
      const date = parseDate(value);
      if (date && date <= current) weeks.add(tuesdayOf(date));
    }
    count = weeks.size;
  }
  return (count * cents) / 100;
}
