(function(){
"use strict";
var $=OrbUtil.$;

/* index */
var BY={};SYS.forEach(function(s){BY[s.i]=s});
var EDG=EL.map(function(p){
  var a=BY[p[0]],b=BY[p[1]],sp=SP[p[0]+"-"+p[1]]||{};
  return{a:p[0],b:p[1],y:sp.y||Math.max(a.d,b.d),u:sp.u||0,dash:sp.dash||0};
});
/* systèmes sans aucune liaison dans EL (A25) : fiche avec une mention */
var LINKED={};EDG.forEach(function(e){LINKED[e.a]=1;LINKED[e.b]=1});
var CH=[];
SYS.forEach(function(s){
  if(s.d>0&&!s.nd)CH.push({y:s.d,t:"Découverte du système "+s.n,s:s.i});
  s.o.forEach(function(o){if(o[0]>s.d)CH.push({y:o[0],t:s.n+" : "+o[2],s:s.i})});
  s.p.forEach(function(p){p[1].forEach(function(e){if(e[0]>s.d)CH.push({y:e[0],t:p[0]+" ("+s.n+") : "+e[1],s:s.i})})});
});
CH.sort(function(a,b){return a.y-b.y});
var CY=[];CH.forEach(function(c){if(c.y>=MIN&&c.y<=MAX&&CY.indexOf(c.y)<0)CY.push(c.y)});

var year=MAX,sel="stanton",playing=false,spd=30,facF="",tabId=null,lastPT="mouse";
var svg=$("#mapsvg"),box=$("#mapbox"),detail=$("#mDetail"),feed=$("#mFeed");
var yEl=$("#mYear"),range=$("#mRange"),cEl=$("#mCount");

/* construction du SVG */
var SH={hum:"o",xian:"u",banu:"d",tev:"q",van:"v",out:"h",con:"o",none:"o"},INF={hum:1,xian:1,banu:1,tev:1,van:1};
function shapeD(k,x,y,r){
  if(k==="u")return"M"+x+","+(y-r*1.2)+"L"+(x+r*1.1)+","+(y+r*.8)+"L"+(x-r*1.1)+","+(y+r*.8)+"Z";
  if(k==="d")return"M"+x+","+(y+r*1.2)+"L"+(x+r*1.1)+","+(y-r*.8)+"L"+(x-r*1.1)+","+(y-r*.8)+"Z";
  if(k==="v")return"M"+x+","+(y-r*1.25)+"L"+(x+r*1.25)+","+y+"L"+x+","+(y+r*1.25)+"L"+(x-r*1.25)+","+y+"Z";
  if(k==="q")return"M"+(x-r*.9)+","+(y-r*.9)+"h"+(r*1.8)+"v"+(r*1.8)+"h"+(-r*1.8)+"Z";
  if(k==="h"){var a=r*1.15,b=a*.866,p=function(i,j){return(x+i)+","+(y+j)};return"M"+p(a,0)+"L"+p(a/2,b)+"L"+p(-a/2,b)+"L"+p(-a,0)+"L"+p(-a/2,-b)+"L"+p(a/2,-b)+"Z"}
  return"M"+(x-r)+","+y+"a"+r+","+r+" 0 1,0 "+(2*r)+",0a"+r+","+r+" 0 1,0 "+(-2*r)+",0Z";
}
var defs=document.createElementNS(NS,"defs");
defs.innerHTML='<filter id="mblur" x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="24"/><feComponentTransfer><feFuncA type="linear" slope="2.4" intercept="-.2"/></feComponentTransfer></filter>';
var gI=document.createElementNS(NS,"g"),gE=document.createElementNS(NS,"g"),gN=document.createElementNS(NS,"g");
gI.setAttribute("class","infg");gI.setAttribute("filter","url(#mblur)");gI.setAttribute("opacity",".5");gI.setAttribute("pointer-events","none");
svg.appendChild(defs);svg.appendChild(gI);svg.appendChild(gE);svg.appendChild(gN);
svg.setAttribute("role","group");svg.setAttribute("aria-describedby","mapKeys");
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

/* itinéraire (public/route.js) : calcul, section du panneau Filtres, tracé entre les liaisons et les systèmes */
var RT=OrbRoute.init({
  SYS:SYS,BY:BY,EDG:EDG,POS:POS,NS:NS,SP:SP,LINKED:LINKED,MIN:MIN,MAX:MAX,nodes:gN,root:$("#vwRail"),
  norm:function(t){return norm(t)},
  getYear:function(){return year},
  getScale:function(){var r=svg.getBoundingClientRect();return r.width&&vb.w?r.width/vb.w:0},
  isPlaying:function(){return playing},isMobile:function(){return isMobile()},
  setYear:function(y){stop();setYear(y)},
  render:function(){render()},
  refresh:function(){syncHash();queueLabels()},
  openRail:function(){setPanel("rail")},
  goStep:function(id){
    stop();sel=id;tabId=id;
    if(isMobile())setPanel(null);
    else if(matchMedia("(max-width:1099px)").matches)box.scrollIntoView({block:"nearest"});
    render();centerOn(id);
    if(isMobile())focusStop();
  }
});

/* légende et dates clés */
var OK=["hum","xian","banu","tev","van","out","con","none"];
function icon(k){return '<svg viewBox="-8 -8 16 16" aria-hidden="true"><path class="ic'+(k==="con"?' ring':'')+'" style="--oc:var('+OW[k][1]+')" d="'+shapeD(SH[k],0,0,5.5)+'"/><circle class="icd" style="--oc:var('+OW[k][1]+')" r="1.7"/></svg>'}
$("#mLegend").innerHTML='<h3>Légende</h3><p class="jp"><i></i>Point de saut</p><p class="jp"><i class="d"></i>Liaison déduite</p><p class="jp"><i class="rtl"></i>Itinéraire</p><div class="cols"><div><h4>Gouvernance</h4><ul>'+
  OK.map(function(k){return '<li>'+icon(k)+OW[k][0]+'</li>'}).join("")+'</ul></div></div><p class="jp" style="margin:.5rem 0 0"><span class="sw" style="--oc:var(--c-hum)"></span>Zone d’influence</p>';
/* époques affichées en bandeau (années de début tirées des périodes de la chronologie) */
var MERA=[[2100,"L’aube spatiale"],[2271,"L’expansion"],[2438,"Premiers contacts"],[2541,"Tevarin et Empire"],[2681,"L’ombre vanduul"],[2794,"Les temps modernes"],[2903,"Le présent"]];
function eraAt(y){var n=MERA[0][1];MERA.forEach(function(e){if(y>=e[0])n=e[1]});return n}
$("#mKeys").innerHTML=KEYS.map(function(k){return '<button type="button" class="chip" data-y="'+k[0]+'" aria-pressed="false" style="--tc:var(--amber)"><b>'+k[0]+'</b>'+k[1]+'</button>'}).join("");

/* état d’un système à une année */
function stateAt(s,y){var st=s.o[0];for(var i=0;i<s.o.length;i++){if(s.o[i][0]<=y)st=s.o[i]}return st}

function render(){
  yEl.textContent=year;range.value=year;range.setAttribute("aria-valuetext","Année "+year);
  var known=0;
  SYS.forEach(function(s){
    var on=s.d<=year;if(on)known++;
    s.g.classList.toggle("on",on);
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
  syncStop();syncHash();
  $("#mEra").textContent=eraAt(year);$("#mBig").textContent=year;renderLog();
  cEl.textContent=known+" système"+(known>1?"s":"")+" connu"+(known>1?"s":"")+" sur "+SYS.length;
  $("#mKeys").querySelectorAll(".chip").forEach(function(c){c.setAttribute("aria-pressed",String(+c.dataset.y===year))});
  renderDetail();renderFeed();
  $("#vwSideN").textContent=sel&&BY[sel]?" · "+BY[sel].n:"";
  RT.update();queueLabels();announce();
}
/* clavier : un seul arrêt de Tab sur la carte (tabindex itinérant), porté par le système sélectionné ou, à défaut, par le plus important */
function syncStop(){
  var ok=function(id){return id&&BY[id]&&BY[id].d<=year&&!BY[id].g.classList.contains("dim")};
  var id=ok(sel)?sel:(ok(tabId)?tabId:null);
  if(!id){for(var i=0;i<BYPRIO.length;i++){if(ok(BYPRIO[i].i)){id=BYPRIO[i].i;break}}}
  tabId=id;
  SYS.forEach(function(s){
    var on=s.i===id;s.g.setAttribute("tabindex",on?"0":"-1");
    if(on)s.g.setAttribute("aria-describedby","mapKeys");else s.g.removeAttribute("aria-describedby");
  });
}
function focusStop(){var s=tabId&&BY[tabId];if(s)s.g.focus({preventScroll:true})}
/* annonce pour lecteur d’écran : système sélectionné et année (différée, jamais pendant la lecture automatique) */
var annT=0,annLast="";
function announce(){
  clearTimeout(annT);
  if(playing||$("#v-map").hidden)return;
  annT=setTimeout(function(){
    var m=(sel&&BY[sel]?BY[sel].n+" sélectionné, année ":"Année ")+year;
    if(m===annLast)return;annLast=m;$("#mAnnounce").textContent=m;
  },350);
}

function renderDetail(){
  var s=BY[sel];
  if(!s){detail.innerHTML='<p class="hint">Cliquez sur un système pour voir ses planètes et ses lieux à la date choisie.</p>';return}
  var h='<div class="dh"><h3>'+s.n+'</h3><button type="button" class="x" data-clr="1">Fermer</button></div>';
  h+='<p class="meta">'+(s.nd?"Date de découverte non précisée":s.d?("Découvert en "+s.d+(s.by?" · "+s.by:"")):s.by)+'</p>';
  if(year<s.d){detail.innerHTML=h+'<p class="hint">Ce système n’est pas encore connu en '+year+'. Avancez jusqu’en '+s.d+'.</p>';return}
  var st=stateAt(s,year);
  h+='<span class="own" style="--oc:var('+OW[st[1]][1]+')"><i></i>'+OW[st[1]][0]+'</span><p class="note2">'+st[2]+'</p>';
  h+='<div class="rt-act" role="group" aria-label="Itinéraire"><button type="button" class="btn" data-rt="de">Itinéraire depuis ici</button><button type="button" class="btn" data-rt="vers">Itinéraire jusqu’ici</button></div>';
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
  if(!LINKED[s.i])h+='<p class="hint" style="margin:.8rem 0 0;font-size:.8rem">Aucun point de saut publié pour ce système.</p>';
  if(document.querySelector('.ev[data-y^="'+year+'"]'))h+='<button type="button" class="btn lk-t" data-ty="'+year+'">Voir la chronologie de '+year+'</button>';
  detail.innerHTML=h;
}

function renderLog(){
  var past=CH.filter(function(c){return c.y<=year}).slice(-5);
  $("#mLog").innerHTML=past.map(function(c,i){return '<li style="opacity:'+(.35+.65*(i+1)/past.length).toFixed(2)+'"><b>'+c.y+'</b>'+c.t+'</li>'}).join("");
}
function drawShape(s){var r=s.r||6;s.c.setAttribute("d",shapeD(s.k||"o",POS[s.i][0],POS[s.i][1],r))}

/* le fil suit le système sélectionné (sinon : tous les systèmes) : sans cela les mêmes changements s'affichaient sous chaque fiche */
function renderFeed(){
  var past=[],next=[],src=sel?CH.filter(function(c){return c.s===sel}):CH;
  $("#mFeedH").textContent=sel&&BY[sel]?"Changements · "+BY[sel].n:"Derniers changements";
  for(var i=0;i<src.length;i++){var c=src[i];if(c.y<=year)past.push(c);else if(next.length<3)next.push(c)}
  past=past.slice(-8).reverse();
  function li(c,cl){return '<li class="'+cl+'"><span class="fy">'+c.y+'</span><button type="button" data-y="'+c.y+'" data-s="'+c.s+'">'+c.t+'</button></li>'}
  feed.innerHTML=(past.length||next.length||!sel?"":'<li class="sep">Aucun changement connu pour ce système.</li>')+past.map(function(c){return li(c,"")}).join("")+(next.length?'<li class="sep">Prochains changements</li>'+next.map(function(c){return li(c,"next")}).join(""):"");
}

/* temps */
function setYear(y){year=Math.max(MIN,Math.min(MAX,y));render()}
function stop(){var was=playing;playing=false;if(was)RT.afterStop();$("#mPlayIcon").setAttribute("d","M4 2l10 6-10 6z");$("#mPlay").setAttribute("aria-label","Lecture")}
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
  if(b.dataset.clr){sel=null;setPanel(null);render();focusStop()}else if(b.dataset.s){sel=b.dataset.s;render();centerOn(sel)}else if(b.dataset.ty)toTimeline(+b.dataset.ty);else if(b.dataset.rt)RT.fromFiche(b.dataset.rt,sel)
});

/* vue : zoom et déplacement */
var vb={x:0,y:0,w:MW,h:MH},justDragged=false,drag=null,raf=0;
function ratio(){var r=svg.getBoundingClientRect();return r.height?r.width/r.height:1.4}
function pads(){var cs=getComputedStyle(box),g=function(n){return parseFloat(cs.getPropertyValue(n))||0};return{l:g("--vpl"),r:g("--vpr"),t:g("--vpt"),b:g("--vpb")}}
var BB=(function(){var a=1e9,b=-1e9,c=1e9,d=-1e9;SYS.forEach(function(s){var p=POS[s.i];a=Math.min(a,p[0]);b=Math.max(b,p[0]);c=Math.min(c,p[1]);d=Math.max(d,p[1])});return{x:a,y:c,w:b-a,h:d-c}})();
function isMobile(){return matchMedia("(max-width:700px)").matches}
/* vue d’ensemble : cadre les systèmes (pas le fond de la carte) ; dans un conteneur en portrait (téléphone) on zoome pour que les systèmes occupent au moins ~64 % de la hauteur, les bords restent accessibles en glissant */
var fitW=0;
function fit(full){
  var r=svg.getBoundingClientRect();if(!r.width||!r.height)return;
  var p=pads(),aw=Math.max(200,r.width-p.l-p.r),ah=Math.max(200,r.height-p.t-p.b);
  var kw=aw/(BB.w*1.06),kh=ah/(BB.h*1.06),kc=!full&&r.width<r.height*.9?.64*r.height/(BB.h*1.03):0;
  var k=Math.min(kh,Math.max(kw,kc)),w=r.width/k,h=r.height/k;fitW=kc>kw&&kc<kh?w:0;
  vb={x:BB.x+BB.w/2-(p.l+aw/2)/k,y:BB.y+BB.h/2-(p.t+ah/2)/k,w:w,h:h};setVB();
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
  });
  RT.rescale(sc);labels();
}
/* étiquettes : on place les noms par ordre de priorité (sélection, survol, grands systèmes, nombre de liaisons). Chaque nom essaie dessous, dessus, à droite, à gauche ; il est masqué s’il recouvrirait un autre nom, le symbole d’un autre système ou une commande (zoom, panneaux). La sélection et le survol gardent toujours le leur (au meilleur emplacement). */
var DEG={};EDG.forEach(function(e){DEG[e.a]=(DEG[e.a]||0)+1;DEG[e.b]=(DEG[e.b]||0)+1});
var BYPRIO=SYS.slice().sort(function(a,b){return (b.mj?100:0)+(DEG[b.i]||0)-(a.mj?100:0)-(DEG[a.i]||0)});
var hov=null,lblRaf=0;
function ovl(a,b){var w=Math.min(a[2],b[2])-Math.max(a[0],b[0]),h=Math.min(a[3],b[3])-Math.max(a[1],b[1]);return w>1&&h>1?w*h:0}
function obstacles(r){
  var o=[];
  [".zoom",".vw-tabs",".vw-console",".vw-rail",".vw-side",".vw-hint"].forEach(function(q){
    var el=$(q);if(!el||!el.offsetParent||getComputedStyle(el).position!=="absolute")return;
    var b=el.getBoundingClientRect();if(b.width<2||b.height<2)return;
    o.push([b.left-r.left,b.top-r.top,b.right-r.left,b.bottom-r.top]);
  });
  return o;
}
function labels(){
  lblRaf=0;
  var r=svg.getBoundingClientRect();if(!r.width||!vb.w)return;
  var sc=r.width/vb.w,fs=parseFloat(svg.style.getPropertyValue("--fs"))*sc||11,all=svg.classList.contains("all");
  var obs=obstacles(r).concat(RT.boxes(sc,vb)),syms=[],pos={},placed=[];
  SYS.forEach(function(s){
    if(s.d>year)return;
    var q=(s.r||6)*sc*1.25+2,x=(POS[s.i][0]-vb.x)*sc,y=(POS[s.i][1]-vb.y)*sc;
    pos[s.i]=[x,y];syms.push([x-q,y-q,x+q,y+q,s.i]);
  });
  var order=BYPRIO.slice();
  RT.ids().concat([hov,sel]).forEach(function(id){if(id&&BY[id]){order=order.filter(function(s){return s.i!==id});order.unshift(BY[id])}}); /* l’itinéraire passe devant, puis le survol, puis la sélection */
  order.forEach(function(s){
    var must=s.i===sel||s.i===hov||RT.has(s.i),show=false;
    if(s.d<=year&&(must||s.mj||all)){
      var P=pos[s.i],x=P[0],y=P[1],rr=(s.r||6)*sc,w=s.n.length*fs*.76+8,best=null,bc=1e12;
      for(var i=0;i<4;i++){
        var bx=x,by,a="middle",bo;
        if(i===0){by=y+rr+fs*.95}else if(i===1){by=y-rr-fs*.35}else{by=y+fs*.32;bx=i===2?x+rr+5:x-rr-5;a=i===2?"start":"end"}
        bo=a==="middle"?[bx-w/2,by-fs*.85,bx+w/2,by+fs*.3]:(a==="start"?[bx,by-fs*.85,bx+w,by+fs*.3]:[bx-w,by-fs*.85,bx,by+fs*.3]);
        var cost=0;
        if(bo[2]<0||bo[0]>r.width||bo[3]<0||bo[1]>r.height){if(!must)continue;cost+=1}
        placed.forEach(function(b){cost+=ovl(bo,b)});
        syms.forEach(function(b){if(b[4]!==s.i)cost+=ovl(bo,b)});
        obs.forEach(function(b){cost+=ovl(bo,b)});
        if(cost<bc){bc=cost;best={bx:bx,by:by,a:a,bo:bo}}
        if(!cost)break;
      }
      if(best&&(bc===0||must)){
        show=true;placed.push(best.bo);
        s.t.setAttribute("x",(vb.x+best.bx/sc).toFixed(2));s.t.setAttribute("y",(vb.y+best.by/sc).toFixed(2));s.t.style.textAnchor=best.a;
      }
    }
    s.g.classList.toggle("nolbl",!show);s.g.classList.toggle("lbl",show);
  });
}
function queueLabels(){if(!lblRaf)lblRaf=requestAnimationFrame(labels)}
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
/* tactile : un doigt déplace la carte, deux doigts zooment (pincement) */
var ptrs={},pinch=null;
function pdist(){var k=Object.keys(ptrs);if(k.length<2)return null;var a=ptrs[k[0]],b=ptrs[k[1]];return{d:Math.hypot(a.x-b.x,a.y-b.y)||1,x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
svg.addEventListener("pointerdown",function(e){
  lastPT=e.pointerType||"mouse";
  ptrs[e.pointerId]={x:e.clientX,y:e.clientY};
  if(Object.keys(ptrs).length===2){pinch=pdist();drag=null;box.classList.add("drag");hideTip();dropHint();return}
  drag={x:e.clientX,y:e.clientY,vx:vb.x,vy:vb.y,moved:false};
});
window.addEventListener("pointermove",function(e){
  if(ptrs[e.pointerId]){ptrs[e.pointerId]={x:e.clientX,y:e.clientY}}
  if(pinch){
    var n=pdist();if(!n)return;
    var r=svg.getBoundingClientRect();
    zoomAt(pinch.d/n.d,(n.x-r.left)/r.width,(n.y-r.top)/r.height);
    pinch=n;return;
  }
  if(!drag)return;
  var dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<5)return;
  drag.moved=true;box.classList.add("drag");
  var r=svg.getBoundingClientRect();
  vb.x=drag.vx-dx*vb.w/r.width;vb.y=drag.vy-dy*vb.h/r.height;setVB();
});
function pend(e){
  var was=!!ptrs[e.pointerId];delete ptrs[e.pointerId];
  if(pinch){justDragged=true;setTimeout(function(){justDragged=false},300)}
  if(Object.keys(ptrs).length<2)pinch=null;
  if(!was&&!drag)return;
  if(drag&&drag.moved){justDragged=true;setTimeout(function(){justDragged=false},0)}
  if(!Object.keys(ptrs).length){drag=null;box.classList.remove("drag")}
}
window.addEventListener("pointerup",pend);
window.addEventListener("pointercancel",pend);
/* tap et clic : le système le plus proche du point touché (rayon ~24 px au doigt, 14 px à la souris) ; sur téléphone la fiche s’ouvre en volet bas */
function nearestAt(cx,cy,rad){
  var r=svg.getBoundingClientRect(),sc=r.width/vb.w,best=null,bd=rad*rad+1;
  SYS.forEach(function(s){
    if(s.d>year||s.g.classList.contains("dim"))return;
    var x=r.left+(POS[s.i][0]-vb.x)*sc-cx,y=r.top+(POS[s.i][1]-vb.y)*sc-cy,d=x*x+y*y;
    if(d<bd){bd=d;best=s}
  });
  return best;
}
function ensureVisible(id){
  if(!box.offsetParent||!POS[id])return;
  var r=svg.getBoundingClientRect(),p=pads(),sc=r.width/vb.w,bot=p.b;
  if(isMobile()&&stage.classList.contains("o-side")){var sd=$("#vwSide").getBoundingClientRect();bot=Math.max(bot,r.bottom-sd.top+8)}
  var m=26,x=(POS[id][0]-vb.x)*sc,y=(POS[id][1]-vb.y)*sc,l=p.l+m,rt=r.width-p.r-m,tp=p.t+m/2,bt=r.height-bot-m,dx=0,dy=0;
  if(x<-20||x>r.width+20||y<-20||y>r.height+20){dx=(l+rt)/2-x;dy=(tp+bt)/2-y}
  else{if(x<l)dx=l-x;else if(x>rt)dx=rt-x;if(y<tp)dy=tp-y;else if(y>bt)dy=bt-y}
  if(dx||dy){vb.x-=dx/sc;vb.y-=dy/sc;setVB()}
}
svg.addEventListener("click",function(e){
  if(justDragged)return;
  var n=e.target.closest&&e.target.closest(".nd"),s;
  if(e.detail===0&&n)s=BY[n.getAttribute("data-i")];
  else s=nearestAt(e.clientX,e.clientY,lastPT==="mouse"?14:24);
  if(s){
    sel=s.i;tabId=s.i;
    if(isMobile()){setPanel("side");render();requestAnimationFrame(function(){ensureVisible(s.i)})}else{setPanel(null);render()}
  }else{sel=null;setPanel(null);render()}
});
/* clavier sur la carte : flèches = voisin le plus proche dans la direction (il est sélectionné), Entrée/Espace = ouvrir la fiche, +/-/= zoom, 0 vue d’ensemble, Maj+flèches = déplacer */
function neighbour(from,dx,dy){
  var a=POS[from],best=null,bs=1e9,any=null,as=1e9;
  SYS.forEach(function(s){
    if(s.i===from||s.d>year||s.g.classList.contains("dim"))return;
    var vx=POS[s.i][0]-a[0],vy=POS[s.i][1]-a[1],al=vx*dx+vy*dy,pe=Math.abs(vx*dy-vy*dx);
    if(al<=0)return;
    var sc=al+pe*2;
    if(pe<=al*1.2&&sc<bs){bs=sc;best=s}
    if(sc<as){as=sc;any=s}
  });
  return best||any;
}
function goTo(id){
  stop();sel=id;tabId=id;render();ensureVisible(id);
  BY[id].g.focus({preventScroll:true});
}
function openFiche(){
  if(isMobile()){setPanel("side");requestAnimationFrame(function(){ensureVisible(sel)})}
  var h=detail.querySelector("h3");if(h){h.setAttribute("tabindex","-1");h.focus({preventScroll:true})}
}
function zoomKey(f){
  var mx=.5,my=.5;
  if(sel&&POS[sel]){var x=(POS[sel][0]-vb.x)/vb.w,y=(POS[sel][1]-vb.y)/vb.h;if(x>0&&x<1&&y>0&&y<1){mx=x;my=y}}
  zoomAt(f,mx,my);
}
svg.addEventListener("keydown",function(e){
  if(e.altKey||e.ctrlKey||e.metaKey)return;
  var n=e.target.closest&&e.target.closest(".nd"),k=e.key;
  var dir={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[k];
  if(dir){
    e.preventDefault();
    if(e.shiftKey){vb.x+=dir[0]*vb.w*.15;vb.y+=dir[1]*vb.h*.15;setVB();return}
    var from=n?n.getAttribute("data-i"):tabId,t=from&&neighbour(from,dir[0],dir[1]);
    if(t)goTo(t.i);
    return;
  }
  if(k==="+"||k==="="||k==="Add"){e.preventDefault();zoomKey(.7)}
  else if(k==="-"||k==="_"||k==="Subtract"){e.preventDefault();zoomKey(1/.7)}
  else if(k==="0"){e.preventDefault();fit()}
  else if((k==="Enter"||k===" ")&&n){e.preventDefault();var id=n.getAttribute("data-i");if(id!==sel){stop();sel=id;tabId=id;render()}openFiche()}
});
$("#zIn").addEventListener("click",function(){zoomAt(.7,.5,.5)});
$("#zOut").addEventListener("click",function(){zoomAt(1/.7,.5,.5)});
/* sur téléphone, un second appui sur le cadre montre toute la largeur de la carte */
$("#zFit").addEventListener("click",function(){fit(!!fitW&&Math.abs(vb.w-fitW)<fitW*.02)});
addEventListener("resize",function(){if(box.offsetParent){var ar=ratio();vb.h=vb.w/ar;setVB()}});

/* mobile : filtres et fiche du système dans des panneaux repliables */
var stage=$(".vw-stage");
function setPanel(name){
  ["rail","side"].forEach(function(k){
    var on=k===name;stage.classList.toggle("o-"+k,on);
    $(k==="rail"?"#vwTabRail":"#vwTabSide").setAttribute("aria-expanded",String(on));
  });
}
$("#vwTabRail").addEventListener("click",function(){setPanel(stage.classList.contains("o-rail")?null:"rail")});
$("#vwTabSide").addEventListener("click",function(){setPanel(stage.classList.contains("o-side")?null:"side")});
/* Échap : ferme le volet ouvert (téléphone) ou, sinon, la fiche du système (la sélection) quand le focus est sur la carte ou la fiche */
document.addEventListener("keydown",function(e){
  if(e.key!=="Escape"||$("#v-map").hidden)return;
  var t=e.target,inSide=t&&t.closest&&t.closest(".vw-side,.vw-rail");
  if(stage.classList.contains("o-rail")||stage.classList.contains("o-side")){setPanel(null);if(inSide)focusStop();return}
  if(sel&&t&&t.closest&&t.closest("#mapsvg,.vw-side")){sel=null;render();focusStop()}
});

/* lien partageable : #carte/année/système, avec en plus l’itinéraire s’il y en a un : #carte/2956/stanton?de=sol&vers=stanton (mis à jour en différé) */
var hashTimer=0;
function hashNow(){return "#carte/"+year+(sel?"/"+sel:"")+RT.query()}
function syncHash(){
  if(!box.offsetParent)return;
  clearTimeout(hashTimer);
  hashTimer=setTimeout(function(){if(!box.offsetParent)return;/* onglet quitté entre-temps : ne pas réécrire l'URL */try{history.replaceState(null,"",hashNow())}catch(e){}},250);
}
function readHash(h){
  var q=h.indexOf("?"),a=(q<0?h:h.slice(0,q)).split("/");
  if(a[0]!=="#carte")return;
  if(q>=0)RT.fromQuery(h.slice(q+1));
  var y=parseInt(a[1],10);
  if(y>=MIN&&y<=MAX)year=y;
  if(a[2]&&BY[a[2]])sel=a[2];
}
function say(msg){var el=$("#mLink");var old=el.textContent;el.textContent=msg;setTimeout(function(){el.textContent=old},1800)}
$("#mLink").addEventListener("click",function(){
  var url=location.href.split("#")[0]+hashNow();
  function fallback(){var t=document.createElement("textarea");t.value=url;t.setAttribute("readonly","");t.style.position="fixed";t.style.opacity="0";document.body.appendChild(t);t.select();var ok=false;try{ok=document.execCommand("copy")}catch(e){}t.remove();say(ok?"Lien copié":"Copie impossible")}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(function(){say("Lien copié")},fallback);else fallback();
});

/* recherche d’un système */
function norm(t){return OrbUtil.norm(t,{drop:/[\u2019']/g,sp:/[\u00a0\u202f]/g,trim:true})} /* apostrophes supprimées */
$("#mSys").innerHTML=SYS.slice().sort(function(a,b){return a.n.localeCompare(b.n,"fr")}).map(function(s){return '<option value="'+s.n+'"></option>'}).join("");
function findSys(q){
  q=norm(q);if(!q)return null;
  var hit=null;
  SYS.forEach(function(s){var n=norm(s.n);if(n===q)hit=s;else if(!hit&&n.indexOf(q)===0)hit=s});
  return hit;
}
function goFind(){
  var v=$("#mFind").value.trim(),s=findSys(v),nm=$("#mNoMatch");
  nm.textContent=(!s&&v)?"Aucun système nommé « "+v+" ».":"";
  if(!s)return;
  pick(s.i,year<s.d?s.d:year);
}
$("#mFind").addEventListener("change",goFind);
$("#mFind").addEventListener("input",function(){$("#mNoMatch").textContent=""});
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

/* année au clavier : ← et → (hors de la carte, des champs et des boutons), [ et ], PageUp et PageDown (la carte garde les flèches) */
document.addEventListener("keydown",function(e){
  if($("#v-map").hidden||e.metaKey)return;
  var k=e.key,t=e.target,field=t&&t.closest&&t.closest("input,textarea,select"),onMap=t&&t.closest&&t.closest("#mapsvg");
  var go=null;
  if(k==="["||k==="]"){
    if(e.ctrlKey!==e.altKey)return; /* AltGr (clavier AZERTY) = Ctrl+Alt */
    if(field&&t.type!=="range")return;
    go=k==="["?"#mPrev":"#mNext";
  }else if(k==="PageUp"||k==="PageDown"){
    if(e.altKey||e.ctrlKey||e.shiftKey||field||!(onMap||t===document.body))return;
    go=k==="PageUp"?"#mPrev":"#mNext";
  }else if(k==="ArrowLeft"||k==="ArrowRight"){
    if(e.altKey||e.ctrlKey||e.shiftKey)return;
    if(t&&t!==document.body&&t.closest&&t.closest("input,textarea,select,button,a,.nd"))return;
    go=k==="ArrowLeft"?"#mPrev":"#mNext";
  }
  if(!go)return;
  e.preventDefault();$(go).click();
});

/* infobulle au survol */
var tip=$("#mTip");
function hideTip(){tip.hidden=true}
svg.addEventListener("pointermove",function(e){
  if(drag&&drag.moved||e.pointerType==="touch"){hideTip();return}
  var s=nearestAt(e.clientX,e.clientY,e.pointerType==="pen"?24:14),hid=s?s.i:null;
  if(hid!==hov){hov=hid;queueLabels()}
  box.classList.toggle("hit",!!s);
  if(!s){hideTip();return}
  var st=stateAt(s,year),r=box.getBoundingClientRect();
  tip.innerHTML='<b>'+s.n+'</b><span>'+OW[st[1]][0]+(s.d&&!s.nd?' · découvert en '+s.d:'')+'</span>';
  tip.hidden=false;
  tip.style.left=Math.max(60,Math.min(r.width-60,e.clientX-r.left))+"px";
  tip.style.top=(e.clientY-r.top)+"px";
});
svg.addEventListener("pointerleave",function(){hideTip();box.classList.remove("hit");if(hov){hov=null;queueLabels()}});

/* aide clavier (texte masqué pour les lecteurs d’écran + « ? Aide clavier » dans les filtres) */
(function(){
  var K=[["Tab","entrer sur la carte (un seul arrêt)"],["Flèches","système voisin le plus proche, il est sélectionné"],["Entrée ou Espace","ouvrir la fiche"],["+ − (ou =)","zoom"],["0","vue d’ensemble"],["Maj + flèches","déplacer la carte"],["Échap","fermer la fiche"],["[ ] ou PageUp PageDown","changement précédent ou suivant dans le temps"],["Curseur Année","flèches, Début, Fin"],["Champs Itinéraire","↑ ↓ choisir un système, Entrée valider, Échap fermer la liste"]];
  var sr=document.createElement("p");sr.className="sr";sr.id="mapKeys";
  sr.textContent="Carte au clavier : Tab pour entrer sur la carte, flèches pour passer au système voisin, Entrée ou Espace pour ouvrir la fiche, plus et moins pour zoomer, zéro pour la vue d’ensemble, Maj et flèches pour déplacer la carte, Échap pour fermer la fiche. Les touches crochet ouvrant et crochet fermant, ou Page précédente et Page suivante, changent l’année. Hors de la carte, flèches gauche et droite aussi.";
  $("#mAnnounce").insertAdjacentElement("afterend",sr);
  var d=document.createElement("details");d.className="vw-help";
  d.innerHTML='<summary>? Aide clavier</summary><dl>'+K.map(function(x){return '<dt><kbd>'+x[0]+'</kbd></dt><dd>'+x[1]+'</dd>'}).join("")+'</dl><p>Hors de la carte, ← et → changent aussi l’année.</p>';
  $("#vwRail .in").insertBefore(d,$("#mLink"));
})();

/* astuce du pincement : une seule fois sur appareil tactile (mémorisée dans le navigateur), fermable */
var hintDone=false;
function dropHint(){var h=$("#vwHint");if(h)h.remove()}
function pinchHint(){
  if(hintDone||!matchMedia("(pointer:coarse)").matches)return;
  hintDone=true;
  try{if(localStorage.getItem("orbital-pinch-hint"))return;localStorage.setItem("orbital-pinch-hint","1")}catch(e){}
  var d=document.createElement("div");d.className="vw-hint";d.id="vwHint";
  d.innerHTML='<span>Pincez pour zoomer, glissez pour déplacer</span><button type="button" aria-label="Fermer l’astuce">×</button>';
  d.querySelector("button").addEventListener("click",dropHint);
  box.appendChild(d);setTimeout(dropHint,12000);queueLabels();
}

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
var VIEWS={home:"#home",log:"#carnet",commerce:"#commerce",time:"#chronologie",map:"#carte",cl:"#commlinks",ver:"#versions"};
var SUBS={home:"Une carte qui change avec le temps, la chronologie de l’univers et votre carnet de bord.",
  log:"Journal personnel · aUEC · heures de vol",
  commerce:"Vos outils de trade et le résumé de votre journal.",
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
  ["home","log","commerce","time","map","cl","ver"].forEach(function(k){document.getElementById("v-"+k).hidden=k!==v});
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
  try{history.replaceState(null,"",map?hashNow():VIEWS[v])}catch(e){}
  window.scrollTo(0,0);
  if(v==="time")window.dispatchEvent(new Event("scroll"));
  if(v==="cl"&&window.__orbCL)window.__orbCL();
  if(v==="commerce"&&window.__orbCommerce)window.__orbCommerce();
  if(map){fit();render();pinchHint()}
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
var escRe=OrbUtil.escRe;
var NAMERX=SYS.map(function(s){return{s:s,rx:new RegExp("(^|[^A-Za-zÀ-ÿ’'])"+escRe(s.n)+"(?![A-Za-zÀ-ÿ])")}});
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
var HASH=location.hash,R={"#carte":"map","#carnet":"log","#commerce":"commerce","#chronologie":"time","#versions":"ver","#commlinks":"cl"};readHash(HASH);show(R[HASH.split(/[\/?]/)[0]]||"home");
/* un lien collé dans l’onglet déjà ouvert : on le suit sans recharger la page */
addEventListener("hashchange",function(){
  var k=R[location.hash.split(/[\/?]/)[0]];
  if(!k)return;
  readHash(location.hash);show(k);if(k==="map"&&sel)centerOn(sel);
});
})();
