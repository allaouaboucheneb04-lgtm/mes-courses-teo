import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root }, dedupe: ["react", "react-dom"] },
  server: { middlewareMode: true, hmr: false },
});
after(async () => { await vite.close(); });

const { default: SevPage } = await vite.ssrLoadModule("/components/sev-page.tsx");
const base = {
  expenses: [],
  companyFee: 120,
  onFiscalChange: () => {},
  onChange: () => {},
  onEdit: () => {},
  today: "2026-11-05",
  week: { start: "2026-11-03", end: "2026-11-09" },
};

test("SEV displays independent payroll verification summaries and individual badges", () => {
  const courses = [
    { id: "a", type: "taxi", date: "2026-11-03", amount: 20, tip: 3,
      payment: "Téo / carte", verified: true, verifiedBillId: "BILL123", sevAdded: false },
    { id: "b", type: "adapte", date: "2026-11-04", amount: 40, tip: 0,
      payment: "", verified: false, sevAdded: true, hob: "HOB0012" },
    { id: "cash", type: "taxi", date: "2026-11-04", amount: 30, tip: 0,
      payment: "Espèces", verified: false, sevAdded: false },
    { id: "older", type: "adapte", date: "2026-10-22", amount: 100, tip: 0,
      payment: "", verified: false, sevAdded: false },
  ];
  const html = renderToStaticMarkup(React.createElement(SevPage, { ...base, courses }));
  assert.match(html, /Vérification paie Téo/);
  assert.match(html, /✓ Vérifiées<\/span><b>1<\/b>/);
  assert.match(html, /Non vérifiées<\/span><b>1<\/b>/);
  assert.match(html, /23,00[^<]*\$/);
  assert.match(html, /40,00[^<]*\$/);
  assert.match(html, /✓ Paie vérifiée/);
  assert.match(html, /Paie non vérifiée/);
  assert.match(html, /✓ Ajoutée au SEV/);
  assert.match(html, /À ajouter au SEV/);
  assert.match(html, /value="verified">Vérifiées<\/option>/);
  assert.match(html, /value="unverified">Non vérifiées<\/option>/);
  assert.doesNotMatch(html, /100,00[^<]*\$/); // outside selected week
});

test("mobile SEV quick filters and reset controls appear before status cards", () => {
  const html = renderToStaticMarkup(React.createElement(SevPage, {
    ...base, courses:[{id:"a",type:"taxi",date:"2026-11-04",amount:45.70,tip:0,payment:"Téo / carte",taxiCategory:"aeroport"}]
  }));
  assert.match(html, /Période des courses/);
  assert.match(html, /Cette semaine/);
  assert.match(html, /Semaine passée/);
  assert.match(html, /Choisir des dates personnalisées/);
  assert.doesNotMatch(html, /Réinitialiser tous les filtres/);
  assert.match(html, /Filtrer par date/);
  assert.doesNotMatch(html, /Filtres avancés/);
  assert.match(html, /aria-label="Filtres des courses"/);
  assert.match(html, /Statut SEV/);
  assert.match(html, /Paie Téo/);
  assert.match(html, /value="aeroport">Aéroport<\/option>/);
  assert.match(html, /value="centre-ville">Centre-ville<\/option>/);
  assert.match(html, /BILL, date, montant/);
  assert.match(html, /1 course correspond aux filtres/);
  assert.ok(html.indexOf("sev-quick-period") < html.indexOf("sev-stats sev-status-cards"));
  assert.ok(html.indexOf("sev-date-filter-top") < html.indexOf("sev-stats sev-status-cards"));
  assert.ok(html.indexOf("sev-inline-filters") < html.indexOf("sev-stats sev-status-cards"));
});

test("SEV category cards show separate course counts and gross amounts next to verification", () => {
  const courses = [
    {id:"airport",type:"taxi",date:"2026-11-05",amount:30,tip:2,payment:"Carte",taxiCategory:"aeroport",verified:true},
    {id:"downtown",type:"taxi",date:"2026-11-04",amount:25,tip:5,payment:"Téo / carte",taxiCategory:"centre-ville"},
    {id:"adapted",type:"adapte",date:"2026-11-04",amount:118.92,tip:0,payment:"",hob:"HOB0397"},
    {id:"cash",type:"taxi",date:"2026-11-05",amount:500,tip:0,payment:"Espèces",taxiCategory:"centre-ville"},
    {id:"old",type:"adapte",date:"2026-10-28",amount:999,tip:0,payment:""},
  ];
  const html = renderToStaticMarkup(React.createElement(SevPage,{...base,courses}));
  assert.match(html,/aria-label="Montants des courses par catégorie"/);
  assert.match(html,/Montants par catégorie/);
  assert.match(html,/Aéroport<\/span><b>1<\/b><small>32,00[^<]*\$/);
  assert.match(html,/Centre-ville<\/span><b>1<\/b><small>30,00[^<]*\$/);
  assert.match(html,/Transport adapté<\/span><b>1<\/b><small>118,92[^<]*\$/);
  assert.match(html,/Filtrer cette catégorie/);
  assert.match(html,/aria-pressed="false"/);
  assert.ok(html.indexOf("sev-payroll-status-cards") < html.indexOf("sev-category-cards"));
  assert.doesNotMatch(html,/500,00[^<]*\$/);
  assert.doesNotMatch(html,/999,00[^<]*\$/);
});

test("SEV shows date filter above other filters and current Tuesday-to-Monday range", () => {
  const html = renderToStaticMarkup(React.createElement(SevPage, {
    ...base, courses: [{id:"test",type:"adapte",date:"2026-11-04",amount:12,tip:0,payment:""}],
  }));
  assert.match(html, /Filtrer par date/);
  assert.match(html, /Du 3 nov\.? au 9 nov\.?/);
  assert.match(html, /Choisir des dates personnalisées/);
  assert.match(html, /aria-label="Filtrer par catégorie"/);
  assert.match(html, /aria-label="Filtrer par vérification de paie"/);
  assert.doesNotMatch(html, /<details class="sev-filter-accordion"/);
  assert.ok(html.indexOf("sev-date-filter-top") < html.indexOf("sev-search-row"));
  assert.ok(html.indexOf("sev-search-row") < html.indexOf("sev-inline-filters"));
  assert.ok(html.indexOf("sev-inline-filters") < html.indexOf("sev-stats sev-status-cards"));
});

test("SEV compact iPhone controls do not show a disabled reset button", () => {
  const html = renderToStaticMarkup(React.createElement(SevPage, {
    ...base, courses: [],
  }));
  assert.match(html, /aria-label="Période des courses"/);
  assert.match(html, /aria-label="Cette semaine"/);
  assert.match(html, /aria-label="Semaine passée"/);
  assert.match(html, /aria-label="Choisir des dates personnalisées"/);
  assert.match(html, /class="sev-inline-filters "/);
  assert.match(html, /class="sev-sr-only">Rechercher une course/);
  assert.doesNotMatch(html, /Réinitialiser tous les filtres/);
  assert.doesNotMatch(html, /Filtres avancés/);
});
