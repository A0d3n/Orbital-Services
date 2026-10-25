// Test performance : polices locales, image d'accueil allégée, service worker (cache versionné, hors ligne).
// Usage : node tests/perf-fonts-sw.js   (CHROMIUM_PATH pour utiliser un Chromium déjà installé)
"use strict";
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok, extra }); console.log((ok ? "  ok   " : "  ÉCHEC ") + name + (ok || !extra ? "" : " → " + extra)); };

(async () => {
  const port = 18900 + Math.floor(Math.random() * 500);
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "orbital-"));
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: data }), stdio: "ignore" });
  let browser;
  try {
    for (let i = 0; ; i++) {
      try { const r = await fetch("http://127.0.0.1:" + port + "/healthz"); if (r.status) break; } catch (e) {}
      if (i > 50) throw new Error("le serveur ne répond pas");
      await new Promise(r => setTimeout(r, 100));
    }
    const base = "http://127.0.0.1:" + port;
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
    const css = fs.readFileSync(path.join(PUB, "style.css"), "utf8");
    const sw = fs.readFileSync(path.join(PUB, "sw.js"), "utf8");

    /* fichiers */
    const woff = ["geist-latin", "geist-latin-ext", "geist-mono-latin", "geist-mono-latin-ext"].map(n => n + ".woff2");
    const sizes = woff.map(f => fs.existsSync(path.join(PUB, f)) ? fs.statSync(path.join(PUB, f)).size : 0);
    check("polices : les 4 fichiers woff2 existent", sizes.every(s => s > 5000), sizes.join(" "));
    check("polices : poids total < 150 Ko", sizes.reduce((a, b) => a + b, 0) < 150 * 1024, String(sizes.reduce((a, b) => a + b, 0)));
    check("polices : licence OFL présente", fs.existsSync(path.join(PUB, "fonts-LICENSE.txt")) && /SIL OPEN FONT LICENSE/.test(fs.readFileSync(path.join(PUB, "fonts-LICENSE.txt"), "utf8")));
    check("application : plus aucune référence à googleapis / gstatic", !/googleapis|gstatic/.test(html + css + sw + fs.readFileSync(path.join(PUB, "home.js"), "utf8")));
    check("polices : 4 @font-face avec font-display swap et unicode-range", (css.match(/@font-face\{[^}]*font-display:swap[^}]*unicode-range/g) || []).length === 4);
    check("polices : préchargement de la police principale", /<link rel="preload"[^>]*geist-latin\.woff2[^>]*as="font"[^>]*type="font\/woff2"[^>]*crossorigin/.test(html) || /<link rel="preload"[^>]*as="font"[^>]*geist-latin\.woff2/.test(html));
    for (const f of ["terra.webp", "terra-1000.webp", "terra-600.webp"]) check("image : " + f + " existe", fs.existsSync(path.join(PUB, f)));
    check("image : terra-1000.webp < 100 Ko", fs.statSync(path.join(PUB, "terra-1000.webp")).size < 100 * 1024);
    const cacheName = (/var VERSION = "([^"]+)";/.exec(sw) || [])[1];
    check("sw.js : le nom du cache est « orbital-" + pkg.version + " »", cacheName === "orbital-" + pkg.version, cacheName);
    check("sw.js : commlinks.js et terra.webp (grande) ne sont pas précachés", !/CORE = \[[^\]]*commlinks\.js/.test(sw) && !/CORE = \[[^\]]*"terra\.webp"/.test(sw));
    check("sw.js : plafond du cache d'exécution et réponses 200 seulement", /MAX_RUNTIME = \d+/.test(sw) && /status === 200/.test(sw));

    /* navigateur : aucune requête externe, onglet par onglet */
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const ext = [], local = [];
    page.on("request", r => {
      const u = new URL(r.url());
      if (u.protocol === "data:" || u.protocol === "blob:") return;
      if (u.origin === base) { local.push(u.pathname); return; }
      if (/(^|\.)robertsspaceindustries\.com$/.test(u.hostname)) return; // images de Comm-Links
      ext.push(r.url());
    });
    await page.goto(base + "/");
    await page.waitForSelector(".hm-banner");
    for (const v of ["home", "log", "time", "map", "cl", "ver"]) {
      if (["time", "map", "cl"].includes(v) && (await page.getAttribute("#loreBtn", "aria-expanded")) !== "true") await page.click("#loreBtn");
      await page.click('.tab[data-v="' + v + '"]');
      await page.waitForTimeout(500);
      check("onglet « " + v + " » : aucune requête vers un hôte externe", ext.length === 0, ext.join(" "));
    }
    await page.click('.tab[data-v="home"]');
    await page.waitForTimeout(500);

    const fontInfo = await page.evaluate(async () => {
      await document.fonts.load("500 16px Geist"); await document.fonts.load("400 12px 'Geist Mono'");
      await document.fonts.ready;
      const faces = [...document.fonts].map(f => ({ fam: f.family.replace(/"/g, ""), display: f.display, status: f.status }));
      return { check: document.fonts.check("16px Geist"), mono: document.fonts.check("12px 'Geist Mono'"), faces };
    });
    check("polices : document.fonts.check('16px Geist') est vrai (et Geist Mono)", fontInfo.check && fontInfo.mono);
    check("polices : les 4 @font-face sont en swap", fontInfo.faces.length === 4 && fontInfo.faces.every(f => f.display === "swap"), JSON.stringify(fontInfo.faces));
    check("polices : Geist chargée depuis le serveur local", local.some(p => /geist-latin\.woff2$/.test(p)));

    /* image d'accueil */
    const img = await page.evaluate(() => { const i = document.querySelector(".hm-img img"); return { src: i.currentSrc, fp: i.getAttribute("fetchpriority"), w: i.getAttribute("width"), h: i.getAttribute("height"), srcset: i.srcset, nat: i.naturalWidth, lazy: i.loading }; });
    check("accueil : la version légère de Terra est servie (pas terra.webp)", /terra-(600|1000)\.webp$/.test(img.src) && img.nat >= 600, img.src);
    check("accueil : fetchpriority=high, width/height, srcset, pas de lazy", img.fp === "high" && img.w === "2000" && img.h === "1090" && /600w/.test(img.srcset) && img.lazy !== "lazy");
    check("accueil : la grande image n'est pas téléchargée (1440 px, 1×)", !local.includes("/terra.webp"), local.filter(p => /terra/.test(p)).join(" "));

    /* service worker */
    const sctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const sp = await sctx.newPage();
    await sp.goto(base + "/");
    await sp.waitForSelector(".hm-banner");
    const active = await sp.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active));
    check("service worker : installé et actif", active);
    await sp.waitForTimeout(800);
    await sp.reload();
    await sp.waitForSelector(".hm-banner");
    await sp.waitForTimeout(500);
    const cs = await sp.evaluate(async () => {
      const keys = await caches.keys(); const c = await caches.open(keys[0]);
      return { keys, reqs: (await c.keys()).map(r => new URL(r.url).pathname) };
    });
    check("service worker : un seul cache, nommé orbital-" + pkg.version, cs.keys.length === 1 && cs.keys[0] === "orbital-" + pkg.version, cs.keys.join(" "));
    check("service worker : polices et terra-1000 dans le précache", woff.every(f => cs.reqs.includes("/" + f)) && cs.reqs.includes("/terra-1000.webp"), cs.reqs.join(" "));
    check("service worker : commlinks.js absent du cache avant la visite de l'onglet", !cs.reqs.includes("/commlinks.js"));
    await sctx.setOffline(true);
    await sp.reload();
    await sp.waitForSelector(".hm-banner", { timeout: 10000 }).catch(() => {});
    const off = await sp.evaluate(() => ({ banner: !!document.querySelector(".hm-banner"), title: document.title, font: document.fonts.check("16px Geist"), img: (() => { const i = document.querySelector(".hm-img img"); return !!(i && i.complete && i.naturalWidth > 0); })() }));
    check("hors ligne : l'accueil s'affiche (page, scripts, image)", off.banner && off.title === "Orbital Services" && off.img, JSON.stringify(off));
    check("hors ligne : la police Geist est disponible", off.font);
    await sctx.setOffline(false);
    // plafond : on remplit le cache au-delà de la limite avec de vraies requêtes
    const max = +/MAX_RUNTIME = (\d+)/.exec(sw)[1];
    await sp.evaluate(async n => { for (let i = 0; i < n; i++) await fetch("/style.css?x=" + i).then(r => r.text()); }, max + 20);
    await sp.waitForTimeout(1000);
    const n = await sp.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).length);
    check("service worker : le cache est plafonné à " + max + " entrées", n <= max && n > max - 30, String(n));
    await sctx.close();
    await ctx.close();
  } catch (e) {
    check("exécution du test", false, e && e.stack || String(e));
  } finally {
    if (browser) await browser.close();
    child.kill();
    try { fs.rmSync(data, { recursive: true, force: true }); } catch (e) {}
  }
  const bad = results.filter(r => !r.ok).length;
  console.log("\n" + (results.length - bad) + "/" + results.length + " vérifications réussies");
  process.exit(bad ? 1 : 0);
})();
