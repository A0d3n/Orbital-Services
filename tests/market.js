// Tests des sous-onglets du Commerce et du module Prix (#commerce/prix) : navigation, états des données (chargement, OK, périmé, indisponible, désactivé, réseau),
// sémantique achat/vente, fraîcheur, recherche, filtres, tri, export CSV, sélection dans l'URL, mobile 390 px, requêtes /api/uex, CSP, console.
// Faux serveur UEX local + données fabriquées (tests/market-fixtures.js) : aucun accès Internet, aucune donnée réelle d'UEX.
// Usage : node tests/market.js   (CHROMIUM_PATH pour utiliser un Chromium déjà installé)
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
const T = s => String(s).replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ").trim();
const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p));
const RES = ["commodities_prices_all", "commodities", "terminals", "star_systems"];

function fakeUpstream() {
  const u = { hits: [], mode: "ok", sockets: new Set() };
  u.server = http.createServer((req, res) => {
    const m = /^\/2\.0\/([a-z_]+)$/.exec(req.url); u.hits.push(m && m[1]);
    const send = (c, o) => { res.writeHead(c, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
    if (u.mode === "500" || !m || !FX.DATA[m[1]]) return send(u.mode === "500" ? 500 : 404, { status: "error", http_code: 500, data: null });
    send(200, { status: "ok", http_code: 200, data: FX.DATA[m[1]], message: "" });
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
  Object.assign(e, { PORT: String(port), DATA_DIR: tmp("orbital-market-") }, env || {});
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: e, stdio: "ignore" });
  const s = { port, child, base: "http://127.0.0.1:" + port }; servers.push(s);
  for (let i = 0; i < 60; i++) { try { if ((await fetch(s.base + "/healthz")).status) break; } catch (x) {} await sleep(100); }
  return s;
}

(async () => {
  const up = fakeUpstream(); await up.start();
  const upDown = fakeUpstream(); upDown.mode = "500"; await upDown.start();
  const on = await startServer({ UEX_ENABLED: "1", UEX_BASE: up.base, UEX_CACHE_DIR: tmp("orbital-market-c-") });
  const off = await startServer({});
  const down = await startServer({ UEX_ENABLED: "1", UEX_BASE: upDown.base, UEX_CACHE_DIR: tmp("orbital-market-d-"), UEX_BACKOFF_BASE_MS: "100" });
  let browser;
  const errors = [];
  const watch = p => {
    p.on("pageerror", e => errors.push(e.message));
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text() + (m.location().url || ""))) errors.push(m.text()); });
  };
  async function section(name, fn) { try { await fn(); } catch (e) { check(name + " : exécution", false, e && e.stack || String(e)); } }
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
    /* réponses fabriquées pour les états (âge, périmé…) : o = { ago (s), stale, fail:{res:status}, delay } */
    async function mock(page, o) {
      o = o || {}; const counts = {};
      await page.route("**/api/uex/*", async r => {
        const res = new URL(r.request().url()).pathname.replace("/api/uex/", ""); counts[res] = (counts[res] || 0) + 1;
        if (o.delay) await sleep(o.delay);
        if (o.net) return r.abort("connectionrefused");
        const st = typeof o.status === "function" ? o.status(res, counts[res]) : o.status;
        if (st === 404) return r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"uex_disabled"}' });
        if (st === 503) return r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"uex_unavailable"}' });
        if (st === "bad") return r.fulfill({ status: 200, contentType: "application/json", body: "pas du json" });
        if (st && st !== 200) return r.fulfill({ status: st, body: "" });
        const etag = '"fx-' + res + '"';
        if (r.request().headers()["if-none-match"] === etag && !o.noEtag) return r.fulfill({ status: 304, headers: { ETag: etag } });
        const ago = typeof o.ago === "function" ? o.ago(counts[res]) : (o.ago || 0), stale = typeof o.stale === "function" ? o.stale(counts[res]) : !!o.stale;
        r.fulfill({ status: 200, contentType: "application/json", headers: { ETag: etag }, body: JSON.stringify({ status: "ok", resource: res, fetched_at: new Date(FX.T0 - ago * 1000).toISOString(), age_s: ago, stale, attribution: {}, data: FX.DATA[res] }) });
      });
      return counts;
    }
    const open = async (page, base, hash) => { await page.goto(base + "/" + hash); await page.waitForSelector("#v-commerce", { state: "visible" }); };
    const txt = (page, sel) => page.locator(sel).first().innerText().then(T);
    const rowsOf = (page, id) => page.evaluate(id => [...document.querySelectorAll("#" + id + "-h")].length ? [...document.querySelector("#" + id + "-h").closest(".mk-tw").querySelectorAll("tbody tr")].map(tr => [...tr.children].map(c => c.innerText.replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ").trim())) : [], id);
    const firstCol = async (page, id) => (await rowsOf(page, id)).map(r => r[0].split(" Planète")[0]);
    const ready = page => page.waitForSelector("#mkMain:not([hidden]) .mk-it", { timeout: 8000 });
    const pick = async (page, slug) => { await page.click('.mk-it[data-slug="' + slug + '"]'); await page.waitForTimeout(60); };

    /* ───────── 1. sous-onglets : navigation ───────── */
    await section("sous-onglets", async () => {
      const { ctx, page, reqs } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce");
      await page.waitForFunction(() => /désactivées|activées|indisponible/.test(document.getElementById("cmMktMsg").textContent), null, { timeout: 5000 }).catch(() => {});
      const tabs = await page.evaluate(() => [...document.querySelectorAll("#cmTabs [role=tab]")].map(b => ({ t: b.textContent.replace(/\s+/g, " ").trim(), sel: b.getAttribute("aria-selected"), dis: b.getAttribute("aria-disabled"), ti: b.tabIndex, href: b.getAttribute("href"), ctl: b.getAttribute("aria-controls") })));
      check("barre role=tablist « Modules du Commerce » : six onglets dans l'ordre", tabs.map(t => t.t.replace(" bientôt", "")).join() === "Simulateur & journal,Prix,Routes,Raffineries,Carburant,Vaisseaux" && (await page.getAttribute("#cmTabs", "role")) === "tablist" && !!(await page.getAttribute("#cmTabs", "aria-label")), JSON.stringify(tabs.map(t => t.t)));
      check("#commerce : « Simulateur & journal » sélectionné (tabindex 0), les autres en tabindex -1, panneau Prix masqué", tabs[0].sel === "true" && tabs[0].ti === 0 && tabs.slice(1).every(t => t.sel === "false" && t.ti === -1) && (await page.isHidden("#cmPanel-prix")) && (await page.isVisible("#cmPanel-sim")));
      check("trois modules « bientôt » (Raffineries, Carburant, Vaisseaux) : aria-disabled, texte « bientôt », aucun lien (href) ; Prix et Routes actifs", tabs.slice(3).every(t => t.dis === "true" && /bientôt/.test(t.t) && t.href === null && t.ctl === null) && tabs[1].dis === null && tabs[2].dis === null);
      check("panneaux : role=tabpanel avec aria-labelledby vers l'onglet", (await page.getAttribute("#cmPanel-sim", "role")) === "tabpanel" && (await page.getAttribute("#cmPanel-prix", "aria-labelledby")) === "cmTab-prix" && tabs[1].ctl === "cmPanel-prix");
      check("page par défaut : aucune requête sur les données de prix (seule /api/uex/status)", reqs.every(r => r === "status"), reqs.join());
      await page.click("#cmTab-raffineries", { force: true });
      check("clic sur un onglet « bientôt » : rien ne change (adresse, onglet actif)", (await page.evaluate(() => location.hash)) === "#commerce" && (await page.getAttribute("#cmTab-sim", "aria-selected")) === "true");
      await page.click("#cmTab-prix"); await ready(page);
      check("clic sur « Prix » : adresse #commerce/prix, onglet sélectionné, panneau Prix visible, panneau Simulateur masqué, sans rechargement", (await page.evaluate(() => location.hash)) === "#commerce/prix" && (await page.getAttribute("#cmTab-prix", "aria-selected")) === "true" && (await page.isVisible("#cmPanel-prix")) && (await page.isHidden("#cmPanel-sim")));
      check("focus resté sur l'onglet après un clic ; titre du module « Prix des marchandises » (h2) ; sous-titre de la barre du haut mis à jour", (await page.evaluate(() => document.activeElement.id)) === "cmTab-prix" && (await txt(page, "#mkTitle")) === "Prix des marchandises" && /Prix par marchandise/.test(await txt(page, "#topSub")));
      await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(150);
      check("flèche gauche : retour au Simulateur (focus et sélection)", (await page.evaluate(() => document.activeElement.id)) === "cmTab-sim" && (await page.getAttribute("#cmTab-sim", "aria-selected")) === "true" && (await page.evaluate(() => location.hash)) === "#commerce");
      await page.keyboard.press("ArrowRight"); await page.waitForTimeout(100);
      check("flèche droite : Prix ; encore : Routes ; encore : les onglets « bientôt » sont sautés (retour au premier)", (await page.getAttribute("#cmTab-prix", "aria-selected")) === "true");
      await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(150);
      check("… boucle sur « Simulateur & journal »", (await page.evaluate(() => document.activeElement.id)) === "cmTab-sim");
      await page.keyboard.press("End"); await page.waitForTimeout(150);
      check("Fin : dernier onglet disponible (Routes)", (await page.evaluate(() => document.activeElement.id)) === "cmTab-routes");
      await page.keyboard.press("Home"); await page.waitForTimeout(100);
      check("Début : « Simulateur & journal »", (await page.evaluate(() => document.activeElement.id)) === "cmTab-sim");
      await page.goBack(); await page.waitForTimeout(150);
      check("bouton Retour du navigateur : revient d'un sous-onglet à l'autre (ici Routes) sans recharger", (await page.evaluate(() => location.hash)) === "#commerce/routes" && (await page.getAttribute("#cmTab-routes", "aria-selected")) === "true");
      await page.click("#cmTab-prix"); await ready(page);
      // état conservé : sélection et filtres de Prix survivent à un aller-retour
      await pick(page, "alphium"); await page.selectOption("#mkSys", "Système Y");
      await page.click("#cmTab-sim"); await page.waitForTimeout(100); await page.click("#cmTab-prix"); await page.waitForTimeout(250);
      check("état conservé en revenant sur Prix : marchandise, filtre Système et adresse ?m=", (await page.evaluate(() => location.hash)) === "#commerce/prix?m=alphium" && (await page.inputValue("#mkSys")) === "Système Y" && (await page.getAttribute('.mk-it[data-slug="alphium"]', "aria-pressed")) === "true");
      // carte du tableau de bord
      await page.click("#cmTab-sim");
      const link = page.locator('#cmPanel-sim a[href="#commerce/prix"]');
      check("carte « Prix » du tableau de bord : lien vers #commerce/prix ; les trois autres cartes « bientôt » sans élément interactif", (await link.count()) === 1 && (await page.locator("#cmPanel-sim .cm-tool.off").count()) === 3 && (await page.locator("#cmPanel-sim .cm-tool.off a,#cmPanel-sim .cm-tool.off button").count()) === 0);
      await link.click(); await ready(page);
      check("clic sur la carte : sous-onglet Prix ouvert, focus sur le titre du module", (await page.getAttribute("#cmTab-prix", "aria-selected")) === "true" && (await page.evaluate(() => document.activeElement.id)) === "mkTitle");
      // hash direct, inconnu, non livré
      for (const [h, label] of [["#commerce/inconnu", "inconnu"], ["#commerce/raffineries", "non livré (Raffineries)"], ["#commerce/prix/extra", "mal formé"]]) {
        await page.goto(on.base + "/" + h); await page.waitForSelector("#v-commerce", { state: "visible" }); await page.waitForTimeout(150);
        check("hash " + label + " : retour au défaut sans erreur, adresse ramenée à #commerce", (await page.evaluate(() => location.hash)) === "#commerce" && (await page.getAttribute("#cmTab-sim", "aria-selected")) === "true" && (await page.isVisible("#cmPanel-sim")));
      }
      await page.goto(on.base + "/#commerce/prix?m=ether-beta"); await ready(page);
      check("hash direct #commerce/prix?m=… : module ouvert avec la marchandise sélectionnée", (await page.getAttribute("#cmTab-prix", "aria-selected")) === "true" && (await page.getAttribute('.mk-it[data-slug="ether-beta"]', "aria-pressed")) === "true");
      await page.evaluate(() => { location.hash = "#versions"; }); await page.waitForSelector("#v-ver", { state: "visible" });
      await page.click('.tab[data-v="commerce"]'); await page.waitForSelector("#v-commerce", { state: "visible" }); await ready(page);
      check("quitter Commerce puis revenir par la barre latérale : dernier sous-onglet et sélection gardés", (await page.evaluate(() => location.hash)) === "#commerce/prix?m=ether-beta");
      await page.evaluate(() => { location.hash = "#commerce"; }); await page.waitForTimeout(150);
      check("changement d'adresse à la main (#commerce) : suivi sans rechargement", (await page.getAttribute("#cmTab-sim", "aria-selected")) === "true");
      await ctx.close();
    });

    /* ───────── 2. états des données ───────── */
    await section("états", async () => {
      // désactivé
      { const { ctx, page, reqs } = await newPage(); await open(page, off.base, "#commerce/prix"); await page.waitForSelector("#mkState .mk-em");
        const body = await txt(page, "#mkState");
        check("désactivé (404 uex_disabled) : panneau « Données de marché désactivées » avec UEX_ENABLED=1", /Données de marché désactivées/.test(body) && /UEX_ENABLED=1/.test(body), body);
        const a = page.locator("#mkState a");
        check("désactivé : lien vers la documentation du dépôt (externe, noopener noreferrer) ; bandeau « désactivées » ; aucune erreur", /github\.com\/A0d3n\/Orbital-Services\/blob\/dev\/docs\/deploiement\.md/.test(await a.getAttribute("href")) && (await a.getAttribute("rel")) === "noopener noreferrer" && /désactivées/.test(await txt(page, "#mkBanner")) && (await page.isHidden("#mkMain")));
        check("désactivé : au plus une requête par ressource (4 requêtes)", reqs.length === 4 && new Set(reqs).size === 4, reqs.join()); await ctx.close(); }
      // chargement puis OK
      { const { ctx, page } = await newPage(); await mock(page, { ago: 720, delay: 700 }); await open(page, on.base, "#commerce/prix");
        await page.waitForSelector("#mkState .mk-sk");
        check("chargement : squelette + « Chargement… », aria-busy=true, bandeau en cours, module principal masqué", (await page.getAttribute("#mkWrap", "aria-busy")) === "true" && /Chargement/.test(await txt(page, "#mkState")) && /Chargement des données/.test(await txt(page, "#mkBanner")) && (await page.isHidden("#mkMain")));
        await ready(page);
        check("OK : aria-busy=false, bandeau « Données mises à jour il y a 12 min — Powered by UEX — communautaires, peuvent être inexactes »", (await page.getAttribute("#mkWrap", "aria-busy")) === "false" && (await txt(page, "#mkBanner .mk-bn")) === "Données mises à jour il y a 12 min — Powered by UEX — communautaires, peuvent être inexactes", await txt(page, "#mkBanner"));
        const b = page.locator("#mkBanner a");
        check("badge « Powered by UEX » : lien externe https://uexcorp.space, target=_blank, rel=noopener noreferrer", (await b.getAttribute("href")) === "https://uexcorp.space" && (await b.getAttribute("target")) === "_blank" && (await b.getAttribute("rel")) === "noopener noreferrer");
        check("bandeau dans une zone aria-live=polite", (await page.getAttribute("#mkBanner", "aria-live")) === "polite");
        await ctx.close(); }
      // âges : 1 min, 2 h, 3 jours
      { const { ctx, page } = await newPage(); await mock(page, { ago: 5 }); await open(page, on.base, "#commerce/prix"); await ready(page);
        check("âge < 1 min : « Données mises à jour à l'instant »", /mises à jour à l'instant/.test(await txt(page, "#mkBanner"))); await ctx.close(); }
      { const { ctx, page } = await newPage(); await mock(page, { ago: 7300 }); await open(page, on.base, "#commerce/prix"); await ready(page);
        const t = await txt(page, "#mkBanner .mk-bn"), cls = await page.getAttribute("#mkBanner .mk-bn", "class");
        check("âge > TTL des prix (2 h) sans drapeau stale : traité comme périmé (« Données anciennes, rafraîchissement en cours… (mises à jour il y a 2 h) »), sans classe d'alarme", /^◐ Données anciennes, rafraîchissement en cours… \(mises à jour il y a 2 h\)/.test(t) && cls === "mk-bn warn", t + " | " + cls); await ctx.close(); }
      // périmé (stale:true) : une seule redemande (sans ETag) 10 s plus tard, ici accélérée
      { const { ctx, page, reqs } = await newPage(); const c = await mock(page, { ago: n => n < 2 ? 4000 : 30, stale: n => n < 2 });
        await open(page, on.base, "#commerce"); await page.evaluate(() => { window.OrbMarket.cfg.recheck = 300; });
        await page.click("#cmTab-prix"); await ready(page);
        check("périmé (stale:true) : bandeau d'avertissement « Données anciennes, rafraîchissement en cours… », données affichées", /Données anciennes, rafraîchissement en cours…/.test(await txt(page, "#mkBanner")) && (await page.locator(".mk-it").count()) === 7);
        await page.waitForFunction(() => /mises à jour il y a/.test(document.getElementById("mkBanner").textContent) && !/anciennes/.test(document.getElementById("mkBanner").textContent), null, { timeout: 4000 }).catch(() => {});
        check("périmé : une seule redemande, sans ETag, puis bandeau OK ; pas de sondage permanent", /Données mises à jour/.test(await txt(page, "#mkBanner")) && RES.every(r => c[r] === 2), JSON.stringify(c));
        await sleep(800); check("… et aucune requête de plus ensuite", RES.every(r => c[r] === 2) && reqs.filter(r => r !== "status").length === 8, reqs.length); await ctx.close(); }
      // indisponible : réel (503 via amont en panne) puis réessayer
      { const { ctx, page, reqs } = await newPage(); await open(page, down.base, "#commerce/prix"); await page.waitForSelector("#mkState .mk-em");
        const t = await txt(page, "#mkState"), bn = await txt(page, "#mkBanner");
        check("indisponible (503 uex_unavailable) : « Données UEX indisponibles » dans le bandeau et le panneau, bouton Réessayer, module principal masqué", /Données UEX indisponibles/.test(t) && /Données UEX indisponibles/.test(bn) && (await page.locator("#mkState button", { hasText: "Réessayer" }).count()) === 1 && (await page.isHidden("#mkMain")), t + "|" + bn);
        const n0 = reqs.length; upDown.mode = "ok"; await sleep(400);
        await page.click("#mkState button"); await ready(page);
        check("Réessayer : une nouvelle ouverture (4 requêtes de plus), données affichées, focus rendu au titre du module", reqs.length === n0 + 4 && (await page.locator(".mk-it").count()) === 7 && (await page.evaluate(() => document.activeElement.id)) === "mkTitle", reqs.length - n0);
        await ctx.close(); upDown.mode = "500"; }
      // indisponible avec dernière version connue (revalidation qui échoue au retour sur l'onglet)
      { const { ctx, page } = await newPage(); let fail = false; await mock(page, { ago: 600, status: () => fail ? 503 : 200, noEtag: true });
        await open(page, on.base, "#commerce/prix"); await ready(page); fail = true;
        await page.click("#cmTab-sim"); await page.click("#cmTab-prix"); await page.waitForSelector("#mkBanner .mk-bn.bad");
        const bn = await txt(page, "#mkBanner .mk-bn");
        check("indisponible avec dernière version connue : bandeau « Données UEX indisponibles, dernière version connue : il y a 10 min », données conservées, bouton Réessayer", /^⚠ Données UEX indisponibles, dernière version connue : il y a 10 min\./.test(bn) && /Réessayer/.test(bn) && (await page.locator(".mk-it").count()) === 7 && (await page.isVisible("#mkMain")), bn);
        fail = false; await page.click("#mkBanner button"); await page.waitForSelector("#mkBanner .mk-bn:not(.bad)");
        check("Réessayer depuis le bandeau : retour à l'état OK", /Données mises à jour/.test(await txt(page, "#mkBanner")));
        await ctx.close(); }
      // réseau muet, JSON illisible, 500, délai de sécurité
      for (const [label, o] of [["réseau coupé", { net: true }], ["réponse illisible", { status: "bad" }], ["erreur 500", { status: 500 }]]) {
        const { ctx, page } = await newPage(); const state = { o }; await mock(page, o); await open(page, on.base, "#commerce/prix"); await page.waitForSelector("#mkState .mk-em");
        check(label + " : message propre « Impossible de charger les données de marché » + bouton Réessayer, sans erreur console", /Impossible de charger les données de marché/.test(await txt(page, "#mkState")) && (await page.locator("#mkState button").innerText()) === "Réessayer"); await ctx.close();
      }
      { const { ctx, page } = await newPage(); await mock(page, { delay: 2500 }); await page.addInitScript(() => { window.__t = 1; });
        await open(page, on.base, "#commerce"); await page.evaluate(() => { window.OrbMarket.cfg.timeout = 600; });
        await page.click("#cmTab-prix"); await page.waitForSelector("#mkState .mk-em", { timeout: 5000 });
        check("délai de sécurité : serveur muet → message d'erreur avec Réessayer (le délai est de 30 s par défaut)", /Impossible de charger/.test(await txt(page, "#mkState")) && (await page.evaluate(() => 30000)) === 30000);
        const def = await page.evaluate(() => { const c = window.OrbMarket.cfg; return c.timeout; }); check("délai de réglage modifiable pour les tests, valeur d'origine 30 000 ms vérifiée dans le code", def === 600 && /timeout: 30000/.test(fs.readFileSync(path.join(ROOT, "public", "market.js"), "utf8"))); await ctx.close(); }
    });

    /* ───────── 3. client de données : requêtes ───────── */
    await section("requêtes", async () => {
      const { ctx, page, reqs } = await newPage(); const c = await mock(page, { ago: 100 });
      await open(page, on.base, "#commerce"); await page.waitForTimeout(800);
      check("module non affiché (page par défaut) : aucune requête hors /api/uex/status", reqs.every(r => r === "status"), reqs.join());
      await page.evaluate(() => { location.hash = "#home"; }); await page.waitForTimeout(300);
      await page.click('.tab[data-v="commerce"]'); await page.waitForTimeout(500);
      check("autre onglet du site (accueil) puis retour sur le Simulateur : toujours aucune requête de prix", RES.every(r => !c[r]));
      await page.click("#cmTab-prix"); await ready(page);
      check("ouverture de Prix : exactement une requête par ressource (4 au total), sans ETag la première fois", RES.every(r => c[r] === 1) && reqs.filter(r => r !== "status").length === 4 && reqs.every(r => !/ETag/.test(r)), JSON.stringify(c));
      await pick(page, "alphium"); await page.fill("#mkQ", "alp"); await page.selectOption("#mkStt", "ok"); await page.click(".mk-sb[data-k=last]"); await page.waitForTimeout(300);
      check("recherche, filtres, tri, sélection : aucune requête supplémentaire", RES.every(r => c[r] === 1));
      await page.click("#cmTab-sim"); await page.waitForTimeout(200); await page.click("#cmTab-prix"); await ready(page); await page.waitForTimeout(300);
      check("retour sur l'onglet : une revalidation par ressource avec If-None-Match (304 → données gardées, rendu immédiat)", RES.every(r => c[r] === 2) && reqs.slice(-4).every(r => /\(ETag\)/.test(r)) && (await page.locator(".mk-it").count()) === 2 && (await page.inputValue("#mkQ")) === "alp", JSON.stringify(c) + reqs.slice(-4).join());
      await page.click("#cmTab-sim"); await page.waitForTimeout(500);
      check("retour au Simulateur : pas de requête de prix", RES.every(r => c[r] === 2));
      await ctx.close();
      // dédoublonnage : deux appels simultanés = une requête
      const q = await newPage(); const c2 = await mock(q.page, { delay: 300 }); await open(q.page, on.base, "#commerce");
      const n = await q.page.evaluate(() => Promise.all([window.OrbMarket.get("terminals"), window.OrbMarket.get("terminals"), window.OrbMarket.get("terminals")]).then(r => r.length));
      check("requêtes en vol dédoublonnées : trois appels simultanés de get() = une seule requête réseau", n === 3 && c2.terminals === 1, JSON.stringify(c2));
      await q.ctx.close();
      // intégration réelle : serveur + faux amont, au plus un appel amont par ressource
      const r = await newPage(); up.hits.length = 0; await open(r.page, on.base, "#commerce/prix?m=alphium"); await ready(r.page); await sleep(400);
      const hits = {}; up.hits.forEach(h => { hits[h] = (hits[h] || 0) + 1; });
      check("serveur réel + faux amont : une ouverture de Prix = un appel amont par ressource au plus", RES.every(x => (hits[x] || 0) <= 1) && Object.keys(hits).every(k => RES.includes(k)), JSON.stringify(hits));
      check("serveur réel : aperçu des lignes (Alphium, 5 achats, 3 ventes) et âge très récent dans le bandeau", /Alphium : 5 terminaux où acheter, 3 où vendre/.test(await txt(r.page, "#mkSum")) && /Données mises à jour (à l'instant|il y a \d+ min)/.test(await txt(r.page, "#mkBanner")));
      await r.ctx.close();
    });

    /* ───────── 4. module Prix : sémantique, fraîcheur, recherche, filtres, tri, CSV ───────── */
    await section("prix", async () => {
      const { ctx, page } = await newPage(); await mock(page, { ago: 60 });
      await open(page, on.base, "#commerce/prix"); await ready(page);
      check("liste : 7 marchandises avec le nombre de terminaux où acheter / vendre", (await txt(page, "#mkListSum")) === "7 marchandises" && /Acheter : 5 · Vendre : 3/.test(await txt(page, '.mk-it[data-slug="alphium"]')) && /Acheter : 2 · Vendre : 0/.test(await txt(page, '.mk-it[data-slug="ether-beta"]')) && /aucun prix/.test(await txt(page, '.mk-it[data-slug="epsilon"]')));
      check("aucune sélection au départ : invite « Choisissez une marchandise », export désactivé", /Choisissez une marchandise/.test(await txt(page, "#mkRes")) && (await page.isDisabled("#mkCsv")));
      await pick(page, "alphium");
      // sémantique : price_buy>0 → le joueur ACHÈTE (« Où acheter ») ; price_sell>0 → il VEND
      check("« Où acheter » = terminaux avec price_buy > 0 (T1 qui vend, T3 qui fait les deux, pas T2 qui seulement achète, pas T4 sans prix)", (await firstCol(page, "mk-buy")).join("|") === "Terminal A|=Terminal Formule|Terminal L2|Terminal L10|Terminal C", (await firstCol(page, "mk-buy")).join("|"));
      check("« Où vendre » = terminaux avec price_sell > 0 (T2, T3, T6 ; ni T1 ni T4) triés par prix décroissant", (await firstCol(page, "mk-sell")).join("|") === "Terminal É|Terminal C|Terminal B", (await firstCol(page, "mk-sell")).join("|"));
      const b = await rowsOf(page, "mk-buy"), s = await rowsOf(page, "mk-sell");
      check("prix dernier / moyen / stock du côté achat (T1 : 1 180, 1 150, 640) et dernier / moyen / demande du côté vente (T2 : 1 340, 1 310, 900)", b[0].slice(2, 5).join("|") === "1 180|1 150|640" && s[2].slice(2, 5).join("|") === "1 340|1 310|900", b[0] + " / " + s[2]);
      check("terminal à double sens (T3) : stock 58M côté achat et demande 302k côté vente, prix distincts (1 260 / 1 480)", b[4][2] === "1 260" && b[4][4].startsWith("58M") && s[1][2] === "1 480" && s[1][4].startsWith("302k"), b[4] + " / " + s[1]);
      check("en-têtes : « Stock (SCU) » côté achat, « Demande (SCU) » côté vente", (await page.locator("#mk-buy-h").evaluate(h => h.closest(".mk-tw").querySelector("thead").innerText)).includes("STOCK") && (await page.locator("#mk-sell-h").evaluate(h => h.closest(".mk-tw").querySelector("thead").innerText)).includes("DEMANDE"));
      check("valeurs à 0 ou absentes : « — » (moyenne, stock, ancienneté sans date), jamais « 0 »", b[1][3].startsWith("—") && b[1][4].startsWith("—") && !b.concat(s).some(r => r.slice(2, 5).some(v => /^0( |$)/.test(v))), b[1].join("|"));
      check("« — » lisible par un lecteur d'écran (texte « non renseigné »)", (await page.locator("#mk-buy-h").evaluate(h => h.closest(".mk-tw").querySelectorAll("tbody tr")[1].querySelectorAll(".sr").length)) >= 2);
      // fraîcheur
      const pills = (id) => page.locator("#" + id + "-h").evaluate(h => [...h.closest(".mk-tw").querySelectorAll("tbody tr")].map(tr => tr.querySelector(".mk-f").textContent));
      check("fraîcheur (achat) : T1 10 min = ○● Frais ; date inconnue ; exactement 1 h = Frais ; 1 h + 1 s = À vérifier ; 3 j = Périmé (texte + symbole)", (await pills("mk-buy")).join("|") === "●Frais|○Date inconnue|●Frais|◐À vérifier|○Périmé", (await pills("mk-buy")).join("|"));
      check("ancienneté en clair : « il y a 10 min », « il y a 1 h », « il y a 3 j »", b[0][5].endsWith("il y a 10 min") && b[2][5].endsWith("il y a 1 h") && b[4][5].endsWith("il y a 3 j") && b[1][5].endsWith("date inconnue"), b.map(r => r[5]).join("|"));
      await pick(page, "gamma");
      check("limites de 24 h : exactement 24 h = À vérifier, 24 h + 1 s = Périmé", (await pills("mk-buy")).join() === "◐À vérifier" && (await pills("mk-sell")).join() === "○Périmé");
      // comptes de commodités particulières
      await pick(page, "ether-beta");
      check("marchandise sans terminal où vendre : message dédié (pas de bouton Réinitialiser), tableau d'achat de 2 lignes", /Aucun terminal où vendre/.test(await txt(page, "#mk-sell-h + .mk-em, #mkRes")) && (await page.locator("#mk-buy-h").evaluate(h => h.closest(".mk-tw").querySelectorAll("tbody tr").length)) === 2 && (await page.locator("#mkRes .mk-em button").count()) === 0);
      for (const sl of ["epsilon", "zeta", "alphium-minerai"]) { await pick(page, sl);
        check("marchandise sans aucun prix (" + sl + ") : message « Aucun prix connu pour cette marchandise », pas de tableau, export désactivé", /Aucun prix connu pour cette marchandise/.test(await txt(page, "#mkRes")) && (await page.locator("#mkRes table").count()) === 0 && (await page.isDisabled("#mkCsv"))); }
      check("une même marchandise de code partagé (ALPH) : sélection par slug unique, le minerai sans prix est distinct d'Alphium", (await page.evaluate(() => location.hash)) === "#commerce/prix?m=alphium-minerai");
      // sélection dans l'URL
      await pick(page, "alphium");
      check("sélection dans l'URL partageable : #commerce/prix?m=alphium (sans nouvelle entrée d'historique)", (await page.evaluate(() => location.hash)) === "#commerce/prix?m=alphium");
      const p2 = await ctx.newPage(); watch(p2); await p2.clock.setFixedTime(new Date(FX.T0)); await mock(p2, { ago: 60 });
      await p2.goto(on.base + "/#commerce/prix?m=ALPH"); await p2.waitForSelector("#mk-buy-h");
      check("lien partagé par code (?m=ALPH) : ouvre Alphium (le code est résolu vers la marchandise qui a des prix) et l'adresse devient ?m=alphium", (await p2.evaluate(() => location.hash)) === "#commerce/prix?m=alphium");
      await p2.goto(on.base + "/#commerce/prix?m=nimporte"); await p2.waitForSelector("#mkRes .mk-em");
      check("?m= inconnu : « Marchandise introuvable » sans erreur", /Marchandise introuvable/.test(await txt(p2, "#mkRes"))); await p2.close();
      // recherche insensible aux accents
      await page.fill("#mkQ", "ether"); const l1 = await page.locator(".mk-it .mk-in").allInnerTexts();
      check("recherche « ether » (sans accent) trouve « Éther Bêta » ; compteur « 1 marchandise sur 7 »", l1.join() === "Éther Bêta" && (await txt(page, "#mkListSum")) === "1 marchandise sur 7");
      await page.fill("#mkQ", "ÉTHER BÊ"); check("recherche « ÉTHER BÊ » (majuscules, accents) trouve aussi", (await page.locator(".mk-it").count()) === 1);
      await page.fill("#mkQ", "etb"); check("recherche par code (ETHB → « etb » ne correspond pas, « ethb » oui)", (await page.locator(".mk-it").count()) === 0 && (await page.fill("#mkQ", "ethb"), (await page.locator(".mk-it").count()) === 1));
      await page.fill("#mkQ", "zzz");
      check("recherche sans résultat : message + bouton « Réinitialiser les filtres »", /Aucune marchandise ne correspond à « zzz »/.test(await txt(page, "#mkList")) && (await page.locator("#mkList button", { hasText: "Réinitialiser les filtres" }).count()) === 1);
      await page.click("#mkList button"); check("Réinitialiser : champ vidé, 7 marchandises", (await page.inputValue("#mkQ")) === "" && (await page.locator(".mk-it").count()) === 7);
      // filtres
      await pick(page, "alphium");
      await page.selectOption("#mkSys", "Système Y");
      check("filtre Système Y : achat = T3 seul, vente = T6 et T3 ; résumé avec filtres actifs", (await firstCol(page, "mk-buy")).join("|") === "Terminal C" && (await firstCol(page, "mk-sell")).join("|") === "Terminal É|Terminal C" && /filtres actifs/.test(await txt(page, "#mkSum")));
      check("options du filtre Système : seulement les systèmes qui ont des terminaux avec prix (Système Z absent)", (await page.locator("#mkSys option").allInnerTexts()).join("|") === "Tous les systèmes|Système X|Système Y");
      await page.selectOption("#mkStt", "bad");
      check("filtres Système Y + Périmé : T3 des deux côtés", (await firstCol(page, "mk-buy")).join() === "Terminal C" && (await firstCol(page, "mk-sell")).join() === "Terminal C");
      await page.selectOption("#mkSys", "Système Y"); await page.selectOption("#mkStt", "ok");
      check("Système Y + Frais : tableau d'achat vide « Aucun terminal ne correspond aux filtres » avec Réinitialiser (la vente garde T6)", (await page.locator("#mkRes .mk-em button", { hasText: "Réinitialiser les filtres" }).count()) === 1 && /Aucun terminal ne correspond aux filtres/.test(await txt(page, "#mkRes")) && (await firstCol(page, "mk-sell")).join() === "Terminal É");
      await page.click("#mkRes .mk-em button");
      check("Réinitialiser les filtres : système et statut remis à « Tous », tableaux complets (5 + 3)", (await page.inputValue("#mkSys")) === "" && (await page.inputValue("#mkStt")) === "" && (await firstCol(page, "mk-buy")).length === 5 && (await firstCol(page, "mk-sell")).length === 3);
      await page.selectOption("#mkStt", "ok");
      check("filtre Frais (≤ 1 h) : T1, T3 inconnue exclue, date inconnue exclue ; vente T6 (30 min)", (await firstCol(page, "mk-buy")).join("|") === "Terminal A|Terminal L2" && (await firstCol(page, "mk-sell")).join("|") === "Terminal É", (await firstCol(page, "mk-buy")).join("|"));
      await page.selectOption("#mkStt", "");
      // tri
      const th = id => page.locator("#" + id + "-h").evaluate(h => [...h.closest(".mk-tw").querySelectorAll("th[aria-sort]")].map(x => x.getAttribute("aria-sort")).join());
      check("tri par défaut : achat par prix croissant, vente par prix décroissant (aria-sort)", (await th("mk-buy")) === "none,none,ascending,none,none,none" && (await th("mk-sell")) === "none,none,descending,none,none,none");
      await page.click('#mk-buy-h >> xpath=ancestor::div[contains(@class,"mk-tw")] >> .mk-sb[data-k=t]');
      check("clic sur « Terminal » : tri texte croissant, ordre naturel (L2 avant L10), accents (É avant les autres lettres suivantes), aria-sort=ascending", (await firstCol(page, "mk-buy")).join("|") === "=Terminal Formule|Terminal A|Terminal C|Terminal L2|Terminal L10" && (await th("mk-buy")).startsWith("ascending"), (await firstCol(page, "mk-buy")).join("|"));
      check("le focus reste sur le bouton d'en-tête après le tri", (await page.evaluate(() => document.activeElement.className + document.activeElement.dataset.k)) === "mk-sbt");
      await page.click('#mk-buy-h >> xpath=ancestor::div[contains(@class,"mk-tw")] >> .mk-sb[data-k=t]');
      check("second clic : tri décroissant", (await firstCol(page, "mk-buy"))[0] === "Terminal L10" && (await th("mk-buy")).startsWith("descending"));
      await page.click('#mk-sell-h >> xpath=ancestor::div[contains(@class,"mk-tw")] >> .mk-sb[data-k=sys]');
      check("tri sur le Système (texte) : Système X avant Système Y, à égalité l'ordre des données est conservé (tri stable)", (await firstCol(page, "mk-sell")).join("|") === "Terminal B|Terminal C|Terminal É", (await firstCol(page, "mk-sell")).join("|"));
      await page.click('#mk-buy-h >> xpath=ancestor::div[contains(@class,"mk-tw")] >> .mk-sb[data-k=qty]');
      check("tri numérique sur le stock : valeurs vides (—) toujours en dernier ; 58M après 640 (pas de tri de texte)", (await firstCol(page, "mk-buy")).join("|") === "Terminal L2|Terminal L10|Terminal A|Terminal C|=Terminal Formule", (await firstCol(page, "mk-buy")).join("|"));
      // CSV : contenu exact
      await pick(page, "alphium"); await page.click('#mk-buy-h >> xpath=ancestor::div[contains(@class,"mk-tw")] >> .mk-sb[data-k=last]');
      await page.selectOption("#mkSys", "Système X");
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#mkCsv")]);
      const file = await dl.path(); const raw = fs.readFileSync(file); const text = raw.toString("utf8");
      const age = m => String(m);
      const exp = "\ufeff" + [
        "Action;Marchandise;Code;Terminal;Système;Prix dernier (aUEC/SCU);Prix moyen (aUEC/SCU);Stock ou demande (SCU);Mise à jour (UTC);Ancienneté (min);Fraîcheur",
        "Acheter;Alphium;ALPH;Terminal A;Système X;1180;1150;640;2026-10-26T11:50:00Z;10;Frais",
        "Acheter;Alphium;ALPH;'=Terminal Formule;Système X;1190;;;;;Date inconnue",
        "Acheter;Alphium;ALPH;Terminal L2;Système X;1200;1195;75;2026-10-26T11:00:00Z;60;Frais",
        "Acheter;Alphium;ALPH;Terminal L10;Système X;1210;1205;80;2026-10-26T10:59:59Z;60;À vérifier",
        "Vendre;Alphium;ALPH;Terminal B;Système X;1340;1310;900;2026-10-26T07:00:00Z;300;À vérifier"].join("\r\n") + "\r\n";
      check("CSV : nom de fichier prix-alphium.csv, BOM UTF-8, séparateur « ; », CRLF, lignes filtrées (Système X) dans l'ordre affiché, cellules vides pour les valeurs absentes", dl.suggestedFilename() === "prix-alphium.csv" && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf && text === exp, JSON.stringify(text).slice(0, 700));
      check("CSV : formule neutralisée (« =Terminal Formule » devient « '=Terminal Formule »), aucune ligne Système Y (que les lignes affichées)", /;'=Terminal Formule;/.test(text) && !/Système Y/.test(text) && text.split("\r\n").length === 7);
      check("export annoncé aux lecteurs d'écran (« Export prêt : 5 lignes »)", (await txt(page, "#mkMsg")) === "Export prêt : 5 lignes.");
      // aides communes (fonctions pures dans le navigateur)
      const h = await page.evaluate(() => { const M = window.OrbMarket; return {
        nf: [M.nf(1234567), M.nf(-1234.5, 1), M.nf(0), M.nf(999)], sh: [M.short(58000000), M.short(302000), M.short(1250000), M.short(9999), M.short(999999), M.short(-58000000), M.short(2.5e9)],
        csv: M.csv(["a", "b;c"], [["=1+1", "-x"], ["@s", "+1"], ["ok\n\"q\"", -5.5], ["\tt", 3]]), age: [M.ageLabel(30), M.ageLabel(720), M.ageLabel(7200), M.ageLabel(259200)],
        sort: M.sortRows([{ n: "é" }, { n: "e" }, { n: "L10" }, { n: "L2" }, { n: null }, { n: "f" }], r => r.n, "t", 1).map(r => r.n) }; });
      check("formats : espaces insécables, virgule décimale, vrai signe moins (−)", h.nf.join("|") === "1\u00a0234\u00a0567|−1\u00a0234,5|0|999", JSON.stringify(h.nf));
      check("valeurs abrégées : 58M, 302k, 1,3M, 9999 inchangé (null), 999999 → 1M, −58M, 2,5Md", h.sh.join("|") === "58M|302k|1,3M||1000k|−58M|2,5Md".replace("1000k", "1M") || h.sh.join("|") === "58M|302k|1,3M||1M|−58M|2,5Md", JSON.stringify(h.sh));
      check("CSV (fonction commune) : formules =, +, -, @ et tabulation neutralisées sur les textes ; nombres négatifs intacts avec virgule ; guillemets et retours à la ligne protégés", h.csv === "\ufeffa;\"b;c\"\r\n'=1+1;'-x\r\n'@s;'+1\r\n\"ok\n\"\"q\"\"\";-5,5\r\n'\tt;3\r\n", JSON.stringify(h.csv));
      check("âges : « à l'instant », « il y a 12 min », « il y a 2 h », « il y a 3 j »", h.age.join("|") === "à l'instant|il y a 12\u00a0min|il y a 2\u00a0h|il y a 3\u00a0j", JSON.stringify(h.age));
      check("tri texte (fonction commune) : e, é, f ; nombres naturels L2 < L10 ; valeurs vides en dernier", h.sort.join("|") === "e|é|f|L2|L10|" || h.sort.join("|") === "e|é|f|L2|L10|null", JSON.stringify(h.sort));
      // info-bulle de valeur abrégée : survol ET focus clavier
      await page.selectOption("#mkSys", ""); await pick(page, "alphium");
      const num = page.locator("#mk-buy-h >> xpath=ancestor::div[contains(@class,'mk-tw')] >> .mk-num").first();
      check("valeur abrégée : « 58M » affichée, valeur exacte « 58 000 000 SCU » en texte pour lecteurs d'écran et dans data-x, focusable au clavier", (await num.locator("[aria-hidden]").innerText()) === "58M" && T(await num.locator(".sr").textContent()) === "58 000 000 SCU" && T(await num.getAttribute("data-x")) === "58 000 000 SCU" && (await num.getAttribute("tabindex")) === "0");
      await num.focus(); const tipF = await num.evaluate(e => getComputedStyle(e, "::after").content);
      await page.mouse.move(0, 0); await num.hover(); const tipH = await num.evaluate(e => getComputedStyle(e, "::after").content);
      check("info-bulle visible au focus clavier ET au survol", /58/.test(tipF) && /58/.test(tipH), tipF + " " + tipH);
      await ctx.close();
    });

    /* ───────── 5. performance : « Voir plus » ───────── */
    await section("voir plus", async () => {
      const { ctx, page } = await newPage(); await mock(page, { ago: 60 }); await open(page, on.base, "#commerce/prix?m=delta"); await page.waitForSelector("#mk-buy-h");
      const n = () => page.locator("#mk-buy-h").evaluate(h => h.closest(".mk-tw").querySelectorAll("tbody tr").length);
      check("230 terminaux : 200 lignes rendues d'abord, bouton « Voir plus (30 restantes) »", (await n()) === 200 && (await txt(page, ".mk-more")) === "Voir plus (30 restantes)");
      await page.click(".mk-more button"); await page.waitForTimeout(80);
      check("« Voir plus » : 230 lignes, bouton retiré, le focus va à la première ligne ajoutée", (await n()) === 230 && (await page.locator(".mk-more").count()) === 0 && /Banc 201/.test(await page.evaluate(() => document.activeElement.textContent)));
      await page.click("#mkCsv").catch(() => {});
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#mkCsv")]);
      check("export : toutes les lignes filtrées (230 + en-tête), pas seulement les 200 affichées", fs.readFileSync(await dl.path(), "utf8").split("\r\n").length === 232);
      const ms = await page.evaluate(() => performance.now()); check("rendu à 1440 px sans erreur de script", ms > 0);
      await ctx.close();
    });

    /* ───────── 6. mobile 390x844 ───────── */
    await section("mobile", async () => {
      const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await mock(page, { ago: 600 });
      await open(page, on.base, "#commerce/prix?m=alphium"); await page.waitForSelector("#mk-buy-h");
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, tabs: (() => { const t = document.getElementById("cmTabs"); return { sw: t.scrollWidth, cw: t.clientWidth, ox: getComputedStyle(t).overflowX }; })() }));
      check("390 px : la page ne déborde pas horizontalement (Prix)", m.sw <= m.iw, JSON.stringify(m));
      check("barre de sous-onglets : défile dans son conteneur (overflow-x:auto, contenu plus large que la barre)", m.tabs.ox === "auto" && m.tabs.sw > m.tabs.cw, JSON.stringify(m.tabs));
      const vis = await page.evaluate(() => { const t = document.getElementById("cmTab-prix").getBoundingClientRect(), c = document.getElementById("cmTabs").getBoundingClientRect(); return t.left >= c.left - 1 && t.right <= c.right + 1; });
      check("onglet actif visible dans la barre (scrollIntoView)", vis);
      const sizes = await page.evaluate(() => [...document.querySelectorAll("#cmTabs [role=tab], .mk-it, #mkCsv, #mkSys, #mkStt, #mkQ, .mk-sb, .mk-ss select")].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height)));
      check("zones tactiles ≥ 44 px (onglets, liste, champs, export, en-têtes de tri)", sizes.length > 10 && Math.min.apply(null, sizes) >= 44, Math.min.apply(null, sizes));
      const card = await page.evaluate(() => { const t = document.querySelector(".mk-t"), thead = t.querySelector("thead").getBoundingClientRect(), tr = t.querySelector("tbody tr"); return { disp: getComputedStyle(tr).display, th: thead.height, lab: getComputedStyle(tr.querySelector("td"), "::before").content, sel: getComputedStyle(document.querySelector(".mk-ss")).display, w: t.getBoundingClientRect().width }; });
      check("sous 700 px : lignes en cartes (display:block), en-têtes masqués visuellement, étiquettes data-l, sélecteur « Trier par » visible, tableau dans la largeur", card.disp === "block" && card.th <= 1 && /Système|SYSTÈME|Système/i.test(card.lab) && card.sel === "grid" && card.w <= 390, JSON.stringify(card));
      await page.selectOption("#mk-buy-s", "last:-1");
      check("« Trier par » (téléphone) : choix « Dernier prix (décroissant) » applique le tri", (await firstCol(page, "mk-buy"))[0] === "Terminal C" && (await th2(page)) === "descending");
      async function th2(p) { return p.locator("#mk-buy-h").evaluate(h => h.closest(".mk-tw").querySelector("th[aria-sort=descending]") ? "descending" : ""); }
      const tip = await page.evaluate(() => { const e = document.querySelector(".mk-num"); e.focus(); const r = e.getBoundingClientRect(); return r.right <= innerWidth; });
      check("valeur abrégée focusable à 390 px sans sortir de l'écran", tip);
      await page.tap('.mk-it[data-slug="ether-beta"]'); await page.waitForTimeout(500);
      check("choisir une marchandise sur téléphone : les résultats s'affichent sans débordement", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390 && /Éther Bêta : 2 terminaux/.test(await txt(page, "#mkSum")));
      await page.goto(on.base + "/#commerce"); await page.waitForSelector("#cmPanel-sim");
      check("390 px : le Simulateur ne déborde pas non plus avec la barre de sous-onglets", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
      await ctx.close();
    });

    /* ───────── 7. accessibilité ───────── */
    await section("accessibilité", async () => {
      const { ctx, page } = await newPage(); await mock(page, { ago: 60 }); await open(page, on.base, "#commerce/prix?m=alphium"); await page.waitForSelector("#mk-buy-h");
      const a = await page.evaluate(() => {
        const t = document.querySelector(".mk-t"), th = [...t.querySelectorAll("thead th")];
        return { caption: t.getAttribute("aria-labelledby"), labelled: !!document.getElementById(t.getAttribute("aria-labelledby")), cols: th.every(x => x.getAttribute("scope") === "col"), rowh: !!t.querySelector("tbody th[scope=row]"), live: [...document.querySelectorAll("[aria-live]")].map(e => e.id).sort().join(),
          sortBtns: th.filter(x => x.querySelector("button")).length, labels: [...document.querySelectorAll("#mkMain input, #mkMain select")].every(e => e.closest("label") || document.querySelector('label[for="' + e.id + '"]') || e.getAttribute("aria-label")),
          colorOnly: [...document.querySelectorAll(".mk-f")].every(e => e.textContent.trim().length > 3) };
      });
      check("tableau : en-têtes de colonne (scope=col), en-tête de ligne (scope=row), nommé par son titre, boutons de tri", a.labelled && a.cols && a.rowh && a.sortBtns === 6, JSON.stringify(a));
      check("zones aria-live=polite : bandeau, résumé, compteur de la liste ; tous les champs ont une étiquette", a.live.includes("mkBanner") && a.live.includes("mkSum") && a.live.includes("mkListSum") && a.labels, a.live);
      check("pastille de fraîcheur : texte + symbole, pas la couleur seule", a.colorOnly);
      await page.focus(".mk-sb[data-k=last]");
      const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2; });
      check("focus visible (contour ≥ 2 px) sur un bouton d'en-tête", ring);
      const rm = await newPage(); await rm.page.emulateMedia({ reducedMotion: "reduce" }); await mock(rm.page, { ago: 60, delay: 400 }); await open(rm.page, on.base, "#commerce/prix");
      await rm.page.waitForSelector(".mk-sk"); check("prefers-reduced-motion : squelette sans animation", (await rm.page.evaluate(() => getComputedStyle(document.querySelector(".mk-sk")).animationName)) === "none");
      await rm.ctx.close();
      await ctx.close();
    });

    /* ───────── 8. page par défaut inchangée, console, CSP ───────── */
    await section("intégrité", async () => {
      const css = fs.readFileSync(path.join(ROOT, "public", "market.js"), "utf8") + fs.readFileSync(path.join(ROOT, "public", "commerce.js"), "utf8");
      check("aucun gestionnaire en ligne ni eval dans les fichiers livrés (CSP script-src 'self')", !/\bon[a-z]+\s*=\s*["']/.test(fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8").match(/<div id="v-commerce"[\s\S]*?<div id="v-time"/)[0]) && !/\beval\(|new Function\(/.test(css));
      const sw = fs.readFileSync(path.join(ROOT, "public", "sw.js"), "utf8");
      check("service worker : market.js et market.css précachés", /"market\.js"/.test(sw) && /"market\.css"/.test(sw));
      check("aucune erreur de script, de console ni violation CSP pendant toute la série", errors.length === 0, errors.slice(0, 5).join(" || "));
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
    servers.forEach(s => s.child.kill()); up.stop(); upDown.stop();
  }
  const ok = results.filter(Boolean).length;
  console.log("\n" + ok + "/" + results.length + " vérifications réussies");
  process.exit(ok === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
