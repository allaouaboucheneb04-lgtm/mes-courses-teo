import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const {reconcileVerification}=await vite.ssrLoadModule('/lib/verification.ts');
const {photoCandidateError,photoDuplicateStatus,photoCategory}=await vite.ssrLoadModule('/lib/photo-import.ts');
const {cardPayrollDifference,resolvePhotoTip}=await vite.ssrLoadModule('/lib/photo-tip.ts');
const {mergeDriverData,SyncConflict}=await vite.ssrLoadModule('/lib/sync-merge.ts');
const match=(c,r)=>c.date===r.date&&(!c.teoId||c.teoId===r.key);
const resolve=(c,r)=>({...resolvePhotoTip(c,r),teoId:r.key});
const course={id:'1',date:'2026-10-28',amount:20,tip:0,verified:true,verifiedBillId:'B1',verifiedAt:'2026-10-28',teoId:'R1'};
const bill={id:'B1',importedAt:'2026-10-28',rows:[{key:'R1',date:course.date,amount:20,tip:0}]};
test('reimported mismatching or removed row revokes verification',()=>{
 const updated=reconcileVerification([course],[{...bill,rows:[{...bill.rows[0],amount:30}]}],match,cardPayrollDifference,resolve)[0];
 assert.equal(updated.verified,false);assert.equal(updated.verifiedBillId,undefined);
 assert.equal(reconcileVerification([course],[],match,cardPayrollDifference,resolve)[0].verified,false);
});
test('one payroll row cannot keep two old verified flags and recalculation is stable',()=>{
 const next=reconcileVerification([course,{...course,id:'2'}],[bill],match,cardPayrollDifference,resolve);
 assert.equal(next.filter(c=>c.verified).length,1);
 assert.equal(reconcileVerification(next,[bill],match,cardPayrollDifference,resolve),next);
});
test('unknown tip still reconciles after editing unrelated fields',()=>{
 const photo={id:'p',date:course.date,amount:23,tip:0,tipPending:true,taxiCategory:'aeroport'};
 const next=reconcileVerification([photo],[{...bill,rows:[{...bill.rows[0],tip:3}]}],match,cardPayrollDifference,resolve)[0];
 assert.equal(next.verified,true);assert.equal(next.amount,20);assert.equal(next.tip,3);assert.equal(next.tipPending,false);
});
test('same date and amount are only possible duplicates; exact capture rows are distinct',()=>{
 const existing=[{type:'taxi',payment:'Téo / carte',date:course.date,amount:20,tip:0,sourceFingerprint:'hash:0'}];
 const candidate={date:course.date,total:'20,00',tip:'',sourceFingerprint:'hash:1'};
 assert.equal(photoDuplicateStatus(candidate,existing),'possible');
 assert.equal(photoDuplicateStatus({...candidate,sourceFingerprint:'hash:0'},existing),'exact');
 assert.equal(photoDuplicateStatus({...candidate,total:'25,00'},existing),'new');
});
test('blank/invalid date, zero/invalid total and bad tip cannot be imported',()=>{
 const good={date:course.date,total:'20,00',tip:''};assert.equal(photoCandidateError(good),'');
 for(const patch of [{date:''},{date:'2026-02-30'},{total:''},{total:'0'},{total:'NaN'},{total:'-1'},{tip:'21'},{tip:'-1'},{tip:'x'}]) assert.ok(photoCandidateError({...good,...patch}));
});
test('airport preference is fallback only; explicit city and disabled airport win',()=>{
 assert.equal(photoCategory('Carte','aeroport',true),'aeroport');
 assert.equal(photoCategory('Centre-ville','aeroport',true),'centre-ville');
 assert.equal(photoCategory('Aéroport','centre-ville',true),'aeroport');
 assert.equal(photoCategory('Aéroport','aeroport',false),'centre-ville');
});
const base={courses:[{id:'a',amount:20,tip:0}],expenses:[],payStatements:[],settings:{cardFee:5,airportEnabled:true}};
test('two devices add independent records without losing either one',()=>{
 const local={...base,courses:[...base.courses,{id:'b',amount:30,tip:0}]};
 const remote={...base,courses:[...base.courses,{id:'c',amount:40,tip:0}]};
 assert.deepEqual(mergeDriverData(base,local,remote).courses.map(c=>c.id),['a','b','c']);
});
test('different fields merge, same-field conflicts stop the write',()=>{
 const local={...base,courses:[{...base.courses[0],tip:3}]};
 const remote={...base,courses:[{...base.courses[0],amount:30}]};
 assert.deepEqual(mergeDriverData(base,local,remote).courses,[{id:'a',amount:30,tip:3}]);
 assert.throws(()=>mergeDriverData(base,local,{...base,courses:[{...base.courses[0],tip:4}]}),SyncConflict);
});
test('stale device does not resurrect a deletion; delete-versus-edit is a conflict',()=>{
 assert.deepEqual(mergeDriverData(base,base,{...base,courses:[]}).courses,[]);
 assert.throws(()=>mergeDriverData(base,{...base,courses:[{...base.courses[0],tip:3}]},{...base,courses:[]}),SyncConflict);
});
test('new edits made during an in-flight save survive the save response',()=>{
 const captured={...base,courses:[{...base.courses[0],amount:30}]};
 const committed={...captured,expenses:[{id:'expense-remote',amount:5}]};
 const latest={...captured,courses:[{...captured.courses[0],tip:4}]};
 const next=mergeDriverData(captured,latest,committed);
 assert.equal(next.courses[0].tip,4);assert.equal(next.expenses[0].id,'expense-remote');
});

// Execute the actual page handlers against in-memory fixtures; no Firebase writes.
const {readFileSync}=await import('node:fs');
const ts=await import('typescript');
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const compile=(text)=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const parseMoneyInput=s=>Number(s.trim().replace(/\s/g,'').replace(',','.'))||0;
const round2=x=>Math.round((x+Number.EPSILON)*100)/100;
const savePhotoCode=compile(page.slice(page.indexOf('  const savePhotoCourses ='),page.indexOf('  function addAdapted'))+'\nreturn savePhotoCourses;');
function runPhotoSave(photoCourses,courses=[]) {
 let saved=courses,message='',preview=photoCourses;
 const run=new Function('photoCourses','courses','photoCandidateError','photoDuplicateStatus','parseMoneyInput','round2','settings','setCourses','setPhotoCourses','setPhotoMessage',savePhotoCode)(photoCourses,courses,photoCandidateError,photoDuplicateStatus,parseMoneyInput,round2,{airportEnabled:true},v=>saved=v,v=>preview=v,v=>message=v);
 run();return {saved,message,preview};
}
test('actual save handler saves three same-price rides and skips only repeated fingerprints',()=>{
 const input=[0,1,2].map(i=>({id:String(i),date:'2026-10-28',total:'20,00',tip:'',selected:true,category:'aeroport',sourceFingerprint:`capture:${i}`}));
 const first=runPhotoSave(input);assert.equal(first.saved.length,3);assert.equal(first.saved.every(c=>c.tipPending),true);
 const again=runPhotoSave(input,first.saved);assert.equal(again.saved.length,3);
});
test('actual save handler rejects invalid inputs without clearing preview',()=>{
 const input=[{id:'bad',date:'',total:'',tip:'',selected:true,category:'centre-ville'}];
 const result=runPhotoSave(input);assert.equal(result.saved.length,0);assert.equal(result.preview,input);assert.ok(result.message);
});
test('actual taxi edit handler keeps unknown tip and source linkage',()=>{
 const old={id:'edit',date:'2026-10-28',amount:23,tip:0,tipPending:true,type:'taxi',payment:'Téo / carte',sourceFingerprint:'file:0'};
 const taxi={date:old.date,amount:'23,00',tip:'',payment:'Téo / carte',category:'aeroport'};
 let saved;
 const code=compile(page.slice(page.indexOf('  function addTaxi'),page.indexOf('  const parseTabletPhoto'))+'\nreturn addTaxi;');
 const run=new Function('taxi','courses','editingId','taxiSev','parseMoneyInput','round2','isCardPayment','normalizeCouponReference','defaultTaxiCategory','settings','setCourses','setEditingId','setTaxiSev','setTaxi','flash',code)(taxi,[old],old.id,false,parseMoneyInput,round2,()=>true,()=>'',()=> 'centre-ville',{},v=>saved=v,()=>{},()=>{},()=>{},()=>{});
 run({preventDefault(){}});assert.equal(saved[0].tipPending,true);assert.equal(saved[0].sourceFingerprint,'file:0');assert.equal(saved[0].amount,23);
});
