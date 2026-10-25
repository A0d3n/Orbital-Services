/* le lien #chronologie/<id> est lu ici, avant que map.js ne le remplace par #chronologie */
window.__orbHash0=location.hash;
(function(){
var TAGS={hum:"Humanité",xian:"Xi’an",banu:"Banu",tev:"Tevarin",van:"Vanduul",tech:"Technologie",corp:"Industrie",myst:"Mystères"};


var $=OrbUtil.$;
function pad(n){return n<10?"0"+n:""+n}
function rnd(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function orbit(i){
  var r=rnd(i*97+13),n=2+(i%3),s='<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="st" cx="60" cy="60" r="6.5"/>';
  for(var k=1;k<=n;k++){
    var rad=12+k*14,a=r()*6.283;
    s+='<circle class="or" cx="60" cy="60" r="'+rad+'" stroke-width=".9"/>';
    s+='<circle class="pl" cx="'+(60+rad*Math.cos(a)).toFixed(1)+'" cy="'+(60+rad*Math.sin(a)).toFixed(1)+'" r="'+(2.2+r()*2.6).toFixed(1)+'"/>';
  }
  return s+'</svg>';
}

var total=0,html='',ecs='';
var esc=OrbUtil.esc;
function norm(t){return OrbUtil.norm(t,{keep:true,sp:/[\u00a0\u202f]/g})} /* apostrophes ramenées à ' (conservées) */
/* identifiant stable d'un événement : titre sans accents ni ponctuation ; année puis numéro si deux titres sont identiques */
var usedIds={};
function slugify(t){return norm(t).replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/'/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'evenement'}
function evId(e){
  var b=slugify(e.t),id=b,n=1;
  if(usedIds[id])id=b+'-'+slugify(String(e.y).split('→')[0]);
  while(usedIds[id])id=b+'-'+(++n);
  usedIds[id]=1;return id;
}
function ynum(y){var t=String(y).replace(/−/g,'-').replace(/[\s  ]/g,''),m=/^(-?\d+)/.exec(t);return m?+m[1]:0}

/* illustration d'une carte : ciel, étoiles et planète aux couleurs du thème de l'événement */
var SCENE={hum:['#0b1119','#1a2b44','#a6c4ef','#355b9a','#0b1426'],xian:['#0b1412','#173a34','#9fe0cf','#2a8570','#0a221c'],
  banu:['#14130a','#3a3418','#ecdc92','#8a7420','#221d08'],tev:['#1a110a','#3b2412','#e8b48a','#8a4a26','#221208'],
  van:['#1a0d0c','#3b1a16','#e89a8c','#8a2f26','#230b09'],tech:['#120d1a','#2a1f45','#cdbff5','#5b46a5','#150f2b'],
  corp:['#121310','#2e3022','#c9cbb0','#6f7255','#16170f'],myst:['#150d18','#33183a','#e8b0ee','#7a3a8a','#1d0f24']};
var sceneN=0;
function scene(g,seed){
  var c=SCENE[g]||SCENE.hum,r=rnd(seed*131+7),id='sc'+(++sceneN),s='';
  var cx=60+r()*258,cy=150+r()*40,rad=100+r()*40;
  s+='<svg viewBox="0 0 378 134" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs><linearGradient id="'+id+'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+c[0]+'"/><stop offset="1" stop-color="'+c[1]+'"/></linearGradient>'+
    '<radialGradient id="'+id+'p" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="'+c[2]+'"/><stop offset=".6" stop-color="'+c[3]+'"/><stop offset="1" stop-color="'+c[4]+'"/></radialGradient></defs>'+
    '<rect width="378" height="134" fill="url(#'+id+'g)"/><g fill="#eef2ee" opacity=".7">';
  for(var i=0;i<7;i++)s+='<circle cx="'+(r()*370).toFixed(0)+'" cy="'+(r()*70).toFixed(0)+'" r="'+(0.9+r()*.6).toFixed(1)+'"/>';
  s+='</g><circle cx="'+cx.toFixed(0)+'" cy="'+cy.toFixed(0)+'" r="'+rad.toFixed(0)+'" fill="url(#'+id+'p)"/><circle cx="'+cx.toFixed(0)+'" cy="'+cy.toFixed(0)+'" r="'+rad.toFixed(0)+'" fill="none" stroke="'+c[2]+'" stroke-opacity=".5" stroke-width="2"/></svg>';
  return s;
}
/* photo d'une carte : version 800 px (générée par scripts/make-event-images.js) ou original 1600 px selon l'écran.
   sizes = largeur réelle de l'image, mesurée : <=860 px colonne unique (100vw - 30 px) ; 861-905 px jusqu'à ~610 px ;
   906-1239 px jusqu'à ~455 px ; au-delà jusqu'à ~400 px (376 px à 1440). */
var PHOTO_SIZES='(max-width:860px) calc(100vw - 30px), (max-width:905px) 610px, (max-width:1239px) 455px, 400px';
function photo(k){
  var f='evt-'+k.replace('.','-');
  return '<img class="ev-photo" src="'+f+'.webp" srcset="'+f+'-800.webp 800w, '+f+'.webp 1600w" sizes="'+PHOTO_SIZES+'" width="800" height="286" alt="" loading="lazy" decoding="async">';
}
var cardN=0;
function card(e,era,flat){
  var n=++cardN,long=e.d.length>130;
  return '<article class="ev'+(e.m?' major':'')+'"'+(flat?'':' id="ev-'+e.id+'" tabindex="-1"')+' data-id="'+e.id+'" data-g="'+e.g+'" data-y="'+esc(e.y)+'" style="--tc:var(--c-'+e.g+')">'+
    '<div class="ev-img">'+(window.__orbVisual?window.__orbVisual(e._k,e.g,n):scene(e.g,n))+
    photo(e._k)+
    '<span class="ev-lab">'+e.y+'</span></div>'+
    '<div class="body"><div class="ev-top"><div class="ev-ti"><h3>'+e.t+'</h3><div class="ev-sub">'+era.n+' · '+TAGS[e.g]+'</div></div><span class="ev-y">'+e.y+'</span></div>'+
    '<p class="ev-desc">'+e.d+'</p>'+(long?'<button type="button" class="ev-more" aria-expanded="false">Lire la suite</button>':'')+
    '<div class="ev-tags">'+(e.m?'<span class="tg major">Majeur</span>':'')+'<span class="tg">'+TAGS[e.g]+'</span></div>'+
    '<div class="ev-foot"><span class="ev-src">Source : Star Citizen Wiki</span><button type="button" class="ev-copy" data-id="'+e.id+'" aria-label="Copier le lien vers « '+esc(e.t)+' »"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>Copier le lien</button></div></div></article>';
}
ERAS.forEach(function(era,i){
  total+=era.e.length;
  era.e.forEach(function(e,j){e._k=i+'.'+j;e.id=evId(e)});
  html+='<section class="era" id="'+era.id+'" data-i="'+i+'" style="--era:'+era.c+'">'+
   '<header class="era-h"><div class="orb">'+orbit(i)+'</div><div class="era-t">'+
   '<p class="kicker">Saut '+pad(i+1)+' / '+pad(ERAS.length)+'</p><h2>'+era.n+'</h2><p class="range">'+era.r+'</p></div>'+
   '<p class="lede">'+era.b+'</p></header><div class="evs">'+
   era.e.map(function(e){return card(e,era)}).join('')+'</div></section>';
  ecs+='<a class="ec" href="#'+era.id+'" data-i="'+i+'" style="--era:'+era.c+'">'+era.n+'</a>';
});
/* photo introuvable : on la retire (remplace l'ancien onerror en attribut, interdit par la CSP) ; l'événement error ne remonte pas, d'où la phase de capture */
function dropBroken(e){var i=e.target;if(i&&i.tagName==='IMG'&&i.classList.contains('ev-photo'))i.remove()}
['#app','#appFlat'].forEach(function(q){$(q).addEventListener('error',dropBroken,true)});
$('#app').innerHTML=html;$('#ecs').innerHTML=ecs;
window.__orb={eras:ERAS.length,events:total};
function haystack(root){[].forEach.call(root.querySelectorAll('.ev'),function(c){c.dataset.s=norm(c.textContent)})}
haystack(document);

/* ordre d'affichage : par époque, ou tous les événements du plus récent au plus ancien */
var flatBuilt=false;
function buildFlat(){
  if(flatBuilt)return;flatBuilt=true;
  var all=[];ERAS.forEach(function(era){era.e.forEach(function(e){all.push([e,era])})});
  all.sort(function(a,b){return ynum(b[0].y)-ynum(a[0].y)});
  var f=$('#appFlat');f.innerHTML=all.map(function(a){return card(a[0],a[1],true)}).join('');
  haystack(f);
  if(window.__orbDecorate)window.__orbDecorate(f);
}
function setSort(mode){
  var flat=mode==='recent';
  if(flat)buildFlat();
  $('#app').hidden=flat;$('#appFlat').hidden=!flat;
  [].forEach.call(document.querySelectorAll('#tlSort button'),function(b){b.setAttribute('aria-pressed',String(b.dataset.sort===mode))});
  apply();
}
window.__orbSort=setSort;
$('#tlSort').addEventListener('click',function(e){var b=e.target.closest('button');if(b)setSort(b.dataset.sort)});

/* filtres : thème et recherche */
var active={},q='',chips='';
Object.keys(TAGS).forEach(function(k){chips+='<button type="button" class="chip" data-g="'+k+'" aria-pressed="false" style="--tc:var(--c-'+k+')"><i></i>'+TAGS[k]+'</button>'});
chips+='<button type="button" class="chip reset" id="reset" style="--tc:var(--ink-2)">Tout afficher</button>';
$('#chips').innerHTML=chips;
var eras=[].slice.call(document.querySelectorAll('.era'));
function evsAll(){return [].slice.call(document.querySelectorAll('#v-time .ev'))}
function apply(){
  var any=Object.keys(active).length>0,shown=0,flat=!$('#appFlat').hidden,qq=norm(q.trim());
  evsAll().forEach(function(e){
    var h=(any&&!active[e.dataset.g])||(qq&&e.dataset.s.indexOf(qq)<0);
    e.hidden=!!h;
    if(!h&&(!!e.closest('#appFlat'))===flat)shown++;
  });
  eras.forEach(function(s){s.hidden=!s.querySelector('.ev:not([hidden])')});
  var em=$('#tlEmpty'),hasQ=q.trim()!=='';
  em.hidden=shown>0;
  if(!em.hidden){
    $('#tlEmptyT').textContent=hasQ?'Aucun événement ne correspond à « '+q.trim()+' ».':'Aucun événement ne correspond à ces filtres.';
    $('#tlEmptyB').textContent=hasQ?'Effacer la recherche':'Tout afficher';
  }
  $('#count').textContent=shown+' événement'+(shown>1?'s':'')+' affiché'+(shown>1?'s':'')+' sur '+total;
  onScroll();
}
$('#chips').addEventListener('click',function(ev){
  var b=ev.target.closest('button');if(!b)return;
  if(b.id==='reset'){active={};q='';$('#tlQ').value='';[].forEach.call(document.querySelectorAll('.chip[data-g]'),function(c){c.setAttribute('aria-pressed','false')})}
  else{var g=b.dataset.g;if(active[g]){delete active[g];b.setAttribute('aria-pressed','false')}else{active[g]=1;b.setAttribute('aria-pressed','true')}}
  apply();
});
$('#tlQ').addEventListener('input',function(){q=this.value;apply()});
$('#tlEmptyB').addEventListener('click',function(){
  if(q.trim()!==''){q='';$('#tlQ').value=''}else{active={};[].forEach.call(document.querySelectorAll('.chip[data-g]'),function(c){c.setAttribute('aria-pressed','false')})}
  apply();$('#tlQ').focus();
});

/* « Lire la suite » */
document.addEventListener('click',function(e){
  var b=e.target.closest('.ev-more');if(!b)return;
  var c=b.closest('.ev'),open=c.classList.toggle('open');
  b.setAttribute('aria-expanded',String(open));b.textContent=open?'Réduire':'Lire la suite';
});
/* un clic sur une époque de la barre ramène à l'affichage par époque */
$('#ecs').addEventListener('click',function(e){
  var a=e.target.closest('a');if(!a)return;
  e.preventDefault();
  if(!$('#appFlat').hidden)setSort('era');
  var t=document.getElementById(a.getAttribute('href').slice(1));if(t)t.scrollIntoView();
});

/* suivi du défilement */
var nowy=$('#nowy'),nowy0='−300 000',prog=$('#prog'),ecEls=[].slice.call(document.querySelectorAll('.ec')),ecBox=$('#ecs'),lastEra=-1,tick=false;
function onScroll(){
  tick=false;
  if($('#v-time').hidden)return;
  var line=innerHeight*.4,cur=null,list=evsAll();
  for(var k=0;k<list.length;k++){
    var e=list[k];if(e.hidden||e.offsetParent===null)continue;
    if(e.getBoundingClientRect().top<=line)cur=e;else break;
  }
  if(!cur)nowy.textContent=nowy0;
  if(cur){nowy.textContent=cur.dataset.y;
    var er=cur.closest('.era'),idx=er?+er.dataset.i:-1;
    if(idx!==lastEra){lastEra=idx;ecEls.forEach(function(c){c.classList.toggle('on',+c.dataset.i===idx)});
      var c=ecEls[idx];if(c&&ecBox.scrollWidth>ecBox.clientWidth){ecBox.scrollTo({left:c.offsetLeft-ecBox.clientWidth/2+c.offsetWidth/2})}}
  }
  var max=document.documentElement.scrollHeight-innerHeight;
  prog.style.transform='scaleX('+(max>0?Math.min(1,Math.max(0,scrollY/max)):0)+')';
}
addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(onScroll)}},{passive:true});
addEventListener('resize',onScroll);

/* ouvre un événement : affichage par époque, filtres levés, défilement, mise en évidence */
window.__orbOpenEv=function(id){
  var el=document.getElementById('ev-'+id);
  if(!el)return false;
  if(!$('#appFlat').hidden)setSort('era');
  if(el.hidden){q='';$('#tlQ').value='';active={};[].forEach.call(document.querySelectorAll('.chip[data-g]'),function(c){c.setAttribute('aria-pressed','false')});apply()}
  function center(){try{el.scrollIntoView({block:'center',behavior:'instant'})}catch(x){el.scrollIntoView({block:'center'})}}
  center();
  el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');
  try{el.focus({preventScroll:true})}catch(x){}
  setTimeout(center,350); /* images et polices peuvent décaler la mise en page */
  return true;
};

apply();
})();

/* lien partageable #chronologie/<id>, copie du lien et message « Lien copié » */
(function(){
var toastT=0;
function toast(m){
  var t=document.getElementById('orbToast');if(!t)return;
  clearTimeout(toastT);t.textContent='';t.classList.remove('on');
  setTimeout(function(){t.textContent=m;t.classList.add('on');toastT=setTimeout(function(){t.classList.remove('on');t.textContent=''},2600)},30);
}
/* copie : API du presse-papiers si le contexte est sûr, sinon sélection de texte + execCommand (HTTP sur le NAS) */
function copy(text){
  var prev=document.activeElement;
  function fallback(){
    var ta=document.createElement('textarea'),ok=false;
    ta.value=text;ta.setAttribute('readonly','');ta.setAttribute('aria-hidden','true');
    ta.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(ta);ta.focus({preventScroll:true});ta.select();ta.setSelectionRange(0,text.length);
    try{ok=document.execCommand('copy')}catch(e){}
    ta.remove();if(prev&&prev.focus)prev.focus({preventScroll:true});
    toast(ok?'Lien copié':'Copie impossible. Lien : '+text);
  }
  if(navigator.clipboard&&navigator.clipboard.writeText&&window.isSecureContext)navigator.clipboard.writeText(text).then(function(){toast('Lien copié')},fallback);
  else fallback();
}
window.__orbToast=toast;window.__orbCopy=copy;
window.__orbEvLink=function(id){return location.href.split('#')[0]+'#chronologie/'+id};
document.addEventListener('click',function(e){
  var b=e.target.closest('.ev-copy');if(b)copy(window.__orbEvLink(b.dataset.id));
});

})();
