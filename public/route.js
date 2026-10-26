/* Itinéraire entre deux systèmes (Star Viewer) : section « Itinéraire » du panneau Filtres, calcul du plus court chemin
   en nombre de sauts (BFS) sur les liaisons actives à l'année affichée, tracé sur la carte.
   Maquette : docs/itineraire/A-panneau.html. Chargé avant map.js, qui appelle OrbRoute.init(api). */
(function () {
"use strict";
var U = window.OrbUtil, esc = U.esc;

function init(A) {
  var SYS = A.SYS, BY = A.BY, EDG = A.EDG, POS = A.POS, NS = A.NS;
  var st = { de: null, vers: null, bad: { de: "", vers: "" } };
  var KEYS = ["de", "vers"];
  var root = A.root;
  var IN = { de: U.$("#rtDe"), vers: U.$("#rtVers") }, LB = { de: U.$("#rtDeL"), vers: U.$("#rtVersL") };
  var stat = U.$("#rtStat"), cta = U.$("#rtCta"), steps = U.$("#rtSteps"), note = U.$("#rtNote"), clr = U.$("#rtClear"), head = U.$("#rtH");
  SYS.forEach(function (s) { s.nn = A.norm(s.n); });

  /* ---------- calcul ---------- */
  function active(e, y) { return y >= e.y && (!e.u || y < e.u); } /* même règle que la carte */
  function path(a, b, y) {
    var adj = {};
    EDG.forEach(function (e) {
      if (!active(e, y)) return;
      (adj[e.a] = adj[e.a] || []).push([e.b, e]);
      (adj[e.b] = adj[e.b] || []).push([e.a, e]);
    });
    var prev = {}, q = [a], i = 0;
    prev[a] = null;
    while (i < q.length) {
      var c = q[i++];
      if (c === b) break;
      (adj[c] || []).forEach(function (n) { if (!(n[0] in prev)) { prev[n[0]] = [c, n[1]]; q.push(n[0]); } });
    }
    if (!(b in prev)) return null;
    var hops = [], x = b;
    while (prev[x]) { hops.unshift({ a: prev[x][0], b: x, e: prev[x][1] }); x = prev[x][0]; }
    return hops;
  }
  var cache = {};
  function firstYear(a, b) { /* plus petite année (MIN..MAX) où une route existe, ou 0 */
    var k = a < b ? a + "|" + b : b + "|" + a;
    if (k in cache) return cache[k];
    var r = 0;
    for (var y = A.MIN; y <= A.MAX; y++) { if (path(a, b, y)) { r = y; break; } }
    return cache[k] = r;
  }
  function solve() {
    var a = st.de, b = st.vers, y = A.getYear();
    if (st.bad.de || st.bad.vers) return { kind: "unknown", k: st.bad.de ? "de" : "vers" };
    if (!a && !b) return { kind: "idle" };
    if (!a || !b) return { kind: "partial", missing: a ? "vers" : "de" };
    if (a === b) return { kind: "same" };
    var nj = [a, b].filter(function (id) { return !A.LINKED[id]; });
    if (nj.length) return { kind: "nojump", ids: nj };
    var hops = path(a, b, y);
    if (hops) return { kind: "ok", hops: hops };
    var later = [a, b].filter(function (id) { return BY[id].d > y; });
    return { kind: "none", later: later, min: firstYear(a, b) };
  }
  function plural(n) { return n + " saut" + (n > 1 ? "s" : ""); }

  /* ---------- tracé sur la carte ---------- */
  var layer = document.createElementNS(NS, "g");
  layer.setAttribute("class", "rt-layer");
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("pointer-events", "none");
  A.nodes.parentNode.insertBefore(layer, A.nodes);
  var top = el("g", "rt-layer rt-top", { "aria-hidden": "true", "pointer-events": "none" }); /* badges et repères : au-dessus des systèmes pour rester lisibles */
  A.nodes.parentNode.appendChild(top);
  var marks = [], routeIds = {}, drawnSig = "";
  function el(tag, cls, attrs) {
    var n = document.createElementNS(NS, tag);
    if (cls) n.setAttribute("class", cls);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function draw(res) {
    var sig = res.kind === "ok" ? res.hops.map(function (h) { return h.a + ">" + h.b + (h.e.dash ? "~" : ""); }).join(",") : "";
    if (sig === drawnSig) return false;
    drawnSig = sig;
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    while (top.firstChild) top.removeChild(top.firstChild);
    marks = [];
    SYS.forEach(function (s) { s.g.classList.remove("onroute"); });
    routeIds = {};
    if (res.kind !== "ok") return true;
    var lines = el("g", "rt-lines"), tags = el("g", "rt-marks");
    res.hops.forEach(function (h, i) {
      var p = POS[h.a], q = POS[h.b], at = { x1: p[0], y1: p[1], x2: q[0], y2: q[1] };
      lines.appendChild(el("line", "rt-h", at));
      lines.appendChild(el("line", "rt-l" + (h.e.dash ? " ded" : ""), at));
      var g = el("g", "rt-b"), c = el("circle", "", { r: 9 }), t = el("text", "", { y: 0 });
      t.textContent = i + 1;
      g.appendChild(c); g.appendChild(t); tags.appendChild(g);
      marks.push({ g: g, x: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2, badge: true });
      routeIds[h.a] = 1; routeIds[h.b] = 1;
    });
    [[res.hops[0].a, "Départ"], [res.hops[res.hops.length - 1].b, "Arrivée"]].forEach(function (d) {
      var g = el("g", "rt-t"), r = el("rect", "", { x: -29, width: 58, height: 16, rx: 2 }), t = el("text", "", { x: 0 });
      t.textContent = d[1];
      g.appendChild(r); g.appendChild(t); tags.appendChild(g);
      marks.push({ g: g, x: POS[d[0]][0], y: POS[d[0]][1], id: d[0], rect: r, text: t });
    });
    layer.appendChild(lines); top.appendChild(tags);
    for (var id in routeIds) BY[id].g.classList.add("onroute");
    rescale();
    return true;
  }
  /* badges et repères gardent une taille fixe à l'écran : on les met à l'échelle inverse du zoom */
  function rescale(sc) {
    sc = sc || A.getScale();
    if (!sc || !marks.length) return;
    marks.forEach(function (m) {
      m.g.setAttribute("transform", "translate(" + m.x.toFixed(1) + " " + m.y.toFixed(1) + ") scale(" + (1 / sc).toFixed(5) + ")");
      if (!m.badge) {
        var off = (BY[m.id].r || 6) * sc + 7, y0 = tagY(m, sc, off);
        m.top = y0 < 0;
        m.rect.setAttribute("y", y0.toFixed(1));
        m.text.setAttribute("y", (y0 + 8).toFixed(1));
      }
    });
  }
  /* repère au-dessus du système ; en dessous si un badge de saut s'y trouve */
  function tagY(m, sc, off) {
    var hit = marks.some(function (b) {
      if (!b.badge) return false;
      var dx = (b.x - m.x) * sc, dy = (b.y - m.y) * sc;
      return Math.abs(dx) < 38 && dy > -off - 26 && dy < -off + 10;
    });
    return hit ? off : -off - 16;
  }
  /* cases (en pixels, repère du SVG) à éviter par les noms des systèmes */
  function boxes(sc, vb) {
    var o = [];
    marks.forEach(function (m) {
      var x = (m.x - vb.x) * sc, y = (m.y - vb.y) * sc;
      if (m.badge) o.push([x - 10, y - 10, x + 10, y + 10]);
      else { var off = (BY[m.id].r || 6) * sc + 7, y0 = tagY(m, sc, off); o.push([x - 29, y + y0, x + 29, y + y0 + 16]); }
    });
    return o;
  }

  /* ---------- interface ---------- */
  function nm(id) { return BY[id].n; }
  function setHTML(node, html, prop) { if (prop.v === html) return false; prop.v = html; node.innerHTML = html; return true; }
  var pStat = {}, pCta = {}, pSteps = {};
  function render(res) {
    var y = A.getYear(), h = "", c = "";
    if (res.kind === "ok") {
      var n = res.hops.length;
      h = '<p class="rt-sum"><b class="big">' + plural(n) + '</b><span class="sr"> · </span><span>' + esc(nm(st.de)) + ' → ' + esc(nm(st.vers)) + ' · en ' + y + '</span></p>';
    } else if (res.kind === "idle") {
      h = '<p class="rt-hint">Choisissez un départ et une arrivée.</p>';
    } else if (res.kind === "partial") {
      h = '<p class="rt-hint">' + (res.missing === "vers" ? "Choisissez un système d’arrivée." : "Choisissez un système de départ.") + '</p>';
    } else if (res.kind === "same") {
      h = '<div class="rt-err"><b>Départ et arrivée sont identiques</b><p>Choisissez deux systèmes différents.</p></div>';
    } else if (res.kind === "unknown") {
      var amb = candidates(st.bad[res.k]).length > 1, who = res.k === "de" ? "départ" : "arrivée";
      h = '<div class="rt-err"><b>' + (amb ? "Plusieurs systèmes correspondent à" : "Système inconnu :") + ' « ' + esc(st.bad[res.k]) + ' »</b><p>' +
        (amb ? "Précisez le nom ou choisissez-le dans la liste." : "Choisissez le " + who + " dans la liste des suggestions.") + '</p></div>';
    } else if (res.kind === "nojump") {
      h = '<div class="rt-err"><b>Aucun point de saut publié pour ' + res.ids.map(function (id) { return esc(nm(id)); }).join(" et ") + '</b><p>Sans liaison connue, aucun itinéraire n’est possible.</p></div>';
    } else if (res.kind === "none") {
      var why;
      if (res.later.length) why = res.later.map(function (id) { var s = BY[id]; return esc(s.n) + (s.nd ? " n’apparaît sur la carte qu’en " : " n’est découvert qu’en ") + s.d; }).join(" ; ") + ".";
      else if (!res.min) why = "Aucune route à aucune date connue.";
      else if (res.min > y) why = "Les liaisons ne sont pas encore ouvertes.";
      else why = "Les liaisons qui les reliaient ne sont plus ouvertes.";
      h = '<div class="rt-err"><b>Aucune route en ' + y + '</b><p>' + why + '</p></div>';
      if (res.min) c = '<button type="button" class="btn rt-cta" data-rt="year" data-y="' + res.min + '">Voir en ' + res.min + '</button>';
    }
    setHTML(stat, h, pStat);
    setHTML(cta, c, pCta);
    /* étapes : reconstruites seulement si l'itinéraire change (le focus d'un bouton d'étape est conservé) */
    var sh = "";
    if (res.kind === "ok") {
      sh = res.hops.map(function (hp, i) {
        var sp = A.SP[hp.e.a + "-" + hp.e.b], open = sp && sp.y ? sp.y : 0;
        return '<li><button type="button" class="rt-stp" data-hop="' + i + '" aria-label="Étape ' + (i + 1) + ' : ' + esc(nm(hp.a)) + ' → ' + esc(nm(hp.b)) + (hp.e.dash ? ', liaison déduite' : '') + '. Centrer la carte sur ' + esc(nm(hp.b)) + '."><b aria-hidden="true">' + (i + 1) + '</b><span class="t"><span>' + esc(nm(hp.a)) + ' → ' + esc(nm(hp.b)) + '</span>' +
          (hp.e.dash || open ? '<span class="sub">' + (hp.e.dash ? '<em class="rt-ded">liaison déduite</em>' : '') + (open ? '<small>ouverte en ' + open + '</small>' : '') + '</span>' : '') + '</span></button></li>';
      }).join("");
    }
    if (setHTML(steps, sh, pSteps)) steps.dataset.to = res.kind === "ok" ? res.hops.map(function (hp) { return hp.b; }).join(",") : "";
    steps.hidden = !sh; note.hidden = !sh;
    clr.hidden = !(st.de || st.vers || st.bad.de || st.bad.vers);
    stat.setAttribute("aria-live", A.isPlaying() ? "off" : "polite");
    KEYS.forEach(function (k) {
      var inp = IN[k];
      inp.setAttribute("aria-invalid", st.bad[k] ? "true" : "false");
      if (document.activeElement !== inp) inp.value = st[k] ? nm(st[k]) : st.bad[k];
    });
  }
  function update() {
    var res = solve();
    draw(res);
    render(res);
    return res;
  }
  function change() { update(); A.refresh(); }

  /* ---------- champs (combobox) ---------- */
  function candidates(q) {
    var n = A.norm(q);
    if (!n) return [];
    return SYS.filter(function (s) { return s.nn.indexOf(n) >= 0; });
  }
  function resolve(k) { /* texte saisi → système, ou « inconnu » */
    var v = IN[k].value.trim();
    st.bad[k] = "";
    if (!v) { st[k] = null; return; }
    var n = A.norm(v), exact = SYS.filter(function (s) { return s.nn === n; })[0];
    if (!exact) { var c = candidates(v); if (c.length === 1) exact = c[0]; }
    if (exact) { st[k] = exact.i; return; }
    st[k] = null; st.bad[k] = v;
  }
  function mention(s) {
    var y = A.getYear();
    if (s.d > y) return "pas encore découvert en " + y;
    if (!A.LINKED[s.i]) return "aucun point de saut";
    return "";
  }
  function combo(k) {
    var inp = IN[k], ul = LB[k], items = [], idx = -1, isOpen = false, quiet = false;
    function build(q) {
      var n = A.norm(q);
      items = SYS.filter(function (s) { return s.nn.indexOf(n) >= 0; }).sort(function (a, b) {
        return (a.nn.indexOf(n) === 0 ? 0 : 1) - (b.nn.indexOf(n) === 0 ? 0 : 1) || a.n.localeCompare(b.n, "fr");
      });
      ul.innerHTML = items.length ? items.map(function (s, i) {
        var m = mention(s);
        return '<li role="option" id="' + ul.id + '-' + i + '" data-i="' + i + '" aria-selected="false"><span>' + esc(s.n) + '</span>' + (m ? '<em>' + m + '</em>' : '') + '</li>';
      }).join("") : '<li class="none" role="presentation">Aucun système ne correspond</li>';
      idx = -1; inp.setAttribute("aria-activedescendant", "");
      ul.scrollTop = 0;
    }
    function open(q) { build(q); ul.hidden = false; isOpen = true; inp.setAttribute("aria-expanded", "true"); }
    function close() { ul.hidden = true; isOpen = false; idx = -1; inp.setAttribute("aria-expanded", "false"); inp.setAttribute("aria-activedescendant", ""); }
    function restore() { inp.value = st[k] ? nm(st[k]) : st.bad[k]; }
    function setIdx(i) {
      if (!items.length) return;
      idx = (i + items.length) % items.length;
      var lis = ul.children;
      for (var j = 0; j < lis.length; j++) lis[j].setAttribute("aria-selected", j === idx ? "true" : "false");
      var li = lis[idx];
      inp.setAttribute("aria-activedescendant", li.id);
      if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop;
      else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight;
    }
    function pick(s) { inp.value = s.n; close(); st[k] = s.i; st.bad[k] = ""; change(); }
    function commit() { resolve(k); change(); }
    inp.addEventListener("focus", function () { if (quiet) return; inp.select(); open(""); });
    inp.addEventListener("input", function () { open(inp.value); });
    inp.addEventListener("keydown", function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var key = e.key;
      if (key === "ArrowDown") { e.preventDefault(); if (!isOpen) open(inp.value); else setIdx(idx + 1); }
      else if (key === "ArrowUp") { e.preventDefault(); if (!isOpen) open(inp.value); else setIdx(idx < 0 ? items.length - 1 : idx - 1); }
      else if (key === "Home" && isOpen && idx >= 0) { e.preventDefault(); setIdx(0); }
      else if (key === "End" && isOpen && idx >= 0) { e.preventDefault(); setIdx(items.length - 1); }
      else if (key === "Enter") {
        e.preventDefault();
        if (isOpen && idx >= 0) pick(items[idx]);
        else if (isOpen && inp.value.trim() && items.length) {
          var n = A.norm(inp.value.trim()), ex = items.filter(function (s) { return s.nn === n; })[0];
          pick(ex || items[0]);
        } else { close(); commit(); }
      }
      else if (key === "Escape") { if (isOpen) { e.preventDefault(); e.stopPropagation(); close(); restore(); } }
      else if (key === "Tab") { close(); }
    });
    inp.addEventListener("blur", function () {
      setTimeout(function () { if (document.activeElement !== inp) { if (isOpen) close(); if (inp.value.trim() !== (st[k] ? nm(st[k]) : st.bad[k])) commit(); } }, 120);
    });
    ul.addEventListener("mousedown", function (e) { e.preventDefault(); });
    ul.addEventListener("click", function (e) { var li = e.target.closest("[data-i]"); if (li) pick(items[+li.dataset.i]); });
    return { focus: function (q) { quiet = !!q; inp.focus(); quiet = false; } };
  }
  var C = { de: combo("de"), vers: combo("vers") };

  /* ---------- actions ---------- */
  U.$("#rtSwap").addEventListener("click", function () {
    var t = st.de; st.de = st.vers; st.vers = t;
    t = st.bad.de; st.bad.de = st.bad.vers; st.bad.vers = t;
    change();
  });
  clr.addEventListener("click", function () {
    st.de = st.vers = null; st.bad.de = st.bad.vers = "";
    change(); C.de.focus(true);
  });
  cta.addEventListener("click", function (e) {
    var b = e.target.closest("[data-rt=year]");
    if (!b) return;
    A.setYear(+b.dataset.y);
    stat.tabIndex = -1; stat.focus({ preventScroll: true });
  });
  steps.addEventListener("click", function (e) {
    var b = e.target.closest("[data-hop]");
    if (!b) return;
    var to = steps.dataset.to.split(",")[+b.dataset.hop];
    if (to) A.goStep(to);
  });

  /* depuis la fiche d'un système : « Itinéraire depuis ici » / « jusqu'ici » */
  function fromFiche(k, id) {
    if (!BY[id]) return;
    st[k] = id; st.bad[k] = "";
    var other = k === "de" ? "vers" : "de";
    A.render();
    if (A.isMobile()) {
      A.openRail();
      var inn = root.querySelector(".in"), sec = U.$("#rtSec");
      inn.scrollTop += sec.getBoundingClientRect().top - inn.getBoundingClientRect().top - 8;
      head.tabIndex = -1; head.focus({ preventScroll: true });
    } else if (!st[other]) {
      C[other].focus();
    } else { stat.tabIndex = -1; stat.focus({ preventScroll: true }); }
  }

  /* ---------- lien partageable : ?de=sol&vers=stanton ---------- */
  function query() {
    var p = [];
    if (st.de) p.push("de=" + encodeURIComponent(st.de));
    if (st.vers) p.push("vers=" + encodeURIComponent(st.vers));
    return p.length ? "?" + p.join("&") : "";
  }
  function fromQuery(qs) {
    var p = new URLSearchParams(qs), got = false;
    KEYS.forEach(function (k) {
      if (!p.has(k)) return;
      got = true;
      var v = (p.get(k) || "").trim();
      st.bad[k] = ""; st[k] = null;
      if (!v) return;
      if (BY[v]) st[k] = v; else st.bad[k] = v;
    });
    return got;
  }

  return {
    update: update, rescale: rescale, boxes: boxes, query: query, fromQuery: fromQuery, fromFiche: fromFiche,
    has: function (id) { return !!routeIds[id]; },
    ids: function () { return Object.keys(routeIds); },
    afterStop: function () {
      stat.setAttribute("aria-live", "polite");
      var h = stat.innerHTML; stat.innerHTML = "";
      setTimeout(function () { stat.innerHTML = h; }, 60);
    },
    /* utilisé par les tests et la page d'accueil éventuelle */
    state: function () { return { de: st.de, vers: st.vers }; }
  };
}

window.OrbRoute = { init: init };
})();
