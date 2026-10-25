// Test des images : chronologie (versions -800, srcset) et Comm-Links (pagination, vignettes, poids).
// Usage : node tests/perf-images.js   (CHROMIUM_PATH pour utiliser un Chromium déjà installé)
// Hors réseau : les images de robertsspaceindustries.com sont simulées (page.route), les polices externes bloquées.
"use strict";
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok, extra }); console.log((ok ? "  ok   " : "  ÉCHEC ") + name + (ok || !extra ? "" : " → " + extra)); };

/* seuils (mesurés puis arrondis avec marge ; voir docs/images.md) */
const MAX_800_KB = 60;      /* poids d'une image -800 (mesuré : 7 à 29 Ko) */
const MAX_CL_OWN_KB = 450;  /* octets transférés par NOTRE serveur à l'ouverture de Comm-Links (commlinks.js compressé ≈ 330 Ko) */
const MAX_CL_RSI_REQ = 18;  /* requêtes d'images RSI à l'ouverture (12 cartes) */
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function startServer(port) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "orbital-perf-"));
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
const free = () => new Promise((res, rej) => { const s = require("net").createServer(); s.on("error", rej); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });

(async () => {
  const port = await free();
  const srv = startServer(port);
  let browser;
  try {
    await waitUp(port);
    const base = "http://127.0.0.1:" + port;

    /* fichiers */
    const origs = fs.readdirSync(PUB).filter(f => /^evt-\d+-\d+\.webp$/.test(f));
    const f800 = f => path.join(PUB, f.replace(".webp", "-800.webp"));
    const miss = origs.filter(f => !fs.existsSync(f800(f)));
    check("fichiers : chaque image evt-*.webp a sa version -800 (" + (origs.length - miss.length) + "/" + origs.length + ")", origs.length === 64 && miss.length === 0, miss.join(" "));
    const big = origs.filter(f => fs.existsSync(f800(f)) && fs.statSync(f800(f)).size >= MAX_800_KB * 1024);
    check("fichiers : toutes les -800 pèsent moins de " + MAX_800_KB + " Ko", big.length === 0, big.join(" "));
    check("fichiers : les -800 sont de vrais WebP", origs.every(f => { if (!fs.existsSync(f800(f))) return false; const b = fs.readFileSync(f800(f)); return b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP"; }));
    const tot = origs.reduce((a, f) => a + (fs.existsSync(f800(f)) ? fs.statSync(f800(f)).size : 0), 0);
    console.log("       (total des -800 : " + (tot / 1024).toFixed(0) + " Ko)");

    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const errors = [];
    async function open(vw, vh, dpr) {
      const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr || 1, serviceWorkers: "block" });
      const page = await ctx.newPage();
      page.on("pageerror", e => errors.push(e.message));
      const rsi = [];
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
        const u = route.request().url();
        if (/robertsspaceindustries\.com/.test(u)) { rsi.push(u); return route.fulfill({ status: 200, contentType: "image/gif", body: GIF }); }
        return route.abort();
      });
      await page.goto(base + "/");
      await page.waitForSelector(".hm-banner");
      return { ctx, page, rsi };
    }
    async function go(page, v) {
      if ((await page.getAttribute("#loreBtn", "aria-expanded")) !== "true") await page.click("#loreBtn");
      await page.click('.tab[data-v="' + v + '"]');
    }

    /* chronologie : srcset */
    {
      const { ctx, page } = await open(390, 844, 2);
      await go(page, "time");
      const info = await page.evaluate(() => [...document.querySelectorAll("#app .ev-photo")].map(i => ({ src: i.getAttribute("src"), srcset: i.getAttribute("srcset"), sizes: i.getAttribute("sizes"), w: i.getAttribute("width"), h: i.getAttribute("height"), lazy: i.loading, dec: i.decoding, oe: i.getAttribute("onerror") })));
      const withFile = info.filter(i => fs.existsSync(path.join(PUB, i.src)));
      const ok = withFile.filter(i => {
        const m = /^(evt-\d+-\d+)-800\.webp 800w, (evt-\d+-\d+)\.webp 1600w$/.exec(i.srcset || "");
        return m && m[1] === m[2] && m[1] + ".webp" === i.src && fs.existsSync(path.join(PUB, m[1] + "-800.webp"));
      });
      check("chronologie : chaque événement illustré a un srcset avec sa version -800 existante (" + ok.length + "/64)", withFile.length === 64 && ok.length === 64, withFile.length + " cartes avec fichier");
      check("chronologie : sizes, width/height, lazy, decoding et sans onerror inline", info.every(i => i.sizes && /calc\(100vw/.test(i.sizes) && i.w === "800" && i.h === "286" && i.lazy === "lazy" && i.dec === "async" && i.oe === null));
      /* à 390 px (écran 2x), le navigateur choisit la -800 */
      await page.evaluate(() => document.querySelector("#app .ev-photo").scrollIntoView());
      await page.waitForFunction(() => { const i = document.querySelector("#app .ev-photo"); return i && i.complete && i.currentSrc; });
      const cur = await page.evaluate(() => { const i = document.querySelector("#app .ev-photo"); return { c: i.currentSrc, w: i.getBoundingClientRect().width }; });
      check("chronologie : à 390 px (écran 2x) le navigateur choisit la -800", /evt-\d+-\d+-800\.webp$/.test(cur.c) && cur.w > 300, JSON.stringify(cur));
      await ctx.close();
      const d = await open(1440, 900, 1);
      await go(d.page, "time");
      await d.page.evaluate(() => document.querySelector("#app .ev-photo").scrollIntoView());
      await d.page.waitForFunction(() => { const i = document.querySelector("#app .ev-photo"); return i && i.complete && i.currentSrc; });
      check("chronologie : à 1440 px (1x) le navigateur choisit la -800", /-800\.webp$/.test(await d.page.evaluate(() => document.querySelector("#app .ev-photo").currentSrc)));
      await d.ctx.close();
    }

    /* Comm-Links */
    {
      const { ctx, page, rsi } = await open(1440, 900, 1);
      const own = [];
      let ownBytes = 0;
      const cdp = await ctx.newCDPSession(page), m = new Map();
      await cdp.send("Network.enable");
      cdp.on("Network.requestWillBeSent", e => m.set(e.requestId, e.request.url));
      cdp.on("Network.loadingFinished", e => { if ((m.get(e.requestId) || "").startsWith(base)) { ownBytes += e.encodedDataLength; own.push(m.get(e.requestId)); } });
      await go(page, "cl");
      await page.waitForSelector("#clGrid .cl-card");
      await page.waitForTimeout(800);
      const total = await page.evaluate(() => window.COMMLINKS.rows.length);
      const cnt = () => page.textContent("#clCount");
      const cards = () => page.locator("#clGrid .cl-card").count();
      const n0 = await cards();
      check("Comm-Links : <= 18 cartes à l'ouverture (" + n0 + ")", n0 > 0 && n0 <= 18);
      check("Comm-Links : compteur « " + n0 + " affichés sur " + total + " »", (await cnt()).startsWith(n0 + " affichés sur " + total + " Comm-Link"), await cnt());
      check("Comm-Links : bouton « Voir plus » visible", (await page.isVisible("#clMore")) && (await page.textContent("#clMore")).trim() === "Voir plus");
      check("Comm-Links : <= " + MAX_CL_RSI_REQ + " images RSI demandées à l'ouverture (" + rsi.length + ")", rsi.length <= MAX_CL_RSI_REQ);
      check("Comm-Links : les vignettes demandées (1x) sont les « slideshow » 648 px, pas les originaux", rsi.length > 0 && rsi.every(u => /\/slideshow[./]/.test(u)), rsi.filter(u => !/\/slideshow[./]/.test(u)).slice(0, 2).join(" "));
      check("Comm-Links : octets transférés par notre serveur < " + MAX_CL_OWN_KB + " Ko (" + (ownBytes / 1024).toFixed(0) + " Ko)", ownBytes < MAX_CL_OWN_KB * 1024, own.join(" "));
      check("Comm-Links : chaque image charge la vignette slideshow et garde l'original en repli (data-full)", await page.evaluate(() => [...document.querySelectorAll("#clGrid .ev-photo")].every(i => /slideshow/.test(i.getAttribute("src")) && /channel_item_full/.test(i.dataset.full) && !i.hasAttribute("srcset"))));

      /* « Voir plus » */
      const hrefs = await page.evaluate(() => window.COMMLINKS.rows.length && document.querySelectorAll("#clGrid .cl-card").length);
      await page.click("#clMore");
      const n1 = await cards();
      check("Comm-Links : « Voir plus » ajoute 18 cartes (" + n0 + " → " + n1 + ")", n1 === n0 + 18 && hrefs === n0);
      check("Comm-Links : compteur « " + n1 + " affichés sur " + total + " » après « Voir plus »", (await cnt()).startsWith(n1 + " affichés sur " + total + " Comm-Link"), await cnt());
      check("Comm-Links : le focus va sur la première nouvelle carte", await page.evaluate(n => document.activeElement === document.querySelectorAll("#clGrid .cl-card")[n], n0), await page.evaluate(() => document.activeElement.tagName + " " + document.activeElement.className));
      check("Comm-Links : role=status annonce « 18 Comm-Links de plus affichés »", await page.evaluate(() => { const l = document.getElementById("clLive"); return l && l.getAttribute("role") === "status" && l.textContent === "18 Comm-Links de plus affichés"; }));

      /* recherche + pagination */
      const exp = await page.evaluate(q => {
        const norm = t => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        return window.COMMLINKS.rows.filter(r => norm(r[2] + " " + r[5]).indexOf(q) >= 0).length;
      }, "vanduul");
      await page.fill("#clQ", "vanduul");
      await page.waitForTimeout(500);
      const nq = await cards();
      check("Comm-Links : une recherche revient à la première page (" + nq + " cartes pour " + exp + " résultats)", exp > 30 && nq === 12);
      check("Comm-Links : compteur de recherche « " + nq + " affichés sur " + exp + " »", (await cnt()).startsWith(nq + " affichés sur " + exp + " Comm-Link"), await cnt());
      check("Comm-Links : la recherche s'applique à toutes les cartes affichées", await page.evaluate(() => [...document.querySelectorAll("#clGrid .cl-card")].every(a => /vanduul/i.test(a.textContent.normalize("NFD").replace(/[̀-ͯ]/g, "")))));
      await page.click("#clMore");
      const nq2 = await cards();
      check("Comm-Links : « Voir plus » pagine les résultats filtrés (" + nq2 + ")", nq2 === Math.min(nq + 18, exp) && (await cnt()).startsWith(nq2 + " affichés sur " + exp + " "));
      /* série */
      await page.fill("#clQ", "");
      await page.waitForTimeout(500);
      const sv = await page.evaluate(() => { const c = {}; window.COMMLINKS.rows.forEach(r => { if (r[6] >= 0) c[r[6]] = (c[r[6]] || 0) + 1; }); const k = Object.keys(c).filter(k => c[k] > 30).sort((a, b) => c[a] - c[b])[0]; return { v: k, n: c[k] }; });
      await page.selectOption("#clSer", sv.v);
      const ns = await cards();
      check("Comm-Links : une série de " + sv.n + " articles affiche 12 cartes (« 12 affichés sur " + sv.n + " »)", ns === 12 && (await cnt()).startsWith("12 affichés sur " + sv.n + " "));
      while (await page.isVisible("#clMore")) await page.click("#clMore");
      const ne = await cards();
      check("Comm-Links : en cliquant jusqu'au bout, toute la série est là et le bouton disparaît (" + ne + ")", ne === sv.n && !(await page.isVisible("#clMore")) && (await cnt()).startsWith(sv.n + " affichés sur " + sv.n + " "));
      const lastMsg = await page.evaluate(() => document.getElementById("clLive").textContent);
      const lastN = (sv.n - 12) % 18 || 18;
      check("Comm-Links : la dernière page annonce le bon nombre (« " + lastMsg + " »)", +lastMsg.split(" ")[0] === lastN && /^\d+ Comm-Links? de plus affichés?$/.test(lastMsg));
      /* aucun résultat */
      await page.selectOption("#clSer", "");
      await page.fill("#clQ", "zzzzqqqq");
      await page.waitForTimeout(500);
      check("Comm-Links : aucun résultat → message, aucune carte, pas de bouton", (await cards()) === 0 && !(await page.isVisible("#clMore")) && /Aucun/.test(await cnt()));
      await ctx.close();
    }
    check("aucune erreur JavaScript", errors.length === 0, errors.join(" | "));
  } catch (e) {
    check("exécution du test", false, e && e.stack || String(e));
  } finally {
    if (browser) await browser.close();
    srv.child.kill();
    try { fs.rmSync(srv.data, { recursive: true, force: true }); } catch (e) {}
  }
  const bad = results.filter(r => !r.ok).length;
  console.log("\n" + (results.length - bad) + "/" + results.length + " vérifications réussies");
  process.exit(bad ? 1 : 0);
})();
