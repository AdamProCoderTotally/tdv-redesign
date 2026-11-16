"use strict";
// Scenery + props. Anchor = ground contact point (ax,ay).
const {R,INK,Spr}=require('./pix');
const SH='rgba(18,10,30,.32)';
const PINE=[['#0f2418','#173a22','#22522c','#2f6e34','#4a8c3a','#78b04a'],['#10241e','#18382c','#225036','#2e6a40','#46864a','#6ea85a']];
const LEAF=[['#16301a','#214a24','#2e682c','#468a34','#6eae40','#a4d058'],['#1a2e1a','#2a4422','#3e6028','#5a7e30','#86a43c','#b8c85a']];
function L(s,fn){const l=new Spr(s.w,s.h);fn(l);l.outline(INK);s.paste(l,0,0)}
function pine(v){const s=new Spr(50,80),cx=25,gy=76;const P=PINE[v&1];
  s.ell(cx+3,gy,16,6,SH);
  L(s,b=>{b.cyl(cx-3,gy-14,6,14,R.wood)});
  {const tiers=[[20,gy-12,11],[17,gy-24,11],[13,gy-36,10],[10,gy-46,9],[6,gy-54,7]];
    for(const [hw,y,hh] of tiers)L(s,b=>{b.poly([[cx-hw,y],[cx,y-hh*1.6],[cx+hw,y],[cx+hw*.4,y+3],[cx-hw*.5,y+3]],(x,yy)=>{const u=(x-cx)/hw,v=(yy-(y-hh*1.6))/(hh*1.6+3);
        const t=.62-u*.35-v*.15+((x*7+yy*3)%11===0?.15:0);return P[Math.max(0,Math.min(5,Math.floor(t*6)))]});
      for(let i=-hw+2;i<hw-1;i+=3)b.set(cx+i,y+1+((i>>1)&1),P[1]);
      for(let i=-hw+3;i<0;i+=4)b.set(cx+i,y-2-((i>>1)&1),P[5])})}
  return s.toSprite({ax:cx,ay:gy})}
function broad(v){const s=new Spr(44,56),cx=22,gy=52;const P=LEAF[v&1];
  s.ell(cx+4,gy,14,5,SH);
  L(s,b=>{b.cyl(cx-2,gy-16,5,16,R.wood);b.line(cx,gy-12,cx+6,gy-20,R.wood[2],2);b.line(cx-1,gy-13,cx-7,gy-19,R.wood[2],2)});
  {const blobs=[[cx-8,gy-22,8,7],[cx+8,gy-23,8,7],[cx,gy-30,10,9],[cx-4,gy-38,7,6],[cx+5,gy-37,7,6]];
  for(const [x,y,rx,ry] of blobs)L(s,b=>b.ball(x,y,rx,ry,P,-.06));}
  L(s,b=>{const blobs=[];
    for(const [x,y,rx,ry] of blobs)b.ball(x,y,rx,ry,P,-.06);
    for(let i=0;i<10;i++){const x=cx-12+((i*37)%24),y=gy-40+((i*53)%22);b.set(x,y,P[5]);b.set(x+1,y,P[4])}
    if(v===2)for(let i=0;i<5;i++)b.set(cx-8+i*4,gy-26+(i%2)*5,'#e85a6a')});
  return s.toSprite({ax:cx,ay:gy})}
function bush(v){const s=new Spr(28,22),cx=14,gy=19;const P=LEAF[v&1];s.ell(cx+2,gy,10,3.5,SH);
  L(s,b=>{b.ball(cx-5,gy-5,6,5,P,-.05);b.ball(cx+5,gy-5,6,5,P,-.1);b.ball(cx,gy-9,6,5,P,0);
    if(v&1){b.set(cx-4,gy-8,'#ffe066');b.set(cx+4,gy-6,'#ffe066');b.set(cx+1,gy-11,'#ff8aa8')}});
  return s.toSprite({ax:cx,ay:gy})}
function rock(v){const s=new Spr(30,22),cx=15,gy=18;s.ell(cx+2,gy,11,4,SH);
  L(s,b=>{b.poly([[cx-11,gy],[cx-9,gy-9],[cx-2,gy-14],[cx+7,gy-11],[cx+11,gy-3],[cx+6,gy+1]],(x,y)=>{const u=(x-cx)/11,vv=(y-gy+14)/15;const t=.7-u*.35-vv*.3;return R.stone[Math.max(1,Math.min(5,Math.floor(t*6)))]});
    b.line(cx-2,gy-14,cx+1,gy-3,R.stone[1]);b.set(cx-6,gy-9,R.stone[5]);b.set(cx-5,gy-10,R.stone[5]);
    // moss
    for(let i=0;i<6;i++)b.set(cx-9+i*2,gy-1-(i%2),R.grass[3+(i%2)]);
    if(v&1){b.ball(cx+9,gy-1,3.5,2.5,R.stone)}});
  return s.toSprite({ax:cx,ay:gy})}
function pebbles(){const s=new Spr(20,12),cx=10,gy=9;s.ell(cx+1,gy,7,2.5,SH);
  L(s,b=>{b.ball(cx-3,gy-2,3,2,R.stone,-.05);b.ball(cx+3,gy-1,2.5,1.8,R.stone,-.1);b.set(cx-4,gy-3,R.stone[5]);b.set(cx-2,gy,R.grass[3])});
  return s.toSprite({ax:cx,ay:gy})}
function crates(){const s=new Spr(30,30),cx=15,gy=26;s.ell(cx+2,gy,12,4,SH);
  const box=(b,x,y,sz)=>{b.slab(x,y,sz,sz>>1,sz-2,(xx,yy)=>((xx+yy)&3)===0?R.wood[3]:R.wood[4],(x2,k)=>k===1||((x2)&3)===0?R.wood[1]:R.wood[2],(x2,k)=>k===1||((x2)&3)===0?R.wood[0]:R.wood[1])};
  L(s,b=>{box(b,cx-4,gy-9,7);});L(s,b=>{box(b,cx+5,gy-7,6)});L(s,b=>{box(b,cx,gy-18,6);b.set(cx-1,gy-19,R.gold[3]);b.set(cx,gy-19,R.gold[4])});
  return s.toSprite({ax:cx,ay:gy})}
function barrels(){const s=new Spr(28,28),cx=14,gy=24;s.ell(cx+2,gy,10,4,SH);
  const barrel=(b,x,y,ramp)=>{b.cyl(x-4,y-10,8,10,ramp);b.ell(x-.5,y-10,4,1.6,ramp[4]);b.rect(x-4,y-7,8,1,ramp[1]);b.rect(x-4,y-3,8,1,ramp[1])};
  L(s,b=>barrel(b,cx-4,gy-2,R.red));L(s,b=>barrel(b,cx+5,gy,R.olive));
  L(s,b=>{b.set(cx-5,gy-7,R.gold[4]);b.set(cx-4,gy-7,R.gold[4])});
  return s.toSprite({ax:cx,ay:gy})}
function flower(v){const s=new Spr(16,14),cx=8,gy=12;const cols=[['#ffe066','#c98e26'],['#ff8aa8','#a8284a'],['#c8a8ff','#6a3ab0']][v%3];
  for(let i=0;i<3;i++){const x=cx-4+i*4,y=gy-4-(i%2)*3;s.line(x,gy,x,y,R.grass[3]);s.set(x-1,y-1,cols[0]);s.set(x+1,y-1,cols[0]);s.set(x,y-2,cols[0]);s.set(x,y,cols[0]);s.set(x,y-1,cols[1])}
  return s.toSprite({ax:cx,ay:gy})}
function tuft(v){const s=new Spr(14,10),cx=7,gy=9;const P=R.grass;
  for(let i=0;i<4;i++){const x=cx-4+i*3,h=3+((i+v)%3);s.line(x,gy,x+(i%2?1:-1),gy-h,P[3+(i%2)]);s.set(x+(i%2?1:-1),gy-h,P[5])}
  return s.toSprite({ax:cx,ay:gy})}
function build(){return{pine0:pine(0),pine1:pine(1),broad0:broad(0),broad1:broad(1),broad2:broad(2),bush0:bush(0),bush1:bush(1),
  rock0:rock(0),rock1:rock(1),pebbles:pebbles(),crates:crates(),barrels:barrels(),flower0:flower(0),flower1:flower(1),flower2:flower(2),tuft0:tuft(0),tuft1:tuft(1)}}
module.exports={build};
