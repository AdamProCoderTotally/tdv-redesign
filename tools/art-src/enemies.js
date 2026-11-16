"use strict";
// ============================================================
//  enemies.js — every enemy + boss, built on the rigs in rig.js.
//  Output per kind: 8 frames = walk 0-3 front (SE) + walk 0-3 back
//  (NE); the game mirrors for SW/NW. Keys = config `kind`.
// ============================================================
const {R,INK,Spr,framesToSprite,ramp}=require('./pix');
const {biped,quad,blob,tank,limb,hsh,head}=require('./rig');
const EYE_Y=['#ffe066','#fff6b0'],EYE_T=['#5af0d8','#e0fff8'],EYE_V=['#c08aff','#f4e8ff'],EYE_R=['#ff4a3a','#ffd0a0'],EYE_F=['#ffb347','#fffbe0'];
const JEANS=['#13111c','#1e1a26','#2e2a3a','#4a465c','#6a6680','#8a86a0'];
const TAN=['#3a2a22','#5a4030','#8a6a4a','#b89a6a','#dcc490','#f4e2b0'];
const MAUVE=['#1e1622','#2e2236','#46344c','#62506a','#86727e','#ac9c94'];
const REV=ramp('#9cbf9a'),REVC=ramp('#5c6e7a');
// ---- shared detail painters ----
const streaks=(col)=>({at:'behind',raw:1,fn:(b,P,back,f)=>{for(let i=0;i<3;i++){const y=P.top+i*3*P.k+P.k,len=(4+((f+i)%2)*2)*P.k;for(let q=0;q<len;q++)b.set(P.cx-P.tw*.7-i*P.k-q,y,q<2*P.k?col[0]:col[1])}}});
const stitches=(col)=>({at:'body',fn:(b,P,back)=>{const y=P.top+Math.round(P.th*.4),x0=P.cx-Math.round(P.tw*.3)+P.lt;const n=Math.max(4,Math.round(P.tw*.6));
  for(let i=0;i<n;i++)b.set(x0+i,y+(i>>2),'#3a1a20');for(let i=1;i<n;i+=2){b.set(x0+i,y-1+(i>>2),col);b.set(x0+i,y+1+(i>>2),col)}}});
// glowing cracks over every opaque pixel of the body (molten / void)
function vn(x,y,sd){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=hsh(xi+sd,yi),b=hsh(xi+1+sd,yi),c=hsh(xi+sd,yi+1),d=hsh(xi+1+sd,yi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
// glowing cracks over the body: thin ridges of value noise (organic, not a grid); f pulses the glow
function cracks(fire,dens,seed,skip){const sk=new Set(skip||[]);return (s,P,back,f)=>{const pulse=f%2,k=P.k||1,sc=.6/k;for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++){const c=s.px[y*s.w+x];if(!c||c===INK||/^rgba/.test(c)||sk.has(c))continue;
  const n=Math.abs(vn(x*sc,y*sc*1.3,seed)-.5),n2=Math.abs(vn(x*sc*2.1,y*sc*2.1,seed+9)-.5);const t=dens*.42;
  if(n<t*.45)s.px[y*s.w+x]=fire[Math.min(5,4+pulse)];else if(n<t)s.px[y*s.w+x]=fire[3];else if(n2<t*.3)s.px[y*s.w+x]=fire[2]}}}
function shards(rp,n,len){return {at:'head',back:'over',fn:(b,P,back)=>{for(let i=0;i<n;i++){const sd=i%2?1:-1,x=(sd>0?P.shN:P.shF)+sd*P.k,y=P.shY-P.k*(i>>1)*2,h=(len+(i%3))*P.k;
  b.poly([[x-1.5*P.k,y],[x+sd*P.k*.8,y-h],[x+1.5*P.k,y+P.k]],(xx,yy)=>rp[xx<x?4:2])}}}}
function cape(rp,len){return {at:'behind',back:'over',fn:(b,P,back,f)=>{const L=(len||1)*P.th*1.25;for(let j=0;j<L;j++){const t=j/L,w=P.tw*(1+t*.5),wv=Math.round(Math.sin(t*4+f*1.5)*P.k*t);
  b.cyl(Math.round(P.cx+P.lt*(1-t)-w/2-(back?0:2*P.k)+wv),P.shY+j-P.k,Math.round(w),1,rp,back?.02:-.12)}
  if(back)for(let j=2;j<L;j+=3)b.set(P.cx+P.lt*.5-P.k,P.shY+j,rp[1])}}}
function wings(rp,span){return {at:'behind',back:'over',fn:(b,P,back,f)=>{const flap=[0,1,2,1][f%4]*P.k;for(const sd of (back?[-1,1]:[-1])){const ox=P.cx+P.lt,oy=P.shY+P.k;
  const tip=[ox+sd*span*P.k-(back?0:4*P.k),oy-span*.7*P.k+flap];b.poly([[ox,oy],[tip[0],tip[1]],[ox+sd*span*.7*P.k,oy+span*.25*P.k],[ox+sd*span*.35*P.k,oy+span*.1*P.k],[ox+sd*2*P.k,oy+span*.35*P.k]],(x,y)=>rp[((x+y)>>1)%3===0?1:2]);
  b.line(ox,oy,tip[0],tip[1],rp[4])}}}}
function staff(top,rp){return (b,P,back)=>{const x=Math.round(P.hN[0]),y0=Math.round(P.hN[1]+P.k*5),y1=Math.round(P.top-P.k*7);
  b.rect(x,y1,Math.max(1,Math.round(P.k)),y0-y1,(rp||R.wood)[2]);b.rect(x,y1,1,y0-y1,(rp||R.wood)[4]);top(b,x,y1,P)}}
function blade(len,rp,glow){return (b,P,back)=>{const x=P.hN[0],y=P.hN[1];if(back){b.line(x,y,x+len*.4*P.k,y-len*P.k*.8,rp[2],Math.max(1,Math.round(P.k*1.5)));return}
  b.line(x,y,x+len*.55*P.k,y-len*.85*P.k,rp[3],Math.max(2,Math.round(P.k*1.6)));b.line(x+P.k,y,x+len*.55*P.k+P.k,y-len*.85*P.k,rp[5]);
  if(glow)b.line(x+len*.15*P.k,y-len*.25*P.k,x+len*.5*P.k,y-len*.78*P.k,glow);b.rect(x-2*P.k,y-P.k*.5,4*P.k,Math.max(1,P.k),R.gold[3])}}
function axe(rp){return (b,P,back)=>{const x=P.hN[0],y=P.hN[1];b.line(x,y+3*P.k,x+3*P.k,y-14*P.k,R.wood[2],Math.max(2,Math.round(P.k)));
  const hx=x+3*P.k,hy=y-12*P.k;b.poly([[hx,hy-3*P.k],[hx+9*P.k,hy-6*P.k],[hx+10*P.k,hy+4*P.k],[hx,hy+2*P.k]],(xx,yy)=>xx>hx+8*P.k?rp[5]:rp[3]);b.line(hx+9*P.k,hy-6*P.k,hx+10*P.k,hy+4*P.k,R.red[3])}}
function halberd(b,P,back){const x=Math.round(P.hN[0]),y0=Math.round(P.hN[1]+5*P.k),y1=Math.round(P.top-12*P.k);
  b.rect(x,y1,Math.max(1,Math.round(P.k)),y0-y1,R.wood[2]);b.poly([[x,y1+2*P.k],[x+5*P.k,y1+P.k],[x+6*P.k,y1+6*P.k],[x,y1+5*P.k]],R.steel[4]);
  b.poly([[x-P.k,y1+3*P.k],[x+.5,y1-5*P.k],[x+1.5*P.k,y1+3*P.k]],R.steel[5]);b.set(x,y1+7*P.k,R.red[3])}
function shield(rp,emb){return {at:'front',back:'behind',fn:(b,P,back)=>{const x=P.shN+P.k*2,y=P.shY+P.k;
  b.poly([[x,y],[x+6*P.k,y-P.k],[x+6*P.k,y+9*P.k],[x+3*P.k,y+12*P.k],[x,y+9*P.k]],(xx,yy)=>rp[xx<x+2*P.k?4:3]);b.line(x+3*P.k,y,x+3*P.k,y+10*P.k,emb||R.gold[3])}}}

// ---------------- the roster ----------------
const D={};
// --- Walker family (zombies) ---
D.walker=()=>({type:'biped',W:30,H:34,cxr:.4,pose:'reach',lean:.32,torsoW:9,torsoH:10,legL:8,legT:3,hr:4,armL:9,headDx:3,
  skin:R.zskin,cloth:R.zcloth,pants:R.leather,boot:R.gun[1],head:{type:'zombie',hair:R.gun},spine:1,
  body:(b,P,back)=>{if(!back){b.rect(P.cx-1,P.hip-6,3,3,R.zskin[2]);b.set(P.cx,P.hip-5,R.zskin[0]);b.set(P.cx+3,P.hip-3,R.flesh[2]);b.set(P.cx+4,P.hip-2,R.flesh[1])}
    else{b.rect(P.cx-3,P.top+3,4,2,R.zskin[2]);b.set(P.cx-2,P.top+4,R.flesh[2])}
    for(let i=0;i<9;i+=2)b.set(P.cx-4+i,P.hip,R.zcloth[2])}});
D.rwalker=()=>Object.assign(D.walker(),{skin:REV,cloth:REVC,head:{type:'zombie',hair:R.bone,eye:EYE_T},extras:[stitches(R.bone[4])]});
D.sprinter=()=>({type:'biped',W:32,H:32,cxr:.45,pose:'swing',lean:.55,torsoW:7,torsoH:9,legL:9,legT:2,hr:3.6,armL:7,stride:4.5,headDx:3,
  skin:TAN,cloth:R.orange,pants:JEANS,boot:R.red[2],head:{type:'spiky',hair:R.gun},
  body:(b,P,back)=>{b.rect(P.cx-1,P.hip-5,4,1,R.orange[1]);if(!back)b.set(P.cx+3,P.top+1,R.orange[5]);else b.rect(P.cx-3+P.lt,P.top,5,3,R.orange[2])},
  extras:[streaks(['rgba(255,240,200,.6)','rgba(255,240,200,.25)'])]});
D.rsprinter=()=>Object.assign(D.sprinter(),{skin:REV,cloth:ramp('#7a8a5c'),head:{type:'spiky',hair:R.bone,eye:EYE_T},extras:[streaks(['rgba(160,255,230,.55)','rgba(160,255,230,.22)']),stitches(R.bone[4])]});
D.brute=()=>({type:'biped',W:38,H:42,cxr:.42,pose:'hang',lean:.12,torsoW:17,torsoH:13,legL:8,legT:5,legSep:4,hr:4.4,armL:12,armT:4,fist:3,headDx:3,neck:.85,shW:.5,bulk:1,
  skin:MAUVE,cloth:MAUVE,pants:R.leather,head:{type:'brute'},
  body:(b,P,back)=>{const k=P.k;if(!back){b.line(P.cx-8*k,P.top+2*k,P.cx+6*k,P.hip-2*k,R.leather[2],2);for(let i=0;i<4;i++){b.set(P.cx+3+i,P.top+5+i,R.flesh[2]);b.set(P.cx+3+i,P.top+4+i,R.bone[3])}}
    else{b.line(P.cx+6*k,P.top+2*k,P.cx-6*k,P.hip-2*k,R.leather[2],2);for(let j=0;j<4;j++)b.set(P.cx-2+j*2,P.top+3+(j%2),MAUVE[1])}
    b.rect(P.cx-9*k,P.hip-2*k,19*k,3*k,R.leather[1]);b.rect(P.cx-9*k,P.hip-2*k,19*k,1,R.leather[3]);if(!back){b.rect(P.cx-k,P.hip-2*k,3*k,3*k,R.gold[3]);b.set(P.cx,P.hip-k,R.gold[5])}},
  extras:[{at:'body',back:'head',fn:(b,P)=>{const x=P.shN-P.k,y=P.shY;b.ball(x,y,4*P.k,2.6*P.k,R.gun,.1);b.set(x-2*P.k,y-3*P.k,R.bone[4]);b.set(x+2*P.k,y-3*P.k,R.bone[4]);b.set(x,y-4*P.k,R.bone[5])}}]});
D.rbrute=()=>Object.assign(D.brute(),{skin:ramp('#7a9a7e'),cloth:ramp('#7a9a7e'),head:{type:'brute',eye:EYE_T},extras:[stitches(R.bone[4]),
  {at:'body',back:'head',fn:(b,P)=>{const x=P.shN-P.k,y=P.shY;b.ball(x,y,4*P.k,2.6*P.k,R.steel,.05);for(let i=-2;i<=2;i+=2)b.set(x+i,y,R.ink[0])}}]});
// --- molten / obsidian golems ---
const MOLT=['#1a0e12','#2a1418','#40201e','#5a2e24','#7a4232','#9a5a40'];
const OBS=['#0c0a12','#1a1624','#2a2436','#4a4258','#6e6488','#a898c8'];
const golem=(rp,eyes,extra)=>Object.assign({type:'biped',W:36,H:40,cxr:.42,pose:'hang',lean:.1,torsoW:14,torsoH:12,legL:8,legT:4,legSep:3,hr:4,armL:11,armT:4,fist:2.6,neck:.8,shW:.5,bulk:1,
  skin:rp,cloth:rp,pants:rp,sleeve:rp,hand:rp,boot:rp[1],head:{type:'rock',rp,eye:eyes}},extra||{});
D.molten=()=>golem(MOLT,EYE_F,{extras:[shards(MOLT,2,2)],post:cracks(R.fire,.22,1)});
D.mmolten=()=>golem(MOLT,EYE_F,{k:1.3,post:cracks(R.fire,.28,2),extras:[{at:'head',back:'head',fn:(b,P,back,f)=>{for(let i=0;i<3;i++){const x=P.hx-P.hr+i*P.hr,h=(3+(i+f)%2*2)*P.k;b.poly([[x-P.k,P.hy-P.hr*.8],[x+P.k*.3,P.hy-P.hr*.8-h],[x+P.k*1.4,P.hy-P.hr*.8]],R.fire[3+(i%2)])}}}]});
D.obsidian=()=>golem(OBS,EYE_V,{extras:[shards(R.void,4,3)],post:cracks(R.void,.1,3)});
D.mobsidian=()=>golem(OBS,EYE_V,{k:1.3,extras:[shards(R.void,6,4)],post:cracks(R.void,.14,4)});
D.crawling_obsidian=()=>({type:'quad',W:38,H:24,bodyL:13,bodyH:5.5,legs:3,legL:5,rp:OBS,spikes:5,spikeRp:R.void,splay:1,head:{type:'rock',rp:OBS,eye:EYE_V},hr:3.5,claw:R.void[4],
  post:cracks(R.void,.1,5)});
// --- fast / odd ---
const BLITZ=ramp('#d8c050');
D.blitz=()=>({type:'biped',W:28,H:28,cxr:.45,pose:'swing',lean:.7,torsoW:6,torsoH:7,legL:7,legT:2,hr:3.5,armL:6,stride:5,headDx:3,skin:BLITZ,cloth:ramp('#3a3a6a'),pants:ramp('#3a3a6a'),boot:R.gun[1],
  head:{type:'spiky',hair:R.fire,eye:['#ffffff','#ffffff']},
  extras:[{at:'head',back:'head',fn:(b,P)=>{b.poly([[P.hx-P.hr*.6,P.hy-P.hr*.4],[P.hx-P.hr*2.6,P.hy-P.hr*1.6],[P.hx-P.hr*.2,P.hy-P.hr*.9]],BLITZ[3])}},
    {at:'behind',raw:1,fn:(b,P,back,f)=>{let x=P.cx-P.tw,y=P.top+2;for(let i=0;i<7;i++){const nx=x-2,ny=y+((i+f)%2?2:-2);b.line(x,y,nx,ny,i<3?'#ffffff':'#ffe066');x=nx;y=ny}}}]});
D.tunneller=()=>({type:'biped',W:32,H:32,cxr:.4,pose:'hold',lean:.45,torsoW:10,torsoH:9,legL:7,legT:3,hr:4,armL:8,headDx:3,skin:ramp('#8a6a50'),cloth:ramp('#6a5540'),pants:ramp('#4a3826'),
  head:{type:'helm',rp:ramp('#c8a860'),eye:['#3a2a20','#3a2a20']},
  extras:[{at:'head',back:'head',fn:(b,P,back)=>{if(!back){b.rect(P.hx+P.hr*.3,P.hy-P.hr*1.1,2*P.k,2*P.k,'#fff6b0');}b.ell(P.hx+P.hr*.6,P.hy+P.hr*.55,P.hr*.5,P.hr*.35,ramp('#d8a080')[3])}},
    {at:'front',back:'behind',fn:(b,P,back)=>{const x=P.hN[0],y=P.hN[1];b.line(x-2,y+2,x+5,y-6,R.wood[2],2);b.poly([[x+2,y-8],[x+10,y-5],[x+4,y-5]],R.steel[4]);b.poly([[x+2,y-8],[x-3,y-4],[x+2,y-6]],R.steel[3])}}]});
// --- shadow family ---
const SHAD=['#07050c','#120e1c','#1e1830','#2c2440','#463a62','#6a5a90'];
D.nightstalker=()=>({type:'biped',W:32,H:36,cxr:.42,pose:'claw',lean:.35,torsoW:8,torsoH:11,legL:9,legT:2,hr:4,armL:9,skin:SHAD,cloth:SHAD,pants:SHAD,hand:SHAD,boot:SHAD[1],
  head:{type:'hood',rp:SHAD,eye:EYE_V,peak:1},extras:[cape(SHAD,1.1),{at:'front',fn:(b,P)=>{for(let i=0;i<3;i++)b.line(P.hN[0]+P.k,P.hN[1]-P.k+i,P.hN[0]+4*P.k,P.hN[1]-2*P.k+i*2,R.void[5])}}]});
D.wraithling=()=>({type:'biped',ghost:1,float:1,W:28,H:32,cxr:.45,pose:'reach',lean:.2,torsoW:8,torsoH:8,legL:7,hr:3.8,armL:7,skin:SHAD,cloth:SHAD,hand:SHAD,noShadow:0,shadowW:5,
  head:{type:'hood',rp:SHAD,eye:EYE_V},post:(s)=>{for(let i=0;i<s.px.length;i++){const c=s.px[i];if(c&&c!==INK&&!/^rgba/.test(c)&&((i%s.w)+Math.floor(i/s.w))%2===0&&Math.floor(i/s.w)>s.h*.62)s.px[i]=null}}});
D.whisper=()=>({type:'biped',ghost:1,W:30,H:30,cxr:.45,pose:'reach',lean:.25,torsoW:7,torsoH:8,legL:7,hr:3.6,armL:8,skin:ramp('#2a2240'),cloth:ramp('#2a2240'),hand:ramp('#2a2240'),noShadow:1,
  head:{type:'faceless',rp:ramp('#7a6ba8')},extras:[{at:'behind',raw:1,fn:(b,P,back,f)=>{for(let i=0;i<14;i++){const x=P.cx-P.tw-i,y=P.top+3+Math.round(Math.sin(i*.6+f*1.4)*2);b.set(x,y,i<6?'rgba(190,170,255,.7)':'rgba(190,170,255,.3)')}}}]});
D.lurker=()=>({type:'quad',W:38,H:26,bodyL:12,bodyH:6,legs:2,legL:6,rp:SHAD,spikes:0,tail:9,head:{type:'blob',rp:SHAD,eye:EYE_V},hr:4,headDy:1,
  body:(b,Q)=>{for(let i=0;i<5;i++){const x=Q.cx-Q.bl*.6+i*Q.bl*.3;b.line(x,Q.by-Q.bh*.6,x-2-Q.f%2,Q.by-Q.bh*1.6,SHAD[4]);b.set(x-2-Q.f%2,Q.by-Q.bh*1.6,R.void[4])}}});
D.faceless_guardian=()=>({type:'biped',W:34,H:42,cxr:.42,pose:'swing',lean:.05,torsoW:11,torsoH:13,legL:11,legT:3,hr:4,armL:11,armT:3,skin:ramp('#2a2434'),cloth:ramp('#3a3450'),pants:ramp('#2a2434'),pads:ramp('#6a5f8e'),padR:3,
  head:{type:'faceless',rp:ramp('#6a5f8e')},extras:[shield(ramp('#4a4268'),R.void[4])]});
// --- blood family ---
const BLOOD=ramp('#8a1420');
D.blood_clot=()=>({type:'blob',W:26,H:24,rx:9,ry:8,rp:BLOOD,eye:['#ffd0a0','#fff']});
D.splitter=()=>({type:'blob',W:28,H:24,rx:10,ry:7.5,rp:ramp('#a02838'),seam:1,eye:['#ffd0a0','#fff']});
D.damned=()=>({type:'biped',W:30,H:32,cxr:.42,pose:'hang',lean:.45,torsoW:8,torsoH:9,legL:8,legT:2,hr:3.8,armL:9,skin:ramp('#8a3a40'),cloth:ramp('#6a1a24'),pants:ramp('#38090e'),
  head:{type:'skull',eye:EYE_R},extras:[{at:'front',fn:(b,P,back,f)=>{const y=P.hN[1]+P.k;for(let i=0;i<6;i++)b.set(P.hN[0]-i*2,y+(i%2)+(f%2),i%2?R.steel[3]:R.steel[2]);b.rect(P.hN[0]-1,P.hN[1]-1,3,2,R.steel[3])}}]});
D.demonic_spirit=()=>({type:'biped',ghost:1,W:32,H:34,cxr:.45,pose:'claw',lean:.2,torsoW:8,torsoH:9,legL:7,hr:4,armL:8,skin:ramp('#a02050'),cloth:ramp('#8a1a40'),hand:ramp('#a02050'),noShadow:1,
  head:{type:'helm',rp:ramp('#7a1438'),eye:EYE_F,horns:R.bone},extras:[{at:'behind',raw:1,fn:(b,P,back,f)=>{for(let i=0;i<6;i++){const x=P.cx-P.tw/2+i*2,h=4+((i+f)%3)*2;for(let j=0;j<h;j++)b.set(x,P.top+P.th+6-j+((i+f)%2),j<2?R.fire[4]:R.fire[2])}}}]});
D.cloaker=()=>({type:'biped',W:32,H:36,cxr:.42,pose:'hold',lean:.3,torsoW:8,torsoH:10,legL:9,legT:2,hr:3.8,armL:8,skin:ramp('#3a2028'),cloth:ramp('#2a1420'),pants:ramp('#150a12'),
  head:{type:'hood',rp:ramp('#3a1a2a'),eye:['#c05878','#ffd0e0'],peak:1},extras:[cape(ramp('#4a1a30'),1.2)],weapon:(b,P,back)=>{if(back)return;b.line(P.hN[0],P.hN[1],P.hN[0]+5,P.hN[1]-3,R.steel[4],1);b.set(P.hN[0]+5,P.hN[1]-3,R.steel[5])}});
D.blood_soldier=()=>({type:'biped',W:36,H:42,cxr:.42,pose:'hold',lean:.15,torsoW:11,torsoH:12,legL:10,legT:3,hr:4,armL:10,armT:3,skin:ramp('#7a1c28'),cloth:ramp('#5a1018'),pants:ramp('#3c0c14'),pads:ramp('#8a3038'),padR:3,belt:R.leather[2],
  head:{type:'helm',rp:ramp('#6a1a24'),eye:EYE_R},weapon:(b,P,back)=>{const x=P.hN[0],y=P.hN[1];b.line(x-6*P.k,y+3,x+12,y-6,R.wood[1],1);b.poly([[x+11,y-8],[x+16,y-9],[x+13,y-4]],R.flesh[4])}});
// --- casters ---
D.necromancer=()=>({type:'biped',robe:1,W:34,H:42,cxr:.42,pose:'cast',lean:.08,torsoW:10,torsoH:11,legL:10,hr:4,armL:9,skin:R.bone,cloth:ramp('#3a2a4a'),pants:ramp('#2c2036'),sleeve:ramp('#3a2a4a'),hand:R.bone,
  head:{type:'hood',rp:ramp('#2c2036'),eye:['#7aff6a','#e0ffd0'],peak:0},
  weapon:staff((b,x,y,P)=>{b.ball(x,y-P.k,2.5*P.k,2.5*P.k,R.bone,.1);b.set(x-1,y-P.k,R.ink[0]);b.set(x+1,y-P.k,R.ink[0]);b.set(x,y-4*P.k,'#7aff6a')}),weaponFront:1,
  extras:[{at:'body',fn:(b,P,back)=>{if(!back)for(let i=0;i<4;i++)b.set(P.cx+P.lt*.3,P.top+2+i*2,R.toxic[4])}}]});
D.healer=()=>({type:'biped',robe:1,W:30,H:36,cxr:.42,pose:'cast',lean:.05,torsoW:8,torsoH:9,legL:9,hr:3.6,armL:8,skin:R.skin,cloth:ramp('#d8d0c0'),pants:ramp('#b8b0a0'),sleeve:ramp('#d8d0c0'),
  head:{type:'hood',rp:ramp('#a8e0c8'),eye:['#2a2a2a','#2a2a2a']},
  weapon:staff((b,x,y,P)=>{b.rect(x-2,y-2,5,1,'#8ce89a');b.rect(x,y-4,1,5,'#8ce89a');b.set(x,y-2,'#e8ffe8')}),weaponFront:1,
  extras:[{at:'body',fn:(b,P,back)=>{if(!back){b.rect(P.cx-1+P.lt*.3,P.top+3,4,1,'#4ac06a');b.rect(P.cx+P.lt*.3,P.top+2,2,3,'#4ac06a')}}}]});
D.royalguard=()=>({type:'biped',W:36,H:46,cxr:.42,pose:'hold',lean:.05,torsoW:11,torsoH:12,legL:11,legT:3,hr:4,armL:10,armT:3,skin:R.steel,cloth:R.steel,pants:R.steel,sleeve:R.steel,hand:R.steel,
  pads:R.gold,padR:3,belt:R.gold[3],kneePad:R.gold,head:{type:'helm',rp:R.steel,eye:['#1b1526','#3a3050'],plume:R.red},
  body:(b,P,back)=>{if(!back){b.rect(P.cx-2+P.lt*.3,P.top+2,5,6,R.red[2]);b.rect(P.cx+P.lt*.3,P.top+3,1,4,R.gold[4])}},weapon:halberd,weaponFront:1});

// ---------------- bosses (BIGS) ----------------
D.tank=()=>({type:'tank',k:1.25,rp:ramp('#6a7480')});
D.rtank=()=>({type:'tank',k:1.4,rp:ramp('#5a7050'),eye:'#5af0d8',hull:(b,Q)=>{for(let i=0;i<4;i++)b.set(Q.cx-12*Q.k+i*7*Q.k,Q.gy-10*Q.k,R.bone[4])},
  turret:(b,Q)=>{for(let i=0;i<3;i++)b.line(Q.cx-6*Q.k+i*5*Q.k,Q.gy-22*Q.k,Q.cx-7*Q.k+i*5*Q.k,Q.gy-26*Q.k,'#4f7a52',Math.round(Q.k))}});
D.fbrute=()=>Object.assign(D.brute(),{k:1.9,skin:ramp('#8a4a3c'),cloth:ramp('#8a4a3c'),head:{type:'brute',crown:R.bone,gem:R.red[4]},
  extras:[{at:'head',back:'head',fn:(b,P)=>{const x=P.shN+P.k,y=P.shY-P.k;b.ball(x,y,4*P.k,2.6*P.k,R.gun,.1);for(let i=-1;i<=1;i++)b.poly([[x+i*3*P.k-P.k,y-2*P.k],[x+i*3*P.k,y-6*P.k],[x+i*3*P.k+P.k,y-2*P.k]],R.bone[4])}},
    {at:'front',fn:(b,P,back,f)=>{for(let i=0;i<8;i++)b.set(P.hN[0]-i,P.hN[1]+3*P.k+(i%2)+(f%2),i%2?R.steel[3]:R.steel[1])}}]});
D.wfbrute=()=>Object.assign(D.brute(),{k:1.7,skin:ramp('#7a4a44'),cloth:ramp('#7a4a44'),head:{type:'brute',tusk:R.bone},
  extras:[{at:'body',fn:(b,P,back)=>{for(let i=0;i<3;i++)b.line(P.cx-6*P.k,P.top+(3+i*3)*P.k,P.cx+6*P.k,P.top+(5+i*3)*P.k,R.bone[4-(i%2)])}}]});
D.crawler=()=>({type:'quad',k:2,W:40,H:26,bodyL:13,bodyH:5,legs:3,legL:6,rp:ramp('#4a3c50'),spikes:6,splay:1,head:{type:'blob',rp:ramp('#4a3c50'),eye:EYE_Y},hr:4,claw:R.bone[4],tail:6});
D.rmmolten=()=>golem(MOLT.map((c,i)=>i>3?['#4a6a5a','#6a8a78'][i-4]:c),EYE_T,{k:1.9,post:cracks(['#0a3a30','#14594a','#1d8a74','#2ac0a0','#7af0d8','#e0fff8'],.24,6),extras:[stitches(R.bone[4])]});
D.oknight=()=>({type:'biped',k:1.9,W:36,H:44,cxr:.4,pose:'hold',lean:.08,torsoW:12,torsoH:12,legL:11,legT:3,hr:4,armL:10,armT:3,skin:OBS,cloth:OBS,pants:OBS,sleeve:OBS,hand:OBS,pads:R.void,padR:3,
  head:{type:'helm',rp:OBS,eye:EYE_V,horns:R.void},weapon:blade(16,OBS,R.void[4]),extras:[cape(ramp('#3a2a5a'),1.1)],post:cracks(R.void,.08,7,[...ramp('#3a2a5a'),...R.void])});
D.mking=()=>golem(MOLT,EYE_F,{k:2.2,head:{type:'rock',rp:MOLT,eye:EYE_F,crown:R.gold,gem:R.fire[5]},extras:[cape(ramp('#6a1808'),1.2)],post:cracks(R.fire,.3,8,[...ramp('#6a1808'),...R.gold])});
D.oking=()=>golem(OBS,EYE_V,{k:2.35,head:{type:'rock',rp:OBS,eye:EYE_V,crown:R.void,gem:R.void[5]},extras:[shards(R.void,6,4),cape(ramp('#2a2048'),1.2)],post:cracks(R.void,.12,9,[...ramp('#2a2048'),...R.void])});
D.fallen_oking=()=>golem(OBS.map(c=>c),['#7a6ba8','#c0b0e0'],{k:2.25,head:{type:'rock',rp:OBS,eye:['#7a6ba8','#c0b0e0'],crown:ramp('#5a4a6a'),gem:R.ink[0]},extras:[shards(ramp('#5a4a6a'),3,3),cape(ramp('#2a2036'),.8)],post:cracks(ramp('#5a4a7a'),.06,10,ramp('#2a2036'))});
D.endbringer=()=>({type:'biped',k:2.5,W:40,H:46,cxr:.42,pose:'claw',lean:.1,torsoW:12,torsoH:13,legL:11,legT:4,hr:4.2,armL:11,armT:3,skin:SHAD,cloth:SHAD,pants:SHAD,hand:SHAD,sleeve:SHAD,pads:R.void,padR:3,
  head:{type:'helm',rp:SHAD,eye:EYE_V,horns:R.void},extras:[wings(SHAD,18),{at:'body',fn:(b,P,back)=>{if(!back){b.ell(P.cx+P.lt*.4,P.top+P.th*.45,2*P.k,3*P.k,R.void[3]);b.ell(P.cx+P.lt*.4,P.top+P.th*.45,P.k,1.6*P.k,R.void[5])}}}]});
D.endbringer_guardian=()=>Object.assign(D.endbringer(),{k:2.4,pose:'hold',head:{type:'helm',rp:SHAD,eye:EYE_V,horns:R.gold},pads:R.gold,weapon:blade(18,R.void,R.void[5]),
  extras:[wings(SHAD,16),shield(ramp('#2a2048'),R.gold[4]),{at:'head',back:'over',raw:1,fn:(b,P)=>{b.ell(P.hx,P.hy-P.hr*1.6,P.hr*1.1,P.hr*.35,'rgba(255,230,150,.75)');b.ell(P.hx,P.hy-P.hr*1.6,P.hr*.7,P.hr*.12,'rgba(0,0,0,0)')}}]});
D.silent_exec=()=>({type:'biped',k:2,W:38,H:44,cxr:.4,pose:'hold',lean:.12,torsoW:11,torsoH:12,legL:11,legT:3,hr:4,armL:10,armT:3,skin:ramp('#5a4a5a'),cloth:SHAD,pants:SHAD,sleeve:SHAD,
  head:{type:'hood',rp:ramp('#1a1424'),eye:['#c8b8ff','#ffffff'],peak:1},weapon:axe(R.steel),extras:[cape(ramp('#1a1424'),1.2)]});
D.stealth_tunneller=()=>({type:'quad',k:1.9,W:40,H:26,bodyL:13,bodyH:6,legs:2,legL:5,rp:ramp('#3a2e44'),spikes:0,head:null,
  post:(s,Q)=>{const k=Q.k,x=Q.cx+Q.bl*.85,y=Q.by;const l=new Spr(s.w,s.h);for(let i=0;i<9*k;i++){const r=(9*k-i)*.42;for(let j=-r;j<=r;j++){const sp=((Math.floor(i/1.5)+Q.f)%3===0);l.set(x+i,y+j,sp?R.steel[5]:R.steel[3-(j>0?1:0)])}}
    l.outline(INK);s.paste(l,0,0);for(let i=0;i<4;i++)s.set(Q.cx-Q.bl*.4+i*Q.bl*.3,Q.by-Q.bh*.2,'#c8b8ff')}});
D.faceless=()=>({type:'biped',robe:1,k:2.1,W:34,H:46,cxr:.42,pose:'hang',lean:.05,torsoW:9,torsoH:14,legL:12,hr:4.2,armL:16,armT:2,skin:ramp('#2a2240'),cloth:ramp('#221c30'),pants:ramp('#221c30'),sleeve:ramp('#221c30'),hand:R.bone,neck:.9,
  head:{type:'faceless',rp:R.bone}});
D.the_unseen=()=>({type:'biped',ghost:1,k:2.3,W:34,H:36,cxr:.45,pose:'reach',lean:.15,torsoW:10,torsoH:10,legL:8,hr:4.5,armL:10,skin:ramp('#2a2240'),cloth:ramp('#1a1428'),hand:ramp('#2a2240'),noShadow:1,
  head:{type:'faceless',rp:ramp('#8a80a8')},extras:[{at:'body',back:'skip',fn:(b,P)=>{for(let i=0;i<7;i++){const x=P.cx-P.tw*.4+hsh(i,3)*P.tw*.9,y=P.top+hsh(i,7)*P.th*.9;b.rect(x,y,P.k,P.k*.6,'#e8dcff');b.set(x,y,'#ffffff')}}}],
  post:(s)=>{for(let i=0;i<s.px.length;i++){const c=s.px[i];if(c&&c!==INK&&!/^rgba/.test(c)&&c!=='#e8dcff'&&c!=='#ffffff'&&((i%s.w)+Math.floor(i/s.w))%3===0)s.px[i]='rgba(232,220,255,.35)'}}});
D.necro_monarch=()=>Object.assign(D.necromancer(),{k:2.1,head:{type:'skull',eye:['#7aff6a','#e0ffd0'],crown:R.gold,gem:'#7aff6a'},extras:[cape(ramp('#3a1a4a'),1.1),
  {at:'over',raw:1,fn:(b,P,back,f)=>{for(let i=0;i<3;i++){const a=f*.8+i*2.1,x=P.cx+Math.cos(a)*P.tw,y=P.top+Math.sin(a)*P.k*3-P.k*4;b.ell(x,y,1.6*P.k,1.5*P.k,R.bone[4]);b.set(x,y,'#7aff6a')}}}]});
D.deformed_king=()=>({type:'blob',k:2.2,W:30,H:28,rx:10,ry:8.5,rp:ramp('#7a2c3a'),eye:['#ffd0a0','#fff'],
  post:(s,Q)=>{const l=new Spr(s.w,s.h),k=Q.k;head(l,{k,hx:Q.cx+Q.rx*.2,hy:Q.cy-Q.ry*.95,hr:3*k},{head:{type:'blob',rp:ramp('#7a2c3a'),crown:R.gold,gem:R.red[4]},skin:ramp('#7a2c3a')},Q.back,Q.f);
    limb(l,Q.cx+Q.rx*.7,Q.cy,Q.cx+Q.rx*1.25,Q.cy+Q.ry*.6-(Q.f%2)*k,Math.round(3*k),ramp('#9a3c4a'));l.ball(Q.cx+Q.rx*1.25,Q.cy+Q.ry*.7,2.5*k,2.5*k,ramp('#9a3c4a'),.05);l.outline(INK);s.paste(l,0,0)}});
D.error_void_leak=()=>({type:'biped',k:2,W:34,H:40,cxr:.42,pose:'claw',lean:.1,torsoW:10,torsoH:11,legL:10,legT:3,hr:4,armL:10,armT:2,skin:ramp('#3a2a5a'),cloth:ramp('#3a2a5a'),pants:ramp('#181030'),sleeve:ramp('#3a2a5a'),hand:ramp('#b060ff'),
  head:{type:'faceless',rp:ramp('#b060ff')},
  post:(s,P,back,f)=>{// glitch: shift a few scanline bands sideways, tint them cyan/magenta
    const src=s.px.slice();for(let band=0;band<4;band++){const y0=Math.floor(hsh(band,f+1)*s.h*.85),hgt=1+Math.floor(hsh(band,f+7)*3*P.k),dx=Math.round((hsh(band,f+3)-.5)*8*P.k);
      for(let y=y0;y<Math.min(s.h-3,y0+hgt);y++)for(let x=0;x<s.w;x++){const c=src[y*s.w+x-dx];s.px[y*s.w+x]=(x-dx>=0&&x-dx<s.w&&c)?(c===INK?INK:band%2?'#5af0ff':'#ff4ad8'):null}}}});
D.the_misplaced=()=>({type:'biped',k:2.4,W:40,H:40,cxr:.42,pose:'hang',lean:.2,torsoW:16,torsoH:12,legL:8,legT:4,legSep:4,hr:3.5,armL:12,armT:4,fist:2.4,bulk:1,headDx:-4,skin:ramp('#8a3a40'),cloth:ramp('#6a1420'),pants:ramp('#4a1018'),
  head:{type:'blob',rp:ramp('#8a3a40'),eye:['#ffd0a0','#fff']},
  extras:[{at:'body',fn:(b,P,back,f)=>{if(!back){b.ell(P.cx+P.k*2,P.top+P.th*.45,3*P.k,2.6*P.k,R.bone[5]);b.ell(P.cx+P.k*2.6,P.top+P.th*.45,1.4*P.k,1.6*P.k,R.ink[0]);b.set(P.cx+P.k*3,P.top+P.th*.4,'#ffd0a0')}}},
    {at:'head',back:'head',fn:(b,P,back,f)=>{limb(b,P.shN,P.shY-P.k,P.shN+P.k*6,P.shY-P.k*(7+f%2),Math.round(2*P.k),ramp('#9a4a50'));b.ball(P.shN+P.k*6,P.shY-P.k*(8+f%2),2*P.k,1.6*P.k,R.bone,.05)}}]});

const SIZE=require('./enemy-size');
function build(kind){const def=D[kind];if(!def)return null;const o=def();const rig={biped,quad,blob,tank}[o.type];
  const Z=SIZE[kind];if(Z&&Z.mul)o.k=(o.k||1)*Z.mul;
  const fr=[],an=[];for(const back of [false,true])for(let f=0;f<4;f++){const r=rig(o,f,back);fr.push(r.s);an.push([r.ax,r.ay])}
  return framesToSprite(fr,Object.assign({ax:an[0][0],ay:an[0][1],fps:o.fps||7,walk:4,backAt:4,id:kind},Z&&Z.px?{px:Z.px}:{}))}
const KINDS=Object.keys(D);
module.exports={build,KINDS};
