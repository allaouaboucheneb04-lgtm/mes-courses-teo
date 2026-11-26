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
