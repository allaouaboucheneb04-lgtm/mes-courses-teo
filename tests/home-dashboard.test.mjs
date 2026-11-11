import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const page = readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const dashboard = readFileSync(new URL("../components/home-dashboard.tsx",import.meta.url),"utf8");
const css = readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
const compile = text => ts.transpileModule(text,{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
}).outputText;

test("new home screen is the default and preserves the other five destinations",()=>{
  assert.match(page,/\"home\" \| \"more\" \| \"add\" \| \"history\"/);
  assert.match(page,/>\\(\"home\"\\)/);
  assert.match(page,/mobilePage === "home" && \\(/);
  assert.match(page,/<HomeDashboard/);
  assert.match(page,/aria-label="Navigation principale"/);
  assert.match(page,/<House size=\\{23\\}/);
  assert.match(page,/<ListOrdered size=\\{23\\}/);
  assert.match(page,/<BadgeCheck size=\\{23\\}/);
  assert.match(page,/<LayoutGrid size=\\{23\\}/);
  assert.match(page,/setMobilePage\\("more"\\)/);
  assert.match(page,/setMobilePage\\("statistics"\\)/);
  assert.match(page,/setMobilePage\\("sev"\\)/);
  assert.match(page,/setMobilePage\\("expenses"\\)/);
  assert.match(css,/\\.page-home > \\.summary/);
  assert.match(css,/\\.home-dashboard/);
});

test("dashboard is rendered using live course totals and not screenshot demo values",()=>{
  assert.match(dashboard,/NET AUJOURD’HUI/);
  assert.match(dashboard,/home-progress-ring/);
  assert.match(dashboard,/Objectif \\{money\\(todayGoal\\)\\}/);
  assert.match(dashboard,/onClick=\\{onAdd\\}/);
  assert.match(dashboard,/onClick=\\{onExpenses\\}/);
  assert.match(dashboard,/onClick=\\{onHistory\\}/);
  assert.match(dashboard,/onClick=\\{onStatistics\\}/);
  assert.match(dashboard,/aria-pressed=\\{day\\.date === selected\\.date\\}/);
  assert.doesNotMatch(dashboard,/1 184,35|220,60|251,20/);
  for(const [file,source] of [["page.tsx",page],["home-dashboard.tsx",dashboard]]){
    const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    assert.deepEqual(parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[],file);
  }
});

test("daily and weekly home calculations preserve Monday airport carry and company overhead without rides",()=>{
  const start=page.indexOf("  // The homepage is driven by the same Tuesday");
  const end=page.indexOf("  const filteredExpenses = useMemo",start);
  assert.ok(start>0 && end>start,"homepage calculation block exists");
  const code=compile(page.slice(start,end)+"\nreturn {homeWeekDays,homeWeekFees,homeWeekNet};");
  const dayRide=(date,amount,type="aeroport")=>({type:"taxi",date,amount,tip:0,taxiCategory:type,perception:0});
  const courses=[
    dayRide("2026-11-09",100),
    dayRide("2026-11-10",70),
    dayRide("2026-11-11",251.20,"centre-ville"),
    dayRide("2026-11-16",40)
  ];
  const expenses=[{date:"2026-11-11",amount:30.60}];
  const fee=(rides,include,amount)=>rides
    .filter(r=>r.taxiCategory==="aeroport")
    .filter(r=>include(r.date==="2026-11-09" || r.date==="2026-11-16" ? (()=>{const d=new Date(r.date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);})():r.date))
    .length*amount;
  const totals={gross:361.20,deductions:0};
  const result=new Function("week","courses","expenses","settings","totals",
    "airportFeeTotal","weeklyCompanyFee","weeklyExpenseTotal","round2",
    "serviceFee","airportLevyTotal","expenseTotal","useMemo",code)(
    {start:"2026-11-10",end:"2026-11-16"},courses,expenses,
    {companyFee:200.42,airportFee:6.44},totals,12.88,200.42,30.60,
    x=>Math.round(x*100)/100,()=>0,fee,
    (all,bounds)=>all.filter(e=>e.date>=bounds[0]&&e.date<=bounds[1]).reduce((s,e)=>s+e.amount,0),
    fn=>fn()
  );
  assert.equal(result.homeWeekDays.length,7);
  assert.equal(result.homeWeekDays[0].date,"2026-11-10");
  assert.equal(result.homeWeekDays[0].fees,213.30);
  assert.equal(result.homeWeekDays[0].net,-143.30);
  assert.equal(result.homeWeekDays[1].net,220.60);
  assert.equal(result.homeWeekDays[6].fees,0); // Next Monday airport levy is next Tuesday.
  assert.equal(result.homeWeekFees,243.90);
  assert.equal(result.homeWeekNet,117.30);
  assert.equal(result.homeWeekDays.reduce((n,day)=>Math.round((n+day.net)*100)/100,0),117.30);
});
