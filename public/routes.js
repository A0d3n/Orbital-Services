/* Module « Routes » du Commerce (#commerce/routes) : routes commerciales calculées LOCALEMENT à partir des prix UEX.
   Chargé après market.js (briques communes : client de données, bandeau, tableau, CSV) et avant commerce.js (sous-onglets, adresse, tiroir).
   Ressources : commodities_prices_all, commodities, terminals, star_systems, via /api/uex/<ressource> (notre serveur) ; commodities_routes n'est PAS appelée.
   Une ouverture du module = au plus une requête par ressource. Aucune distance ni durée : la donnée n'est pas fournie par les ressources en liste blanche.
   Sémantique (docs/uex-api.md) : price_buy > 0 = le joueur ACHÈTE à ce terminal ; price_sell > 0 = le joueur VEND à ce terminal.
   Règle de stock et de demande : voir docs/uex-api.md (« Routes : stock, demande et formules »), résumée dans le bloc « Formules utilisées ». */
(function () {
"use strict";
var M = window.OrbMarket, U = window.OrbUtil;
if (!M || !M.h || !U) return;
var H = M.h, el = H.el, at = H.at, plural = H.plural, NB = " ", MINUS = "−";
var RES = ["commodities_prices_all", "commodities", "terminals", "star_systems"];
var WS = new RegExp("[\\s\u00a0\u202f]", "g");
var DEF = { b: "", s: "100", m: "", de: "", vers: "", roi: "0", f: "24h", l: false, x: false };
var MAXV = { b: 1e12, s: 1e7, roi: 1e5 };
var FRESH = { "1h": 3600, "24h": 86400, tout: Infinity };
var LIMIT = 100; /* routes affichées d'abord ; « Voir plus » en ajoute 100 */
var R = { f: copy(DEF), idx: null, sig: "", sess: null, tok: 0, built: false, open: false, drawn: false, bn: null, tb: null, routes: [], ms: 0, last: null };
var D = {};

function copy(o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }
function $id(i) { return document.getElementById(i); }
function view() { return $id("v-commerce"); }
function fin(v) { v = +v; return isFinite(v) ? v : null; }
function pos(v) { v = fin(v); return v != null && v > 0 ? v : null; }
function nf(n, d) { return M.nf(n, d); }
function nrm(t) { return H.nrm(t); }

/* ───────────────────────── saisie : lecture, validation, adresse ───────────────────────── */
function readInt(raw, max, opt) {
  var t = String(raw == null ? "" : raw).replace(WS, "");
  if (t === "") return opt ? { v: null } : { err: "empty" };
  if (!/^\d+$/.test(t)) return { err: "fmt" };
  var n = Number(t); return n > max ? { err: "max" } : { v: n };
}
var MSG = {
  b: { fmt: "Le budget doit être un nombre entier positif ou nul (laissez vide pour un budget illimité).", max: "Le budget est trop grand (maximum 1" + NB + "000" + NB + "000" + NB + "000" + NB + "000 aUEC)." },
  s: { fmt: "Les SCU disponibles doivent être un nombre entier positif ou nul.", empty: "Renseignez les SCU disponibles (nombre entier positif ou nul).", max: "Les SCU disponibles sont trop nombreux (maximum 10" + NB + "000" + NB + "000)." },
  roi: { fmt: "La marge minimale doit être un nombre entier positif ou nul (en %).", max: "La marge minimale est trop grande (maximum 100" + NB + "000 %)." }
};
/* → { ok, n:{b,s,roi}, err:{b,s,roi} } ; budget vide = illimité (null), marge vide = 0 */
function validate(f) {
  var o = { ok: true, n: {}, err: {} };
  [["b", true], ["s", false], ["roi", true]].forEach(function (x) {
    var k = x[0], r = readInt(f[k], MAXV[k], x[1]);
    if (r.err) { o.ok = false; o.err[k] = MSG[k][r.err]; } else o.n[k] = k === "roi" && r.v == null ? 0 : r.v;
  });
  return o;
}
function fromParams(q) {
  var f = copy(DEF); q = q || {};
  if (q.b != null) f.b = String(q.b).trim();
  if (q.s != null) f.s = String(q.s).trim();
  if (q.m != null) f.m = String(q.m);
  if (q.de != null) f.de = String(q.de);
  if (q.vers != null) f.vers = String(q.vers);
  if (q.roi != null) f.roi = String(q.roi).trim();
  if (q.f != null && FRESH[q.f] != null && Object.prototype.hasOwnProperty.call(FRESH, q.f)) f.f = q.f;
  f.l = q.l === "1"; f.x = q.x === "1";
  return f;
}
/* ?b=<budget>&s=<SCU>&m=<marchandise>&de=<système de départ>&vers=<système d'arrivée>&roi=<marge %>&f=<1h|24h|tout>&l=1&x=1 ; valeurs par défaut et saisies invalides omises */
function query() {
  var f = R.f, v = validate(f), a = [];
  function add(k, val) { a.push(k + "=" + encodeURIComponent(val)); }
  if (v.ok && v.n.b != null) add("b", v.n.b);
  if (v.ok && v.n.s !== +DEF.s) add("s", v.n.s);
  if (f.m) add("m", f.m);
  if (f.de) add("de", f.de);
  if (f.vers) add("vers", f.vers);
  if (v.ok && v.n.roi > 0) add("roi", v.n.roi);
  if (f.f !== DEF.f) add("f", f.f);
  if (f.l) add("l", "1");
  if (f.x) add("x", "1");
  return a.length ? "?" + a.join("&") : "";
}
function setUrl() {
  if (!R.open) return;
  var h = "#commerce/routes" + query();
  if (location.hash !== h) { try { history.replaceState(null, "", h); } catch (e) {} }
}

/* ───────────────────────── index des prix ───────────────────────── */
/* marchandise → lignes « acheter » (price_buy > 0 : le joueur achète) et « vendre » (price_sell > 0 : le joueur vend) ; chaque ligne : terminal, système, prix, quantité (>0 sinon null), état d'inventaire, date (ms) */
function buildIndex(recs) {
  var prices = recs[0].data, coms = recs[1].data, terms = recs[2].data, syss = recs[3].data;
  prices = Array.isArray(prices) ? prices : []; coms = Array.isArray(coms) ? coms : []; terms = Array.isArray(terms) ? terms : []; syss = Array.isArray(syss) ? syss : [];
  var tm = {}, byId = {}, bySlug = Object.create(null), list = [], sysUsed = Object.create(null), anyIll = false;
  terms.forEach(function (t) { if (t && t.id != null) tm[t.id] = { name: String(t.name || ""), sys: String(t.star_system_name || "") }; });
  function add(id, name, slug, illegal) {
    var c = { id: id, name: name, slug: "", illegal: illegal, buy: [], sell: [] };
    var s = (slug || nrm(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "m" + id).toLowerCase();
    while (bySlug[s]) s += "-" + id;
    c.slug = s; byId[id] = c; bySlug[s] = c; list.push(c); return c;
  }
  coms.forEach(function (c) {
    if (!c || c.id == null || !c.name) return;
    if (c.is_illegal != null) anyIll = true;
    add(c.id, String(c.name), String(c.slug || ""), +c.is_illegal === 1 || c.is_illegal === true);
  });
  prices.forEach(function (r) {
    if (!r) return;
    var c = byId[r.id_commodity] || (r.id_commodity != null && r.commodity_name ? add(r.id_commodity, String(r.commodity_name), "", false) : null); if (!c) return;
    var t = tm[r.id_terminal] || { name: "", sys: "" }, d = fin(r.date_modified), ts = d && d > 0 ? (d < 1e11 ? d * 1000 : d) : null;
    var tn = String(r.terminal_name || t.name || "Terminal " + r.id_terminal);
    if (t.sys) sysUsed[t.sys] = 1;
    function row(price, qty, st) { return { tid: r.id_terminal, t: tn, sys: t.sys, price: price, qty: pos(qty), status: fin(st), ts: ts }; }
    var pb = pos(r.price_buy), ps = pos(r.price_sell);
    if (pb != null) c.buy.push(row(pb, r.scu_buy, r.status_buy));
    if (ps != null) c.sell.push(row(ps, r.scu_sell, r.status_sell));
  });
  var coll = H.coll;
  list = list.filter(function (c) { return c.buy.length + c.sell.length > 0; });
  list.sort(function (a, b) { return coll.compare(a.name, b.name); });
  var names = syss.map(function (s) { return s && s.name ? String(s.name) : ""; }).filter(function (n) { return n && sysUsed[n]; });
  Object.keys(sysUsed).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
  names.sort(function (a, b) { return coll.compare(a, b); });
  return { list: list, bySlug: bySlug, systems: names, hasIllegal: anyIll };
}

/* ───────────────────────── calcul ─────────────────────────
   f : { b (aUEC ou null = illimité), s (SCU), m (slug), de, vers, roi (%), f ("1h"|"24h"|"tout"), l (légal seulement), x (ignorer stock et demande) } ; now en ms.
   Pour chaque marchandise, chaque terminal d'achat (price_buy > 0) × chaque terminal de vente (price_sell > 0), terminaux différents, vente > achat. */
function compute(I, f, now) {
  var out = [], maxAge = FRESH[f.f] != null ? FRESH[f.f] : FRESH["24h"], cap = f.s, bud = f.b == null ? Infinity : f.b;
  I.list.forEach(function (c) {
    if (f.m && c.slug !== f.m) return;
    if (f.l && c.illegal) return;
    if (!c.buy.length || !c.sell.length) return;
    c.buy.forEach(function (b) {
      if (f.de && b.sys !== f.de) return;
      var ab = b.ts == null ? null : Math.max(0, (now - b.ts) / 1000);
      if (maxAge !== Infinity && (ab == null || ab > maxAge)) return;
      var sl = Infinity, bu = false; /* stock à l'achat */
      if (!f.x) { if (b.qty != null) sl = Math.floor(b.qty); else if (b.status === 1) return; else bu = true; } /* 0 + « rupture » (état 1) : écartée ; 0 sinon : inconnu, ne limite pas */
      var bl = bud === Infinity ? Infinity : Math.floor(bud / b.price);
      if (Math.min(cap, bl, sl) < 1) return;
      c.sell.forEach(function (s) {
        if (s.tid === b.tid || (f.vers && s.sys !== f.vers)) return;
        var pps = s.price - b.price; if (pps <= 0) return;
        if (pps * 100 < f.roi * b.price) return;
        var as = s.ts == null ? null : Math.max(0, (now - s.ts) / 1000);
        if (maxAge !== Infinity && (as == null || as > maxAge)) return;
        var dl = Infinity, su = false; /* demande à la vente */
        if (!f.x) { if (s.qty != null) dl = Math.floor(s.qty); else if (s.status === 7) return; else su = true; } /* 0 + « aucune demande » (état 7) : écartée ; 0 sinon : inconnue */
        var scu = Math.min(cap, bl, sl, dl); if (!(scu >= 1)) return;
        var inv = scu * b.price, rev = scu * s.price;
        out.push({ c: c, b: b, s: s, scu: scu, lim: scu === sl ? "stock" : scu === dl ? "demande" : scu === bl ? "budget" : "soute", bu: bu, su: su,
          pps: pps, inv: inv, rev: rev, tot: rev - inv, roi: pps / b.price, ageS: ab == null || as == null ? null : Math.max(ab, as) });
      });
    });
  });
  var coll = H.coll;
  out.sort(function (x, y) { return y.tot - x.tot || coll.compare(x.c.name, y.c.name) || coll.compare(x.b.t, y.b.t) || coll.compare(x.s.t, y.s.t); });
  return out;
}

/* ───────────────────────── interface ───────────────────────── */
var TIPS = {
  scu: "SCU utilisés = minimum entre vos SCU disponibles, budget ÷ prix d’achat (arrondi à l’entier inférieur), stock à l’achat et demande à la vente",
  inv: "Investissement = prix d’achat × SCU utilisés",
  rev: "Revenu = prix de vente × SCU utilisés",
  pps: "Bénéfice par SCU = prix de vente " + MINUS + " prix d’achat",
  tot: "Bénéfice total = revenu " + MINUS + " investissement",
  roi: "ROI = (prix de vente " + MINUS + " prix d’achat) ÷ prix d’achat"
};
var LIMTXT = { stock: "limité par le stock", demande: "limitée par la demande", budget: "limité par le budget", soute: "limité par la soute" };

function field(id, label, input, hint) {
  return '<div class="mk-fld"><label for="' + id + '">' + label + "</label>" + input + (hint ? '<p class="rc-hint" id="' + id + '-h">' + hint + "</p>" : "") + '<p class="rc-err" id="' + id + '-e"></p></div>';
}
function build() {
  if (R.built) return; R.built = true;
  D.h2 = $id("rcTitle"); D.wrap = $id("rcWrap"); D.state = $id("rcState"); D.main = $id("rcMain");
  R.bn = M.Banner($id("rcBanner"));
  var num = function (id) { return '<input id="' + id + '" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" aria-describedby="@h@e">'; };
  var inp = function (id, hint) { return num(id).replace("@h", hint ? id + "-h " : "").replace("@e", id + "-e"); };
  D.main.innerHTML =
    '<div class="rc-warn" role="note"><b>Les prix sont des estimations communautaires.</b> Routes calculées localement, sans promesse de précision : stock, demande et prix changent en jeu.</div>' +
    '<div class="pn"><div class="rc-flt">' +
    field("rcB", "Budget (aUEC)", inp("rcB", true), "Optionnel : vide = illimité.") +
    field("rcS", "SCU disponibles", inp("rcS", true), "Capacité de votre vaisseau.") +
    field("rcM", "Marchandise", '<select id="rcM"></select>') +
    field("rcDe", "Système de départ", '<select id="rcDe"></select>') +
    field("rcVers", "Système d’arrivée", '<select id="rcVers"></select>') +
    field("rcRoi", "Marge minimale (ROI %)", inp("rcRoi", true), "Entier, en %.") +
    field("rcF", "Fraîcheur des deux prix", '<select id="rcF"><option value="1h">Frais (≤ 1 h)</option><option value="24h">Frais et à vérifier (≤ 24 h)</option><option value="tout">Tout, même périmé</option></select>') +
    '<div class="rc-chks"><label class="rc-chk"><input type="checkbox" id="rcL"><span>Marchandises légales uniquement</span></label>' +
    '<label class="rc-chk"><input type="checkbox" id="rcX"><span>Ignorer le stock et la demande</span></label></div>' +
    '<p class="rc-hint" id="rcLn" hidden>Information « marchandise illégale » non fournie par UEX : le filtre est indisponible.</p>' +
    '<div class="rc-acts"><button type="button" class="btn" id="rcReset">Réinitialiser les filtres</button><button type="button" class="btn" id="rcCsv">Exporter en CSV</button></div>' +
    '</div></div>' +
    '<p class="mk-sum" id="rcSum" aria-live="polite" aria-atomic="true"></p><p class="mk-msg" id="rcMsg" role="status"></p><div id="rcRes" class="mk-stack"></div>' +
    '<details class="rc-fm" id="rcFm"><summary>Formules utilisées</summary><ul>' +
    "<li>Bénéfice par SCU = prix de vente " + MINUS + " prix d’achat (seules les routes à bénéfice par SCU positif sont gardées)</li>" +
    "<li>SCU utilisés = minimum entre vos SCU disponibles, budget ÷ prix d’achat (arrondi à l’entier inférieur), stock à l’achat et demande à la vente</li>" +
    "<li>Investissement = prix d’achat × SCU utilisés</li><li>Revenu = prix de vente × SCU utilisés</li><li>Bénéfice total = revenu " + MINUS + " investissement</li>" +
    "<li>ROI = (prix de vente " + MINUS + " prix d’achat) ÷ prix d’achat</li></ul>" +
    "<p><b>Stock et demande (règle prudente).</b> Une quantité connue (stock à l’achat, demande à la vente) limite les SCU. Une quantité à 0 peut vouloir dire « inconnue » ou « épuisée » : " +
    "si l’état d’inventaire du terminal indique une rupture à l’achat ou « aucune demande » à la vente, la route est écartée ; sinon la quantité est considérée comme inconnue, elle ne limite pas et la ligne l’indique. " +
    "« Ignorer le stock et la demande » supprime ces limites et ces exclusions.</p>" +
    "<p>Distance et durée : non fournies par les données disponibles, donc aucun classement par trajet.</p></details>";
  ["B", "S", "M", "De", "Vers", "Roi", "F", "L", "X"].forEach(function (k) { D[k] = $id("rc" + k); });
  D.sum = $id("rcSum"); D.msg = $id("rcMsg"); D.res = $id("rcRes"); D.csv = $id("rcCsv"); D.reset = $id("rcReset"); D.ln = $id("rcLn");
  var cols = [
    { k: "c", h: "Marchandise", type: "t", first: true, val: function (r) { return r.c.name; }, cell: cellCom },
    { k: "f", h: "Achat à", type: "t", val: function (r) { return r.b.t; }, cell: function (r) { return cellTerm(r.b); } },
    { k: "t", h: "Vente à", type: "t", val: function (r) { return r.s.t; }, cell: function (r) { return cellTerm(r.s); } },
    { k: "scu", h: "SCU utilisés", type: "n", n: true, tip: TIPS.scu, val: function (r) { return r.scu; }, cell: cellScu },
    { k: "inv", h: "Investissement", type: "n", n: true, tip: TIPS.inv, val: function (r) { return r.inv; }, cell: function (r) { return M.num(r.inv, "aUEC"); } },
    { k: "rev", h: "Revenu", type: "n", n: true, tip: TIPS.rev, val: function (r) { return r.rev; }, cell: function (r) { return M.num(r.rev, "aUEC"); } },
    { k: "pps", h: "Bénéfice / SCU", type: "n", n: true, tip: TIPS.pps, val: function (r) { return r.pps; }, cell: function (r) { return M.num(r.pps, "aUEC"); } },
    { k: "tot", h: "Bénéfice total", type: "n", n: true, tip: TIPS.tot, val: function (r) { return r.tot; }, cell: function (r) { return M.num(r.tot, "aUEC"); } },
    { k: "roi", h: "ROI", type: "n", n: true, tip: TIPS.roi, val: function (r) { return r.roi; }, cell: function (r) { return nf(r.roi * 100, 1) + NB + "%"; } },
    { k: "a", h: "Action", hsr: true, nl: true, cell: cellAct }
  ];
  R.tb = M.Table({ id: "rc-t", title: "Routes proposées", columns: cols, def: ["tot", -1], limit: LIMIT, onReset: resetFilters,
    note: function () { return "Prix en aUEC par SCU · Distance non disponible"; },
    empty: function (ctx) { return ctx.none ? { title: "Aucune donnée de prix", text: "Aucun prix n’est disponible pour calculer des routes.", reset: false } : { title: "Aucune route ne correspond à vos filtres", text: ctx.hint, reset: true }; } });
  R.tb.el.classList.add("rc-tw");

  ["B", "S", "Roi"].forEach(function (k) { D[k].addEventListener("input", function () { R.f[k.toLowerCase()] = D[k].value; schedule(); }); D[k].addEventListener("blur", flush); });
  [["M", "m"], ["De", "de"], ["Vers", "vers"], ["F", "f"]].forEach(function (x) { D[x[0]].addEventListener("change", function () { R.f[x[1]] = D[x[0]].value; flush(); }); });
  [["L", "l"], ["X", "x"]].forEach(function (x) { D[x[0]].addEventListener("change", function () { R.f[x[1]] = D[x[0]].checked; flush(); }); });
  D.reset.addEventListener("click", resetFilters);
  D.csv.addEventListener("click", exportCsv);
}
var timer = 0;
function schedule() { clearTimeout(timer); timer = setTimeout(recalc, 180); }
function flush() { clearTimeout(timer); timer = 0; recalc(); }

function cellCom(r) {
  var w = el("div", "rc-cm"), top = el("div", "rc-nm");
  top.appendChild(el("b", null, r.c.name));
  if (r.c.illegal) top.appendChild(el("span", "rc-ill", "illégale"));
  w.appendChild(top);
  var fr = el("div", "rc-fr"); fr.appendChild(H.pill(r.ageS)); fr.appendChild(el("span", "mk-ag", r.ageS == null ? "date inconnue" : M.ageLabel(r.ageS)));
  w.appendChild(fr); return w;
}
function cellTerm(x) {
  var w = el("span", "rc-v"); w.appendChild(el("b", null, x.t));
  w.appendChild(el("span", "mk-sm", x.sys || "système inconnu"));
  w.appendChild(el("span", "mk-sm", nf(x.price) + NB + "aUEC/SCU")); return w;
}
function cellScu(r) {
  var w = el("span", "rc-v"); w.appendChild(M.num(r.scu, "SCU"));
  w.appendChild(el("span", "rc-lim", LIMTXT[r.lim]));
  if (r.bu) w.appendChild(el("span", "rc-lim", "stock inconnu"));
  if (r.su) w.appendChild(el("span", "rc-lim", "demande inconnue"));
  return w;
}
function place(x) { return (x.t + (x.sys ? " (" + x.sys + ")" : "")).slice(0, 80); }
function cellAct(r) {
  var b = el("button", "btn", "Simuler ce trade"); b.type = "button"; b.setAttribute("aria-haspopup", "dialog");
  b.appendChild(el("span", "sr", " : " + r.c.name + ", de " + r.b.t + " vers " + r.s.t));
  b.addEventListener("click", function () { sim(r, b); });
  return b;
}
/* « Simuler ce trade » : ouvre le tiroir du Simulateur (commerce.js) PRÉREMPLI ; rien n'est enregistré avant la validation du tiroir */
function sim(r, btn) {
  var fn = window.__orbCommerceSim; if (typeof fn !== "function") return;
  fn({ cm: r.c.name.slice(0, 80), scu: String(r.scu), buy: String(Math.round(r.b.price)), sell: String(Math.round(r.s.price)), from: place(r.b), to: place(r.s) }, btn,
    function (msg) { D.msg.textContent = ""; setTimeout(function () { D.msg.textContent = msg; }, 50); });
}

function drawSelects() {
  var I = R.idx, f = R.f;
  function fill(sel, first, items, cur) {
    sel.textContent = ""; var o = el("option", null, first); o.value = ""; sel.appendChild(o);
    items.forEach(function (it) { var x = el("option", null, it[1]); x.value = it[0]; sel.appendChild(x); });
    var ok = !cur || items.some(function (it) { return it[0] === cur; }); sel.value = ok ? cur : ""; return ok ? cur : "";
  }
  f.m = fill(D.M, "Toutes", I.list.filter(function (c) { return c.buy.length && c.sell.length; }).map(function (c) { return [c.slug, c.name]; }), f.m);
  f.de = fill(D.De, "Tous les systèmes", I.systems.map(function (n) { return [n, n]; }), f.de);
  f.vers = fill(D.Vers, "Tous les systèmes", I.systems.map(function (n) { return [n, n]; }), f.vers);
  D.L.disabled = !I.hasIllegal; D.ln.hidden = I.hasIllegal;
  if (I.hasIllegal) D.L.removeAttribute("aria-describedby"); else D.L.setAttribute("aria-describedby", "rcLn");
}
function syncInputs() {
  var f = R.f; D.B.value = f.b; D.S.value = f.s; D.Roi.value = f.roi; D.F.value = f.f; D.L.checked = !!f.l; D.X.checked = !!f.x;
  if (R.idx) drawSelects(); else { D.M.value = f.m; D.De.value = f.de; D.Vers.value = f.vers; }
}
function resetFilters() {
  clearTimeout(timer); R.f = copy(DEF); syncInputs(); recalc();
  D.msg.textContent = ""; setTimeout(function () { D.msg.textContent = "Filtres réinitialisés."; }, 50);
  D.B.focus({ preventScroll: true });
}
function put(k, msg) {
  var i = { b: D.B, s: D.S, roi: D.Roi }[k], p = $id(i.id + "-e");
  p.textContent = msg ? "Erreur : " + msg : "";
  if (msg) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid");
}
function panel(title, text) { var p = el("div", "pn mk-em"); p.appendChild(el("b", null, title)); p.appendChild(el("p", null, text)); return p; }
function budgetTxt(n) { return n == null ? "un budget illimité" : "un budget de " + nf(n) + NB + "aUEC"; }

/* suggestions quand rien ne correspond : chaque assouplissement testé seul, avec le nombre de routes qu'il ferait apparaître */
function hints(I, F, now) {
  var tries = [];
  if (F.f !== "tout") tries.push(["élargir la fraîcheur à « Tout, même périmé »", { f: "tout" }]);
  if (F.roi > 0) tries.push(["baisser la marge minimale", { roi: 0 }]);
  if (!F.x) tries.push(["cocher « Ignorer le stock et la demande »", { x: true }]);
  if (F.l) tries.push(["décocher « Marchandises légales uniquement »", { l: false }]);
  if (F.m) tries.push(["choisir « Toutes » les marchandises", { m: "" }]);
  if (F.de) tries.push(["choisir « Tous les systèmes » au départ", { de: "" }]);
  if (F.vers) tries.push(["choisir « Tous les systèmes » à l’arrivée", { vers: "" }]);
  if (F.b != null) tries.push(["retirer le budget", { b: null }]);
  tries.push(["augmenter les SCU disponibles", { s: Math.max(F.s * 100, 1000) }]);
  var out = [];
  tries.forEach(function (t) { var g = copy(F); for (var k in t[1]) g[k] = t[1][k]; var n = compute(I, g, now).length; if (n) out.push(t[0] + " (" + plural(n, "route", "routes") + ")"); });
  return "Aucune route ne répond à tous les critères." + (out.length ? " Pour en voir, essayez de " + out.join(", ou de ") + "." : " Aucun assouplissement ne ferait apparaître de route avec les prix actuels.");
}

function recalc() {
  if (!R.idx || !R.built) return;
  var f = R.f, v = validate(f);
  put("b", v.err.b); put("s", v.err.s); put("roi", v.err.roi);
  D.res.textContent = ""; D.csv.disabled = true;
  if (!v.ok) {
    R.routes = []; D.sum.textContent = "Résultats masqués : corrigez les champs signalés.";
    D.res.appendChild(panel("Saisie à corriger", "Les routes s’afficheront dès que les champs signalés en erreur seront corrigés.")); setUrl(); return;
  }
  var F = { b: v.n.b, s: v.n.s, roi: v.n.roi, m: f.m, de: f.de, vers: f.vers, f: f.f, l: !!f.l, x: !!f.x }, now = Date.now(), t0 = performance.now();
  var rows = compute(R.idx, F, now); R.ms = performance.now() - t0; R.routes = rows; R.last = F;
  var none = !R.idx.list.some(function (c) { return c.buy.length && c.sell.length; });
  var best = rows.reduce(function (m, r) { return Math.max(m, r.roi); }, 0);
  D.sum.textContent = (rows.length ? plural(rows.length, "route", "routes") : "Aucune route") + " pour " + budgetTxt(F.b) + " et " + nf(F.s) + NB + "SCU" + (rows.length ? " · meilleur ROI " + nf(best * 100, 1) + NB + "%" : "");
  R.tb.set(rows, { none: none, hint: rows.length || none ? "" : hints(R.idx, F, now) });
  D.res.appendChild(R.tb.el); D.csv.disabled = !rows.length;
  setUrl();
}
function exportCsv() {
  var rows = R.tb.sorted(); if (!rows.length) return;
  var head = ["Marchandise", "Achat à (terminal)", "Système d'achat", "Vente à (terminal)", "Système de vente", "SCU utilisés", "Prix d'achat (aUEC/SCU)", "Prix de vente (aUEC/SCU)", "Investissement (aUEC)", "Revenu (aUEC)",
    "Bénéfice par SCU (aUEC)", "Bénéfice total (aUEC)", "ROI (%)", "Limité par", "Stock à l'achat (SCU)", "Demande à la vente (SCU)", "Ancienneté du plus ancien prix (min)", "Fraîcheur"];
  var out = rows.map(function (r) {
    return [r.c.name, r.b.t, r.b.sys, r.s.t, r.s.sys, r.scu, r.b.price, r.s.price, r.inv, r.rev, r.pps, r.tot, Math.round(r.roi * 1000) / 10, r.lim,
      r.b.qty == null ? "" : r.b.qty, r.s.qty == null ? "" : r.s.qty, r.ageS == null ? "" : Math.floor(r.ageS / 60), M.fresh(r.ageS).l];
  });
  M.download("routes-commerciales.csv", M.csv(head, out));
  D.msg.textContent = "Export prêt : " + plural(out.length, "ligne", "lignes") + ".";
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
    p.appendChild(el("p", null, "Ce serveur n'interroge pas UEX : aucune route ne peut être calculée. Pour activer la fonction, définissez la variable d'environnement UEX_ENABLED=1 (docker-compose.yml) puis redémarrez l'application. Le Simulateur reste utilisable avec une saisie manuelle des prix."));
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
  if (kinds.indexOf("disabled") >= 0) { R.idx = null; R.sig = ""; R.drawn = false; show("off"); R.bn.set({ k: "off" }); return; }
  var recs = RES.map(function (n, i) { return rs[i].rec || mem[n]; });
  if (recs.some(function (r) { return !r; })) { var un = kinds.indexOf("unavailable") >= 0; R.idx = null; R.sig = ""; R.drawn = false; show("fail", { unavailable: un }); R.bn.set({ k: un ? "down" : "error" }); return; }
  var sig = recs.map(function (r) { return r.etag + "@" + r.fetchedAt; }).join("|");
  if (sig !== R.sig || !R.idx) { R.idx = buildIndex(recs); R.sig = sig; R.drawn = false; }
  show("main");
  if (!R.drawn) { drawSelects(); syncInputs(); recalc(); R.drawn = true; }
  var age = H.ageNow(recs[0]);
  if (kinds.some(function (k) { return k !== "ok"; })) { R.bn.set({ k: kinds.indexOf("unavailable") >= 0 ? "down" : "error", age: age, onRetry: retry }); return; }
  var stale = recs.some(H.isStale);
  R.bn.set({ k: stale ? "stale" : "ok", age: age });
  if (stale && !again) s.later(function () { /* le serveur renouvelle en arrière-plan : une seule nouvelle demande, sans ETag */
    if (view().hidden || !R.open) return;
    Promise.all(RES.map(function (n) { return H.isStale(mem[n]) ? s.get2(n) : { kind: "ok", rec: mem[n] }; })).then(function (r2) { if (!s.closed) settle(r2, s, true); });
  }, M.cfg.recheck);
}
function load() {
  if (R.sess) R.sess.close();
  var s = R.sess = M.open(), tok = ++R.tok, mem = M.mem;
  s.get2 = function (res) { return M.get(res); }; /* seconde demande autorisée (donnée périmée) : hors mémo de l'ouverture */
  if (R.idx) { R.bn.set({ k: RES.some(function (n) { return H.isStale(mem[n]); }) ? "stale" : "ok", age: H.ageNow(mem[RES[0]]) }); show("main"); recalc(); }
  else { show("loading"); R.bn.set({ k: "loading" }); }
  Promise.all(RES.map(function (n) { return s.get(n); })).then(function (rs) { if (tok === R.tok && !s.closed) settle(rs, s, false); });
}

var routes = {
  /* ouverture du module (une « ouverture » = au plus une requête par ressource) ; params : paramètres de l'adresse (voir query) ; sans paramètre, l'état en cours est conservé */
  open: function (params) {
    build(); R.open = true;
    if (params && Object.keys(params).length) R.f = fromParams(params);
    syncInputs(); load(); setUrl();
  },
  /* changement d'adresse dans le même module : l'adresse est prise à la lettre, pas de nouvelle requête */
  set: function (params) {
    if (!R.built || !R.open) return;
    R.f = fromParams(params); syncInputs(); if (R.idx) recalc();
  },
  close: function () { R.open = false; clearTimeout(timer); if (R.sess) { R.sess.close(); R.sess = null; } R.tok++; },
  query: query,
  title: function () { return D.h2 || $id("rcTitle"); },
  compute: compute, buildIndex: buildIndex, validate: validate,
  state: R
};
M.routes = routes;
})();
