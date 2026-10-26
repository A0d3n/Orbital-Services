/* Service worker : l'app s'ouvre même sans réseau (page et scripts gardés en cache). */
var VERSION = "orbital-1.33.0"; /* écrit par scripts/version.js : "orbital-" + version de package.json */
var MAX_RUNTIME = 150; /* plafond d’entrées du cache (les plus anciennes sont supprimées) */
var CORE = ["./", "style.css", "util.js", "data.js", "visuals.js", "timeline.js", "comm.js", "map.js", "carnet.js", "versions.js", "home.js", "search.js", "search.css", "route.js", "route.css", "trade.js", "trade.css", "commerce.js", "commerce.css", "terra-1000.webp", "geist-latin.woff2", "geist-latin-ext.woff2", "geist-mono-latin.woff2", "geist-mono-latin-ext.woff2", "favicon.svg", "site.webmanifest"];

/* commlinks.js (1,3 Mo) n’est volontairement pas précaché : il entre dans le cache à la première visite de l’onglet Comm-Links. */

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Réseau d'abord, cache en secours. Les appels à l'API du carnet ne sont jamais mis en cache. */
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.indexOf("/api/") === 0 || url.pathname === "/healthz") return;
  e.respondWith(fetch(req).then(function (res) {
    /* seulement les réponses 200 du même site (pas de 206, 404, redirections ni réponses opaques) */
    if (res && res.status === 200 && res.type === "basic") {
      var copy = res.clone();
      e.waitUntil(caches.open(VERSION).then(function (c) {
        return c.delete(req).then(function () { return c.put(req, copy); }).then(function () { return trim(c); });
      }).catch(function () {}));
    }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) {
      return hit || (req.mode === "navigate" ? caches.match("./") : Response.error());
    });
  }));
});

/* Plafond : au-delà de MAX_RUNTIME entrées, on supprime les plus anciennes (ordre d’insertion). */
function trim(c) {
  return c.keys().then(function (keys) {
    return Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME)).map(function (k) { return c.delete(k); }));
  });
}
