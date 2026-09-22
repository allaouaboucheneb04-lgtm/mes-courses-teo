const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

export function isCardPayment(payment: string) {
  return ["CARTE", "COMPTE", "TEO / COMPTE", "TEO / CARTE"].includes(normalize(payment));
}

export function isImportableTeoPayment(segment: string) {
  const text = normalize(segment);
  return /\b(CARTE|COMPTE)\b/.test(text) &&
    !/\b(COMPTANT|ESPECES?|CANCELLED|ANNULEE?|NO[\s-]*SHOW)\b/.test(text);
}
