/* Onglet Comm-Links : liste des communications de RSI, chargée au premier affichage. */
(function(){
var $=function(s){return document.querySelector(s)};
var D=null,loading=false,started=false,list=[],shown=0,STEP=60,ch=-1;
var SITE="https://robertsspaceindustries.com",MEDIA="https://media.robertsspaceindustries.com";
function norm(t){return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")}
function esc(t){return String(t).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function img(p){return !p?"":p.indexOf("/media/")===0?SITE+p:p.indexOf("http")===0?p:MEDIA+p}
function dateFr(d){
  if(!d)return "";
  var m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(d);if(!m)return d;
  return new Date(+m[1],+m[2]-1,+m[3]).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"});
}
function card(r){
  var a=document.createElement("a");a.className="ev cl-card";a.href=SITE+"/comm-link/"+r[0];a.target="_blank";a.rel="noopener noreferrer";
  var s=r[6]>=0?D.series[r[6]]:"",lab=[D.channels[r[1]]||"RSI",dateFr(r[3])].filter(Boolean).join(" · ");
  a.innerHTML='<div class="ev-img">'+(r[4]?'<img class="ev-photo" loading="lazy" decoding="async" alt="" src="'+esc(img(r[4]))+'" onerror="this.remove()">':"")+'<span class="ev-lab">'+esc(lab)+'</span></div>'
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
  shown=0;$("#clGrid").textContent="";more();
}
function more(){
  var g=$("#clGrid"),end=Math.min(list.length,shown+STEP);
  for(var i=shown;i<end;i++)g.appendChild(card(list[i]));
  shown=end;
  $("#clMore").hidden=shown>=list.length;
  $("#clCount").textContent=list.length?(shown+" affichés sur "+list.length+" Comm-Link"+(list.length>1?"s":"")):"Aucun Comm-Link ne correspond.";
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
  s.addEventListener("change",apply);$("#clMore").addEventListener("click",more);
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
