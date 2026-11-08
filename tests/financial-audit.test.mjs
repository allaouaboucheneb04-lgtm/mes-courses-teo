import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createServer } from "vite";

const code = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const extract = (start, end) => {
  const from = code.indexOf(start);
  const to = code.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, "Source range " + start + " / " + end + " exists");
  return code.slice(from, to);
};
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

test("weekly airport levies use exactly Tuesday–Monday income rides, never the Monday–Sunday invoice list", () => {
  const expression = extract("  const airportFeeTotal = round2(", "  const weeklyCompanyFee");
  const fee = new Function("weeklyCourses", "settings", "round2", compile(expression + "\nreturn airportFeeTotal;"));
  const currentWeek = [
    {date:"2026-11-03", type:"taxi", taxiCategory:"aeroport"},
    {date:"2026-11-09", type:"taxi", taxiCategory:"aeroport"},
    {date:"2026-11-05", type:"taxi", taxiCategory:"centre-ville"},
    {date:"2026-11-04", type:"adapte"},
  ];
  assert.equal(fee(currentWeek,{airportFee:6.44},round2),12.88);
  assert.equal(fee(currentWeek.slice(2),{airportFee:6.44},round2),0);
  assert.match(code,/const airportWeek = mondayWeekForDate\(selectedDate\)/);
  assert.match(code,/const weeklyAirportCourses = useMemo/);
  assert.match(code,/airport-week-card/);
});

test("saved transport adapté fare uses exact minutes before rounding and respects two-hour minimum", () => {
  const source = extract("  function addAdapted(", "  const firebaseErrorMessage");
  const fn = new Function(
    "adapted","settings","courses","editingId","adaptedSev","flash",
    "setCourses","setEditingId","setAdapted","setAdaptedSev","defaultAdaptedTimes",
    "parseMoneyInput","round2",compile(source + "\nreturn addAdapted;")
  );
  const run = ({start,end,minimum=2,rate=59.46}) => {
    let result, message="";
    const existing={id:"record-1", type:"adapte",amount:0,tip:0};
    const handler = fn(
      {date:"2026-11-05",hob:"HOB0397",start,end,perception:""},
      {adaptedMinimum:minimum,adaptedRate:rate},
      [existing],"record-1",false,m=>message=m,
      value=>result=value,()=>{},()=>{},()=>{},()=>({}),()=>0,round2,
    );
    handler({preventDefault(){}});
    return {item:result?.[0],message};
  };
  const twoHours = run({start:"09:00",end:"11:00"});
  assert.equal(twoHours.item.amount,118.92);
  assert.equal(twoHours.item.billedDuration,2);
  const oneMinute = run({start:"09:00",end:"11:01"});
  assert.equal(oneMinute.item.amount,119.91);
  assert.equal(oneMinute.item.duration,2.02);
  assert.ok(oneMinute.item.billedDuration > 2 && oneMinute.item.billedDuration < 2.02);
  const underMinimum=run({start:"09:00",end:"10:15"});
  assert.equal(underMinimum.item.amount,118.92);
  const overnight=run({start:"23:00",end:"01:10"});
  assert.equal(overnight.item.amount,128.83);
  assert.equal(overnight.item.billedDuration,2+10/60);
});

test("daily goal progress and remaining amount use the net after company fee and taxi expenses", () => {
  const expression = extract("  const dailyGoalProgress = dailyGoal", "  const filteredExpenses");
  const progress = new Function("dailyGoal","dailyNet",compile(expression + "\nreturn dailyGoalProgress;"));
  assert.equal(progress(100,70),70);
  assert.equal(progress(100,120),100);
  assert.equal(progress(100,-20),0);
  assert.equal(progress(0,70),0);
  const goal = extract('<div className="daily-goal">','<div className="mini">');
  assert.match(goal,/money\(dailyNet\)/);
  assert.match(goal,/dailyNet >= dailyGoal/);
  assert.match(goal,/dailyGoal - dailyNet/);
});

test("expense totals, airport levies and service deductions reconcile at cent precision", async () => {
  const vite = await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
  try {
    const {expenseTotal} = await vite.ssrLoadModule("/lib/expenses.ts");
    const {comparisonTotals} = await vite.ssrLoadModule("/lib/comparison.ts");
    const fixtures=[
      {id:"airport",date:"2026-11-03",type:"taxi",taxiCategory:"aeroport",amount:80,tip:5,payment:"Téo / carte",serviceFee:4.68,perception:0,airportFee:6.44},
      {id:"adapted",date:"2026-11-04",type:"adapte",amount:119.91,tip:0,payment:"Transport adapté",serviceFee:16.55,perception:3},
    ];
    const gross=204.91;
    const net=round2(gross-4.68-6.44-16.55-3);
    assert.equal(comparisonTotals(fixtures,["2026-11-03","2026-11-04"]).gross,gross);
    assert.equal(comparisonTotals(fixtures,["2026-11-03","2026-11-04"]).net,net);
    assert.equal(expenseTotal([{date:"2026-11-03",amount:5},{date:"2026-11-04",amount:7.35}],["2026-11-03","2026-11-09"]),12.35);
    assert.equal(round2(net-12.35-120),41.89);
  } finally {await vite.close();}
});
