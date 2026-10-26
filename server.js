// Serveur minimal (aucune dépendance) : sert la page et stocke le carnet de bord dans un fichier JSON.
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto"), zlib = require("zlib");
const PORT = +process.env.PORT || 8080;
const PUB = process.env.PUBLIC_DIR || path.join(__dirname, "public");
const DATA = process.env.DATA_DIR || path.join(__dirname, "data");
const FILE = path.join(DATA, "entries.json");
const BACKUPS = path.join(DATA, "backups");
const KEEP_BACKUPS = Math.max(1, +process.env.KEEP_BACKUPS || 14);
const BACKUP_INTERVAL_MS = Math.max(50, +process.env.BACKUP_INTERVAL_MS || 3600000);
const CSP_HEADER = process.env.CSP_REPORT_ONLY === "1" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
const AUTH_USER_SET = !!process.env.AUTH_USER;
const AUTH_USER = process.env.AUTH_USER || "orbital";
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || "";
const MAX_BODY = 64 * 1024, MAX_ENTRIES = 20000;

/* ── vérification du dossier de la page, avec un message qui dit quoi corriger ── */
function pageStatus() {
  const index = path.join(PUB, "index.html");
  if (fs.existsSync(index)) return { ok: true };
  let found = [];
  try { found = fs.readdirSync(PUB).slice(0, 30); } catch (e) { found = null; }
  const hint = found === null
    ? "le dossier " + PUB + " n'existe pas ou n'est pas lisible"
    : "index.html est introuvable dans " + PUB + " (contenu : " + (found.join(", ") || "vide") + ")";
  return { ok: false, hint: hint + ". Attendu : " + index };
}
const startup = pageStatus();
if (!startup.ok) console.error("ATTENTION : " + startup.hint);

fs.mkdirSync(DATA, { recursive: true });
let loadedOk = false;
let entries = Object.create(null); // sans prototype : "__proto__", "constructor"... sont de simples ids
try { const o = JSON.parse(fs.readFileSync(FILE, "utf8")); if (o && typeof o === "object") for (const k of Object.keys(o)) entries[k] = o[k]; loadedOk = true; } catch (e) {}

/* ── écriture atomique : .tmp, fsync, puis rename ── */
function atomicWrite(dest, data) {
  const tmp = dest + ".tmp";
  try {
    const fd = fs.openSync(tmp, "w");
    try { fs.writeSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, dest);
  } catch (e) { try { fs.unlinkSync(tmp); } catch (e2) {} throw e; }
}

/* ── sauvegardes : au démarrage, puis toutes les BACKUP_INTERVAL_MS si les données ont changé ──
   Un seul fichier par jour (entries-AAAA-MM-JJ.json), mis à jour atomiquement ; les plus anciens sont supprimés. */
let dirty = false; // des changements n'ont pas encore été sauvegardés
function backupNow() {
  try {
    fs.mkdirSync(BACKUPS, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    atomicWrite(path.join(BACKUPS, "entries-" + day + ".json"), JSON.stringify(entries));
    dirty = false;
    const all = fs.readdirSync(BACKUPS).filter(f => /^entries-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    all.slice(0, Math.max(0, all.length - KEEP_BACKUPS)).forEach(f => { try { fs.unlinkSync(path.join(BACKUPS, f)); } catch (e) {} });
  } catch (e) { console.error("sauvegarde impossible :", e.message); }
}
if (loadedOk) backupNow(); // jamais depuis un fichier illisible : on ne remplace pas une bonne copie par du vide
else if (fs.existsSync(FILE)) console.error("ATTENTION : " + FILE + " est illisible, pas de sauvegarde au démarrage.");
const backupTimer = setInterval(() => { if (dirty) backupNow(); }, BACKUP_INTERVAL_MS);
backupTimer.unref();

let timer = null;
function writeNow() {
  try { atomicWrite(FILE, JSON.stringify(entries)); }
  catch (e) { console.error("écriture impossible :", e.message); }
}
function persist() {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(writeNow, 150);
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".ico": "image/x-icon",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8" };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://robertsspaceindustries.com https://*.robertsspaceindustries.com; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
// Pas de COOP/COEP : ils risquent de casser window.open vers RSI. CORP same-origin : toutes les ressources sont servies à la page elle-même.
const HDR = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()", "Cross-Origin-Resource-Policy": "same-origin" };
HDR[CSP_HEADER] = CSP;
const send = (res, code, body, type, extra) => {
  res.writeHead(code, Object.assign({ "Content-Type": type || "application/json; charset=utf-8", "Cache-Control": "no-store" }, HDR, extra));
  res.end(body);
};
const json = (res, code, obj) => send(res, code, JSON.stringify(obj));
/* données de marché UEX : facultatives, désactivées par défaut (UEX_ENABLED=1), cache sous DATA_DIR/uex-cache (voir uex.js) */
let VERSION = "dev";
try { VERSION = require("./package.json").version || VERSION; } catch (e) {}
const uex = require("./uex.js")({ env: process.env, dataDir: DATA, version: VERSION, send });
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const NUM = v => (typeof v === "number" && isFinite(v) ? v : 0);
const STR = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
/* trade facultatif d’une entrée « cargo » : { cm, scu, buy, sell, fees, from, to }. Entiers bornés (scu 1..10 000 000,
   prix 0..100 000 000, frais 0..10^12) ; sinon le trade est ignoré (l’entrée est gardée sans trade). Voir docs/trades/README.md. */
const INT = (v, min, max) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? (v === 0 ? 0 : v) : null);
const TXT = (v, n) => STR(v, n).trim();
function cleanTrade(t, type) {
  if (type !== "cargo" || !t || typeof t !== "object" || Array.isArray(t)) return null;
  const scu = INT(t.scu, 1, 1e7), buy = INT(t.buy, 0, 1e8), sell = INT(t.sell, 0, 1e8);
  const fees = t.fees === undefined || t.fees === null ? 0 : INT(t.fees, 0, 1e12);
  if (scu === null || buy === null || sell === null || fees === null) return null;
  return { cm: TXT(t.cm, 80), scu, buy, sell, fees, from: TXT(t.from, 80), to: TXT(t.to, 80) };
}
function clean(d) {
  const o = { type: STR(d.type, 20) || "other", ts: NUM(d.ts) || Date.now(), dur: Math.max(0, NUM(d.dur)), auec: NUM(d.auec),
    title: STR(d.title, 120), place: STR(d.place, 80), ship: STR(d.ship, 80), notes: STR(d.notes, 1500), src: STR(d.src, 20) || "manual" };
  const t = cleanTrade(d.trade, o.type);
  if (t) { o.trade = t; o.auec = t.scu * t.sell - t.scu * t.buy - t.fees; } // le gain / la perte est le net calculé
  return o;
}
function body(req) {
  return new Promise((ok, ko) => {
    let n = 0, big = false; const ch = [];
    req.on("data", c => { n += c.length; if (big) return; if (n > MAX_BODY) { big = true; ch.length = 0; const e = new Error("trop gros"); e.status = 413; ko(e); } else ch.push(c); });
    req.on("end", () => { if (big) return; try { ok(JSON.parse(Buffer.concat(ch).toString("utf8"))); } catch (e) { ko(e); } });
    req.on("error", ko);
  });
}

/* ── accès protégé (facultatif) : AUTH_PASSWORD active l'authentification de base ── */
const digest = s => crypto.createHash("sha256").update(String(s)).digest();
const WANT = digest(AUTH_USER + ":" + AUTH_PASSWORD);
function authorized(req) {
  if (!AUTH_PASSWORD) return true;
  const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || "");
  if (!m) return false;
  let given = "";
  try { given = Buffer.from(m[1], "base64").toString("utf8"); } catch (e) { return false; }
  const ok = crypto.timingSafeEqual(digest(given), WANT);
  if (!ok) fail(req.socket.remoteAddress || "?");
  return ok;
}
if (AUTH_USER_SET && !AUTH_PASSWORD) console.error("ATTENTION : AUTH_USER est défini mais AUTH_PASSWORD est vide : l'accès n'est PAS protégé.");
/* limitation des essais : 5 échecs en 1 minute pour une même IP → 429 pendant 60 s */
const FAILS = new Map(), FAIL_MAX = 5, FAIL_WINDOW = 60000, BLOCK_MS = 60000; // ip -> { n, t0, until }
setInterval(() => { const now = Date.now(); for (const [ip, f] of FAILS) if (now > f.until && now - f.t0 > FAIL_WINDOW) FAILS.delete(ip); }, 30000).unref();
const blockedFor = ip => { const f = FAILS.get(ip); return f && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; };
function fail(ip) {
  const now = Date.now(); let f = FAILS.get(ip);
  if (!f || now - f.t0 > FAIL_WINDOW) f = { n: 0, t0: now, until: 0 };
  if (++f.n >= FAIL_MAX) f.until = now + BLOCK_MS;
  FAILS.set(ip, f);
}

/* fichiers statiques : tampon + version gzip gardés en mémoire (par fichier + mtime) */
const CACHE = new Map();
async function loadFile(file) {
  const st = await fs.promises.stat(file);
  if (!st.isFile()) throw new Error("pas un fichier");
  let c = CACHE.get(file);
  if (!c || c.mtime !== st.mtimeMs || c.size !== st.size) {
    const buf = await fs.promises.readFile(file);
    c = { mtime: st.mtimeMs, size: st.size, buf, gz: null, etag: '"' + st.size.toString(16) + "-" + Math.floor(st.mtimeMs).toString(16) + '"' };
    CACHE.set(file, c);
  }
  return c;
}

async function handle(req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch (e) { return send(res, 400, "requête invalide", "text/plain; charset=utf-8"); }
  if (p.includes("\0")) return send(res, 400, "requête invalide", "text/plain; charset=utf-8");

  const page = pageStatus();
  if (p === "/healthz") return json(res, page.ok ? 200 : 503, { ok: page.ok, page: page.ok, entries: Object.keys(entries).length, auth: !!AUTH_PASSWORD, hint: page.ok ? undefined : page.hint });

  if (AUTH_PASSWORD) {
    const wait = blockedFor(req.socket.remoteAddress || "?");
    if (wait) return send(res, 429, "trop d'essais, réessayez plus tard", "text/plain; charset=utf-8", { "Retry-After": String(wait) });
  }
  if (!authorized(req)) return send(res, 401, "authentification requise", "text/plain; charset=utf-8", { "WWW-Authenticate": 'Basic realm="Orbital Services", charset="UTF-8"' });

  if (p === "/api/uex" || p.startsWith("/api/uex/")) return uex.handle(req, res, p);

  if (p === "/api/entries" && req.method === "GET")
    return json(res, 200, Object.keys(entries).map(id => Object.assign({ id }, entries[id])));
  const m = /^\/api\/entries\/([^/]+)$/.exec(p);
  if (m) {
    const id = m[1];
    if (!ID.test(id)) return json(res, 400, { error: "id invalide" });
    if (req.method === "PUT" || req.method === "DELETE") {
      const o = req.headers.origin;
      if (o !== undefined) { let h = ""; try { h = new URL(o).host; } catch (e) {} if (h !== req.headers.host) return json(res, 403, { error: "origine refusée" }); }
    }
    if (req.method === "PUT") {
      if (!/^application\/json\s*(;|$)/i.test(req.headers["content-type"] || "")) return json(res, 415, { error: "application/json requis" });
      if (+req.headers["content-length"] > MAX_BODY) return send(res, 413, JSON.stringify({ error: "corps trop gros" }), null, { Connection: "close" });
      try {
        const d = await body(req);
        if (!d || typeof d !== "object" || Array.isArray(d)) return json(res, 400, { error: "objet attendu" });
        if (!entries[id] && Object.keys(entries).length >= MAX_ENTRIES) return json(res, 507, { error: "carnet plein" });
        entries[id] = clean(d); persist(); return json(res, 200, { ok: true });
      } catch (e) {
        if (e.status === 413) return send(res, 413, JSON.stringify({ error: "corps trop gros" }), null, { Connection: "close" });
        return json(res, 400, { error: "corps invalide" });
      }
    }
    if (req.method === "DELETE") { delete entries[id]; persist(); return json(res, 200, { ok: true }); }
    return json(res, 405, { error: "méthode non permise" });
  }
  if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "méthode non permise" });
  if (!page.ok) return send(res, 503, "Orbital Services : la page est introuvable sur le serveur.\n" + page.hint + "\n", "text/plain; charset=utf-8");
  const name = p === "/" ? "index.html" : p.replace(/^\/+/, "");
  if (/[\\/]|\.\./.test(name)) return send(res, 404, "introuvable", "text/plain");
  const file = path.join(PUB, name);
  let c;
  try { c = await loadFile(file); } catch (e) { return send(res, 404, "introuvable", "text/plain; charset=utf-8"); }
  const noCache = /\.(html|css|js|webmanifest)$/.test(name);
  const extra = { "Cache-Control": noCache ? "no-cache" : "public, max-age=86400", ETag: c.etag };
  const type = MIME[path.extname(file)] || "application/octet-stream";
  const gzOk = c.buf.length > 1024 && /\.(html|css|js|svg|webmanifest)$/.test(name);
  if (gzOk) extra.Vary = "Accept-Encoding";
  if ((req.headers["if-none-match"] || "").split(",").some(t => t.trim().replace(/^W\//, "") === c.etag)) return send(res, 304, "", type, extra);
  let out = c.buf;
  if (gzOk && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
    if (!c.gz) c.gz = zlib.gzipSync(c.buf);
    out = c.gz; extra["Content-Encoding"] = "gzip";
  }
  send(res, 200, req.method === "HEAD" ? "" : out, type, extra);
}
const server = http.createServer(async (req, res) => {
  try { await handle(req, res); }
  catch (e) {
    console.error("erreur de requête :", (e && e.stack) || e);
    try { if (!res.headersSent) send(res, 500, JSON.stringify({ error: "erreur interne" })); else res.end(); } catch (e2) {}
  }
});
server.requestTimeout = 30000; server.headersTimeout = 15000; server.keepAliveTimeout = 5000;
process.on("uncaughtException", e => console.error("exception non gérée :", (e && e.stack) || e));
process.on("unhandledRejection", e => console.error("rejet non géré :", (e && e.stack) || e));
const bye = () => { uex.close(); clearTimeout(timer); writeNow(); if (dirty) backupNow(); process.exit(0); };
process.on("SIGTERM", bye); process.on("SIGINT", bye);
server.listen(PORT, () => console.log("Orbital Services en écoute sur :" + PORT + " — données : " + FILE + (AUTH_PASSWORD ? " — accès protégé" : "") + (uex.enabled ? " — données de marché UEX activées" : "")));
