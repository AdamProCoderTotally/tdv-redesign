"use strict";
// Tower art. Every tower = iso base plate (changes with tier) + a soldier
// (changes with tower + lane + tier) + a weapon. Authored facing SE (aim to
// the right); the game mirrors it for SW. idle0/idle1 breathe, fire recoils.
const {R,INK,Spr,framesToSprite}=require('./pix');
const W=44,H=62,CX=22,GY=50;   // canvas, centre x, ground y (anchor)
const SHADOW='rgba(18,10,30,.38)';

// ---------- bases ----------
function base(s,kind,accent){
  // soft pixel shadow first (not outlined)
  s.ell(CX,GY+1,15,6,SHADOW);
  if(kind==='dirt'){
    s.slab(CX,GY,13,6,2,(x,y,h)=>((x+y*3)&7)===0?R.grass[4]:(Math.abs(x)>h-3?R.grass[3]:R.dirt[4-((x*7+y*3&5)===0?1:0)]),R.dirt[2],R.dirt[1]);
    // wood pallet planks
    for(let i=-2;i<=2;i++)s.line(CX-8+i*3,GY-3+i*1.5+3,CX+i*3-1+6,GY+i*1.5-3+3,R.wood[3]);
  }else if(kind==='sandbag'){
    s.slab(CX,GY,15,7,3,(x,y)=>((x*3+y*5)&11)===0?R.dirt[3]:R.dirt[4],R.dirt[2],R.dirt[1]);
  }else if(kind==='steel'){
    s.slab(CX,GY,16,8,4,(x,y,h)=>{const edge=Math.abs(x)>=h-2;if(edge)return R.steel[4];return ((x+2*y)&7)===0?R.steel[2]:R.steel[3]},
      (x,k)=>k===1?R.steel[2]:(((x+k)&3)<2?accent[3]:R.ink[0]),(x,k)=>k===1?R.steel[1]:(((x-k)&3)<2?accent[2]:R.ink[0]));
    // rivets + lane light
    s.set(CX-12,GY,R.steel[5]);s.set(CX+11,GY,R.steel[5]);s.set(CX,GY-7,R.steel[5]);
  }
}
function sandbagsBack(s){for(let i=0;i<6;i++){const a=Math.PI+(i+.5)/6*Math.PI;const x=CX+Math.cos(a)*13,y=GY-1+Math.sin(a)*6;s.ball(x,y,3,2,R.sandbag)}}
function sandbagsFront(s){for(let i=0;i<5;i++){const a=(i+.5)/5*Math.PI*.9+.15;const x=CX+Math.cos(a)*13,y=GY+Math.sin(a)*6-1;
  s.ball(x,y,3.4,2.2,R.sandbag);s.set(x-1,y-1,R.sandbag[4])}}

// ---------- soldier ----------
// o: {pants, vest, skin, helm, head:'helmet'|'hood'|'visor'|'power'|'goggles', kneel, wide, fire, bob, weapon}
function soldier(s,o){
  const k=o.kneel?5:0,bob=o.bob||0,rec=o.fire?-1:0;
  const hipY=40+k+bob, tw=o.wide?16:14;
  // ---- legs + boots ----
  if(o.kneel){
    // back leg folded under, front knee up
    s.cyl(CX-6,hipY+1,5,4,o.pants);s.rect(CX-8,GY-2,7,2,R.gun[1]);
    s.cyl(CX+1,hipY+1,5,3,o.pants);s.cyl(CX+3,hipY+3,4,5,o.pants);s.rect(CX+3,GY-1,6,2,R.gun[1]);s.set(CX+8,GY-1,R.gun[2]);
  }else{
    s.cyl(CX-5,hipY+1,4,7-bob,o.pants);s.cyl(CX+1,hipY+1,4,8-bob,o.pants);
    s.rect(CX-6,GY-2,5,2,R.gun[1]);s.rect(CX,GY-1,6,2,R.gun[1]);s.set(CX-6,GY-2,R.gun[2]);s.set(CX,GY-1,R.gun[2]);
    s.rect(CX-5,hipY+4,4,2,o.knee||o.pants[1]);s.rect(CX+1,hipY+4,4,2,o.knee||o.pants[1]);
  }
  // ---- belt + torso ----
  const ty=hipY-10;
  if(o.behind)o.behind(s,ty,tw);
  s.rect(CX-tw/2+1,hipY-1,tw-1,2,R.leather[1]);s.set(CX,hipY-1,R.gold[4]);s.set(CX+1,hipY-1,R.gold[3]);
  s.cyl(CX-tw/2,ty,tw,10,o.vest);
  s.rect(CX-tw/2,ty+8,tw,1,o.vest[1]);
  // vest pouches
  s.rect(CX-tw/2+2,ty+4,3,3,o.vest[1]);s.rect(CX+tw/2-5,ty+4,3,3,o.vest[1]);
  s.set(CX-tw/2+2,ty+4,o.vest[3]);s.set(CX+tw/2-5,ty+4,o.vest[3]);
  if(o.bandolier){for(let i=0;i<7;i++){s.set(CX-tw/2+1+i*2,ty+1+i,R.leather[2]);s.set(CX-tw/2+2+i*2,ty+1+i,i%2?R.gold[3]:R.gold[4])}}
  if(o.chest)o.chest(s,ty,tw);
  // shoulders
  const sh=o.pads||o.vest;
  s.ball(CX-tw/2,ty+1,o.bigPads?4:3,o.bigPads?3:2,sh);s.ball(CX+tw/2,ty+1,o.bigPads?4:3,o.bigPads?3:2,sh);
  // ---- head ----
  const hy=ty-6;
  s.rect(CX-2,ty-2,4,2,o.skin[1]);
  if(o.head!=='power'&&o.head!=='gasmask')s.ball(CX+1,hy+.5,4.5,4,o.skin,.22);
  if(o.head==='helmet'||o.head==='goggles'){
    s.ball(CX,hy-3,6.5,4.5,o.helm,.08);
    for(let x=-7;x<=6;x++)s.set(CX+x,hy+1,o.helm[1]);
    s.set(CX+1,hy+2,INK);s.set(CX+4,hy+2,INK);s.set(CX+1,hy+3,o.skin[4]);s.set(CX+3,hy+4,o.skin[2]);s.rect(CX+2,hy+5,3,1,o.skin[1]);s.set(CX-5,hy+2,o.helm[1]);s.set(CX-5,hy+3,o.helm[1]);
    if(o.head==='goggles'){s.rect(CX-4,hy-1,9,2,R.gun[1]);s.rect(CX-2,hy-1,2,2,R.blue[3]);s.rect(CX+2,hy-1,2,2,R.blue[3]);s.set(CX-2,hy-1,R.blue[5]);s.set(CX+2,hy-1,R.blue[5])}
    // helmet band + scrim
    s.set(CX-3,hy-5,o.helm[4]);s.set(CX-2,hy-6,o.helm[4]);s.set(CX-4,hy-4,o.helm[4]);
  }else if(o.head==='hood'){
    s.ball(CX,hy-1,7,6,o.helm,.05);
    s.rect(CX-1,hy,7,4,R.ink[0]);s.ball(CX+2,hy+2,3,2,o.skin);s.set(CX+1,hy+1,INK);s.set(CX+4,hy+1,INK);
    for(let i=0;i<9;i++){const a=i/9*Math.PI*2;s.set(CX+Math.round(Math.cos(a)*7),hy-1+Math.round(Math.sin(a)*6)-1,i%2?R.grass[4]:R.olive[2])}
  }else if(o.head==='visor'){
    s.ball(CX,hy-1,6.5,5.5,o.helm,.05);
    s.rect(CX-3,hy-1,9,4,R.ink[0]);s.rect(CX-2,hy,7,2,o.visor||R.fire[2]);s.rect(CX-2,hy,2,1,o.visor?o.visorHi:R.fire[4]);
    s.rect(CX-7,hy-2,2,3,o.helm[1]);
  }else if(o.head==='power'){
    s.ball(CX,hy-1,6.5,6,o.helm,.1);
    s.rect(CX-4,hy-1,10,3,R.ink[0]);s.rect(CX-3,hy,9,1,R.blue[4]);s.rect(CX+2,hy,3,1,R.blue[5]);
    s.rect(CX-1,hy-7,3,2,o.helm[2]);s.set(CX,hy-8,R.blue[4]);
    s.rect(CX-2,hy+3,6,2,o.helm[1]);
  }else if(o.head==='gasmask'){
    s.ball(CX,hy-1,6.5,5.5,o.helm,.05);s.rect(CX-3,hy-2,9,3,R.ink[0]);s.rect(CX-2,hy-1,2,1,R.toxic[4]);s.rect(CX+3,hy-1,2,1,R.toxic[4]);
    s.ball(CX+2,hy+3,2.5,2,R.gun);s.set(CX+2,hy+3,R.toxic[3]);
  }
  if(o.crown){for(let i=0;i<4;i++){s.rect(CX-4+i*3,hy-8-(i%2),1,3+(i%2),R.gold[4]);s.set(CX-4+i*3,hy-8-(i%2),R.gold[5])}s.rect(CX-4,hy-6,10,1,R.gold[3])}
  if(o.goggles){s.rect(CX-3,hy-2,9,2,R.gun[1]);s.rect(CX-1,hy-2,2,2,R.gold[4]);s.rect(CX+3,hy-2,2,2,R.gold[4])}
  if(o.gold){for(let x=-6;x<=5;x+=2)s.set(CX+x,hy+1,R.gold[5]);s.set(CX-2,hy-6,R.gold[5]);s.set(CX-1,hy-6,'#ffffff')}
  if(o.antenna){s.line(CX-6,ty+1,CX-9,ty-12,R.gun[2]);s.set(CX-9,ty-13,R.red[4]);s.rect(CX-9,ty,4,6,R.olive[1]);s.set(CX-8,ty+1,R.toxic[4])}
  // ---- weapon + arms ----
  if(o.back)o.back(s,ty,tw,true);
  o.weapon(s,{ty,hipY,rec,tw,arm:o.arm,gold:o.gold,fire:o.fire,bob});
  if(o.gold&&s.meta.tip){const [tx,ty2]=s.meta.tip;for(let i=2;i<14;i+=3)s.set(tx-i,ty2,R.gold[5])}
  return s;
}
// weapons return their muzzle tip in sprite coords via s.meta.tip
function rifle(s,p,long){const y=p.ty+7,r=p.rec;
  // back arm reaching to the grip
  s.cyl(CX-p.tw/2-1,p.ty+2,3,5,p.arm||R.olive);s.ball(CX-4+r,y+1,2,1.5,R.skin);
  s.poly([[CX-9+r,y-1],[CX-3+r,y-1],[CX-3+r,y+2],[CX-8+r,y+3]],R.wood[2]);s.line(CX-9+r,y-1,CX-4+r,y-1,R.wood[3]);
  s.rect(CX-3+r,y-2,9,4,R.gun[2]);s.rect(CX-3+r,y-2,9,1,R.gun[3]);s.rect(CX+1+r,y+2,2,3,R.gun[1]);
  const L=long||10;s.rect(CX+6+r,y-1,L,2,R.gun[2]);s.rect(CX+6+r,y-1,L,1,R.gun[4]);s.rect(CX+6+L+r,y-2,2,3,R.gun[1]);
  s.rect(CX+1+r,y-4,4,2,R.gun[1]);s.set(CX+4+r,y-4,R.red[4]);
  // front arm + hand on the fore-end
  s.cyl(CX+p.tw/2-2,p.ty+2,3,4,p.arm||R.olive);s.ball(CX+8+r,y+1,2,1.5,R.skin);
  s.meta.tip=[CX+8+L+r,y-1];
}
function mg(s,p,hot){const y=p.ty+8,r=p.rec;
  s.cyl(CX-p.tw/2-1,p.ty+2,3,5,p.arm||R.olive);s.ball(CX-4+r,y,2,1.5,R.skin);
  s.poly([[CX-10+r,y-2],[CX-3+r,y-2],[CX-3+r,y+2],[CX-9+r,y+3]],R.gun[1]);
  s.rect(CX-3+r,y-3,11,5,R.gun[2]);s.rect(CX-3+r,y-3,11,1,R.gun[3]);
  // ammo box + belt
  s.rect(CX-2+r,y+2,6,4,R.olive[2]);s.rect(CX-2+r,y+2,6,1,R.olive[4]);for(let i=0;i<4;i++)s.set(CX-1+i+r,y+1,i%2?R.gold[3]:R.gold[4]);
  // perforated barrel shroud
  s.rect(CX+8+r,y-2,10,3,R.gun[1]);for(let i=0;i<5;i++)s.set(CX+9+i*2+r,y-1,R.gun[3]);s.rect(CX+8+r,y-2,10,1,R.gun[3]);
  s.rect(CX+18+r,y-1,4,2,hot?R.fire[3]:R.gun[2]);if(hot)s.set(CX+21+r,y-1,R.fire[5]);
  // bipod
  s.line(CX+16+r,y+1,CX+14+r,y+5,R.gun[2]);s.line(CX+17+r,y+1,CX+19+r,y+5,R.gun[2]);
  s.cyl(CX+p.tw/2-2,p.ty+2,3,4,p.arm||R.olive);s.ball(CX+8+r,y+1,2,1.5,R.skin);
  s.meta.tip=[CX+22+r,y-1];
}
function heavyRifle(s,p){const y=p.ty+7,r=p.rec;
  s.cyl(CX-p.tw/2-2,p.ty+2,4,6,R.steel);s.ball(CX-4+r,y+1,2.5,2,R.steel);
  s.poly([[CX-10+r,y-2],[CX-3+r,y-2],[CX-3+r,y+3],[CX-9+r,y+3]],R.gun[2]);
  s.rect(CX-3+r,y-3,12,6,R.gun[2]);s.rect(CX-3+r,y-3,12,1,R.gun[4]);s.rect(CX,y-1,6,1,R.blue[3]);s.set(CX+5,y-1,R.blue[5]);
  s.rect(CX+9+r,y-2,12,3,R.gun[1]);s.rect(CX+9+r,y-2,12,1,R.gun[3]);for(let i=0;i<3;i++)s.set(CX+11+i*3+r,y,R.blue[4]);
  s.rect(CX+21+r,y-3,3,5,R.gun[1]);s.rect(CX+2+r,y+3,3,3,R.gun[1]);
  s.cyl(CX+p.tw/2-2,p.ty+2,4,5,R.steel);s.ball(CX+9+r,y+1,2.5,2,R.steel);
  s.meta.tip=[CX+24+r,y-1];
}
function launcher(s,p,inc){const y=p.ty+7,r=p.rec;
  s.cyl(CX-p.tw/2-1,p.ty+2,3,5,R.leather);s.ball(CX-4+r,y+2,2,1.5,R.skin);
  s.poly([[CX-9+r,y-1],[CX-3+r,y-1],[CX-3+r,y+3],[CX-8+r,y+3]],R.wood[2]);
  // revolving drum
  s.ball(CX+1+r,y+3,4,3.5,R.gun);s.set(CX+r,y+2,R.gun[4]);s.set(CX+2+r,y+4,R.gun[3]);
  // fat tube
  s.cyl(CX-2+r,y-3,1,5,R.gun);s.rect(CX-1+r,y-3,14,5,R.gun[2]);s.rect(CX-1+r,y-3,14,1,R.gun[4]);s.rect(CX-1+r,y+1,14,1,R.gun[1]);
  for(let i=0;i<3;i++)s.rect(CX+2+i*4+r,y-3,1,5,R.gun[1]);
  s.rect(CX+13+r,y-4,3,7,inc?R.fire[1]:R.gun[1]);s.rect(CX+14+r,y-3,1,5,inc?R.fire[3]:R.gun[0]);
  s.rect(CX+3+r,y-6,4,3,R.gun[1]);s.set(CX+5+r,y-6,inc?R.fire[4]:R.toxic[4]);
  s.cyl(CX+p.tw/2-2,p.ty+2,3,4,R.leather);s.ball(CX+9+r,y+2,2,1.5,R.skin);
  s.meta.tip=[CX+16+r,y-1];
}
function sniperRifle(s,p,fut){const y=p.ty+6,r=p.rec;
  s.cyl(CX-p.tw/2-1,p.ty+2,3,5,p.arm||R.olive);s.ball(CX-4+r,y+1,2,1.5,R.skin);
  s.poly([[CX-10+r,y-1],[CX-3+r,y-1],[CX-3+r,y+2],[CX-9+r,y+3]],fut?R.steel[2]:R.wood[2]);s.line(CX-10+r,y-1,CX-4+r,y-1,fut?R.steel[4]:R.wood[3]);
  s.rect(CX-3+r,y-2,10,3,R.gun[2]);s.rect(CX-3+r,y-2,10,1,R.gun[3]);
  // scope
  s.rect(CX-1+r,y-5,9,2,R.gun[1]);s.rect(CX-1+r,y-5,9,1,R.gun[3]);s.rect(CX-2+r,y-6,2,4,R.gun[1]);s.rect(CX+7+r,y-6,2,4,R.gun[1]);s.set(CX+8+r,y-5,fut?R.red[4]:R.blue[4]);
  const L=16;s.rect(CX+7+r,y-1,L,2,fut?R.gun[1]:R.gun[2]);s.rect(CX+7+r,y-1,L,1,R.gun[4]);
  if(fut){for(let i=0;i<4;i++)s.set(CX+9+i*4+r,y,R.red[4]);s.rect(CX+7+L+r,y-2,3,4,R.steel[3]);s.set(CX+9+L+r,y-1,R.red[5])}
  else s.rect(CX+7+L+r,y-2,2,3,R.gun[1]);
  s.line(CX+14+r,y+1,CX+12+r,y+6,R.gun[2]);s.line(CX+15+r,y+1,CX+17+r,y+6,R.gun[2]);
  s.cyl(CX+p.tw/2-2,p.ty+2,3,4,p.arm||R.olive);s.ball(CX+8+r,y+1,2,1.5,R.skin);
  s.meta.tip=[CX+9+L+r+(fut?1:0),y-1];
}

function phaserGun(s,p,lv){const y=p.ty+7,r=p.rec,G=lv>=5?R.gold:R.teal,glow=lv>=5?R.gold[5]:R.blue[5];
  s.cyl(CX-p.tw/2-1,p.ty+2,3,5,p.arm||R.zcloth);s.ball(CX-4+r,y+1,2,1.5,R.gun);
  // boxy emitter body + battery cells
  s.rect(CX-6+r,y-3,13,6,R.gun[2]);s.rect(CX-6+r,y-3,13,1,R.gun[4]);s.rect(CX-6+r,y+2,13,1,R.gun[1]);
  for(let i=0;i<(lv>=1?3:2);i++)s.rect(CX-4+i*3+r,y-1,2,2,G[4]);
  // barrel with coil rings
  s.rect(CX+7+r,y-2,10,4,R.steel[2]);s.rect(CX+7+r,y-2,10,1,R.steel[4]);
  if(lv>=3)for(let i=0;i<3;i++){s.rect(CX+8+i*3+r,y-3,1,6,G[3]);s.set(CX+8+i*3+r,y-3,G[5])}
  // crystal lens
  s.rect(CX+17+r,y-3,3,6,R.gun[1]);s.rect(CX+18+r,y-2,2,4,G[4]);s.set(CX+19+r,y-2,glow);
  if(lv>=5){s.set(CX+20+r,y-3,R.gold[5]);s.set(CX+20+r,y+2,R.gold[5]);s.set(CX+21+r,y-1,'#ffffff')}
  s.cyl(CX+p.tw/2-2,p.ty+2,3,4,p.arm||R.zcloth);s.ball(CX+8+r,y+1,2,1.5,R.gun);
  s.meta.tip=[CX+21+r,y-1]}
function venomRifle(s,p,o){const y=p.ty+7+(o.dy||0),r=p.rec,ox=o.ox||0;
  if(!o.noArms){s.cyl(CX-p.tw/2-1,p.ty+2,3,5,p.arm||R.olive);s.ball(CX-4+r,y+1,2,1.5,R.gun)}
  s.poly([[CX-9+r+ox,y-1],[CX-3+r+ox,y-1],[CX-3+r+ox,y+2],[CX-8+r+ox,y+3]],R.gun[1]);
  s.rect(CX-3+r+ox,y-2,10,4,R.gun[2]);s.rect(CX-3+r+ox,y-2,10,1,R.gun[3]);
  // venom canister under the action
  s.rect(CX-1+r+ox,y+2,5,3,R.toxic[2]);s.rect(CX-1+r+ox,y+2,5,1,R.toxic[4]);if(o.glow)s.set(CX+r+ox,y+3,R.toxic[5]);
  const L=o.long||9;
  if(o.spread){for(const d of [-2,0,2]){s.rect(CX+7+r+ox,y-1+d,L,1,R.gun[3])}s.rect(CX+7+L+r+ox,y-3,2,7,R.gun[1])}
  else{s.rect(CX+7+r+ox,y-1,L,2,R.gun[2]);s.rect(CX+7+r+ox,y-1,L,1,R.toxic[3]);s.rect(CX+7+L+r+ox,y-2,2,3,R.gun[1])}
  if(o.drum){s.ball(CX+2+r+ox,y-4,3,2.5,R.toxic,.05);s.set(CX+1+r+ox,y-5,R.toxic[5])}
  if(o.scope){s.rect(CX+r+ox,y-5,7,2,R.gun[1]);s.set(CX+6+r+ox,y-5,R.toxic[4])}
  if(!o.noArms){s.cyl(CX+p.tw/2-2,p.ty+2,3,4,p.arm||R.olive);s.ball(CX+8+r,y+1,2,1.5,R.gun)}
  return [CX+9+L+r+ox,y-1]}
function voidSword(s,p,lv){const r=p.rec,y=p.ty+6,V=R.void,big=lv>=5,L=10+lv*2+(big?4:0);
  s.cyl(CX-p.tw/2-1,p.ty+2,3,5,p.arm||R.void);
  if(p.fire){// swing frame: blade sweeps forward-down + slash arc
    s.line(CX+6,y+2,CX+6+L,y+6,V[2],big?3:2);s.line(CX+6,y+1,CX+6+L,y+5,V[5]);
    for(let i=0;i<L+6;i++){const a=-1.2+i/(L+6)*1.6;s.set(CX+6+Math.cos(a)*(L+3),y+3+Math.sin(a)*(L+3),'rgba(220,180,255,.7)')}
    s.rect(CX+3,y,3,4,R.gold[3]);s.ball(CX+5,y+2,2,1.5,R.gun);s.meta.tip=[CX+6+L,y+5];return}
  // idle: blade held up and forward
  s.line(CX+6,y,CX+9+L*.45,y-L*.85,V[2],big?3:2);s.line(CX+7,y,CX+10+L*.45,y-L*.85,V[5]);
  if(lv>=2)s.line(CX+7,y-2,CX+9+L*.4,y-L*.75,R.void[4]);
  s.rect(CX+3,y,6,2,lv>=4?R.gold[4]:R.gold[3]);s.ball(CX+6,y+2,2,1.5,R.gun);
  s.meta.tip=[CX+9+Math.round(L*.45),y-Math.round(L*.85)]}
function antiTankRifle(s,p,lv){const y=p.ty+6,r=p.rec,EMB=lv>=5;
  s.cyl(CX-p.tw/2-1,p.ty+2,3,5,p.arm||R.olive);s.ball(CX-4+r,y+1,2,1.5,R.skin);
  s.poly([[CX-11+r,y-1],[CX-3+r,y-1],[CX-3+r,y+3],[CX-10+r,y+3]],R.gun[1]);
  s.rect(CX-3+r,y-3,12,5,R.gun[2]);s.rect(CX-3+r,y-3,12,1,R.gun[3]);
  // scope: pro scope is longer with lens caps
  const sl=lv>=2?11:8;s.rect(CX-2+r,y-6,sl,2,R.gun[1]);s.rect(CX-2+r,y-6,sl,1,R.gun[3]);s.rect(CX-3+r,y-7,2,4,R.gun[1]);s.rect(CX-3+sl+r,y-7,2,4,R.gun[1]);s.set(CX-2+sl+r,y-6,R.blue[4]);
  const L=lv>=4?20:17,th=lv>=4?3:2;s.rect(CX+9+r,y-2,L,th,R.gun[2]);s.rect(CX+9+r,y-2,L,1,R.gun[4]);
  // muzzle brake (BFG-50)
  if(lv>=4){s.rect(CX+9+L+r,y-3,4,5,R.gun[1]);s.set(CX+10+L+r,y-2,R.gun[3]);s.set(CX+12+L+r,y-2,R.gun[3])}else s.rect(CX+9+L+r,y-3,2,4,R.gun[1]);
  // bipod; stabilisers add a heavier stand
  s.line(CX+16+r,y+1,CX+14+r,y+7,R.gun[2]);s.line(CX+17+r,y+1,CX+19+r,y+7,R.gun[2]);
  if(lv>=3){s.rect(CX+13+r,y+7,8,1,R.gun[1]);s.rect(CX+15+r,y+2,3,2,R.steel[3])}
  // ember-tipped anti-boss rounds in a side saddle
  if(EMB)for(let i=0;i<4;i++){s.rect(CX+1+i*2+r,y+2,1,3,R.gold[3]);s.set(CX+1+i*2+r,y+2,R.fire[4])}
  s.cyl(CX+p.tw/2-2,p.ty+2,3,4,p.arm||R.olive);s.ball(CX+8+r,y+1,2,1.5,R.skin);
  s.meta.tip=[CX+12+L+r,y-1]}

// ---------- tower definitions ----------
// lane accents: lane 0 = ember, lane 1 = signal blue
// lane accent per tower, matching what each lane IS (fire = MG/Incendiary/Anti-Tank, blue = Jugg/Shrapnel, red = Futuristic)
const LANE=[R.fire,R.blue],LANES={ranger:[R.fire,R.blue],grenadier:[R.blue,R.fire],sniper:[R.red,R.fire],phaser:[R.teal],viper:[R.toxic,R.gold],voidtraitor:[R.void]};
const DEFS={
  ranger:(tier,lane)=>{
    const VEST=['#1a2418','#26361f','#34492a','#465f34','#5e7a42','#7f9a56'],KH=['#2a2a1e','#3e4029','#575a37','#737647','#93965c','#b8b87a'];
    const o={pants:KH,vest:VEST,arm:KH,skin:R.skin,helm:['#16200f','#24341b','#344a26','#4a6634','#678748','#8eaa62'],head:'helmet',weapon:(s,p)=>rifle(s,p)};
    if(tier>=2&&lane===1)o.antenna=1;
    if(tier>=3&&lane===0){o.head='goggles';o.bandolier=1}
    if(tier>=3&&lane===0)o.weapon=(s,p)=>mg(s,p,tier>=5);
    if(tier>=3&&lane===1){o.pads=R.steel;o.bigPads=1;o.chest=(s,ty,tw)=>{s.cyl(CX-5,ty+1,10,6,R.steel);s.rect(CX-1,ty+2,2,3,R.blue[3])}}
    if(tier>=5&&lane===1){o.head='power';o.helm=R.steel;o.vest=R.steel;o.pants=R.steel;o.arm=R.steel;o.wide=1;o.weapon=(s,p)=>heavyRifle(s,p)}
    return o},
  grenadier:(tier,lane)=>{
    const o={pants:R.leather,vest:R.leather,skin:R.skin,helm:R.steel,head:'visor',wide:1,bandolier:1,weapon:(s,p)=>launcher(s,p,lane===1&&tier>=3)};
    o.chest=(s,ty,tw)=>{s.cyl(CX-5,ty+2,10,5,R.steel);s.rect(CX-5,ty+2,10,1,R.steel[4])};
    if(tier>=3&&lane===1){o.visor=R.fire[2];o.visorHi=R.fire[5];o.vest=R.red;o.pads=R.fire}
    if(tier>=5&&lane===1){o.head='gasmask';o.helm=['#2a0c14','#4a1420','#6e1e28','#923030','#b84a3c','#d87050'];
      o.behind=(s,ty)=>{s.cyl(CX-12,ty-3,6,13,R.red);s.rect(CX-11,ty-5,4,2,R.gun[2]);s.set(CX-10,ty-6,R.fire[4]);s.rect(CX-12,ty+2,6,1,R.gold[3]);s.line(CX-9,ty+10,CX-4,ty+14,R.gun[1])}}
    return o},
  sniper:(tier,lane)=>{
    const o={pants:R.olive,vest:['#1e2a1f','#2a4426','#3d5e30','#567a3c','#7e9c50','#b0c478'],skin:R.skin,helm:['#1e2a1f','#2a4426','#3d5e30','#567a3c','#7e9c50','#b0c478'],
      head:'hood',kneel:1,arm:['#1e2a1f','#2a4426','#3d5e30','#567a3c','#7e9c50','#b0c478'],weapon:(s,p)=>sniperRifle(s,p,false)};
    // ghillie cape: a lumpy leaf silhouette behind the body
    o.behind=(s,ty,tw)=>{for(let i=0;i<14;i++){const a=Math.PI*(.85+i/13*1.3),x=CX+Math.cos(a)*10,y=ty+6+Math.sin(a)*9;s.ball(x,y,2.6,2.2,i%3?R.grass:R.olive)}
      s.cyl(CX-9,ty,18,12,['#1e2a1f','#2a4426','#3d5e30','#567a3c','#7e9c50','#b0c478'])};
    if(tier>=3&&lane===0){o.head='visor';o.helm=R.steel;o.visor=R.red[3];o.visorHi=R.red[5];o.vest=R.zcloth;o.pants=R.zcloth;o.arm=R.zcloth;o.behind=null;o.weapon=(s,p)=>sniperRifle(s,p,true)}
    // Anti-Tank lane: goggles -> pro scope -> stabilisers -> BFG-50 -> anti-boss rounds
    if(lane===1&&tier>=1){o.weapon=(s,p)=>antiTankRifle(s,p,tier)}
    if(lane===1&&tier>=1){o.head='goggles';o.helm=['#1e2a1f','#2a4426','#3d5e30','#567a3c','#7e9c50','#b0c478']}
    if(lane===1&&tier>=4){o.vest=R.khaki;o.chest=(s,ty)=>{s.cyl(CX-5,ty+1,10,6,R.khaki);for(let i=0;i<4;i++)s.set(CX-4+i*2,ty+3,R.fire[3])}}
    return o},
  phaser:(tier)=>{
    const SUIT=['#141a26','#1e2a3a','#2c3e52','#40586e','#5e7a90','#8aa4b6'];
    const o={pants:SUIT,vest:SUIT,arm:SUIT,skin:R.skin,helm:R.steel,head:'visor',visor:R.teal[3],visorHi:R.teal[5],weapon:(s,p)=>phaserGun(s,p,tier)};
    // battery pack on the back grows with Juiced Up Batteries
    o.behind=(s,ty)=>{const h=tier>=2?14:10;s.cyl(CX-11,ty-1,6,h,R.gun);for(let i=0;i<(tier>=2?4:2);i++)s.rect(CX-10,ty+1+i*3,4,1,tier>=5?R.gold[4]:R.teal[4]);s.rect(CX-10,ty-3,1,3,R.gun[3]);s.set(CX-10,ty-4,R.teal[5])};
    if(tier>=3){o.pads=R.steel;o.chest=(s,ty)=>{s.cyl(CX-4,ty+2,8,4,R.steel);s.set(CX,ty+3,R.teal[5])}}
    if(tier>=4){o.head='goggles';o.helm=SUIT}
    if(tier>=5){o.vest=['#3a2a10','#6a4a18','#a8781e','#d8a838','#f2d06a','#fff2c0'];o.pads=R.gold;o.helm=R.gold}
    return o},
  viper:(tier,lane)=>{
    const HAZ=['#1a2214','#26361a','#3a5224','#557434','#7a9a48','#a8c46a'];
    const o={pants:HAZ,vest:HAZ,arm:HAZ,skin:R.skin,helm:HAZ,head:'gasmask'};
    const lv0=lane===0?tier:0,lv1=lane===1?tier:0;
    const main={glow:tier>=1,scope:lv0>=2||lv1>=2,spread:lv0>=3,drum:lv0>=4,long:lv1>=5?12:9};
    o.weapon=(s,p)=>{if(lv1>=4){// Double / Twin Gunner: a second gun held lower, behind the first
        const t2=venomRifle(s,Object.assign({},p,{}),Object.assign({},main,{dy:4,ox:-2,noArms:true,long:lv1>=5?11:8,spread:false,drum:false,scope:false}));s.meta.tip2=t2}
      s.meta.tip=venomRifle(s,p,main)};
    if(lv1>=2){o.goggles=1}
    if(lv0>=5||lv1>=3)o.behind=(s,ty)=>{s.cyl(CX-12,ty-2,7,13,R.gun);s.rect(CX-11,ty+1,4,8,R.toxic[3]);s.rect(CX-11,ty+1,4,1,R.toxic[5]);s.set(CX-10,ty+4,'#ffffff');s.set(CX-9,ty+6,R.toxic[5]);s.rect(CX-12,ty-4,7,2,R.gun[3])};
    if(tier>=3)o.pads=R.toxic;
    if(lv1>=5){o.wide=1;o.vest=R.olive}
    return o},
  voidtraitor:(tier)=>{
    const o={pants:R.void,vest:['#120a20','#1e1236','#30205a','#462e7c','#6a4aa8','#9a7ad0'],arm:R.void,skin:R.void,helm:['#0e0818','#1a0f2e','#2a1a48','#3e2a66','#5e46a0','#8a72d0'],
      head:'visor',visor:R.void[4],visorHi:R.void[5],weapon:(s,p)=>voidSword(s,p,tier)};
    if(tier>=2)o.behind=(s,ty)=>{for(let i=0;i<6;i++)s.set(CX-12+i*5,ty-4+(i%3)*6,'rgba(192,138,255,.6)')};
    if(tier>=3){o.pads=R.void;o.bigPads=1;const prev=o.behind;o.behind=(s,ty,tw)=>{if(prev)prev(s,ty,tw);for(let j=0;j<16;j++){const w=12+j*.4;s.cyl(Math.round(CX-w/2-2),ty+j,Math.round(w),1,['#0e0818','#1a0f2e','#2a1a48','#3e2a66','#5e46a0','#8a72d0'],-.1)}}}
    if(tier>=4)o.crown=1;
    return o},
};
function baseKind(tier){return tier>=4?'steel':tier>=2?'sandbag':'dirt'}
// prestige: every colour of the soldier (not skin, eyes, ink or glow) re-ramped to gold by brightness
const GOLDR=['#2a1806','#4a2a10','#7a4a14','#a8741e','#d8a838','#f2d06a','#fff2c0'];
function lum(c){const n=parseInt(c.slice(1),16);return (.3*(n>>16&255)+.59*(n>>8&255)+.11*(n&255))/255}
function goldify(sp){const keep=new Set([INK,...R.skin,R.gold[5],'#ffffff',...R.fire.slice(3),...R.blue.slice(3),...R.toxic.slice(3)]);
  sp.px=sp.px.map(c=>{if(!c||keep.has(c)||/^rgba/.test(c))return c;const l=Math.pow(lum(c),.62);return GOLDR[Math.max(1,Math.min(6,Math.floor(l*7.4)))]})}
function buildTower(type,tier,lane,opt){opt=opt||{};
  const frames=[];let tip,tip2;
  for(const f of ['idle0','idle1','fire']){
    const s=new Spr(W,H),o=DEFS[type](tier,lane);o.bob=f==='idle1'?1:0;o.fire=f==='fire';if(opt.gold)o.gold=1;
    const bk=baseKind(tier);const LA=(LANES[type]||LANE)[lane]||LANE[0];base(s,bk,opt.gold?R.gold:LA);
    if(bk==='sandbag')sandbagsBack(s);
    const fig=new Spr(W,H);soldier(fig,o);fig.outline(INK);if(opt.gold)goldify(fig);s.paste(fig,0,0);
    if(f==='fire'&&type!=='voidtraitor'&&type!=='phaser'){// shell casing kicks out
      s.set(CX+2,30,R.gold[4]);s.set(CX+3,29,R.gold[3])}
    if(bk==='sandbag'){const fr=new Spr(W,H);sandbagsFront(fr);fr.outline(INK);s.paste(fr,0,0)}
    if(bk==='steel'){// lane banner pole
      const A=opt.gold?R.gold:LA;const b=new Spr(W,H);b.rect(CX-15,GY-20,1,18,R.steel[3]);b.rect(CX-14,GY-20,5,4,A[3]);b.rect(CX-14,GY-17,5,1,A[2]);b.set(CX-13,GY-19,A[5]);b.outline(INK);s.paste(b,0,0)}
    frames.push(s);if(f==='idle0'){tip=fig.meta.tip;tip2=fig.meta.tip2}}
  return framesToSprite(frames,{ax:CX,ay:GY,tip,tip2,fireFrame:2,idleFrames:[0,1]});
}
module.exports={buildTower,W,H,CX,GY};
