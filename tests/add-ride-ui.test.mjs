import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const formStart = page.indexOf("<form onSubmit={addTaxi}");
const formEnd = page.indexOf("</form>", formStart);
assert.ok(formStart >= 0 && formEnd > formStart, "Taxi form exists");
const form = page.slice(formStart, formEnd);

test("add taxi page separates manual entry from Téo capture import", () => {
  assert.match(page, /useState<"manual" \| "photos">\("manual"\)/);
  assert.match(form, /className="taxi-entry-modes"/);
  assert.match(form, /aria-pressed=\{taxiEntryMode === "manual"\}/);
  assert.match(form, /aria-pressed=\{taxiEntryMode === "photos"\}/);
  assert.match(form, /onClick=\{\(\) => setTaxiEntryMode\("manual"\)\}/);
  assert.match(form, /onClick=\{\(\) => setTaxiEntryMode\("photos"\)\}/);
  assert.match(form, /!editingId && taxiEntryMode === "photos"/);
  assert.match(form, /editingId \|\| taxiEntryMode === "manual"/);
  assert.match(page, /if \(course\.type === "taxi"\) setTaxiEntryMode\("manual"\)/);
});

test("capture import preserves file selection, preview, duplicate checks, and independent save", () => {
  assert.match(form, /<input\s+type="file"\s+accept="image\/\*"\s+multiple/);
  assert.match(form, /readTabletPhotos\(event\.target\.files\)/);
  assert.match(form, /photoPreviewDuplicateStatus\(item, photoCourses, courses\)/);
  assert.match(form, /className="photo-results-heading"/);
  assert.match(form, /className="photo-save-bar"/);
  assert.match(form, /onClick=\{savePhotoCourses\}/);
  assert.match(form, /className="photo-import-help"/);
  assert.match(form, /"▣  Sélectionner des captures"/);
});

test("manual entry has a reachable save button and SEV option before submitting", () => {
  const manual = form.slice(form.indexOf('className="taxi-manual-entry"'));
  assert.match(manual, /className="taxi-basics"/);
  assert.match(manual, /className="two taxi-amounts"/);
  assert.match(manual, /className="taxi-breakdown/);
  assert.match(manual, /Enregistrer la course/);
  assert.ok(manual.indexOf('className="sev-check"') < manual.indexOf('className="primary taxi-submit"'));
  assert.match(css, /\.taxi-entry-form \.taxi-submit/);
  assert.match(css, /position: sticky;/);
  assert.match(css, /\.taxi-entry-modes button:focus-visible/);
});

test("page TSX still parses after reorganizing the capture importer", () => {
  const parsed = ts.createSourceFile("page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
});
