/*
  Wörter-Reise offline: legt die App und alle Aufnahmen im Gerät ab.
  - index.html und audio/index.json: zuerst das Netz (damit neue Fassungen ankommen), sonst der Speicher.
  - MP3: zuerst der Speicher. Nach jeder neuen audio/index.json werden fehlende Aufnahmen
    nachgeladen und nicht mehr gebrauchte gelöscht.
  - Fremde Adressen (Online-Spielstand) laufen unverändert übers Netz.
  Werden Aufnahmen mit gleichem Text neu erzeugt (z. B. andere Stimme), CACHE hochzählen.
*/
const CACHE = "woerter-reise-v1";
const BASIS = new URL("./", self.location).href;
const SEITE = BASIS;                       // ./ = index.html
const VERZEICHNIS = BASIS + "audio/index.json";

self.addEventListener("install", ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll([SEITE, VERZEICHNIS]);
    await audioAbgleichen(c);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", ev => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("woerter-reise-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function audioAbgleichen(c) {
  const r = await c.match(VERZEICHNIS);
  if (!r) return;
  let j;
  try { j = await r.clone().json(); } catch (e) { return; }
  const soll = new Set(Object.values((j && j.dateien) || {}).map(f => BASIS + "audio/" + f));
  for (const req of await c.keys()) if (req.url.endsWith(".mp3") && !soll.has(req.url)) await c.delete(req);
  for (const u of soll) {
    if (await c.match(u)) continue;
    try { await c.add(u); } catch (e) { /* nächstes Mal */ }
  }
}

function mitFrist(promise, ms) {
  return Promise.race([promise, new Promise((_, nein) => setTimeout(() => nein(new Error("Frist")), ms))]);
}

self.addEventListener("fetch", ev => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(BASIS)) return;
  const pfad = url.origin + url.pathname;

  // Seite und Verzeichnis: Netz zuerst (höchstens 4 s), sonst gespeicherte Fassung
  if (req.mode === "navigate" || pfad === SEITE || pfad === BASIS + "index.html" || pfad === VERZEICHNIS) {
    const ziel = pfad === VERZEICHNIS ? VERZEICHNIS : SEITE;
    ev.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await mitFrist(fetch(req, { cache: "no-cache" }), 4000);
        if (r && r.ok) {
          await c.put(ziel, r.clone());
          if (ziel === VERZEICHNIS) ev.waitUntil(audioAbgleichen(c));
        }
        return r;
      } catch (e) {
        return (await c.match(ziel)) || Response.error();
      }
    })());
    return;
  }

  // Aufnahmen: Speicher zuerst
  if (url.pathname.endsWith(".mp3")) {
    ev.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(pfad);
      if (hit) return hit;
      const r = await fetch(req);
      if (r && r.ok && r.status === 200) c.put(pfad, r.clone());
      return r;
    })());
  }
});
