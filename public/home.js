(function(){
"use strict";
var N=document.getElementById("hmLogN"),D=document.getElementById("hmLogD"),B=document.getElementById("hmLast"),T=document.getElementById("hmLastT");
var NAMES={session:"Session de jeu",mining:"Minage",cargo:"Commerce / cargo",combat:"Combat",explo:"Exploration",mission:"Mission",salvage:"Récupération",pax:"Transport",race:"Course",social:"Social / événement",other:"Autre"};
function paint(){
  var g=window.__lg;if(!g)return;
  N.textContent=g.count?g.count+" entrée"+(g.count>1?"s":""):"Carnet vide";
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
