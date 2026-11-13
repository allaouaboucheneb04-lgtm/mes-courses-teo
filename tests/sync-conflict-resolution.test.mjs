import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "vite";
import {readFileSync} from "node:fs";

const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
try {
  const {
    mergeDriverData, mergeDriverDataPreferLocal, SyncConflict
  }=await vite.ssrLoadModule("/lib/sync-merge.ts");

  const make=(courses=[], expenses=[], settings={companyFee:120})=>({
    courses, expenses, payStatements:[], inspections:[], settings
  });
  const ride=(id,amount,payment="Carte")=>({id,amount,payment});

  await test("true same-field changes conflict in normal saving (no silent overwrite)",()=>{
    const base=make([ride("a",10)]);
    const local=make([ride("a",20)]);
    const cloud=make([ride("a",30)]);
    assert.throws(()=>mergeDriverData(base,local,cloud),SyncConflict);
  });

  await test("explicit prefer-local merge preserves remote-only courses and edits",()=>{
    const base=make([ride("a",10),ride("b",5)]);
    const local=make([ride("a",20),ride("b",5)]);
    const cloud=make([ride("a",30),ride("b",5,"Espèces"),ride("c",100)]);
    const resolved=mergeDriverDataPreferLocal(base,local,cloud);
    assert.equal(resolved.courses.find(x=>x.id==="a").amount,20);
    assert.equal(resolved.courses.find(x=>x.id==="b").payment,"Espèces");
    assert.equal(resolved.courses.find(x=>x.id==="c").amount,100);
    assert.equal(new Set(resolved.courses.map(x=>x.id)).size,3);
  });

  await test("independent fields of a single changed record are merged safely",()=>{
    const base=make([ride("a",10)]);
    const local=make([ride("a",20)]);
    const cloud=make([ride("a",10,"Espèces")]);
    assert.deepEqual(mergeDriverData(base,local,cloud).courses[0],ride("a",20,"Espèces"));
  });

  await test("local deletions win only in explicitly approved merge",()=>{
    const base=make([ride("a",10),ride("b",50)]);
    const local=make([ride("a",10)]);
    const cloud=make([ride("a",10),ride("b",80),ride("c",90)]);
    assert.throws(()=>mergeDriverData(base,local,cloud),SyncConflict);
    const resolved=mergeDriverDataPreferLocal(base,local,cloud);
    assert.deepEqual(resolved.courses.map(x=>x.id),["a","c"]);
  });

  await test("conflicting settings stay local while remote-only fields survive",()=>{
    const base=make([] ,[],{companyFee:120,airportFee:6.44});
    const local=make([] ,[],{companyFee:200.42,airportFee:6.44});
    const cloud=make([] ,[],{companyFee:150,airportFee:7});
    const resolved=mergeDriverDataPreferLocal(base,local,cloud);
    assert.deepEqual(resolved.settings,{companyFee:200.42,airportFee:7});
  });

  await test("the UI stops repeating unresolved conflicts, keeps its recovery draft, and backs up before overwriting",()=>{
    const code=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
    const start=code.indexOf("    if (!loaded || !user || !baseline.current");
    assert.ok(start>=0,"autosave effect found");
    const guarded=code.slice(start,code.indexOf("  }, [courses, expenses",start));
    assert.match(code,/const \[syncConflict, setSyncConflict\] = useState\(false\)/);
    assert.match(code,/if \(syncConflict\) return;/);
    assert.ok(guarded.indexOf("localStorage.setItem(draftKey")<guarded.indexOf("if (syncConflict) return"));
    assert.match(code,/transaction\.set\(backupRef,/);
    assert.match(code,/mergeDriverDataPreferLocal\(base, local, remote\)/);
    assert.match(code,/Fusionner et garder mes changements/);
    assert.match(code,/Charger la version du compte \(avec sauvegarde\)/);
    assert.doesNotMatch(code,/Charger la version sauvegardée<\/button>/);
    assert.match(code,/if \(syncOwner\.current !== owner\.uid\) return/);
  });
} finally {await vite.close();}
