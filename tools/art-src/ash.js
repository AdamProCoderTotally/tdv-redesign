"use strict";
// Ashlands biome scenery: burnt trees, charred stumps, obsidian rocks,
// ember vents, bones, ruined walls/pillars, ash tufts. Same style rules as
// deco.js (1px ink outline, light from upper-left, soft alpha shadow).
const {R,INK,Spr,framesToSprite}=require('./pix');
const SH='rgba(10,6,14,.38)';
const CHAR=['#120c0e','#1e1618','#2c2224','#3e3232','#544646','#6e5e5a'];
const ASH=['#3a3436','#4e4848','#666060','#848080','#a8a4a0','#cfcac4'];
const OBS=['#0e0a16','#1a1426','#2a2238','#3e3452','#5c5278','#8a80aa'];
const RUIN=['#2a2224','#3e3434','#5a4e4a','#7a6c64','#9c8e82','#c2b4a4'];
function L(s,fn){const l=new Spr(s.w,s.h);fn(l);l.outline(INK);s.paste(l,0,0)}
const ember=(s,x,y)=>{s.set(x,y,R.fire[4]);s.set(x+1,y,R.fire[2])};
// a gnarled dead tree: trunk + recursive branches, a few embers still glowing in the bark
function deadtree(v){const s=new Spr(48,64),cx=24,gy=60;s.ell(cx+3,gy,12,4,SH);
  L(s,b=>{b.cyl(cx-3,gy-22,6,22,CHAR.slice(1));b.rect(cx-5,gy-2,10,2,CHAR[2]);
    const br=(x,y,a,len,w,d)=>{if(d>3||len<3)return;const x2=x+Math.cos(a)*len,y2=y+Math.sin(a)*len;b.line(x,y,x2,y2,CHAR[d===0?3:2],w);
      b.line(x-1,y,x2-1,y2,CHAR[4]);br(x2,y2,a-.45-(v%2)*.1,len*.68,Math.max(1,w-1),d+1);br(x2,y2,a+.5,len*.62,Math.max(1,w-1),d+1)};
    br(cx,gy-21,-Math.PI/2-.35,12,3,0);br(cx,gy-21,-Math.PI/2+.45,11,3,0);br(cx-1,gy-12,-Math.PI+.5,7,2,1)});
  ember(s,cx-1,gy-9);ember(s,cx+1,gy-16);if(v&1){ember(s,cx-2,gy-4)}
  return s.toSprite({ax:cx,ay:gy})}
// burnt pine: a black spike with stubby broken limbs
function deadpine(v){const s=new Spr(36,72),cx=18,gy=68;s.ell(cx+3,gy,10,3.5,SH);
  L(s,b=>{b.poly([[cx-4,gy],[cx-1,gy-56+v*6],[cx+1,gy-56+v*6],[cx+4,gy]],(x,y)=>CHAR[x<cx-1?4:x<cx+1?3:2]);
    for(let i=0;i<6;i++){const y=gy-14-i*7,l=7-i;b.line(cx,y,cx-l,y-3,CHAR[3]);b.line(cx,y-2,cx+l-1,y-5,CHAR[2])}});
  ember(s,cx,gy-20);s.set(cx-1,gy-33,R.fire[3]);
  return s.toSprite({ax:cx,ay:gy})}
function stump(v){const s=new Spr(22,16),cx=11,gy=13;s.ell(cx+1,gy,8,3,SH);
  L(s,b=>{b.cyl(cx-5,gy-6,10,6,CHAR.slice(1));b.ell(cx-.5,gy-6,5,2,CHAR[4]);b.ell(cx-.5,gy-6,3,1,CHAR[2]);b.line(cx+4,gy-1,cx+8,gy,CHAR[2])});
  s.set(cx,gy-6,R.fire[4]);s.set(cx-1,gy-6,R.fire[2]);if(v)ember(s,cx-4,gy-2);
  return s.toSprite({ax:cx,ay:gy})}
function obsidian(v){const s=new Spr(30,26),cx=15,gy=22;s.ell(cx+2,gy,11,4,SH);
  L(s,b=>{b.poly([[cx-10,gy],[cx-8,gy-8],[cx-3,gy-18+v*3],[cx+3,gy-12],[cx+10,gy-6],[cx+7,gy+1]],(x,y)=>{const u=(x-cx)/10,vv=(y-gy+18)/19;return OBS[Math.max(1,Math.min(5,Math.floor((.7-u*.4-vv*.3)*6)))]});
    b.line(cx-3,gy-18+v*3,cx,gy-2,OBS[1]);b.line(cx-6,gy-9,cx-4,gy-14,OBS[5])});
  s.line(cx+1,gy-1,cx+5,gy-4,R.fire[3]);s.set(cx+3,gy-3,R.fire[4]);
  return s.toSprite({ax:cx,ay:gy})}
// ember vent: a cracked mound breathing a small flame (2 frames)
function vent(){const fr=[];for(let f=0;f<2;f++){const s=new Spr(24,22),cx=12,gy=18;s.ell(cx+1,gy,9,3,SH);
    L(s,b=>{b.ell(cx,gy-2,8,3.2,ASH[1]);b.ell(cx-1,gy-3,5,2,ASH[2])});
    s.line(cx-5,gy-2,cx+5,gy-2,R.fire[1]);s.line(cx-3,gy-2,cx+3,gy-2,R.fire[3]);s.set(cx,gy-2,R.fire[5]);
    const h=f?6:8;for(let y=0;y<h;y++){const w=Math.max(0,2-Math.floor(y/3));for(let x=-w;x<=w;x++)s.set(cx+x+(y>4?(f?1:-1):0),gy-3-y,y<2?R.fire[4]:y<5?R.fire[3]:R.fire[2])}
    s.set(cx+(f?-3:3),gy-12-f*2,R.fire[3]);fr.push(s)}
  return framesToSprite(fr,{ax:12,ay:18,fps:5})}
function bones(){const s=new Spr(26,14),cx=13,gy=11;s.ell(cx+1,gy,9,2.5,SH);
  L(s,b=>{b.ball(cx-5,gy-3,3.2,2.8,R.bone,-.1);b.rect(cx-6,gy-1,3,1,R.bone[3])});
  s.set(cx-6,gy-4,INK);s.set(cx-4,gy-4,INK);
  L(s,b=>{for(let i=0;i<4;i++){const x=cx+1+i*2;b.line(x,gy,x+1,gy-4,R.bone[4]);}b.line(cx,gy-1,cx+9,gy-1,R.bone[3])});
  return s.toSprite({ax:cx,ay:gy})}
// ruined wall section, iso (runs up-right), broken top, scorch marks
function ruinwall(v){const s=new Spr(48,44),cx=24,gy=38;s.ell(cx+2,gy-2,20,6,SH);
  const HT=v?[16,17,17,18,15,12,11,11,13,14,14,9,6,6,8,10,10,9,7,5]:[8,10,12,12,13,16,18,18,17,17,14,14,15,12,9,9,11,11,8,6];const top=(i)=>HT[i];
  L(s,b=>{for(let i=0;i<20;i++){const x=cx-18+i*2,base=gy-i,h=top(i);
      for(let k=0;k<h;k++){const y=base-k;const brick=((k>>2)+(i>>1))&1;const mortar=(k&3)===0;
        b.rect(x,y,2,1,mortar?RUIN[1]:k>h-2?RUIN[4]:RUIN[brick?3:2])}}
    for(let i=0;i<20;i+=1){const x=cx-18+i*2,y=gy-i-top(i);b.rect(x,y,2,1,RUIN[5])}});
  // scorch + rubble
  for(let i=0;i<5;i++)s.set(cx-12+i*5,gy-8-i*2-(i%2)*4,CHAR[1]);
  L(s,b=>{b.ball(cx+14,gy-2,3,2,RUIN,-.1);b.ball(cx-16,gy+2,2.5,1.6,RUIN,-.1)});
  return s.toSprite({ax:cx,ay:gy})}
function pillar(v){const s=new Spr(24,48),cx=12,gy=44;s.ell(cx+2,gy,8,3,SH);
  const h=v?26:36;
  L(s,b=>{b.cyl(cx-5,gy-h,10,h,RUIN.slice(1));for(let x=-4;x<5;x+=3)b.line(cx+x,gy-h+2,cx+x,gy-1,RUIN[x<0?2:1]);
    b.rect(cx-6,gy-4,12,4,RUIN[2]);b.poly([[cx-5,gy-h],[cx-2,gy-h-4],[cx+1,gy-h-1],[cx+5,gy-h-5],[cx+5,gy-h+1],[cx-5,gy-h+1]],RUIN[4])});
  L(s,b=>{b.ball(cx+8,gy-1,3,2,RUIN,-.1)});
  return s.toSprite({ax:cx,ay:gy})}
function ashtuft(v){const s=new Spr(14,10),cx=7,gy=9;
  for(let i=0;i<4;i++){const x=cx-4+i*3,h=2+((i+v)%3);s.line(x,gy,x+(i%2?1:-1),gy-h,ASH[2+(i%2)]);s.set(x+(i%2?1:-1),gy-h,ASH[4])}
  if(v)s.set(cx,gy-1,R.fire[3]);
  return s.toSprite({ax:cx,ay:gy})}
function cinders(){const s=new Spr(20,12),cx=10,gy=9;s.ell(cx+1,gy,7,2.5,SH);
  L(s,b=>{b.ball(cx-3,gy-2,3,2,OBS,-.05);b.ball(cx+3,gy-1,2.5,1.8,ASH,-.1)});s.set(cx-2,gy-1,R.fire[3]);
  return s.toSprite({ax:cx,ay:gy})}
function build(){const V=vent();
  return{ash_deadtree0:deadtree(0),ash_deadtree1:deadtree(1),ash_deadpine0:deadpine(0),ash_deadpine1:deadpine(1),ash_stump0:stump(0),ash_stump1:stump(1),
    ash_obsidian0:obsidian(0),ash_obsidian1:obsidian(1),ash_vent:V,ash_bones:bones(),ash_ruinwall0:ruinwall(0),ash_ruinwall1:ruinwall(1),
    ash_pillar0:pillar(0),ash_pillar1:pillar(1),ash_tuft0:ashtuft(0),ash_tuft1:ashtuft(1),ash_cinders:cinders()}}
module.exports={build};
