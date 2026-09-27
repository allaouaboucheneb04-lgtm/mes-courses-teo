/** Corporate-account (INV) and card (CRD) rides share the Téo payment flow. */
export function extractCardPayrollRows(text: string) {
  // Bound each record so a malformed ride cannot borrow the next one's data.
  // Labels such as [tx. Incl.] are not invoice record codes.
  const blocks = text.split(/(?=\[[A-Z0-9_-]{2,20}\])/);
  const tips = new Map<string, number>();
  const amountPattern = /\s1\s+([\d\u00a0 ]+[,.]\d{2})(?=\s|\$|$)/;
  const amountOf = (value: string) => Number(value.replace(/\s/g, "").replace(",", "."));
  for (const block of blocks) {
    if (!block.startsWith("[TIPC]")) continue;
    const key = block.match(/\((\d+A)\s+to\b/)?.[1];
    const amount = block.match(amountPattern)?.[1];
    if (key && amount) tips.set(key, amountOf(amount));
  }
  const rows: { key: string; type: "taxi"; date: string; amount: number; tip: number; paymentKind: "card" }[] = [];
  for (const block of blocks) {
    if (!/^\[(?:CRD|INV)\]/.test(block)) continue;
    const key = block.match(/\((\d+A)\s+to\b/)?.[1];
    const date = block.match(/Date:\s*(\d{2})\/(\d{2})\/(\d{4})/);
    const amount = block.match(amountPattern)?.[1];
    if (!key || !date || !amount) continue;
    rows.push({ key, type: "taxi", date: `${date[3]}-${date[2]}-${date[1]}`,
      amount: amountOf(amount), tip: tips.get(key) || 0, paymentKind: "card" });
  }
  return rows;
}
