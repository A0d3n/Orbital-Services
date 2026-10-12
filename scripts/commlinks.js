// Récupère la liste des Comm-Links de robertsspaceindustries.com et écrit public/commlinks.js.
//   node scripts/commlinks.js
// Chaque ligne : [chemin, chaîne, titre, date (AAAA-MM-JJ), image, extrait, série]
"use strict";
const fs = require("fs"), path = require("path");
const BASE = "https://robertsspaceindustries.com", UA = "Mozilla/5.0 (Orbital Services)";
const CH = ["transmission", "spectrum-dispatch", "citizens", "engineering", "serialized-fiction"];
const dec = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n));
const clean = s => dec(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

async function main() {
  const home = await fetch(BASE + "/en/comm-link", { headers: { "User-Agent": UA } });
  const html = await home.text();
  const cookies = (home.headers.getSetCookie ? home.headers.getSetCookie() : []).map(c => c.split(";")[0]);
  const token = (cookies.find(c => c.startsWith("Rsi-Token=")) || "").split("=")[1] || "";
  const hdr = { "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json", "x-rsi-token": token, Cookie: cookies.join("; ") };
  const opts = [...html.matchAll(/class="js-option option[^"]*" rel="([^"]*)"\s*>\s*([^<]*?)\s*</g)].map(m => [m[1], clean(m[2])]);
  const alls = opts.map((o, k) => o[1] === "All" ? k : -1).filter(k => k >= 0), iSer = alls[1], iTyp = alls[2];
  const series = opts.slice(iSer + 1, iTyp).filter(o => o[0]);

  async function page(body, p) {
    for (let t = 0; t < 3; t++) {
      try {
        const r = await fetch(BASE + "/api/hub/getCommlinkItems", { method: "POST", headers: hdr, body: JSON.stringify(Object.assign({ channel: "", series: "", type: "", sort: "publish_new", page: p }, body)) });
        const d = (await r.json()).data || "";
        return d.split('<a class="content-block2').slice(1).map(b => {
          const g = rx => (rx.exec(b) || [, ""])[1];
          const rel = g(/Posted: <span class="value">([^<]*)/);
          return { p: g(/href="\/comm-link\/([^"]+)"/), i: g(/url\('([^']+)'\)/), t: clean(g(/class="title[^"]*">([\s\S]*?)<\/div>/)), d: rel, e: clean(g(/<div class="body">([\s\S]*?)<\/div>/)) };
        });
      } catch (e) { await new Promise(r => setTimeout(r, 500)); }
    }
    return [];
  }
  async function crawl(body) {
    const out = [];
    for (let p = 1; p < 700; p += 8) {
      const got = await Promise.all(Array.from({ length: 8 }, (_, k) => page(body, p + k)));
      got.forEach(g => out.push(...g));
      if (got.some(g => !g.length)) break;
    }
    return out;
  }
  const all = new Map();
  const add = (list, s) => list.forEach(x => { if (!x.p) return; const o = all.get(x.p); if (o) { if (s >= 0 && o.s < 0) o.s = s; } else all.set(x.p, Object.assign(x, { s })); });
  add(await crawl({}), -1);
  for (const c of CH) { add(await crawl({ channel: c }), -1); add(await crawl({ channel: c, sort: "publish_old" }), -1); }
  for (let k = 0; k < series.length; k++) add(await crawl({ series: series[k][0] }), k);

  const today = new Date();
  const iso = d => {
    let m = /^(\d{4})-(\d\d)-(\d\d)/.exec(d);
    if (m) return +m[1] > 2010 ? m[0] : "";
    m = /^(\d+) (minute|hour|day|week|month|year)s? ago/.exec(d) || (/^(a|an) (minute|hour|day|week|month|year) ago/.exec(d) && [0, 1, RegExp.$2]);
    if (!m) return "";
    const n = +m[1], t = new Date(today), u = m[2];
    if (u === "day") t.setDate(t.getDate() - n); else if (u === "week") t.setDate(t.getDate() - 7 * n); else if (u === "month") t.setMonth(t.getMonth() - n); else if (u === "year") t.setFullYear(t.getFullYear() - n);
    return t.toISOString().slice(0, 10);
  };
  const id = x => +(/\/(\d+)-/.exec(x.p) || [, 0])[1];
  const rows = [...all.values()].sort((a, b) => id(b) - id(a)).map(x => [
    x.p, CH.indexOf(x.p.split("/")[0]), x.t, iso(x.d),
    x.i.replace(/^https:\/\/media\.robertsspaceindustries\.com/, ""), x.e.length > 150 ? x.e.slice(0, 147) + "…" : x.e, x.s]);
  const data = { built: today.toISOString().slice(0, 10), channels: ["Transmission", "Spectrum Dispatch", "Citizens", "Engineering", "Fiction"], series: series.map(s => s[1]), rows };
  fs.writeFileSync(path.join(__dirname, "..", "public", "commlinks.js"), "/* Généré par scripts/commlinks.js — liste des Comm-Links de RSI */\nwindow.COMMLINKS = " + JSON.stringify(data) + ";\n");
  console.log(rows.length + " Comm-Links, " + series.length + " séries");
}
main().catch(e => { console.error(e); process.exit(1); });
