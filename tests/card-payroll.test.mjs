import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { extractCardPayrollRows } = await vite.ssrLoadModule('/lib/card-payroll.ts');
const ride = (code, key, amount) => `[${code}] Course [tx. Incl.] (${key} to test) Date: 23/03/2026 09:00:00 1 ${amount} TPS + TVQ TAXI`;
test('account rides are card-compatible, without mandatory tips; fees are excluded', () => {
  const rows = extractCardPayrollRows([
    ride('INV', '10001A', '15,80'), '[FDSINV] Frais -1 0,76 TPS',
    ride('CRD', '10002A', '16,70'),
    '[TIPC] Pourboire (10002A to test) Date: 23/03/2026 12:00:00 1 2,18',
    '[FDSCRD] Frais -1 0,90 TPS', ride('INV', '10003A', '14,20'),
    '[PTR] Course (HOB0001_23/03/2026 to test) 1 149,64 TPS',
  ].join(' '));
  assert.deepEqual(rows.map(r => [r.amount, r.tip, r.date, r.paymentKind]), [
    [15.8, 0, '2026-03-23', 'card'], [16.7, 2.18, '2026-03-23', 'card'], [14.2, 0, '2026-03-23', 'card'],
  ]);
});
test('incomplete records cannot borrow amounts or dates from later records', () => {
  assert.deepEqual(extractCardPayrollRows('[INV] Course (10001A to test) Date: 23/03/2026 [FDSINV] Frais 1 8,00'), []);
});
test('supports wrapped text and price before date without mixing equal-price rides', () => {
  const rows = extractCardPayrollRows('[INV] Course (10001A to test) 1 1 234,50 TPS Date: 23/03/2026\n' + ride('INV', '10002A', '1234.50'));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.amount), [1234.5, 1234.5]);
});
