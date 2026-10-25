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
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
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
    check("comm-links : la liste est chargée et affichée par pages", nCl > 1000 && (await page.locator("#clGrid .cl-card").count()) === 60, String(nCl));
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
    const [fc1] = await Promise.all([page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null), page.keyboard.press("Enter")]);
    check("carnet : Entrée ouvre le sélecteur de fichier (Game.log)", !!fc1);
    await page.keyboard.press("Tab");
    const [fc2] = await Promise.all([page.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null), page.keyboard.press("Space")]);
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
