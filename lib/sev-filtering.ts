/** Pure, testable filters for the SEV and Téo payroll views.
 * A SEV declaration and Téo payroll verification are independent statuses. */
export type SevPeriod = "week" | "previous" | "month" | "custom" | "all";
export type SevCategory = "all" | "taxi" | "aeroport" | "centre-ville" | "adapte";
export type SevDeclarationStatus = "all" | "pending" | "added";
export type SevPayrollStatus = "all" | "verified" | "unverified";

export type SevFilterRide = {
  id: string;
  type: string;
  date: string;
  amount: number;
  tip: number;
  hob?: string;
  teoId?: string;
  taxiCategory?: string;
  verifiedBillId?: string;
  verified?: boolean;
  sevAdded?: boolean;
};
export type SevFilters = {
  period: SevPeriod;
  week: { start: string; end: string };
  today: string;
  start: string;
  end: string;
  category: SevCategory;
  search: string;
};

function addDays(iso: string, days: number) {
  const date = new Date(iso + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function matchesSevPeriod(ride: SevFilterRide, filters: SevFilters): boolean {
  switch (filters.period) {
    case "all": return true;
    case "week": return ride.date >= filters.week.start && ride.date <= filters.week.end;
    case "previous": return ride.date >= addDays(filters.week.start, -7) && ride.date <= addDays(filters.week.end, -7);
    case "month": return ride.date.startsWith(filters.today.slice(0, 7));
    case "custom": return !!filters.start && !!filters.end && filters.start <= filters.end &&
      ride.date >= filters.start && ride.date <= filters.end;
  }
}

export function matchesSevCategory(ride: SevFilterRide, category: SevCategory): boolean {
  if (category === "all") return true;
  if (category === "adapte") return ride.type === "adapte";
  if (ride.type !== "taxi") return false;
  if (category === "taxi") return true;
  // Legacy taxi rides without a saved category have always appeared as centre-ville.
  if (category === "centre-ville") return ride.taxiCategory !== "aeroport";
  return ride.taxiCategory === "aeroport";
}

const normalizeText = (value: string) => value
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().trim();

export function matchesSevSearch(ride: SevFilterRide, search: string): boolean {
  const query = normalizeText(search);
  if (!query) return true;
  const dateAlt = /^\d{4}-\d{2}-\d{2}$/.test(ride.date)
    ? ride.date.slice(8, 10) + "/" + ride.date.slice(5, 7) + "/" + ride.date.slice(0, 4)
    : "";
  const haystack = normalizeText([
    ride.hob || "", ride.teoId || "", ride.taxiCategory || "",
    ride.verifiedBillId || "", ride.date, dateAlt,
    ride.type === "adapte" ? "transport adapte" : "taxi",
  ].join(" "));
  if (haystack.includes(query)) return true;
  const numericQuery = query.replace(/[\s$\u00a0\u202f]/g, "").replace(",", ".");
  return /^\d+(?:\.\d{0,2})?$/.test(numericQuery) &&
    (Math.round((ride.amount + ride.tip) * 100) / 100).toFixed(2).includes(numericQuery);
}

export function filterSevRides<T extends SevFilterRide>(rides: T[], filters: SevFilters): T[] {
  return rides
    .filter(ride =>
      matchesSevCategory(ride, filters.category) &&
      matchesSevPeriod(ride, filters) &&
      matchesSevSearch(ride, filters.search))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function filterSevStatuses<T extends SevFilterRide>(
  rides: T[], declaration: SevDeclarationStatus, payroll: SevPayrollStatus,
): T[] {
  return rides.filter(ride =>
    (declaration === "all" || (declaration === "added" ? !!ride.sevAdded : !ride.sevAdded)) &&
    (payroll === "all" || (payroll === "verified" ? ride.verified === true : ride.verified !== true))
  );
}

/** Totals for the chosen period and search, across every category.
 * The current category choice must not zero the other category cards.
 * Counts use ride IDs as individual rides, never aggregate identical amounts. */
export function summarizeSevCategories<T extends SevFilterRide>(rides: T[]) {
  const categories = [
    { id: "aeroport", label: "Aéroport" },
    { id: "centre-ville", label: "Centre-ville" },
    { id: "adapte", label: "Transport adapté" },
  ] as const;
  return categories.map(category => {
    const selected = rides.filter(ride => matchesSevCategory(ride, category.id));
    const amountCents = selected.reduce(
      (sum, ride) => sum + Math.round(ride.amount * 100) + Math.round(ride.tip * 100),
      0
    );
    return { ...category, count: selected.length, amount: amountCents / 100 };
  });
}
