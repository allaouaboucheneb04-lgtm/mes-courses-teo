/** The same Téo BILL can have several "Payé le" transfers.
 * Keep each transfer and sum in cents so 370,93 + 127,37 = 498,30. */
export type PayrollTransfer = { date: string; amount: number };

export function extractPayrollTransfers(text: string): PayrollTransfer[] {
  const transfers: PayrollTransfer[] = [];
  const pattern = /Pay[ée]\s+le\s+(\d{4}-\d{2}-\d{2})\s+([\d\u00a0\u202f ]+[,.]\d{2})\s*\$/gi;
  for (const match of text.matchAll(pattern)) {
    const amount = Number(match[2].replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) continue;
    transfers.push({ date: match[1], amount });
  }
  return transfers;
}

export function summarizePayrollTransfers(transfers: readonly PayrollTransfer[]) {
  const totalCents = transfers.reduce((sum, transfer) => sum + Math.round(transfer.amount * 100), 0);
  const paidDate = transfers.map(transfer => transfer.date).sort().at(-1) || "";
  return { paidDate, paidAmount: totalCents / 100 };
}
