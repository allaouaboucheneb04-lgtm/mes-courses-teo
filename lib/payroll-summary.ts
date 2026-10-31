export type PayrollSummaryCourse = {
  id: string;
  date: string;
  amount: number;
  tip: number;
  verified?: boolean;
  serviceFee?: number;
  perception?: number;
  airportFee?: number;
};

// The caller supplies only courses included in Téo payroll.
// Keep every ride, including identical dates and amounts, as a separate entry.
export function summarizePayroll<T extends PayrollSummaryCourse>(courses: T[]) {
  const verified: T[] = [];
  const unverified: T[] = [];
  let verifiedCents = 0;
  let unverifiedCents = 0;
  let verifiedNetCents = 0;
  let unverifiedNetCents = 0;
  for (const course of courses) {
    const cents = Math.round(course.amount * 100) + Math.round(course.tip * 100);
    const netCents = cents - Math.round((course.serviceFee || 0) * 100) - Math.round((course.perception || 0) * 100) - Math.round((course.airportFee || 0) * 100);
    if (course.verified === true) {
      verified.push(course);
      verifiedCents += cents;
      verifiedNetCents += netCents;
    } else {
      unverified.push(course);
      unverifiedCents += cents;
      unverifiedNetCents += netCents;
    }
  }
  const newestFirst = (a: T, b: T) => b.date.localeCompare(a.date);
  return {
    verified: verified.sort(newestFirst),
    unverified: unverified.sort(newestFirst),
    verifiedTotal: verifiedCents / 100,
    unverifiedTotal: unverifiedCents / 100,
    verifiedNet: verifiedNetCents / 100,
    unverifiedNet: unverifiedNetCents / 100,
  };
}

export function defaultTaxiCategory(settings: {
  airportEnabled: boolean;
  defaultTaxiCategory?: "centre-ville" | "aeroport";
}): "centre-ville" | "aeroport" {
  return settings.airportEnabled && settings.defaultTaxiCategory === "aeroport"
    ? "aeroport"
    : "centre-ville";
}

export type BankReceipt = { date: string; amount: number };
export type PayrollBankStatement = {
  id: string;
  total: number;
  paidAmount: number;
  bankReceipt?: BankReceipt | null;
};
export type TrackingPeriod = "all" | "week" | "last-week" | "month" | "custom";
const dayMs = 86400000;
export function validTrackingDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
export function trackingRange(period: TrackingPeriod, today: string, start = "", end = "") {
  if (period === "all") return { start: "", end: "", valid: true };
  if (period === "custom") return { start, end, valid: validTrackingDate(start) && validTrackingDate(end) && start <= end };
  const date = new Date(`${today}T12:00:00Z`);
  const shift = (days: number) => new Date(date.getTime() + days * dayMs).toISOString().slice(0, 10);
  if (period === "month") return { start: `${today.slice(0, 7)}-01`, end: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+1, 0, 12)).toISOString().slice(0,10), valid: true };
  const offset = -((date.getUTCDay() + 5) % 7) - (period === "last-week" ? 7 : 0);
  return { start: shift(offset), end: shift(offset + 6), valid: true };
}
export function courseAge(date: string, today: string) {
  if (!validTrackingDate(date) || !validTrackingDate(today)) return 0;
  return Math.max(0, Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / dayMs));
}
export function isLongUnverified(course: PayrollSummaryCourse, today: string, days: number) {
  return course.verified !== true && courseAge(course.date, today) >= days;
}
export function expectedBankAmount(statement: PayrollBankStatement) {
  return Math.max(0, statement.total > 0 ? statement.total : statement.paidAmount);
}
export function bankReceiptStatus(statement?: PayrollBankStatement) {
  const receipt = statement?.bankReceipt;
  if (!statement || !receipt || !Number.isFinite(receipt.amount) || receipt.amount <= 0 || !validTrackingDate(receipt.date)) return "unconfirmed";
  return Math.round(receipt.amount * 100) < Math.round(expectedBankAmount(statement) * 100) ? "partial" : "received";
}
export function validBankReceipt(receipt: BankReceipt, today: string) {
  return validTrackingDate(receipt.date) && receipt.date <= today && Number.isFinite(receipt.amount) && receipt.amount > 0;
}
// Reimporting a PDF updates its contents, never the driver's bank confirmation.
export function retainBankReceipt<T extends PayrollBankStatement>(incoming: T, previous?: PayrollBankStatement): T {
  return previous?.bankReceipt ? { ...incoming, bankReceipt: previous.bankReceipt } : incoming;
}
