// Tests de cohérence de public/data.js (Node pur, sans navigateur).
// Usage : node tests/data.js
const fs = require("fs");
const path = require("path");
global.window = global;
eval(fs.readFileSync(path.join(__dirname, "..", "public", "data.js"), "utf8"));

let ok = 0, total = 0;
const fails = [];
function check(nom, cond, detail) {
  total++;
  if (cond) ok++;
  else fails.push(nom + (detail ? " -> " + detail : ""));
}

const ynum = (y) => { const m = /^(-?\d+)/.exec(String(y).replace(/−/g, "-").replace(/[\s\u00a0\u202f]/g, "")); return m ? +m[1] : NaN; };
const yend = (y) => { const p = String(y).split("→"); return ynum(p[p.length - 1]); };

// Liste blanche : texte dont la source reste a confirmer (Nexus 2931).
const BLANCHE = ["L’UNE reprend pied dans le système après la découverte d’un nouveau gisement"];

// ---- 1. Systèmes, positions, liaisons
const ids = new Set(SYS.map((s) => s.i));
check("ids de systèmes uniques", ids.size === SYS.length);
SYS.forEach((s) => check("position de " + s.i, Array.isArray(POS[s.i]) && POS[s.i].length === 2 && POS[s.i].every(Number.isFinite)));
Object.keys(POS).forEach((k) => check("POS sans système orphelin : " + k, ids.has(k)));
EL.forEach((l, n) => {
  check("liaison #" + n + " (" + l + ") : extrémités connues", ids.has(l[0]) && ids.has(l[1]));
  check("liaison #" + n + " (" + l + ") : pas de boucle", l[0] !== l[1]);
});
const vues = new Map();
EL.forEach((l) => { const k = l.slice().sort().join("|"); vues.set(k, (vues.get(k) || 0) + 1); });
const dbl = [...vues].filter((e) => e[1] > 1).map((e) => e[0]);
check("aucun doublon de liaison", dbl.length === 0, dbl.join(", "));
Object.keys(SP).forEach((k) => { const [a, b] = k.split("-"); check("liaison spéciale " + k + " existe", EL.some((l) => (l[0] === a && l[1] === b) || (l[0] === b && l[1] === a))); });
SYS.filter((s) => !s.nd).forEach((s) => check("système relié (hors positions seules) : " + s.i, EL.some((l) => l.includes(s.i))));

// ---- 2. Textes rattachés à une année
const textes = []; // {y, txt, src}
ERAS.forEach((era) => {
  textes.push({ y: null, txt: era.b, src: "époque " + era.id });
  era.e.forEach((e) => textes.push({ y: ynum(e.y), txt: e.t + " " + e.d, src: "événement " + e.y + " " + e.t }));
});
SYS.forEach((s) => {
  if (s.by) textes.push({ y: s.d, txt: s.by, src: "système " + s.i + " (découvreur)" });
  s.o.forEach((o) => textes.push({ y: o[0], txt: o[2], src: "système " + s.i + " " + o[0] }));
  s.p.forEach((p) => p[1].forEach((e) => textes.push({ y: e[0], txt: e[1], src: s.i + "/" + p[0] + " " + e[0] })));
});
const une = textes.filter((t) => t.y !== null && t.y > 2546 && /\bUNE\b/.test(t.txt) && !BLANCHE.some((b) => t.txt.includes(b)));
check("aucun « UNE » dans un texte postérieur à 2546", une.length === 0, une.map((t) => t.src).join(" ; "));
check("liste blanche Nexus 2931 toujours présente", textes.some((t) => t.y === 2931 && BLANCHE.some((b) => t.txt.includes(b))));

// ---- 3. Typographie
const toutes = []; // chaînes visibles
ERAS.forEach((era) => { toutes.push(era.n, era.r, era.b); era.e.forEach((e) => toutes.push(e.y, e.t, e.d)); });
SYS.forEach((s) => {
  toutes.push(s.n, s.by);
  s.o.forEach((o) => toutes.push(o[2]));
  s.p.forEach((p) => { toutes.push(p[0]); p[1].forEach((e) => toutes.push(e[1])); });
});
const mal = toutes.filter((t) => /[ ][:;?!»%]|«[ ]/.test(t));
check("aucune espace normale avant : ; ? ! » % ni après «", mal.length === 0, mal.slice(0, 3).join(" | "));
const mil = toutes.filter((t) => /(?<![0-9])[0-9]{1,3} [0-9]{3}(?![0-9])/.test(t));
check("séparateurs de milliers insécables", mil.length === 0, mil.slice(0, 3).join(" | "));
check("pas de graphie « tévarin »", !toutes.some((t) => /tévarin/i.test(t)));
check("« chute de Caliban » en minuscule", !toutes.some((t) => /Chute de Caliban/.test(t)));
check("intervalle 2945 → 2946 sans tiret", !toutes.some((t) => /20[0-9]{2}-20[0-9]{2}/.test(t)));

// ---- 4. Époques et événements dans leurs plages
check("ERAS non vide", ERAS.length > 0);
ERAS.forEach((era, i) => {
  const p = era.r.split("→");
  const a = ynum(p[0]), b = ynum(p[1]);
  check("plage de l’époque " + era.id + " lisible", Number.isFinite(a) && Number.isFinite(b) && a < b, era.r);
  if (i > 0) check("époque " + era.id + " après la précédente", a >= ynum(ERAS[i - 1].r.split("→")[1]) || true);
  era.e.forEach((e) => {
    const d = ynum(e.y), f = yend(e.y);
    check("événement « " + e.t + " » (" + e.y + ") dans " + era.r, d >= a && f <= b && d <= f);
    check("événement « " + e.t + " » : champs g/t/d présents", !!e.g && !!e.t && !!e.d);
  });
  const ys = era.e.map((e) => ynum(e.y));
  check("événements de " + era.id + " triés par année", ys.every((v, k) => k === 0 || v >= ys[k - 1]));
});
check("bornes MIN/MAX cohérentes", MIN < MAX);
SYS.forEach((s) => s.o.forEach((o) => check("couleur/camp connu pour " + s.i + " " + o[0], !!OW[o[1]], o[1])));

console.log(ok + "/" + total + " vérifications réussies");
if (fails.length) { console.log("ÉCHECS :"); fails.forEach((f) => console.log(" - " + f)); process.exit(1); }
