// Téo uses day/month with a time for the capture's current day, and
// month/day without a time for older rides. Never infer order from the
// month header: ambiguous dates such as 09/08 would otherwise be reversed.
export function parsePhotoDate(segment: string, fallbackYear: string): string {
  const match = segment.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(20\d{2}))?\b/);
  if (!match) return "";
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3] || fallbackYear);
  const suffix = segment.slice((match.index || 0) + match[0].length);
  const hasTime = /^\s*(?:@|À|A)?\s*\d{1,2}\s*[:H]\s*\d{2}\b/i.test(suffix);
  // If OCR drops the time, a first component above 12 is still unambiguous.
  const dayFirst = hasTime || first > 12;
  const month = dayFirst ? second : first;
  const day = dayFirst ? first : second;
  if (!Number.isInteger(year) || year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
