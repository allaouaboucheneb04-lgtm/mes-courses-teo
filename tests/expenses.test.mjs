import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { expenseTotal, weeklyCompanyFeeTotal } = await vite.ssrLoadModule("/lib/expenses.ts");
const expenses = [
  { date: "2026-09-14", amount: 10 },
  { date: "2026-09-15", amount: 20.15 },
  { date: "2026-09-21", amount: 30.25 },
  { date: "2026-09-22", amount: 40 },
];
test("Tuesday–Monday weekly bounds include both endpoints", () => {
  assert.equal(expenseTotal(expenses, ["2026-09-15", "2026-09-21"]), 50.4);
});
test("daily expenses count without any rides", () => {
  assert.equal(expenseTotal(expenses, ["2026-09-21", "2026-09-21"]), 30.25);
});
test("all dates, empty and reversed periods", () => {
  assert.equal(expenseTotal(expenses), 100.4);
  assert.equal(expenseTotal([]), 0);
  assert.equal(expenseTotal(expenses, ["2026-10-01", "2026-09-01"]), 0);
});
test("editing and deleting recalculate without duplicated deductions", () => {
  const edited = expenses.map((expense, index) => index === 1 ? { ...expense, amount: 5 } : expense);
  assert.equal(expenseTotal(edited, ["2026-09-15", "2026-09-21"]), 35.25);
  assert.equal(expenseTotal(edited.filter((_, index) => index !== 1), ["2026-09-15", "2026-09-21"]), 30.25);
});
test("money is summed in cents", () => {
  assert.equal(expenseTotal([{ date: "2026-09-21", amount: 0.1 }, { date: "2026-09-21", amount: 0.2 }]), 0.3);
});


const company = (bounds, activity = [], today = "2026-11-11", fee = 200.42) =>
  weeklyCompanyFeeTotal(fee, bounds, activity, today);

test("History includes company fee even with zero rides during Tuesday–Monday week", () => {
  assert.equal(company(["2026-11-10", "2026-11-16"]), 200.42);
  assert.equal(Math.round((-25.76 - company(["2026-11-10", "2026-11-16"])) * 100) / 100, -226.18);
  assert.equal(company(["2026-11-03", "2026-11-09"]), 200.42);
});

test("History company fee respects accounting Tuesday in month and custom ranges", () => {
  assert.equal(company(["2026-11-01", "2026-11-11"]), 400.84);
  assert.equal(company(["2026-11-09", "2026-11-09"]), 0);
  assert.equal(company(["2026-11-10", "2026-11-10"]), 200.42);
  assert.equal(company(["2026-11-11", "2026-11-11"]), 0);
  assert.equal(company(["2026-10-20", "2026-11-11"]), 801.68);
  assert.equal(company(["2026-11-10", "2026-11-30"]), 200.42);
});

test("History company fee handles all dates without assuming inactive gaps", () => {
  assert.equal(company(null, ["2026-10-22", "2026-10-23", "2026-11-09"]), 601.26);
  assert.equal(company(null), 200.42);
  assert.equal(company(["2026-11-13", "2026-11-10"]), 0);
  assert.equal(company(["bad", "2026-11-11"]), 0);
  assert.equal(company(["2026-11-10", "2026-11-16"], [], "2026-11-11", 0), 0);
  assert.equal(company(["2026-11-10", "2026-11-16"], [], "2026-11-11", 6.44), 6.44);
});
