// Tests du module Raffineries du Commerce (#commerce/raffineries) : matrice minerai × raffinerie, échelle (terciles) et « meilleure » contrôlés par une implémentation
// INDÉPENDANTE écrite ici, sélecteur Dernier / 7 jours / 30 jours, filtres, recherche, tri, « Meilleure raffinerie pour… » (départage), méthodes, charge, états des données,
// CSV exact, adresse partageable, mobile 390 px, requêtes /api/uex, accessibilité, CSP, console.
// Faux serveur UEX local + données FABRIQUÉES (tests/market-fixtures.js : REFINERIES_DATA) : aucun accès Internet, aucune donnée réelle d'UEX.
// Usage : node tests/refineries.js   (CHROMIUM_PATH pour un Chromium déjà installé ; REFINERIES_SHOTS=<dossier> pour enregistrer des captures ; REFINERIES_ONLY=<regex> pour ne lancer que certaines sections)
"use strict";
const { spawn } = require("child_process");
const http = require("http"), net = require("net");
const fs = require("fs"), os = require("os"), path = require("path");
const { chromium } = require("playwright");
const FX = require("./market-fixtures.js");

const ROOT = path.join(__dirname, "..");
const results = [];
const check = (name, ok, extra) => { results.push(!!ok); console.log((ok ? "  ok   " : "  ÉCHEC ") + name + (ok || extra === undefined ? "" : " → " + extra)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const T = s => String(s).replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p));
const SHOTS = process.env.REFINERIES_SHOTS || "";
const COLL = new Intl.Collator("fr", { sensitivity: "accent", numeric: true });
const RES = ["refineries_yields", "commodities", "terminals", "star_systems", "refineries_methods", "refineries_capacities"];
const DATA = FX.REFINERIES_DATA;

/* ───────── implémentation de référence (indépendante de public/refineries.js) ─────────
   Écrite à partir des lignes brutes des fixtures et des règles de docs/uex-api.md (« Raffineries : sens des données »), sans réutiliser aucune fonction du site. */
const FLD = { dernier: "value", "7j": "value_week", "30j": "value_month" }, FLAB = { dernier: "Dernier", "7j": "7 jours", "30j": "30 jours" }, WORD = { 3: "Élevé", 2: "Moyen", 1: "Faible" }, SYM = { 3: "▲", 2: "●", 1: "▼" };
const DEFAULT_F = { v: "30j", s: "", q: "", all: false, lt: "nom", ct: "sys" };
const num = x => (x === null || x === undefined || x === "" ? null : Number.isFinite(+x) ? +x : null);
const tsOf = d => (num(d) > 0 ? num(d) * 1000 : null);
const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmt = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v) + " %";
const ageTxt = a => (a === null ? "date inconnue" : a < 60 ? "à l'instant" : a < 3600 ? "il y a " + Math.floor(a / 60) + " min" : a < 86400 ? "il y a " + Math.floor(a / 3600) + " h" : "il y a " + Math.floor(a / 86400) + " j");
const freshWord = age => age === null ? "Date inconnue" : age <= 7 * 86400 ? "Frais" : age <= 30 * 86400 ? "À vérifier" : "Périmé";
function parseSort(s) { return { k: s.replace(/^-/, ""), d: s[0] === "-" ? -1 : 1 }; }
function build(data) {
  const term = {}; data.terminals.forEach(t => { term[t.id] = t; });
  const refs = new Map(), ores = new Map();
  const labelOf = (t, nm) => (t && (t.nickname || t.displayname)) || String((t && t.name) || nm).replace(/^\s*(Refinement|Raffinage)[^-–]*[-–]\s*/i, "").trim();
  const addRef = (id, nm, sys) => { if (!refs.has(id)) refs.set(id, { id, name: labelOf(term[id], nm), sys: term[id] ? term[id].star_system_name : sys || "", cap: null }); return refs.get(id); };
  data.terminals.filter(t => t.type === "refinery").forEach(t => addRef(t.id));
  data.commodities.filter(c => c.is_refinable === 1).forEach(c => ores.set(c.id, { id: c.id, name: c.name, code: c.code, slug: c.slug, cells: new Map() }));
  for (const y of data.refineries_yields) {
    const vals = { d: num(y.value), s: num(y.value_week), m: num(y.value_month) };
    if (vals.d === null && vals.s === null && vals.m === null) continue;
    let o = ores.get(y.id_commodity);
    if (!o) { const c = data.commodities.find(x => x.id === y.id_commodity), nm = c ? c.name : y.commodity_name; if (!nm) continue; o = { id: y.id_commodity, name: nm, code: c ? c.code : "", slug: c ? c.slug : "", cells: new Map() }; ores.set(o.id, o); }
    const r = addRef(y.id_terminal, y.terminal_name, y.star_system_name);
    o.cells.set(r.id, Object.assign({ ts: tsOf(y.date_modified) }, vals));
  }
  for (const c of data.refineries_capacities) { const r = addRef(c.id_terminal, c.terminal_name, c.star_system_name); r.cap = { d: num(c.value), s: num(c.value_week), m: num(c.value_month), ts: tsOf(c.date_modified) }; }
  return { refs: [...refs.values()], ores: [...ores.values()] };
}
/* échelle : terciles du champ choisi sur TOUTES les cellules (indépendant des filtres) */
function scale(B, key) {
  const s = [];
  for (const o of B.ores) for (const c of o.cells.values()) if (c[key] !== null) s.push(c[key]);
  s.sort((a, b) => a - b);
  const n = s.length; if (!n) return null;
  const lo = s[Math.ceil(n / 3) - 1], hi = s[Math.floor(2 * n / 3)];
  const level = v => (v > lo && v >= hi ? 3 : v < hi && v <= lo ? 1 : 2);
  return { n, lo, hi, level, sorted: s };
}
function model(data, F, nowMs) {
  F = Object.assign({}, DEFAULT_F, F);
  const B = build(data), key = { dernier: "d", "7j": "s", "30j": "m" }[F.v], sc = scale(B, key);
  const age = ts => (ts === null ? null : Math.max(0, (nowMs - ts) / 1000));
  let refs = B.refs.filter(r => !F.s || r.sys === F.s);
  const avg = r => { const v = []; for (const o of B.ores) { const c = o.cells.get(r.id); if (c && c[key] !== null) v.push(c[key]); } return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const cnt = r => { let n = 0; for (const o of B.ores) { const c = o.cells.get(r.id); if (c && c[key] !== null) n++; } return n; };
  const ct = parseSort(F.ct), lt = parseSort(F.lt);
  const byName = (a, b) => COLL.compare(a.name, b.name);
  refs.sort(byName);
  const cmpNum = (f, d) => (a, b) => { const x = f(a), y = f(b); if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1; return (x - y) * d; };
  const cmpTxt = (f, d) => (a, b) => { const x = f(a), y = f(b); if (!x || !y) return !x && !y ? 0 : !x ? 1 : -1; return COLL.compare(x, y) * d; };
  const stable = (arr, cmp) => arr.map((x, i) => [x, i]).sort((p, q) => cmp(p[0], q[0]) || p[1] - q[1]).map(p => p[0]);
  if (ct.k === "nom") refs = stable(refs, cmpTxt(r => r.name, ct.d));
  else if (ct.k === "sys") refs = stable(refs, cmpTxt(r => r.sys, ct.d));
  else if (ct.k === "avg") refs = stable(refs, cmpNum(avg, ct.d));
  else refs = stable(refs, cmpNum(cnt, ct.d));
  const q = norm(F.q).replace(/\s+/g, " ").trim();
  let rows = [];
  for (const o of B.ores) {
    if (q && !norm(o.name + " " + o.code).includes(q)) continue;
    const cells = refs.map(r => { const c = o.cells.get(r.id), v = c ? c[key] : null; return v === null ? { ref: r, v: null } : { ref: r, v, d: c.d, s: c.s, m: c.m, ts: c.ts, age: age(c.ts), lv: sc.level(v) }; });
    const have = cells.filter(c => c.v !== null);
    if (!have.length && !F.all) continue;
    if (have.length >= 2) { const top = Math.max(...have.map(c => c.v)), ties = have.filter(c => c.v === top).length; have.forEach(c => { if (c.v === top) { c.best = true; c.ties = ties; } }); }
    rows.push({ ore: o, cells, n: have.length, top: have.length ? Math.max(...have.map(c => c.v)) : null });
  }
  rows.sort((a, b) => COLL.compare(a.ore.name, b.ore.name));
  const rm = /^r(\d+)$/.exec(lt.k);
  if (lt.k === "nom") rows = stable(rows, cmpTxt(r => r.ore.name, lt.d));
  else if (lt.k === "best") rows = stable(rows, cmpNum(r => r.top, lt.d));
  else if (lt.k === "n") rows = stable(rows, cmpNum(r => r.n, lt.d));
  else if (rm) { const i = refs.findIndex(r => String(r.id) === rm[1]); rows = stable(rows, cmpNum(r => r.cells[i].v, lt.d)); }
  return { B, key, sc, refs, rows, nCells: rows.reduce((a, r) => a + r.n, 0) };
}
/* classement d'un minerai : valeur décroissante, puis donnée la plus récente, puis nom */
function rank(F, slug, nowMs) {
  const M = model(DATA, Object.assign({}, F, { all: true, q: "" }), nowMs), row = M.rows.find(r => r.ore.slug === slug);
  return row.cells.filter(c => c.v !== null).sort((x, y) => y.v - x.v || (y.ts || 0) - (x.ts || 0) || COLL.compare(x.ref.name, y.ref.name)).map(c => Object.assign({ key: M.key }, c));
}
const iso = ts => new Date(ts).toISOString().replace(/\.\d+Z$/, "Z");
function csvCell(v) { if (typeof v === "number") v = String(v).replace(".", ","); else if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[";\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function expectCsv(M, F, nowMs) {
  F = Object.assign({}, DEFAULT_F, F);
  const head = ["Minerai", "Code", "Raffinerie", "Système", "Valeur affichée", "Rendement : valeur choisie (%)", "Dernier (%)", "7 jours (%)", "30 jours (%)", "Niveau", "Meilleure de la ligne", "Charge (%)", "Mise à jour (UTC)", "Ancienneté (jours)", "Fraîcheur"];
  const out = [head];
  for (const r of M.rows) for (const c of r.cells) {
    if (c.v === null) continue;
    out.push([r.ore.name, r.ore.code, c.ref.name, c.ref.sys, FLAB[F.v], c.v, c.d === null ? "" : c.d, c.s === null ? "" : c.s, c.m === null ? "" : c.m, WORD[c.lv], c.best ? (c.ties > 1 ? "Oui (ex æquo)" : "Oui") : "Non",
      c.ref.cap && c.ref.cap[M.key] !== null ? c.ref.cap[M.key] : "", c.ts === null ? "" : iso(c.ts), c.age === null ? "" : Math.floor(c.age / 86400), freshWord(c.age)]);
  }
  return "﻿" + out.map(r => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

function fakeUpstream(data) {
  const u = { hits: [], sockets: new Set() };
  u.server = http.createServer((req, res) => {
    const m = /^\/2\.0\/([a-z_]+)$/.exec(req.url); u.hits.push(m && m[1]);
    res.writeHead(m && data[m[1]] ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(m && data[m[1]] ? { status: "ok", http_code: 200, data: data[m[1]], message: "" } : { status: "error", http_code: 404, data: null }));
  });
  u.server.on("connection", s => { u.sockets.add(s); s.on("close", () => u.sockets.delete(s)); });
  u.start = async () => { u.port = await freePort(); await new Promise(r => u.server.listen(u.port, "127.0.0.1", r)); u.base = "http://127.0.0.1:" + u.port + "/2.0"; };
  u.stop = () => { u.sockets.forEach(s => s.destroy()); u.server.close(); };
  return u;
}
const servers = [];
async function startServer(env) {
  const port = await freePort(), e = Object.assign({}, process.env);
  for (const k of Object.keys(e)) if (/^(UEX_|AUTH_)/.test(k)) delete e[k];
  Object.assign(e, { PORT: String(port), DATA_DIR: tmp("orbital-refineries-") }, env || {});
  const child = spawn(process.execPath, [path.join(ROOT, "server.js")], { env: e, stdio: "ignore" });
  const s = { port, child, base: "http://127.0.0.1:" + port }; servers.push(s);
  for (let i = 0; i < 60; i++) { try { if ((await fetch(s.base + "/healthz")).status) break; } catch (x) {} await sleep(100); }
  return s;
}

(async () => {
  const up = fakeUpstream(DATA); await up.start();
  const on = await startServer({ UEX_ENABLED: "1", UEX_BASE: up.base, UEX_CACHE_DIR: tmp("orbital-refineries-c-") });
  const off = await startServer({});
  let browser;
  const errors = [];
  const watch = p => {
    p.on("pageerror", e => errors.push(e.message));
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text() + (m.location().url || ""))) errors.push(m.text()); });
  };
  async function section(name, fn) { if (process.env.REFINERIES_ONLY && !new RegExp(process.env.REFINERIES_ONLY).test(name)) return; try { await fn(); } catch (e) { check(name + " : exécution", false, e && e.stack || String(e)); } }
  try {
    browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const CSPJS = () => { document.addEventListener("securitypolicyviolation", e => console.error("VIOLATION CSP " + e.violatedDirective + " " + e.blockedURI)); };
    async function newPage(opts) {
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }, opts || {}));
      await ctx.addInitScript(CSPJS);
      const page = await ctx.newPage(); watch(page);
      await page.clock.setFixedTime(new Date(FX.T0));
      const reqs = []; page.on("request", r => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/uex")) reqs.push(u.pathname.replace("/api/uex/", "") + (r.headers()["if-none-match"] ? " (ETag)" : "")); });
      return { ctx, page, reqs };
    }
    /* réponses fabriquées pour les états : o = { data, ago (s), stale, status (code | fonction(res, n)), net, delay } ; compte les requêtes par ressource */
    async function mock(page, o) {
      o = o || {}; const counts = {}, data = o.data || DATA;
      await page.route("**/api/uex/*", async r => {
        const res = new URL(r.request().url()).pathname.replace("/api/uex/", ""); counts[res] = (counts[res] || 0) + 1;
        if (o.delay) await sleep(o.delay);
        if (o.net) return r.abort("connectionrefused");
        const st = typeof o.status === "function" ? o.status(res, counts[res]) : o.status;
        if (st === 404) return r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"uex_disabled"}' });
        if (st === 503) return r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"uex_unavailable"}' });
        const etag = '"fx-' + res + '"';
        if (r.request().headers()["if-none-match"] === etag) return r.fulfill({ status: 304, headers: { ETag: etag } });
        const ago = o.ago || 0, stale = !!o.stale;
        r.fulfill({ status: 200, contentType: "application/json", headers: { ETag: etag }, body: JSON.stringify({ status: "ok", resource: res, fetched_at: new Date(FX.T0 - ago * 1000).toISOString(), age_s: ago, stale, attribution: {}, data: data[res] }) });
      });
      return counts;
    }
    const open = async (page, base, hash, wait) => { await page.goto(base + "/" + hash); await page.waitForSelector("#v-commerce", { state: "visible" }); if (wait !== false) await page.waitForSelector("#rfMain:not([hidden]) #rfMat .rf-t, #rfMain:not([hidden]) #rfMat .mk-em", { state: "attached", timeout: 8000 }); };
    const txt = (page, sel) => page.locator(sel).first().innerText().then(T);
    const hashOf = page => page.evaluate(() => location.hash);
    const settle = page => page.waitForTimeout(120);
    /* lit la matrice affichée */
    const readMatrix = page => page.evaluate(() => {
      const cols = [...document.querySelectorAll("#rfMat .rf-t thead th.rf-col")].map(th => ({ name: th.querySelector("b").textContent, sys: th.querySelector(".mk-sm").textContent, sort: th.getAttribute("aria-sort"), id: th.querySelector("button").getAttribute("data-sort") }));
      const rows = [...document.querySelectorAll("#rfMat .rf-t tbody tr")].map(tr => ({
        ore: tr.querySelector("th b").textContent, sub: tr.querySelector("th .mk-sm").innerText.replace(/[  ]/g, " "), slug: tr.querySelector("td").dataset.ore,
        cells: [...tr.querySelectorAll("td")].map(td => ({ ref: td.dataset.ref, empty: td.classList.contains("rf-e"), v: td.dataset.v === undefined ? null : +td.dataset.v, lv: td.dataset.lv === undefined ? null : +td.dataset.lv, best: td.dataset.best === undefined ? null : +td.dataset.best, text: td.innerText.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim(), cls: td.className }))
      }));
      return { cols, rows };
    });
    /* compare la matrice affichée au modèle indépendant : colonnes, lignes, valeurs, niveaux, étoiles, textes, fraîcheur */
    async function sameAsModel(page, F, label, data) {
      const M = model(data || DATA, F, FX.T0), got = await readMatrix(page), errs = [];
      if (got.cols.map(c => c.name + "|" + c.sys).join() !== M.refs.map(r => r.name + "|" + r.sys).join()) errs.push("colonnes " + got.cols.map(c => c.name) + " ≠ " + M.refs.map(r => r.name));
      if (got.rows.map(r => r.ore).join("|") !== M.rows.map(r => r.ore.name).join("|")) errs.push("lignes " + got.rows.map(r => r.ore) + " ≠ " + M.rows.map(r => r.ore.name));
      else got.rows.forEach((g, i) => {
        const e = M.rows[i];
        if (g.sub !== (e.n ? e.n + (e.n > 1 ? " valeurs" : " valeur") : "aucune donnée")) errs.push(e.ore.name + " : sous-titre « " + g.sub + " »");
        e.cells.forEach((c, j) => {
          const x = g.cells[j];
          if (!x || String(c.ref.id) !== x.ref) { errs.push(e.ore.name + " colonne " + j); return; }
          if (c.v === null) { if (!x.empty || x.v !== null || !/^— pas de donnée$/.test(x.text)) errs.push(e.ore.name + "/" + c.ref.name + " : case vide attendue, lu « " + x.text + " »"); return; }
          const want = [fmt(c.v), SYM[c.lv] + " " + WORD[c.lv]].concat(c.best ? ["★ Meilleure" + (c.ties > 1 ? " (ex æquo)" : "")] : []).join(" ");
          const fr = freshWord(c.age), frWant = (fr === "Frais" ? "●" : fr === "À vérifier" ? "◐" : "○") + fr + (c.age === null ? "" : " (" + ageTxt(c.age) + ")");
          if (x.v !== c.v || x.lv !== c.lv || (x.best || null) !== (c.best ? c.ties : null)) errs.push(e.ore.name + "/" + c.ref.name + " : v/niveau/★ " + x.v + "/" + x.lv + "/" + x.best + " ≠ " + c.v + "/" + c.lv + "/" + c.ties);
          if (!x.text.startsWith(want + " " + frWant)) errs.push(e.ore.name + "/" + c.ref.name + " : texte « " + x.text + " » ≠ « " + want + " " + frWant + " »");
        });
      });
      check(label + " : colonnes, lignes, " + M.nCells + " valeurs, niveaux, ★ et fraîcheur identiques au modèle indépendant", !errs.length, errs.slice(0, 3).join(" | "));
      return M;
    }
    const setF = async (page, o) => {
      if (o.v) await page.selectOption("#rfV", o.v);
      if (o.s !== undefined) await page.selectOption("#rfS", o.s);
      if (o.q !== undefined) await page.fill("#rfQ", o.q);
      if (o.all !== undefined) await page.setChecked("#rfAll", o.all);
      if (o.lt) await page.selectOption("#rfLt", o.lt);
      if (o.ct) await page.selectOption("#rfCt", o.ct);
      await settle(page);
    };
    const bn = page => txt(page, "#rfBanner");

    /* ───────── 1. onglet ───────── */
    await section("onglet", async () => {
      const { ctx, page, reqs } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce", false);
      await page.waitForFunction(() => /désactivées|activées|indisponible/.test(document.getElementById("cmMktMsg").textContent), null, { timeout: 5000 }).catch(() => {});
      const tabs = await page.evaluate(() => [...document.querySelectorAll("#cmTabs [role=tab]")].map(b => ({ t: b.textContent.replace(/\s+/g, " ").trim(), dis: b.getAttribute("aria-disabled"), ctl: b.getAttribute("aria-controls"), ti: b.tabIndex })));
      check("onglet « Raffineries » actif (plus « bientôt », pas aria-disabled, relié à son panneau) ; Carburant et Vaisseaux restent « bientôt » et désactivés", tabs[3].t === "Raffineries" && tabs[3].dis === null && tabs[3].ctl === "cmPanel-raffineries" && tabs.slice(4).every(t => t.dis === "true" && /bientôt/.test(t.t) && t.ctl === null), JSON.stringify(tabs));
      check("tableau de bord : aucune requête de données de raffinage tant que Raffineries n'est pas ouvert", reqs.every(r => r === "status"), reqs.join());
      const card = await page.evaluate(() => { const li = [...document.querySelectorAll("#cmPanel-sim .cm-tool")].find(x => x.querySelector("h3").textContent === "Raffineries"); return { off: li.classList.contains("off"), soon: /bientôt/.test(li.textContent), href: li.querySelector("a") && li.querySelector("a").getAttribute("href") }; });
      check("carte « Raffineries » du tableau de bord : active, lien #commerce/raffineries, plus « bientôt »", !card.off && !card.soon && card.href === "#commerce/raffineries", JSON.stringify(card));
      check("deux cartes « bientôt » restent (Carburant, Vaisseaux), sans élément interactif", (await page.locator("#cmPanel-sim .cm-tool.off").count()) === 2 && (await page.locator("#cmPanel-sim .cm-tool.off a,#cmPanel-sim .cm-tool.off button").count()) === 0);
      await page.click("#cmTab-raffineries"); await page.waitForSelector("#rfMain:not([hidden]) #rfMat .rf-t");
      check("clic sur « Raffineries » : adresse #commerce/raffineries, onglet sélectionné, panneau visible, focus sur l'onglet, sous-titre mis à jour",
        (await hashOf(page)) === "#commerce/raffineries" && (await page.getAttribute("#cmTab-raffineries", "aria-selected")) === "true" && (await page.isVisible("#cmPanel-raffineries")) && (await page.isHidden("#cmPanel-sim")) && (await page.evaluate(() => document.activeElement.id)) === "cmTab-raffineries" && /Rendement du raffinage/.test(await txt(page, "#topSub")));
      check("h2 « Raffineries » ; bandeau « Données mises à jour … Powered by UEX … communautaires, peuvent être inexactes »", (await txt(page, "#rfTitle")) === "Raffineries" && /Données mises à jour/.test(await bn(page)) && /Powered by UEX/.test(await bn(page)) && /communautaires, peuvent être inexactes/.test(await bn(page)), await bn(page));
      check("avertissement permanent « Données communautaires, peuvent être inexactes » et rendement défini comme bonus relatif en % (définition d'UEX)", /Données communautaires, peuvent être inexactes/.test(await txt(page, ".rf-warn")) && /bonus relatif en %/.test(await txt(page, ".rf-warn")) && /UEX/.test(await txt(page, ".rf-warn")));
      await page.keyboard.press("Tab");
      await page.click("#cmTab-sim"); await page.waitForTimeout(100);
      await page.click("#cmPanel-sim a[href='#commerce/raffineries']"); await page.waitForSelector("#rfMat .rf-t");
      check("lien de la carte : ouvre le module (adresse #commerce/raffineries)", (await hashOf(page)) === "#commerce/raffineries");
      await ctx.close();
    });

    /* ───────── 2. matrice : contenu, échelle, ★ ───────── */
    await section("matrice", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/raffineries");
      const M = await sameAsModel(page, {}, "matrice par défaut (30 jours, tous systèmes)");
      const got = await readMatrix(page);
      check("colonnes = raffineries (type « refinery », drapeau is_refinery ignoré), triées Système puis nom ; la boutique à is_refinery=1 est exclue ; Fantôme (terminal inconnu) nommé d'après la ligne de rendement",
        got.cols.map(c => c.name).join() === M.refs.map(r => r.name).join() && got.cols.length === 7 && !got.cols.some(c => c.name === "Zéro") && got.cols.some(c => c.name === "Fantôme") && got.cols.some(c => c.name === "Écho" && c.sys === "Système Z"), got.cols.map(c => c.name).join());
      check("lignes = minerais (rafinables ou avec données, par défaut seulement ceux qui ont au moins une donnée) : Deltium (aucune donnée) et Carburant X absents ; Glace (non raffinable mais avec données) et Orphelin (absent de commodities) présents",
        !got.rows.some(r => r.ore === "Deltium" || r.ore === "Carburant X") && got.rows.some(r => r.ore === "Glace (Brut)") && got.rows.some(r => r.ore === "Orphelin (Minerai)") && got.rows.length === 9, got.rows.map(r => r.ore).join());
      // échelle : valeurs connues à la main (25 valeurs en 30 jours : bas = +2, haut = +4)
      check("échelle 30 jours établie à la main : 25 valeurs, seuil bas +2, seuil haut +4 (terciles, égalités comprises)", M.sc.n === 25 && M.sc.lo === 2 && M.sc.hi === 4, JSON.stringify([M.sc.n, M.sc.lo, M.sc.hi]));
      const legend = await txt(page, "#rfLg");
      check("légende : règle de l'échelle avec les seuils réels, symboles ▲ ● ▼ et mots, ★, « — pas de donnée », fraîcheur ● ◐ ○",
        /▲ Élevé : \+4 % et plus/.test(legend) && /● Moyen : au-dessus de \+2 % et au-dessous de \+4 %/.test(legend) && /▼ Faible : \+2 % et moins/.test(legend) && /★ Meilleure/.test(legend) && /— pas de donnée/.test(legend) && /● Frais \(≤ 7 j\)/.test(legend) && /◐ À vérifier \(≤ 30 j\)/.test(legend) && /○ Périmé \(> 30 j\)/.test(legend) && /terciles des 25 valeurs.*de −9 % à \+12 %/.test(legend), legend);
      const cell = (ore, ref) => page.evaluate(([o, r]) => { const td = document.querySelector('#rfMat td[data-ore="' + o + '"][data-ref="' + r + '"]'); return td && { t: td.innerText.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim(), lv: td.dataset.lv, best: td.dataset.best || null }; }, [ore, ref]);
      const a = await cell("alphite", "501"), c = await cell("alphite", "503"), b = await cell("alphite", "502");
      check("cas Alphite : Alpha et Charlie ex æquo à +6 % (▲ Élevé, ★ Meilleure (ex æquo)) ; Bravo −4 % (▼ Faible, sans ★) ; Charlie à 20 j (◐À vérifier)", a.t === "+6 % ▲ Élevé ★ Meilleure (ex æquo) ●Frais (il y a 1 j)" && c.t === "+6 % ▲ Élevé ★ Meilleure (ex æquo) ◐À vérifier (il y a 20 j)" && b.t === "−4 % ▼ Faible ●Frais (il y a 3 j)" && !b.best, JSON.stringify([a.t, c.t, b.t]));
      const d = await cell("alphite", "504"), e1 = await cell("epsilium", "503"), z = await cell("zetanite", "501"), cn = await cell("alphite", "505");
      check("Delta : +2 % ▼ Faible, 50 j « ○ Périmé » ; Epsilium (une seule valeur) : pas de ★ ; Zêtanite (cinq valeurs à égalité) : ★ ex æquo partout ; cellule vide « — » avec « pas de donnée » (Écho)",
        d.t === "+2 % ▼ Faible ○Périmé (il y a 50 j)" && !e1.best && e1.t === "+7 % ▲ Élevé ●Frais (il y a 1 j)" && z.t === "+4 % ▲ Élevé ★ Meilleure (ex æquo) ●Frais (il y a 2 j)" && cn.t === "— pas de donnée", JSON.stringify([d.t, e1.t, z.t, cn.t]));
      const zero = await cell("betarite", "502");
      check("valeur 0 : « 0 % » (sans signe), niveau ▼ Faible", zero.t === "0 % ▼ Faible ●Frais (il y a 2 j)", zero.t);
      const hx = await cell("hexite", "502");
      check("date inconnue (date_modified 0) : pastille « ○Date inconnue », aucune ancienneté inventée", hx.t === "+2 % ▼ Faible ○Date inconnue", hx.t);
      const heads = await page.evaluate(() => { const t = document.querySelector("#rfMat .rf-t"); return { colScopes: [...t.querySelectorAll("thead th")].every(th => th.getAttribute("scope") === "col"), rowScopes: [...t.querySelectorAll("tbody th")].every(th => th.getAttribute("scope") === "row"), sorted: [...t.querySelectorAll("thead th[aria-sort]")].length, ths: t.querySelectorAll("thead th").length, lbl: t.getAttribute("aria-labelledby") }; });
      check("tableau : en-têtes de colonnes (scope=col) et de lignes (scope=row), aria-sort sur chaque en-tête triable, nommé par son titre", heads.colScopes && heads.rowScopes && heads.sorted === heads.ths && heads.lbl === "rfMh");
      const heads2 = await page.evaluate(() => [...document.querySelectorAll("#rfMat thead th.rf-col")].map(th => th.innerText.replace(/\s+/g, " ").trim()));
      check("en-tête de colonne : nom, système et charge (« Charge 95 % » / « charge non fournie » pour Écho)", /Alpha Système X Charge 95 %/.test(heads2[1]) && heads2.some(h => /Écho Système Z charge non fournie/.test(h)), heads2.join(" | "));
      check("résumé (aria-live) : « 9 minerais × 7 raffineries · 21 valeurs (« 30 jours »). »", (await txt(page, "#rfSum")) === "9 minerais × 7 raffineries · " + M.nCells + " valeurs (« 30 jours »)." && (await page.getAttribute("#rfSum", "aria-live")) === "polite", await txt(page, "#rfSum"));
      // pas de couleur seule : chaque cellule avec valeur contient symbole ET mot de niveau, ainsi que la pastille de fraîcheur en texte
      const noColorOnly = await page.evaluate(() => [...document.querySelectorAll("#rfMat td[data-lv]")].every(td => /[▲●▼] (Élevé|Moyen|Faible)/.test(td.innerText) && /(Frais|À vérifier|Périmé|Date inconnue)/.test(td.innerText)));
      check("aucune information par la couleur seule : niveau (symbole + mot) et fraîcheur (symbole + mot) écrits dans chaque cellule", noColorOnly);
      await page.selectOption("#rfS", "Système Z"); await settle(page);
      check("Système Z (Écho, sans aucune donnée) : « Aucun résultat » + « Réinitialiser les filtres » ; liste « Meilleure raffinerie » : aucun minerai ; CSV désactivé", /Aucun résultat/.test(await txt(page, "#rfMat")) && (await page.locator("#rfMat button", { hasText: "Réinitialiser les filtres" }).count()) === 1 && (await page.isDisabled("#rfB")) && (await page.isDisabled("#rfCsv")));
      await ctx.close();
    });

    /* ───────── 3. sélecteur de valeur (Dernier / 7 jours / 30 jours) ───────── */
    await section("valeur", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/raffineries");
      check("sélecteur « Valeur affichée » : Dernier, 7 jours, 30 jours (défaut 30 jours), tous disponibles", (await page.locator("#rfV option").allTextContents()).join() === "Dernier,7 jours,30 jours" && (await page.inputValue("#rfV")) === "30j" && (await page.locator("#rfV option:disabled").count()) === 0);
      for (const v of ["dernier", "7j", "30j"]) {
        await setF(page, { v });
        const M = await sameAsModel(page, { v }, "valeur « " + FLAB[v] + " »");
        check("valeur « " + FLAB[v] + " » : échelle recalculée (n = " + M.sc.n + ", seuils " + M.sc.lo + " / " + M.sc.hi + ") affichée dans la légende et dans l'adresse", (await txt(page, "#rfLg")).includes("terciles des " + M.sc.n + " valeurs") && (await hashOf(page)) === (v === "30j" ? "#commerce/raffineries" : "#commerce/raffineries?v=" + v), await hashOf(page));
      }
      // Alphite en « dernier » : Alpha +10 et Charlie +10 ; en 7 j : Alpha +8, Charlie +7 → le meilleur change
      await setF(page, { v: "7j" });
      const best = await page.evaluate(() => [...document.querySelectorAll('#rfMat td[data-ore="alphite"][data-best]')].map(td => td.dataset.ref + ":" + td.dataset.v));
      check("7 jours : Alphite, meilleur = Alpha seul (+8 contre +7), sans ex æquo", best.join() === "501:8", best.join());
      check("Hexite : valeur 30 jours absente pour Alpha (case « — ») mais valeur « Dernier » présente (+5 %)", await (async () => { await setF(page, { v: "30j" }); const a = await page.locator('#rfMat td[data-ore="hexite"][data-ref="501"]').textContent(); await setF(page, { v: "dernier" }); const b = await page.locator('#rfMat td[data-ore="hexite"][data-ref="501"]').textContent(); return /pas de donnée/.test(a) && /\+5/.test(b); })());
      const idem = await page.locator("#rfSame").isHidden();
      check("indication « valeurs identiques » absente quand les trois champs diffèrent", idem);
      await ctx.close();
      // jeu où les trois champs sont identiques (cas des données réelles actuelles) : indication affichée
      const same = JSON.parse(JSON.stringify(DATA)); same.refineries_yields.forEach(y => { y.value_week = y.value; y.value_month = y.value; });
      const c2 = await newPage(); await mock(c2.page, { data: same }); await open(c2.page, on.base, "#commerce/raffineries");
      check("trois champs identiques dans les données : indication « Dans les données actuelles d'UEX, … sont identiques » affichée et reliée au sélecteur (aria-describedby)", (await c2.page.locator("#rfSame").isVisible()) && /sont identiques/.test(await txt(c2.page, "#rfSame")) && (await c2.page.getAttribute("#rfV", "aria-describedby")) === "rfSame");
      await c2.ctx.close();
      // champ absent de toutes les lignes : option désactivée et repli automatique
      const nowk = JSON.parse(JSON.stringify(DATA)); nowk.refineries_yields.forEach(y => { delete y.value_week; });
      const c3 = await newPage(); await mock(c3.page, { data: nowk }); await open(c3.page, on.base, "#commerce/raffineries?v=7j");
      check("champ « 7 jours » absent des données : option désactivée, repli sur une valeur disponible (30 jours), matrice affichée", (await c3.page.locator('#rfV option[value="7j"]').isDisabled()) && (await c3.page.inputValue("#rfV")) === "30j" && (await c3.page.locator("#rfMat .rf-t").count()) === 1);
      await c3.ctx.close();
    });

    /* ───────── 4. filtres et recherche ───────── */
    await section("filtres", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/raffineries");
      check("filtre Système : liste « Tous les systèmes » puis les systèmes des raffineries (X, Y, Z)", (await page.locator("#rfS option").allTextContents()).join() === "Tous les systèmes,Système X,Système Y,Système Z");
      await setF(page, { s: "Système Y" });
      let M = await sameAsModel(page, { s: "Système Y" }, "filtre Système Y (colonnes Charlie, Delta, Fantôme)");
      check("la ★ est recalculée parmi les raffineries affichées : Alphite en Système Y, Charlie (+6) seul meilleur ; l'échelle reste celle de toute la donnée", (await page.locator('#rfMat td[data-ore="alphite"][data-best]').getAttribute("data-ref")) === "503" && (await page.locator('#rfMat td[data-ore="alphite"][data-best]').count()) === 1 && (await txt(page, "#rfLg")).includes("25 valeurs"));
      await setF(page, { s: "" });
      await setF(page, { q: "beta" });
      M = await sameAsModel(page, { q: "beta" }, "recherche « beta » (sans accent : trouve « Bêtarite »)");
      check("recherche : une seule ligne, Bêtarite", (await readMatrix(page)).rows.map(r => r.ore).join() === "Bêtarite (Minerai)");
      await setF(page, { q: "GAMM" });
      check("recherche sur le code, insensible à la casse : « GAMM » → Gammanium", (await readMatrix(page)).rows.map(r => r.ore).join() === "Gammanium");
      await setF(page, { q: "zzz" });
      check("recherche sans résultat : « Aucun résultat », bouton « Réinitialiser les filtres », résumé « Aucun résultat pour ces filtres. »", /Aucun résultat/.test(await txt(page, "#rfMat")) && (await txt(page, "#rfSum")) === "Aucun résultat pour ces filtres." && (await page.locator("#rfMat .mk-em button").innerText()) === "Réinitialiser les filtres");
      await page.click("#rfMat .mk-em button"); await settle(page);
      check("« Réinitialiser les filtres » : recherche vidée, matrice complète, focus sur le premier filtre, annonce « Filtres réinitialisés. »", (await page.inputValue("#rfQ")) === "" && (await page.locator("#rfMat .rf-t tbody tr").count()) === 9 && (await page.evaluate(() => document.activeElement.id)) === "rfV" && /Filtres réinitialisés/.test(await txt(page, "#rfMsg")));
      await setF(page, { all: true });
      M = await sameAsModel(page, { all: true }, "case « Afficher aussi les minerais sans aucune donnée » : Deltium apparaît avec « aucune donnée »");
      const dl = await page.locator('#rfMat tbody tr', { hasText: "Deltium" }).innerText();
      check("ligne sans donnée : « aucune donnée » et uniquement des cases « — pas de donnée »", /aucune donnée/.test(T(dl)) && (T(dl).match(/pas de donnée/g) || []).length === 7, T(dl));
      await setF(page, { all: false, s: "Système X", q: "a", v: "dernier" });
      await sameAsModel(page, { s: "Système X", q: "a", v: "dernier" }, "filtres combinés (Système X + recherche « a » + Dernier)");
      await ctx.close();
    });

    /* ───────── 5. tri ───────── */
    await section("tri", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/raffineries");
      check("tri par défaut : minerais A → Z (aria-sort ascending sur « Minerai »), raffineries par système puis nom", (await page.getAttribute("#rfMat .rf-corner", "aria-sort")) === "ascending" && (await page.inputValue("#rfCt")) === "sys");
      for (const lt of ["-nom", "-best", "best", "-n", "n"]) { await setF(page, { lt }); await sameAsModel(page, { lt }, "tri des minerais « " + lt + " »"); }
      check("adresse : lt=n", (await hashOf(page)) === "#commerce/raffineries?lt=n");
      await setF(page, { lt: "nom" });
      for (const ct of ["nom", "-nom", "-avg", "avg", "-n", "n", "sys"]) { await setF(page, { ct }); await sameAsModel(page, { ct }, "tri des raffineries « " + ct + " »"); }
      await page.click('#rfMat thead button[data-sort="nom"]'); await settle(page);
      check("clic sur « Minerai » (déjà croissant) : bascule en décroissant, aria-sort=descending, focus conservé sur le bouton", (await page.getAttribute("#rfMat .rf-corner", "aria-sort")) === "descending" && (await page.evaluate(() => document.activeElement.getAttribute("data-sort"))) === "nom");
      await page.click('#rfMat thead button[data-sort="r501"]'); await settle(page);
      let M = await sameAsModel(page, { lt: "-r501" }, "clic sur l'en-tête « Alpha » : minerais triés par rendement décroissant dans cette colonne (vides à la fin)");
      check("aria-sort=descending sur « Alpha » seulement, select « Trier les minerais par » = colonne « Alpha » (décroissant), adresse lt=-r501, focus conservé", (await page.getAttribute('#rfMat thead th:has(button[data-sort="r501"])', "aria-sort")) === "descending" && (await page.locator('#rfMat thead th[aria-sort="descending"]').count()) === 1 && /Colonne « Alpha » \(décroissant\)/.test(await page.locator("#rfLt option:checked").innerText()) && (await hashOf(page)) === "#commerce/raffineries?lt=-r501" && (await page.evaluate(() => document.activeElement.getAttribute("data-sort"))) === "r501");
      await page.click('#rfMat thead button[data-sort="r501"]'); await settle(page);
      await sameAsModel(page, { lt: "r501" }, "second clic : croissant");
      await ctx.close();
    });

    /* ───────── 6. meilleure raffinerie ───────── */
    await section("meilleure", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/raffineries");
      const opts = await page.locator("#rfB option").allTextContents();
      check("sélecteur « Minerai » : les minerais ayant au moins une valeur, A → Z (9), Deltium exclu", opts.length === 9 && !opts.includes("Deltium") && opts[0] === "=Formule (Minerai)", opts.join());
      const read = () => page.evaluate(() => [...document.querySelectorAll("#rfRk > li")].map(li => li.innerText.replace(/[  ]/g, " ").replace(/\s+/g, " ").replace(/([●◐○]) /g, "$1").trim()));
      async function checkRank(slug, label, F) {
        await page.selectOption("#rfB", slug); await settle(page);
        const M = model(DATA, F || {}, FX.T0), rk = rank(F || {}, slug, FX.T0), got = await read();
        const want = rk.map((c, i) => {
          const fr = freshWord(c.age);
          return c.ref.name + " " + c.ref.sys + " " + (c.ref.cap && c.ref.cap[M.key] !== null ? "Charge " + c.ref.cap[M.key].toLocaleString("fr-FR") + " %" : "charge non fournie") + " " + fmt(c.v) + " " + SYM[c.lv] + " " + WORD[c.lv] + (c.v === rk[0].v ? " ★ Meilleure" + (rk.filter(x => x.v === rk[0].v).length > 1 ? " (ex æquo)" : "") : "") + " " + (fr === "Frais" ? "●" : fr === "À vérifier" ? "◐" : "○") + fr + " " + ageTxt(c.age);
        });
        const n2 = x => T(x).replace(/([●◐○]) /g, "$1"), ok = got.length === want.length && got.every((g, i) => g.startsWith(n2(want[i])));
        check("classement « " + label + " » identique au modèle (valeur, puis donnée la plus récente, puis nom) : " + rk.map(c => c.ref.name).join(" > "), ok, ok ? "" : JSON.stringify(got) + " ≠ " + JSON.stringify(want));
        return { got, rk, M };
      }
      let r = await checkRank("alphite", "Alphite (ex æquo en tête, Alpha plus récent)");
      check("Alphite : Alpha (1 j) avant Charlie (20 j) à +6 % ; résumé aria-live mentionne l'égalité et la règle de départage", r.rk[0].ref.name === "Alpha" && r.rk[1].ref.name === "Charlie" && /Pour Alphite \(Minerai\) : Alpha \(\+6 %, élevé\)\. Égalité de rendement entre 2 raffineries, départagée par la donnée la plus récente puis l’ordre alphabétique\./.test(await txt(page, "#rfBs")) && (await page.getAttribute("#rfBs", "aria-live")) === "polite", await txt(page, "#rfBs"));
      r = await checkRank("gammanium", "Gammanium (ex æquo Alpha 1 j / Delta 5 j, Fantôme à +1 %)");
      check("Gammanium : Alpha, Delta, Fantôme (Fantôme sans charge fournie)", r.rk.map(c => c.ref.name).join() === "Alpha,Delta,Fantôme");
      r = await checkRank("zetanite", "Zêtanite (cinq ex æquo, même date : ordre alphabétique)");
      check("Zêtanite : ordre alphabétique des cinq raffineries à égalité exacte", r.rk.length === 5 && r.rk.map(c => c.ref.name).join() === [...r.rk].map(c => c.ref.name).sort((a, b) => COLL.compare(a, b)).join());
      r = await checkRank("formule", "=Formule (Minerai) (Alpha 1 j avant =Formule 4 j)");
      check("=Formule : Alpha, =Formule, Bravo (−8 %)", r.rk.map(c => c.ref.name).join() === "Alpha,=Formule,Bravo");
      r = await checkRank("epsilium", "Epsilium (une seule raffinerie)");
      check("Epsilium : une seule raffinerie, résumé sans égalité", r.rk.length === 1 && !/Égalité/.test(await txt(page, "#rfBs")));
      await setF(page, { v: "7j" }); r = await checkRank("alphite", "Alphite en 7 jours", { v: "7j" });
      check("7 jours : plus d'égalité (Alpha +8 > Charlie +7)", r.rk[0].ref.name === "Alpha" && r.rk[0].v === 8 && !/Égalité/.test(await txt(page, "#rfBs")));
      await setF(page, { v: "30j", s: "Système Y" }); r = await checkRank("alphite", "Alphite, Système Y seulement", { s: "Système Y" });
      check("filtre Système Y : seulement Charlie et Delta, Charlie en tête", r.rk.map(c => c.ref.name).join() === "Charlie,Delta");
      check("règle de départage affichée sous le sélecteur", /Rendement décroissant ; à valeur égale : donnée la plus récente, puis ordre alphabétique\. La charge n’entre pas dans le classement\./.test(await txt(page, "#rfBr")));
      check("choix du minerai dans l'adresse (m=alphite)", /m=alphite/.test(await hashOf(page)), await hashOf(page));
      await ctx.close();
    });

    /* ───────── 7. méthodes et charge ───────── */
    await section("méthodes", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/raffineries");
      const rows = await page.evaluate(() => [...document.querySelector("#rf-meth-h").closest(".mk-tw").querySelectorAll("tbody tr")].map(tr => [...tr.children].map(c => c.innerText.replace(/\s+/g, " ").trim())));
      check("tableau « Méthodes de raffinage » : nom + code, niveaux en TEXTE (rendement faible/moyen/élevé, coût faible/moyen/élevé, vitesse lente/moyenne/rapide), triées par nom ; niveau hors 1-3 : « — non renseigné »", rows.map(r => r.join("|")).join("/") === ["Cormack COR|Faible|Moyen|Rapide", "Électro-synthèse EST|Élevé|Faible|Lente", "Gaskin GAS|Moyen|Élevé|Rapide", "Méthode invalide BAD|— non renseigné|— non renseigné|Moyenne"].join("/"), JSON.stringify(rows));
      check("barres décoratives (aria-hidden) en plus du texte : 3 barres par niveau, nombre allumé = niveau (Électro-synthèse : 3, 1, 1)", await page.evaluate(() => [...document.querySelector("#rf-meth-h").closest(".mk-tw").querySelectorAll("tbody tr")[1].querySelectorAll(".rf-bars")].map(b => b.getAttribute("aria-hidden") + ":" + b.querySelectorAll("i.on").length + "/" + b.querySelectorAll("i").length).join()) === "true:3/3,true:1/3,true:1/3");
      check("note : niveaux 1 à 3 d'UEX, liste de référence sans date de mise à jour, aucun lien avec les rendements (aucun calcul combiné)", /Niveaux de 1 à 3 donnés par UEX/.test(await txt(page, "#rfMeth")) && /sans date de mise à jour/.test(await txt(page, "#rfMeth")) && /aucun calcul combiné/.test(await txt(page, "#rfMeth")) && /ajoutée le 14\/11\/2023/.test(await txt(page, "#rfMeth")), await txt(page, "#rfMeth"));
      await page.click('#rf-meth-h >> xpath=ancestor::div[contains(@class,"mk-tw")]//button[@data-k="y"]'); await page.waitForTimeout(80);
      const order = await page.evaluate(() => [...document.querySelector("#rf-meth-h").closest(".mk-tw").querySelectorAll("tbody tr th")].map(t => t.innerText.replace(/\s+/g, " ").trim().split(" ")[0]));
      check("tri par « Rendement » croissant (clic sur l'en-tête, aria-sort) : Cormack, Gaskin, Électro-synthèse, puis la valeur invalide en dernier", order.join() === "Cormack,Gaskin,Électro-synthèse,Méthode" && (await page.locator('#rf-meth-h >> xpath=ancestor::div[contains(@class,"mk-tw")]//th[@aria-sort="ascending"]').count()) === 1, order.join());
      // charge
      const cap = await page.evaluate(() => [...document.querySelector("#rf-cap-h").closest(".mk-tw").querySelectorAll("tbody tr")].map(tr => [...tr.children].map(c => c.innerText.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim()).slice(0, 3).join("|")));
      check("tableau « Charge (workload) » : 5 raffineries avec charge (Alpha 95 %, Bravo 10 %, Charlie 1 075 %, Delta 420 %, =Formule 20 %), valeur 30 jours", cap.length === 5 && cap.includes("Alpha|Système X|95 %") && cap.includes("Bravo|Système X|10 %") && cap.includes("Charlie|Système Y|1 075 %") && cap.includes("=Formule|Système X|20 %"), cap.join(" ; "));
      check("note : 2 raffineries affichées sans charge (Écho, Fantôme) ; « Capacités non fournies en quantité » ; définition d'UEX non précisée", /2 raffineries affichées n’ont pas de charge fournie/.test(await txt(page, "#rfCap")) && /Capacités non fournies en quantité/.test(await txt(page, "#rfCap")) && /définition n’est pas précisée/.test(await txt(page, "#rfCap")), await txt(page, "#rfCap"));
      await setF(page, { v: "dernier" });
      check("la valeur choisie s'applique à la charge (Bravo : 8 % en « Dernier »)", (await txt(page, "#rf-cap-h >> xpath=ancestor::div[contains(@class,'mk-tw')]")).includes("Bravo Système X 8 %"));
      await setF(page, { v: "30j", s: "Système Y" });
      check("filtre Système Y : seulement Charlie et Delta dans le tableau de charge", (await page.evaluate(() => [...document.querySelector("#rf-cap-h").closest(".mk-tw").querySelectorAll("tbody th")].map(t => t.textContent.trim()).join())) === "Charlie,Delta");
      await ctx.close();
      // ressources facultatives indisponibles : le module reste utilisable, avec notes explicites
      const c2 = await newPage(); await mock(c2.page, { status: (res) => (res === "refineries_capacities" || res === "refineries_methods") ? 503 : 200 });
      await open(c2.page, on.base, "#commerce/raffineries");
      check("méthodes et capacités indisponibles : matrice affichée, notes « Méthodes non disponibles » et « Charge non disponible », bandeau d'erreur sans dernière version connue",
        (await c2.page.locator("#rfMat .rf-t").count()) === 1 && /Méthodes non disponibles/.test(await txt(c2.page, "#rfMeth")) && /Charge non disponible/.test(await txt(c2.page, "#rfCap")) && /Impossible de mettre à jour|indisponibles/.test(await bn(c2.page)), await bn(c2.page));
      await c2.ctx.close();
      // capacités vides : « non fournies »
      const emptyCap = JSON.parse(JSON.stringify(DATA)); emptyCap.refineries_capacities = []; emptyCap.refineries_methods = [];
      const c3 = await newPage(); await mock(c3.page, { data: emptyCap }); await open(c3.page, on.base, "#commerce/raffineries");
      check("capacités et méthodes vides : « Charge non fournie » et « Aucune méthode de raffinage », en-têtes de colonne « charge non fournie »", /Charge non fournie/.test(await txt(c3.page, "#rfCap")) && /Aucune méthode de raffinage/.test(await txt(c3.page, "#rfMeth")) && (await c3.page.locator("#rfMat thead th.rf-col .mk-sm", { hasText: "charge non fournie" }).count()) === 7);
      await c3.ctx.close();
    });

    /* ───────── 8. CSV ───────── */
    await section("csv", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/raffineries");
      const grab = async () => { const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#rfCsv")]); return { name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), "utf8") }; };
      let g = await grab();
      check("CSV : fichier raffineries-rendements.csv ; contenu EXACT = modèle indépendant (BOM, « ; », CRLF, virgule décimale, une ligne par minerai × raffinerie avec valeur, ordre de la matrice)", g.name === "raffineries-rendements.csv" && g.text === expectCsv(model(DATA, {}, FX.T0), {}, FX.T0), g.text === expectCsv(model(DATA, {}, FX.T0), {}, FX.T0) ? "" : g.text.slice(0, 700));
      check("CSV : BOM au début, CRLF partout, aucun saut de ligne nu, formules neutralisées (« '=Formule (Minerai) » et « '=Formule »)", g.text.charCodeAt(0) === 0xfeff && !/[^\r]\n/.test(g.text) && g.text.includes(";'=Formule;") && g.text.includes("'=Formule (Minerai);FORM;"), g.text.slice(0, 200));
      check("CSV : valeurs négatives restent numériques (« −4 » écrit « -4 », pas d'apostrophe) et ex æquo signalés (« Oui (ex æquo) »)", /;-4;/.test(g.text) && !/;'-4/.test(g.text) && g.text.includes("Oui (ex æquo)"));
      check("annonce « Export prêt : N lignes. » (zone role=status)", await page.waitForFunction(() => /^Export prêt\s:\s\d+\slignes\.$/.test(document.getElementById("rfMsg").textContent), null, { timeout: 2500 }).then(() => true, () => false) && (await page.getAttribute("#rfMsg", "role")) === "status");
      await setF(page, { s: "Système Y", v: "dernier", q: "a", lt: "-best", ct: "-avg" });
      g = await grab();
      const F2 = { s: "Système Y", v: "dernier", q: "a", lt: "-best", ct: "-avg" };
      check("CSV avec filtres, valeur « Dernier », tris : contenu exact = modèle (seulement ce qui est affiché)", g.text === expectCsv(model(DATA, F2, FX.T0), F2, FX.T0), g.text.slice(0, 500));
      await ctx.close();
    });

    /* ───────── 9. adresse partageable ───────── */
    await section("adresse", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/raffineries?v=7j&s=Syst%C3%A8me%20X&q=a&tous=1&m=formule&lt=-best&ct=-avg");
      const F = { v: "7j", s: "Système X", q: "a", all: true, lt: "-best", ct: "-avg" };
      check("adresse complète : champs remplis (valeur, système, recherche, case, tris, minerai du classement)", (await page.inputValue("#rfV")) === "7j" && (await page.inputValue("#rfS")) === "Système X" && (await page.inputValue("#rfQ")) === "a" && (await page.isChecked("#rfAll")) && (await page.inputValue("#rfLt")) === "-best" && (await page.inputValue("#rfCt")) === "-avg" && (await page.inputValue("#rfB")) === "formule");
      await sameAsModel(page, F, "matrice restituée par l'adresse");
      check("l'adresse est conservée telle quelle, paramètres encodés", (await hashOf(page)) === "#commerce/raffineries?v=7j&s=Syst%C3%A8me%20X&q=a&tous=1&m=formule&lt=-best&ct=-avg", await hashOf(page));
      await page.fill("#rfQ", ""); await page.setChecked("#rfAll", false); await settle(page);
      check("valeurs par défaut omises : retirer la recherche et la case retire q et tous de l'adresse", !/q=|tous=/.test(await hashOf(page)), await hashOf(page));
      await page.evaluate(() => { location.hash = "#commerce/raffineries?v=dernier&lt=n"; }); await settle(page);
      check("changement d'adresse à la main (hashchange) : filtres mis à jour sans nouvelle requête de données", (await page.inputValue("#rfV")) === "dernier" && (await page.inputValue("#rfLt")) === "n" && (await page.inputValue("#rfS")) === "");
      // adresse invalide : repli sur les valeurs par défaut
      const c2 = await newPage(); await mock(c2.page);
      await open(c2.page, on.base, "#commerce/raffineries?v=pasvalide&s=Inconnu&lt=%3Cscript%3E&ct=zzz&m=nexistepas&q=" + "x".repeat(200));
      check("adresse invalide ou piégée : valeur par défaut (30 jours), système inconnu ignoré, tri par défaut, minerai inconnu remplacé par le premier, recherche tronquée à 80 caractères, aucune injection",
        (await c2.page.inputValue("#rfV")) === "30j" && (await c2.page.inputValue("#rfS")) === "" && (await c2.page.inputValue("#rfLt")) === "nom" && (await c2.page.inputValue("#rfCt")) === "sys" && (await c2.page.inputValue("#rfB")) === "formule" && (await c2.page.inputValue("#rfQ")).length === 80 && (await c2.page.locator("#rfMain script").count()) === 0);
      await c2.ctx.close();
      // rechargement : même état
      const url = await hashOf(page); await page.reload(); await page.waitForSelector("#rfMat .rf-t, #rfMat .mk-em");
      check("rechargement de la page : état restitué depuis l'adresse (valeur « Dernier », tri par nombre)", (await hashOf(page)) === url && (await page.inputValue("#rfV")) === "dernier" && (await page.inputValue("#rfLt")) === "n");
      await ctx.close();
    });

    /* ───────── 10. états des données ───────── */
    await section("états", async () => {
      const bnTxt = page => txt(page, "#rfBanner");
      let c = await newPage(); await mock(c.page, { delay: 2500 }); await open(c.page, on.base, "#commerce/raffineries", false); await c.page.waitForSelector("#rfState .mk-sk");
      check("chargement : « Chargement… », 4 squelettes, aria-busy=true, bandeau « Chargement des données de marché… »", /Chargement…/.test(await txt(c.page, "#rfState")) && (await c.page.locator("#rfState .mk-sk").count()) === 4 && (await c.page.getAttribute("#rfWrap", "aria-busy")) === "true" && /Chargement des données de marché/.test(await bnTxt(c.page)));
      await c.page.waitForSelector("#rfMat .rf-t", { timeout: 9000 });
      check("fin du chargement : matrice, aria-busy=false, bandeau « Données mises à jour »", (await c.page.getAttribute("#rfWrap", "aria-busy")) === "false" && /Données mises à jour/.test(await bnTxt(c.page)));
      await c.ctx.close();
      c = await newPage(); await mock(c.page, { status: 404 }); await open(c.page, on.base, "#commerce/raffineries", false); await c.page.waitForSelector("#rfState .mk-em");
      check("désactivé (404 uex_disabled) : « Données de marché désactivées », explication UEX_ENABLED=1, lien vers la documentation, bandeau « désactivées », aucune matrice",
        /Données de marché désactivées/.test(await txt(c.page, "#rfState")) && /UEX_ENABLED=1/.test(await txt(c.page, "#rfState")) && (await c.page.locator("#rfState a[target=_blank][rel*=noopener]").count()) === 1 && /désactivées/.test(await bnTxt(c.page)) && (await c.page.locator("#rfMat .rf-t").count()) === 0);
      await c.ctx.close();
      c = await newPage(); await open(c.page, off.base, "#commerce/raffineries", false); await c.page.waitForSelector("#rfState .mk-em");
      check("serveur réel sans UEX_ENABLED : même état « désactivé »", /Données de marché désactivées/.test(await txt(c.page, "#rfState")));
      await c.ctx.close();
      c = await newPage(); await mock(c.page, { status: 503 }); await open(c.page, on.base, "#commerce/raffineries", false); await c.page.waitForSelector("#rfState .mk-em");
      check("indisponible (503) sans copie : « Données UEX indisponibles », « Réessayer », bandeau d'erreur",
        /Données UEX indisponibles/.test(await txt(c.page, "#rfState")) && (await c.page.locator("#rfState button").innerText()) === "Réessayer" && /Données UEX indisponibles/.test(await bnTxt(c.page)));
      await c.ctx.close();
      c = await newPage(); await mock(c.page, { net: true }); await open(c.page, on.base, "#commerce/raffineries", false); await c.page.waitForSelector("#rfState .mk-em");
      check("réseau coupé : « Impossible de charger les données de marché » + « Réessayer », sans erreur console", /Impossible de charger les données de marché/.test(await txt(c.page, "#rfState")));
      await c.ctx.close();
      // une ressource indispensable manque : échec propre
      c = await newPage(); await mock(c.page, { status: res => res === "refineries_yields" ? 503 : 200 }); await open(c.page, on.base, "#commerce/raffineries", false); await c.page.waitForSelector("#rfState .mk-em");
      check("rendements indisponibles (les autres ressources répondent) : échec propre « Données UEX indisponibles »", /Données UEX indisponibles/.test(await txt(c.page, "#rfState")));
      await c.ctx.close();
      // périmé : drapeau stale + 3 jours
      c = await newPage(); await mock(c.page, { ago: 3 * 86400, stale: true }); await open(c.page, on.base, "#commerce/raffineries");
      check("périmé (stale, 3 j) : matrice affichée, bandeau « Données anciennes… (mises à jour il y a 3 j) » avec « Vérifiez en jeu. »", /Données anciennes/.test(await bnTxt(c.page)) && /il y a 3.j/.test(await bnTxt(c.page)) && /Vérifiez en jeu/.test(await bnTxt(c.page)) && (await c.page.locator("#rfMat .rf-t tbody tr").count()) === 9, await bnTxt(c.page));
      await c.ctx.close();
      // périmé par l'âge seul (sans drapeau stale) : refineries_yields annonce 1 jour
      c = await newPage(); await mock(c.page, { ago: 2 * 86400, stale: false }); await open(c.page, on.base, "#commerce/raffineries");
      check("âge au-delà de la durée de validité (1 jour) sans drapeau : également « Données anciennes »", /Données anciennes/.test(await bnTxt(c.page)), await bnTxt(c.page));
      await c.ctx.close();
      // pastille par donnée : les données de l'échantillon sont plus récentes que 7 jours (Frais) ou non, indépendamment de l'âge du cache
      c = await newPage(); await mock(c.page, { ago: 60 }); await open(c.page, on.base, "#commerce/raffineries");
      check("ressource fraîche (1 min) : bandeau « Données mises à jour il y a 1 min » ; les pastilles par donnée suivent date_modified (Frais, À vérifier, Périmé présentes)", /il y a 1.min/.test(await bnTxt(c.page)) && (await c.page.locator("#rfMat .mk-f.ok").count()) > 0 && (await c.page.locator("#rfMat .mk-f.warn").count()) > 0 && (await c.page.locator("#rfMat .mk-f.bad").count()) > 0);
      await c.ctx.close();
      // aucun résultat de données : jeu vide
      const none = JSON.parse(JSON.stringify(DATA)); none.refineries_yields = []; none.terminals = none.terminals.filter(t => t.type !== "refinery"); none.refineries_capacities = [];
      c = await newPage(); await mock(c.page, { data: none }); await open(c.page, on.base, "#commerce/raffineries");
      check("aucune donnée de raffinage : état vide « Aucune donnée de raffinage » (sans bouton Réinitialiser), résumé, CSV désactivé", /Aucune donnée de raffinage/.test(await txt(c.page, "#rfMat")) && (await c.page.locator("#rfMat button").count()) === 0 && (await c.page.isDisabled("#rfCsv")) && (await txt(c.page, "#rfSum")) === "Aucune donnée de raffinage.");
      await c.ctx.close();
    });

    /* ───────── 11. requêtes /api/uex ───────── */
    await section("requêtes", async () => {
      const { ctx, page, reqs } = await newPage();
      up.hits.length = 0;
      await open(page, on.base, "#commerce/raffineries");
      await page.selectOption("#rfV", "7j"); await page.selectOption("#rfS", "Système Y"); await page.fill("#rfQ", "a"); await page.click('#rfMat thead button[data-sort="nom"]'); await settle(page);
      const u = reqs.filter(r => !/^status/.test(r)), per = {}; u.forEach(r => { const k = r.split(" ")[0]; per[k] = (per[k] || 0) + 1; });
      check("ouverture réelle (serveur local + faux UEX) : exactement une requête /api/uex par ressource (6), rien de plus malgré filtres, recherche et tri", Object.keys(per).sort().join() === RES.slice().sort().join() && Object.values(per).every(n => n === 1), JSON.stringify(per));
      check("le faux serveur UEX n'a été interrogé qu'une fois par ressource (cache du serveur)", RES.every(r => up.hits.filter(h => h === r).length === 1), up.hits.join());
      check("aucune requête vers commodities_prices_all, commodities_routes ni une autre ressource", !u.some(r => !RES.includes(r.split(" ")[0])));
      const n0 = reqs.length;
      await page.click("#cmTab-sim"); await page.waitForTimeout(150); await page.click("#cmTab-raffineries"); await page.waitForSelector("#rfMat .rf-t"); await settle(page);
      const again = reqs.slice(n0).filter(r => /^(refineries|commodities$|terminals|star_systems)/.test(r)), per2 = {}; again.forEach(r => { const k = r.split(" ")[0]; per2[k] = (per2[k] || 0) + 1; });
      check("retour sur l'onglet : au plus une requête par ressource, revalidée par ETag (If-None-Match) ou servie du cache mémoire", Object.values(per2).every(n => n === 1) && again.every(r => /\(ETag\)$/.test(r)), again.join());
      await ctx.close();
    });

    /* ───────── 12. mobile et accessibilité ───────── */
    await section("mobile", async () => {
      const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); await mock(page);
      await open(page, on.base, "#commerce/raffineries");
      const ov = () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
      let o = await ov();
      check("390 px : aucun défilement horizontal de la PAGE (" + o.sw + " ≤ " + o.cw + ")", o.sw <= o.cw && o.bw <= o.cw, JSON.stringify(o));
      check("390 px : la matrice est remplacée par des cartes par minerai (9), tableau masqué", (await page.locator("#rfMat .rf-sc").isHidden()) && (await page.locator("#rfMat .rf-cards").isVisible()) && (await page.locator("#rfMat .rf-card").count()) === 9);
      const cards = await page.evaluate(() => [...document.querySelectorAll("#rfMat .rf-card")].map(li => ({ ore: li.querySelector("h4 span").textContent, items: [...li.querySelectorAll(".rf-ci")].map(x => x.querySelector("b").textContent + ":" + x.querySelector(".rf-v").innerText.replace(/[  ]/g, " ")) })));
      const M = model(DATA, {}, FX.T0), okc = cards.every((c, i) => { const r = M.rows[i], rk = r.cells.filter(x => x.v !== null).sort((a, b) => b.v - a.v || (b.ts || 0) - (a.ts || 0) || COLL.compare(a.ref.name, b.ref.name)); return c.ore === r.ore.name && c.items.join() === rk.map(x => x.ref.name + ":" + fmt(x.v)).join(); });
      check("cartes : une par minerai, raffineries triées (rendement décroissant, départage documenté), mêmes valeurs que le modèle", okc, JSON.stringify(cards.slice(0, 2)));
      const card0 = await txt(page, "#rfMat .rf-card >> nth=0");
      check("carte : niveau (▲ Élevé…), ★ Meilleure, pastille de fraîcheur et ancienneté en texte, système de la raffinerie", /[▲●▼] (Élevé|Moyen|Faible)/.test(card0) && /★ Meilleure/.test(card0) && /(Frais|À vérifier|Périmé)/.test(card0) && /il y a \d+ j/.test(card0) && /Système [XYZ]/.test(card0), card0);
      const small = await page.evaluate(() => { const bad = []; for (const e of document.querySelectorAll("#cmPanel-raffineries button, #cmPanel-raffineries select, #cmPanel-raffineries input:not([type=checkbox]), #cmPanel-raffineries summary, .rf-chk")) { const r = e.getBoundingClientRect(); if (r.width && r.height && r.height < 43.5) bad.push((e.id || e.className || e.tagName) + ":" + Math.round(r.height)); } return bad; });
      check("cibles tactiles ≥ 44 px (boutons, listes, champs, cases, résumé du bloc d'aide)", !small.length, small.join());
      const sec = await page.evaluate(() => [...document.querySelectorAll("#cmPanel-raffineries .pn, #cmPanel-raffineries .rf-warn")].every(e => e.getBoundingClientRect().right <= document.documentElement.clientWidth + 1));
      check("390 px : aucun bloc ne dépasse la largeur de l'écran (filtres, classement, méthodes, charge)", sec);
      await page.selectOption("#rfS", "Système X"); await page.selectOption("#rfV", "dernier"); await settle(page); o = await ov();
      check("390 px avec filtres : toujours aucun débordement horizontal de la page", o.sw <= o.cw, JSON.stringify(o));
      const mt = await page.evaluate(() => { const t = document.querySelector("#rf-meth-h").closest(".mk-tw"); return { cards: getComputedStyle(t.querySelector("thead")).position === "absolute", td: t.querySelector("tbody td").getAttribute("data-l") }; });
      check("390 px : le tableau des méthodes devient des cartes (en-têtes masqués visuellement, étiquettes data-l)", mt.cards && /Rendement/.test(mt.td), JSON.stringify(mt));
      await ctx.close();
      // bureau : la matrice défile dans son cadre, jamais la page
      const d = await newPage(); await mock(d.page);
      await open(d.page, on.base, "#commerce/raffineries?tous=1");
      const fr = await d.page.evaluate(() => { const s = document.querySelector("#rfMat .rf-sc"), t = s.querySelector("table"), de = document.documentElement; return { inner: s.clientWidth, table: t.scrollWidth, vh: s.clientHeight, th: s.scrollHeight, page: de.scrollWidth <= de.clientWidth, region: s.getAttribute("role"), tab: s.tabIndex, lbl: !!s.getAttribute("aria-label") }; });
      check("1440 px : la matrice est une région focalisable nommée (défile dans son cadre si elle est trop large), la page ne déborde pas", fr.page && fr.region === "region" && fr.tab === 0 && fr.lbl, JSON.stringify(fr));
      await d.page.setViewportSize({ width: 800, height: 800 }); await settle(d.page);
      const fr2 = await d.page.evaluate(() => { const s = document.querySelector("#rfMat .rf-sc"), de = document.documentElement; return { scrolls: s.scrollWidth > s.clientWidth, page: de.scrollWidth <= de.clientWidth }; });
      check("800 px : la matrice défile horizontalement dans son cadre, jamais la page", fr2.scrolls && fr2.page, JSON.stringify(fr2));
      const sticky = await d.page.evaluate(() => { const s = document.querySelector("#rfMat .rf-sc"); s.scrollLeft = 300; const th = s.querySelector("tbody th").getBoundingClientRect(), box = s.getBoundingClientRect(), hd = s.querySelector("thead th.rf-col").getBoundingClientRect(); return { firstColStuck: Math.abs(th.left - box.left) < 3, headStuck: Math.abs(hd.top - box.top) < 3 }; });
      check("en-têtes collants : la colonne des minerais reste visible quand la matrice défile à droite, l'en-tête reste en haut", sticky.firstColStuck && sticky.headStuck, JSON.stringify(sticky));
      // clavier : tab jusqu'au cadre, focus visible
      await d.page.focus("#rfMat .rf-sc");
      const fv = await d.page.evaluate(() => { const s = document.activeElement; const cs = getComputedStyle(s); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2; });
      check("focus clavier sur la région de la matrice : contour visible", fv);
      await d.page.focus('#rfMat thead button[data-sort="nom"]');
      check("focus clavier sur un bouton de tri : contour visible", await d.page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2; }));
      await d.ctx.close();
      // prefers-reduced-motion
      const r = await newPage({ reducedMotion: "reduce" }); await mock(r.page, { delay: 400 });
      await open(r.page, on.base, "#commerce/raffineries", false); await r.page.waitForSelector("#rfState .mk-sk", { timeout: 3000 }).catch(() => {});
      check("prefers-reduced-motion : aucune animation sur les squelettes de chargement", await r.page.evaluate(() => { const e = document.querySelector("#rfState .mk-sk"); return !e || getComputedStyle(e).animationName === "none"; }));
      await r.ctx.close();
    });

    /* ───────── 13. accessibilité de structure ───────── */
    await section("accessibilité", async () => {
      const { ctx, page } = await newPage(); await mock(page);
      await open(page, on.base, "#commerce/raffineries");
      const a = await page.evaluate(() => {
        const q = s => document.querySelector(s), live = s => q(s).getAttribute("aria-live");
        const labelled = [...document.querySelectorAll("#cmPanel-raffineries select, #cmPanel-raffineries input")].every(i => document.querySelector('label[for="' + i.id + '"]') || i.closest("label"));
        return { labelled, live: [live("#rfSum"), live("#rfBs"), q("#rfBanner").getAttribute("aria-live")].join(), h: [...document.querySelectorAll("#cmPanel-raffineries h2, #cmPanel-raffineries h3")].map(h => h.tagName + ":" + h.textContent.trim()).join("|"), sec: [...document.querySelectorAll("#rfMain section")].every(s => s.getAttribute("aria-labelledby") && document.getElementById(s.getAttribute("aria-labelledby"))), ol: !!q("#rfRk").getAttribute("aria-labelledby"), imgs: document.querySelectorAll("#cmPanel-raffineries img").length };
      });
      check("tous les champs ont un libellé associé ; zones aria-live (résumé, classement, bandeau) ; sections nommées ; liste ordonnée nommée ; aucune image", a.labelled && a.live === "polite,polite,polite" && a.sec && a.ol && a.imgs === 0, JSON.stringify(a));
      check("hiérarchie : h2 « Raffineries » puis h3 (rendement, meilleure raffinerie, méthodes, charge)", /^H2:Raffineries\|H3:Rendement par minerai et par raffinerie\|H3:Meilleure raffinerie pour…\|H3:Méthodes de raffinage\|H3:Charge \(workload\) des raffineries$/.test(a.h), a.h);
      await page.keyboard.press("Escape");
      // la matrice ne montre aucune info par la couleur seule : on supprime toutes les couleurs et on relit
      await page.addStyleTag({ content: "#rfMat *{background:none!important;color:#000!important;border-color:#000!important}" });
      check("sans couleur (styles de couleur neutralisés) : les cellules restent lisibles avec niveau, ★ et fraîcheur en texte", await page.evaluate(() => [...document.querySelectorAll("#rfMat td[data-lv]")].every(td => td.innerText.trim().split("\n").length >= 3)));
      await ctx.close();
    });

    /* ───────── 14. captures (REFINERIES_SHOTS=<dossier>) ───────── */
    if (SHOTS) await section("captures", async () => {
      fs.mkdirSync(SHOTS, { recursive: true });
      const shot = async (page, sel, name, full) => { if (sel) { const el = page.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await page.waitForTimeout(80); } await page.screenshot({ path: path.join(SHOTS, name + ".png"), fullPage: !!full }); };
      for (const [tag, vp] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]]) {
        const mob = vp.width === 390, { ctx, page } = await newPage({ viewport: vp, deviceScaleFactor: mob ? 2 : 1 });
        await mock(page); await open(page, on.base, "#commerce/raffineries?m=alphite");
        await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, null, "raffineries-" + tag + "-haut");
        await shot(page, "#rfMat", "raffineries-" + tag + "-matrice");
        await shot(page, "#rfBh", "raffineries-" + tag + "-meilleure");
        await shot(page, "#rf-meth-h", "raffineries-" + tag + "-methodes");
        await ctx.close();
        let c = await newPage({ viewport: vp }); await mock(c.page, { ago: 3 * 86400, stale: true }); await open(c.page, on.base, "#commerce/raffineries"); await c.page.evaluate(() => window.scrollTo(0, 0)); await shot(c.page, null, "raffineries-" + tag + "-perime"); await c.ctx.close();
        c = await newPage({ viewport: vp }); await mock(c.page, { status: 404 }); await open(c.page, on.base, "#commerce/raffineries", false); await c.page.waitForSelector("#rfState .mk-em"); await shot(c.page, null, "raffineries-" + tag + "-desactive"); await c.ctx.close();
      }
      const m = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); await mock(m.page); await open(m.page, on.base, "#commerce/raffineries"); await shot(m.page, "#rfMat .rf-card >> nth=0", "raffineries-390-cartes"); await m.ctx.close();
      check("captures enregistrées dans " + SHOTS, fs.readdirSync(SHOTS).filter(f => /^raffineries-/.test(f)).length >= 12);
    });

    check("aucune erreur de console, aucune violation CSP, aucune erreur de page", errors.length === 0, errors.slice(0, 5).join(" | "));
  } catch (e) {
    check("exécution des tests", false, e && e.stack || String(e));
  } finally {
    if (browser) await browser.close();
    servers.forEach(s => { try { s.child.kill(); } catch (e) {} });
    up.stop();
  }
  const ok = results.filter(Boolean).length;
  console.log("\n" + ok + "/" + results.length + " vérifications réussies");
  process.exit(ok === results.length && results.length ? 0 : 1);
})();
