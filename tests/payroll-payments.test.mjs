import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
});
after(() => vite.close());

const { extractPayrollTransfers, summarizePayrollTransfers } =
  await vite.ssrLoadModule("/lib/payroll-payments.ts");

test("two partial deposits on same BILL are summed, not just the first", () => {
  const text = [
    "Facture fournisseur BILL001234567",
    "Total 498,30 $",
    "Payé le 2026-10-08 370,93 $",
    "Payé le 2026-10-08 127,37 $",
    "Montant dû 0,00 $",
  ].join(" ");
  const transfers = extractPayrollTransfers(text);
  assert.deepEqual(transfers, [
    {date:"2026-10-08", amount:370.93},
    {date:"2026-10-08", amount:127.37},
  ]);
  assert.deepEqual(summarizePayrollTransfers(transfers), {
    paidDate:"2026-10-08",paidAmount:498.3,
  });
});

test("different payment dates use last payment date and sum all payments", () => {
  const transfers=extractPayrollTransfers(
    "Payé le 2026-09-25 10,00 $ Payé le 2026-10-01 20,50 $"
  );
  assert.deepEqual(summarizePayrollTransfers(transfers), {
    paidDate:"2026-10-01",paidAmount:30.5,
  });
});

test("paid summary does not capture invoices without any payment", () => {
  assert.deepEqual(summarizePayrollTransfers(extractPayrollTransfers("Total 80,00 $ Montant dû 80,00 $")), {
    paidDate:"",paidAmount:0,
  });
});
