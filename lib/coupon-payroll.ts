export type ParsedCouponPayrollRow = {
  couponNumber: string;
  couponAccount: string;
  date: string;
  amount: number;
  tip: number;
};

const withoutAccents = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const normalizeCouponReference = (value?: string | null) =>
  withoutAccents(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const cleanReference = (value?: string) =>
  (value || "").trim().replace(/^[:#\s-]+|[:#\s-]+$/g, "");

const usableReference = (value?: string) => {
  const cleaned = cleanReference(value);
  const normalized = normalizeCouponReference(cleaned);
  if (
    normalized.length < 2 ||
    ["COUPON", "COMPTE", "ACCOUNT", "COURSE", "TAXI", "TX", "INCL"].includes(
      normalized,
    )
  )
    return "";
  return cleaned.toUpperCase();
};

const labelledReference = (segment: string, label: "coupon" | "account") => {
  const pattern =
    label === "coupon"
      ? /(?:N(?:O|°)\.?|NUM(?:É|E)RO)\s*(?:DE|DU)?\s*COUPON\s*[:#-]?\s*([A-Z0-9][A-Z0-9_./-]{1,39})/i
      : /(?:N(?:O|°)\.?|NUM(?:É|E)RO)\s*(?:DE|DU)?\s*(?:COMPTE|ACCOUNT)\s*[:#-]?\s*([A-Z0-9][A-Z0-9_./-]{1,39})/i;
  return usableReference(segment.match(pattern)?.[1]);
};

/**
 * Reads coupon/office-charge lines from Téo supplier invoices. Téo invoice
 * exports have changed labels over time, so the parser intentionally accepts
 * either "Coupon" or "Charge au bureau" and both labelled and `(x to y)`
 * reference formats.
 */
export function extractCouponPayrollRows(
  text: string,
): ParsedCouponPayrollRow[] {
  const starts = [...text.matchAll(/\[[A-Z0-9_-]{2,20}\]/gi)];
  const rows: ParsedCouponPayrollRow[] = [];

  for (let index = 0; index < starts.length; index++) {
    const start = starts[index].index ?? 0;
    const end = starts[index + 1]?.index ?? text.length;
    const segment = text.slice(start, end);
    const heading = withoutAccents(segment.slice(0, 260)).toUpperCase();

    if (!/(?:COUPON|CHARGE\s+AU\s+BUREAU)/.test(heading)) continue;
    if (/(?:FRAIS\s+DE\s+SERVICE|POURBOIRE)/.test(heading)) continue;

    const dateMatch = segment.match(
      /Date\s*:\s*(\d{2})\/(\d{2})\/(\d{4})/i,
    );
    const amountMatch = segment.match(
      /(?:^|\s)1\s+([\d\u00a0 ]+[,.]\d{2})(?=\s|\$|$)/m,
    );
    if (!dateMatch || !amountMatch) continue;

    const pair = segment.match(
      /\(\s*([A-Z0-9][A-Z0-9_./ -]{0,39}?)\s+(?:TO|VERS|À|A|->)\s+([A-Z0-9][A-Z0-9_./ -]{0,39}?)\s*\)/i,
    );
    const couponNumber =
      labelledReference(segment, "coupon") || usableReference(pair?.[1]);
    const couponAccount =
      labelledReference(segment, "account") || usableReference(pair?.[2]);

    if (!couponNumber && !couponAccount) continue;

    rows.push({
      couponNumber,
      couponAccount,
      date: `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`,
      amount:
        Number(
          amountMatch[1]
            .replace(/[\s\u00a0]/g, "")
            .replace(",", "."),
        ) || 0,
      tip: 0,
    });
  }

  return rows;
}
