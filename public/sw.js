const CACHE = "mes-courses-teo-v7";
const SHARE_CACHE = "mes-courses-teo-shared-pdf-v1";
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const HOME = `${BASE}/`;
const APP_SHELL = [
  HOME,
  `${BASE}/manifest.webmanifest`,
  `${BASE}/icons/taxi-v2-192.png`,
  `${BASE}/icons/taxi-v2-512.png`,
  `${BASE}/icons/apple-touch-icon-v2.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          fetch(url)
            .then((response) => {
              if (response.ok) return cache.put(url, response);
            })
            .catch(() => undefined),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("mes-courses-teo-") && key !== CACHE && key !== SHARE_CACHE).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.method === "POST" && url.pathname === `${BASE}/share-pay/`) {
    event.respondWith(receivePayroll(request));
    return;
  }
  if (request.method !== "GET") return;
  // Pending documents are accessed by the app through CacheStorage only.
  if (url.pathname.startsWith(`${BASE}/shared-pdf/`)) {
    event.respondWith(new Response("Not found", {status: 404}));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(HOME, copy));
          return response;
        })
        .catch(() => caches.match(HOME)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (
            response.ok &&
            ["style", "script", "image", "font"].includes(request.destination)
          ) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});

async function receivePayroll(request) {
  const redirect = (params) => Response.redirect(new URL(`${HOME}?page=pay&${params}`, self.location.origin).href, 303);
  const saved = [];
  let cache;
  try {
    const form = await request.formData();
    const files = form.getAll("payroll");
    if (!files.length || files.length > 5 || files.some(file => typeof file === "string" || !file.size || file.size > 20 * 1024 * 1024) || files.reduce((sum,file)=>sum+file.size,0) > 50 * 1024 * 1024) return redirect("share_error=files");
    for (const file of files) {
      if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name)) || !(await file.slice(0,1024).text()).includes("%PDF-")) return redirect("share_error=files");
    }
    cache = await caches.open(SHARE_CACHE);
    for (const key of await cache.keys()) {
      const entry = await cache.match(key);
      if (!entry || Date.now() - Number(entry.headers.get("X-Shared-At")) > 86400000) await cache.delete(key);
    }
    const token = crypto.randomUUID();
    for (let index=0; index<files.length; index++) {
      const file=files[index];
      const key=new URL(`${BASE}/shared-pdf/${token}-${index}`,self.location.origin).href;
      await cache.put(key,new Response(file,{headers:{"Content-Type":"application/pdf","X-File-Name":encodeURIComponent(file.name || "Fiche-Teo.pdf"),"X-Shared-At":String(Date.now())}}));
      saved.push(key);
    }
    return redirect("shared=1");
  } catch {
    if (cache) await Promise.all(saved.map(key=>cache.delete(key)));
    return redirect("share_error=storage");
  }
}
