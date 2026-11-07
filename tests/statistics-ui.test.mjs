import assert from "node:assert/strict";
import test,{after} from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";

const root=fileURLToPath(new URL("..",import.meta.url));
const vite=await createServer({
 appType:"custom",configFile:false,root,
 resolve:{alias:{"@":root},dedupe:["react","react-dom"]},
 server:{middlewareMode:true,hmr:false},
});
after(()=>vite.close());
const {default:StatisticsPage}=await vite.ssrLoadModule("/components/statistics-page.tsx");
const rides=[
 {id:"week-a",type:"taxi",date:"2026-11-03",amount:100,tip:10,payment:"Carte",serviceFee:5,perception:2,airportFee:6.44,taxiCategory:"aeroport"},
 {id:"week-b",type:"adapte",date:"2026-11-04",amount:59.46,tip:0,payment:"",serviceFee:0,perception:0},
 {id:"old",type:"taxi",date:"2026-10-28",amount:70,tip:0,payment:"Carte",serviceFee:0},
];
const html=renderToStaticMarkup(React.createElement(StatisticsPage,{
 courses:rides,today:"2026-11-06",dailyGoals:Array(7).fill(300),goalsEnabled:true,onSettings:()=>{},
}));

test("statistics uses the same period selection and calendar as SEV",()=>{
 assert.match(html,/aria-label="Filtrer les statistiques par date"/);
 assert.match(html,/aria-label="Choisir une période"/);
 assert.match(html,/value="week"[^>]*>Cette semaine<\/option>/);
 assert.match(html,/value="previous">Semaine passée<\/option>/);
 assert.match(html,/value="month">Ce mois<\/option>/);
 assert.match(html,/value="all">Toutes les dates<\/option>/);
 assert.match(html,/value="custom">Dates personnalisées<\/option>/);
 assert.match(html,/aria-label="Choisir les dates dans le calendrier"/);
 assert.doesNotMatch(html,/statistics-filter-panel|aria-label="Comparer par"/);
});

test("statistics has four clear KPI cards and preserves the correct net",()=>{
 assert.match(html,/aria-label="Chiffres de la période"/);
 assert.match(html,/Revenu net estimé/);
 assert.match(html,/Revenu brut/);
 assert.match(html,/Courses \/ tournées/);
 assert.match(html,/Pourboires connus/);
 assert.match(html,/156,02[^<]*\$/); // gross 169.46 - fee 5 - perception 2 - airport fee 6.44
 assert.match(html,/169,46[^<]*\$/);
 assert.match(html,/3 nov/);
 assert.ok(html.indexOf("statistics-period-card")<html.indexOf("statistics-overview"));
 assert.ok(html.indexOf("statistics-overview")<html.indexOf("comparison-summary"));
});

test("statistic controls show activity categories without a big accordion",()=>{
 assert.match(html,/aria-label="Type d’activité"/);
 assert.match(html,/value="aeroport">Aéroport<\/option>/);
 assert.match(html,/value="centre-ville">Centre-ville<\/option>/);
 assert.match(html,/value="adapte">Transport adapté<\/option>/);
 assert.match(html,/Comparer uniquement jusqu’à aujourd’hui/);
 assert.match(html,/Évolution de l’activité/);
});
