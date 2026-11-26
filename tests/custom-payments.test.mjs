import assert from "node:assert/strict";
import test, {after} from "node:test";
import {readFileSync} from "node:fs";
import {createServer} from "vite";
import ts from "typescript";

const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());

const {
  customPaymentNameError,customPaymentRateError,customPaymentFeeAmount,getCustomPaymentRate,setCustomPaymentRate,normalizeCustomPaymentFees,normalizeCustomPaymentMethods,availableCustomPaymentMethods,
  formatPaymentMethodName,isStandardPaymentMethod,samePaymentMethod,
}=await vite.ssrLoadModule("/lib/custom-payments.ts");
const {matchesHistoryPayment}=await vite.ssrLoadModule("/lib/history-payment.ts");
const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");

test("custom names can be added while builtin labels and accent/case duplicates are rejected",()=>{
  assert.equal(formatPaymentMethodName("  Virement    Interac "), "Virement Interac");
  assert.equal(customPaymentNameError("Virement Interac"), null);
  for(const name of ["Téo / carte","Carte","Compte","Espèces","Comptant","Coupon","Machine crédit","Transport adapté","Téo + adapté","Autre"])
    assert.match(customPaymentNameError(name),/existe déjà/,name);
  assert.match(customPaymentNameError("  "),/Entrez le nom/);
  assert.match(customPaymentNameError("a".repeat(41)),/40 caractères/);
  assert.match(customPaymentNameError("VIREMENT interac",["Virement Interac"]),/déjà enregistré/);
  assert.match(customPaymentNameError("Réservé",["Reserve"]),/déjà enregistré/);
  assert.equal(samePaymentMethod("  Électronique ", "electronique"),true);
  assert.equal(isStandardPaymentMethod("Téo / carte"),true);
});
test("custom names are normalized from saved settings, with safe fallback for old accounts",()=>{
  assert.deepEqual(normalizeCustomPaymentMethods(undefined),[]);
  assert.deepEqual(normalizeCustomPaymentMethods("not an array"),[]);
  assert.deepEqual(normalizeCustomPaymentMethods(["Virement", "virement ", "Coupon", " Carte ", "  Interac  ",null]),["Virement","Interac"]);
});
test("after removing a method, historical payments remain searchable and can still be filtered",()=>{
  const rides=[
    {type:"taxi",payment:"Virement Interac"},
    {type:"taxi",payment:"Virement Interac"},
    {type:"taxi",payment:"Téo / carte"},
    {type:"taxi",payment:"Machine crédit"},
    {type:"taxi",payment:"Espèces"},
    {type:"adapte",payment:"Transport adapté"},
  ];
  assert.deepEqual(availableCustomPaymentMethods(["PayPal"],rides),["PayPal","Virement Interac"]);
  assert.equal(rides.filter(ride=>matchesHistoryPayment(ride,"custom:Virement Interac")).length,2);
  assert.equal(rides.filter(ride=>matchesHistoryPayment(ride,"teo-adapte")).length,2);
  assert.equal(rides.filter(ride=>matchesHistoryPayment(ride,"machine")).length,1);
  assert.equal(rides.filter(ride=>matchesHistoryPayment(ride,"custom:PayPal")).length,0);
  assert.equal(matchesHistoryPayment({type:"taxi",payment:"Virement Interac"},"cash"),false);
});
test("settings UI adds/removes custom methods and course form & history use the same list",()=>{
  assert.match(page,/customPaymentMethods: string\[\]/);
  assert.match(page,/customPaymentFees: Record<string, number>/);
  assert.match(page,/customPaymentMethods: \[\]/);
  assert.match(page,/customPaymentMethods: normalizeCustomPaymentMethods\(remote\.settings\?\.customPaymentMethods\)/);
  assert.match(page,/customPaymentFees: normalizeCustomPaymentFees\(remote\.settings\?\.customPaymentFees\)/);
  assert.match(page,/function addCustomPaymentMethod\(event: React\.FormEvent<HTMLFormElement>\)/);
  assert.match(page,/function removeCustomPaymentMethod\(name: string\)/);
  assert.match(page,/customPaymentRateError\(newPaymentRate\)/);
  assert.match(page,/customPaymentFees: setCustomPaymentRate\(current\.customPaymentFees, name, rate\)/);
  assert.match(page,/customPaymentFeeAmount\(gross, course\.payment, settings\.customPaymentFees\)/);
  assert.match(page,/setSettings\(current => \(\{/);
  assert.match(page,/customPaymentNameError\(name, customPaymentMethods\)/);
  assert.match(page,/Mode de paiement «/);
  assert.match(page,/Les courses existantes sont conservées/);
  assert.match(page,/setTaxi\(current =>/);
  assert.match(page,/settings-payment-section/);
  assert.match(page,/onSubmit=\{addCustomPaymentMethod\}/);
  assert.match(page,/onClick=\{\(\) => removeCustomPaymentMethod\(name\)\}/);
  assert.match(page,/value=\{getCustomPaymentRate\(name, settings\.customPaymentFees\)\}/);
  assert.match(page,/onValue=\{rate =>/);
  assert.match(page,/Pourcentage de frais de la nouvelle méthode/);
  assert.match(page,/taxiCustomPaymentMethods\.map\(name =>/);
  assert.match(page,/historyCustomPaymentMethods\.map\(name =>/);
  assert.match(page,/value=\{\x60custom:\$\{name\}\x60\}/);
  assert.match(page,/Le pourcentage de chaque mode est déduit automatiquement/);
  assert.match(css,/\.settings-payment-entry \{/);
  assert.match(css,/\.settings-payment-item \{/);
  const parsed=ts.createSourceFile("page.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});

test("percentage validation accepts Québec decimals and blocks invalid fee rates",()=>{
  for(const valid of ["0","2,50","5.29","13,797","100"]) assert.equal(customPaymentRateError(valid),null,valid);
  for(const invalid of ["","abc","5,1234","-1","100,001","200"])
    assert.ok(customPaymentRateError(invalid),invalid);
});
test("different custom payment rates calculate one rounded service deduction per ride",()=>{
  const rates=normalizeCustomPaymentFees({
    "Virement Interac":2.5,
    "PayPal":5.29,
    "Réservé":13.797,
    "Espèces":99,
    "invalid":Infinity,
    "negative":-1,
    "tooHigh":101,
  });
  assert.deepEqual(rates,{"Virement Interac":2.5,"PayPal":5.29,"Réservé":13.797});
  assert.equal(getCustomPaymentRate("virement interac",rates),2.5);
  assert.equal(customPaymentFeeAmount(100,"Virement Interac",rates),2.5);
  assert.equal(customPaymentFeeAmount(100,"PayPal",rates),5.29);
  assert.equal(customPaymentFeeAmount(119.92,"PayPal",rates),6.34);
  assert.equal(customPaymentFeeAmount(100,"Réservé",rates),13.8);
  assert.equal(customPaymentFeeAmount(100,"Unknown",rates),0);
  assert.equal(customPaymentFeeAmount(100,"Espèces",rates),0);
  assert.equal(customPaymentFeeAmount(100,"Téo / carte",rates),0);
  assert.equal(customPaymentFeeAmount(100,"PayPal",undefined),0);
  assert.equal(customPaymentFeeAmount(0,"PayPal",rates),0);
  assert.equal(customPaymentFeeAmount(100,"PayPal",{PayPal:250}),0);
});
test("editing or deleting a method preserves historical fee settings without affecting card fees",()=>{
  const fees=setCustomPaymentRate({}, "Virement", 2.50);
  assert.equal(getCustomPaymentRate("Virement",fees),2.50);
  const changed=setCustomPaymentRate(fees," virement ",4.99);
  assert.deepEqual(changed,{Virement:4.99});
  assert.equal(customPaymentFeeAmount(200,"Virement",changed),9.98);
  assert.deepEqual(setCustomPaymentRate(changed,"Virement",150),changed);
  assert.deepEqual(normalizeCustomPaymentFees(null),{});
});
