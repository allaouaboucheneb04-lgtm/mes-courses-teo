import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
const vite = await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const {parsePhotoDate} = await vite.ssrLoadModule("/lib/photo-date.ts");
test("current-day rows with time are day/month even when both numbers are below 13",()=>{
  assert.equal(parsePhotoDate("Compte 22/09 @ 10:00 a.m.","2026"),"2026-09-22");
  assert.equal(parsePhotoDate("Carte 08/09 @ 10:27 a.m.","2026"),"2026-09-08");
  assert.equal(parsePhotoDate("Carte 08/09 10:27", "2026"),"2026-09-08");
});
test("older rows are month/day, including ambiguous dates",()=>{
  assert.equal(parsePhotoDate("Carte 09/21","2026"),"2026-09-21");
  assert.equal(parsePhotoDate("Compte 09/08","2026"),"2026-09-08");
  assert.equal(parsePhotoDate("Carte 08/09","2026"),"2026-08-09");
  assert.equal(parsePhotoDate("Compte 09/01","2026"),"2026-09-01");
});
test("mixed dates on the supplied screenshot retain their exact days",()=>{
  assert.deepEqual(["22/09 @ 10:00 a.m.","09/21","09/20"].map(s=>parsePhotoDate(s,"2026")),["2026-09-22","2026-09-21","2026-09-20"]);
});
test("a saved capture does not depend on today's device date",()=>{
  assert.equal(parsePhotoDate("08/09/2025 @ 09:00","2026"),"2025-09-08");
  assert.equal(parsePhotoDate("09/08/2025","2026"),"2025-09-08");
});
test("OCR spaces and lost times are handled without accepting impossible dates",()=>{
  assert.equal(parsePhotoDate("22 / 09","2026"),"2026-09-22");
  for(const s of ["02/30","02/29","00/12","13/13","no date"]) assert.equal(parsePhotoDate(s,"2026"),"");
  assert.equal(parsePhotoDate("02/29","2024"),"2024-02-29");
});
