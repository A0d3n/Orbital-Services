// Historique des versions : ajoute une entrée dans public/versions.js et met à jour package.json.
//   node scripts/version.js <major|minor|patch> "Titre" "Commentaire"
//   node scripts/version.js sync        remplit le hash des entrées qui n'en ont pas encore (depuis git log)
"use strict";
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const FILE = path.join(ROOT, "public", "versions.js");
const RX = /var VERSIONS\s*=\s*(\[[\s\S]*?\n\]);/;

function read() {
  const src = fs.readFileSync(FILE, "utf8"), m = RX.exec(src);
  if (!m) throw new Error("public/versions.js : tableau VERSIONS introuvable");
  return { src, list: JSON.parse(m[1]) };
}
function write(src, list) {
  const body = "[\n" + list.map(e => JSON.stringify(e)).join(",\n") + "\n]";
  fs.writeFileSync(FILE, src.replace(RX, () => "var VERSIONS = " + body + ";"));
}
function setPackageVersion(v) {
  for (const f of ["package.json", "package-lock.json"]) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    j.version = v;
    if (j.packages && j.packages[""]) j.packages[""].version = v;
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  }
}

/* Le nom du cache du service worker suit la version : un nouveau commit de version invalide l’ancien cache. */
function setCacheName(v) {
  const p = path.join(ROOT, "public", "sw.js");
  if (!fs.existsSync(p)) return;
  const src = fs.readFileSync(p, "utf8"), RXV = /var VERSION = "orbital-[^"]*";/;
  if (!RXV.test(src)) throw new Error("public/sw.js : constante VERSION introuvable");
  fs.writeFileSync(p, src.replace(RXV, () => 'var VERSION = "orbital-' + v + '";'));
}

const [kind, title, note] = process.argv.slice(2);
const { src, list } = read();

if (kind === "sync") {
  const log = execSync("git log --no-merges --format=%h%x09%s", { cwd: ROOT }).toString().trim().split("\n").map(l => l.split("\t"));
  let n = 0;
  for (const e of list) {
    if (e.c) continue;
    const hit = log.find(([, s]) => s.toLowerCase().startsWith(e.t.toLowerCase().slice(0, 25)) || s.toLowerCase().includes(e.t.toLowerCase()));
    if (hit) { e.c = hit[0]; n++; }
  }
  write(src, list);
  console.log(n + " hash renseigné(s)");
} else if (["major", "minor", "patch"].includes(kind) && title && note) {
  const [a, b, c] = list[0].v.split(".").map(Number);
  const v = kind === "major" ? [a + 1, 0, 0] : kind === "minor" ? [a, b + 1, 0] : [a, b, c + 1];
  const next = v.join(".");
  list.unshift({ v: next, d: new Date().toISOString().slice(0, 10), c: "", t: title, n: note });
  write(src, list); setPackageVersion(next); setCacheName(next);
  console.log("version " + next + " ajoutée");
} else {
  console.error('Usage : node scripts/version.js <major|minor|patch> "Titre" "Commentaire"   |   node scripts/version.js sync');
  process.exit(1);
}
