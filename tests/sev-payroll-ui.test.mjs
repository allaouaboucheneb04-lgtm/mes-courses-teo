import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom", configFile: false, root,
  resolve: { alias: { "@": root }, dedupe: ["react", "react-dom"] },
  server: { middlewareMode: true, hmr: false },
});
after(async () => { await vite.close(); });
const { default: SevPage } = await vite.ssrLoadModule("/components/sev-page.tsx");
const base = {
  expenses: [], companyFee: 120,
  onFiscalChange: () => {}, onChange: () => {}, onEdit: () => {},
  today: "2026-11-05", week: { start: "2026-11-03", end: "2026-11-09" },
};
const render = courses => renderToStaticMarkup(React.createElement(SevPage, { ...base, courses }));

test("SEV retains separate payroll verification and SEV status totals", () => {
  const html = render([
    {id:"taxi",type:"taxi",date:"2026-11-03",amount:20,tip:3,payment:"Téo / carte",verified:true,sevAdded:false,verifiedBillId:"BILL123"},
    {id:"adapted",type:"adapte",date:"2026-11-04",amount:40,tip:0,payment:"",verified:false,sevAdded:true,hob:"HOB0012"},
    {id:"cash",type:"taxi",date:"2026-11-04",amount:30,tip:0,payment:"Espèces"},
    {id:"older",type:"adapte",date:"2026-10-22",amount:100,tip:0,payment:""},
  ]);
  assert.match(html, /Vérification paie Téo/);
  assert.match(html, /✓ Vérifiées<\/span><b>1<\/b>/);
  assert.match(html, /Non vérifiées<\/span><b>1<\/b>/);
  assert.match(html, /23,00[^<]*\$/);
  assert.match(html, /40,00[^<]*\$/);
  assert.match(html, /✓ Paie vérifiée/);
  assert.match(html, /Paie non vérifiée/);
  assert.match(html, /✓ Ajoutée au SEV/);
  assert.match(html, /À ajouter au SEV/);
  assert.doesNotMatch(html, /100,00[^<]*\$/);
});

test("SEV date is one compact selector, with calendar and all supported periods", () => {
  const html = render([{id:"one",type:"adapte",date:"2026-11-04",amount:12,tip:0,payment:""}]);
  assert.match(html, /aria-label="Filtrer les courses par date"/);
  assert.match(html, /<strong>Période<\/strong>/);
  assert.match(html, /Du 3 nov\.? au 9 nov\.?/);
  assert.match(html, /aria-label="Choisir une période"/);
  assert.match(html, /value="week"[^>]*>Cette semaine<\/option>/);
  assert.match(html, /value="previous">Semaine passée<\/option>/);
  assert.match(html, /value="month">Ce mois<\/option>/);
  assert.match(html, /value="all">Toutes les dates<\/option>/);
  assert.match(html, /value="custom">Dates personnalisées<\/option>/);
  assert.match(html, /aria-label="Choisir les dates dans le calendrier"/);
  assert.ok(html.indexOf("sev-date-control-row") < html.indexOf("sev-search-row"));
  assert.ok(html.indexOf("sev-search-row") < html.indexOf("sev-stats sev-status-cards"));
});

test("the circled category/SEV/payroll selector block was removed, not the status cards", () => {
  const html = render([{id:"one",type:"adapte",date:"2026-11-04",amount:12,tip:0,payment:""}]);
  assert.doesNotMatch(html, /sev-inline-filters/);
  assert.doesNotMatch(html, /Filtres avancés/);
  assert.doesNotMatch(html, /Filtrer par catégorie/);
  assert.doesNotMatch(html, /Filtrer par statut SEV/);
  assert.doesNotMatch(html, /Filtrer par vérification de paie/);
  assert.match(html, /sev-stats sev-status-cards/);
  assert.match(html, /sev-payroll-status-cards/);
  assert.match(html, /sev-category-cards/);
  assert.match(html, /1 course correspond aux filtres/);
});

test("SEV category cards preserve amounts and omit cash or past rides", () => {
  const html = render([
    {id:"airport",type:"taxi",date:"2026-11-05",amount:30,tip:2,payment:"Carte",taxiCategory:"aeroport",verified:true},
    {id:"downtown",type:"taxi",date:"2026-11-04",amount:25,tip:5,payment:"Téo / carte",taxiCategory:"centre-ville"},
    {id:"adapted",type:"adapte",date:"2026-11-04",amount:118.92,tip:0,payment:"",hob:"HOB0397"},
    {id:"cash",type:"taxi",date:"2026-11-05",amount:500,tip:0,payment:"Espèces",taxiCategory:"centre-ville"},
    {id:"old",type:"adapte",date:"2026-10-28",amount:999,tip:0,payment:""},
  ]);
  assert.match(html, /Aéroport<\/span><b>1<\/b><small>32,00[^<]*\$/);
  assert.match(html, /Centre-ville<\/span><b>1<\/b><small>30,00[^<]*\$/);
  assert.match(html, /Transport adapté<\/span><b>1<\/b><small>118,92[^<]*\$/);
  assert.match(html, /Filtrer cette catégorie/);
  assert.doesNotMatch(html, /500,00[^<]*\$/);
  assert.doesNotMatch(html, /999,00[^<]*\$/);
});
