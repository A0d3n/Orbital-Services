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
    const put = await fetch(base + "/api/entries/t1", { method: "PUT", body: JSON.stringify({ title: "essai", type: "mining", dur: 30, auec: 1000 }) });
    const list = await (await fetch(base + "/api/entries")).json();
    check("API du carnet : écriture puis lecture", put.ok && list.length === 1 && list[0].title === "essai");
    check("authentification : 401 sans mot de passe", (await fetch("http://127.0.0.1:" + port2 + "/")).status === 401);
    const ok = await fetch("http://127.0.0.1:" + port2 + "/", { headers: { Authorization: "Basic " + Buffer.from("orbital:secret").toString("base64") } });
    check("authentification : 200 avec le bon mot de passe", ok.status === 200);

    /* navigateur */
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error" && !/googleapis|gstatic|ERR_|net::/.test(m.text() + (m.location().url || ""))) errors.push(m.text()); });

    await page.goto(base + "/");
    await page.waitForSelector(".hm-banner");
    const nSys = await page.evaluate(() => SYS.length);
    check("accueil : le nombre de systèmes vient des données", (await page.textContent("#hsSys")) === String(nSys) && nSys > 0);
    check("accueil : l'image de Terra est chargée", await page.evaluate(() => { const i = document.querySelector(".hm-img img"); return i.complete && i.naturalWidth > 0; }));

    for (const [v, sel] of [["log", "#v-log"], ["time", "#v-time"], ["map", "#v-map"], ["home", "#v-home"]]) {
      await page.click('.tab[data-v="' + v + '"]');
      check("onglet « " + v + " » s'affiche", await page.isVisible(sel));
    }

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

    /* chronologie : recherche, tri, cartes */
    await page.click('.tab[data-v="time"]');
    const cards = await page.evaluate(() => document.querySelectorAll("#app .ev").length);
    check("chronologie : les événements sont des cartes", cards === (await page.evaluate(() => window.__orb.events)) && cards > 30);
    await page.fill("#tlQ", "Stanton");
    const found = await page.evaluate(() => [...document.querySelectorAll("#app .ev")].filter(e => !e.hidden).length);
    check("chronologie : la recherche filtre les cartes", found > 0 && found < cards, String(found));
    await page.fill("#tlQ", "");
    await page.click('#tlSort button[data-sort="recent"]');
    const first = await page.evaluate(() => { const e = [...document.querySelectorAll("#appFlat .ev")].find(x => !x.hidden); return e && e.dataset.y; });
    check("chronologie : tri du plus récent au plus ancien", first === "2950", String(first));
    await page.click('#tlSort button[data-sort="era"]');
    const bad = await page.evaluate(() => [...document.querySelectorAll(".ev-map")].filter(b => b.dataset.y && (+b.dataset.y < 2100 || +b.dataset.y > 2956)).length);
    check("chronologie : aucun bouton « carte » pour une année hors carte", bad === 0, String(bad));

    /* liens entre onglets */
    await page.click('.tab[data-v="time"]');
    const nb = await page.evaluate(() => document.querySelectorAll(".ev-map").length);
    check("chronologie : des boutons « voir sur la carte »", nb > 10);
    await page.locator('.ev-map[data-s="vega"]').first().click();
    check("chronologie → carte : année et système repris", (await page.textContent("#mYear")) === "2945" && (await page.evaluate(() => document.querySelector(".nd.sel").dataset.i)) === "vega");

    /* carnet */
    await page.click('.tab[data-v="log"]');
    await page.fill("#fDur", "60"); await page.fill("#fAuec", "120000"); await page.fill("#fTitle", "Minage de test");
    await page.click("#fSave");
    await page.waitForFunction(() => /\+120\s?000/.test(document.querySelector("#lgStats").textContent.replace(/ | /g, " ")), null, { timeout: 5000 }).catch(() => {});
    const stats = (await page.textContent("#lgStats")).replace(/\s+/g, " ");
    // 2 entrées : 30 min / 1 000 aUEC (via l'API) et 60 min / 120 000 aUEC (via le formulaire) = 121 000 aUEC en 1 h 30, soit 80 667 aUEC / heure
    check("carnet : une entrée est enregistrée et le gain par heure est calculé", /121\s?000/.test(stats) && /80\s?667/.test(stats), stats);
    check("carnet : graphique sur 30 jours", (await page.evaluate(() => document.querySelectorAll("#lgDays i").length)) === 30);

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
