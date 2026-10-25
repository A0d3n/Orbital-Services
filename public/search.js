/* Recherche globale : palette de commandes ouverte par « / » ou la loupe de l'en-tête.
   Sources : événements de la chronologie, systèmes, planètes, Comm-Links (commlinks.js chargé à la première ouverture). */
(function () {
"use strict";
var $ = function (s) { return document.getElementById(s); };
var ov = $("srchOv"), dlg = $("srchDlg"), inp = $("srchQ"), lb = $("srchLb"), hint = $("srchHint"), sug = $("srchSug");
var countEl = $("srchCount"), copyBtn = $("srchCopy"), closeBtn = $("srchClose"), openBtn = $("srchOpen");
if (!ov || !inp || typeof ERAS === "undefined" || typeof SYS === "undefined") return;

var SITE = "https://robertsspaceindustries.com";
var MAX_PER_GROUP = 8, SNIP = 120;
var GROUPS = [
  { k: "ev", name: "Événements de la chronologie", color: "#e8895a" },
  { k: "sys", name: "Systèmes", color: "#6fa6d6" },
  { k: "pl", name: "Planètes", color: "#a98bdb" },
  { k: "cl", name: "Comm-Links", color: "#6fcf93" }
];
var SUGGEST = ["Stanton", "Terra", "Xi’an", "Monthly Report"];

/* ---------- normalisation : accents, casse, apostrophes (supprimées), espaces insécables ---------- */
var DIA = /[̀-ͯ]/g;
function norm(s) {
  return String(s).normalize("NFD").replace(DIA, "").replace(/[’‘ʼ'`´]/g, "").replace(/[\s  ]/g, " ").toLowerCase();
}
/* même normalisation, avec la position de chaque caractère dans le texte d'origine (pour surligner) */
function normMap(s) {
  var n = "", map = [];
  for (var i = 0; i < s.length; i++) {
    var c = norm(s.charAt(i));
    for (var j = 0; j < c.length; j++) { n += c.charAt(j); map.push(i); }
  }
  return { n: n, map: map };
}
function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

/* ---------- index ---------- */
var IDX = null, CL = { state: 0, rows: null, series: null, channels: null, nt: null, nx: null, ne: null };

function item(t, o) {
  o.t = t; o.nt = norm(o.ti); o.nx = norm(o.tx || ""); o.ne = norm(o.ex || "");
  return o;
}
function buildIndex() {
  IDX = { ev: [], sys: [], pl: [] };
  ERAS.forEach(function (era) {
    era.e.forEach(function (e) {
      IDX.ev.push(item("ev", { id: e.id, ti: e.t, tx: e.d, ex: e.y, tag: e.y, w: e.m ? 5 : 0 }));
    });
  });
  SYS.forEach(function (s) {
    var tx = [s.by].concat(s.o.map(function (o) { return o[2]; })).filter(Boolean).join(" · ");
    IDX.sys.push(item("sys", { id: s.i, ti: s.n, tx: tx, ex: s.d ? String(s.d) : "", tag: s.d ? String(s.d) : "Origine", w: s.mj ? 5 : 0, sys: s }));
    s.p.forEach(function (p, k) {
      var tx2 = p[1] && p[1].length ? p[1][0][1] : "";
      IDX.pl.push(item("pl", { id: s.i + ":" + k, ti: p[0], tx: tx2, ex: s.n, tag: s.n, w: 0, sys: s, nameOnly: true }));
    });
  });
}

/* ---------- Comm-Links : chargés à la première ouverture, sans bloquer les autres sources ---------- */
function clReady(D) {
  CL.rows = D.rows; CL.series = D.series; CL.channels = D.channels;
  var n = D.rows.length;
  CL.nt = new Array(n); CL.nx = new Array(n); CL.ne = new Array(n);
  for (var i = 0; i < n; i++) {
    var r = D.rows[i];
    CL.nt[i] = norm(r[2]); CL.nx[i] = norm(r[5] || ""); CL.ne[i] = r[6] >= 0 ? norm(D.series[r[6]]) : "";
  }
  CL.state = 2;
}
function clLoad() {
  if (CL.state) return;
  if (window.COMMLINKS) { clReady(window.COMMLINKS); return; }
  CL.state = 1;
  var s = document.createElement("script");
  s.src = "commlinks.js";
  s.onload = function () {
    if (window.COMMLINKS) clReady(window.COMMLINKS); else CL.state = 3;
    if (isOpen) render(true);
  };
  s.onerror = function () { CL.state = 3; if (isOpen) render(true); };
  document.head.appendChild(s);
}

/* ---------- recherche ---------- */
function score(it, toks, q) {
  var sc = scoreRaw(it.nt, it.nx, it.ne, toks, q);
  return sc < 0 ? -1 : sc + (it.w || 0);
}
function scoreRaw(nt, nx, ne, toks, q) {
  var inT = 0, i, tk;
  for (i = 0; i < toks.length; i++) {
    tk = toks[i];
    if (nt.indexOf(tk) >= 0) inT++;
    else if (nx.indexOf(tk) < 0 && ne.indexOf(tk) < 0) return -1;
  }
  if (inT === toks.length) {
    var s = 300;
    if (nt === q) s += 300;
    else if (nt.indexOf(q) === 0) s += 200;           /* début du titre */
    else if (nt.indexOf(" " + q) >= 0) s += 100;      /* début d'un mot du titre */
    else if (nt.indexOf(q) >= 0) s += 50;
    return s;
  }
  return inT ? 150 + inT * 10 : 50;                   /* terme dans le titre > seulement dans le texte */
}
function find(q) {
  if (!IDX) buildIndex();
  var toks = q.split(" ").filter(Boolean), out = { ev: [], sys: [], pl: [], cl: [] }, k;
  ["ev", "sys", "pl"].forEach(function (g) {
    var arr = [];
    IDX[g].forEach(function (it, i) {
      var sc = it.nameOnly ? scoreRaw(it.nt, "", it.ne, toks, q) : score(it, toks, q);
      if (sc >= 0) arr.push([sc, i, it]);
    });
    arr.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; });
    out[g] = arr.slice(0, MAX_PER_GROUP).map(function (a) { return a[2]; });
  });
  if (CL.state === 2) {
    var cl = [];
    for (k = 0; k < CL.rows.length; k++) {
      var sc = scoreRaw(CL.nt[k], CL.nx[k], CL.ne[k], toks, q);
      if (sc >= 0) cl.push([sc, k]);
    }
    cl.sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; });
    out.cl = cl.slice(0, MAX_PER_GROUP).map(function (a) {
      var r = CL.rows[a[1]], ser = r[6] >= 0 ? CL.series[r[6]] : "";
      return { t: "cl", id: r[0], ti: r[2], tx: r[5] || "", nx: CL.nx[a[1]], sub0: [CL.channels[r[1]] || "RSI", dateFr(r[3])].filter(Boolean).join(" · "), tag: ser || CL.channels[r[1]] || "RSI", url: SITE + "/comm-link/" + r[0] };
    });
  }
  return out;
}
function dateFr(d) {
  var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d || "");
  if (!m) return d || "";
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/* ---------- surlignage (le texte est échappé) ---------- */
function ranges(text, toks) {
  var nm = normMap(text), r = [];
  toks.forEach(function (tk) {
    var i = nm.n.indexOf(tk);
    if (i >= 0) r.push([nm.map[i], nm.map[i + tk.length - 1] + 1]);
  });
  r.sort(function (a, b) { return a[0] - b[0]; });
  var m = [];
  r.forEach(function (x) {
    var l = m[m.length - 1];
    if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else m.push([x[0], x[1]]);
  });
  return m;
}
function paint(text, rs, a, b) {
  var h = "", p = a;
  rs.forEach(function (x) {
    var s = Math.max(x[0], a), e = Math.min(x[1], b);
    if (e <= s) return;
    h += esc(text.slice(p, s)) + "<mark>" + esc(text.slice(s, e)) + "</mark>";
    p = e;
  });
  return h + esc(text.slice(p, b));
}
function hl(text, toks) { return paint(text, ranges(text, toks), 0, text.length); }
function snip(text, toks) {
  if (!text) return "";
  var rs = ranges(text, toks), a = 0, b = text.length;
  if (text.length > SNIP) {
    if (rs.length) a = Math.max(0, rs[0][0] - 35);
    if (a > 0) { var sp = text.indexOf(" ", a); if (sp >= 0 && sp < rs[0][0]) a = sp + 1; }
    b = Math.min(text.length, a + SNIP);
    if (b < text.length) { var sp2 = text.lastIndexOf(" ", b); if (sp2 > a + 40 && (!rs.length || sp2 > rs[0][1])) b = sp2; }
  }
  return (a > 0 ? "…" : "") + paint(text, rs, a, b) + (b < text.length ? "…" : "");
}

/* ---------- liens ---------- */
function base() { return location.href.split("#")[0]; }
function mapYear(s) {
  var r = document.getElementById("mRange"), y = r ? parseInt(r.value, 10) : 2956;
  if (!(y >= 2100 && y <= 2956)) y = 2956;
  return Math.max(y, s.d || 0);
}
function hashOf(it) {
  if (it.t === "ev") return "#chronologie/" + it.id;
  return "#carte/" + mapYear(it.sys) + "/" + it.sys.i;
}
function linkOf(it) { return it.t === "cl" ? it.url : base() + hashOf(it); }

/* ---------- affichage ---------- */
var isOpen = false, flat = [], cur = 0, lastFocus = null, lastQ = null, appEl = document.querySelector(".app");

function render(keep) {
  var raw = inp.value.trim(), q = norm(raw).trim().replace(/ +/g, " "), keepKey = keep && flat[cur] ? flat[cur].t + flat[cur].id : null;
  flat = [];
  if (!q) {
    lb.hidden = true; lb.innerHTML = ""; hint.hidden = false;
    inp.setAttribute("aria-expanded", "false"); inp.removeAttribute("aria-activedescendant");
    countEl.textContent = ""; copyBtn.disabled = true; lastQ = q;
    return;
  }
  hint.hidden = true; lb.hidden = false; inp.setAttribute("aria-expanded", "true");
  var toks = q.split(" "), res = find(q), h = "", loadingNote = "";
  GROUPS.forEach(function (g) {
    var list = res[g.k];
    if (!list.length) return;
    h += '<li role="presentation"><ul class="srch-grp" role="group" aria-labelledby="sg-' + g.k + '"><li role="presentation" class="srch-gh" id="sg-' + g.k + '" style="--tc:' + g.color + '"><i></i>' + g.name + "</li>";
    list.forEach(function (it) {
      var i = flat.push(it) - 1, sub = snip(it.tx, toks);
      if (it.t === "cl" && !toks.some(function (tk) { return it.nx.indexOf(tk) >= 0; })) sub = esc(it.sub0);
      h += '<li class="srch-opt" role="option" id="so-' + i + '" data-i="' + i + '" aria-selected="false"><span class="srch-ot"><b>' + hl(it.ti, toks) + "</b><span>" + sub + '</span></span><span class="srch-tag">' + esc(it.tag) + "</span></li>";
    });
    h += "</ul></li>";
  });
  if (CL.state === 1) loadingNote = '<li role="presentation" class="srch-load">Chargement des Comm-Links…</li>';
  else if (CL.state === 3) loadingNote = '<li role="presentation" class="srch-load err">Comm-Links indisponibles pour le moment.</li>';
  if (!flat.length && CL.state !== 1) {
    lb.innerHTML = '<li role="presentation" class="srch-empty"><b>Aucun résultat pour « ' + esc(raw) + " »</b>Essayez un nom de système, une année ou un mot du titre.</li>" + loadingNote;
    inp.removeAttribute("aria-activedescendant");
    countEl.textContent = "Aucun résultat"; copyBtn.disabled = true; lastQ = q;
    return;
  }
  lb.innerHTML = h + loadingNote;
  copyBtn.disabled = !flat.length;
  var n = flat.length;
  countEl.textContent = (n ? n + " résultat" + (n > 1 ? "s" : "") : "Aucun résultat pour l’instant") + (CL.state === 1 ? ", Comm-Links en cours de chargement" : "");
  var at = 0;
  if (keepKey) flat.forEach(function (it, i) { if (it.t + it.id === keepKey) at = i; });
  if (flat.length) sel(at, keep ? false : true, true);
  lastQ = q;
}
function sel(i, scroll, top) {
  if (!flat.length) return;
  cur = (i + flat.length) % flat.length;
  [].forEach.call(lb.querySelectorAll(".srch-opt"), function (o) { o.setAttribute("aria-selected", +o.dataset.i === cur ? "true" : "false"); });
  var o = $("so-" + cur);
  inp.setAttribute("aria-activedescendant", "so-" + cur);
  if (top) lb.scrollTop = 0;
  else if (scroll !== false && o) o.scrollIntoView({ block: "nearest" });
}

/* ---------- ouverture et fermeture ---------- */
function isNarrow() { return matchMedia("(max-width:699px)").matches; }
function fitViewport() {
  var vv = window.visualViewport;
  if (!isOpen || !vv || !isNarrow()) { ov.style.height = ""; ov.style.transform = ""; return; }
  ov.style.height = vv.height + "px"; ov.style.transform = "translateY(" + vv.offsetTop + "px)";
}
function open() {
  if (isOpen) return;
  lastFocus = document.activeElement;
  isOpen = true;
  ov.hidden = false;
  document.documentElement.classList.add("srch-lock");
  if (appEl) appEl.inert = true;
  clLoad();
  fitViewport();
  render();
  inp.focus(); inp.select();
}
function close(restore) {
  if (!isOpen) return;
  isOpen = false;
  ov.hidden = true;
  document.documentElement.classList.remove("srch-lock");
  if (appEl) appEl.inert = false;
  fitViewport();
  inp.setAttribute("aria-expanded", "false");
  if (restore && lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
}
function go(it) {
  if (!it) return;
  close(false);
  if (it.t === "cl") {
    var a = document.createElement("a");
    a.href = it.url; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a); a.click(); a.remove();
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus();
    return;
  }
  var h = hashOf(it);
  if (location.hash === h) window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL: location.href, newURL: location.href }));
  else location.hash = h;
  if (it.t !== "ev") { var m = $("main"); if (m) m.focus({ preventScroll: true }); }
}
function copy() {
  var it = flat[cur];
  if (!it) return;
  if (window.__orbCopy) window.__orbCopy(linkOf(it));
}

/* ---------- événements ---------- */
openBtn.addEventListener("click", open);
closeBtn.addEventListener("click", function () { close(true); });
copyBtn.addEventListener("click", copy);
ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(true); });
inp.addEventListener("input", function () { render(false); });
lb.addEventListener("click", function (e) { var o = e.target.closest(".srch-opt"); if (o) go(flat[+o.dataset.i]); });
var mx = -1, my = -1;
lb.addEventListener("mousemove", function (e) {
  if (e.clientX === mx && e.clientY === my) return; /* mouvement simulé après un défilement : on l'ignore */
  mx = e.clientX; my = e.clientY;
  var o = e.target.closest(".srch-opt"); if (o && +o.dataset.i !== cur) sel(+o.dataset.i, false);
});
sug.innerHTML = SUGGEST.map(function (s) { return '<button type="button">' + esc(s) + "</button>"; }).join("");
sug.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return;
  inp.value = b.textContent; render(false); inp.focus();
});
if (window.visualViewport) { visualViewport.addEventListener("resize", fitViewport); visualViewport.addEventListener("scroll", fitViewport); }
addEventListener("resize", fitViewport);

function typing(el) {
  if (!el || el === document.body) return false;
  var t = el.tagName;
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || el.isContentEditable;
}
function focusables() {
  return [].filter.call(dlg.querySelectorAll("input,button"), function (x) { return !x.disabled && x.offsetParent !== null; });
}
/* ouverture avec « / » */
document.addEventListener("keydown", function (e) {
  if (isOpen || e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (typing(document.activeElement)) return;
  e.preventDefault(); open();
});
/* clavier dans la palette (phase de capture : passe avant les raccourcis de map.js) */
window.addEventListener("keydown", function (e) {
  if (!isOpen) return;
  var k = e.key, onBtn = document.activeElement && document.activeElement.tagName === "BUTTON";
  if (k === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
  else if ((k === "ArrowDown" || k === "ArrowUp") && flat.length) { e.preventDefault(); e.stopPropagation(); sel(cur + (k === "ArrowDown" ? 1 : -1)); }
  else if (k === "Enter" && !onBtn) {
    e.preventDefault(); e.stopPropagation();
    if (e.ctrlKey || e.metaKey) copy(); else if (flat.length) go(flat[cur]);
  } else if (k === "Tab") {
    var f = focusables(), i = f.indexOf(document.activeElement);
    e.preventDefault(); e.stopPropagation();
    if (f.length) f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  }
}, true);

window.__orbSearch = { open: open, close: close, norm: norm };
})();
