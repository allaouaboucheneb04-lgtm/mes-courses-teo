import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { cardPayrollDifference, resolvePhotoTip } = await vite.ssrLoadModule('/lib/photo-tip.ts');
test('unknown screenshot tip matches the payroll total and preserves revenue', () => {
  const course = { amount: 23.82, tip: 0, tipPending: true };
  const row = { amount: 20, tip: 3.82 };
  assert.ok(cardPayrollDifference(course, row) < 0.02);
  const resolved = { ...course, ...resolvePhotoTip(course, row) };
  assert.deepEqual(resolved, { amount: 20, tip: 3.82, tipPending: false });
  assert.equal(resolved.amount + resolved.tip, course.amount + course.tip);
});
test('explicit zero and manual rides still require the correct tip', () => {
  const row = { amount: 20, tip: 3.82 };
  assert.ok(cardPayrollDifference({ amount: 23.82, tip: 0 }, row) > 0.02);
  assert.ok(cardPayrollDifference({ amount: 23.82, tip: 0, tipPending: false }, row) > 0.02);
});
test('different totals are not verified and genuine zero is resolved', () => {
  assert.ok(cardPayrollDifference({ amount: 24, tip: 0, tipPending: true }, { amount: 20, tip: 3.82 }) > 0.02);
  assert.deepEqual(resolvePhotoTip({ amount: 14.7, tip: 0, tipPending: true }, { amount: 14.7, tip: 0 }), { amount: 14.7, tip: 0, tipPending: false });
});
