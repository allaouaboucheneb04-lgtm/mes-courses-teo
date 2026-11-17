import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const css = readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");

const sectionStart = page.indexOf('        <section className="summary">');
const workspaceStart = page.indexOf('        <section className="workspace" id="workspace">',sectionStart);
const formStart = page.indexOf("<form onSubmit={addTaxi}",workspaceStart);
const formEnd = page.indexOf("</form>",formStart);
assert.ok(sectionStart >= 0 && workspaceStart > sectionStart, "Weekly income summary and workspace are present");
assert.ok(formStart > workspaceStart && formEnd > formStart, "Taxi add form is present");

const weeklySummary = page.slice(sectionStart,workspaceStart);
const taxiForm = page.slice(formStart,formEnd);

test("airport invoice panel belongs with the weekly income summary, not the taxi add form",()=>{
  assert.match(weeklySummary,/className="airport-invoice-summary"/);
  assert.match(weeklySummary,/mobilePage === "add" && settings\.airportEnabled/);
  assert.match(weeklySummary,/<details className="airport-invoice-summary">/);
  assert.match(weeklySummary,/Facture aéroport/);
  assert.match(weeklySummary,/Lundi–dimanche/);
  assert.match(weeklySummary,/airportWeek\.start/);
  assert.match(weeklySummary,/airportWeek\.end/);
  assert.match(weeklySummary,/airportWeek\.invoice/);
  assert.match(weeklySummary,/weeklyAirportCourses\.length \* settings\.airportFee/);
  assert.doesNotMatch(taxiForm,/airport-invoice-summary|airport-week-card|Facture aéroport/);
  assert.equal(page.split('className="airport-invoice-summary"').length - 1,1);
});

test("the invoice stays on the same period when the course date changes from Sunday to Monday",()=>{
  assert.match(page,/const week = tuesdayWeekForDate\(selectedDate\)/);
  assert.match(page,/const airportWeek = mondayWeekForDate\(week\.start\)/);
  assert.doesNotMatch(page,/const airportWeek = mondayWeekForDate\(selectedDate\)/);
});

test("invoice displays Monday carry and Tuesday rides as separate amounts",()=>{
  assert.match(page,/const selectedDayCourses = useMemo/);
  assert.match(page,/const selectedDayAirportRideTotal = round2\(selectedDayAirportCourses\.length \* settings\.airportFee\)/);
  assert.match(page,/const selectedDayAirportBreakdown = airportLevyDayBreakdown\(/);
  const summary = weeklySummary.slice(weeklySummary.indexOf('<details className="airport-invoice-summary">'), weeklySummary.indexOf("</summary>"));
  assert.match(summary,/className="airport-invoice-split"/);
  assert.match(summary,/Report du lundi/);
  assert.match(summary,/selectedDayAirportBreakdown\.carriedCount/);
  assert.match(summary,/selectedDayAirportBreakdown\.carriedTotal/);
  assert.match(summary,/Courses du mardi/);
  assert.match(summary,/selectedDayAirportBreakdown\.sameDayCount/);
  assert.match(summary,/selectedDayAirportBreakdown\.sameDayTotal/);
  assert.match(summary,/selectedDayAirportBreakdown\.totalCount/);
  assert.match(summary,/money\(selectedDayAirportFeeTotal\)/);
  assert.match(summary,/selectedDayIsMonday && selectedDayAirportCourses\.length > 0/);
  assert.match(summary,/money\(selectedDayAirportRideTotal\).*reportés au mardi/s);
  assert.match(summary,/airport-invoice-deferred/);
  assert.match(css,/\.airport-invoice-daily\s*\{/);
  assert.match(css,/\.airport-invoice-split\s*\{/);
  assert.match(weeklySummary,/Les courses aéroport du lundi sont reportées au mardi suivant/);
});

test("the taxi form keeps a short contextual note, immediately followed by the save action",()=>{
  assert.match(taxiForm,/taxi\.category === "aeroport" && \(/);
  assert.match(taxiForm,/Redevance aéroport/);
  assert.match(taxiForm,/money\(settings\.airportFee\)/);
  assert.match(taxiForm,/airportLevyAccountingDate\(taxi\.date\) !== taxi\.date/);
  assert.match(taxiForm,/reportée au mardi suivant/);
  assert.match(taxiForm,/<\/p>[\s\S]*?<button className="primary taxi-submit">/);
  assert.match(taxiForm,/Enregistrer la course/);
});

test("expanded invoice distinguishes Monday–Sunday billing from Tuesday–Monday accounting",()=>{
  assert.match(weeklySummary,/Facture du lundi/);
  assert.match(weeklySummary,/déjà comptabilisé dans les frais du bilan hebdomadaire/);
  assert.match(weeklySummary,/Redevances déduites du bilan de revenus du mardi au lundi/);
  assert.match(weeklySummary,/money\(airportFeeTotal\)/);
  assert.match(weeklySummary,/Les courses aéroport du lundi sont reportées au mardi suivant/);
  assert.match(weeklySummary,/au mardi suivant/);
  assert.match(css,/\.airport-invoice-summary/);
  assert.match(css,/\.airport-invoice-summary > summary:focus-visible/);
  assert.match(css,/@media \(max-width: 760px\)/);
});
