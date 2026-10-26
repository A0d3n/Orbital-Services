/* Marché (données UEX) : brique commune des modules de l'onglet Commerce, puis module « Prix » (#commerce/prix).
   Un seul espace de noms global, window.OrbMarket. Chargé avant commerce.js (qui gère les sous-onglets et l'adresse).
   1. Client de données : GET /api/uex/<ressource> (notre serveur, jamais UEX directement), requêtes en vol dédoublonnées,
      cache mémoire de session, revalidation par ETag (If-None-Match) à chaque ouverture d'un module, délai de sécurité (30 s).
      Aucune requête tant qu'un module n'est pas ouvert ; au plus une requête par ressource et par ouverture
      (exception : une ressource déclarée périmée est redemandée une seule fois, sans ETag, 10 s plus tard, le temps que le serveur la renouvelle).
   2. Aides : formats français, valeurs abrégées avec valeur exacte, tri stable, export CSV, tableaux/cartes, bandeau de fraîcheur.
   3. Module Prix : OrbMarket.prix.open(params) / set(params) / close() / query().
   Sémantique des champs UEX (voir docs/uex-api.md) : price_buy > 0 = le JOUEUR ACHÈTE à ce terminal (« Où acheter », stock = scu_buy) ;
   price_sell > 0 = le JOUEUR VEND à ce terminal (« Où vendre », demande = scu_sell). */
(function () {
"use strict";
var U = window.OrbUtil;
var NB = "\u00a0", MINUS = "\u2212", EM = "\u2014";
var UEX_URL = "https://uexcorp.space";
var DOC_URL = "https://github.com/A0d3n/Orbital-Services/blob/dev/docs/deploiement.md#donn%C3%A9es-de-march%C3%A9-uex-optionnel";
/* durées de validité annoncées (docs/uex-api.md) : sert seulement à reconnaître une donnée périmée (en plus du drapeau stale du serveur) */
var TTL = { commodities_prices_all: 1800, commodities: 3600, terminals: 43200, star_systems: 86400, fuel_prices_all: 1800, refineries_yields: 86400, refineries_methods: 86400,
  refineries_capacities: 86400, vehicles: 43200, vehicles_purchases_prices_all: 43200, vehicles_rentals_prices_all: 43200, game_versions: 86400 };
var cfg = { timeout: 30000, recheck: 10000, limit: 200 };

function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function at(e, o) { for (var k in o) e.setAttribute(k, o[k]); return e; }
function plural(n, one, many) { return n + NB + (n > 1 ? many : one); }

/* ───────────────────────── formats ───────────────────────── */
function nf(n, dec) {
  n = +n; if (!isFinite(n)) return EM;
  var s = Math.abs(n).toFixed(dec | 0).split("."), r = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, NB) + (s[1] ? "," + s[1] : "");
  return (n < 0 && +s.join(".") !== 0 ? MINUS : "") + r;
}
var UNITS = [[1e9, "Md"], [1e6, "M"], [1e3, "k"]];
/* 58000000 → « 58M », 302000 → « 302k », 1250000 → « 1,3M » ; sous 10 000 : null (on affiche la valeur entière) */
function short(n) {
  n = +n; var a = Math.abs(n); if (!isFinite(n) || a < 1e4) return null;
  var i = a >= 1e9 ? 0 : a >= 1e6 ? 1 : 2, v = Math.round(a / UNITS[i][0] * 10) / 10;
  if (v >= 1000 && i > 0) { i--; v = Math.round(a / UNITS[i][0] * 10) / 10; }
  return (n < 0 ? MINUS : "") + String(v).replace(".", ",") + UNITS[i][1];
}
var DASH_TXT = "non renseigné";
function dash() { var f = document.createDocumentFragment(); f.appendChild(at(el("span", null, EM), { "aria-hidden": "true" })); f.appendChild(el("span", "sr", DASH_TXT)); return f; }
/* valeur abrégée : le texte exact (« 58 000 000 SCU ») est lu par les lecteurs d'écran et affiché en info-bulle au survol ET au focus clavier */
function num(n, unit) {
  var s = short(n), x = nf(n) + (unit ? NB + unit : "");
  if (!s) return document.createTextNode(nf(n));
  var w = at(el("span", "mk-num"), { tabindex: "0", "data-x": x });
  w.appendChild(at(el("span", null, s), { "aria-hidden": "true" })); w.appendChild(el("span", "sr", x));
  return w;
}
function ageLabel(s) {
  if (s == null || !(s >= 0)) return "";
  if (s < 60) return "à l'instant";
  var m = Math.floor(s / 60); if (m < 60) return "il y a " + m + NB + "min";
  var h = Math.floor(s / 3600); if (h < 24) return "il y a " + h + NB + "h";
  return "il y a " + Math.floor(s / 86400) + NB + "j";
}
/* fraîcheur d'une donnée : Frais ≤ 1 h, À vérifier ≤ 24 h, Périmé > 24 h ; date absente : « Date inconnue » (rangée avec les périmées) */
/* lim : seuils en secondes [Frais, À vérifier] (défaut [3600, 86400] ; le module Raffineries, dont les données sont mensuelles, passe [7 j, 30 j]) */
function fresh(ageS, lim) {
  lim = lim || [3600, 86400];
  if (ageS == null || !(ageS >= 0)) return { c: "bad", l: "Date inconnue", s: "○" };
  return ageS <= lim[0] ? { c: "ok", l: "Frais", s: "●" } : ageS <= lim[1] ? { c: "warn", l: "À vérifier", s: "◐" } : { c: "bad", l: "Périmé", s: "○" };
}
function pill(ageS, lim) {
  var f = fresh(ageS, lim), p = el("span", "mk-f " + f.c);
  p.appendChild(at(el("span", null, f.s), { "aria-hidden": "true" })); p.appendChild(document.createTextNode(f.l));
  return p;
}

/* ───────────────────────── tri et CSV ───────────────────────── */
var COLL = typeof Intl !== "undefined" && Intl.Collator ? new Intl.Collator("fr", { sensitivity: "accent", numeric: true }) : { compare: function (a, b) { return a < b ? -1 : a > b ? 1 : 0; } };
/* tri stable ; valeurs vides toujours en dernier ; type « n » numérique, « t » texte (accents français, nombres naturels : L2 avant L10) */
function sortRows(rows, val, type, dir) {
  var a = rows.map(function (r, i) { return { r: r, i: i, v: val(r) }; });
  var empty = function (o) { return o.v == null || o.v === "" || (type === "n" && !isFinite(o.v)); };
  a.sort(function (x, y) {
    var xe = empty(x), ye = empty(y);
    if (xe || ye) return xe && ye ? x.i - y.i : xe ? 1 : -1;
    var c = type === "n" ? x.v - y.v : COLL.compare(String(x.v), String(y.v));
    return c ? (c < 0 ? -1 : 1) * dir : x.i - y.i;
  });
  return a.map(function (o) { return o.r; });
}
/* un texte qui commence par = + - @ (ou tabulation, retour chariot) serait lu comme une formule par un tableur : apostrophe devant */
function csvTxt(v) { v = String(v == null ? "" : v); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; }
function csvCell(v) {
  if (typeof v === "number") v = isFinite(v) ? String(v).replace(".", ",") : ""; else v = csvTxt(v);
  return /[";\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function csv(header, rows) { return "\ufeff" + [header].concat(rows).map(function (r) { return r.map(csvCell).join(";"); }).join("\r\n") + "\r\n"; }
function download(name, text) {
  var b = new Blob([text], { type: "text/csv;charset=utf-8" }), a = el("a"), u = URL.createObjectURL(b);
  a.href = u; a.download = name; a.hidden = true; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 600);
}

/* ───────────────────────── client de données ───────────────────────── */
var mem = {}, flying = {};
function ageNow(rec) { return Math.max(0, rec.age0 + (Date.now() - rec.at) / 1000); }
function isStale(rec) { return !!rec && (rec.stale || ageNow(rec) > (TTL[rec.res] || 1e9)); }
function fetchRes(res) {
  if (flying[res]) return flying[res];
  var rec = mem[res], etag = rec && rec.etag && !isStale(rec) ? rec.etag : null; /* périmée : on redemande sans ETag pour apprendre si le serveur l'a renouvelée */
  var ac = typeof AbortController === "function" ? new AbortController() : null, to = 0;
  var opt = { headers: etag ? { Accept: "application/json", "If-None-Match": etag } : { Accept: "application/json" }, cache: "no-store" };
  if (ac) opt.signal = ac.signal;
  var timeout = new Promise(function (ok) { to = setTimeout(function () { if (ac) { try { ac.abort(); } catch (e) {} } ok({ kind: "error", code: "timeout" }); }, cfg.timeout); });
  var req = fetch("/api/uex/" + res, opt).then(function (r) {
    if (r.status === 304) return rec ? { kind: "ok", rec: rec, same: true } : { kind: "error", code: "http_304" };
    if (r.status === 404) return r.json().catch(function () { return null; }).then(function (j) { return j && j.error === "uex_disabled" ? { kind: "disabled" } : { kind: "error", code: "http_404" }; });
    if (r.status === 503) return { kind: "unavailable" };
    if (!r.ok) return { kind: "error", code: "http_" + r.status };
    return r.json().then(function (j) {
      if (!j || j.status !== "ok" || j.data == null || typeof j.data !== "object") return { kind: "error", code: "invalid" };
      var f = Date.parse(j.fetched_at), a = +j.age_s;
      mem[res] = { res: res, etag: r.headers.get("ETag") || "", data: j.data, at: Date.now(), age0: isFinite(a) && a >= 0 ? a : (isFinite(f) ? Math.max(0, (Date.now() - f) / 1000) : 0),
        fetchedAt: isFinite(f) ? f : Date.now(), stale: j.stale === true };
      return { kind: "ok", rec: mem[res] };
    }, function () { return { kind: "error", code: "invalid" }; });
  }).catch(function (e) { return { kind: "error", code: e && e.name === "AbortError" ? "timeout" : "network" }; });
  var p = Promise.race([req, timeout]).then(function (r) { clearTimeout(to); delete flying[res]; return r; });
  flying[res] = p;
  return p;
}
/* une « ouverture » de module : au plus une requête par ressource ; fermer annule les temporisations (les requêtes en vol finissent dans le cache) */
function openSession() {
  var s = { closed: false, memo: {}, timers: [] };
  s.get = function (res) { return s.memo[res] || (s.memo[res] = fetchRes(res)); };
  s.later = function (fn, ms) { s.timers.push(setTimeout(function () { if (!s.closed) fn(); }, ms)); };
  s.close = function () { s.closed = true; s.timers.forEach(clearTimeout); s.timers = []; };
  return s;
}

/* ───────────────────────── bandeau de fraîcheur ───────────────────────── */
function badge() {
  var a = el("a", "cm-badge", "Powered by UEX"); a.href = UEX_URL; a.target = "_blank"; a.rel = "noopener noreferrer";
  a.setAttribute("aria-label", "Powered by UEX Corp, site externe"); return a;
}
/* host : conteneur persistant (aria-live="polite"). set({k, age, onRetry}) ; k : loading | ok | stale | down | error | off | none
   (down = service UEX indisponible, error = réseau ou serveur muet ; age = âge en secondes de la dernière version connue) */
function Banner(host) {
  at(host, { "aria-live": "polite", "aria-atomic": "true" }); host.classList.add("mk-bn-w");
  var key = "";
  return { set: function (o) {
    var k = o.k, lab = o.age != null ? ageLabel(o.age) : "", sig = k + "|" + lab;
    if (sig === key) return; key = sig; host.textContent = "";
    if (k === "none") return;
    var b = el("div", "mk-bn" + (k === "stale" ? " warn" : k === "down" || k === "error" ? " bad" : "")), sp = function (t) { return el("span", null, t); }, sep = function () { return at(el("span", null, EM), { "aria-hidden": "true" }); };
    var gap = function () { b.appendChild(document.createTextNode(" ")); };
    if (k === "loading") { b.appendChild(sp("Chargement des données de marché…")); gap(); b.appendChild(badge()); }
    else if (k === "off") { b.appendChild(sp("Données de marché désactivées sur ce site.")); gap(); b.appendChild(badge()); }
    else if (k === "ok") { b.appendChild(sp("Données mises à jour " + lab)); gap(); b.appendChild(sep()); gap(); b.appendChild(badge()); gap(); b.appendChild(sep()); gap(); b.appendChild(sp("communautaires, peuvent être inexactes")); }
    else if (k === "stale") {
      b.appendChild(at(el("span", null, "◐"), { "aria-hidden": "true" })); gap();
      b.appendChild(sp("Données anciennes, rafraîchissement en cours…" + (lab ? " (mises à jour " + lab + ")" : ""))); gap(); b.appendChild(badge()); gap(); b.appendChild(sp("Communautaires, peuvent être inexactes. Vérifiez en jeu."));
    } else {
      b.appendChild(at(el("span", null, "⚠"), { "aria-hidden": "true" })); gap();
      var m = el("span"); m.appendChild(el("b", null, k === "down" ? "Données UEX indisponibles" : "Impossible de mettre à jour les données"));
      if (lab) m.appendChild(document.createTextNode(", dernière version connue : " + lab + "."));
      b.appendChild(m);
      gap(); b.appendChild(badge()); gap(); b.appendChild(sp("Communautaires, peuvent être inexactes."));
      if (o.onRetry && lab) { gap(); var r = el("button", "btn mk-retry", "Réessayer"); r.type = "button"; r.addEventListener("click", o.onRetry); b.appendChild(r); }
    }
    host.appendChild(b);
  } };
}

/* ───────────────────────── tableau (cartes sous 700 px) ─────────────────────────
   o : { id, title, note(rows), limit, columns:[{k, h, type:"n"|"t", n, first, nl, hsr, tip, val(row), cell(row)→Node|string}], def:[clé, 1|-1], empty(ctx)→{title,text,reset}, onReset }
   limit : nombre de lignes affichées d'abord (défaut cfg.limit) ; tip : formule en info-bulle de l'en-tête (survol, focus clavier, description pour lecteurs d'écran) ;
   nl : pas d'étiquette en mode cartes ; hsr : texte d'en-tête réservé aux lecteurs d'écran.
   Un vrai <table> (rôles posés pour rester lisible une fois affiché en cartes), en-têtes de colonne triables (boutons + aria-sort),
   sélecteur « Trier par » (téléphone), « Voir plus » au-delà de cfg.limit lignes. */
function Table(o) {
  function LIM() { return o.limit || cfg.limit; }
  var T = { el: el("div", "mk-tw"), rows: [], ctx: {}, key: o.def[0], dir: o.def[1], shown: LIM() };
  function col(k) { for (var i = 0; i < o.columns.length; i++) if (o.columns[i].k === k) return o.columns[i]; return null; }
  T.sorted = function () { var c = col(T.key); return c ? sortRows(T.rows, c.val, c.type, T.dir) : T.rows.slice(); };
  T.set = function (rows, ctx) { T.rows = rows; T.ctx = ctx || {}; T.shown = LIM(); T.draw(); };
  T.draw = function (focus) {
    var host = T.el, rows = T.sorted(), head = el("div", "mk-tbh"), h = el("h3", null, o.title);
    host.textContent = ""; h.id = o.id + "-h"; head.appendChild(h);
    var note = o.note ? o.note(T.rows) : ""; if (note) head.appendChild(el("span", "mk-ag", note));
    host.appendChild(head);
    if (!rows.length) {
      var e = o.empty(T.ctx), p = el("div", "pn mk-em"); p.appendChild(el("b", null, e.title)); p.appendChild(el("p", null, e.text));
      if (e.reset) { var rb = el("button", "btn", "Réinitialiser les filtres"); rb.type = "button"; rb.addEventListener("click", function () { if (o.onReset) o.onReset(); }); p.appendChild(rb); }
      host.appendChild(p); return;
    }
    var sortable = o.columns.filter(function (c) { return c.type; }), sl = el("label", "mk-fld mk-ss"), sel = el("select");
    sl.appendChild(el("span", null, "Trier par")); sel.id = o.id + "-s"; sel.setAttribute("aria-label", "Trier « " + o.title + " » par");
    sortable.forEach(function (c) { [1, -1].forEach(function (d) {
      var op = el("option", null, c.h + " (" + (d > 0 ? "croissant" : "décroissant") + ")"); op.value = c.k + ":" + d; if (T.key === c.k && T.dir === d) op.selected = true; sel.appendChild(op);
    }); });
    sel.addEventListener("change", function () { var p = sel.value.split(":"); T.key = p[0]; T.dir = +p[1]; T.shown = Math.max(T.shown, LIM()); T.draw("sel"); });
    sl.appendChild(sel); host.appendChild(sl);
    var t = at(el("table", "mk-t"), { role: "table", "aria-labelledby": h.id }), th = at(el("thead"), { role: "rowgroup" }), hr = at(el("tr"), { role: "row" });
    o.columns.forEach(function (c) {
      var x = at(el("th", c.n ? "n" : ""), { scope: "col", role: "columnheader" });
      if (c.type) {
        var on = T.key === c.k; x.setAttribute("aria-sort", on ? (T.dir > 0 ? "ascending" : "descending") : "none");
        var b = el("button", "mk-sb"); b.type = "button"; b.setAttribute("data-k", c.k); b.appendChild(document.createTextNode(c.h));
        b.appendChild(at(el("span", null, on ? (T.dir > 0 ? "↑" : "↓") : "↕"), { "aria-hidden": "true" }));
        b.addEventListener("click", function () { if (T.key === c.k) T.dir = -T.dir; else { T.key = c.k; T.dir = 1; } T.draw("sort:" + c.k); });
        if (c.tip) { /* formule : info-bulle au survol et au focus (data-x), description lue par les lecteurs d'écran (élément masqué référencé) */
          var tid = o.id + "-tip-" + c.k, d = el("span", null, "Formule : " + c.tip); d.id = tid; d.hidden = true;
          b.setAttribute("data-x", c.tip); b.setAttribute("aria-describedby", tid); b.appendChild(at(el("span", "mk-i", "i"), { "aria-hidden": "true" })); x.appendChild(b); x.appendChild(d);
        } else x.appendChild(b);
      } else if (c.hsr) x.appendChild(el("span", "sr", c.h)); else x.textContent = c.h;
      hr.appendChild(x);
    });
    th.appendChild(hr); t.appendChild(th);
    var tb = at(el("tbody"), { role: "rowgroup" }), vis = rows.slice(0, T.shown);
    vis.forEach(function (r) {
      var tr = at(el("tr"), { role: "row" });
      o.columns.forEach(function (c) {
        var td = c.first ? at(el("th"), { scope: "row", role: "rowheader" }) : at(el("td", c.n ? "n" : ""), { role: "cell", "data-l": c.nl ? "" : c.h });
        var v = c.cell(r); if (typeof v === "string") td.textContent = v; else td.appendChild(v);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); host.appendChild(t);
    if (rows.length > vis.length) {
      var more = el("p", "mk-more"), mb = el("button", "btn", "Voir plus (" + nf(rows.length - vis.length) + NB + "restantes)"); mb.type = "button";
      mb.addEventListener("click", function () { var was = T.shown; T.shown += LIM(); T.draw("more:" + was); });
      more.appendChild(mb); host.appendChild(more);
    }
    if (focus) {
      var f = null;
      if (focus === "sel") f = sel; else if (focus.indexOf("sort:") === 0) f = host.querySelector('.mk-sb[data-k="' + focus.slice(5) + '"]');
      else if (focus.indexOf("more:") === 0) { var r0 = tb.children[+focus.slice(5)]; f = r0 && r0.firstChild; if (f) f.tabIndex = -1; }
      if (f) f.focus({ preventScroll: true });
    }
  };
  return T;
}

/* info-bulles (valeurs abrégées, formules) : Échap les masque tant que le pointeur ou le focus reste dessus (WCAG 1.4.13) */
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  [].forEach.call(document.querySelectorAll(".mk-num:hover,.mk-num:focus,.mk-sb[data-x]:hover,.mk-sb[data-x]:focus"), function (n) {
    n.setAttribute("data-hide", "1");
    var off = function () { n.removeAttribute("data-hide"); n.removeEventListener("blur", off); n.removeEventListener("mouseleave", off); };
    n.addEventListener("blur", off); n.addEventListener("mouseleave", off);
  });
});

/* ───────────────────────── module Prix ───────────────────────── */
var PRES = ["commodities_prices_all", "commodities", "terminals", "star_systems"];
var P = { q: "", sys: "", stt: "", m: "", idx: null, sig: "", sess: null, tok: 0, built: false, open: false, drawn: false, bn: null, tb: null, ts: null };
var D = {};
function view() { return document.getElementById("v-commerce"); }
function $id(i) { return document.getElementById(i); }
function fin(v) { v = +v; return isFinite(v) ? v : null; }
function pos(v) { v = fin(v); return v != null && v > 0 ? v : null; }
function nrm(t) { return U.norm(t).replace(/\s+/g, " ").trim(); }

/* index en mémoire, construit une seule fois par jeu de données : marchandise → lignes « acheter » / « vendre » */
function buildIndex(recs) {
  var prices = recs[0].data, coms = recs[1].data, terms = recs[2].data, syss = recs[3].data;
  prices = Array.isArray(prices) ? prices : []; coms = Array.isArray(coms) ? coms : []; terms = Array.isArray(terms) ? terms : []; syss = Array.isArray(syss) ? syss : [];
  var tm = {}, byId = {}, bySlug = Object.create(null), byCode = Object.create(null), list = [], used = Object.create(null);
  terms.forEach(function (t) { if (t && t.id != null) tm[t.id] = { name: String(t.name || ""), sys: String(t.star_system_name || ""), place: String(t.space_station_name || t.city_name || t.outpost_name || t.planet_name || "") }; });
  function add(id, name, code, slug, kind) {
    var c = { id: id, name: name, code: code, slug: slug, kind: kind, norm: nrm(name + " " + code), buy: [], sell: [] };
    var s = slug || nrm(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "m" + id; c.slug = s.toLowerCase();
    while (bySlug[c.slug]) c.slug += "-" + id;
    byId[id] = c; bySlug[c.slug] = c; (byCode[code.toUpperCase()] = byCode[code.toUpperCase()] || []).push(c); list.push(c); return c;
  }
  coms.forEach(function (c) { if (c && c.id != null && c.name) add(c.id, String(c.name), String(c.code || ""), String(c.slug || ""), String(c.kind || "")); });
  var sysUsed = Object.create(null);
  prices.forEach(function (r) {
    if (!r) return;
    var c = byId[r.id_commodity] || (r.id_commodity != null && r.commodity_name ? add(r.id_commodity, String(r.commodity_name), "", "", "") : null); if (!c) return;
    var t = tm[r.id_terminal] || { name: "", sys: "", place: "" }, d = fin(r.date_modified), ts = d && d > 0 ? (d < 1e11 ? d * 1000 : d) : null;
    var base = { t: String(r.terminal_name || t.name || "Terminal " + r.id_terminal), sys: t.sys, place: t.place, ts: ts };
    var pb = pos(r.price_buy), ps = pos(r.price_sell);
    if (t.sys) sysUsed[t.sys] = 1;
    function row(last, avg, qty) { return { t: base.t, sys: base.sys, place: base.place, ts: base.ts, last: last, avg: pos(avg) == null ? null : Math.round(avg), qty: pos(qty) }; }
    if (pb != null) c.buy.push(row(pb, r.price_buy_avg, r.scu_buy));   /* le joueur ACHÈTE à ce terminal : prix payé, stock disponible */
    if (ps != null) c.sell.push(row(ps, r.price_sell_avg, r.scu_sell)); /* le joueur VEND à ce terminal : prix reçu, demande */
  });
  list.sort(function (a, b) { return COLL.compare(a.name, b.name); });
  var names = syss.map(function (s) { return s && s.name ? String(s.name) : ""; }).filter(function (n) { return n && sysUsed[n]; });
  Object.keys(sysUsed).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
  names.sort(function (a, b) { return COLL.compare(a, b); });
  return { list: list, byId: byId, bySlug: bySlug, byCode: byCode, systems: names };
}
function hasPrices(c) { return c.buy.length + c.sell.length > 0; }
function findCom(m) {
  var I = P.idx; if (!I || !m) return null;
  var c = I.bySlug[String(m).toLowerCase()]; if (c) return c;
  var l = I.byCode[String(m).toUpperCase()]; if (l) return l.filter(hasPrices)[0] || l[0];
  return /^\d+$/.test(m) && I.byId[+m] || null;
}

function setUrl() {
  if (!P.open) return;
  var h = "#commerce/prix" + query();
  if (location.hash !== h) { try { history.replaceState(null, "", h); } catch (e) {} }
}
function query() { return P.m ? "?m=" + encodeURIComponent(P.m) : ""; }

function build() {
  if (P.built) return; P.built = true;
  D.h2 = $id("mkTitle"); D.wrap = $id("mkWrap"); D.state = $id("mkState"); D.main = $id("mkMain");
  P.bn = Banner($id("mkBanner"));
  D.main.innerHTML =
    '<div class="mk-split"><div class="pn mk-side"><label class="mk-fld"><span>Rechercher une marchandise</span><input type="search" id="mkQ" autocomplete="off" spellcheck="false"></label>' +
    '<p class="mk-cnt" id="mkListSum" aria-live="polite"></p><div class="mk-listw"><ul class="mk-list" id="mkList" aria-label="Marchandises"></ul></div></div>' +
    '<div class="mk-stack"><div class="pn"><div class="mk-flt"><label class="mk-fld"><span>Système</span><select id="mkSys"></select></label>' +
    '<label class="mk-fld"><span>Statut de la donnée</span><select id="mkStt"><option value="">Tous les statuts</option><option value="ok">Frais (≤ 1 h)</option><option value="warn">À vérifier (≤ 24 h)</option><option value="bad">Périmé (&gt; 24 h)</option></select></label>' +
    '<div class="mk-fld"><span>Export</span><button type="button" class="btn" id="mkCsv">Exporter en CSV</button></div></div></div>' +
    '<p class="mk-sum" id="mkSum" aria-live="polite"></p><p class="mk-msg" id="mkMsg" role="status"></p><div id="mkRes" class="mk-stack"></div></div></div>';
  D.q = $id("mkQ"); D.list = $id("mkList"); D.lsum = $id("mkListSum"); D.sys = $id("mkSys"); D.stt = $id("mkStt"); D.csv = $id("mkCsv"); D.sum = $id("mkSum"); D.msg = $id("mkMsg"); D.res = $id("mkRes");
  function colsFor(side) {
    return [
      { k: "t", h: "Terminal", type: "t", first: true, val: function (r) { return r.t; }, cell: function (r) { var f = document.createDocumentFragment(); f.appendChild(el("b", null, r.t)); if (r.place) f.appendChild(el("span", "mk-sm", r.place)); return f; } },
      { k: "sys", h: "Système", type: "t", val: function (r) { return r.sys || null; }, cell: function (r) { return r.sys ? r.sys : dash(); } },
      { k: "last", h: "Dernier prix", type: "n", n: true, val: function (r) { return r.last; }, cell: function (r) { return nf(r.last); } },
      { k: "avg", h: "Prix moyen", type: "n", n: true, val: function (r) { return r.avg; }, cell: function (r) { return r.avg == null ? dash() : nf(r.avg); } },
      { k: "qty", h: side === "buy" ? "Stock (SCU)" : "Demande (SCU)", type: "n", n: true, val: function (r) { return r.qty; }, cell: function (r) { return r.qty == null ? dash() : num(r.qty, "SCU"); } },
      { k: "ag", h: "Ancienneté", type: "n", val: function (r) { return r.ageS; }, cell: function (r) { var f = document.createDocumentFragment(); f.appendChild(pill(r.ageS)); f.appendChild(document.createTextNode(" ")); f.appendChild(el("span", "mk-ag", r.ageS == null ? "date inconnue" : ageLabel(r.ageS))); return f; } }];
  }
  function mk(side, title, def) {
    return Table({ id: "mk-" + side, title: title, columns: colsFor(side), def: def, note: function (rows) { return "Prix en aUEC par SCU" + (rows.length ? " · " + plural(rows.length, "terminal", "terminaux") : ""); },
      onReset: resetFilters,
      empty: function (ctx) {
        var tot = ctx.total || 0;
        if (!tot) return { title: side === "buy" ? "Aucun terminal où acheter" : "Aucun terminal où vendre", text: side === "buy" ? "Aucun terminal connu ne propose cette marchandise à la vente (donc à l'achat pour vous)." : "Aucun terminal connu n'achète cette marchandise.", reset: false };
        return { title: "Aucune ligne", text: "Aucun terminal ne correspond aux filtres.", reset: true };
      } });
  }
  P.tb = mk("buy", "Où acheter", ["last", 1]); P.ts = mk("sell", "Où vendre", ["last", -1]);
  D.q.addEventListener("input", function () { P.q = D.q.value; drawList(); });
  D.sys.addEventListener("change", function () { P.sys = D.sys.value; drawRes(); });
  D.stt.addEventListener("change", function () { P.stt = D.stt.value; drawRes(); });
  D.csv.addEventListener("click", exportCsv);
  D.list.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-slug]"); if (!b) return;
    P.m = b.getAttribute("data-slug"); setUrl(); markList(); drawRes();
    if (matchMedia("(max-width:999px)").matches) D.sum.scrollIntoView({ block: "start" });
  });
}

function resetFilters() {
  P.q = ""; P.sys = ""; P.stt = ""; D.q.value = ""; D.sys.value = ""; D.stt.value = "";
  drawList(); drawRes(); D.sys.focus({ preventScroll: true });
}
function drawSystems() {
  var keep = P.sys; D.sys.textContent = "";
  var o = el("option", null, "Tous les systèmes"); o.value = ""; D.sys.appendChild(o);
  P.idx.systems.forEach(function (n) { var x = el("option", null, n); x.value = n; D.sys.appendChild(x); });
  if (keep && P.idx.systems.indexOf(keep) < 0) keep = "";
  P.sys = keep; D.sys.value = keep;
}
function drawList() {
  var I = P.idx, q = nrm(P.q), ul = D.list; ul.textContent = "";
  if (!I) return;
  var sel = findCom(P.m), ls = I.list.filter(function (c) { return !q || c.norm.indexOf(q) >= 0; });
  ls.forEach(function (c) {
    var li = el("li"), b = el("button", "mk-it"); b.type = "button"; b.setAttribute("data-slug", c.slug); b.setAttribute("aria-pressed", String(c === sel));
    b.appendChild(el("span", "mk-in", c.name));
    b.appendChild(el("span", "mk-cnt", hasPrices(c) ? "Acheter : " + c.buy.length + " · Vendre : " + c.sell.length : "aucun prix"));
    li.appendChild(b); ul.appendChild(li);
  });
  if (!ls.length) {
    var li2 = el("li", "mk-em-s"), s = el("span", null, I.list.length ? "Aucune marchandise ne correspond à « " + P.q.trim() + " »." : "Aucune marchandise pour le moment.");
    li2.appendChild(s);
    if (I.list.length) { var rb = el("button", "btn", "Réinitialiser les filtres"); rb.type = "button"; rb.addEventListener("click", resetFilters); li2.appendChild(document.createElement("br")); li2.appendChild(rb); }
    ul.appendChild(li2);
  }
  D.lsum.textContent = ls.length === I.list.length ? plural(ls.length, "marchandise", "marchandises") : plural(ls.length, "marchandise", "marchandises") + " sur " + I.list.length;
}
function markList() {
  var c = findCom(P.m);
  [].forEach.call(D.list.querySelectorAll("button[data-slug]"), function (b) { b.setAttribute("aria-pressed", String(!!c && b.getAttribute("data-slug") === c.slug)); });
}
function rowsOf(list, now) {
  var out = [];
  list.forEach(function (r) {
    var ageS = r.ts == null ? null : Math.max(0, (now - r.ts) / 1000);
    if (P.sys && r.sys !== P.sys) return;
    if (P.stt && fresh(ageS).c !== P.stt) return;
    out.push({ t: r.t, sys: r.sys, place: r.place, last: r.last, avg: r.avg, qty: r.qty, ts: r.ts, ageS: ageS });
  });
  return out;
}
function panel(title, text) { var p = el("div", "pn mk-em"); p.appendChild(el("b", null, title)); p.appendChild(el("p", null, text)); return p; }
function drawRes() {
  var c = findCom(P.m), now = Date.now(); D.msg.textContent = ""; D.res.textContent = "";
  if (c && c.slug !== P.m) { P.m = c.slug; setUrl(); markList(); }
  D.csv.disabled = true;
  if (!P.m) { D.sum.textContent = "Aucune marchandise sélectionnée."; D.res.appendChild(panel("Choisissez une marchandise", "Sélectionnez-en une dans la liste pour afficher les terminaux où l'acheter et où la vendre.")); return; }
  if (!c) { D.sum.textContent = "Marchandise introuvable."; D.res.appendChild(panel("Marchandise introuvable", "« " + P.m + " » ne correspond à aucune marchandise connue. Choisissez-en une dans la liste.")); return; }
  if (!hasPrices(c)) { D.sum.textContent = c.name + " : aucun prix connu."; D.res.appendChild(panel("Aucun prix connu pour cette marchandise", "UEX ne signale aucun terminal qui l'achète ou qui la vende (marchandise brute ou non commercialisable, ou données manquantes).")); return; }
  var b = rowsOf(c.buy, now), s = rowsOf(c.sell, now), filt = !!(P.sys || P.stt);
  D.sum.textContent = c.name + " : " + plural(b.length, "terminal", "terminaux") + " où acheter, " + s.length + " où vendre" + (filt ? " (filtres actifs, sur " + c.buy.length + " et " + c.sell.length + " au total)" : "") + ".";
  P.tb.set(b, { total: c.buy.length }); P.ts.set(s, { total: c.sell.length });
  D.res.appendChild(P.tb.el); D.res.appendChild(P.ts.el);
  D.csv.disabled = !b.length && !s.length;
}
function exportCsv() {
  var c = findCom(P.m); if (!c) return;
  var head = ["Action", "Marchandise", "Code", "Terminal", "Système", "Prix dernier (aUEC/SCU)", "Prix moyen (aUEC/SCU)", "Stock ou demande (SCU)", "Mise à jour (UTC)", "Ancienneté (min)", "Fraîcheur"], out = [];
  [["Acheter", P.tb], ["Vendre", P.ts]].forEach(function (x) {
    x[1].sorted().forEach(function (r) {
      out.push([x[0], c.name, c.code, r.t, r.sys, r.last, r.avg == null ? "" : r.avg, r.qty == null ? "" : r.qty, r.ts == null ? "" : new Date(r.ts).toISOString().replace(/\.\d+Z$/, "Z"), r.ageS == null ? "" : Math.floor(r.ageS / 60), fresh(r.ageS).l]);
    });
  });
  download("prix-" + c.slug + ".csv", csv(head, out));
  D.msg.textContent = "Export prêt : " + plural(out.length, "ligne", "lignes") + ".";
}

/* états du module : loading | main | off | fail */
function show(kind, o) {
  var st = D.state; st.textContent = "";
  D.wrap.setAttribute("aria-busy", String(kind === "loading")); D.main.hidden = kind !== "main"; st.hidden = kind === "main";
  if (kind === "loading") {
    st.appendChild(el("p", "mk-sum", "Chargement…"));
    for (var i = 0; i < 4; i++) st.appendChild(el("div", "mk-sk"));
  } else if (kind === "off") {
    var p = el("div", "pn mk-em"); p.appendChild(el("b", null, "Données de marché désactivées"));
    p.appendChild(el("p", null, "Ce serveur n'interroge pas UEX. Pour activer la fonction, définissez la variable d'environnement UEX_ENABLED=1 (docker-compose.yml) puis redémarrez l'application. Le Simulateur reste utilisable avec une saisie manuelle des prix."));
    var a = el("a", null, "Documentation : activer les données de marché"); a.href = DOC_URL; a.target = "_blank"; a.rel = "noopener noreferrer"; p.appendChild(el("p")).appendChild(a); st.appendChild(p);
  } else if (kind === "fail") {
    var q = el("div", "pn mk-em"); q.appendChild(el("b", null, o.unavailable ? "Données UEX indisponibles" : "Impossible de charger les données de marché"));
    q.appendChild(el("p", null, o.unavailable ? "Le serveur n'a pas pu récupérer les données d'UEX et n'en garde aucune copie pour le moment. Réessayez dans quelques instants." : "Le serveur ne répond pas ou la réponse est illisible. Vérifiez votre connexion puis réessayez."));
    var rb = el("button", "btn", "Réessayer"); rb.type = "button"; rb.addEventListener("click", retry); q.appendChild(rb); st.appendChild(q);
  }
}
function retry() { if (D.h2) D.h2.focus({ preventScroll: true }); load(); }

function settle(rs, s, again) {
  var kinds = rs.map(function (r) { return r.kind; });
  if (kinds.indexOf("disabled") >= 0) { P.idx = null; P.sig = ""; P.drawn = false; show("off"); P.bn.set({ k: "off" }); return; }
  var recs = PRES.map(function (n, i) { return rs[i].rec || mem[n]; });
  if (recs.some(function (r) { return !r; })) { var un = kinds.indexOf("unavailable") >= 0; P.idx = null; P.sig = ""; P.drawn = false; show("fail", { unavailable: un }); P.bn.set({ k: un ? "down" : "error" }); return; }
  var sig = recs.map(function (r) { return r.etag + "@" + r.fetchedAt; }).join("|");
  if (sig !== P.sig || !P.idx) { P.idx = buildIndex(recs); P.sig = sig; P.drawn = false; }
  show("main");
  if (!P.drawn) { drawSystems(); drawList(); drawRes(); P.drawn = true; }
  var age = ageNow(recs[0]);
  if (kinds.some(function (k) { return k !== "ok"; })) { P.bn.set({ k: kinds.indexOf("unavailable") >= 0 ? "down" : "error", age: age, onRetry: retry }); return; }
  var stale = recs.some(isStale);
  P.bn.set({ k: stale ? "stale" : "ok", age: age });
  if (stale && !again) s.later(function () { /* le serveur renouvelle en arrière-plan : une seule nouvelle demande, sans ETag */
    if (view().hidden || !P.open) return;
    Promise.all(PRES.map(function (n) { return isStale(mem[n]) ? s.get2(n) : { kind: "ok", rec: mem[n] }; })).then(function (r2) { if (!s.closed) settle(r2, s, true); });
  }, cfg.recheck);
}
function load() {
  if (P.sess) P.sess.close();
  var s = P.sess = openSession(), tok = ++P.tok;
  s.get2 = function (res) { return fetchRes(res); }; /* seconde demande autorisée (donnée périmée) : hors mémo de l'ouverture */
  if (P.idx) { P.bn.set({ k: PRES.some(function (n) { return isStale(mem[n]); }) ? "stale" : "ok", age: ageNow(mem[PRES[0]]) }); show("main"); drawList(); drawRes(); }
  else { show("loading"); P.bn.set({ k: "loading" }); }
  Promise.all(PRES.map(function (n) { return s.get(n); })).then(function (rs) { if (tok === P.tok && !s.closed) settle(rs, s, false); });
}

var prix = {
  /* ouverture du module (une « ouverture » = au plus une requête par ressource) ; params : { m } */
  open: function (params) {
    build(); P.open = true;
    if (params && params.m != null) P.m = String(params.m);
    load(); setUrl();
  },
  /* changement de paramètres dans le même module (adresse modifiée à la main) : pas de nouvelle requête */
  set: function (params) {
    if (!P.built || !P.open) return;
    if (params && params.m != null && params.m !== P.m) { P.m = String(params.m); if (P.idx) { markList(); drawRes(); } }
  },
  close: function () { P.open = false; if (P.sess) { P.sess.close(); P.sess = null; } P.tok++; },
  query: query,
  title: function () { return D.h2 || $id("mkTitle"); },
  state: P
};

window.OrbMarket = { nf: nf, short: short, num: num, ageLabel: ageLabel, fresh: fresh, sortRows: sortRows, csv: csv, csvTxt: csvTxt, download: download,
  get: fetchRes, open: openSession, Banner: Banner, Table: Table, cfg: cfg, TTL: TTL, mem: mem, prix: prix,
  /* aides partagées avec les autres modules (routes.js) */
  h: { el: el, at: at, plural: plural, dash: dash, pill: pill, isStale: isStale, ageNow: ageNow, coll: COLL, nrm: nrm } };
})();
