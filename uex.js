// Brique « données de marché UEX » (facultative, désactivée par défaut). Voir docs/uex-api.md et docs/deploiement.md.
// Le serveur interroge l'API publique d'UEX Corp (lecture seule, liste blanche), garde le résultat en mémoire et sur disque
// (UEX_CACHE_DIR, jamais dans git ni dans l'image) et le sert au navigateur sous /api/uex/*. Aucune dépendance.
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto"), zlib = require("zlib");

const ATTRIBUTION = Object.freeze({ text: "Powered by UEX", url: "https://uexcorp.space", notice: "Données communautaires, peuvent être inexactes" });
const MAX_BODY = 12 * 1024 * 1024; // corps amont refusé au-delà
const MIN = 60, HOUR = 3600, DAY = 86400;

/* Liste blanche : ressources GET publiques, sans paramètre obligatoire (sondage du 26/10/2026, voir docs/uex-api.md).
   TTL en secondes = ceux annoncés par UEX (en-tête Cache-Control : max-age) ; module = fonctionnalité prévue. */
const RESOURCES = [
  { name: "commodities_prices_all", ttl: 30 * MIN, module: "prix, routes" },
  { name: "commodities", ttl: HOUR, module: "prix, routes" },
  { name: "terminals", ttl: 12 * HOUR, module: "prix, routes, libellés" },
  { name: "star_systems", ttl: DAY, module: "libellés" },
  { name: "fuel_prices_all", ttl: 30 * MIN, module: "carburant" },
  { name: "refineries_yields", ttl: DAY, module: "raffineries" },
  { name: "refineries_methods", ttl: DAY, module: "raffineries" },
  { name: "refineries_capacities", ttl: DAY, module: "raffineries" },
  { name: "vehicles", ttl: 12 * HOUR, module: "vaisseaux" },
  { name: "vehicles_purchases_prices_all", ttl: 12 * HOUR, module: "vaisseaux" },
  { name: "vehicles_rentals_prices_all", ttl: 12 * HOUR, module: "vaisseaux" },
  { name: "game_versions", ttl: DAY, module: "version du jeu" }
];
const BY_NAME = new Map(RESOURCES.map(r => [r.name, r]));

function atomicWrite(dest, data) {
  const tmp = dest + ".tmp";
  try {
    const fd = fs.openSync(tmp, "w");
    try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, dest);
  } catch (e) { try { fs.unlinkSync(tmp); } catch (e2) {} throw e; }
}
const num = (v, def, min, max) => { const n = parseFloat(v); return isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const loopback = h => /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(h);

/* codes d'erreur : seuls ces mots courts sont journalisés, stockés et renvoyés (jamais un message brut, qui pourrait contenir l'adresse ou la clé) */
function fault(code, retryAfterS) { const e = new Error(code); e.uexCode = code; if (retryAfterS) e.retryAfterS = retryAfterS; return e; }

function create(opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const enabled = env.UEX_ENABLED === "1";
  const version = String(opts.version || "dev").replace(/[^\w.\-+]/g, "").slice(0, 30) || "dev";
  const log = opts.log || ((m) => console.log(m));
  const send = opts.send; // (res, code, body, type, extra) fourni par server.js : en-têtes de sécurité conservés
  const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), null, extra);

  if (!enabled) {
    return {
      enabled: false, resources: [], close() {}, refresh: async () => { throw fault("disabled"); },
      async handle(req, res, p) {
        if (p === "/api/uex/status") {
          if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "méthode non permise" }, { Allow: "GET, HEAD" });
          return json(res, 200, { status: "ok", enabled: false, resources: [], hint: "UEX_ENABLED=1 pour activer (voir docs/deploiement.md)" });
        }
        return json(res, 404, { error: "uex_disabled" });
      }
    };
  }

  const BASE = String(env.UEX_BASE || "https://api.uexcorp.uk/2.0").replace(/\/+$/, "");
  const MAX_PM = Math.floor(num(env.UEX_MAX_PER_MINUTE, 40, 1, 100));
  const TTL_SCALE = num(env.UEX_TTL_SCALE, 1, 1e-9, 1e6);
  const TIMEOUT = Math.floor(num(env.UEX_TIMEOUT_MS, 20000, 50, 120000));
  const WINDOW = Math.floor(num(env.UEX_WINDOW_MS, 60000, 100, 60000)); // fenêtre du limiteur (réglable pour les tests seulement)
  const BO_BASE = Math.floor(num(env.UEX_BACKOFF_BASE_MS, 30000, 1, 3600000)), BO_MAX = Math.floor(num(env.UEX_BACKOFF_MAX_MS, 3600000, 1, 86400000));
  const CACHE_DIR = env.UEX_CACHE_DIR || path.join(opts.dataDir || path.join(__dirname, "data"), "uex-cache");
  const UA = "OrbitalServices/" + version + " (+usage personnel)";
  let KEY = String(env.UEX_KEY || "").trim();
  let baseUrl = null;
  try { baseUrl = new URL(BASE); } catch (e) {}
  if (!baseUrl || !/^https?:$/.test(baseUrl.protocol)) { log("uex : UEX_BASE invalide, la brique reste inactive"); baseUrl = null; }
  // la clé n'est envoyée qu'en HTTPS (ou vers la machine locale pour les essais), sans redirection suivie
  if (KEY && baseUrl && baseUrl.protocol !== "https:" && !loopback(baseUrl.hostname)) { log("uex : UEX_KEY ignorée (UEX_BASE n'est pas en HTTPS)"); KEY = ""; }

  const state = new Map(); // nom -> { r, entry, inflight, fails, nextTry, error }
  for (const r of RESOURCES) state.set(r.name, { r, entry: null, inflight: null, fails: 0, nextTry: 0, error: null });
  let lastError = null, closed = false;
  const controllers = new Set(), timers = new Set();
  const ttlMs = r => Math.max(1, Math.round(r.ttl * 1000 * TTL_SCALE));

  /* ── cache disque : <ressource>.json = { v, resource, fetched_at, data } ── */
  function makeEntry(fetchedAt, dataJson) {
    return { fetchedAt, dataJson, size: Buffer.byteLength(dataJson), etag: '"' + crypto.createHash("sha256").update(dataJson).digest("hex").slice(0, 20) + '"' };
  }
  function loadDisk() {
    for (const [name, s] of state) {
      try {
        const f = path.join(CACHE_DIR, name + ".json");
        const st = fs.statSync(f);
        if (!st.isFile() || st.size > MAX_BODY + 4096) continue;
        const o = JSON.parse(fs.readFileSync(f, "utf8"));
        if (!o || o.v !== 1 || o.resource !== name || typeof o.fetched_at !== "number" || !isFinite(o.fetched_at) || !o.data || typeof o.data !== "object") continue;
        s.entry = makeEntry(Math.min(o.fetched_at, Date.now()), JSON.stringify(o.data));
      } catch (e) { /* absent ou illisible : on repart de rien pour cette ressource */ }
    }
  }
  function saveDisk(name, entry) {
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      atomicWrite(path.join(CACHE_DIR, name + ".json"), '{"v":1,"resource":' + JSON.stringify(name) + ',"fetched_at":' + entry.fetchedAt + ',"data":' + entry.dataJson + "}");
    } catch (e) { log("uex : écriture du cache impossible (" + (e && e.code || "erreur") + ")"); }
  }
  if (baseUrl) loadDisk();

  /* ── limiteur global : au plus MAX_PM départs par fenêtre, 3 appels simultanés, file d'attente ── */
  const queue = [], stamps = [];
  let active = 0, pumpTimer = null;
  function pump() {
    if (pumpTimer) { clearTimeout(pumpTimer); timers.delete(pumpTimer); pumpTimer = null; }
    const now = Date.now();
    while (stamps.length && now - stamps[0] >= WINDOW) stamps.shift();
    while (queue.length && !closed) {
      if (active >= 3) return; // reprise à la fin d'un appel
      if (stamps.length >= MAX_PM) {
        pumpTimer = setTimeout(pump, Math.max(5, stamps[0] + WINDOW - now)); pumpTimer.unref(); timers.add(pumpTimer);
        return;
      }
      const t = queue.shift();
      stamps.push(now); active++;
      t.run().then(t.ok, t.ko).then(() => { active--; pump(); });
    }
  }
  const schedule = run => new Promise((ok, ko) => { queue.push({ run, ok, ko }); pump(); });

  /* ── appel amont : une requête GET, sans paramètre, avec délai, taille bornée, sans redirection ── */
  async function fetchUpstream(name) {
    if (closed) throw fault("closed");
    const ac = new AbortController(); controllers.add(ac);
    const tm = setTimeout(() => ac.abort(), TIMEOUT); tm.unref(); timers.add(tm);
    try {
      const headers = { "User-Agent": UA, Accept: "application/json" };
      if (KEY) headers.Authorization = "Bearer " + KEY;
      let resp;
      try { resp = await fetch(BASE + "/" + name, { method: "GET", headers, signal: ac.signal, redirect: "manual" }); }
      catch (e) { throw fault(ac.signal.aborted ? (closed ? "closed" : "timeout") : "network"); }
      if (resp.status !== 200) {
        try { await resp.body.cancel(); } catch (e) {}
        const ra = parseInt(resp.headers.get("retry-after"), 10);
        throw fault(resp.status === 429 ? "rate_limited" : resp.status === 401 || resp.status === 403 ? "denied" : "http_" + (resp.status >= 300 && resp.status < 600 ? resp.status : "x"), isFinite(ra) && ra > 0 ? ra : 0);
      }
      const declared = +resp.headers.get("content-length");
      if (declared > MAX_BODY) { try { await resp.body.cancel(); } catch (e) {} throw fault("too_big"); }
      const chunks = []; let n = 0;
      try {
        const rd = resp.body.getReader();
        for (;;) {
          const { done, value } = await rd.read();
          if (done) break;
          n += value.length;
          if (n > MAX_BODY) { try { await rd.cancel(); } catch (e) {} throw fault("too_big"); }
          chunks.push(value);
        }
      } catch (e) { if (e && e.uexCode) throw e; throw fault(ac.signal.aborted ? (closed ? "closed" : "timeout") : "network"); }
      let j;
      try { j = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { throw fault("invalid_json"); }
      if (!j || typeof j !== "object" || j.status !== "ok") throw fault("upstream_status");
      if (!j.data || typeof j.data !== "object") throw fault("invalid_data");
      return JSON.stringify(j.data);
    } finally { clearTimeout(tm); timers.delete(tm); controllers.delete(ac); }
  }

  /* ── rafraîchissement d'une ressource : un seul à la fois (single-flight), backoff exponentiel après échec ── */
  function backoffLeft(s) { return Math.max(0, s.nextTry - Date.now()); }
  function refresh(name) {
    const s = state.get(name);
    if (!s) return Promise.reject(fault("unknown"));
    if (!baseUrl || closed) return Promise.reject(fault("closed"));
    if (s.inflight) return s.inflight;
    if (backoffLeft(s) > 0) return Promise.reject(fault(s.error || "backoff"));
    const p = schedule(() => fetchUpstream(name)).then(dataJson => {
      s.entry = makeEntry(Date.now(), dataJson);
      s.fails = 0; s.nextTry = 0; s.error = null;
      saveDisk(name, s.entry);
      return s.entry;
    }, e => {
      const code = e && e.uexCode || "internal";
      if (code === "closed") throw e;
      s.fails++;
      const wait = Math.min(BO_MAX, Math.max(BO_BASE * Math.pow(2, s.fails - 1), Math.min(BO_MAX, (e.retryAfterS || 0) * 1000)));
      s.nextTry = Date.now() + wait; s.error = code;
      lastError = { resource: name, code, at: new Date().toISOString() };
      log("uex : " + name + " indisponible (" + code + "), nouvel essai dans " + Math.ceil(wait / 1000) + " s");
      throw e;
    }).then(x => { s.inflight = null; return x; }, e => { s.inflight = null; throw e; });
    p.catch(() => {}); // jamais de rejet non géré quand personne n'attend (rafraîchissement en arrière-plan)
    s.inflight = p;
    return p;
  }

  /* ── réponses ── */
  const etagMatch = (req, etag) => (req.headers["if-none-match"] || "").split(",").some(t => t.trim().replace(/^W\//, "") === etag);
  async function reply(req, res, code, bodyStr, extra) {
    const h = Object.assign({ "Cache-Control": "no-cache", Vary: "Accept-Encoding" }, extra);
    let out = Buffer.from(bodyStr, "utf8");
    if (out.length > 1024 && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
      out = await new Promise((ok, ko) => zlib.gzip(out, { level: 5 }, (e, b) => (e ? ko(e) : ok(b))));
      h["Content-Encoding"] = "gzip";
    }
    send(res, code, req.method === "HEAD" ? "" : out, null, h);
  }
  function view(s) {
    const now = Date.now(), e = s.entry, r = s.r;
    const age = e ? Math.max(0, Math.floor((now - e.fetchedAt) / 1000)) : null;
    const stale = !!e && now - e.fetchedAt > ttlMs(r);
    const retry = Math.ceil(backoffLeft(s) / 1000);
    return { resource: r.name, ttl_s: Math.round(ttlMs(r) / 1000 * 1000) / 1000, fetched_at: e ? new Date(e.fetchedAt).toISOString() : null, age_s: age,
      state: e ? (stale ? "stale" : "ok") : s.error ? "error" : "absent", size: e ? e.size : 0, error: s.error, retry_in_s: retry || undefined };
  }
  function gameVersion() {
    const e = state.get("game_versions").entry;
    if (!e) return null;
    try { const d = JSON.parse(e.dataJson); return d && (typeof d.live === "string" || typeof d.ptu === "string") ? { live: String(d.live || "").slice(0, 30) || null, ptu: String(d.ptu || "").slice(0, 30) || null } : null; } catch (x) { return null; }
  }

  async function handle(req, res, p) {
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "méthode non permise" }, { Allow: "GET, HEAD" });
    const name = p.slice("/api/uex/".length);
    if (p === "/api/uex/status") {
      const body = JSON.stringify({ status: "ok", enabled: true, active: !!baseUrl, attribution: ATTRIBUTION, game_version: gameVersion(),
        resources: RESOURCES.map(r => view(state.get(r.name))), last_error: lastError, limits: { max_per_minute: MAX_PM, timeout_ms: TIMEOUT } });
      return reply(req, res, 200, body);
    }
    const s = p.startsWith("/api/uex/") ? state.get(name) : null; // Map : "__proto__", "..", "a/b" ne trouvent rien
    if (!s) return json(res, 404, { error: "uex_unknown_resource" });
    if (!baseUrl) return json(res, 503, { error: "uex_unavailable" });
    let waited = false;
    if (!s.entry) {
      waited = true;
      let to;
      const limit = new Promise((ok, ko) => { to = setTimeout(() => ko(fault("timeout")), TIMEOUT + 2000); to.unref(); });
      try { await Promise.race([refresh(name), limit]); } catch (e) {} finally { clearTimeout(to); }
      if (!s.entry) { const w = Math.ceil(backoffLeft(s) / 1000); return json(res, 503, { error: "uex_unavailable" }, w ? { "Retry-After": String(w) } : undefined); }
    }
    const e = s.entry, now = Date.now();
    const stale = !waited && now - e.fetchedAt > ttlMs(s.r);
    if (stale) refresh(name).catch(() => {}); // en arrière-plan, la réponse part tout de suite avec le contenu périmé
    if (etagMatch(req, e.etag)) return send(res, 304, "", null, { ETag: e.etag, "Cache-Control": "no-cache", Vary: "Accept-Encoding" });
    const body = '{"status":"ok","resource":' + JSON.stringify(name) + ',"fetched_at":"' + new Date(e.fetchedAt).toISOString() + '","age_s":' + Math.max(0, Math.floor((now - e.fetchedAt) / 1000)) +
      ',"stale":' + stale + ',"attribution":' + JSON.stringify(ATTRIBUTION) + ',"data":' + e.dataJson + "}";
    return reply(req, res, 200, body, { ETag: e.etag });
  }

  function close() {
    closed = true;
    for (const ac of controllers) { try { ac.abort(); } catch (e) {} }
    for (const t of timers) clearTimeout(t);
    timers.clear(); controllers.clear();
    for (const t of queue.splice(0)) t.ko(fault("closed"));
  }
  return { enabled: true, resources: RESOURCES.map(r => r.name), handle, close, refresh };
}

module.exports = create;
module.exports.RESOURCES = RESOURCES;
module.exports.ATTRIBUTION = ATTRIBUTION;
