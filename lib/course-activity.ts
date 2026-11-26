/**
 * Shared course category filtering across History, SEV, Statistics and Payroll.
 * "Téo + adapté" intentionally includes BOTH activity types but no other type.
 */
export type CourseActivity = "all" | "both" | "taxi" | "adapte" | "aeroport" | "centre-ville";
export type ActivityRide = { type: string; taxiCategory?: string };

export function matchesCourseActivity(ride: ActivityRide, category: CourseActivity): boolean {
  if (category === "all") return true;
  if (category === "both") return ride.type === "taxi" || ride.type === "adapte";
  if (category === "taxi" || category === "adapte") return ride.type === category;
  if (ride.type !== "taxi") return false;
  return category === "aeroport"
    ? ride.taxiCategory === "aeroport"
    : ride.taxiCategory !== "aeroport";
}
