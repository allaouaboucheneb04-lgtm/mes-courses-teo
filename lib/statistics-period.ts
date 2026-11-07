import { periodDates, previousAnchor, shiftDate } from "./comparison";

export type StatisticsPeriod = "day" | "week" | "previous" | "month" | "all" | "custom";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function validISO(date: string) {
  if (!DATE_PATTERN.test(date)) return false;
  const parsed = new Date(date + "T12:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === date;
}
export function dateSequence(start: string, end: string, maxDays = 3660): string[] {
  if (!validISO(start) || !validISO(end) || start > end) return [];
  const count = Math.round((Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 86400000) + 1;
  if (count <= 0 || count > maxDays) return [];
  return Array.from({length: count}, (_, index) => shiftDate(start, index));
}

export function statisticsPeriodDates(
  period: StatisticsPeriod, today: string, from: string, to: string, rideDates: readonly string[]
) {
  if (!validISO(today)) return { current: [] as string[], previous: [] as string[], valid: false, comparable: false };
  if (period === "day") {
    return {current: [today], previous: [shiftDate(today, -7)], valid: true, comparable: true};
  }
  if (period === "week" || period === "previous") {
    const anchor = period === "week" ? today : shiftDate(today, -7);
    return {current: periodDates(anchor, "week"), previous: periodDates(shiftDate(anchor, -7), "week"), valid: true, comparable: true};
  }
  if (period === "month") {
    return {current: periodDates(today, "month"), previous: periodDates(previousAnchor(today, "month"), "month"), valid: true, comparable: true};
  }
  if (period === "all") {
    return {current: [...new Set(rideDates.filter(value => validISO(value) && value <= today))].sort(), previous: [] as string[], valid: true, comparable: false};
  }
  const current = dateSequence(from, to);
  if (!current.length) return {current, previous: [] as string[], valid: false, comparable: true};
  const endPrevious = shiftDate(from, -1);
  const startPrevious = shiftDate(from, -current.length);
  return {current, previous: dateSequence(startPrevious, endPrevious), valid: true, comparable: true};
}

/** Group large periods into a limited number of readable graph rows. */
export function statisticsGraphGroups(current: string[], previous: string[], allTime = false) {
  if (allTime) {
    const months = [...new Set(current.map(date => date.slice(0,7)))].sort();
    return months.slice(-12).map(month => ({
      label: new Date(month + "-15T12:00:00").toLocaleDateString("fr-CA", {month:"short",year:"numeric"}),
      now: current.filter(date => date.startsWith(month)),
      old: [] as string[],
    }));
  }
  const length = Math.max(current.length, previous.length);
  const stride = length > 31 ? Math.ceil(length / 12) : 1;
  const rows = [];
  for (let index=0; index<length; index += stride) {
    const now = current.slice(index,index+stride);
    const old = previous.slice(index,index+stride);
    const label = stride === 1
      ? (now[0] || old[0] || "")
      : (now[0] || old[0] || "") + " – " + (now.at(-1) || old.at(-1) || "");
    rows.push({ label, now, old });
  }
  return rows;
}
