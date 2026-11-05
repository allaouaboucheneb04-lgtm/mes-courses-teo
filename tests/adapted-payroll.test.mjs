import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
});
after(() => vite.close());
const { extractAdaptedPayrollRows } = await vite.ssrLoadModule("/lib/adapted-payroll.ts");

const ptr = (id, date, price) => `[PTR] Course (HOB${id}_${date} to test) 1 ${price} TPS + TVQ`;

test("reads HOB work in real course date, including an amount over 1000", () => {
  const result = extractAdaptedPayrollRows([
    ptr("1234", "29/10/2026", "149,64"),
    "[FDS] Frais -1 0,99 TPS",
    ptr("4321", "30/10/2026", "1 234,56"),
  ].join(" "));
  assert.deepEqual(result, [
    {key:"HOB1234",type:"adapte",date:"2026-10-29",amount:149.64,tip:0},
    {key:"HOB4321",type:"adapte",date:"2026-10-30",amount:1234.56,tip:0},
  ]);
});

test("malformed PTR never borrows amount from next row or fee", () => {
  const result = extractAdaptedPayrollRows(
    "[PTR] Course (HOB1234_29/10/2026 to test) [FDS] Frais 1 8,00 TPS " +
    "[PTR] Course (HOB5678_30/10/2026 to test) 1 39,50 TPS"
  );
  assert.deepEqual(result.map(r => r.key), ["HOB5678"]);
});

test("ignores invalid dates and omits invoices with no valid PTR", () => {
  assert.deepEqual(extractAdaptedPayrollRows(ptr("1234","31/02/2026","149,64")),[]);
  assert.deepEqual(extractAdaptedPayrollRows("[FDS] Frais -1 99,99 TPS"),[]);
});
