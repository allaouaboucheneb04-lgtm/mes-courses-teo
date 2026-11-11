import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import ts from "typescript";

const helper=readFileSync(new URL("../lib/home-chart.ts",import.meta.url),"utf8");
const dashboard=readFileSync(new URL("../components/home-dashboard.tsx",import.meta.url),"utf8");

const javascript=ts.transpileModule(helper.replace("export function","function"),{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}
}).outputText;
const progress=new Function(javascript+"\nreturn cumulativeNetProgress;")();

test("with no rides and Tuesday company fees, chart starts at zero",()=>{
  assert.deepEqual(progress([{net:-226.18},{net:0},{net:0}]),[0,0,0]);
  assert.deepEqual(progress([{net:-226.18},{net:100},{net:200}]),[0,0,73.82]);
});

test("cumulative comparison uses past expense losses without resetting debt",()=>{
  const values=progress([{net:331.35},{net:100},{net:-700},{net:300},{net:150}]);
  assert.deepEqual(values,[331.35,431.35,0,31.35,181.35]);
});

test("cent precision, normal positive weeks, and no records",()=>{
  assert.deepEqual(progress([{net:0.1},{net:0.2},{net:-0.1}]),[0.1,0.3,0.2]);
  assert.deepEqual(progress([]),[]);
});

test("the weekly card retains the actual negative accounting net",()=>{
  assert.match(dashboard,/weekNet, onAdd/);
  assert.match(dashboard,/<strong>\{money\(weekNet\)\}<\/strong>/);
  assert.match(dashboard,/Progression cumulée/);
  assert.match(dashboard,/net réel, y compris les frais fixes/);
  assert.match(dashboard,/cumulativeNetProgress\(days\)/);
  assert.match(dashboard,/cumulativeNetProgress\(previousDays\)/);
  assert.match(dashboard,/money\(previousWeekNet\)/);
  assert.match(dashboard,/selected\.date <= currentDate \? money\(currentSelectedProgress\) : "À venir"/);
  const parsed=ts.createSourceFile("home-dashboard.tsx",dashboard,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
