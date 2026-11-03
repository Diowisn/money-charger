// Service worker minimal: cukup agar PWA dianggap valid. Tidak menyimpan cache, data selalu dari server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
