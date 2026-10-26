/* Outils communs (chargé en premier, avant data.js) : un seul espace de noms global, window.OrbUtil.
   - $(sel, racine?)  : document.querySelector (racine facultative) ; $$ : querySelectorAll sous forme de tableau.
   - esc(t)           : échappement HTML (& < > " '), sûr dans un texte comme dans un attribut.
   - escRe(t)         : échappement d'une chaîne pour l'insérer dans une RegExp (autre sémantique que esc).
   - norm(t, opt)     : sans accents (NFD) et en minuscules. Les variantes d'origine diffèrent, elles sont conservées par options :
       opt.drop = RegExp des apostrophes à SUPPRIMER (recherche globale, recherche de système) ;
       opt.keep = true : apostrophes typographiques ramenées à « ' » (chronologie) ;
       opt.sp   = RegExp des espaces à ramener à une espace simple ;
       opt.trim = true : retire les espaces aux extrémités.
     Sans option : accents et casse seulement (Comm-Links). */
(function () {
"use strict";
var DIA = /[\u0300-\u036f]/g;
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(t) { return String(t).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
function escRe(t) { return String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function norm(t, o) {
  o = o || {};
  var s = String(t).normalize("NFD").replace(DIA, "");
  if (o.drop) s = s.replace(o.drop, "");
  if (o.keep) s = s.replace(/[\u2019']/g, "'");
  if (o.sp) s = s.replace(o.sp, " ");
  s = s.toLowerCase();
  return o.trim ? s.trim() : s;
}
window.OrbUtil = { $: $, $$: $$, esc: esc, escRe: escRe, norm: norm };
})();
