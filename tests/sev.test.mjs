import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
const vite = await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const {sevBreakdown,sevTotals,feePeriods,roundMoney} = await vite.ssrLoadModule("/lib/sev.ts");
const ride = {type:"taxi",date:"2026-09-22",amount:114.98,tip:20,serviceFee:7.44};
test("taxes exclude tips and fees; displayed amounts reconcile to entered total",()=>{
  const result=sevBreakdown(ride);
  assert.equal(result.gst,5);
  assert.equal(result.qst,9.98);
  assert.equal(result.subtotal,100);
  assert.equal(result.fareSubtotal,99.1);
  assert.equal(result.levy,.9);
  assert.equal(roundMoney(result.fareSubtotal+result.levy+result.gst+result.qst+ride.tip),134.98);
  assert.equal(sevBreakdown({...ride,tip:0,serviceFee:0}).taxes,result.taxes);
});
test("unknown screenshot tips do not create invented tax totals",()=>{
  const result=sevTotals([ride,{...ride,tipPending:true}]);
  assert.equal(result.count,2);
  assert.equal(result.unknown,1);
  assert.equal(result.taxes,14.98);
  assert.equal(result.levy,1.8);
});
test("adapted gross and after-fee subtotals are separate; exemptions and actual levy count work",()=>{
  const adapted={...ride,type:"adapte",tip:0,serviceFee:11.5};
  const result=sevBreakdown(adapted);
  assert.equal(result.levy,0);
  assert.equal(result.subtotal,100);
  assert.equal(result.afterFees,103.48);
  assert.equal(result.afterFeesSubtotal,90);
  assert.equal(sevBreakdown({...adapted,sevLevyCount:3}).levy,2.7);
  const exempt=sevBreakdown({...adapted,sevTaxExempt:true});
  assert.equal(exempt.taxes,0);
  assert.equal(exempt.subtotal,114.98);
});
test("checking SEV moves the same amounts between groups",()=>{
  let rides=[{...ride,sevAdded:false},{...ride,sevAdded:true}];
  assert.equal(sevTotals(rides.filter(r=>r.sevAdded)).taxes,14.98);
  rides=rides.map(r=>({...r,sevAdded:true}));
  assert.equal(sevTotals(rides.filter(r=>r.sevAdded)).taxes,29.96);
  assert.equal(sevTotals(rides.filter(r=>!r.sevAdded)).count,0);
});
test("monthly and annual fees include expense-only months, never double count company weeks",()=>{
  const rides=[{...ride,date:"2026-09-30",serviceFee:2,airportFee:6.44},{...ride,date:"2026-10-01",serviceFee:3}];
  const expenses=[{date:"2026-11-01",amount:10}];
  const monthly=feePeriods(rides,expenses,false,100);
  assert.equal(monthly.find(r=>r.period==="2026-09").total,108.44);
  assert.equal(monthly.find(r=>r.period==="2026-10").total,3);
  assert.equal(monthly.find(r=>r.period==="2026-11").total,10);
  assert.equal(feePeriods(rides,expenses,true,100)[0].total,121.44);
});
test("company week crossing January is attributed once to its Tuesday year",()=>{
  const result=feePeriods([{...ride,date:"2026-01-01",serviceFee:2}],[],true,100);
  assert.equal(result.find(r=>r.period==="2025").company,100);
  assert.equal(result.find(r=>r.period==="2026").company,0);
});
