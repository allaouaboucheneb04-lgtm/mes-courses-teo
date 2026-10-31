export type HistoryTypeFilter = "all" | "taxi" | "aeroport" | "centre-ville" | "adapte";
type SearchableCourse = {
  type: "taxi" | "adapte";
  taxiCategory?: "aeroport" | "centre-ville";
  amount: number;
  tip: number;
  hob?: string;
  teoId?: string;
  couponNumber?: string;
  couponAccount?: string;
  payment: string;
};
export function matchesHistoryType(course: SearchableCourse, filter: HistoryTypeFilter) {
  if (filter === "all") return true;
  if (filter === "taxi" || filter === "adapte") return course.type === filter;
  return course.type === "taxi" && (course.taxiCategory || "centre-ville") === filter;
}
export function matchesHistorySearch(course: SearchableCourse, search: string) {
  const query = search.trim().toUpperCase();
  if (!query) return true;
  const amountQuery = query.replace(/\s/g, "").replace(/\$$/, "").replace(",", ".");
  if (/^\d+(?:\.\d{1,2})?$/.test(amountQuery)) {
    const cents = Math.round(Number(amountQuery) * 100);
    if ([course.amount, course.amount + course.tip].some(value => Number.isFinite(value) && Math.round(value * 100) === cents)) return true;
  }
  return [course.hob, course.teoId, course.couponNumber, course.couponAccount, course.payment, course.taxiCategory]
    .some(value => value?.toUpperCase().includes(query));
}
