// Tests du module Routes du Commerce (#commerce/routes) : calculs (contrôlés par une implémentation INDÉPENDANTE écrite ici), règle de stock et de demande,
// filtres un par un puis combinés, fraîcheur, légal, saisies invalides, adresse partageable, tri, « Voir plus », CSV exact, « Simuler ce trade » (tiroir prérempli,
// ajout au journal via l'API, non-régression du tiroir), états des données, mobile 390 px, requêtes /api/uex, accessibilité, CSP, performance.
// Faux serveur UEX local + données FABRIQUÉES (tests/market-fixtures.js : ROUTES_DATA, bigRoutesData) : aucun accès Internet, aucune donnée réelle d'UEX.
// Usage : node tests/routes.js   (CHROMIUM_PATH pour un Chromium déjà installé ; ROUTES_SHOTS=<dossier> pour enregistrer des captures d'écran ; ROUTES_ONLY=<regex> pour ne lancer que certaines sections)
"use strict";
const { spawn } = require("child_process");
const http = require("http"), net = require("net");
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("playwright");
const FX = require("./market-fixtures.js");

const ROOT = path.join(__dirname, "..");
const results = [];
const check = (name, ok, extra) => { results.push(!!ok); console.log((ok ? "  ok   " : "  ÉCHEC ") + name + (ok || extra === undefined ? "" : " → " + extra)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const T = s => String(s).replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p));
const J = { "Content-Type": "application/json" };
const SHOTS = process.env.ROUTES_SHOTS || "";
const COLL = new Intl.Collator("fr", { sensitivity: "accent", numeric: true });
const DEFAULT_F = { b: null, s: 100, m: "", de: "", vers: "", roi: 0, f: "24h", l: false, x: false };

/* ───────── implémentation de référence (indépendante de public/routes.js) ─────────
   Écrite à partir des lignes brutes des fixtures et des règles de docs/uex-api.md, sans réutiliser aucune fonction du site. */
function ref(data, F, nowMs) {
  F = Object.assign({}, DEFAULT_F, F);
  const nowS = Math.floor(nowMs / 1000), limit = F.f === "1h" ? 3600 : F.f === "24h" ? 86400 : Infinity, out = [];
  const tname = id => data.terminals.find(t => t.id === id), ageOf = p => (p.date_modified > 0 ? nowS - p.date_modified : null);
  for (const c of data.commodities) {
    if (F.m && c.slug !== F.m) continue;
    if (F.l && c.is_illegal) continue;
    const lines = data.commodities_prices_all.filter(p => p.id_commodity === c.id);
    for (const a of lines) {
      if (!(a.price_buy > 0)) continue; // a = ligne où le joueur ACHÈTE
      const ta = tname(a.id_terminal); if (F.de && ta.star_system_name !== F.de) continue;
      for (const z of lines) {
        if (!(z.price_sell > 0) || z.id_terminal === a.id_terminal) continue; // z = ligne où le joueur VEND
        const tz = tname(z.id_terminal); if (F.vers && tz.star_system_name !== F.vers) continue;
        const pps = z.price_sell - a.price_buy; if (pps <= 0) continue;
        if (pps / a.price_buy * 100 < F.roi - 1e-9) continue;
        const ag = [ageOf(a), ageOf(z)]; if (limit !== Infinity && ag.some(x => x === null || x > limit)) continue;
        const caps = [F.s]; let lim = "soute", stockUnknown = false, demandUnknown = false;
        if (F.b !== null) caps.push(Math.floor(F.b / a.price_buy));
        if (!F.x) {
          if (a.scu_buy > 0) caps.push(Math.floor(a.scu_buy)); else if (a.status_buy === 1) continue; else stockUnknown = true;
          if (z.scu_sell > 0) caps.push(Math.floor(z.scu_sell)); else if (z.status_sell === 7) continue; else demandUnknown = true;
        }
        const scu = Math.min.apply(null, caps); if (scu < 1) continue;
        if (!F.x && a.scu_buy > 0 && Math.floor(a.scu_buy) === scu) lim = "stock"; else if (!F.x && z.scu_sell > 0 && Math.floor(z.scu_sell) === scu) lim = "demande";
        else if (F.b !== null && Math.floor(F.b / a.price_buy) === scu) lim = "budget";
        out.push({ c: c.name, ill: !!c.is_illegal, bt: ta.name, bs: ta.star_system_name, bp: a.price_buy, st: tz.name, ss: tz.star_system_name, sp: z.price_sell, scu, lim, stockUnknown, demandUnknown,
          inv: scu * a.price_buy, rev: scu * z.price_sell, pps, tot: scu * z.price_sell - scu * a.price_buy, roi: pps / a.price_buy * 100, age: ag.some(x => x === null) ? null : Math.max(ag[0], ag[1]) });
      }
    }
  }
  out.sort((p, q) => q.tot - p.tot || COLL.compare(p.c, q.c) || COLL.compare(p.bt, q.bt) || COLL.compare(p.st, q.st));
  return out;
}
const fresh = age => age === null ? "Date inconnue" : age <= 3600 ? "Frais" : age <= 86400 ? "À vérifier" : "Périmé";
const frNum = n => T(Math.round(n).toLocaleString("fr-FR"));
const pct1 = r => (Math.round(r * 10) / 10).toFixed(1).replace(".", ",") + " %";
const sig = r => [r.c, r.bt, r.st, r.scu, r.inv, r.rev, r.pps, r.tot, pct1(r.roi)].join("|");

function fakeUpstream(data) {
  const u = { hits: [], sockets: new Set() };
  u.server = http.createServer((req, res) => {
    const m = /^\/2\.0\/([a-z_]+)$/.exec(req.url); u.hits.push(m && m[1]);
    res.writeHead(m && data[m[1]] ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(m && data[m[1]] ? { status: "ok", http_code: 200, data: data[m[1]], message: "" } : { status: "error", http_code: 404, data: null }));
  });
  u.server.on("connection", s => { u.sockets.add(s); s.on("close", () => u.sockets.delete(s)); });
  u.start = async () => { u.port = await freePort(); await new Promise(r => u.server.listen(u.port, "127.0.0.1", r)); u.base = "http://127.0.0.1:" + u.port + "/2.0"; };
  u.stop = () => { u.sockets.forEach(s => s.destroy()); u.server.close(); };
  return u;
}
const servers = [];
async function startServer(env) {
  const port = await freePort(), e = Object.assign({}, process.env);
  for (const k of Object.keys(e)) if (/^(UEX_|AUTH_)/.test(k)) delete e[k];
  Object.assign(e, { PORT: String(port), DATA_DIR: tmp("orbital-routes-") }, env || {});
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: e, stdio: "ignore" });
  const s = { port, child, base: "http://127.0.0.1:" + port }; servers.push(s);
  for (let i = 0; i < 60; i++) { try { if ((await fetch(s.base + "/healthz")).status) break; } catch (x) {} await sleep(100); }
  return s;
}

(async () => {
  const up = fakeUpstream(FX.ROUTES_DATA); await up.start();
  const on = await startServer({ UEX_ENABLED: "1", UEX_BASE: up.base, UEX_CACHE_DIR: tmp("orbital-routes-c-") });
  const off = await startServer({});
  const apiList = async () => (await fetch(on.base + "/api/entries")).json();
  const apiClear = async () => { for (const e of await apiList()) await fetch(on.base + "/api/entries/" + e.id, { method: "DELETE" }); };
  let browser;
  const errors = [];
  const watch = p => {
    p.on("pageerror", e => errors.push(e.message));
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text() + (m.location().url || ""))) errors.push(m.text()); });
  };
  async function section(name, fn) { if (process.env.ROUTES_ONLY && !new RegExp(process.env.ROUTES_ONLY).test(name)) return; try { await fn(); } catch (e) { check(name + " : exécution", false, e && e.stack || String(e)); } }
  const BIG = FX.bigRoutesData();
  try {
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const CSPJS = () => { document.addEventListener("securitypolicyviolation", e => console.error("VIOLATION CSP " + e.violatedDirective + " " + e.blockedURI)); };
    async function newPage(opts) {
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }, opts || {}));
      await ctx.addInitScript(CSPJS);
      const page = await ctx.newPage(); watch(page);
      await page.clock.setFixedTime(new Date(FX.T0));
      const reqs = []; page.on("request", r => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/uex")) reqs.push(u.pathname.replace("/api/uex/", "") + (r.headers()["if-none-match"] ? " (ETag)" : "")); });
      return { ctx, page, reqs };
    }
    /* réponses fabriquées pour les états : o = { data, ago (s), stale, status, net, delay } ; compte les requêtes par ressource */
    async function mock(page, o) {
      o = o || {}; const counts = {}, data = o.data || FX.ROUTES_DATA;
      await page.route("**/api/uex/*", async r => {
        const res = new URL(r.request().url()).pathname.replace("/api/uex/", ""); counts[res] = (counts[res] || 0) + 1;
        if (o.delay) await sleep(o.delay);
        if (o.net) return r.abort("connectionrefused");
        const st = typeof o.status === "function" ? o.status(res, counts[res]) : o.status;
        if (st === 404) return r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"uex_disabled"}' });
        if (st === 503) return r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"uex_unavailable"}' });
        const etag = '"fx-' + res + '"';
        if (r.request().headers()["if-none-match"] === etag) return r.fulfill({ status: 304, headers: { ETag: etag } });
        const ago = o.ago || 0, stale = !!o.stale;
        r.fulfill({ status: 200, contentType: "application/json", headers: { ETag: etag }, body: JSON.stringify({ status: "ok", resource: res, fetched_at: new Date(FX.T0 - ago * 1000).toISOString(), age_s: ago, stale, attribution: {}, data: data[res] }) });
      });
      return counts;
    }
    const open = async (page, base, hash, wait) => { await page.goto(base + "/" + hash); await page.waitForSelector("#v-commerce", { state: "visible" }); if (wait !== false) await page.waitForSelector("#rcMain:not([hidden]) #rcB", { timeout: 8000 }); await page.waitForSelector("#rcRes table, #rcRes .mk-em", { timeout: 8000 }).catch(() => {}); };
    const txt = (page, sel) => page.locator(sel).first().innerText().then(T);
    const rows = page => page.evaluate(() => [...document.querySelectorAll("#rcRes tbody tr")].map(tr => {
      const th = tr.querySelector("th"), td = [...tr.querySelectorAll("td")];
      const v = c => { const n = c.querySelector(".mk-num"); return n ? n.getAttribute("data-x") : c.textContent; };
      const term = c => [...c.querySelectorAll(".rc-v > *")].map(e => e.textContent);
      const scuV = td[2].querySelector(".rc-v"), scuN = scuV.querySelector(".mk-num");
      return { c: th.querySelector("b").textContent, ill: !!th.querySelector(".rc-ill"), fr: th.querySelector(".mk-f").lastChild.textContent, age: th.querySelector(".mk-ag").textContent,
        bt: term(td[0]), st: term(td[1]), scu: scuN ? scuN.getAttribute("data-x") : scuV.firstChild.textContent, lim: [...scuV.querySelectorAll(".rc-lim")].map(e => e.textContent),
        inv: v(td[3]), rev: v(td[4]), pps: v(td[5]), tot: v(td[6]), roi: td[7].textContent, btn: td[8].querySelector("button").textContent };
    }));
    const digits = s => Number(String(s).replace(/[^\d]/g, ""));
    /* compare le tableau affiché (jusqu'à 100 lignes) à la référence : noms, terminaux, SCU, montants exacts (valeur accessible), ROI, fraîcheur, limites */
    async function sameAsRef(page, F, data, label, max) {
      const exp = ref(data || FX.ROUTES_DATA, F, FX.T0), got = await rows(page), n = Math.min(exp.length, max || 100);
      const errs = [];
      if (got.length !== n) errs.push("lignes " + got.length + " ≠ " + n);
      for (let i = 0; i < Math.min(n, got.length); i++) {
        const e = exp[i], g = got[i];
        const bad = [];
        if (g.c !== e.c) bad.push("marchandise " + g.c + "/" + e.c);
        if (g.bt[0] !== e.bt || g.st[0] !== e.st) bad.push("terminaux " + g.bt[0] + ">" + g.st[0] + "/" + e.bt + ">" + e.st);
        if (g.bt[1] !== e.bs || g.st[1] !== e.ss) bad.push("systèmes");
        if (digits(g.bt[2]) !== e.bp || digits(g.st[2]) !== e.sp) bad.push("prix unitaires");
        if (digits(g.scu) !== e.scu) bad.push("SCU " + g.scu + "/" + e.scu);
        if (digits(g.inv) !== e.inv || digits(g.rev) !== e.rev || digits(g.pps) !== e.pps || digits(g.tot) !== e.tot) bad.push("montants " + [g.inv, g.rev, g.pps, g.tot].join(",") + "/" + [e.inv, e.rev, e.pps, e.tot].join(","));
        if (T(g.roi) !== pct1(e.roi)) bad.push("ROI " + g.roi + "/" + pct1(e.roi));
        if (g.fr !== fresh(e.age)) bad.push("fraîcheur " + g.fr + "/" + fresh(e.age));
        if (g.ill !== e.ill) bad.push("illégale");
        const wantLim = ["limité par " + ({ stock: "le stock", demande: "la demande", budget: "le budget", soute: "la soute" })[e.lim]].map(x => x.replace("limité par la demande", "limitée par la demande"));
        if (e.stockUnknown) wantLim.push("stock inconnu"); if (e.demandUnknown) wantLim.push("demande inconnue");
        if (g.lim.join("|") !== wantLim.join("|")) bad.push("limites " + g.lim.join("+") + "/" + wantLim.join("+"));
        if (bad.length) errs.push("#" + i + " " + e.c + " : " + bad.join("; "));
      }
      const best = exp.reduce((m, r) => Math.max(m, r.roi), 0);
      const sum = await txt(page, "#rcSum"), want = exp.length ? exp.length + (exp.length > 1 ? " routes" : " route") : "Aucune route";
      if (!sum.startsWith(want + " pour ")) errs.push("résumé « " + sum + " » vs « " + want + " »");
      if (exp.length && !sum.endsWith("meilleur ROI " + pct1(best))) errs.push("meilleur ROI « " + sum + " » vs " + pct1(best));
      check(label + " : " + exp.length + " route(s), identiques à la référence indépendante (ordre, SCU, montants exacts, ROI, fraîcheur, limites)", !errs.length, errs.slice(0, 3).join(" | "));
      return exp;
    }
    /* applique des filtres par l'interface (champs, listes, cases), comme un utilisateur */
    async function setF(page, F) {
      const has = k => Object.prototype.hasOwnProperty.call(F, k);
      if (has("b")) await page.fill("#rcB", F.b === null ? "" : String(F.b));
      if (has("s")) await page.fill("#rcS", String(F.s));
      if (has("roi")) await page.fill("#rcRoi", String(F.roi));
      if (has("m")) await page.selectOption("#rcM", F.m);
      if (has("de")) await page.selectOption("#rcDe", F.de);
      if (has("vers")) await page.selectOption("#rcVers", F.vers);
      if (has("f")) await page.selectOption("#rcF", F.f);
      if (has("l")) await page.setChecked("#rcL", F.l);
      if (has("x")) await page.setChecked("#rcX", F.x);
      await page.waitForTimeout(380);
    }
    const hashOf = page => page.evaluate(() => location.hash);
    const drOpen = page => page.evaluate(() => !document.getElementById("trOv").hidden);

    /* ───────── 1. onglet, structure, avertissement ───────── */
    await section("onglet", async () => {
      const { ctx, page, reqs } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce", false);
      await page.waitForFunction(() => /désactivées|activées|indisponible/.test(document.getElementById("cmMktMsg").textContent), null, { timeout: 5000 }).catch(() => {});
      const tabs = await page.evaluate(() => [...document.querySelectorAll("#cmTabs [role=tab]")].map(b => ({ t: b.textContent.replace(/\s+/g, " ").trim(), dis: b.getAttribute("aria-disabled"), ctl: b.getAttribute("aria-controls"), ti: b.tabIndex })));
      check("onglet « Routes » actif (plus de « bientôt », pas aria-disabled, relié à son panneau) ; Raffineries est actif ; Carburant et Vaisseaux restent « bientôt » et désactivés", tabs[2].t === "Routes" && tabs[2].dis === null && tabs[2].ctl === "cmPanel-routes" && tabs[3].dis === null && tabs[3].ctl === "cmPanel-raffineries" && tabs.slice(4).every(t => t.dis === "true" && /bientôt/.test(t.t) && t.ctl === null), JSON.stringify(tabs));
      check("page par défaut : aucune requête sur les données de prix tant que Routes n'est pas ouvert", reqs.every(r => r === "status"), reqs.join());
      const card = await page.evaluate(() => { const li = [...document.querySelectorAll("#cmPanel-sim .cm-tool")].find(x => x.querySelector("h3").textContent === "Routes"); return { off: li.classList.contains("off"), soon: /bientôt/.test(li.textContent), href: li.querySelector("a") && li.querySelector("a").getAttribute("href") }; });
      check("carte « Routes » du tableau de bord : active, lien #commerce/routes, plus « bientôt »", !card.off && !card.soon && card.href === "#commerce/routes", JSON.stringify(card));
      await page.click("#cmTab-routes"); await page.waitForSelector("#rcMain:not([hidden]) #rcB"); await page.waitForSelector("#rcRes table");
      check("clic sur « Routes » : adresse #commerce/routes, onglet sélectionné, panneau visible, focus resté sur l'onglet, sous-titre mis à jour", (await hashOf(page)) === "#commerce/routes" && (await page.getAttribute("#cmTab-routes", "aria-selected")) === "true" && (await page.isVisible("#cmPanel-routes")) && (await page.isHidden("#cmPanel-sim")) && (await page.evaluate(() => document.activeElement.id)) === "cmTab-routes" && /Routes commerciales/.test(await txt(page, "#topSub")));
      check("titre h2 « Routes commerciales » ; une seule requête par ressource à l'ouverture", (await txt(page, "#rcTitle")) === "Routes commerciales" && (await page.evaluate(() => document.getElementById("rcTitle").tagName)) === "H2" && ["commodities_prices_all", "commodities", "terminals", "star_systems"].every(r => reqs.filter(x => x === r).length === 1) && reqs.filter(x => x !== "status").length === 4, reqs.join());
      check("avertissement permanent exact (role=note)", (await txt(page, ".rc-warn")) === "Les prix sont des estimations communautaires. Routes calculées localement, sans promesse de précision : stock, demande et prix changent en jeu." && (await page.getAttribute(".rc-warn", "role")) === "note");
      const dist = await page.evaluate(() => (document.getElementById("cmPanel-routes").textContent.match(/Distance non disponible/g) || []).length);
      check("« Distance non disponible » affiché une seule fois, aucune colonne distance ni ETA", dist === 1 && !/ETA|Distance \(|Durée/.test(await txt(page, "#rcRes thead")), String(dist));
      const heads = await page.evaluate(() => [...document.querySelectorAll("#rcRes thead th")].map(h => { const b = h.querySelector("button"); return b ? b.firstChild.textContent : h.textContent.trim(); }));
      check("colonnes : Marchandise, Achat à, Vente à, SCU utilisés, Investissement, Revenu, Bénéfice / SCU, Bénéfice total, ROI, Action", heads.join() === "Marchandise,Achat à,Vente à,SCU utilisés,Investissement,Revenu,Bénéfice / SCU,Bénéfice total,ROI,Action", heads.join());
      const f = await page.evaluate(() => ({ d: document.getElementById("rcFm").tagName, open: document.getElementById("rcFm").open, sum: document.querySelector("#rcFm summary").textContent, t: document.getElementById("rcFm").textContent }));
      check("bloc « Formules utilisées » repliable (details fermé) avec toutes les formules et la règle de stock", f.d === "DETAILS" && !f.open && f.sum === "Formules utilisées" && /Bénéfice par SCU = prix de vente − prix d’achat/.test(f.t) && /Bénéfice total = revenu − investissement/.test(f.t) && /ROI = \(prix de vente − prix d’achat\) ÷ prix d’achat/.test(f.t) && /Investissement = prix d’achat × SCU utilisés/.test(f.t) && /Revenu = prix de vente × SCU utilisés/.test(f.t) && /arrondi à l’entier inférieur/.test(f.t) && /règle prudente/.test(f.t), f.t.slice(0, 80));
      await page.click("#rcFm summary"); check("le clic sur « Formules utilisées » déplie le bloc", await page.evaluate(() => document.getElementById("rcFm").open));
      await page.keyboard.press("Tab");
      // navigation clavier : flèche droite depuis Routes mène à Raffineries (actif) puis, en sautant les onglets « bientôt », revient à « Simulateur & journal »
      await page.focus("#cmTab-routes"); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150);
      check("flèche droite depuis Routes : Raffineries (onglet actif)", (await page.evaluate(() => document.activeElement.id)) === "cmTab-raffineries");
      await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150);
      check("flèche droite depuis Raffineries : les onglets « bientôt » sont sautés (retour à « Simulateur & journal »)", (await page.evaluate(() => document.activeElement.id)) === "cmTab-sim" && (await hashOf(page)) === "#commerce");
      await page.goBack().catch(() => {}); await ctx.close();
    });

    /* ───────── 2. calculs par défaut et règle de stock ───────── */
    await section("calculs", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/routes");
      check("valeurs par défaut : budget vide (illimité), 100 SCU, marchandise « Toutes », systèmes « Tous », marge 0, fraîcheur « jusqu'à 24 h », cases décochées", (await page.inputValue("#rcB")) === "" && (await page.inputValue("#rcS")) === "100" && (await page.inputValue("#rcRoi")) === "0" && (await page.inputValue("#rcM")) === "" && (await page.inputValue("#rcDe")) === "" && (await page.inputValue("#rcVers")) === "" && (await page.inputValue("#rcF")) === "24h" && !(await page.isChecked("#rcL")) && !(await page.isChecked("#rcX")));
      const exp = await sameAsRef(page, {}, null, "défaut (100 SCU, budget illimité, ≤ 24 h)");
      check("fixture : 8 routes attendues (Kappa, Alphium ×2, Gamma, Delta, Bêta ×2, Lambda), tri par bénéfice total décroissant", exp.length === 8 && exp.map(r => r.tot).join() === "500000,30000,28000,25000,20000,6000,4000,450", exp.map(r => r.tot).join());
      check("résumé aria-live : « 8 routes pour un budget illimité et 100 SCU · meilleur ROI 30,0 % »", (await txt(page, "#rcSum")) === "8 routes pour un budget illimité et 100 SCU · meilleur ROI 30,0 %" && (await page.getAttribute("#rcSum", "aria-live")) === "polite");
      const r = await rows(page);
      const find = (c, bt, st) => r.find(x => x.c === c && x.bt[0] === bt && x.st[0] === st);
      check("stock épuisé (état 1, quantité 0) : Alphium n'est jamais acheté à Terminal B ; aucune demande (état 7) : Alphium n'est jamais vendu à Terminal E", !r.some(x => x.c === "Alphium" && x.bt[0] === "Terminal B") && !r.some(x => x.c === "Alphium" && x.st[0] === "Terminal E"));
      const a2 = find("Alphium", "Terminal A", "Terminal D"), b1 = find("Bêta", "Terminal A", "Terminal B");
      check("quantité 0 sans rupture = inconnue : route gardée, non limitante, signalée (« demande inconnue », « stock inconnu »)", a2 && a2.lim.join() === "limité par la soute,demande inconnue" && b1 && b1.lim.join() === "limité par la soute,stock inconnu", JSON.stringify([a2, b1].map(x => x && x.lim)));
      const bd = find("Bêta", "Terminal A", "Terminal C");
      check("demande limitée : « Bêta » vers Terminal D limité à 15 SCU (demande 15), les autres terminaux non", r.find(x => x.c === "Bêta" && x.st[0] === "Terminal D") && digits(r.find(x => x.c === "Bêta" && x.st[0] === "Terminal D").scu) === 15 && !bd);
      check("prix d'achat = prix de vente (Zêta) et vente < achat (Êta) exclus ; marchandise sans acheteur (Epsilon) sans route", !r.some(x => ["Zêta", "Êta", "Epsilon"].includes(x.c)));
      const g = r.filter(x => x.c === "Gamma");
      check("terminal à double sens (Gamma) : une seule route (B → D), jamais achat et vente au même terminal", g.length === 1 && g[0].bt[0] === "Terminal B" && g[0].st[0] === "Terminal D" && !r.some(x => x.bt[0] === x.st[0]));
      check("illégale (Delta) : étiquette texte « illégale » ; légale : aucune étiquette", r.find(x => x.c === "Delta").ill && !r.find(x => x.c === "Kappa").ill);
      const k = r[0];
      check("grands nombres : Kappa 100 SCU, investissement 2 000 000, revenu 2 500 000, bénéfice/SCU 5 000, total 500 000 (valeurs abrégées, valeur exacte accessible)", T(k.inv) === "2 000 000 aUEC" && T(k.rev) === "2 500 000 aUEC" && T(k.tot) === "500 000 aUEC" && T(k.pps) === "5 000" && T(k.roi) === "25,0 %", JSON.stringify(k));
      const short = await page.evaluate(() => { const n = document.querySelector("#rcRes tbody tr .mk-num"); return { vis: n.firstChild.textContent, aria: n.firstChild.getAttribute("aria-hidden"), sr: n.querySelector(".sr").textContent, tab: n.tabIndex }; });
      check("valeur abrégée : « 2M » masquée aux lecteurs d'écran, texte exact en .sr, focusable", short.vis === "2M" && short.aria === "true" && T(short.sr) === "2 000 000 aUEC" && short.tab === 0, JSON.stringify(short));
      const btn = r[0].btn;
      check("chaque ligne a un bouton « Simuler ce trade » dont le nom accessible précise la route", /^Simuler ce trade : Kappa, de Terminal A vers Terminal C$/.test(T(btn)), btn);
      await ctx.close();
    });

    /* ───────── 3. filtres un par un, puis combinés ───────── */
    await section("filtres", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/routes");
      const cases = [
        ["SCU = 300 (soute plus grande : la demande limite 200, le reste suit)", { s: 300 }],
        ["SCU = 10", { s: 10 }],
        ["SCU = 0 (aucune route)", { s: 0 }],
        ["budget 58 000 SCU-limités : 58 000 aUEC", { b: 58000 }],
        ["budget 2 500 (arrondi à l'entier inférieur : 2 SCU à 1 000, 1 SCU à 1 100…)", { b: 2500 }],
        ["budget 0", { b: 0 }],
        ["budget 58 000 000 et 256 SCU (exemple du cahier des charges)", { b: 58000000, s: 256 }],
        ["marchandise Alphium", { m: "alphium" }],
        ["marchandise sans route possible (Zêta : prix égaux) : aucune route", { m: "zeta" }],
        ["système de départ = Système X", { de: "Système X" }],
        ["système d'arrivée = Système Y", { vers: "Système Y" }],
        ["départ Système Y, arrivée Système X", { de: "Système Y", vers: "Système X" }],
        ["marge minimale 30 % (inclusive : ROI = 30 % gardé)", { roi: 30 }],
        ["marge minimale 31 %", { roi: 31 }],
        ["fraîcheur Frais (≤ 1 h)", { f: "1h" }],
        ["fraîcheur Tout (périmés et sans date inclus)", { f: "tout" }],
        ["légal uniquement", { l: true }],
        ["ignorer le stock et la demande (24 h)", { x: true }],
        ["combiné : budget 300 000, 256 SCU, tout, ignorer stock", { b: 300000, s: 256, f: "tout", x: true }],
        ["combiné : Système X → Système Y, marge 20 %, légal, 50 SCU", { de: "Système X", vers: "Système Y", roi: 20, l: true, s: 50 }],
        ["combiné : tout + légal + marge 10 % + budget 100 000", { f: "tout", l: true, roi: 10, b: 100000 }]
      ];
      let cur = {};
      for (const [label, F] of cases) {
        // retour au défaut par le bouton, puis application du seul filtre (ou de la combinaison)
        await page.click("#rcReset"); await page.waitForTimeout(250);
        await setF(page, F); cur = F;
        await sameAsRef(page, F, null, "filtre « " + label + " »");
      }
      await page.click("#rcReset"); await page.waitForTimeout(250);
      // fraîcheur : détails
      await setF(page, { f: "tout" });
      const t = await rows(page);
      const labs = t.map(x => x.c + ":" + x.bt[0] + ">" + x.st[0] + ":" + x.fr).join(" ; ");
      check("fraîcheur « Tout » : pastilles texte Périmé (Bêta, prix de 3 j et Thêta, 30 h), Date inconnue (Iota), À vérifier, Frais — jamais la couleur seule", /Bêta:Terminal C>Terminal B:Périmé/.test(labs) && /Thêta:Terminal D>Terminal B:Périmé/.test(labs) && /Iota:Terminal A>Terminal B:Date inconnue/.test(labs) && /Alphium:Terminal A>Terminal D:À vérifier/.test(labs) && /Kappa:Terminal A>Terminal C:Frais/.test(labs), labs);
      check("pastille : symbole décoratif (aria-hidden) + libellé ; ancienneté écrite (« date inconnue », « il y a … »)", (await page.evaluate(() => { const p = document.querySelector("#rcRes .mk-f"); return p.firstChild.getAttribute("aria-hidden") === "true" && p.textContent.length > 3; })) && t.find(x => x.c === "Iota").age === "date inconnue" && /^il y a/.test(t.find(x => x.c === "Kappa").age), JSON.stringify(t.find(x => x.c === "Iota").age));
      check("fraîcheur du moins frais des deux prix : Alphium A→D (prix de 10 min et de 2 h) = « À vérifier »", t.find(x => x.c === "Alphium" && x.st[0] === "Terminal D").fr === "À vérifier");
      // légal
      await setF(page, { f: "24h", l: true });
      check("légal uniquement : plus aucune ligne « illégale » (Delta absente), les autres inchangées", !(await rows(page)).some(x => x.c === "Delta" || x.ill) && (await rows(page)).length === 7);
      // réinitialisation
      await setF(page, { b: 5000, s: 12, m: "kappa", de: "Système X", vers: "Système Y", roi: 3, f: "1h", l: true, x: true });
      const h0 = await hashOf(page);
      await page.click("#rcReset"); await page.waitForTimeout(300);
      const st = await page.evaluate(() => ({ b: rcB.value, s: rcS.value, roi: rcRoi.value, m: rcM.value, de: rcDe.value, vers: rcVers.value, f: rcF.value, l: rcL.checked, x: rcX.checked, foc: document.activeElement.id, msg: document.getElementById("rcMsg").textContent, inv: document.querySelectorAll("#cmPanel-routes [aria-invalid]").length }));
      check("« Réinitialiser les filtres » : tous les champs reviennent au défaut, adresse #commerce/routes, focus sur le budget, message d'état", st.b === "" && st.s === "100" && st.roi === "0" && st.m === "" && st.de === "" && st.vers === "" && st.f === "24h" && !st.l && !st.x && st.foc === "rcB" && /Filtres réinitialisés/.test(st.msg) && st.inv === 0 && (await hashOf(page)) === "#commerce/routes" && h0 !== "#commerce/routes", JSON.stringify(st) + h0);
      await sameAsRef(page, {}, null, "après réinitialisation : retour aux 8 routes par défaut");
      await ctx.close();
    });

    /* ───────── 4. saisies invalides ───────── */
    await section("saisies invalides", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/routes");
      const msg = id => txt(page, "#" + id + "-e");
      for (const [val, label] of [["abc", "texte"], ["-5", "négatif"], ["1,5", "décimal (virgule)"], ["12.5", "décimal (point)"], ["1e3", "notation scientifique"], ["99999999999999", "trop grand"]]) {
        await page.fill("#rcB", val); await page.waitForTimeout(350);
        const e = await msg("rcB"), inv = await page.getAttribute("#rcB", "aria-invalid"), d = await page.getAttribute("#rcB", "aria-describedby");
        check("budget « " + val + " » (" + label + ") : message français « Erreur : … », aria-invalid, aria-describedby vers le message", /^Erreur : Le budget (doit être un nombre entier positif ou nul|est trop grand)/.test(e) && inv === "true" && d.split(" ").includes("rcB-e"), e + " / " + inv + " / " + d);
      }
      check("saisie invalide : résultats masqués (aucune ligne, aucun tableau), résumé explicite, export désactivé, adresse sans la valeur invalide", (await page.locator("#rcRes table").count()) === 0 && /Résultats masqués : corrigez/.test(await txt(page, "#rcSum")) && (await page.isDisabled("#rcCsv")) && !/b=/.test(await hashOf(page)));
      await page.fill("#rcB", "58 000"); await page.waitForTimeout(350);
      check("espaces acceptés dans la saisie (« 58 000 ») : erreur levée, routes recalculées, adresse b=58000", (await msg("rcB")) === "" && (await page.getAttribute("#rcB", "aria-invalid")) === null && (await page.locator("#rcRes table").count()) === 1 && /b=58000/.test(await hashOf(page)));
      await page.fill("#rcS", ""); await page.waitForTimeout(350);
      check("SCU vide : « Erreur : Renseignez les SCU disponibles… »", /^Erreur : Renseignez les SCU disponibles/.test(await msg("rcS")));
      await page.fill("#rcS", "x1"); await page.waitForTimeout(350);
      check("SCU « x1 » : message « Les SCU disponibles doivent être un nombre entier… »", /^Erreur : Les SCU disponibles doivent être un nombre entier positif ou nul/.test(await msg("rcS")));
      await page.fill("#rcS", "100"); await page.fill("#rcRoi", "-3"); await page.waitForTimeout(350);
      check("marge « -3 » : « La marge minimale doit être un nombre entier positif ou nul (en %). »", /^Erreur : La marge minimale doit être un nombre entier positif ou nul/.test(await msg("rcRoi")));
      await page.fill("#rcRoi", ""); await page.fill("#rcB", ""); await page.waitForTimeout(350);
      check("marge vide = 0 et budget vide = illimité : plus aucune erreur, résumé normal", (await msg("rcRoi")) === "" && (await msg("rcB")) === "" && /^8 routes pour un budget illimité/.test(await txt(page, "#rcSum")));
      await page.fill("#rcB", "abc"); await page.waitForTimeout(350);
      await page.click("#rcReset"); await page.waitForTimeout(300);
      check("réinitialisation après une erreur : messages et aria-invalid retirés", (await msg("rcB")) === "" && (await page.getAttribute("#rcB", "aria-invalid")) === null && (await page.locator("#rcRes table").count()) === 1);
      // anti-rebond : une frappe rapide ne recalcule qu'à la fin
      await page.evaluate(() => { window.__n = 0; const f = window.OrbMarket.routes.compute; window.OrbMarket.routes.compute = function () { window.__n++; return f.apply(this, arguments); }; });
      await page.focus("#rcB"); await page.keyboard.type("1234567", { delay: 20 }); await page.waitForTimeout(450);
      check("saisie instantanée avec anti-rebond : 7 frappes rapides = au plus 2 calculs (le dernier donne le résultat)", (await page.evaluate(() => window.__n)) <= 2 && /b=1234567/.test(await hashOf(page)));
      await ctx.close();
    });

    /* ───────── 5. adresse partageable ───────── */
    await section("adresse", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/routes");
      await setF(page, { b: 58000000, s: 256, m: "alphium", de: "Système X", vers: "Système Y", roi: 20, f: "tout", l: true, x: true });
      const h = await hashOf(page);
      check("adresse = #commerce/routes?b=…&s=…&m=…&de=…&vers=…&roi=…&f=…&l=1&x=1", h === "#commerce/routes?b=58000000&s=256&m=alphium&de=Syst%C3%A8me%20X&vers=Syst%C3%A8me%20Y&roi=20&f=tout&l=1&x=1", h);
      const want = ref(FX.ROUTES_DATA, { b: 58000000, s: 256, m: "alphium", de: "Système X", vers: "Système Y", roi: 20, f: "tout", l: true, x: true }, FX.T0).map(sig).join("\n");
      const link = h; await ctx.close();
      const n = await newPage(); await mock(n.page);
      await open(n.page, on.base, link);
      const v = await n.page.evaluate(() => ({ b: rcB.value, s: rcS.value, m: rcM.value, de: rcDe.value, vers: rcVers.value, roi: rcRoi.value, f: rcF.value, l: rcL.checked, x: rcX.checked, sel: document.getElementById("cmTab-routes").getAttribute("aria-selected") }));
      check("ouverture directe du lien : onglet Routes sélectionné et tous les champs restaurés", v.sel === "true" && v.b === "58000000" && v.s === "256" && v.m === "alphium" && v.de === "Système X" && v.vers === "Système Y" && v.roi === "20" && v.f === "tout" && v.l && v.x, JSON.stringify(v));
      const got = (await rows(n.page)).map(r => 0).length;
      await sameAsRef(n.page, { b: 58000000, s: 256, m: "alphium", de: "Système X", vers: "Système Y", roi: 20, f: "tout", l: true, x: true }, null, "lien partagé");
      check("l'adresse reste identique après ouverture (pas de réécriture parasite)", (await hashOf(n.page)) === link && want.length > 0 && got >= 0, await hashOf(n.page));
      // valeurs par défaut omises ; paramètres invalides ou inconnus
      await open(n.page, on.base, "#commerce/routes?s=100&f=24h&roi=0&m=n-existe-pas&de=Nulle%20part&f=zzz");
      check("paramètres par défaut ou inconnus ignorés proprement (marchandise/système inexistants → « Toutes »), adresse réduite", (await n.page.inputValue("#rcM")) === "" && (await n.page.inputValue("#rcDe")) === "" && (await n.page.inputValue("#rcF")) === "24h" && (await hashOf(n.page)) === "#commerce/routes", await hashOf(n.page));
      await open(n.page, on.base, "#commerce/routes?b=abc&s=-2");
      check("lien avec paramètres invalides : erreurs affichées (pas de plantage), résultats masqués", /Erreur : Le budget/.test(await txt(n.page, "#rcB-e")) && /Erreur : Les SCU/.test(await txt(n.page, "#rcS-e")) && (await n.page.locator("#rcRes table").count()) === 0);
      // changement d'adresse à la main dans la page
      await open(n.page, on.base, "#commerce/routes");
      const before = n.reqs.length;
      await n.page.evaluate(() => { location.hash = "#commerce/routes?m=kappa&s=50"; }); await n.page.waitForTimeout(450);
      check("modification de l'adresse à la main : filtres appliqués sans recharger ni redemander les données", (await n.page.inputValue("#rcM")) === "kappa" && (await n.page.inputValue("#rcS")) === "50" && n.reqs.length === before && (await n.page.locator("#rcRes tbody tr").count()) === 1, n.reqs.length + "/" + before);
      // le sous-onglet garde l'état en allant sur Prix puis en revenant, et via la barre latérale
      await setF(n.page, { b: 777 });
      await n.page.click("#cmTab-prix"); await n.page.waitForTimeout(300); await n.page.click("#cmTab-routes"); await n.page.waitForSelector("#rcRes table, #rcRes .mk-em");
      check("aller-retour Routes → Prix → Routes : filtres conservés et dans l'adresse", (await n.page.inputValue("#rcB")) === "777" && /b=777/.test(await hashOf(n.page)), await hashOf(n.page));
      await n.ctx.close();
    });

    /* ───────── 6. tri ───────── */
    await section("tri", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/routes");
      const aria = () => page.evaluate(() => [...document.querySelectorAll("#rcRes thead th")].map(h => h.getAttribute("aria-sort")));
      let a = await aria();
      check("tri par défaut : « Bénéfice total » décroissant (aria-sort=descending), les autres colonnes triables « none », « Action » sans tri", a[7] === "descending" && a.slice(0, 7).every(x => x === "none") && a[8] === "none" && a[9] === null, JSON.stringify(a));
      const base = ref(FX.ROUTES_DATA, {}, FX.T0);
      const stable = (key, dir) => base.slice().sort((p, q) => { const x = typeof key === "function" ? key(p) : p[key], y = typeof key === "function" ? key(q) : q[key]; const c = typeof x === "string" ? COLL.compare(x, y) : x - y; return c ? Math.sign(c) * dir : 0; });
      const orderOf = async () => (await rows(page)).map(r => r.c + ">" + r.bt[0] + ">" + r.st[0]).join();
      const exp = list => list.map(r => r.c + ">" + r.bt + ">" + r.st).join();
      await page.click('#rcRes .mk-sb[data-k="roi"]');
      check("clic « ROI » : tri croissant (aria-sort=ascending, flèche), ordre identique à la référence (à égalité, l'ordre précédent est conservé)", (await aria())[8] === "ascending" && (await orderOf()) === exp(stable("roi", 1)), await orderOf());
      await page.click('#rcRes .mk-sb[data-k="roi"]');
      check("second clic : décroissant", (await aria())[8] === "descending" && (await orderOf()) === exp(stable("roi", -1)));
      await page.click('#rcRes .mk-sb[data-k="c"]');
      check("tri par Marchandise (texte, ordre français)", (await orderOf()) === exp(stable("c", 1)) && (await aria())[0] === "ascending");
      await page.click('#rcRes .mk-sb[data-k="f"]'); check("tri par « Achat à » (terminal)", (await orderOf()) === exp(stable("bt", 1)));
      await page.click('#rcRes .mk-sb[data-k="scu"]'); check("tri par « SCU utilisés »", (await orderOf()) === exp(stable("scu", 1)));
      await page.click('#rcRes .mk-sb[data-k="inv"]'); check("tri par « Investissement »", (await orderOf()) === exp(stable("inv", 1)));
      await page.click('#rcRes .mk-sb[data-k="rev"]'); check("tri par « Revenu »", (await orderOf()) === exp(stable("rev", 1)));
      await page.click('#rcRes .mk-sb[data-k="pps"]'); check("tri par « Bénéfice / SCU »", (await orderOf()) === exp(stable("pps", 1)));
      await page.click('#rcRes .mk-sb[data-k="tot"]'); await page.click('#rcRes .mk-sb[data-k="tot"]');
      check("retour au tri « Bénéfice total » décroissant = ordre par défaut", (await orderOf()) === exp(base));
      await page.focus('#rcRes .mk-sb[data-k="scu"]'); await page.keyboard.press("Enter");
      check("tri au clavier (Entrée sur l'en-tête) ; le focus reste sur le bouton de tri", (await aria())[3] === "ascending" && (await page.evaluate(() => document.activeElement.getAttribute("data-k"))) === "scu");
      await setF(page, { s: 50 });
      check("le tri choisi est conservé quand les filtres changent", (await aria())[3] === "ascending");
      await ctx.close();
    });

    /* ───────── 7. « Voir plus » et performance (≈ 2 600 lignes de prix fabriquées) ───────── */
    await section("voir plus et performance", async () => {
      check("jeu fabriqué : 2 600 lignes de prix", BIG.commodities_prices_all.length === 2600);
      const { ctx, page } = await newPage(); await mock(page, { data: BIG });
      await open(page, on.base, "#commerce/routes?f=tout");
      const exp = ref(BIG, { f: "tout" }, FX.T0), n = () => page.locator("#rcRes tbody tr").count();
      check("beaucoup de routes (" + exp.length + " > 100) : 100 affichées d'abord, bouton « Voir plus (" + (exp.length - 100) + " restantes) »", exp.length > 200 && (await n()) === 100 && (await txt(page, ".mk-more")) === "Voir plus (" + frNum(exp.length - 100) + " restantes)", (await n()) + " " + exp.length);
      await sameAsRef(page, { f: "tout" }, BIG, "gros jeu (100 premières routes)");
      await page.click(".mk-more button"); await page.waitForTimeout(100);
      check("« Voir plus » : 200 lignes, focus sur la première ligne ajoutée", (await n()) === 200 && (await page.evaluate(() => document.activeElement.tagName)) === "TH");
      const ms = await page.evaluate(() => window.OrbMarket.routes.state.ms);
      check("performance : calcul de ~" + exp.length + " routes sur 2 600 lignes de prix mesuré à " + ms.toFixed(1) + " ms (< 300 ms)", ms < 300, ms);
      const t = await page.evaluate(async () => {
        const I = window.OrbMarket.routes.state.idx, F = Object.assign({}, window.OrbMarket.routes.state.last, { b: null, x: true }), a = performance.now();
        let k = 0; for (let i = 0; i < 5; i++) k = window.OrbMarket.routes.compute(I, F, Date.now()).length;
        return { each: (performance.now() - a) / 5, n: k };
      });
      check("performance : calcul sans limite de stock (cas le plus lourd) mesuré à " + t.each.toFixed(1) + " ms en moyenne pour " + t.n + " routes (< 300 ms)", t.each < 300, JSON.stringify(t));
      const t1 = Date.now(); await page.fill("#rcRoi", "5"); await page.waitForFunction(() => /roi=5/.test(location.hash)); const tot = Date.now() - t1;
      check("saisie → affichage du résultat (anti-rebond compris) en moins d'une seconde : " + tot + " ms", tot < 1000);
      await sameAsRef(page, { f: "tout", roi: 5 }, BIG, "gros jeu, marge 5 %");
      await ctx.close();
    });

    /* ───────── 8. export CSV ───────── */
    await section("csv", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/routes?f=tout");
      await page.click('#rcRes .mk-sb[data-k="roi"]');
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#rcCsv")]);
      const raw = fs.readFileSync(await dl.path(), "utf8");
      const exp = ref(FX.ROUTES_DATA, { f: "tout" }, FX.T0).sort((p, q) => 0);
      // ordre attendu : tri par ROI croissant, stable à partir de l'ordre par défaut
      const sorted = ref(FX.ROUTES_DATA, { f: "tout" }, FX.T0).sort((p, q) => p.roi - q.roi);
      const csvq = v => /[";\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      const txtc = v => csvq(/^[=+\-@\t\r]/.test(v) ? "'" + v : v);
      const numc = n => String(n).replace(".", ",");
      const head = ["Marchandise", "Achat à (terminal)", "Système d'achat", "Vente à (terminal)", "Système de vente", "SCU utilisés", "Prix d'achat (aUEC/SCU)", "Prix de vente (aUEC/SCU)", "Investissement (aUEC)", "Revenu (aUEC)", "Bénéfice par SCU (aUEC)", "Bénéfice total (aUEC)", "ROI (%)", "Limité par", "Stock à l'achat (SCU)", "Demande à la vente (SCU)", "Ancienneté du plus ancien prix (min)", "Fraîcheur"].map(txtc).join(";");
      const lines = sorted.map(r => {
        const a = FX.ROUTES_DATA.commodities_prices_all, ca = FX.ROUTES_DATA.commodities.find(c => c.name === r.c).id, tid = n => FX.ROUTES_DATA.terminals.find(t => t.name === n).id;
        const bl = a.find(p => p.id_commodity === ca && p.id_terminal === tid(r.bt) && p.price_buy > 0), sl = a.find(p => p.id_commodity === ca && p.id_terminal === tid(r.st) && p.price_sell > 0);
        return [txtc(r.c), txtc(r.bt), txtc(r.bs), txtc(r.st), txtc(r.ss), r.scu, r.bp, r.sp, r.inv, r.rev, r.pps, r.tot, numc(Math.round(r.roi * 10) / 10), r.lim, bl.scu_buy > 0 ? bl.scu_buy : "", sl.scu_sell > 0 ? sl.scu_sell : "", r.age === null ? "" : Math.floor(r.age / 60), fresh(r.age)].join(";");
      });
      const want = "﻿" + [head].concat(lines).join("\r\n") + "\r\n";
      check("CSV : contenu EXACT (BOM, « ; », CRLF, en-têtes, nombres à virgule décimale, ordre du tri affiché, toutes les routes filtrées)", raw === want, raw.split("\r\n").slice(0, 3).join(" ¶ ") + " ≠ " + want.split("\r\n").slice(0, 3).join(" ¶ "));
      check("CSV : BOM UTF-8, séparateur « ; », fin de ligne CRLF, aucune ligne vide intermédiaire, " + (exp.length + 1) + " lignes + fin", raw.charCodeAt(0) === 0xfeff && raw.endsWith("\r\n") && !/\n\n|(?<!\r)\n/.test(raw) && raw.split("\r\n").length === exp.length + 2);
      check("CSV : formule neutralisée (« =Terminal Formule » devient « '=Terminal Formule »), aucune cellule ne commence par = + - @", /;'=Terminal Formule;/.test(raw) && !raw.split("\r\n").some(l => l.split(";").some(c => /^[=+@]/.test(c) || /^-\D/.test(c))));
      check("CSV : nom de fichier routes-commerciales.csv et message « Export prêt : N lignes. »", dl.suggestedFilename() === "routes-commerciales.csv" && (await txt(page, "#rcMsg")) === "Export prêt : " + exp.length + " lignes.", await txt(page, "#rcMsg"));
      await setF(page, { m: "zeta" });
      check("aucune route : export désactivé", await page.isDisabled("#rcCsv"));
      await ctx.close();
    });

    /* ───────── 9. « Simuler ce trade » et tiroir ───────── */
    await section("simuler", async () => {
      await apiClear();
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/routes");
      const btn = page.locator("#rcRes tbody tr").first().locator("button");
      check("bouton « Simuler ce trade » sur la première route (Kappa), aria-haspopup=dialog, ≥ 44 px", (await btn.evaluate(b => b.firstChild.textContent)) === "Simuler ce trade" && (await btn.getAttribute("aria-haspopup")) === "dialog" && (await btn.boundingBox()).height >= 44);
      await btn.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(200);
      const f = () => page.evaluate(() => { const g = id => document.getElementById(id).value; return { cm: g("trCm"), scu: g("trScu"), buy: g("trBuy"), sell: g("trSell"), fees: g("trFees"), from: g("trFrom"), to: g("trTo"), dur: g("trDur") }; });
      const v = await f();
      check("tiroir ouvert, PRÉREMPLI : marchandise, SCU utilisés, prix d'achat, prix de vente, « Terminal (Système) » d'achat et de vente ; frais et durée vides", (await drOpen(page)) && JSON.stringify(v) === JSON.stringify({ cm: "Kappa", scu: "100", buy: "20000", sell: "25000", fees: "", from: "Terminal A (Système X)", to: "Terminal C (Système Y)", dur: "" }), JSON.stringify(v));
      check("résultat en direct : bénéfice net +500 000 aUEC (100 × (25 000 − 20 000))", T(await page.textContent("#trOv .tr-net")) === "+500 000 aUEC");
      check("même composant : « Calculer un trade », bouton final « Ajouter au journal », aide remplacée par la note de préremplissage, rien n'est enregistré", (await txt(page, "#trDrT")) === "Calculer un trade" && (await txt(page, "#trSubmit")) === "Ajouter au journal" && /préremplies depuis la route/.test(await txt(page, "#trDrD")) && (await apiList()).length === 0);
      check("focus sur le premier champ du tiroir, page derrière inerte (focus piégé), volet latéral à droite", (await page.evaluate(() => document.activeElement.id)) === "trCm" && (await page.evaluate(() => document.querySelector(".app").inert)) && (await page.evaluate(() => { const r = document.getElementById("trDlg").getBoundingClientRect(); return Math.abs(r.right - innerWidth) < 2 && r.top < 2; })));
      let trapped = true; for (let i = 0; i < 20; i++) { await page.keyboard.press("Tab"); if (!(await page.evaluate(() => document.getElementById("trDlg").contains(document.activeElement)))) trapped = false; }
      check("focus piégé : 20 Tab de suite restent dans le tiroir", trapped);
      // tout reste modifiable
      await page.fill("#trScu", "40"); await page.fill("#trFees", "1500"); await page.fill("#trCm", "Kappa modifié");
      check("tous les champs restent modifiables : le résultat suit (40 × 5 000 − 1 500 = +198 500)", T(await page.textContent("#trOv .tr-net")) === "+198 500 aUEC");
      await page.keyboard.press("Escape"); await page.waitForTimeout(150);
      check("Échap ferme le tiroir, rend le focus au bouton « Simuler ce trade », rien n'est enregistré", !(await drOpen(page)) && (await page.evaluate(() => document.activeElement.textContent.indexOf("Simuler ce trade") === 0)) && (await apiList()).length === 0);
      // non-régression : le brouillon d'avant n'est pas pollué par le préremplissage annulé
      await page.click("#cmTab-sim"); await page.waitForTimeout(150); await page.click("#cmOpen");
      const v2 = await f();
      check("après annulation, « Calculer un trade » (onglet Simulateur) s'ouvre VIDE : le préremplissage ne fuit pas dans le brouillon ; aide d'origine rétablie", Object.values(v2).every(x => x === "") && /Tout vient de votre saisie/.test(await txt(page, "#trDrD")), JSON.stringify(v2));
      await page.fill("#trCm", "Brouillon A"); await page.keyboard.press("Escape");
      await page.click("#cmTab-routes"); await page.waitForSelector("#rcRes table");
      await page.locator("#rcRes tbody tr").first().locator("button").click(); await page.waitForTimeout(150);
      check("le préremplissage remplace les champs pour cette ouverture", (await f()).cm === "Kappa");
      await page.keyboard.press("Escape"); await page.waitForTimeout(100);
      await page.click("#cmTab-sim"); await page.click("#cmOpen");
      check("brouillon d'avant restauré après un préremplissage annulé (« Brouillon A » conservé)", (await f()).cm === "Brouillon A");
      await page.fill("#trCm", ""); await page.keyboard.press("Escape"); await page.waitForTimeout(100);
      // ajout au journal
      await page.click("#cmTab-routes"); await page.waitForSelector("#rcRes table");
      await page.locator("#rcRes tbody tr").first().locator("button").click(); await page.waitForTimeout(150);
      await page.fill("#trFees", "1500"); await page.fill("#trDur", "30");
      await page.click("#trSubmit");
      await page.waitForFunction(() => /Trade ajouté au journal/.test(document.getElementById("rcMsg").textContent), null, { timeout: 5000 });
      const l = await apiList(), e = l[0] || {};
      check("« Ajouter au journal » : UNE entrée créée via l'API (cargo, date = maintenant (horloge figée de la page), durée 30, gain = 500 000 − 1 500 = 498 500)", l.length === 1 && e.type === "cargo" && e.auec === 498500 && e.dur === 30 && Math.abs(e.ts - FX.T0) < 10000, JSON.stringify(e));
      check("entrée : trade nettoyé {cm, scu, buy, sell, fees, from, to}, titre « Kappa · Terminal A (Système X) → Terminal C (Système Y) »", JSON.stringify(e.trade) === JSON.stringify({ cm: "Kappa", scu: 100, buy: 20000, sell: 25000, fees: 1500, from: "Terminal A (Système X)", to: "Terminal C (Système Y)" }) && e.title === "Kappa · Terminal A (Système X) → Terminal C (Système Y)", JSON.stringify(e.trade) + " / " + e.title);
      check("message « Trade ajouté au journal » dans la zone role=status du module Routes ; tiroir fermé, focus rendu au bouton, page non inerte", (await txt(page, "#rcMsg")) === "Trade ajouté au journal" && (await page.getAttribute("#rcMsg", "role")) === "status" && !(await drOpen(page)) && (await page.evaluate(() => document.activeElement.textContent.indexOf("Simuler ce trade") === 0 && !document.querySelector(".app").inert)));
      await page.click("#cmTab-sim"); await page.waitForTimeout(200);
      check("le résumé « 30 derniers jours » du Simulateur reflète l'ajout (+498 500 aUEC)", /\+498 500 aUEC/.test(await txt(page, "#cm30")), await txt(page, "#cm30"));
      // non-régression : tiroir du carnet
      await page.click('.tab[data-v="log"]'); await page.waitForSelector("#v-log", { state: "visible" }); await page.click("#trOpen");
      const v3 = await f();
      check("tiroir du carnet (non-régression) : vide, libellé « Ajouter au carnet », aide d'origine", (await drOpen(page)) && Object.values(v3).every(x => x === "") && (await txt(page, "#trSubmit")) === "Ajouter au carnet" && /Tout vient de votre saisie/.test(await txt(page, "#trDrD")), JSON.stringify(v3));
      await page.keyboard.press("Escape");
      // deux routes différentes : valeurs différentes
      await page.goto(on.base + "/#commerce/routes?m=alphium"); await page.waitForSelector("#rcRes table");
      await page.locator("#rcRes tbody tr").nth(1).locator("button").click(); await page.waitForTimeout(150);
      const v4 = await f(), expo = ref(FX.ROUTES_DATA, { m: "alphium" }, FX.T0)[1];
      check("deuxième route (Alphium, Terminal A → " + expo.st + ") : valeurs préremplies = celles de la ligne", v4.cm === "Alphium" && v4.scu === String(expo.scu) && v4.buy === String(expo.bp) && v4.sell === String(expo.sp) && v4.to === expo.st + " (" + expo.ss + ")", JSON.stringify(v4));
      await page.keyboard.press("Escape");
      await ctx.close();
    });

    /* ───────── 10. états des données ───────── */
    await section("états", async () => {
      const bn = page => txt(page, "#rcBanner");
      let c = await newPage(); await mock(c.page, { delay: 900 });
      await c.page.goto(on.base + "/#commerce/routes"); await c.page.waitForSelector("#rcState .mk-sk");
      check("chargement : squelette, aria-busy=true, bandeau « Chargement des données de marché… », aucun tableau", (await c.page.getAttribute("#rcWrap", "aria-busy")) === "true" && /Chargement des données de marché/.test(await bn(c.page)) && (await c.page.locator("#rcRes table").count()) === 0);
      await c.page.waitForSelector("#rcRes table"); check("fin du chargement : aria-busy=false, bandeau « Données mises à jour »", (await c.page.getAttribute("#rcWrap", "aria-busy")) === "false" && /Données mises à jour/.test(await bn(c.page)) && /Powered by UEX/.test(await bn(c.page)));
      await c.ctx.close();
      c = await newPage(); await mock(c.page, { status: 404 }); await open(c.page, on.base, "#commerce/routes", false); await c.page.waitForSelector("#rcState .mk-em");
      check("désactivé : message explicite, aucun tableau ni formulaire, bandeau « Données de marché désactivées sur ce site. »", /Données de marché désactivées/.test(await txt(c.page, "#rcState")) && /désactivées sur ce site/.test(await bn(c.page)) && (await c.page.isHidden("#rcMain")));
      await c.ctx.close();
      c = await newPage(); await open(c.page, off.base, "#commerce/routes", false); await c.page.waitForSelector("#rcState .mk-em");
      check("serveur réel sans UEX_ENABLED : même état « désactivé » (404 uex_disabled)", /Données de marché désactivées/.test(await txt(c.page, "#rcState")));
      await c.ctx.close();
      c = await newPage(); await mock(c.page, { status: 503 }); await open(c.page, on.base, "#commerce/routes", false); await c.page.waitForSelector("#rcState .mk-em");
      check("indisponible (503) sans copie : « Données UEX indisponibles », bouton « Réessayer », bandeau d'erreur", /Données UEX indisponibles/.test(await txt(c.page, "#rcState")) && (await c.page.locator("#rcState button").innerText()) === "Réessayer" && /Données UEX indisponibles/.test(await bn(c.page)));
      await c.ctx.close();
      c = await newPage(); await mock(c.page, { net: true }); await open(c.page, on.base, "#commerce/routes", false); await c.page.waitForSelector("#rcState .mk-em");
      check("réseau injoignable : « Impossible de charger les données de marché »", /Impossible de charger les données de marché/.test(await txt(c.page, "#rcState")));
      await c.ctx.close();
      c = await newPage(); await mock(c.page, { ago: 3 * 86400, stale: true }); await open(c.page, on.base, "#commerce/routes");
      check("périmé (stale, 3 j) : routes affichées, bandeau « Données anciennes… (mises à jour il y a 3 j) » avec « Vérifiez en jeu. »", /Données anciennes/.test(await bn(c.page)) && /il y a 3.j/.test(await bn(c.page)) && /Vérifiez en jeu/.test(await bn(c.page)) && (await c.page.locator("#rcRes tbody tr").count()) === 8, await bn(c.page));
      await c.ctx.close();
      // aucun résultat
      c = await newPage(); await mock(c.page); await open(c.page, on.base, "#commerce/routes?m=alphium&roi=31");
      const em = await txt(c.page, "#rcRes .mk-em");
      check("aucun résultat : message, suggestion de relâcher un filtre avec le nombre de routes obtenues, bouton « Réinitialiser les filtres »", /Aucune route ne correspond à vos filtres/.test(em) && /baisser la marge minimale \(2 routes\)/.test(em) && (await c.page.locator("#rcRes .mk-em button").innerText()) === "Réinitialiser les filtres" && (await txt(c.page, "#rcSum")) === "Aucune route pour un budget illimité et 100 SCU", em);
      await c.page.goto(on.base + "/#commerce/routes?b=100"); await c.page.reload(); await c.page.waitForSelector("#rcRes .mk-em");
      const em2 = await txt(c.page, "#rcRes .mk-em");
      check("suggestions : budget trop bas → « retirer le budget (8 routes) » et « augmenter… » seulement si utile", /retirer le budget \(8 routes\)/.test(em2) && !/baisser la marge/.test(em2), em2);
      await c.page.click("#rcRes .mk-em button"); await c.page.waitForTimeout(300);
      check("« Réinitialiser » depuis l'état vide : les 8 routes reviennent", (await c.page.locator("#rcRes tbody tr").count()) === 8);
      await c.ctx.close();
      // données sans aucune route possible (aucune ligne de prix)
      const emptyData = { commodities_prices_all: [], commodities: FX.ROUTES_DATA.commodities, terminals: FX.ROUTES_DATA.terminals, star_systems: FX.ROUTES_DATA.star_systems };
      c = await newPage(); await mock(c.page, { data: emptyData }); await open(c.page, on.base, "#commerce/routes");
      check("aucune donnée de prix : « Aucune donnée de prix », sans bouton de réinitialisation", /Aucune donnée de prix/.test(await txt(c.page, "#rcRes")) && (await c.page.locator("#rcRes button").count()) === 0);
      await c.ctx.close();
      // champ « is_illegal » non fourni
      const noIll = JSON.parse(JSON.stringify(FX.ROUTES_DATA)); noIll.commodities.forEach(x => { delete x.is_illegal; });
      c = await newPage(); await mock(c.page, { data: noIll }); await open(c.page, on.base, "#commerce/routes");
      check("is_illegal absent des données : case « légales uniquement » désactivée avec explication, routes toujours calculées", (await c.page.isDisabled("#rcL")) && /non fournie par UEX/.test(await txt(c.page, "#rcLn")) && (await c.page.getAttribute("#rcL", "aria-describedby")) === "rcLn" && (await c.page.locator("#rcRes tbody tr").count()) === 8);
      await c.ctx.close();
    });

    /* ───────── 11. pipeline réel (serveur + faux amont) et requêtes ───────── */
    await section("requêtes", async () => {
      const { ctx, page, reqs } = await newPage();
      await open(page, on.base, "#commerce/routes?f=tout");
      const exp = ref(FX.ROUTES_DATA, { f: "tout" }, FX.T0);
      check("serveur réel + faux amont UEX : mêmes routes que la référence (" + exp.length + ")", (await page.locator("#rcRes tbody tr").count()) === exp.length && (await txt(page, "#rcSum")).startsWith(exp.length + " routes"));
      const data = ["commodities_prices_all", "commodities", "terminals", "star_systems"];
      check("une ouverture = une requête par ressource (4 au total), jamais commodities_routes", data.every(r => reqs.filter(x => x === r).length === 1) && reqs.filter(x => x !== "status").length === 4 && !reqs.some(x => /routes/.test(x)), reqs.join());
      await page.waitForTimeout(600); const n0 = reqs.length;
      await setF(page, { b: 5000, m: "alphium" }); await page.click('#rcRes .mk-sb[data-k="roi"]'); await page.click("#rcReset"); await page.waitForTimeout(300);
      check("filtrer, trier, réinitialiser : aucune requête supplémentaire (calcul local)", reqs.length === n0, reqs.slice(n0).join());
      await page.click("#cmTab-sim"); await page.waitForTimeout(300); await page.click("#cmTab-routes"); await page.waitForSelector("#rcRes table"); await page.waitForTimeout(400);
      const again = reqs.slice(n0).filter(x => x !== "status");
      check("réouverture du module : au plus une requête par ressource, revalidation par ETag", again.length <= 4 && again.every(x => / \(ETag\)$/.test(x)) && new Set(again).size === again.length, again.join());
      check("faux amont : chaque ressource n'a été demandée à UEX qu'une fois (cache serveur)", FX.T0 && ["commodities_prices_all", "commodities", "terminals", "star_systems"].every(r => up.hits.filter(h => h === r).length === 1), up.hits.join());
      await ctx.close();
    });

    /* ───────── 12. mobile 390x844 ───────── */
    await section("mobile", async () => {
      const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await mock(page);
      await open(page, on.base, "#commerce/routes");
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      check("390 px : la page ne déborde pas horizontalement", m.sw <= m.iw, JSON.stringify(m));
      const card = await page.evaluate(() => { const t = document.querySelector("#rcRes .mk-t"), tr = t.querySelector("tbody tr"), td = tr.querySelectorAll("td"); return { disp: getComputedStyle(tr).display, th: t.querySelector("thead").getBoundingClientRect().height, lab: getComputedStyle(td[0], "::before").content, labAct: getComputedStyle(td[8], "::before").content, sel: getComputedStyle(document.querySelector("#rcRes .mk-ss")).display, w: t.getBoundingClientRect().width, n: td[2].dataset.l }; });
      check("sous 700 px : chaque route est une carte (display:block), en-têtes masqués visuellement, étiquettes (« Achat à », « SCU utilisés »…), pas d'étiquette sur l'action", card.disp === "block" && card.th <= 1 && /Achat à/i.test(card.lab) && card.labAct === "none" && card.sel === "grid" && card.w <= 390 && card.n === "SCU utilisés", JSON.stringify(card));
      await page.selectOption("#rc-t-s", "roi:-1");
      const first = (await rows(page))[0];
      check("« Trier par » (téléphone) : « ROI (décroissant) » applique le tri", T(first.roi) === "30,0 %" || T(first.roi) === "70,0 %", first.roi);
      const sizes = await page.evaluate(() => [...document.querySelectorAll("#cmTabs [role=tab], #rcMain input:not([type=checkbox]), #rcMain select, #rcMain button, #rcMain summary, #rcRes tbody button, #rcRes .mk-ss select")].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height)));
      check("cibles tactiles ≥ 44 px (onglets, champs, listes, boutons, résumé du bloc formules, « Simuler ce trade »)", sizes.length > 15 && Math.min.apply(null, sizes) >= 44, Math.min.apply(null, sizes) + " / " + sizes.length);
      const chk = await page.evaluate(() => [...document.querySelectorAll(".rc-chk")].map(l => Math.round(l.getBoundingClientRect().height)));
      check("cases à cocher : ligne cliquable ≥ 44 px", chk.length === 2 && Math.min.apply(null, chk) >= 44, chk.join());
      await page.locator("#rcRes tbody tr").first().locator("button").tap(); await page.waitForTimeout(500);
      const dr = await page.evaluate(() => { const r = document.getElementById("trDlg").getBoundingClientRect(); return { b: Math.abs(r.bottom - innerHeight) < 2, w: r.width, top: r.top > 0, cm: document.getElementById("trCm").value, sw: document.documentElement.scrollWidth }; });
      check("tiroir depuis une route à 390 px : volet bas, prérempli (première route du tri ROI : Alphium), sans débordement", dr.b && dr.w <= 390 && dr.cm === "Alphium" && dr.sw <= 390, JSON.stringify(dr));
      await page.keyboard.press("Escape");
      await page.fill("#rcB", "abc"); await page.waitForTimeout(350);
      check("390 px : message d'erreur visible et sans débordement", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390 && /Erreur/.test(await txt(page, "#rcB-e")));
      await page.fill("#rcB", ""); await page.fill("#rcRoi", "999"); await page.waitForTimeout(350);
      check("390 px : état « aucun résultat » sans débordement, bouton de réinitialisation ≥ 44 px", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390 && (await page.locator("#rcRes .mk-em button").boundingBox()).height >= 44);
      await ctx.close();
      // largeurs intermédiaires : la page ne doit jamais défiler horizontalement
      for (const w of [700, 768, 1024, 1100]) {
        const c = await newPage({ viewport: { width: w, height: 900 } }); await mock(c.page);
        await open(c.page, on.base, "#commerce/routes");
        const o = await c.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
        check(w + " px : la page ne déborde pas (le tableau défile dans son cadre si besoin)", o.sw <= o.iw, JSON.stringify(o));
        await c.ctx.close();
      }
    });

    /* ───────── 13. accessibilité ───────── */
    await section("accessibilité", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/routes");
      const a = await page.evaluate(() => {
        const t = document.querySelector("#rcRes .mk-t"), th = [...t.querySelectorAll("thead th")];
        const lab = [...document.querySelectorAll("#rcMain input, #rcMain select")].every(e => e.closest("label") || document.querySelector('label[for="' + e.id + '"]'));
        return { named: !!document.getElementById(t.getAttribute("aria-labelledby")), cols: th.every(x => x.getAttribute("scope") === "col"), rowh: t.querySelectorAll("tbody th[scope=row]").length, live: [...document.querySelectorAll("#cmPanel-routes [aria-live]")].map(e => e.id).sort().join(), lab,
          desc: ["rcB", "rcS", "rcRoi"].every(i => { const d = document.getElementById(i).getAttribute("aria-describedby").split(" "); return d.includes(i + "-e") && d.every(x => document.getElementById(x)); }) };
      });
      check("tableau nommé par son titre, en-têtes scope=col, en-têtes de ligne (marchandise), zones aria-live (bandeau, résumé), tous les champs étiquetés, aria-describedby valides", a.named && a.cols && a.rowh === 8 && a.live === "rcBanner,rcSum" && a.lab && a.desc, JSON.stringify(a));
      const tipBtns = await page.evaluate(() => [...document.querySelectorAll("#rcRes thead .mk-sb[data-x]")].map(b => ({ x: b.getAttribute("data-x"), d: b.getAttribute("aria-describedby"), dt: document.getElementById(b.getAttribute("aria-describedby")).textContent, hid: document.getElementById(b.getAttribute("aria-describedby")).hidden })));
      check("6 formules en info-bulle (SCU utilisés, Investissement, Revenu, Bénéfice / SCU, Bénéfice total, ROI) : description « Formule : … » référencée par aria-describedby (lue par les lecteurs d'écran)", tipBtns.length === 6 && tipBtns.every(t => t.hid && t.dt === "Formule : " + t.x) && /ROI = \(prix de vente − prix d’achat\) ÷ prix d’achat/.test(tipBtns[5].x), JSON.stringify(tipBtns.map(t => t.x)));
      check("nom accessible de la colonne = « Investissement » (la formule n'en fait pas partie : elle est en description)", (await page.getByRole("columnheader", { name: "Investissement", exact: true }).count()) === 1);
      await page.focus('#rcRes .mk-sb[data-k="inv"]');
      const tf = await page.evaluate(() => getComputedStyle(document.querySelector('#rcRes .mk-sb[data-k="inv"]'), "::after").content);
      check("info-bulle visible au FOCUS clavier : « Investissement = prix d'achat × SCU utilisés »", /Investissement = prix d’achat × SCU utilisés/.test(tf), tf);
      await page.keyboard.press("Escape");
      const tEsc = await page.evaluate(() => getComputedStyle(document.querySelector('#rcRes .mk-sb[data-k="inv"]'), "::after").display);
      check("Échap masque l'info-bulle (WCAG 1.4.13) tant que le focus reste dessus", tEsc === "none", tEsc);
      await page.focus('#rcRes .mk-sb[data-k="roi"]'); await page.mouse.move(0, 0);
      await page.hover('#rcRes .mk-sb[data-k="rev"]');
      const th = await page.evaluate(() => getComputedStyle(document.querySelector('#rcRes .mk-sb[data-k="rev"]'), "::after").content);
      check("info-bulle visible au SURVOL : « Revenu = prix de vente × SCU utilisés »", /Revenu = prix de vente × SCU utilisés/.test(th), th);
      const tipR = await page.evaluate(() => { const b = document.querySelector('#rcRes .mk-sb[data-k="roi"]'); b.focus(); const r = b.getBoundingClientRect(); return r.right <= innerWidth; });
      check("info-bulle de la dernière colonne reste dans l'écran (ancrée à droite)", tipR);
      await page.focus('#rcRes .mk-sb[data-k="tot"]');
      const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2; });
      check("focus visible (contour ≥ 2 px) sur un en-tête de tri", ring);
      await page.focus("#rcL"); const ring2 = await page.evaluate(() => { const s = getComputedStyle(document.querySelector(".rc-chk")); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2; });
      check("focus visible sur les cases à cocher (contour sur la ligne)", ring2);
      const rm = await newPage(); await rm.page.emulateMedia({ reducedMotion: "reduce" }); await mock(rm.page, { delay: 500 }); await rm.page.goto(on.base + "/#commerce/routes");
      await rm.page.waitForSelector(".mk-sk"); check("prefers-reduced-motion : squelette sans animation", (await rm.page.evaluate(() => getComputedStyle(document.querySelector(".mk-sk")).animationName)) === "none");
      await rm.ctx.close();
      await page.keyboard.press("Escape");
      await ctx.close();
    });

    /* ───────── 14. captures d'écran (facultatif : ROUTES_SHOTS=<dossier>) ───────── */
    if (SHOTS) await section("captures", async () => {
      fs.mkdirSync(SHOTS, { recursive: true });
      const shot = async (page, name, full) => { await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: !!full }); };
      for (const [vp, tag, touch] of [[{ width: 1440, height: 900 }, "1440", false], [{ width: 390, height: 844 }, "390", true]]) {
        let c = await newPage(Object.assign({ viewport: vp }, touch ? { hasTouch: true, isMobile: true } : {})); await mock(c.page);
        await open(c.page, on.base, "#commerce/routes?b=58000000&s=256");
        await shot(c.page, "routes-" + tag + "-resultats", true);
        await c.page.fill("#rcB", "abc"); await c.page.waitForTimeout(350); await shot(c.page, "routes-" + tag + "-saisie-invalide");
        await c.page.fill("#rcB", ""); await c.page.fill("#rcRoi", "999"); await c.page.waitForTimeout(350); await shot(c.page, "routes-" + tag + "-aucun-resultat", true);
        await c.page.fill("#rcRoi", "0"); await c.page.waitForTimeout(350);
        if (!touch) { await c.page.focus('#rcRes .mk-sb[data-k="inv"]'); await shot(c.page, "routes-" + tag + "-formule"); }
        await c.page.locator("#rcRes tbody tr").first().locator("button").click(); await c.page.waitForTimeout(450); await shot(c.page, "routes-" + tag + "-tiroir");
        await c.ctx.close();
        c = await newPage(Object.assign({ viewport: vp }, touch ? { hasTouch: true, isMobile: true } : {})); await mock(c.page, { status: 404 });
        await open(c.page, on.base, "#commerce/routes", false); await c.page.waitForSelector("#rcState .mk-em"); await shot(c.page, "routes-" + tag + "-desactive");
        await c.ctx.close();
      }
      check("captures enregistrées dans " + SHOTS, fs.readdirSync(SHOTS).filter(f => /^routes-/.test(f)).length >= 11);
    });

    /* ───────── 15. intégrité ───────── */
    await section("intégrité", async () => {
      const src = fs.readFileSync(path.join(ROOT, "public", "routes.js"), "utf8"), html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
      check("aucun gestionnaire en ligne, eval ni Function dans routes.js ; script chargé par <script src> avant commerce.js", !/\beval\(|new Function\(|\bon[a-z]+\s*=\s*["']/.test(src) && html.indexOf('<script src="routes.js">') > html.indexOf('<script src="market.js">') && html.indexOf('<script src="routes.js">') < html.indexOf('<script src="commerce.js">'));
      const sw = fs.readFileSync(path.join(ROOT, "public", "sw.js"), "utf8");
      check("service worker : routes.js précaché", /"routes\.js"/.test(sw));
      check("aucune donnée du jeu ni d'UEX dans le module (aucun nom de marchandise réel)", !/Agricium|Laranite|Quantanium|Hephaestanite/i.test(src));
      check("aucune erreur de script, de console ni violation CSP pendant toute la série", errors.length === 0, errors.slice(0, 5).join(" || "));
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
    servers.forEach(s => s.child.kill()); up.stop();
  }
  const ok = results.filter(Boolean).length;
  console.log("\n" + ok + "/" + results.length + " vérifications réussies");
  process.exit(ok === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
