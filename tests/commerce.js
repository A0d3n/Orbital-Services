// Tests de l'onglet « Commerce » (#commerce) : navigation (latérale et barre du bas), cartes-outils, résumé des 30 derniers jours,
// derniers trades, tiroir de simulation avec « Ajouter au journal », mise à jour depuis le carnet, mobile 390 px, CSP, requêtes.
// Usage : node tests/commerce.js   (CHROMIUM_PATH pour utiliser un Chromium déjà installé)
"use strict";
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path"), net = require("net");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const results = [];
const check = (name, ok, extra) => { results.push(!!ok); console.log((ok ? "  ok   " : "  ÉCHEC ") + name + (ok || extra === undefined ? "" : " → " + extra)); };
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const J = { "Content-Type": "application/json" };
const T = s => String(s).replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ").trim();
const MINUS = "\u2212";
const netOf = t => t.scu * t.sell - t.scu * t.buy - t.fees;

(async () => {
  const port = await freePort();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "orbital-commerce-"));
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: data }), stdio: "ignore" });
  const base = "http://127.0.0.1:" + port;
  let browser;
  const errors = [];
  const watch = (p, tag) => {
    p.on("pageerror", e => errors.push(tag + e.message));
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text() + (m.location().url || ""))) errors.push(tag + m.text()); });
  };
  const api = {
    list: async () => (await fetch(base + "/api/entries")).json(),
    put: (id, d) => fetch(base + "/api/entries/" + id, { method: "PUT", headers: J, body: JSON.stringify(d) }),
    del: id => fetch(base + "/api/entries/" + id, { method: "DELETE" }),
    clear: async () => { for (const e of await api.list()) await api.del(e.id); }
  };
  const TR = {}; // trades de test par id
  const tradeEntry = (id, hoursAgo, cm, scu, buy, sell, fees, from, to) => {
    const trade = { cm, scu, buy, sell, fees, from, to }; TR[id] = trade;
    return api.put(id, { type: "cargo", ts: Date.now() - hoursAgo * 3600e3, dur: 20, title: cm + " · " + from + " → " + to, place: from + " → " + to, trade });
  };
  async function section(name, fn) { try { await fn(); } catch (e) { check(name + " : exécution", false, e && e.stack || String(e)); } }

  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + "/healthz")).status) break; } catch (e) {} await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const CSPJS = () => { document.addEventListener("securitypolicyviolation", e => console.error("VIOLATION CSP " + e.violatedDirective + " " + e.blockedURI)); };
    async function newPage(opts) {
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, opts || {}));
      await ctx.addInitScript(CSPJS);
      const page = await ctx.newPage(); watch(page, "");
      return { ctx, page };
    }
    async function openCommerce(page, extra) {
      await page.goto(base + "/#commerce");
      await page.waitForSelector("#v-commerce", { state: "visible" });
      await page.waitForFunction(() => /serveur|local/.test(document.getElementById("lgStore").textContent), null, { timeout: 5000 });
      await page.waitForTimeout(extra || 150);
    }
    const goTab = (page, v) => page.click('.tab[data-v="' + v + '"]');
    const fillDr = async (page, v) => { for (const k of Object.keys(v)) await page.fill("#tr" + k, v[k]); };
    const EX = { Cm: "Marchandise A", Scu: "100", Buy: "2000", Sell: "2450", Fees: "1500", From: "Lieu A", To: "Lieu B", Dur: "50" };
    const drOpen = page => page.evaluate(() => !document.getElementById("trOv").hidden);
    const focusId = page => page.evaluate(() => document.activeElement && document.activeElement.id);
    const txt = (page, sel) => page.evaluate(sel => { const w = document.createTreeWalker(document.querySelector(sel), NodeFilter.SHOW_TEXT); const a = []; let n; while ((n = w.nextNode())) a.push(n.textContent); return a.join(" "); }, sel).then(T);
    const fmt = n => (n > 0 ? "+" : n < 0 ? MINUS : "") + Math.abs(n).toLocaleString("fr-FR").replace(/[\u00a0\u202f]/g, " ");

    /* ───────── 1. Navigation (bureau) ───────── */
    await section("navigation", async () => {
      await api.clear();
      const { ctx, page } = await newPage();
      await page.goto(base + "/");
      await page.waitForSelector(".hm-banner");
      const order = await page.evaluate(() => [...document.querySelectorAll("nav.tabs > .tab[data-v], nav.tabs > .lore > .tab")].map(b => b.querySelector("span").textContent));
      check("barre latérale : Accueil, Carnet de bord, Commerce, Lore, Versions dans cet ordre", order.join() === "Accueil,Carnet de bord,Commerce,Lore,Versions", order.join());
      await goTab(page, "commerce");
      await page.waitForSelector("#v-commerce", { state: "visible" });
      check("clic sur « Commerce » : la vue s'affiche, l'adresse est #commerce, les autres vues sont masquées", (await page.evaluate(() => location.hash)) === "#commerce" && (await page.isHidden("#v-home")) && (await page.isHidden("#v-log")));
      check("aria-current=\"page\" sur « Commerce » et sur lui seul", (await page.getAttribute('.tab[data-v="commerce"]', "aria-current")) === "page" && (await page.locator('nav.tabs [aria-current="page"]').count()) === 1);
      check("barre du haut : titre « Commerce » (h1) et sous-titre", (await txt(page, "#topTitle")) === "Commerce" && (await page.evaluate(() => document.getElementById("topTitle").tagName)) === "H1" && (await txt(page, "#topSub")).length > 10);
      const h = await page.evaluate(() => ({ h1: document.querySelectorAll("h1").length, h2: [...document.querySelectorAll("#v-commerce h2")].map(x => x.textContent), h3: document.querySelectorAll("#v-commerce h3").length, h1in: !!document.querySelector("#v-commerce h1") }));
      check("titres hiérarchisés : un seul h1 (page), h2 « Outils » et « Résumé du journal », h3 pour les cartes et panneaux", h.h1 === 1 && !h.h1in && h.h2.join() === "Outils,Résumé du journal" && h.h3 >= 8, JSON.stringify(h));
      await page.reload();
      await page.waitForSelector("#v-commerce", { state: "visible" });
      check("rechargement sur #commerce : l'onglet reste affiché et actif", (await page.getAttribute('.tab[data-v="commerce"]', "aria-current")) === "page");
      await page.evaluate(() => { location.hash = "#versions"; });
      await page.waitForSelector("#v-ver", { state: "visible" });
      await page.evaluate(() => { location.hash = "#commerce"; });
      await page.waitForSelector("#v-commerce", { state: "visible" });
      check("changement d'adresse (#versions puis #commerce) : suivi sans rechargement", (await page.getAttribute('.tab[data-v="commerce"]', "aria-current")) === "page");
      await goTab(page, "home");
      await page.click('.hm-card[data-go="commerce"]');
      await page.waitForSelector("#v-commerce", { state: "visible" });
      check("accueil : une carte mène à Commerce", await page.isVisible("#v-commerce"));
      await page.focus('.tab[data-v="log"]'); await page.keyboard.press("Tab");
      check("clavier : Tab depuis « Carnet de bord » atteint « Commerce »", (await page.evaluate(() => document.activeElement.dataset.v)) === "commerce");
      await goTab(page, "home");
      await page.focus('.tab[data-v="commerce"]'); await page.keyboard.press("Enter");
      check("clavier : Entrée sur « Commerce » affiche la vue", await page.isVisible("#v-commerce"));
      await ctx.close();
    });

    /* ───────── 2. Cartes-outils, état vide ───────── */
    await section("cartes et état vide", async () => {
      await api.clear();
      const { ctx, page } = await newPage(); await openCommerce(page);
      const cards = await page.evaluate(() => [...document.querySelectorAll("#v-commerce .cm-tool")].map(li => ({ t: li.querySelector("h3").textContent, off: li.classList.contains("off"), soon: /bientôt/.test(li.textContent), inter: li.querySelectorAll("a,button,input,select,[tabindex],[onclick],[role=button],[role=link]").length, why: /Nécessite les données de marché, étape ultérieure/.test(li.textContent) })));
      check("six cartes : Simulateur de trade, Routes, Prix, Raffineries, Carburant, Vaisseaux", cards.map(c => c.t).join() === "Simulateur de trade,Routes,Prix,Raffineries,Carburant,Vaisseaux", cards.map(c => c.t).join());
      const off = cards.filter(c => c.off);
      check("cinq cartes « bientôt » avec le texte « nécessitent les données de marché », sans aucun élément interactif", off.length === 5 && off.every(c => c.soon && c.why && c.inter === 0), JSON.stringify(off));
      check("la carte active (Simulateur) a un seul bouton et n'est pas marquée « bientôt »", cards[0].inter === 1 && !cards[0].soon && !cards[0].off);
      check("aucun lien mort dans l'onglet (aucun a[href])", (await page.locator("#v-commerce a").count()) === 0);
      check("mention « Données de marché : bientôt, via l'API publique d'UEX Corp » sans badge ni image", /Données de marché : bientôt, via l.API publique d.UEX Corp/.test(await txt(page, "#v-commerce .cm-uex")) && (await page.locator("#v-commerce img").count()) === 0);
      const e = await txt(page, "#cm30");
      check("état vide : message et bouton « Calculer un trade »", /aucun trade/i.test(e) && (await page.locator("#cm30 button.cm-open").innerText()) === "Calculer un trade", e);
      check("état vide : « Voir tout le journal » masqué, liste des derniers trades vide", (await page.isHidden("#cmAll")) && (await page.locator("#cmLast table").count()) === 0);
      check("résumé en aria-live=\"polite\", zone d'état role=\"status\"", (await page.getAttribute("#cm30", "aria-live")) === "polite" && (await page.getAttribute("#cmStatus", "role")) === "status");
      await page.click("#cm30 button.cm-open");
      check("le bouton de l'état vide ouvre le tiroir", await drOpen(page));
      await page.keyboard.press("Escape");
      await ctx.close();
    });

    /* ───────── 3. Ajout via le tiroir ───────── */
    await section("ajout via le tiroir", async () => {
      await api.clear();
      const { ctx, page } = await newPage(); await openCommerce(page);
      await page.focus("#cmCard"); await page.keyboard.press("Enter");
      check("la carte « Simulateur de trade » ouvre le tiroir ; libellé final « Ajouter au journal »", (await drOpen(page)) && (await txt(page, "#trSubmit")) === "Ajouter au journal" && (await focusId(page)) === "trCm");
      await page.waitForTimeout(350);
      const dlg = await page.evaluate(() => { const r = document.getElementById("trDlg").getBoundingClientRect(); return { r: r.right, w: innerWidth, t: r.top, b: r.bottom, h: innerHeight }; });
      check("tiroir 1440 px : volet latéral à droite sur toute la hauteur", Math.abs(dlg.r - dlg.w) < 2 && dlg.t < 2 && Math.abs(dlg.b - dlg.h) < 2, JSON.stringify(dlg));
      await page.keyboard.press("Escape");
      check("Échap ferme le tiroir et rend le focus à la carte", !(await drOpen(page)) && (await focusId(page)) === "cmCard");
      await page.click("#cmOpen");
      check("le bouton principal ouvre le même tiroir", await drOpen(page));
      await fillDr(page, EX);
      check("calcul en direct identique : +43 500 aUEC", T(await page.textContent("#trOv .tr-net")) === "+43 500 aUEC");
      await page.fill("#trSell", ""); await page.click('#trForm button[type="submit"]');
      check("incomplet : le tiroir reste ouvert, rien n'est enregistré", (await drOpen(page)) && (await api.list()).length === 0);
      await page.fill("#trSell", "2450");
      const t0 = Date.now();
      await page.click('#trForm button[type="submit"]');
      await page.waitForFunction(() => /Trade ajouté au journal/.test(document.getElementById("cmStatus").textContent), null, { timeout: 5000 });
      const l = await api.list();
      const e = l[0] || {};
      check("une entrée est créée via l'API : type cargo, date maintenant, durée 50, gain = net 43 500", l.length === 1 && e.type === "cargo" && e.auec === 43500 && e.dur === 50 && Math.abs(e.ts - t0) < 8000, JSON.stringify(e));
      check("titre automatique « Marchandise A · Lieu A → Lieu B » et lieu « Lieu A → Lieu B »", e.title === "Marchandise A · Lieu A → Lieu B" && e.place === "Lieu A → Lieu B", e.title + " / " + e.place);
      check("trade validé et nettoyé (cm, scu, buy, sell, fees, from, to)", JSON.stringify(e.trade) === JSON.stringify({ cm: "Marchandise A", scu: 100, buy: 2000, sell: 2450, fees: 1500, from: "Lieu A", to: "Lieu B" }), JSON.stringify(e.trade));
      check("message « Trade ajouté au journal » dans la zone role=status", (await txt(page, "#cmStatus")) === "Trade ajouté au journal");
      check("le tiroir est fermé, la page n'est plus inerte, le focus est revenu au bouton principal", !(await drOpen(page)) && (await focusId(page)) === "cmOpen" && (await page.evaluate(() => !document.querySelector(".app").inert)));
      const s = await txt(page, "#cm30");
      check("résumé mis à jour : bénéfice net +43 500 aUEC, 1 trade, ROI 21,6 %", /Bénéfice net/.test(s) && /\+43 500 aUEC/.test(s) && /Trades/.test(s) && /21,6 %/.test(s) && /\b1\b/.test(s.replace("+43 500", "")), s);
      const row = await txt(page, "#cmLast tbody tr");
      check("liste : date, « 100 SCU × Marchandise A », « Lieu A → Lieu B », net et ROI", /100 SCU × Marchandise A/.test(row) && /Lieu A → Lieu B/.test(row) && /\+43 500 aUEC/.test(row) && /21,6 %/.test(row) && /^\d\d\/\d\d\/\d{4} \d\d:\d\d/.test(row), row);
      check("le brouillon du tiroir est vidé après l'ajout", (await page.inputValue("#trScu")) === "");
      await page.click("#cmCard");
      check("réouverture depuis la carte après l'ajout : tiroir vide", (await drOpen(page)) && (await page.inputValue("#trCm")) === "");
      await page.keyboard.press("Escape");
      await goTab(page, "log");
      const lg = await txt(page, "#lgList");
      check("l'entrée apparaît dans le carnet (titre, badge Trade, net)", /Marchandise A · Lieu A → Lieu B/.test(lg) && /Trade/.test(lg) && /\+43 500 aUEC/.test(lg), lg.slice(0, 160));
      await page.click("#trOpen");
      check("carnet : le tiroir garde « Ajouter au carnet »", (await txt(page, "#trSubmit")) === "Ajouter au carnet");
      await fillDr(page, EX); await page.click('#trForm button[type="submit"]');
      check("carnet : « Ajouter au carnet » préremplit le formulaire (gain 43 500) sans enregistrer", (await page.inputValue("#fAuec")) === "43500" && (await api.list()).length === 1);
      await ctx.close();
    });

    /* ───────── 4. Résumé : calculs, tri, 30 jours, perte ───────── */
    await section("résumé", async () => {
      await api.clear();
      await tradeEntry("t1", 2, "Marchandise A", 100, 2000, 2450, 1500, "Lieu A", "Lieu B");
      await tradeEntry("t2", 30, "Marchandise B", 80, 3100, 2900, 2000, "Lieu C", "Lieu A");
      await tradeEntry("t3", 50, "Marchandise C", 40, 5000, 5600, 800, "Lieu B", "Lieu C");
      await tradeEntry("t4", 70, "Marchandise A", 60, 1950, 2400, 1000, "Lieu A", "Lieu C");
      await tradeEntry("t5", 90, "Marchandise B", 70, 3000, 3300, 1200, "Lieu C", "Lieu B");
      await tradeEntry("t6", 110, "Marchandise C", 30, 5100, 5000, 600, "Lieu B", "Lieu A");
      await tradeEntry("t7", 40 * 24, "Marchandise Z", 10, 100, 900, 0, "Lieu Z", "Lieu Y"); // hors 30 jours
      await api.put("n1", { type: "mining", ts: Date.now() - 3600e3, dur: 10, auec: 9999, title: "Minage" }); // pas un trade
      const { ctx, page } = await newPage(); await openCommerce(page, 400);
      const in30 = ["t1", "t2", "t3", "t4", "t5", "t6"].map(k => TR[k]);
      const sumNet = in30.reduce((a, t) => a + netOf(t), 0), base0 = in30.reduce((a, t) => a + t.scu * t.buy + t.fees, 0), roi = sumNet / base0 * 100;
      const strip = s => s.replace(/[+\u2212]?[\d ]+ aUEC/g, "");
      const s = await txt(page, "#cm30");
      check("30 jours : bénéfice net total = somme des nets (" + sumNet + "), trade hors période et entrée non-trade exclus", s.includes(fmt(sumNet) + " aUEC") && /Bénéfice net/.test(s), s);
      check("30 jours : nombre de trades = 6", /(^|\s)6(\s|$)/.test(strip(s)) && /Trades/.test(s), s);
      const roiTxt = roi.toFixed(1).replace(".", ",") + " %";
      check("30 jours : ROI moyen pondéré = somme des nets ÷ somme des investissements et frais (" + roiTxt + ")", s.includes(roiTxt) && /ROI moyen pondéré/.test(s), s);
      const rows = await page.evaluate(() => [...document.querySelectorAll("#cmLast tbody tr")].map(r => r.querySelector("time").getAttribute("datetime") + "|" + r.querySelector(".c-trade").textContent));
      check("liste : les 5 derniers trades, triés du plus récent au plus ancien", rows.length === 5 && rows.every((r, i) => i === 0 || r.split("|")[0] < rows[i - 1].split("|")[0]) && /Marchandise A/.test(rows[0]) && /Marchandise B/.test(rows[4]) && !rows.some(r => /Marchandise Z|Minage/.test(r)), rows.join(" ; "));
      const loss = await txt(page, "#cmLast tbody tr:nth-child(2)");
      check("perte écrite dans la liste : « −18 000 aUEC (perte) » et « −7,2 % (perte) »", /\u221218 000 aUEC \(perte\)/.test(loss) && /\u22127,2 % \(perte\)/.test(loss), loss);
      const tbl = await page.evaluate(() => { const t = document.querySelector("#cmLast table"); return { cap: t.querySelector("caption").textContent, ths: [...t.querySelectorAll("th")].map(h => h.getAttribute("scope")), rows: t.querySelectorAll("tbody tr").length, role: t.getAttribute("role") }; });
      check("liste lisible aux lecteurs d'écran : table avec légende, en-têtes scope=col, rôles posés", /Cinq derniers trades/.test(tbl.cap) && tbl.ths.length === 5 && tbl.ths.every(x => x === "col") && tbl.rows === 5 && tbl.role === "table", JSON.stringify(tbl));
      check("« Voir tout le journal » visible quand il y a des trades", await page.isVisible("#cmAll"));
      await page.click("#cmAll");
      await page.waitForSelector("#v-log", { state: "visible" });
      const f = await page.evaluate(() => ({ p: document.querySelector('#lgFilter button[data-t="cargo"]').getAttribute("aria-pressed"), all: document.querySelector('#lgFilter button[data-t=""]').getAttribute("aria-pressed"), box: !document.getElementById("trBox").hidden, cnt: document.getElementById("lgCount").textContent, h: location.hash }));
      check("« Voir tout le journal » ouvre le carnet filtré sur « Commerce / cargo » (puce active, bloc Commerce, 7 entrées)", f.p === "true" && f.all === "false" && f.box && /Journal · 7 sur 8 entrées/.test(f.cnt) && f.h === "#carnet", JSON.stringify(f));
      /* modification dans le carnet : retrait du trade de t1 */
      const card = page.locator("#lgList .lg-ent", { hasText: "Marchandise A · Lieu A → Lieu B" }).first();
      await card.locator("button", { hasText: "Modifier" }).click();
      await page.click("#trDel"); await page.click("#fSave");
      await page.waitForFunction(() => /modifiée/.test(document.getElementById("fMsg").textContent));
      await goTab(page, "commerce");
      let s2 = await txt(page, "#cm30");
      const rest = in30.slice(1), net2 = rest.reduce((a, t) => a + netOf(t), 0);
      check("après modification dans le carnet (trade retiré) : 5 trades, net recalculé", s2.includes(fmt(net2) + " aUEC") && /(^|\s)5(\s|$)/.test(strip(s2)), s2);
      /* suppression dans le carnet */
      await goTab(page, "log");
      const del = page.locator("#lgList .lg-ent", { hasText: "Marchandise B · Lieu C → Lieu A" }).first().locator("button").last();
      await del.click(); await del.click();
      await page.waitForFunction(() => !/Marchandise B · Lieu C → Lieu A/.test(document.getElementById("lgList").textContent));
      await goTab(page, "commerce");
      const rest2 = rest.filter(t => t !== TR.t2), net3 = rest2.reduce((a, t) => a + netOf(t), 0);
      s2 = await txt(page, "#cm30");
      check("après suppression dans le carnet : 4 trades, net recalculé (plus de perte)", s2.includes(fmt(net3) + " aUEC") && /(^|\s)4(\s|$)/.test(strip(s2)), s2);
      check("la liste ne contient plus le trade supprimé", !/80 SCU × Marchandise B/.test(await txt(page, "#cmLast")));
      /* mise à jour au retour sur l'onglet (changement fait ailleurs, via l'API) */
      await goTab(page, "home");
      await tradeEntry("t8", 1, "Marchandise N", 10, 100, 150, 0, "Lieu N", "Lieu M");
      await goTab(page, "commerce");
      await page.waitForFunction(() => /Marchandise N/.test(document.getElementById("cmLast").textContent), null, { timeout: 5000 }).catch(() => {});
      check("retour sur l'onglet : un trade ajouté ailleurs (API) apparaît (synchronisation)", /10 SCU × Marchandise N/.test(await txt(page, "#cmLast")));
      await ctx.close();
    });

    await section("perte totale", async () => {
      await api.clear();
      await tradeEntry("l1", 2, "Marchandise B", 80, 3100, 2900, 2000, "Lieu C", "Lieu A");
      const { ctx, page } = await newPage(); await openCommerce(page, 300);
      const s = await txt(page, "#cm30");
      check("perte : « Perte totale » en toutes lettres, montant avec vrai signe moins, ROI négatif signalé « perte »", /Perte totale/.test(s) && s.includes(MINUS + "18 000 aUEC") && s.includes(MINUS + "7,2 %") && /perte/.test(s) && !/Bénéfice net/.test(s), s);
      check("perte : classe neg (couleur) en plus du texte", await page.evaluate(() => !!document.querySelector("#cm30 b.neg")));
      await ctx.close();
    });

    /* ───────── 5. Mobile 390 px ───────── */
    await section("mobile", async () => {
      await api.clear();
      await tradeEntry("m1", 2, "Marchandise A", 100, 2000, 2450, 1500, "Lieu A", "Lieu B");
      await tradeEntry("m2", 30, "Marchandise B", 80, 3100, 2900, 2000, "Lieu C", "Lieu A");
      const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      await page.goto(base + "/");
      await page.waitForSelector(".hm-banner");
      const bar = await page.evaluate(() => [...document.querySelectorAll(".tabs > .tab, .tabs .lore-toggle")].filter(b => b.offsetParent !== null).map(b => { const r = b.getBoundingClientRect(), s = b.querySelector("span"); return { t: s.textContent, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, trunc: s.scrollWidth > s.clientWidth + 0.5, bot: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right) }; }));
      check("barre du bas : 5 boutons Accueil, Carnet de bord, Commerce, Lore, Versions", bar.map(b => b.t).join() === "Accueil,Carnet de bord,Commerce,Lore,Versions", JSON.stringify(bar));
      check("barre du bas : chaque bouton ≥ 44 px de haut et de large", bar.every(b => b.h >= 44 && b.w >= 44), JSON.stringify(bar));
      check("barre du bas : libellés non tronqués à 390 px", bar.every(b => !b.trunc), JSON.stringify(bar.filter(b => b.trunc)));
      check("barre du bas : mise en page équilibrée (largeurs égales à 1 px près, mêmes hauteur et position, tient dans l'écran)", Math.max(...bar.map(b => b.w)) - Math.min(...bar.map(b => b.w)) <= 1 && new Set(bar.map(b => b.h)).size === 1 && new Set(bar.map(b => b.bot)).size === 1 && bar[0].l >= 0 && bar[4].r <= 390, JSON.stringify(bar));
      await page.tap('.tab[data-v="commerce"]');
      await page.waitForSelector("#v-commerce", { state: "visible" });
      await page.waitForTimeout(300);
      check("mobile : « Commerce » actif (aria-current), titre « Commerce » dans la barre du haut", (await page.getAttribute('.tab[data-v="commerce"]', "aria-current")) === "page" && (await txt(page, "#topTitle")) === "Commerce");
      const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, over: [...document.querySelectorAll("#v-commerce *")].filter(e => e.getBoundingClientRect().right > 391 && e.getClientRects().length).map(e => e.tagName + "." + e.className).slice(0, 5) }));
      check("mobile : aucun défilement horizontal, aucun élément ne dépasse 390 px", w.sw <= 390 && w.over.length === 0, JSON.stringify(w));
      const sizes = await page.evaluate(() => [...document.querySelectorAll("#v-commerce button")].filter(b => b.getClientRects().length).map(b => ({ id: b.id || b.textContent, h: b.getBoundingClientRect().height })));
      check("mobile : boutons de l'onglet ≥ 44 px", sizes.length >= 3 && sizes.every(s => s.h >= 43.5), JSON.stringify(sizes));
      const cards = await page.evaluate(() => { const t = document.querySelector("#cmLast tbody tr"); return { d: getComputedStyle(t).display, role: t.getAttribute("role") }; });
      check("mobile : les trades s'affichent en cartes (rôles de tableau conservés)", cards.d === "block" && cards.role === "row", JSON.stringify(cards));
      await page.tap("#cmCard"); await page.waitForTimeout(350);
      const b = await page.evaluate(() => { const r = document.getElementById("trDlg").getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: innerHeight, sw: document.documentElement.scrollWidth }; });
      check("mobile : le tiroir s'ouvre en volet BAS (pleine largeur, collé en bas, ≤ 92 % de la hauteur)", b.l <= 1 && b.r >= 389 && Math.abs(b.b - b.h) < 2 && b.t > 0 && (b.b - b.t) <= b.h * 0.93 && b.sw <= 390, JSON.stringify(b));
      await fillDr(page, EX);
      await page.tap('#trForm button[type="submit"]');
      await page.waitForFunction(() => /Trade ajouté au journal/.test(document.getElementById("cmStatus").textContent), null, { timeout: 5000 });
      check("mobile : « Ajouter au journal » enregistre, ferme le volet et rend le focus", !(await drOpen(page)) && (await focusId(page)) === "cmCard" && (await api.list()).length === 3);
      check("mobile : toujours aucun défilement horizontal après l'ajout", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
      await ctx.close();
      const rm = await newPage({ reducedMotion: "reduce" }); await openCommerce(rm.page);
      await rm.page.click("#cmOpen");
      check("prefers-reduced-motion : aucune animation d'ouverture du tiroir", (await rm.page.evaluate(() => getComputedStyle(document.getElementById("trDlg")).animationName)) === "none");
      await rm.ctx.close();
    });

    /* ───────── 6. Requêtes, hors ligne, CSP ───────── */
    await section("requêtes et intégration", async () => {
      const { ctx, page } = await newPage();
      const reqs = [];
      page.on("request", r => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) reqs.push(r.method() + " " + u.pathname); });
      await page.goto(base + "/");
      await page.waitForSelector(".hm-banner");
      await page.waitForFunction(() => /serveur|local/.test(document.getElementById("lgStore").textContent));
      await page.waitForTimeout(500);
      const n0 = reqs.length; await page.waitForTimeout(1500);
      check("onglet Commerce non affiché (accueil) : aucune requête API supplémentaire en 1,5 s", reqs.length === n0, reqs.join(" ; "));
      await goTab(page, "commerce"); await page.waitForTimeout(600);
      check("affichage de l'onglet : au plus une relecture du serveur (GET /api/entries)", reqs.length - n0 <= 1 && reqs.slice(n0).every(r => r === "GET /api/entries"), reqs.slice(n0).join(" ; "));
      const sw = fs.readFileSync(path.join(ROOT, "public", "sw.js"), "utf8");
      check("sw.js : commerce.js et commerce.css sont précachés", /CORE = \[[^\]]*"commerce\.js"/.test(sw) && /CORE = \[[^\]]*"commerce\.css"/.test(sw));
      const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");
      const seg = html.slice(html.indexOf('id="v-commerce"'), html.indexOf('id="v-time"'));
      check("index.html : aucun gestionnaire ni script en ligne dans l'onglet Commerce", seg.length > 500 && !/\son[a-z]+\s*=/.test(seg) && !/<script/.test(seg) && !/\sstyle\s*=/.test(seg));
      await ctx.close();
    });

    check("aucune erreur de console, aucune violation de la politique de sécurité (CSP)", errors.length === 0, errors.join(" | "));
  } catch (e) {
    check("exécution", false, e && e.stack || String(e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill();
    try { fs.rmSync(data, { recursive: true, force: true }); } catch (e) {}
  }
  const ok = results.filter(Boolean).length;
  console.log("\n" + ok + "/" + results.length + " vérifications réussies");
  process.exit(ok === results.length && results.length > 0 ? 0 : 1);
})();
