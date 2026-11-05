import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
after(() => vite.close());
const {
  filterSevRides, filterSevStatuses, matchesSevSearch, matchesSevCategory, summarizeSevCategories,
} = await vite.ssrLoadModule("/lib/sev-filtering.ts");

const rides = [
  {id:"airport",type:"taxi",date:"2026-11-04",amount:43.20,tip:2.50,teoId:"29176627A",taxiCategory:"aeroport",verified:true,sevAdded:false,verifiedBillId:"BILL001233135"},
  {id:"downtown",type:"taxi",date:"2026-11-03",amount:23.82,tip:0,taxiCategory:"centre-ville",verified:false,sevAdded:true},
  {id:"legacy",type:"taxi",date:"2026-11-04",amount:12.00,tip:0,verified:false,sevAdded:false},
  {id:"adapted",type:"adapte",date:"2026-11-05",amount:1234.56,tip:0,hob:"HOB0123",verified:false,sevAdded:true},
  {id:"last",type:"taxi",date:"2026-10-29",amount:50,tip:0,taxiCategory:"aeroport",verified:true,sevAdded:true},
];
const opts={period:"week",week:{start:"2026-11-03",end:"2026-11-09"},today:"2026-11-05",start:"2026-11-03",end:"2026-11-05",category:"all",search:""};
const ids=items=>items.map(item=>item.id);

test("week Tuesday to Monday; previous week is exactly seven days earlier",()=>{
  assert.deepEqual(ids(filterSevRides(rides,opts)),["adapted","airport","legacy","downtown"]);
  assert.deepEqual(ids(filterSevRides(rides,{...opts,period:"previous"})),["last"]);
});

test("airport, centre-ville and adapted categories do not overlap",()=>{
  assert.deepEqual(ids(filterSevRides(rides,{...opts,category:"aeroport"})),["airport"]);
  assert.deepEqual(ids(filterSevRides(rides,{...opts,category:"centre-ville"})),["legacy","downtown"]);
  assert.deepEqual(ids(filterSevRides(rides,{...opts,category:"adapte"})),["adapted"]);
  assert.deepEqual(ids(filterSevRides(rides,{...opts,category:"taxi"})),["airport","legacy","downtown"]);
  assert.equal(matchesSevCategory(rides[3],"aeroport"),false);
});

test("search recognizes HOB, Téo ID, BILL, dates and French money",()=>{
  const ride=rides[0];
  assert.equal(matchesSevSearch(ride,"29176627a"),true);
  assert.equal(matchesSevSearch(ride,"BILL001233135"),true);
  assert.equal(matchesSevSearch(ride,"04/11/2026"),true);
  assert.equal(matchesSevSearch(ride,"2026-11-04"),true);
  assert.equal(matchesSevSearch(ride,"45,70"),true);
  assert.equal(matchesSevSearch(rides[3],"1 234,56 $"),true);
  assert.equal(matchesSevSearch(rides[3],"HOB0123"),true);
  assert.equal(matchesSevSearch(rides[3],"adapté"),true);
  assert.equal(matchesSevSearch(ride,"unrelated code"),false);
});

test("search is combined with period and category, not added to totals",()=>{
  assert.deepEqual(ids(filterSevRides(rides,{...opts,category:"aeroport",search:"BILL001233135"})),["airport"]);
  assert.deepEqual(ids(filterSevRides(rides,{...opts,category:"adapte",search:"BILL001233135"})),[]);
});

test("bad custom range yields zero and inclusive custom date bounds are respected",()=>{
  assert.deepEqual(filterSevRides(rides,{...opts,period:"custom",start:"2026-11-05",end:"2026-11-03"}),[]);
  assert.deepEqual(ids(filterSevRides(rides,{...opts,period:"custom",start:"2026-11-05",end:"2026-11-05"})),["adapted"]);
});

test("SEV declaration and Téo payroll states are independent",()=>{
  const weekly=filterSevRides(rides,opts);
  assert.deepEqual(ids(filterSevStatuses(weekly,"pending","verified")),["airport"]);
  assert.deepEqual(ids(filterSevStatuses(weekly,"added","unverified")),["adapted","downtown"]);
  assert.deepEqual(ids(filterSevStatuses(weekly,"all","unverified")),["adapted","legacy","downtown"]);
  assert.deepEqual(ids(filterSevStatuses(weekly,"pending","all")),["airport","legacy"]);
});

test("equal-date, equal-amount courses remain separate",()=>{
  const two=[
    {id:"x",type:"taxi",date:"2026-11-03",amount:32.45,tip:0},
    {id:"y",type:"taxi",date:"2026-11-03",amount:32.45,tip:0},
  ];
  assert.equal(filterSevRides(two,{...opts,search:"32,45"}).length,2);
});

test("category gross totals include tips, preserve identical rides, and exclude past dates", () => {
  const weekly = filterSevRides(rides, opts);
  const categories = summarizeSevCategories(weekly);
  assert.deepEqual(categories, [
    {id:"aeroport",label:"Aéroport",count:1,amount:45.7},
    {id:"centre-ville",label:"Centre-ville",count:2,amount:35.82},
    {id:"adapte",label:"Transport adapté",count:1,amount:1234.56},
  ]);
  const duplicate = [{...rides[0],id:"second-airport"}];
  assert.deepEqual(summarizeSevCategories([rides[0], ...duplicate])[0], {
    id:"aeroport",label:"Aéroport",count:2,amount:91.4,
  });
  assert.equal(Math.round(categories.reduce((sum, c) => sum + c.amount, 0) * 100),
    Math.round(weekly.reduce((sum, ride) => sum + ride.amount + ride.tip, 0) * 100));
});

test("category summary stays stable even after a category is selected", () => {
  const baseRows = filterSevRides(rides, {...opts,category:"all"});
  const airportOnly = baseRows.filter(ride => matchesSevCategory(ride,"aeroport"));
  assert.equal(airportOnly.length,1);
  assert.equal(summarizeSevCategories(baseRows).find(c => c.id === "adapte").count,1);
  assert.equal(summarizeSevCategories(airportOnly).find(c => c.id === "adapte").count,0);
});
