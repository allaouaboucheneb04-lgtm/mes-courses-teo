export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export type SevFinancialRide = {
  type: string; date: string; amount: number; tip: number; tipPending?: boolean;
  sevAdded?: boolean; sevTaxExempt?: boolean; sevLevyCount?: number;
  serviceFee?: number; airportFee?: number;
};
export function includedTaxes(total: number, exempt = false) {
  const base = exempt ? total : total / 1.14975;
  const gst = exempt ? 0 : roundMoney(base * .05);
  const qst = exempt ? 0 : roundMoney(base * .09975);
  // Retain the entered total exactly; rounding can move the subtotal by one cent.
  return { subtotal: roundMoney(total - gst - qst), gst, qst, taxes: roundMoney(gst + qst) };
}
export function sevBreakdown(ride: SevFinancialRide) {
  const count = ride.sevLevyCount ?? (ride.type === "taxi" ? 1 : 0);
  const levy = roundMoney(Math.max(0, Math.trunc(count)) * .9);
  const levyTaxes = ride.sevTaxExempt ? 0 : roundMoney(levy * .05) + roundMoney(levy * .09975);
  if (ride.tipPending) return { known: false as const, levy, levyTaxes: roundMoney(levyTaxes), levyTotal: roundMoney(levy + levyTaxes) };
  const taxes = includedTaxes(ride.amount, ride.sevTaxExempt);
  return { known: true as const, ...taxes, levy, levyTaxes: roundMoney(levyTaxes), levyTotal: roundMoney(levy + levyTaxes),
    fareSubtotal: roundMoney(taxes.subtotal - levy),
    afterFees: roundMoney(ride.amount - (ride.serviceFee || 0)),
    afterFeesSubtotal: includedTaxes(roundMoney(ride.amount - (ride.serviceFee || 0)), ride.sevTaxExempt).subtotal,
  };
}
export function sevTotals(rides: SevFinancialRide[]) {
  return rides.reduce((sum, ride) => {
    const value = sevBreakdown(ride);
    sum.count++;
    sum.levy = roundMoney(sum.levy + value.levy);
    if (value.known) {
      sum.gst = roundMoney(sum.gst + value.gst);
      sum.qst = roundMoney(sum.qst + value.qst);
      sum.taxes = roundMoney(sum.taxes + value.taxes);
      sum.subtotal = roundMoney(sum.subtotal + value.fareSubtotal);
    } else sum.unknown++;
    return sum;
  }, { count: 0, unknown: 0, gst: 0, qst: 0, taxes: 0, levy: 0, subtotal: 0 });
}
export function feePeriods(rides: SevFinancialRide[], expenses: {date: string; amount: number}[], yearly: boolean, companyFee: number) {
  const groups = new Map<string, {period: string; service: number; airport: number; company: number; expenses: number; total: number}>();
  const group = (date: string) => {
    const period = date.slice(0, yearly ? 4 : 7);
    if (!groups.has(period)) groups.set(period, {period, service: 0, airport: 0, company: 0, expenses: 0, total: 0});
    return groups.get(period)!;
  };
  const weeks = new Set<string>();
  for (const ride of rides) {
    const entry = group(ride.date);
    entry.service = roundMoney(entry.service + (ride.serviceFee || 0));
    entry.airport = roundMoney(entry.airport + (ride.airportFee || 0));
    const date = new Date(`${ride.date}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 5) % 7));
    weeks.add(date.toISOString().slice(0,10));
  }
  // One company fee per active Tuesday–Monday week, assigned to its Tuesday.
  if (companyFee) for (const week of weeks) group(week).company = roundMoney(group(week).company + companyFee);
  for (const expense of expenses) group(expense.date).expenses = roundMoney(group(expense.date).expenses + expense.amount);
  for (const entry of groups.values()) entry.total = roundMoney(entry.service + entry.airport + entry.company + entry.expenses);
  return [...groups.values()].sort((a,b) => b.period.localeCompare(a.period));
}
