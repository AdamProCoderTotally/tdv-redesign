"use strict";
// ============================================================
//  main.js — game flow, victory/defeat, secret ending,
//  main loop, render pipeline
// ============================================================
function startGame(modeId){
  const m=MODES[modeId]||MODES.easy;G.mode=m;
  const mp=G.mapSel;
  if(mp&&mp.data)TDV_MAP.apply(mp.data);else TDV_MAP.reset();
  enemies=[];towers=[];projs=[];parts.length=0;firePatches=[];
  G.cash=(m.startCash!=null)?m.startCash:250;
  lastCash=null;   // a fresh purse is not a windfall: no gain flash on match start
  G.lives=G.maxLives=m.hp;
  G.kills=0;G.sel=null;G.placeType=null;G.speed=1;G.leakFlash=0;G.shake=0;G.mpPaused=false;
  G.bossBanner=null;G.endT=0;G.endBlack=false;G.secret='pending';
  // Restarting from the pause menu stays inside the same live state, so ADMIN
  // cannot catch the boundary on a state edge and has to be told here.
  if(window.ADMIN)ADMIN.resetMatch();
  WaveMgr.reset();
  for(const o of spdBtns)o.classList.toggle('on',o.dataset.spd==='1');
  hideScreens();
  showMatchHud();
  const c=worldToMap(BASE_PT.x,BASE_PT.y);cam.tx=cam.x=c.x;cam.ty=cam.y=c.y;cam.tz=cam.zoom=1.05;camClamp();
  G.state='playing';
  // A match has its own sound: the lobby bed steps out for it, faded rather
  // than cut, so the transition never lands as a hard edit.
  Music.stop();
  buildTowerbar();updTowerbar();
  toast(m.name+' — defend the Ember Flame!')}

// The match HUD is a handful of absolutely positioned panels. Both cinematic
// beats — the wave-500 question and the ending — need them gone and back
// again as a set, so the boss bar / minimap can never be left stranded.
function hideMatchHud(){
  $('hudTop').style.display='none';$('towerbar').style.display='none';
  $('mmWrap').style.display='none';$('bossbar').style.display='none';
  $('sidepanel').classList.remove('show');
  $('skipWave').style.display='none';
  uptip.style.display='none'}
function showMatchHud(){
  $('hudTop').style.display='flex';$('towerbar').style.display='flex';
  $('mmWrap').style.display='block';$('bossbar').style.display='none';
  $('sidepanel').classList.remove('show');
  $('skipWave').style.display='none';
  uptip.style.display='none'}

function resetBattlefield(){
  enemies=[];towers=[];projs=[];parts.length=0;firePatches=[];
  G.sel=null;G.placeType=null;G.leakFlash=0;G.shake=0;
  G.bossBanner=null;
  $('sidepanel').classList.remove('show');
  $('bossbar').style.display='none';
  $('skipWave').style.display='none';
  uptip.style.display='none'}

function toMenu(){
  G.state='menu';
  G.endT=0;G.endBlack=false;
  $('hudTop').style.display='none';$('towerbar').style.display='none';
  $('mmWrap').style.display='none';
  resetBattlefield();
  refreshMenu();showScreen('mainMenu')}

function togglePause(){
  if(MP.active){
    // Multiplayer is server-owned: the real match never stops, so the local
    // sim must keep running too. This is just an overlay — Resume/Quit (quit
    // is a forfeit) and Settings. No Restart, no actual pause.
    if(G.state==='playing'&&!G.mpPaused){
      G.mpPaused=true;
      $('pRestart').style.display='none';
      showScreen('pauseMenu')}
    else{G.mpPaused=false;hideScreens()}
    Sfx.click();return}
  if(G.state==='playing'){G.state='paused';
    $('pWave').textContent='WAVE '+WaveMgr.n+(G.mode.waves===Infinity?'':' / '+G.mode.waves)+
      ' · '+G.mode.name;
    showScreen('pauseMenu')}
  else if(G.state==='paused'){G.state='playing';hideScreens()}
  Sfx.click()}
 $('pResume').onclick=()=>togglePause();
 $('pSettings').onclick=function(){Sfx.click();
   settingsReturn='pause';refreshSettings();showScreen('settingsMenu')};
 $('pRestart').onclick=function(){Sfx.click();
   if(MP.active){toast('Cannot restart a multiplayer match','bad');return}
   hideScreens();startGame(G.mode.id)};
 // In MP this is the forfeit: the opponent is declared the winner, we still
 // collect the loser's share, and the match is closed on the server. Quitting
 // any other way used to leave it running forever on the other screen.
 $('pQuit').onclick=function(){Sfx.click();
   if(MP.active){MP.leaveNow();return}
   toMenu()};
 $('endRestart').onclick=function(){Sfx.click();
   if(MP.active){toast('Cannot restart a multiplayer match','bad');return}
   hideScreens();startGame(G.mode.id)};
 $('endMenuBtn').onclick=function(){Sfx.click();
   if(MP.active){MP.leaveNow();return}
   toMenu()};

function endGameCommon(){
  $('hudTop').style.display='none';$('towerbar').style.display='none';
  $('mmWrap').style.display='none';
  resetBattlefield()}

// outcome class for the end card (colours, rays, glow)
function endKind(k){const e=$('endMenu');
  ['win','lose','ultimate'].forEach(function(c){e.classList.remove(c)});
  if(k)e.classList.add(k)}
function endMapName(){return (G.mapSel&&G.mapSel.name)||'TEST PLACE'}

function victory(){if(G.state!=='playing')return;
  G.state='victory';Sfx.win();Music.play('win');
  const mul=(G.mode.rewardMul!=null)?G.mode.rewardMul:1;
  const goldR=Math.round(BASE_WIN_GOLD*mul),xpR=Math.round(BASE_WIN_XP*mul);
  SV.gold+=goldR;SV.xp+=xpR;
  // leaderboard: count the win per mode and push the new stats to the cloud
  SV.lbWins[G.mode.id]=(SV.lbWins[G.mode.id]||0)+1;
  lbReport();
  let badgeName=null;
  const bid=BADGE_FOR_MODE[G.mode.id];
  if(bid&&!SV.badges[bid]){SV.badges[bid]=true;
    const bd=BADGES.find(b=>b.id===bid);if(bd)badgeName=bd.name}
  Save.save();
  if(badgeName)toast('Badge earned: '+badgeName+'!');
  const kills=G.kills,livesLeft=G.lives,maxLives=Math.max(1,G.maxLives||G.mode.hp);
  endGameCommon();
  endKind('win');
  renderResult('end',{kind:'win',crest:'win',
    kicker:endMapName()+' · '+G.mode.name,
    title:'VICTORY',
    sub:'The Ember Flame still burns.',
    pips:livesLeft/maxLives,
    verdict:winVerdict(livesLeft,maxLives),
    stats:[
      resRow('Waves',G.mode.waves+'/'+G.mode.waves),
      resRow('Base health left',Math.round(livesLeft)+' / '+Math.round(maxLives)),
      resNum('Enemies defeated',kills,'','',220),
      resNum('Gold earned',goldR,'+','',420),
      resNum('XP earned',xpR,'+','',560),
      (badgeName?resRow('Badge earned',badgeName):''),
      (mul!==1?resRow('Reward multiplier',mul+'x'):'')]});
  hideScreens();showScreen('endMenu')}

function defeat(){
  if(G.mp&&G.mp.inMatch){MP.baseFell();return}   // PVP: report the loss to the server instead
  if(G.state!=='playing')return;
  G.state='over';Sfx.over();Music.play('lose');
  const wave=WaveMgr.n;
  const xpR=50+wave*10;
  const mul=(G.mode.rewardMul!=null)?G.mode.rewardMul:1;
  const goldR=Math.round((40+wave*12)*mul/2);
  SV.xp+=xpR;SV.gold+=goldR;Save.save();
  toast('Salvaged +$'+goldR+' gold');
  const kills=G.kills,total=G.mode.waves,best=SV.lbEndlessWave||0;
  // The verdict reads the board while it still exists: what was standing when
  // the line broke is the only honest basis for what to change next time.
  const hadBeh=k=>towers.some(t=>towerBehavior(t.type)===k);
  const sawStealth=towers.some(t=>TOWERS[t.type].stealthDetect);
  endGameCommon();
  endKind('lose');
  const frac=total===Infinity?wave/Math.max(wave,best):wave/total;
  renderResult('end',{kind:'lose',crest:'lose',
    kicker:endMapName()+' · '+G.mode.name,
    title:'DEFEAT',
    sub:'The Ember Flame has fallen.',
    verdict:loseVerdict({wave:wave,total:total,near:frac>=.7,
      stealth:(G.mode.id==='expert'||G.mode.id==='nightmare'),sawStealth:sawStealth,
      hadVillage:hadBeh('village'),hadFarm:hadBeh('farm')}),
    tone:'hint',
    // Endless has no finish line to measure against, so it is measured against
    // the best wave this account has ever held.
    meter:{label:'WAVE '+wave+(total===Infinity?'':' / '+total),frac:frac,
      note:total===Infinity?('Your best line here is wave '+Math.max(wave,best)):
        (total-wave)+' waves were still to come'},
    stats:[
      resNum('Enemies defeated',kills,'','',220),
      resNum('Gold salvaged',goldR,'+','',420),
      resNum('XP earned',xpR,'+','',560)]});
  hideScreens();showScreen('endMenu')}

// ---- the wave-500 question ----
// Clearing endless wave 500 stops the match cold on a black screen. Accepting
// runs wave 501 against the Endbringer and ends the match there; declining
// hands the run back and endless keeps going like any other wave.
function openChallenge(){
  if(G.state!=='playing')return;
  G.state='challenge';G.sel=null;G.placeType=null;
  hideMatchHud();clearToasts();
  if(window.ADMIN)ADMIN.close();
  showScreen('challengeMenu');
  $('chYes').focus()}
function endChallenge(accept){
  Sfx.click();
  G.secret=accept?'accepted':'declined';
  hideScreens();showMatchHud();
  G.state='playing';
  if(accept)WaveMgr.start(ENDLESS_LAST_WAVE);
  else{WaveMgr.cd=10;toast('You let it pass. The line holds.')}}
$('chYes').onclick=()=>endChallenge(true);
$('chNo').onclick=()=>endChallenge(false);

// ---- the secret ending (endless wave 501) ----
// Fifteen and a half seconds that are nothing but dissolves: the field sinks,
// the letterbox slides in, four swells of light carry the eye across three
// title cards, and the last two seconds hand the picture to the result card.
// Every beat rides an eased curve — the one thing this sequence must not do is
// cut, because a cut would say "a screen changed" instead of "the run ended".
const ENDING_DUR=15.5,ENDING_DUR_CALM=6.2;
// [centre, width, height] — a Gaussian, so a bloom never has an edge to notice.
const END_BLOOMS=[[3.0,1.0,.82],[6.6,.9,.44],[9.8,.9,.5],[13.2,1.3,.34]];
function endBloom(t){
  let v=0;
  for(const b of END_BLOOMS){const p=(t-b[0])/b[1];v=Math.max(v,Math.exp(-p*p)*b[2])}
  return v}
function endDur(){return reduceMotion()?ENDING_DUR_CALM:ENDING_DUR}
function startEnding(){
  if(G.state!=='playing')return;
  G.state='ending';G.endT=0;G.endBlack=false;G.endEmbers=false;
  G.sel=null;G.placeType=null;
  hideMatchHud();
  clearToasts();
  // The score starts with the first frame of the ending and runs underneath
  // the cards, so the music arrives with the picture rather than after it.
  Music.play('secret');
  Sfx.tone(110,3.2,'sine',.25,-50);          // the field letting go beneath it
  cam.tz=1.05;                                // slow cinematic push-in (see frame())
  if(window.ADMIN)ADMIN.close()}
function finishEnding(){
  G.state='over';G.endBlack=true;G.endEmbers=SV.particles&&!reduceMotion();
  SV.gold+=2500;SV.xp+=2500;
  SV.badges.itends=true;
  Save.save();
  const kills=G.kills,lives=Math.max(0,G.lives),
    maxLives=Math.max(1,G.maxLives||MODES.endless.hp);
  endGameCommon();
  endKind('ultimate');
  renderResult('end',{kind:'ultimate',crest:'ultimate',letters:true,
    kicker:'ENDLESS · WAVE 501',
    title:'THE END',
    sub:'You endured until the very end.',
    pips:lives/maxLives,
    verdict:'Wave 501 was the last one. There is nothing past it left to fight.',
    tone:'secret',
    stats:[
      resRow('Waves',lives>=maxLives?'501/501 — unbroken':'501/501'),
      resNum('Enemies defeated',kills,'','',240),
      resRow('Base health left',Math.round(lives)+' / '+Math.round(maxLives)),
      resNum('Gold earned',2500,'+','',520),
      resNum('XP earned',2500,'+','',660),
      resRow('Badge earned','It.. Ends?')]});
  hideScreens();showScreen('endMenu')}

// --- ending title cards (dissolve in, drift, dissolve out) ---
function endCardFade(t,a,b){
  const f=reduceMotion()?.5:.95;         // calm mode fades in place, never drifts
  if(t<=a||t>=b)return 0;
  return Math.min(1,(t-a)/f)*Math.min(1,(b-t)/f)}
function endCard(ctx,cw,ch,t,a,b,txt,font,col,glow){
  const al=endCardFade(t,a,b);if(al<=0)return;
  const p=clamp((t-a)/(b-a),0,1),calm=reduceMotion();
  ctx.save();
  ctx.globalAlpha=al;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font=font;
  ctx.translate(cw/2,ch/2+(calm?0:(1-p)*18)-7);
  // The cards come out of the light and go back into it: a hard-edged title
  // would read as a subtitle track, not as the end of the run.
  if(!calm){const soft=(1-al)*7;ctx.filter=soft>.4?'blur('+soft.toFixed(2)+'px)':'none'}
  if(glow){ctx.shadowColor=col;ctx.shadowBlur=glow}
  ctx.fillStyle=col;
  ctx.fillText(txt,0,0);
  ctx.restore()}
function drawEndingEmbers(ctx,cw,ch,t){
  ctx.save();
  for(let i=0;i<30;i++){
    const seed=(i*.6180339887)%1,sp=.05+.045*((i*7)%6)/6;
    const life=(t*sp+seed)%1;
    const x=cw*(.08+.84*((i*.3819660113)%1))+Math.sin(t*.7+i*1.7)*20*(1-life*.5);
    const y=ch*(1.04-life*1.14);
    const a=Math.sin(life*Math.PI);if(a<=0)continue;
    ctx.fillStyle='rgba(255,'+(140+((i*37)%90))+',80,'+(a*.6).toFixed(3)+')';
    const s=(i%4===0)?3:2;
    ctx.fillRect(Math.round(x),Math.round(y),s,s)}
  ctx.restore()}

// ---- main loop ----
// rAF is suspended outright while the tab is hidden or the desktop window is
// minimised, which would freeze the match the moment the player tabs out. A
// timer drives the very same step instead while that is true, so the sim keeps
// real time instead of pausing. `background` widens the catch-up budget: with
// one tick every 250ms the loop has to be allowed more than six 1/60 steps or
// the game would crawl at a quarter speed in the background.
let lastT=performance.now(),acc=0,uiTick=0;
function frame(now){requestAnimationFrame(frame);step(now,false)}
function step(now,background){
  const rdt=Math.min(background?.3:.1,(now-lastT)/1000);lastT=now;G.time+=rdt;
  if(window.MP)MP.tick(rdt);   // multiplayer polls/heartbeat (own state machine)
  if(G.leakFlash>0)G.leakFlash=Math.max(0,G.leakFlash-rdt);
  // The arrival banner counts real seconds. It used to lose 1/60 per painted
  // frame, so it ran twice as fast on a 120Hz display and froze while the tab
  // was hidden (render is skipped there).
  if(G.bossBanner&&G.bossBanner.t>0)G.bossBanner.t=Math.max(0,G.bossBanner.t-rdt);
  if(G.shake>0)G.shake=Math.max(0,G.shake-rdt*22);
  if(G.state==='playing'){
    // Camera panning belongs to real time. It used to sit inside the substep
    // loop, so panning at 5x speed moved five times faster than panning at 1x.
    const cs=420*rdt/cam.zoom;
    if(keys['w']||keys['arrowup'])cam.ty-=cs;
    if(keys['s']||keys['arrowdown'])cam.ty+=cs;
    if(keys['a']||keys['arrowleft'])cam.tx-=cs;
    if(keys['d']||keys['arrowright'])cam.tx+=cs;
    camClamp();
    acc+=rdt*G.speed;let steps=0;
    // 5x speed needs five 1/60 steps inside one 60fps frame, so the cap has to
    // travel with the speed. A fixed six left no headroom at all.
    const maxSteps=background?20:Math.max(6,Math.ceil(G.speed*2));
    while(acc>1/60&&steps<maxSteps){
      if(G.state!=='playing')break;
      const dt=1/60;acc-=dt;steps++;
      WaveMgr.update(dt);
      for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];
        if(!e)continue;
        if(e.dead){enemies.splice(i,1);continue}updEnemy(e,dt)}
      for(const t of towers)updTower(t,dt);
      updProjs(dt);updFirePatches(dt);updParts(dt)}
    // Debt the loop could not pay is dropped rather than carried. Uncapped, it
    // grew for good the moment a frame cost more than the sim could burn, and the
    // match then ran slower than the speed button claimed while still paying the
    // full step count every single frame.
    if(acc>1/60)acc=0}
  else if(G.state==='menu'){
    cam.tx=worldToMap(13+Math.sin(G.time*.1)*6,13+Math.cos(G.time*.08)*5).x;
    cam.ty=worldToMap(13,13).y+Math.sin(G.time*.07)*40;
    camClamp();updParts(rdt)}
  else if(G.state==='ending'){
    G.endT+=rdt;
    // The push-in travels the whole length of the sequence; at the old rate it
    // reached its limit six seconds in and the rest of the shot sat still.
    cam.tz=clamp(1.05+G.endT*.022,1,1.32);
    updParts(rdt);
    if(G.endT>=endDur())finishEnding()}
  cam.x=lerp(cam.x,cam.tx,Math.min(1,rdt*10));
  cam.y=lerp(cam.y,cam.ty,Math.min(1,rdt*10));
  cam.zoom=lerp(cam.zoom,cam.tz,Math.min(1,rdt*10));
  // nothing to paint while hidden — skip the whole canvas pass and just keep
  // the simulation (and the multiplayer reporting) running underneath
  if(!background)render();
  if(window.ADMIN)ADMIN.tick();
  uiTick+=rdt;
  if(uiTick>.1){uiTick=0;
    if(G.state==='playing'||G.state==='paused'){
      updateHUD();
      // rebuilding the hotbar while unfocused would churn the DOM for nothing
      if(!background)updTowerbar();
      if(G.sel&&!background)refreshPanelAfford();
      if(!background)drawMinimap()}}}

// How far past the window an entity still draws: a sprite reaches roughly 64px
// above its anchor and the board lifts another 28, so culling exactly at the
// edge would pop things into view as they walk in.
const CULL_PAD=240;
function render(){const cw=canvas.width/dpr,ch=canvas.height/dpr;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;
  ctx.fillStyle=(typeof ART_V2!=='undefined'&&ART_V2&&ART_BIOME==='ash')?'#7a2410':'#183a41';ctx.fillRect(0,0,cw,ch);   // ART V2: lava backdrop on the Ashlands
  const shx=G.shake>0?rnd(-G.shake,G.shake):0,shy=G.shake>0?rnd(-G.shake,G.shake):0;
  ctx.save();
  ctx.translate(cw/2+shx,ch/2+shy);ctx.scale(cam.zoom,cam.zoom);ctx.translate(-cam.x,-cam.y);
  ctx.drawImage(terrain,0,0);
  if(SV.particles){const t=G.time;
    for(let i=0;i<waterFx.length;i+=3){const w=waterFx[i];
      const p=(t*.4+w.ph)%1;if(p>=.45)continue;
      const a=Math.sin(p/.45*Math.PI),sy=w.y-2+Math.sin(t*2+i)*3;
      ctx.fillStyle='rgba(150,210,210,'+(.34*a).toFixed(3)+')';
      ctx.fillRect(w.x-6,sy,9,2);
      ctx.fillStyle='rgba(224,246,246,'+(.4*a).toFixed(3)+')';
      ctx.fillRect(w.x-3,sy,4,2)}}
  ctx.strokeStyle='rgba(230,210,170,.35)';ctx.lineWidth=2;ctx.beginPath();
  const step=2.6;
  for(let d=(G.time*1.1)%step;d<PATH.total;d+=step){
    const s=samplePath(PATH,d),m=worldToMap(s.x,s.y);
    const dx=s.dx-s.dy,dy=(s.dx+s.dy)*.5,L=hyp(dx,dy)||1,ux=dx/L,uy=dy/L,px=-uy,py=ux;
    const bx=m.x-ux*4,by=m.y-uy*4;
    ctx.moveTo(bx-px*5,by-py*5);ctx.lineTo(bx+ux*4,by+uy*4);ctx.lineTo(bx+px*5,by+py*5)}
  ctx.stroke();
  for(const f of firePatches)drawFieldPatch(ctx,f,G.time);
  if(G.state==='playing'&&G.placeType&&hoverPx){
    const gp=mapToGridPoint(hoverPx.x,hoverPx.y);
    const ok=canPlaceAt(gp.x,gp.y)&&G.cash>=TOWERS[G.placeType].cost&&!atLimit(G.placeType);
    const lift=elevAt(gp.x,gp.y)*ELEVH;
    ctx.fillStyle=ok?'rgba(130,200,90,.3)':'rgba(220,80,60,.3)';
    ctx.beginPath();ctx.ellipse(hoverPx.x,hoverPx.y-lift,15,7.5,0,0,Math.PI*2);ctx.fill();
    if(ok){const isVillage=towerBehavior(G.placeType)==='village';
      // a village's reach is set by villageRadius(), not its base range, and
      // it may already be wider because of the villages standing next door
      const rng=isVillage?villageRadius({x:gp.x,y:gp.y,S:{vRadius:0}})
        :TOWERS[G.placeType].range*(elevAt(gp.x,gp.y)>0?1.08:1);
      ctx.strokeStyle='rgba(130,200,90,.65)';ctx.fillStyle='rgba(130,200,90,.08)';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.ellipse(hoverPx.x,hoverPx.y-lift,R_ISO_X(rng),R_ISO_Y(rng),0,0,Math.PI*2);
      ctx.fill();ctx.stroke();
      ctx.globalAlpha=.6;
      const lanes=TOWERS[G.placeType].lanes;
      const ghost={ups:new Array(lanes).fill(0),flashT:0,aim:-Math.PI/4,
        S:towerStats({type:G.placeType,ups:new Array(lanes).fill(0),x:gp.x,y:gp.y})};
      drawTowerBody(ctx,G.placeType,hoverPx.x,hoverPx.y-lift,ghost,G.time);
      ctx.globalAlpha=1}}
  // Anything the camera cannot reach earns no projection, no sort entry and no
  // draw call. A full board carries several hundred deco and most of them sit in
  // the ocean ring, outside the window at any zoom worth playing at.
  const cL=cam.x-cw/(2*cam.zoom)-CULL_PAD,cR=cam.x+cw/(2*cam.zoom)+CULL_PAD;
  const cT=cam.y-ch/(2*cam.zoom)-CULL_PAD,cB=cam.y+ch/(2*cam.zoom)+CULL_PAD;
  const onScreen=(mx,my)=>mx>cL&&mx<cR&&my>cT&&my<cB;
  const drawList=[];
  for(const d of decos){const mx=mapPx(d.x+.5,d.y+.5),my=mapPy(d.x+.5,d.y+.5);
    if(onScreen(mx,my))drawList.push({d:d.x+d.y,f:drawDeco,dd:d})}
  for(const t of towers){const mx=mapPx(t.x,t.y),my=mapPy(t.x,t.y);
    if(onScreen(mx,my))drawList.push({d:t.x+t.y+.5,f:drawTower,dd:t})}
  for(const e of enemies)if(!e.dead&&onScreen(e.sx,e.sy))
    drawList.push({d:e.px+e.py,f:drawEnemy,dd:e});
  drawList.push({d:BASE_PT.x+BASE_PT.y+.2,f:drawBase,dd:G.time});
  drawList.push({d:SPAWN_PT.x+SPAWN_PT.y-.7,f:drawSpawn,dd:G.time});
  drawList.sort(function(a,b){return a.d-b.d});
  for(const it of drawList)it.f(ctx,it.dd,G.time);
  for(const p of projs)drawFieldProjectile(ctx,p);
  drawParts(ctx);
  if(window.ADMIN)ADMIN.render(ctx);
  ctx.restore();
  drawEnemyTip(cw,ch);
  if(window.ADMIN)ADMIN.tip(cw,ch);   // friendly spawns read the same way
  if(G.bossBanner&&G.bossBanner.t>0){
    ctx.globalAlpha=Math.min(1,G.bossBanner.t);
    ctx.fillStyle='#000c';ctx.fillRect(0,ch/2-46,cw,92);
    ctx.textAlign='center';
    ctx.font="26px 'Silkscreen','Pixelify Sans',monospace";ctx.fillStyle='#b0a8ff';
    ctx.fillText(G.bossBanner.title,cw/2,ch/2-2);
    ctx.font="15px 'Silkscreen','Pixelify Sans',monospace";ctx.fillStyle='#c9a86a';
    ctx.fillText(G.bossBanner.sub,cw/2,ch/2+28);
    ctx.globalAlpha=1}
  if(G.state==='ending'){
    const t=G.endT,E=endDur();
    // The field sinks on a curve rather than a linear ramp: a straight fade
    // reads as a dimmer switch, an eased one reads as nightfall.
    const dp=clamp(t/2.6,0,1),dark=dp*dp*(3-2*dp);
    ctx.fillStyle='rgba(5,4,10,'+dark+')';ctx.fillRect(0,0,cw,ch);
    if(dark>.4&&SV.particles)drawEndingEmbers(ctx,cw,ch,t);
    // Light swells instead of a flash — the handover between cards, and the
    // single breath before the last one.
    const bl=endBloom(t);
    if(bl>.01){
      const g=ctx.createRadialGradient(cw/2,ch*.46,0,cw/2,ch*.46,Math.max(cw,ch)*.72);
      g.addColorStop(0,'rgba(255,246,228,'+(bl*.92).toFixed(3)+')');
      g.addColorStop(.42,'rgba(255,228,186,'+(bl*.34).toFixed(3)+')');
      g.addColorStop(1,'rgba(255,214,160,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,cw,ch)}
    // title cards: WAVE 501 → You Did It... → It.. Ends?
    endCard(ctx,cw,ch,t,3.2,6.7,'WAVE 501',
      "22px 'Silkscreen','Pixelify Sans',monospace",'#e8c07a',10);
    endCard(ctx,cw,ch,t,6.7,9.9,'You Did It...',
      "34px 'Silkscreen','Pixelify Sans',monospace",'#ffffff',18);
    endCard(ctx,cw,ch,t,9.9,13.4,'It.. Ends?',
      "26px 'Silkscreen','Pixelify Sans',monospace",'#cdb4ff',16);
    // cinematic letterbox, eased all the way in so it never arrives as a cut
    const lp=clamp((t-1.8)/1.5,0,1),bar=(1-Math.pow(1-lp,3))*ch*.1;
    if(bar>.5){ctx.fillStyle='#000';ctx.fillRect(0,0,cw,bar);ctx.fillRect(0,ch-bar,cw,bar)}
    // the last two and a half seconds are a slow exhale to black
    const sp=clamp((t-(E-2.5))/2.5,0,1);
    if(sp>0){ctx.fillStyle='rgba(0,0,0,'+(sp*sp).toFixed(3)+')';ctx.fillRect(0,0,cw,ch)}}
  // The result card rises out of the ending instead of replacing a black
  // frame: the embers keep drifting behind the plate.
  if(G.endBlack){
    ctx.fillStyle='#000';ctx.fillRect(0,0,cw,ch);
    if(G.endEmbers)drawEndingEmbers(ctx,cw,ch,G.time)}
  if(G.leakFlash>0){ctx.fillStyle='rgba(220,70,50,'+(G.leakFlash*.4)+')';ctx.fillRect(0,0,cw,ch)}}

requestAnimationFrame(frame);
// rAF stops entirely in hidden tabs and minimised desktop windows, which would
// freeze the match (and let the multiplayer clock run away from a static
// battlefield). Drive the same step from a timer while the tab is hidden; the
// `background` flag switches off painting so an unfocused game costs almost
// nothing to keep alive.
setInterval(function(){
  if(!document.hidden)return;          // rAF owns the visible tab
  step(performance.now(),true)},250);
refreshMenu();