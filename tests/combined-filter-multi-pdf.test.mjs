import assert from "node:assert/strict";
import test, {after} from "node:test";
import {readFileSync} from "node:fs";
import {createServer} from "vite";
import ts from "typescript";

const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const {matchesCourseActivity}=await vite.ssrLoadModule("/lib/course-activity.ts");
const {matchesHistoryType}=await vite.ssrLoadModule("/lib/history-search.ts");
const {matchesHistoryPayment}=await vite.ssrLoadModule("/lib/history-payment.ts");
const {matchesSevCategory,filterSevRides}=await vite.ssrLoadModule("/lib/sev-filtering.ts");
const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const stats=readFileSync(new URL("../components/statistics-page.tsx",import.meta.url),"utf8");
const payroll=readFileSync(new URL("../components/payroll-overview.tsx",import.meta.url),"utf8");
const sev=readFileSync(new URL("../components/sev-page.tsx",import.meta.url),"utf8");
const shared=readFileSync(new URL("../components/shared-payroll.tsx",import.meta.url),"utf8");
const rides=[
 {id:"teo-airport",type:"taxi",date:"2026-11-11",amount:40,tip:0,taxiCategory:"aeroport",payment:"Téo / carte"},
 {id:"teo-city",type:"taxi",date:"2026-11-11",amount:50,tip:0,taxiCategory:"centre-ville",payment:"Téo / carte"},
 {id:"adapted",type:"adapte",date:"2026-11-11",amount:59.46,tip:0,hob:"HOB001",payment:"Transport adapté"},
 {id:"other",type:"other",date:"2026-11-11",amount:10,tip:0},
];

test("combined filter shows Téo and adapted at the same time, not unknown types",()=>{
 assert.deepEqual(rides.filter(r=>matchesCourseActivity(r,"both")).map(r=>r.id),["teo-airport","teo-city","adapted"]);
 assert.deepEqual(rides.filter(r=>matchesCourseActivity(r,"taxi")).map(r=>r.id),["teo-airport","teo-city"]);
 assert.deepEqual(rides.filter(r=>matchesCourseActivity(r,"adapte")).map(r=>r.id),["adapted"]);
 assert.deepEqual(rides.filter(r=>matchesCourseActivity(r,"all")).map(r=>r.id),rides.map(r=>r.id));
 assert.deepEqual(rides.filter(r=>matchesHistoryType(r,"both")).map(r=>r.id),["teo-airport","teo-city","adapted"]);
 assert.deepEqual(rides.filter(r=>matchesSevCategory(r,"both")).map(r=>r.id),["teo-airport","teo-city","adapted"]);
});
test("SEV combined filter obeys period restrictions and preserves totals",()=>{
 const filtered=filterSevRides(rides,{
  category:"both",period:"week",week:{start:"2026-11-10",end:"2026-11-16"},
  today:"2026-11-11",start:"",end:"",search:"",
 });
 assert.equal(filtered.length,3);
 assert.equal(filtered.reduce((sum,item)=>sum+item.amount+item.tip,0),149.46);
});
test("all course category filter UIs include Téo + adapté",()=>{
 for(const [name,source] of [["Historique",page.slice(page.indexOf('aria-label="Catégorie de course"'))],
  ["Statistiques",stats],["SEV",sev],["Suivi de paie",payroll]]){
   assert.match(source,/<option value="both">Téo \+ adapté<\/option>/,name);
 }
 assert.match(page,/aria-label="Filtrer les fiches par activité"/);
 assert.match(page,/statement\.rows\.some\(row => matchesCourseActivity\(row, billActivity\)\)/);
 assert.match(stats,/matchesCourseActivity\(ride, type\)/);
 assert.match(payroll,/matchesCourseActivity\(course, activity\)/);
 assert.match(sev,/matchesSevCategory\(ride, type\)/);
});

test("History payment selector combines only Téo/card and adapted, excluding cash, machine and coupons",()=>{
 const payments=[
  {type:"taxi",payment:"Téo / carte",id:"teo"},
  {type:"taxi",payment:"Compte",id:"compte"},
  {type:"taxi",payment:"Carte",id:"carte"},
  {type:"adapte",payment:"Transport adapté",id:"adapte"},
  {type:"taxi",payment:"Espèces",id:"cash"},
  {type:"taxi",payment:"Comptant",id:"comptant"},
  {type:"taxi",payment:"Coupon",id:"coupon"},
  {type:"taxi",payment:"Machine crédit",id:"machine"},
 ];
 const ids=filter=>payments.filter(course=>matchesHistoryPayment(course,filter)).map(course=>course.id);
 assert.deepEqual(ids("teo-adapte"),["teo","compte","carte","adapte"]);
 assert.deepEqual(ids("teo-card"),["teo","compte","carte"]);
 assert.deepEqual(ids("adapted"),["adapte"]);
 assert.equal(ids("all").length,8);
 const history=page.slice(page.indexOf('<section className="history" id="history">'));
 const paymentField=history.slice(history.indexOf('aria-label="Mode de paiement"'),history.indexOf('</select>',history.indexOf('aria-label="Mode de paiement"')));
 assert.match(paymentField,/<option value="teo-adapte">Téo \+ adapté<\/option>/);
 assert.match(page,/matchesHistoryPayment\(c, historyPayment\)/);
 assert.match(page,/matchesHistoryPayment\(course, historyPayment\)/);
 assert.match(page,/setHistoryPayment\("all"\)/);
 assert.equal(payments.filter(c=>matchesHistoryPayment(c,"teo-adapte") && matchesHistoryType(c,"all")).length,4);
});

test("PDF chooser accepts multiple and captures FileList before resetting input",()=>{
 const chooser=page.slice(page.indexOf('id="pay-pdf-input"')-110,page.indexOf('id="pay-pdf-input"')+380);
 assert.match(chooser,/multiple/);
 assert.match(chooser,/const files = Array\.from\(e\.target\.files \|\| \[\]\)/);
 assert.match(chooser,/e\.target\.value = "";/);
 assert.match(chooser,/importPayPdfFiles\(files\)/);
 assert.match(page,/async function parsePayStatement\(file: File\): Promise<PayStatement>/);
 assert.match(page,/async function importPayPdfFiles\(files: File\[\]\): Promise<boolean\[\]>/);
 assert.match(page,/for \(const \[index, file\] of files\.entries\(\)\)/);
 assert.match(page,/successful\.push\(statement\)/);
 assert.match(page,/imported\[index\] = true/);
 assert.match(page,/failures\.push/);
 assert.match(page,/setPayStatements\(current =>/);
 assert.match(page,/retainBankReceipt\(statement, byId\.get\(statement\.id\)\)/);
 assert.match(page,/billIds\.has\(statement\.id\)/);
 assert.match(page,/setSelectedStatementId\(last\.id\)/);
 assert.match(page,/setPayError\(/);
});
test("Android shared queue can import all PDF files and only remove successful ones",()=>{
 assert.match(shared,/onImportBatch:\(files:File\[\]\)=>Promise<boolean\[\]>/);
 assert.match(shared,/onImportBatch\(snapshot\.map\(item=>item\.file\)\)/);
 assert.match(shared,/if \(results\[index\]\) await remove\(item\)/);
 assert.match(page,/onImportBatch=\{importPayPdfFiles\}/);
});
test("edited TSX files remain syntax valid",()=>{
 for(const [name,code] of [["page.tsx",page],["statistics.tsx",stats],
  ["payroll.tsx",payroll],["sev.tsx",sev],["shared.tsx",shared]]){
  const parsed=ts.createSourceFile(name,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[],name);
 }
});
