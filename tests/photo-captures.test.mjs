import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});after(()=>vite.close());
const {photoScreenContent,uniquePhotoCandidates,photoPreviewDuplicateStatus,photoDuplicateStatus}=await vite.ssrLoadModule('/lib/photo-import.ts');
const row=(file,index,total='32,46')=>({date:'2026-10-26',total,tip:'',sourceFingerprint:`${file}:${index}`,sourceContentFingerprint:`same-screen:2026-10-26:${index}`});
test('same screen under different files imports each row once',()=>{
 const items=[row('fileA',0),row('fileA',1,'10,87'),row('fileB',0),row('fileB',1,'10,87')];
 assert.equal(uniquePhotoCandidates(items).length,2);
});
test('three equal-price rides on one screen remain three rides',()=>{
 const items=[row('fileA',0),row('fileA',1),row('fileA',2)];
 assert.equal(uniquePhotoCandidates(items).length,3);
 assert.deepEqual(items.map(item=>photoPreviewDuplicateStatus(item,items,[])),['new','new','new']);
});
test('overlapping but different screens require confirmation for shared amounts',()=>{
 const first=row('fileA',0),second={...row('fileB',0),sourceContentFingerprint:'different-screen:0'};
 const items=[first,second];
 assert.equal(uniquePhotoCandidates(items).length,2);
 assert.equal(photoPreviewDuplicateStatus(second,items,[]),'possible');
});
test('saved OCR content matches a new capture, legacy amounts only remain possible',()=>{
 const item=row('new-file',0),saved={type:'taxi',payment:'Téo / carte',date:item.date,amount:32.46,tip:0,sourceFingerprint:'old-file:0',sourceContentFingerprint:item.sourceContentFingerprint};
 assert.equal(photoDuplicateStatus(item,[saved]),'exact');
 assert.equal(photoDuplicateStatus(item,[{...saved,sourceContentFingerprint:undefined}]),'possible');
});
test('header time, accents and whitespace do not change screen content, addresses do',()=>{
 const a='23:20 42%\nRéservations\n32.46 $ 100 Rue Démo\nCarte 10/26\n10.87 $ 200 Rue Test\nCarte 10/26';
 const b='23:21 41%\nReservations\n32,46 $ 100 RUE DEMO\nCARTE   10/26\n10,87 $ 200 Rue Test\nCarte 10/26';
 assert.equal(photoScreenContent(a),photoScreenContent(b));
 assert.notEqual(photoScreenContent(a),photoScreenContent(a.replace('100 Rue','101 Rue')));
});
