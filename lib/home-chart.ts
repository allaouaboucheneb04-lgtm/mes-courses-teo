/** Values shown in the goal-style weekly chart.
 * A negative accounting balance is kept in the financial total but is not
 * presented as negative progress. Cumulative losses are carried forward:
 * the curve only rises above zero once all earlier expenses are covered.
 */
export function cumulativeNetProgress(days: ReadonlyArray<{net:number}>): number[] {
  let balanceInCents = 0;
  return days.map(day => {
    balanceInCents += Math.round(day.net * 100);
    return Math.max(0, balanceInCents) / 100;
  });
}
