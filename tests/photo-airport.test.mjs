import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const vite = await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const {photoCategory}=await vite.ssrLoadModule('/lib/photo-import.ts');
test('recognizes the three airport rows from the supplied screenshot',()=>{
 for(const row of [
  '39.27 $ Yul Aéroport Montréal-Trude… Carte 30/10 @ 11:26 a.m.',
  '64.84 $ Montréal-Pierre Elliott Trude… Carte 10/29',
  '58.35 $ Montréal-Pierre Elliott Trude… Carte 10/29',
 ]) assert.equal(photoCategory(row,'centre-ville',true),'aeroport',row);
});
test('recognizes YUL name, punctuation, truncation and OCR variants',()=>{
 for(const name of ['YUL','Y U L','YUI','Y U 1','Montréal-Pierre…','Montreal Pierre Elliott Trudeau International','Montréal–Pierre–Elliott–Trudeau','Montréal-Trudeau','Pierre Elliot Trudeau','Pierre Elliott\nTrudeau','Dorval Airport','Aéroport de Dorval','975 boulevard Roméo-Vachon Nord','975 Roméo Vachon N, Dorval'])
  assert.equal(photoCategory(name,'centre-ville',true),'aeroport',name);
});
test('does not identify nearby Dorval addresses or unrelated Trudeau streets as YUL',()=>{
 for(const name of ['2190 Av. Chartier, Dorval, Qc','2096 55E Av., Dorval','3971 R. Sherbrooke E, Montréal','100 rue Pierre Elliott Trudeau','900 boulevard Roméo Vachon']) {
  assert.equal(photoCategory(name,'centre-ville',true),'centre-ville',name);
 }
});
test('preserves configured fallback and airport-disabled behavior',()=>{
 assert.equal(photoCategory('123 rue Exemple','aeroport',true),'aeroport');
 assert.equal(photoCategory('YUL','aeroport',false),'centre-ville');
});
