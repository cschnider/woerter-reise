/* Aufräumen: die App ist umgezogen. Löscht den alten Offline-Speicher, meldet sich ab und lädt offene Fenster neu
   (die dann auf die neue Adresse weiterleiten). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", ev => ev.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
})()));
