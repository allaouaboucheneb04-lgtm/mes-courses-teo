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
