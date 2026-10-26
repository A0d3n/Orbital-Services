(function(){
"use strict";
var N=document.getElementById("hmLogN"),D=document.getElementById("hmLogD"),B=document.getElementById("hmLast"),T=document.getElementById("hmLastT");
var NAMES={session:"Session de jeu",mining:"Minage",cargo:"Commerce / cargo",combat:"Combat",explo:"Exploration",mission:"Mission",salvage:"Récupération",pax:"Transport",race:"Course",social:"Social / événement",other:"Autre"};
function paint(){
  var g=window.__lg;if(!g)return;
  N.textContent=g.count?g.count+" entrée"+(g.count>1?"s":""):"Carnet vide";
  var SN=document.getElementById("sideLogN");if(SN)SN.textContent=g.count?g.count+" entrée"+(g.count>1?"s":""):"Carnet vide";
  if(g.last){
    var e=g.last;B.hidden=false;T.textContent="";
    var d=new Date(e.ts).toLocaleString("fr-FR",{weekday:"long",day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"});
    T.appendChild(document.createTextNode((NAMES[e.type]||"Autre")+(e.title?" · "+e.title:"")+" — "+d));
  }else B.hidden=true;
}
window.addEventListener("lg:update",paint);paint();
})();

/* mode hors ligne */
if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
}

/* historique des versions */
(function(){
  var V=window.VERSIONS||[],list=document.getElementById("verList");
  if(!list||!V.length)return;
  function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e}
  var cur="v"+V[0].v;
  document.getElementById("verCur").textContent=cur;
  var sv=document.getElementById("sideVer");if(sv)sv.textContent=cur;
  V.forEach(function(e,i){
    var li=el("li","ver-item"+(i===0?" current":""));
    var head=el("div","ver-head");
    head.appendChild(el("span","ver-v","v"+e.v));
    if(i===0)head.appendChild(el("span","pill s","Actuelle"));
    var d=el("time","ver-d",new Date(e.d+"T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}));d.dateTime=e.d;head.appendChild(d);
    if(e.c)head.appendChild(el("code","ver-c",e.c));
    li.appendChild(head);li.appendChild(el("h3","ver-t",e.t));li.appendChild(el("p","ver-n",e.n));
    list.appendChild(li);
  });
})();

/* lien d'évitement : place le focus sur le contenu sans modifier l'adresse (le hash sert à la navigation) */
(function(){
  var a=document.getElementById("skip"),m=document.getElementById("main");
  if(a&&m)a.addEventListener("click",function(e){e.preventDefault();m.focus({preventScroll:true});window.scrollTo(0,0)});
})();

/* lien partagé #chronologie/<id> : ouvre la chronologie sur l'événement (au chargement et quand l'adresse change) */
(function(){
  function evId(h){var m=/^#chronologie\/([^\/?#]+)/.exec(h||"");if(!m)return null;try{return decodeURIComponent(m[1])}catch(e){return m[1]}}
  function open(id){
    if(!id||!window.__orbOpenEv||!window.__orbOpenEv(id))return;
    try{history.replaceState(null,"","#chronologie/"+id)}catch(e){}
  }
  open(evId(window.__orbHash0));
  /* ce gestionnaire passe après celui de map.js, qui a déjà affiché l'onglet */
  addEventListener("hashchange",function(e){var i=(e.newURL||"").indexOf("#");open(evId(i<0?"":e.newURL.slice(i)))});
})();
