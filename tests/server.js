// Tests du serveur seul (sans navigateur, sans dépendance) : node tests/server.js
"use strict";
const { spawn } = require("child_process");
const http = require("http"), net = require("net");
const fs = require("fs"), os = require("os"), path = require("path");

const ROOT = path.join(__dirname, "..");
const results = [];
const check = (name, ok, extra) => { results.push(!!ok); console.log((ok ? "  ok   " : "  ÉCHEC ") + name + (ok || extra === undefined ? "" : " → " + extra)); };

function freePort() {
  return new Promise(r => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
}
async function startServer(env) {
  const port = await freePort();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "orbital-srv-"));
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: data }, env), stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch("http://127.0.0.1:" + port + "/healthz")).status) return { child, data, port }; } catch (e) {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("le serveur ne répond pas");
}
// requête brute (chemin non normalisé, en-têtes libres, ex. Origin)
function raw(port, method, p, headers, body) {
  return new Promise(resolve => {
    const req = http.request({ host: "127.0.0.1", port, method, path: p, headers: headers || {} }, res => {
      const ch = []; res.on("data", c => ch.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(ch).toString("utf8") }));
    });
    req.on("error", e => resolve({ status: 0, error: e.code || e.message, headers: {}, body: "" }));
    req.end(body);
  });
}
const JSONH = { "Content-Type": "application/json" };

(async () => {
  const a = await startServer({}), b = await startServer({ AUTH_PASSWORD: "secret" });
  const kids = [a.child, b.child];
  try {
    const A = a.port;
    /* A1 : octet nul */
    const nul = await raw(A, "GET", "/%00");
    check("/%00 : réponse 400/404, pas de plantage", nul.status === 400 || nul.status === 404, nul.status || nul.error);
    const hz = await raw(A, "GET", "/healthz");
    check("/healthz répond encore après /%00", hz.status === 200 && JSON.parse(hz.body).ok === true);
    check("/a%00.js (nul au milieu) : pas de plantage", [400, 404].includes((await raw(A, "GET", "/a%00.js")).status));

    /* A2 : cache */
    const r1 = await raw(A, "GET", "/index.html", { "Accept-Encoding": "gzip" });
    const etag = r1.headers.etag;
    check("ETag présent sur index.html + no-cache", r1.status === 200 && !!etag && r1.headers["cache-control"] === "no-cache", etag);
    const r2 = await raw(A, "GET", "/index.html", { "If-None-Match": etag });
    check("If-None-Match identique → 304 sans corps", r2.status === 304 && r2.body === "");
    const r3 = await raw(A, "GET", "/index.html", { "If-None-Match": '"autre"' });
    check("If-None-Match différent → 200", r3.status === 200);
    const r4 = await raw(A, "GET", "/index.html", { "Accept-Encoding": "gzip" });
    check("gzip servi de façon stable (même ETag)", r4.headers["content-encoding"] === "gzip" && r4.headers.etag === etag);

    /* A3 : API */
    const put = (id, body, h) => raw(A, "PUT", "/api/entries/" + id, Object.assign({ "Content-Length": Buffer.byteLength(body) }, h), body);
    const ok = await put("t1", JSON.stringify({ title: "essai" }), JSONH);
    check("PUT application/json → 200", ok.status === 200, ok.status);
    check("PUT application/json; charset=utf-8 accepté", (await put("t1b", "{}", { "Content-Type": "application/json; charset=utf-8" })).status === 200);
    check("PUT text/plain → 415", (await put("t2", "{}", { "Content-Type": "text/plain" })).status === 415);
    check("PUT sans Content-Type → 415", (await put("t2", "{}", {})).status === 415);
    check("PUT Origin étrangère → 403", (await put("t3", "{}", Object.assign({ Origin: "http://evil.example" }, JSONH))).status === 403);
    check("DELETE Origin étrangère → 403", (await raw(A, "DELETE", "/api/entries/t1", { Origin: "http://evil.example" })).status === 403);
    check("PUT Origin identique à Host → 200", (await put("t4", "{}", Object.assign({ Origin: "http://127.0.0.1:" + A }, JSONH))).status === 200);
    const big = await put("t5", JSON.stringify({ notes: "x".repeat(70 * 1024) }), JSONH);
    check("corps > 64 Ko → 413", big.status === 413, big.status || big.error);
    // 413 aussi sans Content-Length (transfert par morceaux)
    const chunked = await new Promise(resolve => {
      const req = http.request({ host: "127.0.0.1", port: A, method: "PUT", path: "/api/entries/t6", headers: JSONH }, res => { res.resume(); resolve(res.statusCode); });
      req.on("error", e => resolve(e.code)); req.write('{"notes":"'); req.write("x".repeat(70 * 1024)); req.end('"}');
    });
    check("corps > 64 Ko en morceaux → 413", chunked === 413, chunked);

    const before = JSON.parse((await raw(A, "GET", "/api/entries")).body);
    const proto = await put("__proto__", JSON.stringify({ title: "p", polluted: 1 }), JSONH);
    const ctor = await put("constructor", JSON.stringify({ title: "c" }), JSONH);
    const tos = await put("toString", JSON.stringify({ title: "t" }), JSONH);
    const after = JSON.parse((await raw(A, "GET", "/api/entries")).body);
    check("ids __proto__/constructor/toString acceptés comme simples ids", proto.status === 200 && ctor.status === 200 && tos.status === 200 && after.length === before.length + 3, after.length);
    check("aucune pollution de prototype", ({}).polluted === undefined && ({}).title === undefined && !("polluted" in Object.prototype));
    const get0 = JSON.parse((await raw(A, "GET", "/api/entries")).body);
    check("/api/entries : chaque id apparaît une fois", new Set(get0.map(e => e.id)).size === get0.length);
    check("DELETE __proto__ retire seulement cette entrée", (await raw(A, "DELETE", "/api/entries/__proto__")).status === 200 && JSON.parse((await raw(A, "GET", "/api/entries")).body).length === get0.length - 1);

    /* trade : validation et normalisation (entrées « cargo » seulement) */
    const getE = async id => JSON.parse((await raw(A, "GET", "/api/entries")).body).find(e => e.id === id);
    const okT = { cm: "  Marchandise A ", scu: 100, buy: 2000, sell: 2450, fees: 1500, from: "Lieu A", to: "Lieu B" };
    await put("tr1", JSON.stringify({ type: "cargo", auec: 999, title: "x", trade: okT }), JSONH);
    const e1 = await getE("tr1");
    check("trade valide : conservé, texte rogné, fees gardé", e1 && e1.trade && e1.trade.cm === "Marchandise A" && e1.trade.scu === 100 && e1.trade.fees === 1500 && e1.trade.from === "Lieu A" && e1.trade.to === "Lieu B", JSON.stringify(e1));
    check("trade valide : auec = scu×vente − scu×achat − frais (43 500), même si l'envoi disait 999", e1 && e1.auec === 43500, e1 && e1.auec);
    await put("tr2", JSON.stringify({ type: "cargo", trade: { cm: "B", scu: 10, buy: 5, sell: 3 } }), JSONH);
    const e2 = await getE("tr2");
    check("trade sans frais : fees = 0 et perte calculée (−20)", e2 && e2.trade && e2.trade.fees === 0 && e2.auec === -20, JSON.stringify(e2));
    await put("tr3", JSON.stringify({ type: "cargo", auec: 5, title: "sans trade" }), JSONH);
    const e3 = await getE("tr3");
    check("entrée sans trade : aucune clé trade, auec inchangé", e3 && !("trade" in e3) && e3.auec === 5 && e3.type === "cargo");
    const bad = {
      "scu négatif": { scu: -1, buy: 1, sell: 1 }, "scu nul": { scu: 0, buy: 1, sell: 1 }, "scu décimal": { scu: 1.5, buy: 1, sell: 1 },
      "achat négatif": { scu: 1, buy: -5, sell: 1 }, "vente négative": { scu: 1, buy: 1, sell: -5 }, "frais négatifs": { scu: 1, buy: 1, sell: 1, fees: -1 },
      "texte à la place d'un nombre": { scu: "abc", buy: 1, sell: 1 }, "nombre en chaîne": { scu: "100", buy: 1, sell: 1 },
      "scu énorme": { scu: 1e9, buy: 1, sell: 1 }, "prix énorme": { scu: 1, buy: 1e12, sell: 1 }, "frais énormes": { scu: 1, buy: 1, sell: 1, fees: 1e15 },
      "champ manquant": { scu: 5, buy: 1 }, "null": null, "tableau": [1, 2], "chaîne": "trade", "nombre": 7, "booléen": true,
      "NaN (null en JSON)": { scu: null, buy: 1, sell: 1 }
    };
    let allBad = true, why = "";
    for (const k of Object.keys(bad)) {
      const r = await put("trb", JSON.stringify({ type: "cargo", title: "garde-moi", auec: 42, trade: bad[k] }), JSONH), e = await getE("trb");
      if (r.status !== 200 || !e || "trade" in e || e.title !== "garde-moi" || e.auec !== 42) { allBad = false; why += k + " "; }
    }
    check("trade invalide (" + Object.keys(bad).length + " cas) : ignoré, l'entrée est gardée telle quelle, réponse 200", allBad, why);
    await put("trl", JSON.stringify({ type: "cargo", trade: { cm: "é".repeat(200), scu: 1e7, buy: 1e8, sell: 1e8, fees: 1e12, from: "f".repeat(200), to: "t".repeat(200) } }), JSONH);
    const el = await getE("trl");
    check("trade aux bornes maximales accepté ; textes coupés à 80", el && el.trade && el.trade.cm.length === 80 && el.trade.from.length === 80 && el.trade.to.length === 80 && el.trade.scu === 1e7 && el.auec === -1e12, JSON.stringify(el && el.auec));
    await put("trm", JSON.stringify({ type: "mining", auec: 7, trade: okT }), JSONH);
    const em = await getE("trm");
    check("trade sur une entrée qui n'est pas « cargo » : ignoré, auec envoyé conservé", em && !("trade" in em) && em.auec === 7);
    await put("trx", JSON.stringify({ type: "cargo", trade: Object.assign({ __proto__: null, extra: "x", cm: "C" }, { scu: 1, buy: 0, sell: 0 }), polluted: 1 }), JSONH);
    const ex = await getE("trx");
    check("trade : champs inconnus supprimés (seulement cm, scu, buy, sell, fees, from, to)", ex && ex.trade && Object.keys(ex.trade).sort().join(",") === "buy,cm,fees,from,scu,sell,to" && !("polluted" in ex));
    await put("tr1", JSON.stringify({ type: "cargo", title: "x" }), JSONH);
    check("réécrire une entrée de trade sans trade retire le trade (PUT remplace l'entrée)", !("trade" in (await getE("tr1"))));

    check("id invalide → 400", (await put("a%20b", "{}", JSONH)).status === 400 && (await put("a.b", "{}", JSONH)).status === 400);
    check("méthode interdite sur /api/entries/x → 405", (await raw(A, "POST", "/api/entries/t1", JSONH, "{}")).status === 405);
    check("méthode interdite sur un fichier (POST) → 405", (await raw(A, "POST", "/index.html", {}, "")).status === 405);
    check("traversée /../server.js → 404", (await raw(A, "GET", "/../server.js")).status === 404);
    check("traversée /..%2fserver.js → 404", (await raw(A, "GET", "/..%2fserver.js")).status === 404);
    check("traversée /%2e%2e/server.js → 404", (await raw(A, "GET", "/%2e%2e/server.js")).status === 404);
    check("dossier demandé (/api) → 404 sans plantage", (await raw(A, "GET", "/api")).status === 404);
    check("/healthz toujours vivant en fin de série", (await raw(A, "GET", "/healthz")).status === 200);

    /* sauvegarde du jour : créée dès qu'un entries.json existe, donc après l'arrêt propre puis redémarrage */
    await new Promise(r => setTimeout(r, 500)); // laisse passer l'écriture différée (sous Windows, SIGTERM tue sans gestionnaire)
    a.child.kill("SIGTERM");
    await new Promise(r => a.child.on("exit", r));
    const saved = JSON.parse(fs.readFileSync(path.join(a.data, "entries.json"), "utf8"));
    check("arrêt SIGTERM : entries.json écrit, sans .tmp restant", saved.t1 && !fs.existsSync(path.join(a.data, "entries.json.tmp")));
    const a2 = await startServer({ DATA_DIR: a.data }); kids.push(a2.child);
    const day = new Date().toISOString().slice(0, 10);
    check("sauvegarde du jour créée", fs.existsSync(path.join(a.data, "backups", "entries-" + day + ".json")));
    check("données relues après redémarrage", JSON.parse((await raw(a2.port, "GET", "/api/entries")).body).some(e => e.id === "t1"));

    /* A27 : en-têtes de sécurité */
    for (const p of ["/", "/api/entries", "/n-existe-pas"]) {
      const r = await raw(a2.port, "GET", p);
      const csp = r.headers["content-security-policy"] || "";
      check("CSP + Permissions-Policy sur " + p + " (" + r.status + ")", csp.includes("script-src 'self'") && csp.includes("frame-ancestors 'self'") && /camera=()/.test(r.headers["permissions-policy"] || "") && r.headers["cross-origin-resource-policy"] === "same-origin" && !r.headers["content-security-policy-report-only"], csp);
    }
    const ro = await startServer({ CSP_REPORT_ONLY: "1" }); kids.push(ro.child);
    const rr = await raw(ro.port, "GET", "/");
    check("CSP_REPORT_ONLY=1 → en-tête Report-Only, pas d'en-tête bloquant", !!rr.headers["content-security-policy-report-only"] && !rr.headers["content-security-policy"]);

    /* A28 : sauvegardes */
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orbital-bk-")), bk = path.join(dir, "backups");
    fs.mkdirSync(bk);
    for (let i = 1; i <= 20; i++) fs.writeFileSync(path.join(bk, "entries-2020-01-" + String(i).padStart(2, "0") + ".json"), "{}");
    fs.writeFileSync(path.join(dir, "entries.json"), JSON.stringify({ vieux: { title: "ancien" } }));
    const d = await startServer({ DATA_DIR: dir, KEEP_BACKUPS: "5", BACKUP_INTERVAL_MS: "300" }); kids.push(d.child);
    const todayF = path.join(bk, "entries-" + new Date().toISOString().slice(0, 10) + ".json");
    check("sauvegarde créée au démarrage (état chargé)", fs.existsSync(todayF) && !!JSON.parse(fs.readFileSync(todayF, "utf8")).vieux);
    check("rotation : 20 anciens + 1 → KEEP_BACKUPS (5) restants", fs.readdirSync(bk).filter(f => /^entries-.*.json$/.test(f)).length === 5, fs.readdirSync(bk).length);
    await raw(d.port, "PUT", "/api/entries/nouveau", { "Content-Type": "application/json", "Content-Length": 17 }, '{"title":"frais"}');
    await wait(1200);
    const bkNow = JSON.parse(fs.readFileSync(todayF, "utf8"));
    check("sauvegarde planifiée : contient la NOUVELLE entrée", bkNow.nouveau && bkNow.nouveau.title === "frais" && bkNow.vieux);
    const m1 = fs.statSync(todayF).mtimeMs;
    await wait(1000);
    check("rien de changé → fichier non réécrit (mtime identique)", fs.statSync(todayF).mtimeMs === m1);
    check("aucun .tmp résiduel (données et sauvegardes)", !fs.readdirSync(dir).concat(fs.readdirSync(bk)).some(f => f.endsWith(".tmp")));
    check("rotation toujours respectée après sauvegardes planifiées", fs.readdirSync(bk).length === 5, fs.readdirSync(bk).length);

    /* plafond MAX_ENTRIES : on ne peut pas créer 20000 entrées vite, on vérifie au moins que le compte est borné par des ids distincts */

    /* A4 : authentification */
    const B = b.port, basic = pw => ({ Authorization: "Basic " + Buffer.from("orbital:" + pw).toString("base64") });
    check("sans identifiants → 401 (non compté comme échec)", (await raw(B, "GET", "/")).status === 401 && (await raw(B, "GET", "/")).status === 401);
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await raw(B, "GET", "/", basic("mauvais" + i))).status);
    check("5 mauvais mots de passe → 401", codes.every(c => c === 401), codes.join(","));
    const lim = await raw(B, "GET", "/", basic("encore"));
    check("6e essai → 429 avec Retry-After", lim.status === 429 && +lim.headers["retry-after"] > 0 && +lim.headers["retry-after"] <= 60, lim.status + " " + lim.headers["retry-after"]);
    check("bon mot de passe bloqué pendant la pénalité", (await raw(B, "GET", "/", basic("secret"))).status === 429);
    const hb = await raw(B, "GET", "/healthz");
    check("/healthz exempté (200 même bloqué)", hb.status === 200);

    // bon mot de passe sur un serveur neuf
    const c = await startServer({ AUTH_PASSWORD: "secret" }); kids.push(c.child);
    check("bon mot de passe → 200", (await raw(c.port, "GET", "/", basic("secret"))).status === 200);
    /* données de marché UEX : désactivées par défaut (le détail est dans tests/uex.js) */
    const ux = await raw(c.port, "GET", "/api/uex/status", basic("secret")), ux2 = await raw(c.port, "GET", "/api/uex/commodities?x=1", basic("secret"));
    check("UEX désactivé par défaut : /api/uex/status → enabled:false, autres routes /api/uex/* → 404 uex_disabled", ux.status === 200 && JSON.parse(ux.body).enabled === false && ux2.status === 404 && JSON.parse(ux2.body).error === "uex_disabled", ux.body + " " + ux2.status);
    check("UEX désactivé : aucun dossier uex-cache créé dans les données", !fs.existsSync(path.join(c.data, "uex-cache")));
    check("/api/uex/* est protégé par l'authentification de base (401 sans mot de passe, 200 avec)", (await raw(c.port, "GET", "/api/uex/status")).status === 401 && (await raw(c.port, "GET", "/api/uex/status", basic("secret"))).status === 200);
  } catch (e) {
    check("exécution des tests", false, e.stack);
  } finally {
    kids.forEach(k => { try { k.kill(); } catch (e) {} });
  }
  const n = results.filter(Boolean).length;
  console.log("\n" + n + "/" + results.length + " vérifications réussies");
  process.exit(n === results.length ? 0 : 1);
})();
