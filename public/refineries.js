/* Module « Raffineries » du Commerce (#commerce/raffineries) : bonus de rendement du raffinage par minerai et par raffinerie, meilleure raffinerie pour un minerai,
   méthodes de raffinage, charge (workload) des raffineries. Chargé après market.js (briques communes) et avant commerce.js (sous-onglets, adresse).
   Ressources, via /api/uex/<ressource> (notre serveur) : refineries_yields, commodities, terminals, star_systems (indispensables) ; refineries_methods, refineries_capacities (facultatives).
   Une ouverture du module = au plus une requête par ressource.
   SENS DES DONNÉES (établi le 26 octobre 2026, voir docs/uex-api.md, « Raffineries : sens des données ») :
   - value / value_week / value_month = « percentage of yield bonus at refinery » (dernière valeur / 7 derniers jours / 30 derniers jours) : un BONUS DE RENDEMENT RELATIF en %, SIGNÉ
     (négatif = malus), propre à un couple (terminal de raffinerie × minerai), indépendant de la méthode de raffinage. Ce n'est ni un rendement absolu ni un profit. La base de calcul n'est pas définie par UEX.
   - refineries_methods : trois niveaux de 1 à 3 (rendement, coût, vitesse), SANS lien avec les rendements ci-dessus (aucun calcul combiné) ni date de mise à jour.
   - refineries_capacities : « value » = pourcentage de charge, colonne « Workload » de la page publique d'UEX (4 à 1075 dans les données observées) ; sa signification exacte n'est pas établie : affichée telle quelle, jamais utilisée pour classer.
   - Raffinerie = terminal de type « refinery » (le drapeau is_refinery est incohérent) ou terminal présent dans les rendements ou les capacités ; minerai = marchandise is_refinable ou présente dans les rendements.
   Échelle de couleur : TERCILES des valeurs réelles (voir scaleOf). « Meilleure » : plus haute valeur de la ligne parmi les raffineries affichées (ex æquo : toutes). */
(function () {
"use strict";
var M = window.OrbMarket, U = window.OrbUtil;
if (!M || !M.h || !U) return;
var H = M.h, el = H.el, at = H.at, plural = H.plural, NB = " ", MINUS = "−";
var REQ = ["refineries_yields", "commodities", "terminals", "star_systems"], OPT = ["refineries_methods", "refineries_capacities"], RES = REQ.concat(OPT);
/* fraîcheur d'une donnée : UEX met ces données à jour « au moins une fois par mois » (documentation) : Frais ≤ 7 j, À vérifier ≤ 30 j, Périmé au-delà (voir docs/uex-api.md) */
var FRESH = [7 * 86400, 30 * 86400];
var FK = { dernier: "d", "7j": "s", "30j": "m" }, FL = { dernier: "Dernier", "7j": "7 jours", "30j": "30 jours" }, FORDER = ["dernier", "7j", "30j"];
var FIELD = { d: "value", s: "value_week", m: "value_month" };
var LV = { 3: ["▲", "Élevé"], 2: ["●", "Moyen"], 1: ["▼", "Faible"] };
var DEF = { v: "30j", s: "", q: "", all: false, m: "", lt: "nom", ct: "sys" };
var R = { f: copy(DEF), idx: null, sig: "", sess: null, tok: 0, built: false, open: false, drawn: false, bn: null, tm: null, tc: null, last: null, view: null };
var D = {};

function copy(o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }
function $id(i) { return document.getElementById(i); }
function view() { return $id("v-commerce"); }
function nf(n, d) { return M.nf(n, d); }
function nrm(t) { return H.nrm(t); }
/* nombre fini ou null (null, "", texte non numérique : absent) */
function numOf(v) { if (v == null || v === "" || typeof v === "boolean") return null; v = +v; return isFinite(v) ? v : null; }
/* niveau 1 à 3 entier, sinon null (donnée absente ou hors échelle : « — », classée en dernier) */
function lvl3(v) { v = numOf(v); return v === 1 || v === 2 || v === 3 ? v : null; }
function arr(a) { return Array.isArray(a) ? a : []; }
function tsOf(d) { d = numOf(d); return d && d > 0 ? (d < 1e11 ? d * 1000 : d) : null; }
function ageOf(ts, now) { return ts == null ? null : Math.max(0, (now - ts) / 1000); }
/* « +8 % », « −5 % », « 0 % » (un chiffre après la virgule seulement si la valeur n'est pas entière) */
function pct(v) { var d = v === Math.round(v) ? 0 : 1; return (v > 0 ? "+" : "") + nf(v, d) + NB + "%"; }
function ageTxt(a) { return a == null ? "date inconnue" : M.ageLabel(a); }

/* ───────────────────────── adresse ───────────────────────── */
function fromParams(q) {
  var f = copy(DEF); q = q || {};
  if (q.v != null && Object.prototype.hasOwnProperty.call(FK, q.v)) f.v = q.v;
  if (q.s != null) f.s = String(q.s);
  if (q.q != null) f.q = String(q.q).slice(0, 80);
  f.all = q.tous === "1";
  if (q.m != null) f.m = String(q.m);
  if (q.lt != null && /^-?(nom|best|n|r\d+)$/.test(q.lt)) f.lt = q.lt;
  if (q.ct != null && /^-?(sys|nom|avg|n)$/.test(q.ct)) f.ct = q.ct;
  return f;
}
/* ?v=<dernier|7j|30j, défaut 30j>&s=<système>&q=<recherche>&tous=1&m=<minerai>&lt=<tri des minerais>&ct=<tri des raffineries> ; valeurs par défaut omises */
function query() {
  var f = R.f, a = [];
  function add(k, v) { a.push(k + "=" + encodeURIComponent(v)); }
  if (f.v !== DEF.v) add("v", f.v);
  if (f.s) add("s", f.s);
  if (f.q.trim()) add("q", f.q.trim());
  if (f.all) add("tous", "1");
  if (f.m) add("m", f.m);
  if (f.lt !== DEF.lt) add("lt", f.lt);
  if (f.ct !== DEF.ct) add("ct", f.ct);
  return a.length ? "?" + a.join("&") : "";
}
function setUrl() {
  if (!R.open) return;
  var h = "#commerce/raffineries" + query();
  if (location.hash !== h) { try { history.replaceState(null, "", h); } catch (e) {} }
}

/* ───────────────────────── index ─────────────────────────
   I = { ores:[{id, name, code, slug, cells:{<idRaffinerie>:{d,s,m,ts}}}], refs:[{id, name, full, sys, cap:{d,s,m,ts}|null}], systems, methods|null, hasCap, avail:{d,s,m}, same } */
function buildIndex(recs) {
  var yl = arr(recs[0].data), coms = arr(recs[1].data), terms = arr(recs[2].data), meths = recs[4] ? arr(recs[4].data) : null, caps = recs[5] ? arr(recs[5].data) : null;
  var tm = {}, comById = {}, oreById = {}, refById = {}, ores = [], refs = [], slugs = Object.create(null), coll = H.coll;
  terms.forEach(function (t) { if (t && t.id != null) tm[t.id] = t; });
  function label(t, fallback) {
    var n = String((t && (t.nickname || t.displayname)) || "").trim();
    if (!n) n = String((t && t.name) || fallback || "").replace(/^\s*(Refinement|Raffinage)[^-–]*[-–]\s*/i, "").trim();
    return n;
  }
  function getRef(id, name, sys) {
    var r = refById[id]; if (r) return r;
    var t = tm[id]; r = { id: id, name: label(t, name) || "Raffinerie " + id, full: String((t && (t.name || t.fullname)) || name || ""), sys: String((t && t.star_system_name) || sys || ""), cap: null };
    refById[id] = r; refs.push(r); return r;
  }
  coms.forEach(function (c) { if (c && c.id != null && c.name) comById[c.id] = c; });
  function addOre(id, name, code, slug) {
    var o = { id: id, name: name, code: code, slug: "", cells: {}, norm: nrm(name + " " + code) };
    var s = (slug || nrm(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "m" + id).toLowerCase();
    while (slugs[s]) s += "-" + id;
    o.slug = s; slugs[s] = o; oreById[id] = o; ores.push(o); return o;
  }
  coms.forEach(function (c) { if (c && c.id != null && c.name && (c.is_refinable === 1 || c.is_refinable === true || c.is_refinable === "1")) addOre(c.id, String(c.name), String(c.code || ""), String(c.slug || "")); });
  terms.forEach(function (t) { if (t && t.id != null && t.type === "refinery") getRef(t.id, t.name, t.star_system_name); });
  yl.forEach(function (r) {
    if (!r || r.id_terminal == null || r.id_commodity == null) return;
    var cell = { d: numOf(r.value), s: numOf(r.value_week), m: numOf(r.value_month), ts: tsOf(r.date_modified) };
    if (cell.d == null && cell.s == null && cell.m == null) return;
    var o = oreById[r.id_commodity];
    if (!o) { var c = comById[r.id_commodity]; var nm = c ? c.name : r.commodity_name; if (!nm) return; o = addOre(r.id_commodity, String(nm), String(c && c.code || ""), String(c && c.slug || "")); }
    var f = getRef(r.id_terminal, r.terminal_name, r.star_system_name), old = o.cells[f.id];
    if (!old || (cell.ts || 0) >= (old.ts || 0)) o.cells[f.id] = cell; /* doublon : la donnée la plus récente */
  });
  if (caps) caps.forEach(function (r) {
    if (!r || r.id_terminal == null) return;
    var c = { d: numOf(r.value), s: numOf(r.value_week), m: numOf(r.value_month), ts: tsOf(r.date_modified) };
    if (c.d == null && c.s == null && c.m == null) return;
    var f = getRef(r.id_terminal, r.terminal_name, r.star_system_name);
    if (!f.cap || (c.ts || 0) >= (f.cap.ts || 0)) f.cap = c;
  });
  /* deux raffineries au même libellé : on affiche le nom complet du terminal */
  var seen = {}; refs.forEach(function (f) { seen[f.name] = (seen[f.name] || 0) + 1; });
  refs.forEach(function (f) { if (seen[f.name] > 1 && f.full) f.name = f.full; });
  ores.sort(function (a, b) { return coll.compare(a.name, b.name); });
  var sys = {}, avail = { d: false, s: false, m: false }, same = true, anyCell = false;
  refs.forEach(function (f) { if (f.sys) sys[f.sys] = 1; });
  ores.forEach(function (o) { for (var k in o.cells) { var c = o.cells[k]; anyCell = true; ["d", "s", "m"].forEach(function (x) { if (c[x] != null) avail[x] = true; }); if (c.d !== c.s || c.s !== c.m) same = false; } });
  var methods = meths ? meths.filter(function (m) { return m && m.name; }).map(function (m) {
    return { id: m.id, name: String(m.name), code: String(m.code || ""), y: lvl3(m.rating_yield), c: lvl3(m.rating_cost), v: lvl3(m.rating_speed), added: tsOf(m.date_added) };
  }) : null;
  return { ores: ores, refs: refs, systems: Object.keys(sys).sort(function (a, b) { return coll.compare(a, b); }), methods: methods, hasCap: !!caps, avail: avail, same: anyCell && same, bySlug: slugs };
}

/* ───────────────────────── calculs ───────────────────────── */
/* ÉCHELLE : terciles des valeurs RÉELLES du champ choisi (toutes les cellules du jeu de données, indépendamment des filtres, pour que les couleurs ne bougent pas quand on filtre).
   Tri croissant s[0..n-1] ; bas = s[⌈n/3⌉−1], haut = s[⌊2n/3⌋].
   Niveau : Élevé (▲) si v ≥ haut et v > bas ; Faible (▼) si v ≤ bas et v < haut ; Moyen (●) sinon. Avec trop d'égalités (bas = haut) la valeur la plus fréquente est « Moyenne » ; une seule valeur répétée : tout est « Moyen ». */
function scaleOf(values) {
  var s = values.filter(function (v) { return v != null; }).sort(function (a, b) { return a - b; }), n = s.length;
  if (!n) return null;
  return { n: n, lo: s[Math.ceil(n / 3) - 1], hi: s[Math.floor(2 * n / 3)], min: s[0], max: s[n - 1] };
}
function levelOf(sc, v) { return v >= sc.hi && v > sc.lo ? 3 : v <= sc.lo && v < sc.hi ? 1 : 2; }
/* départage : valeur décroissante, puis donnée la plus récente, puis nom de la raffinerie */
function rankCmp(a, b) { return b.v - a.v || (b.ts || 0) - (a.ts || 0) || H.coll.compare(a.ref.name, b.ref.name); }
function parseSort(s) { var m = /^(-?)(.+)$/.exec(s); return { k: m[2], d: m[1] ? -1 : 1 }; }

/* f : état ; now en ms. Retourne l'échelle, les colonnes (raffineries affichées, triées), les lignes (minerais, triées) avec niveau et « meilleure » par cellule. */
function compute(I, f, now) {
  var key = FK[f.v], coll = H.coll, all = [];
  I.ores.forEach(function (o) { for (var k in o.cells) all.push(o.cells[k][key]); });
  var sc = scaleOf(all);
  /* moyenne par raffinerie (tous minerais, indépendante des filtres) */
  var avg = {}, cnt = {};
  I.ores.forEach(function (o) { for (var k in o.cells) { var v = o.cells[k][key]; if (v != null) { avg[k] = (avg[k] || 0) + v; cnt[k] = (cnt[k] || 0) + 1; } } });
  var cols = I.refs.filter(function (r) { return !f.s || r.sys === f.s; }).map(function (r) { return { ref: r, avg: cnt[r.id] ? avg[r.id] / cnt[r.id] : null, n: cnt[r.id] || 0 }; });
  var ct = parseSort(f.ct);
  cols.sort(function (a, b) { return coll.compare(a.ref.name, b.ref.name); }); /* base alphabétique : le tri suivant est stable (égalités = ordre alphabétique) */
  if (ct.k === "nom") cols = M.sortRows(cols, function (c) { return c.ref.name; }, "t", ct.d);
  else if (ct.k === "sys") cols = M.sortRows(cols, function (c) { return c.ref.sys || null; }, "t", ct.d);
  else if (ct.k === "avg") cols = M.sortRows(cols, function (c) { return c.avg; }, "n", ct.d);
  else if (ct.k === "n") cols = M.sortRows(cols, function (c) { return c.n; }, "n", ct.d);
  var q = nrm(f.q), rows = [], nCells = 0;
  I.ores.forEach(function (o) {
    if (q && o.norm.indexOf(q) < 0) return;
    var cells = cols.map(function (c) {
      var x = o.cells[c.ref.id], v = x ? x[key] : null;
      return v == null ? { ref: c.ref, v: null } : { ref: c.ref, v: v, ts: x.ts, ageS: ageOf(x.ts, now), lv: levelOf(sc, v), d: x.d, s: x.s, m: x.m };
    });
    var have = cells.filter(function (c) { return c.v != null; }), best = null, ties = 0;
    if (have.length >= 2) { best = Math.max.apply(null, have.map(function (c) { return c.v; })); have.forEach(function (c) { if (c.v === best) { c.best = true; ties++; } }); cells.forEach(function (c) { if (c.best) c.ties = ties; }); }
    if (!have.length && !f.all) return;
    nCells += have.length;
    rows.push({ ore: o, cells: cells, n: have.length, top: have.length ? Math.max.apply(null, have.map(function (c) { return c.v; })) : null });
  });
  rows.sort(function (a, b) { return coll.compare(a.ore.name, b.ore.name); });
  var lt = parseSort(f.lt), rm = /^r(\d+)$/.exec(lt.k);
  if (lt.k === "nom") rows = M.sortRows(rows, function (r) { return r.ore.name; }, "t", lt.d);
  else if (lt.k === "best") rows = M.sortRows(rows, function (r) { return r.top; }, "n", lt.d);
  else if (lt.k === "n") rows = M.sortRows(rows, function (r) { return r.n; }, "n", lt.d);
  else if (rm) { var ci = -1; cols.forEach(function (c, i) { if (String(c.ref.id) === rm[1]) ci = i; }); rows = M.sortRows(rows, function (r) { return ci < 0 ? null : r.cells[ci].v; }, "n", lt.d); }
  return { scale: sc, key: key, cols: cols, rows: rows, nCells: nCells };
}

/* classement « Meilleure raffinerie pour… » : raffineries affichées ayant une valeur pour ce minerai */
function ranking(I, f, ore, now) {
  var key = FK[f.v], sc = (function () { var all = []; I.ores.forEach(function (o) { for (var k in o.cells) all.push(o.cells[k][key]); }); return scaleOf(all); })(), out = [];
  I.refs.forEach(function (r) {
    if (f.s && r.sys !== f.s) return;
    var x = ore.cells[r.id]; if (!x || x[key] == null) return;
    out.push({ ref: r, v: x[key], ts: x.ts, ageS: ageOf(x.ts, now), lv: levelOf(sc, x[key]), cap: r.cap ? r.cap[key] : null });
  });
  out.sort(rankCmp);
  var top = out.length ? out[0].v : null, ties = out.filter(function (e) { return e.v === top; }).length;
  out.forEach(function (e) { e.best = e.v === top; e.ties = ties; });
  return out;
}

/* ───────────────────────── interface : éléments ───────────────────────── */
function field(id, label, input) { return '<div class="mk-fld"><label for="' + id + '">' + label + "</label>" + input + "</div>"; }
function sym(s) { return at(el("span", null, s), { "aria-hidden": "true" }); }
function fpill(ageS) { var p = H.pill(ageS, FRESH); p.classList.add("rf-pl"); return p; }
/* valeur + niveau (symbole ET mot) + « Meilleure » + fraîcheur : même contenu dans la matrice, le classement et les cartes */
function fillCell(host, c, withAge) {
  host.appendChild(el("b", "rf-v", pct(c.v)));
  var l = el("span", "rf-lv"); l.appendChild(sym(LV[c.lv][0])); l.appendChild(document.createTextNode(" " + LV[c.lv][1])); host.appendChild(l);
  if (c.best) {
    var b = el("span", "rf-bst"); b.appendChild(sym("★")); b.appendChild(document.createTextNode(" Meilleure")); if (c.ties > 1) b.appendChild(el("span", "rf-ex", " (ex æquo)"));
    host.appendChild(b);
  }
  var fp = fpill(c.ageS); if (c.ageS != null) at(fp, { title: ageTxt(c.ageS) }); host.appendChild(fp);
  if (withAge) host.appendChild(el("span", "mk-ag", ageTxt(c.ageS)));
  else if (c.ageS != null) fp.appendChild(el("span", "sr", " (" + ageTxt(c.ageS) + ")"));
}
function capTxt(r, key) { var v = r.cap ? r.cap[key] : null; return v == null ? null : nf(v, v === Math.round(v) ? 0 : 1) + NB + "%"; }

/* ───────────────────────── interface : construction ───────────────────────── */
function build() {
  if (R.built) return; R.built = true;
  D.h2 = $id("rfTitle"); D.wrap = $id("rfWrap"); D.state = $id("rfState"); D.main = $id("rfMain");
  R.bn = M.Banner($id("rfBanner"));
  var sel = function (id) { return '<select id="' + id + '"></select>'; };
  D.main.innerHTML =
    '<div class="rf-warn" role="note"><b>Données communautaires, peuvent être inexactes.</b> Le rendement est un <b>bonus relatif en %</b> propre à chaque raffinerie et à chaque minerai (négatif = malus), tel que le définit UEX : ce n’est ni un rendement absolu ni un profit. Les valeurs sont saisies par des joueurs.</div>' +
    '<div class="pn"><div class="rf-flt">' +
    field("rfV", "Valeur affichée", sel("rfV")) + field("rfS", "Système", sel("rfS")) +
    field("rfQ", "Rechercher un minerai", '<input id="rfQ" type="search" autocomplete="off" spellcheck="false">') +
    field("rfLt", "Trier les minerais par", sel("rfLt")) + field("rfCt", "Trier les raffineries par", sel("rfCt")) +
    '<div class="rf-chks"><label class="rf-chk"><input type="checkbox" id="rfAll"><span>Afficher aussi les minerais sans aucune donnée</span></label></div>' +
    '<p class="rf-hint" id="rfSame" hidden>Dans les données actuelles d’UEX, « Dernier », « 7 jours » et « 30 jours » sont identiques : le choix ne change rien pour l’instant.</p>' +
    '<div class="rf-acts"><button type="button" class="btn" id="rfReset">Réinitialiser les filtres</button><button type="button" class="btn" id="rfCsv">Exporter en CSV</button></div>' +
    '</div></div>' +
    '<p class="mk-sum" id="rfSum" aria-live="polite" aria-atomic="true"></p><p class="mk-msg" id="rfMsg" role="status"></p>' +
    '<section class="pn rf-mat" aria-labelledby="rfMh"><div class="mk-tbh"><h3 id="rfMh">Rendement par minerai et par raffinerie</h3><span class="mk-ag" id="rfNote"></span></div>' +
    '<ul class="rf-lg" id="rfLg" aria-label="Légende"></ul><div id="rfMat"></div></section>' +
    '<div class="rf-split"><section class="pn" aria-labelledby="rfBh"><h3 class="rf-h3" id="rfBh">Meilleure raffinerie pour…</h3>' +
    '<div class="rf-bsel">' + field("rfB", "Minerai", sel("rfB")) + '</div><p class="mk-sum" id="rfBs" aria-live="polite" aria-atomic="true"></p><p class="rf-hint" id="rfBr"></p><ol class="rf-rk" id="rfRk" aria-labelledby="rfBh"></ol></section>' +
    '<section class="pn" aria-labelledby="rf-meth-h"><div id="rfMeth"></div></section></div>' +
    '<section class="pn" aria-labelledby="rf-cap-h"><div id="rfCap"></div></section>' +
    '<details class="rf-fm" id="rfFm"><summary>Comment lire ces données</summary><ul>' +
    "<li><b>Rendement</b> : bonus de rendement relatif en %, signé (« +8 % » bonus, « " + MINUS + "5 % » malus), pour un couple raffinerie × minerai, d’après UEX. « Dernier », « 7 jours » et « 30 jours » sont la dernière valeur et les moyennes des 7 et 30 derniers jours selon UEX (la page publique d’UEX affiche la moyenne sur 30 jours). Il ne dépend pas de la méthode de raffinage (UEX ne relie pas les deux).</li>" +
    "<li><b>Échelle de couleur</b> : relative aux données, par terciles de toutes les valeurs du champ choisi (un tiers de valeurs « Faible », un tiers « Moyen », un tiers « Élevé », aux égalités près). Ce n’est pas une valeur du jeu. Les seuils exacts sont affichés dans la légende ; ils sont toujours doublés d’un symbole et d’un mot.</li>" +
    "<li><b>★ Meilleure</b> : plus haute valeur de la ligne parmi les raffineries affichées (filtre Système compris), pour au moins deux valeurs ; en cas d’égalité, toutes les cases à égalité portent l’étoile.</li>" +
    "<li><b>Classement « Meilleure raffinerie pour… »</b> : valeur décroissante ; à valeur égale, donnée la plus récente d’abord, puis ordre alphabétique de la raffinerie. La charge n’intervient pas.</li>" +
    "<li><b>Fraîcheur</b> (date de mise à jour de chaque donnée) : Frais jusqu’à 7 jours, À vérifier jusqu’à 30 jours, Périmé au-delà ; UEX annonce une mise à jour au moins mensuelle (seuils différents de ceux des prix).</li>" +
    "<li><b>Charge (workload)</b> : pourcentage fourni par UEX (peut dépasser 100 %) ; sa signification exacte n’est pas définie, elle est affichée telle quelle.</li>" +
    "<li><b>Méthodes</b> : niveaux 1 à 3 donnés par UEX (rendement, coût, vitesse), sans date de mise à jour.</li></ul></details>";
  ["V", "S", "Q", "Lt", "Ct", "All", "Reset", "Csv", "Same", "Sum", "Msg", "Note", "Lg", "Mat", "B", "Bs", "Br", "Rk", "Meth", "Cap"].forEach(function (k) { D[k] = $id("rf" + k); });
  var opt = function (sel, v, t) { var o = el("option", null, t); o.value = v; sel.appendChild(o); return o; };
  FORDER.forEach(function (k) { opt(D.V, k, FL[k]); });
  [["nom", "Nom (A → Z)"], ["-nom", "Nom (Z → A)"], ["-best", "Meilleur rendement (décroissant)"], ["best", "Meilleur rendement (croissant)"], ["-n", "Nombre de raffineries avec donnée (décroissant)"], ["n", "Nombre de raffineries avec donnée (croissant)"]].forEach(function (x) { opt(D.Lt, x[0], x[1]); });
  [["sys", "Système, puis nom"], ["nom", "Nom (A → Z)"], ["-nom", "Nom (Z → A)"], ["-avg", "Rendement moyen (décroissant)"], ["avg", "Rendement moyen (croissant)"], ["-n", "Nombre de minerais avec donnée (décroissant)"], ["n", "Nombre de minerais avec donnée (croissant)"]].forEach(function (x) { opt(D.Ct, x[0], x[1]); });
  /* matrice : un seul gestionnaire pour les boutons de tri des en-têtes */
  D.Mat.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-sort]"); if (!b) return;
    var k = b.getAttribute("data-sort"), cur = parseSort(R.f.lt);
    R.f.lt = cur.k === k ? (cur.d > 0 ? "-" : "") + k : (k === "nom" ? "" : "-") + k; /* nom : croissant d'abord ; valeurs : décroissant d'abord */
    syncInputs(); draw("sort:" + k); setUrl();
  });
  D.V.addEventListener("change", function () { R.f.v = D.V.value; draw(); setUrl(); });
  D.S.addEventListener("change", function () { R.f.s = D.S.value; draw(); setUrl(); });
  D.Q.addEventListener("input", function () { R.f.q = D.Q.value; draw(); setUrl(); });
  D.All.addEventListener("change", function () { R.f.all = D.All.checked; draw(); setUrl(); });
  D.Lt.addEventListener("change", function () { R.f.lt = D.Lt.value; draw(); setUrl(); });
  D.Ct.addEventListener("change", function () { R.f.ct = D.Ct.value; draw(); setUrl(); });
  D.B.addEventListener("change", function () { R.f.m = D.B.value; drawBest(); setUrl(); });
  D.Reset.addEventListener("click", resetFilters);
  D.Csv.addEventListener("click", exportCsv);
  R.tm = M.Table({ id: "rf-meth", title: "Méthodes de raffinage", def: ["m", 1], limit: 50,
    note: function (rows) { return rows.length ? plural(rows.length, "méthode", "méthodes") : ""; },
    columns: [
      { k: "m", h: "Méthode", type: "t", first: true, val: function (r) { return r.name; }, cell: function (r) { var f = document.createDocumentFragment(); f.appendChild(el("b", null, r.name)); if (r.code) f.appendChild(el("span", "mk-sm", r.code)); return f; } },
      { k: "y", h: "Rendement", type: "n", val: function (r) { return r.y; }, cell: function (r) { return level(r.y, ["Faible", "Moyen", "Élevé"]); } },
      { k: "c", h: "Coût", type: "n", val: function (r) { return r.c; }, cell: function (r) { return level(r.c, ["Faible", "Moyen", "Élevé"]); } },
      { k: "v", h: "Vitesse", type: "n", val: function (r) { return r.v; }, cell: function (r) { return level(r.v, ["Lente", "Moyenne", "Rapide"]); } }],
    empty: function () { return { title: "Aucune méthode de raffinage", text: "UEX ne fournit aucune méthode de raffinage pour le moment.", reset: false }; } });
  R.tc = M.Table({ id: "rf-cap", title: "Charge (workload) des raffineries", def: ["n", 1], limit: 50, onReset: resetFilters,
    note: function () { return "Pourcentage fourni par UEX, définition non précisée"; },
    columns: [
      { k: "n", h: "Raffinerie", type: "t", first: true, val: function (r) { return r.ref.name; }, cell: function (r) { return r.ref.name; } },
      { k: "s", h: "Système", type: "t", val: function (r) { return r.ref.sys || null; }, cell: function (r) { return r.ref.sys ? r.ref.sys : H.dash(); } },
      { k: "c", h: "Charge", type: "n", n: true, val: function (r) { return r.v; }, cell: function (r) { return nf(r.v, r.v === Math.round(r.v) ? 0 : 1) + NB + "%"; } },
      { k: "a", h: "Ancienneté", type: "n", val: function (r) { return r.ageS; }, cell: function (r) { var f = document.createDocumentFragment(); f.appendChild(fpill(r.ageS)); f.appendChild(document.createTextNode(" ")); f.appendChild(el("span", "mk-ag", ageTxt(r.ageS))); return f; } }],
    empty: function (ctx) { return ctx.total ? { title: "Aucune raffinerie dans ce système", text: "Aucune raffinerie du système choisi n’a de charge connue.", reset: true } : { title: "Charge non fournie", text: "UEX ne fournit aucune charge (capacité) de raffinerie pour le moment.", reset: false }; } });
}
/* niveau 1 à 3 : texte + barres (les barres sont décoratives ; le mot porte l'information) */
function level(n, words) {
  if (n == null || n < 1 || n > 3 || n !== Math.round(n)) return H.dash();
  var f = el("span", "rf-lvl"), b = at(el("span", "rf-bars"), { "aria-hidden": "true" });
  for (var i = 1; i <= 3; i++) b.appendChild(el("i", i <= n ? "on" : ""));
  f.appendChild(b); f.appendChild(document.createTextNode(words[n - 1]));
  return f;
}

/* ───────────────────────── interface : rendu ───────────────────────── */
function syncInputs() {
  var f = R.f, I = R.idx, av = I ? I.avail : { d: true, s: true, m: true };
  /* champ choisi indisponible dans les données : premier champ disponible */
  if (I && !av[FK[f.v]]) { for (var i = FORDER.length - 1; i >= 0; i--) if (av[FK[FORDER[i]]]) { f.v = FORDER[i]; break; } }
  [].forEach.call(D.V.options, function (o) { o.disabled = !av[FK[o.value]]; });
  D.V.value = f.v; D.Q.value = f.q; D.All.checked = !!f.all;
  /* tri par colonne d'une raffinerie : option dédiée, présente tant qu'il est actif */
  [].slice.call(D.Lt.querySelectorAll("option[data-r]")).forEach(function (o) { o.remove(); });
  var lt = parseSort(f.lt), rm = /^r(\d+)$/.exec(lt.k);
  if (rm) {
    var ref = I && I.refs.filter(function (x) { return String(x.id) === rm[1]; })[0];
    if (ref) { var o = el("option", null, "Colonne « " + ref.name + " » (" + (lt.d > 0 ? "croissant" : "décroissant") + ")"); o.value = f.lt; o.setAttribute("data-r", "1"); D.Lt.appendChild(o); } else f.lt = DEF.lt;
  }
  D.Lt.value = f.lt; D.Ct.value = f.ct;
}
function fillSelects() {
  var I = R.idx, f = R.f;
  D.S.textContent = ""; var o0 = el("option", null, "Tous les systèmes"); o0.value = ""; D.S.appendChild(o0);
  I.systems.forEach(function (n) { var o = el("option", null, n); o.value = n; D.S.appendChild(o); });
  if (f.s && I.systems.indexOf(f.s) < 0) f.s = "";
  D.S.value = f.s; D.Same.hidden = !I.same;
  if (I.same) D.V.setAttribute("aria-describedby", "rfSame"); else D.V.removeAttribute("aria-describedby");
}
function legend(sc) {
  var ul = D.Lg; ul.textContent = "";
  function li(cls, sy, text) { var x = el("li"); if (cls) x.appendChild(at(el("i", "rf-sw " + cls), { "aria-hidden": "true" })); if (sy) x.appendChild(sym(sy + " ")); x.appendChild(document.createTextNode(text)); ul.appendChild(x); }
  if (sc) {
    var lo = pct(sc.lo), hi = pct(sc.hi), mixed = sc.lo < sc.hi;
    li("rf-l3", "▲", "Élevé : " + (mixed ? hi + " et plus" : "aucune valeur (trop d’égalités)"));
    li("rf-l2", "●", "Moyen : " + (mixed ? "au-dessus de " + lo + " et au-dessous de " + hi : "exactement " + lo));
    li("rf-l1", "▼", "Faible : " + (mixed ? lo + " et moins" : "aucune valeur (trop d’égalités)"));
  }
  li("", "★", "Meilleure : plus haute valeur de la ligne (au moins deux valeurs)");
  li("", "—", "pas de donnée");
  li("", "●", "Frais (≤ 7 j)"); li("", "◐", "À vérifier (≤ 30 j)"); li("", "○", "Périmé (> 30 j)");
  var sc2 = el("li", "rf-lgn", sc ? "Échelle relative : terciles des " + nf(sc.n) + " valeurs du champ choisi (de " + pct(sc.min) + " à " + pct(sc.max) + "), pas une valeur du jeu." : "Aucune valeur : pas d’échelle."); ul.appendChild(sc2);
}
function empty(host, title, text, reset) {
  var p = el("div", "pn mk-em"); p.appendChild(el("b", null, title)); p.appendChild(el("p", null, text));
  if (reset) { var b = el("button", "btn", "Réinitialiser les filtres"); b.type = "button"; b.addEventListener("click", resetFilters); p.appendChild(b); }
  host.appendChild(p);
}
function matrix(C, I) {
  var host = D.Mat, f = R.f; host.textContent = "";
  var lt = parseSort(f.lt), asort = function (k) { return lt.k === k ? (lt.d > 0 ? "ascending" : "descending") : "none"; }, arrow = function (k) { return lt.k === k ? (lt.d > 0 ? "↑" : "↓") : "↕"; };
  var wrap = at(el("div", "rf-sc"), { role: "region", "aria-label": "Matrice des rendements (défile dans son cadre)", tabindex: "0" });
  var t = at(el("table", "rf-t"), { "aria-labelledby": "rfMh" }), hd = el("thead"), hr = el("tr");
  var corner = at(el("th", "rf-corner"), { scope: "col", "aria-sort": asort("nom") }), cb = el("button", "mk-sb"); cb.type = "button"; cb.setAttribute("data-sort", "nom");
  cb.appendChild(document.createTextNode("Minerai")); cb.appendChild(sym(arrow("nom"))); corner.appendChild(cb); hr.appendChild(corner);
  C.cols.forEach(function (c) {
    var k = "r" + c.ref.id, th = at(el("th", "rf-col"), { scope: "col", "aria-sort": asort(k) }), b = el("button", "mk-sb"); b.type = "button"; b.setAttribute("data-sort", k);
    var in1 = el("span", "rf-hn"); in1.appendChild(el("b", null, c.ref.name)); in1.appendChild(el("span", "mk-sm", c.ref.sys || "système inconnu"));
    var cp = capTxt(c.ref, C.key); in1.appendChild(el("span", "mk-sm", cp ? "Charge " + cp : "charge non fournie"));
    b.appendChild(in1); b.appendChild(sym(arrow(k))); b.appendChild(el("span", "sr", " : trier les minerais par ce rendement")); th.appendChild(b); hr.appendChild(th);
  });
  hd.appendChild(hr); t.appendChild(hd);
  var tb = el("tbody");
  C.rows.forEach(function (r) {
    var tr = el("tr"), th = at(el("th", "rf-row"), { scope: "row" });
    th.appendChild(el("b", null, r.ore.name)); th.appendChild(el("span", "mk-sm", r.n ? plural(r.n, "valeur", "valeurs") : "aucune donnée")); tr.appendChild(th);
    r.cells.forEach(function (c) {
      var td = el("td", "rf-c" + (c.v == null ? " rf-e" : " rf-l" + c.lv));
      if (c.v == null) { td.appendChild(sym("—")); td.appendChild(el("span", "sr", "pas de donnée")); }
      else { td.setAttribute("data-lv", String(c.lv)); if (c.best) td.setAttribute("data-best", String(c.ties)); td.setAttribute("data-v", String(c.v)); fillCell(td, c, false); }
      td.setAttribute("data-ore", r.ore.slug); td.setAttribute("data-ref", String(c.ref.id));
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb); wrap.appendChild(t); host.appendChild(wrap);
  /* cartes (sous 700 px, à la place de la matrice) : un minerai = une carte, ses raffineries triées par rendement */
  var ul = at(el("ul", "rf-cards"), { "aria-label": "Minerais et rendement par raffinerie" });
  C.rows.forEach(function (r) {
    var li = el("li", "rf-card"), h = el("h4", "rf-ch"); h.appendChild(el("span", null, r.ore.name)); h.appendChild(el("span", "mk-ag", r.n ? plural(r.n, "raffinerie", "raffineries") : "aucune donnée")); li.appendChild(h);
    var have = r.cells.filter(function (c) { return c.v != null; }).sort(rankCmp);
    if (have.length) {
      var ol = el("ol", "rf-cl");
      have.forEach(function (c) {
        var it = el("li", "rf-ci rf-l" + c.lv), nm = el("span", "rf-cn"); nm.appendChild(el("b", null, c.ref.name)); nm.appendChild(el("span", "mk-sm", c.ref.sys || "système inconnu"));
        var cp = capTxt(c.ref, C.key); nm.appendChild(el("span", "mk-sm", cp ? "Charge " + cp : "charge non fournie"));
        var vv = el("span", "rf-cv"); fillCell(vv, c, true); it.appendChild(nm); it.appendChild(vv); ol.appendChild(it);
      });
      li.appendChild(ol);
    } else li.appendChild(el("p", "rf-hint", "Aucune valeur pour ce minerai."));
    ul.appendChild(li);
  });
  host.appendChild(ul);
}
function draw(focus) {
  var I = R.idx; if (!I || !R.built) return;
  syncInputs();
  var now = Date.now(), C = compute(I, R.f, now); R.last = C;
  legend(C.scale);
  D.Msg.textContent = ""; D.Mat.textContent = ""; D.Csv.disabled = !C.nCells;
  var fKey = FL[R.f.v], filt = !!(R.f.s || R.f.q.trim() || R.f.all);
  if (!I.ores.length || !I.refs.length) {
    D.Sum.textContent = "Aucune donnée de raffinage."; D.Note.textContent = "";
    empty(D.Mat, "Aucune donnée de raffinage", "UEX ne fournit aucun rendement de raffinerie pour le moment.", false);
  } else if (!C.rows.length || !C.cols.length) {
    D.Sum.textContent = "Aucun résultat pour ces filtres."; D.Note.textContent = "";
    empty(D.Mat, "Aucun résultat", "Aucun minerai ne correspond aux filtres (système, recherche, minerais avec donnée).", true);
  } else {
    D.Sum.textContent = plural(C.rows.length, "minerai", "minerais") + " × " + plural(C.cols.length, "raffinerie", "raffineries") + " · " + plural(C.nCells, "valeur", "valeurs") + " (« " + fKey + " »)" + (filt ? " · filtres actifs" : "") + ".";
    D.Note.textContent = "Bonus de rendement relatif en % · valeur : " + fKey;
    matrix(C, I);
    if (focus && focus.indexOf("sort:") === 0) { var b = D.Mat.querySelector('.rf-t button[data-sort="' + focus.slice(5) + '"]'); if (b) b.focus({ preventScroll: true }); }
  }
  drawBest(); drawMethods(); drawCap();
}
function drawBest() {
  var I = R.idx; if (!I) return;
  var key = FK[R.f.v], now = Date.now(), list = I.ores.filter(function (o) { return I.refs.some(function (r) { return (!R.f.s || r.sys === R.f.s) && o.cells[r.id] && o.cells[r.id][key] != null; }); });
  D.B.textContent = "";
  list.forEach(function (o) { var x = el("option", null, o.name); x.value = o.slug; D.B.appendChild(x); });
  D.Rk.textContent = ""; D.Br.textContent = "";
  if (!list.length) { D.B.disabled = true; D.Bs.textContent = "Aucun minerai à comparer."; D.Br.textContent = "Aucun minerai n’a de valeur pour ce champ et ce système."; return; }
  D.B.disabled = false;
  var ore = I.bySlug[R.f.m]; if (!ore || list.indexOf(ore) < 0) ore = list[0]; /* le choix par défaut n'est pas écrit dans l'adresse */
  D.B.value = ore.slug;
  var rk = ranking(I, R.f, ore, now), first = rk[0];
  D.Bs.textContent = "Pour " + ore.name + " : " + first.ref.name + " (" + pct(first.v) + ", " + LV[first.lv][1].toLowerCase() + ")" + (first.ties > 1 ? ". Égalité de rendement entre " + first.ties + " raffineries, départagée par la donnée la plus récente puis l’ordre alphabétique." : ".");
  D.Br.textContent = "Rendement décroissant ; à valeur égale : donnée la plus récente, puis ordre alphabétique. La charge n’entre pas dans le classement.";
  rk.forEach(function (e) {
    var li = el("li", "rf-rl"), nm = el("span", "rf-cn"); nm.appendChild(el("b", null, e.ref.name)); nm.appendChild(el("span", "mk-sm", e.ref.sys || "système inconnu"));
    var cp = capTxt(e.ref, FK[R.f.v]); nm.appendChild(el("span", "mk-sm", cp ? "Charge " + cp : "charge non fournie"));
    var vv = el("span", "rf-cv"); fillCell(vv, e, true); li.appendChild(nm); li.appendChild(vv); D.Rk.appendChild(li);
  });
}
function drawMethods() {
  var I = R.idx; if (!I) return; D.Meth.textContent = "";
  var host = D.Meth;
  if (!I.methods) { var mh = el("h3", "rf-h3", "Méthodes de raffinage"); mh.id = "rf-meth-h"; host.appendChild(mh); empty(host, "Méthodes non disponibles", "La liste des méthodes de raffinage n’a pas pu être chargée.", false); return; }
  R.tm.set(I.methods, {}); host.appendChild(R.tm.el);
  var d = I.methods.reduce(function (m, x) { return x.added && (!m || x.added > m) ? x.added : m; }, 0);
  host.appendChild(el("p", "rf-hint", "Niveaux de 1 à 3 donnés par UEX (rendement : faible, moyen, élevé ; coût : faible, moyen, élevé ; vitesse : lente, moyenne, rapide). Liste de référence" + (d ? " ajoutée le " + new Date(d).toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "") + ", sans date de mise à jour. UEX ne relie pas les méthodes aux rendements ci-dessus : aucun calcul combiné."));
}
function drawCap() {
  var I = R.idx; if (!I) return; D.Cap.textContent = "";
  var key = FK[R.f.v], now = Date.now(), host = D.Cap, rows = [];
  var vis = I.refs.filter(function (r) { return !R.f.s || r.sys === R.f.s; });
  vis.forEach(function (r) { if (r.cap && r.cap[key] != null) rows.push({ ref: r, v: r.cap[key], ageS: ageOf(r.cap.ts, now) }); });
  var h = el("h3", "rf-h3", "Charge (workload) des raffineries"); h.id = "rf-cap-h";
  if (!I.hasCap) { host.appendChild(h); empty(host, "Charge non disponible", "Les capacités des raffineries n’ont pas pu être chargées.", false); return; }
  R.tc.set(rows, { total: I.refs.some(function (r) { return r.cap; }) }); host.appendChild(R.tc.el);
  var without = vis.length - rows.length;
  if (rows.length && without > 0) host.appendChild(el("p", "rf-hint", plural(without, "raffinerie affichée n’a", "raffineries affichées n’ont") + " pas de charge fournie."));
  host.appendChild(el("p", "rf-hint", "Capacités non fournies en quantité (SCU, jours) par UEX : seulement ce pourcentage, appelé « Workload » sur sa page publique, dont la définition n’est pas précisée."));
}
function resetFilters() {
  var keep = { m: R.f.m }; R.f = copy(DEF); R.f.m = keep.m;
  syncInputs(); draw(); setUrl();
  D.Msg.textContent = ""; setTimeout(function () { D.Msg.textContent = "Filtres réinitialisés."; }, 50);
  D.V.focus({ preventScroll: true });
}

/* CSV : une ligne par minerai × raffinerie avec une valeur (cases vides omises), dans l'ordre et selon les filtres de la matrice affichée */
function exportCsv() {
  var C = R.last, now = Date.now(); if (!C || !C.nCells) return;
  var head = ["Minerai", "Code", "Raffinerie", "Système", "Valeur affichée", "Rendement : valeur choisie (%)", "Dernier (%)", "7 jours (%)", "30 jours (%)", "Niveau", "Meilleure de la ligne", "Charge (%)", "Mise à jour (UTC)", "Ancienneté (jours)", "Fraîcheur"], out = [];
  C.rows.forEach(function (r) {
    r.cells.forEach(function (c) {
      if (c.v == null) return;
      var cap = c.ref.cap ? c.ref.cap[C.key] : null, a = ageOf(c.ts, now), f = M.fresh(a, FRESH);
      out.push([r.ore.name, r.ore.code, c.ref.name, c.ref.sys, FL[R.f.v], c.v, c.d == null ? "" : c.d, c.s == null ? "" : c.s, c.m == null ? "" : c.m, LV[c.lv][1], c.best ? (c.ties > 1 ? "Oui (ex æquo)" : "Oui") : "Non",
        cap == null ? "" : cap, c.ts == null ? "" : new Date(c.ts).toISOString().replace(/\.\d+Z$/, "Z"), a == null ? "" : Math.floor(a / 86400), f.l]);
    });
  });
  M.download("raffineries-rendements.csv", M.csv(head, out));
  D.Msg.textContent = ""; setTimeout(function () { D.Msg.textContent = "Export prêt : " + plural(out.length, "ligne", "lignes") + "."; }, 50);
}

/* ───────────────────────── états du module et chargement ───────────────────────── */
function show(kind, o) {
  var st = D.state; st.textContent = "";
  D.wrap.setAttribute("aria-busy", String(kind === "loading")); D.main.hidden = kind !== "main"; st.hidden = kind === "main";
  if (kind === "loading") {
    st.appendChild(el("p", "mk-sum", "Chargement…"));
    for (var i = 0; i < 4; i++) st.appendChild(el("div", "mk-sk"));
  } else if (kind === "off") {
    var p = el("div", "pn mk-em"); p.appendChild(el("b", null, "Données de marché désactivées"));
    p.appendChild(el("p", null, "Ce serveur n'interroge pas UEX : aucun rendement de raffinerie n’est disponible. Pour activer la fonction, définissez la variable d'environnement UEX_ENABLED=1 (docker-compose.yml) puis redémarrez l'application. Le Simulateur reste utilisable avec une saisie manuelle des prix."));
    var a = el("a", null, "Documentation : activer les données de marché"); a.href = "https://github.com/A0d3n/Orbital-Services/blob/dev/docs/deploiement.md#donn%C3%A9es-de-march%C3%A9-uex-optionnel"; a.target = "_blank"; a.rel = "noopener noreferrer";
    p.appendChild(el("p")).appendChild(a); st.appendChild(p);
  } else if (kind === "fail") {
    var q = el("div", "pn mk-em"); q.appendChild(el("b", null, o.unavailable ? "Données UEX indisponibles" : "Impossible de charger les données de marché"));
    q.appendChild(el("p", null, o.unavailable ? "Le serveur n'a pas pu récupérer les données d'UEX et n'en garde aucune copie pour le moment. Réessayez dans quelques instants." : "Le serveur ne répond pas ou la réponse est illisible. Vérifiez votre connexion puis réessayez."));
    var rb = el("button", "btn", "Réessayer"); rb.type = "button"; rb.addEventListener("click", retry); q.appendChild(rb); st.appendChild(q);
  }
}
function retry() { if (D.h2) D.h2.focus({ preventScroll: true }); load(); }
function settle(rs, s, again) {
  var kinds = rs.map(function (r) { return r.kind; }), mem = M.mem;
  if (kinds.slice(0, REQ.length).indexOf("disabled") >= 0 || kinds.indexOf("disabled") >= 0) { R.idx = null; R.sig = ""; R.drawn = false; show("off"); R.bn.set({ k: "off" }); return; }
  var recs = RES.map(function (n, i) { return rs[i].rec || mem[n] || null; });
  if (recs.slice(0, REQ.length).some(function (r) { return !r; })) { var un = kinds.indexOf("unavailable") >= 0; R.idx = null; R.sig = ""; R.drawn = false; show("fail", { unavailable: un }); R.bn.set({ k: un ? "down" : "error" }); return; }
  var sig = recs.map(function (r) { return r ? r.etag + "@" + r.fetchedAt : "-"; }).join("|");
  if (sig !== R.sig || !R.idx) { R.idx = buildIndex(recs); R.sig = sig; R.drawn = false; }
  show("main");
  if (!R.drawn) { fillSelects(); syncInputs(); draw(); R.drawn = true; }
  var age = H.ageNow(recs[0]);
  if (kinds.some(function (k) { return k !== "ok"; })) { R.bn.set({ k: kinds.indexOf("unavailable") >= 0 ? "down" : "error", age: age, onRetry: retry }); return; }
  var stale = recs.some(function (r) { return r && H.isStale(r); });
  R.bn.set({ k: stale ? "stale" : "ok", age: age });
  if (stale && !again) s.later(function () { /* le serveur renouvelle en arrière-plan : une seule nouvelle demande, sans ETag */
    if (view().hidden || !R.open) return;
    Promise.all(RES.map(function (n) { return mem[n] && H.isStale(mem[n]) ? s.get2(n) : { kind: "ok", rec: mem[n] }; })).then(function (r2) { if (!s.closed) settle(r2, s, true); });
  }, M.cfg.recheck);
}
function load() {
  if (R.sess) R.sess.close();
  var s = R.sess = M.open(), tok = ++R.tok, mem = M.mem;
  s.get2 = function (res) { return M.get(res); }; /* seconde demande autorisée (donnée périmée) : hors mémo de l'ouverture */
  if (R.idx) { R.bn.set({ k: REQ.some(function (n) { return mem[n] && H.isStale(mem[n]); }) ? "stale" : "ok", age: H.ageNow(mem[RES[0]]) }); show("main"); draw(); }
  else { show("loading"); R.bn.set({ k: "loading" }); }
  Promise.all(RES.map(function (n) { return s.get(n); })).then(function (rs) { if (tok === R.tok && !s.closed) settle(rs, s, false); });
}

var raffineries = {
  /* ouverture du module (une « ouverture » = au plus une requête par ressource) ; params : paramètres de l'adresse (voir query) ; sans paramètre, l'état en cours est conservé */
  open: function (params) {
    build(); R.open = true;
    if (params && Object.keys(params).length) R.f = fromParams(params);
    if (R.idx) { fillSelects(); } syncInputs(); load(); setUrl();
  },
  /* changement d'adresse dans le même module : l'adresse est prise à la lettre, pas de nouvelle requête */
  set: function (params) {
    if (!R.built || !R.open) return;
    R.f = fromParams(params); if (R.idx) { fillSelects(); draw(); } else syncInputs();
  },
  close: function () { R.open = false; if (R.sess) { R.sess.close(); R.sess = null; } R.tok++; },
  query: query,
  title: function () { return D.h2 || $id("rfTitle"); },
  compute: compute, buildIndex: buildIndex, scaleOf: scaleOf, levelOf: levelOf, ranking: ranking,
  state: R
};
M.refineries = raffineries;
})();
