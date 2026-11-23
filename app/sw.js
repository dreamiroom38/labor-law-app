/* 오프라인에서도 열리도록 화면 파일과 법령 자료를 휴대폰/PC에 저장해 둔다.
 * 인터넷이 되면 항상 새 자료를 먼저 받아오고, 안 되면 저장해 둔 것을 쓴다. */
const CACHE = "labor-law-v1";
const SHELL = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "data/index.json", "icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok && (new URL(req.url).origin === location.origin || req.url.startsWith("https://fonts."))) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match("index.html")))
  );
});
