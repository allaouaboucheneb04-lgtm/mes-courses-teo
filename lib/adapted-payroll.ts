/** Transport adapté [PTR] lines in Téo supplier invoices.
 * Parse only within one invoice record so a missing amount cannot be taken
 * from the next ride, fee or summary. */
export type AdaptedPayrollRow = {
  key: string;
  type: "adapte";
  date: string;
  amount: number;
  tip: number;
};

const RECORD_BOUNDARY = /(?=\[[A-Z0-9_-]{2,20}\])/;

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day;
}

export function extractAdaptedPayrollRows(text: string): AdaptedPayrollRow[] {
  const rows: AdaptedPayrollRow[] = [];
  for (const record of text.split(RECORD_BOUNDARY)) {
    if (!record.trimStart().startsWith("[PTR]")) continue;
    // e.g. (HOB0001_23/03/2026 to ...) or HOB0001-23/03/2026
    const identifier = record.match(/\b(HOB\d{4,8})[_-](\d{2})\/(\d{2})\/(\d{4})\b/i);
    const amount = record.match(/(?:^|\s)1\s+([\d\u00a0\u202f ]+[,.]\d{2})(?=\s|\$|$)/m);
    if (!identifier || !amount) continue;

    const day = Number(identifier[2]);
    const month = Number(identifier[3]);
    const year = Number(identifier[4]);
    if (!validDate(year, month, day)) continue;

    const value = Number(amount[1].replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
    if (!Number.isFinite(value) || value < 0) continue;
    rows.push({
      key: identifier[1].toUpperCase(),
      type: "adapte",
      date: `${identifier[4]}-${identifier[3]}-${identifier[2]}`,
      amount: value,
      tip: 0,
    });
  }
  return rows;
}
