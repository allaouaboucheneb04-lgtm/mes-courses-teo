import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});after(()=>vite.close());
const {periodDates,previousAnchor,periodGoal,comparisonTotals,percentageChange}=await vite.ssrLoadModule('/lib/comparison.ts');
test('Monday compares to previous Monday; taxi weeks start Tuesday',()=>{assert.equal(previousAnchor('2026-09-21','day'),'2026-09-14');assert.deepEqual(periodDates('2026-09-21','week'),['2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-19','2026-09-20','2026-09-21']);});
test('month boundaries handle unequal lengths, leap years and New Year',()=>{assert.equal(periodDates('2024-02-20','month').length,29);assert.equal(periodDates('2026-02-20','month').length,28);assert.equal(previousAnchor('2026-01-10','month'),'2025-12-31');assert.equal(periodDates(previousAnchor('2026-03-31','month'),'month').at(-1),'2026-02-28');});
test('goals include every calendar day, including days without rides, with Monday index zero',()=>{assert.equal(periodGoal(periodDates('2026-09-23','week'),[100,200,300,400,500,0,0]),1500);assert.equal(periodGoal(['2026-09-21'],[100,200,300,400,500,0,0]),100);assert.equal(periodGoal(periodDates('2026-09-23','month'),Array(7).fill(100)),3000);});
test('net uses the home goal formula and selected dates only',()=>{const ride={id:'1',date:'2026-09-22',type:'taxi',payment:'Carte',amount:100,tip:10,serviceFee:6,perception:2,airportFee:6.44};assert.equal(comparisonTotals([ride],['2026-09-22']).net,95.56);assert.equal(comparisonTotals([ride],['2026-09-21']).net,0);assert.equal(percentageChange(150,100),50);assert.equal(percentageChange(50,100),-50);assert.equal(percentageChange(10,0),null);});
