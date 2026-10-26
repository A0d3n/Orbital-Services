// Test de fumée : lance le serveur, ouvre chaque onglet dans Chromium et vérifie les fonctions principales.
// Usage : npm test   (CHROMIUM_PATH pour utiliser un Chromium déjà installé)
"use strict";
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok, extra }); console.log((ok ? "  ok   " : "  ÉCHEC ") + name + (ok || !extra ? "" : " → " + extra)); };

function startServer(port, env) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "orbital-"));
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: data }, env), stdio: "ignore" });
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
  const port = 18300 + Math.floor(Math.random() * 500), port2 = port + 600;
  const a = startServer(port, {}), b = startServer(port2, { AUTH_PASSWORD: "secret" });
  let browser;
  try {
    await waitUp(port); await waitUp(port2);
    const base = "http://127.0.0.1:" + port;

    /* serveur */
    const hz = await (await fetch(base + "/healthz")).json();
    check("healthz : la page est trouvée", hz.ok === true && hz.page === true);
    check("serveur : image .webp avec le bon type", (await fetch(base + "/terra.webp")).headers.get("content-type") === "image/webp");
    check("serveur : URL mal formée → 400", (await fetch(base + "/%E0%A4%A")).status === 400);
    const put = await fetch(base + "/api/entries/t1", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "essai", type: "mining", dur: 30, auec: 1000 }) });
    const list = await (await fetch(base + "/api/entries")).json();
    check("API du carnet : écriture puis lecture", put.ok && list.length === 1 && list[0].title === "essai");
    check("authentification : 401 sans mot de passe", (await fetch("http://127.0.0.1:" + port2 + "/")).status === 401);
    const ok = await fetch("http://127.0.0.1:" + port2 + "/", { headers: { Authorization: "Basic " + Buffer.from("orbital:secret").toString("base64") } });
    check("authentification : 200 avec le bon mot de passe", ok.status === 200);

    /* navigateur */
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const mainCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await mainCtx.addInitScript(() => { try { localStorage.setItem("orbital-carnet", "1"); } catch (e) {} }); /* carnet activé (masqué par défaut) */
    const page = await mainCtx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message + (process.env.DBG ? " @ " + e.stack : "")));
    page.on("console", m => { if (m.type() === "error" && !/googleapis|gstatic|ERR_|net::|evt-/.test(m.text() + (m.location().url || ""))) errors.push(m.text()); });

    // Chronologie, Star Viewer et Comm-Links sont sous le menu Lore
    async function go(v) {
      if ((v === "time" || v === "map" || v === "cl") && (await page.getAttribute("#loreBtn", "aria-expanded")) !== "true") await page.click("#loreBtn");
      await page.click('.tab[data-v="' + v + '"]');
    }
    await page.goto(base + "/");
    await page.waitForSelector(".hm-banner");
    const nSys = await page.evaluate(() => SYS.length);
    check("accueil : le nombre de systèmes vient des données", (await page.textContent("#hsSys")) === String(nSys) && nSys > 0);
    check("accueil : l'image de Terra est chargée", await page.evaluate(() => { const i = document.querySelector(".hm-img img"); return i.complete && i.naturalWidth > 0; }));

    /* accessibilité : lien d'évitement */
    await page.keyboard.press("Tab");
    const skip = await page.evaluate(() => { const a = document.activeElement, r = a.getBoundingClientRect(); return { id: a.id, txt: a.textContent, top: r.top, h: r.height }; });
    check("accessibilité : « Aller au contenu » est le premier élément focusable et visible au focus", skip.id === "skip" && skip.txt === "Aller au contenu" && skip.top >= 0 && skip.h > 10, JSON.stringify(skip));
    await page.keyboard.press("Enter");
    check("accessibilité : le lien d'évitement place le focus dans <main>", (await page.evaluate(() => document.activeElement.tagName + "#" + document.activeElement.id)) === "MAIN#main");
    check("accessibilité : valeurs de secours de l'accueil à jour (plus de « 61 »)", await page.evaluate(() => !/61/.test(document.getElementById("v-home").textContent)));

    for (const [v, sel] of [["log", "#v-log"], ["time", "#v-time"], ["map", "#v-map"], ["cl", "#v-cl"], ["ver", "#v-ver"], ["home", "#v-home"]]) {
      await go(v);
      check("onglet « " + v + " » s'affiche", await page.isVisible(sel));
    }

    /* menu Lore et historique des versions */
    await go("home");
    check("menu Lore : fermé sur l'accueil", (await page.getAttribute("#loreBtn", "aria-expanded")) === "false" && !(await page.isVisible("#loreMenu")));
    await page.click("#loreBtn");
    check("menu Lore : s'ouvre avec Chronologie, Star Viewer et Comm-Links", (await page.isVisible('#loreMenu .tab[data-v="time"]')) && (await page.isVisible('#loreMenu .tab[data-v="map"]')) && (await page.isVisible('#loreMenu .tab[data-v="cl"]')));
    await go("map");
    check("menu Lore : l'entrée active est marquée", (await page.getAttribute('.tab[data-v="map"]', "aria-current")) === "page" && (await page.evaluate(() => document.getElementById("loreBtn").classList.contains("on"))));
    /* Comm-Links */
    await go("cl");
    await page.waitForSelector("#clGrid .cl-card");
    const nCl = await page.evaluate(() => window.COMMLINKS.rows.length);
    check("comm-links : la liste est chargée et affichée par pages de 12", nCl > 1000 && (await page.locator("#clGrid .cl-card").count()) === 12, String(nCl));
    check("comm-links : liens sortants vers RSI", await page.evaluate(() => [...document.querySelectorAll("#clGrid .cl-card")].every(a => a.href.indexOf("https://robertsspaceindustries.com/comm-link/") === 0 && a.rel.indexOf("noopener") >= 0)));
    await page.fill("#clQ", "vanduul");
    await page.waitForTimeout(400);
    check("comm-links : la recherche filtre la liste", await page.evaluate(() => { const n = +document.getElementById("clCount").textContent.split(" sur ")[1].split(" ")[0]; return n > 0 && n < window.COMMLINKS.rows.length; }));
    await page.fill("#clQ", "");
    await page.waitForTimeout(400);
    await page.click("#clChips .chip:nth-child(5)");
    check("comm-links : le filtre par chaîne fonctionne", await page.evaluate(() => [...document.querySelectorAll("#clGrid .ev-lab")].every(l => l.textContent.indexOf("Engineering") === 0)));
    await page.click("#clMore").catch(() => {});

    /* titres : pas de saut de niveau, h2 présents */
    const heads = async (view) => page.evaluate((id) => {
      const hs = [document.querySelector("h1"), ...document.querySelectorAll("#" + id + " h1,#" + id + " h2,#" + id + " h3,#" + id + " h4,#" + id + " h5")].filter(h => !h.closest("[hidden]"));
      return hs.map(h => +h.tagName[1]);
    }, view);
    const skipsLevel = l => l.some((n, i) => i > 0 && n - l[i - 1] > 1);
    check("titres : Comm-Links a un h2 et aucun saut de niveau", await (async () => { const l = await heads("v-cl"); return l.includes(2) && !skipsLevel(l); })());

    const pkg = require(path.join(ROOT, "package.json"));
    const vs = await page.evaluate(() => window.VERSIONS.map(v => v.v));
    check("versions : la dernière entrée est la version de package.json", vs[0] === pkg.version, vs[0] + " / " + pkg.version);
    const cmp = (x, y) => { const p = x.split(".").map(Number), q = y.split(".").map(Number); for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return p[i] - q[i]; return 0; };
    check("versions : numéros 1.x.x, uniques et du plus récent au plus ancien", vs.every(v => /^1\.\d+\.\d+$/.test(v)) && vs.every((v, i) => i === 0 || cmp(vs[i - 1], v) > 0), vs.join(" "));
    await go("ver");
    check("versions : une carte par version avec son commentaire", (await page.evaluate(() => [...document.querySelectorAll("#verList .ver-item")].every(li => li.querySelector(".ver-n").textContent.length > 20))) && (await page.evaluate(() => document.querySelectorAll("#verList .ver-item").length)) === vs.length);
    check("versions : la version actuelle est affichée", (await page.textContent("#verCur")) === "v" + pkg.version && (await page.textContent("#sideVer")) === "v" + pkg.version);

    /* carte */
    await page.goto(base + "/#carte/2903/stanton");
    await page.waitForSelector(".nd.on", { state: "attached" });
    check("carte : le lien #carte/année/système est lu", (await page.textContent("#mYear")) === "2903" && (await page.evaluate(() => document.querySelector(".nd.sel").dataset.i)) === "stanton");
    await page.fill("#mFind", "Magnus"); await page.dispatchEvent("#mFind", "change");
    check("carte : la recherche sélectionne le système", (await page.evaluate(() => document.querySelector(".nd.sel").dataset.i)) === "magnus");
    await page.click('#mFac button[data-f="van"]');
    const dim = await page.evaluate(() => [document.querySelectorAll(".nd.on.dim").length, document.querySelectorAll(".nd.on").length]);
    check("carte : le filtre par camp atténue les autres systèmes", dim[0] > 0 && dim[0] < dim[1]);
    await page.click('#mFac button[data-f=""]');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const y0 = await page.textContent("#mYear"); await page.keyboard.press("ArrowRight");
    check("carte : les flèches changent d'année", (await page.textContent("#mYear")) !== y0);
    const y1 = await page.textContent("#mYear");
    check("Star Viewer : aria-valuetext « Année N » sur le curseur, mis à jour", (await page.getAttribute("#mRange", "aria-valuetext")) === "Année " + y1 && y1 !== y0);
    await page.waitForTimeout(600);
    check("Star Viewer : une région role=status annonce le système et l'année", await page.evaluate((y) => { const a = document.getElementById("mAnnounce"); return a.getAttribute("role") === "status" && a.textContent === "Magnus sélectionné, année " + y; }, y1), await page.textContent("#mAnnounce"));
    await page.fill("#mFind", "Zzzzz"); await page.dispatchEvent("#mFind", "change");
    check("Star Viewer : un système inconnu affiche « Aucun système nommé … » (role=status)", (await page.textContent("#mNoMatch")) === "Aucun système nommé « Zzzzz »." && (await page.getAttribute("#mNoMatch", "role")) === "status");
    await page.fill("#mFind", "");
    check("titres : Star Viewer sans saut de niveau (plus de h4 sous h1)", await (async () => { const l = await heads("v-map"); return l.includes(2) && !skipsLevel(l); })());

    /* chronologie : recherche, tri, cartes */
    await go("time");
    const cards = await page.evaluate(() => document.querySelectorAll("#app .ev").length);
    check("chronologie : les événements sont des cartes", cards === (await page.evaluate(() => window.__orb.events)) && cards > 30);
    const vis = await page.evaluate(() => {
      const keys = []; ERAS.forEach((era, i) => era.e.forEach((e, j) => keys.push(i + "." + j)));
      const imgs = [...document.querySelectorAll("#app .ev-img")];
      return { missing: keys.filter(k => !window.__orbHasVisual(k)), total: keys.length, withSvg: imgs.filter(d => d.querySelector("svg")).length,
        distinct: new Set(imgs.map(d => d.querySelector("svg").innerHTML.replace(/id="v\d+[a-z0-9]*"|url\(#v\d+[a-z0-9]*\)|#v\d+[a-z0-9]*/g, ""))).size,
        labelled: imgs.filter(d => d.querySelector(".ev-lab")).length };
    });
    check("chronologie : chaque événement a son motif de visuel", vis.missing.length === 0, vis.missing.join(", "));
    check("chronologie : un visuel par carte, tous différents, avec la date", vis.withSvg === vis.total && vis.labelled === vis.total && vis.distinct === vis.total, JSON.stringify(vis));
    await page.fill("#tlQ", "Stanton");
    const found = await page.evaluate(() => [...document.querySelectorAll("#app .ev")].filter(e => !e.hidden).length);
    check("chronologie : la recherche filtre les cartes", found > 0 && found < cards, String(found));
    check("titres : Chronologie sans saut de niveau", !skipsLevel(await heads("v-time")));
    /* état vide de la recherche */
    await page.fill("#tlQ", "zzzxq");
    const emp = await page.evaluate(() => ({ vis: !document.getElementById("tlEmpty").hidden, txt: document.getElementById("tlEmptyT").textContent, btn: document.getElementById("tlEmptyB").textContent }));
    check("chronologie : message d'état vide avec le texte cherché et bouton « Effacer la recherche »", emp.vis && emp.txt === "Aucun événement ne correspond à « zzzxq »." && emp.btn === "Effacer la recherche", JSON.stringify(emp));
    await page.click("#tlEmptyB");
    check("chronologie : « Effacer la recherche » rétablit la liste et remet le focus sur le champ", (await page.evaluate(() => document.getElementById("tlEmpty").hidden && document.getElementById("tlQ").value === "" && document.activeElement.id === "tlQ")));
    await page.fill("#tlQ", "");
    await page.click('#tlSort button[data-sort="recent"]');
    const first = await page.evaluate(() => { const e = [...document.querySelectorAll("#appFlat .ev")].find(x => !x.hidden); return e && e.dataset.y; });
    check("chronologie : tri du plus récent au plus ancien", first === "2950", String(first));
    await page.click('#tlSort button[data-sort="era"]');
    const bad = await page.evaluate(() => [...document.querySelectorAll(".ev-map")].filter(b => b.dataset.y && (+b.dataset.y < 2100 || +b.dataset.y > 2956)).length);
    check("chronologie : aucun bouton « carte » pour une année hors carte", bad === 0, String(bad));

    /* liens entre onglets */
    await go("time");
    const nb = await page.evaluate(() => document.querySelectorAll(".ev-map").length);
    check("chronologie : des boutons « voir sur la carte »", nb > 10);
    await page.locator('.ev-map[data-s="vega"]').first().click();
    check("chronologie → carte : année et système repris", (await page.textContent("#mYear")) === "2945" && (await page.evaluate(() => document.querySelector(".nd.sel").dataset.i)) === "vega");

    /* carnet */
    await go("log");
    await page.fill("#fDur", "60"); await page.fill("#fAuec", "120000"); await page.fill("#fTitle", "Minage de test");
    await page.click("#fSave");
    await page.waitForFunction(() => /\+120\s?000/.test(document.querySelector("#lgStats").textContent.replace(/ | /g, " ")), null, { timeout: 5000 }).catch(() => {});
    const stats = (await page.textContent("#lgStats")).replace(/\s+/g, " ");
    // 2 entrées : 30 min / 1 000 aUEC (via l'API) et 60 min / 120 000 aUEC (via le formulaire) = 121 000 aUEC en 1 h 30, soit 80 667 aUEC / heure
    check("carnet : une entrée est enregistrée et le gain par heure est calculé", /121\s?000/.test(stats) && /80\s?667/.test(stats), stats);
    check("carnet : graphique sur 30 jours", (await page.evaluate(() => document.querySelectorAll("#lgDays i").length)) === 30);

    /* carnet : accessibilité */
    check("titres : Carnet a des h2 et aucun saut de niveau", await (async () => { const l = await heads("v-log"); return l.filter(n => n === 2).length >= 4 && !skipsLevel(l); })());
    await page.focus("#gHandle"); await page.keyboard.press("Tab");
    const imp = await page.evaluate(() => ({ id: document.activeElement.id, ol: getComputedStyle(document.activeElement.closest("label")).outlineStyle, ow: getComputedStyle(document.activeElement.closest("label")).outlineWidth }));
    check("carnet : « Importer Game.log » est atteignable au clavier avec un focus visible", imp.id === "gFile" && imp.ol !== "none" && parseFloat(imp.ow) >= 2, JSON.stringify(imp));
    /* Chromium headless rate parfois la 1re frappe sur un input file (même sur un input nu) : jusqu'à 3 essais */
    const pressForChooser = async key => { for (let k = 0; k < 3; k++) { await page.focus(k ? "#" + (await page.evaluate(() => document.activeElement.id || "gFile")) : "#" + (await page.evaluate(() => document.activeElement.id || "gFile"))); const [fc] = await Promise.all([page.waitForEvent("filechooser", { timeout: 1500 }).catch(() => null), page.keyboard.press(key)]); if (fc) return fc; } return null; };
    const fc1 = await pressForChooser("Enter");
    check("carnet : Entrée ouvre le sélecteur de fichier (Game.log)", !!fc1);
    await page.keyboard.press("Tab");
    const fc2 = await pressForChooser("Space");
    check("carnet : « Importer un carnet (JSON) » atteignable, Espace ouvre le sélecteur", (await page.evaluate(() => document.activeElement.id)) === "jFile" && !!fc2);
    await page.fill("#fDur", "-5"); await page.click("#fSave");
    const vm = await page.evaluate(() => document.getElementById("fDur").validationMessage);
    check("carnet : message de validation en français", /supérieure ou égale à 0/.test(vm), vm);
    await page.fill("#fDur", "");
    await page.evaluate(() => { document.getElementById("fMsg").textContent = "ancien message"; });
    await page.click("#lgStart");
    check("carnet : « Démarrer la session » déplace le focus sur « Terminer et noter » et vide le statut", (await page.evaluate(() => document.activeElement.id)) === "lgStop" && (await page.textContent("#fMsg")) === "");
    await page.click("#lgStop");
    check("carnet : après l'arrêt, le focus est sur le champ Titre", (await page.evaluate(() => document.activeElement.id)) === "fTitle");
    await page.click("#fSave");
    await page.waitForFunction(() => document.activeElement.id === "fType", null, { timeout: 4000 }).catch(() => {});
    check("carnet : après « Enregistrer », le focus revient sur le premier champ du formulaire", (await page.evaluate(() => document.activeElement.id)) === "fType" && /ajoutée/.test(await page.textContent("#fMsg")));

    /* Star Viewer sur téléphone (400 px) */
    const mctx = await browser.newContext({ viewport: { width: 400, height: 800 }, hasTouch: true, isMobile: true });
    const mp = await mctx.newPage();
    mp.on("pageerror", e => errors.push("mobile : " + e.message));
    mp.on("console", m => { if (m.type() === "error" && !/googleapis|gstatic|ERR_|net::|evt-/.test(m.text() + (m.location().url || ""))) errors.push("mobile : " + m.text()); });
    await mp.goto(base + "/#carte/2956/stanton");
    await mp.waitForSelector("#mapbox", { state: "visible" });
    await mp.waitForTimeout(500);
    const mm = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: innerWidth, mh: document.getElementById("mapbox").getBoundingClientRect().height, vh: innerHeight, tab: document.getElementById("vwTabRail").getBoundingClientRect().height }));
    check("Star Viewer mobile : pas de défilement horizontal, carte > 55 % de la hauteur", mm.sw <= mm.cw && mm.mh > mm.vh * 0.55 && mm.tab >= 40, JSON.stringify(mm));
    await mp.click("#vwTabRail");
    const railOpen = await mp.isVisible("#mFac");
    await mp.click("#vwTabRail");
    check("Star Viewer mobile : le panneau des filtres se replie et se déplie", railOpen && !(await mp.isVisible("#mFac")));
    const lab = await mp.evaluate(() => [...document.querySelectorAll(".nd.lbl text")].map(t => { const r = t.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
    let over = 0;
    for (let i = 0; i < lab.length; i++) for (let j = i + 1; j < lab.length; j++) { const a = lab[i], b = lab[j]; if (a[0] < b[2] - 2 && a[2] > b[0] + 2 && a[1] < b[3] - 2 && a[3] > b[1] + 2) over++; }
    check("Star Viewer : les noms affichés ne se superposent pas, la sélection garde le sien", over === 0 && (await mp.isVisible(".nd.sel text")), over + " superpositions");
    await mctx.close();

    /* Star Viewer : clavier, tactile, noms et symboles (audit A11 à A14) */
    await page.goto(base + "/#carte/2956/stanton");
    await page.waitForSelector(".nd.on", { state: "attached" });
    await page.waitForTimeout(400);
    const stops = await page.evaluate(() => ({ zero: document.querySelectorAll('#mapsvg .nd[tabindex="0"]').length, all: document.querySelectorAll("#mapsvg .nd").length, other: document.querySelectorAll('#mapsvg [tabindex="0"]:not(.nd)').length }));
    check("Star Viewer clavier : un seul arrêt de Tab sur la carte (tabindex itinérant)", stops.zero === 1 && stops.all >= 90 && stops.other === 0, JSON.stringify(stops));
    await page.focus('#mapsvg .nd[tabindex="0"]');
    await page.keyboard.press("Tab");
    check("Star Viewer clavier : Tab quitte la carte après un seul arrêt", await page.evaluate(() => !document.activeElement.closest("#mapsvg")));
    await page.focus('#mapsvg .nd[tabindex="0"]');
    const vbOf = () => page.evaluate(() => document.getElementById("mapsvg").getAttribute("viewBox").split(" ").map(Number));
    const px0 = await page.evaluate(() => POS[document.querySelector(".nd.sel").dataset.i][0]);
    await page.keyboard.press("ArrowRight");
    const ar = await page.evaluate(() => { const s = document.querySelector(".nd.sel"); return { id: s.dataset.i, x: POS[s.dataset.i][0], focus: document.activeElement === s, fv: document.activeElement.matches(":focus-visible"), stops: document.querySelectorAll('#mapsvg .nd[tabindex="0"]').length }; });
    check("Star Viewer clavier : la flèche droite sélectionne le système voisin à droite et le focus le suit", ar.id !== "stanton" && ar.x > px0 && ar.focus && ar.stops === 1, JSON.stringify(ar));
    check("Star Viewer clavier : focus visible sur le système (anneau)", ar.fv && (await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".nd.sel .halo")).opacity))) > 0.5);
    await page.waitForTimeout(500);
    check("Star Viewer clavier : le changement de sélection est annoncé (role=status conservé)", await page.evaluate(() => /sélectionné, année/.test(document.getElementById("mAnnounce").textContent) && document.getElementById("mAnnounce").getAttribute("role") === "status"));
    const v0 = await vbOf();
    await page.keyboard.press("+");
    const v1 = await vbOf();
    await page.keyboard.press("-"); await page.keyboard.press("-");
    const v2 = await vbOf();
    check("Star Viewer clavier : + réduit le viewBox, − l'agrandit", v1[2] < v0[2] - 1 && v2[2] > v1[2] + 1, [v0[2], v1[2], v2[2]].join(" / "));
    await page.keyboard.press("Shift+ArrowLeft");
    const v3 = await vbOf();
    check("Star Viewer clavier : Maj + flèche déplace la carte sans changer la sélection", v3[0] < v2[0] - 1 && v3[2] === v2[2] && (await page.evaluate(() => document.querySelector(".nd.sel").dataset.i)) === ar.id);
    await page.keyboard.press("0");
    const v4 = await vbOf();
    check("Star Viewer clavier : 0 revient à la vue d'ensemble", Math.abs(v4[2] - v0[2]) < 1.5, v4.join(" ") + " / " + v0.join(" "));
    await page.keyboard.press("Enter");
    check("Star Viewer clavier : Entrée ouvre la fiche (focus dans la fiche, titre du système)", await page.evaluate(() => { const id = document.querySelector(".nd.sel").dataset.i; return !!document.activeElement.closest("#mDetail") && document.querySelector("#mDetail h3").textContent === SYS.find(s => s.i === id).n; }));
    const yA = await page.textContent("#mYear");
    await page.keyboard.press("[");
    check("Star Viewer clavier : [ change d'année (← → restent à la navigation sur la carte)", (await page.textContent("#mYear")) !== yA);
    check("Star Viewer clavier : le curseur Année reste utilisable au clavier", await (async () => { await page.focus("#mRange"); const a = await page.textContent("#mYear"); await page.keyboard.press("ArrowLeft"); return (await page.textContent("#mYear")) !== a; })());
    await page.focus('#mapsvg .nd[tabindex="0"]');
    await page.keyboard.press("Escape");
    check("Star Viewer clavier : Échap ferme la fiche (plus de système sélectionné)", (await page.locator(".nd.sel").count()) === 0 && /Cliquez sur un système/.test(await page.textContent("#mDetail")));
    check("Star Viewer clavier : « ? Aide clavier » dans les filtres et texte masqué pour lecteurs d'écran", await page.evaluate(() => { const d = document.querySelector("#vwRail details.vw-help"), p = document.getElementById("mapKeys"); return !!d && /Aide clavier/.test(d.querySelector("summary").textContent) && !!p && p.classList.contains("sr") && document.getElementById("mapsvg").getAttribute("aria-describedby") === "mapKeys"; }));
    /* bureau : survol et clic à la souris non dégradés */
    const cpos = await page.evaluate(() => { const r = document.querySelector('.nd[data-i="sol"] .c').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.move(cpos[0] + 30, cpos[1] + 30);
    await page.mouse.move(cpos[0], cpos[1]);
    await page.waitForTimeout(200);
    const hv = await page.evaluate(() => ({ tip: !document.getElementById("mTip").hidden && /Sol/i.test(document.getElementById("mTip").textContent), lbl: document.querySelector('.nd[data-i="sol"]').classList.contains("lbl") }));
    await page.mouse.click(cpos[0], cpos[1]);
    check("Star Viewer bureau : survol (infobulle, nom) et clic souris sélectionnent le bon système", hv.tip && hv.lbl && (await page.evaluate(() => document.querySelector(".nd.sel").dataset.i)) === "sol", JSON.stringify(hv));

    /* Star Viewer tactile 390 x 844 */
    const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const tp = await tctx.newPage();
    tp.on("pageerror", e => errors.push("tactile : " + e.message));
    tp.on("console", m => { if (m.type() === "error" && !/googleapis|gstatic|ERR_|net::|evt-/.test(m.text() + (m.location().url || ""))) errors.push("tactile : " + m.text()); });
    await tp.goto(base + "/#carte/2956/stanton");
    await tp.waitForSelector("#mapbox", { state: "visible" });
    await tp.waitForTimeout(700);
    const hint1 = await tp.evaluate(() => { const h = document.getElementById("vwHint"); return h ? h.textContent : null; });
    check("Star Viewer tactile : l'astuce « Pincez pour zoomer, glissez pour déplacer » s'affiche", /Pincez pour zoomer, glissez pour déplacer/.test(hint1 || ""), String(hint1));
    await tp.reload(); await tp.waitForSelector("#mapbox", { state: "visible" }); await tp.waitForTimeout(500);
    check("Star Viewer tactile : l'astuce ne revient pas (affichée une seule fois)", (await tp.locator("#vwHint").count()) === 0);
    const occ = await tp.evaluate(() => { const bx = document.getElementById("mapbox").getBoundingClientRect(); let a = 1e9, b = -1e9; document.querySelectorAll(".nd.on .c").forEach(c => { const r = c.getBoundingClientRect(); a = Math.min(a, r.top); b = Math.max(b, r.bottom); }); return { ratio: (b - a) / bx.height, bh: bx.height }; });
    check("Star Viewer tactile : la vue d'ensemble occupe plus de 60 % de la hauteur de la carte", occ.ratio > 0.6, JSON.stringify(occ));
    const overlap = () => tp.evaluate(() => {
      const syms = [...document.querySelectorAll(".nd.on")].map(g => ({ i: g.dataset.i, r: g.querySelector(".c").getBoundingClientRect() }));
      let n = 0, shown = 0;
      document.querySelectorAll(".nd.lbl").forEach(g => { shown++; const t = g.querySelector("text").getBoundingClientRect(); syms.forEach(s => { if (s.i === g.dataset.i) return; if (t.left < s.r.right - 1 && t.right > s.r.left + 1 && t.top < s.r.bottom - 1 && t.bottom > s.r.top + 1) n++; }); });
      return { n, shown };
    });
    const o1 = await overlap();
    check("Star Viewer tactile : aucun nom ne recouvre le symbole d'un autre système (vue d'ensemble)", o1.n === 0 && o1.shown > 3, JSON.stringify(o1));
    const tcl = await tp.evaluate(() => ({ svgRight: document.querySelector("#mapsvg").getBoundingClientRect().right, zoomLeft: document.querySelector(".zoom").getBoundingClientRect().left }));
    check("Star Viewer tactile : les commandes de zoom ne recouvrent pas la carte (marge réservée)", tcl.svgRight <= tcl.zoomLeft + 0.5, JSON.stringify(tcl));
    await tp.tap("#zIn"); await tp.tap("#zIn"); await tp.waitForTimeout(500);
    const o2 = await overlap();
    check("Star Viewer tactile : aucun chevauchement nom-symbole en zoom", o2.n === 0, JSON.stringify(o2));
    await tp.tap("#zFit"); await tp.waitForTimeout(300);
    /* tap : le système touché ouvre la fiche en volet bas */
    const tpos = await tp.evaluate(() => { const r = document.querySelector('.nd[data-i="terra"] .c').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await tp.touchscreen.tap(tpos[0], tpos[1]);
    await tp.waitForTimeout(400);
    const sh = await tp.evaluate(() => { const s = document.getElementById("vwSide").getBoundingClientRect(), st = document.querySelector(".vw-stage").getBoundingClientRect(); return { vis: s.height > 0, ratio: s.height / st.height, sel: document.querySelector(".nd.sel").dataset.i, title: document.querySelector("#mDetail h3").textContent, open: document.querySelector(".vw-stage").classList.contains("o-side") }; });
    check("Star Viewer tactile : un tap sur un système ouvre la fiche en volet bas (45 % de la hauteur au plus)", sh.vis && sh.open && sh.sel === "terra" && /Terra/.test(sh.title) && sh.ratio <= 0.46, JSON.stringify(sh));
    const shVis = await tp.evaluate(() => { const r = document.querySelector('.nd[data-i="terra"] .c').getBoundingClientRect(), s = document.getElementById("vwSide").getBoundingClientRect(); return r.bottom < s.top; });
    check("Star Viewer tactile : le système touché reste visible au-dessus du volet", shVis);
    await tp.tap("#vwSide .x"); await tp.waitForTimeout(200);
    check("Star Viewer tactile : le volet se ferme avec le bouton Fermer", !(await tp.isVisible("#vwSide")));
    const tpos2 = await tp.evaluate(() => { const r = document.querySelector('.nd[data-i="terra"] .c').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await tp.touchscreen.tap(tpos2[0], tpos2[1]); await tp.waitForTimeout(300);
    await tp.keyboard.press("Escape");
    check("Star Viewer tactile : le volet se ferme avec Échap", !(await tp.isVisible("#vwSide")));
    const tpos3 = await tp.evaluate(() => { const r = document.querySelector('.nd[data-i="terra"] .c').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await tp.touchscreen.tap(tpos3[0], tpos3[1]); await tp.waitForTimeout(300);
    const empty = await tp.evaluate(() => { const bx = document.getElementById("mapsvg").getBoundingClientRect(), pts = [...document.querySelectorAll(".nd.on .c")].map(c => { const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); let best = null, bd = 0; for (let x = bx.left + 10; x < bx.right - 10; x += 12) for (let y = bx.top + 70; y < bx.top + 300; y += 12) { const d = Math.min(...pts.map(p => Math.hypot(p[0] - x, p[1] - y))); if (d > bd) { bd = d; best = [x, y]; } } return { p: best, d: Math.round(bd) }; });
    await tp.touchscreen.tap(empty.p[0], empty.p[1]); await tp.waitForTimeout(300);
    check("Star Viewer tactile : un tap sur la carte (hors système) ferme le volet", !(await tp.isVisible("#vwSide")) && (await tp.locator(".nd.sel").count()) === 0, JSON.stringify(empty));
    /* zone de tap élargie et résolution vers le système le plus proche */
    const near = await tp.evaluate(() => {
      const pts = [...document.querySelectorAll(".nd.on")].map(g => { const r = g.querySelector(".c").getBoundingClientRect(); return { i: g.dataset.i, x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      const ib = document.getElementById("mapsvg").getBoundingClientRect();
      const ok = pts.filter(p => p.x > ib.left + 30 && p.x < ib.right - 30 && p.y > ib.top + 80 && p.y < ib.top + 330);
      let best = null, bd = 0; ok.forEach(p => { const d = Math.min(...pts.filter(q => q !== p).map(q => Math.hypot(q.x - p.x, q.y - p.y))); if (d > bd) { bd = d; best = p; } });
      return { id: best.i, x: best.x, y: best.y, gap: Math.round(bd) };
    });
    await tp.touchscreen.tap(near.x + 15, near.y + 10);
    await tp.waitForTimeout(300);
    check("Star Viewer tactile : un tap à ~18 px du symbole sélectionne le système (zone de tap élargie)", (await tp.evaluate(() => { const s = document.querySelector(".nd.sel"); return s && s.dataset.i; })) === near.id, JSON.stringify(near));
    const dense = await tp.evaluate(() => {
      const ib = document.getElementById("mapsvg").getBoundingClientRect();
      const pts = [...document.querySelectorAll(".nd.on")].map(g => { const r = g.querySelector(".c").getBoundingClientRect(); return { i: g.dataset.i, x: r.x + r.width / 2, y: r.y + r.height / 2 }; }).filter(p => p.x > ib.left + 20 && p.x < ib.right - 20 && p.y > ib.top + 80 && p.y < ib.top + 330);
      let best = null, bd = 1e9; pts.forEach(p => pts.forEach(q => { if (p === q) return; const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < bd && d > 8) { bd = d; best = [p, q]; } }));
      return { a: best[0], b: best[1], d: bd };
    });
    await tp.touchscreen.tap(dense.a.x + (dense.b.x - dense.a.x) * 0.25, dense.a.y + (dense.b.y - dense.a.y) * 0.25); await tp.waitForTimeout(300);
    check("Star Viewer tactile : deux zones qui se recouvrent, le tap va au système le plus proche", (await tp.evaluate(() => document.querySelector(".nd.sel").dataset.i)) === dense.a.i, JSON.stringify({ a: dense.a.i, b: dense.b.i, d: Math.round(dense.d) }));
    await tctx.close();

    /* carte : mention des systèmes sans point de saut (A25), sans attribut on*, sans script inline */
    await page.goto(base + "/#carte/2956/virgo");
    await page.waitForSelector(".nd.sel");
    const NOLINK = ["Virgo", "Volt", "Vesper", "K.ap’a’ri", "Veritas", "Vagabond", "Malkail", "El’sin", "Voodoo", "Vermilion", "Vendetta"];
    check("carte : la fiche de Virgo indique qu'aucun point de saut n'est publié", (await page.textContent("#mDetail")).includes("Aucun point de saut publié pour ce système."));
    const noLinkSys = await page.evaluate(() => { const l = new Set(); EL.forEach(p => { l.add(p[0]); l.add(p[1]); }); return SYS.filter(s => !l.has(s.i)).map(s => s.n); });
    check("carte : exactement les 11 systèmes sans liaison sont concernés", noLinkSys.length === 11 && NOLINK.every(n => noLinkSys.indexOf(n) >= 0), noLinkSys.join(", "));
    await page.goto(base + "/#carte/2956/stanton");
    await page.waitForSelector(".nd.sel");
    check("carte : la fiche de Stanton n'a pas cette mention", !(await page.textContent("#mDetail")).includes("Aucun point de saut publié"));

    /* CSP : aucun code inline (attribut on*, script inline) dans le DOM de chaque onglet */
    const inl = [];
    for (const v of ["home", "log", "time", "map", "cl", "ver"]) {
      await go(v); await page.waitForTimeout(v === "cl" ? 800 : 200);
      const r = await page.evaluate(() => ({
        on: [...document.querySelectorAll("*")].filter(e => [...e.attributes].some(a => /^on/i.test(a.name))).map(e => e.tagName + "#" + e.id),
        scripts: [...document.querySelectorAll("script:not([src])")].length,
        js: [...document.querySelectorAll("[href^='javascript:' i],[src^='javascript:' i]")].length }));
      if (r.on.length || r.scripts || r.js) inl.push(v + " " + JSON.stringify(r));
    }
    check("CSP : aucun attribut on*, <script> inline ni URL javascript: dans les 6 onglets", inl.length === 0, inl.join(" | "));

    /* CSP : l'application chargée avec l'en-tête strict ne déclenche aucune violation */
    const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://robertsspaceindustries.com https://*.robertsspaceindustries.com; connect-src 'self'; font-src 'self'; worker-src 'self'; object-src 'none'";
    const cctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await cctx.route(base + "/**", async route => {
      const resp = await route.fetch();
      await route.fulfill({ response: resp, headers: Object.assign({}, resp.headers(), { "content-security-policy": CSP }) });
    });
    await cctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI + " " + (e.sourceFile || "") + ":" + (e.lineNumber || ""))); });
    await cctx.addInitScript(() => { try { localStorage.setItem("orbital-carnet", "1"); } catch (e) {} }); /* carnet activé (masqué par défaut) */
    const cp = await cctx.newPage();
    const cspMsgs = [];
    cp.on("pageerror", e => cspMsgs.push("pageerror " + e.message));
    cp.on("console", m => { if (/Content Security Policy|Refused to/i.test(m.text())) cspMsgs.push(m.text()); });
    async function cgo(v) {
      if ((v === "time" || v === "map" || v === "cl") && (await cp.getAttribute("#loreBtn", "aria-expanded")) !== "true") await cp.click("#loreBtn");
      await cp.click('.tab[data-v="' + v + '"]');
    }
    await cp.goto(base + "/");
    await cp.waitForSelector(".hm-banner");
    for (const v of ["log", "time", "map", "cl", "ver", "home"]) { await cgo(v); await cp.waitForTimeout(v === "cl" ? 1000 : 300); }
    await cgo("time");
    await cp.evaluate(() => document.querySelector(".ev-copy").click()).catch(() => {});
    await cgo("map");
    await cp.evaluate(() => document.querySelector('.nd[data-i="stanton"]').dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await cp.keyboard.press("Escape");
    await cp.mouse.click(5, 5);
    await cp.keyboard.press("/");
    await cp.waitForSelector("#srchQ", { state: "visible" });
    await cp.fill("#srchQ", "stanton"); await cp.waitForTimeout(400);
    await cp.keyboard.press("Enter"); await cp.waitForTimeout(400);
    const sw = await cp.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(r => !!r.active), new Promise(r => setTimeout(() => r(false), 8000))]));
    const viol = await cp.evaluate(() => window.__csp);
    check("CSP stricte : le service worker est enregistré", sw === true);
    check("CSP stricte : aucune violation en parcourant les 6 onglets, la recherche, un événement et un système", viol.length === 0 && cspMsgs.length === 0, viol.concat(cspMsgs).join(" | "));
    await cctx.close();

    /* fil « Derniers changements » : propre au système sélectionné (régression : « Découverte du système Tamsa » s'affichait sous chaque fiche) */
    await page.goto(base + "/#carte/2956/terra"); await page.waitForSelector("#mFeed li"); await page.waitForTimeout(500);
    const fTerra = await page.evaluate(() => ({ h: document.querySelector("#mFeedH").textContent, s: [...document.querySelectorAll("#mFeed button")].map(b => b.dataset.s), t: document.querySelector("#mFeed").textContent }));
    check("carte : le fil des changements suit le système sélectionné (Terra)", /Terra/.test(fTerra.h) && fTerra.s.length > 0 && fTerra.s.every(x => x === "terra") && !/Tamsa/.test(fTerra.t), JSON.stringify(fTerra));
    await page.goto(base + "/#carte/2956/tamsa"); await page.waitForTimeout(600);
    check("carte : « Découverte du système Tamsa » n'apparaît que pour Tamsa", /Tamsa/.test(await page.textContent("#mFeed")));
    await page.goto(base + "/#carte/2956/sol"); await page.waitForTimeout(600);
    check("carte : le fil de Sol n’affiche pas la découverte de Tamsa", !/Tamsa/.test(await page.textContent("#mFeed")));
    /* itinéraire entre deux systèmes (panneau Filtres, tracé, lien, fiche, mobile) */
    {
      const D = await page.evaluate(() => ({ SYS: SYS.map(s => ({ i: s.i, n: s.n, d: s.d })), EL, SP, MIN, MAX }));
      const dBy = {}; D.SYS.forEach(s => { dBy[s.i] = s; });
      const dEdges = D.EL.map(p => { const sp = D.SP[p[0] + "-" + p[1]] || {}; return { a: p[0], b: p[1], y: sp.y || Math.max(dBy[p[0]].d, dBy[p[1]].d), u: sp.u || 0 }; });
      /* calcul indépendant : distance par couches (nombre de liaisons actives), -1 si aucune route */
      const refDist = (a, b, y) => {
        const act = dEdges.filter(e => y >= e.y && (!e.u || y < e.u)), seen = new Set([a]); let front = [a];
        for (let d = 0; front.length; d++) {
          if (front.includes(b)) return d;
          const nx = [];
          act.forEach(e => { [[e.a, e.b], [e.b, e.a]].forEach(([p, q]) => { if (front.includes(p) && !seen.has(q)) { seen.add(q); nx.push(q); } }); });
          front = nx;
        }
        return -1;
      };
      const refMin = (a, b) => { for (let y = D.MIN; y <= D.MAX; y++) if (refDist(a, b, y) > 0) return y; return 0; };
      const stat = async (pg) => (await (pg || page).textContent("#rtStat")).replace(/\s+/g, " ").trim();
      const setRt = async (de, vers, pg) => { pg = pg || page; for (const [id, v] of [["#rtDe", de], ["#rtVers", vers]]) { await pg.fill(id, v); await pg.press(id, "Enter"); } await pg.waitForTimeout(80); };
      const nBadge = (pg) => (pg || page).locator(".rt-b").count();
      const stepsTxt = (pg) => (pg || page).$$eval("#rtSteps .rt-stp .t > span:first-child", l => l.map(x => x.textContent));
      const setYearUi = async (y) => { await page.fill("#mRange", String(y)); await page.waitForTimeout(80); };
      const names = (sel) => page.$$eval(sel, l => l.map(x => x.textContent));

      await page.goto(base + "/#carte/2956/stanton"); await page.waitForSelector(".nd.sel");
      if (await page.isVisible("#rtClear")) await page.click("#rtClear");
      check("itinéraire : section dans le panneau Filtres, ARIA des champs (combobox, autocomplete, expanded, listbox, status)", await page.evaluate(() => { const r = document.querySelector("#vwRail #rtSec"); return !!r && ["#rtDe", "#rtVers"].every(s => { const i = document.querySelector(s); return i.getAttribute("role") === "combobox" && i.getAttribute("aria-autocomplete") === "list" && i.getAttribute("aria-expanded") === "false" && document.getElementById(i.getAttribute("aria-controls")).getAttribute("role") === "listbox"; }) && document.querySelector("#rtStat").getAttribute("role") === "status" && document.querySelector("#rtStat").getAttribute("aria-live") === "polite"; }));
      /* saisie clavier complète : « sol », ↓, Entrée puis « stan », ↓, Entrée */
      await page.click("#rtDe"); await page.keyboard.type("sol");
      check("itinéraire : la liste s'ouvre à la saisie (aria-expanded=true, options role=option)", (await page.getAttribute("#rtDe", "aria-expanded")) === "true" && (await page.locator("#rtDeL [role=option]").count()) >= 1);
      await page.keyboard.press("ArrowDown");
      const ad = await page.evaluate(() => { const i = document.querySelector("#rtDe"), o = document.getElementById(i.getAttribute("aria-activedescendant")); return o ? o.textContent + "|" + o.getAttribute("aria-selected") : ""; });
      check("itinéraire : ↓ désigne une option (aria-activedescendant, aria-selected)", /^Sol/.test(ad) && /\|true$/.test(ad), ad);
      await page.keyboard.press("Enter");
      check("itinéraire : Entrée choisit l'option et ferme la liste", (await page.inputValue("#rtDe")) === "Sol" && (await page.getAttribute("#rtDe", "aria-expanded")) === "false");
      await page.click("#rtVers"); await page.keyboard.type("stan"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
      check("itinéraire : saisie « stan », ↓, Entrée → Stanton", (await page.inputValue("#rtVers")) === "Stanton");
      check("itinéraire : Sol → Stanton en 2956 = 4 sauts (résumé dans la zone status)", (await stat()) === "4 sauts · Sol → Stanton · en 2956", await stat());
      check("itinéraire : étapes Sol → Davien → Cano → Pyro → Stanton", JSON.stringify(await stepsTxt()) === JSON.stringify(["Sol → Davien", "Davien → Cano", "Cano → Pyro", "Pyro → Stanton"]), JSON.stringify(await stepsTxt()));
      check("itinéraire : les étapes forment une liste ordonnée de boutons", await page.evaluate(() => !!document.querySelector("ol#rtSteps") && document.querySelectorAll("#rtSteps li > button").length === 4));
      check("itinéraire : tracé dans le SVG (4 badges numérotés, repères « Départ » et « Arrivée » en texte)", (await nBadge()) === 4 && JSON.stringify(await names(".rt-b text")) === '["1","2","3","4"]' && JSON.stringify((await names(".rt-t text")).sort()) === '["Arrivée","Départ"]');
      check("itinéraire : le trait est au-dessus des liaisons et sous les systèmes, badges et repères au-dessus (ordre des calques du SVG)", await page.evaluate(() => { const c = [...document.querySelector("#mapsvg").children], at = q => c.findIndex(x => x.matches(q) || x.querySelector(q) && !x.classList.contains("rt-layer")), e = c.findIndex(x => x.querySelector(".edge")), l = c.findIndex(x => x.matches(".rt-layer:not(.rt-top)")), n = c.findIndex(x => x.querySelector(".nd")), t = c.findIndex(x => x.matches(".rt-top")); return e >= 0 && e < l && l < n && n < t && t === c.length - 1 && at(".nd") === n; }));
      check("itinéraire : les 5 systèmes de l'itinéraire gardent leur nom visible", (await page.locator(".nd.onroute.lbl").count()) === 5, String(await page.locator(".nd.onroute.lbl").count()));
      check("itinéraire : calcul indépendant du test = 4 sauts", refDist("sol", "stanton", 2956) === 4);
      await setRt("Sol", "Pyro");
      check("itinéraire : Sol → Pyro en 2956 = 3 sauts", (await stat()) === "3 sauts · Sol → Pyro · en 2956" && refDist("sol", "pyro", 2956) === 3, await stat());
      await setRt("Sol", "Hadur");
      check("itinéraire : Sol → Hadur en 2956 = 7 sauts via Davien, Cano, Pyro, Hadrian, Kiel, Baker", /^7 sauts · Sol → Hadur/.test(await stat()) && JSON.stringify((await stepsTxt()).map(x => x.split(" → ")[1])) === JSON.stringify(["Davien", "Cano", "Pyro", "Hadrian", "Kiel", "Baker", "Hadur"]) && refDist("sol", "hadur", 2956) === 7 && (await nBadge()) === 7, await stat());
      check("itinéraire : les noms des 8 systèmes de la route restent visibles", (await page.locator(".nd.onroute.lbl").count()) === 8);
      await setRt("Croshaw", "Stanton");
      check("itinéraire : Croshaw → Stanton en 2956 = 5 sauts (via Sol)", /^5 sauts · Croshaw → Stanton/.test(await stat()) && (await stepsTxt())[0] === "Croshaw → Sol" && refDist("croshaw", "stanton", 2956) === 5, await stat());
      await setRt("Sol", "Stanton");
      await page.click("#rtSwap");
      check("itinéraire : ⇄ inverse départ et arrivée (Stanton → Sol, 4 sauts)", (await page.inputValue("#rtDe")) === "Stanton" && (await page.inputValue("#rtVers")) === "Sol" && (await stat()) === "4 sauts · Stanton → Sol · en 2956", await stat());
      await page.click("#rtSwap");
      await setRt("Sol", "Hadur");
      check("itinéraire : les liaisons déduites ont le badge « liaison déduite » et un trait en pointillés (autant l'un que l'autre)", (await page.$$eval("#rtSteps .rt-ded", l => l.length)) === (await page.$$eval(".rt-l.ded", l => l.length)));
      /* année : 2956 → 2900 → message → « Voir en » */
      await setRt("Sol", "Stanton");
      await setYearUi(2900);
      const s2900 = await stat();
      check("itinéraire : en 2900, Sol → Stanton = « Aucune route en 2900 » avec la raison (découvert en 2903)", /^Aucune route en 2900/.test(s2900) && /Stanton n’est découvert qu’en 2903/.test(s2900), s2900);
      check("itinéraire : en 2900, le tracé disparaît (0 badge, 0 trait, 0 étape)", (await nBadge()) === 0 && (await page.locator(".rt-l").count()) === 0 && (await page.locator("#rtSteps li").count()) === 0);
      const mY = refMin("sol", "stanton");
      check("itinéraire : la plus petite année avec route (calcul indépendant) est 2903", mY === 2903, String(mY));
      check("itinéraire : bouton « Voir en 2903 »", (await page.textContent("#rtCta button")).trim() === "Voir en " + mY);
      await page.click("#rtCta button"); await page.waitForTimeout(150);
      check("itinéraire : « Voir en 2903 » change l'année et trace la route", (await page.textContent("#mYear")) === String(mY) && /^\d+ sauts? · Sol → Stanton · en 2903$/.test(await stat()) && (await nBadge()) >= 1, await stat());
      check("itinéraire : en 2903 le nombre de sauts = calcul indépendant", (await stat()).startsWith(refDist("sol", "stanton", 2903) + " saut"), await stat());
      await page.focus("body"); await page.keyboard.press("]"); await page.waitForTimeout(200);
      const yy = +(await page.textContent("#mYear"));
      check("itinéraire : changer l'année au clavier (]) recalcule et met le résumé à jour", yy > 2903 && (await stat()).endsWith("en " + yy) && (await stat()).startsWith(refDist("sol", "stanton", yy) + " saut"), yy + " | " + (await stat()));
      await setYearUi(2900);
      await page.click("#rtVers"); await page.waitForTimeout(80);
      const opts = await names("#rtVersL [role=option]");
      check("itinéraire : les 90 systèmes sont proposés, ceux découverts plus tard portent « pas encore découvert en 2900 »", opts.length === D.SYS.length && opts.some(o => /^Stanton.*pas encore découvert en 2900/.test(o)) && !opts.some(o => /^Sol.*pas encore/.test(o)), opts.length + " " + opts.slice(0, 3).join("|"));
      await page.keyboard.press("Escape");
      check("itinéraire : Échap ferme la liste et rend la valeur précédente", (await page.getAttribute("#rtVers", "aria-expanded")) === "false" && (await page.inputValue("#rtVers")) === "Stanton");
      await setYearUi(2956); await page.waitForTimeout(100);
      /* accents et apostrophes */
      await page.click("#rtVers"); await page.fill("#rtVers", "ELSIN");
      const o1 = await names("#rtVersL [role=option] span");
      await page.fill("#rtVers", "el'sin"); const o2 = await names("#rtVersL [role=option] span");
      await page.fill("#rtVers", "k.apari"); const o3 = await names("#rtVersL [role=option] span");
      check("itinéraire : recherche insensible à la casse et aux apostrophes (« ELSIN » et « el'sin » → El’sin ; « k.apari » → K.ap’a’ri)", o1[0] === "El’sin" && o2[0] === "El’sin" && o3[0] === "K.ap’a’ri", JSON.stringify([o1, o2, o3]));
      await page.fill("#rtVers", "t.al"); const o5 = await names("#rtVersL [role=option] span");
      check("itinéraire : « tal » trouve aussi les noms accentués (T.āl)", o5.includes("T.āl") || o5.some(x => /^T\./.test(x)), JSON.stringify(o5));
      await page.press("#rtVers", "Escape");
      /* erreurs */
      await setRt("Sol", "Sol");
      check("itinéraire : départ = arrivée → « Départ et arrivée sont identiques »", /Départ et arrivée sont identiques/.test(await stat()) && (await nBadge()) === 0, await stat());
      await setRt("Sol", "Zorglub");
      check("itinéraire : nom inconnu → message clair, champ marqué invalide, pas de tracé", /Système inconnu : « Zorglub »/.test(await stat()) && (await page.getAttribute("#rtVers", "aria-invalid")) === "true" && (await nBadge()) === 0, await stat());
      await setRt("", "Stanton");
      check("itinéraire : départ vide → « Choisissez un système de départ »", /Choisissez un système de départ/.test(await stat()), await stat());
      await setRt("Sol", "Virgo");
      check("itinéraire : Sol → Virgo = « Aucun point de saut publié pour Virgo »", /Aucun point de saut publié pour Virgo/.test(await stat()) && (await nBadge()) === 0, await stat());
      /* effacement */
      await setRt("Sol", "Stanton");
      check("itinéraire : « Effacer l'itinéraire » visible quand un itinéraire existe", await page.isVisible("#rtClear"));
      await page.click("#rtClear");
      check("itinéraire : effacer vide les champs, la liste et le tracé", (await page.inputValue("#rtDe")) === "" && (await page.inputValue("#rtVers")) === "" && (await nBadge()) === 0 && (await page.locator(".rt-l").count()) === 0 && (await page.locator(".nd.onroute").count()) === 0 && !(await page.isVisible("#rtSteps")));
      await setRt("Sol", "Pyro");
      check("itinéraire : ligne discrète « Taille des points de saut : donnée non disponible »", (await page.textContent("#rtNote")).includes("Taille des points de saut : donnée non disponible") && (await page.isVisible("#rtNote")));
      /* étape cliquée : sélectionne l'arrivée de l'étape */
      await page.click("#rtSteps li:nth-child(2) button"); await page.waitForTimeout(150);
      check("itinéraire : une étape cliquée sélectionne le système d'arrivée de l'étape (Cano) et garde le tracé", (await page.evaluate(() => document.querySelector(".nd.sel").dataset.i)) === "cano" && (await nBadge()) === 3);
      /* lien partageable */
      await setRt("Sol", "Stanton"); await page.waitForTimeout(450);
      const hsh = await page.evaluate(() => location.hash);
      check("lien : le hash contient l'itinéraire (#carte/année/système?de=…&vers=…)", /^#carte\/2956\/cano\?de=sol&vers=stanton$/.test(hsh), hsh);
      await page.evaluate(() => { window.__cp = ""; navigator.clipboard.writeText = t => { window.__cp = t; return Promise.resolve(); }; });
      await page.click("#mLink"); await page.waitForTimeout(150);
      check("lien : « Copier le lien » inclut l'itinéraire", /#carte\/2956\/cano\?de=sol&vers=stanton$/.test(await page.evaluate(() => window.__cp)), await page.evaluate(() => window.__cp));
      const fp = await page.context().newPage();
      fp.on("pageerror", e => errors.push("(lien) " + e.message));
      fp.on("console", m => { if (m.type() === "error" && !/googleapis|gstatic|ERR_|net::|evt-/.test(m.text() + (m.location().url || ""))) errors.push("(lien) " + m.text()); });
      await fp.goto(base + "/#carte/2956/stanton?de=sol&vers=hadur"); await fp.waitForSelector(".nd.sel"); await fp.waitForTimeout(500);
      check("lien : l'ouverture directe remplit les champs et trace la route (Sol → Hadur, 7 sauts)", (await fp.inputValue("#rtDe")) === "Sol" && (await fp.inputValue("#rtVers")) === "Hadur" && (await nBadge(fp)) === 7 && /^7 sauts/.test(await stat(fp)) && (await fp.evaluate(() => document.querySelector(".nd.sel").dataset.i)) === "stanton", await stat(fp));
      await fp.goto(base + "/#carte/2900?de=sol&vers=stanton"); await fp.waitForTimeout(400);
      check("lien : un lien sans système (#carte/2900?de=…) fonctionne et affiche « Aucune route en 2900 »", (await fp.textContent("#mYear")) === "2900" && /Aucune route en 2900/.test(await stat(fp)));
      const fp2 = await page.context().newPage();
      fp2.on("pageerror", e => errors.push("(ancien lien) " + e.message));
      await fp2.goto(base + "/#carte/2956/terra"); await fp2.waitForSelector(".nd.sel"); await fp2.waitForTimeout(500);
      check("lien : un ancien lien #carte/2956/terra marche toujours (sans itinéraire)", (await fp2.evaluate(() => document.querySelector(".nd.sel").dataset.i)) === "terra" && (await fp2.textContent("#mYear")) === "2956" && (await nBadge(fp2)) === 0 && (await fp2.inputValue("#rtDe")) === "");
      check("lien : l'adresse d'un lien sans itinéraire reste #carte/année/système", (await fp2.evaluate(() => location.hash)) === "#carte/2956/terra");
      await fp2.goto(base + "/#carte/2956/terra?de=zzz&vers=sol"); await fp2.waitForTimeout(400);
      check("lien : un identifiant inconnu dans le lien donne un message, sans erreur", /Système inconnu : « zzz »/.test(await stat(fp2)));
      await fp.close(); await fp2.close();
      /* boutons de la fiche */
      await page.click("#rtClear"); await page.goto(base + "/#carte/2956/stanton"); await page.waitForTimeout(300);
      await page.click('#mDetail [data-rt="de"]'); await page.waitForTimeout(150);
      check("fiche : « Itinéraire depuis ici » remplit le départ et place le focus sur l'arrivée", (await page.inputValue("#rtDe")) === "Stanton" && (await page.evaluate(() => document.activeElement.id)) === "rtVers");
      await page.keyboard.press("Escape");
      await page.goto(base + "/#carte/2956/hadur"); await page.waitForTimeout(300);
      await page.click('#mDetail [data-rt="vers"]'); await page.waitForTimeout(150);
      check("fiche : « Itinéraire jusqu'ici » remplit l'arrivée et trace la route (Stanton → Hadur)", (await page.inputValue("#rtVers")) === "Hadur" && /^\d+ sauts? · Stanton → Hadur/.test(await stat()) && (await nBadge()) >= 1, await stat());
      check("fiche : les deux boutons ont un nom accessible", await page.evaluate(() => ["de", "vers"].every(k => document.querySelector('#mDetail [data-rt="' + k + '"]').textContent.trim().length > 10)));
      await page.click("#rtClear");

      /* mobile : 390 x 844, tactile */
      const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      const mp = await mctx.newPage();
      mp.on("pageerror", e => errors.push("(mobile) " + e.message));
      mp.on("console", m => { if (m.type() === "error" && !/googleapis|gstatic|ERR_|net::|evt-/.test(m.text() + (m.location().url || ""))) errors.push("(mobile) " + m.text()); });
      await mp.goto(base + "/#carte/2956/stanton"); await mp.waitForSelector(".nd.sel"); await mp.waitForTimeout(500);
      await mp.tap("#vwTabRail"); await mp.waitForTimeout(300);
      const sec = await mp.evaluate(() => { const i = document.querySelector("#vwRail .in"), s = document.querySelector("#rtSec"); i.scrollTop = s.offsetTop - 8; const r = s.getBoundingClientRect(); return { vis: r.height > 0 && r.top < innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }; });
      check("mobile : la section Itinéraire est atteignable dans le panneau Filtres, sans défilement horizontal", sec.vis && sec.sw <= sec.iw, JSON.stringify(sec));
      await setRt("Sol", "Hadur", mp);
      const mrt = await mp.evaluate(() => ({ n: document.querySelectorAll("#rtSteps li").length, small: [...document.querySelectorAll("#vwRail input,#vwRail .btn,#rtSteps button")].filter(e => e.offsetParent && e.getBoundingClientRect().height < 40).length, sw: document.documentElement.scrollWidth <= innerWidth }));
      check("mobile : 7 étapes, cibles tactiles d'au moins 40 px, pas de défilement horizontal", mrt.n === 7 && mrt.small === 0 && mrt.sw, JSON.stringify(mrt));
      await mp.evaluate(() => document.querySelector("#rtSteps li:nth-child(3)").scrollIntoView({ block: "center" }));
      await mp.tap("#rtSteps li:nth-child(3) button"); await mp.waitForTimeout(500);
      const mst = await mp.evaluate(() => { const g = document.querySelector(".nd.sel"), c = g.querySelector(".c").getBoundingClientRect(), s = document.getElementById("mapsvg").getBoundingClientRect(), v = document.getElementById("vwRail").getBoundingClientRect(); return { sel: g.dataset.i, railShown: v.height > 0, cx: (c.x + c.width / 2 - s.left) / s.width, cy: (c.y + c.height / 2 - s.top) / s.height, sw: document.documentElement.scrollWidth <= innerWidth }; });
      check("mobile : une étape tapée ferme le panneau, sélectionne le système (Pyro) et le centre", mst.sel === "pyro" && !mst.railShown && mst.cx > 0.3 && mst.cx < 0.7 && mst.cy > 0.2 && mst.cy < 0.7 && mst.sw, JSON.stringify(mst));
      await mp.tap("#vwTabSide"); await mp.waitForTimeout(300);
      await mp.tap('#mDetail [data-rt="vers"]'); await mp.waitForTimeout(400);
      check("mobile : « Itinéraire jusqu'ici » dans la fiche ouvre la section Itinéraire du panneau Filtres", (await mp.isVisible("#vwRail")) && (await mp.inputValue("#rtVers")) === "Pyro" && (await mp.isVisible("#rtH")), await mp.inputValue("#rtVers"));
      await mctx.close();

      /* CSP stricte : parcours d'un itinéraire sans violation */
      const rctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await rctx.route(base + "/**", async route => { const resp = await route.fetch(); await route.fulfill({ response: resp, headers: Object.assign({}, resp.headers(), { "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://robertsspaceindustries.com https://*.robertsspaceindustries.com; connect-src 'self'; font-src 'self'; worker-src 'self'; object-src 'none'" }) }); });
      await rctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
      const rp = await rctx.newPage(); const rmsg = [];
      rp.on("pageerror", e => rmsg.push(e.message)); rp.on("console", m => { if (/Content Security Policy|Refused to/i.test(m.text())) rmsg.push(m.text()); });
      await rp.goto(base + "/#carte/2956/stanton?de=sol&vers=stanton"); await rp.waitForSelector(".nd.sel");
      await rp.fill("#mRange", "2900"); await rp.click("#rtCta button"); await rp.click("#rtSwap"); await rp.click("#rtClear"); await rp.waitForTimeout(300);
      check("itinéraire : aucune violation de la CSP stricte", (await rp.evaluate(() => window.__csp)).length === 0 && rmsg.length === 0, JSON.stringify(await rp.evaluate(() => window.__csp)) + rmsg.join("|"));
      await rctx.close();
    }
    /* ───────── carnet masqué par défaut (réactivable par ?carnet=1 ou localStorage "orbital-carnet") ───────── */
    {
      const CSPC = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://robertsspaceindustries.com https://*.robertsspaceindustries.com; connect-src 'self'; font-src 'self'; worker-src 'self'; object-src 'none'";
      // contexte neuf (aucun localStorage), CSP stricte, mesure des requêtes /api/entries, de carnet.js, des erreurs et des violations
      const fresh = async (opts) => {
        const c = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" }, opts || {}));
        await c.route(base + "/**", async route => { const r = await route.fetch(); await route.fulfill({ response: r, headers: Object.assign({}, r.headers(), { "content-security-policy": CSPC }) }); });
        await c.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
        const p = await c.newPage(); const o = { c, p, api: [], js: [], err: [] };
        p.on("request", r => { const u = new URL(r.url()); if (u.pathname.indexOf("/api/entries") === 0) o.api.push(u.pathname); if (u.pathname === "/carnet.js") o.js.push(u.pathname); });
        p.on("pageerror", e => o.err.push("pageerror " + e.message));
        p.on("console", m => { if (m.type() === "error" || /Content Security Policy|Refused to/i.test(m.text())) o.err.push(m.text()); });
        return o;
      };
      const feat = (p) => p.evaluate(() => ({ attr: document.documentElement.getAttribute("data-carnet"), ls: localStorage.getItem("orbital-carnet"),
        vis: [...document.querySelectorAll('[data-feature="carnet"]')].filter(e => e.offsetParent !== null || getComputedStyle(e).display !== "none").length,
        n: document.querySelectorAll('[data-feature="carnet"]').length }));
      const tabbed = async (p) => { // 40 appuis sur Tab : le focus ne doit jamais entrer dans un élément du carnet
        await p.evaluate(() => document.activeElement && document.activeElement.blur()); const hit = [];
        for (let i = 0; i < 40; i++) { await p.keyboard.press("Tab"); hit.push(await p.evaluate(() => { const a = document.activeElement; return a && a.closest && a.closest('[data-feature="carnet"]') ? (a.id || a.tagName) : ""; })); }
        return hit.filter(Boolean);
      };

      /* 1. bureau, défaut */
      const d = await fresh();
      await d.p.goto(base + "/"); await d.p.waitForSelector(".hm-banner"); await d.p.waitForTimeout(1200);
      const f0 = await feat(d.p);
      check("carnet masqué : <html> sans data-carnet, rien en localStorage, éléments data-feature=\"carnet\" tous masqués (display:none)", f0.attr === null && f0.ls === null && f0.n >= 8 && f0.vis === 0, JSON.stringify(f0));
      const nav0 = await d.p.evaluate(() => ({ tab: !!document.querySelector('.tab[data-v="log"]') && document.querySelector('.tab[data-v="log"]').offsetParent !== null,
        side: document.querySelector(".side-card").offsetParent !== null, txt: document.querySelector(".sidebar").innerText }));
      check("carnet masqué : ni « Carnet de bord » ni badge « Carnet local · N entrées » dans la barre latérale", !nav0.tab && !nav0.side && !/carnet/i.test(nav0.txt), nav0.txt.replace(/\s+/g, " "));
      const home0 = await d.p.evaluate(() => ({ t: document.getElementById("v-home").innerText.replace(/\s+/g, " "), ctas: [...document.querySelectorAll(".hm-cta .cta")].filter(b => b.offsetParent !== null).map(b => b.textContent.trim()),
        cards: [...document.querySelectorAll(".hm-card")].filter(b => b.offsetParent !== null).length, sub: document.getElementById("topSub").textContent, h2: [...document.querySelectorAll(".hm-copy h2")].filter(h => h.offsetParent !== null).map(h => h.textContent) }));
      check("carnet masqué : l'accueil ne parle plus du carnet (ni bloc, ni « Dernière activité », ni « Démarrer une session », ni texte)", !/carnet|derni[eè]re activit|d[eé]marrer une session|consigner|game\.log/i.test(home0.t + " " + home0.sub), home0.t + " | " + home0.sub);
      check("carnet masqué : accueil recomposé (2 cartes, 2 boutons d'action, un seul titre)", home0.cards === 2 && home0.ctas.length === 2 && home0.h2.length === 1, JSON.stringify(home0));
      check("carnet masqué : aucune requête vers /api/entries ni chargement de carnet.js", d.api.length === 0 && d.js.length === 0, JSON.stringify([d.api, d.js]));
      const hits = await tabbed(d.p);
      check("carnet masqué : le clavier (Tab) n'atteint aucun élément du carnet", hits.length === 0, hits.join(","));
      check("carnet masqué : le titre de la barre du haut reste « Accueil »", (await d.p.textContent("#topTitle")) === "Accueil");
      /* recherche globale */
      await d.p.keyboard.press("/"); await d.p.waitForSelector("#srchOv", { state: "visible" });
      const sres = {};
      for (const q of ["carnet", "session", "Game.log", "aUEC", "minage"]) {
        await d.p.fill("#srchQ", q); await d.p.waitForTimeout(350);
        sres[q] = await d.p.$$eval("#srchLb [role=option]", els => els.map(e => e.textContent.replace(/\s+/g, " ").trim()).filter(t => /carnet|journal de bord|chronom[eè]tre|game\.log/i.test(t)));
      }
      check("carnet masqué : la recherche globale ne propose rien du carnet", Object.values(sres).every(a => a.length === 0), JSON.stringify(sres));
      await d.p.keyboard.press("Escape");
      /* routage */
      for (const h of ["#carnet", "#carnet/x", "#carnet?a=1"]) {
        await d.p.goto(base + "/" + h); await d.p.waitForSelector(".hm-banner"); await d.p.waitForTimeout(300);
        const r = await d.p.evaluate(() => ({ home: document.getElementById("v-home").offsetParent !== null, log: document.getElementById("v-log").offsetParent !== null, h: location.hash, t: document.getElementById("topTitle").textContent }));
        check("carnet masqué : " + h + " au chargement renvoie à l'accueil (sans # carnet)", r.home && !r.log && !/carnet/.test(r.h) && r.t === "Accueil", JSON.stringify(r));
      }
      await d.p.goto(base + "/#carte"); await d.p.waitForSelector("#v-map", { state: "visible" });
      await d.p.evaluate(() => { location.hash = "#carnet"; }); await d.p.waitForTimeout(500);
      const rh = await d.p.evaluate(() => ({ home: document.getElementById("v-home").offsetParent !== null, log: document.getElementById("v-log").offsetParent !== null, h: location.hash, t: document.getElementById("topTitle").textContent, sub: document.getElementById("topSub").textContent }));
      check("carnet masqué : #carnet saisi dans l'onglet ouvert renvoie à l'accueil, sans boucle", rh.home && !rh.log && !/carnet/.test(rh.h) && rh.t === "Accueil" && !/carnet/i.test(rh.sub), JSON.stringify(rh));
      for (const [v, sel] of [["time", "#v-time"], ["map", "#v-map"], ["cl", "#v-cl"], ["ver", "#v-ver"], ["home", "#v-home"]]) {
        if (["time", "map", "cl"].includes(v) && (await d.p.getAttribute("#loreBtn", "aria-expanded")) !== "true") await d.p.click("#loreBtn");
        await d.p.click('.tab[data-v="' + v + '"]'); await d.p.waitForTimeout(150);
        if (!(await d.p.isVisible(sel))) check("carnet masqué : onglet « " + v + " » affiché", false);
      }
      await d.p.waitForTimeout(600);
      check("carnet masqué : toujours aucune requête /api/entries après navigation dans tous les onglets", d.api.length === 0, JSON.stringify(d.api));
      check("carnet masqué : aucune erreur console ni violation CSP", d.err.length === 0 && (await d.p.evaluate(() => window.__csp)).length === 0, d.err.join(" | ") + JSON.stringify(await d.p.evaluate(() => window.__csp)));

      /* 2. ?carnet=1 réactive, mémorise ; ?carnet=0 coupe */
      await d.p.goto(base + "/?carnet=1"); await d.p.waitForSelector(".hm-banner"); await d.p.waitForTimeout(1000);
      const f1 = await feat(d.p);
      const on1 = await d.p.evaluate(() => ({ tab: document.querySelector('.tab[data-v="log"]').offsetParent !== null, side: document.querySelector(".side-card").offsetParent !== null, side2: document.getElementById("sideLogN").textContent,
        card: document.querySelector('.hm-card[data-go="log"]').offsetParent !== null, cta: [...document.querySelectorAll(".hm-cta .cta")].filter(b => b.offsetParent !== null).map(b => b.textContent.trim()), h2: [...document.querySelectorAll(".hm-copy h2")].filter(h => h.offsetParent !== null).map(h => h.textContent) }));
      check("?carnet=1 : réactive la navigation, le badge, la carte et le bouton d'accueil, et mémorise la valeur", f1.attr === "1" && f1.ls === "1" && on1.tab && on1.side && on1.card && on1.cta.length === 2 && /Démarrer une session/.test(on1.cta.join()) && /Consigner/.test(on1.h2.join()), JSON.stringify([f1, on1]));
      check("?carnet=1 : le moteur du carnet se charge et interroge /api/entries", d.js.length >= 1 && d.api.length >= 1, JSON.stringify([d.api, d.js]));
      await d.p.goto(base + "/"); await d.p.waitForSelector(".hm-banner");
      check("?carnet=1 mémorisé : le carnet reste actif au rechargement sans paramètre", (await feat(d.p)).attr === "1");
      await d.p.goto(base + "/#carnet"); await d.p.waitForSelector("#v-log", { state: "visible" });
      check("carnet activé : #carnet ouvre le carnet", (await d.p.textContent("#topTitle")) === "Carnet de bord" && /carnet/.test(await d.p.evaluate(() => location.hash)));
      await d.p.waitForFunction(() => /Enregistré sur le serveur/.test(document.getElementById("lgStore").textContent), null, { timeout: 5000 }).catch(() => {});
      check("carnet activé : le moteur est démarré (stockage serveur détecté)", /Enregistré sur le serveur/.test(await d.p.textContent("#lgStore")));
      const nApi = d.api.length;
      await d.p.goto(base + "/?carnet=0"); await d.p.waitForSelector(".hm-banner"); await d.p.waitForTimeout(800);
      const f2 = await feat(d.p);
      check("?carnet=0 : coupe le carnet et efface la valeur mémorisée", f2.attr === null && f2.ls === null && f2.vis === 0, JSON.stringify(f2));
      check("?carnet=0 : plus aucune requête /api/entries", d.api.length === nApi, JSON.stringify(d.api));
      await d.p.goto(base + "/"); await d.p.waitForSelector(".hm-banner");
      check("?carnet=0 mémorisé : le carnet reste masqué au rechargement sans paramètre", (await feat(d.p)).attr === null);
      check("réactivation : aucune erreur console ni violation CSP", d.err.length === 0 && (await d.p.evaluate(() => window.__csp)).length === 0, d.err.join(" | "));
      await d.c.close();

      /* les données du carnet ne sont pas touchées par le masquage */
      check("carnet masqué : l'API et les données sont conservées (les entrées de test sont toujours lisibles)", (await (await fetch(base + "/api/entries")).json()).length >= 1);

      /* 3. mobile 390 x 844 : barre du bas à 3 boutons, par défaut puis activée */
      const m = await fresh({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await m.p.goto(base + "/"); await m.p.waitForSelector(".hm-banner"); await m.p.waitForTimeout(500);
      const bar = async (p) => p.evaluate(() => { const bs = [...document.querySelectorAll(".tabs > .tab, .tabs .lore-toggle")].filter(b => b.offsetParent !== null).map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), h: Math.round(r.height), w: Math.round(r.width), x: Math.round(r.left) }; });
        return { bs, sw: document.documentElement.scrollWidth, side: getComputedStyle(document.querySelector(".sidebar")).position }; });
      const b3 = await bar(m.p);
      const ws = b3.bs.map(b => b.w);
      check("mobile, carnet masqué : barre du bas à 3 boutons (Accueil, Lore, Versions)", b3.bs.length === 3 && b3.bs.map(b => b.t).join("|") === "Accueil|Lore|Versions", JSON.stringify(b3.bs));
      check("mobile, carnet masqué : boutons >= 44 px, largeurs égales et barre qui occupe tout l'écran, sans défilement horizontal", b3.bs.every(b => b.h >= 44 && b.w >= 44) && Math.max(...ws) - Math.min(...ws) <= 2 && b3.bs[0].x <= 10 && b3.bs[2].x + b3.bs[2].w >= 380 && b3.sw <= 390, JSON.stringify(b3));
      const mh = await m.p.evaluate(() => document.getElementById("v-home").innerText.replace(/\s+/g, " "));
      check("mobile, carnet masqué : l'accueil ne parle pas du carnet", !/carnet|derni[eè]re activit|d[eé]marrer une session/i.test(mh), mh);
      check("mobile, carnet masqué : le clavier n'atteint aucun élément du carnet", (await tabbed(m.p)).length === 0);
      await m.p.goto(base + "/?carnet=1"); await m.p.waitForSelector(".hm-banner");
      const b4 = await bar(m.p);
      check("mobile, ?carnet=1 : barre du bas à 4 boutons", b4.bs.length === 4 && b4.bs.every(b => b.h >= 44), JSON.stringify(b4.bs));
      check("mobile : aucune erreur console ni violation CSP", m.err.length === 0 && (await m.p.evaluate(() => window.__csp)).length === 0, m.err.join(" | "));
      await m.c.close();
    }

    await page.keyboard.press("Escape"); await page.mouse.click(700, 450).catch(() => {}); await page.waitForTimeout(300);
    check("aucune erreur dans la console", errors.length === 0, errors.join(" | "));
  } catch (e) {
    check("exécution du test", false, e && e.stack || String(e));
  } finally {
    if (browser) await browser.close();
    a.child.kill(); b.child.kill();
    for (const d of [a.data, b.data]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {} }
  }
  const bad = results.filter(r => !r.ok).length;
  console.log("\n" + (results.length - bad) + "/" + results.length + " vérifications réussies");
  process.exit(bad ? 1 : 0);
})();
