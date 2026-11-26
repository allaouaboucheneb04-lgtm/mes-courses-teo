import { isCardPayment } from "./teo-payment";
import { samePaymentMethod } from "./custom-payments";

/** Payment methods in the History filter. Distinct from course categories. */
export type HistoryPaymentFilter =
  | "all"
  | "teo-adapte"
  | "teo-card"
  | "cash"
  | "coupon"
  | "machine"
  | "adapted"
  | `custom:${string}`;

type PaymentCourse = { type: string; payment: string };

export function matchesHistoryPayment(course: PaymentCourse, filter: HistoryPaymentFilter): boolean {
  if (filter === "all") return true;
  if (filter === "teo-adapte") {
    return course.type === "adapte" ||
      (course.type === "taxi" && isCardPayment(course.payment));
  }
  if (filter === "adapted") return course.type === "adapte";
  if (filter.startsWith("custom:")) return course.type === "taxi" && samePaymentMethod(course.payment, filter.slice(7));
  if (course.type !== "taxi") return false;
  if (filter === "teo-card") return isCardPayment(course.payment);
  if (filter === "cash") return course.payment === "Espèces" || course.payment === "Comptant";
  if (filter === "coupon") return course.payment === "Coupon";
  return filter === "machine" && (course.payment === "Machine crédit" || course.payment === "Autre");
}
