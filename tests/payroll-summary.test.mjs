import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'vite';
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { summarizePayroll, defaultTaxiCategory } = await vite.ssrLoadModule('/lib/payroll-summary.ts');
test('counts same-day same-amount rides separately and splits verified status', () => {
  const courses = [
    { id: 'a', date: '2026-10-28', amount: 20, tip: 3, verified: true },
    { id: 'b', date: '2026-10-28', amount: 20, tip: 3 },
    { id: 'c', date: '2026-10-28', amount: 20, tip: 3, verified: false },
    { id: 'd', date: '2026-10-29', amount: 0.1, tip: 0.2 },
  ];
  const summary = summarizePayroll(courses);
  assert.equal(summary.verifiedTotal, 23);
  assert.equal(summary.unverifiedTotal, 46.3);
  assert.deepEqual(summary.unverified.map(c => c.id), ['d', 'b', 'c']);
  assert.equal(courses[0].id, 'a');
  const refreshed = summarizePayroll(courses.map(c => c.id === 'b' ? {...c, verified: true} : c));
  assert.equal(refreshed.verifiedTotal, 46);
  assert.equal(refreshed.unverifiedTotal, 23.3);
});
test('empty history and screenshot totals do not invent a tip', () => {
  assert.equal(summarizePayroll([]).unverifiedTotal, 0);
  assert.equal(summarizePayroll([{id:'photo',date:'2026-10-28',amount:23.82,tip:0,tipPending:true}]).unverifiedTotal,23.82);
});
test('saved category works and legacy or disabled-airport settings use centre-ville', () => {
  assert.equal(defaultTaxiCategory({airportEnabled:true,defaultTaxiCategory:'aeroport'}),'aeroport');
  assert.equal(defaultTaxiCategory({airportEnabled:false,defaultTaxiCategory:'aeroport'}),'centre-ville');
  assert.equal(defaultTaxiCategory({airportEnabled:true}),'centre-ville');
  assert.equal(defaultTaxiCategory({airportEnabled:true,defaultTaxiCategory:'centre-ville'}),'centre-ville');
});

const { trackingRange, courseAge, isLongUnverified, bankReceiptStatus, validBankReceipt, retainBankReceipt } = await vite.ssrLoadModule('/lib/payroll-summary.ts');
test('tracking weeks run Tuesday to Monday across month and year boundaries', () => {
  assert.deepEqual(trackingRange('week','2026-01-05'), { start:'2025-12-30',end:'2026-01-05',valid:true });
  assert.deepEqual(trackingRange('last-week','2026-01-06'), { start:'2025-12-30',end:'2026-01-05',valid:true });
  assert.deepEqual(trackingRange('month','2024-02-28'), { start:'2024-02-01',end:'2024-02-29',valid:true });
  assert.equal(trackingRange('custom','2026-10-28','2026-10-29','2026-10-28').valid,false);
  assert.equal(trackingRange('custom','2026-10-28','2026-02-30','2026-10-28').valid,false);
  assert.equal(trackingRange('custom','2026-10-28','2026-10-28','2026-10-28').valid,true);
});
test('aging uses calendar days including daylight saving and excludes verified rides', () => {
  assert.equal(courseAge('2026-03-07','2026-03-09'),2);
  assert.equal(courseAge('2026-10-29','2026-10-28'),0);
  const course={id:'x',date:'2026-10-21',amount:40,tip:0};
  assert.equal(isLongUnverified(course,'2026-10-28',7),true);
  assert.equal(isLongUnverified({...course,verified:true},'2026-10-28',7),false);
  assert.equal(isLongUnverified(course,'2026-10-28',14),false);
});
test('PDF paid amount never confirms bank receipt; partial deposits stay partial', () => {
  const bill={id:'BILL1',total:100,paidAmount:40,paidDate:'2026-10-28'};
  assert.equal(bankReceiptStatus(bill),'unconfirmed');
  assert.equal(bankReceiptStatus({...bill,bankReceipt:{date:'2026-10-28',amount:40}}),'partial');
  assert.equal(bankReceiptStatus({...bill,bankReceipt:{date:'2026-10-28',amount:100}}),'received');
  assert.equal(bankReceiptStatus({...bill,bankReceipt:null}),'unconfirmed');
  assert.equal(validBankReceipt({date:'2026-10-29',amount:100},'2026-10-28'),false);
  assert.equal(validBankReceipt({date:'2026-10-28',amount:0},'2026-10-28'),false);
});
test('reimport preserves manual bank confirmation without changing imported amounts', () => {
  const receipt={date:'2026-10-28',amount:100};
  const next=retainBankReceipt({id:'BILL1',total:120,paidAmount:120},{id:'BILL1',total:100,paidAmount:100,bankReceipt:receipt});
  assert.deepEqual(next.bankReceipt,receipt);
  assert.equal(next.total,120);
  assert.equal(bankReceiptStatus(next),'partial');
});

test('net splits service fees, perceptions and airport levies by verified status', () => {
  const rides = [
    {id:'card',date:'2026-10-28',amount:90,tip:10,serviceFee:5.51,airportFee:6.44,verified:true},
    {id:'adapted',date:'2026-10-28',amount:118.92,tip:0,serviceFee:16.41,perception:3.5},
    {id:'same-day',date:'2026-10-28',amount:118.92,tip:0,serviceFee:16.41,perception:3.5},
  ];
  const result=summarizePayroll(rides);
  assert.equal(result.verifiedTotal,100);
  assert.equal(result.verifiedNet,88.05);
  assert.equal(result.unverifiedTotal,237.84);
  assert.equal(result.unverifiedNet,198.02);
  assert.equal(summarizePayroll(rides.filter(r=>r.verified)).unverifiedNet,0);
  const verifiedAll=summarizePayroll(rides.map(r=>({...r,verified:true})));
  assert.equal(verifiedAll.verifiedNet,286.07);
  assert.equal(verifiedAll.unverifiedNet,0);
  assert.equal(summarizePayroll([]).verifiedNet,0);
});
