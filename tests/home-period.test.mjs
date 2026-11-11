import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "vite";

const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
const {homePeriodBounds,summarizeHomePeriod}=await vite.ssrLoadModule("/lib/home-period.ts");

const current="2026-11-11";
const rides=[
  {type:"taxi",date:"2026-11-02",taxiCategory:"aeroport",amount:100,tip:0,serviceDeductions:12},
  {type:"taxi",date:"2026-11-03",taxiCategory:"centre-ville",amount:50,tip:5,serviceDeductions:5},
  {type:"taxi",date:"2026-11-09",taxiCategory:"aeroport",amount:40,tip:0,serviceDeductions:4},
  {type:"taxi",date:"2026-11-10",taxiCategory:"centre-ville",amount:80,tip:0,serviceDeductions:8},
  {type:"taxi",date:"2026-11-11",taxiCategory:"centre-ville",amount:118.92,tip:0,serviceDeductions:16.41},
  {type:"taxi",date:"2026-11-14",taxiCategory:"aeroport",amount:99,tip:0,serviceDeductions:10},
];
const costs=[
  {date:"2026-11-08",amount:15},
  {date:"2026-11-11",amount:5},
  {date:"2026-11-14",amount:20},
];
const settings={
  airportFee:6.44,companyFee:200.42,dailyGoalEnabled:true,
  dailyGoals:[100,200,415,300,300,150,150],
};
const bounds=(period,start=current,end=current)=>homePeriodBounds(period,current,start,end);
const summary=(period,start=current,end=current)=>
  summarizeHomePeriod(rides,costs,bounds(period,start,end),current,settings);

try {
  await test("home periods use the Tuesday–Monday taxi week and calendar dates",()=>{
    assert.deepEqual(bounds("day"),{start:"2026-11-11",end:"2026-11-11"});
    assert.deepEqual(bounds("week"),{start:"2026-11-10",end:"2026-11-16"});
    assert.deepEqual(bounds("month"),{start:"2026-11-01",end:"2026-11-30"});
    assert.deepEqual(bounds("year"),{start:"2026-01-01",end:"2026-12-31"});
    assert.deepEqual(bounds("custom","2026-11-09","2026-11-11"),{
      start:"2026-11-09",end:"2026-11-11"
    });
    assert.deepEqual(homePeriodBounds("month","2028-02-17","",""),{
      start:"2028-02-01",end:"2028-02-29"
    });
    assert.equal(bounds("custom","2026-11-12","2026-11-11"),null);
    assert.equal(bounds("custom","bad","2026-11-11"),null);
  });

  await test("today includes real course fees and expenses but no Tuesday company fee",()=>{
    const day=summary("day");
    assert.equal(day.valid,true);
    assert.equal(day.count,1);
    assert.equal(day.gross,118.92);
    assert.equal(day.tips,0);
    assert.equal(day.serviceFees,16.41);
    assert.equal(day.companyFees,0);
    assert.equal(day.airportFees,0);
    assert.equal(day.expenses,5);
    assert.equal(day.fees,21.41);
    assert.equal(day.net,97.51);
    assert.equal(day.goal,415);
  });

  await test("weekly dashboard counts Monday airport levy on Tuesday, even without Monday income",()=>{
    const week=summary("week");
    assert.equal(week.count,2);
    assert.equal(week.gross,198.92);
    assert.equal(week.serviceFees,24.41);
    assert.equal(week.airportFees,6.44);
    assert.equal(week.companyFees,200.42);
    assert.equal(week.expenses,5);
    assert.equal(week.fees,236.27);
    assert.equal(week.net,-37.35);
    assert.equal(week.goal,615); // Tuesday and Wednesday, not future days.
  });

  await test("monthly dashboard counts all Tuesdays and ignores future rides or expenses",()=>{
    const month=summary("month");
    assert.equal(month.count,5);
    assert.equal(month.gross,393.92);
    assert.equal(month.tips,5);
    assert.equal(month.serviceFees,45.41);
    assert.equal(month.airportFees,12.88);
    assert.equal(month.companyFees,400.84);
    assert.equal(month.expenses,20);
    assert.equal(month.fees,479.13);
    assert.equal(month.net,-85.21);
    assert.ok(month.goal > 615);
  });

  await test("custom boundaries and year include service, company and airport charges by accounting dates",()=>{
    const custom=summary("custom","2026-11-09","2026-11-11");
    assert.equal(custom.count,3);
    assert.equal(custom.gross,238.92);
    assert.equal(custom.airportFees,6.44);
    assert.equal(custom.companyFees,200.42);
    assert.equal(custom.expenses,5);
    assert.equal(custom.fees,240.27);
    assert.equal(custom.net,-1.35);
    assert.equal(custom.goal,715);
    const mondayOnly=summary("custom","2026-11-09","2026-11-09");
    assert.equal(mondayOnly.airportFees,0);
    assert.equal(mondayOnly.companyFees,0);
    assert.equal(mondayOnly.net,36);
    const year=summary("year");
    assert.equal(year.count,5);
    assert.equal(year.gross,monthGross());
    assert.ok(year.companyFees > 400.84);
    assert.ok(year.goal > custom.goal);
  });

  await test("invalid custom dates show unavailable figures, not misleading zeros",()=>{
    const invalid=summary("custom","2026-11-12","2026-11-11");
    assert.equal(invalid.valid,false);
    assert.equal(invalid.count,0);
    assert.equal(invalid.goal,0);
  });
} finally {
  await vite.close();
}
function monthGross() {return 393.92;}
