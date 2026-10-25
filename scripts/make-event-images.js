// Génère les versions 800 x 286 des images de la chronologie : public/evt-<époque>-<n>.webp -> public/evt-<époque>-<n>-800.webp
//
// Les originaux (1600 x 571) ne sont jamais modifiés. La chronologie les affiche à ~376 px de large :
// timeline.js charge la version -800 via srcset et ne prend l'original que sur les écrans très denses
// ou très larges. Les fichiers -800 sont GÉNÉRÉS par ce script : ne pas les éditer à la main.
//
// Usage :
//   node scripts/make-event-images.js            # crée seulement les -800 manquantes ou plus anciennes que leur original
//   node scripts/make-event-images.js --force    # régénère tout
//   node scripts/make-event-images.js --quality 0.8 --max-kb 30
//
// Méthode : Chromium (Playwright) décode l'original, le dessine dans un canvas 800 x 286 (imageSmoothingQuality
// « high ») et l'encode avec canvas.toDataURL('image/webp', q). Qualité de départ 0,8 ; si le fichier dépasse
// --max-kb (30 par défaut), la qualité baisse par pas de 0,05 jusqu'à 0,5. Idempotent : sans --force, un fichier
// à jour n'est pas retouché. CHROMIUM_PATH permet d'utiliser un Chromium déjà installé.
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");

const PUB = path.join(__dirname, "..", "public");
const W = 800;
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const force = process.argv.includes("--force");
const q0 = parseFloat(arg("quality", "0.8")), maxKb = parseFloat(arg("max-kb", "30"));

(async () => {
  const srcs = fs.readdirSync(PUB).filter(f => /^evt-\d+-\d+\.webp$/.test(f)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const todo = srcs.filter(f => {
    const out = path.join(PUB, f.replace(".webp", "-800.webp"));
    return force || !fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(path.join(PUB, f)).mtimeMs;
  });
  console.log(srcs.length + " originaux, " + todo.length + " à générer" + (force ? " (--force)" : ""));
  if (!todo.length) return;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  await page.setContent("<canvas id=c></canvas>");
  let total = 0;
  for (const f of todo) {
    const b64 = fs.readFileSync(path.join(PUB, f)).toString("base64");
    const r = await page.evaluate(async ({ b64, W, q0, maxBytes }) => {
      const img = new Image();
      img.src = "data:image/webp;base64," + b64;
      await img.decode();
      const H = Math.round(img.naturalHeight * W / img.naturalWidth);
      const c = document.getElementById("c"); c.width = W; c.height = H;
      const x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
      x.drawImage(img, 0, 0, W, H);
      let q = q0, url;
      for (;;) {
        url = c.toDataURL("image/webp", q);
        const bytes = Math.floor((url.length - 23) * 3 / 4);
        if (bytes <= maxBytes || q <= 0.5) return { url, q, w: img.naturalWidth, h: img.naturalHeight, W, H };
        q = Math.round((q - 0.05) * 100) / 100;
      }
    }, { b64, W, q0, maxBytes: maxKb * 1024 });
    if (!r.url.startsWith("data:image/webp;base64,")) throw new Error("encodage webp indisponible pour " + f);
    const buf = Buffer.from(r.url.split(",")[1], "base64");
    fs.writeFileSync(path.join(PUB, f.replace(".webp", "-800.webp")), buf);
    total += buf.length;
    console.log("  " + f.replace(".webp", "-800.webp") + "  " + r.w + "x" + r.h + " -> " + r.W + "x" + r.H + "  q=" + r.q + "  " + (buf.length / 1024).toFixed(1) + " Ko");
  }
  console.log("Total : " + (total / 1024).toFixed(0) + " Ko pour " + todo.length + " images");
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
