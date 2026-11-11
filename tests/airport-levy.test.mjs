import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
after(() => vite.close());
const {airportLevyAccountingDate,airportLevyTotal,airportLevyCount} =
  await vite.ssrLoadModule("/lib/airport-levy.ts");
const {comparisonTotals} = await vite.ssrLoadModule("/lib/comparison.ts");
const {feePeriods} = await vite.ssrLoadModule("/lib/sev.ts");

const airport = (date, airportFee=6.44) => ({
  id: date, type:"taxi", taxiCategory:"aeroport", date,
  amount:50, tip:0, payment:"Téo / carte", serviceFee:2.76,
  airportFee, perception:0,
});
const includes = (start,end) => date => date >= start && date <= end;

test("Monday 9 November is charged Tuesday 10, not the income week ending Monday 9",()=>{
  assert.equal(airportLevyAccountingDate("2026-11-09"),"2026-11-10");
  assert.equal(airportLevyAccountingDate("2026-11-10"),"2026-11-10");
  assert.equal(airportLevyAccountingDate("2026-11-15"),"2026-11-15");
  assert.equal(airportLevyAccountingDate("2026-11-16"),"2026-11-17");
  assert.equal(airportLevyAccountingDate("2026-11-02"),"2026-11-03");
});

test("weekly income includes previous Monday plus Tuesday–Sunday, never its ending Monday",()=>{
  const rides=[
    airport("2026-11-02"), // Monday before this income week
    airport("2026-11-03"), // Tuesday current income week
    airport("2026-11-08"), // Sunday current week
    airport("2026-11-09"), // Monday ends this week: charge next Tuesday
    airport("2026-11-16"), // following Monday: charge Tuesday 17
    {...airport("2026-11-04"),taxiCategory:"centre-ville"},
    {...airport("2026-11-05"),type:"adapte"},
  ];
  assert.equal(airportLevyTotal(rides,includes("2026-11-03","2026-11-09")),19.32);
  assert.equal(airportLevyCount(rides,includes("2026-11-03","2026-11-09")),3);
  assert.equal(airportLevyTotal(rides,includes("2026-11-10","2026-11-16")),6.44);
  assert.equal(airportLevyTotal(rides,includes("2026-11-17","2026-11-23")),6.44);
  assert.equal(airportLevyTotal(rides,()=>true),32.2);
});

test("a Monday ride remains Monday's revenue but its levy appears in Tuesday's net",()=>{
  const monday=airport("2026-11-09");
  assert.equal(comparisonTotals([monday],["2026-11-09"]).gross,50);
  assert.equal(comparisonTotals([monday],["2026-11-09"]).net,47.24);
  assert.equal(comparisonTotals([monday],["2026-11-10"]).gross,0);
  assert.equal(comparisonTotals([monday],["2026-11-10"]).count,0);
  assert.equal(comparisonTotals([monday],["2026-11-10"]).net,-6.44);
  assert.equal(comparisonTotals([monday],["2026-11-09","2026-11-10"]).net,40.8);
});

test("Monday fee carries across month and year boundaries, with cent-safe grouping",()=>{
  assert.equal(airportLevyAccountingDate("2026-11-30"),"2026-12-01");
  assert.equal(airportLevyAccountingDate("2029-12-31"),"2030-01-01");
  const rides=[airport("2026-11-30"),airport("2029-12-31")];
  assert.equal(airportLevyTotal(rides,includes("2026-11-01","2026-11-30")),0);
  assert.equal(airportLevyTotal(rides,includes("2026-12-01","2026-12-31")),6.44);
  assert.equal(airportLevyTotal(rides,includes("2030-01-01","2030-01-31")),6.44);
  const monthly=feePeriods(rides,[],false,0);
  assert.equal(monthly.find(x=>x.period==="2026-12")?.airport,6.44);
  assert.equal(monthly.find(x=>x.period==="2026-11")?.airport,0);
  assert.equal(monthly.find(x=>x.period==="2030-01")?.airport,6.44);
  assert.equal(monthly.find(x=>x.period==="2029-12")?.airport,0);
  const yearly=feePeriods(rides,[],true,0);
  assert.equal(yearly.find(x=>x.period==="2026")?.airport,6.44);
  assert.equal(yearly.find(x=>x.period==="2029")?.airport,0);
  assert.equal(yearly.find(x=>x.period==="2030")?.airport,6.44);
});

test("change in airport fee settings recalculates dates without modifying stored rides",()=>{
  const rides=[airport("2026-11-09"),airport("2026-11-10")];
  const snapshot=JSON.stringify(rides);
  assert.equal(airportLevyTotal(rides,includes("2026-11-10","2026-11-16"),6.44),12.88);
  assert.equal(airportLevyTotal(rides,includes("2026-11-10","2026-11-16"),7.25),14.5);
  assert.equal(JSON.stringify(rides),snapshot);
});
