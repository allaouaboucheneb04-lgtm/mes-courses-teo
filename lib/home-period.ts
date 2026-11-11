import { airportLevyTotal, type AirportLevyRide } from "./airport-levy";
import { expenseTotal, weeklyCompanyFeeTotal } from "./expenses";

export type HomePeriod = "day" | "week" | "month" | "year" | "custom";
export type HomePeriodRide = AirportLevyRide & {
  date: string;
  amount: number;
  tip: number;
  serviceDeductions: number;
};
export type HomePeriodExpense = {date: string; amount: number};
export type HomePeriodBounds = {start: string; end: string};
export type HomePeriodSummary = {
  valid: boolean;
  gross: number;
  tips: number;
  serviceFees: number;
  airportFees: number;
  companyFees: number;
  expenses: number;
  fees: number;
  net: number;
  goal: number;
  count: number;
};

const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0,10) === value;
};
const utcDate = (date: string) => new Date(date + "T12:00:00Z");
const isoDate = (date: Date) => date.toISOString().slice(0,10);
const round2 = (amount: number) => Math.round(amount * 100) / 100;

/** Tuesday–Monday taxi weeks, Gregorian calendar months and years, or user dates. */
export function homePeriodBounds(
  period: HomePeriod,
  currentDate: string,
  customStart: string,
  customEnd: string,
): HomePeriodBounds | null {
  if (!validDate(currentDate)) return null;
  if (period === "day") return {start: currentDate,end: currentDate};
  if (period === "month") return {
    start: currentDate.slice(0,7) + "-01",
    end: isoDate(new Date(Date.UTC(Number(currentDate.slice(0,4)), Number(currentDate.slice(5,7)), 0, 12))),
  };
  if (period === "year") return {
    start: currentDate.slice(0,4) + "-01-01",
    end: currentDate.slice(0,4) + "-12-31",
  };
  if (period === "week") {
    const start = utcDate(currentDate);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 5) % 7));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return {start:isoDate(start),end:isoDate(end)};
  }
  if (period === "custom" && validDate(customStart) && validDate(customEnd) && customStart <= customEnd) {
    return {start:customStart,end:customEnd};
  }
  return null;
}

/** All financial amounts are based on actual dates; no future company charges or goals. */
export function summarizeHomePeriod(
  rides: ReadonlyArray<HomePeriodRide>,
  costs: ReadonlyArray<HomePeriodExpense>,
  bounds: HomePeriodBounds | null,
  currentDate: string,
  settings: {
    airportFee:number;
    companyFee:number;
    dailyGoals: ReadonlyArray<number>;
    dailyGoalEnabled:boolean;
  }
): HomePeriodSummary {
  const empty: HomePeriodSummary = {
    valid:false,gross:0,tips:0,serviceFees:0,airportFees:0,
    companyFees:0,expenses:0,fees:0,net:0,goal:0,count:0,
  };
  if (!bounds || !validDate(bounds.start) || !validDate(bounds.end)
      || !validDate(currentDate) || bounds.start > bounds.end) return empty;
  const end = bounds.end < currentDate ? bounds.end : currentDate;
  const start = bounds.start;
  // Never count future rides or expenses in a "to date" dashboard.
  const included = rides.filter(ride => ride.date >= start && ride.date <= end);
  const gross = round2(included.reduce((sum,ride) => sum + ride.amount + ride.tip,0));
  const tips = round2(included.reduce((sum,ride) => sum + ride.tip,0));
  const serviceFees = round2(included.reduce((sum,ride) => sum + ride.serviceDeductions,0));
  const airportFees = start <= end ? airportLevyTotal(rides,
    accountingDate => accountingDate >= start && accountingDate <= end,
    settings.airportFee) : 0;
  const companyFees = start <= end ? weeklyCompanyFeeTotal(
    settings.companyFee,[start,end],[],currentDate) : 0;
  const expenses = start <= end ? expenseTotal(costs,[start,end]) : 0;
  const fees = round2(serviceFees + airportFees + companyFees + expenses);
  let goalCents = 0;
  if (settings.dailyGoalEnabled && start <= end) {
    const cursor = utcDate(start);
    const last = utcDate(end);
    while (cursor <= last) {
      // Settings order is Monday, Tuesday, ... Sunday.
      const dayIndex = (cursor.getUTCDay() + 6) % 7;
      goalCents += Math.round(Math.max(0,settings.dailyGoals[dayIndex] ?? 0) * 100);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return {valid:true,gross,tips,serviceFees,airportFees,companyFees,expenses,fees,
    net:round2(gross-fees),goal:goalCents/100,count:included.length};
}
