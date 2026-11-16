"use strict";
// ============================================================
//  buildings.js — FARM and VILLAGE: iso buildings on a one-tile
//  plot, one sprite per tier (+ per lane for the village).
//  2 idle frames (windmill / flags / smoke move); no fire frame.
// ============================================================
const {R,INK,Spr,framesToSprite}=require('./pix');
const W=64,H=72,CX=32,GY=60,SHADOW='rgba(18,10,30,.38)';
// iso helpers: 2:1, a = steps along the right edge (+2,-1), b = along the left edge (-2,-1)
const pt=(x,y)=>[Math.round(x),Math.round(y)];
function box(s,fx,fy,a,b,h,wall,opts){opts=opts||{};// front corner (fx,fy) on the ground
  const F=[fx,fy],Rt=[fx+2*a,fy-a],Lt=[fx-2*b,fy-b],Bk=[fx+2*a-2*b,fy-a-b];
  // left face (lit) and right face (shade)
  s.poly([F,Lt,[Lt[0],Lt[1]-h],[F[0],F[1]-h]],(x,y)=>((x+y)%9===0&&opts.tex)?wall[2]:wall[3]);
  s.poly([F,Rt,[Rt[0],Rt[1]-h],[F[0],F[1]-h]],(x,y)=>((x-y)%9===0&&opts.tex)?wall[1]:wall[2]);
  s.line(F[0],F[1]-h,F[0],F[1],wall[1]);
  if(opts.flat){s.poly([[F[0],F[1]-h],[Rt[0],Rt[1]-h],[Bk[0],Bk[1]-h],[Lt[0],Lt[1]-h]],opts.flat[3]);s.line(Lt[0],Lt[1]-h,F[0],F[1]-h,opts.flat[4]);s.line(F[0],F[1]-h,Rt[0],Rt[1]-h,opts.flat[4])}
  return {F,Rt,Lt,Bk,h}}
// gable roof along the a-axis over a box
function gable(s,B,rh,roof,over){over=over||1;const h=B.h;
  const fl=[B.F[0]+2*over*0,B.F[1]-h+over],lt=[B.Lt[0]-over,B.Lt[1]-h],rt=[B.Rt[0]+over,B.Rt[1]-h+over],bk=[B.Bk[0],B.Bk[1]-h];
  const r0=[(B.F[0]+B.Lt[0])/2,(B.F[1]+B.Lt[1])/2-h-rh],r1=[(B.Rt[0]+B.Bk[0])/2+over,(B.Rt[1]+B.Bk[1])/2-h-rh];
  s.poly([lt,bk,r1,r0],roof[1]);                       // back slope peeks
  s.poly([fl,rt,r1,r0],(x,y)=>((y+Math.floor(x/2))%3===0)?roof[2]:roof[3]);  // front slope, shingle rows
  s.poly([[B.F[0],B.F[1]-h],[B.Lt[0],B.Lt[1]-h],r0],(x,y)=>roof===null?null:'#00000000');
  s.line(r0[0],r0[1],r1[0],r1[1],roof[4]);s.line(fl[0],fl[1],rt[0],rt[1],roof[1]);
  return {r0,r1}}
function gableWall(s,B,rh,wall){const h=B.h,r0=[(B.F[0]+B.Lt[0])/2,(B.F[1]+B.Lt[1])/2-h-rh];s.poly([[B.F[0],B.F[1]-h],[B.Lt[0],B.Lt[1]-h],r0],wall[4]);}
// rect on the left face: u along the face (0..b), v up (0..h)
function onLeft(s,B,u,v,w,hh,c){for(let i=0;i<w*2;i++)for(let j=0;j<hh;j++)s.set(B.F[0]-2*u-i,B.F[1]-u-Math.floor(i/2)-v-j,c)}
function onRight(s,B,u,v,w,hh,c){for(let i=0;i<w*2;i++)for(let j=0;j<hh;j++)s.set(B.F[0]+2*u+i,B.F[1]-u-Math.floor(i/2)-v-j,c)}
function L(s,fn){const l=new Spr(s.w,s.h);fn(l);l.outline(INK);s.paste(l,0,0)}
function plot(s,top,side){s.ell(CX+2,GY+1,27,9,SHADOW);s.slab(CX,GY,26,13,3,top,side[2],side[1])}
const WALL=['#3a2418','#5a3820','#8a5a32','#b88350','#d8aa70','#f0d0a0'],PLANK=R.wood,STONE=R.stone,
  ROOF_R=['#3a0f1e','#6e1a28','#a8282c','#c84a32','#e87a4a','#ffc89a'],ROOF_B=['#14243a','#1e3a5a','#2f5a7a','#4a7a98','#7aa4bc','#c0dae6'],
  ROOF_G=['#1e2a1f','#2f4429','#486336','#6c8a45','#9db45e','#cfd88a'],CROP=R.grass;
function crops(s,x0,y0,rows,cols,fruit,f,lv){for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const x=x0+c*5-r*4,y=y0+c*2.5+r*2,sw=((r+c+f)%2);
  s.line(x,y,x+sw,y-4-(lv>=1?1:0),CROP[2]);s.set(x-1+sw,y-3,CROP[4]);s.set(x+1+sw,y-4,CROP[3]);s.set(x+sw,y-5-(lv>=1?1:0),CROP[5]);
  if(fruit){s.set(x+sw+1,y-2,fruit[3]);s.set(x+sw+1,y-3,fruit[4]);if(lv>=5){s.set(x+sw,y-3,fruit[4]);s.set(x+sw+2,y-3,fruit[3])}}}}
function fruitTree(s,x,y,fr){L(s,b=>{b.cyl(x-1,y-8,3,8,R.wood);b.ball(x,y-12,6,5,R.grass,.0);for(let i=0;i<5;i++)b.set(x-4+i*2,y-12+(i%2)*3,fr[4]);b.set(x-2,y-15,R.grass[5])})}
function windmill(s,x,y,f){L(s,b=>{b.poly([[x-3,y],[x-1,y-20],[x+1,y-20],[x+3,y]],R.steel[3]);b.line(x,y,x,y-20,R.steel[4])});
  L(s,b=>{const a0=f*Math.PI/4;for(let i=0;i<4;i++){const a=a0+i*Math.PI/2;b.line(x,y-20,x+Math.cos(a)*9,y-20+Math.sin(a)*5,R.steel[5],1);b.line(x+Math.cos(a)*3,y-20+Math.sin(a)*2,x+Math.cos(a)*9,y-20+Math.sin(a)*5,R.bone[4])}b.ball(x,y-20,1.5,1.5,R.gun)})}
function crate(s,x,y,c){L(s,b=>{const B=box(b,x,y,3,3,5,c||PLANK);b.poly([[B.F[0],B.F[1]-5],[B.Rt[0],B.Rt[1]-5],[B.Bk[0],B.Bk[1]-5],[B.Lt[0],B.Lt[1]-5]],(c||PLANK)[4]);b.line(B.F[0],B.F[1]-5,B.F[0],B.F[1],(c||PLANK)[1])})}
function sack(s,x,y,c){L(s,b=>{b.ball(x,y-3,3.5,3,c||R.sandbag,.05);b.set(x,y-6,R.sandbag[1])})}
function flag(s,x,y,h,col,f){L(s,b=>{b.rect(x,y-h,1,h,R.steel[3]);for(let i=0;i<7;i++)for(let j=0;j<4;j++)b.set(x+1+i,y-h+j+Math.round(Math.sin(i*.8+f*2)*.8),j===0?col[4]:col[3]);b.set(x,y-h-1,R.gold[4])})}
function lamp(s,x,y,f){L(s,b=>{b.rect(x,y-12,1,12,R.gun[2]);b.rect(x-1,y-14,3,3,R.gun[1]);b.set(x,y-13,f?R.fire[5]:R.fire[4])})}
function stall(s,x,y,awn){L(s,b=>{const B=box(b,x,y,5,3,5,PLANK);b.poly([[B.F[0]-1,B.F[1]-6],[B.Rt[0]+1,B.Rt[1]-6],[B.Rt[0]+1,B.Rt[1]-9],[B.F[0]-1,B.F[1]-9]],(xx)=>((xx>>1)%2)?awn[4]:awn[2]);
  b.rect(B.F[0]+1,B.F[1]-8,3,1,R.fire[3]);b.rect(B.F[0]+5,B.F[1]-10,2,1,R.toxic[4])})}
function house(s,x,y,a,b,h,rh,wall,roof,opts){opts=opts||{};L(s,q=>{const B=box(q,x,y,a,b,h,wall,{tex:1});gableWall(q,B,rh,wall);
  // door + windows
  onLeft(q,B,Math.max(1,Math.floor(b/2)-1),0,1,6,R.wood[1]);onLeft(q,B,Math.max(1,Math.floor(b/2)-1),2,1,1,R.gold[4]);
  for(let u=1;u<a-1;u+=3)onRight(q,B,u,Math.max(3,h-6),1,2,opts.lit?R.gold[4]:'#2a3a4a');
  const g=gable(q,B,rh,roof);if(opts.chimney){q.rect(B.Rt[0]-5,B.Rt[1]-h-rh-3,3,7,R.stone[3]);q.rect(B.Rt[0]-5,B.Rt[1]-h-rh-3,3,1,R.stone[5])}})}
function smoke(s,x,y,f){for(let i=0;i<3;i++){const yy=y-i*4-(f%2)*2,xx=x+i+(f%2);s.ell(xx,yy,1.5+i*.4,1.2+i*.3,'rgba(220,214,200,'+(0.55-i*.15)+')')}}

function farm(tier,f){const s=new Spr(W,H);
  plot(s,(x,y,h)=>{const edge=Math.abs(x)>h-3;if(edge)return R.grass[3];const row=((y*2+x)>>2)&1;return tier>=3?(row?R.dirt[1]:R.dirt[2]):(row?R.dirt[2]:R.dirt[3])},R.dirt);
  const fruit=tier>=5?R.toxic:tier>=1?R.red:null;
  if(tier>=2){fruitTree(s,CX-14,GY-14,R.red);fruitTree(s,CX+10,GY-17,R.orange)}
  // barn (grows at T2)
  house(s,CX+6,GY-4,tier>=2?7:5,4,tier>=2?11:9,7,['#3a1418','#6a1e24','#9a2e2a','#c04a38','#e07a5a','#f4b090'],ROOF_G,{chimney:tier>=2});
  crops(s,CX-17,GY-6,3,4,fruit,f,tier);
  if(tier>=3){sack(s,CX+16,GY+2);sack(s,CX+20,GY);sack(s,CX+18,GY-2,['#4a3a24','#6a5636','#8a7450','#ad9468','#d2bc8a'])}
  if(tier>=4){windmill(s,CX-20,GY-6,f);L(s,b=>{b.line(CX-14,GY+4,CX+4,GY+13,R.steel[3]);for(let i=0;i<3;i++)b.set(CX-10+i*6,GY+6+i*3,R.blue[4])})}
  if(tier>=5){L(s,b=>{b.ell(CX-6,GY-2,9,7,'rgba(200,255,220,.28)');b.ell(CX-6,GY-2,9,7,(dx,dy)=>Math.hypot(dx,dy)>.85?'rgba(220,255,230,.75)':null)});L(s,b=>{b.ball(CX-6,GY-1,3.5,3,R.toxic,.1);b.set(CX-7,GY-3,R.toxic[5])})}
  smoke(s,CX+16,GY-30,f);
  return s}
function village(tier,lane,f){const s=new Spr(W,H);
  plot(s,(x,y,h)=>{const edge=Math.abs(x)>h-3;if(edge)return R.grass[3];return ((x>>2)+(y>>1))%2?STONE[3]:STONE[4]},STONE);
  const l0=lane===0?tier:0,l1=lane===1?tier:0;
  if(l0>=5){// town walls
    L(s,b=>{for(let i=0;i<10;i++){const x=CX-24+i*2.6,y=GY-13+i*1.3;b.rect(x,y-6,3,6,STONE[3]);b.set(x,y-7,STONE[4])}})}
  if(l0>=4){// lookout tower
    L(s,b=>{const x=CX-16,y=GY-6;for(const d of [-3,3]){b.line(x+d,y,x+d*.5,y-24,PLANK[2]);}b.line(x-3,y-8,x+3,y-16,PLANK[1]);b.line(x+3,y-8,x-3,y-16,PLANK[1]);
      const B=box(b,x-5,y-24,5,3,3,PLANK);b.poly([[x-7,y-27],[x,y-35],[x+9,y-29]],ROOF_R[3]);b.set(x,y-35,R.gold[4])})}
  house(s,CX+2,GY-2,6,5,11,8,WALL,lane===1&&tier>=4?ROOF_B:ROOF_R,{chimney:1,lit:tier>=2});
  if(l1>=2||l0>=5)house(s,CX+18,GY-8,4,3,8,6,['#2a2a36','#3a3a4a','#5a5a6e','#7a7a8e','#a4a6b6','#d4d6de'],ROOF_B,{});
  if(l0>=1){crate(s,CX-14,GY+6);crate(s,CX-9,GY+8,['#2a2414','#4a4024','#6a5a34','#8a7648','#ad9468'])}
  if(l0>=2)flag(s,CX+20,GY+6,20,R.fire,f);
  if(l0>=3){L(s,b=>{for(let i=0;i<4;i++)b.ball(CX-22+i*4,GY+1+i*2,2.6,1.8,R.sandbag)});crate(s,CX-18,GY+2,R.olive)}
  if(l1>=1){lamp(s,CX-6,GY+10,f);L(s,b=>{for(let i=0;i<6;i++)b.set(CX-4+i*3,GY+4+i,STONE[5])})}
  if(l1>=3)stall(s,CX-16,GY+4,R.red);
  if(l1>=4){L(s,b=>{b.ball(CX+8,GY-34,3,3,R.gold,.15);b.set(CX+8,GY-34,R.gold[1]);b.rect(CX+8,GY-31,1,4,R.gun[2])})}
  if(l1>=5){stall(s,CX+12,GY+8,R.blue);L(s,b=>{for(let i=0;i<12;i++)b.set(CX-20+i*3,GY-20+Math.round(Math.abs(Math.sin(i*.7))*2)+i,(i%3===0?R.red:i%3===1?R.gold:R.blue)[4])})}
  smoke(s,CX+10,GY-32,f);
  return s}
function buildFarm(tier){const fr=[0,1].map(f=>farm(tier,f));return framesToSprite(fr,{ax:CX,ay:GY,idleFrames:[0,1],tip:[CX,GY-20]})}
function buildVillage(tier,lane){const fr=[0,1].map(f=>village(tier,lane,f));return framesToSprite(fr,{ax:CX,ay:GY,idleFrames:[0,1],tip:[CX,GY-20]})}
module.exports={buildFarm,buildVillage};
