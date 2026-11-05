import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
});
after(() => vite.close());
const { reconcileVerification } = await vite.ssrLoadModule("/lib/verification.ts");
const { isExactPayrollMatch } = await vite.ssrLoadModule("/lib/payroll-matching.ts");
const row = { key: "10001A", date: "2026-10-29", amount: 15.81, tip: 0 };
const course = { id: "course-a", date: "2026-10-29", amount: 15.80, tip: 0, verified: false };
const matches = (c,r)=>c.date===r.date;
const diff = (c,r)=>Math.abs(c.amount-r.amount);
const statements = [{id:"BILL1234",importedAt:"2026-11-01T12:00:00.000Z",rows:[row]}];

test("one-cent mismatch does not mark a course verified automatically",()=>{
 const actual=reconcileVerification([course], statements, matches, diff, ()=>({}));
 assert.equal(actual[0].verified,false);
 assert.equal(actual[0].verifiedBillId,undefined);
 assert.equal(isExactPayrollMatch(diff(course,row)),false);
});

test("matching amounts verify and preserve the correct BILL",()=>{
 const same={...course,amount:15.81};
 const actual=reconcileVerification([same], statements, matches, diff, ()=>({teoId:"10001A"}));
 assert.equal(actual[0].verified,true);
 assert.equal(actual[0].verifiedBillId,"BILL1234");
 assert.equal(actual[0].teoId,"10001A");
});
