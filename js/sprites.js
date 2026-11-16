"use strict";
// ============================================================
//  sprites.js — all pixel-art drawing (enemies, towers,
//  decorations, base, spawn, hover tooltip)
// ============================================================
// Custom pixel sprites (dev editor format): {w,h,pal:[...],rows:['0a.',...]}
// — chars index the palette (base-36), '.'/' ' = transparent.
// A sprite's rows never change once authored, so its cells are baked once into
// a 1px-per-cell offscreen canvas and blitted after. Keyed by sprite + tint +
// flip on a WeakMap so the cache dies with the art and only grows with the
// handful of tint variants a tower can wear.
const _sprBakes=new WeakMap();
function _sprBake(spr,flip,tint){
  let m=_sprBakes.get(spr);
  if(!m){m={};_sprBakes.set(spr,m)}
  const key=(flip?1:0)+(tint?tint.mix+tint.f:'');
  let cv=m[key];
  if(cv)return cv;
  cv=document.createElement('canvas');cv.width=spr.w;cv.height=spr.h;
  const cg=cv.getContext('2d'),rows=spr.rows,pal=spr.pal;
  for(let ry=0;ry<rows.length;ry++){const row=rows[ry];
    for(let rx=0;rx<row.length;rx++){const ch=row[rx];
      if(ch==='.'||ch===' ')continue;
      const col=pal[parseInt(ch,36)];
      if(!col)continue;
      cg.fillStyle=tint?tintCol(col,tint):col;
      cg.fillRect(flip?spr.w-rx-1:rx,ry,1,1)}}
  m[key]=cv;
  return cv}
function drawSpriteRows(g,spr,x,y,scale,flip,tint){
  // A nearest-neighbour blit of the baked cells tiles the device exactly like
  // the per-pixel loop while the transform is axis-aligned and uniform (the
  // camera zoom included). A rotated/skewed context — the aiming turret — would
  // resample the bitmap instead of rotating whole cells, so it stays pixel-by-
  // pixel and reads identically to before.
  const m=g.getTransform?g.getTransform():null;
  if(m&&!(m.b===0&&m.c===0&&m.a===m.d&&m.a>0)){
    const rows=spr.rows,pal=spr.pal;
    for(let ry=0;ry<rows.length;ry++){const row=rows[ry];
      for(let rx=0;rx<row.length;rx++){const ch=row[rx];
        if(ch==='.'||ch===' ')continue;
        const col=pal[parseInt(ch,36)];
        if(!col)continue;
        g.fillStyle=tint?tintCol(col,tint):col;
        g.fillRect(x+(flip?spr.w-rx-1:rx)*scale,y+ry*scale,scale,scale)}}
    return}
  g.drawImage(_sprBake(spr,flip,tint),x,y,spr.w*scale,spr.h*scale)}

// Corrupt holds an enemy in the void and turns it purple for the duration.
// Hand-authoring a violet variant for every creature is not worth it, so each
// palette stop is mixed toward one violet — dark stops stay dark and light
// stops stay light, so a wraith and a boss both read as held without losing
// their shape. Memoised per palette because it runs inside the draw loop.
const VOID_MIX='#7a3ad0',VOID_PAL={};
function voidPal(pal){
  const key=pal.join(',');
  let out=VOID_PAL[key];
  if(!out){out=pal.map(function(c){return mixHex(c,VOID_MIX,.62)});VOID_PAL[key]=out}
  return out}
// ---- Toxic and Cure tints ----
// A Twin Gunner VIPER hands these to whichever tower it likes, and the one
// thing every tower has in common is the colours its art asks for. So rather
// than author a tinted variant of every unit, each colour is mixed toward the
// buff colour once and memoised: the silhouette is untouched and only the
// palette shifts, which is exactly what "green-ish" and "yellow-ish" promise.
const TINT_CACHE={},_hex6=/^#[0-9a-fA-F]{6}$/;
function tintCol(c,tint){
  if(!_hex6.test(c))return c;
  const key=c+tint.mix;
  let v=TINT_CACHE[key];
  if(v===undefined){v=mixHex(c,tint.mix,tint.f);TINT_CACHE[key]=v}
  return v}
const _tintToxic={mix:'#3ad02a',f:.42},_tintCure={mix:'#f5d442',f:.38};
function towerTint(t){
  if(!t)return null;
  // Toxic wins over Cure on the palette: a tower wearing both is the rarer
  // story, and the poison is the one a player needs to notice.
  if(t.toxicT>0)return _tintToxic;
  if(t.cureT>0)return _tintCure;
  return null}
function drawEnemyBody(g,e,z,palOverride){
  const c=e.cfg,p=palOverride||c.pal;
  if(drawFieldEnemy(g,e,p))return;
  z=z||1;
  const wob=Math.sin(e.anim*8)*1.5,step=Math.sin(e.anim*10);
  const w=e.dirx<0?-1:1;
  const R=function(x,y,ww,hh,col){g.fillStyle=col;
    x=Math.round(x);y=Math.round(y);ww=Math.max(1,Math.round(ww));hh=Math.max(1,Math.round(hh));
    if(w<0)x=-x-ww;g.fillRect(x,y,ww,hh)};
  const k=c.kind;
  const fl=Math.sin(e.anim*7)>0;
  if(c.sprite){
    const spr=c.sprite,scale=(c.r*2.2)/spr.w;
    drawSpriteRows(g,spr,-spr.w*scale/2,-spr.h*scale+2+wob*.6,scale,w<0);
    return}
  // soft ground shadow (skipped for floaters)
  if(!c.flying&&k!=='the_unseen'&&k!=='wraithling'){
    g.fillStyle='rgba(0,0,0,.22)';g.beginPath();
    g.ellipse(0,1,c.r*.95,c.r*.38,0,0,Math.PI*2);g.fill()}
  // ---- shared humanoid builder ----
  const hum=function(o){
    const s=o.s||1,tw=(o.tw||10)*s,th=(o.th||12)*s,lh=(o.lh||5)*s,hs=(o.hs||6)*s,hh=hs*.9;
    const skin=o.skin||p[2],cl=o.cloth||p[0],dk=o.dark||p[1],lt=o.light||p[2];
    const pants=o.pants||dk,boot=o.boot||'#1c1814',lean=(o.lean||0)*s;
    const bob=wob*s*.35*(o.bob!==undefined?o.bob:1);
    const ty=-lh-th+bob,hy=ty-hh+s,hx=lean;
    const lw=Math.max(2,tw*.32),ls=step*(o.stride||1)*s*.8,fh=Math.max(1,s*1.5);
    const lx1=-tw/2+s,lx2=tw/2-lw-s,al=(o.armLen||5)*s;
    if(o.cape){R(-tw/2-s,ty+s,tw+2*s,th+lh-s+Math.abs(wob)*.6,o.cape);
      R(-tw/2-s,-2*s,tw+2*s,2*s,dk)}
    if(o.arms==='zombie')R(tw/2-2*s,ty+3*s,al+2*s,2*s,dk);
    R(lx1,-lh,lw,lh+ls,pants);R(lx2,-lh,lw,lh-ls,pants);
    R(lx1,ls-fh,lw+s,fh,boot);R(lx2,-ls-fh,lw+s,fh,boot);
    R(-tw/2,ty,tw,th,cl);R(-tw/2,ty,tw,Math.max(1,s*1.5),lt);
    R(tw/2-s*1.5,ty+s*1.5,s*1.5,th-s*1.5,dk);
    R(-tw/2,ty+th-2*s,tw,2*s,dk);R(-s,ty+th-2*s,2*s,2*s,o.buckle||lt);
    if(o.ribs){R(-tw/2+2*s,ty+2*s,tw-4*s,th*.55,dk);
      for(let i=0;i<3;i++)R(-tw/2+2*s,ty+(2+i*2.4)*s,tw-4*s,Math.max(1,s*.8),o.ribs)}
    if(o.torn){R(-tw/2+s,ty+th-4*s,2*s,2*s,lt);R(tw/2-4*s,ty+th-3*s,2*s,2*s,lt);R(-s,ty+3*s,s,3*s,dk)}
    if(o.plates){const pl=o.plates;
      R(-tw/2-2*s,ty-s,4*s,4*s,pl);R(tw/2-2*s,ty-s,4*s,4*s,pl);
      R(-tw/2-2*s,ty-s,4*s,Math.max(1,s),lt);R(tw/2-2*s,ty-s,4*s,Math.max(1,s),lt);
      R(-tw/2+2*s,ty+2*s,tw-4*s,th*.5,pl);R(-tw/2+2*s,ty+2*s,tw-4*s,Math.max(1,s),lt);
      R(-s*.5,ty+3*s,Math.max(1,s),th*.4,dk)}
    if(o.spikes){const sp=o.spikes;
      R(-tw/2-s,ty-3*s,s,3*s,sp);R(tw/2,ty-3*s,s,3*s,sp);R(-tw/2-2*s,ty-2*s,s,s,sp);R(tw/2+s,ty-2*s,s,s,sp)}
    if(o.arms==='down'){const aw=Math.max(2,tw*.2),fs=o.fist?aw+s:aw;
      R(-tw/2-aw,ty+s,aw,th*.8,cl);R(tw/2,ty+s,aw,th*.8,cl);
      R(-tw/2-aw,ty+s,aw,Math.max(1,s),lt);R(tw/2,ty+s,aw,Math.max(1,s),lt);
      R(-tw/2-fs,ty+th*.8+s,fs,fs,skin);R(tw/2,ty+th*.8+s,fs,fs,skin);
      if(o.claws){R(-tw/2-fs,ty+th*.8+s+fs,Math.max(1,s),2*s,o.claws);R(tw/2+fs-s,ty+th*.8+s+fs,Math.max(1,s),2*s,o.claws)}}
    else if(o.arms==='zombie'){
      R(tw/2-s,ty+2*s+bob*.5,al+s,2*s,cl);R(tw/2-s,ty+2*s+bob*.5,al+s,Math.max(1,s*.7),lt);
      R(tw/2+al-s,ty+s+bob*.5,2*s,3*s,skin);
      if(o.claws){R(tw/2+al+s,ty+s+bob*.5,s,Math.max(1,s*.8),o.claws);R(tw/2+al+s,ty+3*s+bob*.5,s,Math.max(1,s*.8),o.claws)}}
    // head
    R(hx-hs/2,hy,hs,hh,skin);R(hx-hs/2,hy+hh-s,hs,s,dk);
    const ex1=hx-hs*.3,ex2=hx+hs*.1,ey=hy+hh*.35,es=Math.max(1,s*1.3);
    if(!o.mask&&!o.hood&&(!o.helm||o.helmTop)){
      if(o.glow){R(ex1-1,ey-1,es+2,es+2,o.halo||'rgba(255,255,255,.28)');R(ex2-1,ey-1,es+2,es+2,o.halo||'rgba(255,255,255,.28)')}
      R(ex1,ey,es,es,o.eye||'#1c2430');R(ex2,ey,es,es,o.eye||'#1c2430');
      R(hx-hs*.25,hy+hh*.72,hs*.5,Math.max(1,s*.7),dk)}
    if(o.tusks){R(hx+hs*.2,hy+hh*.7,s,2*s,'#e8dcc0');R(hx-hs*.35,hy+hh*.7,s,2*s,'#e8dcc0')}
    if(o.helm&&o.helmTop){
      R(hx-hs/2-s,hy-s,hs+2*s,hh*.34+s,o.helm);R(hx-hs/2-s,hy-s,hs+2*s,Math.max(1,s),lt);
      R(hx-hs/2-s,hy+hh*.3,hs+2*s,Math.max(1,s*.8),dk)}
    else if(o.helm){
      R(hx-hs/2-s,hy-s,hs+2*s,hh+s,o.helm);R(hx-hs/2-s,hy-s,hs+2*s,Math.max(1,s),lt);
      R(hx-hs/2+s*.5,hy+hh*.35,hs-s,Math.max(2,s*1.5),'#0c0814');
      R(ex1,hy+hh*.38,es,Math.max(1,s),o.eye||'#ff5040');R(ex2,hy+hh*.38,es,Math.max(1,s),o.eye||'#ff5040')}
    if(o.hood){
      R(hx-hs/2-s,hy-1.5*s,hs+2*s,hh+2.5*s,o.hood);R(hx-hs/2+s,hy-3*s,hs-2*s,2*s,o.hood);
      R(hx-hs/2-s,hy-1.5*s,hs+2*s,Math.max(1,s),lt);
      R(hx-hs/2+s*.5,hy+hh*.2,hs-s,hh*.65,'#0a0612');
      if(o.glow){R(ex1-1,ey,es+2,es+1,o.halo||'rgba(180,150,255,.3)');R(ex2-1,ey,es+2,es+1,o.halo||'rgba(180,150,255,.3)')}
      R(ex1,ey,es,es,o.eye||'#b89aff');R(ex2,ey,es,es,o.eye||'#b89aff')}
    if(o.mask){R(hx-hs/2,hy,hs,hh,o.mask);R(hx-hs/2,hy,hs,Math.max(1,s*.8),lt);R(hx-hs/2,hy+hh-s,hs,s,dk)}
    if(o.horns){const hc=o.horns;
      R(hx-hs/2-s,hy-2*s,2*s,3*s,hc);R(hx-hs/2-2*s,hy-5*s,2*s,3*s,hc);R(hx-hs/2-3*s,hy-6*s,s,s,hc);
      R(hx+hs/2-s,hy-2*s,2*s,3*s,hc);R(hx+hs/2,hy-5*s,2*s,3*s,hc);R(hx+hs/2+2*s,hy-6*s,s,s,hc)}
    if(o.crown){const cc=o.crown;
      R(hx-hs/2-s,hy-s,hs+2*s,Math.max(1,s*1.3),cc);
      R(hx-hs/2-s,hy-4*s,s*1.5,3*s,cc);R(hx-s*.75,hy-6*s,s*1.5,5*s,cc);R(hx+hs/2-s*.5,hy-4*s,s*1.5,3*s,cc)}
    return{ty:ty,hy:hy,tw:tw,th:th,lh:lh,s:s,hx:hx,hs:hs}};
  // ---- lava golems ----
  const lava=function(s,eye,fa,fb,crown){
    const o=hum({s:s,tw:12,th:12,lh:5,hs:7,cloth:'#3a2018',dark:'#241008',light:'#5a3626',skin:'#6a3016',
      pants:'#2c1810',boot:'#150a06',arms:'down',fist:true,eye:eye,glow:1,halo:'rgba(255,200,80,.22)',
      bob:.6,stride:.8,crown:crown});
    R(-3*s,o.ty+s,s,5*s,p[0]);R(-3*s,o.ty+5*s,3*s,s,p[0]);R(s,o.ty+3*s,s,6*s,p[0]);R(2*s,o.ty+8*s,2*s,s,p[0]);
    R(-s,o.ty+5*s,2*s,2*s,p[2]);R(-4*s,-4*s,s,3*s,p[0]);R(3*s,-5*s,s,3*s,p[0]);
    R(-6*s,o.ty+2*s,s,3*s,p[0]);R(6*s,o.ty+4*s,s,3*s,p[0]);
    if(!crown){
      const f1=2.5+Math.sin(e.anim*9)*1.5,f2=3.5+Math.sin(e.anim*11+1)*1.5,f3=2.2+Math.sin(e.anim*13+2)*1.2;
      R(-3*s,o.hy-f1*s,2*s,f1*s,fa);R(-s,o.hy-f2*s,2*s,f2*s,fb);R(s,o.hy-f3*s,2*s,f3*s,fa);
      R(-s*.5,o.hy-(f2-1)*s,s,(f2-1)*s,'#ffe9a0')}
    else{
      const f1=2+Math.sin(e.anim*9)*1.2,f2=3+Math.sin(e.anim*11)*1.2;
      R(-4.5*s,o.hy-4*s-f1*s,s*1.5,f1*s,fa);R(-.75*s,o.hy-6*s-f2*s,s*1.5,f2*s,fb);R(3*s,o.hy-4*s-f1*s,s*1.5,f1*s,fa)}};
  // ---- obsidian shards ----
  const shards=function(s){
    R(-8*s,-4*s,16*s,4*s,p[1]);
    R(-7*s,-10*s,4*s,7*s,p[1]);R(-3*s,-16*s,4*s,13*s,p[0]);R(1*s,-19*s,4*s,16*s,p[1]);R(5*s,-12*s,3*s,9*s,p[0]);
    R(-3*s,-16*s,s,13*s,p[2]);R(1*s,-19*s,s,16*s,p[2]);R(-7*s,-10*s,s,7*s,p[2]);
    R(2*s,-21*s,2*s,2*s,p[1]);R(-2*s,-18*s,2*s,2*s,p[0]);R(-10*s,-7*s,3*s,4*s,p[0]);R(-10*s,-7*s,s,4*s,p[2]);R(8*s,-8*s,2*s,5*s,p[1]);
    R(-8*s,-4*s,16*s,s,p[2]);R(-6*s,-2*s,s,s,'#b8a8ff');R(3*s,-8*s,s,s,'#b8a8ff');R(-s,-12*s,s,s,'#b8a8ff')};
  if(k==='walker'){
    hum({s:1,tw:10,th:11,lh:5,hs:7,skin:'#b4c0c8',cloth:p[0],pants:'#3c4852',arms:'zombie',armLen:5,torn:1,lean:.6,eye:'#1c2430'});
  }else if(k==='sprinter'){
    const o=hum({s:.9,tw:8,th:9,lh:6,hs:6,skin:'#e8c090',cloth:p[0],pants:'#5a3a18',arms:'zombie',armLen:4,
      lean:1.5,stride:1.8,eye:'#241408',boot:'#2a1608'});
    R(o.hx-3,o.hy-3,2,3,p[1]);R(o.hx-1,o.hy-4,2,4,p[1]);R(o.hx+1,o.hy-3,2,3,p[1]);
    R(o.hx-4,o.hy+1,6,1,p[2]);
    R(-o.tw/2-7,o.ty+2,5,1,'rgba(255,255,255,.4)');R(-o.tw/2-9,o.ty+6,6,1,'rgba(255,255,255,.3)')
  }else if(k==='brute'){
    hum({s:1.1,tw:14,th:12,lh:4,hs:6,skin:'#b09078',cloth:p[0],pants:'#3a2c24',arms:'down',fist:true,
      tusks:1,eye:'#2a1008',buckle:'#c9a86a'});
  }else if(k==='rwalker'){
    hum({s:1,tw:10,th:11,lh:5,hs:7,skin:'#9cbf9a',cloth:'#4f7a52',pants:'#2e4a30',arms:'zombie',armLen:5,
      ribs:'#d2ead0',torn:1,lean:.6,glow:1,eye:'#7cff5a',halo:'rgba(124,255,90,.2)',claws:'#d2ead0'});
  }else if(k==='rsprinter'){
    const o=hum({s:.9,tw:8,th:9,lh:6,hs:6,skin:'#a8c89a',cloth:'#5a8a5c',pants:'#2e4a30',arms:'zombie',armLen:4,
      lean:1.5,stride:1.8,ribs:'#e0f0d8',glow:1,eye:'#7cff5a',halo:'rgba(124,255,90,.2)',claws:'#e0f0d8'});
    R(o.hx+2,o.hy-3,1,3,'#e0f0d8')
  }else if(k==='rbrute'){
    hum({s:1.1,tw:14,th:12,lh:4,hs:6,skin:'#7a9a7e',cloth:'#3e5c44',pants:'#243826',arms:'down',fist:true,
      ribs:'#b8d8ba',tusks:1,glow:1,eye:'#7cff5a',halo:'rgba(124,255,90,.2)',claws:'#b8d8ba'});
  }else if(k==='molten'){lava(1,'#ffe9a0','#e06a28','#f8b060');
  }else if(k==='mmolten'){lava(1.3,'#ffe9a0','#e06a28','#f8b060');
  }else if(k==='obsidian'){shards(1);
  }else if(k==='mobsidian'){shards(1.4);
  }else if(k==='blitz'){
    const o=hum({s:.85,tw:7,th:8,lh:5,hs:6,skin:'#f5e8c0',cloth:'#f5e28a',pants:'#8a7a20',stride:2.2,
      arms:'zombie',armLen:3,lean:1,eye:'#2a2008',boot:'#3a3008'});
    R(o.hx-3,o.hy-2,1,3,'#fff');R(o.hx-1,o.hy-4,1,5,'#fff');R(o.hx+1,o.hy-3,1,4,'#fff');R(o.hx+3,o.hy-2,1,3,'#fff');
    R(0,o.ty+1,2,2,'#8a7a20');R(-1,o.ty+3,2,2,'#8a7a20');R(1,o.ty+5,2,2,'#8a7a20');
    if(fl){R(-8,o.ty,1,3,'#fff');R(8,o.ty+4,1,2,'#fff');R(-7,o.ty+6,2,1,'#ffe')}
  }else if(k==='rmmolten'){lava(1.5,'#7cff5a','#c04a20','#7cff5a');
  }else if(k==='crawling_obsidian'){
    const q=1.35,t0=-(4+11)*q;
    R(-9*q,t0-3*q,2*q,5*q,'#8a7cc8');R(-6*q,t0-6*q,2*q,8*q,'#b8a8ff');R(-3*q,t0-5*q,2*q,7*q,'#8a7cc8');
    hum({s:q,tw:13,th:11,lh:4,hs:7,cloth:p[0],dark:p[1],light:'#6a5f8e',skin:'#4a4260',pants:p[1],boot:'#100c18',
      arms:'down',fist:true,claws:'#c8a8ff',lean:2,spikes:'#8a7cc8',glow:1,eye:'#c8a8ff',halo:'rgba(200,168,255,.22)',bob:.5});
  }else if(k==='tunneller'){
    const o=hum({s:1.05,tw:12,th:11,lh:5,hs:7,skin:'#b88858',cloth:'#6a5540',pants:'#3a2c1c',arms:'down',fist:true,
      claws:'#c8c0a0',helm:'#c8a860',helmTop:1,eye:'#2a1a08',boot:'#241a10'});
    R(o.hx+o.hs/2-1,o.hy-1,3,3,'#ffe9a0');R(o.hx+o.hs/2+2,o.hy,2,1,'rgba(255,233,160,.5)');
    R(o.tw/2+3,o.ty-2,2,14,'#6a4a2c');R(o.tw/2,o.ty-3,8,2,'#8a8a92');R(o.tw/2+6,o.ty-3,2,4,'#8a8a92')
  }else if(k==='nightstalker'){
    hum({s:1,tw:10,th:11,lh:5,hs:7,cloth:'#2c2438',dark:'#181226',light:'#4a3c60',skin:'#3a3048',pants:'#181226',
      hood:'#2c2438',cape:'#1c1628',arms:'zombie',armLen:5,claws:'#b89aff',glow:1,eye:'#b89aff',lean:.5,boot:'#0c0814'});
  }else if(k==='wraithling'){
    const sw=Math.sin(e.anim*5);
    for(let i=0;i<7;i++){const ww=6-i*.6,xo=Math.sin(e.anim*5+i*.8)*1.5*(i/6);
      R(-ww/2-1+xo,-3-i*1.5,ww+2,2,i%2?p[1]:p[0])}
    R(-5,-14+sw*.5,10,7,p[0]);R(-5,-14+sw*.5,10,1,p[2]);R(-5,-8+sw*.5,10,1,p[1]);
    R(-4,-13+sw*.5,8,5,'#0a0612');
    R(-3,-12+sw*.5,2,2,'#e8dcff');R(1,-12+sw*.5,2,2,'#e8dcff');R(-4,-13+sw*.5,8,1,p[2])
  }else if(k==='lurker'){
    const q=1.1,t0=-(4+12)*q;
    R(-9*q,t0-3*q,2*q,5*q,'#6a5aa8');R(-6*q,t0-6*q,2*q,8*q,'#9a8aff');R(-3*q,t0-4*q,2*q,6*q,'#6a5aa8');
    const o=hum({s:q,tw:15,th:12,lh:4,hs:7,cloth:'#20182c',dark:'#100c18',light:'#3a2c50',skin:'#2c2038',pants:'#100c18',
      boot:'#08060e',arms:'down',fist:true,claws:'#9a8aff',lean:2,bob:.5,stride:.7});
    R(o.hx-o.hs*.4-1,o.hy+1,3,4,'rgba(154,138,255,.22)');
    R(o.hx-o.hs*.4,o.hy+2,2,2,'#9a8aff');R(o.hx+o.hs*.05,o.hy+1,2,2,'#9a8aff');R(o.hx+o.hs*.3,o.hy+3,2,2,'#9a8aff')
  }else if(k==='whisper'){
    const bb=Math.sin(e.anim*4)*2;
    g.globalAlpha=.55;
    R(-11,-14+bb,6,3,p[2]);R(-13,-12+bb,4,3,p[2]);R(5,-14+bb,6,3,p[2]);R(9,-12+bb,4,3,p[2]);
    g.globalAlpha=1;
    for(let i=0;i<5;i++){const ww=8-i*1.3,xo=Math.sin(e.anim*4+i)*1.2;
      R(-ww/2+xo,-9+bb+i*1.4,ww,2,i%2?p[1]:p[0])}
    R(-4,-17+bb,8,8,p[0]);R(-4,-17+bb,8,1,p[2]);
    R(-3,-15+bb,6,5,'#0a0612');R(-2,-14+bb,2,2,'#e8dcff');R(1,-14+bb,2,2,'#e8dcff')
  }else if(k==='faceless_guardian'){
    hum({s:1.3,tw:12,th:13,lh:6,hs:6,cloth:'#3a3248',dark:'#161220',light:'#6a5f8e',skin:'#5a5070',pants:'#241c32',
      boot:'#0c0814',plates:'#4a4060',spikes:'#8a7cc8',mask:'#6a5f8e',cape:'#1c1628',arms:'down',fist:true,bob:.4,stride:.8});
  }else if(k==='tank'){
    const o=hum({s:1.35,tw:14,th:13,lh:4,hs:6,cloth:'#6a7480',dark:'#3c4450',light:'#9aa4b2',skin:'#5a6470',pants:'#3c4450',
      boot:'#20262e',plates:'#8a94a2',helm:'#5a6470',eye:'#ff5040',arms:'down',fist:true,bob:.3,stride:.7});
    const s=o.s;
    R(-5*s,o.ty+3*s,s,s,'#1c2026');R(4*s,o.ty+3*s,s,s,'#1c2026');R(-5*s,o.ty+7*s,s,s,'#1c2026');R(4*s,o.ty+7*s,s,s,'#1c2026');
    R(o.tw/2-2*s,o.ty-s,5*s,2*s,'#3c4450');R(o.tw/2+2*s,o.ty-3*s,6*s,3*s,'#20262e');R(o.tw/2+7*s,o.ty-2*s,2*s,s,'#ff5040')
  }else if(k==='rtank'){
    const o=hum({s:1.5,tw:14,th:13,lh:4,hs:6,cloth:'#5a7050',dark:'#33422c',light:'#88a878',skin:'#6a8a60',pants:'#33422c',
      boot:'#1c2418',plates:'#6a8a5c',ribs:'#b8d8a8',helm:'#4a6040',eye:'#7cff5a',arms:'down',fist:true,bob:.3,stride:.7});
    const s=o.s;R(-2*s,o.ty-s,s,3*s,'#2a3a20');R(2*s,o.ty,s,2*s,'#2a3a20')
  }else if(k==='fbrute'){
    const o=hum({s:1.5,tw:14,th:12,lh:4,hs:6,skin:'#c88a6a',cloth:p[0],dark:p[1],light:'#b86a52',pants:'#3a1c18',boot:'#1c0c08',
      arms:'down',fist:true,horns:'#d8c8a0',spikes:'#d8c8a0',tusks:1,glow:1,eye:'#ff9a3a',halo:'rgba(255,154,58,.25)',bob:.3});
    const s=o.s;
    R(-o.tw/2,o.ty+o.th-4*s,o.tw,s,'#8a8a92');R(-o.tw/2+2*s,o.ty+o.th-3*s,s,2*s,'#8a8a92');R(2*s,o.ty+o.th-3*s,s,2*s,'#8a8a92')
  }else if(k==='crawler'){
    const lg=function(lx,ph){R(lx,-4,3,3,p[1]);R(lx-1,-2,3,2+ph,p[1]);R(lx-2,ph,5,2,'#241c2c')};
    for(let i=0;i<3;i++){const lx=-18+i*11,ph=Math.sin(e.anim*10+i*2)>0?2:-2;lg(lx,ph);lg(lx+5,-ph)}
    R(-22,-15+wob*.2,44,13,p[0]);R(-22,-15+wob*.2,44,3,'#6a5a74');
    for(let i=0;i<4;i++){R(-17+i*11,-15+wob*.2,2,13,'#241c2c');R(-20+i*11,-14+wob*.2,3,1,'#8a7a94')}
    for(let i=0;i<4;i++)R(-19+i*11,-18+wob*.2,3,3,'#8a7a94');
    R(-26,-12+wob*.2,5,6,p[0]);R(-29,-10+wob*.2,3,3,'#6a5a74');R(-31,-9+wob*.2,2,2,'#c8ff5a');
    R(16,-18+wob*.2,12,11,p[1]);R(16,-18+wob*.2,12,2,'#6a5a74');
    R(19,-15+wob*.2,3,3,'#c8ff5a');R(24,-14+wob*.2,3,3,'#c8ff5a');R(21,-11+wob*.2,2,2,'#c8ff5a');
    R(28,-14+wob*.2,5,2,p[1]);R(28,-9+wob*.2,5,2,p[1]);R(32,-12+wob*.2,2,3,'#d8c8a0');R(32,-9+wob*.2,2,3,'#d8c8a0');
    R(22,-22+wob*.2,1,4,p[2]);R(26,-21+wob*.2,1,3,p[2])
  }else if(k==='oknight'){
    const o=hum({s:1.4,tw:12,th:13,lh:5,hs:6,cloth:'#3c3550',dark:'#1e1a2c',light:'#6a5f8e',skin:'#2c2640',pants:'#1e1a2c',
      boot:'#0e0c18',plates:'#4a4262',spikes:'#6a5f8e',helm:'#2c2640',eye:'#b0e0ff',cape:'#2a2038',arms:'down',fist:true,bob:.3,stride:.7});
    const s=o.s;
    R(o.tw/2+3*s,o.ty-8*s,2*s,19*s,'#8a82b0');R(o.tw/2+3*s,o.ty-8*s,s,19*s,'#c8c0e8');
    R(o.tw/2+s,o.ty+9*s,6*s,2*s,'#4a4262');R(o.tw/2+3*s,o.ty+11*s,2*s,3*s,'#2c2640');
    R(o.hx-s,o.hy-6*s,2*s,5*s,'#b0e0ff');R(o.hx-2*s,o.hy-4*s,s,3*s,'#7ec8e8')
  }else if(k==='mking'){lava(1.6,'#ffe9a0','#e05818','#f8a840','#f5c56a');
  }else if(k==='wfbrute'){
    const o=hum({s:1.4,tw:13,th:12,lh:4,hs:6,skin:'#c8a898',cloth:'#7a4a44',dark:'#3c2420',light:'#a07a6a',pants:'#3c2420',
      boot:'#1c1010',arms:'down',fist:true,horns:'#a89888',tusks:1,eye:'#f0d0c0',lean:1.2,bob:.8});
    const s=o.s;
    R(-o.tw/2,o.ty+3*s,o.tw,s,'#e8dcc8');R(-o.tw/2,o.ty+6*s,o.tw,s,'#e8dcc8');R(-o.tw/2+s,o.ty+4*s,s,2*s,'#e8dcc8');
    R(o.hx+o.hs/2+s,o.hy-3*s,s,2*s,'#1c1010')
  }else if(k==='oking'){
    const o=hum({s:1.8,tw:13,th:12,lh:4,hs:6,cloth:'#35304a',dark:'#16121f',light:'#5c5480',skin:'#2a2440',pants:'#16121f',
      boot:'#0a0810',plates:'#403a5c',spikes:'#8a7cff',crown:'#7a6cd8',cape:'#251f3a',arms:'down',fist:true,glow:1,eye:'#8a7cff',
      halo:'rgba(138,124,255,.25)',bob:.25,stride:.6});
    const s=o.s;
    R(o.tw/2+1.8*s,o.ty-s,s,13*s,'#5c5480');R(o.tw/2+s,o.ty-4*s,3*s,3*s,'#b8a8ff');R(o.tw/2+1.8*s,o.ty-5*s,s,s,'#fff')
  }else if(k==='endbringer'){
    const o=hum({s:2.6,tw:13,th:13,lh:4,hs:6,cloth:'#1a1424',dark:'#0c0812',light:'#3a2c50',skin:'#120c1c',pants:'#0c0812',
      boot:'#06040a',plates:'#241a34',spikes:'#8a7cff',crown:'#4a3a70',cape:'#140e1e',arms:'down',fist:true,glow:1,eye:'#c8b8ff',
      halo:'rgba(200,184,255,.25)',bob:.15,stride:.5});
    const s=o.s;
    R(-2*s,o.ty+4*s,4*s,4*s,'rgba(138,124,255,.35)');R(-s*1.2,o.ty+4.8*s,2.4*s,2.4*s,'#8a7cff');R(-s*.5,o.ty+5.5*s,s,s,'#fff');
    const fl2=Math.sin(e.anim*3)>0?2:-2;
    R(-13*s,o.ty+3*s+fl2,s,3*s,'#8a7cff');R(-11.5*s,o.ty-2*s-fl2,s,2*s,'#6a5cd8');R(12*s,o.ty+s-fl2,s,3*s,'#8a7cff');R(10.5*s,o.ty-3*s+fl2,s,2*s,'#6a5cd8');
    R(o.hx-2*s,o.hy+s,s*.8,s*.8,'#c8b8ff');R(o.hx+s,o.hy+s,s*.8,s*.8,'#c8b8ff')
  }else if(k==='silent_exec'){
    const o=hum({s:1.6,tw:11,th:13,lh:5,hs:6,cloth:'#1a1424',dark:'#0c0814',light:'#3a2c50',skin:'#2c2438',pants:'#0c0814',
      boot:'#06040a',hood:'#1a1424',mask:null,cape:'#120c1c',arms:'down',fist:true,glow:1,eye:'#8a7cc8',bob:.3,stride:.8});
    const s=o.s;
    R(-o.hs*.5-1,o.hy+o.hs*.55,o.hs+2,o.hs*.4,'#c8c8d8');
    R(o.tw/2+2*s,o.ty-12*s,3,20*s,'#c8c8d8');R(o.tw/2+2*s,o.ty-12*s,1,20*s,'#ffffff');
    R(o.tw/2+s,o.ty+8*s,7,2,'#4a3a50');R(o.tw/2+2*s,o.ty+10*s,3,4,'#2c2038')
  }else if(k==='stealth_tunneller'){
    const q=2.2;
    for(let i=0;i<3;i++){const ph=Math.sin(e.anim*8+i*2)>0?2:-2;R(-6*q+i*5*q,-4*q,4*q,4*q+ph,'#241c2c');R(-6*q+i*5*q,-q+ph,5*q,q,'#120e18')}
    R(-11*q,-12*q,4*q,7*q,p[1]);R(-12*q,-9*q,q,3*q,'#c8b8ff');
    R(-9*q,-14*q+wob*.25,17*q,11*q,p[0]);R(-6*q,-17*q+wob*.25,11*q,3*q,p[0]);R(-6*q,-17*q+wob*.25,11*q,q,'#4a3c60');
    R(-9*q,-14*q+wob*.25,17*q,q,'#4a3c60');
    R(-9*q,-9*q,17*q,q,'#120e18');R(-9*q,-6*q,17*q,q,'#120e18');
    R(2*q,-13*q,6*q,3*q,'#0a0612');R(3*q,-12*q,q,q,'#c8b8ff');R(5*q,-12*q,q,q,'#c8b8ff');R(7*q,-12*q,q*.8,q,'#c8b8ff');
    R(-6*q,-12*q,2*q,2*q,'#c8b8ff');R(-2*q,-11*q,2*q,q,'#c8b8ff');
    const dz=Math.floor(e.anim*6);
    for(let i=0;i<4;i++){const hh2=(9-i*2.2)*q,x0=(8+i*2.4)*q;
      R(x0,-8.5*q-hh2/2,2.4*q,hh2,((i+dz)%2)?'#c8c0d8':'#6a6a80')}
    R(8*q,-14*q,2*q,2*q,p[1])
  }else if(k==='faceless'){
    const q=2.2,bw=Math.sin(e.anim*4)*1.5;
    for(let i=0;i<6;i++)R(-(8-i*.6)*q,-(i+1)*3.4*q,(16-i*1.2)*q,3.6*q,i%2?p[0]:'#2c2440');
    R(-q,-14*q,2*q,10*q,'#120e18');
    R(-5*q,-23*q+bw*.3,10*q,6*q,p[0]);R(-5*q,-23*q+bw*.3,10*q,2*q,'#4a4062');
    R(-6*q,-25*q+bw*.3,12*q,6*q,p[0]);R(-4*q,-28*q+bw*.3,8*q,4*q,p[0]);
    R(-3*q,-26*q+bw*.3,6*q,6*q,'#e8e0f0');R(-3*q,-26*q+bw*.3,6*q,q,'#ffffff');R(-3*q,-21*q+bw*.3,6*q,q,'#b8b0c8');
    R(-9*q,-21*q,3*q,15*q,'#221c30');R(6*q,-21*q,3*q,15*q,'#221c30');
    R(-9*q,-7*q,3*q,3*q,'#d8d0e8');R(6*q,-7*q,3*q,3*q,'#d8d0e8');
    R(-8*q,-4*q,q,3*q,'#d8d0e8');R(7*q,-4*q,q,3*q,'#d8d0e8')
  }else if(k==='fallen_oking'){
    const o=hum({s:1.9,tw:13,th:12,lh:4,hs:6,cloth:'#2a2036',dark:'#120c1c',light:'#5a4a78',skin:'#241c34',pants:'#120c1c',
      boot:'#08060e',plates:'#3a2e4c',spikes:'#7a6ba8',torn:1,cape:'#1c1428',arms:'down',fist:true,glow:1,eye:'#c8b8ff',
      halo:'rgba(200,184,255,.25)',bob:.3,stride:.6});
    const s=o.s;
    R(o.hx-o.hs/2-s,o.hy-s,o.hs+2*s,Math.max(1,s*1.3),'#7a6ba8');R(o.hx-o.hs/2-s,o.hy-4*s,s*1.5,3*s,'#7a6ba8');R(o.hx+o.hs/2-s*.5,o.hy-3*s,s*1.5,2*s,'#7a6ba8');
    R(-3*s,o.ty+2*s,s,5*s,'#120c1c');R(s,o.ty+4*s,s,6*s,'#120c1c');R(2*s,o.ty+3*s,2*s,s,'#c8b8ff')
  }else if(k==='the_unseen'){
    const bb=Math.sin(e.anim*3)*3;
    g.globalAlpha=.22;R(-26,-48+bb,52,44,'#6a5a9a');R(-30,-38+bb,60,28,'#6a5a9a');g.globalAlpha=1;
    g.globalAlpha=.85;R(-29,-32+bb,8,16,p[1]);R(21,-32+bb,8,16,p[1]);R(-32,-24+bb,4,10,p[1]);R(28,-24+bb,4,10,p[1]);g.globalAlpha=1;
    for(let i=0;i<7;i++)R(-20+i*6,-9+bb,4,5+Math.abs(Math.sin(e.anim*4+i))*7,i%2?p[1]:p[0]);
    R(-12,-44+bb,24,3,p[0]);R(-17,-41+bb,34,3,p[0]);R(-20,-38+bb,40,30,p[0]);
    R(-12,-44+bb,24,1,'#2a2040');R(-20,-38+bb,40,1,'#2a2040');R(-20,-12+bb,40,2,p[1]);
    const px=Math.round(Math.sin(e.anim*1.5)*1.5);
    for(let i=0;i<3;i++){const ex=-14+i*10;
      R(ex-2,-33+bb,12,9,'rgba(232,220,255,.2)');R(ex,-32+bb,8,7,'#e8dcff');R(ex+2+px,-30+bb,3,4,'#08060e')}
    for(let i=0;i<8;i++)R(-14+i*4,-20+bb+(i%2),2,2,'#e8dcff')
  // ================= NIGHTMARE (redesigned) =================
  }else if(k==='blood_clot'){
    const s=1.05,pu=Math.sin(e.anim*9)*.5+.5;
    const o=hum({s:s,tw:12,th:12,lh:4,hs:7,skin:'#6a0c14',cloth:'#7a1420',dark:'#3a060c',light:'#b83040',
      pants:'#3a0810',boot:'#1c0206',arms:'zombie',armLen:5,claws:'#e05060',eye:'#ffc0b0',glow:1,
      halo:'rgba(255,90,90,.3)',lean:.6,bob:1.2,ribs:'#c04050',torn:1});
    // big clot growth on the back + pulsing lumps
    R(-o.tw/2-3*s,o.ty-2*s,5*s,6*s+pu,p[0]);R(-o.tw/2-3*s,o.ty-2*s,5*s,s,p[2]);R(-o.tw/2-2*s,o.ty-s,2*s,2*s,'#f0808a');
    R(o.tw/2-s,o.ty+5*s+pu,5*s,5*s,p[1]);R(o.tw/2,o.ty+6*s+pu,2*s,2*s,p[2]);
    R(-2*s,o.ty+s-pu*.5,5*s,5*s,p[1]);R(-s,o.ty+2*s-pu*.5,2*s,2*s,'#f0808a');
    // dark veins
    R(-4*s,o.ty+6*s,s,4*s,'#2a0408');R(-3*s,o.ty+9*s,3*s,s,'#2a0408');R(3*s,o.ty+2*s,s,3*s,'#2a0408');
    // gaping mouth
    R(o.hx-1,o.hy+o.hs*.65,3,2,'#1a0206');
    // dripping blood
    for(let i=0;i<3;i++){const dp=(e.anim*1.6+i*.37)%1;
      R(-4*s+i*4*s,o.ty+o.th+dp*7,Math.max(1,s),Math.max(1,2*s),'#c02838')}
    if(fl){R(o.tw/2+s,o.ty+3*s,s,2*s,'#ff7080')}
  }else if(k==='splitter'){
    const s=.95,sq=Math.sin(e.anim*6),sw=sq*1.3,bw=1+sq*.06;
    // wobbling gelatin body (stacked rows, widest at the base)
    const rows=[[6,-18],[9,-16],[12,-13],[14,-10],[15,-7],[15,-4],[14,-1]];
    for(const r of rows){const wd=r[0]*s*bw;R(-wd,r[1]*s+sw*.4,wd*2,3.2*s,p[0])}
    for(const r of rows){const wd=(r[0]-2)*s*bw;if(wd>0)R(-wd,r[1]*s+sw*.4+s,wd*2-2,2.2*s,p[2])}
    // shine + dark rim
    R(-8*s,-14*s+sw*.4,3*s,s,'#fff0f0');R(-9*s,-12*s+sw*.4,s,2*s,'#fff0f0');
    R(-14*s*bw,-3*s,28*s*bw,s,p[1]);
    // visible split seam with a second nucleus (about to divide)
    R(0,-17*s+sw*.4,s,16*s,p[1]);
    R(-5*s,-9*s+sw*.4,4*s,4*s,p[1]);R(2*s,-9*s+sw*.4,4*s,4*s,p[1]);
    R(-4*s,-8*s+sw*.4,2*s,2*s,'#ff8a98');R(3*s,-8*s+sw*.4,2*s,2*s,'#ff8a98');
    // eyes
    R(-6*s,-13*s+sw,3*s,3*s,'#fff');R(3*s,-13*s+sw,3*s,3*s,'#fff');
    R(-5*s+(sq>0?1:0),-12*s+sw,s*1.5,2*s,'#2c0408');R(4*s+(sq>0?1:0),-12*s+sw,s*1.5,2*s,'#2c0408');
    // wide grin
    R(-4*s,-5*s+sw*.3,8*s,s,'#2c0408');R(-4*s,-6*s+sw*.3,s,s,'#2c0408');R(3*s,-6*s+sw*.3,s,s,'#2c0408');
    // bud on the side that wiggles
    R(11*s*bw,-6*s,4*s,4*s,p[0]);R(12*s*bw,-6*s,2*s,s,p[2]);
    // drips
    const dp=(e.anim*1.3)%1;R(-9*s,-s+dp*3,s,2*s,p[2]);
  }else if(k==='damned'){
    const s=.95,fa=Math.sin(e.anim*14),fb=Math.sin(e.anim*11+1);
    const o=hum({s:s,tw:8,th:9,lh:6,hs:6,skin:'#4a1018',cloth:'#2a0a0e',dark:'#16040a',light:'#7a2028',
      pants:'#240a0e',boot:'#0e0204',arms:'zombie',armLen:5,lean:1.8,stride:1.9,claws:'#ff9a6a',eye:'#ffd080',
      glow:1,halo:'rgba(255,140,60,.35)',bob:1.3,ribs:'#d07050'});
    // flaming hair
    R(o.hx-3*s,o.hy-(3+fa)*s,2*s,(3+fa)*s,'#c82a14');R(o.hx-s,o.hy-(5+fb*1.3)*s,2*s,(5+fb*1.3)*s,'#ff7a1e');
    R(o.hx+s,o.hy-(3+fa)*s,2*s,(3+fa)*s,'#c82a14');R(o.hx-s*.5,o.hy-(3+fb)*s,s,(3+fb)*s,'#ffe090');
    // screaming mouth
    R(o.hx-1,o.hy+o.hs*.6,3,3,'#0a0204');R(o.hx,o.hy+o.hs*.6+2,1,1,'#ff6a3a');
    // burning cracks on skin
    R(-2*s,o.ty+s,s,4*s,'#ff7a1e');R(s,o.ty+4*s,s,3*s,'#ff7a1e');R(-3*s,o.ty+5*s,2*s,s,'#ffb050');
    // broken chain trailing behind
    const ch=Math.sin(e.anim*10);
    for(let i=0;i<4;i++)R(-o.tw/2-(3+i*2.4)*s,o.ty+4*s+i*s*.8+ch*i*.6,2*s,s*1.4,i%2?'#6a6a74':'#9a9aa6');
    // speed streaks + embers
    R(-o.tw/2-9*s,o.ty+2*s,6,1,'rgba(255,170,120,.4)');R(-o.tw/2-11*s,o.ty+7*s,7,1,'rgba(255,170,120,.28)');
    if(fl)R(o.tw/2+s,o.ty-3*s,s,s,'#ffb050');else R(-o.tw/2-s,o.ty-4*s,s,s,'#ffb050');
  }else if(k==='demonic_spirit'){
    const bb=Math.sin(e.anim*4)*2.2,wf=Math.sin(e.anim*8)*2;
    // membrane wings
    g.globalAlpha=.55;
    R(-15,-16+bb-wf,9,2,'#e05888');R(-13,-14+bb-wf,8,3,'#8a2050');R(-11,-11+bb-wf,6,3,'#e05888');
    R(6,-16+bb+wf,9,2,'#e05888');R(5,-14+bb+wf,8,3,'#8a2050');R(5,-11+bb+wf,6,3,'#e05888');
    g.globalAlpha=1;
    // flaming wisp tail
    for(let i=0;i<7;i++){const ww=8-i*1.05,xo=Math.sin(e.anim*5+i*.9)*1.8*(i/6);
      R(-ww/2+xo,-6+bb+i*1.6,ww,2,i%2?'#a02050':p[0]);
      if(i<5)R(-ww/4+xo,-6+bb+i*1.6,ww/2,1,'#ff9ab8')}
    // skull-like head
    R(-5,-17+bb,10,10,'#2a0618');R(-5,-17+bb,10,1,p[2]);R(-4,-16+bb,8,8,p[0]);
    R(-4,-9+bb,8,1,'#1a040c');R(-3,-8+bb,2,2,'#1a040c');R(1,-8+bb,2,2,'#1a040c');
    R(-4,-14+bb,3,3,'#12020a');R(1,-14+bb,3,3,'#12020a');
    R(-3,-13+bb,2,2,'#ff5a6a');R(2,-13+bb,2,2,'#ff5a6a');R(-3,-13+bb,1,1,'#fff');
    // curved horns
    R(-6,-19+bb,2,4,'#3a0a1c');R(-7,-22+bb,2,3,'#3a0a1c');R(-8,-23+bb,1,1,'#e05888');
    R(4,-19+bb,2,4,'#3a0a1c');R(5,-22+bb,2,3,'#3a0a1c');R(7,-23+bb,1,1,'#e05888');
    // soul-flame above
    const f1=2+Math.abs(Math.sin(e.anim*9))*3;R(-1,-24+bb-f1,2,f1,'#ff7a9a');R(0,-24+bb-f1*.5,1,f1*.5,'#fff');
    if(fl){g.globalAlpha=.22;R(-9,-20+bb,18,18,'#e05888');g.globalAlpha=1}
  }else if(k==='cloaker'){
    const s=1,ws=Math.sin(e.anim*7);
    // drifting shadow smoke trailing behind
    g.globalAlpha=.4;
    for(let i=0;i<5;i++){const xo=-8-i*4+ws*1.5,yo=-4-((i*3+e.anim*10)%9);R(xo,yo,5,2,'#12060e')}
    g.globalAlpha=1;
    const o=hum({s:s,tw:10,th:11,lh:5,hs:7,cloth:'#24101c',dark:'#120610',light:'#5a2a42',skin:'#2a1220',
      pants:'#120610',boot:'#08030a',hood:'#24101c',cape:'#180a14',arms:'down',fist:true,
      glow:1,eye:'#ff80b0',halo:'rgba(255,128,176,.35)',bob:.4,stride:.9});
    // tattered scarf flowing back
    R(-o.tw/2-1,o.ty+s,4,2,'#9a2a58');R(-o.tw/2-5-ws,o.ty+2*s,5,2,'#7a1e46');R(-o.tw/2-9-ws*2,o.ty+3*s+ws,5,2,'#5a1634');
    // belts and buckle
    R(-o.tw/2,o.ty+o.th-4*s,o.tw,s,'#5a2a42');R(-s,o.ty+o.th-4*s,2,2,'#e0a0c0');
    // twin daggers with a glint
    R(o.tw/2+2,o.ty-2,2,10,'#c8b8c0');R(o.tw/2+2,o.ty-2,1,10,'#fff');R(o.tw/2+1,o.ty+8,4,2,'#4a2a3a');
    R(-o.tw/2-5,o.ty,2,9,'#c8b8c0');R(-o.tw/2-5,o.ty,1,9,'#fff');R(-o.tw/2-6,o.ty+9,4,2,'#4a2a3a');
    if(fl)R(o.tw/2+2,o.ty-4,2,2,'#ffffff');
  }else if(k==='blood_soldier'){
    const o=hum({s:1.3,tw:13,th:12,lh:5,hs:6,skin:'#4a0c14',cloth:'#7a1c28',dark:'#3a0a12',light:'#d05460',
      pants:'#2a0810',boot:'#14040a',plates:'#9a2c3a',helm:'#5a1018',eye:'#ff6050',arms:'down',fist:true,
      spikes:'#e0a0a0',bob:.3,stride:.8});
    const s=o.s;
    // tattered cape behind
    R(-o.tw/2-s,o.ty+s,o.tw+2*s,o.th+o.lh*.7-s,'#4a0810');R(-o.tw/2-s,o.ty+o.th+o.lh*.4,o.tw+2*s,s*1.5,'#2a0408');
    // helmet crest + horns
    R(o.hx-s,o.hy-6*s,2*s,5*s,'#d03040');R(o.hx-2*s,o.hy-5*s,s,3*s,'#a02030');R(o.hx+s,o.hy-5*s,s,3*s,'#a02030');
    R(o.hx-o.hs/2-2*s,o.hy-2*s,2*s,s,'#e0d0c0');R(o.hx+o.hs/2,o.hy-2*s,2*s,s,'#e0d0c0');
    // blood emblem on chest + rivets
    R(-2*s,o.ty+4*s,4*s,4*s,'#d03040');R(-s,o.ty+5*s,2*s,2*s,'#ff8a90');
    R(-5*s,o.ty+3*s,s,s,'#e0c0c0');R(4*s,o.ty+3*s,s,s,'#e0c0c0');
    // halberd with dripping blade
    R(o.tw/2+3*s,o.ty-11*s,2*s,21*s,'#3a2418');
    R(o.tw/2+2*s,o.ty-15*s,6*s,5*s,'#c8c0b8');R(o.tw/2+2*s,o.ty-15*s,2*s,5*s,'#ffffff');R(o.tw/2+7*s,o.ty-13*s,2*s,2*s,'#c8c0b8');
    R(o.tw/2+2*s,o.ty-11*s,6*s,s,'#8a1a24');R(o.tw/2+3*s,o.ty-10*s,s,s+((e.anim*2)%1)*3,'#c02838');
    R(o.tw/2+s,o.ty-9*s,3*s,s,'#9a2c3a');
  }else if(k==='necromancer'){
    const s=1.2,fl3=Math.sin(e.anim*6),orb=e.anim*3;
    const o=hum({s:s,tw:11,th:12,lh:4,hs:7,cloth:'#2c1e3c',dark:'#140a1e',light:'#5a3a7a',skin:'#1c1228',
      pants:'#140a1e',boot:'#0a0610',hood:'#2c1e3c',cape:'#1c1228',arms:'down',fist:true,
      glow:1,eye:'#b8ff80',halo:'rgba(160,255,100,.3)',bob:.5,stride:.7});
    // robe hem + bone belt + tome
    R(-o.tw/2-s,o.ty+o.th-s,o.tw+2*s,2.5*s,'#140a1e');R(-o.tw/2-s,o.ty+o.th-s,o.tw+2*s,s,'#5a3a7a');
    R(-o.tw/2,o.ty+o.th-4*s,o.tw,s,'#d8cce8');R(-2*s,o.ty+o.th-4*s,2*s,2*s,'#e8dcf8');
    R(o.tw/2-4*s,o.ty+o.th-5*s,4*s,5*s,'#5a2a2a');R(o.tw/2-4*s,o.ty+o.th-5*s,4*s,s,'#c8a060');
    // rune on chest
    R(-s,o.ty+3*s,2*s,5*s,'#a0ff70');R(-2.5*s,o.ty+5*s,5*s,s,'#a0ff70');
    // staff topped with a skull and green soulfire
    R(o.tw/2+3*s,o.ty-13*s,2*s,23*s,'#3a2a20');
    R(o.tw/2+1.5*s,o.ty-17*s,5*s,5*s,'#e0d4ee');R(o.tw/2+1.5*s,o.ty-17*s,5*s,s,'#fff');
    R(o.tw/2+2.3*s,o.ty-15.5*s,1.4*s,1.6*s,'#140a1e');R(o.tw/2+4.3*s,o.ty-15.5*s,1.4*s,1.6*s,'#140a1e');
    R(o.tw/2+3.3*s,o.ty-13.2*s,1.4*s,s,'#140a1e');
    const sf=2+Math.abs(fl3)*2;R(o.tw/2+3*s,o.ty-17*s-sf*s,2*s,sf*s,'#80ff50');R(o.tw/2+3.5*s,o.ty-17*s-sf*s*.5,s,sf*s*.5,'#e0ffc0');
    // spectral hand with wisp
    R(-o.tw/2-3*s,o.ty-2*s+fl3,2.5*s,3*s,'#6aff50');R(-o.tw/2-4*s,o.ty-4*s+fl3,3*s,2*s,'#b8ff90');
    // orbiting bone shards
    for(let i=0;i<3;i++){const a=orb+i*2.09;R(Math.cos(a)*12*s,o.ty+4*s+Math.sin(a)*3*s,2,2,'#e0d4ee')}
  }else if(k==='healer'){
    const s=.95,pu=Math.sin(e.anim*5)*.5+.5;
    // soft green healing aura
    g.globalAlpha=.16+pu*.1;R(-11,-26,22,26,'#8ce89a');g.globalAlpha=1;
    const o=hum({s:s,tw:9,th:10,lh:4,hs:6,skin:'#d8c4b0',cloth:'#e4dcc8',dark:'#8a8070',light:'#fffcee',
      pants:'#a89c88',boot:'#5a4e3a',arms:'down',bob:.6,stride:.8,eye:'#2a6a3a'});
    // hood with shadowed face
    R(o.hx-o.hs/2-s,o.hy-1.5*s,o.hs+2*s,o.hs*.9+2.5*s,'#f0ead8');R(o.hx-o.hs/2-s,o.hy-1.5*s,o.hs+2*s,s,'#fff');
    R(o.hx-o.hs/2+s*.5,o.hy+s*.5,o.hs-s,o.hs*.6,'#2a2218');R(o.hx-1.5,o.hy+o.hs*.35,2,2,'#8ce89a');R(o.hx+1.5,o.hy+o.hs*.35,2,2,'#8ce89a');
    // green trim + cross
    R(-o.tw/2,o.ty,o.tw,s,'#5ac870');R(-o.tw/2,o.ty+o.th-2*s,o.tw,s,'#5ac870');
    R(-s,o.ty+2*s,2*s,6*s,'#8ce89a');R(-2.5*s,o.ty+4*s,5*s,2*s,'#8ce89a');R(-s*.5,o.ty+3*s,s,s,'#e0ffe0');
    // crystal staff
    R(o.tw/2+2*s,o.ty-3*s,2*s,13*s,'#6a5a40');
    R(o.tw/2+s,o.ty-8*s,4*s,5*s,'#8ce89a');R(o.tw/2+1.5*s,o.ty-8*s,s,5*s,'#e0ffe0');R(o.tw/2+2*s,o.ty-10*s,2*s,2*s,'#8ce89a');
    // floating healing motes
    for(let i=0;i<3;i++){const ph=(e.anim*.9+i*.33)%1;R((-8+i*8)*s+Math.sin(ph*6+i)*2,-2-ph*24,2,2,i%2?'#d8ffe0':'#8ce89a')}
  }else if(k==='royalguard'){
    const o=hum({s:1.4,tw:13,th:13,lh:5,hs:6,skin:'#2a1018',cloth:'#6a2234',dark:'#2a0e16',light:'#e8c070',
      pants:'#2a1018',boot:'#160a0e',plates:'#d8b060',helm:'#c89a40',eye:'#ffd88a',arms:'down',fist:true,
      cape:'#7a1a2c',bob:.3,stride:.7});
    const s=o.s;
    // plume on the helm
    R(o.hx-s,o.hy-5*s,2*s,4*s,'#d03040');R(o.hx-2*s,o.hy-4*s,s,3*s,'#a02030');R(o.hx+s,o.hy-4*s,s,3*s,'#a02030');
    R(o.hx-.5*s,o.hy-4*s,s,s,'#ff8a90');
    // gold pauldrons spikes + belt sash
    R(-o.tw/2-3*s,o.ty-2*s,s,2*s,'#f0d890');R(o.tw/2+2*s,o.ty-2*s,s,2*s,'#f0d890');
    R(-o.tw/2,o.ty+o.th-4*s,o.tw,s*1.5,'#d8b060');R(-s,o.ty+o.th-4*s,2*s,2*s,'#7a1a2c');
    // chest crest
    R(-2*s,o.ty+3*s,4*s,5*s,'#7a1a2c');R(-s,o.ty+4*s,2*s,3*s,'#ffe090');
    // tower shield with crest
    R(-o.tw/2-5*s,o.ty-s,5*s,13*s,'#7a1a2c');R(-o.tw/2-5*s,o.ty-s,5*s,s,'#e8c070');R(-o.tw/2-5*s,o.ty+11*s,5*s,s,'#e8c070');
    R(-o.tw/2-5*s,o.ty-s,s,13*s,'#e8c070');R(-o.tw/2-s,o.ty-s,s,13*s,'#a08040');
    R(-o.tw/2-3.5*s,o.ty+3*s,2*s,5*s,'#ffe090');R(-o.tw/2-4.5*s,o.ty+5*s,4*s,s,'#ffe090');
    // halberd
    R(o.tw/2+3*s,o.ty-12*s,2*s,22*s,'#3a2a1a');
    R(o.tw/2+2*s,o.ty-16*s,5*s,5*s,'#e8c070');R(o.tw/2+2*s,o.ty-16*s,2*s,5*s,'#fff0c0');R(o.tw/2+6*s,o.ty-14*s,2*s,2*s,'#e8c070');
    R(o.tw/2+2*s,o.ty-11*s,5*s,s,'#7a1a2c');
  }else if(k==='necro_monarch'){
    const s=2,fl4=Math.sin(e.anim*4),orb=e.anim*2.2;
    // purple soul aura
    g.globalAlpha=.14+Math.abs(fl4)*.06;R(-24,-62,48,60,'#9a6ad0');g.globalAlpha=1;
    const o=hum({s:s,tw:13,th:13,lh:5,hs:6,cloth:'#2c1e44',dark:'#120a20',light:'#6a4a9a',skin:'#1c1228',
      pants:'#120a20',boot:'#0a0610',robe:0,cape:'#1a0e2a',arms:'down',fist:true,
      glow:1,eye:'#d8a8ff',halo:'rgba(184,138,255,.4)',bob:.2,stride:.55});
    // layered robe hem with gold trim
    R(-o.tw/2-s,o.ty+o.th-s,o.tw+2*s,3*s,'#120a20');R(-o.tw/2-s,o.ty+o.th-s,o.tw+2*s,s*.8,'#d0a860');
    R(-o.tw/2,o.ty+2*s,o.tw,s*.8,'#d0a860');R(-s*.4,o.ty+2*s,s*.8,o.th-4*s,'#d0a860');
    // bone crown with jewel
    R(o.hx-o.hs/2-s,o.hy-3*s,o.hs+2*s,2*s,'#6a3aa0');
    for(let i=0;i<4;i++)R(o.hx-o.hs/2-s+i*(o.hs+s)/3,o.hy-(5+(i%2))*s,s,(3+(i%2))*s,'#e8dcf8');
    R(o.hx-s*.5,o.hy-2.8*s,s,s,'#ff6ad0');
    // ribcage glow + rune heart
    R(-3*s,o.ty+4*s,6*s,5*s,'#1a1028');for(let i=0;i<3;i++)R(-3*s,o.ty+(4.5+i*1.6)*s,6*s,s*.6,'#d8c8e8');
    R(-s,o.ty+5.5*s,2*s,2*s,'#d89aff');R(-s*.5,o.ty+6*s,s,s,'#fff');
    // tall staff with a swirling soul orb
    R(o.tw/2+4*s,o.ty-20*s,2*s,29*s,'#2a1a30');
    R(o.tw/2+2*s,o.ty-26*s,6*s,6*s,'rgba(154,106,208,.4)');R(o.tw/2+3*s,o.ty-25*s,4*s,4*s,'#9a5ad8');R(o.tw/2+4*s,o.ty-24*s,s,s,'#fff');
    R(o.tw/2+s,o.ty-22*s,s,3*s,'#d8c8e8');R(o.tw/2+8*s,o.ty-22*s,s,3*s,'#d8c8e8');
    // orbiting skulls
    for(let i=0;i<3;i++){const a=orb+i*2.09,sx=Math.cos(a)*18*s,sy=o.ty+2*s+Math.sin(a)*5*s;
      R(sx-1.5*s,sy-1.5*s,3*s,3*s,'#e8dcf8');R(sx-s,sy-.5*s,s*.8,s*.8,'#140a1e');R(sx+.3*s,sy-.5*s,s*.8,s*.8,'#140a1e')}
  }else if(k==='deformed_king'){
    const s=1.9,br=Math.sin(e.anim*5)*.8,tw2=Math.sin(e.anim*3);
    const o=hum({s:s,tw:15,th:13,lh:4,hs:6,cloth:'#7a2c3a',dark:'#2a0c14',light:'#d07a8a',skin:'#a05060',
      pants:'#3a1018',boot:'#1c080c',plates:'#8a3a48',spikes:'#e0a0aa',
      cape:'#4a1822',arms:'down',fist:true,tusks:1,eye:'#ffd0a0',bob:.35,stride:.6});
    // extra spindly third arm on the back
    R(-o.tw/2-4*s,o.ty+3*s,s,7*s+tw2*2,'#a05060');R(-o.tw/2-5*s,o.ty+9*s+tw2*2,3*s,s,'#a05060');
    // lumpy tumours (asymmetric, breathing)
    R(-o.tw/2-3*s,o.ty-s,5*s,5*s+br,'#8a3a48');R(-o.tw/2-2*s,o.ty,2*s,2*s,'#d07a8a');
    R(o.tw/2-s,o.ty-3*s,6*s,8*s+br,'#8a3a48');R(o.tw/2,o.ty-2*s,3*s,3*s,'#e0a0aa');R(o.tw/2+2*s,o.ty+2*s,s,s,'#2a0c14');
    R(-4*s,o.ty+5*s,7*s,5*s+br,'#7a2c3a');R(-3*s,o.ty+5.5*s,3*s,2*s,'#d07a8a');
    // stitched scars
    for(let i=0;i<4;i++)R(2*s,o.ty+(s+i*2*s),2*s,s*.6,'#2a0c14');
    // second small face on the shoulder, with open eye
    R(o.tw/2-3.5*s,o.ty+3*s,4*s,4*s,'#c07080');R(o.tw/2-3*s,o.ty+4*s,s,s,'#fff');R(o.tw/2-2.8*s,o.ty+4.2*s,s*.5,s*.6,'#2a0c14');
    R(o.tw/2-s,o.ty+4*s,s,s,'#2a0c14');R(o.tw/2-3*s,o.ty+6*s,3*s,s*.6,'#2a0c14');
    // crooked drooping crown
    R(o.hx-o.hs/2-s,o.hy-s,o.hs+2*s,1.5*s,'#b08050');
    R(o.hx-o.hs/2-s,o.hy-4*s,s*1.3,3.2*s,'#d0a060');R(o.hx+o.hs/2-s*.4,o.hy-2.5*s,s*1.3,2*s,'#d0a060');R(o.hx-s*.5,o.hy-5*s,s*1.3,4*s,'#d0a060');
    R(o.hx-s*.3,o.hy-4*s,s*.8,s*.8,'#ff5a6a');
    // drool
    R(o.hx+s,o.hy+o.hs*.9,s*.8,s+((e.anim*1.4)%1)*4,'#e0a0aa');
  }else if(k==='endbringer_guardian'){
    const s=2.4,pu=Math.sin(e.anim*3)*.5+.5;
    // void aura + floating shards
    g.globalAlpha=.12+pu*.08;R(-26,-64,52,62,'#8a7cff');g.globalAlpha=1;
    const o=hum({s:s,tw:13,th:13,lh:4,hs:6,cloth:'#221a3c',dark:'#0a0816',light:'#5a4a98',skin:'#120c20',
      pants:'#0a0816',boot:'#05030a',plates:'#2e2450',spikes:'#a89cff',helm:'#1c1432',
      cape:'#120a22',arms:'down',fist:true,glow:1,eye:'#d8ccff',halo:'rgba(200,184,255,.3)',bob:.2,stride:.55});
    // great helm eye-slit glow + horn-wings
    R(o.hx-o.hs/2+s*.5,o.hy+o.hs*.38,o.hs-s,s*.9,'#d8ccff');
    R(o.hx-o.hs/2-2*s,o.hy-s,s,3*s,'#a89cff');R(o.hx+o.hs/2+s,o.hy-s,s,3*s,'#a89cff');R(o.hx-.5*s,o.hy-3*s,s,3*s,'#a89cff');
    // glowing runes on armour
    R(-3*s,o.ty+2*s,s*.7,3*s,'#a89cff');R(2*s,o.ty+3*s,s*.7,3*s,'#a89cff');R(-2*s,o.ty+7*s,4*s,s*.7,'#a89cff');
    // void eye core on chest
    R(-2.4*s,o.ty+3.6*s,4.8*s,4.8*s,'rgba(138,124,255,.35)');R(-1.4*s,o.ty+4.6*s,2.8*s,2.8*s,'#8a7cff');R(-s*.5,o.ty+5.4*s,s,s*1.2,'#05030a');
    // massive tower shield
    R(-o.tw/2-7*s,o.ty-7*s,7*s,18*s,'#1c1432');R(-o.tw/2-7*s,o.ty-7*s,7*s,s,'#a89cff');R(-o.tw/2-7*s,o.ty+10*s,7*s,s,'#a89cff');
    R(-o.tw/2-7*s,o.ty-7*s,s,18*s,'#a89cff');R(-o.tw/2-s,o.ty-7*s,s,18*s,'#5a4a98');
    R(-o.tw/2-4.5*s,o.ty-3*s,2*s,11*s,'#a89cff');R(-o.tw/2-6*s,o.ty+s,5*s,2*s,'#a89cff');
    R(-o.tw/2-4*s,o.ty,s,s,'#fff');
    // greatsword planted at the side
    R(o.tw/2+3*s,o.ty-10*s,2*s,24*s,'#6a5ab0');R(o.tw/2+3*s,o.ty-10*s,s*.7,24*s,'#e0d8ff');
    R(o.tw/2+s,o.ty+13*s,6*s,s*1.4,'#2e2450');
    // orbiting void shards
    const fz=Math.sin(e.anim*3)>0?2:-2;
    R(-14*s,o.ty+3*s+fz,s,3*s,'#8a7cff');R(13*s,o.ty+s-fz,s,3*s,'#8a7cff');R(11.5*s,o.ty-4*s+fz,s,2*s,'#6a5cd8');
  }else if(k==='error_void_leak'){
    const q=1.8,dz=Math.floor(e.anim*9),gx=Math.sin(e.anim*7)*2,fz=(dz%7)===0;
    // RGB split ghosts of the body
    g.globalAlpha=.35;
    R(-10*q-3,-26*q,20*q,24*q,'#ff2a6a');R(-10*q+3,-26*q,20*q,24*q,'#2affea');
    g.globalAlpha=1;
    // corrupted glitch body: shifted horizontal slabs
    for(let i=0;i<7;i++){
      const off=((i+dz)%3===0)?gx*((i%2)?1:-1)*.8:0,wd=(i%3===1?18:20)*q;
      R(-wd/2+off,-(i+1)*3.7*q,wd,3.3*q,i%2?p[0]:p[1]);
      if((i+dz)%4===0)R(-wd/2+off,-(i+1)*3.7*q,6*q,3.3*q,'#b060ff');
      if((i+dz)%5===1)R(wd/2-5*q+off,-(i+1)*3.7*q,5*q,q,'#2affea')}
    // scanlines
    for(let i=0;i<9;i++)R(-11*q,-i*3*q-q,22*q,1,'rgba(8,4,16,.45)');
    // void rift core with flickering eye
    const vy=-17*q;
    R(-6*q,vy,12*q,8*q,'#05020a');R(-4*q,vy+q,8*q,6*q,'#b060ff');R(-2*q,vy+2*q,4*q,4*q,'#ff3af0');R(-q*.6,vy+2.6*q,q*1.2,2.8*q,'#fff');
    // error glyph blocks
    R(-9*q,-8*q,3*q,q,'#fff');R(-9*q,-8*q,q,3*q,'#fff');R(6*q,-20*q,3*q,q,'#ff3af0');R(8*q,-20*q,q,3*q,'#ff3af0');
    // floating error fragments
    for(let i=0;i<7;i++){const fx=(-12+((i*5+dz*3)%25))*q,fy=-(2+((i*7+dz*2)%24))*q;
      R(fx,fy,(2+(i%2))*q,q,(i+dz)%3===0?'#ff3af0':((i+dz)%3===1?'#2affea':'#b060ff'))}
    if(fz){g.globalAlpha=.3;R(-14*q,-22*q,28*q,22*q,'#b060ff');g.globalAlpha=1;R(-12*q,-12*q,24*q,q*1.2,'#fff')}
  }else if(k==='the_misplaced'){
    const q=2.1,bw=Math.sin(e.anim*3)*1.5,tn=Math.sin(e.anim*4);
    // pooling blood beneath
    g.globalAlpha=.55;R(-20*q,-2*q,40*q,2.2*q,'#3a0810');g.globalAlpha=1;
    // writhing base of fused limbs
    R(-16*q,-8*q,32*q,8*q,p[1]);
    for(let i=0;i<8;i++){const lx=(-15+i*4.4)*q,lh=(5+Math.abs(Math.sin(e.anim*4+i))*7)*q;
      R(lx,-8*q,3.6*q,lh,i%2?p[0]:p[1]);R(lx,-8*q+lh-q,3.6*q,q,'#c05868')}
    // main body mass with shading
    R(-14*q,-21*q+bw*.3,28*q,14*q,p[0]);R(-14*q,-21*q+bw*.3,28*q,2*q,p[2]);R(-14*q,-9*q,28*q,2*q,p[1]);
    R(-10*q,-27*q+bw*.5,20*q,7*q,p[0]);R(-10*q,-27*q+bw*.5,20*q,q,p[2]);R(-6*q,-30*q+bw*.5,12*q,4*q,p[0]);
    // central gaping maw with teeth
    R(-5*q,-16*q+bw*.4,10*q,6*q,'#12020a');
    for(let i=0;i<5;i++){R(-4.5*q+i*2*q,-16*q+bw*.4,q,2*q,'#e8dcc8');R(-3.5*q+i*2*q,-10.8*q+bw*.4,q,1.6*q,'#e8dcc8')}
    R(-2*q,-13*q+bw*.4,4*q,2*q,'#c04050');
    // many faces peering out of the flesh, each with eyes
    const fcs=[[-12,-19],[8,-18],[-11,-12],[9,-11],[-3,-26],[3,-24]];
    for(let i=0;i<fcs.length;i++){const fx=fcs[i][0]*q,fy=fcs[i][1]*q+bw*.4;
      R(fx,fy,3.4*q,3.4*q,'#d06878');R(fx,fy,3.4*q,q*.6,'#e8a0a8');
      R(fx+.5*q,fy+q,q,q,'#fff');R(fx+2*q,fy+q,q,q,'#fff');
      R(fx+.7*q,fy+1.2*q,q*.5,q*.6,'#2c0408');R(fx+2.2*q,fy+1.2*q,q*.5,q*.6,'#2c0408');
      R(fx+q,fy+2.5*q,1.4*q,q*.5,'#2c0408')}
    // reaching arms with grasping hands
    R(-18*q,-17*q+bw*.4,3*q,12*q,p[1]);R(-19*q,-6*q+bw*.4,5*q,3*q,'#d06878');R(-20*q,-4*q+bw*.4+tn,q,2*q,'#d06878');R(-17*q,-4*q+bw*.4-tn,q,2*q,'#d06878');
    R(15*q,-19*q-bw*.4,3*q,13*q,p[1]);R(14*q,-7*q-bw*.4,5*q,3*q,'#d06878');R(18*q,-5*q-bw*.4-tn,q,2*q,'#d06878');R(15*q,-5*q-bw*.4+tn,q,2*q,'#d06878');
    // dripping blood
    for(let i=0;i<4;i++){const dp=(e.anim*1.2+i*.27)%1;R((-9+i*6)*q,-8*q+dp*8*q,q*.8,2*q,'#c02838')}
    if(fl){R(-6*q,-3*q,1.5*q,3*q,'#c04050');R(5*q,-2*q,1.5*q,4*q,'#c04050')}
  }else{
    hum({s:1,tw:10,th:11,lh:5,hs:7,arms:'zombie',glow:1})
  }
}
function drawEnemy(g,e){
  if(e.digging)return;
  const art=enemyArt(e.cfg),top=-art.height;
  g.save();g.translate(e.sx,e.sy);
  // split-off copies render smaller so a splitter visibly divides in two
  const sc=e.scale&&e.scale!==1?e.scale:1;
  if(sc!==1)g.scale(sc,sc);
  if(e.cfg.flying)g.translate(0,-14+Math.sin(e.anim*4)*3);
  if(e.stealth)g.globalAlpha=.55;
  // ART V2 sprites flash as a white silhouette instead of a white box
  if(e.flash>0&&!(typeof artEnemySprite==='function'&&artEnemySprite(e.cfg))){g.globalAlpha=.45;g.fillStyle='#fff';
    g.fillRect(-art.width/2,top,art.width,art.height);g.globalAlpha=e.stealth?.55:1}
  drawEnemyBody(g,e,1,e.slowT>0&&e.slowCorrupt?voidPal(e.cfg.pal):null);
  if(e.stealth)g.globalAlpha=1;
  const w=Math.max(18,Math.min(80,art.width));
  if(e.shieldMax>0&&e.shield>0){
    const f=clamp(e.shield/e.shieldMax,0,1);
    g.fillStyle='#000a';g.fillRect(-w/2-1,top-10,w+2,5);
    g.fillStyle='#7ec8ff';g.fillRect(-w/2,top-9,w*f,3)}
  if(e.hp<e.maxHp){
    const hpr=clamp(e.hp/e.maxHp,0,1);
    g.fillStyle='#000a';g.fillRect(-w/2-1,top-5,w+2,5);
    g.fillStyle=e.boss?'#e0644c':'#7fb069';g.fillRect(-w/2,top-4,w*hpr,3)}
  g.restore()}

// Golden reskin of the Ranger. Same pixel geometry, every colour of the base
// palette swapped for its gilded counterpart, so the two towers can never fall
// out of step when the Ranger's art changes. Colours absent from this map
// (the red sight lens) render as-is.
const GOLD_RANGER={
  // boots, trousers, knee pads
  '#2a241c':'#4a3410','#161210':'#2a1e08','#3e5232':'#8a6a1e','#4c6440':'#a8842c',
  '#2c2c24':'#5c4614',
  // belt, buckle, pouches
  '#33261a':'#5c4218','#c9a86a':'#ffe08a','#4a3a26':'#7a5a20',
  // vest, straps, mag pouches, shoulder pads
  '#4c6b3c':'#d8a638','#5a7c48':'#f7d46a','#3e5a30':'#9a721c','#2c2a20':'#6a5320',
  '#4a4638':'#a8842f','#3a5230':'#b8862a',
  // head, eyes, helmet
  '#d8a878':'#f2dda8','#b88858':'#c9a868','#1c2430':'#3a2c08',
  '#2c4a28':'#e8b83a','#3e6238':'#ffe9a0','#1c2e18':'#9a721c',
  // rifle stock
  '#6a4a2c':'#7a5a1a','#3a2a1c':'#3d2c08','#8a6a42':'#b08a30',
  // rifle metal
  '#3a352c':'#4a3d1c','#5c554a':'#7a6a30','#2a261e':'#3d3212','#4a4438':'#6a5c28',
  '#4a4034':'#6a5a24','#5c5040':'#8a7a44','#5c5a54':'#8a8060','#7a766c':'#b0a478',
  '#2a2a2a':'#3d3212','#4a4a4a':'#6a5c28'};
// The Grenadier's gilded counterpart. Its steel plate and leather hide both
// swing to gold so the silhouette stays recognisable next to the base tower.
const GOLD_GRENADIER={
  // boots, trousers
  '#2a2420':'#4a3410','#141010':'#2a1e08','#4a3c30':'#8a6a1e','#5a4a3c':'#a8842c',
  // knee pads, shoulder pads, helmet rim: steel -> polished gold
  '#6a7078':'#c9962c','#8a9098':'#f7d46a','#4a5058':'#8a6418',
  // belt and buckle
  '#33261a':'#5c4218','#c9a86a':'#ffe08a',
  // bandolier grenades
  '#3c4a2c':'#6a5320','#c8c0a0':'#ffe9a0',
  // leather torso
  '#8a542c':'#a8742a','#a06a38':'#c9963c',
  // chest plate
  '#5a5e66':'#b8862a','#7a808a':'#e8b83a','#3c4048':'#7a5a1a',
  // neck and visor housing
  '#d8a878':'#f2dda8','#b88858':'#c9a868','#1c2430':'#3a2c08',
  // launcher stock, body and fittings
  '#6a4a2c':'#7a5a1a','#3a2a1c':'#3d2c08','#8a6a42':'#b08a30',
  '#3c3830':'#4a3d1c','#554e42':'#7a6a30','#4a4438':'#6a5c28','#6a6252':'#9a8444',
  '#8a8272':'#b0a478','#2c2a24':'#3d3212','#0c0a07':'#1a1408',
  '#2a2a2a':'#3d3212','#2a1e14':'#2a1e08'};
// A gilded unit stands on a warm glow where the base unit drops a plain shadow.
function goldShadow(g,mx,my,on){
  g.fillStyle=on?'rgba(232,163,61,.30)':'rgba(0,0,0,.25)';
  g.beginPath();g.ellipse(mx,my+1,11,4,0,0,Math.PI*2);g.fill()}
function drawTowerBody(g,type,mx,my,t,time){
  if(drawFieldTower(g,type,mx,my,t,time))return;
  const tint=towerTint(t);
  const td=TOWERS[type];
  if(td&&td.sprite){
    const spr=td.sprite,scale=spr.scale||1.3;
    const useLegs=td.legs!==false;
    if(typeof drawArtCustomBase==='function')drawArtCustomBase(g,mx,my);   // ART V2
    if(useLegs){
      g.fillStyle='#3a3a44';g.fillRect(mx-6,my-11,5,11);g.fillRect(mx+1,my-11,5,11);
      g.fillStyle='#2c2c34';g.fillRect(mx-7,my-2,6,2);g.fillRect(mx+1,my-2,6,2)}
    drawSpriteRows(g,spr,mx-spr.w*scale/2,my-(useLegs?11:0)-spr.h*scale,scale,false,tint);
    const aim=(t&&typeof t.aim==='number')?t.aim:-Math.PI/4;
    if(td.turret){
      const tur=td.turret;
      g.save();g.translate(mx,my-(useLegs?21:14));g.rotate(aim);
      drawSpriteRows(g,tur,-(tur.ox||2)*scale,-(tur.oy||tur.h/2)*scale,scale,false,tint);
      if(t&&t.flashT>0){
        const tipx=(tur.tip?tur.tip[0]:tur.w)*scale,tipy=(tur.tip?tur.tip[1]:tur.h/2)*scale;
        g.fillStyle='#ffe9a0';g.fillRect(tipx-2,tipy-3,6,6);
        g.fillStyle='#ffffff';g.fillRect(tipx+1,tipy-1,3,2)}
      g.restore()}
    const lv=totalUps(t);
    for(let i=0;i<Math.min(5,lv);i++){g.fillStyle='#f5c56a';
      g.fillRect(mx-17+i*7,my+20,4,3)}
    return}
  // A branch's own palette remap (the gilded towers) runs first, and the buff
  // tint is applied on top of whatever colour that produced.
  const col=function(c,pal){const v=(pal&&pal[c])||c;return tint?tintCol(v,tint):v};
  const B=function(x,y,w,h,c){g.fillStyle=col(c);g.fillRect(mx+x,my+y,w,h)};
  const Q=function(x,y,w,h,c){g.fillStyle=tint?tintCol(c,tint):c;g.fillRect(x,y,w,h)};
  // Muzzle flash and the gold upgrade pips stay their own colour: a tinted
  // flash reads as a dim flash, and the pips are a count, not a costume.
  const RAW=function(x,y,w,h,c){g.fillStyle=c;g.fillRect(x,y,w,h)};
  const aimOf=function(){return(t&&typeof t.aim==='number')?t.aim:-Math.PI/4};
  const shadow=function(){g.fillStyle='rgba(0,0,0,.25)';g.beginPath();g.ellipse(mx,my+1,11,4,0,0,Math.PI*2);g.fill()};
  const gunStart=function(){const a=aimOf();g.save();g.translate(mx,my-21);g.rotate(a);if(Math.cos(a)<0)g.scale(1,-1)};
  const flash=function(x,y){if(t&&t.flashT>0){RAW(x,y-3,6,6,'#ffe9a0');RAW(x+3,y-1,4,2,'#ffffff')}};
  const pips=function(){const lv=totalUps(t);
    for(let i=0;i<Math.min(5,lv);i++){g.fillStyle='#f5c56a';g.fillRect(mx-17+i*7,my+20,4,3)}};
  if(type==='ranger'||type==='goldranger'){
    // Shadowing B/Q with palette-aware versions keeps the Golden Ranger's art
    // identical in shape to the Ranger's; flash() keeps the outer Q so the
    // muzzle flash stays white on both.
    const PAL=type==='goldranger'?GOLD_RANGER:null;
    const B=function(x,y,w,h,c){g.fillStyle=col(c,PAL);g.fillRect(mx+x,my+y,w,h)};
    const Q=function(x,y,w,h,c){g.fillStyle=col(c,PAL);g.fillRect(x,y,w,h)};
    goldShadow(g,mx,my,!!PAL);
    // boots, legs, knee pads
    B(-7,-3,5,3,'#2a241c');B(2,-3,5,3,'#2a241c');B(-7,-1,5,1,'#161210');B(2,-1,5,1,'#161210');
    B(-5,-12,4,9,'#3e5232');B(1,-12,4,9,'#3e5232');B(-5,-12,1,9,'#4c6440');B(1,-12,1,9,'#4c6440');
    B(-5,-8,4,2,'#2c2c24');B(1,-8,4,2,'#2c2c24');
    // belt + pouches
    B(-8,-14,16,2,'#33261a');B(-1,-14,2,2,'#c9a86a');B(-8,-13,3,3,'#4a3a26');B(5,-13,3,3,'#4a3a26');
    // vest, strap, mag pouches, shoulder pads
    B(-8,-26,16,12,'#4c6b3c');B(-8,-26,16,3,'#5a7c48');B(-8,-18,16,1,'#3e5a30');
    B(-5,-24,2,10,'#33261a');
    B(1,-22,3,4,'#2c2a20');B(5,-22,3,4,'#2c2a20');B(1,-22,3,1,'#4a4638');B(5,-22,3,1,'#4a4638');
    B(-11,-26,4,4,'#3a5230');B(7,-26,4,4,'#3a5230');B(-11,-26,4,1,'#4c6b3c');B(7,-26,4,1,'#4c6b3c');
    // head + helmet
    B(-4,-33,8,7,'#d8a878');B(-4,-27,8,1,'#b88858');
    B(-3,-30,2,2,'#1c2430');B(1,-30,2,2,'#1c2430');
    B(-6,-37,12,5,'#2c4a28');B(-6,-37,12,1,'#3e6238');B(-6,-33,12,1,'#1c2e18');
    B(-6,-33,2,4,'#2c4a28');B(4,-33,2,4,'#2c4a28');
    // rifle
    gunStart();
    Q(-10,-2,8,5,'#6a4a2c');Q(-10,-2,1,5,'#3a2a1c');Q(-9,-2,7,1,'#8a6a42');
    Q(-3,-3,12,6,'#3a352c');Q(-3,-3,12,1,'#5c554a');Q(5,0,3,1,'#2a261e');
    Q(3,3,3,5,'#2a261e');Q(3,3,3,1,'#4a4438');Q(-1,3,2,4,'#2a1e14');
    Q(9,-2,7,4,'#4a4034');Q(9,-2,7,1,'#5c5040');Q(10,1,1,1,'#2a261e');Q(13,1,1,1,'#2a261e');
    Q(16,-1,7,2,'#5c5a54');Q(16,-1,7,1,'#7a766c');
    Q(23,-2,3,4,'#2a2a2a');Q(21,-3,1,2,'#2a2a2a');
    Q(1,-6,6,3,'#2a2a2a');Q(1,-6,6,1,'#4a4a4a');Q(6,-5,1,2,'#ff5040');
    Q(-2,0,4,3,'#33261a');Q(11,0,4,3,'#33261a');
    flash(26,0);
    g.restore();
    pips();
  }else if(type==='voidtraitor'){
    shadow();
    // robe and boots — a hooded figure, not a soldier
    B(-7,-3,5,3,'#1a1020');B(2,-3,5,3,'#1a1020');
    B(-8,-16,16,13,'#241634');B(-8,-16,16,3,'#33204a');
    B(-6,-13,3,10,'#2e1c40');B(3,-13,3,10,'#2e1c40');
    // black plate with a void seam burning through the middle
    B(-8,-28,16,13,'#1c1226');B(-8,-28,16,3,'#2a1b38');
    B(-1,-26,2,10,'#6a3a9a');B(-2,-24,4,2,'#c88ae0');
    B(-11,-28,4,5,'#2a1b38');B(7,-28,4,5,'#2a1b38');
    B(-11,-28,4,1,'#4a2f62');B(7,-28,4,1,'#4a2f62');
    // hood over a hollow face
    B(-7,-39,14,12,'#241634');B(-7,-39,14,2,'#3a2352');
    B(-4,-36,8,6,'#0c0812');
    B(-3,-34,2,2,'#c88ae0');B(1,-34,2,2,'#c88ae0');
    B(-7,-30,14,3,'#1a1020');
    // greatsword: sweeps through the strike while the slash is live, and sits
    // square on the aim the rest of the time
    gunStart();
    const sw=(t&&t.flashT>0)?(1-t.flashT/.18):-1;
    if(sw>=0)g.rotate(-.9+sw*1.8);
    Q(-9,-2,7,5,'#2a1b38');Q(-9,-2,7,1,'#4a2f62');
    Q(-3,-3,4,7,'#1a1020');Q(-3,-3,4,1,'#3a2352');
    Q(1,-4,20,8,'#3a2a4a');Q(1,-4,20,2,'#6a4f86');Q(1,3,20,1,'#1c1226');
    Q(2,-3,18,1,'#c88ae0');
    Q(21,-4,4,8,'#241634');Q(21,-4,4,2,'#4a2f62');
    if(sw>=0)Q(4+sw*16,-2,6,4,'#e0c8ff');
    g.restore();
    pips();
  }else if(type==='sniper'){
    shadow();
    B(-7,-3,5,3,'#2a2a22');B(2,-3,5,3,'#2a2a22');B(-7,-1,5,1,'#141410');B(2,-1,5,1,'#141410');
    B(-5,-12,4,9,'#3a4430');B(1,-12,4,9,'#3a4430');B(-5,-12,1,9,'#4a563c');B(1,-12,1,9,'#4a563c');
    B(-5,-8,4,2,'#2a2a22');B(1,-8,4,2,'#2a2a22');
    B(-8,-14,16,2,'#2a2418');B(-1,-14,2,2,'#8a7a4a');
    // ghillie cloak
    B(-9,-27,18,13,'#3c4a34');B(-9,-27,18,3,'#4c5c40');
    B(-9,-14,2,3,'#3c4a34');B(-4,-14,2,2,'#3c4a34');B(2,-14,2,3,'#3c4a34');B(7,-14,2,2,'#3c4a34');
    const tufts=[[-8,-24],[-5,-19],[-2,-25],[1,-20],[4,-24],[7,-18],[-7,-16],[3,-16]];
    for(let i=0;i<tufts.length;i++){const p=tufts[i];
      B(p[0],p[1],2,2,'#2e3a28');B(p[0]+1,p[1]-1,1,1,'#5c6c46')}
    B(-5,-27,10,3,'#5c5a3c');B(-5,-27,10,1,'#6c6a48');
    // hood + face
    B(-7,-38,14,11,'#3c4a34');B(-7,-38,14,2,'#4c5c40');
    B(-4,-36,8,2,'#1e2a1a');B(-3,-34,6,5,'#d8a878');B(-3,-30,6,1,'#b88858');
    B(-2,-32,2,1,'#1c2430');B(1,-32,2,1,'#1c2430');
    B(-8,-33,2,3,'#2e3a28');B(6,-33,2,3,'#2e3a28');B(-4,-39,3,1,'#5c6c46');B(2,-39,2,1,'#5c6c46');
    // long rifle
    gunStart();
    Q(-12,-2,9,5,'#5a3a22');Q(-12,-2,1,5,'#2a1a10');Q(-11,-2,8,1,'#7a5a3a');Q(-8,-4,4,2,'#5a3a22');
    Q(-4,-3,11,6,'#2c2c30');Q(-4,-3,11,1,'#4a4a52');Q(2,-5,3,2,'#4a4a52');
    Q(2,3,3,4,'#1c1c20');Q(-1,3,2,4,'#2a1e14');
    Q(1,-8,15,4,'#1c1c20');Q(1,-8,15,1,'#3a3a42');
    Q(16,-9,2,6,'#2a2a30');Q(0,-9,2,6,'#2a2a30');Q(17,-8,1,4,'#7ec8ff');Q(0,-8,1,4,'#3a6a9a');
    Q(4,-5,1,2,'#4a4a52');Q(12,-5,1,2,'#4a4a52');
    Q(7,-2,15,2,'#3a3a40');Q(7,-2,15,1,'#55555e');
    Q(22,-3,5,4,'#2a2a2e');Q(22,-3,5,1,'#44444c');Q(25,-1,1,2,'#0c0c10');
    Q(13,2,1,5,'#2a2a2e');Q(16,2,1,5,'#2a2a2e');
    Q(-2,0,4,3,'#2a2418');Q(12,-1,4,3,'#2a2418');
    flash(27,-1);
    g.restore();
    pips();
  }else if(type==='viper'){
    shadow();
    // boots, legs, knee pads — a hazard crew, not a soldier
    B(-7,-3,5,3,'#1a2414');B(2,-3,5,3,'#1a2414');B(-7,-1,5,1,'#0e160a');B(2,-1,5,1,'#0e160a');
    B(-5,-13,4,10,'#24401f');B(1,-13,4,10,'#24401f');B(-5,-13,1,10,'#3a5c30');B(1,-13,1,10,'#3a5c30');
    B(-5,-9,4,2,'#141f10');B(1,-9,4,2,'#141f10');
    // belt carrying two venom flasks
    B(-8,-15,16,2,'#1d2a16');B(-1,-15,2,2,'#8a7a4a');
    B(-7,-14,2,3,'#2f7a3a');B(5,-14,2,3,'#2f7a3a');
    B(-7,-14,2,1,'#8ce85a');B(5,-14,2,1,'#8ce85a');
    // acid-green coat with a lighter yoke and a venom seam down the chest
    B(-9,-28,18,13,'#2f7a3a');B(-9,-28,18,3,'#48a854');B(-9,-16,18,1,'#1d4f26');
    B(-2,-26,4,11,'#1d4f26');B(-1,-24,2,8,'#8ce85a');
    B(-12,-28,4,5,'#245c2c');B(8,-28,4,5,'#245c2c');
    B(-12,-28,4,1,'#48a854');B(8,-28,4,1,'#48a854');
    // hood over a rebreather mask: no skin, just the visor
    B(-7,-39,14,12,'#245c2c');B(-7,-39,14,2,'#3a7a44');
    B(-5,-36,10,7,'#101a0e');
    B(-4,-34,3,2,'#a8f04a');B(1,-34,3,2,'#a8f04a');
    B(-3,-30,6,3,'#1d2a16');B(-2,-29,4,1,'#7fd84a');
    B(-7,-30,2,3,'#1a2414');B(5,-30,2,3,'#1a2414');
    // Once Double Gunner lands there are two barrels, and they can be pointed
    // at two different enemies at the same time — so each draws on its own aim
    // and fires on its own beat. The rear one is drawn first and a shade
    // darker, otherwise the pair reads as one thick slab.
    const guns=(t&&t.S&&t.S.guns>1)?2:1;
    const rifle=function(gi,lift,back){
      const BKL=back?'#141f10':'#1d2a16';    // stock
      const M=back?'#252e20':'#33402c';      // receiver
      const MH=back?'#3a4a30':'#55684a';     // its top highlight
      const BAR=back?'#2c3826':'#3d4d33';    // barrel
      const a=(t&&t.gunAim)?t.gunAim[gi]:aimOf();
      g.save();g.translate(mx,my-21+lift);g.rotate(a);if(Math.cos(a)<0)g.scale(1,-1);
      Q(-10,-2,7,4,BKL);Q(-10,-2,1,4,back?'#0c1308':'#0e160a');Q(-9,-2,6,1,'#2f4a24');
      Q(-4,-3,12,5,M);Q(-4,-3,12,1,MH);
      Q(-1,2,2,4,BKL);Q(1,2,3,3,M);
      Q(8,-2,13,2,BAR);Q(8,-2,13,1,back?'#4a5c40':'#6a8058');
      Q(20,-2,3,2,BKL);
      // the ampoule riding the barrel is what makes this gun read as venom
      Q(1,-6,4,3,BKL);Q(2,-5,2,2,'#8ce85a');Q(2,-5,1,2,'#d8ff9a');
      if(t&&t.gunFlash&&t.gunFlash[gi]>0){Q(23,-3,5,5,'#ffe9a0');Q(26,-1,3,2,'#ffffff')}
      g.restore()};
    if(guns>1)rifle(1,-5,true);
    rifle(0,0,false);
    pips();
  }else if(type==='grenadier'||type==='goldgrenadier'){
    const PAL=type==='goldgrenadier'?GOLD_GRENADIER:null;
    const B=function(x,y,w,h,c){g.fillStyle=col(c,PAL);g.fillRect(mx+x,my+y,w,h)};
    const Q=function(x,y,w,h,c){g.fillStyle=col(c,PAL);g.fillRect(x,y,w,h)};
    goldShadow(g,mx,my,!!PAL);
    B(-7,-3,5,3,'#2a2420');B(2,-3,5,3,'#2a2420');B(-7,-1,5,1,'#141010');B(2,-1,5,1,'#141010');
    B(-5,-12,4,9,'#4a3c30');B(1,-12,4,9,'#4a3c30');B(-5,-12,1,9,'#5a4a3c');B(1,-12,1,9,'#5a4a3c');
    B(-5,-9,4,3,'#6a7078');B(1,-9,4,3,'#6a7078');B(-5,-9,4,1,'#8a9098');B(1,-9,4,1,'#8a9098');
    B(-8,-14,16,2,'#33261a');B(-1,-14,2,2,'#c9a86a');
    B(-7,-12,2,3,'#3c4a2c');B(-7,-12,2,1,'#c8c0a0');B(5,-12,2,3,'#3c4a2c');B(5,-12,2,1,'#c8c0a0');
    // leather torso + chest plate + grenade bandolier
    B(-8,-26,16,12,'#8a542c');B(-8,-26,16,3,'#a06a38');
    B(-5,-24,10,7,'#5a5e66');B(-5,-24,10,1,'#7a808a');B(-5,-17,10,1,'#3c4048');
    for(let i=0;i<4;i++){B(-6+i*3,-23+i*2,3,4,'#3c4a2c');B(-6+i*3,-23+i*2,3,1,'#c8c0a0')}
    B(-11,-26,4,5,'#6a7078');B(7,-26,4,5,'#6a7078');B(-11,-26,4,1,'#8a9098');B(7,-26,4,1,'#8a9098');
    // steel helmet with visor
    B(-4,-32,8,6,'#d8a878');B(-4,-27,8,1,'#b88858');
    B(-6,-38,12,7,'#6a7078');B(-6,-38,12,2,'#8a9098');B(-6,-32,12,1,'#4a5058');
    B(-5,-31,10,3,'#1c2430');B(-4,-30,2,1,'#f08b3a');B(2,-30,2,1,'#f08b3a');
    B(-6,-31,1,5,'#6a7078');B(5,-31,1,5,'#6a7078');
    // grenade launcher
    gunStart();
    Q(-10,-2,7,5,'#6a4a2c');Q(-10,-2,1,5,'#3a2a1c');Q(-9,-2,6,1,'#8a6a42');
    Q(-4,-5,10,9,'#3c3830');Q(-4,-5,10,2,'#554e42');
    Q(0,5,7,4,'#4a4438');Q(1,4,5,6,'#4a4438');Q(1,4,5,1,'#6a6252');Q(2,6,1,1,'#8a8272');Q(4,7,1,1,'#8a8272');
    Q(6,-4,11,7,'#3c3830');Q(6,-4,11,2,'#554e42');
    Q(9,-4,1,7,'#2c2a24');Q(12,-4,1,7,'#2c2a24');Q(15,-4,1,7,'#2c2a24');
    Q(17,-5,4,9,'#2c2a24');Q(17,-5,4,1,'#4a4438');Q(20,-3,1,5,'#0c0a07');
    Q(8,-8,6,3,'#2a2a2a');Q(10,-7,2,1,'#8a8272');
    Q(10,3,2,5,'#2a1e14');
    Q(-2,0,5,4,'#33261a');Q(10,2,4,3,'#33261a');
    flash(21,0);
    g.restore();
    pips();
  }else if(type==='phaser'){
    shadow();
    B(-7,-3,5,3,'#1a1a20');B(2,-3,5,3,'#1a1a20');B(-7,-1,5,1,'#0c0c10');B(2,-1,5,1,'#0c0c10');
    B(-5,-12,4,9,'#26262c');B(1,-12,4,9,'#26262c');B(-5,-12,1,9,'#34343c');B(1,-12,1,9,'#34343c');
    B(-4,-8,2,1,'#3aff9a');B(2,-8,2,1,'#3aff9a');
    B(-8,-14,16,2,'#15151a');B(-6,-14,2,2,'#3aff9a');B(4,-14,2,2,'#3aff9a');
    // armoured torso with energy core
    B(-8,-26,16,12,'#23232a');B(-8,-26,16,3,'#2e2e38');B(-8,-17,16,1,'#15151a');
    B(-3,-23,6,5,'#15151a');B(-2,-22,4,3,'#7ec8ff');B(-1,-21,2,1,'#ffffff');
    B(-7,-22,1,4,'#3aff9a');B(6,-22,1,4,'#3aff9a');
    B(-11,-26,4,5,'#3a3a44');B(7,-26,4,5,'#3a3a44');B(-11,-26,4,1,'#f0c040');B(7,-26,4,1,'#f0c040');
    // gold helmet, red visor
    B(-6,-37,12,11,'#f0c040');B(-6,-37,12,2,'#f8d868');B(-1,-38,2,2,'#f8d868');
    B(-5,-33,10,4,'#1c1c24');B(-4,-32,8,2,'#ff3030');B(-4,-32,2,1,'#ff8070');
    B(-4,-27,8,1,'#c9a020');B(6,-34,2,5,'#3a3a44');B(6,-34,2,1,'#3aff9a');
    // laser rifle
    gunStart();
    Q(-9,-2,6,5,'#2a2d33');Q(-9,-2,1,5,'#15151a');
    Q(-4,-3,16,6,'#3c4048');Q(-4,-3,16,1,'#555a64');
    Q(0,-2,6,2,'#14301c');Q(1,-2,4,1,'#3aff9a');Q(7,0,4,1,'#2a2d33');
    Q(-1,3,3,5,'#2a2d33');Q(-1,3,3,1,'#3c4048');
    Q(3,-6,5,3,'#2a2d33');Q(4,-5,3,1,'#7ec8ff');
    Q(12,-2,8,5,'#2a2d33');Q(13,-2,1,5,'#7ec8ff');Q(16,-2,1,5,'#7ec8ff');Q(19,-2,1,5,'#7ec8ff');
    Q(20,-3,4,6,'#555a64');Q(24,-2,3,4,'#7ec8ff');Q(25,-1,1,2,'#ffffff');
    Q(-2,0,4,3,'#15151a');Q(13,1,4,3,'#15151a');
    g.restore();
    pips();
  }else if(type==='farm'){
    // ground shadow
    g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.ellipse(mx,my+1,19,5,0,0,Math.PI*2);g.fill();
    // tilled soil
    g.fillStyle='#4a3220';g.fillRect(mx-16,my-10,18,9);
    g.fillStyle='#3a2616';g.fillRect(mx-16,my-10,18,1);
    g.fillStyle='#5c4028';g.fillRect(mx-16,my-7,18,1);g.fillRect(mx-16,my-3,18,1);
    // crops (gentle sway)
    const sway=Math.round(Math.sin(time*2));
    const crop=function(px,by,s){
      g.fillStyle='#5a7c48';g.fillRect(px,by-5,2,5);
      g.fillStyle='#7fb069';g.fillRect(px-2+s,by-4,2,1);g.fillRect(px+2+s,by-6,2,1);
      g.fillStyle='#e8a33d';g.fillRect(px-1+s,by-8,4,3);
      g.fillStyle='#f5c56a';g.fillRect(px+s,by-8,2,1)};
    for(let c2=0;c2<3;c2++){crop(mx-15+c2*5,my-9,sway);crop(mx-12+c2*5,my-4,-sway)}
    // barn: foundation, walls, planks, corner trim
    g.fillStyle='#6a6052';g.fillRect(mx+4,my-2,15,2);
    g.fillStyle='#b8402e';g.fillRect(mx+4,my-18,15,16);
    g.fillStyle='#9c3424';g.fillRect(mx+6,my-18,1,16);g.fillRect(mx+16,my-18,1,16);
    g.fillStyle='#8a2f22';g.fillRect(mx+4,my-4,15,2);
    g.fillStyle='#e8dcc0';g.fillRect(mx+4,my-18,1,16);g.fillRect(mx+18,my-18,1,16);
    // barn doors
    g.fillStyle='#e8dcc0';g.fillRect(mx+8,my-11,7,9);
    g.fillStyle='#6a2a20';g.fillRect(mx+9,my-10,5,8);
    g.fillStyle='#4a1c14';g.fillRect(mx+11,my-10,1,8);
    g.fillStyle='#e8dcc0';g.fillRect(mx+9,my-8,5,1);g.fillRect(mx+9,my-5,5,1);
    // hayloft window
    g.fillStyle='#e8dcc0';g.fillRect(mx+9,my-17,5,5);
    g.fillStyle='#3a2a1e';g.fillRect(mx+10,my-16,3,3);
    g.fillStyle='#f5c56a';g.fillRect(mx+11,my-15,1,1);
    // roof tiers
    g.fillStyle='#3a1e18';g.fillRect(mx+4,my-18,15,1);
    g.fillStyle='#4a2a22';g.fillRect(mx+3,my-21,17,3);
    g.fillRect(mx+5,my-24,13,3);g.fillRect(mx+8,my-26,7,2);
    g.fillStyle='#7a4a3a';g.fillRect(mx+3,my-21,17,1);
    g.fillRect(mx+5,my-24,13,1);g.fillRect(mx+8,my-26,7,1);
    // weathervane
    const va=Math.round(Math.sin(time*1.5));
    g.fillStyle='#3a3a3a';g.fillRect(mx+11,my-30,1,4);
    g.fillStyle='#f5c56a';g.fillRect(mx+9+va,my-29,4,1);g.fillRect(mx+13+va,my-30,1,3);
    // front fence
    g.fillStyle='#6a4e30';g.fillRect(mx-16,my-2,20,1);g.fillRect(mx-16,my+1,20,1);
    for(let fp=0;fp<4;fp++){
      g.fillStyle='#7a5c38';g.fillRect(mx-16+fp*6,my-4,2,7);
      g.fillStyle='#9a7a4c';g.fillRect(mx-16+fp*6,my-4,2,1)}
    // grass tufts
    g.fillStyle='#4c8038';g.fillRect(mx+6,my+1,1,2);g.fillRect(mx-18,my-1,1,2);g.fillRect(mx+19,my,1,2);
    const lv=totalUps(t);
    for(let i=0;i<Math.min(5,lv);i++){g.fillStyle='#f5c56a';
      g.fillRect(mx-17+i*7,my+20,4,3)}
  }else if(type==='village'){
    // ground shadow + packed-earth plaza with cobbles
    g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.ellipse(mx,my+1,21,6,0,0,Math.PI*2);g.fill();
    g.fillStyle='#6b5b45';g.fillRect(mx-18,my-5,36,6);
    g.fillStyle='#7d6c52';g.fillRect(mx-18,my-5,36,1);
    g.fillStyle='#5a4c3a';
    for(let c=0;c<6;c++)g.fillRect(mx-16+c*6,my-3+(c%2?2:0),4,2);
    // central hall — drawn first so the cottages read as standing in front
    g.fillStyle='#c8b088';g.fillRect(mx-7,my-21,14,16);
    g.fillStyle='#8a6a44';
    g.fillRect(mx-7,my-21,1,16);g.fillRect(mx+6,my-21,1,16);g.fillRect(mx-7,my-13,14,1);
    g.fillStyle='#f5c56a';g.fillRect(mx-5,my-19,3,3);g.fillRect(mx+2,my-19,3,3);
    g.fillStyle='#a89068';g.fillRect(mx-5,my-18,3,1);g.fillRect(mx+2,my-18,3,1);
    g.fillStyle='#5a3a22';g.fillRect(mx-2,my-11,4,6);
    g.fillStyle='#d8b878';g.fillRect(mx+1,my-8,1,1);
    // stepped slate roof
    g.fillStyle='#39566f';g.fillRect(mx-9,my-23,18,2);
    g.fillStyle='#4a6a8a';g.fillRect(mx-7,my-26,14,3);g.fillRect(mx-5,my-28,10,2);
    g.fillStyle='#5f86a8';g.fillRect(mx-7,my-26,14,1);g.fillRect(mx-5,my-28,10,1);
    // lookout turret + pennant (top path ends in "Lookout Towers")
    g.fillStyle='#6a5a44';g.fillRect(mx-3,my-32,6,4);
    g.fillStyle='#8a7658';g.fillRect(mx-3,my-32,6,1);
    g.fillStyle='#2f4a60';g.fillRect(mx-4,my-34,8,2);
    g.fillStyle='#3f5f7e';g.fillRect(mx-4,my-34,8,1);
    g.fillStyle='#8a6a44';g.fillRect(mx,my-40,1,6);
    const fl=Math.round(Math.sin(time*2));
    g.fillStyle='#f5c56a';g.fillRect(mx+1,my-40,5+fl,3);
    g.fillStyle='#e8b34a';g.fillRect(mx+1,my-40,5+fl,1);
    // left cottage
    g.fillStyle='#cdb68f';g.fillRect(mx-17,my-14,12,9);
    g.fillStyle='#8a6a44';g.fillRect(mx-17,my-14,1,9);g.fillRect(mx-6,my-14,1,9);
    g.fillStyle='#f5c56a';g.fillRect(mx-14,my-12,3,3);
    g.fillStyle='#39566f';g.fillRect(mx-18,my-16,14,2);
    g.fillStyle='#4a6a8a';g.fillRect(mx-16,my-19,10,3);
    g.fillStyle='#5f86a8';g.fillRect(mx-16,my-19,10,1);
    // right cottage
    g.fillStyle='#d8c4a0';g.fillRect(mx+5,my-13,12,8);
    g.fillStyle='#8a6a44';g.fillRect(mx+5,my-13,1,8);g.fillRect(mx+16,my-13,1,8);
    g.fillStyle='#f5c56a';g.fillRect(mx+8,my-11,3,3);
    g.fillStyle='#39566f';g.fillRect(mx+4,my-15,14,2);
    g.fillStyle='#4a6a8a';g.fillRect(mx+6,my-18,10,3);
    g.fillStyle='#5f86a8';g.fillRect(mx+6,my-18,10,1);
    // front fence
    g.fillStyle='#6a4e30';g.fillRect(mx-18,my-2,14,1);g.fillRect(mx+4,my-2,14,1);
    for(let fp=0;fp<3;fp++){
      g.fillStyle='#7a5c38';g.fillRect(mx-17+fp*6,my-4,2,5);g.fillRect(mx+5+fp*6,my-4,2,5);
      g.fillStyle='#9a7a4c';g.fillRect(mx-17+fp*6,my-4,2,1);g.fillRect(mx+5+fp*6,my-4,2,1)}
    // grass tufts
    g.fillStyle='#4c8038';g.fillRect(mx-19,my-1,1,2);g.fillRect(mx+18,my,1,2);g.fillRect(mx+1,my+1,1,2);
    pips();
  }
}

function drawTower(g,t,time){const m=worldToMap(t.x,t.y);
  const lift=elevAt(t.x,t.y)*ELEVH;
  drawTowerBody(g,t.type,m.x,m.y-lift,t,time);
  if(t.stunT>0){
    g.globalAlpha=.7;g.fillStyle='#c8c8ff';
    for(let i=0;i<3;i++){const a=G.time*6+i*2.1;
      g.fillRect(m.x+Math.cos(a)*14-2,m.y-lift-42+Math.sin(a)*4-2,4,4)}
    g.globalAlpha=1;
    g.font="9px 'Silkscreen'";g.textAlign='center';g.fillStyle='#c8c8ff';
    g.fillText('STUNNED',m.x,m.y-lift-48)}
  if(t.hp<t.maxHp){
    g.fillStyle='#000a';g.fillRect(m.x-15,m.y-lift-54,30,4);
    g.fillStyle='#7cff5a';g.fillRect(m.x-14,m.y-lift-53,28*clamp(t.hp/t.maxHp,0,1),2)}
  if(towerBehavior(t.type)==='beam'){
    const muzzle=weaponPose(t),bx=muzzle.mx,by=muzzle.my;
    if(t.beamOn&&t.target&&!t.target.dead){
      const col=phaserBeamCol(t),w=phaserBeamW(t);
      // The chain is decided by the damage tick that put it on screen; rebuilding
      // it here would run the same O(chain x enemies) scan once per frame.
      const chain=t.chain||phaserChain(t,t.target);
      const pts=[[bx,by],[t.target.sx,t.target.sy-10]];
      for(const c of chain)if(!c.dead)pts.push([c.sx,c.sy-10]);
      g.lineCap='round';
      const strokePath=function(){
        g.beginPath();g.moveTo(pts[0][0],pts[0][1]);
        for(let i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1]);
        g.stroke()};
      g.globalAlpha=.22;g.strokeStyle=col;g.lineWidth=w*3.6;strokePath();
      g.globalAlpha=1;g.lineWidth=w;strokePath();
      g.globalAlpha=.85;g.strokeStyle='#ffffff';g.lineWidth=Math.max(1,w*.4);strokePath();
      for(let i=1;i<pts.length;i++){
        g.globalAlpha=.8;g.fillStyle=col;
        g.fillRect(pts[i][0]-w,pts[i][1]-w*.5,w*2,w)}
      g.globalAlpha=1}
    else if(!t.beamOn&&t.chargeT>0){
      const k=clamp(t.chargeT/(t.S.charge||1),0,1);
      const pu=.5+.5*Math.sin(time*20);
      g.globalAlpha=.4+.6*k;
      g.fillStyle=phaserBeamCol(t);
      g.beginPath();g.arc(bx,by,1.5+k*3+pu,0,Math.PI*2);g.fill();
      g.strokeStyle=phaserBeamCol(t);g.lineWidth=1.5;g.beginPath();g.arc(bx,by,10-k*4,time*4,time*4+Math.PI*1.5);g.stroke();
      g.globalAlpha=1}}
  if(t===G.sel){
    g.strokeStyle='#f5c56a';g.lineWidth=2;g.setLineDash([6,4]);
    g.beginPath();g.ellipse(m.x,m.y-lift,26,13,0,0,Math.PI*2);g.stroke();g.setLineDash([]);
    g.fillStyle='rgba(245,197,106,.08)';g.strokeStyle='rgba(245,197,106,.4)';g.lineWidth=1.5;
    g.beginPath();g.ellipse(m.x,m.y-lift+7,R_ISO_X(t.S.range),R_ISO_Y(t.S.range),0,0,Math.PI*2);
    g.fill();g.stroke()}}

const TREE_PALS=[
  ['#2c5a28','#3e7030','#5c9448','#6a4a2c'],   // classic
  ['#335f2c','#4c8038','#6ea455','#74522f'],   // bright
  ['#28523a','#396b41','#4f8651','#64472c']];  // cool / evergreen

function drawDeco(g,d,time){
  drawFieldDeco(g,d,time);return;
  const m=worldToMap(d.x+.5,d.y+.5);
  const y=m.y-elevAt(d.x,d.y)*ELEVH;
  if(d.t==='tree'){
    const sw=Math.sin(time*1.2+d.s*9)*1.6;
    const pal=TREE_PALS[d.s<.34?0:(d.s<.67?1:2)];
    g.fillStyle='rgba(0,0,0,.18)';
    g.beginPath();g.ellipse(m.x,y+6,12,5.5,0,0,Math.PI*2);g.fill();
    g.fillStyle='rgba(0,0,0,.10)';
    g.beginPath();g.ellipse(m.x+4,y+6,8,3.5,0,0,Math.PI*2);g.fill();
    g.fillStyle=pal[3];                                  // trunk + root flare
    g.fillRect(m.x-2,y-13,4,17);g.fillRect(m.x-4,y+1,8,3);
    g.fillStyle='rgba(255,255,255,.16)';g.fillRect(m.x-2,y-12,1,15);
    const cx=m.x+sw;                                     // 4 band canopy, 3 tone shading
    const bands=[[12,-19,6],[10,-25,6],[7,-31,6],[4,-36,6]];
    g.fillStyle=pal[0];for(const b of bands)g.fillRect(cx-b[0],y+b[1],b[0]*2,b[2]);
    g.fillStyle=pal[1];for(const b of bands)g.fillRect(cx-b[0],y+b[1],b[0]*2-2,b[2]-1);
    g.fillStyle=pal[2];for(const b of bands)
      g.fillRect(cx-b[0]+2,y+b[1]+1,Math.max(3,b[0]-1),Math.max(2,b[2]-4));}
  else if(d.t==='bush'){
    const pal=TREE_PALS[d.s<.5?0:1];
    g.fillStyle='rgba(0,0,0,.15)';
    g.beginPath();g.ellipse(m.x,y+4,9,4,0,0,Math.PI*2);g.fill();
    const bands=[[8,-8,5],[6,-13,5],[3,-17,4]];
    g.fillStyle=pal[0];for(const b of bands)g.fillRect(m.x-b[0],y+b[1],b[0]*2,b[2]);
    g.fillStyle=pal[1];for(const b of bands)g.fillRect(m.x-b[0],y+b[1],b[0]*2-2,b[2]-1);
    g.fillStyle=pal[2];for(const b of bands)
      g.fillRect(m.x-b[0]+2,y+b[1]+1,Math.max(3,b[0]-1),Math.max(2,b[2]-3));
    if(d.s>.72){g.fillStyle='#e0607a';                   // a few berries
      g.fillRect(m.x+3,y-12,2,2);g.fillRect(m.x-4,y-9,2,2)}}
  else if(d.t==='rock'){
    const pal=d.s<.5?['#6e6e66','#8a8a82','#a6a69c']:['#776f64','#918779','#aba191'];
    g.fillStyle='rgba(0,0,0,.16)';
    g.beginPath();g.ellipse(m.x,y+4,10,4,0,0,Math.PI*2);g.fill();
    g.fillStyle=pal[0];g.fillRect(m.x-9,y-9,18,11);g.fillRect(m.x-6,y-12,12,4);
    g.fillStyle=pal[1];g.fillRect(m.x-8,y-9,15,8);g.fillRect(m.x-5,y-12,9,4);
    g.fillStyle=pal[2];g.fillRect(m.x-6,y-11,7,3);g.fillRect(m.x-7,y-8,5,2);
    g.fillStyle='rgba(0,0,0,.22)';g.fillRect(m.x+5,y-4,3,5);
    g.fillStyle=pal[1];g.fillRect(m.x+10,y-3,4,3);}
  else if(d.t==='flower'){
    const sw=Math.sin(time*2+d.s*9);
    const col=d.s<.34?'#e8869a':(d.s<.67?'#e8d05a':'#b48ae0');
    g.fillStyle='rgba(0,0,0,.12)';g.fillRect(m.x-2,y-1,5,2);
    g.fillStyle='#3e7030';g.fillRect(m.x-1,y-6,2,6);
    g.fillStyle='#4c8038';g.fillRect(m.x-4,y-4,3,2);      // leaf
    g.fillStyle=col;g.fillRect(m.x-2+sw,y-10,5,5);
    g.fillStyle='rgba(255,255,255,.5)';g.fillRect(m.x-2+sw,y-10,2,2);
    g.fillStyle='#f7f0c8';g.fillRect(m.x+sw,y-9,1,1);}
  else if(d.t==='tuft'){
    const sw=Math.sin(time*1.6+d.s*9)*.8;
    g.fillStyle=d.s<.5?'#4c8038':'#77ab5e';
    g.fillRect(m.x-5,y-4,2,5);g.fillRect(m.x-1+sw,y-7,2,8);g.fillRect(m.x+3,y-3,2,4);
    g.fillStyle='rgba(255,255,255,.14)';g.fillRect(m.x-1+sw,y-7,1,3);}}

function drawBase(g,time){
  drawFieldLandmark(g,BASE_PT,false,time);
  const m=worldToMap(BASE_PT.x,BASE_PT.y);
  const hpr=G.maxLives?clamp(G.lives/G.maxLives,0,1):1;
  const hurt=G.leakFlash>0;
  const gl=.5+Math.sin(time*2.4)*.25;
  const jr=i=>{const s=Math.sin(i*127.1)*43758.5453;return s-Math.floor(s)};
  // one ring stone (called twice: the half behind the fire, then the half in front)
  const stone=function(i){
    const a=i/12*Math.PI*2+.2;
    const w=5+jr(i)*3.2,h=3.5+jr(i+9)*1.6;
    const px=m.x+Math.cos(a)*21,py=m.y+3+Math.sin(a)*10;
    g.fillStyle='rgba(0,0,0,.22)';g.fillRect(px-w,py+1,w*2,h+2);
    g.fillStyle=i%2?'#6a6052':'#7a7060';g.fillRect(px-w,py-h,w*2,h+3);
    g.fillStyle='#8d8371';g.fillRect(px-w+1.5,py-h+1,w*2-4,1.5);   // lit top
    g.fillStyle='#494238';g.fillRect(px-w,py+1,w*2,1.5)};           // shaded base
  const back=[],front=[];
  for(let i=0;i<12;i++)(Math.sin(i/12*Math.PI*2+.2)<0?back:front).push(i);
  // warm light pooling on the grass
  g.fillStyle='rgba(250,150,55,'+(.05+gl*.05)+')';
  g.beginPath();g.ellipse(m.x,m.y+7,54,27,0,0,Math.PI*2);g.fill();
  g.fillStyle='rgba(255,185,90,'+(.05+gl*.05)+')';
  g.beginPath();g.ellipse(m.x,m.y+4,34,17,0,0,Math.PI*2);g.fill();
  // scorched earth + ash bed with char specks
  g.fillStyle='#3a3129';g.beginPath();g.ellipse(m.x,m.y+3,23,11.5,0,0,Math.PI*2);g.fill();
  g.fillStyle='#2a231d';g.beginPath();g.ellipse(m.x,m.y+2,17,8,0,0,Math.PI*2);g.fill();
  for(let i=0;i<6;i++){const a=jr(i+4)*6.283,r=jr(i+7)*13;
    g.fillStyle='#1e1814';g.fillRect(m.x+Math.cos(a)*r,m.y+1+Math.sin(a)*r*.4,3,2)}
  for(const i of back)stone(i);
  // glowing coal bed
  const cp=.55+.45*Math.sin(time*4.2);
  for(let i=0;i<9;i++){const a=jr(i)*6.283,r=2+jr(i+3)*10;
    const px=m.x+Math.cos(a)*r,py=m.y+1+Math.sin(a)*r*.45;
    g.fillStyle=i%3?'rgba(255,110,35,'+(.45+cp*.4).toFixed(3)+')'
                   :'rgba(255,195,105,'+(.4+cp*.45).toFixed(3)+')';
    g.fillRect(px,py,2.5,2)}
  // crossed logs, squashed into the ground plane
  g.save();g.translate(m.x,m.y+1);g.scale(1,.5);
  const logs=[[-.55,26],[.5,24],[.08,21]];
  for(let i=0;i<logs.length;i++){
    g.save();g.rotate(logs[i][0]);g.translate(0,(i-1)*3);
    const L=logs[i][1];
    g.fillStyle='#4a3018';g.fillRect(-L/2,-5,L,10);
    g.fillStyle='#6b4726';g.fillRect(-L/2,-5,L,3);
    g.fillStyle='#33200f';g.fillRect(-L/2,2,L,3);
    g.fillStyle='#8a6238';g.fillRect(-L/2-1,-5,3,10);
    g.restore()}
  g.restore();
  const fs=.62+.38*hpr;
  const fl=function(w,h,col,sp){
    g.fillStyle=col;const bars=7;
    for(let i=0;i<bars;i++){
      const t2=i/(bars-1),edge=Math.sin(t2*Math.PI);
      const jit=Math.sin(time*sp+i*1.9)*.5+Math.sin(time*sp*1.63+i*2.7)*.5;
      const bh=h*fs*(.32+.68*edge)*(.78+.22*jit);
      const bw=w/bars+1,bx=m.x-w/2+i*(w/bars);
      g.fillRect(bx,m.y-6-bh,bw,bh);
      if(edge>.35&&bh>4)g.fillRect(bx+1,m.y-8-bh,Math.max(1,bw-2),3)}};
  fl(30,42,hurt?'#e8722a':'#b8401e',7);
  fl(20,31,'#e8722a',9);fl(12,21,'#f5a623',11);fl(6,12,hurt?'#ffffff':'#ffe9a0',13);
  for(const i of front)stone(i);
  g.strokeStyle='rgba(245,180,80,'+(.09+gl*.11)+')';g.lineWidth=1.5;
  g.beginPath();g.ellipse(m.x,m.y-21*fs-2,(23+gl*7)*fs+10,(11+gl*4)*fs+6,0,0,Math.PI*2);g.stroke();
  if(SV.particles&&Math.random()<.35)
    addPart({type:'dot',x:m.x+rnd(-8,8),y:m.y-28*fs,vx:rnd(-4,4),vy:rnd(-26,-12),
      t:0,life:rnd(.5,1.1),color:pick(['#f5a623','#e8722a','#ffd97a']),size:rnd(1.5,3)})}

function drawSpawn(g,time){
  drawFieldLandmark(g,SPAWN_PT,true,time);
  const s=samplePath(PATH,0.001),off=.85;
  const pL=worldToMap(s.x-s.dy*off,s.y+s.dx*off);
  const pR=worldToMap(s.x+s.dy*off,s.y-s.dx*off);
  const cx=(pL.x+pR.x)/2,cy=(pL.y+pR.y)/2;
  const gl=.5+Math.sin(time*3)*.2;
  // red light spilled on the ground
  g.fillStyle='rgba(190,50,40,'+(.06+gl*.06)+')';
  g.beginPath();g.ellipse(cx,cy-2,38,17,0,0,Math.PI*2);g.fill();
  // scorch cracks crawling out of the threshold
  g.strokeStyle='rgba(38,16,18,.3)';g.lineWidth=1.5;g.lineCap='round';
  for(let i=0;i<5;i++){const a=-.55+i*.45;
    g.beginPath();g.moveTo(cx,cy-2);
    g.lineTo(cx+Math.cos(a)*18,cy-2+Math.sin(a)*8.5);
    g.lineTo(cx+Math.cos(a+.2)*25,cy-2+Math.sin(a+.2)*12);g.stroke()}
  // threshold slab
  g.fillStyle='#3a352d';g.beginPath();g.ellipse(cx,cy-1,22,9,0,0,Math.PI*2);g.fill();
  g.fillStyle='#4a443a';g.beginPath();g.ellipse(cx,cy-2,18,6.5,0,0,Math.PI*2);g.fill();
  g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=1;
  g.beginPath();g.ellipse(cx,cy-2,18,6.5,0,0,Math.PI*2);g.stroke();
  // ---- rift void ----
  g.fillStyle='#150a10';g.fillRect(cx-15,cy-47,30,45);
  g.fillStyle='#0a0509';g.fillRect(cx-12,cy-44,24,41);
  // swirling rift: hot in the middle, cold at the edges
  for(let i=0;i<9;i++){
    const t2=i/8,mid=1-Math.abs(t2-.5)*2;
    const wv=20*(.3+.7*Math.abs(Math.sin(time*2.2+i*1.3)))*(.5+.5*mid);
    const col='rgba('+Math.round(118+137*mid)+','+Math.round(28+66*mid)+','+Math.round(28+48*mid)+',.8)';
    g.fillStyle=col;g.fillRect(cx-wv/2,cy-41+i*4.7,wv,2.6)}
  const core=Math.sin(time*5)*.5+.5;
  g.fillStyle='rgba(255,115,75,'+(.22+gl*.3).toFixed(3)+')';
  g.fillRect(cx-4,cy-27+Math.sin(time*5)*3,8,13);
  g.fillStyle='rgba(255,205,165,'+(.2+core*.35).toFixed(3)+')';
  g.fillRect(cx-2,cy-23+Math.sin(time*5.6)*3,4,7);
  if(SV.particles&&Math.random()<.25)
    addPart({type:'dot',x:cx+rnd(-9,9),y:cy-8,vx:rnd(-3,3),vy:rnd(-30,-14),
      t:0,life:rnd(.5,1),color:pick(['#e04a3a','#ff8a5a','#c03028']),size:rnd(1,2.5)});
  // ---- stone arch ----
  const pB=pL.y<=pR.y?pL:pR, pF=pL.y<=pR.y?pR:pL;
  const drawPillar=function(p){
    g.fillStyle='rgba(0,0,0,.3)';g.beginPath();g.ellipse(p.x,p.y+3,11,5,0,0,Math.PI*2);g.fill();
    g.fillStyle='#3f3931';g.fillRect(p.x-9,p.y-8,18,9);              // base
    g.fillStyle='#575043';g.fillRect(p.x-9,p.y-8,18,2);
    g.fillStyle='#4c4438';g.fillRect(p.x-7,p.y-34,14,27);            // shaft
    g.fillStyle='#5f5648';g.fillRect(p.x-7,p.y-34,4,27);
    g.fillStyle='#3a342c';g.fillRect(p.x+4,p.y-34,3,27);
    g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=1;                    // brick joints
    for(let k=1;k<4;k++){g.beginPath();g.moveTo(p.x-7,p.y-34+k*6.5);
      g.lineTo(p.x+7,p.y-34+k*6.5);g.stroke()}
    g.strokeStyle='rgba(0,0,0,.22)';
    for(let k=0;k<3;k++){const yy=p.y-34+k*6.5+(k%2?0:3.2);
      g.beginPath();g.moveTo(p.x-7+(k%2?0:3.5),yy);g.lineTo(p.x+7-(k%2?0:3.5),yy);g.stroke()}
    g.fillStyle='#585040';g.fillRect(p.x-10,p.y-42,20,9);             // capital
    g.fillStyle='#6a6052';g.fillRect(p.x-10,p.y-42,20,3);
    g.fillStyle='rgba(0,0,0,.25)';g.fillRect(p.x-10,p.y-34,20,2)};
  if(pL.y<=pR.y){drawPillar(pL);drawPillar(pR)}else{drawPillar(pR);drawPillar(pL)}
  // lintel: a quad so it rests on both capitals even though the pillars
  // sit at different depths on either side of the road
  const bx=pF.x-pB.x,by=pF.y-pB.y,bl=hyp(bx,by)||1,ex=bx/bl*11,ey=by/bl*11;
  const t1x=pB.x-ex,t1y=pB.y-ey-52,t2x=pF.x+ex,t2y=pF.y+ey-52;
  g.fillStyle='#443e34';
  g.beginPath();g.moveTo(t1x,t1y);g.lineTo(t2x,t2y);
  g.lineTo(t2x,t2y+15);g.lineTo(t1x,t1y+15);g.closePath();g.fill();
  g.strokeStyle='#57503f';g.lineWidth=3;
  g.beginPath();g.moveTo(t1x,t1y+1.5);g.lineTo(t2x,t2y+1.5);g.stroke();
  g.strokeStyle='rgba(0,0,0,.28)';g.lineWidth=2;
  g.beginPath();g.moveTo(t1x,t1y+14);g.lineTo(t2x,t2y+14);g.stroke();
  const kx=(pB.x+pF.x)/2,ky=(pB.y+pF.y)/2;
  g.fillStyle='#6a6052';g.fillRect(kx-7,ky-56,14,19);        // keystone
  g.fillStyle='#7a7060';g.fillRect(kx-7,ky-56,14,3);
  g.fillStyle='rgba(0,0,0,.3)';g.fillRect(kx-7,ky-40,14,3);
  g.fillStyle='rgba(255,90,60,'+(.3+gl*.3).toFixed(3)+')';
  g.fillRect(kx-2,ky-53,4,6);
  // braziers perched on each end of the lintel
  const torch=function(x,y,ph){
    const f=.75+.25*Math.sin(time*7+ph);
    g.fillStyle='#241a1c';g.fillRect(x-4,y-5,8,5);                 // bowl
    g.fillStyle='#3d2f2c';g.fillRect(x-4,y-5,8,2);
    g.fillStyle='rgba(196,54,38,.95)';g.fillRect(x-3,y-4-10*f,6,10*f);
    g.fillStyle='#e8722a';g.fillRect(x-2,y-4-8*f,4,8*f);
    g.fillStyle='#f5a623';g.fillRect(x-1.5,y-4-5*f,3,5*f);
    g.fillStyle='#ffe9a0';g.fillRect(x-1,y-4-3*f,2,3*f)};
  torch(t1x,t1y,0);torch(t2x,t2y,2.3)}

// ---- hover enemy info ----
function drawEnemyTip(cw,ch){
  if(!mouseClient||G.placeType)return;
  if(G.state!=='playing'&&G.state!=='paused')return;
  const mp=screenToMap(mouseClient.x,mouseClient.y);
  let best=null,bd=26*26;
  for(const e of enemies){if(e.dead)continue;
    const art=enemyArt(e.cfg),sc=e.scale||1;
    const cy=e.sy-art.height*sc*.45;
    const inside=Math.abs(mp.x-e.sx)<art.width*sc*.5&&mp.y<e.sy&&mp.y>e.sy-art.height*sc;
    const d=inside?dist2(mp.x,mp.y,e.sx,cy)/Math.max(1,art.height*sc/20):dist2(mp.x,mp.y,e.sx,e.sy-8);
    if(d<bd){bd=d;best=e}}
  if(!best)return;
  const sp=mapToScreen(best.sx,best.sy-14);
  const hasShield=best.shield>0;
  const hasRes=!!(best.cfg.res&&Object.keys(best.cfg.res).length);
  const burning=best.onFire>0;
  // Every viper's dose is separate, so the tooltip adds them up and shows how
  // long the longest one still bites for.
  const poison=best.poisons&&best.poisons.length?best.poisons.reduce(function(a,p){
    return {pct:a.pct+p.pct,t:Math.max(a.t,p.t)}},{pct:0,t:0}):null;
  const w=190;
  let h=54;if(hasShield)h+=14;if(hasRes)h+=14;if(burning)h+=12;if(poison)h+=12;
  let px=clamp(sp.x-w/2,8,cw-w-8),py=sp.y-h-14;
  if(py<110)py=sp.y+16;
  ctx.fillStyle='rgba(20,16,10,.93)';ctx.fillRect(px,py,w,h);
  ctx.strokeStyle='#4a3f2c';ctx.lineWidth=2;ctx.strokeRect(px,py,w,h);
  ctx.textAlign='left';ctx.font="12px 'Silkscreen','Pixelify Sans',monospace";
  ctx.fillStyle=best.boss?'#f0a494':'#efe6d2';
  ctx.fillText(best.cfg.name,px+8,py+15);
  const bw=w-16,hpr=clamp(best.hp/best.maxHp,0,1);
  ctx.fillStyle='#0d0b08';ctx.fillRect(px+8,py+21,bw,10);
  ctx.fillStyle=best.boss?'#e0644c':'#7fb069';ctx.fillRect(px+8,py+21,bw*hpr,10);
  ctx.textAlign='center';ctx.font="bold 11px monospace";ctx.fillStyle='#fff';
  ctx.fillText(Math.ceil(best.hp)+'/'+best.maxHp+' HP',px+w/2,py+30);
  let ly=46;
  ctx.textAlign='left';ctx.font="12px 'Segoe UI',Verdana,sans-serif";ctx.fillStyle='#c9bca0';
  if(best.spd<=0){ctx.fillText('Stationary',px+8,py+ly)}
  else{const spdTxt=best.spd<1?best.spd.toFixed(2):best.spd.toFixed(1);
    ctx.fillText('Speed  '+spdTxt+' m/s',px+8,py+ly)}
  ly+=12;
  if(burning){
    ctx.fillStyle='#f08b3a';
    ctx.fillText('On fire  '+Math.ceil(best.fireDps)+'/s',px+8,py+ly);ly+=12}
  if(poison){
    ctx.fillStyle='#7fd84a';
    ctx.fillText('Poisoned  '+(Math.round(poison.pct*10000)/100)+'%/s for '+Math.ceil(poison.t)+'s',
      px+8,py+ly);ly+=12}
  if(hasShield){
    const sr=best.shieldRes?('  -'+Math.round(best.shieldRes*100)+'% all dmg'):'';
    ctx.fillStyle='#7ec8ff';
    ctx.fillText('Shield  '+Math.ceil(best.shield)+sr,px+8,py+ly);ly+=12}
  if(hasRes){
    ctx.fillStyle='#f0a494';
    const parts=[];
    for(const k in best.cfg.res)parts.push(k.charAt(0).toUpperCase()+k.slice(1)+' '+Math.round(best.cfg.res[k]*100)+'%');
    ctx.fillText('Resists  '+parts.join(', '),px+8,py+ly)}}
