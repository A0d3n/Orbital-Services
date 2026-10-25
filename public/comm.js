/* Onglet Comm-Links : liste des communications de RSI, chargée au premier affichage. */
(function(){
var $=OrbUtil.$,esc=OrbUtil.esc;
var D=null,loading=false,started=false,list=[],shown=0,FIRST=12,STEP=18,ch=-1,live=null;
var SITE="https://robertsspaceindustries.com",MEDIA="https://media.robertsspaceindustries.com";
function norm(t){return OrbUtil.norm(t)} /* accents et casse seulement */
function img(p){return !p?"":p.indexOf("/media/")===0?SITE+p:p.indexOf("http")===0?p:MEDIA+p}
/* vignette : RSI publie aussi chaque média en « slideshow » (648 x 366, ~40 % du poids de channel_item_full 1119 x 600).
   Variante vérifiée sur les URL de commlinks.js (voir docs/images.md). Seule la vignette est chargée (suffisante même en 2x) ; repli sur l'original si elle échoue.
   Les largeurs d'affichage sont celles de la chronologie (même grille .evs). */
var SIZES="(max-width:860px) calc(100vw - 30px), (max-width:905px) 610px, (max-width:1239px) 455px, 400px";
function slide(p){
  if(!p||p.indexOf("channel_item_full")<0)return "";
  return p.indexOf("/media/")===0?p.replace("/channel_item_full/","/slideshow/"):p.replace(/channel_item_full(\.\w+)$/,"slideshow$1");
}
function photo(p){
  var full=img(p),sl=slide(p);
  if(!sl||sl===p)return '<img class="ev-photo" loading="lazy" decoding="async" alt="" src="'+esc(full)+'">';
  return '<img class="ev-photo" loading="lazy" decoding="async" alt="" width="648" height="366" src="'+esc(img(sl))+'" data-full="'+esc(full)+'">';
}
function dateFr(d){
  if(!d)return "";
  var m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(d);if(!m)return d;
  return new Date(+m[1],+m[2]-1,+m[3]).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"});
}
function card(r){
  var a=document.createElement("a");a.className="ev cl-card";a.href=SITE+"/comm-link/"+r[0];a.target="_blank";a.rel="noopener noreferrer";
  var s=r[6]>=0?D.series[r[6]]:"",lab=[D.channels[r[1]]||"RSI",dateFr(r[3])].filter(Boolean).join(" · ");
  a.innerHTML='<div class="ev-img">'+(r[4]?photo(r[4]):"")+'<span class="ev-lab">'+esc(lab)+'</span></div>'
    +'<div class="body"><h3>'+esc(r[2])+'</h3>'+(s?'<p class="cl-ser-l">'+esc(s)+'</p>':"")+(r[5]?'<p class="ev-desc">'+esc(r[5])+'</p>':"")+'</div>';
  return a;
}
function apply(){
  var q=norm($("#clQ").value.trim()),sv=$("#clSer").value;
  list=D.rows.filter(function(r){
    if(ch>=0&&r[1]!==ch)return false;
    if(sv!==""&&String(r[6])!==sv)return false;
    return !q||norm(r[2]+" "+r[5]).indexOf(q)>=0;
  });
  shown=0;$("#clGrid").textContent="";more(FIRST);
}
/* affiche n cartes de plus ; si byUser, annonce le nombre ajouté et place le focus sur la première nouvelle carte */
function more(n,byUser){
  var g=$("#clGrid"),end=Math.min(list.length,shown+n),first=null,cnt=$("#clCount");
  for(var i=shown;i<end;i++){var c=card(list[i]);if(!first)first=c;g.appendChild(c)}
  var added=end-shown;shown=end;
  $("#clMore").hidden=shown>=list.length;
  if(byUser)cnt.setAttribute("aria-live","off"); /* une seule annonce : « N Comm-Links de plus affichés » */
  cnt.textContent=list.length?(shown+" affichés sur "+list.length+" Comm-Link"+(list.length>1?"s":"")):"Aucun Comm-Link ne correspond.";
  if(byUser){
    if(live)live.textContent=added+" Comm-Link"+(added>1?"s":"")+" de plus affiché"+(added>1?"s":"");
    if(first)first.focus();
    setTimeout(function(){cnt.removeAttribute("aria-live")},0);
  }else if(live)live.textContent="";
}
function chips(){
  var box=$("#clChips"),all=[["Tous",-1]].concat(D.channels.map(function(n,i){return[n,i]}));
  box.innerHTML="";
  all.forEach(function(c){
    var b=document.createElement("button");b.type="button";b.className="chip";b.textContent=c[0];b.setAttribute("aria-pressed",String(c[1]===ch));
    b.style.setProperty("--tc","var(--sage)");
    b.addEventListener("click",function(){ch=c[1];[].forEach.call(box.children,function(x,k){x.setAttribute("aria-pressed",String(all[k][1]===ch))});apply()});
    box.appendChild(b);
  });
}
function init(){
  var s=$("#clSer");
  D.series.map(function(n,i){return[n,i]}).sort(function(a,b){return a[0].localeCompare(b[0],"fr")}).forEach(function(x){
    var o=document.createElement("option");o.value=String(x[1]);o.textContent=x[0];s.appendChild(o);
  });
  chips();apply();
  var t;$("#clQ").addEventListener("input",function(){clearTimeout(t);t=setTimeout(apply,150)});
  s.addEventListener("change",apply);
  var mb=$("#clMore");mb.textContent="Voir plus";mb.addEventListener("click",function(){more(STEP,true)});
  live=document.createElement("span");live.className="sr";live.setAttribute("role","status");live.id="clLive";
  mb.parentNode.appendChild(live);
  /* vignette absente : repli sur l'original ; si l'original échoue aussi, la carte garde son fond */
  $("#clGrid").addEventListener("error",function(e){
    var i=e.target;if(!i||i.tagName!=="IMG")return;
    if(i.dataset.full&&i.getAttribute("src")!==i.dataset.full){i.src=i.dataset.full}else i.remove();
  },true);
}
window.__orbCL=function(){
  if(started||loading)return;loading=true;
  $("#clCount").textContent="Chargement des Comm-Links…";
  var sc=document.createElement("script");sc.src="commlinks.js";
  sc.onload=function(){D=window.COMMLINKS;started=true;loading=false;init()};
  sc.onerror=function(){loading=false;$("#clCount").textContent="Impossible de charger la liste des Comm-Links."};
  document.head.appendChild(sc);
};
})();
