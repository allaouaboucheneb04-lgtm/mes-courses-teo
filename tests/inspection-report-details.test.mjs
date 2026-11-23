import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import ts from "typescript";
import {createServer} from "vite";

const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false}});
try {
  const {printableLines}=await vite.ssrLoadModule("/lib/vehicle-inspection-report.ts");
  const {INSPECTION_GROUPS}=await vite.ssrLoadModule("/lib/vehicle-inspection.ts");
  const record={
    id:"inspect-1",date:"2026-11-23",time:"09:15",
    driverName:"Conducteur Test",permitNumber:"PERMIS123",plate:"TEST123",
    odometer:"184000",governmentAccessory:"ACC-2026",batteryPercent:"72",
    defects:["headlight-left","parking-brake"],
    defectDescription:"Phare gauche et frein à vérifier",
    exteriorDamage:"Rayure sur porte",
    interiorDamage:"Tache sur siège",
    exteriorCondition:"a-nettoyer",interiorCondition:"propre",
    missingEquipment:"Trousse manquante",
    signature:"Conducteur Test",confirmed:true,
    createdAt:"2026-11-23T14:00:00.000Z",
    updatedAt:"2026-11-23T14:15:00.000Z",
  };

  await test("full report prints every checkpoint, not only recorded anomalies",()=>{
    const lines=printableLines(record);
    for(const group of INSPECTION_GROUPS){
      assert.ok(lines.some(x=>x.kind==="heading" && x.text===group.title.toUpperCase()),group.title);
      for(const check of group.checks){
        assert.equal(lines.filter(x=>x.text.endsWith(check.label)).length,1,
          "One line per checkpoint: "+check.label);
      }
    }
    assert.ok(lines.some(x=>x.text==="[X] Phare avant gauche"));
    assert.ok(lines.some(x=>x.text==="[X] Frein de stationnement"));
    assert.ok(lines.some(x=>x.text==="[-] Phare avant droit"));
    assert.ok(lines.some(x=>x.text.includes("non cochée") && x.kind==="small"));
  });

  await test("report contains all saved vehicle fields, observations and confirmation",()=>{
    const text=printableLines(record).map(x=>x.text).join("\n");
    for(const expected of [
      "2026-11-23","09:15","Conducteur Test","PERMIS123","TEST123","184000",
      "ACC-2026","72 %","Phare gauche et frein à vérifier","À nettoyer",
      "Rayure sur porte","Propre","Tache sur siège","Trousse manquante",
      "Vérification confirmée : Oui","Signature saisie : Conducteur Test",
    ]) assert.ok(text.includes(expected), "Missing detail: "+expected);
  });

  await test("clean inspection still lists all checkpoints without claiming certified compliance",()=>{
    const clean={...record,defects:[],defectDescription:"",exteriorDamage:"",
      interiorDamage:"",missingEquipment:"",exteriorCondition:"propre",
      interiorCondition:"propre"};
    const lines=printableLines(clean);
    assert.ok(lines.some(x=>x.text==="Aucune anomalie signalée"));
    assert.equal(lines.filter(x=>x.text.startsWith("[X] ")).length,0);
    assert.equal(lines.filter(x=>x.text.startsWith("[-] ")).length,
      INSPECTION_GROUPS.reduce((sum,g)=>sum+g.checks.length,0));
    assert.ok(lines.some(x=>x.text.includes("ne constitue pas une certification")));
  });

  await test("unknown historical check keys remain visible rather than disappearing",()=>{
    const lines=printableLines({...record,defects:["legacy-unknown"]});
    assert.ok(lines.some(x=>x.text==="[X] legacy-unknown"));
    assert.ok(lines.some(x=>x.text==="AUTRES ANOMALIES ENREGISTRÉES"));
  });

  await test("history includes an expandable full checklist and a non-printing report action",()=>{
    const src=readFileSync(new URL("../components/vehicle-inspection-page.tsx",import.meta.url),"utf8");
    const receipt=readFileSync(new URL("../components/vehicle-inspection-receipt.tsx",import.meta.url),"utf8");
    const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
    assert.match(src,/setExpandedRecordId\(record\.id\)/);
    assert.match(src,/defaultOpen=\{expandedRecordId === record\.id\}/);
    assert.match(src,/Voir les détails de la fiche/);
    assert.match(src,/INSPECTION_GROUPS\.map\(\(group\) =>/);
    assert.match(src,/group\.checks\.map\(\(check\) =>/);
    assert.match(src,/Voir le rapport détaillé/);
    assert.match(src,/setReportAutoPrint\(false\); setPrintRecord\(record\)/);
    assert.match(src,/autoPrint=\{reportAutoPrint\}/);
    assert.match(receipt,/printableLines, type InspectionReceiptLine as ReceiptLine/);
    assert.match(css,/\.inspection-report-checklist \{/);
    assert.match(css,/\.inspection-report-check-group li\.flagged/);
    const parsed=ts.createSourceFile("vehicle-inspection-page.tsx",src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    assert.deepEqual(parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
  });
} finally {
  await vite.close();
}
