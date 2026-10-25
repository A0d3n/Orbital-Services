(function(){
"use strict";
var $=function(s){return document.querySelector(s)};
var TYPES=[
 ["session","Session de jeu","--holo"],["mining","Minage","--c-tev"],["cargo","Commerce / cargo","--c-hum"],
 ["combat","Combat","--c-van"],["explo","Exploration","--c-banu"],["mission","Mission","--c-xian"],
 ["salvage","Récupération","--c-corp"],["pax","Transport","--c-tech"],["race","Course","--c-myst"],
 ["social","Social / événement","--c-xian"],["other","Autre","--c-corp"]];
var TM={};TYPES.forEach(function(t){TM[t[0]]=t});
function tcol(id){return "var("+(TM[id]||TM.other)[2]+")"}
function tname(id){return (TM[id]||TM.other)[1]}
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){}return null}
function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function p2(n){return (n<10?"0":"")+n}
function fmtDur(m){m=Math.round(m||0);if(m<60)return m+" min";return Math.floor(m/60)+" h "+p2(m%60)}
function fmtN(n){return Math.round(n).toLocaleString("fr-FR")}
function localInput(ms){var d=new Date(ms);return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate())+"T"+p2(d.getHours())+":"+p2(d.getMinutes())}
function dayKey(ms){var d=new Date(ms);return d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate())}
function dayLabel(ms){return new Date(ms).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
function timeLabel(ms){return new Date(ms).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}
function say(node,txt,err){node.textContent=txt||"";node.className=node.className.replace(/\berr\b/g,"").trim()+(err?" err":"")}

/* ── stockage : db (compte) si disponible, sinon navigateur ── */
var entries={},store={mode:"local",put:null,del:null},LSK="sclog_entries";
function loadLocal(){try{var a=JSON.parse(ls(LSK)||"[]");entries={};a.forEach(function(e){if(e&&e.id)entries[e.id]=e})}catch(e){entries={}}}
function saveLocal(){ls(LSK,JSON.stringify(Object.keys(entries).map(function(k){return entries[k]})))}
function setLocalStore(){
  store.mode="local";loadLocal();
  store.put=function(id,d){entries[id]=Object.assign({id:id},d);saveLocal();return Promise.resolve()};
  store.del=function(id){delete entries[id];saveLocal();return Promise.resolve()};
  $("#lgStore").innerHTML="";var b=el("b",null,"Stockage local");$("#lgStore").appendChild(b);
  $("#lgStore").appendChild(document.createTextNode(" — vos notes restent dans ce navigateur uniquement (le stockage du compte n’est pas disponible ici)."));
  refresh();
}
function setApiStore(list){
  store.mode="api";entries={};list.forEach(function(e){if(e&&e.id)entries[e.id]=e});
  store.put=function(id,d){return fetch("api/entries/"+encodeURIComponent(id),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}).then(function(r){if(!r.ok)throw {code:"http_"+r.status};entries[id]=Object.assign({id:id},d)})};
  store.del=function(id){return fetch("api/entries/"+encodeURIComponent(id),{method:"DELETE"}).then(function(r){if(!r.ok)throw {code:"http_"+r.status};delete entries[id]})};
  $("#lgStore").innerHTML="";$("#lgStore").appendChild(el("b",null,"Enregistré sur le serveur"));
  $("#lgStore").appendChild(document.createTextNode(" — le carnet est stocké sur votre NAS et partagé entre vos appareils."));
  refresh();
  setInterval(function(){if(document.hidden)return;fetch("api/entries",{cache:"no-store"}).then(function(r){return r.json()}).then(function(l){entries={};l.forEach(function(e){entries[e.id]=e});refresh()}).catch(function(){})},20000);
}
function tryApi(){
  fetch("api/entries",{cache:"no-store"}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(l){if(!Array.isArray(l))throw 0;setApiStore(l)}).catch(setLocalStore);
}
function setDbStore(db){
  store.mode="db";var col=db.collection("log");
  store.put=function(id,d){return col.doc(id).set(d)};
  store.del=function(id){return col.doc(id).delete()};
  $("#lgStore").innerHTML="";$("#lgStore").appendChild(el("b",null,"Enregistré"));
  $("#lgStore").appendChild(document.createTextNode(" — chaque entrée est sauvegardée dans votre carnet en ligne, lisible depuis tous vos appareils."));
  col.onSnapshot(function(snap){
    entries={};snap.docs.forEach(function(d){var v=d.data();if(v)entries[d.id]=Object.assign({id:d.id},v)});
    refresh();
  },function(){setLocalStore()});
}
function clean(d){
  return {type:TM[d.type]?d.type:"other",ts:+d.ts||Date.now(),dur:Math.max(0,+d.dur||0),auec:+d.auec||0,
    title:String(d.title||"").slice(0,120),place:String(d.place||"").slice(0,80),ship:String(d.ship||"").slice(0,80),
    notes:String(d.notes||"").slice(0,1500),src:d.src?String(d.src).slice(0,20):"manual"};
}
function newId(){return "e"+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}

/* ── formulaire ── */
var fType=$("#fType"),fWhen=$("#fWhen"),fDur=$("#fDur"),fAuec=$("#fAuec"),fTitle=$("#fTitle"),fPlace=$("#fPlace"),fShip=$("#fShip"),fNotes=$("#fNotes"),fMsg=$("#fMsg"),editing=null;
TYPES.forEach(function(t){var o=el("option",null,t[1]);o.value=t[0];fType.appendChild(o)});
fType.value="mining";fWhen.value=localInput(Date.now());
function resetForm(keepMsg){
  editing=null;$("#lgForm").reset();fType.value=ls("sclog_lasttype")||"mining";fWhen.value=localInput(Date.now());
  $("#lgFormTitle").textContent="Nouvelle entrée";$("#fSave").textContent="Enregistrer";$("#fReset").hidden=true;
  if(!keepMsg)say(fMsg,"");
}
function fillForm(e){
  fType.value=e.type;fWhen.value=localInput(e.ts);fDur.value=e.dur||"";fAuec.value=e.auec||"";
  fTitle.value=e.title||"";fPlace.value=e.place||"";fShip.value=e.ship||"";fNotes.value=e.notes||"";
}
/* messages de validation en français (à la place des messages natifs du navigateur) */
function frInvalid(f){
  var v=f.validity;
  if(v.valueMissing)return "Veuillez renseigner ce champ.";
  if(v.badInput)return "Veuillez saisir une valeur valide.";
  if(v.rangeUnderflow)return "La valeur doit être supérieure ou égale à "+f.min+".";
  if(v.rangeOverflow)return "La valeur doit être inférieure ou égale à "+f.max+".";
  if(v.stepMismatch)return "Veuillez saisir un nombre entier.";
  if(v.tooLong)return "Le texte est trop long.";
  return "Valeur invalide.";
}
$("#lgForm").addEventListener("invalid",function(ev){
  var f=ev.target;f.setCustomValidity("");f.setCustomValidity(frInvalid(f));
},true);
$("#lgForm").addEventListener("input",function(ev){if(ev.target.setCustomValidity)ev.target.setCustomValidity("")});
$("#lgForm").addEventListener("submit",function(ev){
  ev.preventDefault();say(fMsg,"");
  var ts=new Date(fWhen.value).getTime();
  if(!isFinite(ts)){say(fMsg,"Date invalide.",true);return}
  var d=clean({type:fType.value,ts:ts,dur:fDur.value,auec:fAuec.value,title:fTitle.value,place:fPlace.value,ship:fShip.value,notes:fNotes.value,src:editing&&entries[editing]?entries[editing].src:"manual"});
  var id=editing||newId(),was=!!editing;
  $("#fSave").disabled=true;var failed=false;
  store.put(id,d).then(function(){
    ls("sclog_lasttype",d.type);
    if(store.mode!=="db")refresh();
    resetForm(true);say(fMsg,was?"Entrée modifiée.":"Entrée ajoutée au carnet.");
  }).catch(function(e){failed=true;say(fMsg,"Impossible d’enregistrer ("+(e&&e.code||"erreur")+").",true)}).then(function(){
    $("#fSave").disabled=false;
    /* le focus ne reste pas sur un bouton désactivé : retour au bouton en cas d’échec, au premier champ sinon */
    (failed?$("#fSave"):fType).focus({preventScroll:true});
  });
});
$("#fReset").addEventListener("click",function(){resetForm()});

/* ── chronomètre ── */
var tmr=null,tick=null,TK="sclog_timer";
function showTimer(){
  var start=+ls(TK)||0,on=start>0;
  $("#lgTimer").classList.toggle("on",on);
  $("#lgStart").hidden=on;$("#lgStop").hidden=!on;$("#lgCancel").hidden=!on;
  clearInterval(tick);
  function paint(){var s=Math.max(0,Math.floor((Date.now()-start)/1000));$("#lgClock").textContent=p2(Math.floor(s/3600))+":"+p2(Math.floor(s/60)%60)+":"+p2(s%60)}
  if(on){paint();tick=setInterval(paint,1000)}else $("#lgClock").textContent="00:00:00";
}
$("#lgStart").addEventListener("click",function(){say(fMsg,"");ls(TK,String(Date.now()));showTimer();$("#lgStop").focus()});
$("#lgCancel").addEventListener("click",function(){say(fMsg,"");ls(TK,null);showTimer();$("#lgStart").focus()});
$("#lgStop").addEventListener("click",function(){
  say(fMsg,"");var start=+ls(TK)||Date.now();ls(TK,null);showTimer();
  resetForm();fType.value="session";fWhen.value=localInput(start);fDur.value=Math.max(1,Math.round((Date.now()-start)/60000));
  say(fMsg,"Session terminée : complétez les détails puis enregistrez.");
  $("#lgForm").scrollIntoView({behavior:"smooth",block:"center"});fTitle.focus({preventScroll:true});
});

/* ── affichage ── */
var rangeD=0,fil="",q="";
var chipsF=$("#lgFilter");
(function(){var all=el("button","chip","Tout");all.type="button";all.dataset.t="";all.setAttribute("aria-pressed","true");chipsF.appendChild(all);
  TYPES.forEach(function(t){var b=el("button","chip");b.type="button";b.dataset.t=t[0];b.style.setProperty("--tc","var("+t[2]+")");b.setAttribute("aria-pressed","false");
    var i=document.createElement("i");b.appendChild(i);b.appendChild(document.createTextNode(t[1]));chipsF.appendChild(b)})})();
chipsF.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;fil=b.dataset.t;
  [].forEach.call(chipsF.children,function(c){c.setAttribute("aria-pressed",String(c===b))});render()});
$("#lgRange").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;rangeD=+b.dataset.d;
  [].forEach.call(this.children,function(c){c.setAttribute("aria-pressed",String(c===b))});render()});
$("#lgSearch").addEventListener("input",function(){q=this.value.trim().toLowerCase();render()});
$("#lgGoal").addEventListener("change",function(){var v=Math.max(0,Math.round(+this.value||0));ls("sclog_goal",v?String(v):null);render()});
var refreshQ=false;
function refresh(){if(refreshQ)return;refreshQ=true;requestAnimationFrame(function(){refreshQ=false;render()})}
function all(){return Object.keys(entries).map(function(k){return entries[k]}).sort(function(a,b){return b.ts-a.ts})}
function render(){
  var list=all(),now=Date.now();
  window.__lg={count:list.length,last:list[0]||null};try{window.dispatchEvent(new CustomEvent("lg:update"))}catch(e){}
  var inRange=list.filter(function(e){return !rangeD||e.ts>=now-rangeD*864e5});
  /* stats */
  var dur=0,auec=0,byT={},rd=0,ra=0,rT={};
  inRange.forEach(function(e){dur+=e.dur||0;auec+=e.auec||0;byT[e.type]=(byT[e.type]||0)+1;
    if(e.dur>0&&e.auec){rd+=e.dur;ra+=e.auec;var q=rT[e.type]||(rT[e.type]={d:0,a:0});q.d+=e.dur;q.a+=e.auec}});
  var rate=rd>0?ra/(rd/60):null;
  var st=$("#lgStats");st.textContent="";
  [[String(inRange.length),"Entrées",""],[fmtDur(dur),"Temps noté",""],[(auec>0?"+":"")+fmtN(auec),"aUEC net",auec>0?"pos":auec<0?"neg":""],[rate===null?"—":(rate>0?"+":"")+fmtN(rate),"aUEC / heure",rate>0?"pos":rate<0?"neg":""]].forEach(function(s){
    var d=el("div","lg-stat"),b=el("b",s[2],s[0]);d.appendChild(b);d.appendChild(el("span",null,s[1]));st.appendChild(d)});
  var bars=$("#lgBars");bars.textContent="";
  var ks=Object.keys(byT).sort(function(a,b){return byT[b]-byT[a]}),mx=ks.length?byT[ks[0]]:1;
  ks.forEach(function(k){var r=el("div","lg-bar");r.style.setProperty("--tc",tcol(k));r.appendChild(el("span",null,tname(k)));
    var q=rT[k];r.title=tname(k)+" : "+byT[k]+" entrée(s)"+(q&&q.d>0?" · "+fmtN(q.a/(q.d/60))+" aUEC/h":"");
    var w=el("div"),i=document.createElement("i");i.style.width=Math.max(2,byT[k]/mx*100)+"%";w.appendChild(i);r.appendChild(w);r.appendChild(el("em",null,String(byT[k])));bars.appendChild(r)});
  var dd=$("#lgDays");dd.textContent="";var cnt={};list.forEach(function(e){var k=dayKey(e.ts);cnt[k]=(cnt[k]||0)+1});
  var cols=[],m=1,tot30=0;for(var i=29;i>=0;i--){var k=dayKey(now-i*864e5);cols.push([k,cnt[k]||0]);tot30+=cnt[k]||0;m=Math.max(m,cnt[k]||0)}
  cols.forEach(function(c){var b=document.createElement("i");b.style.height=(c[1]?Math.max(12,c[1]/m*100):4)+"%";if(!c[1])b.className="z";b.title=c[0]+" : "+c[1]+" entrée(s)";dd.appendChild(b)});
  dd.setAttribute("aria-label",tot30+" entrée(s) sur les 30 derniers jours, jusqu’à "+m+" par jour");
  var ax=$("#lgAxis");ax.textContent="";ax.appendChild(el("span",null,cols[0][0]));ax.appendChild(el("span",null,"max "+m+" / jour"));ax.appendChild(el("span",null,cols[29][0]));
  /* objectif des 7 derniers jours */
  var goal=+(ls("sclog_goal")||0),wk=0,since=now-7*864e5;
  list.forEach(function(e){if(e.ts>=since)wk+=e.auec||0});
  var gb=$("#lgGoalBar"),pc=goal>0?Math.max(0,Math.min(100,wk/goal*100)):0;
  gb.firstChild.style.width=pc+"%";gb.setAttribute("aria-valuenow",String(Math.round(pc)));gb.classList.toggle("done",goal>0&&wk>=goal);
  $("#lgGoalTxt").textContent=goal>0?fmtN(wk)+" / "+fmtN(goal)+" aUEC":"Aucun objectif défini";
  if(document.activeElement!==$("#lgGoal"))$("#lgGoal").value=goal>0?String(goal):"";
  /* liste */
  var shown=list.filter(function(e){
    if(fil&&e.type!==fil)return false;
    if(q&&(e.title+" "+e.place+" "+e.ship+" "+e.notes+" "+tname(e.type)).toLowerCase().indexOf(q)<0)return false;
    return true});
  $("#lgCount").textContent="Journal · "+shown.length+(shown.length!==list.length?" sur "+list.length:"")+" entrée"+(list.length>1?"s":"");
  var L=$("#lgList");L.textContent="";
  if(!shown.length){L.appendChild(el("div","lg-empty",list.length?"Aucune entrée ne correspond.":"Le carnet est vide. Ajoutez une première activité, ou importez votre Game.log."));return}
  var cur="";
  shown.slice(0,300).forEach(function(e){
    var dk=dayKey(e.ts);if(dk!==cur){cur=dk;L.appendChild(el("div","lg-day",dayLabel(e.ts)))}
    var c=el("article","lg-ent");c.style.setProperty("--tc",tcol(e.type));
    var top=el("div","lg-top");top.appendChild(el("span","lg-tag",tname(e.type)));top.appendChild(el("span","lg-time",timeLabel(e.ts)));c.appendChild(top);
    if(e.title)c.appendChild(el("div","lg-ttl",e.title));
    var meta=el("div","lg-meta");
    if(e.place)meta.appendChild(el("span",null,"◎ "+e.place));
    if(e.ship)meta.appendChild(el("span",null,"▲ "+e.ship));
    if(e.dur)meta.appendChild(el("span",null,"⏱ "+fmtDur(e.dur)));
    if(e.auec)meta.appendChild(el("span",e.auec>0?"pos":"neg",(e.auec>0?"+":"")+fmtN(e.auec)+" aUEC"));
    if(e.src==="gamelog")meta.appendChild(el("span",null,"Game.log"));
    if(meta.childNodes.length)c.appendChild(meta);
    if(e.notes)c.appendChild(el("p","lg-note",e.notes));
    var act=el("div","lg-act"),be=el("button",null,"Modifier"),bd=el("button",null,"Supprimer");be.type=bd.type="button";
    be.addEventListener("click",function(){editing=e.id;fillForm(e);$("#lgFormTitle").textContent="Modifier l’entrée";$("#fSave").textContent="Mettre à jour";$("#fReset").hidden=false;say(fMsg,"");$("#lgForm").scrollIntoView({behavior:"smooth",block:"center"})});
    var armed=false;bd.addEventListener("click",function(){
      if(!armed){armed=true;bd.textContent="Confirmer ?";bd.className="arm";setTimeout(function(){armed=false;bd.textContent="Supprimer";bd.className=""},3500);return}
      store.del(e.id).then(function(){if(store.mode!=="db")refresh()}).catch(function(){})});
    act.appendChild(be);act.appendChild(bd);c.appendChild(act);L.appendChild(c);
  });
  if(shown.length>300)L.appendChild(el("div","lg-empty","Seules les 300 entrées les plus récentes sont affichées : affinez avec la recherche ou les filtres."));
}

/* ── import Game.log (lecture approximative) ── */
var gHandle=$("#gHandle");gHandle.value=ls("sclog_handle")||"";
gHandle.addEventListener("change",function(){ls("sclog_handle",gHandle.value.trim())});
var prev=$("#gPrev"),pending=[];
function hid(s){return String(s).replace(/[^A-Za-z0-9_-]/g,"_").slice(0,90)}
function parseLog(text,handle){
  var h=handle.toLowerCase(),first=0,last=0,kills=[],deaths=[],auto="",segs=[],prevT=0,GAP=30*60000;
  var tsRe=/^<(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)>/;
  var deRe=/<Actor Death> CActor::Kill: '([^']+)' \[\d+\] in zone '([^']*)' killed by '([^']+)'(?: \[\d+\])?(?: using '([^']*)')?/;
  var lines=text.split(/\r?\n/);
  for(var i=0;i<lines.length;i++){
    var ln=lines[i],m=tsRe.exec(ln);if(!m)continue;
    var t=Date.parse(m[1]);if(!isFinite(t))continue;
    if(!first||t<first)first=t;if(t>last)last=t;
    var sg=segs[segs.length-1];
    if(!sg||(prevT&&t-prevT>GAP&&t>sg.last))segs.push(sg={first:t,last:t});
    else{if(t<sg.first)sg.first=t;if(t>sg.last)sg.last=t}
    prevT=t;
    if(!auto&&ln.indexOf("STATE_CURRENT")>0){var a=/- name (\S+) - state STATE_CURRENT/.exec(ln);if(a)auto=a[1]}
    if(ln.indexOf("<Actor Death>")<0)continue;
    var d=deRe.exec(ln);if(!d||!h)continue;
    var vic=d[1],zone=d[2],kil=d[3],wp=d[4]||"";
    if(vic.toLowerCase()===h&&kil.toLowerCase()!==h)deaths.push({t:t,o:kil,zone:zone,wp:wp});
    else if(kil.toLowerCase()===h&&vic.toLowerCase()!==h)kills.push({t:t,o:vic,zone:zone,wp:wp});
  }
  return {first:first,last:last,kills:kills,deaths:deaths,auto:auto,segs:segs};
}
function zoneName(z){return String(z).replace(/_\d{6,}$/,"").replace(/_/g," ").slice(0,80)}
$("#gFile").addEventListener("change",function(){
  var f=this.files&&this.files[0];this.value="";if(!f)return;
  prev.hidden=false;prev.textContent="Lecture de "+f.name+"…";pending=[];
  f.text().then(function(text){
    var handle=gHandle.value.trim();
    var r=parseLog(text,handle||"");
    if(!handle&&r.auto){handle=r.auto;gHandle.value=handle;ls("sclog_handle",handle);r=parseLog(text,handle)}
    if(!r.first){prev.textContent="Aucune ligne datée trouvée : ce fichier ne ressemble pas à un Game.log.";return}
    var ev=[];
    r.segs.forEach(function(sg){
      var kn=r.kills.filter(function(k){return k.t>=sg.first&&k.t<=sg.last}).length,dn=r.deaths.filter(function(k){return k.t>=sg.first&&k.t<=sg.last}).length;
      ev.push({id:"gl-s-"+sg.first,d:{type:"session",ts:sg.first,dur:Math.max(1,Math.round((sg.last-sg.first)/60000)),title:"Session de jeu (Game.log)",
        notes:handle?(kn+" élimination(s), "+dn+" mort(s) relevée(s)."):"",src:"gamelog"}});
    });
    r.kills.forEach(function(k){ev.push({id:"gl-k-"+k.t+"-"+hid(k.o),d:{type:"combat",ts:k.t,title:"Élimination : "+k.o,place:zoneName(k.zone),notes:k.wp?"Arme : "+k.wp:"",src:"gamelog"}})});
    r.deaths.forEach(function(k){ev.push({id:"gl-d-"+k.t+"-"+hid(k.o),d:{type:"combat",ts:k.t,title:"Mort : tué par "+k.o,place:zoneName(k.zone),notes:k.wp?"Arme : "+k.wp:"",src:"gamelog"}})});
    var ns=r.segs.length,cut=0;
    if(ev.length>ns+200){cut=ev.length-ns-200;ev=ev.slice(0,ns).concat(ev.slice(ns).sort(function(a,b){return b.d.ts-a.d.ts}).slice(0,200))}
    var fresh=ev.filter(function(e){return !entries[e.id]});pending=fresh;
    prev.textContent="";
    prev.appendChild(el("div",null,(ns>1?ns+" sessions détectées (coupure de plus de 30 min) :":"Session du "+new Date(r.first).toLocaleString("fr-FR")+" au "+new Date(r.last).toLocaleString("fr-FR")+" · "+fmtDur((r.last-r.first)/60000))));
    if(ns>1){var sl=document.createElement("ul");sl.className="lg-sess";r.segs.slice(0,8).forEach(function(sg){sl.appendChild(el("li",null,new Date(sg.first).toLocaleString("fr-FR")+" · "+fmtDur((sg.last-sg.first)/60000)))});if(ns>8)sl.appendChild(el("li",null,"… et "+(ns-8)+" autre(s)"));prev.appendChild(sl)}
    var ul=document.createElement("ul");
    ul.appendChild(el("li",null,handle?(r.kills.length+" élimination(s) et "+r.deaths.length+" mort(s) pour « "+handle+" »"):"Pseudo non renseigné : seule la session sera créée."));
    ul.appendChild(el("li",null,fresh.length+" nouvelle(s) entrée(s) à ajouter"+(ev.length-fresh.length?" ("+(ev.length-fresh.length)+" déjà présente(s))":"")));
    if(cut)ul.appendChild(el("li",null,cut+" événement(s) plus ancien(s) ignoré(s) (limite de 200 par import)."));
    prev.appendChild(ul);
    if(fresh.length){var go=el("button","btn play","Ajouter "+fresh.length+" entrée(s)");go.type="button";
      go.addEventListener("click",function(){go.disabled=true;go.textContent="Ajout en cours…";commit(pending,function(n,bad){
        prev.textContent=n+" entrée(s) ajoutée(s)"+(bad?" ; "+bad+" échec(s)":"")+".";pending=[]})});prev.appendChild(go)}
  }).catch(function(){prev.textContent="Lecture du fichier impossible."});
});
function commit(items,done){
  var i=0,ok=0,bad=0;
  function next(){
    if(i>=items.length)return done(ok,bad);
    var it=items[i++];
    store.put(it.id,clean(it.d)).then(function(){ok++}).catch(function(){bad++}).then(function(){setTimeout(next,store.mode==="db"?60:0)});
  }
  next();
}
$("#jFile").addEventListener("change",function(){
  var f=this.files&&this.files[0];this.value="";if(!f)return;
  prev.hidden=false;prev.textContent="Lecture…";
  f.text().then(function(t){
    var a=JSON.parse(t);if(!Array.isArray(a))throw 0;
    var items=a.slice(0,500).filter(function(e){return e&&typeof e==="object"}).map(function(e){return {id:hid(e.id||newId()),d:e}}).filter(function(e){return !entries[e.id]});
    if(!items.length){prev.textContent="Rien de nouveau à importer.";return}
    commit(items,function(n,bad){prev.textContent=n+" entrée(s) importée(s)"+(bad?" ; "+bad+" échec(s)":"")+"."});
  }).catch(function(){prev.textContent="Ce fichier n’est pas un carnet JSON valide."});
});

/* ── export ── */
var dl=null;
function exp(name,data){
  say(fMsg,"");
  if(!all().length){say(fMsg,"Le carnet est vide.",true);return}
  if(!dl){try{var b=new Blob([data],{type:"text/plain;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},600);say(fMsg,"Fichier prêt.")}catch(e){say(fMsg,"Export impossible.",true)}return}
  dl.save({filename:name,data:data}).then(function(){say(fMsg,"Fichier prêt.")}).catch(function(e){if(e&&e.code!=="declined")say(fMsg,"Export impossible ("+(e&&e.code||"erreur")+").",true)});
}
function csvCell(v){v=String(v==null?"":v);return /[";\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
$("#xCsv").addEventListener("click",function(){
  var rows=[["date","activité","durée_min","aUEC","titre","lieu","vaisseau","notes","source"]];
  all().slice().reverse().forEach(function(e){rows.push([new Date(e.ts).toISOString(),tname(e.type),e.dur||0,e.auec||0,e.title,e.place,e.ship,e.notes,e.src||"manual"])});
  exp("carnet-star-citizen.csv","﻿"+rows.map(function(r){return r.map(csvCell).join(";")}).join("\r\n"));
});
$("#xJson").addEventListener("click",function(){exp("carnet-star-citizen.json",JSON.stringify(all().map(function(e){var o=Object.assign({},e);return o}),null,1))});

/* ── démarrage ── */
showTimer();loadLocal();render();
if(window.claude&&claude.use){
  claude.use("downloads").then(function(d){dl=d}).catch(function(){});
  claude.use("db").then(function(db){if(db)setDbStore(db);else tryApi()}).catch(tryApi);
}else tryApi();
})();
