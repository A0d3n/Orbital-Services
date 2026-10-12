(function(){
"use strict";
var $=function(s,r){return (r||document).querySelector(s)};

/* index */
var BY={};SYS.forEach(function(s){BY[s.i]=s});
var EDG=EL.map(function(p){
  var a=BY[p[0]],b=BY[p[1]],sp=SP[p[0]+"-"+p[1]]||{};
  return{a:p[0],b:p[1],y:sp.y||Math.max(a.d,b.d),u:sp.u||0,dash:sp.dash||0};
});
var CH=[];
SYS.forEach(function(s){
  if(s.d>0&&!s.nd)CH.push({y:s.d,t:"Découverte du système "+s.n,s:s.i});
  s.o.forEach(function(o){if(o[0]>s.d)CH.push({y:o[0],t:s.n+" : "+o[2],s:s.i})});
  s.p.forEach(function(p){p[1].forEach(function(e){if(e[0]>s.d)CH.push({y:e[0],t:p[0]+" ("+s.n+") : "+e[1],s:s.i})})});
});
CH.sort(function(a,b){return a.y-b.y});
var CY=[];CH.forEach(function(c){if(c.y>=MIN&&c.y<=MAX&&CY.indexOf(c.y)<0)CY.push(c.y)});

var year=MAX,sel="stanton",playing=false,spd=30,facF="";
var svg=$("#mapsvg"),box=$("#mapbox"),detail=$("#mDetail"),feed=$("#mFeed");
var yEl=$("#mYear"),range=$("#mRange"),cEl=$("#mCount");

/* construction du SVG */
var SH={hum:"o",xian:"u",banu:"d",tev:"q",van:"v",out:"o",con:"r",none:"o"},INF={hum:1,xian:1,banu:1,tev:1,van:1};
function shapeD(k,x,y,r){
  if(k==="u")return"M"+x+","+(y-r*1.2)+"L"+(x+r*1.1)+","+(y+r*.8)+"L"+(x-r*1.1)+","+(y+r*.8)+"Z";
  if(k==="d")return"M"+x+","+(y+r*1.2)+"L"+(x+r*1.1)+","+(y-r*.8)+"L"+(x-r*1.1)+","+(y-r*.8)+"Z";
  if(k==="v")return"M"+x+","+(y-r*1.25)+"L"+(x+r*1.25)+","+y+"L"+x+","+(y+r*1.25)+"L"+(x-r*1.25)+","+y+"Z";
  if(k==="q")return"M"+(x-r*.9)+","+(y-r*.9)+"h"+(r*1.8)+"v"+(r*1.8)+"h"+(-r*1.8)+"Z";
  return"M"+(x-r)+","+y+"a"+r+","+r+" 0 1,0 "+(2*r)+",0a"+r+","+r+" 0 1,0 "+(-2*r)+",0Z";
}
var defs=document.createElementNS(NS,"defs");
defs.innerHTML='<filter id="mblur" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="24"/><feComponentTransfer><feFuncA type="linear" slope="2.4" intercept="-.2"/></feComponentTransfer></filter>';
var gI=document.createElementNS(NS,"g"),gE=document.createElementNS(NS,"g"),gN=document.createElementNS(NS,"g");
gI.setAttribute("filter","url(#mblur)");gI.setAttribute("opacity",".5");gI.setAttribute("pointer-events","none");
svg.appendChild(defs);svg.appendChild(gI);svg.appendChild(gE);svg.appendChild(gN);
EDG.forEach(function(e){
  var l=document.createElementNS(NS,"line");
  l.setAttribute("x1",POS[e.a][0]);l.setAttribute("y1",POS[e.a][1]);l.setAttribute("x2",POS[e.b][0]);l.setAttribute("y2",POS[e.b][1]);
  l.setAttribute("class","edge"+(e.dash?" dsh":""));gE.appendChild(l);e.el=l;
});
SYS.forEach(function(s){
  var g=document.createElementNS(NS,"g");
  g.setAttribute("class","nd");g.setAttribute("data-i",s.i);g.setAttribute("role","button");g.setAttribute("tabindex","-1");g.setAttribute("aria-label",s.n);
  var h=document.createElementNS(NS,"circle"),c=document.createElementNS(NS,"path"),t=document.createElementNS(NS,"text"),f=document.createElementNS(NS,"circle"),dt=document.createElementNS(NS,"circle");
  dt.setAttribute("class","dot");dt.setAttribute("cx",POS[s.i][0]);dt.setAttribute("cy",POS[s.i][1]);
  h.setAttribute("class","halo");c.setAttribute("class","c");
  h.setAttribute("cx",POS[s.i][0]);h.setAttribute("cy",POS[s.i][1]);
  f.setAttribute("class","inf");f.setAttribute("cx",POS[s.i][0]);f.setAttribute("cy",POS[s.i][1]);f.setAttribute("r",s.mj?105:88);gI.appendChild(f);s.f=f;
  t.setAttribute("x",POS[s.i][0]);t.setAttribute("class",s.mj?"mj":"mn");t.textContent=s.n;
  g.appendChild(h);g.appendChild(c);g.appendChild(dt);g.appendChild(t);gN.appendChild(g);
  s.g=g;s.h=h;s.c=c;s.t=t;s.dt=dt;
});

/* légende et dates clés */
var OK=["hum","xian","banu","tev","van","out","con","none"];
function icon(k){return '<svg viewBox="-8 -8 16 16" aria-hidden="true"><path d="'+shapeD(SH[k],0,0,5.5)+'" style="fill:var('+OW[k][1]+');stroke:rgba(255,255,255,.85);stroke-width:1.2"/></svg>'}
$("#mLegend").innerHTML='<h5>Légende</h5><p class="jp"><i></i>Point de saut</p><p class="jp"><i class="d"></i>Liaison déduite</p><div class="cols"><div><h5>Gouvernance</h5><ul>'+
  OK.map(function(k){return '<li>'+icon(k)+OW[k][0]+'</li>'}).join("")+'</ul></div></div><p class="jp" style="margin:.5rem 0 0"><span class="sw" style="--oc:var(--c-hum)"></span>Zone d’influence</p>';
/* époques affichées en bandeau (années de début tirées des périodes de la chronologie) */
var MERA=[[2100,"L’aube spatiale"],[2271,"L’expansion"],[2438,"Premiers contacts"],[2541,"Tevarin et Empire"],[2681,"L’ombre vanduul"],[2794,"Les temps modernes"],[2903,"Le présent"]];
function eraAt(y){var n=MERA[0][1];MERA.forEach(function(e){if(y>=e[0])n=e[1]});return n}
$("#mKeys").innerHTML=KEYS.map(function(k){return '<button type="button" class="chip" data-y="'+k[0]+'" aria-pressed="false" style="--tc:var(--amber)"><b>'+k[0]+'</b>'+k[1]+'</button>'}).join("");

/* état d’un système à une année */
function stateAt(s,y){var st=s.o[0];for(var i=0;i<s.o.length;i++){if(s.o[i][0]<=y)st=s.o[i]}return st}

function render(){
  yEl.textContent=year;range.value=year;
  var known=0;
  SYS.forEach(function(s){
    var on=s.d<=year;if(on)known++;
    s.g.classList.toggle("on",on);
    s.g.setAttribute("tabindex",on?"0":"-1");
    s.g.classList.toggle("fresh",on&&s.d>0&&!s.nd&&year-s.d<12);
    s.g.classList.toggle("sel",s.i===sel);
    s.g.classList.toggle("dim",!!facF&&stateAt(s,year)[1]!==facF);
    var ok=stateAt(s,year)[1],v="var("+OW[ok][1]+")";
    s.g.style.setProperty("--oc",v);
    s.f.style.setProperty("--oc",v);
    s.f.classList.toggle("on",on&&!!INF[ok]);
    if(s.k!==SH[ok]){s.k=SH[ok];drawShape(s)}
    s.c.classList.toggle("ring",ok==="con");
  });
  EDG.forEach(function(e){
    var on=year>=e.y&&(!e.u||year<e.u);
    e.el.classList.toggle("on",on);
    e.el.classList.toggle("hl",on&&(e.a===sel||e.b===sel));
  });
  syncHash();
  $("#mEra").textContent=eraAt(year);$("#mBig").textContent=year;renderLog();
  cEl.textContent=known+" système"+(known>1?"s":"")+" connu"+(known>1?"s":"")+" sur "+SYS.length;
  $("#mKeys").querySelectorAll(".chip").forEach(function(c){c.setAttribute("aria-pressed",String(+c.dataset.y===year))});
  renderDetail();renderFeed();
}

function renderDetail(){
  var s=BY[sel];
  if(!s){detail.innerHTML='<p class="hint">Cliquez sur un système pour voir ses planètes et ses lieux à la date choisie.</p>';return}
  var h='<div class="dh"><h3>'+s.n+'</h3><button type="button" class="x" data-clr="1">Fermer</button></div>';
  h+='<p class="meta">'+(s.nd?"Date de découverte non précisée":s.d?("Découvert en "+s.d+(s.by?" · "+s.by:"")):s.by)+'</p>';
  if(year<s.d){detail.innerHTML=h+'<p class="hint">Ce système n’est pas encore connu en '+year+'. Avancez jusqu’en '+s.d+'.</p>';return}
  var st=stateAt(s,year);
  h+='<span class="own" style="--oc:var('+OW[st[1]][1]+')"><i></i>'+OW[st[1]][0]+'</span><p class="note2">'+st[2]+'</p>';
  var now=[],later=[];
  s.p.forEach(function(p){
    var ev=p[1];
    if(ev[0][0]>year){later.push([p[0],ev[0][0]]);return}
    var cur=ev[0];for(var k=0;k<ev.length;k++){if(ev[k][0]<=year)cur=ev[k]}
    now.push([p[0],cur[0],cur[1]]);
  });
  if(now.length)h+='<h4>Planètes et lieux</h4><ul class="pl">'+now.map(function(x){return '<li><b>'+x[0]+'</b><em>'+x[1]+'</em><p>'+x[2]+'</p></li>'}).join("")+'</ul>';
  if(later.length)h+='<h4>À venir</h4><ul class="pl">'+later.map(function(x){return '<li class="later"><b>'+x[0]+'</b><em>'+x[1]+'</em></li>'}).join("")+'</ul>';
  var nb=[];
  EDG.forEach(function(e){
    if(!(year>=e.y&&(!e.u||year<e.u)))return;
    var o=e.a===sel?e.b:(e.b===sel?e.a:null);
    if(o&&BY[o].d<=year)nb.push(o);
  });
  if(nb.length)h+='<h4>Points de saut</h4><div class="lk">'+nb.map(function(o){return '<button type="button" data-s="'+o+'">'+BY[o].n+'</button>'}).join("")+'</div>';
  if(document.querySelector('.ev[data-y^="'+year+'"]'))h+='<button type="button" class="btn lk-t" data-ty="'+year+'">Voir la chronologie de '+year+'</button>';
  detail.innerHTML=h;
}

function renderLog(){
  var past=CH.filter(function(c){return c.y<=year}).slice(-5);
  $("#mLog").innerHTML=past.map(function(c,i){return '<li style="opacity:'+(.35+.65*(i+1)/past.length).toFixed(2)+'"><b>'+c.y+'</b>'+c.t+'</li>'}).join("");
}
function drawShape(s){var r=s.r||6;s.c.setAttribute("d",shapeD(s.k||"o",POS[s.i][0],POS[s.i][1],r))}

function renderFeed(){
  var past=[],next=[];
  for(var i=0;i<CH.length;i++){var c=CH[i];if(c.y<=year)past.push(c);else if(next.length<3)next.push(c)}
  past=past.slice(-8).reverse();
  function li(c,cl){return '<li class="'+cl+'"><span class="fy">'+c.y+'</span><button type="button" data-y="'+c.y+'" data-s="'+c.s+'">'+c.t+'</button></li>'}
  feed.innerHTML=past.map(function(c){return li(c,"")}).join("")+(next.length?'<li class="sep">Prochains changements</li>'+next.map(function(c){return li(c,"next")}).join(""):"");
}

/* temps */
function setYear(y){year=Math.max(MIN,Math.min(MAX,y));render()}
function stop(){playing=false;$("#mPlayIcon").setAttribute("d","M4 2l10 6-10 6z");$("#mPlay").setAttribute("aria-label","Lecture")}
var last=0,acc=0;
function tick(t){
  if(!playing)return;
  acc+=(t-last)/1000*spd;last=t;
  if(acc>=1){var n=Math.floor(acc);acc-=n;year=Math.min(MAX,year+n);render();if(year>=MAX){stop();return}}
  requestAnimationFrame(tick);
}
function play(){
  if(year>=MAX)year=MIN;
  playing=true;last=performance.now();acc=0;
  $("#mPlayIcon").setAttribute("d","M3 2h4v12H3zM9 2h4v12H9z");$("#mPlay").setAttribute("aria-label","Pause");
  render();requestAnimationFrame(tick);
}
$("#mPlay").addEventListener("click",function(){playing?stop():play()});
$("#mPrev").addEventListener("click",function(){stop();var p=MIN;for(var i=0;i<CY.length;i++){if(CY[i]<year)p=CY[i]}setYear(p)});
$("#mNext").addEventListener("click",function(){stop();var n=MAX;for(var i=CY.length-1;i>=0;i--){if(CY[i]>year)n=CY[i]}setYear(n)});
range.addEventListener("input",function(){stop();setYear(+range.value)});
document.querySelector(".spd").addEventListener("click",function(ev){
  var b=ev.target.closest("button");if(!b)return;spd=+b.dataset.spd;
  this.querySelectorAll("button").forEach(function(x){x.setAttribute("aria-pressed",String(x===b))});
});
$("#mKeys").addEventListener("click",function(ev){var b=ev.target.closest("button");if(b){stop();setYear(+b.dataset.y)}});

/* sélection */
function pick(id,y){
  stop();sel=id;
  if(typeof y==="number")year=Math.max(MIN,Math.min(MAX,y));
  render();centerOn(id);
}
feed.addEventListener("click",function(ev){var b=ev.target.closest("button");if(b)pick(b.dataset.s,+b.dataset.y)});
detail.addEventListener("click",function(ev){
  var b=ev.target.closest("button");if(!b)return;
  if(b.dataset.clr){sel=null;render()}else if(b.dataset.s){sel=b.dataset.s;render();centerOn(sel)}else if(b.dataset.ty)toTimeline(+b.dataset.ty)
});

/* vue : zoom et déplacement */
var vb={x:0,y:0,w:MW,h:MH},justDragged=false,drag=null,raf=0;
function ratio(){var r=svg.getBoundingClientRect();return r.height?r.width/r.height:1.4}
function pads(){var cs=getComputedStyle(box),g=function(n){return parseFloat(cs.getPropertyValue(n))||0};return{l:g("--vpl"),r:g("--vpr"),t:g("--vpt"),b:g("--vpb")}}
function fit(){
  var r=svg.getBoundingClientRect();if(!r.width||!r.height)return;
  var p=pads(),aw=Math.max(240,r.width-p.l-p.r),ah=Math.max(240,r.height-p.t-p.b);
  var k=Math.min(aw/(MW*1.06),ah/(MH*1.06)),w=r.width/k,h=r.height/k;
  vb={x:MW/2-(p.l+aw/2)/k,y:MH/2-(p.t+ah/2)/k,w:w,h:h};setVB();
}
function setVB(){svg.setAttribute("viewBox",vb.x.toFixed(1)+" "+vb.y.toFixed(1)+" "+vb.w.toFixed(1)+" "+vb.h.toFixed(1));if(!raf)raf=requestAnimationFrame(applyScale)}
function applyScale(){
  raf=0;
  var r=svg.getBoundingClientRect();if(!r.width)return;
  var sc=r.width/vb.w,rs=Math.max(4.5,Math.min(10,3.5+sc*5)),fs=Math.max(10,Math.min(14,9+sc*6));
  svg.style.setProperty("--fs",(fs/sc).toFixed(2)+"px");
  svg.classList.toggle("all",sc>=.5);
  SYS.forEach(function(s){
    var rr=(s.mj?rs*1.3:rs)/sc;
    s.r=+rr.toFixed(2);drawShape(s);s.h.setAttribute("r",s.r);s.dt.setAttribute("r",(rr*.34).toFixed(2));
    s.t.setAttribute("y",(POS[s.i][1]+rr+fs/sc*.95).toFixed(2));
  });
}
function zoomAt(f,mx,my){
  var nw=Math.max(MW/9,Math.min(MW*3,vb.w*f));f=nw/vb.w;
  var px=vb.x+mx*vb.w,py=vb.y+my*vb.h;
  vb.w=nw;vb.h*=f;vb.x=px-mx*vb.w;vb.y=py-my*vb.h;setVB();
}
function centerOn(id){
  if(!POS[id]||!box.offsetParent)return;
  var r=svg.getBoundingClientRect(),p=pads(),fx=(p.l+Math.max(240,r.width-p.l-p.r)/2)/r.width,fy=(p.t+Math.max(240,r.height-p.t-p.b)/2)/r.height;
  vb.x=POS[id][0]-fx*vb.w;vb.y=POS[id][1]-fy*vb.h;setVB();
}
svg.addEventListener("wheel",function(e){
  e.preventDefault();
  var r=svg.getBoundingClientRect();
  zoomAt(Math.exp(e.deltaY*.0012),(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);
},{passive:false});
svg.addEventListener("pointerdown",function(e){drag={x:e.clientX,y:e.clientY,vx:vb.x,vy:vb.y,moved:false}});
window.addEventListener("pointermove",function(e){
  if(!drag)return;
  var dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<5)return;
  drag.moved=true;box.classList.add("drag");
  var r=svg.getBoundingClientRect();
  vb.x=drag.vx-dx*vb.w/r.width;vb.y=drag.vy-dy*vb.h/r.height;setVB();
});
window.addEventListener("pointerup",function(){
  if(drag&&drag.moved){justDragged=true;setTimeout(function(){justDragged=false},0)}
  drag=null;box.classList.remove("drag");
});
svg.addEventListener("click",function(e){
  if(justDragged)return;
  var n=e.target.closest(".nd");
  sel=n?n.getAttribute("data-i"):null;render();
});
svg.addEventListener("keydown",function(e){
  if(e.key!=="Enter"&&e.key!==" ")return;
  var n=e.target.closest&&e.target.closest(".nd");if(!n)return;
  e.preventDefault();sel=n.getAttribute("data-i");render();
});
$("#zIn").addEventListener("click",function(){zoomAt(.7,.5,.5)});
$("#zOut").addEventListener("click",function(){zoomAt(1/.7,.5,.5)});
$("#zFit").addEventListener("click",fit);
addEventListener("resize",function(){if(box.offsetParent){var ar=ratio();vb.h=vb.w/ar;setVB()}});

/* lien partageable : #carte/année/système, mis à jour en différé */
var hashTimer=0;
function syncHash(){
  if(!box.offsetParent)return;
  clearTimeout(hashTimer);
  hashTimer=setTimeout(function(){try{history.replaceState(null,"","#carte/"+year+(sel?"/"+sel:""))}catch(e){}},250);
}
function readHash(h){
  var a=h.split("/");
  if(a[0]!=="#carte")return;
  var y=parseInt(a[1],10);
  if(y>=MIN&&y<=MAX)year=y;
  if(a[2]&&BY[a[2]])sel=a[2];
}
function say(msg){var el=$("#mLink");var old=el.textContent;el.textContent=msg;setTimeout(function(){el.textContent=old},1800)}
$("#mLink").addEventListener("click",function(){
  var url=location.href.split("#")[0]+"#carte/"+year+(sel?"/"+sel:"");
  function fallback(){var t=document.createElement("textarea");t.value=url;t.setAttribute("readonly","");t.style.position="fixed";t.style.opacity="0";document.body.appendChild(t);t.select();var ok=false;try{ok=document.execCommand("copy")}catch(e){}t.remove();say(ok?"Lien copié":"Copie impossible")}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(function(){say("Lien copié")},fallback);else fallback();
});

/* recherche d’un système */
function norm(t){return t.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[’']/g,"").toLowerCase().trim()}
$("#mSys").innerHTML=SYS.slice().sort(function(a,b){return a.n.localeCompare(b.n,"fr")}).map(function(s){return '<option value="'+s.n+'"></option>'}).join("");
function findSys(q){
  q=norm(q);if(!q)return null;
  var hit=null;
  SYS.forEach(function(s){var n=norm(s.n);if(n===q)hit=s;else if(!hit&&n.indexOf(q)===0)hit=s});
  return hit;
}
function goFind(){
  var s=findSys($("#mFind").value);if(!s)return;
  pick(s.i,year<s.d?s.d:year);
}
$("#mFind").addEventListener("change",goFind);
$("#mFind").addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();goFind()}});

/* filtre par camp */
var FACS=[["","Tous"],["hum","Humanité"],["xian","Xi’an"],["banu","Banu"],["tev","Tevarin"],["van","Vanduul"]];
$("#mFac").innerHTML=FACS.map(function(f){return '<button type="button" class="chip" data-f="'+f[0]+'" aria-pressed="'+(f[0]===""?"true":"false")+'" style="--tc:'+(f[0]?"var("+OW[f[0]][1]+")":"var(--ink-2)")+'"><i></i>'+f[1]+'</button>'}).join("");
$("#mFac").addEventListener("click",function(e){
  var b=e.target.closest("button");if(!b)return;
  facF=b.dataset.f;
  this.querySelectorAll("button").forEach(function(x){x.setAttribute("aria-pressed",String(x===b))});
  render();
});

/* flèches gauche et droite : changement précédent ou suivant */
document.addEventListener("keydown",function(e){
  if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
  if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight")return;
  if($("#v-map").hidden)return;
  var t=e.target;if(t&&t!==document.body&&t.closest&&t.closest("input,textarea,select,button,a,.nd"))return;
  e.preventDefault();$(e.key==="ArrowLeft"?"#mPrev":"#mNext").click();
});

/* infobulle au survol */
var tip=$("#mTip");
function hideTip(){tip.hidden=true}
svg.addEventListener("pointermove",function(e){
  if(drag&&drag.moved||e.pointerType==="touch"){hideTip();return}
  var n=e.target.closest&&e.target.closest(".nd");
  if(!n||n.classList.contains("dim")){hideTip();return}
  var s=BY[n.getAttribute("data-i")],st=stateAt(s,year),r=box.getBoundingClientRect();
  tip.innerHTML='<b>'+s.n+'</b><span>'+OW[st[1]][0]+(s.d&&!s.nd?' · découvert en '+s.d:'')+'</span>';
  tip.hidden=false;
  tip.style.left=Math.max(60,Math.min(r.width-60,e.clientX-r.left))+"px";
  tip.style.top=(e.clientY-r.top)+"px";
});
svg.addEventListener("pointerleave",hideTip);

/* effets visuels : zones d’influence floutées, désactivables sur un appareil lent */
var fxOn=!matchMedia("(prefers-reduced-motion: reduce)").matches;
try{var sv=localStorage.getItem("orbital-fx");if(sv==="0")fxOn=false;else if(sv==="1")fxOn=true}catch(e){}
function applyFx(){
  gI.setAttribute("filter",fxOn?"url(#mblur)":"none");
  gI.setAttribute("opacity",fxOn?".5":".16");
  box.classList.toggle("lite",!fxOn);
  $("#zFx").setAttribute("aria-pressed",String(fxOn));
}
$("#zFx").addEventListener("click",function(){fxOn=!fxOn;try{localStorage.setItem("orbital-fx",fxOn?"1":"0")}catch(e){}applyFx()});
applyFx();

/* onglets */
var tabs=[].slice.call(document.querySelectorAll(".tab[data-v]"));
var VIEWS={home:"#home",log:"#carnet",time:"#chronologie",map:"#carte",cl:"#commlinks",ver:"#versions"};
var SUBS={home:"Une carte qui change avec le temps, la chronologie de l’univers et votre carnet de bord.",
  log:"Journal personnel · aUEC · heures de vol",
  time:"",
  map:"Remontez les années et suivez les systèmes, leurs camps et leurs événements.",
  cl:"Les communications officielles de Roberts Space Industries.",
  ver:"Chaque modification de l’application, avec son numéro de version."};
/* menu Lore : Chronologie, Star Viewer et Comm-Links */
function setLore(open){
  var b=$("#loreBtn"),m=$("#loreMenu");
  b.setAttribute("aria-expanded",String(open));m.hidden=!open;
}
$("#loreBtn").addEventListener("click",function(){setLore(this.getAttribute("aria-expanded")!=="true")});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&$("#loreBtn").getAttribute("aria-expanded")==="true"){setLore(false);$("#loreBtn").focus()}});
document.addEventListener("click",function(e){
  if(!matchMedia("(max-width:860px)").matches)return;
  if(!e.target.closest(".lore"))setLore(false);
});
function show(v){
  if(!VIEWS[v])v="home";
  var map=v==="map";
  ["home","log","time","map","cl","ver"].forEach(function(k){document.getElementById("v-"+k).hidden=k!==v});
  $("#bar").setAttribute("data-view",v);
  tabs.forEach(function(t){
    var on=t.dataset.v===v;
    if(on)t.setAttribute("aria-current","page");else t.removeAttribute("aria-current");
    if(on){$("#topTitle").textContent=t.querySelector("span").textContent;$("#topIc").innerHTML=t.querySelector("svg").outerHTML;$("#topSub").textContent=SUBS[v]||""}
  });
  var lore=v==="time"||v==="map"||v==="cl";
  $("#loreBtn").classList.toggle("on",lore);
  setLore(lore&&!matchMedia("(max-width:860px)").matches);
  if(!map)stop();
  try{history.replaceState(null,"",map?"#carte/"+year+(sel?"/"+sel:""):VIEWS[v])}catch(e){}
  window.scrollTo(0,0);
  if(v==="time")window.dispatchEvent(new Event("scroll"));
  if(v==="cl"&&window.__orbCL)window.__orbCL();
  if(map){fit();render()}
}
tabs.forEach(function(t){t.addEventListener("click",function(){show(t.dataset.v)})});
document.addEventListener("click",function(e){var g=e.target.closest("[data-go]");if(g)show(g.dataset.go)});
render();
/* liens entre l’accueil, la chronologie et la carte */
function toMap(id,y){
  if(typeof y==="number")year=Math.max(MIN,Math.min(MAX,y));
  if(id&&BY[id])sel=id;
  show("map");if(sel)centerOn(sel);
}
function toTimeline(y){
  if(window.__orbSort)window.__orbSort("era");
  show("time");
  var el=document.querySelector('.ev[data-y^="'+y+'"]:not([hidden])');
  if(!el)return;
  el.scrollIntoView({block:"center"});
  el.classList.remove("flash");void el.offsetWidth;el.classList.add("flash");
}
function esc(t){return t.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
var NAMERX=SYS.map(function(s){return{s:s,rx:new RegExp("(^|[^A-Za-zÀ-ÿ’'])"+esc(s.n)+"(?![A-Za-zÀ-ÿ])")}});
function sysIn(text){
  var best=null,at=1e9;
  NAMERX.forEach(function(n){var m=n.rx.exec(text);if(m&&m.index<at){at=m.index;best=n.s}});
  return best;
}
function decorateEvents(root){
  [].forEach.call((root||document.getElementById("v-time")).querySelectorAll(".ev:not([data-m])"),function(ev){
    ev.dataset.m="1";
    var m=/^(\d{4})(?!\d)/.exec(ev.dataset.y.replace(/[\s\u00a0\u202f]/g,""));
    if(!m)return;
    var y=+m[1];if(y<MIN||y>MAX)return;
    var t=ev.querySelector("h3").textContent,d=ev.querySelector(".ev-desc").textContent;
    var s=sysIn(t)||sysIn(d);
    var b=document.createElement("button");b.type="button";b.className="ev-map";b.dataset.y=y;
    if(s){b.dataset.s=s.i;b.textContent="Voir "+s.n+" sur la carte"}else b.textContent="Voir la carte en "+y;
    ev.querySelector(".ev-foot").appendChild(b);
  });
}
window.__orbDecorate=decorateEvents;
decorateEvents(document);
document.addEventListener("click",function(e){
  var b=e.target.closest(".ev-map");if(b)toMap(b.dataset.s,+b.dataset.y);
});
(function(){
  var o=window.__orb||{},ns=SYS.length;
  function put(id,t){var e=$(id);if(e)e.textContent=t}
  put("#hsSys",ns);put("#hsYear",MAX);put("#hmYear",MAX);put("#tbYear",MAX);put("#hmSysN",ns+" système"+(ns>1?"s":""));
  if(o.eras)put("#hsEras",o.eras);
  if(o.events){put("#hmEvN",o.events+" événement"+(o.events>1?"s":""));put("#hsEv",o.events)}
  var last=null;CH.forEach(function(c){if(c.y<=MAX)last=c});
  var n=$("#hmNews");if(!last||!n)return;
  n.innerHTML='<span class="fl">À la une de la carte · '+last.y+'</span><button type="button">'+last.t+'</button>';
  n.hidden=false;
  n.querySelector("button").addEventListener("click",function(){toMap(last.s,last.y)});
})();
var HASH=location.hash,R={"#carte":"map","#carnet":"log","#chronologie":"time","#versions":"ver","#commlinks":"cl"};readHash(HASH);show(R[HASH.split("/")[0]]||"home");
/* un lien collé dans l’onglet déjà ouvert : on le suit sans recharger la page */
addEventListener("hashchange",function(){
  var k=R[location.hash.split("/")[0]];
  if(!k)return;
  readHash(location.hash);show(k);if(k==="map"&&sel)centerOn(sel);
});
})();
