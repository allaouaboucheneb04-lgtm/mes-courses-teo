import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import ts from "typescript";

const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");

test("Ajouter jumps to the actual form after switching pages",()=>{
  assert.match(page,/function scrollToAddSection\(\)/);
  assert.match(page,/document\.getElementById\("workspace"\)\?\.scrollIntoView\(/);
  assert.match(page,/window\.requestAnimationFrame\(\(\) => \{\s*window\.requestAnimationFrame/);
  assert.match(page,/block: "start"/);
  assert.match(css,/#workspace \{ scroll-margin-top: 16px; \}/);
});

test("Home quick action and bottom tab share the form scroll behavior",()=>{
  assert.match(page,/onAdd=\{\(\) => \{setMobilePage\("add"\);setTab\("taxi"\);setEditingId\(null\);scrollToAddSection\(\);\}\}/);
  assert.match(page,/className=\{`nav-add[\s\S]*?setMobilePage\("add"\);if\(tab === "settings" \|\| tab === "paie"\)setTab\("taxi"\);scrollToAddSection\(\);/);
  assert.match(page,/function editCourse\([\s\S]*?scrollToAddSection\(\);/);
  assert.match(page,/className="workspace" id="workspace"/);
});

test("Navigation change does not break TSX syntax",()=>{
  const parsed=ts.createSourceFile("page.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
