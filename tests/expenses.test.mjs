import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { expenseTotal } = await vite.ssrLoadModule("/lib/expenses.ts");
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
