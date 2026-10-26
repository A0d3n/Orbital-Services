// Tests de la brique « données de marché UEX » (uex.js + routes /api/uex/* de server.js), sans navigateur et sans Internet :
// un faux serveur UEX local (données inventées, aucune donnée réelle d'UEX) sert des fixtures et server.js est lancé avec UEX_BASE pointant dessus.
// Usage : node tests/uex.js
"use strict";
const { spawn } = require("child_process");
const http = require("http"), net = require("net"), zlib = require("zlib");
const fs = require("fs"), os = require("os"), path = require("path");

const ROOT = path.join(__dirname, "..");
const PKG = require(path.join(ROOT, "package.json"));
const results = [];
const check = (name, ok, extra) => { results.push(!!ok); console.log((ok ? "  ok   " : "  ÉCHEC ") + name + (ok || extra === undefined ? "" : " → " + extra)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
async function until(fn, ms) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch (e) {} if (v) return v; if (Date.now() - t0 > (ms || 4000)) return false; await sleep(25); } }
const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p));
const WHITELIST = ["commodities_prices_all", "commodities", "terminals", "star_systems", "fuel_prices_all", "refineries_yields", "refineries_methods", "refineries_capacities", "vehicles", "vehicles_purchases_prices_all", "vehicles_rentals_prices_all", "game_versions"];
const ATTR = { text: "Powered by UEX", url: "https://uexcorp.space", notice: "Données communautaires, peuvent être inexactes" };

/* ── faux serveur UEX : enregistre chaque requête, plusieurs modes de panne ── */
function fakeUpstream() {
  const u = { hits: [], mode: "ok", delay: 0, version: 1, sockets: new Set() };
  const rows = name => (name === "game_versions" ? { live: "9.9.9", ptu: "9.9.10" } : Array.from({ length: 40 }, (_, i) => ({ id: i + 1, name: "Élément " + (i + 1) + " " + name, v: u.version })));
  u.server = http.createServer((req, res) => {
    const m = /^\/2\.0\/([a-z_]+)$/.exec(req.url);
    u.hits.push({ url: req.url, name: m && m[1], ua: req.headers["user-agent"], auth: req.headers.authorization, method: req.method, t: Date.now() });
    const send = (code, obj, extra) => { res.writeHead(code, Object.assign({ "Content-Type": "application/json" }, extra)); res.end(typeof obj === "string" ? obj : JSON.stringify(obj)); };
    const go = () => {
      if (!m) return send(404, { status: "error", http_code: 404, data: null });
      switch (u.mode) {
        case "ok": return send(200, { status: "ok", http_code: 200, data: rows(m[1]), message: "" });
        case "500": return send(500, { status: "error", http_code: 500, data: null });
        case "403": return send(403, { status: "not_allowed", http_code: 403, data: null, message: "Sorry. Authentication error." });
        case "429": return send(429, { status: "error", http_code: 429 }, { "Retry-After": "1" });
        case "badjson": return send(200, '{"status":"ok","data":[{"id":1');
        case "errstatus": return send(200, { status: "missing_param", http_code: 400, data: null });
        case "hang": return; // jamais de réponse
        case "bigdecl": res.writeHead(200, { "Content-Type": "application/json", "Content-Length": String(13 * 1024 * 1024) }); return res.write("{\"status\":\"ok\"");
        case "big": {
          res.writeHead(200, { "Content-Type": "application/json" }); res.write('{"status":"ok","data":["');
          const chunk = "x".repeat(64 * 1024); let n = 0, dead = false;
          res.on("close", () => { dead = true; });
          const pump = () => { while (!dead && n < 13 * 1024 * 1024) { n += chunk.length; if (!res.write(chunk)) return res.once("drain", pump); } if (!dead) res.end('"]}'); };
          return pump();
        }
      }
    };
    if (u.delay) setTimeout(go, u.delay); else go();
  });
  u.server.on("connection", s => { u.sockets.add(s); s.on("close", () => u.sockets.delete(s)); });
  u.reset = () => { u.hits.length = 0; };
  u.count = name => u.hits.filter(h => !name || h.name === name).length;
  u.start = async () => { u.port = await freePort(); await new Promise(r => u.server.listen(u.port, "127.0.0.1", r)); u.base = "http://127.0.0.1:" + u.port + "/2.0"; };
  u.stop = () => { u.sockets.forEach(s => s.destroy()); u.server.close(); };
  return u;
}

/* ── server.js sous test ── */
const live = [];
async function start(up, env, o) {
  o = o || {};
  const port = await freePort(), data = o.data || tmp("orbital-uexsrv-"), cache = o.cache || tmp("orbital-uexcache-");
  const e = Object.assign({}, process.env);
  for (const k of Object.keys(e)) if (/^(UEX_|AUTH_)/.test(k)) delete e[k];
  Object.assign(e, { PORT: String(port), DATA_DIR: data }, { UEX_ENABLED: "1", UEX_BASE: up.base, UEX_CACHE_DIR: cache }, env);
  if (o.defaultCache) delete e.UEX_CACHE_DIR;
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: e, stdio: ["ignore", "pipe", "pipe"] });
  const s = { port, child, data, cache, out: "", code: null };
  child.stdout.on("data", c => { s.out += c; }); child.stderr.on("data", c => { s.out += c; });
  child.on("exit", c => { s.code = c; });
  live.push(s);
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch("http://127.0.0.1:" + port + "/healthz")).status) return s; } catch (x) {}
    await sleep(100);
  }
  throw new Error("le serveur ne répond pas");
}
const stop = s => new Promise(r => { if (s.code !== null) return r(); s.child.once("exit", () => r()); s.child.kill(); setTimeout(r, 2000); });
function req(port, method, p, headers) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const rq = http.request({ host: "127.0.0.1", port, method, path: p, headers: headers || {} }, res => {
      const ch = []; res.on("data", c => ch.push(c));
      res.on("end", () => {
        let buf = Buffer.concat(ch), text;
        try { if (res.headers["content-encoding"] === "gzip") buf = zlib.gunzipSync(buf); text = buf.toString("utf8"); } catch (e) { text = "(gzip invalide)"; }
        let j = null; try { j = JSON.parse(text); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: text, json: j, ms: Date.now() - t0 });
      });
    });
    rq.on("error", e => resolve({ status: 0, error: e.code || e.message, headers: {}, body: "", json: null, ms: Date.now() - t0 }));
    rq.end();
  });
}
const GZ = { "Accept-Encoding": "gzip" };
const get = (s, p, h) => req(s.port, "GET", p, h);
const statusOf = async (s, name) => { const r = await get(s, "/api/uex/status"); return name ? (r.json.resources || []).find(x => x.resource === name) : r.json; };

(async () => {
  const up = fakeUpstream(); await up.start();
  const before = fs.readdirSync(ROOT).sort().join() + "|" + fs.readdirSync(path.join(ROOT, "public")).length;
  try {
    /* ───── 1. désactivé par défaut ───── */
    {
      const cache = path.join(tmp("orbital-uexoff-"), "uex-cache");
      const port = await freePort(), data = tmp("orbital-uexoffd-");
      const e = Object.assign({}, process.env, { PORT: String(port), DATA_DIR: data, UEX_BASE: up.base, UEX_CACHE_DIR: cache });
      delete e.UEX_ENABLED; delete e.AUTH_PASSWORD;
      const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: e, stdio: "ignore" });
      const s = { port, child, code: null }; child.on("exit", c => { s.code = c; }); live.push(s);
      for (let i = 0; i < 80; i++) { try { if ((await fetch("http://127.0.0.1:" + port + "/healthz")).status) break; } catch (x) {} await sleep(100); }
      up.reset();
      const st = await get(s, "/api/uex/status");
      check("désactivé par défaut : GET /api/uex/status → 200 {enabled:false}", st.status === 200 && st.json && st.json.enabled === false, st.status + " " + st.body);
      const c1 = await get(s, "/api/uex/commodities"), c2 = await get(s, "/api/uex/terminals?x=1"), c3 = await get(s, "/api/uex/inconnu"), c4 = await get(s, "/api/uex/");
      check("désactivé : toute autre route /api/uex/* → 404 {error:\"uex_disabled\"}", [c1, c2, c3, c4].every(r => r.status === 404 && r.json && r.json.error === "uex_disabled"), [c1, c2, c3, c4].map(r => r.status + r.body).join(" "));
      check("désactivé : en-têtes de sécurité présents sur ces réponses", !!c1.headers["content-security-policy"] && c1.headers["x-content-type-options"] === "nosniff");
      await sleep(400);
      check("désactivé : aucune requête sortante", up.count() === 0, up.count());
      check("désactivé : aucun dossier créé (cache, uex-cache dans DATA_DIR)", !fs.existsSync(cache) && !fs.existsSync(path.join(data, "uex-cache")) && fs.readdirSync(data).every(f => !/uex/i.test(f)), fs.readdirSync(data).join());
      await stop(s);
    }

    /* ───── 2. liste blanche, méthodes, injection de chemin ───── */
    {
      const s = await start(up, {});
      up.reset();
      const st = await get(s, "/api/uex/status");
      check("activé : status {enabled:true} avec l'attribution exacte", st.status === 200 && st.json.enabled === true && JSON.stringify(st.json.attribution) === JSON.stringify(ATTR), st.body.slice(0, 200));
      check("status : la liste blanche contient exactement les " + WHITELIST.length + " ressources prévues, toutes « absent » au départ", st.json.resources.map(r => r.resource).join() === WHITELIST.join() && st.json.resources.every(r => r.state === "absent" && r.age_s === null && r.fetched_at === null && r.size === 0 && r.ttl_s > 0));
      const ttl = Object.fromEntries(st.json.resources.map(r => [r.resource, r.ttl_s]));
      check("TTL par défaut : prix et carburant 30 min, marchandises 1 h, terminaux et vaisseaux 12 h, systèmes et raffineries 1 jour", ttl.commodities_prices_all === 1800 && ttl.fuel_prices_all === 1800 && ttl.commodities === 3600 && ttl.terminals === 43200 && ttl.vehicles === 43200 && ttl.star_systems === 86400 && ttl.refineries_yields === 86400, JSON.stringify(ttl));
      check("status : limites exposées (40 par minute, délai 20 s par défaut), pas de clé", st.json.limits && st.json.limits.max_per_minute === 40 && st.json.limits.timeout_ms === 20000 && !/key|bearer/i.test(st.body), JSON.stringify(st.json.limits));
      check("status n'appelle jamais l'amont", up.count() === 0, up.count());
      const bad = ["/api/uex/planets", "/api/uex/commodities_routes", "/api/uex/commodities_averages", "/api/uex/space_stations", "/api/uex/inconnu", "/api/uex/__proto__", "/api/uex/constructor", "/api/uex/commodities/", "/api/uex/commodities/x",
        "/api/uex/..", "/api/uex/../server.js", "/api/uex/%2e%2e%2fserver.js", "/api/uex/..%2f..%2fserver.js", "/api/uex/commodities%00", "/api/uex/COMMODITIES", "/api/uex/%2e%2e%5cserver.js", "/api/uex/status/x", "/api/uex"];
      const rs = [];
      for (const p of bad) rs.push([p, await get(s, p)]);
      check("ressource hors liste blanche ou chemin piégé (" + bad.length + " cas) : jamais 200, jamais de contenu de fichier", rs.every(([p, r]) => r.status !== 200 && !/require\(|createServer/.test(r.body)), rs.filter(([p, r]) => r.status === 200).map(x => x[0]).join());
      check("ressource inconnue → 404 {error:\"uex_unknown_resource\"}", (await get(s, "/api/uex/planets")).json.error === "uex_unknown_resource");
      check("aucune requête sortante pour toutes ces tentatives", up.count() === 0, up.hits.map(h => h.url).join());
      const q = await get(s, "/api/uex/commodities?id_commodity=5&foo=../bar&x=%00");
      check("query string ignorée : l'amont reçoit /2.0/commodities sans paramètre", q.status === 200 && up.hits.length === 1 && up.hits[0].url === "/2.0/commodities", up.hits.map(h => h.url).join());
      for (const m of ["POST", "PUT", "DELETE", "PATCH"]) {
        const r = await req(s.port, m, "/api/uex/commodities");
        if (r.status !== 405) check("méthode " + m + " refusée (405)", false, r.status);
      }
      const rp = await req(s.port, "POST", "/api/uex/commodities"), rps = await req(s.port, "POST", "/api/uex/status");
      check("POST / PUT / DELETE / PATCH → 405 avec Allow, y compris sur status", rp.status === 405 && /GET/.test(rp.headers.allow) && rps.status === 405 && up.count() === 1, rp.status + " " + rps.status);
      const hd = await req(s.port, "HEAD", "/api/uex/commodities");
      check("HEAD accepté, sans corps, sans nouvelle requête amont", hd.status === 200 && hd.body === "" && up.count() === 1, hd.status);
      await stop(s);
    }

    /* ───── 3. cache : 1 appel puis 0, forme de la réponse, en-têtes, ETag/304 ───── */
    {
      const s = await start(up, {});
      up.reset();
      const r1 = await get(s, "/api/uex/commodities", GZ);
      check("1er appel : 200 et une seule requête amont", r1.status === 200 && up.count("commodities") === 1, r1.status + " " + up.count());
      const j = r1.json;
      check("réponse : {status, resource, fetched_at (ISO), age_s, stale:false, attribution, data}", j && j.status === "ok" && j.resource === "commodities" && !isNaN(Date.parse(j.fetched_at)) && /Z$/.test(j.fetched_at) && Number.isInteger(j.age_s) && j.stale === false && JSON.stringify(j.attribution) === JSON.stringify(ATTR) && Array.isArray(j.data) && j.data.length === 40 && j.data[0].name.includes("Élément 1"), r1.body.slice(0, 200));
      check("réponse en gzip (Content-Encoding, Vary), type JSON, no-cache", r1.headers["content-encoding"] === "gzip" && /Accept-Encoding/i.test(r1.headers.vary || "") && /application\/json/.test(r1.headers["content-type"]) && r1.headers["cache-control"] === "no-cache", JSON.stringify(r1.headers));
      check("en-têtes de sécurité conservés (CSP, nosniff, CORP, Referrer-Policy, X-Frame-Options), aucun CORS", !!r1.headers["content-security-policy"] && r1.headers["x-content-type-options"] === "nosniff" && r1.headers["cross-origin-resource-policy"] === "same-origin" && r1.headers["referrer-policy"] === "no-referrer" && !!r1.headers["x-frame-options"] && !Object.keys(r1.headers).some(k => /^access-control-/.test(k)));
      const plain = await get(s, "/api/uex/commodities");
      check("sans Accept-Encoding gzip : réponse non compressée", plain.status === 200 && !plain.headers["content-encoding"] && plain.json.data.length === 40);
      const u1 = up.hits[0];
      check("User-Agent honnête « OrbitalServices/<version> (+usage personnel) » vers l'amont", u1.ua === "OrbitalServices/" + PKG.version + " (+usage personnel)", u1.ua);
      check("GET sans en-tête Authorization quand UEX_KEY est absent", up.hits.every(h => h.auth === undefined && h.method === "GET"));
      await get(s, "/api/uex/commodities"); await get(s, "/api/uex/commodities", GZ);
      check("2e et 3e appels : servis par le cache, 0 requête amont de plus", up.count("commodities") === 1, up.count());
      const etag = r1.headers.etag;
      check("ETag présent (hachage de la version en cache), identique avec ou sans gzip", /^"[0-9a-f]{20}"$/.test(etag || "") && plain.headers.etag === etag, etag);
      const n304 = await get(s, "/api/uex/commodities", { "If-None-Match": etag });
      check("If-None-Match identique → 304 sans corps, ETag renvoyé, en-têtes de sécurité", n304.status === 304 && n304.body === "" && n304.headers.etag === etag && !!n304.headers["content-security-policy"], n304.status);
      check("If-None-Match faible (W/) ou en liste accepté ; différent → 200", (await get(s, "/api/uex/commodities", { "If-None-Match": 'W/' + etag })).status === 304 && (await get(s, "/api/uex/commodities", { "If-None-Match": '"autre", ' + etag })).status === 304 && (await get(s, "/api/uex/commodities", { "If-None-Match": '"autre"' })).status === 200);
      check("le 304 n'a pas déclenché d'appel amont", up.count("commodities") === 1);
      const st = await statusOf(s, "commodities");
      check("status après récupération : état ok, taille > 0, âge et date renseignés", st.state === "ok" && st.size > 500 && st.age_s >= 0 && st.age_s < 5 && !isNaN(Date.parse(st.fetched_at)) && st.error === null, JSON.stringify(st));
      const gv = await get(s, "/api/uex/game_versions");
      check("game_versions (objet) : servie telle quelle, et la version du jeu apparaît dans status", gv.status === 200 && gv.json.data.live === "9.9.9" && (await statusOf(s)).game_version.live === "9.9.9" && (await statusOf(s)).game_version.ptu === "9.9.10");
      const all = [];
      for (const n of WHITELIST) all.push((await get(s, "/api/uex/" + n)).status);
      check("les " + WHITELIST.length + " ressources de la liste blanche répondent 200", all.every(c => c === 200), all.join());
      check("une requête amont par ressource, sans paramètre", up.hits.length === WHITELIST.length && up.hits.every(h => /^\/2\.0\/[a-z_]+$/.test(h.url)), up.hits.length);
      await stop(s);
    }

    /* ───── 4. TTL : périmé → stale:true immédiat + rafraîchissement en arrière-plan ───── */
    {
      const s = await start(up, { UEX_TTL_SCALE: "0.0002" }); // commodities : 3600 s × 0,0002 = 0,72 s
      up.reset(); up.version = 1; up.delay = 0;
      const a = await get(s, "/api/uex/commodities");
      const e1 = a.headers.etag;
      check("TTL : 1er appel frais (stale:false, version 1)", a.json.stale === false && a.json.data[0].v === 1);
      check("status : ttl_s mis à l'échelle (UEX_TTL_SCALE)", (await statusOf(s, "commodities")).ttl_s === 0.72, (await statusOf(s, "commodities")).ttl_s);
      await sleep(900);
      check("status : état « stale » une fois le TTL dépassé (sans appel amont)", (await statusOf(s, "commodities")).state === "stale" && up.count() === 1);
      up.version = 2; up.delay = 400;
      const t0 = Date.now();
      const b = await get(s, "/api/uex/commodities");
      check("périmé : réponse immédiate (moins de 250 ms) avec stale:true et l'ancien contenu", b.status === 200 && b.json.stale === true && b.json.data[0].v === 1 && b.ms < 250 && b.json.age_s >= 0, b.ms + " ms " + b.body.slice(0, 120));
      check("périmé : le rafraîchissement part en arrière-plan (2e requête amont)", await until(() => up.count() === 2, 1500), up.count());
      const c = await get(s, "/api/uex/commodities");
      check("pendant le rafraîchissement : toujours stale:true, pas de 3e requête (single-flight)", c.json.stale === true && c.json.data[0].v === 1 && up.count() === 2, up.count());
      check("après le rafraîchissement : stale:false, nouveau contenu, nouvel ETag", await until(async () => (await statusOf(s, "commodities")).state === "ok", 2000));
      const d = await get(s, "/api/uex/commodities");
      check("contenu v2 servi frais, ETag changé, ancien ETag → 200 (plus 304)", d.json.stale === false && d.json.data[0].v === 2 && d.headers.etag !== e1 && (await get(s, "/api/uex/commodities", { "If-None-Match": e1 })).status === 200 && up.count() === 2, d.json.stale + " " + d.headers.etag);
      up.delay = 0; up.version = 1;
      await stop(s);
    }

    /* ───── 5. single-flight : 20 requêtes parallèles = 1 requête amont ───── */
    {
      const s = await start(up, {});
      up.reset(); up.delay = 300;
      const rs = await Promise.all(Array.from({ length: 20 }, () => get(s, "/api/uex/terminals", GZ)));
      check("20 requêtes parallèles sans cache : une seule requête amont, 20 réponses 200 identiques", up.count("terminals") === 1 && rs.every(r => r.status === 200 && r.headers.etag === rs[0].headers.etag && r.json.data.length === 40), up.count() + " " + rs.map(r => r.status).join());
      up.delay = 0; up.reset();
      await stop(s);
      const s2 = await start(up, { UEX_TTL_SCALE: "0.00001" }); // tout est périmé presque tout de suite
      up.reset(); await get(s2, "/api/uex/terminals"); up.reset(); up.delay = 300; await sleep(600);
      const rs2 = await Promise.all(Array.from({ length: 20 }, () => get(s2, "/api/uex/terminals")));
      await sleep(500);
      check("20 requêtes parallèles sur cache périmé : réponses immédiates stale, un seul rafraîchissement", rs2.every(r => r.status === 200 && r.json.stale === true) && up.count("terminals") === 1, up.count() + " " + rs2.map(r => r.json && r.json.stale).join());
      up.delay = 0;
      await stop(s2);
    }

    /* ───── 6. échecs amont : cache conservé, 503 sans cache, backoff ───── */
    const MODES = [["500", "http_500"], ["badjson", "invalid_json"], ["errstatus", "upstream_status"], ["403", "denied"], ["429", "rate_limited"], ["big", "too_big"], ["bigdecl", "too_big"], ["hang", "timeout"]];
    for (const [mode, code] of MODES) {
      up.mode = "ok"; up.reset();
      const s = await start(up, { UEX_TTL_SCALE: "0.0001", UEX_TIMEOUT_MS: "300", UEX_BACKOFF_BASE_MS: "100000" }, {});
      // sans cache : 503
      up.mode = mode;
      const t0 = Date.now();
      const r0 = await get(s, "/api/uex/vehicles");
      check("échec amont « " + mode + " », sans cache : 503 {error:\"uex_unavailable\"} sans détail (en " + (Date.now() - t0) + " ms)", r0.status === 503 && JSON.stringify(r0.json) === '{"error":"uex_unavailable"}' && !/127\.0\.0\.1|2\.0|http_|token/i.test(r0.body) && Date.now() - t0 < 2500, r0.status + " " + r0.body);
      const hits0 = up.count();
      const r0b = await get(s, "/api/uex/vehicles");
      check("« " + mode + " » : backoff respecté (nouvel appel immédiat → 503 sans requête amont) et Retry-After indiqué", r0b.status === 503 && up.count() === hits0 && +r0b.headers["retry-after"] > 0, up.count() + "/" + hits0 + " " + r0b.headers["retry-after"]);
      const st0 = await statusOf(s);
      const sv = st0.resources.find(r => r.resource === "vehicles"), le = st0.last_error;
      check("« " + mode + " » : status → état « error », code « " + code + " », dernière erreur sans détail", sv.state === "error" && sv.error === code && le && le.resource === "vehicles" && le.code === code && !isNaN(Date.parse(le.at)) && Object.keys(le).sort().join() === "at,code,resource" && sv.retry_in_s > 0, JSON.stringify(sv) + JSON.stringify(le));
      await stop(s);
    }
    {
      // échecs avec cache existant, pour chaque mode : le contenu reste servi (stale:true), jamais de 503
      for (const [mode, code] of MODES) {
        up.mode = "ok"; up.reset();
        const s = await start(up, { UEX_TTL_SCALE: "0.0002", UEX_TIMEOUT_MS: "300", UEX_BACKOFF_BASE_MS: "100000" });
        const ok = await get(s, "/api/uex/fuel_prices_all"); // 1800 × 0,0002 = 0,36 s
        await sleep(500);
        up.mode = mode;
        const r1 = await get(s, "/api/uex/fuel_prices_all");
        const failed = await until(async () => (await statusOf(s, "fuel_prices_all")).error === code, 3000);
        const hits = up.count();
        const r2 = await get(s, "/api/uex/fuel_prices_all"), r3 = await get(s, "/api/uex/fuel_prices_all");
        const st = await statusOf(s, "fuel_prices_all");
        check("échec amont « " + mode + " » avec cache : ancien contenu conservé (stale:true, 200), code « " + code + " », aucun nouvel appel pendant le backoff", ok.status === 200 && r1.status === 200 && r1.json.stale === true && r1.json.data[0].v === 1 && failed && r2.status === 200 && r3.status === 200 && r3.json.data.length === 40 && r3.json.fetched_at === ok.json.fetched_at && up.count() === hits && st.state === "stale" && st.error === code, [ok.status, r1.status, failed, r2.status, up.count(), hits, st.state, st.error].join(" "));
        await stop(s);
      }
    }
    up.mode = "ok";
    {
      // backoff exponentiel : 150 ms, puis 300 ms, puis un succès remet le compteur à zéro
      up.reset();
      const s = await start(up, { UEX_TTL_SCALE: "0.0001", UEX_BACKOFF_BASE_MS: "150", UEX_BACKOFF_MAX_MS: "400" });
      up.mode = "500";
      const a = await get(s, "/api/uex/fuel_prices_all");
      await sleep(40);
      const a2 = await get(s, "/api/uex/fuel_prices_all");
      check("backoff : 1er échec → 503, retry avant 150 ms → 503 sans appel", a.status === 503 && a2.status === 503 && up.count() === 1, up.count());
      await sleep(250);
      const b = await get(s, "/api/uex/fuel_prices_all");
      check("backoff écoulé : un nouvel essai part (2e requête amont)", b.status === 503 && up.count() === 2, up.count() + " " + b.status);
      const rin = (await statusOf(s, "fuel_prices_all")).retry_in_s;
      check("2e échec : attente doublée (300 ms), plafonnée par UEX_BACKOFF_MAX_MS", rin >= 0 && rin <= 1, rin);
      await sleep(450); up.mode = "ok";
      const c = await get(s, "/api/uex/fuel_prices_all");
      check("amont rétabli : récupération réussie, erreur effacée", c.status === 200 && up.count() === 3 && (await statusOf(s, "fuel_prices_all")).error === null && (await statusOf(s)).resources.find(r => r.resource === "fuel_prices_all").state === "ok");
      await stop(s);
    }
    up.mode = "ok";

    /* ───── 7. limiteur global avec file d'attente ───── */
    {
      up.reset();
      const s = await start(up, { UEX_MAX_PER_MINUTE: "2", UEX_WINDOW_MS: "1500" });
      const names = ["commodities", "terminals", "star_systems", "vehicles", "refineries_methods"];
      const t0 = Date.now();
      const rs = await Promise.all(names.map(n => get(s, "/api/uex/" + n)));
      const ts = up.hits.map(h => h.t).sort((a, b) => a - b);
      let worst = 1e9; for (let i = 0; i + 2 < ts.length; i++) worst = Math.min(worst, ts[i + 2] - ts[i]);
      check("limiteur : 5 ressources demandées d'un coup avec 2 appels par fenêtre → toutes servies (file d'attente)", rs.every(r => r.status === 200) && up.count() === 5, rs.map(r => r.status).join());
      check("limiteur : jamais plus de 2 départs dans une même fenêtre de 1,5 s", worst >= 1400, "écart minimal entre le 1er et le 3e départ : " + worst + " ms");
      check("limiteur : la file a bien attendu (le total dépasse une fenêtre)", Date.now() - t0 >= 2800, Date.now() - t0);
      await stop(s);
      const s2 = await start(up, { UEX_MAX_PER_MINUTE: "500" }), s3 = await start(up, { UEX_MAX_PER_MINUTE: "abc" }), s4 = await start(up, { UEX_MAX_PER_MINUTE: "0" });
      check("UEX_MAX_PER_MINUTE : plafonné à 100, valeur invalide → 40, minimum 1", (await statusOf(s2)).limits.max_per_minute === 100 && (await statusOf(s3)).limits.max_per_minute === 40 && (await statusOf(s4)).limits.max_per_minute === 1);
      await stop(s2); await stop(s3); await stop(s4);
    }

    /* ───── 8. persistance disque : redémarrage = cache rechargé sans appel amont ───── */
    {
      const cache = tmp("orbital-uexpersist-");
      up.reset();
      const s1 = await start(up, {}, { cache });
      const a = await get(s1, "/api/uex/commodities_prices_all"), b = await get(s1, "/api/uex/terminals");
      const files = fs.readdirSync(cache).sort();
      check("cache disque : <ressource>.json écrit pour chaque ressource récupérée, aucun .tmp restant", files.join() === "commodities_prices_all.json,terminals.json", files.join());
      const f = JSON.parse(fs.readFileSync(path.join(cache, "terminals.json"), "utf8"));
      check("fichier de cache : { v:1, resource, fetched_at, data } sans clé ni adresse amont", f.v === 1 && f.resource === "terminals" && typeof f.fetched_at === "number" && f.data.length === 40 && !/127\.0\.0\.1/.test(JSON.stringify(f)));
      await stop(s1);
      fs.writeFileSync(path.join(cache, "star_systems.json"), "{ceci n'est pas du json");
      fs.writeFileSync(path.join(cache, "vehicles.json"), JSON.stringify({ v: 1, resource: "autre", fetched_at: Date.now(), data: [1] }));
      fs.writeFileSync(path.join(cache, "fuel_prices_all.json.tmp"), "reste d'une écriture interrompue");
      up.reset();
      const s2 = await start(up, {}, { cache });
      await sleep(1200);
      check("redémarrage : aucune récupération tant qu'aucun client ne demande (pas de préchauffage)", up.count() === 0, up.count());
      const st = await statusOf(s2);
      const by = Object.fromEntries(st.resources.map(r => [r.resource, r]));
      check("redémarrage : cache valide rechargé (état ok, même date), fichiers corrompus ou d'une autre ressource ignorés", by.commodities_prices_all.state === "ok" && by.terminals.state === "ok" && by.terminals.fetched_at === (await statusOf(s2, "terminals")).fetched_at && by.terminals.fetched_at === new Date(f.fetched_at).toISOString() && by.star_systems.state === "absent" && by.vehicles.state === "absent" && by.fuel_prices_all.state === "absent", JSON.stringify(by.terminals) + by.star_systems.state + by.vehicles.state);
      const c = await get(s2, "/api/uex/commodities_prices_all", GZ), d = await get(s2, "/api/uex/terminals");
      check("redémarrage : les ressources rechargées sont servies sans appel amont, même ETag qu'avant", c.status === 200 && d.status === 200 && c.json.stale === false && c.headers.etag === a.headers.etag && d.headers.etag === b.headers.etag && up.count() === 0, up.count() + " " + c.headers.etag + " " + a.headers.etag);
      check("redémarrage : age_s tient compte du temps écoulé", c.json.age_s >= 1, c.json.age_s);
      await get(s2, "/api/uex/star_systems");
      check("ressource au fichier corrompu : récupérée normalement à la demande et fichier réparé", up.count() === 1 && JSON.parse(fs.readFileSync(path.join(cache, "star_systems.json"), "utf8")).resource === "star_systems");
      await stop(s2);
    }

    /* ───── 9. aucune écriture hors UEX_CACHE_DIR, ni dans les sauvegardes ───── */
    {
      const data = tmp("orbital-uexdata-"), cache = tmp("orbital-uexcache2-");
      up.reset();
      const s = await start(up, { BACKUP_INTERVAL_MS: "100" }, { data, cache });
      await fetch("http://127.0.0.1:" + s.port + "/api/entries/e1", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "essai" }) });
      for (const n of WHITELIST) await get(s, "/api/uex/" + n);
      await sleep(600);
      const inData = fs.readdirSync(data).sort();
      const back = fs.existsSync(path.join(data, "backups")) ? fs.readdirSync(path.join(data, "backups")) : [];
      check("DATA_DIR ne contient que le carnet et ses sauvegardes quand UEX_CACHE_DIR est ailleurs (aucune écriture UEX hors du dossier de cache)", inData.every(f => /^(entries\.json|backups)$/.test(f)), inData.join());
      check("sauvegardes du carnet : seulement entries-AAAA-MM-JJ.json (aucun fichier UEX)", back.length > 0 && back.every(f => /^entries-\d{4}-\d{2}-\d{2}\.json$/.test(f)) && !JSON.stringify(back).includes("uex"), back.join());
      check("UEX_CACHE_DIR : un fichier par ressource de la liste blanche, rien d'autre", fs.readdirSync(cache).sort().join() === WHITELIST.map(n => n + ".json").sort().join(), fs.readdirSync(cache).join());
      await stop(s);
      const data2 = tmp("orbital-uexdata2-");
      const s2 = await start(up, {}, { data: data2, defaultCache: true });
      await get(s2, "/api/uex/commodities");
      check("sans UEX_CACHE_DIR : le cache va dans DATA_DIR/uex-cache", fs.existsSync(path.join(data2, "uex-cache", "commodities.json")));
      await stop(s2);
      const after = fs.readdirSync(ROOT).sort().join() + "|" + fs.readdirSync(path.join(ROOT, "public")).length;
      check("aucun fichier créé dans le dépôt (racine et public/) pendant les tests", after === before, before + " → " + after);
      const ign = fs.readFileSync(path.join(ROOT, ".dockerignore"), "utf8") + fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
      check("cache absent du dépôt et de l'image : .dockerignore et .gitignore excluent data/ ; le Dockerfile ne copie que server.js, uex.js, package.json et public", /^data$/m.test(ign.split("\n").slice(0, 8).join("\n")) && /COPY server\.js uex\.js package\.json \.\/\r?\n/.test(fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8")) && !/uex-cache|COPY \. /.test(fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8")));
    }

    /* ───── 10. clé UEX_KEY : Bearer vers l'amont, jamais ailleurs ───── */
    {
      const KEY = "sk_test_SECRET_9f8e7d6c5b4a";
      up.reset(); up.mode = "ok";
      const s = await start(up, { UEX_KEY: KEY, UEX_TTL_SCALE: "0.0001", UEX_BACKOFF_BASE_MS: "50" });
      const seen = [];
      const grab = async (p, h) => { const r = await get(s, p, h); seen.push(r.status + JSON.stringify(r.headers) + r.body); return r; };
      for (const n of WHITELIST) await grab("/api/uex/" + n, GZ);
      await grab("/api/uex/status"); await grab("/api/uex/inconnu"); await grab("/api/uex/commodities?key=" + KEY); await grab("/api/uex/commodities", { Authorization: "Bearer " + KEY });
      up.mode = "500"; await sleep(300);
      for (const m of ["500", "hang", "badjson", "errstatus", "403", "429"]) {
        up.mode = m; await grab("/api/uex/terminals"); await grab("/api/uex/vehicles"); await sleep(120);
      }
      await grab("/api/uex/status"); await grab("/api/uex/fuel_prices_all");
      check("UEX_KEY envoyée en « Authorization: Bearer <clé> » à l'amont", up.hits.length >= 12 && up.hits.every(h => h.auth === "Bearer " + KEY), up.hits.map(h => h.auth).filter((v, i, a) => a.indexOf(v) === i).join());
      check("la clé est absente de TOUTES les réponses et en-têtes (ressources, status, erreurs 503/404, " + seen.length + " réponses)", seen.length > 20 && seen.every(t => !t.includes(KEY) && !/9f8e7d6c|SECRET/.test(t)), seen.findIndex(t => t.includes(KEY)));
      await sleep(200);
      check("la clé est absente des journaux du serveur (et des échecs y sont consignés en une ligne courte)", !s.out.includes(KEY) && !/SECRET/.test(s.out) && /uex : .* indisponible \(/.test(s.out) && s.out.split("\n").filter(l => /uex :/.test(l)).every(l => l.length < 160), s.out.slice(-400));
      await stop(s);
      up.mode = "ok"; up.reset();
      const s2 = await start(up, { UEX_KEY: KEY, UEX_BASE: "http://exemple.invalid/2.0" });
      const r = await get(s2, "/api/uex/commodities");
      check("clé jamais envoyée en clair vers une adresse non locale en http (ignorée, avertissement sans la clé)", r.status === 503 && !s2.out.includes(KEY) && /UEX_KEY ignorée/.test(s2.out), s2.out.slice(-300));
      await stop(s2);
    }

    /* ───── 11. authentification Basic ───── */
    {
      up.reset();
      const s = await start(up, { AUTH_PASSWORD: "secret" });
      const basic = pw => ({ Authorization: "Basic " + Buffer.from("orbital:" + pw).toString("base64") });
      const r1 = await get(s, "/api/uex/status"), r2 = await get(s, "/api/uex/commodities"), r3 = await get(s, "/api/uex/commodities", basic("faux"));
      check("AUTH_PASSWORD : /api/uex/* sans identifiants ou avec un mauvais mot de passe → 401, aucun appel amont", r1.status === 401 && r2.status === 401 && r3.status === 401 && !!r1.headers["www-authenticate"] && up.count() === 0, [r1.status, r2.status, r3.status, up.count()].join());
      const r4 = await get(s, "/api/uex/commodities", basic("secret")), r5 = await get(s, "/api/uex/status", basic("secret"));
      check("AUTH_PASSWORD : bon mot de passe → 200 (ressource et status)", r4.status === 200 && r4.json.data.length === 40 && r5.json.enabled === true, r4.status + " " + r5.status);
      check("/healthz reste libre", (await get(s, "/healthz")).status === 200);
      await stop(s);
    }

    /* ───── 12. arrêt propre ───── */
    {
      up.reset(); up.mode = "hang";
      const script = 'const create=require(process.argv[1]);const u=create({env:{UEX_ENABLED:"1",UEX_BASE:process.argv[2],UEX_CACHE_DIR:process.argv[3],UEX_TIMEOUT_MS:"60000"},send(){},log(){}});' +
        'u.refresh("commodities").catch(()=>{});setTimeout(()=>u.close(),300);';
      const t0 = Date.now();
      const code = await new Promise(r => {
        const c = spawn(process.execPath, ["-e", script, path.join(ROOT, "uex.js"), up.base, tmp("orbital-uexstop-")], { stdio: "ignore" });
        const kill = setTimeout(() => { c.kill(); r("bloqué"); }, 6000);
        c.on("exit", k => { clearTimeout(kill); r(k); });
      });
      check("arrêt propre : appel sortant en vol (amont muet) abandonné, le processus se termine seul en moins de 3 s", code === 0 && Date.now() - t0 < 3000, code + " " + (Date.now() - t0) + " ms");
      check("l'amont a bien reçu l'appel avant l'arrêt", up.count("commodities") === 1);
      if (process.platform !== "win32") {
        const s = await start(up, { UEX_TIMEOUT_MS: "60000" });
        get(s, "/api/uex/vehicles"); await sleep(300);
        const t1 = Date.now(); s.child.kill("SIGTERM"); await until(() => s.code !== null, 3000);
        check("SIGTERM avec un appel amont en vol : le serveur sort en moins de 3 s (code 0)", s.code === 0 && Date.now() - t1 < 3000, s.code);
      }
      up.mode = "ok";
    }
  } catch (e) {
    check("exécution des tests", false, e && e.stack || String(e));
  } finally {
    for (const s of live) { try { s.child.kill(); } catch (e) {} }
    up.stop();
  }
  const n = results.filter(Boolean).length;
  console.log("\n" + n + "/" + results.length + " vérifications réussies");
  process.exit(n === results.length && n > 0 ? 0 : 1);
})();
