import { isCardPayment } from "./teo-payment";

/** Names reserved for application payment logic and combined filters. */
const RESERVED = [
  "Téo / carte", "Carte", "Compte", "Téo / compte",
  "Espèces", "Comptant", "Cash", "Coupon",
  "Machine crédit", "Autre", "Compte bancaire",
  "Transport adapté", "Adapté", "Téo + adapté",
];
const key = (name: string) => name.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

export const formatPaymentMethodName = (value: string) => value.trim().replace(/\s+/g, " ");

export function isStandardPaymentMethod(value: string): boolean {
  const name = formatPaymentMethodName(value);
  return RESERVED.some(item => key(item) === key(name)) || isCardPayment(name);
}

export function customPaymentNameError(value: string, current: readonly string[] = []): string | null {
  const name = formatPaymentMethodName(value);
  if (!name) return "Entrez le nom du nouveau mode de paiement.";
  if (name.length > 40) return "Le nom doit contenir au maximum 40 caractères.";
  if (/[\u0000-\u001f\u007f]/.test(name)) return "Le nom contient un caractère non autorisé.";
  if (isStandardPaymentMethod(name)) return "Ce mode de paiement existe déjà dans l’application.";
  if (current.some(item => key(item) === key(name))) return "Ce mode de paiement est déjà enregistré.";
  if (current.length >= 20) return "Vous pouvez ajouter au maximum 20 modes de paiement.";
  return null;
}

/** Normalize old/malformed settings without losing unique valid payment names. */
export function normalizeCustomPaymentMethods(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const result: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const name = formatPaymentMethodName(item);
    if (!customPaymentNameError(name, result)) result.push(name);
  }
  return result;
}

/** Keep older courses filterable after their custom method is removed from Settings. */
export function availableCustomPaymentMethods(
  configured: readonly string[] | undefined,
  rides: readonly {type: string; payment: string}[],
): string[] {
  const result = normalizeCustomPaymentMethods(configured);
  for (const ride of rides) {
    if (ride.type !== "taxi" || typeof ride.payment !== "string") continue;
    const name = formatPaymentMethodName(ride.payment);
    if (name && !isStandardPaymentMethod(name) &&
      !result.some(item => key(item) === key(name))) result.push(name);
  }
  return result;
}

export function samePaymentMethod(a: string, b: string): boolean {
  return key(a) === key(b);
}


/** The commission is a percentage of gross taxi revenue, including tips. */
export function customPaymentRateError(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{1,3}(?:[,.]\d{1,3})?$/.test(trimmed))
    return "Entrez un pourcentage valide (ex. 2,50).";
  const rate = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(rate) || rate < 0 || rate > 100)
    return "Le pourcentage doit être compris entre 0 et 100 %.";
  return null;
}
export function normalizeCustomPaymentFees(input: unknown): Record<string, number> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: Record<string, number> = {};
  for (const [raw, rate] of Object.entries(input)) {
    const name = formatPaymentMethodName(raw);
    if (!name || name.length > 40 || isStandardPaymentMethod(name) ||
        typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100)
      continue;
    const old = Object.keys(result).find(other => samePaymentMethod(other, name));
    if (old) continue;
    result[name] = Math.round(rate * 1000) / 1000;
  }
  return result;
}
/** Missing rates in older saved settings intentionally default to 0%. */
export function getCustomPaymentRate(
  payment: string,
  fees: Readonly<Record<string, number>> | undefined,
): number {
  if (!fees || isStandardPaymentMethod(payment)) return 0;
  for (const [name, rate] of Object.entries(fees)) {
    if (samePaymentMethod(name, payment) &&
        typeof rate === "number" && Number.isFinite(rate) && rate >= 0 && rate <= 100)
      return rate;
  }
  return 0;
}
/** Update by canonical name, avoiding duplicate keys with different casing. */
export function setCustomPaymentRate(
  fees: Readonly<Record<string, number>> | undefined,
  method: string,
  rate: number,
): Record<string, number> {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return normalizeCustomPaymentFees(fees);
  const canonical = formatPaymentMethodName(method);
  if (!canonical || isStandardPaymentMethod(canonical)) return normalizeCustomPaymentFees(fees);
  const previous = normalizeCustomPaymentFees(fees);
  return {
    ...Object.fromEntries(Object.entries(previous).filter(([name]) => !samePaymentMethod(name, canonical))),
    [canonical]: Math.round(rate * 1000) / 1000,
  };
}


/** Compute a single service deduction; other taxes and levies are separate. */
export function customPaymentFeeAmount(
  gross: number, payment: string,
  fees: Readonly<Record<string, number>> | undefined,
): number {
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  const rate = getCustomPaymentRate(payment, fees);
  return Math.round(((gross * rate) / 100 + Number.EPSILON) * 100) / 100;
}
