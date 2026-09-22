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
