/* Trades du carnet : calculs, formatage français, nettoyage de l'objet `trade` et tiroir « Calculer un trade ».
   Chargé avant carnet.js. Un seul espace de noms : window.OrbTrade. Tout vient de la saisie : aucun prix de jeu.
   Format d'une entrée de trade : { cm, scu, buy, sell, fees, from, to } (voir docs/trades/README.md). */
(function () {
"use strict";
var NB = "\u00a0", MN = "\u2212";
var WS = new RegExp("[\\s\u00a0\u202f]", "g"), WN = new RegExp("[\u00a0\u202f]", "g");
var nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
var nf1 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function fix(s) { return s.replace(WN, NB).replace("-", MN); }
function n0(v) { return fix(nf0.format(Math.round(v) || 0)); }
function sg(v) { v = Math.round(v) || 0; return (v > 0 ? "+" : "") + n0(v); }
function pct(v) { v = Math.round(v * 10) / 10 || 0; return fix(nf1.format(v)) + NB + "%"; }
function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function dur(m) { m = Math.round(m || 0); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + ("0" + (m % 60)).slice(-2); }

/* ── bornes (identiques côté serveur, voir server.js) ── */
var F = {
  scu:  { min: 1, max: 1e7,  lab: "Le SCU",           v: "doit",    rq: "un nombre entier supérieur à 0",            de: "le SCU" },
  buy:  { min: 0, max: 1e8,  lab: "Le prix d’achat",  v: "doit",    rq: "un nombre entier positif ou nul",           de: "le prix d’achat" },
  sell: { min: 0, max: 1e8,  lab: "Le prix de vente", v: "doit",    rq: "un nombre entier positif ou nul",           de: "le prix de vente" },
  fees: { min: 0, max: 1e12, lab: "Les frais",        v: "doivent", rq: "un nombre entier positif ou nul",           opt: 1 },
  dur:  { min: 1, max: 1e5,  lab: "La durée",         v: "doit",    rq: "un nombre entier de minutes supérieur à 0", opt: 1 }
};
var K = Object.keys(F);

/* ── nettoyage : même logique que server.js. Renvoie un objet normalisé ou null (trade absent, invalide, ou entrée qui n'est pas du cargo) ── */
function int(v, min, max) { return typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= min && v <= max ? (v === 0 ? 0 : v) : null; }
function txt(v, n) { return typeof v === "string" ? v.slice(0, n).trim() : ""; }
function clean(t, type) {
  if (type !== "cargo" || !t || typeof t !== "object" || Array.isArray(t)) return null;
  var scu = int(t.scu, 1, 1e7), buy = int(t.buy, 0, 1e8), sell = int(t.sell, 0, 1e8);
  var fees = t.fees === undefined || t.fees === null ? 0 : int(t.fees, 0, 1e12);
  if (scu === null || buy === null || sell === null || fees === null) return null;
  return { cm: txt(t.cm, 80), scu: scu, buy: buy, sell: sell, fees: fees, from: txt(t.from, 80), to: txt(t.to, 80) };
}
function net(t) { return t.scu * t.sell - t.scu * t.buy - t.fees; }
function roi(t) { var b = t.scu * t.buy + t.fees; return b > 0 ? net(t) / b * 100 : null; }
function route(t) { return t.from || t.to ? (t.from || "?") + " → " + (t.to || "?") : ""; }
function title(t) { var r = route(t); return ((t.cm || "Trade") + (r ? " · " + r : "")).slice(0, 120); }
function goodName(t) { return t.cm || "Sans nom"; }

/* ── calcul à partir de la saisie brute (textes) ── */
function calc(v) {
  var o = {}, errs = {}, miss = [], r = null;
  K.forEach(function (k) {
    var s = F[k], raw = String(v[k] == null ? "" : v[k]).replace(WS, "");
    if (raw === "") { if (!s.opt) miss.push(k); return; }
    var x = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (isNaN(x) || x < s.min) errs[k] = s.lab + " " + s.v + " être " + s.rq + ".";
    else if (x > s.max) errs[k] = s.lab + " : valeur trop grande (maximum " + n0(s.max) + ").";
    else o[k] = x;
  });
  var st = Object.keys(errs).length ? "invalid" : miss.length ? "incomplete" : "ok";
  if (st === "ok") {
    var inv = o.scu * o.buy, rec = o.scu * o.sell, fees = o.fees || 0, n = rec - inv - fees, base = inv + fees;
    r = { scu: o.scu, buy: o.buy, sell: o.sell, dur: o.dur || 0, inv: inv, rec: rec, fees: fees, net: n, margin: o.sell - o.buy,
      roi: base > 0 ? n / base * 100 : null, hour: o.dur ? n / (o.dur / 60) : null };
  }
  return { st: st, errs: errs, miss: miss, o: o, r: r };
}

/* ── texte de résumé : « 100 SCU × Marchandise A · Lieu A → Lieu B · +43 500 aUEC · ROI 21,6 % » ── */
function netTxt(n) { return sg(n) + NB + "aUEC" + (n < 0 ? " (perte)" : ""); }
function summaryEl(t, cls) {
  var n = net(t), r = roi(t), p = el("p", cls || "tr-sum");
  p.appendChild(el("b", null, n0(t.scu) + " SCU × " + goodName(t)));
  function seg(node) { p.appendChild(document.createTextNode(" · ")); p.appendChild(node); }
  if (route(t)) seg(el("span", "tr-route", route(t)));
  seg(el("span", n < 0 ? "neg" : n > 0 ? "pos" : null, netTxt(n)));
  if (r !== null) seg(el("span", r < 0 ? "neg" : null, "ROI" + NB + pct(r)));
  return p;
}
function summaryText(t) { return summaryEl(t).textContent; }

/* ── statistiques « Commerce » ── */
function stats(list) {
  var g = {}, tot = 0, base = 0, n = 0;
  list.forEach(function (e) {
    var t = e.trade; if (!t) return;
    var nn = net(t), b = t.scu * t.buy + t.fees, k = goodName(t), o = g[k] || (g[k] = { good: k, net: 0, n: 0 });
    o.net += nn; o.n++; tot += nn; base += b; n++;
  });
  var gs = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.net - a.net; });
  return { n: n, net: tot, roi: base > 0 ? tot / base * 100 : null, goods: gs, best: gs[0] || null, worst: gs.length > 1 ? gs[gs.length - 1] : null };
}
function stat(label, val, cls, sub, text) {
  var d = el("div", "tr-stat");
  d.appendChild(el("b", (text ? "t " : "") + (cls || ""), val)); d.appendChild(el("span", null, label));
  if (sub) d.appendChild(el("small", null, sub));
  return d;
}
function statsView(box, list) {
  box.textContent = "";
  var s = stats(list);
  if (!s.n) { box.appendChild(el("p", "tr-empty", "Aucun trade enregistré pour le moment.")); return; }
  var u = NB + "aUEC", g = el("div", "tr-stats");
  g.appendChild(stat("Trades", String(s.n)));
  g.appendChild(stat(s.net < 0 ? "Perte totale" : "Bénéfice total", sg(s.net) + u, s.net < 0 ? "neg" : s.net > 0 ? "pos" : ""));
  g.appendChild(stat("ROI moyen pondéré", s.roi == null ? "—" : pct(s.roi), s.roi < 0 ? "neg" : ""));
  g.appendChild(stat("Meilleure marchandise", s.best.good, "", sg(s.best.net) + u, 1));
  g.appendChild(stat("Pire marchandise", s.worst ? s.worst.good : "—", "", s.worst ? sg(s.worst.net) + u + (s.worst.net < 0 ? " (perte)" : "") : "une seule marchandise", 1));
  box.appendChild(g);
  box.appendChild(el("h4", "tr-sub", "Bénéfice par marchandise"));
  var mx = Math.max.apply(null, s.goods.map(function (x) { return Math.abs(x.net); })) || 1, ul = el("ul", "tr-bars");
  s.goods.forEach(function (x) {
    var li = el("li"), tr = el("span", "tr-track"), i = el("i", x.net < 0 ? "neg" : "");
    i.style.width = Math.max(Math.abs(x.net) / mx * 100, 2) + "%"; tr.appendChild(i);
    li.appendChild(el("span", "tr-bn", x.good)); li.appendChild(tr);
    li.appendChild(el("em", x.net < 0 ? "neg" : "", sg(x.net) + (x.net < 0 ? " (perte)" : "")));
    ul.appendChild(li);
  });
  box.appendChild(ul);
}
function goods(list) {
  var g = {}; list.forEach(function (e) { if (e.trade && e.trade.cm) g[e.trade.cm] = 1; });
  return Object.keys(g).sort(function (a, b) { return a.localeCompare(b, "fr"); });
}

/* ── tiroir ── */
var $ = function (id) { return document.getElementById(id); };
var uid = 0;
function resHTML(c) {
  if (c.st === "incomplete") return '<p class="tr-res-msg">Renseignez le SCU et les deux prix.</p>';
  if (c.st === "invalid") return '<p class="tr-res-msg">Résultat masqué : corrigez les champs signalés.</p>';
  var r = c.r, L = r.net < 0, Z = r.net === 0, cl = L ? "neg" : Z ? "" : "pos", u = NB + "aUEC";
  function m(l, v, k, x) { return '<div class="tr-m' + (x ? " x" : "") + '"><span>' + l + "</span><b" + (k ? ' class="' + k + '"' : "") + ">" + v + "</b></div>"; }
  return '<div class="tr-hero"><div><span class="tr-l">' + (L ? "Perte nette" : "Bénéfice net") + '</span><strong class="tr-net ' + cl + '">' + sg(r.net) + u + "</strong></div>" +
    '<span class="tr-flag ' + cl + '">' + (L ? '<span aria-hidden="true">▼</span> Perte' : Z ? "Équilibre" : '<span aria-hidden="true">▲</span> Bénéfice') + "</span></div>" +
    '<div class="tr-grid">' + m("Investissement", n0(r.inv) + u, "", 1) + m("Recettes", n0(r.rec) + u, "", 1) + m("Frais", n0(r.fees) + u, "", 1) +
    m("Marge par SCU", sg(r.margin) + u + " / SCU", r.margin < 0 ? "neg" : "", 1) +
    m("ROI", r.roi == null ? "—" : pct(r.roi), r.roi < 0 ? "neg" : "") +
    m("Bénéfice par heure", r.hour == null ? "<small>Saisissez une durée</small>" : sg(r.hour) + u + " / h", r.hour < 0 ? "neg" : "") + "</div>" +
    '<p class="tr-res-f">Net = recettes \u2212 investissement \u2212 frais · ROI = net ÷ (investissement + frais)</p>';
}

var curAdd = null, subBtn = null, SUB = "Ajouter au carnet";
var ov = null, box = null, form = null, resEl = null, resBox = null, msg = null, inp = {}, err = {}, attempt = false, last = null, opener = null, inerts = [];
var saved = null, helpEl = null, helpDef = "";
var api = { onAdd: null };

function put(k, m) {
  var p = err[k], i = inp[k];
  if (p) p.textContent = m ? "Erreur : " + m : "";
  if (i) { if (m) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid"); }
}
function vals() { var v = {}; for (var k in inp) v[k] = inp[k].value; return v; }
function run() {
  var c = calc(vals());
  K.forEach(function (k) {
    var m = c.errs[k];
    if (!m && attempt && c.miss.indexOf(k) > -1) m = "Renseignez " + F[k].de + ".";
    put(k, m);
  });
  c.cmMissing = attempt && !inp.cm.value.trim();
  put("cm", c.cmMissing ? "Indiquez la marchandise pour enregistrer le trade." : "");
  var h = resHTML(c);
  if (h !== last) { resEl.innerHTML = h; last = h; }
  resBox.setAttribute("data-st", c.st === "ok" ? (c.r.net < 0 ? "loss" : c.r.net > 0 ? "gain" : "zero") : c.st);
  return c;
}
function set(d) {
  d = d || {};
  for (var k in inp) inp[k].value = d[k] != null ? String(d[k]) : "";
  attempt = false; msg.textContent = "";
  return run();
}
function focusables() {
  return [].filter.call(box.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])'), function (n) { return !n.disabled && n.getClientRects().length; });
}
function onKey(e) {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
  if (e.key === "/") { e.stopPropagation(); return; } /* la recherche globale ne s'ouvre pas par-dessus le tiroir */
  if (e.key !== "Tab") return;
  var f = focusables(); if (!f.length) return;
  var a = f[0], z = f[f.length - 1], cur = document.activeElement, inside = box.contains(cur);
  if (e.shiftKey && (cur === a || !inside)) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && (cur === z || !inside)) { e.preventDefault(); a.focus(); }
}
function isOpen() { return !!ov && !ov.hidden; }
/* o.opener : élément qui reprend le focus ; o.values : valeurs à charger (sinon le brouillon est conservé) ; o.dur : durée du formulaire ;
   o.onAdd : action finale propre à cette ouverture (sinon api.onAdd) ; o.submit : libellé du bouton final (sinon « Ajouter au carnet ») ;
   o.prefill : { cm, scu, buy, sell, from, to } préremplit tous les champs (frais et durée vides, tout reste modifiable) SANS écraser définitivement le brouillon :
   si le volet est fermé sans validation, le brouillon d'avant est restauré ; o.note : texte d'aide remplaçant l'aide habituelle pendant cette ouverture */
function open(o) {
  if (!ov || isOpen()) return;
  o = o || {};
  opener = o.opener || document.activeElement;
  curAdd = typeof o.onAdd === "function" ? o.onAdd : null;
  if (subBtn) subBtn.textContent = o.submit || SUB;
  saved = null;
  if (o.prefill && typeof o.prefill === "object") { saved = vals(); set(o.prefill); }
  else if (o.values) set(o.values);
  if (helpEl) { helpDef = helpDef || helpEl.textContent; helpEl.textContent = typeof o.note === "string" && o.note ? o.note : helpDef; }
  if (o.dur != null && String(o.dur) !== "") inp.dur.value = String(o.dur);
  msg.textContent = ""; attempt = false; run();
  inerts = [$("skip"), document.querySelector(".app")].filter(Boolean);
  inerts.forEach(function (n) { n.inert = true; n.setAttribute("aria-hidden", "true"); });
  document.documentElement.classList.add("tr-lock");
  ov.hidden = false;
  document.addEventListener("keydown", onKey, true);
  inp.cm.focus();
}
function close() {
  if (!isOpen()) return;
  ov.hidden = true;
  if (saved) { var sv = saved; saved = null; set(sv); }
  if (helpEl && helpDef) helpEl.textContent = helpDef;
  inerts.forEach(function (n) { n.inert = false; n.removeAttribute("aria-hidden"); });
  inerts = [];
  document.documentElement.classList.remove("tr-lock");
  document.removeEventListener("keydown", onKey, true);
  var o = opener; opener = null;
  if (o && o.isConnected && o.getClientRects().length) o.focus();
  else if ($("trOpen")) $("trOpen").focus();
}
function setGoods(list) {
  var dl = $("trGoods"); if (!dl) return;
  dl.textContent = "";
  goods(list).forEach(function (g) { var o = document.createElement("option"); o.value = g; dl.appendChild(o); });
}
function init() {
  ov = $("trOv"); if (!ov) return;
  box = $("trDlg"); form = $("trForm"); resEl = ov.querySelector("[data-res]"); resBox = resEl.closest(".tr-res"); msg = $("trMsg"); helpEl = $("trDrD");
  [].forEach.call(ov.querySelectorAll("[data-f]"), function (i) { inp[i.getAttribute("data-f")] = i; i.addEventListener("input", run); });
  [].forEach.call(ov.querySelectorAll("[data-err]"), function (p) {
    var k = p.getAttribute("data-err"), i = inp[k]; err[k] = p;
    if (!p.id) p.id = "trEr" + (++uid);
    if (i) i.setAttribute("aria-describedby", p.id);
  });
  subBtn = $("trSubmit"); if (subBtn) SUB = subBtn.textContent;
  [].forEach.call(ov.querySelectorAll("[data-tr-close]"), function (b) { b.addEventListener("click", close); });
  form.addEventListener("submit", function (ev) {
    ev.preventDefault(); attempt = true;
    var c = run(), first = null;
    ["cm", "scu", "buy", "sell", "fees", "dur"].some(function (k) { if (inp[k].getAttribute("aria-invalid") === "true") { first = inp[k]; return true; } });
    if (first || c.st !== "ok" || c.cmMissing) {
      msg.textContent = "Ajout impossible : complétez ou corrigez les champs signalés.";
      if (first) first.focus();
      return;
    }
    var v = vals(), t = clean({ cm: v.cm, scu: c.r.scu, buy: c.r.buy, sell: c.r.sell, fees: c.r.fees, from: v.from, to: v.to }, "cargo");
    var fn = curAdd || api.onAdd;
    saved = null; /* validé : le brouillon d'avant n'est plus à restaurer */
    close();
    if (fn) fn({ trade: t, dur: c.r.dur });
  });
  run();
}
api.init = init;
api.open = open; api.close = close; api.isOpen = isOpen; api.set = set; api.setGoods = setGoods; api.values = vals;

window.OrbTrade = { calc: calc, clean: clean, net: net, roi: roi, route: route, title: title, n0: n0, sg: sg, pct: pct, dur: dur,
  summaryEl: summaryEl, summaryText: summaryText, netTxt: netTxt, stats: stats, statsView: statsView, goods: goods, drawer: api };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
