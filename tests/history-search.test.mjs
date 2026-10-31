import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false } });
after(() => vite.close());
const { matchesHistoryType, matchesHistorySearch } = await vite.ssrLoadModule('/lib/history-search.ts');
const city = {type:'taxi',taxiCategory:'centre-ville',amount:30.46,tip:2,payment:'Téo / carte'};
const airport = {...city,taxiCategory:'aeroport'};
const adapted = {...city,type:'adapte',hob:'HOB1045'};
test('type filters separate airport, city and adapted; taxi includes both zones', () => {
 const rides=[city,airport,adapted,{...city,taxiCategory:undefined}];
 for(const [filter,expected] of [['all',4],['taxi',3],['aeroport',1],['centre-ville',2],['adapte',1]])
   assert.equal(rides.filter(c=>matchesHistoryType(c,filter)).length,expected);
});
test('search accepts comma, dot, currency and amount with or without tip', () => {
 for(const q of ['32,46','32.46','32,46 $','30.46',' 32,46 ']) assert.equal(matchesHistorySearch(city,q),true,q);
 for(const q of ['32,45','132.46','32.']) assert.equal(matchesHistorySearch(city,q),false,q);
 assert.equal(matchesHistorySearch({...city,amount:1000,tip:0},'1 000,00 $'),true);
});
test('existing identifiers and blank searches remain supported', () => {
 assert.equal(matchesHistorySearch(adapted,'hob1045'),true);
 assert.equal(matchesHistorySearch({...city,couponNumber:'123456'},'2345'),true);
 assert.equal(matchesHistorySearch(city,''),true);
});
