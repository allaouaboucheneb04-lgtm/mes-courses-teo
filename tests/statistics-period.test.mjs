import assert from "node:assert/strict";
import test,{after} from "node:test";
import {createServer} from "vite";

const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const {dateSequence,statisticsPeriodDates,statisticsGraphGroups} = await vite.ssrLoadModule("/lib/statistics-period.ts");
const today="2026-11-06";
const range=(mode,start="2026-11-03",end="2026-11-09",dates=[])=>statisticsPeriodDates(mode,today,start,end,dates);

test("week matches the SEV Tuesday-to-Monday boundary",()=>{
 const current=range("week");
 assert.equal(current.valid,true);
 assert.deepEqual([current.current[0],current.current.at(-1)],["2026-11-03","2026-11-09"]);
 assert.deepEqual([current.previous[0],current.previous.at(-1)],["2026-10-27","2026-11-02"]);
});

test("previous week compares to the week before it",()=>{
 const previous=range("previous");
 assert.deepEqual([previous.current[0],previous.current.at(-1)],["2026-10-27","2026-11-02"]);
 assert.deepEqual([previous.previous[0],previous.previous.at(-1)],["2026-10-20","2026-10-26"]);
});

test("month selection follows whole calendar months and comparison dates are aligned",()=>{
 const month=range("month");
 assert.deepEqual([month.current[0],month.current.at(-1)],["2026-11-01","2026-11-30"]);
 assert.deepEqual([month.previous[0],month.previous.at(-1)],["2026-10-01","2026-10-31"]);
 assert.equal(range("day").previous[0],"2026-10-30");
});

test("custom selection compares with previous equal-length adjacent period",()=>{
 const custom=range("custom","2026-10-15","2026-10-20");
 assert.deepEqual([custom.current[0],custom.current.at(-1),custom.current.length],["2026-10-15","2026-10-20",6]);
 assert.deepEqual([custom.previous[0],custom.previous.at(-1),custom.previous.length],["2026-10-09","2026-10-14",6]);
 assert.equal(range("custom","2026-11-09","2026-11-03").valid,false);
 assert.deepEqual(dateSequence("2026-02-30","2026-03-01"),[]);
});

test("all-time deduplicates ride days and does not invent comparison",()=>{
 const selection=range("all","", "", ["2026-09-30","2026-09-30","2026-11-04","2026-11-07","invalid"]);
 assert.deepEqual(selection.current,["2026-09-30","2026-11-04"]);
 assert.equal(selection.comparable,false);
 assert.deepEqual(selection.previous,[]);
});

test("large periods chart uses maximum twelve rows, no thousands of unscrollable daily bars",()=>{
 const long=dateSequence("2026-01-01","2026-11-06");
 const old=dateSequence("2025-02-25","2025-12-31");
 const rows=statisticsGraphGroups(long,old);
 assert.ok(rows.length<=12);
 assert.equal(rows.reduce((sum,row)=>sum+row.now.length,0),long.length);
 assert.equal(rows.reduce((sum,row)=>sum+row.old.length,0),old.length);
 const months=statisticsGraphGroups(["2025-11-01","2026-01-01","2026-01-22"],[],true);
 assert.equal(months.length,2);
 assert.equal(months[1].now.length,2);
});
