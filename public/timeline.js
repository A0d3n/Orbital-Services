(function(){
var TAGS={hum:"Humanité",xian:"Xi’an",banu:"Banu",tev:"Tevarin",van:"Vanduul",tech:"Technologie",corp:"Industrie",myst:"Mystères"};


function $(s,r){return (r||document).querySelector(s)}
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

var total=0,html='',route='',ecs='';
ERAS.forEach(function(era,i){
  total+=era.e.length;
  html+='<section class="era" id="'+era.id+'" data-i="'+i+'" style="--era:'+era.c+'">'+
   '<header class="era-h"><div class="orb">'+orbit(i)+'</div><div>'+
   '<p class="kicker">Saut '+pad(i+1)+' / '+pad(ERAS.length)+'</p><h2>'+era.n+'</h2><p class="range">'+era.r+'</p></div>'+
   '<p class="lede">'+era.b+'</p></header><div class="evs">'+
   era.e.map(function(e){
     return '<article class="ev'+(e.m?' major':'')+'" data-g="'+e.g+'" data-y="'+e.y+'" style="--tc:var(--c-'+e.g+')">'+
      '<div class="yr">'+e.y+'</div><div class="rail"><i></i></div>'+
      '<div class="body"><span class="tg">'+TAGS[e.g]+'</span><h3>'+e.t+'</h3><p>'+e.d+'</p></div></article>';
   }).join('')+'</div></section>';
  route+='<li style="--era:'+era.c+'"><a href="#'+era.id+'"><span class="rn"></span><span class="rt">'+era.n+'</span><span class="rr">'+era.r+'</span></a></li>';
  ecs+='<a class="ec" href="#'+era.id+'" data-i="'+i+'" style="--era:'+era.c+'">'+era.n+'</a>';
});
route+='<li class="here"><a href="#today"><span class="rn"></span><span class="rt">Vous êtes ici</span><span class="rr">2956</span></a></li>';
$('#app').innerHTML=html;$('#route').innerHTML=route;$('#ecs').innerHTML=ecs;
window.__orb={eras:ERAS.length,events:total};

/* filtres */
var active={},chips='';
Object.keys(TAGS).forEach(function(k){chips+='<button type="button" class="chip" data-g="'+k+'" aria-pressed="false" style="--tc:var(--c-'+k+')"><i></i>'+TAGS[k]+'</button>'});
chips+='<button type="button" class="chip reset" id="reset" style="--tc:var(--ink-2)">Tout afficher</button>';
$('#chips').innerHTML=chips;
var evs=[].slice.call(document.querySelectorAll('.ev')),eras=[].slice.call(document.querySelectorAll('.era'));
function apply(){
  var any=Object.keys(active).length>0,shown=0;
  evs.forEach(function(e){var h=any&&!active[e.dataset.g];e.hidden=h;if(!h)shown++});
  eras.forEach(function(s){s.hidden=!s.querySelector('.ev:not([hidden])')});
  $('#count').textContent=shown+' événement'+(shown>1?'s':'')+' affiché'+(shown>1?'s':'')+' sur '+total;
  onScroll();
}
$('#chips').addEventListener('click',function(ev){
  var b=ev.target.closest('button');if(!b)return;
  if(b.id==='reset'){active={};[].forEach.call(document.querySelectorAll('.chip[data-g]'),function(c){c.setAttribute('aria-pressed','false')})}
  else{var g=b.dataset.g;if(active[g]){delete active[g];b.setAttribute('aria-pressed','false')}else{active[g]=1;b.setAttribute('aria-pressed','true')}}
  apply();
});

/* suivi du défilement */
var nowy=$('#nowy'),nowy0='−300 000',prog=$('#prog'),ecEls=[].slice.call(document.querySelectorAll('.ec')),ecBox=$('#ecs'),lastEra=-1,tick=false;
function onScroll(){
  tick=false;
  var line=innerHeight*.4,cur=null;
  for(var k=0;k<evs.length;k++){
    var e=evs[k];if(e.hidden||e.closest('.era').hidden)continue;
    if(e.getBoundingClientRect().top<=line)cur=e;else break;
  }
  if(!cur)nowy.textContent=nowy0;
  if(cur){nowy.textContent=cur.dataset.y;
    var idx=+cur.closest('.era').dataset.i;
    if(idx!==lastEra){lastEra=idx;ecEls.forEach(function(c){c.classList.toggle('on',+c.dataset.i===idx)});
      var c=ecEls[idx];if(c&&ecBox.scrollWidth>ecBox.clientWidth){ecBox.scrollTo({left:c.offsetLeft-ecBox.clientWidth/2+c.offsetWidth/2})}}
  }
  var max=document.documentElement.scrollHeight-innerHeight;
  prog.style.transform='scaleX('+(max>0?Math.min(1,Math.max(0,scrollY/max)):0)+')';
}
addEventListener('scroll',function(){if(!tick){tick=true;requestAnimationFrame(onScroll)}},{passive:true});
addEventListener('resize',onScroll);

/* ciel étoilé */
var cv=$('#sky'),cx=cv.getContext('2d'),W=0,H=0,stars=[];
var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
function size(){
  var d=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;
  cv.width=W*d;cv.height=H*d;cx.setTransform(d,0,0,d,0,0);
  var n=Math.round(W*H/9000);stars=[];
  for(var i=0;i<n;i++)stars.push({x:Math.random()*W,y:Math.random()*H,z:Math.random(),p:Math.random()*6.28});
  if(reduce)draw(0);
}
var embers=[];
function mkEmber(init){return{x:Math.random()*W,y:init?Math.random()*H:H+10,r:.8+Math.random()*1.8,v:.12+Math.random()*.3,w:Math.random()*6.28,k:.3+Math.random()*.7}}
function draw(t){
  cx.clearRect(0,0,W,H);var sy=scrollY;
  /* étoiles : dérive lente + scintillement + parallaxe au défilement */
  for(var i=0;i<stars.length;i++){
    var s=stars[i],sp=reduce?0:t*(.0016+s.z*.005);
    var y=((s.y-sp-sy*(.03+s.z*.12))%H+H)%H,x=((s.x+Math.sin(t/9000+s.p)*6*s.z)%W+W)%W;
    var a=.22+.55*s.z*(reduce?1:(.7+.3*Math.sin(t/1100+s.p)));
    cx.fillStyle='rgba(225,238,232,'+(a*.75).toFixed(3)+')';
    var q=1+s.z*1.2;cx.fillRect(x,y,q,q);
  }
  /* braises : petites étincelles ambrées qui montent depuis le bas */
  if(false){
    while(embers.length<Math.round(W/55))embers.push(mkEmber(embers.length<8||Math.random()<.5));
    for(var j=embers.length-1;j>=0;j--){
      var e=embers[j];e.y-=e.v;e.x+=Math.sin(t/1400+e.w)*.25;
      var life=e.y/H;if(e.y<-10){embers[j]=mkEmber(false);continue}
      var al=Math.min(1,(1-life)*3)*Math.min(1,life*2.2+.15)*e.k;
      var g=cx.createRadialGradient(e.x,e.y,0,e.x,e.y,e.r*5);
      g.addColorStop(0,'rgba(255,170,60,'+(al*.9).toFixed(3)+')');g.addColorStop(1,'rgba(255,120,20,0)');
      cx.fillStyle=g;cx.beginPath();cx.arc(e.x,e.y,e.r*5,0,6.283);cx.fill();
      cx.fillStyle='rgba(255,226,150,'+al.toFixed(3)+')';cx.fillRect(e.x-e.r/2,e.y-e.r/2,e.r,e.r);
    }
  }
  if(!reduce)requestAnimationFrame(draw);
}
addEventListener('resize',size);
size();if(!reduce)requestAnimationFrame(draw);

apply();
})();
