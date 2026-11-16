"use strict";
// ============================================================
//  pix.js — tiny pixel painter used to AUTHOR sprites offline.
//  Output is the game's own sprite format {w,h,pal,rows} (the
//  same one the Tower Creator edits and drawSpriteRows() draws).
//  Dev-only: never shipped, never loaded by the game.
// ============================================================
// Master palette, as hue-shifted ramps (dark -> light). Shadows lean
// cool/violet, highlights lean warm/yellow, so every material shares light.
const R={
  ink:['#1b1526'],
  olive:['#1e2a1f','#2f4429','#486336','#6c8a45','#9db45e','#cfd88a'],
  khaki:['#3a2a22','#5c4430','#86663f','#b08d55','#d8b878','#f0dca0'],
  skin:['#4a2a2a','#7a4434','#b06a48','#dc9a6a','#f4c69a'],
  steel:['#1f2233','#33384d','#4f5670','#77819a','#a9b4c6','#e0e8f0'],
  gun:['#16151f','#26283a','#3b3f55','#5a6178','#8790a8'],
  wood:['#2e1a16','#4e2e1e','#7a4a2a','#a46a3a','#c8925a'],
  red:['#3a0f1e','#6e1a28','#a8282c','#de4a32','#ff8a4a','#ffc89a'],
  fire:['#7a2410','#c2410c','#ff7a33','#ffb347','#ffe28a','#fffbe0'],
  gold:['#4a2a10','#8a5a18','#c98e26','#f2c14a','#ffe68a','#fffbd6'],
  teal:['#0e2630','#14394a','#1d5866','#2a8088','#4cb0a8','#9ae0c8'],
  blue:['#141c4a','#1e3a8a','#2f6ad8','#4aa8ff','#a8e4ff','#f0ffff'],
  void:['#1a0f2e','#341a5c','#5a2e94','#8a50d0','#c08aff','#eed8ff'],
  toxic:['#132a14','#1f5020','#3a8a2a','#78d040','#c4f06a','#f0ffc0'],
  zskin:['#1f2b2a','#33463e','#4f6a56','#759070','#a8bd8e','#d8e2b8'],
  zcloth:['#1e2433','#2f3a50','#46556e','#66788f','#94a5b6','#c8d4de'],
  orange:['#3e1a10','#7a3414','#c0601c','#ec9234','#ffc860','#fff0b0'],
  leather:['#2a1a18','#4a2c24','#6e4636','#96644a','#c4906a','#e8bc8c'],
  flesh:['#2a0a14','#5a1220','#8e2030','#c43a40','#ec7a6a','#ffb8a0'],
  bone:['#3e3640','#5a4e48','#8a7e6e','#b8ae96','#e2dcc4','#fffbea'],
  grass:['#1d3a26','#2a5430','#3d7a36','#5b9e3e','#86c04c','#b8de6a'],
  dirt:['#2e1c1a','#4a2e24','#6e4630','#946440','#b88a52','#d8b070'],
  stone:['#22202e','#383648','#55546a','#7a7a8e','#a4a6b6','#d4d6de'],
  sand:['#6a5034','#9a7a4c','#c4a468','#e2c88a','#f4e2b0'],
  sandbag:['#3a3024','#5e4e36','#867050','#ad9468','#d2bc8a'],
};
const INK=R.ink[0];
class Spr{
  constructor(w,h){this.w=w;this.h=h;this.px=new Array(w*h).fill(null);this.meta={}}
  set(x,y,c){x=Math.round(x);y=Math.round(y);if(!c||x<0||y<0||x>=this.w||y>=this.h)return;this.px[y*this.w+x]=c}
  get(x,y){x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=this.w||y>=this.h)return null;return this.px[y*this.w+x]}
  clear(x,y){x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=this.w||y>=this.h)return;this.px[y*this.w+x]=null}
  rect(x,y,w,h,c){for(let j=0;j<h;j++)for(let i=0;i<w;i++)this.set(x+i,y+j,typeof c==='function'?c(i,j,w,h):c);return this}
  line(x0,y0,x1,y1,c,th){x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
    const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let e=dx+dy,i=0;
    for(;;){if(th>1)this.rect(x0,y0,th,th,c);else this.set(x0,y0,typeof c==='function'?c(i):c);i++;
      if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx}if(e2<=dx){e+=dx;y0+=sy}}return this}
  ell(cx,cy,rx,ry,c){for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){
      const dx=(x-cx)/(rx+.35),dy=(y-cy)/(ry+.35);if(dx*dx+dy*dy<=1)this.set(x,y,typeof c==='function'?c(dx,dy,x,y):c)}return this}
  // sphere-ish shading; light comes from the upper-left, front
  ball(cx,cy,rx,ry,ramp,bias){bias=bias||0;const L=norm([-.55,-.7,.5]);
    return this.ell(cx,cy,rx,ry,(dx,dy)=>{const z=Math.sqrt(Math.max(0,1-dx*dx-dy*dy));
      const v=dx*L[0]+dy*L[1]+z*L[2];return pickRamp(ramp,v*.62+.42+bias)})}
  // vertical cylinder shading across x (lit on the left)
  cyl(x,y,w,h,ramp,bias){bias=bias||0;for(let i=0;i<w;i++){const u=w<2?0:(i/(w-1))*2-1;
      const v=Math.sqrt(Math.max(0,1-u*u))*.55-u*.45;const c=pickRamp(ramp,v*.55+.45+bias);
      for(let j=0;j<h;j++)this.set(x+i,y+j,c)}return this}
  poly(pts,c){let y0=1e9,y1=-1e9;for(const p of pts){y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1])}
    for(let y=Math.floor(y0);y<=Math.ceil(y1);y++){const xs=[];const yc=y+.5;
      for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];
        if((a[1]<=yc&&b[1]>yc)||(b[1]<=yc&&a[1]>yc))xs.push(a[0]+(yc-a[1])/(b[1]-a[1])*(b[0]-a[0]))}
      xs.sort((p,q)=>p-q);for(let k=0;k+1<xs.length;k+=2)for(let x=Math.round(xs[k]);x<Math.round(xs[k+1]);x++)this.set(x,y,typeof c==='function'?c(x,y):c)}return this}
  // isometric diamond (2:1): rows cy-hh .. cy+hh-1, half width grows by hw/hh per row
  diamond(cx,cy,hw,hh,c){for(let r=0;r<2*hh;r++){const k=r<hh?r:2*hh-1-r,half=Math.round(hw*(k+1)/hh);
      for(let x=-half;x<half;x++)this.set(cx+x,cy-hh+r,typeof c==='function'?c(x,r-hh,half):c)}return this}
  // a diamond with its lower edges extruded down d px (left face / right face)
  slab(cx,cy,hw,hh,d,top,left,right){
    for(let x=-hw;x<hw;x++){let yb=-1e9;for(let r=0;r<2*hh;r++){const k=r<hh?r:2*hh-1-r,half=Math.round(hw*(k+1)/hh);if(x>=-half&&x<half)yb=cy-hh+r}
      if(yb<-1e8)continue;const f=x<0?left:right;for(let k=1;k<=d;k++)this.set(cx+x,yb+k,typeof f==='function'?f(x,k):f)}
    this.diamond(cx,cy,hw,hh,top);return this}
  paste(o,dx,dy,flip){for(let y=0;y<o.h;y++)for(let x=0;x<o.w;x++){const c=o.px[y*o.w+x];if(c)this.set(dx+(flip?o.w-1-x:x),dy+y,c)}return this}
  clone(){const s=new Spr(this.w,this.h);s.px=this.px.slice();s.meta=Object.assign({},this.meta);return s}
  // 1px outline around everything opaque. `skip` keeps colours (e.g. glow) from being outlined.
  outline(c,opts){opts=opts||{};c=c||INK;const src=this.px.slice(),w=this.w,h=this.h,skip=opts.skip||new Set();
    const solid=(x,y)=>{if(x<0||y<0||x>=w||y>=h)return false;const v=src[y*w+x];return !!v&&!skip.has(v)&&!/^rgba/.test(v)};
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(solid(x,y))continue;const cur=src[y*w+x];if(cur&&!/^rgba/.test(cur))continue;
      if(solid(x-1,y)||solid(x+1,y)||solid(x,y-1)||solid(x,y+1)||(opts.diag&&(solid(x-1,y-1)||solid(x+1,y+1)||solid(x+1,y-1)||solid(x-1,y+1))))this.px[y*w+x]=c}
    return this}
  // replace every colour through a map (palette swaps: gold, lanes)
  remap(m){this.px=this.px.map(c=>c&&m[c]?m[c]:c);return this}
  under(fn){const top=this.clone();fn(this);this.paste(top,0,0);return this}
  // serialise to the game's sprite format
  toSprite(extra){limitColours([this],36);const pal=[],idx={};const rows=[];
    for(let y=0;y<this.h;y++){let r='';for(let x=0;x<this.w;x++){const c=this.px[y*this.w+x];
      if(!c){r+='.';continue}if(idx[c]===undefined){idx[c]=pal.length;pal.push(c)}r+=idx[c].toString(36)}rows.push(r)}
    if(pal.length>36)throw new Error('palette overflow '+pal.length);
    return Object.assign({w:this.w,h:this.h,pal,rows},extra||{})}
}
function norm(v){const l=Math.hypot(...v);return v.map(a=>a/l)}
function pickRamp(r,t){t=Math.max(0,Math.min(.999,t));return r[Math.floor(t*r.length)]}
// Frames share one palette so a sprite can carry {rows, frames:[rows..]}.
// The format indexes colours in base 36, so a sprite may hold 36 colours.
// If a composite goes over, the two closest colours (RGB) are merged —
// the rarer one folds into the more common one — until it fits.
function limitColours(list,max){const count={};for(const s of list)for(const c of s.px)if(c)count[c]=(count[c]||0)+1;
  let cols=Object.keys(count);const map={};
  const rgb=c=>{if(c[0]==='#'){const n=parseInt(c.slice(1),16);return[n>>16&255,n>>8&255,n&255]}const p=c.match(/\(([^)]+)\)/)[1].split(',').map(Number);return[p[0],p[1],p[2],p[3]*1000]};
  while(cols.length>max){let best=null,bd=1e18;for(let i=0;i<cols.length;i++)for(let j=i+1;j<cols.length;j++){const a=rgb(cols[i]),b=rgb(cols[j]);
      if((a.length===4)!==(b.length===4))continue;let d=0;for(let k=0;k<a.length;k++)d+=(a[k]-b[k])**2;if(d<bd){bd=d;best=[i,j]}}
    let [i,j]=best;if(count[cols[i]]<count[cols[j]])[i,j]=[j,i];const keep=cols[i],drop=cols[j];map[drop]=keep;count[keep]+=count[drop];
    for(const k in map)if(map[k]===drop)map[k]=keep;cols.splice(j,1)}
  if(Object.keys(map).length)for(const s of list)s.px=s.px.map(c=>c&&map[c]?map[c]:c)}
function framesToSprite(list,extra){limitColours(list,36);const pal=[],idx={};const all=list.map(s=>{const rows=[];
    for(let y=0;y<s.h;y++){let r='';for(let x=0;x<s.w;x++){const c=s.px[y*s.w+x];if(!c){r+='.';continue}
      if(idx[c]===undefined){idx[c]=pal.length;pal.push(c)}r+=idx[c].toString(36)}rows.push(r)}return rows});
  if(pal.length>36)throw new Error('palette overflow '+pal.length+' '+JSON.stringify(extra&&extra.id));
  return Object.assign({w:list[0].w,h:list[0].h,pal,rows:all[0],frames:all},extra||{})}
// hue-shift helper for building ramps from one base colour (used by terrain too)
function hex2rgb(h){const n=parseInt(h.slice(1),16);return[n>>16&255,n>>8&255,n&255]}
function rgb2hex(r,g,b){return'#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('')}
// 6-step hue-shifted ramp from one colour (index 3 = the colour): darks drift to
// violet-blue, lights to warm yellow. Same idea as rampFrom() in js/terrain.js.
function rgb2hsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h=0,s=0;const l=(mx+mn)/2;
  if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h*=60}return[h,s,l]}
function hsl2rgb(h,s,l){h=((h%360)+360)%360;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  const [r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return[(r+m)*255,(g+m)*255,(b+m)*255]}
function toward(h,t,k){const d=((t-h+540)%360)-180;return h+d*k}
const _rc={};
function ramp(hex,step){const key=hex+(step||'');if(_rc[key])return _rc[key];const [h,s,l]=rgb2hsl(...hex2rgb(hex));const st=step||.09,out=[];
  for(let i=-3;i<=2;i++){const k=Math.abs(i)/3;const hh=i<0?toward(h,250,.25*k):toward(h,55,.2*k);
    const ll=Math.max(.05,Math.min(.94,l+i*(i<0?st:st*1.35)));const ss=Math.max(0,Math.min(1,s*(i<0?1+.1*k:1-.15*k)));out.push(rgb2hex(...hsl2rgb(hh,ss,ll)))}
  return _rc[key]=out}
module.exports={R,INK,Spr,framesToSprite,limitColours,pickRamp,hex2rgb,rgb2hex,ramp};
