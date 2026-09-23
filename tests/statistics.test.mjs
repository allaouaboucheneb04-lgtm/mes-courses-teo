import assert from "node:assert/strict";
import test,{after} from "node:test";
import {createServer} from "vite";
const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const {rideStatistics,groupStatistics}=await vite.ssrLoadModule('/lib/statistics.ts');
const rides=[{id:'1',date:'2026-09-22',type:'taxi',amount:20,tip:3,payment:'Carte',serviceFee:1.27,verified:true},{id:'2',date:'2026-09-22',type:'taxi',amount:10,tip:0,tipPending:true,payment:'Carte',serviceFee:.55},{id:'3',date:'2026-09-23',type:'adapte',amount:120,tip:0,payment:'Transport adapté',serviceFee:16.56,perception:5,duration:1.5}];
test('revenue, tips, fees and averages reconcile without counting pending tips twice',()=>{
 const s=rideStatistics(rides);assert.equal(s.gross,153);assert.equal(s.fees,18.38);assert.equal(s.net,129.62);assert.equal(s.tips,3);assert.equal(s.unknownTips,1);assert.equal(s.days,2);assert.equal(s.average,51);assert.equal(s.dailyAverage,76.5);assert.equal(s.hours,1.5);assert.equal(s.verified,1);
});
test('group totals equal overall totals and reflect edited or removed rides',()=>{
 const groups=groupStatistics(rides,r=>r.date);assert.equal(groups.length,2);assert.equal(groups[0].gross,33);assert.equal(groups.reduce((s,r)=>s+r.gross,0),153);assert.equal(rideStatistics(rides.slice(1)).gross,130);assert.equal(rideStatistics([{...rides[0],amount:30}]).gross,33);
});
test('empty selections never produce NaN or Infinity',()=>{const s=rideStatistics([]);assert.equal(s.average,0);assert.equal(s.dailyAverage,0);assert.equal(s.net,0);assert.deepEqual(groupStatistics([],r=>r.date),[]);});
