import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

test("extracts a deposited coupon with coupon and account references", async () => {
  const { extractCouponPayrollRows } = await vite.ssrLoadModule(
    "/lib/coupon-payroll.ts",
  );
  const text = `
    [CPN] Course - Coupon [tx. Incl.] (CP-001245 to ACCT-753738)
    Date: 15/09/2026 13:45:00
    1 42,50 TPS + TVQ 42,50 $
    [FDSCPN] Frais de service - Coupon -1 2,34 TPS + TVQ -2,69 $
  `;

  assert.deepEqual(extractCouponPayrollRows(text), [
    {
      couponNumber: "CP-001245",
      couponAccount: "ACCT-753738",
      date: "2026-09-15",
      amount: 42.5,
      tip: 0,
    },
  ]);
});

test("accepts labelled references on a charge-au-bureau line", async () => {
  const { extractCouponPayrollRows, normalizeCouponReference } =
    await vite.ssrLoadModule("/lib/coupon-payroll.ts");
  const text = `
    [CAB] Charge au bureau - Numéro de coupon: 77-8899 Numéro de compte: CH-407
    Date: 14/09/2026 09:12:00 1 1 234,56 TPS + TVQ 1 234,56 $
  `;

  assert.deepEqual(extractCouponPayrollRows(text), [
    {
      couponNumber: "77-8899",
      couponAccount: "CH-407",
      date: "2026-09-14",
      amount: 1234.56,
      tip: 0,
    },
  ]);
  assert.equal(normalizeCouponReference(" ch - 407 "), "CH407");
});
