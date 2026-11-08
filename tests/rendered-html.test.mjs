import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

// The legacy starter checked a Cloudflare development-only preview worker.
// Mes Courses Téo is published as a Next/Vercel PWA; verify its actual metadata.
test("PWA metadata and manifest declare the Mes Courses Téo app", async()=>{
  const layout=await readFile(new URL("../app/layout.tsx",import.meta.url),"utf8");
  const manifest=JSON.parse(await readFile(new URL("../public/manifest.webmanifest",import.meta.url),"utf8"));
  assert.match(layout,/title:\s*"Mes courses Téo"/);
  assert.match(layout,/manifest\.webmanifest/);
  assert.match(layout,/appleWebApp:\s*\{\s*capable:\s*true/);
  assert.match(layout,/viewportFit:\s*"cover"/);
  assert.equal(manifest.name,"Mes courses Téo");
  assert.equal(manifest.lang,"fr-CA");
  assert.equal(manifest.display,"standalone");
  assert.ok(manifest.icons.some(icon=>icon.sizes==="192x192"));
  assert.ok(manifest.icons.some(icon=>icon.sizes==="512x512"));
});

test("service worker uses network-first navigation before cached fallback",async()=>{
  const worker=await readFile(new URL("../public/sw.js",import.meta.url),"utf8");
  assert.match(worker,/request\.mode === "navigate"/);
  assert.match(worker,/fetch\(request\)/);
  assert.match(worker,/caches\.match\(HOME\)/);
  assert.match(worker,/request\.method !== "GET"/);
});
