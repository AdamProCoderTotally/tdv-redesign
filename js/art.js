"use strict";
// ============================================================
//  art.js — ART V2 runtime. Draws the sprites in js/artpack.js
//  through the game's own drawSpriteRows(), and plugs into the
//  existing draw entry points (drawFieldTower / drawFieldEnemy /
//  drawFieldDeco / drawFieldProjectile / weaponPose / tower + boss
//  icons / kill effects). Anything without ART V2 art falls straight
//  through to the old artist. Set ART_V2=false (js/terrain.js) to get
//  the old look back everywhere.
//  Presentation only: no stat, range, path or timing is read or
//  written here except what the old artists already read.
// ============================================================
// ---- unpack: artpack rows are run-length encoded ("c*12;" = 12 x c) ----
(function(){if(typeof ART==='undefined')return;
  const un=r=>{if(r.indexOf('*')<0)return r;let o='';for(let i=0;i<r.length;i++){const c=r[i];
    if(r[i+1]==='*'){const j=r.indexOf(';',i+2);o+=c.repeat(+r.slice(i+2,j));i=j}else o+=c}return o};
  for(const grp in ART)for(const k in ART[grp]){const s=ART[grp][k];if(!s.rle)continue;
    if(s.frames)s.frames=s.frames.map(f=>f.map(un));else s.rows=s.rows.map(un);delete s.rle}})();
// UI skin (css/art-ui.css) is scoped to body.artv2
if(typeof ART_V2!=='undefined'&&ART_V2&&document.body)document.body.classList.add('artv2');
const _artFrames=new WeakMap();
function artFrame(spr,i){let a=_artFrames.get(spr);
  if(!a){a=spr.frames?spr.frames.map(r=>({w:spr.w,h:spr.h,pal:spr.pal,rows:r})):[spr];_artFrames.set(spr,a)}
  return a[((i%a.length)+a.length)%a.length]}
// blit frame i with its anchor (ax,ay) on x,y; flip mirrors around the anchor
function artBlit(g,spr,i,x,y,flip,tint,sc){const f=artFrame(spr,i),ax=spr.ax||0,ay=spr.ay||0;sc=sc||1;
  drawSpriteRows(g,f,Math.round(x-(flip?spr.w-1-ax:ax)*sc),Math.round(y-ay*sc),sc,flip,tint)}
function _artHash(a,b){return hash2(Math.floor(a*7)+3,Math.floor(b*11)+5)}
const ART_GOLD={mix:'#f2c14a',f:.5},ART_VOID={mix:'#7a3ad0',f:.62},ART_HIT={mix:'#ffffff',f:.88},ART_LANE=['#ff7a33','#4aa8ff'],
  ART_LANES={ranger:['#ff7a33','#4aa8ff'],grenadier:['#4aa8ff','#ff7a33'],sniper:['#ff5a4a','#ff7a33'],phaser:['#4ad8ff'],
    viper:['#7aff4a','#f2c14a'],voidtraitor:['#b07aff'],farm:['#f2c14a'],village:['#ff7a33','#4aa8ff']},
  ART_MUZZLE={phaser:'muzzle_blue',viper:'muzzle_toxic'};
// ---------- towers ----------
function artTowerTL(t){const ups=(t&&t.ups)||[0],tier=Math.max(0,...ups),lane=(ups[1]||0)>(ups[0]||0)?1:0;return [tier,tier?lane:0]}
function artTowerSprite(type,t){if(typeof ART==='undefined'||!ART_V2||!TOWERS[type]||TOWERS[type].sprite)return null;
  const [tier,lane]=artTowerTL(t);return ART.towers[type+'_'+tier+'_'+lane]||ART.towers[visualType(type)+'_'+tier+'_'+lane]||null}
function artBaseType(t){return visualType(t&&t.type||'')}
function artFiring(type,t){if(!t)return false;const b=visualType(type);
  if(b==='phaser')return !!t.beamOn;if(b==='viper'&&t.gunFlash)return t.gunFlash[0]>0||t.gunFlash[1]>0||t.flashT>0;return t.flashT>0}
function drawArtTower(g,type,mx,my,t,time){
  const spr=artTowerSprite(type,t);if(!spr)return false;const base=visualType(type),still=base==='farm'||base==='village';
  const aim=t?(t.artAim?t.artAim[0]:(typeof t.aim==='number'?t.aim:-Math.PI/4)):-Math.PI/4;
  const firing=!still&&artFiring(type,t)&&spr.fireFrame!==undefined;
  const flip=!still&&Math.cos(firing&&typeof t.aim==='number'?t.aim:aim)<0;
  const ph=t?_artHash(t.x||0,t.y||0):0,idle=spr.idleFrames||[0];
  const fr=firing?spr.fireFrame:idle[Math.floor(time*(still?2.4:1.6)+ph*2)%idle.length];
  // gold prestige towers have their own gilded sprites; only fall back to a tint without one
  let tint=towerTint(t);if(!tint&&TOWERS[type]&&TOWERS[type].prestige&&!ART.towers[type+'_0_0'])tint=ART_GOLD;
  artBlit(g,spr,fr,mx,my,flip,tint);
  if(firing&&spr.tip&&base!=='voidtraitor'){const fxs=ART.fx[ART_MUZZLE[base]]||ART.fx.muzzle;
    const k=base==='phaser'?(time*12%3)/3:clamp(1-(t.flashT||(t.gunFlash?Math.max(t.gunFlash[0],t.gunFlash[1]):0))/.12,0,.999);
    for(const tp of (spr.tip2&&t.gunFlash&&t.gunFlash[1]>0?[spr.tip,spr.tip2]:[spr.tip])){const dx=tp[0]-spr.ax,dy=tp[1]-spr.ay;
      artBlit(g,fxs,Math.floor(k*3),mx+(flip?-dx:dx)+(flip?-3:3),my+dy,flip)}}
  // tier pips: chunky pixel chevrons in the lane colour
  const n=Math.min(5,totalUps(t)),lane=artTowerTL(t)[1];
  for(let i=0;i<n;i++){const x=Math.round(mx-n*3+i*6),y=Math.round(my+11);
    g.fillStyle='#1b1526';g.fillRect(x-1,y-1,6,4);g.fillStyle=(ART_LANES[base]||ART_LANE)[lane]||ART_LANE[0];g.fillRect(x,y,4,2);g.fillStyle='#fff6d0';g.fillRect(x,y,2,1)}
  return true}
// muzzle position for projectiles / beams follows the sprite's authored tip (tip2 = viper's second gun)
if(typeof weaponPose==='function'){const _wp=weaponPose;
  weaponPose=function(t,gi,angle){const p=_wp(t,gi||0,angle);const spr=artTowerSprite(t.type,t);if(!spr||!spr.tip)return p;
    const tp=gi&&spr.tip2?spr.tip2:spr.tip;
    const gx=mapPx(t.x||0,t.y||0),gy=mapPy(t.x||0,t.y||0)-elevAt(t.x||0,t.y||0)*ELEVH,flip=Math.cos(p.a)<0;
    const dx=tp[0]-spr.ax,dy=tp[1]-spr.ay;p.x=gx;p.y=gy+dy;p.mx=gx+(flip?-dx:dx);p.my=gy+dy;p.recoil=0;return p}}
// custom (Tower Creator) towers keep their own sprite; ART V2 only seats them on a pixel plinth
function drawArtCustomBase(g,mx,my){if(!ART_V2)return;
  g.fillStyle='rgba(18,10,30,.32)';g.beginPath();g.ellipse(mx+2,my+1,15,5,0,0,Math.PI*2);g.fill();
  const P=[[0,-6],[14,1],[0,8],[-14,1]];const fillD=(o,c)=>{g.fillStyle=c;for(let y=-6-o;y<=8+o;y++){const hw=Math.round((7+o-Math.abs(y-1))*2);if(hw>0)g.fillRect(mx-hw,my+y,hw*2,1)}};
  fillD(1,'#1b1526');fillD(0,'#55546a');g.fillStyle='#7a7a8e';for(let y=-5;y<=1;y++){const hw=Math.round((6-Math.abs(y-1))*2);if(hw>0)g.fillRect(mx-hw,my+y,hw*2,1)}
  g.fillStyle='#383648';g.fillRect(mx-12,my+2,24,1)}
// ---------- tower bar / shop icons: a bust crop at a whole-number scale ----------
const _artBox=new WeakMap();
function artBounds(spr,i){const f=artFrame(spr,i);let b=_artBox.get(f);if(b)return b;let x0=1e9,y0=1e9,x1=-1,y1=-1;
  f.rows.forEach((r,y)=>{for(let x=0;x<r.length;x++)if(r[x]!=='.'){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}});
  b={x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};_artBox.set(f,b);return b}
function artIcon(cv,spr,fr,flip,opt){opt=opt||{};const g=cv.getContext('2d');g.imageSmoothingEnabled=false;
  const b=artBounds(spr,fr),W=cv.width,H=cv.height,crop=opt.crop||.78;
  let sc=1;for(const s of [4,3,2,1,.5])if(b.w*s<=W+2&&b.h*crop*s<=H-2){sc=s;break}
  const vis=Math.min(b.h,Math.floor((H-2)/sc));
  g.save();g.beginPath();g.rect(0,0,W,H);g.clip();
  const x=Math.round((W-b.w*sc)/2-(flip?(spr.w-b.x-b.w):b.x)*sc),y=Math.round((opt.top!==undefined?opt.top:2)-b.y*sc+(b.h>vis?0:(H-2-b.h*sc)/2));
  drawSpriteRows(g,artFrame(spr,fr),x,y,sc,flip,opt.tint||null);g.restore()}
function artTowerThumb(cv,type){const spr=artTowerSprite(type,{ups:[0]});if(!spr)return false;
  const g=cv.getContext('2d');g.clearRect(0,0,cv.width,cv.height);
  const b=visualType(type);artIcon(cv,spr,0,false,{crop:b==='farm'||b==='village'?1:.78});return true}
function artBossIcon(cfg,cv){if(typeof ART==='undefined'||!ART_V2||cfg.sprite)return false;const spr=ART.enemies[cfg.kind];if(!spr)return false;
  const g=cv.getContext('2d');g.fillStyle='#0a0e13';g.fillRect(0,0,cv.width,cv.height);artIcon(cv,spr,0,false,{crop:.62});return true}
// ---------- enemies ----------
function artEnemySprite(c){if(typeof ART==='undefined'||!ART_V2||c.sprite)return null;return ART.enemies[c.kind]||null}
function drawArtEnemy(g,e,pal){const spr=artEnemySprite(e.cfg);if(!spr)return false;
  // world path direction -> screen: walking "up" the screen shows the back frames
  const dx=e.dirx||0,dy=e.diry||0,sx=dx-dy,sy=dx+dy,back=spr.backAt&&sy<-.01,flip=sx<-.01;
  const n=spr.walk||(spr.frames?spr.frames.length:1),fr=(back?spr.backAt:0)+Math.floor(e.anim*(spr.fps||7)*.9)%n;
  // drawEnemyBody always hands over a palette; only a DIFFERENT one (the Corrupt void hold) tints
  const tint=e.flash>0?ART_HIT:(pal&&pal!==e.cfg.pal?ART_VOID:null);
  artBlit(g,spr,fr,0,0,flip,tint,spr.px||1);return true}   // px:2 = bosses, blitted at 2x
// kill effect: themed puff per enemy family; bosses get the big blast
const ART_DEATH={ecto:/walker|sprinter|damned|necro|healer/,blood:/blood|splitter|brute|clot|royal|guard/,ember:/molten|blitz|tank|endbringer/,
  void:/void|wraith|whisper|faceless|unseen|cloak|demonic|night|lurker|misplaced|error|exec|deformed/,dust:/obsidian|tunnel|crawl|knight|king/};
function artDeathFx(e){if(typeof fxSprite!=='function')return;const k=e.cfg.kind||'';
  if(e.boss){fxSprite(ART_DEATH.void.test(k)?'bossdeath_void':'bossdeath',e.sx,e.sy,{sc:2});return}
  let n='deathpuff';if(ART_DEATH.void.test(k))n='death_void';else if(ART_DEATH.ember.test(k))n='death_ember';
  else if(ART_DEATH.dust.test(k))n='death_dust';else if(ART_DEATH.blood.test(k))n='death_blood';
  fxSprite(n,e.sx,e.sy)}
// ---------- scenery ----------
function drawArtDeco(g,d,time){if(typeof ART==='undefined'||!ART_V2)return false;
  const inGrid=d.x>=0&&d.x<GW&&d.y>=0&&d.y<GH,s=d.s,D=ART.deco;let spr=null,fr=0;
  if(d.t==='crate')spr=D.crates;else if(d.t==='barrel')spr=D.barrels;
  else if(ART_BIOME==='ash'){
    if(d.t==='ruin')spr=s<.35?D.ash_ruinwall0:s<.6?D.ash_ruinwall1:s<.8?D.ash_pillar0:D.ash_pillar1;
    else if(d.t==='tree')spr=inGrid?(s<.5?D.ash_deadtree0:s<.75?D.ash_deadtree1:D.ash_deadpine0):(s<.45?D.ash_deadpine0:s<.75?D.ash_deadpine1:D.ash_deadtree1);
    else if(d.t==='rock')spr=!inGrid?(s<.5?D.ash_obsidian1:D.ash_stump1):s<.25?D.ash_obsidian0:s<.6?D.ash_cinders:D.ash_stump0;
    else if(d.t==='bush')spr=s<.5?D.ash_stump1:D.ash_bones;
    else if(d.t==='flower'){spr=s<.12?D.ash_vent:s<.6?D.ash_tuft1:s<.8?D.ash_tuft0:D.ash_cinders;fr=Math.floor(time*5+s*7)}
    else if(d.t==='tuft')spr=s<.5?D.ash_tuft0:D.ash_tuft1}
  else if(d.t==='ruin')spr=D.rock1;
  else if(d.t==='tree')spr=inGrid?(s<.4?D.pine0:s<.6?D.broad0:s<.8?D.broad1:D.broad2):(s<.55?D.pine0:s<.8?D.pine1:D.broad1);
  else if(d.t==='rock')spr=!inGrid?D.rock1:s<.2?D.rock0:s<.42?D.pebbles:s<.75?D.bush1:D.flower1;
  else if(d.t==='bush')spr=s<.5?D.bush0:D.bush1;
  else if(d.t==='flower')spr=s<.34?D.flower0:s<.67?D.flower1:D.flower2;
  else if(d.t==='tuft')spr=s<.5?D.tuft0:D.tuft1;
  if(!spr)return false;const m=worldToMap(d.x+.5,d.y+.5),y=m.y-elevAt(d.x,d.y)*ELEVH;
  artBlit(g,spr,fr,m.x+Math.round((s-.5)*10),y+Math.round((hash2(d.x*3,d.y)-.5)*6),s>.5);return true}
// ---------- projectiles ----------
function drawArtProjectile(g,p){if(typeof ART==='undefined'||!ART_V2)return false;
  if(p.kind==='grenade'){const k=clamp(p.t/p.dur,0,1),ground=mapPy(p.tx,p.ty)-6;
    artShadow(g,p.x,lerp(p.launchY+23,ground,k),3+Math.sin(k*Math.PI)*2);
    artBlit(g,ART.fx.grenade,Math.floor(p.t*10),p.x,p.y,false);return true}
  const a=p.kind==='slug'||p.kind==='frag'?Math.atan2(p.vy,p.vx):p.e?Math.atan2(p.e.sy-10-p.y,p.e.sx-p.x):0;
  const spr=p.dtype==='laser'?ART.fx.tracer_laser:(p.col==='#ff4a3a'?ART.fx.tracer_plasma:ART.fx.tracer_bullet);
  g.save();g.translate(Math.round(p.x),Math.round(p.y));g.rotate(a);
  if(SV.particles){g.globalAlpha=.3;g.fillStyle=p.dtype==='laser'?'#4aa8ff':'#ffb347';g.fillRect(-spr.w+2,-2,spr.w+1,6);g.globalAlpha=1}
  drawSpriteRows(g,spr,-spr.ax,-spr.ay,1,false);g.restore();return true}
