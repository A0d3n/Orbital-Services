/* Onglet « Commerce » (#commerce) : outils de trade et résumé du journal.
   Lit les mêmes entrées que le carnet via window.OrbLog (carnet.js) et ouvre le même tiroir de simulation (window.OrbTrade.drawer),
   avec l'action finale « Ajouter au journal » qui enregistre directement une entrée « cargo ». Chargé après carnet.js.
   Une seule requête : GET /api/uex/status (bloc « Données de marché »), à l'affichage de l'onglet ; le reste lit le magasin du carnet (relu au retour sur l'onglet si le stockage est le serveur). */
(function () {
"use strict";
var OT = window.OrbTrade, LG = window.OrbLog, view = document.getElementById("v-commerce");
if (!OT || !LG || !view) return;
var NB = "\u00a0", DAYS = 30, sig = null, flashT = 0;
function $(id) { return document.getElementById(id); }
function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function shown() { return !view.hidden; }

/* entrées « cargo » avec un trade valide, les plus récentes d'abord (le carnet les trie déjà) */
function trades() { return LG.all().filter(function (e) { return e.tr; }); }

function stat(label, val, cls, sub) {
  var d = el("div", "tr-stat");
  d.appendChild(el("b", cls || "", val)); d.appendChild(el("span", null, label));
  if (sub) d.appendChild(el("small", null, sub));
  return d;
}
function openBtn(txt) {
  var b = el("button", "btn play cm-open", txt); b.type = "button"; b.setAttribute("aria-haspopup", "dialog"); return b;
}
function when(ms) {
  var d = new Date(ms), t = el("time", null, d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
  t.setAttribute("datetime", d.toISOString()); return t;
}

/* liste des derniers trades : vrai tableau (rôles posés pour rester lisible quand il s'affiche en cartes sur téléphone) */
var COLS = [["ts", "Date", ""], ["trade", "Trade", ""], ["route", "Lieu A → lieu B", "Itinéraire"], ["net", "Net", "Net"], ["roi", "ROI", "ROI"]];
function table(host, list) {
  host.textContent = "";
  var w = el("div", "cm-tbl-wrap"), t = el("table", "cm-tbl"); t.setAttribute("role", "table");
  t.appendChild(el("caption", "sr", "Cinq derniers trades du journal"));
  var th = el("thead"), hr = el("tr"); th.setAttribute("role", "rowgroup"); hr.setAttribute("role", "row");
  COLS.forEach(function (c) { var h = el("th", "h-" + c[0], c[1]); h.setAttribute("scope", "col"); h.setAttribute("role", "columnheader"); hr.appendChild(h); });
  th.appendChild(hr); t.appendChild(th);
  var tb = el("tbody"); tb.setAttribute("role", "rowgroup");
  list.forEach(function (e) {
    var x = e.tr, n = OT.net(x), r = OT.roi(x), tr = el("tr", n < 0 ? "loss" : ""); tr.setAttribute("role", "row");
    COLS.forEach(function (c) {
      var td = el("td", "c-" + c[0]); td.setAttribute("role", "cell"); td.setAttribute("data-l", c[2]);
      if (c[0] === "ts") td.appendChild(when(e.ts));
      else if (c[0] === "trade") td.appendChild(el("b", null, OT.n0(x.scu) + " SCU × " + (x.cm || "Sans nom")));
      else if (c[0] === "route") td.textContent = OT.route(x) || "Lieux non renseignés";
      else if (c[0] === "net") td.appendChild(el("span", n < 0 ? "neg" : n > 0 ? "pos" : "", OT.netTxt(n)));
      else td.appendChild(el("span", r != null && r < 0 ? "neg" : "", r == null ? "—" : OT.pct(r) + (r < 0 ? " (perte)" : "")));
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb); w.appendChild(t); host.appendChild(w);
}

function render(force) {
  var all = trades(), now = Date.now();
  var s = all.map(function (e) { return e.id + ":" + e.ts + ":" + JSON.stringify(e.tr); }).join("|");
  if (!force && s === sig) return;
  sig = s;
  var box = $("cm30"), last = $("cmLast"), u = NB + "aUEC";
  var m = all.filter(function (e) { return e.ts >= now - DAYS * 864e5; }), st = OT.stats(m.map(function (e) { return { trade: e.tr }; }));
  box.textContent = "";
  if (!all.length) {
    var eb = el("div", "cm-empty");
    eb.appendChild(el("p", null, "Votre journal ne contient aucun trade."));
    eb.appendChild(el("p", "cm-hint", "Calculez un trade pour voir ici le bénéfice des 30 derniers jours."));
    eb.appendChild(openBtn("Calculer un trade")); box.appendChild(eb);
  } else if (!m.length) {
    box.appendChild(el("p", "cm-hint", "Aucun trade sur les 30 derniers jours."));
  } else {
    var g = el("div", "tr-stats cm-stats");
    g.appendChild(stat(st.net < 0 ? "Perte totale" : "Bénéfice net", OT.sg(st.net) + u, st.net < 0 ? "neg" : st.net > 0 ? "pos" : "", st.net < 0 ? "perte sur 30 jours" : "sur 30 jours"));
    g.appendChild(stat("Trades", String(st.n)));
    g.appendChild(stat("ROI moyen pondéré", st.roi == null ? "—" : OT.pct(st.roi), st.roi != null && st.roi < 0 ? "neg" : "", st.roi != null && st.roi < 0 ? "perte" : ""));
    box.appendChild(g);
  }
  if (!all.length) { last.textContent = ""; last.appendChild(el("p", "cm-hint", "Aucun trade pour le moment. Les cinq derniers trades apparaîtront ici.")); }
  else table(last, all.slice(0, 5));
  $("cmAll").parentNode.hidden = !all.length;
}

/* ── données de marché (UEX, facultatif) : une seule requête GET /api/uex/status à chaque affichage de l'onglet (jamais de sondage),
   aucune requête quand l'onglet n'est pas affiché ; le navigateur ne parle qu'à ce serveur (CSP inchangée). ── */
var UEX_URL = "https://uexcorp.space", mkBusy = false;
var UEX_LABELS = { commodities_prices_all: "Prix des marchandises", commodities: "Marchandises", terminals: "Terminaux", star_systems: "Systèmes stellaires", fuel_prices_all: "Prix du carburant",
  refineries_yields: "Raffineries : rendements", refineries_methods: "Raffineries : méthodes", refineries_capacities: "Raffineries : capacités", vehicles: "Vaisseaux",
  vehicles_purchases_prices_all: "Vaisseaux : prix d'achat", vehicles_rentals_prices_all: "Vaisseaux : prix de location", game_versions: "Version du jeu" };
var UEX_ERR = { timeout: "délai dépassé", network: "réseau injoignable", denied: "accès refusé", rate_limited: "quota atteint", invalid_json: "réponse illisible", upstream_status: "réponse refusée",
  too_big: "réponse trop volumineuse", invalid_data: "réponse illisible" };
function ago(s) {
  if (!(s >= 0)) return "";
  if (s < 60) return "moins d'une minute";
  if (s < 3600) return Math.floor(s / 60) + NB + "min";
  if (s < 86400) return Math.floor(s / 3600) + NB + "h";
  return Math.floor(s / 86400) + NB + "j";
}
function mkMsg(t) { $("cmMktMsg").textContent = t; }
function mkShow(on, btn) { $("cmMktOn").hidden = !on; $("cmMktBtn").hidden = !btn; }
function mkOff() {
  mkMsg("Données de marché : désactivées. Pour les activer, voir la documentation (UEX_ENABLED=1)");
  mkShow(false, false);
}
function mkErr() {
  mkMsg("Données de marché : état indisponible pour le moment (le serveur ne répond pas). Les outils ci-dessus restent utilisables.");
  mkShow(false, true);
}
function mkState(r) {
  var c = "none", t = "pas encore récupérée";
  if (r.state === "ok") { c = "ok"; t = r.age_s < 60 ? "à jour (à l'instant)" : "à jour il y a " + ago(r.age_s); }
  else if (r.state === "stale") { c = "bad"; t = "ancienne (il y a " + ago(r.age_s) + ")"; }
  else if (r.state === "error") { c = "bad"; t = "indisponible"; }
  if (r.error && (r.state === "error" || r.state === "stale")) t += " : " + (UEX_ERR[r.error] || (/^http_(\d{3})$/.test(r.error) ? "erreur HTTP " + r.error.slice(5) : "erreur"));
  return { c: c, t: t };
}
function mkOn(j) {
  var head = $("cmMktHead"), ul = $("cmMktList");
  mkMsg("Données de marché : activées. Elles ne sont récupérées qu'à la demande, puis gardées en cache sur le serveur.");
  head.textContent = "";
  var a = el("a", "cm-badge", "Powered by UEX"); a.href = UEX_URL; a.target = "_blank"; a.rel = "noopener noreferrer"; a.setAttribute("aria-label", "Powered by UEX Corp, site externe");
  head.appendChild(a); head.appendChild(el("span", "cm-mkt-note", "Données communautaires, peuvent être inexactes"));
  ul.textContent = "";
  (j.resources || []).forEach(function (r) {
    var li = el("li"), s = mkState(r);
    li.appendChild(el("span", null, UEX_LABELS[r.resource] || String(r.resource)));
    li.appendChild(el("span", "cm-st " + s.c, s.t));
    ul.appendChild(li);
  });
  var g = j.game_version;
  $("cmMktVer").textContent = g && g.live ? "Version du jeu connue d'UEX : " + g.live + (g.ptu ? " (PTU " + g.ptu + ")" : "") + "." : "";
  mkShow(true, true);
}
function uexLoad() {
  if (!shown() || mkBusy || typeof fetch !== "function") return;
  mkBusy = true;
  fetch("/api/uex/status", { headers: { Accept: "application/json" }, cache: "no-store" }).then(function (r) {
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("http");
    return r.json();
  }).then(function (j) { if (j && j.enabled === true) mkOn(j); else mkOff(); })
    .catch(mkErr).then(function () { mkBusy = false; });
}

/* tiroir : même tiroir que le carnet, action finale « Ajouter au journal » */
function say(msg) {
  var p = $("cmStatus"); clearTimeout(flashT); p.textContent = "";
  if (!msg) return;
  setTimeout(function () { p.textContent = msg; }, 50);
  flashT = setTimeout(function () { p.textContent = ""; }, 9000);
}
function openDrawer(opener, note) {
  OT.drawer.open({ opener: opener, submit: "Ajouter au journal", onAdd: function (r) { onAdd(r, opener); } });
  if (note) $("trMsg").textContent = note;
}
function onAdd(r, opener) {
  LG.addTrade(r.trade, r.dur).then(function () {
    OT.drawer.set({});
    render(true);
    say("Trade ajouté au journal");
    var a = document.activeElement;
    if (!a || a === document.body || !view.contains(a)) $("cm30T").focus({ preventScroll: true });
  }).catch(function (e) {
    say("Le trade n'a pas pu être enregistré (" + (e && e.code || "erreur") + ").");
    openDrawer(opener, "Impossible d'enregistrer le trade (" + (e && e.code || "erreur") + "). Votre saisie est conservée : réessayez.");
  });
}
view.addEventListener("click", function (e) {
  var b = e.target.closest("#cmOpen,#cmCard,.cm-open");
  if (b) { openDrawer(b); return; }
  if (e.target.closest("#cmMktBtn")) { uexLoad(); return; }
  if (e.target.closest("#cmAll")) LG.showType("cargo"); /* la navigation vers le carnet est faite par data-go (map.js) */
});

window.addEventListener("lg:update", function () { if (shown()) render(); });
/* appelé par map.js à chaque affichage de l'onglet : résumé recalculé (la fenêtre de 30 jours avance) et stockage serveur relu */
window.__orbCommerce = function () { render(true); LG.sync(); uexLoad(); };
if (shown()) { render(true); uexLoad(); }
})();
