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

test("uses only the exact course dates found in a payroll PDF", async () => {
  const { getPayrollCourseDates } = await vite.ssrLoadModule(
    "/lib/payroll-dates.ts",
  );

  const dates = getPayrollCourseDates([
    { date: "2026-09-03" },
    { date: "2026-09-01" },
    { date: "2026-09-03" },
  ]);

  assert.deepEqual(dates, ["2026-09-01", "2026-09-03"]);
  assert.equal(dates.includes("2026-09-02"), false);
  assert.equal(dates.includes("2026-09-04"), false);
});
