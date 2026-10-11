// Serveur minimal (aucune dépendance) : sert la page et stocke le carnet de bord dans un fichier JSON.
"use strict";
const http = require("http"), fs = require("fs"), path = require("path");
const PORT = +process.env.PORT || 8080;
const PUB = process.env.PUBLIC_DIR || path.join(__dirname, "public");
const DATA = process.env.DATA_DIR || path.join(__dirname, "data");
const FILE = path.join(DATA, "entries.json");
const MAX_BODY = 64 * 1024, MAX_ENTRIES = 20000;

fs.mkdirSync(DATA, { recursive: true });
let entries = {};
try { entries = JSON.parse(fs.readFileSync(FILE, "utf8")) || {}; } catch (e) { entries = {}; }
let timer = null;
function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = FILE + ".tmp";
    try { fs.writeFileSync(tmp, JSON.stringify(entries)); fs.renameSync(tmp, FILE); }
    catch (e) { console.error("écriture impossible :", e.message); }
  }, 150);
}
const MIME = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8" };
const HDR = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "SAMEORIGIN" };
const send = (res, code, body, type, extra) => {
  res.writeHead(code, Object.assign({ "Content-Type": type || "application/json; charset=utf-8", "Cache-Control": "no-store" }, HDR, extra));
  res.end(body);
};
const json = (res, code, obj) => send(res, code, JSON.stringify(obj));
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const NUM = v => (typeof v === "number" && isFinite(v) ? v : 0);
const STR = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
function clean(d) {
  return { type: STR(d.type, 20) || "other", ts: NUM(d.ts) || Date.now(), dur: Math.max(0, NUM(d.dur)), auec: NUM(d.auec),
    title: STR(d.title, 120), place: STR(d.place, 80), ship: STR(d.ship, 80), notes: STR(d.notes, 1500), src: STR(d.src, 20) || "manual" };
}
function body(req) {
  return new Promise((ok, ko) => {
    let n = 0; const ch = [];
    req.on("data", c => { n += c.length; if (n > MAX_BODY) { ko(new Error("trop gros")); req.destroy(); } else ch.push(c); });
    req.on("end", () => { try { ok(JSON.parse(Buffer.concat(ch).toString("utf8"))); } catch (e) { ko(e); } });
    req.on("error", ko);
  });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), p = decodeURIComponent(url.pathname);
  if (p === "/healthz") return json(res, 200, { ok: true, entries: Object.keys(entries).length });
  if (p === "/api/entries" && req.method === "GET")
    return json(res, 200, Object.keys(entries).map(id => Object.assign({ id }, entries[id])));
  const m = /^\/api\/entries\/([^/]+)$/.exec(p);
  if (m) {
    const id = m[1];
    if (!ID.test(id)) return json(res, 400, { error: "id invalide" });
    if (req.method === "PUT") {
      try {
        const d = await body(req);
        if (!d || typeof d !== "object" || Array.isArray(d)) return json(res, 400, { error: "objet attendu" });
        if (!entries[id] && Object.keys(entries).length >= MAX_ENTRIES) return json(res, 507, { error: "carnet plein" });
        entries[id] = clean(d); persist(); return json(res, 200, { ok: true });
      } catch (e) { return json(res, 400, { error: "corps invalide" }); }
    }
    if (req.method === "DELETE") { delete entries[id]; persist(); return json(res, 200, { ok: true }); }
    return json(res, 405, { error: "méthode non permise" });
  }
  if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "méthode non permise" });
  const name = p === "/" ? "index.html" : p.replace(/^\/+/, "");
  if (/[\\/]|\.\./.test(name)) return send(res, 404, "introuvable", "text/plain");
  const file = path.join(PUB, name);
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "introuvable", "text/plain; charset=utf-8");
    send(res, 200, req.method === "HEAD" ? "" : buf, MIME[path.extname(file)] || "application/octet-stream",
      { "Cache-Control": name === "index.html" ? "no-cache" : "public, max-age=86400" });
  });
});
const bye = () => { clearTimeout(timer); try { fs.writeFileSync(FILE, JSON.stringify(entries)); } catch (e) {} process.exit(0); };
process.on("SIGTERM", bye); process.on("SIGINT", bye);
server.listen(PORT, () => console.log("Orbital Services en écoute sur :" + PORT + " — données : " + FILE));
