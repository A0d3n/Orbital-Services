// Test de la recherche globale (palette « / ») et des liens #chronologie/<id>.
// Usage : node tests/search.js   (CHROMIUM_PATH pour utiliser un Chromium déjà installé)
"use strict";
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok }); console.log((ok ? "  ok   " : "  ÉCHEC ") + name + (ok || extra === undefined ? "" : " → " + extra)); };

function startServer(port) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "orbital-search-"));
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: data }), stdio: "ignore" });
  return { child, data };
}
async function waitUp(port) {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch("http://127.0.0.1:" + port + "/healthz"); if (r.status) return; } catch (e) {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("le serveur ne répond pas");
}

(async () => {
  const port = 19000 + Math.floor(Math.random() * 500);
  const srv = startServer(port);
  let browser;
  const shots = [];
  try {
    await waitUp(port);
    const base = "http://127.0.0.1:" + port + "/";
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:" + port });
    const page = await ctx.newPage();
    const errors = [];
    const watch = p => {
      p.on("pageerror", e => errors.push(e.message));
      p.on("console", m => { if (m.type() === "error" && !/googleapis|gstatic|ERR_|net::|evt-|robertsspaceindustries/.test(m.text() + (m.location().url || ""))) errors.push(m.text()); });
    };
    watch(page);
    const requested = [];
    page.on("request", r => requested.push(r.url()));

    const isOpen = () => page.evaluate(() => !document.getElementById("srchOv").hidden);
    const opts = () => page.$$eval("#srchLb [role=option]", els => els.map(e => ({ id: e.id, t: e.querySelector("b").textContent, sel: e.getAttribute("aria-selected") === "true", g: e.closest("[role=group]").querySelector("[role=presentation]").textContent })));
    const groupsOf = async () => { const o = await opts(); return o.reduce((m, x) => { m[x.g] = (m[x.g] || 0) + 1; return m; }, {}); };
    const typeQ = async v => { await page.fill("#srchQ", v); await page.waitForTimeout(60); };
    const view = () => page.evaluate(() => ["home", "log", "time", "map", "cl", "ver"].find(k => !document.getElementById("v-" + k).hidden));
    const inView = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 2 || (r.top < innerHeight * .75 && r.bottom > innerHeight * .25); }, sel);

    await page.goto(base);
    await page.waitForSelector(".hm-banner");
    check("palette : fermée au chargement, loupe visible dans l'en-tête", !(await isOpen()) && await page.isVisible("#srchOpen"));
    check("Comm-Links : commlinks.js n'est pas chargé avant la première ouverture", !requested.some(u => /commlinks\.js/.test(u)));

    /* ouverture (commlinks.js ralenti pour voir l'indicateur de chargement) */
    await page.route("**/commlinks.js", async r => { await new Promise(x => setTimeout(x, 900)); r.continue(); });
    await page.keyboard.press("/");
    check("« / » ouvre la palette, le champ a le focus", (await isOpen()) && (await page.evaluate(() => document.activeElement.id)) === "srchQ");
    check("combobox : rôle, aria-controls et dialogue modal",
      (await page.getAttribute("#srchQ", "role")) === "combobox" && (await page.getAttribute("#srchQ", "aria-controls")) === "srchLb" &&
      (await page.getAttribute("#srchDlg", "aria-modal")) === "true" && (await page.getAttribute("#srchLb", "role")) === "listbox");
    await typeQ("stanton");
    const loadingShown = await page.evaluate(() => /Chargement des Comm-Links…/.test(document.getElementById("srchLb").textContent));
    const g1 = await groupsOf();
    check("« stanton » : événement, système et planète pendant le chargement des Comm-Links", g1["Événements de la chronologie"] >= 1 && g1["Systèmes"] >= 1 && g1["Planètes"] >= 1, JSON.stringify(g1));
    check("indicateur « Chargement des Comm-Links… » affiché sans bloquer les autres sources", loadingShown, await page.evaluate(() => document.getElementById("srchLb").textContent.slice(-120)));
    await page.waitForFunction(() => !/Chargement des Comm-Links…/.test(document.getElementById("srchLb").textContent), null, { timeout: 8000 });
    await page.keyboard.press("Escape");
    check("Échap ferme la palette", !(await isOpen()));

    /* « / » ne s'ouvre pas dans un champ de saisie */
    await page.click('#loreBtn'); await page.click('.tab[data-v="time"]');
    await page.waitForSelector("#tlQ");
    await page.focus("#tlQ"); await page.keyboard.type("a/b");
    check("« / » dans un champ de saisie : pas d'ouverture, caractère saisi", !(await isOpen()) && (await page.inputValue("#tlQ")) === "a/b");
    await page.fill("#tlQ", ""); await page.evaluate(() => document.activeElement.blur());

    /* loupe, focus restitué (même quand le menu Lore est ouvert : Échap de map.js) */
    await page.focus("#srchOpen"); await page.keyboard.press("Enter");
    check("la loupe (clavier) ouvre la palette", await isOpen());
    await page.keyboard.press("Escape");
    check("Échap rend le focus à la loupe", !(await isOpen()) && (await page.evaluate(() => document.activeElement.id)) === "srchOpen");
    await page.click("#srchOpen");
    await page.keyboard.press("Escape");
    check("Échap rend le focus à la loupe (ouverture à la souris, menu Lore ouvert)", (await page.evaluate(() => document.activeElement.id)) === "srchOpen" && (await page.getAttribute("#loreBtn", "aria-expanded")) === "true");

    /* « stanton » : événement + système + planète */
    await page.keyboard.press("/");
    await typeQ("stanton");
    check("commlinks.js chargé à la première ouverture seulement", requested.filter(u => /commlinks\.js/.test(u)).length === 1);
    const o1 = await opts();
    check("classement : le titre exact passe avant le texte (« Ouverture de Stanton » en tête des événements)", o1[0].t === "Ouverture de Stanton", o1[0] && o1[0].t);
    check("max 8 résultats par groupe", Object.values(await groupsOf()).every(n => n <= 8));
    check("extrait avec le terme surligné (<mark>)", (await page.$$eval("#srchLb mark", m => m.map(x => x.textContent.toLowerCase()))).includes("stanton"));
    check("aria-live : nombre de résultats annoncé", /^\d+ résultats?/.test(await page.textContent("#srchCount")));
    const ad = await page.getAttribute("#srchQ", "aria-activedescendant");
    check("aria-activedescendant désigne l'option sélectionnée", ad && (await page.getAttribute("#" + ad, "aria-selected")) === "true" && (await page.getAttribute("#" + ad, "role")) === "option");

    /* captures */
    const tmp = os.tmpdir();
    await page.keyboard.press("Escape");
    await page.click('.tab[data-v="home"]');
    await page.keyboard.press("/"); await typeQ("stan");
    await page.screenshot({ path: path.join(tmp, "orbital-recherche-1440x900.png") }); shots.push(path.join(tmp, "orbital-recherche-1440x900.png"));
    await page.keyboard.press("Escape");

    /* accents, casse, apostrophes */
    async function titles(q) { await page.keyboard.press("/"); await typeQ(q); const t = (await opts()).map(x => x.g + "|" + x.t).join("\n"); await page.keyboard.press("Escape"); return t; }
    const a = await titles("Xi’an"), b = await titles("xian"), c = await titles("XI'AN"), d = await titles("xi an");
    check("« Xi’an » = « xian » = « XI'AN » (accents, casse, apostrophes)", a.length > 0 && a === b && b === c, a.split("\n").length + " / " + b.split("\n").length);
    check("« Xi’an » trouve « Les Xi’an atteignent l’espace »", a.includes("Les Xi’an atteignent l’espace"));
    check("accents : « etat de l'empire » et « état de l’empire » équivalents", (await titles("ete")) === (await titles("été")));
    check("espace insécable dans la requête = espace", (await titles("monthly report")) === (await titles("monthly report")));
    check("plusieurs mots : tous doivent être présents", (await titles("stanton zzzzqq")) === "");

    /* Comm-Link */
    await page.keyboard.press("/"); await typeQ("monthly report");
    const gc = await groupsOf();
    check("« monthly report » : Comm-Links trouvés (groupe + max 8)", gc["Comm-Links"] >= 1 && gc["Comm-Links"] <= 8, JSON.stringify(gc));
    const cl0 = (await opts()).find(x => x.g === "Comm-Links");
    check("Comm-Link : titre contenant « Monthly Report »", /monthly report/i.test(cl0.t), cl0.t);
    const popupP = ctx.waitForEvent("page", { timeout: 8000 });
    await page.evaluate(() => { document.querySelectorAll("#srchLb [role=option]"); });
    const nav = (await opts()).findIndex(x => x.g === "Comm-Links");
    for (let i = 0; i < nav; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    const pop = await popupP.catch(() => null);
    check("Comm-Link : s'ouvre dans un nouvel onglet vers robertsspaceindustries.com/comm-link/", pop && /^https:\/\/robertsspaceindustries\.com\/(en\/)?comm-link\//.test(pop.url()), pop && pop.url());
    if (pop) await pop.close().catch(() => {});
    check("Comm-Link : palette refermée, page inchangée", !(await isOpen()) && (await view()) === "home");

    /* état vide + HTML échappé */
    await page.keyboard.press("/"); await typeQ("zzzqqq");
    check("état vide : « Aucun résultat pour « zzzqqq » »", (await page.textContent("#srchLb")).includes("Aucun résultat pour « zzzqqq »") && (await page.textContent("#srchCount")) === "Aucun résultat");
    await typeQ("<img src=x onerror=alert(1)>");
    check("HTML de la requête échappé", (await page.$$("#srchLb img")).length === 0 && (await page.textContent("#srchLb")).includes("<img src=x"));
    await typeQ("stanton"); await page.keyboard.press("Escape");

    /* navigation ↑↓ Entrée */
    await page.keyboard.press("/"); await typeQ("stanton");
    let o = await opts();
    check("la première option est sélectionnée par défaut", o[0].sel);
    await page.keyboard.press("ArrowDown");
    check("↓ déplace la sélection", !(await opts())[0].sel && (await opts())[1].sel);
    await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp");
    check("↑ boucle sur la dernière option", (await opts())[(await opts()).length - 1].sel);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.getElementById("v-time").hidden);
    check("Entrée sur un événement → onglet Chronologie, adresse #chronologie/<id>", (await view()) === "time" && /#chronologie\/ouverture-de-stanton$/.test(page.url()), page.url());
    check("l'événement est mis en évidence (flash) et visible", await page.evaluate(() => { const e = document.getElementById("ev-ouverture-de-stanton"); return e.classList.contains("flash"); }) && await inView("#ev-ouverture-de-stanton"));

    await page.keyboard.press("/"); await typeQ("stanton");
    o = await opts();
    const iSys = o.findIndex(x => x.g === "Systèmes");
    for (let i = 0; i < iSys; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.getElementById("v-map").hidden);
    check("Entrée sur un système → #carte/année/stanton", /#carte\/\d{4}\/stanton$/.test(page.url()), page.url());
    await page.waitForTimeout(400);
    check("la carte a sélectionné Stanton", /stanton/i.test(await page.evaluate(() => document.getElementById("v-map").textContent.slice(0, 20000))));

    await page.keyboard.press("/"); await typeQ("hurston");
    o = await opts();
    const iPl = o.findIndex(x => x.g === "Planètes");
    check("« hurston » : une planète est proposée", iPl >= 0);
    for (let i = 0; i < iPl; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => /#carte\/\d{4}\/stanton$/.test(location.hash));
    check("Entrée sur une planète → son système (#carte/année/stanton)", (await view()) === "map");

    /* clic / tap sur un résultat */
    await page.keyboard.press("/"); await typeQ("naissance");
    await page.click("#srchLb [role=option]");
    await page.waitForFunction(() => !document.getElementById("v-time").hidden);
    check("un clic sur un résultat l'ouvre", (await view()) === "time" && /#chronologie\//.test(page.url()));

    /* lien #chronologie/<id> : chargement direct */
    const p2 = await ctx.newPage(); watch(p2);
    await p2.goto(base + "#chronologie/les-xian-atteignent-lespace");
    await p2.waitForSelector("#ev-les-xian-atteignent-lespace");
    await p2.waitForTimeout(500);
    const dl = await p2.evaluate(() => { const e = document.getElementById("ev-les-xian-atteignent-lespace"), r = e.getBoundingClientRect(); return { v: !document.getElementById("v-time").hidden, fl: e.classList.contains("flash"), mid: r.top > 0 && r.bottom < innerHeight, y: scrollY, h: location.hash, foc: document.activeElement === e }; });
    check("lien direct #chronologie/<id> : page Chronologie ouverte", dl.v, JSON.stringify(dl));
    check("lien direct : défilement jusqu'à l'événement (visible, page défilée)", dl.mid && dl.y > 100, JSON.stringify(dl));
    check("lien direct : événement mis en évidence, adresse conservée", dl.fl && dl.h === "#chronologie/les-xian-atteignent-lespace", JSON.stringify(dl));
    /* événement masqué par un filtre ou dans l'ordre « récent » : le lien le retrouve */
    await p2.fill("#tlQ", "zzzzzz");
    await p2.evaluate(() => { location.hash = "#chronologie/ouverture-de-stanton"; });
    await p2.waitForFunction(() => !document.getElementById("ev-ouverture-de-stanton").hidden);
    check("lien : lève les filtres qui masquent l'événement", (await p2.inputValue("#tlQ")) === "" && await p2.evaluate(() => document.getElementById("ev-ouverture-de-stanton").classList.contains("flash")));
    await p2.evaluate(() => window.__orbSort("recent"));
    await p2.evaluate(() => { location.hash = "#chronologie/naissance-de-roberts-space-industries"; });
    await p2.waitForTimeout(300);
    const ids = await p2.evaluate(() => [...document.querySelectorAll("#app .ev")].map(e => e.id));
    check("lien depuis l'ordre « récent » : retour à l'affichage par époque", await p2.evaluate(() => !document.getElementById("app").hidden && document.getElementById("appFlat").hidden));
    check("identifiant inconnu : la chronologie s'ouvre sans erreur", await (async () => { await p2.goto(base + "#chronologie/n-existe-pas"); await p2.waitForSelector(".era"); return (await p2.evaluate(() => !document.getElementById("v-time").hidden)); })());
    await p2.close();

    /* slugs uniques */
    const sl = await page.evaluate(() => { const all = []; ERAS.forEach(e => e.e.forEach(x => all.push(x.id))); return { n: all.length, u: new Set(all).size, dom: [...document.querySelectorAll("#app .ev")].map(e => e.id), bad: all.filter(i => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(i)), copy: document.querySelectorAll("#app .ev-copy").length }; });
    check("identifiants : 64 événements, 64 identifiants uniques", sl.n === 64 && sl.u === 64, sl.n + "/" + sl.u);
    check("identifiants : slugs propres (a-z, 0-9, tirets) et présents dans la page", sl.bad.length === 0 && new Set(sl.dom).size === 64, sl.bad.join(","));
    check("un bouton « Copier le lien » sur chaque carte", sl.copy === 64);

    /* copie : Ctrl+Entrée et bouton de carte */
    const readClip = () => page.evaluate(() => navigator.clipboard.readText());
    await page.keyboard.press("/"); await typeQ("ouverture de stanton");
    await page.keyboard.press("Control+Enter");
    await page.waitForFunction(() => /Lien copié/.test(document.getElementById("orbToast").textContent));
    check("Ctrl+Entrée copie le lien du résultat sélectionné", (await readClip()) === base + "#chronologie/ouverture-de-stanton", await readClip());
    check("message « Lien copié » dans une zone role=status", (await page.getAttribute("#orbToast", "role")) === "status" && /Lien copié/.test(await page.textContent("#orbToast")));
    check("Ctrl+Entrée garde la palette ouverte", await isOpen());
    await typeQ("stanton");
    const iS = (await opts()).findIndex(x => x.g === "Systèmes");
    for (let i = 0; i < iS; i++) await page.keyboard.press("ArrowDown");
    await page.click("#srchCopy");
    await page.waitForTimeout(100);
    check("bouton « Copier le lien » de la palette : lien de la carte #carte/année/stanton", /#carte\/\d{4}\/stanton$/.test(await readClip()), await readClip());
    await page.keyboard.press("Escape");
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await page.click('.tab[data-v="time"]').catch(async () => { await page.click("#loreBtn"); await page.click('.tab[data-v="time"]'); });
    await page.waitForSelector("#ev-ouverture-de-stanton .ev-copy", { state: "attached" });
    await page.evaluate(() => document.querySelector("#ev-ouverture-de-stanton").scrollIntoView({ block: "center" }));
    await page.click("#ev-ouverture-de-stanton .ev-copy");
    await page.waitForFunction(() => /Lien copié/.test(document.getElementById("orbToast").textContent));
    check("bouton « Copier le lien » d'une carte d'événement", (await readClip()) === base + "#chronologie/ouverture-de-stanton");

    /* repli sans navigator.clipboard (HTTP non sécurisé) */
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx2.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: undefined });
      window.__copied = [];
      document.execCommand = function (c) { const s = document.getSelection().toString() || (document.activeElement && document.activeElement.value) || ""; window.__copied.push([c, s]); return true; };
    });
    const p3 = await ctx2.newPage(); watch(p3);
    await p3.goto(base); await p3.waitForSelector(".hm-banner");
    await p3.keyboard.press("/"); await p3.fill("#srchQ", "ouverture de stanton"); await p3.waitForTimeout(80);
    await p3.keyboard.press("Control+Enter");
    await p3.waitForFunction(() => /Lien copié/.test(document.getElementById("orbToast").textContent));
    const cp = await p3.evaluate(() => window.__copied);
    check("sans navigator.clipboard : repli execCommand avec le lien sélectionné", cp.length === 1 && cp[0][0] === "copy" && cp[0][1] === base + "#chronologie/ouverture-de-stanton", JSON.stringify(cp));
    check("repli : le focus revient dans la palette", await p3.evaluate(() => document.activeElement.id === "srchQ"));
    await ctx2.close();

    /* focus piégé */
    await page.keyboard.press("/");
    let stay = true;
    for (let i = 0; i < 7; i++) { await page.keyboard.press(i % 2 ? "Shift+Tab" : "Tab"); stay = stay && await page.evaluate(() => document.getElementById("srchDlg").contains(document.activeElement)); }
    for (let i = 0; i < 5; i++) { await page.keyboard.press("Tab"); stay = stay && await page.evaluate(() => document.getElementById("srchDlg").contains(document.activeElement)); }
    check("focus piégé dans la palette (Tab et Maj+Tab)", stay);
    check("l'application derrière la palette est inerte", await page.evaluate(() => document.querySelector(".app").inert));
    await page.keyboard.press("Escape");
    check("après fermeture : application active, défilement libre", await page.evaluate(() => !document.querySelector(".app").inert && !document.documentElement.classList.contains("srch-lock")));

    /* mouvement réduit */
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.keyboard.press("/"); await typeQ("terra");
    check("prefers-reduced-motion : la palette fonctionne", (await opts()).length > 0 && await page.evaluate(() => getComputedStyle(document.getElementById("orbToast")).transitionDuration.startsWith("0")));
    await page.keyboard.press("Escape"); await page.emulateMedia({ reducedMotion: "no-preference" });

    /* 390 px */
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const pm = await m.newPage(); watch(pm);
    await pm.goto(base); await pm.waitForSelector(".hm-banner");
    const noScroll = () => pm.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth);
    check("390 px : pas de défilement horizontal (accueil)", await noScroll());
    const bb = await pm.evaluate(() => { const r = document.getElementById("srchOpen").getBoundingClientRect(); return [r.width, r.height, r.right]; });
    check("390 px : la loupe est visible dans l'en-tête, zone tactile >= 44 px", bb[0] >= 44 && bb[1] >= 44 && bb[2] <= 390, JSON.stringify(bb));
    await pm.tap("#srchOpen");
    await pm.fill("#srchQ", "stan"); await pm.waitForTimeout(100);
    const geo = await pm.evaluate(() => { const d = document.getElementById("srchDlg").getBoundingClientRect(); return { w: d.width, h: d.height, x: d.left, y: d.top, opt: [...document.querySelectorAll("#srchLb [role=option]")].map(o => o.getBoundingClientRect().height), btn: ["srchClose", "srchCopy"].map(i => document.getElementById(i).getBoundingClientRect().height) }; });
    check("390 px : palette plein écran (390 x 844)", Math.abs(geo.w - 390) < 1 && Math.abs(geo.h - 844) < 2 && geo.x === 0, JSON.stringify(geo));
    check("390 px : options et boutons >= 44 px", geo.opt.length > 0 && geo.opt.every(h => h >= 44) && geo.btn.every(h => h >= 44), JSON.stringify(geo));
    check("390 px : pas de défilement horizontal (palette ouverte)", await noScroll());
    await pm.screenshot({ path: path.join(tmp, "orbital-recherche-390x844.png") }); shots.push(path.join(tmp, "orbital-recherche-390x844.png"));
    await pm.tap("#srchLb [role=option]");
    await pm.waitForFunction(() => !document.getElementById("v-time").hidden);
    check("390 px : un tap sur un résultat l'ouvre, palette refermée", !(await pm.evaluate(() => !document.getElementById("srchOv").hidden)));
    check("390 px : pas de défilement horizontal (chronologie, lien direct)", await noScroll());
    await pm.goto(base + "#chronologie/ouverture-de-stanton"); await pm.waitForSelector("#ev-ouverture-de-stanton"); await pm.waitForTimeout(500);
    await pm.screenshot({ path: path.join(tmp, "orbital-lien-390x844.png") }); shots.push(path.join(tmp, "orbital-lien-390x844.png"));
    check("390 px : pas de défilement horizontal (carte d'événement avec bouton copier)", await noScroll());
    const cb = await pm.evaluate(() => document.querySelector("#ev-ouverture-de-stanton .ev-copy").getBoundingClientRect().height);
    check("390 px : bouton « Copier le lien » de la carte >= 44 px", cb >= 44, cb);
    await pm.tap("#srchOpen"); await pm.fill("#srchQ", "ouverture"); await pm.waitForTimeout(100);
    await pm.keyboard.press("Escape");
    await m.close();

    /* 1440 px : chronologie avec lien */
    await page.goto(base + "#chronologie/ouverture-de-stanton"); await page.waitForSelector("#ev-ouverture-de-stanton"); await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(tmp, "orbital-lien-1440x900.png") }); shots.push(path.join(tmp, "orbital-lien-1440x900.png"));
    check("1440 px : pas de défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    check("aucune erreur dans la console", errors.length === 0, errors.join(" | "));
  } catch (e) {
    check("exécution sans exception", false, e && e.stack || e);
  } finally {
    if (browser) await browser.close().catch(() => {});
    srv.child.kill();
    try { fs.rmSync(srv.data, { recursive: true, force: true }); } catch (e) {}
  }
  const ok = results.filter(r => r.ok).length;
  console.log("\n" + ok + "/" + results.length + " vérifications réussies");
  if (shots.length) console.log("Captures :\n  " + shots.join("\n  "));
  process.exit(ok === results.length ? 0 : 1);
})();
