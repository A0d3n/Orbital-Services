/* Visuels de la chronologie : une illustration SVG par événement.
   Chaque événement a un motif choisi d'après son contenu (voir MAP) ; les couleurs suivent son thème. */
(function(){
var W=378,H=134;
function rnd(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
/* palettes : [ciel haut, ciel bas, clair, moyen, sombre] */
var PAL={hum:['#0b1119','#1a2b44','#a6c4ef','#355b9a','#0b1426'],xian:['#0b1412','#173a34','#9fe0cf','#2a8570','#0a221c'],
  banu:['#14130a','#3a3418','#ecdc92','#8a7420','#221d08'],tev:['#1a110a','#3b2412','#e8b48a','#8a4a26','#221208'],
  van:['#1a0d0c','#3b1a16','#e89a8c','#8a2f26','#230b09'],tech:['#120d1a','#2a1f45','#cdbff5','#5b46a5','#150f2b'],
  corp:['#121310','#2e3022','#c9cbb0','#6f7255','#16170f'],myst:['#150d18','#33183a','#e8b0ee','#7a3a8a','#1d0f24']};
var uid=0;
function f(n){return (+n).toFixed(1)}
function X(c,r,id){return {c:c,r:r,id:id,D:[],n:0}}
function stars(x,n,ymax){var s='<g fill="#eef2ee" opacity=".75">';for(var i=0;i<n;i++)s+='<circle cx="'+f(x.r()*W)+'" cy="'+f(x.r()*(ymax||H))+'" r="'+f(.7+x.r()*.7)+'"/>';return s+'</g>'}
function grad(x,cx,cy,R,stops,fx,fy){var id=x.id+'r'+(++x.n);x.D.push('<radialGradient id="'+id+'" cx="'+(fx||.38)+'" cy="'+(fy||.3)+'" r=".8">'+stops.map(function(s,i){return '<stop offset="'+s[0]+'" stop-color="'+s[1]+'"'+(s[2]!==undefined?' stop-opacity="'+s[2]+'"':'')+'/>'}).join('')+'</radialGradient>');return 'url(#'+id+')'}
function planet(x,cx,cy,R,c,rim){c=c||x.c;var g=grad(x,cx,cy,R,[[0,c[2]],[.6,c[3]],[1,c[4]]]);return '<circle cx="'+f(cx)+'" cy="'+f(cy)+'" r="'+f(R)+'" fill="'+g+'"/><circle cx="'+f(cx)+'" cy="'+f(cy)+'" r="'+f(R)+'" fill="none" stroke="'+(rim||c[2])+'" stroke-opacity=".5" stroke-width="1.5"/>'}
function glow(x,cx,cy,R,col,op){var g=grad(x,cx,cy,R,[[0,col,op||.7],[1,col,0]],.5,.5);return '<circle cx="'+f(cx)+'" cy="'+f(cy)+'" r="'+f(R)+'" fill="'+g+'"/>'}
function ln(x1,y1,x2,y2,col,w,op,dash){return '<line x1="'+f(x1)+'" y1="'+f(y1)+'" x2="'+f(x2)+'" y2="'+f(y2)+'" stroke="'+col+'" stroke-width="'+(w||1)+'" stroke-opacity="'+(op||1)+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+' stroke-linecap="round"/>'}
function poly(pts,fill,op){return '<polygon points="'+pts.map(function(p){return f(p[0])+','+f(p[1])}).join(' ')+'" fill="'+fill+'"'+(op?' fill-opacity="'+op+'"':'')+'/>'}
function wedge(cx,cy,s,col,dir){var d=dir||1;return poly([[cx-10*s*d,cy],[cx+8*s*d,cy-3.5*s],[cx+14*s*d,cy],[cx+8*s*d,cy+3.5*s]],col)}
function vship(cx,cy,s,col){return poly([[cx-12*s,cy-2*s],[cx+4*s,cy-6*s],[cx+16*s,cy],[cx+4*s,cy+6*s],[cx-12*s,cy+2*s],[cx-4*s,cy]],col)}
function burst(cx,cy,R,col,n,x){var s='';for(var i=0;i<n;i++){var a=i/n*6.283+x.r()*.4,l=R*(.55+x.r()*.6);s+=ln(cx+Math.cos(a)*R*.25,cy+Math.sin(a)*R*.25,cx+Math.cos(a)*l,cy+Math.sin(a)*l,col,1.4,.85)}return glow(x,cx,cy,R*1.1,col,.6)+s+'<circle cx="'+f(cx)+'" cy="'+f(cy)+'" r="'+f(R*.22)+'" fill="#fff" fill-opacity=".9"/>'}

var M={
rift:function(x,p){var c=x.c,cx=190,cy=70,R=40,s='';
  s+=glow(x,cx,cy,R*2,c[2],.35)+stars(x,10,60);
  var l=grad(x,cx,cy,R,[[0,c[2]],[.6,c[3]],[1,c[4]]]);
  s+='<path d="M'+cx+','+(cy-R)+'A'+R+','+R+' 0 0 0 '+cx+','+(cy+R)+'L'+cx+','+(cy-R)+'Z" transform="translate(-9,-2) rotate(-5 '+cx+' '+cy+')" fill="'+l+'"/>';
  s+='<path d="M'+cx+','+(cy-R)+'A'+R+','+R+' 0 0 1 '+cx+','+(cy+R)+'L'+cx+','+(cy-R)+'Z" transform="translate(9,2) rotate(5 '+cx+' '+cy+')" fill="'+l+'"/>';
  s+='<rect x="'+(cx-3)+'" y="'+(cy-R)+'" width="6" height="'+(2*R)+'" fill="#fff" fill-opacity=".85" transform="rotate(4 '+cx+' '+cy+')"/>'+glow(x,cx,cy,34,'#fff',.5);
  for(var i=0;i<14;i++){var a=x.r()*6.283,d=R+8+x.r()*38;s+='<circle cx="'+f(cx+Math.cos(a)*d)+'" cy="'+f(cy+Math.sin(a)*d*.7)+'" r="'+f(.8+x.r()*2.2)+'" fill="'+c[2]+'" fill-opacity=".8"/>'}
  if(p&&p.sat){for(var k=0;k<7;k++){var a2=k/7*6.283,sx=cx+Math.cos(a2)*78,sy=cy+Math.sin(a2)*40;s+=poly([[sx-3,sy-2],[sx+3,sy-2],[sx+3,sy+2],[sx-3,sy+2]],'#fff')+(k%2?burst(sx,sy,10,'#ffb36b',6,x):'')}}
  return s},
liftoff:function(x){var c=x.c,s=stars(x,18,90);
  s+=glow(x,200,170,150,c[2],.3)+planet(x,200,230,150,c)+'<ellipse cx="200" cy="82" rx="150" ry="10" fill="'+c[2]+'" fill-opacity=".18"/>';
  s+='<path d="M120 84C150 70 190 40 262 14" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-dasharray="3 5"/>';
  s+=poly([[258,8],[270,18],[262,28],[252,18]],'#eef2ee')+glow(x,254,24,14,'#ffb36b',.9);return s},
sunrise:function(x,p){var c=x.c,cx=190,hy=100,s=stars(x,12,50);
  s+=glow(x,cx,hy,90,c[2],.5);
  for(var i=0;i<14;i++){var a=Math.PI+i/13*Math.PI;s+=ln(cx+Math.cos(a)*30,hy+Math.sin(a)*30,cx+Math.cos(a)*(70+(i%2)*18),hy+Math.sin(a)*(70+(i%2)*18),c[2],1.4,.65)}
  [18,30,44].forEach(function(R,i){s+='<circle cx="'+cx+'" cy="'+hy+'" r="'+R+'" fill="'+(i?'none':c[2])+'" stroke="'+c[2]+'" stroke-opacity="'+(.8-i*.2)+'" stroke-width="1.4"/>'});
  if(p&&p.emblem==='crown')s+=poly([[158,22],[166,8],[176,18],[190,4],[204,18],[214,8],[222,22]],'#ffe9a8');
  if(p&&p.emblem==='spiral'){var d='M190 40';for(var q=0;q<40;q++){var t=q*.45;d+=' L'+f(190+Math.cos(t)*(2+q*.9))+' '+f(40+Math.sin(t)*(2+q*.5))}s+='<path d="'+d+'" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.2"/>'}
  s+='<rect x="0" y="'+hy+'" width="'+W+'" height="'+(H-hy)+'" fill="'+c[4]+'"/>';
  for(var k=0;k<9;k++){var bx=20+k*40+x.r()*10,bh=8+x.r()*18;s+='<rect x="'+f(bx)+'" y="'+f(hy-bh+6)+'" width="'+f(10+x.r()*8)+'" height="'+f(bh)+'" fill="'+c[4]+'"/>'}
  return s},
contact:function(x,p){var c=x.c,a=PAL[p&&p.acc]||PAL.van,s=stars(x,16,H),lx=72,ly=82,rx=306,ry=62;
  s+=glow(x,lx,ly,60,c[2],.3)+glow(x,rx,ry,50,a[2],.3)+planet(x,lx,ly,32,c)+planet(x,rx,ry,22,a);
  s+='<path d="M'+(lx+30)+','+(ly-12)+'Q190 14 '+(rx-20)+','+(ry-16)+'" fill="none" stroke="#fff" stroke-opacity=".6" stroke-dasharray="4 5"/>';
  [10,20,32].forEach(function(R,i){s+='<circle cx="190" cy="40" r="'+R+'" fill="none" stroke="#fff" stroke-opacity="'+(.7-i*.2)+'"/>'});
  s+='<circle cx="190" cy="40" r="3" fill="#fff"/>'+wedge(112,52,.7,c[2],1)+wedge(268,40,.7,a[2],-1);return s},
fleets:function(x,p){var c=x.c,a=PAL[p&&p.acc]||PAL.van,s=stars(x,12,50),mode=p&&p.mode;
  s+=glow(x,190,90,60,'#fff',.25);
  for(var i=0;i<7;i++){var y=34+i*14+(i%2)*3;s+=wedge(40+(i%3)*18,y,.9,c[2],1);
    s+=wedge(338-(i%3)*18,y,.9,(mode==='mutiny'&&i===3)?'#ff6b5a':a[2],-1);
    if(i%2===0)s+=ln(66+(i%3)*18,y,170+x.r()*14,y+(x.r()*6-3),c[2],1,.7)+ln(312-(i%3)*18,y,208-x.r()*14,y+(x.r()*6-3),a[2],1,.7)}
  s+=burst(190,67,14,'#ffd37a',8,x);
  if(mode==='battle'||mode==='war')s+=burst(120,40,9,'#ff9a5a',6,x)+burst(262,92,9,'#ff9a5a',6,x);
  if(mode==='mutiny')s+=ln(134,62,250,24,'#ff6b5a',1.5,.9,'4 4');
  return s+'<rect y="118" width="'+W+'" height="16" fill="'+c[4]+'" fill-opacity=".6"/>'},
skyline:function(x,p){var c=x.c,s=stars(x,14,60)+glow(x,284,36,50,c[2],.4)+'<circle cx="284" cy="36" r="16" fill="'+c[2]+'" fill-opacity=".9"/>';
  s+='<rect y="100" width="'+W+'" height="34" fill="'+c[4]+'"/>';
  for(var i=0;i<16;i++){var bx=i*24+x.r()*8,bw=14+x.r()*10,bh=18+x.r()*46+(i===7?30:0);s+='<rect x="'+f(bx)+'" y="'+f(100-bh)+'" width="'+f(bw)+'" height="'+f(bh)+'" fill="'+c[4]+'" stroke="'+c[3]+'" stroke-opacity=".5"/>';
    for(var j=0;j<Math.floor(bh/9);j++)if(x.r()>.45)s+='<rect x="'+f(bx+3)+'" y="'+f(100-bh+4+j*9)+'" width="3" height="3" fill="#ffe9a8" fill-opacity=".85"/>'}
  if(p&&p.crown)s+=poly([[170,22],[176,10],[182,18],[190,6],[198,18],[204,10],[210,22]],'#ffe9a8');
  return s},
engine:function(x,p){var c=x.c,s=stars(x,12,H)+'<rect x="40" y="48" width="80" height="38" rx="6" fill="'+c[3]+'"/><rect x="40" y="48" width="80" height="12" rx="6" fill="'+c[2]+'" fill-opacity=".5"/>';
  s+=poly([[120,52],[150,40],[150,94],[120,82]],c[4]);
  var g=grad(x,0,0,1,[[0,'#fff'],[.4,c[2]],[1,c[3],0]],.1,.5);
  s+='<path d="M150 42 L340 62 L340 72 L150 92Z" fill="'+g+'" fill-opacity=".9"/>';
  for(var i=0;i<4;i++)s+='<ellipse cx="'+(158+i*14)+'" cy="67" rx="'+(5+i*1.5)+'" ry="'+(22-i*3)+'" fill="none" stroke="#fff" stroke-opacity="'+(.8-i*.18)+'"/>';
  for(var k=0;k<16;k++)s+='<circle cx="'+f(200+x.r()*150)+'" cy="'+f(55+x.r()*28)+'" r="'+f(.8+x.r()*1.4)+'" fill="#fff" fill-opacity=".7"/>';
  if(p&&p.fail)s+=burst(150,67,26,'#ff6b5a',9,x)+ln(60,56,118,80,'#0b0b0b',2.5,.9);
  return s},
terraform:function(x,p){var c=x.c,mode=p&&p.mode,s=stars(x,16,H),cx=190,cy=68,R=46;
  if(mode==='patent'){var s2=stars(x,8,H)+'<g stroke="'+c[2]+'" stroke-opacity=".25">';for(var i=0;i<20;i++)s2+='<line x1="'+(i*20)+'" y1="0" x2="'+(i*20)+'" y2="'+H+'"/>';for(var j=0;j<8;j++)s2+='<line x1="0" y1="'+(j*18)+'" x2="'+W+'" y2="'+(j*18)+'"/>';s2+='</g>';
    s2+='<circle cx="190" cy="68" r="46" fill="none" stroke="'+c[2]+'" stroke-width="1.5"/><ellipse cx="190" cy="68" rx="46" ry="14" fill="none" stroke="'+c[2]+'" stroke-opacity=".7"/><ellipse cx="190" cy="68" rx="14" ry="46" fill="none" stroke="'+c[2]+'" stroke-opacity=".7"/>';
    s2+='<path d="M236 68 L290 68" stroke="'+c[2]+'"/><text x="294" y="72" font-family="Geist Mono,monospace" font-size="9" fill="'+c[2]+'">BREVET</text>';
    s2+='<path d="M180 40c4-12 16-14 22-6-8 0-12 4-14 12z" fill="#7fe08c"/>';return s2}
  var rust=['#e9a07a','#a2492d','#2a0f08'],grn=['#a6ecb0','#2f8a50','#0d2a1a'];
  var l=grad(x,cx,cy,R,[[0,rust[0]],[.6,rust[1]],[1,rust[2]]]),g=grad(x,cx,cy,R,[[0,grn[0]],[.6,grn[1]],[1,grn[2]]]);
  s+=glow(x,cx,cy,R*1.8,mode==='tragedy'?'#ff6b5a':'#7fe08c',.3)+'<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="'+l+'"/>';
  if(mode==='done'){s+='<path d="M190 22A46 46 0 0 1 190 114Q168 90 176 68Q160 46 190 22Z" fill="'+g+'"/>';for(var k=0;k<5;k++)s+='<ellipse cx="'+f(140+x.r()*100)+'" cy="'+f(40+x.r()*60)+'" rx="'+f(10+x.r()*14)+'" ry="3" fill="#fff" fill-opacity=".45"/>'}
  if(mode==='tragedy')s+=burst(206,60,30,'#ff6b5a',10,x)+'<circle cx="206" cy="60" r="44" fill="none" stroke="#ff6b5a" stroke-opacity=".6"/>';
  s+='<circle cx="190" cy="68" r="46" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1.5"/>';return s},
ship:function(x,p){var c=x.c,v=p&&p.v,s=stars(x,14,90)+glow(x,300,150,120,c[2],.3)+planet(x,300,200,110,c);
  for(var i=0;i<6;i++)s+=ln(40+x.r()*60,38+i*9,120+x.r()*30,38+i*9,'#fff',1,.35);
  var cx=190,cy=64,body;
  if(v==='drake')body=poly([[cx-60,cy-14],[cx+40,cy-14],[cx+62,cy],[cx+40,cy+16],[cx-60,cy+16]],c[3])+'<rect x="'+(cx-46)+'" y="'+(cy-8)+'" width="64" height="12" fill="'+c[4]+'"/>'+poly([[cx+30,cy-14],[cx+54,cy-4],[cx+30,cy-4]],c[2]);
  else if(v==='aurora')body=poly([[cx-40,cy+2],[cx-6,cy-12],[cx+50,cy-4],[cx+64,cy+4],[cx+50,cy+10],[cx-6,cy+12]],c[3])+poly([[cx-6,cy-12],[cx+30,cy-6],[cx+14,cy-1],[cx-6,cy-2]],c[2]);
  else body=poly([[cx-64,cy+4],[cx-20,cy-16],[cx+40,cy-10],[cx+70,cy+2],[cx+40,cy+12],[cx-20,cy+16]],c[3])+poly([[cx-20,cy-16],[cx+26,cy-8],[cx+4,cy-2],[cx-20,cy-4]],c[2])+'<rect x="'+(cx-70)+'" y="'+(cy-6)+'" width="10" height="12" fill="'+c[4]+'"/>';
  return s+glow(x,cx-76,cy+2,22,'#ffb36b',.9)+ln(cx-120,cy+2,cx-70,cy+2,'#ffd37a',3,.8)+body},
voyage:function(x){var c=x.c,s=stars(x,24,H)+glow(x,330,50,50,c[2],.3)+planet(x,330,50,18,c)+planet(x,36,92,14,c);
  s+='<path d="M52 88C130 90 220 70 306 52" fill="none" stroke="#fff" stroke-opacity=".6" stroke-dasharray="2 5" stroke-width="1.5"/>';
  for(var i=0;i<9;i++)s+='<circle cx="'+f(60+i*28)+'" cy="'+f(88-i*4+(i%2?2:-2))+'" r="1.6" fill="#fff" fill-opacity="'+(.9-i*.07)+'"/>';
  return s+vship(158,82,1.3,'#eef2ee')+glow(x,150,82,14,'#ffb36b',.8)},
triangle:function(x){var c=x.c,s=stars(x,20,H)+glow(x,190,76,70,c[2],.35),pts=[[190,18],[120,112],[260,112]];
  s+='<polygon points="'+pts.map(function(a){return a.join(',')}).join(' ')+'" fill="none" stroke="'+c[2]+'" stroke-width="1.4" stroke-dasharray="4 4"/>';
  for(var i=0;i<28;i++){var t=i/28*18.8,rr=4+t*2.6;s+='<circle cx="'+f(190+Math.cos(t)*rr)+'" cy="'+f(80+Math.sin(t)*rr*.7)+'" r="1.4" fill="'+c[2]+'" fill-opacity="'+f(.9-i*.03)+'"/>'}
  pts.forEach(function(a,i){s+=wedge(a[0],a[1]-(i?0:-4),.7,'#eef2ee',i%2?1:-1).replace('<polygon','<polygon opacity="'+(1-i*.3)+'"')});
  return s+'<text x="182" y="86" font-family="Geist,sans-serif" font-size="22" font-weight="700" fill="#fff" fill-opacity=".85">?</text>'},
jumpgate:function(x,p){var c=x.c,s=stars(x,16,H);
  s+=glow(x,260,66,70,p&&p.flare?'#ffb36b':c[2],.5);
  if(p&&p.flare){s+='<circle cx="320" cy="30" r="14" fill="#ffd37a"/>'+glow(x,320,30,40,'#ff9a5a',.7);for(var k=0;k<5;k++)s+=ln(320,30,320+Math.cos(k)*40,30+Math.sin(k)*30,'#ff9a5a',2,.7)}
  var g=grad(x,260,66,40,[[0,'#fff'],[.5,c[2]],[1,c[3],0]],.5,.5);
  s+='<ellipse cx="260" cy="66" rx="30" ry="46" fill="'+g+'"/>'+'<ellipse cx="260" cy="66" rx="30" ry="46" fill="none" stroke="'+c[2]+'" stroke-width="5"/><ellipse cx="260" cy="66" rx="36" ry="52" fill="none" stroke="'+c[2]+'" stroke-opacity=".4"/>';
  if(p&&p.sys){for(var q=0;q<p.sys;q++)s+=planet(x,310+q*0,24+q*24,5+x.r()*3,c)}
  s+=ln(60,96,198,76,'#fff',1,.4,'3 4')+vship(110,90,1.2,'#eef2ee');return s},
senate:function(x,p){var c=x.c,s=stars(x,10,40)+glow(x,190,60,100,c[2],.25),mode=p&&p.mode;
  s+='<rect x="40" y="104" width="298" height="8" fill="'+c[3]+'"/><rect x="52" y="96" width="274" height="8" fill="'+c[2]+'" fill-opacity=".8"/>';
  for(var i=0;i<8;i++)s+='<rect x="'+(70+i*34)+'" y="48" width="12" height="48" fill="'+c[2]+'" fill-opacity=".9"/>';
  s+=poly([[48,48],[190,12],[330,48]],c[3]);
  if(mode==='dome')s+='<path d="M150 48A40 40 0 0 1 230 48Z" fill="'+c[2]+'"/>'+ln(190,8,190,0,'#fff',2);
  if(mode==='flags'){for(var k=0;k<3;k++){s+=ln(100+k*90,48,100+k*90,16,'#eef2ee',1.5)+poly([[100+k*90,16],[122+k*90,22],[100+k*90,28]],['#6fa6d6','#eef2ee','#f07468'][k])}}
  if(mode==='podium')s+='<rect x="170" y="70" width="38" height="26" fill="'+c[4]+'" stroke="'+c[2]+'"/>'+poly([[178,70],[190,58],[202,70]],'#ffe9a8');
  return s},
ballot:function(x,p){var c=x.c,s=stars(x,10,H)+glow(x,190,70,90,c[2],.25);
  s+='<rect x="130" y="62" width="118" height="54" rx="6" fill="'+c[3]+'"/><rect x="130" y="62" width="118" height="12" rx="6" fill="'+c[2]+'" fill-opacity=".6"/><rect x="164" y="56" width="50" height="6" fill="'+c[4]+'"/>';
  s+='<g transform="rotate(-8 190 40)"><rect x="160" y="14" width="58" height="44" rx="3" fill="#eef2ee"/><path d="M170 34l8 8 18-18" fill="none" stroke="#2f8a50" stroke-width="4" stroke-linecap="round"/></g>';
  var m=p&&p.mode;
  for(var i=0;i<6;i++){var hh=m==='budget'?(64-i*8):(28+i*6);s+='<rect x="'+(40+i*14)+'" y="'+(116-hh)+'" width="10" height="'+hh+'" fill="'+c[2]+'" fill-opacity="'+f(.4+i*.1)+'"/>'}
  if(m==='crown')s+=poly([[170,6],[176,-4],[183,2],[190,-8],[197,2],[204,-4],[210,6]],'#ffe9a8');
  if(m==='budget')s+='<text x="270" y="44" font-family="Geist Mono,monospace" font-size="20" font-weight="700" fill="'+c[2]+'">−10 %</text>'+ln(256,56,330,56,c[2],1.5,.6,'3 3');
  if(m==='flags'){for(var q=0;q<3;q++)s+=ln(280+q*30,30,280+q*30,76,'#eef2ee',1.5)+poly([[280+q*30,30],[296+q*30,35],[280+q*30,40]],['#6fa6d6','#eef2ee','#f07468'][q])}
  return s},
discover:function(x,p){var c=x.c,s=stars(x,22,H),cx=200,cy=68,mode=p&&p.mode;
  if(mode==='void'){s+='<circle cx="190" cy="68" r="48" fill="'+c[4]+'" stroke="'+c[2]+'" stroke-dasharray="3 4"/><text x="170" y="82" font-family="Geist,sans-serif" font-size="30" font-weight="700" fill="'+c[2]+'" fill-opacity=".7">0</text>';return s}
  s+=glow(x,cx,cy,60,'#ffe9a8',.5)+'<circle cx="'+cx+'" cy="'+cy+'" r="8" fill="#ffe9a8"/>';
  var k0=.8+x.r()*.4;[26*k0,44*k0,62*k0].forEach(function(R,i){s+='<ellipse cx="'+cx+'" cy="'+cy+'" rx="'+f(R*1.5)+'" ry="'+f(R*.8)+'" fill="none" stroke="'+c[2]+'" stroke-opacity=".35"/>'});
  s+=planet(x,cx+48,cy+6,9,c)+planet(x,cx-72*k0,cy-12,6+x.r()*3,c)+planet(x,cx+96,cy-14,4+x.r()*3,c);
  if(mode==='alien'){for(var al=0;al<7;al++)s+='<circle cx="'+f(cx+40+x.r()*16)+'" cy="'+f(cy+2+x.r()*8)+'" r="1" fill="#ffe9a8"/>'}
  var hx=cx+48,hy=cy+6;s+='<path d="M'+(hx-18)+','+(hy-10)+'v-8h8M'+(hx+10)+','+(hy-18)+'h8v8M'+(hx+18)+','+(hy+10)+'v8h-8M'+(hx-10)+','+(hy+18)+'h-8v-8" fill="none" stroke="#7fe08c" stroke-width="1.5"/>';
  s+=ln(40,110,hx-14,hy+8,'#7fe08c',1,.5,'3 4')+vship(40,110,1,'#eef2ee');return s},
trade:function(x){var c=x.c,s=stars(x,14,70)+glow(x,190,60,70,c[2],.3);
  s+='<rect x="168" y="46" width="44" height="22" rx="4" fill="'+c[3]+'"/><rect x="150" y="54" width="80" height="6" fill="'+c[2]+'" fill-opacity=".7"/><circle cx="190" cy="57" r="9" fill="'+c[4]+'" stroke="'+c[2]+'"/>';
  [[40,28],[330,22],[60,96],[320,100]].forEach(function(a){s+=ln(a[0],a[1],190,57,c[2],1,.45,'3 4')+'<circle cx="'+a[0]+'" cy="'+a[1]+'" r="4" fill="'+c[2]+'"/>'});
  for(var i=0;i<6;i++)s+='<rect x="'+(250+i*14)+'" y="'+(112-(10+i*9))+'" width="9" height="'+(10+i*9)+'" fill="'+c[2]+'" fill-opacity="'+f(.4+i*.1)+'"/>';
  return s+'<circle cx="62" cy="108" r="7" fill="#ffe9a8"/><text x="59" y="112" font-family="Geist,sans-serif" font-size="9" font-weight="700" fill="#5a4a10">$</text>'},
siege:function(x,p){var c=x.c,a=PAL.van,mode=p&&p.mode,s=stars(x,16,70)+glow(x,190,130,120,c[2],.3)+planet(x,190,168,100,c);
  if(mode==='dome'){s+='<path d="M170 70A20 20 0 0 1 210 70Z" fill="'+c[2]+'" fill-opacity=".8"/>'}
  for(var i=0;i<5;i++){var sx=60+i*62+x.r()*10;s+=wedge(sx,24+(i%2)*10,.8,'#eef2ee',1);
    if(mode!=='blockade'||i%2===0)s+=ln(sx+8,28+(i%2)*10,190+(i-2)*14,70,'#ff9a5a',1.4,.8,'2 3')}
  if(mode==='defense'){for(var dd=0;dd<5;dd++)s+=ln(120+dd*34,76,110+dd*40,30,'#7fe08c',1.4,.8,'2 3');s+=burst(150,36,8,'#ffd37a',6,x)+burst(250,28,8,'#ffd37a',6,x)}
  if(mode==='bombard'||mode==='dome'||mode==='blockade')s+=burst(190,72,12,'#ffd37a',8,x);
  if(mode==='blockade'){s+='<ellipse cx="190" cy="40" rx="150" ry="26" fill="none" stroke="'+a[2]+'" stroke-dasharray="4 4"/>'}
  return s},
border:function(x,p){var c=x.c,s=stars(x,24,H)+glow(x,190,67,100,c[2],.2);
  s+='<path d="M20 20L358 114" stroke="'+c[2]+'" stroke-width="2" stroke-dasharray="8 6"/>';
  for(var i=0;i<6;i++){var px=60+i*52,py=28+i*14.4;s+=poly([[px,py-8],[px+7,py+5],[px-7,py+5]],'#ffb36b')+'<text x="'+(px-2.5)+'" y="'+(py+4)+'" font-size="7" font-weight="700" fill="#2a1a08">!</text>'}
  s+=wedge(80,90,.9,c[2],1)+wedge(120,104,.9,c[2],1)+wedge(300,26,.9,PAL.van[2],-1);
  if(p&&p.dark)s+='<rect width="'+W+'" height="'+H+'" fill="#000" fill-opacity=".25"/>';return s},
blast:function(x){var c=x.c,s=stars(x,10,50)+'<rect y="96" width="'+W+'" height="38" fill="'+c[4]+'"/>';
  for(var i=0;i<14;i++){var bx=i*28,bh=16+x.r()*40;s+='<rect x="'+bx+'" y="'+(96-bh)+'" width="20" height="'+bh+'" fill="'+c[4]+'" stroke="'+c[3]+'" stroke-opacity=".5"/>'}
  return s+burst(90,70,26,'#ff6b5a',10,x)+burst(250,84,20,'#ff9a5a',9,x)+burst(180,52,14,'#ffd37a',7,x)},
kingship:function(x){var c=x.c,s=stars(x,18,90)+glow(x,300,160,130,c[2],.25)+planet(x,300,200,110,c);
  s+=poly([[20,60],[120,44],[260,50],[340,66],[260,74],[120,80],[40,72]],'#2a0e0c')+poly([[120,44],[250,52],[200,60],[120,56]],'#7a1f18')+ln(40,66,330,66,'#ff6b5a',1.5,.9);
  s+=glow(x,36,66,26,'#ff6b5a',.9);for(var i=0;i<4;i++)s+=vship(40+i*60,100+(i%2)*8,.7,'#c46a5f');
  return s},
fall:function(x){var c=x.c,s=stars(x,12,50)+glow(x,190,120,150,'#ff6b5a',.45)+planet(x,190,168,100,c);
  s+='<ellipse cx="190" cy="76" rx="96" ry="12" fill="#ff6b5a" fill-opacity=".5"/>'+burst(190,74,24,'#ffd37a',12,x);
  for(var i=0;i<12;i++)s+=ln(60+x.r()*260,10+x.r()*40,70+x.r()*260,50+x.r()*30,'#ffb36b',1.4,.7);
  for(var k=0;k<6;k++)s+='<ellipse cx="'+f(120+x.r()*140)+'" cy="'+f(30+x.r()*40)+'" rx="'+f(14+x.r()*18)+'" ry="5" fill="#2a1512" fill-opacity=".6"/>';
  return s},
raid:function(x,p){var c=x.c,n=(p&&p.n)||5,s=stars(x,14,60)+glow(x,190,134,120,c[2],.3)+'<rect y="104" width="'+W+'" height="30" fill="'+c[4]+'"/>';
  for(var i=0;i<18;i++)s+='<rect x="'+f(20+i*20+x.r()*6)+'" y="'+f(112+x.r()*10)+'" width="4" height="4" fill="#ffe9a8" fill-opacity=".85"/>';
  if(p&&p.mode==='carrier'){s+=poly([[20,92],[80,84],[150,86],[170,94],[80,100]],'#8aa4c8')+burst(150,90,10,'#ffd37a',6,x)}
  for(var k=0;k<n;k++){var sx=50+k*(280/n)+x.r()*20,sy=22+x.r()*52,sc=.9+x.r()*.5;s+=vship(sx,sy,sc,'#ff6b5a')+ln(sx+14*sc,sy,sx+14*sc+20,sy+26+x.r()*10,'#ff9a5a',1.5,.8,'2 3')+glow(x,sx+14*sc+20,sy+28,7,'#ffd37a',.8)}
  return s},
monument:function(x){var c=x.c,s=stars(x,12,70)+glow(x,190,60,90,c[2],.45);
  s+='<circle cx="190" cy="48" r="34" fill="none" stroke="'+c[2]+'" stroke-opacity=".6"/><rect x="156" y="104" width="68" height="10" fill="'+c[3]+'"/><rect x="170" y="86" width="40" height="18" fill="'+c[3]+'"/>';
  s+='<path d="M190 30a7 7 0 1 1 0 .1zM178 86l4-34c0-6 16-6 16 0l4 34z" fill="'+c[4]+'" stroke="'+c[2]+'" stroke-opacity=".6"/><path d="M200 56l22-16" stroke="'+c[2]+'" stroke-width="3" stroke-linecap="round"/>';
  for(var i=0;i<8;i++)s+='<circle cx="'+(60+i*36)+'" cy="124" r="2.2" fill="#ffd37a"/>'+glow(x,60+i*36,124,8,'#ffb36b',.6);return s},
signal:function(x){var c=x.c,s=stars(x,14,H);
  s+='<rect x="236" y="30" width="96" height="62" rx="6" fill="'+c[4]+'" stroke="'+c[2]+'" stroke-width="2"/><polygon points="270,48 270,74 296,61" fill="'+c[2]+'"/>';
  for(var i=0;i<5;i++)s+='<circle cx="296" cy="61" r="'+(18+i*0)+'" fill="none"/>';
  s+='<path d="M60 108L90 80L80 74Z" fill="'+c[3]+'"/><ellipse cx="100" cy="72" rx="22" ry="8" transform="rotate(-35 100 72)" fill="'+c[2]+'"/>';
  [18,34,52,72].forEach(function(R,i){s+='<path d="M'+(100+R*.8)+','+(72-R*.8)+'A'+R+','+R+' 0 0 1 '+(100+R*.8)+','+(72+R*.8)+'" fill="none" stroke="'+c[2]+'" stroke-width="2" stroke-opacity="'+f(.9-i*.2)+'"/>'});
  return s+'<text x="300" y="112" font-family="Geist Mono,monospace" font-size="9" fill="'+c[2]+'">LIVE</text>'},
treaty:function(x,p){var c=x.c,a=PAL[p&&p.acc]||PAL.xian,s=stars(x,14,H);
  s+=glow(x,60,70,50,c[2],.3)+glow(x,318,70,50,a[2],.3)+planet(x,56,70,28,c)+planet(x,322,70,28,a);
  s+='<rect x="146" y="26" width="86" height="82" rx="4" fill="#eef2ee"/>';for(var i=0;i<5;i++)s+=ln(158,42+i*10,220,42+i*10,'#9aa39d',2,.9);
  s+='<circle cx="205" cy="98" r="11" fill="#d94f43"/><circle cx="205" cy="98" r="5" fill="none" stroke="#fff"/>';
  if(p&&p.arrows)s+='<path d="M92 40H140M132 34l8 6-8 6M286 100H238M246 94l-8 6 8 6" fill="none" stroke="'+c[2]+'" stroke-width="2"/>';
  else s+='<path d="M86 58Q116 30 146 56M292 58Q262 30 232 56" fill="none" stroke="'+c[2]+'" stroke-dasharray="3 4"/>';
  return s},
uprising:function(x){var c=x.c,s=stars(x,8,40)+glow(x,190,120,160,'#ff6b5a',.35)+'<rect y="104" width="'+W+'" height="30" fill="'+c[4]+'"/>';
  s+=ln(190,20,190,96,'#eef2ee',2)+poly([[190,20],[250,28],[190,40]],'#d94f43');
  for(var i=0;i<26;i++){var px=24+i*13+x.r()*5,ph=10+x.r()*8;s+='<circle cx="'+f(px)+'" cy="'+f(104-ph-5)+'" r="3.2" fill="'+c[4]+'" stroke="'+c[3]+'" stroke-opacity=".7"/><rect x="'+f(px-3)+'" y="'+f(104-ph-2)+'" width="6" height="'+f(ph)+'" rx="2" fill="'+c[4]+'" stroke="'+c[3]+'" stroke-opacity=".7"/>'}
  return s},
ripple:function(x){var c=x.c,s=stars(x,18,70)+glow(x,300,50,50,c[2],.4)+planet(x,300,50,16,c);
  [10,22,36,54,76].forEach(function(R,i){s+='<ellipse cx="190" cy="108" rx="'+R*1.8+'" ry="'+R*.42+'" fill="none" stroke="'+c[2]+'" stroke-opacity="'+f(.9-i*.16)+'"/>'});
  [[150,1],[230,-1]].forEach(function(a){var px=a[0];s+='<circle cx="'+px+'" cy="52" r="7" fill="'+c[4]+'" stroke="'+c[2]+'" stroke-width="1.5"/><path d="M'+(px-9)+',108l3-44h12l3 44z" fill="'+c[4]+'" stroke="'+c[2]+'" stroke-width="1.5"/>'});
  return s+'<circle cx="190" cy="108" r="3" fill="#fff"/>'},
song:function(x){var c=x.c,s=stars(x,16,H);
  var cols=['#7fe08c','#6fa6d6','#f0944a','#a98bdb'];
  cols.forEach(function(col,k){var d='M0 '+(60+k*8);for(var i=0;i<=19;i++){d+=' L'+(i*20)+' '+f(60+k*8+Math.sin(i*.9+k)*(10+k*3))}s+='<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="2" stroke-opacity=".85"/>'});
  for(var j=0;j<26;j++)s+='<circle cx="'+f(x.r()*W)+'" cy="'+f(88+x.r()*34)+'" r="'+f(2+x.r()*5)+'" fill="'+c[3]+'" stroke="'+c[2]+'" stroke-opacity=".6"/>';
  return s},
store:function(x){var c=x.c,s=stars(x,8,40)+'<rect x="104" y="40" width="170" height="74" fill="'+c[4]+'" stroke="'+c[3]+'"/>';
  for(var i=0;i<8;i++)s+='<path d="M'+(104+i*21.25)+' 40h21.25l-3 20h-15.25z" fill="'+(i%2?c[2]:'#eef2ee')+'"/>';
  s+='<rect x="120" y="68" width="74" height="42" fill="'+c[3]+'" fill-opacity=".6" stroke="'+c[2]+'"/><rect x="214" y="68" width="40" height="46" fill="'+c[4]+'" stroke="'+c[2]+'"/><circle cx="246" cy="92" r="2" fill="#ffd37a"/>';
  s+='<rect x="150" y="22" width="78" height="16" rx="3" fill="'+c[3]+'" stroke="'+c[2]+'"/><text x="170" y="34" font-family="Geist Mono,monospace" font-size="11" font-weight="700" fill="'+c[2]+'">CTR</text>';
  return s+'<rect y="114" width="'+W+'" height="20" fill="'+c[4]+'"/>'},
surveillance:function(x){var c=x.c,s=stars(x,10,H)+glow(x,190,64,90,c[2],.35);
  s+='<path d="M80 64Q190 -8 300 64Q190 136 80 64Z" fill="'+c[4]+'" stroke="'+c[2]+'" stroke-width="2"/><circle cx="190" cy="64" r="26" fill="'+c[3]+'" stroke="'+c[2]+'" stroke-width="2"/><circle cx="190" cy="64" r="12" fill="#0a0a0a"/><circle cx="184" cy="58" r="4" fill="#fff"/>';
  for(var i=0;i<9;i++)s+=ln(60+i*32,0,60+i*32,H,c[2],1.5,.3);return s},
derelict:function(x){var c=x.c,s=stars(x,26,H)+glow(x,300,40,60,c[2],.2);
  s+=poly([[40,70],[110,56],[250,58],[330,70],[250,84],[110,86]],'#1a1d22')+poly([[110,56],[240,60],[170,66],[110,64]],'#252a31')+'<g stroke="#3a414a" stroke-width="1"><line x1="110" y1="64" x2="250" y2="68"/><line x1="90" y1="78" x2="300" y2="74"/></g>';
  s+='<circle cx="334" cy="70" r="3" fill="#ff6b5a"><animate attributeName="opacity" values="1;.1;1" dur="2s" repeatCount="indefinite"/></circle>';
  for(var i=0;i<12;i++)s+='<rect x="'+(80+i*20)+'" y="'+(66+(i%3)*4)+'" width="3" height="2" fill="#2a2f36"/>';return s},
moon:function(x){var c=x.c,s=stars(x,24,80)+glow(x,190,200,170,'#fff',.25);
  s+='<circle cx="190" cy="214" r="150" fill="'+grad(x,190,214,150,[[0,'#e7e7e2'],[.7,'#9a9a96'],[1,'#3a3a3c']])+'"/>';
  [[130,86,10],[220,92,14],[270,100,8],[160,100,6]].forEach(function(a){s+='<ellipse cx="'+a[0]+'" cy="'+a[1]+'" rx="'+a[2]+'" ry="'+a[2]*.4+'" fill="#6b6b68" fill-opacity=".6"/>'});
  s+=ln(200,86,200,50,'#eef2ee',1.5)+poly([[200,50],[222,56],[200,62]],'#6fa6d6');
  s+='<circle cx="270" cy="36" r="9" fill="#6fa6d6"/><path d="M40 20Q100 4 160 24" fill="none" stroke="#fff" stroke-opacity=".5" stroke-dasharray="3 4"/>'+poly([[158,22],[166,24],[160,30]],'#eef2ee');return s}
};

/* événement (époque.index) → [motif, paramètres] */
var MAP={
'0.0':['rift'],'0.1':['liftoff'],'0.2':['rift',{sat:1}],'0.3':['sunrise',{emblem:'spiral'}],'0.4':['contact',{acc:'van'}],'0.5':['fleets',{acc:'van'}],'0.6':['sunrise',{emblem:'crown'}],'0.7':['contact',{acc:'xian'}],'0.8':['moon'],
'1.0':['skyline'],'1.1':['engine'],'1.2':['terraform',{mode:'patent'}],'1.3':['terraform',{mode:'tragedy'}],'1.4':['ship',{v:'zeus'}],'1.5':['terraform',{mode:'done'}],'1.6':['voyage'],'1.7':['triangle'],'1.8':['jumpgate'],
'2.0':['senate',{mode:'columns'}],'2.1':['discover'],'2.2':['discover',{mode:'void'}],'2.3':['senate',{mode:'flags'}],'2.4':['fleets',{mode:'mutiny',acc:'hum'}],'2.5':['siege',{mode:'dome'}],
'3.0':['contact',{acc:'hum'}],'3.1':['trade'],'3.2':['jumpgate',{flare:1}],'3.3':['senate',{mode:'dome'}],'3.4':['contact',{acc:'hum'}],
'4.0':['discover',{mode:'alien'}],'4.1':['siege',{mode:'bombard'}],'4.2':['border'],'4.3':['siege',{mode:'defense'}],'4.4':['blast'],'4.5':['senate',{mode:'podium'}],'4.6':['fleets',{mode:'war',acc:'tev'}],'4.7':['ship',{v:'aurora'}],
'5.0':['raid',{n:3}],'5.1':['kingship'],'5.2':['siege',{mode:'blockade'}],'5.3':['fall'],'5.4':['border',{dark:1}],'5.5':['monument'],'5.6':['signal'],'5.7':['treaty',{acc:'xian'}],'5.8':['uprising'],'5.9':['ripple'],
'6.0':['ship',{v:'drake'}],'6.1':['discover'],'6.2':['engine',{fail:1}],'6.3':['song'],
'7.0':['jumpgate',{sys:4}],'7.1':['raid',{n:4,mode:'carrier'}],'7.2':['ballot',{mode:'crown'}],'7.3':['skyline',{crown:1}],'7.4':['derelict'],'7.5':['surveillance'],'7.6':['store'],'7.7':['ballot',{mode:'budget'}],'7.8':['fleets',{mode:'battle',acc:'van'}],'7.9':['raid',{n:7}],'7.10':['fleets',{mode:'war',acc:'hum'}],'7.11':['treaty',{acc:'xian',arrows:1}],'7.12':['ballot',{mode:'flags'}]
};
/* repli par thème pour un événement ajouté plus tard */
var FALLBACK={hum:'skyline',xian:'sunrise',banu:'trade',tev:'discover',van:'raid',tech:'engine',corp:'skyline',myst:'triangle'};

var NOMIRROR={terraform:1,triangle:1,discover:1,store:1,signal:1,senate:1,ballot:1,monument:1,song:1,surveillance:1,moon:1,sunrise:1,engine:1,uprising:1,ripple:1,treaty:1};
window.__orbHasVisual=function(key){return !!MAP[key]};
window.__orbVisual=function(key,g,seed,label){
  var m=MAP[key]||[FALLBACK[g]||'skyline'],c=PAL[g]||PAL.hum,id='v'+(++uid),x=X(c,rnd(seed*131+7),id);
  var body=M[m[0]](x,m[1]||{});
  if(seed%2===1&&!NOMIRROR[m[0]])body='<g transform="translate('+W+' 0) scale(-1 1)">'+body+'</g>';
  if(label)body+='<g font-family="Geist Mono,ui-monospace,monospace" font-size="10"><rect x="8" y="114" width="'+(label.length*6+14)+'" height="16" rx="8" fill="#0b0d0c" fill-opacity=".72"/><text x="15" y="125" fill="#e7ebe8" fill-opacity=".9">'+label.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</text></g>';
  return '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs><linearGradient id="'+id+'s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+c[0]+'"/><stop offset="1" stop-color="'+c[1]+'"/></linearGradient>'+x.D.join('')+'</defs><rect width="'+W+'" height="'+H+'" fill="url(#'+id+'s)"/>'+body+'</svg>';
};
window.__orbMotifs=M;
})();
