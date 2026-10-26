// Tests du journal de trades et du simulateur en tiroir (carnet) : calculs, tiroir (clavier, focus, mobile),
// ajout au carnet, journal, statistiques « Commerce », édition, exports CSV/JSON, imports, stockage local, CSP.
// Usage : node tests/trade.js   (CHROMIUM_PATH pour utiliser un Chromium déjà installé)
"use strict";
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path"), net = require("net");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const results = [];
const check = (name, ok, extra) => { results.push(!!ok); console.log((ok ? "  ok   " : "  ÉCHEC ") + name + (ok || extra === undefined ? "" : " → " + extra)); };
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const J = { "Content-Type": "application/json" };
const T = s => String(s).replace(/[  ]/g, " ").replace(/\s+/g, " ").trim(); // espaces insécables → espaces
const MINUS = "−";

/* analyse CSV minimale (séparateur « ; », guillemets doublés) */
function parseCsv(txt) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ";") { row.push(cur); cur = ""; }
    else if (c === "\r") { /* ignoré */ }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

(async () => {
  const port = await freePort();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "orbital-trade-"));
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
    clear: async () => { for (const e of await api.list()) await fetch(base + "/api/entries/" + e.id, { method: "DELETE" }); }
  };
  const tradeEntry = (id, hoursAgo, dur, cm, scu, buy, sell, fees, from, to) =>
    api.put(id, { type: "cargo", ts: Date.now() - hoursAgo * 3600e3, dur, ship: "Vaisseau X", title: cm + " · " + from + " → " + to, place: from + " → " + to, trade: { cm, scu, buy, sell, fees, from, to } });
  async function section(name, fn) { try { await fn(); } catch (e) { check(name + " : exécution", false, e && e.stack || String(e)); } }

  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + "/healthz")).status) break; } catch (e) {} await new Promise(r => setTimeout(r, 100)); }
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const CSPJS = () => { document.addEventListener("securitypolicyviolation", e => console.error("VIOLATION CSP " + e.violatedDirective + " " + e.blockedURI)); };
    async function newPage(opts, route) {
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }, opts || {}));
      await ctx.addInitScript(CSPJS);
      const page = await ctx.newPage(); watch(page, "");
      if (route) await page.route("**/api/entries", r => r.abort());
      return { ctx, page };
    }
    async function openLog(page, local) {
      await page.goto(base + "/#carnet");
      await page.waitForSelector("#v-log", { state: "visible" });
      await page.waitForFunction(re => new RegExp(re).test(document.getElementById("lgStore").textContent), local ? "Stockage local" : "Enregistré sur le serveur", { timeout: 5000 });
    }
    const fillDr = async (page, v) => { for (const k of Object.keys(v)) await page.fill("#tr" + k, v[k]); };
    const EX = { Cm: "Marchandise A", Scu: "100", Buy: "2000", Sell: "2450", Fees: "1500", From: "Lieu A", To: "Lieu B", Dur: "50" };
    const netTxt = page => page.textContent("#trOv .tr-net").then(T);
    const drOpen = page => page.evaluate(() => !document.getElementById("trOv").hidden);
    const tn = (page, sel) => page.evaluate(sel => { const w = document.createTreeWalker(document.querySelector(sel), NodeFilter.SHOW_TEXT); const a = []; let n; while ((n = w.nextNode())) a.push(n.textContent); return a.join(" "); }, sel).then(T);
    const focusId = page => page.evaluate(() => document.activeElement && document.activeElement.id);

    /* ───────── 1. Calculs (fonction pure) ───────── */
    await section("calculs", async () => {
      const { ctx, page } = await newPage(); await openLog(page);
      const c = v => page.evaluate(v => { const r = OrbTrade.calc(v); return { st: r.st, r: r.r, errs: r.errs, miss: r.miss }; }, v);
      const a = await c({ scu: "100", buy: "2000", sell: "2450", fees: "1500", dur: "" });
      check("calcul : exemple 100 SCU, 2 000 → 2 450, frais 1 500 : investissement 200 000, recettes 245 000, net 43 500", a.st === "ok" && a.r.inv === 200000 && a.r.rec === 245000 && a.r.net === 43500 && a.r.fees === 1500, JSON.stringify(a));
      check("calcul : ROI 21,6 % (net ÷ (investissement + frais)), marge par SCU +450, pas de bénéfice par heure sans durée", Math.abs(a.r.roi - 21.588) < 0.001 && a.r.margin === 450 && a.r.hour === null);
      const h = await c({ scu: "100", buy: "2000", sell: "2450", fees: "1500", dur: "50" });
      check("calcul : bénéfice par heure = net ÷ (durée ÷ 60) = 52 200 pour 50 min", Math.round(h.r.hour) === 52200, h.r && h.r.hour);
      const l = await c({ scu: "80", buy: "3100", sell: "2900", fees: "2000" });
      check("calcul : perte (80 SCU, 3 100 → 2 900, frais 2 000) = −18 000, ROI −7,2 %", l.r.net === -18000 && Math.abs(l.r.roi + 7.2) < 0.001, JSON.stringify(l.r));
      const nf = await c({ scu: "100", buy: "2000", sell: "2450" });
      check("calcul : frais facultatifs (0 par défaut) : net 45 000", nf.st === "ok" && nf.r.fees === 0 && nf.r.net === 45000);
      const sp = await c({ scu: "1 000", buy: "2 000", sell: "2 450", fees: "1 500" });
      check("calcul : espaces (simples, insécables, fines) acceptés dans la saisie", sp.st === "ok" && sp.r.net === 448500, JSON.stringify(sp));
      const inc = await c({ scu: "100", buy: "2000", sell: "" });
      check("calcul : champs incomplets → état « incomplete », aucun résultat", inc.st === "incomplete" && inc.r === null && inc.miss.join() === "sell");
      const inv = await c({ scu: "12,5", buy: "-3", sell: "2450", fees: "abc", dur: "0" });
      check("calcul : valeurs invalides (décimal, négatif, texte, durée nulle) → « invalid » avec un message par champ", inv.st === "invalid" && ["scu", "buy", "fees", "dur"].every(k => /\.$/.test(inv.errs[k] || "")) && !inv.errs.sell, JSON.stringify(inv.errs));
      const zero = await c({ scu: "0", buy: "1", sell: "1" });
      check("calcul : SCU = 0 refusé", zero.st === "invalid" && !!zero.errs.scu);
      const big = await c({ scu: "10000000", buy: "0", sell: "100000000", fees: "0" });
      check("grands nombres : 10 000 000 SCU × 100 000 000 = 10^15 exact (entiers sûrs)", big.st === "ok" && big.r.net === 1e15 && big.r.rec === 1e15 && Number.isSafeInteger(big.r.net));
      const big2 = await c({ scu: "10000000", buy: "100000000", sell: "100000000", fees: "1000000000000" });
      check("grands nombres : investissement 10^15, net −10^12 avec frais maximaux", big2.st === "ok" && big2.r.inv === 1e15 && big2.r.net === -1e12);
      const over = await c({ scu: "10000001", buy: "100000001", sell: "1", fees: "1000000000001" });
      check("bornes : SCU, prix et frais au-dessus du maximum refusés", over.st === "invalid" && !!over.errs.scu && !!over.errs.buy && !!over.errs.fees, JSON.stringify(over.errs));
      const f = await page.evaluate(() => [OrbTrade.n0(1e15), OrbTrade.sg(43500), OrbTrade.sg(-18000), OrbTrade.pct(21.588), OrbTrade.pct(-7.2), OrbTrade.sg(0)]);
      check("format français : milliers par espace insécable, vrai signe moins, virgule décimale", f[0] === "1 000 000 000 000 000" && f[1] === "+43 500" && f[2] === MINUS + "18 000" && f[3] === "21,6 %" && f[4] === MINUS + "7,2 %" && f[5] === "0", JSON.stringify(f));
      const cl = await page.evaluate(() => [OrbTrade.clean({ cm: " x ", scu: 1, buy: 0, sell: 0 }, "cargo"), OrbTrade.clean({ cm: "x", scu: 1, buy: 0, sell: 0 }, "mining"), OrbTrade.clean({ scu: -1, buy: 0, sell: 0 }, "cargo"), OrbTrade.clean("x", "cargo"), OrbTrade.clean({ scu: 1, buy: 0, sell: 0, fees: "5" }, "cargo")]);
      check("nettoyage client : trade valide normalisé ; invalide, non cargo, absent ou frais en texte → null", cl[0] && cl[0].cm === "x" && cl[0].fees === 0 && cl[1] === null && cl[2] === null && cl[3] === null && cl[4] === null, JSON.stringify(cl));
      await ctx.close();
    });

    /* ───────── 2. Tiroir (bureau) ───────── */
    await section("tiroir", async () => {
      await api.clear();
      await tradeEntry("seed-1", 3, 20, "Marchandise Z", 10, 100, 120, 0, "Lieu Z", "Lieu Y");
      const { ctx, page } = await newPage(); await openLog(page);
      check("formulaire : le bouton « Calculer un trade » est visible (activité Minage par défaut, comme la maquette)", await page.isVisible("#trOpen") && (await page.textContent("#trOpen")) === "Calculer un trade");
      check("tiroir : fermé au départ, absent de l’ordre de tabulation", !(await drOpen(page)) && !(await page.isVisible("#trDlg")));
      await page.focus("#trOpen"); await page.keyboard.press("Enter");
      check("tiroir : s’ouvre au clavier (Entrée), focus sur « Marchandise »", (await drOpen(page)) && (await focusId(page)) === "trCm");
      const aria = await page.evaluate(() => { const d = document.getElementById("trDlg"); return { role: d.getAttribute("role"), modal: d.getAttribute("aria-modal"), lab: document.getElementById(d.getAttribute("aria-labelledby")).textContent, desc: !!document.getElementById(d.getAttribute("aria-describedby")), live: document.querySelector("#trOv [data-res]").getAttribute("aria-live"), inert: document.querySelector(".app").inert, hid: document.querySelector(".app").getAttribute("aria-hidden"), lock: document.documentElement.classList.contains("tr-lock") }; });
      check("tiroir : role=dialog, aria-modal, nom « Calculer un trade », description, résultat en aria-live=polite", aria.role === "dialog" && aria.modal === "true" && aria.lab === "Calculer un trade" && aria.desc && aria.live === "polite", JSON.stringify(aria));
      check("tiroir ouvert : le reste de la page est inerte (inert + aria-hidden) et le défilement de la page est bloqué", aria.inert === true && aria.hid === "true" && aria.lock === true);
      await page.waitForTimeout(350);
      const box = await page.evaluate(() => { const r = document.getElementById("trDlg").getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: innerWidth, h: innerHeight }; });
      check("tiroir 1440 px : volet latéral à droite sur toute la hauteur (≈ 30 rem)", Math.abs(box.r - box.w) < 2 && box.t < 2 && Math.abs(box.b - box.h) < 2 && box.r - box.l >= 440 && box.r - box.l <= 500, JSON.stringify(box));
      check("état incomplet : « Renseignez le SCU et les deux prix. », résultat masqué (pas de montant)", T(await page.textContent("#trOv [data-res]")) === "Renseignez le SCU et les deux prix." && (await page.getAttribute("#trOv .tr-res", "data-st")) === "incomplete");
      await fillDr(page, EX);
      check("bénéfice : net +43 500 aUEC, badge « Bénéfice », ROI 21,6 %", (await netTxt(page)) === "+43 500 aUEC" && /Bénéfice/.test(await page.textContent("#trOv .tr-flag")) && /ROI 21,6 %/.test(await tn(page, "#trOv .tr-grid")) && (await page.getAttribute("#trOv .tr-res", "data-st")) === "gain");
      const grid = await tn(page, "#trOv .tr-grid");
      check("bénéfice : investissement 200 000, recettes 245 000, frais 1 500, marge +450 / SCU, bénéfice par heure +52 200 / h", /Investissement 200 000 aUEC/.test(grid) && /Recettes 245 000 aUEC/.test(grid) && /Frais 1 500 aUEC/.test(grid) && /Marge par SCU \+450 aUEC \/ SCU/.test(grid) && /Bénéfice par heure \+52 200 aUEC \/ h/.test(grid), grid);
      await page.fill("#trSell", "1900");
      const lossTxt = T(await page.textContent("#trOv .tr-res"));
      check("perte : « Perte nette », badge « Perte » en toutes lettres (pas seulement la couleur), net avec vrai signe moins", /Perte nette/.test(lossTxt) && /Perte/.test(await page.textContent("#trOv .tr-flag")) && (await netTxt(page)) === MINUS + "11 500 aUEC" && (await page.getAttribute("#trOv .tr-res", "data-st")) === "loss", lossTxt);
      check("perte : le net est coloré (classe neg) et le ROI négatif aussi", await page.evaluate(() => document.querySelector("#trOv .tr-net").classList.contains("neg") && !!document.querySelector("#trOv .tr-m b.neg")));
      await page.fill("#trSell", "2450");
      await page.fill("#trScu", "12,5"); await page.fill("#trBuy", "-3"); await page.fill("#trFees", "abc"); await page.fill("#trDur", "0");
      const inv = await page.evaluate(() => ["trScu", "trBuy", "trFees", "trDur"].map(id => { const i = document.getElementById(id), d = document.getElementById(i.getAttribute("aria-describedby")); return { inv: i.getAttribute("aria-invalid"), msg: d.textContent, ok: i.getAttribute("aria-describedby").split(" ").includes(d.id) }; }));
      check("valeurs invalides : aria-invalid + message en français lié par aria-describedby, pour chaque champ", inv.every(x => x.inv === "true" && /^Erreur : .+ (doit|doivent) être .+\.$/.test(x.msg) && x.ok), JSON.stringify(inv));
      check("valeurs invalides : « Résultat masqué : corrigez les champs signalés. » et état invalid", /Résultat masqué : corrigez les champs signalés\./.test(await page.textContent("#trOv [data-res]")) && (await page.getAttribute("#trOv .tr-res", "data-st")) === "invalid");
      await page.fill("#trScu", "100"); await page.fill("#trBuy", "2000"); await page.fill("#trFees", "1500"); await page.fill("#trDur", "50");
      check("correction : les erreurs disparaissent (aria-invalid retiré) et le résultat revient", (await page.locator('#trOv [aria-invalid="true"]').count()) === 0 && (await netTxt(page)) === "+43 500 aUEC");
      /* validation à l'ajout */
      await page.fill("#trSell", ""); await page.fill("#trCm", "");
      await page.click('#trForm button[type="submit"]');
      const att = await page.evaluate(() => ({ open: !document.getElementById("trOv").hidden, msg: document.getElementById("trMsg").textContent, f: document.activeElement.id, sell: document.querySelector('[data-err="sell"]').textContent, cm: document.querySelector('[data-err="cm"]').textContent }));
      check("ajout impossible si incomplet : le tiroir reste ouvert, message, focus sur le 1er champ en erreur, erreurs « Renseignez… »", att.open && /Ajout impossible/.test(att.msg) && att.f === "trCm" && /Renseignez le prix de vente/.test(att.sell) && /Indiquez la marchandise/.test(att.cm), JSON.stringify(att));
      /* suggestions */
      const goods = await page.evaluate(() => [...document.querySelectorAll("#trGoods option")].map(o => o.value));
      check("suggestions de marchandise (datalist) tirées des trades déjà saisis", goods.join() === "Marchandise Z" && (await page.getAttribute("#trCm", "list")) === "trGoods", goods.join());
      /* focus piégé */
      let trapped = true, seen = new Set();
      for (let i = 0; i < 24; i++) { await page.keyboard.press("Tab"); const r = await page.evaluate(() => ({ id: document.activeElement.id, tag: document.activeElement.tagName, inside: document.getElementById("trDlg").contains(document.activeElement) })); seen.add(r.id + r.tag); if (!r.inside) trapped = false; }
      check("focus piégé : 24 Tab de suite restent dans le tiroir (et parcourent tous les champs et boutons)", trapped && seen.size >= 9, [...seen].join());
      let trappedBack = true; for (let i = 0; i < 24; i++) { await page.keyboard.press("Shift+Tab"); if (!(await page.evaluate(() => document.getElementById("trDlg").contains(document.activeElement)))) trappedBack = false; }
      check("focus piégé : Maj+Tab reste aussi dans le tiroir", trappedBack);
      await page.keyboard.press("Escape");
      check("Échap ferme le tiroir, la page n’est plus inerte, le focus revient au bouton « Calculer un trade »", !(await drOpen(page)) && (await focusId(page)) === "trOpen" && (await page.evaluate(() => !document.querySelector(".app").inert && !document.documentElement.classList.contains("tr-lock"))));
      check("le brouillon est conservé à la réouverture", await (async () => { await page.click("#trOpen"); const v = await page.inputValue("#trScu"); await page.keyboard.press("Escape"); return v === "100"; })());
      await page.click("#trOpen");
      await page.mouse.click(60, 450);
      check("clic sur le fond ferme le tiroir, focus rendu au bouton", !(await drOpen(page)) && (await focusId(page)) === "trOpen");
      await page.click("#trOpen"); await page.click('#trOv .tr-head [data-tr-close]');
      check("bouton « Fermer » : ferme et rend le focus", !(await drOpen(page)) && (await focusId(page)) === "trOpen");
      await page.click("#trOpen"); await page.click('#trForm .tr-btns [data-tr-close]');
      check("bouton « Annuler » : ferme sans rien ajouter au formulaire", !(await drOpen(page)) && (await page.inputValue("#fAuec")) === "" && (await page.isHidden("#trLinked")));
      await page.click("#trOpen"); await page.keyboard.press("/");
      check("« / » dans le tiroir n’ouvre pas la recherche globale", await page.evaluate(() => document.getElementById("srchOv").hidden) && (await drOpen(page)));
      await page.keyboard.press("Escape");
      await ctx.close();
    });

    /* ───────── 3. Mobile 390 px (volet bas, tactile) ───────── */
    await section("mobile", async () => {
      const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      await openLog(page);
      const sw0 = await page.evaluate(() => document.documentElement.scrollWidth);
      check("mobile 390 px : aucun défilement horizontal sur le carnet (avec le bouton et le journal)", sw0 <= 390, sw0);
      check("mobile : le bouton « Calculer un trade » fait au moins 44 px de haut", (await page.locator("#trOpen").boundingBox()).height >= 44);
      await page.tap("#trOpen"); await page.waitForTimeout(350);
      const b = await page.evaluate(() => { const r = document.getElementById("trDlg").getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: innerHeight, sw: document.documentElement.scrollWidth, dw: document.getElementById("trDlg").scrollWidth, dc: document.getElementById("trDlg").clientWidth }; });
      check("mobile : volet BAS (pleine largeur, collé en bas, hauteur ≤ 92 %), sans défilement horizontal", b.l <= 1 && b.r >= 389 && Math.abs(b.b - b.h) < 2 && b.t > 0 && (b.b - b.t) <= b.h * 0.93 && b.sw <= 390 && b.dw <= b.dc, JSON.stringify(b));
      await fillDr(page, EX);
      await page.fill("#trScu", "10000000"); await page.fill("#trBuy", "100000000"); await page.fill("#trSell", "100000000"); await page.fill("#trFees", "1000000000000");
      const big = await page.evaluate(() => { const r = document.querySelector("#trOv .tr-res"); return { w: r.scrollWidth, c: r.clientWidth, t: document.querySelector("#trOv .tr-net").textContent, sw: document.documentElement.scrollWidth }; });
      check("mobile : un très grand nombre ne déborde pas du résultat ni de la page", big.w <= big.c && big.sw <= 390 && /1 000 000 000 000/.test(big.t), JSON.stringify(big));
      await page.fill("#trScu", "100"); await page.fill("#trBuy", "2000"); await page.fill("#trSell", "2450"); await page.fill("#trFees", "1500");
      await page.evaluate(() => { const b = document.querySelector("#trOv .tr-body"); b.scrollTop = b.scrollHeight; });
      const vis = await page.evaluate(() => { const r = document.querySelector("#trOv .tr-res").getBoundingClientRect(), n = document.querySelector("#trOv .tr-net").getBoundingClientRect(); return { top: r.top, bottom: r.bottom, nt: n.top, nb: n.bottom, h: innerHeight, txt: document.querySelector("#trOv .tr-res").textContent }; });
      check("mobile : le résultat (net, ROI) reste visible en haut du tiroir pendant la saisie, même champs défilés", vis.top >= 0 && vis.nb <= vis.h && vis.nt >= vis.top && /43 500/.test(vis.txt) && /21,6/.test(vis.txt), JSON.stringify(vis));
      const sizes = await page.evaluate(() => [...document.querySelectorAll("#trDlg button, #trDlg input")].filter(e => e.getClientRects().length).map(e => ({ id: e.id || e.textContent, h: e.getBoundingClientRect().height })));
      check("mobile : tous les boutons et champs du tiroir font au moins 44 px", sizes.length >= 11 && sizes.every(s => s.h >= 43.5), JSON.stringify(sizes.filter(s => s.h < 43.5)));
      check("mobile : polices de saisie ≥ 16 px (pas de zoom automatique sur iOS)", await page.evaluate(() => [...document.querySelectorAll("#trDlg input")].every(i => parseFloat(getComputedStyle(i).fontSize) >= 16)));
      await page.tap('#trForm button[type="submit"]');
      check("mobile : « Ajouter au carnet » ferme le volet et préremplit le formulaire", !(await drOpen(page)) && (await page.inputValue("#fAuec")) === "43500");
      const rects = await page.evaluate(() => ["trEdit", "trDel", "fSave"].map(id => document.getElementById(id).getBoundingClientRect().height));
      check("mobile : boutons « Modifier le calcul », « Retirer le trade » et « Enregistrer » ≥ 44 px", rects.every(h => h >= 43.5), rects.join());
      check("mobile : toujours aucun défilement horizontal avec l’encart « Trade lié »", (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
      await page.tap("#fSave"); await page.waitForFunction(() => /ajoutée/.test(document.getElementById("fMsg").textContent));
      await page.tap('#lgFilter button[data-t="cargo"]');
      const chip = await page.locator('#lgFilter button[data-t="cargo"]').boundingBox();
      check("mobile : la puce de filtre et le bloc « Commerce » tiennent dans 390 px ; puce ≥ 44 px", chip.height >= 43.5 && (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390 && (await page.isVisible("#trBox")));
      await ctx.close();
      const rm = await newPage({ reducedMotion: "reduce" }); await openLog(rm.page);
      await rm.page.click("#trOpen");
      check("prefers-reduced-motion : aucune animation d’ouverture du tiroir", (await rm.page.evaluate(() => getComputedStyle(document.getElementById("trDlg")).animationName)) === "none");
      await rm.ctx.close();
    });

    /* ───────── 4. Ajout au carnet, journal, statistiques, édition ───────── */
    await section("parcours", async () => {
      await api.clear();
      const { ctx, page } = await newPage(); await openLog(page);
      await page.fill("#fTitle", ""); await page.fill("#fDur", "30");
      await page.click("#trOpen");
      check("le tiroir reprend la durée déjà saisie dans le formulaire", (await page.inputValue("#trDur")) === "30");
      await fillDr(page, EX);
      await page.click('#trForm button[type="submit"]');
      const f = await page.evaluate(() => ({ open: !document.getElementById("trOv").hidden, type: document.getElementById("fType").value, auec: document.getElementById("fAuec").value, ro: document.getElementById("fAuec").readOnly, title: document.getElementById("fTitle").value, place: document.getElementById("fPlace").value, dur: document.getElementById("fDur").value, linked: !document.getElementById("trLinked").hidden, s: document.getElementById("trLinkedS").textContent, foc: document.activeElement.id, help: !document.getElementById("trAuecHelp").hidden, msg: document.getElementById("fMsg").textContent }));
      check("« Ajouter au carnet » : activité cargo, gain/perte = net 43 500 (en lecture seule), titre « Marchandise A · Lieu A → Lieu B », lieu « Lieu A → Lieu B », durée 50", !f.open && f.type === "cargo" && f.auec === "43500" && f.ro && f.title === "Marchandise A · Lieu A → Lieu B" && f.place === "Lieu A → Lieu B" && f.dur === "50", JSON.stringify(f));
      check("encart « Trade lié » affiché et focalisé, résumé « 100 SCU × Marchandise A … +43 500 aUEC · ROI 21,6 % », aide de champ affichée", f.linked && f.foc === "trLinked" && T(f.s) === "100 SCU × Marchandise A · Lieu A → Lieu B · +43 500 aUEC · ROI 21,6 %" && f.help, f.s);
      check("le titre reste modifiable et le formulaire n’est pas encore enregistré", (await api.list()).length === 0 && !(await page.isDisabled("#fTitle")));
      await page.fill("#fTitle", "Mon trade du soir");
      /* « Modifier le calcul » rouvre le tiroir avec les valeurs, le titre manuel est conservé */
      await page.click("#trEdit");
      const rv = await page.evaluate(() => ["trCm", "trScu", "trBuy", "trSell", "trFees", "trFrom", "trTo", "trDur"].map(id => document.getElementById(id).value).join("|"));
      check("« Modifier le calcul » rouvre le tiroir avec les valeurs du trade lié", rv === "Marchandise A|100|2000|2450|1500|Lieu A|Lieu B|50", rv);
      await page.fill("#trSell", "2500"); await page.fill("#trTo", "Lieu C");
      await page.click('#trForm button[type="submit"]');
      check("après recalcul : net 48 500, lieu « Lieu A → Lieu C », titre saisi à la main conservé, focus sur l’encart", (await page.inputValue("#fAuec")) === "48500" && (await page.inputValue("#fPlace")) === "Lieu A → Lieu C" && (await page.inputValue("#fTitle")) === "Mon trade du soir" && (await focusId(page)) === "trLinked");
      /* retour au calcul d'origine */
      await page.click("#trEdit"); await page.fill("#trSell", "2450"); await page.fill("#trTo", "Lieu B");
      await page.click('#trForm button[type="submit"]');
      await page.fill("#fTitle", "");
      await page.click("#trEdit"); await page.click('#trForm button[type="submit"]');
      check("titre vide au moment de l’ajout : le titre automatique est regénéré", (await page.inputValue("#fTitle")) === "Marchandise A · Lieu A → Lieu B");
      await page.click("#fSave");
      await page.waitForFunction(() => /ajoutée/.test(document.getElementById("fMsg").textContent));
      const l1 = await api.list();
      const e1 = l1[0];
      check("enregistrement : 1 entrée cargo avec trade exact et auec = net (43 500), durée 50 (API)", l1.length === 1 && e1.type === "cargo" && e1.auec === 43500 && e1.dur === 50 && JSON.stringify(e1.trade) === JSON.stringify({ cm: "Marchandise A", scu: 100, buy: 2000, sell: 2450, fees: 1500, from: "Lieu A", to: "Lieu B" }), JSON.stringify(l1));
      check("après enregistrement : formulaire remis à zéro (encart masqué, gain/perte modifiable)", await page.evaluate(() => document.getElementById("trLinked").hidden && !document.getElementById("fAuec").readOnly && document.getElementById("fAuec").value === "" && document.getElementById("fTitle").value === ""));
      check("message d’enregistrement mentionnant le trade", /ajoutée au carnet \(trade : \+43 500 aUEC\)/.test(T(await page.textContent("#fMsg"))), await page.textContent("#fMsg"));
      /* entrées supplémentaires pour le journal et les statistiques */
      await tradeEntry("t-loss", 5, 45, "Marchandise B", 80, 3100, 2900, 2000, "Lieu C", "Lieu A");
      await tradeEntry("t-a2", 30, 35, "Marchandise A", 60, 1950, 2400, 1000, "Lieu A", "Lieu C");
      await api.put("m-1", { type: "mining", ts: Date.now() - 2 * 3600e3, dur: 95, auec: 52000, title: "Session de minage", place: "Lieu C", ship: "Vaisseau Y" });
      await page.reload(); await page.waitForSelector("#v-log", { state: "visible" }).catch(() => {});
      await page.waitForFunction(() => document.querySelectorAll(".lg-ent").length === 4, null, { timeout: 5000 });
      check("journal : badge « Trade » sur les 3 trades et pas sur l’entrée de minage", (await page.locator(".tr-bdg").count()) === 3 && T(await page.textContent(".tr-bdg >> nth=0")) === "Trade" && (await page.locator(".lg-ent", { hasText: "Session de minage" }).locator(".tr-bdg").count()) === 0);
      const sums = (await page.locator(".tr-sum").allTextContents()).map(T);
      check("journal : ligne de résumé « 100 SCU × Marchandise A · Lieu A → Lieu B · +43 500 aUEC · ROI 21,6 % »", sums.includes("100 SCU × Marchandise A · Lieu A → Lieu B · +43 500 aUEC · ROI 21,6 %"), sums.join(" || "));
      check("journal : une perte est écrite en toutes lettres avec le vrai signe moins", sums.includes("80 SCU × Marchandise B · Lieu C → Lieu A · " + MINUS + "18 000 aUEC (perte) · ROI " + MINUS + "7,2 %"), sums.join(" || "));
      check("journal : le gain de l’entrée de minage reste affiché comme avant (+52 000 aUEC), sans résumé de trade", /\+52\s?000 aUEC/.test(T(await page.locator(".lg-ent", { hasText: "Session de minage" }).textContent())) && (await page.locator(".lg-ent", { hasText: "Session de minage" }).locator(".tr-sum").count()) === 0);
      const stBefore = T(await page.textContent("#lgStats"));
      check("bilan existant inchangé et cohérent : aUEC net = 43 500 − 18 000 + 26 000 + 52 000 = +103 500", /\+103 500/.test(stBefore) && /4\s*Entrées/.test(stBefore), stBefore);
      check("bloc « Commerce » masqué quand le filtre est « Tout »", await page.isHidden("#trBox"));
      await page.click('#lgFilter button[data-t="cargo"]');
      check("filtre « Commerce / cargo » : seuls les 3 trades listés, bloc « Commerce » affiché", (await page.locator(".lg-ent").count()) === 3 && (await page.isVisible("#trBox")) && (await page.getAttribute('#lgFilter button[data-t="cargo"]', "aria-pressed")) === "true");
      const cs = await tn(page, "#trStats");
      check("stats Commerce : 3 trades, bénéfice total +51 500 aUEC, ROI moyen pondéré 9,0 %", /3 Trades/.test(cs) && /\+51 500 aUEC Bénéfice total/.test(cs) && /9,0 % ROI moyen pondéré/.test(cs), cs);
      check("stats Commerce : meilleure marchandise A (+69 500), pire B (−18 000, perte)", /Marchandise A Meilleure marchandise \+69 500 aUEC/.test(cs) && new RegExp("Marchandise B Pire marchandise " + MINUS + "18 000 aUEC \\(perte\\)").test(cs), cs);
      const bars = await page.evaluate(() => [...document.querySelectorAll("#trStats .tr-bars li")].map(li => ({ t: li.textContent.replace(/[  ]/g, " "), neg: !!li.querySelector("i.neg"), w: li.querySelector("i").style.width, bg: getComputedStyle(li.querySelector("i")).backgroundImage })));
      check("barres par marchandise : 2 barres, A la plus longue (100 %), B hachurée et écrite « perte »", bars.length === 2 && /Marchandise A/.test(bars[0].t) && bars[0].w === "100%" && !bars[0].neg && bars[1].neg && /perte/.test(bars[1].t) && /repeating-linear-gradient/.test(bars[1].bg), JSON.stringify(bars));
      await page.click('#lgFilter button[data-t="mining"]');
      check("autre filtre (Minage) : bloc « Commerce » de nouveau masqué, filtres existants intacts", (await page.isHidden("#trBox")) && (await page.locator(".lg-ent").count()) === 1);
      await page.click('#lgFilter button[data-t=""]');
      await page.fill("#lgSearch", "Marchandise B");
      check("recherche : trouve un trade par sa marchandise", (await page.locator(".lg-ent").count()) === 1);
      await page.fill("#lgSearch", "");
      /* édition d'un trade existant */
      const card = page.locator(".lg-ent", { hasText: "Lieu A → Lieu B" }).first();
      await card.locator(".lg-act button:first-child").click();
      const ed = await page.evaluate(() => ({ linked: !document.getElementById("trLinked").hidden, ro: document.getElementById("fAuec").readOnly, auec: document.getElementById("fAuec").value, t: document.getElementById("lgFormTitle").textContent, s: document.getElementById("trLinkedS").textContent }));
      check("modifier une entrée de trade : l’encart « Trade lié » est rechargé (net 43 500, gain en lecture seule)", ed.linked && ed.ro && ed.auec === "43500" && ed.t === "Modifier l’entrée" && /100 SCU × Marchandise A/.test(ed.s), JSON.stringify(ed));
      await page.click("#trEdit");
      check("modifier le calcul d’une entrée existante : le tiroir est prérempli depuis son trade", (await page.inputValue("#trCm")) === "Marchandise A" && (await page.inputValue("#trScu")) === "100" && (await page.inputValue("#trFees")) === "1500" && (await page.inputValue("#trDur")) === "50");
      await page.fill("#trSell", "2500");
      await page.click('#trForm button[type="submit"]');
      await page.click("#fSave");
      await page.waitForFunction(() => /Entrée modifiée\./.test(document.getElementById("fMsg").textContent));
      const l2 = await api.list(), e2 = l2.find(e => e.id === e1.id);
      check("édition du calcul : même entrée (pas de doublon), vente 2 500, auec recalculé à 48 500", l2.length === 4 && e2.trade.sell === 2500 && e2.auec === 48500 && e2.title === "Marchandise A · Lieu A → Lieu B", JSON.stringify(e2));
      await page.locator(".lg-ent", { hasText: "Lieu A → Lieu B" }).first().locator(".lg-act button:first-child").click();
      await page.click("#trDel");
      const rm = await page.evaluate(() => ({ hid: document.getElementById("trLinked").hidden, ro: document.getElementById("fAuec").readOnly, v: document.getElementById("fAuec").value, foc: document.activeElement.id, msg: document.getElementById("fMsg").textContent, help: document.getElementById("trAuecHelp").hidden }));
      check("« Retirer le trade » : encart masqué, gain/perte de nouveau modifiable (valeur gardée), focus sur ce champ", rm.hid && !rm.ro && rm.v === "48500" && rm.foc === "fAuec" && /Trade retiré/.test(rm.msg) && rm.help, JSON.stringify(rm));
      await page.click("#fSave");
      await page.waitForFunction(() => /Entrée modifiée\./.test(document.getElementById("fMsg").textContent));
      const e3 = (await api.list()).find(e => e.id === e1.id);
      check("retrait du lien : l’entrée perd `trade` mais garde le reste (titre, lieu, durée, gain, vaisseau)", e3 && !("trade" in e3) && e3.auec === 48500 && e3.title === "Marchandise A · Lieu A → Lieu B" && e3.place === "Lieu A → Lieu B" && e3.dur === 50 && e3.type === "cargo", JSON.stringify(e3));
      check("journal après retrait : plus de badge ni de résumé sur cette entrée (2 trades restants)", (await page.locator(".tr-bdg").count()) === 2);
      /* changer l'activité retire le trade lié */
      await page.click("#trOpen"); await fillDr(page, EX); await page.click('#trForm button[type="submit"]');
      await page.selectOption("#fType", "mining");
      check("changer l’activité pour autre chose que cargo retire le trade lié (message)", (await page.isHidden("#trLinked")) && !(await page.evaluate(() => document.getElementById("fAuec").readOnly)) && /n’est plus « Commerce/.test(await page.textContent("#fMsg")));
      /* une entrée sans trade reste identique */
      const mining = (await api.list()).find(e => e.id === "m-1");
      check("entrée sans trade inchangée par l’API (aucune clé trade, champs d’origine)", !("trade" in mining) && mining.auec === 52000 && mining.title === "Session de minage" && mining.dur === 95);
      await ctx.close();
    });

    /* ───────── 5. Exports et imports ───────── */
    let exportedJson = null;
    await section("exports", async () => {
      await api.clear();
      const ts = new Date("2026-10-20T10:00:00Z").getTime();
      await api.put("x-1", { type: "cargo", ts, dur: 50, title: "Trade piégé", place: "A → B", ship: "S", notes: "n", trade: { cm: "=1+1", scu: 100, buy: 2000, sell: 2450, fees: 1500, from: "@evil", to: "-x" } });
      await api.put("x-2", { type: "cargo", ts: ts + 1000, dur: 0, title: "Trade en perte", trade: { cm: "Marchandise B", scu: 80, buy: 3100, sell: 2900, fees: 2000, from: "Lieu C", to: "Lieu A" } });
      await api.put("x-3", { type: "mining", ts: ts + 2000, dur: 95, auec: 52000, title: "Minage", place: "C", ship: "Y", notes: "=1+1" });
      const { ctx, page } = await newPage(); await openLog(page);
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#xCsv")]);
      const csv = fs.readFileSync(await dl.path(), "utf8");
      const rows = parseCsv(csv.slice(1));
      const H = "date|activité|durée_min|aUEC|titre|lieu|vaisseau|notes|source|marchandise|scu|achat_par_scu|vente_par_scu|frais|lieu_achat|lieu_vente|roi_pct";
      check("export CSV : colonnes d’origine dans le même ordre, 8 colonnes de trade ajoutées à la suite", rows[0].join("|") === H, rows[0].join("|"));
      check("export CSV : 3 lignes de données de 17 colonnes", rows.length === 4 && rows.every(r => r.length === 17));
      const byTitle = {}; rows.slice(1).forEach(r => byTitle[r[4]] = r);
      const t1 = byTitle["Trade piégé"];
      check("export CSV : valeurs du trade (scu 100, achat 2000, vente 2450, frais 1500, ROI 21,6) et net 43 500 en colonne aUEC", t1[10] === "100" && t1[11] === "2000" && t1[12] === "2450" && t1[13] === "1500" && t1[16] === "21,6" && t1[3] === "43500", t1.join("|"));
      check("export CSV : neutralisation des formules (= @ -) dans marchandise, lieu d’achat et lieu de vente", t1[9] === "'=1+1" && t1[14] === "'@evil" && t1[15] === "'-x", [t1[9], t1[14], t1[15]].join("|"));
      const t2 = byTitle["Trade en perte"];
      check("export CSV : perte → auec négatif et ROI négatif (−7,2)", t2[3] === "-18000" && t2[16] === "-7,2", t2.join("|"));
      const m = byTitle["Minage"];
      check("export CSV : entrée sans trade → 8 cellules de trade vides ; note « =1+1 » toujours neutralisée", m.slice(9).every(c => c === "") && m[7] === "'=1+1" && m[3] === "52000", m.join("|"));
      const [dj] = await Promise.all([page.waitForEvent("download"), page.click("#xJson")]);
      exportedJson = fs.readFileSync(await dj.path(), "utf8");
      const arr = JSON.parse(exportedJson), by = {}; arr.forEach(e => by[e.id] = e);
      check("export JSON : `trade` présent avec les 7 champs sur les trades, absent sur l’entrée sans trade, aucun champ interne", JSON.stringify(by["x-1"].trade) === JSON.stringify({ cm: "=1+1", scu: 100, buy: 2000, sell: 2450, fees: 1500, from: "@evil", to: "-x" }) && by["x-2"].trade.fees === 2000 && !("trade" in by["x-3"]) && arr.every(e => !("tr" in e)), exportedJson.slice(0, 300));
      /* aller-retour : on vide, puis on réimporte le JSON exporté */
      await api.clear();
      await page.reload(); await page.waitForFunction(() => /Enregistré sur le serveur/.test(document.getElementById("lgStore").textContent));
      await page.setInputFiles("#jFile", { name: "carnet.json", mimeType: "application/json", buffer: Buffer.from(exportedJson) });
      await page.waitForFunction(() => /importée/.test(document.getElementById("gPrev").textContent), null, { timeout: 8000 });
      const back = await api.list(), bb = {}; back.forEach(e => bb[e.id] = e);
      check("import JSON (aller-retour) : 3 entrées, trades identiques, auec = net, entrée sans trade sans `trade`", back.length === 3 && JSON.stringify(bb["x-1"].trade) === JSON.stringify(by["x-1"].trade) && bb["x-1"].auec === 43500 && bb["x-2"].auec === -18000 && !("trade" in bb["x-3"]) && bb["x-3"].auec === 52000, JSON.stringify(back).slice(0, 300));
      check("import JSON : le journal affiche les trades importés (badges, résumé)", (await page.locator(".tr-bdg").count()) === 2);
      /* import d'un fichier hostile : les trades sont nettoyés */
      const hostile = [
        { id: "h-1", type: "cargo", ts: 1760000000000, title: "ok", trade: { cm: "x".repeat(300), scu: 5, buy: 1, sell: 3, fees: 2, from: " A ", to: "B", __proto__: { z: 1 }, extra: "zzz" }, auec: 12345 },
        { id: "h-2", type: "cargo", ts: 1760000000000, title: "invalide", auec: 77, trade: { scu: -5, buy: 1, sell: 1 } },
        { id: "h-3", type: "mining", ts: 1760000000000, title: "pas cargo", auec: 9, trade: { scu: 1, buy: 1, sell: 5 } },
        { id: "h-4", type: "cargo", ts: 1760000000000, title: "texte", auec: 3, trade: "=cmd" },
        { id: "h-5", type: "cargo", ts: 1760000000000, title: "gros", auec: 3, trade: { scu: 1e30, buy: 1, sell: 5 } }
      ];
      await page.setInputFiles("#jFile", { name: "hostile.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(hostile)) });
      await page.waitForFunction(() => /5 entrée\(s\) importée/.test(document.getElementById("gPrev").textContent), null, { timeout: 8000 });
      const hl = {}; (await api.list()).forEach(e => hl[e.id] = e);
      check("import hostile : trade nettoyé (texte coupé à 80, champs inconnus retirés, net recalculé 3×5 − 5 − 2 = 8)", hl["h-1"].trade && hl["h-1"].trade.cm.length === 80 && hl["h-1"].trade.from === "A" && !("extra" in hl["h-1"].trade) && hl["h-1"].auec === 8, JSON.stringify(hl["h-1"]));
      check("import hostile : trade invalide / non cargo / texte / énorme → ignoré, entrée gardée avec son auec", ["h-2", "h-3", "h-4", "h-5"].every(k => hl[k] && !("trade" in hl[k])) && hl["h-2"].auec === 77 && hl["h-3"].auec === 9);
      await ctx.close();
    });

    /* ───────── 6. Stockage local (API indisponible) ───────── */
    await section("stockage local", async () => {
      const { ctx, page } = await newPage({}, true); await openLog(page, true);
      await page.click("#trOpen"); await fillDr(page, EX); await page.click('#trForm button[type="submit"]');
      await page.evaluate(() => { document.getElementById("fAuec").value = "999"; }); // forcé malgré la lecture seule : doit être ignoré
      await page.click("#fSave");
      await page.waitForFunction(() => /ajoutée/.test(document.getElementById("fMsg").textContent));
      const ls = await page.evaluate(() => JSON.parse(localStorage.getItem("sclog_entries")));
      check("stockage local : l’entrée enregistrée porte `trade` normalisé et auec = net (43 500)", ls.length === 1 && ls[0].auec === 43500 && JSON.stringify(ls[0].trade) === JSON.stringify({ cm: "Marchandise A", scu: 100, buy: 2000, sell: 2450, fees: 1500, from: "Lieu A", to: "Lieu B" }) && !("tr" in ls[0]), JSON.stringify(ls));
      await page.evaluate(() => { const a = JSON.parse(localStorage.getItem("sclog_entries")); a.push({ id: "old1", type: "mining", ts: Date.now(), dur: 5, auec: 10, title: "ancien carnet" }); a.push({ id: "bad1", type: "cargo", ts: Date.now(), auec: 5, title: "trade cassé", trade: { scu: "x" } }); localStorage.setItem("sclog_entries", JSON.stringify(a)); });
      await page.reload(); await page.waitForFunction(() => document.querySelectorAll(".lg-ent").length === 3);
      check("stockage local : un ancien carnet et un trade mal formé s’affichent sans erreur (badge seulement sur le bon trade)", (await page.locator(".tr-bdg").count()) === 1 && /ancien carnet/.test(await page.textContent("#lgList")));
      await ctx.close();
    });

    /* ───────── 6 bis. option de préremplissage du tiroir (open({prefill})) : non-régression ───────── */
    await section("préremplissage", async () => {
      await api.clear();
      const { ctx, page } = await newPage(); await openLog(page);
      const txt = (pg, sel) => pg.locator(sel).first().innerText().then(x => x.split(/\s+/).join(" ").trim());
      const vals = () => page.evaluate(() => ["Cm", "Scu", "Fees", "Buy", "Sell", "From", "To", "Dur"].map(k => document.getElementById("tr" + k).value).join("|"));
      await page.click("#trOpen"); await page.fill("#trCm", "Brouillon"); await page.fill("#trFees", "12"); await page.keyboard.press("Escape");
      check("brouillon conservé à la fermeture (comportement existant)", (await page.evaluate(() => document.getElementById("trOv").hidden)));
      await page.evaluate(() => window.OrbTrade.drawer.open({ opener: document.getElementById("trOpen"), prefill: { cm: "Alpha", scu: 10, buy: "100", sell: 130, from: "A (X)", to: "B (Y)" }, note: "Note de test" }));
      check("prefill : champs remplis (nombres convertis), frais et durée vides, les anciens champs sont remplacés", (await vals()) === "Alpha|10||100|130|A (X)|B (Y)|", await vals());
      check("prefill : note d'aide remplaçante, résultat en direct +300 aUEC", (await txt(page, "#trDrD")) === "Note de test" && /\+300/.test(await txt(page, ".tr-net")));
      await page.keyboard.press("Escape");
      check("prefill annulé : brouillon d'avant restauré, aide d'origine rétablie", (await vals()) === "Brouillon||12|||||" && /Tout vient de votre saisie/.test(await txt(page, "#trDrD")), await vals());
      await page.evaluate(() => window.OrbTrade.drawer.open({ opener: document.getElementById("trOpen"), values: { cm: "V", scu: "5", buy: "1", sell: "2" } }));
      check("option `values` inchangée (remplace le brouillon, aide d'origine)", (await vals()) === "V|5||1|2|||" && /Tout vient de votre saisie/.test(await txt(page, "#trDrD")), await vals());
      await page.keyboard.press("Escape");
      await page.evaluate(() => window.OrbTrade.drawer.set({}));
      await ctx.close();
    });

    /* ───────── 7. Console et CSP ───────── */
    check("aucune violation CSP ni erreur console pendant toute la série", errors.length === 0, errors.slice(0, 5).join(" | "));
  } catch (e) {
    check("exécution des tests", false, e.stack || String(e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    try { child.kill(); } catch (e) {}
  }
  const n = results.filter(Boolean).length;
  console.log("\n" + n + "/" + results.length + " vérifications réussies");
  process.exit(n === results.length ? 0 : 1);
})();
