/* Outils communs (chargé en premier, avant data.js) : un seul espace de noms global, window.OrbUtil.
   - $(sel, racine?)  : document.querySelector (racine facultative) ; $$ : querySelectorAll sous forme de tableau.
   - esc(t)           : échappement HTML (& < > " '), sûr dans un texte comme dans un attribut.
   - escRe(t)         : échappement d'une chaîne pour l'insérer dans une RegExp (autre sémantique que esc).
   - norm(t, opt)     : sans accents (NFD) et en minuscules. Les variantes d'origine diffèrent, elles sont conservées par options :
       opt.drop = RegExp des apostrophes à SUPPRIMER (recherche globale, recherche de système) ;
       opt.keep = true : apostrophes typographiques ramenées à « ' » (chronologie) ;
       opt.sp   = RegExp des espaces à ramener à une espace simple ;
       opt.trim = true : retire les espaces aux extrémités.
     Sans option : accents et casse seulement (Comm-Links).
   - Carnet de bord : MASQUÉ par défaut. Activé si localStorage["orbital-carnet"] === "1" ou si l'adresse contient ?carnet=1
     (la valeur est alors mémorisée) ; ?carnet=0 le désactive et efface la valeur. Calculé ici, tout de suite (ce script est
     chargé dans <head>, avant le premier rendu et avant le routage) : <html data-carnet="1"> si activé, et OrbUtil.carnet. */
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
var KEY = "orbital-carnet", carnet = false, q = /[?&]carnet=([01])(?=&|#|$)/.exec(location.search);
try {
  if (q) { if (q[1] === "1") localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); }
} catch (e) {}
try { carnet = q ? q[1] === "1" : localStorage.getItem(KEY) === "1"; } catch (e) { carnet = !!q && q[1] === "1"; }
if (carnet) document.documentElement.setAttribute("data-carnet", "1");
/* #carnet sans carnet : retour à l'accueil avant que map.js ne lise l'adresse (pas de boucle : le « # » disparaît) */
else if (/^#carnet(?:[\/?#]|$)/.test(location.hash)) { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} }
window.OrbUtil = { $: $, $$: $$, esc: esc, escRe: escRe, norm: norm, carnet: carnet };
})();
