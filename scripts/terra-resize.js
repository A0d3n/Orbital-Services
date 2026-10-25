// Génère des variantes allégées de public/terra.webp (terra-1000.webp, terra-600.webp) avec Chromium.
//   node scripts/terra-resize.js [qualité 0-1, défaut 0.78]
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const PUB = path.join(__dirname, "..", "public");
const Q = parseFloat(process.argv[2]) || 0.78;
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage();
  const src = "data:image/webp;base64," + fs.readFileSync(path.join(PUB, "terra.webp")).toString("base64");
  for (const w of [1000, 600]) {
    const data = await p.evaluate(async ([src, w, q]) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement("canvas"); c.width = w; c.height = Math.round(w * img.naturalHeight / img.naturalWidth);
      const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL("image/webp", q);
    }, [src, w, Q]);
    const buf = Buffer.from(data.split(",")[1], "base64");
    fs.writeFileSync(path.join(PUB, "terra-" + w + ".webp"), buf);
    console.log("terra-" + w + ".webp", buf.length, "octets");
  }
  await b.close();
})();
