import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const code = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const start = code.indexOf('<section className="history" id="history">');
const end = code.indexOf('<DateRangePicker\n', start);
assert.ok(start >= 0 && end > start, "History section exists");
const history = code.slice(start,end);
const footer = code.slice(end,end+1300);

test("History uses SEV-style period and calendar instead of the former four-column filters",()=>{
 assert.match(history,/className="history-date-filter"/);
 assert.match(history,/aria-label="Choisir une période"/);
 assert.match(history,/value="week">Cette semaine<\/option>/);
 assert.match(history,/value="last-week">Semaine passée<\/option>/);
 assert.match(history,/value="month">Ce mois<\/option>/);
 assert.match(history,/value="all">Toutes les dates<\/option>/);
 assert.match(history,/value="custom">Dates personnalisées<\/option>/);
 assert.match(history,/aria-label="Choisir les dates dans le calendrier"/);
 assert.doesNotMatch(history,/className="history-controls"/);
 assert.ok(history.indexOf("history-date-filter")<history.indexOf("history-search-row"));
});

test("Custom dates apply only on calendar confirmation, without accidental selection on cancel",()=>{
 assert.match(history,/if \(next === "custom"\) setDateRangeTarget\("history"\)/);
 assert.match(footer,/if \(dateRangeTarget === "history"\) \{[\s\S]*?setCustomStart\(start\);[\s\S]*?setCustomEnd\(end\);[\s\S]*?setHistoryPeriod\("custom"\)/);
});

test("Summary uses existing calculation and retains all user actions",()=>{
 assert.match(history,/className="history-highlights"/);
 assert.match(history,/money\(historyDisplayNet\)/);
 assert.match(history,/className="history-overview history-breakdown"/);
 assert.match(history,/className="history-course-quick"/);
 assert.match(history,/className="history-course-breakdown"/);
 assert.match(history,/SevCheckbox ride=\{c\} onChange=\{setSevStatus\}/);
 assert.match(history,/onClick=\{\(\) => editCourse\(c\)\}/);
 assert.match(history,/setCourses\(courses\.filter\(\(x\) => x\.id !== c\.id\)\)/);
 assert.match(history,/className="history-management"/);
 assert.match(history,/if \(confirm\("Supprimer définitivement/);
});

test("History filters are resettable without modifying stored rides",()=>{
 assert.match(code,/const resetHistoryFilters = \(\) => \{/);
 assert.match(code,/setHistoryType\("all"\); setHistoryPayment\("all"\); setHistorySearch\(""\); setHistoryPeriod\("week"\);/);
 assert.match(history,/onClick=\{resetHistoryFilters\}/);
 assert.match(history,/matchesHistoryType|Catégorie de course/);
 assert.match(history,/Mode de paiement/);
});


test("History company fee uses accounting period rather than weeks with visible rides", () => {
  assert.match(code, /weeklyCompanyFeeTotal\(\s*settings\.companyFee,\s*historyBounds,/);
  assert.doesNotMatch(code, /new Set\(filteredHistory\.map\(\(course\) => tuesdayWeekKey/);
  assert.match(code, /\(historyHasCourseFilter \? 0 : historyCompanyFeeTotal \+ historyExpenseTotal\)/);
  assert.match(history, /Frais de compagnie\{historyHasCourseFilter \? " \(information\)" : ""\}/);
  assert.match(history, /money\(historyCompanyFeeTotal\)/);
});
