const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

export function isCardPayment(payment: string) {
  return ["CARTE", "COMPTE", "TEO / COMPTE", "TEO / CARTE"].includes(normalize(payment));
}

export function isImportableTeoPayment(segment: string, total?: number) {
  const text = normalize(segment);
  if (/\b(COMPTANT|ESPECES?|CANCELLED|ANNULEE?)\b/.test(text)) return false;
  // A paid no-show is a Téo ride even without a Carte/Compte label.
  // Use the parsed row amount, never a number from its address or date.
  if (/\bNO[\s-]*SHOW\b/.test(text))
    return typeof total === "number" && Number.isFinite(total) && total > 0;
  return /\b(CARTE|COMPTE)\b/.test(text);
}
