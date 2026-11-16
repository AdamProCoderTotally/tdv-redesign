"use strict";
// ============================================================
//  ui.js — toasts, side panel, tower bar, HUD, minimap
// ============================================================
function toast(msg,cls){
  // colour it automatically when it's obviously good news
  if(!cls&&/\b(earned|unlocked|loaded|welcome|cleared|income|salvaged|equipped|synced)\b|\+\$|\+\d/i.test(msg))cls='good';
  const d=document.createElement('div');d.className='toast '+(cls||'');
  d.innerHTML='<i></i><span></span>';d.querySelector('span').textContent=msg;
  const box=$('toasts');
  while(box.children.length>3)box.firstChild.remove();
  box.appendChild(d);
  setTimeout(()=>d.classList.add('out'),2500);
  setTimeout(()=>d.remove(),2900)}
function clearToasts(){const b=$('toasts');if(!b)return;
  while(b.firstChild)b.firstChild.remove()}

// ---- side panel (tower stats + upgrades) ----
function selectTower(t){if(t&&t.remote)t=null;   // invader watches the defender's towers, never manages them
  G.sel=t;
  $('sidepanel').classList.toggle('show',!!t);refreshPanel()}
// ---- upgrade price cell ----
// upCost() already charges the discounted price (see entities.js), so the panel
// must print that number too — with the list price struck through, so a village
// reads as a saving instead of a price that never moves.
function priceCell(raw,price){
  return price<raw?'<s>$'+raw+'</s><em>$'+price+'</em>':'$'+price}
// ---- stat row markup shared by the side panel and the shop info panel
// (ui.js loads before screens.js, so both read these) ----
const BOOST='#8ce89a',SUPPORT_ONLY='0 — support only';
function pct(v){return (Math.round((v||0)*1000)/10)+'%'}
function statrow(label,val,color){return '<div class="statrow"><span>'+label+'</span><b'+
  (color?' style="color:'+color+'"':'')+'>'+val+'</b></div>'}
function dmgTypeRow(dtype){return statrow('Damage type',dtype,DMG_COLORS[dtype]||'#e8dcc0')}
function poisonRow(pctVal,dur,chance){return statrow('Poison',
  (Math.round(pctVal*10000)/100)+'% of max HP/s for '+dur+'s &middot; '+
  Math.round(chance*100)+'% on hit','#8ce85a')}
// the green "+n%" a village aura adds to a live stat
function aura(v){return v>0?' <i style="font-style:normal;font-size:.85em">+'+pct(v)+'</i>':''}
// Target priorities. A normal tower has one; a Double Gunner VIPER gets an
// override per barrel, and "SAME AS VIPER" is a real option rather than a
// default that silently changes when the base priority moves.
const TGT_MODES=[['first','First'],['last','Last'],['strong','Strongest'],
  ['weak','Weakest'],['close','Closest']];
function tgtOptions(sel,withSame){
  let h=withSame?'<option value="">Same as VIPER</option>':'';
  for(const m of TGT_MODES)h+='<option value="'+m[0]+'"'+
    (m[0]===sel?' selected':'')+'>'+m[1]+'</option>';
  return h}
function buildTargeting(t){
  const multi=!!(t.S&&t.S.guns>1);
  let h='<h4>TARGETING</h4><div class="tgtRow"><span>'+(multi?'VIPER':'Priority')+
    '</span><select data-tgt="-1">'+tgtOptions(t.tgtMode||'first',false)+'</select></div>';
  // A single barrel has nothing to override, so it gets the one control.
  if(multi)for(let gi=0;gi<2;gi++)
    h+='<div class="tgtRow"><span>GUN '+(gi+1)+'</span><select data-tgt="'+gi+'">'+
      tgtOptions((t.gunMode&&t.gunMode[gi])||'',true)+'</select></div>';
  $('spTargeting').innerHTML=h}
// The panel's stat rows, built as data so a change patches just the rows that
// moved. Rows only ever appear or vanish at their own conditional, so index
// order is the layout.
function statRows(t){const S=t.S;
  const isPh=t.type==='phaser';
  // Village support baked into this tower (see towerStats -> villageAura). Any
  // stat a village is lifting shows green, and a discount gets its own row so
  // the price cut is visible rather than silently applied at checkout.
  const va=S.vAura||{range:0,rate:0,dmg:0,discount:0};
  const discRow=va.discount>0?
    statrow('Village discount',pct(va.discount)+' off upgrades',BOOST):null;
  const hp=statrow('Tower HP',Math.max(0,Math.ceil(t.hp))+'/'+t.maxHp);
  if(towerBehavior(t.type)==='village')return [
    statrow('Buff range',villageRadius(t).toFixed(1)),
    statrow('Range buff','+'+pct(S.vRange)+' to neighbours',BOOST),
    statrow('Firerate buff','+'+pct(S.vRate)+' to neighbours',BOOST),
    ...(S.vDmg?[statrow('Damage buff','+'+pct(S.vDmg)+' to neighbours',BOOST)]:[]),
    ...(S.vDiscount?[statrow('Upgrade discount',pct(S.vDiscount)+' nearby',BOOST)]:[]),
    statrow('Damage',SUPPORT_ONLY),hp];
  if(towerBehavior(t.type)==='farm')return [
    statrow('Income','$'+fmt(S.income)+' / wave'),
    ...(discRow?[discRow]:[]),hp];
  const ignArr=[];if(S.ign.bullet)ignArr.push('Bullet');if(S.ign.explosion)ignArr.push('Explosive');
  return [
    statrow('Damage',fmt(S.dmg)+aura(va.dmg),va.dmg>0?BOOST:''),
    statrow(isPh?'Beam tick':'Attack speed',
      (isPh?'0.10s':(1/S.rate).toFixed(2)+'s')+aura(va.rate),va.rate>0?BOOST:''),
    statrow('Range',S.range.toFixed(1)+aura(va.range),va.range>0?BOOST:''),
    dmgTypeRow(S.dtype),
    statrow('DPS',Math.round(isPh?S.dmg*10:S.dmg*S.rate)),
    ...(discRow?[discRow]:[]),
    ...(isPh?[statrow('Charge-up',S.charge.toFixed(1)+'s'),
      statrow('Enemy chain',S.chain?S.chain+' ('+Math.round(S.dmg*1.5)+' / 0.1s)':'0')]:[]),
    ...(S.burst>1?[statrow('Burst',S.burst+' shots, '+S.burstGap+'s apart')]:[]),
    ...(S.splash?[statrow('Splash radius',S.splash.toFixed(1))]:[]),
    ...(S.splashDmg?[statrow('Splash damage',fmt(S.splashDmg))]:[]),
    ...(S.fragCount?[statrow('Shrapnel',S.fragCount+' × '+fmt(S.fragDmg))]:[]),
    ...(ignArr.length?[statrow('Ignores',ignArr.join(', ')+' resistance')]:[]),
    ...(S.patchDps?[statrow('Fire patch',fmt(S.patchDps)+'/s on ground')]:[]),
    ...(S.patchDur?[statrow('Patch duration',S.patchDur+'s')]:[]),
    ...(S.patchRad?[statrow('Patch radius bonus','+'+S.patchRad.toFixed(1))]:[]),
    ...(S.corrupt?[statrow('Corruption',fmt(S.corrupt)+'/s for '+S.corruptDur+'s','#c88ae0')]:[]),
    ...(S.bossMul?[statrow('Boss damage','+'+(S.bossMul*100)+'% vs bosses','#c88ae0')]:[]),
    ...(S.ign&&S.ign.all?[statrow('Resistances','all ignored','#c88ae0')]:[]),
    ...(S.corruptAbility?[statrow('Corrupt','slows the board 75% for 10s &middot; 60s')]:[]),
    ...(S.poisonPct?[poisonRow(S.poisonPct,S.poisonDur,S.poisonChance)]:[]),
    ...(S.spread?[statrow('Spreadshots','2 diagonals every 3rd shot')]:[]),
    ...(S.cluster?[statrow('Clustershots','splits into 3 on impact')]:[]),
    ...(S.pierce?[statrow('Pierce',S.pierce+' extra '+(S.pierce===1?'enemy':'enemies')+
      (S.cluster?' per fragment':''))]:[]),
    ...(S.puddle?[statrow('Poison puddles','where a shot lands')]:[]),
    ...(S.guns>1?[statrow('Barrels',S.guns+' guns, each -'+
      Math.round((1-S.gunDmg)*100)+'% damage')]:[]),
    ...(S.twin?[statrow('Twin Gunner','left gun +30% firerate')]:[]),
    ...(S.toxic?[statrow('Toxic','shots slow enemies 50%','#8ce85a')]:[]),
    ...(S.cure?[statrow('Cure','+25% damage and firerate','#f5d442')]:[])]}
// Patches the stat rows onto the panel. The box is written as a whole because
// rows come and go with the tower: removing one DOM node shifts every index
// behind it, so an element-by-element pass leaves the tail of the previous
// tower's rows on screen. Nothing else lives in here — the sprite canvas, the
// lane cells and the targeting selects are separate nodes, so a rebuild of this
// box costs a string compare when nothing moved.
function paintStatRows(rows){const box=$('spStats'),prev=box._rows;
  if(prev&&prev.length===rows.length){
    let same=true;for(let i=0;i<rows.length;i++)if(prev[i]!==rows[i]){same=false;break}
    if(same)return}
  box.innerHTML=rows.join('');box._rows=rows}
function refreshPanel(){const t=G.sel;if(!t){$('sidepanel').classList.remove('show');return}
  const d=TOWERS[t.type],S=t.S;
  drawTowerThumb($('spTitle').querySelector('canvas'),t.type);
  $('spTitle').querySelector('.nm').textContent=d.name;
  $('spLv').textContent='Upgrades '+totalUps(t)+' / '+(d.lanes*5);
  $('spTraits').innerHTML=traitChips(S);
  $('spTargeting').style.display=(towerBehavior(t.type)==='farm'||
    towerBehavior(t.type)==='village')?'none':'';
  paintStatRows(statRows(t));
  buildTargeting(t);
  let bh='';
  const ups=upsOf(t);
  for(let li=0;li<d.lanes;li++){
    const cap=laneCap(t,li),lv=ups[li]||0;
    const hdr=(cap<5)?('CAPPED AT '+cap):(lv>=5?'MAX':lv+'/5');
    bh+='<div class="lane"><h5>'+(d.laneNames[li]||('PATH '+(li+1)))+'<span>'+hdr+'</span></h5>';
    let wrapOpen=false;
    d.ups[li].forEach(function(u,i){
      const fx=fxText(u.fx);
      if(cap<5&&i>=cap){
        if(!wrapOpen){bh+='<div class="laneLockWrap">';wrapOpen=true}
        bh+='<div class="up lock" data-fx="'+fx+'"><div class="dot"></div><div class="nm"><b>'+u.name+'</b></div><div class="c"></div></div>';
        return}
      const done=i<lv,next=i===lv;
      const price=next?upCost(t,li,i):0;
      const can=next&&G.cash>=price;
      bh+='<div class="up '+(done?'done':(next?(can?'next':'lock'):'lock'))+'" data-l="'+li+'" data-i="'+i+'" data-fx="'+fx+'">'+
        '<div class="dot"></div><div class="nm"><b>'+u.name+'</b></div>'+
        '<div class="c" data-p="'+price+'">'+(done?'&#10003;':(next?priceCell(u.cost,price):''))+'</div></div>'});
    if(wrapOpen)
      bh+='<div class="laneLockCover"><i class="icLock big"></i><div class="laneLockTxt">PATH LOCKED</div></div></div>';
    bh+='</div>'}
  $('spLanes').innerHTML=bh;
  $('sellBtn').textContent='Sell for $'+Math.floor(t.invested*.7);
  $('sellBtn').onclick=function(){sellTower(t)}}
function refreshPanelAfford(){const t=G.sel;if(!t)return;
  // Toxic and Cure arrive and expire on their own clocks while the panel is
  // open, so the panel has to follow the moment either flips rather than
  // holding a row for a buff that is gone. Only the rows it moves are patched —
  // the cure multiplier lands on Damage, Attack speed and DPS too.
  const st=(t.toxicT>0?1:0)|(t.cureT>0?2:0);
  if(st!==t._buffState){t._buffState=st;paintStatRows(statRows(t))}
  const rows=$('spLanes').querySelectorAll('.up');
  for(const el of rows){const li=+el.dataset.l,idx=+el.dataset.i;
    if(isNaN(li)||idx!==(upsOf(t)[li]||0))continue;
    const price=upCost(t,li,idx);          // a village may have changed it since the panel opened
    const can=G.cash>=price;
    el.classList.toggle('next',can);el.classList.toggle('lock',!can);
    const c=el.querySelector('.c');
    if(c.dataset.p!==String(price)){c.dataset.p=String(price);
      c.innerHTML=priceCell(TOWERS[t.type].ups[li][idx].cost,price)}}}
 $('spClose').onclick=()=>selectTower(null);
 $('spLanes').addEventListener('pointerdown',function(e){
  if(e.button!==0)return;
  const el=e.target.closest('.up.next');
  if(el&&G.sel){e.preventDefault();buyUp(G.sel,+el.dataset.l)}});
// The targeting selects are rebuilt every time the panel opens, so the listener
// has to sit on the section and outlive them.
 $('spTargeting').addEventListener('change',function(e){
  const sel=e.target.closest('select[data-tgt]');
  if(!sel||!G.sel)return;
  const gi=+sel.dataset.tgt;
  if(gi<0)G.sel.tgtMode=sel.value;
  else G.sel.gunMode[gi]=sel.value||null});

// ---- upgrade hover tooltip ----
const uptip=document.createElement('div');
uptip.className='uptip';
// inside #uiRoot, not body: the tip has to shrink with the interface it labels,
// and being fixed it is still free to sit anywhere on screen from there
$('uiRoot').appendChild(uptip);
let tipRow=null,tipW=0,tipH=0;
// Placed from a pointer event, so every coordinate is converted out of screen px
// first — zoom multiplies the tip's own left/top just like any other length, and
// without the division it lands further from the cursor the smaller the window is.
function tipPlace(e){
  const cx=uiLocal(e.clientX),cy=uiLocal(e.clientY);
  let x=cx+16,y=cy-tipH-12;
  if(x+tipW>uiLocal(innerWidth)-8)x=cx-tipW-16;
  if(y<8)y=cy+18;
  uptip.style.left=x+'px';uptip.style.top=y+'px'}
function tipUpdate(e){
  let el=null;
  if(e.target&&e.target.closest)el=e.target.closest('.up[data-fx]');
  if(el){
    const fx=el.getAttribute('data-fx');
    if(fx){
      // the tip is nowrap, so its box only changes with its text: measuring here
      // (once per row) keeps a pointermove to two writes instead of a
      // read-after-write reflow at 100Hz+
      if(el!==tipRow){tipRow=el;uptip.textContent=fx;uptip.style.display='block';
        // offsetWidth is in the layer's own pixels, which is what tipPlace sums;
        // getBoundingClientRect would already be multiplied by the zoom
        tipW=uptip.offsetWidth;tipH=uptip.offsetHeight}
      tipPlace(e);
      return}}
  if(tipRow){tipRow=null;uptip.style.display='none'}}
 $('sidepanel').addEventListener('pointerover',tipUpdate);
 $('sidepanel').addEventListener('pointermove',tipUpdate);
 $('sidepanel').addEventListener('pointerleave',function(){tipRow=null;uptip.style.display='none'});
 $('sidepanel').addEventListener('pointerdown',function(){tipRow=null;uptip.style.display='none'});

// ---- tower bar (loadout strip at the bottom) ----
// ---- the loadout a match actually plays with ----
// The six saved slots, then anything `give_tower` handed out this match. Given
// towers deliberately stay off SV: every SV change is uploaded, and sanitize
// re-slices the loadout to six on every cloud pull, so they would vanish — or
// worse, persist to the next match.
function loadoutLen(){
  return SV.loadout.length+((window.ADMIN&&ADMIN.extras)?ADMIN.extras.length:0)}
function loadoutSlot(i){
  if(i<SV.loadout.length)return SV.loadout[i];
  return (window.ADMIN&&ADMIN.extras)?ADMIN.extras[i-SV.loadout.length]:null}
function buildTowerbar(){const bar=$('towerbar');bar.innerHTML='';
  const toDraw=[];
  const n=Math.max(6,loadoutLen());      // the six-slot frame never shrinks
  for(let i=0;i<n;i++){
    const id=loadoutSlot(i);
    const slot=document.createElement('div');
    if(id&&TOWERS[id]){
      const td=TOWERS[id];
      slot.className='twr-slot';slot.dataset.type=id;
      slot.innerHTML='<span class="hk">'+(i+1)+'</span><canvas width="40" height="40"></canvas>'+
        '<div class="nm">'+td.name+'</div><div class="cost">$'+td.cost+'</div>'+
        (td.limit?'<div class="lim"></div>':'');
      slot.onclick=function(){Sfx.init();Sfx.click();armPlacement(id)};
      toDraw.push({cv:slot.querySelector('canvas'),id:id})}
    else{
      slot.className='twr-slot empty';
      slot.innerHTML='<span class="hk">'+(i+1)+'</span><div class="ph">EMPTY</div>'+
        '<div class="nm" style="color:var(--dim)">Empty</div><div class="cost">&mdash;</div>';
      slot.onclick=function(){Sfx.click();toast('Equip towers in the TOWERS menu','bad')}}
    bar.appendChild(slot)}
  for(const s of toDraw){try{drawTowerThumb(s.cv,s.id)}catch(e){}}}
function limitToast(id){const d=TOWERS[id];
  toast(d.name+' placement limit reached ('+d.limit+' max)','bad')}
// Arming a tower is the same whether it came from a hotbar click or a number key.
function armPlacement(id){selectTower(null);
  if(atLimit(id)){limitToast(id);return}
  G.placeType=G.placeType===id?null:id;updTowerbar()}
function selectLoadoutSlot(i){const id=loadoutSlot(i);
  if(!id){toast('Empty slot — equip towers in the TOWERS menu','bad');return}
  armPlacement(id)}
function updTowerbar(){const btns=document.querySelectorAll('.twr-slot');
  for(const s of btns){if(!s.dataset.type)continue;
    const td=TOWERS[s.dataset.type];
    s.classList.toggle('sel',s.dataset.type===G.placeType);
    s.classList.toggle('poor',G.cash<td.cost||atLimit(s.dataset.type));
    const lim=s.querySelector('.lim');
    if(lim)lim.textContent=towerCountOf(s.dataset.type)+'/'+td.limit}}
function drawTowerThumb(cv,type){const g=cv.getContext('2d');g.imageSmoothingEnabled=false;
  if(typeof artTowerThumb==='function'&&artTowerThumb(cv,type))return;   // ART V2
  const lanes=TOWERS[type].lanes;
  const mock={ups:new Array(lanes).fill(0),flashT:0,aim:-Math.PI/4,
    S:towerStats({type:type,ups:new Array(lanes).fill(0),x:0,y:0})};
  g.clearRect(0,0,cv.width,cv.height);g.save();g.translate(cv.width/2,cv.height-6);
  drawTowerBody(g,type,0,0,mock,0);
  g.restore()}

// ---- HUD ----
let lastHud='',lastCash=null;
function updateHUD(){
  if(G.mp&&G.mp.inMatch){MP.hud();return}   // PVP HUD (wave/50, income, MP gold)
  checkStatBadges();
  const w=WaveMgr,maxW=G.mode.waves;
  const maxTxt=(maxW===Infinity)?'\u221E':maxW;
  let waveTxt,waveSub;
  if(w.active){waveTxt='WAVE '+w.n+'/'+maxTxt;waveSub=w.remaining()+' enemies'}
  else{const nxt=(maxW===Infinity)?(w.n+1):Math.min(w.n+1,maxW);
    waveTxt='WAVE '+nxt+'/'+maxTxt;
    waveSub='starts in '+Math.ceil(Math.max(0,w.cd))+'s'}
  const key=[G.cash,G.lives,waveTxt,waveSub].join('|');
  if(key!==lastHud){lastHud=key;
    // The purse is the number the eye is already on, so it answers back: it
    // swells on a gain and dips on a spend. Re-triggering is rate-limited by the
    // animation itself — during a kill streak cash changes every frame and a
    // flash per change would be noise, not feedback.
    const cashEl=$('stCash'),d=lastCash===null?0:Math.sign(G.cash-lastCash),t=performance.now();
    if(d&&t-(cashEl._ft||0)>520){cashEl._ft=t;cashEl.classList.remove('up','down');
      void cashEl.offsetWidth;cashEl.classList.add(d>0?'up':'down')}
    lastCash=G.cash;
    cashEl.innerHTML='<span class="coin"></span>'+fmt(G.cash);
    $('stLives').innerHTML='&#9829; '+G.lives;
    $('stWave').textContent=waveTxt;$('waveSub').textContent=waveSub}
  $('skipWave').style.display=(G.state==='playing'&&w.canSkip())?'inline-flex':'none';
  let boss=null;for(const e of enemies)if(e.boss&&!e.dead){boss=e;break}
  $('bossbar').style.display=boss?'flex':'none';
  if(boss){$('bossName').textContent=boss.cfg.name.toUpperCase();
    $('bossFill').style.width=clamp(boss.hp/boss.maxHp*100,0,100)+'%';
    $('bossTxt').textContent=fmt(Math.ceil(boss.hp))+'/'+fmt(boss.maxHp);
    const sh=boss.shield>0;
    $('bossShieldTrack').style.display=sh?'block':'none';
    if(sh){$('bossShieldFill').style.width=clamp(boss.shield/(boss.shieldMax||1)*100,0,100)+'%';
      $('bossShieldTxt').textContent=fmt(Math.ceil(boss.shield))+' SHIELD  -'+Math.round((boss.shieldRes||0)*100)+'% ALL'}}}

const spdBtns=document.querySelectorAll('#speedBtns .btn');
for(const b of spdBtns)b.onclick=function(){Sfx.click();
  // in PVP one player cannot just flip the switch — it opens a vote instead
  if(G.mp&&G.mp.inMatch){MP.requestSpeed(+this.dataset.spd);return}
  // A preset always wins over `game_speed`: that is the only way back out of a
  // custom multiplier once a developer has set one.
  if(window.ADMIN)ADMIN.customSpeed=null;
  G.speed=+this.dataset.spd;
  for(const o of spdBtns)o.classList.toggle('on',o===this)};
 $('pauseBtn').onclick=()=>togglePause();
 $('skipWave').onclick=function(){Sfx.click();WaveMgr.skip()};

// ---- boss icon ----
function drawBossIcon(cfg){const cv=$('bossIcon'),g=cv.getContext('2d');
  if(typeof artBossIcon==='function'&&artBossIcon(cfg,cv))return;   // ART V2
  g.imageSmoothingEnabled=false;g.fillStyle='#0a0e13';g.fillRect(0,0,40,40);
  const fake={cfg:cfg,anim:2,dirx:1,flash:0};
  g.save();g.translate(20,37);const a=enemyArt(cfg),sc=Math.min(32/(a.width+24),32/(a.height+15));g.scale(sc,sc);drawEnemyBody(g,fake,1);g.restore()}

// ---- minimap ----
const mmc=$('minimap'),mmg=mmc.getContext('2d');
// One mapping shared by the bake and the click handler: tiles scaled into the
// canvas, nudged so the spawn end lands inside the frame.
const MM_SX=mmc.width/GW,MM_SY=mmc.height/GH,MM_OX=1.5;
const mmBase=document.createElement('canvas');
mmBase.width=mmc.width;mmBase.height=mmc.height;
let mmFor=null,mmRectFor=null;
// Everything that only changes when the world is rebuilt.
function bakeMinimap(){const g=mmBase.getContext('2d');
  g.fillStyle='#1c2416';g.fillRect(0,0,mmc.width,mmc.height);
  g.fillStyle='#2e5a5e';
  for(let y=0;y<GH;y++)for(let x=0;x<GW;x++)if(grid[y][x]===2)
    g.fillRect((x+MM_OX)*MM_SX,y*MM_SY,MM_SX+.5,MM_SY+.5);
  g.strokeStyle='#c9a86a';g.lineWidth=2;g.beginPath();
  PATH.pts.forEach(function(p,i){const X=clamp((p.x+MM_OX)*MM_SX,0,mmc.width),
    Y=clamp(p.y*MM_SY,0,mmc.height);
    if(i)g.lineTo(X,Y);else g.moveTo(X,Y)});
  g.stroke();
  g.fillStyle='#8e7a5e';
  g.fillRect((BASE_RECT.x+MM_OX)*MM_SX,BASE_RECT.y*MM_SY,BASE_RECT.w*MM_SX,BASE_RECT.h*MM_SY);
  g.fillStyle='#f5a623';g.fillRect((BASE_PT.x+MM_OX)*MM_SX-3,BASE_PT.y*MM_SY-3,6,6);
  g.fillStyle='#c05a40';g.fillRect((SPAWN_PT.x+MM_OX)*MM_SX-2,SPAWN_PT.y*MM_SY-4,4,8)}
function drawMinimap(){
  // applyWorldToGlobals mutates grid in place but reassigns PATH/BASE_RECT to
  // fresh objects, so identity is the cheap signal that the static layer is stale
  if(mmFor!==PATH||mmRectFor!==BASE_RECT){mmFor=PATH;mmRectFor=BASE_RECT;bakeMinimap()}
  mmg.drawImage(mmBase,0,0);
  for(const t of towers){mmg.fillStyle='#e8a33d';
    mmg.fillRect((t.x+MM_OX)*MM_SX-1.5,t.y*MM_SY-1.5,3,3)}
  for(const e of enemies){if(e.dead||e.stealth)continue;
    mmg.fillStyle=e.boss?'#ff5040':'#e06050';
    const sz=e.boss?4:2;mmg.fillRect((e.px+MM_OX)*MM_SX-sz/2,e.py*MM_SY-sz/2,sz,sz)}
  const cw=canvas.width/dpr,ch=canvas.height/dpr;
  const tl=mapToTile(cam.x-cw/2/cam.zoom,cam.y-ch/2/cam.zoom);
  const br=mapToTile(cam.x+cw/2/cam.zoom,cam.y+ch/2/cam.zoom);
  mmg.strokeStyle='rgba(255,255,255,.7)';mmg.lineWidth=1;
  mmg.strokeRect((tl.x+MM_OX)*MM_SX,tl.y*MM_SY,(br.x-tl.x)*MM_SX,(br.y-tl.y)*MM_SY)}
mmc.onpointerdown=function(e){const r=mmc.getBoundingClientRect();
  const gx=(e.clientX-r.left)/r.width*GW-MM_OX,gy=(e.clientY-r.top)/r.height*GH;
  const m=worldToMap(gx,gy);cam.tx=m.x;cam.ty=m.y;camClamp()};

// ============================================================
//  THE RESULT CARD — victory, defeat, and the ending
//
//  One card shape serves all three (and the multiplayer one), because a win
//  should feel identical wherever it happens. What changes is the emblem, the
//  verdict line, and whether the card measures the base or the wave count.
// ============================================================

// 24x24 pixel emblems in the badge's own format: a flame on a medal, a shield
// snapped down the middle, and the eclipse that ends the last wave.
const END_ART={
  win:{p:['#5a3a12','#2a1b08','#100c08','#7d5a24','#c8a24a','#f0d68a','#c8501e','#e8a33d','#fff6d0'],
   r:[
    '........................',
    '........................',
    '........44444444........',
    '......444444444444......',
    '.....45553333334444.....',
    '....4443355662233444....',
    '...444322226622223444...',
    '...443222266662222344...',
    '..44432227777772223444..',
    '..44322227777772222344..',
    '..44322277777777222344..',
    '..44322277777777222344..',
    '..44322288888888222344..',
    '..44322288888888222344..',
    '..44322288888888222344..',
    '..44432288888888223444..',
    '...443222888888222344...',
    '...444322222222223444...',
    '....4443322222233444....',
    '.....44443333334444.....',
    '......444444444444......',
    '........44444444........',
    '........................',
    '........................']},
  lose:{p:['#241a12','#100b07','#070504','#3a2b1d','#54402a','#8a6c44','#c0402a'],
   r:[
    '........................',
    '....5555555516555555....',
    '....5444444416444445....',
    '....5444444416444445....',
    '....5333333163333335....',
    '....5444444164444445....',
    '....5444444164444445....',
    '....5444444416444445....',
    '....5333333316333335....',
    '....5444444416444445....',
    '....5444444164444445....',
    '....5444444164444445....',
    '....5333333163333335....',
    '....5444444416444445....',
    '......544444164445......',
    '.......5444416445.......',
    '.........531635.........',
    '..........5165..........',
    '...........16...........',
    '............16..........',
    '........................',
    '....3..............3....',
    '........................',
    '........................']},
  ultimate:{p:['#1b1224','#0c0713','#050308','#4a2f6e','#7d4fb0','#b78cff','#d9c8ff','#8a7cff','#fff0c0'],
   r:[
    '...........77...........',
    '........66677666........',
    '......66.557755.66......',
    '....66.5555775555.66....',
    '...665555337733555568...',
    '...855533322223335556...',
    '..6.5533222222223355.6..',
    '..65533222222222233556..',
    '.6.553222222222222355.6.',
    '.6553322222222222233556.',
    '.6553222222222222223556.',
    '787772222222222222277777',
    '777772222222222222277787',
    '.6553222222222222223556.',
    '.6553322222222222233556.',
    '.6.553222222222222355.6.',
    '..65533222222222233556..',
    '..6.5533222222223355.6..',
    '...655533322223335586...',
    '...685555337733555566...',
    '....66.5555775555.66....',
    '......66.557755.66......',
    '........66677666........',
    '...........77...........']}
};
function drawEndCrest(cv,kind){
  const a=END_ART[kind]||END_ART.win,g=cv.getContext('2d'),sc=cv.width/24;
  g.imageSmoothingEnabled=false;g.clearRect(0,0,cv.width,cv.height);
  for(let y=0;y<a.r.length;y++){const row=a.r[y];
    for(let x=0;x<row.length;x++){const ch=row[x];if(ch==='.')continue;
      g.fillStyle=a.p[parseInt(ch,36)];g.fillRect(x*sc,y*sc,sc,sc)}}}

function reduceMotion(){
  return !!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches)}

// A stat line, and its counting-up twin: `data-to` is what makes a reward land
// instead of simply arriving.
function resRow(label,val){
  return '<div><span>'+label+'</span><b>'+val+'</b></div>'}
function resNum(label,to,pre,post,delay){
  return '<div><span>'+label+'</span><b data-to="'+to+'"'+(pre?' data-pre="'+pre+'"':'')+
    (post?' data-post="'+post+'"':'')+(delay?' data-delay="'+delay+'"':'')+'>0</b></div>'}
function countUp(box){
  const still=reduceMotion();
  box.querySelectorAll('[data-to]').forEach(el=>{
    const to=Math.max(0,Math.floor(+el.dataset.to||0)),
      pre=el.dataset.pre||'',post=el.dataset.post||'';
    if(still){el.textContent=pre+fmt(to)+post;return}
    el.textContent=pre+'0'+post;
    setTimeout(function(){
      const dur=460+Math.min(700,Math.log10(to+1)*160),t0=performance.now();
      requestAnimationFrame(function roll(now){
        const p=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-p,3);
        el.textContent=pre+fmt(Math.round(to*e))+post;
        if(p<1)requestAnimationFrame(roll)})},+(el.dataset.delay||0))})}

// Three pips, and all three of them are about the one thing that settled the
// match: how much of the base was left standing.
function endPips(frac){
  const n=frac>=.999?3:(frac>=.6?2:1),
    word=n===3?'Flawless':(n===2?'Held':'Battered');
  let h='';
  for(let i=0;i<3;i++)h+='<i class="pip'+(i<n?' on':'')+'"></i>';
  return{html:h,n:n,word:word}}

function endMeter(label,frac,note){
  const p=Math.max(0,Math.min(100,Math.round(frac*100)));
  return '<div class="endMeterTop"><span>'+label+'</span><b>'+p+'%</b></div>'+
    '<div class="endTrack"><i style="--w:'+p+'%"></i></div>'+
    (note?'<div class="endMeterNote">'+note+'</div>':'')}

// What the card says underneath the title. A win is measured on the base, a
// loss gets the one thing a loss should hand over: where to go next.
function winVerdict(lives,max){
  if(lives>=max)return 'Flawless line — the Ember Flame was never touched.';
  if(lives/max>=.6)return 'The line bent under them. It never broke.';
  return 'Held by less than you would like — but held.'}
function loseVerdict(d){
  // The first rule that actually fits the match, so the advice is about the
  // run the player just lost rather than a fortune cookie.
  if(d.wave<=2)
    return 'It fell in the opening waves. Spend the first of them building, not defending.';
  if(d.stealth&&!d.sawStealth)
    return 'This mode fields stealthed enemies, and nothing on the board could see them.';
  if(!d.hadVillage)
    return 'No Village stood. Towers beside one fire faster and reach further.';
  if(!d.hadFarm&&d.wave>4)
    return 'A Farm in the first waves pays for everything after it.';
  if(d.near)
    return 'That close. The waves you survived are the ones that count.';
  return 'The Flame keeps what you salvaged. Spend it on the gap that ended you.'}

// prefix keeps the campaign card and the multiplayer card on their own ids
// without their markup drifting apart.
function renderResult(prefix,spec){
  const cv=$(prefix+'Crest');if(cv)drawEndCrest(cv,spec.crest||spec.kind);
  const k=$(prefix+'Kicker');if(k)k.textContent=spec.kicker||'';
  const t=$(prefix+'Title');
  if(t){
    const calm=reduceMotion(),split=spec.letters&&!calm&&spec.title;
    if(split){
      // The ending's own title arrives one letter at a time out of the black.
      let h='';
      for(let i=0;i<spec.title.length;i++)
        h+='<span style="animation-delay:'+(.12+i*.08).toFixed(3)+'s">'+
          (spec.title[i]===' '?'&nbsp;':spec.title[i])+'</span>';
      t.innerHTML=h}
    else t.textContent=spec.title||'';
    t.classList.toggle('letters',!!split)}
  const sub=$(prefix+'Sub');if(sub)sub.textContent=spec.sub||'';
  const v=$(prefix+'Verdict');
  if(v){
    v.textContent=spec.verdict||'';
    v.className='endVerdict'+(spec.verdict?' show'+(spec.tone?' '+spec.tone:''):'')}
  const p=$(prefix+'Pips');
  if(p){
    const has=spec.pips!=null;p.classList.toggle('show',has);
    if(has){const g=endPips(spec.pips);
      p.innerHTML=g.html;p.title=g.word;
      p.setAttribute('aria-label',g.n+' of 3 honours: '+g.word)}}
  const m=$(prefix+'Meter');
  if(m){
    const has=!!spec.meter;m.classList.toggle('show',has);
    if(has)m.innerHTML=endMeter(spec.meter.label,spec.meter.frac,spec.meter.note)}
  const s=$(prefix+'Stats');
  if(s){s.innerHTML=(spec.stats||[]).join('');countUp(s)}}
