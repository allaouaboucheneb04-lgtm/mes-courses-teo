/** Airport fees are billed for Monday–Sunday airport weeks.
 * Taxi income runs Tuesday–Monday: a Monday airport ride is charged
 * against the income week starting the NEXT day (Tuesday).
 * All other airport rides are charged on their ride date.
 *
 * Financial summaries group REVENUE by ride date and airport FEES by
 * airportLevyAccountingDate. This avoids double counting on Mondays.
 */
export type AirportLevyRide = {
  type: string;
  date: string;
  taxiCategory?: string;
  airportFee?: number;
};

export const isAirportLevyRide = (ride: AirportLevyRide) =>
  ride.type === "taxi" && ride.taxiCategory === "aeroport";

export function airportLevyAccountingDate(rideDate: string): string {
  const date = new Date(`${rideDate}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.getUTCDay() !== 1)
    return rideDate;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Sum only fees ACCOUNTED for on dates covered by includesDate.
 * feePerRide overrides optional per-ride values when settings are supplied.
 */
export function airportLevyTotal(
  rides: ReadonlyArray<AirportLevyRide>,
  includesDate: (accountingDate: string) => boolean,
  feePerRide?: number,
): number {
  let cents = 0;
  for (const ride of rides) {
    if (!isAirportLevyRide(ride) || !includesDate(airportLevyAccountingDate(ride.date)))
      continue;
    const amount = feePerRide ?? ride.airportFee ?? 0;
    if (Number.isFinite(amount)) cents += Math.round(amount * 100);
  }
  return cents / 100;
}

export function airportLevyCount(
  rides: ReadonlyArray<AirportLevyRide>,
  includesDate: (accountingDate: string) => boolean,
): number {
  return rides.filter(ride =>
    isAirportLevyRide(ride) && includesDate(airportLevyAccountingDate(ride.date))
  ).length;
}


/**
 * Explain the levy charged on a particular accounting date. Tuesday can include
 * charges from Monday's airport rides plus Tuesday's own airport rides.
 * This breakdown is for display only; it does not alter the accounting date.
 */
export function airportLevyDayBreakdown(
  rides: ReadonlyArray<AirportLevyRide>,
  accountingDate: string,
  feePerRide: number,
) {
  const date = new Date(accountingDate + "T12:00:00Z");
  const isTuesday = Number.isFinite(date.getTime()) && date.getUTCDay() === 2;
  const previousMonday = new Date(date);
  previousMonday.setUTCDate(previousMonday.getUTCDate() - 1);
  const mondayDate = isTuesday ? previousMonday.toISOString().slice(0, 10) : null;
  const carriedCount = mondayDate
    ? rides.filter(ride => isAirportLevyRide(ride) && ride.date === mondayDate).length
    : 0;
  const sameDayCount = isTuesday || date.getUTCDay() !== 1
    ? rides.filter(ride => isAirportLevyRide(ride) && ride.date === accountingDate).length
    : 0;
  const cents = Number.isFinite(feePerRide) ? Math.round(feePerRide * 100) : 0;
  return {
    mondayDate,
    carriedCount,
    carriedTotal: carriedCount * cents / 100,
    sameDayCount,
    sameDayTotal: sameDayCount * cents / 100,
    totalCount: carriedCount + sameDayCount,
    total: (carriedCount + sameDayCount) * cents / 100,
  };
}
