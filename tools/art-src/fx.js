"use strict";
// Effect sprite sheets (frames). Effects are not outlined except the grenade:
// light should read as light. Pixel noise comes from a hash, so it is stable.
const {R,INK,Spr,framesToSprite}=require('./pix');
const H=(x,y)=>{let h=(x*374761393+y*668265263)|0;h=(h^(h>>13))*1274126177|0;return((h^(h>>16))>>>0)/4294967295};
function star(s,cx,cy,len,core,mid,tip){for(let i=-len;i<=len;i++){const a=Math.abs(i);const c=a<=1?core:a<=len*.55?mid:tip;s.set(cx+i,cy,c);s.set(cx,cy+i,c)}
  const d=Math.round(len*.55);for(let i=-d;i<=d;i++){const a=Math.abs(i);const c=a<=1?core:a<=d*.6?mid:tip;s.set(cx+i,cy+i,c);s.set(cx+i,cy-i,c)}}
function muzzle(){const fr=[];
  {const s=new Spr(13,13);s.ell(6,6,3.5,3.5,R.fire[3]);star(s,6,6,6,R.fire[5],R.fire[4],R.fire[2]);s.ell(6,6,1.5,1.5,'#ffffff');fr.push(s)}
  {const s=new Spr(13,13);s.ell(6,6,2.5,2.5,R.fire[3]);star(s,6,6,4,R.fire[5],R.fire[3],R.fire[1]);s.set(6,6,'#ffffff');fr.push(s)}
  {const s=new Spr(13,13);s.ell(6,6,1.5,1.5,R.fire[2]);s.set(6,6,R.fire[4]);s.set(9,4,'rgba(200,200,210,.5)');s.set(10,3,'rgba(200,200,210,.35)');fr.push(s)}
  return framesToSprite(fr,{ax:6,ay:6,fps:24})}
function spark(){const fr=[];
  {const s=new Spr(13,13);s.ell(6,6,2,2,'#ffffff');star(s,6,6,3,'#ffffff',R.fire[5],R.fire[4]);fr.push(s)}
  {const s=new Spr(13,13);star(s,6,6,5,R.fire[5],R.fire[4],R.fire[3]);s.set(6,6,'#ffffff');fr.push(s)}
  {const s=new Spr(13,13);for(const [x,y] of [[1,6],[11,6],[6,1],[6,11],[2,2],[10,10],[10,2],[2,10]])s.set(x,y,R.fire[3]);s.set(3,6,R.fire[4]);s.set(9,6,R.fire[4]);fr.push(s)}
  {const s=new Spr(13,13);for(const [x,y] of [[0,6],[12,6],[1,1],[11,11]])s.set(x,y,R.fire[2]);fr.push(s)}
  return framesToSprite(fr,{ax:6,ay:6,fps:20})}
function explosion(){const fr=[],N=36,c=18;
  const noisyBall=(s,cx,cy,r,ramp,bias,seed,rough)=>{s.ell(cx,cy,r+rough,r+rough,(dx,dy,x,y)=>{const d=Math.hypot(dx,dy)*(r+rough);
      if(d>r+H(x+seed,y)*rough)return null;const z=Math.sqrt(Math.max(0,1-(d/(r+rough))**2));const v=(-dx*.5-dy*.7)*.5+z*.6;
      return ramp[Math.max(0,Math.min(ramp.length-1,Math.floor((v*.7+.3+bias)*ramp.length)))]})};
  const smokeR=['#2a2430','#3e3644','#5a5260','#7a727e','#a49cA4'.toLowerCase()];
  {const s=new Spr(N,N);s.ell(c,c,9,8,R.fire[3]);s.ell(c,c,6,5,R.fire[5]);s.ell(c,c,3,3,'#ffffff');star(s,c,c,12,R.fire[5],R.fire[4],R.fire[3]);fr.push(s)}
  {const s=new Spr(N,N);noisyBall(s,c,c,11,R.fire,-.12,1,2.5);s.ell(c-2,c-2,4,4,R.fire[4]);s.ell(c-2,c-3,2,2,R.fire[5]);fr.push(s)}
  {const s=new Spr(N,N);noisyBall(s,c,c-1,14,smokeR,.0,3,3);noisyBall(s,c,c-1,11,R.fire,.05,5,2.5);s.ell(c-2,c-3,4,3,R.fire[5]);
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2;s.rect(c+Math.round(Math.cos(a)*16),c+Math.round(Math.sin(a)*15),2,2,i%2?R.fire[4]:R.dirt[3])}fr.push(s)}
  {const s=new Spr(N,N);noisyBall(s,c,c-3,15,smokeR,.05,7,3);noisyBall(s,c+1,c-1,8,R.fire.slice(0,4),.1,9,2.5);
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2+.3;s.set(c+Math.round(Math.cos(a)*17),c+Math.round(Math.sin(a)*16)+2,R.dirt[2])}fr.push(s)}
  {const s=new Spr(N,N);for(let i=0;i<6;i++){const a=i/6*Math.PI*2;noisyBall(s,c+Math.cos(a)*9,c-5+Math.sin(a)*7,5.5,smokeR,.1,i*11,2)}s.ell(c,c-3,3,2,R.fire[1]);fr.push(s)}
  {const s=new Spr(N,N);for(let i=0;i<5;i++){const a=i/5*Math.PI*2+.6;noisyBall(s,c+Math.cos(a)*11,c-8+Math.sin(a)*6,3.5,smokeR.slice(1),.2,i*17,1.5)}fr.push(s)}
  return framesToSprite(fr,{ax:c,ay:c+6,fps:16})}
function deathpuff(){const fr=[],N=26,c=13;const ecto=['#1f3a2a','#2f5a3a','#4c8a4a','#7ac060','#b8ec8a','#eaffd0'];
  {const s=new Spr(N,N);s.ell(c,c+4,6,3,(dx,dy)=>Math.hypot(dx,dy)>.7?ecto[4]:null);s.ell(c,c,4,4,ecto[5]);s.ell(c,c,2,2,'#ffffff');fr.push(s)}
  {const s=new Spr(N,N);for(let i=0;i<5;i++){const a=i/5*Math.PI*2;s.ball(c+Math.cos(a)*6,c+2+Math.sin(a)*3,3.5,3,ecto,.15)}s.ball(c,c-1,4,4,ecto,.25);
    for(let i=0;i<6;i++){const a=i/6*Math.PI*2+.4;s.set(c+Math.round(Math.cos(a)*11),c+2+Math.round(Math.sin(a)*6),R.bone[4])}fr.push(s)}
  {const s=new Spr(N,N);for(let i=0;i<5;i++){const a=i/5*Math.PI*2+.3;s.ball(c+Math.cos(a)*8,c+Math.sin(a)*4-1,3,2.5,ecto,.05)}
    // little skull wisp rising
    s.ball(c,c-6,3,3,R.bone,.2);s.set(c-1,c-6,INK);s.set(c+1,c-6,INK);s.rect(c-1,c-4,3,1,R.bone[2]);fr.push(s)}
  {const s=new Spr(N,N);for(let i=0;i<4;i++){const a=i/4*Math.PI*2+.8;s.ball(c+Math.cos(a)*9,c+Math.sin(a)*4-3,2.2,2,ecto.slice(1,4),.1)}
    s.ball(c,c-10,2.5,2.5,R.bone.slice(2),.2);s.set(c-1,c-10,ecto[1]);s.set(c+1,c-10,ecto[1]);fr.push(s)}
  {const s=new Spr(N,N);for(let i=0;i<3;i++)s.set(c-6+i*6,c-6-i%2*3,ecto[3]);s.set(c,c-14,R.bone[3]);fr.push(s)}
  return framesToSprite(fr,{ax:c,ay:c+4,fps:12})}
function tracer(kind){const cols=kind==='laser'?['#ffffff',R.blue[5],R.blue[4],R.blue[3]]:kind==='plasma'?['#ffffff',R.red[5],R.red[4],R.red[3]]:['#ffffff',R.fire[5],R.fire[4],R.fire[3]];
  // bright 2px core + tapered tail; head is the anchor
  const L=kind==='bullet'?13:19,s=new Spr(L,4);for(let i=0;i<L;i++){const t=i/(L-1);const c=t>.82?cols[0]:t>.55?cols[1]:t>.25?cols[2]:cols[3];
    s.set(i,1,c);if(t>.4)s.set(i,2,t>.82?cols[1]:cols[2]);if(t>.7){s.set(i,0,cols[3]);s.set(i,3,cols[3])}}
  return s.toSprite({ax:L-1,ay:1})}
function grenade(){const fr=[];for(let f=0;f<2;f++){const s=new Spr(13,13);const b=new Spr(13,13);b.ball(6,7,4,4,['#1a2a1a','#2a4428','#3e6236','#5a8a48','#8ab868']);
    b.rect(5,2,3,2,R.gun[2]);b.set(6,2,R.gun[4]);b.set(4,5,'#d8e2b8');b.set(5,5,'#c2caa0');b.rect(2,7,9,1,'#2a4428');b.outline(INK);s.paste(b,0,0);
    // fizzing fuse
    const fx=8+(f?1:0),fy=f?0:1;s.set(fx,fy,R.fire[5]);s.set(fx+1,fy,R.fire[4]);s.set(fx,fy+1,R.fire[3]);if(f)s.set(fx-1,fy,R.fire[4]);fr.push(s)}
  return framesToSprite(fr,{ax:6,ay:7,fps:10})}
// big boss death: flash -> iso shockwave ring -> fireball with flying debris -> smoke column
function bossdeath(){const fr=[],N=80,c=40,gy=56;const smokeR=['#2a2430','#3e3644','#5a5260','#7a727e','#a49ca4'];
  const ring=(s,r,col,th)=>{for(let a=0;a<Math.PI*2;a+=.02)for(let t=0;t<th;t++)s.set(c+Math.cos(a)*(r-t),gy+Math.sin(a)*(r-t)*.5,col)};
  const fb=(s,cx,cy,r,ramp,seed)=>s.ell(cx,cy,r+2,r+2,(dx,dy,x,y)=>{const d=Math.hypot(dx,dy)*(r+2);if(d>r+H(x+seed,y)*2.5)return null;const z=Math.sqrt(Math.max(0,1-(d/(r+2))**2));
    const v=(-dx*.5-dy*.7)*.5+z*.6;return ramp[Math.max(0,Math.min(ramp.length-1,Math.floor((v*.7+.3)*ramp.length)))]});
  const debris=(s,k)=>{for(let i=0;i<10;i++){const a=-Math.PI*(.1+.8*H(i,3)),d=8+k*9*H(i,5);const x=c+Math.cos(a)*d*1.6,y=gy-14+Math.sin(a)*d+k*k*2;s.rect(x,y,2,2,i%3?R.stone[2]:R.fire[3]);s.set(x,y,i%3?R.stone[4]:R.fire[5])}};
  {const s=new Spr(N,N);s.ell(c,gy-14,12,12,R.fire[4]);s.ell(c,gy-14,8,8,R.fire[5]);s.ell(c,gy-14,5,5,'#ffffff');star(s,c,gy-14,22,'#ffffff',R.fire[5],R.fire[4]);fr.push(s)}
  {const s=new Spr(N,N);ring(s,16,R.fire[5],2);fb(s,c,gy-15,13,R.fire,2);s.ell(c-3,gy-19,5,4,R.fire[5]);debris(s,1);fr.push(s)}
  {const s=new Spr(N,N);ring(s,24,R.fire[4],2);fb(s,c,gy-17,16,smokeR,4);fb(s,c,gy-16,13,R.fire,5);s.ell(c-3,gy-21,5,4,R.fire[5]);debris(s,2);fr.push(s)}
  {const s=new Spr(N,N);ring(s,31,R.fire[3],1);fb(s,c,gy-22,15,smokeR,7);fb(s,c+1,gy-18,10,R.fire.slice(0,5),8);debris(s,3);fr.push(s)}
  {const s=new Spr(N,N);ring(s,36,'rgba(255,200,140,.5)',1);fb(s,c,gy-28,13,smokeR,9);fb(s,c-8,gy-14,8,smokeR,10);fb(s,c+9,gy-14,8,smokeR,11);s.ell(c,gy-14,6,3,R.fire[2]);debris(s,4);fr.push(s)}
  {const s=new Spr(N,N);fb(s,c,gy-34,11,smokeR.slice(1),12);fb(s,c-3,gy-22,8,smokeR,13);fb(s,c-10,gy-10,6,smokeR.slice(1),14);fb(s,c+10,gy-10,6,smokeR.slice(1),15);fr.push(s)}
  {const s=new Spr(N,N);fb(s,c+2,gy-40,9,smokeR.slice(2),16);fb(s,c-2,gy-28,6,smokeR.slice(2),17);for(let i=0;i<6;i++)s.set(c-20+i*8,gy-2+(i%2)*2,R.fire[2]);fr.push(s)}
  {const s=new Spr(N,N);fb(s,c+3,gy-46,6,smokeR.slice(3),18);for(let i=0;i<4;i++)s.set(c-15+i*10,gy-1,R.dirt[2]);fr.push(s)}
  return framesToSprite(fr,{ax:c,ay:gy,fps:12})}
// palette swap a finished sprite: every colour of ramp A -> same index in ramp B
function recolor(spr,A,B,extra){const m={};A.forEach((c,i)=>m[c]=B[Math.min(B.length-1,i)]);Object.assign(m,extra||{});
  return Object.assign({},spr,{pal:spr.pal.map(c=>m[c]||c)})}
const ECTO=['#1f3a2a','#2f5a3a','#4c8a4a','#7ac060','#b8ec8a','#eaffd0'];
module.exports={muzzle,spark,explosion,deathpuff,tracer,grenade,bossdeath,recolor,ECTO};
