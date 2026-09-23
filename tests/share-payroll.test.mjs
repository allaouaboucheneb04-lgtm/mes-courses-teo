import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(){
 const handlers={};const stores=new Map();
 const caches={open:async name=>{if(!stores.has(name))stores.set(name,new Map());const m=stores.get(name);const key=k=>typeof k==='string'?k:k.url;return {put:async(k,v)=>m.set(key(k),v.clone()),match:async k=>m.get(key(k))?.clone(),keys:async()=>[...m.keys()].map(k=>new Request(k)),delete:async k=>m.delete(key(k))};},keys:async()=>[...stores.keys()],delete:async k=>stores.delete(k)};
 vm.runInNewContext(source,{self:{registration:{scope:'https://example.com/mes-courses-teo/'},location:{origin:'https://example.com'},addEventListener:(n,f)=>handlers[n]=f,skipWaiting(){},clients:{claim(){}}},caches,URL,Response,Request,crypto:webcrypto,Date,fetch:()=>{throw Error('Shared PDF must not reach network');}});
 return {stores,caches,async share(files){const form=new FormData();for(const file of files)form.append('payroll',file);let result;handlers.fetch({request:new Request('https://example.com/mes-courses-teo/share-pay/',{method:'POST',body:form}),respondWith:p=>result=p});return result;},async activate(){let done;handlers.activate({waitUntil:p=>done=p});await done;}};
}
const pdf=name=>new File(['%PDF-1.7\nfixture'],name,{type:'application/pdf'});
test('manifest receives PDFs with POST within GitHub Pages scope',()=>{const m=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));assert.equal(m.share_target.method,'POST');assert.equal(m.share_target.action,'./share-pay/');assert.equal(m.share_target.params.files[0].name,'payroll');});
test('shared PDFs are stored locally before redirect, with names and content intact',async()=>{const w=worker();const r=await w.share([pdf('Fiche été.pdf'),pdf('BILL2.pdf')]);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'https://example.com/mes-courses-teo/?page=pay&shared=1');const cache=await w.caches.open('mes-courses-teo-shared-pdf-v1');const keys=await cache.keys();assert.equal(keys.length,2);const first=await cache.match(keys[0]);assert.equal(decodeURIComponent(first.headers.get('X-File-Name')),'Fiche été.pdf');assert.match(await first.text(),/^%PDF-/);await w.share([pdf('BILL3.pdf')]);assert.equal((await cache.keys()).length,3);});
test('invalid, empty and excessive files are rejected without storage',async()=>{for(const files of [[],[new File(['bad'],'fake.pdf',{type:'application/pdf'})],Array.from({length:6},()=>pdf('test.pdf'))]){const w=worker();const r=await w.share(files);assert.match(r.headers.get('location'),/share_error=files/);assert.equal(w.stores.size,0);}});
test('service worker updates preserve pending PDFs and unrelated app caches',async()=>{const w=worker();await w.share([pdf('BILL.pdf')]);await w.caches.open('mes-courses-teo-v6');await w.caches.open('other-app');await w.activate();assert.equal(w.stores.has('mes-courses-teo-shared-pdf-v1'),true);assert.equal(w.stores.has('other-app'),true);assert.equal(w.stores.has('mes-courses-teo-v6'),false);});
test('expired pending PDFs are removed when receiving a new share',async()=>{const w=worker();const cache=await w.caches.open('mes-courses-teo-shared-pdf-v1');await cache.put('https://example.com/mes-courses-teo/shared-pdf/old',new Response('old',{headers:{'X-Shared-At':'1'}}));await w.share([pdf('new.pdf')]);assert.equal((await cache.keys()).length,1);});
