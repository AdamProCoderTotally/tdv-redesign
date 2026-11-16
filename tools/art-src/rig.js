"use strict";
// ============================================================
//  rig.js — parametric enemy rigs (biped / robe / ghost / quad /
//  blob / tank). Every rig draws a 4-frame walk in TWO views:
//  front (walking toward camera, faces SE) and back (walking away,
//  faces NE). The game mirrors both for SW / NW.
//  Each body part is its own outlined layer -> chunky cel look.
//  Sizes are authored at k=1 and scaled by o.k (bosses 1.8-2.6).
// ============================================================
const {R,INK,Spr,ramp}=require('./pix');
const SHADOW='rgba(18,10,30,.38)';
const GAIT=[[-1,1,0],[0,0,1],[1,-1,0],[0,0,1]];   // far foot, near foot, bob
function limb(s,x0,y0,x1,y1,th,rp){th=Math.max(1,Math.round(th));const n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0))||1;
  for(let i=0;i<=n;i++){const x=Math.round(x0+(x1-x0)*i/n),y=Math.round(y0+(y1-y0)*i/n);
    for(let a=0;a<th;a++)for(let b=0;b<th;b++)s.set(x+a-(th>>1),y+b-(th>>1),th<3?(b===0?rp[3]:rp[2]):(b===0?rp[4]:b===th-1?rp[1]:(a===0?rp[3]:rp[2])))}}
function torso(s,x,y,w,h,lean,rp,bias){for(let j=0;j<h;j++){const off=Math.round((h-1-j)*lean);s.cyl(Math.round(x+off),y+j,Math.round(w),1,rp,bias)}}
// one outlined layer
function L(s,fn){const l=new Spr(s.w,s.h);fn(l);l.outline(INK);s.paste(l,0,0)}
// unoutlined layer (glows, cracks, streaks)
function G(s,fn){const l=new Spr(s.w,s.h);fn(l);s.paste(l,0,0)}
// paint only over existing opaque pixels (cracks, patterns, stitches)
function over(s,fn){const l=new Spr(s.w,s.h);fn(l);for(let i=0;i<l.px.length;i++)if(l.px[i]&&s.px[i]&&s.px[i]!==INK&&!/^rgba/.test(s.px[i]))s.px[i]=l.px[i]}
function hsh(a,b){let h=(a*374761393+b*668265263)|0;h=(h^(h>>13))*1274126177|0;return((h^(h>>16))>>>0)/4294967295}

// ---------------- heads ----------------
// P: {hx,hy,hr,k}  o.head: {type, rp, eye, hair, ...}
function head(b,P,o,back,f){const H=o.head,k=P.k,hx=P.hx,hy=P.hy,r=P.hr,rp=H.rp||o.skin,eye=H.eye||['#ffe066','#fff6b0'];
  const E=(x,y,w)=>{b.rect(Math.round(x),Math.round(y),Math.max(1,Math.round(w||k)),Math.max(1,Math.round(k*.9)),eye[0]);b.set(Math.round(x),Math.round(y),eye[1])};
  switch(H.type){
  case 'zombie':b.ball(hx,hy,r,r*.92,rp,-.02);
    if(back){b.ball(hx-1,hy-1,r*.85,r*.7,H.hair||R.gun,0);for(let i=0;i<4;i++)b.set(hx-r+1+i*2,hy-r*.6+(i%2),R.ink[0])}
    else{b.rect(hx-r,hy-r*.95,r,2*k,H.hair?H.hair[1]:R.ink[0]);b.set(hx-r+1,hy-r-1,R.ink[0]);b.set(hx-1,hy-r-1,R.ink[0]);
      E(hx+r*.2,hy-r*.25);E(hx+r*.7,hy-r*.25);b.rect(hx+r*.15,hy+r*.45,r*.75,k,R.flesh[1]);b.set(hx+r*.4,hy+r*.45,R.bone[4])}break;
  case 'spiky':b.ball(hx,hy,r,r,rp,.05);const hc=H.hair||R.gun;
    for(let i=0;i<4;i++)b.line(hx-r*.3-i*1.3*k,hy-r*.75+i*k,hx-r-3*k-i*k,hy-r*1.3+i*1.6*k,hc[1],Math.max(1,Math.round(k*1.3)));
    b.ell(hx-r*.35,hy-r*.6,r*.75,r*.45,hc[2]);b.rect(hx-r*.9,hy-r*.4,r*.45,r*.9,hc[1]);
    if(!back){E(hx+r*.35,hy-r*.1);E(hx+r*.85,hy-r*.1);b.rect(hx+r*.3,hy+r*.35,r*.7,k*1.5,R.ink[0]);b.set(hx+r*.55,hy+r*.35,R.bone[5])}
    else b.ball(hx,hy-r*.1,r*.9,r*.85,hc,.02);break;
  case 'brute':b.ball(hx,hy,r*1.1,r,rp,.06);
    if(!back){b.rect(hx-r,hy-r*.45,r*2,k,rp[1]);E(hx-r*.15,hy-r*.2,2*k);E(hx+r*.55,hy-r*.2,2*k);
      b.rect(hx-r*.5,hy+r*.4,r*1.6,k*2,R.ink[0]);const tk=H.tusk||R.bone;b.set(hx-r*.5,hy+r*.25,tk[5]);b.set(hx-r*.5,hy+r*.05,tk[4]);b.set(hx+r*1.05,hy+r*.25,tk[5]);b.set(hx+r*1.05,hy+r*.05,tk[4]);
      if(k>1.4){b.rect(hx-r*.5,hy+r*.25,k,2*k,tk[4]);b.rect(hx+r*1.0,hy+r*.25,k,2*k,tk[4])}}
    else{for(let i=0;i<3;i++)b.set(hx-r*.4+i*r*.4,hy-r*.5,rp[1])}break;
  case 'skull':b.ball(hx,hy,r,r*.95,R.bone,.08);
    if(!back){b.rect(hx,hy-r*.25,r*.45,r*.45,R.ink[0]);b.rect(hx+r*.6,hy-r*.25,r*.4,r*.45,R.ink[0]);b.set(hx+r*.15,hy-r*.1,eye[0]);b.set(hx+r*.75,hy-r*.1,eye[0]);
      b.rect(hx+r*.1,hy+r*.5,r*.8,k,R.bone[1]);for(let i=0;i<3;i++)b.set(hx+r*.15+i*r*.3,hy+r*.5,R.bone[4])}
    else b.set(hx-r*.3,hy-r*.4,R.bone[5]);break;
  case 'hood':{const hr=H.rp||o.cloth;b.ball(hx-k,hy-k,r*1.15,r*1.1,hr,.04);
    if(!back){b.ell(hx+r*.35,hy+k*.2,r*.62,r*.68,R.ink[0]);E(hx+r*.1,hy-r*.05,k);E(hx+r*.6,hy-r*.05,k)}
    else{b.line(hx-r*.6,hy-r*.8,hx+r*.2,hy+r*.6,hr[1]);}
    if(H.peak)b.poly([[hx-r*.9,hy-r*.7],[hx-r*1.9,hy-r*1.6],[hx-r*.2,hy-r*1.05]],hr[2]);break}
  case 'helm':{const hr=H.rp||R.steel;b.ball(hx,hy,r*1.05,r,hr,.08);
    if(!back){b.rect(hx-r*.1,hy-r*.25,r*1.15,r*.45,R.ink[0]);b.rect(hx+r*.05,hy-r*.12,r*.95,Math.max(1,k*.8),eye[0]);b.set(hx+r*.05,hy-r*.12,eye[1]);
      b.rect(hx-r*.2,hy+r*.35,r*1.0,Math.max(1,k),hr[1])}
    else{b.rect(hx-r*.8,hy+r*.2,r*1.6,Math.max(1,k),hr[1])}
    b.line(hx-r*.95,hy-r*.05,hx+r*.95,hy-r*.05,hr[4]);
    if(H.plume){for(let i=0;i<5*k;i++){const a=i/(5*k);b.line(hx-r*.2-a*r*1.4,hy-r*.95-Math.sin(a*3)*r*.4,hx-r*.2-a*r*1.4,hy-r*.95-Math.sin(a*3)*r*.4+2*k,H.plume[i%2?3:4])}}
    if(H.horns){for(const sd of [-1,1]){b.line(hx+sd*r*.7,hy-r*.55,hx+sd*r*1.2,hy-r*1.5,H.horns[3],Math.max(1,Math.round(k*1.3)));b.set(hx+sd*r*1.2,hy-r*1.5,H.horns[5])}}
    break}
  case 'rock':{const rp2=H.rp||o.skin;b.poly([[hx-r,hy+r*.6],[hx-r*1.05,hy-r*.4],[hx-r*.3,hy-r*1.05],[hx+r*.6,hy-r*.9],[hx+r*1.1,hy-r*.1],[hx+r*.8,hy+r*.75]],(x,y)=>{const u=(x-hx)/r,v=(y-hy)/r;return rp2[Math.max(0,Math.min(5,Math.round(3-u*1.1-v*1.2+((x*3+y*5)%7===0?1:0))))]});
    b.line(hx-r*.3,hy-r*1.05,hx+r*.1,hy+r*.1,rp2[4]);
    if(!back){b.rect(hx+r*.05,hy-r*.2,Math.max(2,r*.4),Math.max(1,k),eye[0]);b.rect(hx+r*.6,hy-r*.2,Math.max(1,r*.3),Math.max(1,k),eye[0]);b.set(hx+r*.1,hy-r*.2,eye[1])}
    break}
  case 'faceless':b.ell(hx,hy,r*.9,r*1.2,H.rp?H.rp[4]:R.bone[4]);b.ell(hx-r*.25,hy-r*.35,r*.3,r*.45,R.bone[5]);
    if(!back)b.line(hx-r*.6,hy+r*.6,hx+r*.6,hy+r*.6,(H.rp||R.bone)[2]);
    else b.ell(hx,hy,r*.9,r*1.2,(H.rp||R.bone)[3]);break;
  case 'blob':b.ball(hx,hy,r,r*.9,rp,.04);if(!back){E(hx+r*.2,hy-r*.1);E(hx+r*.7,hy-r*.15)}break;
  }
  if(H.crown){const c=H.crown,cy=hy-r*.95,w=r*1.1;b.rect(hx-w,cy-k*2,w*2,k*2.2,c[3]);b.rect(hx-w,cy-k*2,w*2,k,c[4]);
    for(let i=0;i<5;i++){const x=hx-w+i*(w*2-1)/4;b.rect(x,cy-k*(i%2?3:5),Math.max(1,k),k*(i%2?3:5),c[i%2?3:4]);b.set(x,cy-k*(i%2?3:5),c[5])}
    if(!back)b.set(hx,cy-k,H.gem||R.red[4])}
}

// ---------------- biped ----------------
// o: {k, W,H, cxr, legL, legT, legSep, stride, torsoW, torsoH, lean, armL, armT, pose,
//     skin, cloth, pants, boot, head:{...}, hr (head radius), bulk, robe, ghost,
//     extras:[{at:'behind'|'body'|'front'|'over', back:'skip'|'behind'|'front'|'over', fn(b,P,back,f)}], weapon(b,P,back,f)}
function biped(o,f,back){
  const k=o.k||1,W=Math.ceil((o.W||32)*k),H=Math.ceil((o.H||36)*k),s=new Spr(W,H);
  const cx=Math.round(W*(o.cxr||.42)),gy=H-3,g=GAIT[f%4];
  const bob=g[2]*Math.max(1,Math.round(k*.7)),legL=Math.round((o.legL||9)*k),legT=Math.max(2,Math.round((o.legT||3)*k));
  const hip=gy-legL+(o.ghost?0:bob)-(o.float?Math.round(k*(5+Math.sin(f/4*Math.PI*2)*1.5)):0);
  const tw=Math.round((o.torsoW||9)*k),th=Math.round((o.torsoH||10)*k),lean=o.lean||0,lt=Math.round(th*lean);
  const top=hip-th,shY=top+Math.round(2*k),shN=cx+Math.round(tw*(o.shW||.32))+lt,shF=cx-Math.round(tw*(o.shW||.32))+lt;
  const hr=(o.hr||4)*k,hx=cx+lt+Math.round((o.headDx==null?2:o.headDx)*k)-(back?Math.round(k):0),hy=top-Math.round(hr*(o.neck||.7));
  const armL=(o.armL||8)*k,armT=Math.max(2,Math.round((o.armT||2)*k)),stride=(o.stride||3)*k,sep=Math.round((o.legSep||2)*k);
  const sway=(f%2)*Math.max(1,Math.round(k*.6));
  const P={k,W,H,cx,gy,hip,top,tw,th,lt,shY,shN,shF,hx,hy,hr,armL,armT,legT,f,back,stride,sway,bob};
  // hands per pose
  let hN,hF;const pose=o.pose||'swing';
  if(pose==='reach'){hN=[shN+armL,shY+k+sway];hF=[shF+armL+k,shY-k-sway+k]}
  else if(pose==='hang'){hN=[shN+k*2-g[1]*stride*.4,shY+armL];hF=[shF-k-g[0]*stride*.4,shY+armL-k]}
  else if(pose==='hold'){hN=[shN+armL*.5,shY+armL*.6];hF=[shN+armL*.95,shY+armL*.45]}
  else if(pose==='cast'){hN=[shN+armL*.55,shY+armL*.25-sway];hF=[shF-g[0]*stride*.3,shY+armL*.9]}
  else if(pose==='claw'){hN=[shN+armL*.8,shY-armL*.2+sway];hF=[shF+armL*.7,shY+armL*.1-sway]}
  else {hN=[shN-g[1]*stride*.7,shY+armL];hF=[shF-g[0]*stride*.7,shY+armL-k]}
  P.hN=hN;P.hF=hF;
  const fist=(b,h,rp)=>{const fr=o.fist?o.fist*k:Math.max(1.2,k*1.1);b.ball(h[0],h[1],fr,fr*.9,rp||o.skin,.05)};
  const arm=(b,sh,h,rp)=>{limb(b,sh,shY,Math.round(h[0]),Math.round(h[1]),armT,rp||o.sleeve||o.cloth);fist(b,h,o.hand)};
  const ex=(at)=>{for(const e of (o.extras||[])){const z=back?(e.back||e.at):e.at;if(z===at&&z!=='skip')(e.raw?G:L)(s,b=>e.fn(b,P,back,f))}};
  // shadow
  if(!o.noShadow)s.ell(cx+k,gy,Math.round((o.shadowW||tw*.75+2*k)),Math.max(2,2.5*k),SHADOW);
  const forward=pose==='reach'||pose==='hold'||pose==='claw'||pose==='cast';
  ex('behind');
  if(back){ if(forward){L(s,b=>arm(b,shN,hN));if(o.weapon)L(s,b=>o.weapon(b,P,back,f))} }
  L(s,b=>arm(b,shF,hF));
  // legs / robe / ghost tail
  if(o.ghost){L(s,b=>{const n=Math.round(10*k);for(let j=0;j<n;j++){const t=j/n,wv=Math.sin(t*5+f*1.6)*1.5*k*t,w=tw*(1-t*.75);
      b.cyl(Math.round(cx-w/2+wv-t*3*k),hip+j-Math.round(2*k),Math.max(1,Math.round(w)),1,o.cloth,-.08)}})}
  else if(o.robe){L(s,b=>{const hem=gy-Math.round(k);for(let y=hip-Math.round(k);y<=hem;y++){const t=(y-hip)/(hem-hip||1),w=tw*(1+t*.45)+(t>.85?(f%2?k:0):0),sw=Math.round(Math.sin(f/4*Math.PI*2)*k*t);
      b.cyl(Math.round(cx-w/2+sw),y,Math.round(w),1,o.pants||o.cloth,-.04)}
      for(let i=0;i<3;i++)b.line(cx-tw*.3+i*tw*.3,hip+2*k,cx-tw*.45+i*tw*.45,hem-1,(o.pants||o.cloth)[1]);
      b.rect(cx+tw*.2+g[1]*k,gy-k,3*k,k*1.5,o.boot||R.gun[1])})}
  else{
    L(s,b=>{limb(b,cx-sep+lt*.2,hip,cx-sep+g[0]*stride,gy-Math.round(k*1.5),legT,o.pants);b.rect(cx-sep+g[0]*stride-legT/2,gy-k,legT+2*k,Math.max(2,1.6*k),o.boot||R.gun[1])});
    L(s,b=>{limb(b,cx+sep+lt*.2,hip,cx+sep+g[1]*stride,gy-Math.round(k*1.5),legT,o.pants);b.rect(cx+sep+g[1]*stride-legT/2,gy-k,legT+2*k,Math.max(2,1.6*k),o.boot||R.gun[1]);
      if(o.kneePad)b.rect(cx+sep+g[1]*stride*.5-legT/2,hip+legL*.45,legT,k*1.5,o.kneePad[4])})}
  // torso
  L(s,b=>{if(o.bulk){b.ball(cx+lt*.5,top+th*.55,tw*.62,th*.62,o.cloth,-.06)}else torso(b,cx-tw/2,top,tw,th,lean,o.cloth,-.04);
    if(!back&&o.belt)b.rect(cx-tw/2+lt*.1,hip-Math.round(k*1.5),tw,Math.max(1,Math.round(k)),o.belt);
    if(back&&o.spine)for(let j=0;j<th-2;j+=2)b.set(cx+Math.round((th-j)*lean)-k,top+j+1,o.cloth[1]);
    if(o.body)o.body(b,P,back,f)});
  ex('body');
  if(!back||!forward){} 
  // shoulders
  if(o.pads)L(s,b=>{b.ball(shF-k,shY,o.padR*k||2.5*k,(o.padR||2.5)*k*.75,o.pads,.02);b.ball(shN+k,shY,(o.padR||2.5)*k,(o.padR||2.5)*k*.75,o.pads,.06)});
  // head
  if(o.head&&o.head.type!=='none')L(s,b=>head(b,P,o,back,f));
  ex('head');
  if(!back){if(o.weapon&&!o.weaponFront)L(s,b=>o.weapon(b,P,back,f));L(s,b=>arm(b,shN,hN));if(o.weapon&&o.weaponFront)L(s,b=>o.weapon(b,P,back,f))}
  else if(!forward)L(s,b=>arm(b,shN,hN));
  ex('front');ex('over');
  if(o.post)o.post(s,P,back,f);
  return {s,ax:cx,ay:gy}}

// ---------------- quadruped / crawler ----------------
// o: {k,W,H, bodyL, bodyH, legs:2|3, legL, rp, belly, head:{...}|null, spikes, tail, eye}
function quad(o,f,back){const k=o.k||1,W=Math.ceil((o.W||36)*k),H=Math.ceil((o.H||26)*k),s=new Spr(W,H);
  const cx=Math.round(W*(o.cxr||.45)),gy=H-3,bl=(o.bodyL||14)*k,bh=(o.bodyH||6)*k,legL=(o.legL||6)*k,n=o.legs||2;
  const bob=(f%2)*Math.max(1,Math.round(k*.6)),by=gy-legL-bh*.6+bob,rp=o.rp;
  s.ell(cx,gy,bl*.8,Math.max(2,2.5*k),SHADOW);
  const legsAt=(far)=>{for(let i=0;i<n;i++){const x=cx-bl*.6+i*(bl*1.2/(n-1||1)),ph=((f+i+(far?2:0))%4),st=[-1,0,1,0][ph]*2.2*k,lift=ph===1?k:0;
    L(s,b=>{const kx=x+st*.5+(far?-k:k)*(o.splay?2:0),ky=by+bh*.3+legL*.45-lift-(o.splay?legL*.3:0);
      limb(b,x,by+bh*.2,kx,ky,Math.max(2,Math.round((o.legT||2)*k)),far?rp.map((c,j)=>rp[Math.max(0,j-1)]):rp);
      limb(b,kx,ky,x+st,gy-Math.round(k)-lift,Math.max(1,Math.round((o.legT||2)*k*.8)),far?rp.map((c,j)=>rp[Math.max(0,j-1)]):rp);
      if(o.claw)b.set(x+st+k,gy-Math.round(k)-lift,o.claw)})}};
  const headF=()=>{if(o.head)L(s,b=>{const P={k,hx:cx+bl*.95,hy:by-bh*.1+(o.headDy||0)*k,hr:(o.hr||3.5)*k};head(b,P,{head:o.head,skin:rp},false,f)})};
  const headB=()=>{if(o.head)L(s,b=>{const P={k,hx:cx+bl*.75,hy:by-bh*.55,hr:(o.hr||3.5)*k*.85};head(b,P,{head:o.head,skin:rp},true,f)})};
  const tail=()=>{if(o.tail)L(s,b=>{let x=cx-bl,y=by;for(let i=0;i<o.tail*k;i++){const nx=x-1,ny=y-Math.sin(i*.5+f)*.8-(i<3?.6:0);limb(b,x,y,nx,ny,Math.max(1,Math.round(k*(2-i/(o.tail*k)*1.5))),rp);x=nx;y=ny}})};
  if(back)headB();
  legsAt(true);if(!back)tail();
  L(s,b=>{b.ball(cx,by,bl,bh,rp,o.bias||-.04);if(o.belly&&!back)for(let i=-3;i<=3;i++)b.set(cx+i*bl*.2,by+bh*.75,o.belly);
    if(o.spikes)for(let i=0;i<o.spikes;i++){const x=cx-bl*.7+i*bl*1.4/(o.spikes-1||1),h=(2.5+(i%2)*1.5)*k;b.poly([[x-1.5*k,by-bh*.7],[x+k*.5,by-bh*.7-h],[x+1.5*k,by-bh*.7]],o.spikeRp?o.spikeRp[4-(i%2)]:rp[4])}
    if(o.body)o.body(b,{k,cx,by,bl,bh,gy,f,back})});
  legsAt(false);
  if(back)tail();else headF();
  if(o.post)o.post(s,{k,cx,by,bl,bh,gy,f,back});
  return {s,ax:cx,ay:gy}}

// ---------------- blob ----------------
function blob(o,f,back){const k=o.k||1,W=Math.ceil((o.W||28)*k),H=Math.ceil((o.H||26)*k),s=new Spr(W,H);
  const cx=Math.round(W*.48),gy=H-3,pulse=[0,1,2,1][f%4]*k*.6,rx=(o.rx||9)*k+pulse*.5,ry=(o.ry||8)*k-pulse*.4,cy=gy-ry;
  s.ell(cx,gy,rx*.95,Math.max(2,2.5*k),SHADOW);
  L(s,b=>{b.ball(cx,cy,rx,ry,o.rp,-.02);for(let i=0;i<5;i++){const x=cx-rx*.8+i*rx*.4;b.ell(x,gy-k,1.6*k,1.2*k,o.rp[2])}
    if(o.seam){for(let y=cy-ry;y<cy+ry;y++)b.set(cx+Math.round(Math.sin(y*.6)*k),y,o.rp[0])}
    // veins
    for(let i=0;i<4;i++){const a=i*1.7+f*.2;b.line(cx+Math.cos(a)*rx*.2,cy+Math.sin(a)*ry*.2,cx+Math.cos(a)*rx*.75,cy+Math.sin(a)*ry*.65,o.rp[1])}
    b.ell(cx-rx*.4,cy-ry*.45,rx*.25,ry*.18,o.rp[5]);
    if(!back){const e=o.eye||['#ffe066','#fff6b0'];for(const ex of (o.seam?[-.45,.35]:[.1,.5])){b.ell(cx+ex*rx,cy-ry*.15,1.4*k,1.6*k,R.ink[0]);b.set(cx+ex*rx,cy-ry*.2,e[0])}
      b.rect(cx-rx*.1,cy+ry*.3,rx*.6,k,R.ink[0])}});
  if(o.post)o.post(s,{k,cx,cy,rx,ry,gy,f,back});
  return {s,ax:cx,ay:gy}}

// ---------------- tank ----------------
function tank(o,f,back){const k=o.k||1,W=Math.ceil(46*k),H=Math.ceil(34*k),s=new Spr(W,H),cx=Math.round(W*.45),gy=H-3,rp=o.rp;
  s.ell(cx,gy,20*k,4*k,SHADOW);
  // tracks
  L(s,b=>{b.rect(cx-17*k,gy-7*k,34*k,7*k,R.gun[1]);b.rect(cx-17*k,gy-7*k,34*k,k,R.gun[3]);
    for(let i=0;i<9;i++){const x=cx-16*k+((i*4*k+f*k)%(34*k));b.rect(x,gy-7*k,k,7*k,R.gun[0])}
    for(let i=0;i<5;i++)b.ball(cx-13*k+i*6.5*k,gy-3.5*k,2.2*k,2.2*k,R.gun,.05)});
  // hull
  L(s,b=>{b.poly([[cx-18*k,gy-7*k],[cx-15*k,gy-14*k],[cx+14*k,gy-14*k],[cx+19*k,gy-8*k],[cx+17*k,gy-6*k],[cx-17*k,gy-6*k]],(x,y)=>rp[y<gy-12*k?4:x<cx-8*k?3:2]);
    b.rect(cx-14*k,gy-12*k,26*k,k,rp[1]);if(o.hull)o.hull(b,{k,cx,gy,f,back})});
  // turret + barrel
  const bar=b=>{if(back){b.rect(cx+2*k,gy-21*k,13*k,2*k,R.gun[2]);b.rect(cx+2*k,gy-21*k,13*k,Math.max(1,k*.6),R.gun[4])}
    else{b.rect(cx+5*k,gy-19*k,18*k,2.5*k,R.gun[2]);b.rect(cx+5*k,gy-19*k,18*k,Math.max(1,k*.7),R.gun[4]);b.rect(cx+22*k,gy-20*k,3*k,4.5*k,R.gun[1])}};
  if(back)L(s,bar);
  L(s,b=>{b.ball(cx,gy-18*k,9*k,5.5*k,rp,.02);b.rect(cx-6*k,gy-16*k,13*k,2*k,rp[1]);
    b.ball(cx-3*k,gy-23*k,3*k,1.6*k,rp,.15);
    if(back){b.rect(cx-14*k,gy-12*k,3*k,3*k,R.gun[1]);b.rect(cx+10*k,gy-12*k,3*k,3*k,R.gun[1]);b.set(cx-13*k,gy-12*k,R.fire[3]);b.rect(cx-5*k,gy-21*k,8*k,2*k,rp[1])}
    else{b.rect(cx+3*k,gy-21*k,4*k,2*k,R.ink[0]);b.set(cx+4*k,gy-21*k,o.eye||R.fire[4])}
    if(o.turret)o.turret(b,{k,cx,gy,f,back})});
  if(!back)L(s,bar);
  if(o.post)o.post(s,{k,cx,gy,f,back});
  return {s,ax:cx,ay:gy}}

module.exports={biped,quad,blob,tank,L,G,over,limb,torso,hsh,head,SHADOW};
