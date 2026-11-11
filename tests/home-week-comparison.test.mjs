import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../components/home-dashboard.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

const from = page.indexOf("  // The homepage is driven by the same Tuesday");
const until = page.indexOf("  const filteredExpenses = useMemo", from);
assert.ok(from >= 0 && until > from, "home calculation block exists");

const calcs = compile(page.slice(from, until)
  + "\nreturn {homeWeekDays, previousHomeWeekDays, homeWeekFees, homeWeekNet};");

function summarize() {
  const rides = [
    {date:"2026-11-02",type:"taxi",taxiCategory:"aeroport",amount:100,tip:0},
    {date:"2026-11-03",type:"taxi",taxiCategory:"aeroport",amount:50,tip:0},
    {date:"2026-11-04",type:"taxi",taxiCategory:"centre-ville",amount:100,tip:0},
    {date:"2026-11-09",type:"taxi",taxiCategory:"aeroport",amount:10,tip:0},
    {date:"2026-11-11",type:"taxi",taxiCategory:"centre-ville",amount:150,tip:0}
  ];
  const expenses = [
    { date:"2026-11-04", amount:12.5 }, { date:"2026-11-11", amount:5 }
  ];
  const levy = (entries, inPeriod, rate) => entries.filter(ride=>{
    if(ride.type!=="taxi" || ride.taxiCategory!=="aeroport") return false;
    const date = new Date(ride.date+"T12:00:00Z");
    if(date.getUTCDay()===1)date.setUTCDate(date.getUTCDate()+1);
    return inPeriod(date.toISOString().slice(0,10));
  }).length*rate;
  const fn = new Function(
    "week", "courses", "expenses", "settings", "totals",
    "airportFeeTotal", "weeklyCompanyFee", "weeklyExpenseTotal", "round2",
    "serviceFee", "airportLevyTotal", "expenseTotal", "useMemo", calcs
  );
  return fn(
    {start:"2026-11-10",end:"2026-11-16"}, rides, expenses,
    {companyFee:200.42,airportFee:6.44}, {gross:150,deductions:0}, 6.44,200.42,5,
    value=>Math.round(value*100)/100,()=>0,levy,
    (list,bounds)=>list.filter(x=>x.date>=bounds[0] && x.date<=bounds[1])
      .reduce((sum,x)=>sum+x.amount,0),
    fn=>fn()
  );
}

test("week comparison uses the same weekday positions: previous Tuesday to Monday",()=>{
  const r = summarize();
  assert.equal(r.homeWeekDays.length,7);
  assert.equal(r.previousHomeWeekDays.length,7);
  assert.deepEqual(r.homeWeekDays.map(x=>x.date),
    ["2026-11-10","2026-11-11","2026-11-12","2026-11-13","2026-11-14","2026-11-15","2026-11-16"]);
  assert.deepEqual(r.previousHomeWeekDays.map(x=>x.date),
    ["2026-11-03","2026-11-04","2026-11-05","2026-11-06","2026-11-07","2026-11-08","2026-11-09"]);
});

test("prior week line includes company fee without rides and Monday airport carry",()=>{
  const {previousHomeWeekDays:days} = summarize();
  assert.equal(days[0].fees,213.30); // Tuesday: 200.42 company + two airport levies.
  assert.equal(days[0].net,-163.30);
  assert.equal(days[1].net,87.50);  // Wednesday: $100 - $12.50 expense.
  assert.equal(days[6].net,10);     // Monday airport levy is due NEXT Tuesday.
  assert.equal(Math.round(days.reduce((s,d)=>s+d.net,0)*100)/100,-65.80);
});

test("current week remains unchanged by adding previous week comparison",()=>{
  const {homeWeekDays:days,homeWeekNet,homeWeekFees} = summarize();
  assert.equal(days[0].fees,206.86);
  assert.equal(days[0].net,-206.86);
  assert.equal(days[1].net,145);
  assert.equal(homeWeekNet,-61.86);
  assert.equal(homeWeekFees,211.86);
});

test("dashboard renders two differentiated lines and never plots future days as zero",()=>{
  assert.match(page,/previousDays=\{previousHomeWeekDays\}/);
  assert.match(dashboard,/previousDays: HomeDay\[\]/);
  assert.match(dashboard,/home-line-current/);
  assert.match(dashboard,/home-line-previous/);
  assert.match(dashboard,/Revenu net par jour/);
  assert.match(dashboard,/Évolution quotidienne/);
  assert.match(dashboard,/Choisir une journée à comparer/);
  assert.match(dashboard,/const ticks = Array.from/);
  assert.match(dashboard,/const selectedDelta = previousSelected && hasCurrentSelected/);
  assert.match(dashboard,/selectedDelta > 0 \? "\+" : ""/);
  assert.match(dashboard,/home-chart-result-grid/);
  assert.match(dashboard,/money\(selected\.net\)/);
  assert.match(dashboard,/money\(previousSelected\.net\)/);
  assert.match(dashboard,/tick === 0 \? "#a2b8bb"/);
  assert.doesNotMatch(dashboard,/cumulativeNetProgress/);

  assert.match(dashboard,/strokeDasharray="7 5"/);
  assert.match(dashboard,/const elapsedDays = days\.filter\(day => day\.date <= currentDate\)/);
  assert.match(dashboard,/day\.date <= currentDate \? \[chartPoint\(day, index\)\] : \[\]/);
  assert.match(dashboard,/const previousPoints = previousDays\.map\(chartPoint\)/);
  assert.match(dashboard,/money\(previousSelected\.net\)/);
  assert.match(dashboard,/money\(previousWeekNet\)/);
  assert.match(css,/\.home-compare-legend \{/);
  for(const [name,code] of [["page.tsx",page],["home-dashboard.tsx",dashboard]]){
    const parsed=ts.createSourceFile(name,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    assert.deepEqual(parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[],name);
  }
});
