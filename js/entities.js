"use strict";
// ============================================================
//  entities.js — enemies, towers, damage, projectiles
// ============================================================
let enemies=[],towers=[],projs=[],firePatches=[];
let uid=1;
const G={state:'menu',mode:MODES.easy,cash:0,lives:0,maxLives:0,speed:1,sel:null,placeType:null,
  kills:0,leakFlash:0,shake:0,time:0,bossBanner:null,endT:0,endBlack:false,secret:'pending',
  // Match-wide tower boosts from the `tower_boost` command: kind -> {mul,t}.
  // A t of null means "until the match ends". These live on G rather than the
  // save so they can never leak into the next match.
  boosts:{}};
// What a boost kind is currently worth as a multiplier. Read by towerStats and
// towerMaxHP, so every tower on the board shares one source of truth.
function boostMul(kind){const b=G.boosts[kind];return b?b.mul:1}
// Boosts are baked into each tower's cached stats, so applying or expiring one
// has to rebuild the whole board. Health changes keep a tower's missing HP
// proportional instead of silently topping it back up.
function revalidateTowers(){
  for(const t of towers){
    const old=t.maxHp;
    t.S=towerStats(t);t.maxHp=towerMaxHP(t);
    const d=t.maxHp-old;
    if(d>0)t.hp+=d;else if(t.hp>t.maxHp)t.hp=t.maxHp}}

// ---------- enemies ----------
function setEnemyPos(e){const s=samplePath(PATH,e.d);
  e.px=s.x-s.dy*e.off;e.py=s.y+s.dx*e.off;e.dirx=s.dx;e.diry=s.dy;
  e.sx=mapPx(e.px,e.py);e.sy=mapPy(e.px,e.py)}
function posAt(e,d){const s=samplePath(PATH,clamp(d,0,PATH.total));
  return{x:s.x-s.dy*e.off,y:s.y+s.dx*e.off}}
function spawnEnemy(type,d,off,hpMul){const c=ENEMIES[type];if(!c)return null;
  const e={id:uid++,cfg:c,dead:false,d:Math.max(0,d||0),
    off:off!==undefined?off:(((uid*0.61803399)%1)-.5)*.5,
    hp:Math.ceil(c.hp*(hpMul||G.mode.hpMul)),spd:c.spd*G.mode.spdMul,
    shield:c.shield||0,shieldMax:c.shield||0,shieldRes:c.shieldRes||0,onFire:0,fireDps:0,
    stealth:!!c.stealth,cloakT:c.cloak?c.cloak.off:0,
    boss:false,flash:0,anim:rnd(10),px:0,py:0,sx:0,sy:0,dirx:1,diry:0,
    slowT:0,slowMul:1,slowBossMul:1,slowCorrupt:false,
    corruptT:0,corruptDps:0,corruptTick:0,poisons:[]};
  e.maxHp=e.hp;
  // splitters carry their ACTUAL (already scaled) health as the amount they
  // will divide into. Seeding this from the raw config value instead made a
  // 500 HP splitter pop into 25 HP children — the mode's health scaling was
  // thrown away in a single step, which is why they felt broken.
  e.splitHp=e.hp;
  e.scale=1;
  setEnemyPos(e);enemies.push(e);return e}
function spawnBig(key,hpMul){const def=BIGS[key];if(!def)return null;
  const m=(hpMul!=null)?hpMul:G.mode.hpMul;
  const sh=def.shield?Math.ceil(def.shield*m):0;
  const e={id:uid++,cfg:def,dead:false,d:0,off:0,
    hp:Math.ceil(def.hp*m),spd:def.spd*G.mode.spdMul,
    shield:sh,shieldMax:sh,shieldRes:def.shieldRes||0,onFire:0,fireDps:0,
    stealth:!!def.stealth,boss:true,flash:0,anim:rnd(10),px:0,py:0,sx:0,sy:0,dirx:1,diry:0,
    slowT:0,slowMul:1,slowBossMul:1,slowCorrupt:false,
    corruptT:0,corruptDps:0,corruptTick:0,poisons:[]};
  e.maxHp=e.hp;setEnemyPos(e);enemies.push(e);
  Sfx.boss();if(SV.shake)G.shake=Math.max(G.shake,key==='oking'?10:7);
  if(key==='oking')G.bossBanner={title:'THE OBSIDIAN KING',sub:'HAS ARRIVED!',t:3};
  if(key==='endbringer'){G.bossBanner={title:'THE ENDBRINGER',sub:'ARRIVES',t:4};
    if(SV.shake)G.shake=12}
  if(def.banner){G.bossBanner={title:def.banner[0],sub:def.banner[1],t:3.5};
    if(SV.shake)G.shake=Math.max(G.shake,9)}
  // nightmare encounter badges
  if(key==='endbringer_guardian')grantBadge('guardian');
  if(key==='error_void_leak')grantBadge('void');
  drawBossIcon(def);
  toast(def.name+' has arrived!','bad');
  return e}

// ---------- damage ----------
function dealDamage(e,amt,dtype,ign){
  if(e.dead||e.digging||amt<=0)return 0;
  dtype=dtype||'bullet';
  if(e.shield>0){
    // Same question as "does this ignore list hold anything at all", asked
    // without building an array of keys on every hit.
    let hasIgn=false;
    if(ign&&!e.cfg.noIgnore){for(const k in ign){hasIgn=true;break}}
    const r=hasIgn?0:(e.shieldRes||0);
    const eff=amt*(1-r);
    if(e.shield>eff){
      e.shield-=eff;e.flash=.12;
      ftext(e.sx+rnd(-6,6),e.sy-e.cfg.r-14,Math.round(eff),'#7ec8ff');
      burst(e.sx,e.sy-10,'#7ec8ff',2,26,.25,2);
      return eff}
    const leftover=amt-e.shield/(1-r);
    e.shield=0;
    if(e.boss)toast(e.cfg.name+"'s shield is down!");
    if(leftover>0)hitHp(e,leftover,dtype,ign);
    return amt}
  hitHp(e,amt,dtype,ign);
  return amt}
function hitHp(e,amt,dtype,ign){
  let a=amt;
  // ign.all (the Void Traitor's Egoist path) beats every resistance at once, and
  // unlike the per-type flags it is not voided by cfg.noIgnore.
  const ignores=ign&&(ign.all||(ign[dtype]&&!e.cfg.noIgnore));
  if(e.cfg.res&&e.cfg.res[dtype]!==undefined&&!ignores)a*=(1-e.cfg.res[dtype]);
  e.hp-=a;e.flash=.12;
  // A percent-health effect on a 50 HP walker rounds to nothing, and a stream of
  // floating zeros is noise rather than feedback.
  if(a>=.5)ftext(e.sx+rnd(-6,6),e.sy-e.cfg.r-14,Math.round(a),DMG_COLORS[dtype]||'#e8dcc0');
  if(e.hp<=0)killEnemy(e)}
// ---- Poisoned ----
// A share of the enemy's OWN health per second, straight onto the health bar and
// past the shield. Percentage rather than flat damage is what keeps it relevant
// on a wave-90 brute without letting it execute a walker. One dose per source
// tower at a time: a second bite from the same viper only refreshes the clock,
// while two different vipers each carry their own. Selling the tower does not
// stop a dose already in the blood.
function applyPoison(e,srcId,pct,dur){
  for(const p of e.poisons){
    if(p.src===srcId){p.pct=pct;p.t=dur;return false}}
  e.poisons.push({src:srcId,pct:pct,t:dur,tick:0});return true}
// Hold an enemy back. One slow runs at a time and the nastier of the two wins,
// so a Toxic drip that lands on a Corrupted walker cannot speed it back up.
// `bossMul` travels with it because the sources disagree about bosses: Corrupt
// still halves them, Toxic does not touch them at all.
function applySlow(e,mul,bossMul,dur,corrupt){
  if((e.boss?bossMul:mul)>=1)return false;   // this slow does not touch that enemy
  if(e.slowT>0&&e.slowMul<=mul)return false;
  e.slowT=dur;e.slowMul=mul;e.slowBossMul=bossMul;e.slowCorrupt=!!corrupt;
  return true}
function killEnemy(e){if(e.dead)return;e.dead=true;
  const rw=Math.round(e.cfg.rw*G.mode.moneyMul*(e.boss?BOSS_CASH_MUL:1));
  G.kills++;
  // The invader's gold is derived from the server, so a kill on their side of
  // the match is a visual event only. Paying out here would inflate a cash
  // counter they never read and flash "+$" they never receive.
  if(!(G.mp&&G.mp.inMatch&&G.mp.role==='invader')){
    G.cash+=rw;ftext(e.sx,e.sy-e.cfg.r-20,'+$'+rw,'#8ce89a')}
  if(typeof artDeathFx==='function')artDeathFx(e);else if(typeof fxSprite==='function')fxSprite('deathpuff',e.sx,e.sy);   // ART V2
  burst(e.sx,e.sy-8,e.cfg.pal[0],e.boss?26:8,e.boss?70:44,.6,e.boss?5:3);
  if(e.boss){Sfx.boom();if(SV.shake)G.shake=8}else Sfx.die();
  if(e.cfg.kind==='molten'){
    spawnEnemy('obsidian',e.d,clamp(e.off,-.26,.26));
    const m=worldToMap(e.px,e.py);burst(m.x,m.y-8,'#4a4258',8,40,.5,3)}
  if(e.cfg.kind==='mmolten'){
    spawnEnemy('mobsidian',e.d,clamp(e.off,-.26,.26));
    const m=worldToMap(e.px,e.py);burst(m.x,m.y-8,'#4a4258',12,50,.55,4)}
  // splitters break into two smaller copies — until nothing is left but 1 HP husks
  if(e.cfg.kind==='splitter'&&e.splitHp>1){
    for(let i=0;i<2;i++){
      const nh=Math.ceil(e.splitHp/2);
      const c=spawnEnemy('splitter',e.d,clamp(e.off+(i?-.18:.18),-.26,.26));
      if(c){
        c.splitHp=nh;c.hp=c.maxHp=nh;
        // halves also SHRINK — one splitter visibly becoming two smaller ones
        // instead of two full-size copies blinking into existence
        c.scale=clamp((e.scale||1)*.72,.42,1);
        const m=worldToMap(c.px,c.py);burst(m.x,m.y-8,'#e07080',6,30,.4,2)}}}
}
function leak(e){
  if(G.mp&&G.mp.inMatch&&G.mp.role!=='defender')return;   // the invader has no base to lose
  const dmg=Math.ceil(e.hp);
  G.lives-=dmg;G.leakFlash=.5;if(SV.shake)G.shake=Math.max(G.shake,4);Sfx.leak();
  const m=worldToMap(BASE_PT.x,BASE_PT.y);
  burst(m.x,m.y-20,'#ef8b7a',12,60,.6,4);
  ftext(m.x,m.y-44,'-'+dmg,'#ef8b7a');
  if(G.lives<=0){G.lives=0;defeat()}}

// ---------- enemy update (incl. boss behaviours) ----------
function updEnemy(e,dt){
  if(e.flash>0)e.flash-=dt;
  if(e.slowT>0)e.slowT-=dt;
  // Corruption is a real damage-over-time on the enemy itself — the fire patch
  // burns the ground, not the walker. Half-second ticks, the same cadence the
  // patches use, so both kinds of burn land on one beat.
  if(e.corruptT>0){
    e.corruptT-=dt;e.corruptTick+=dt;
    while(e.corruptTick>=.5){e.corruptTick-=.5;dealDamage(e,e.corruptDps*.5,'void')}
    if(e.dead)return;
    if(SV.particles&&Math.random()<dt*6)
      addPart({type:'dot',x:e.sx+rnd(-5,5),y:e.sy-rnd(4,14),vx:rnd(-3,3),vy:rnd(-20,-8),
        t:0,life:rnd(.25,.5),color:pick(['#a06ae0','#6a3a9a']),size:rnd(1.5,2.5)})}
  if(e.onFire>0){e.onFire-=dt;
    if(SV.particles&&Math.random()<dt*5)
      addPart({type:'dot',x:e.sx+rnd(-5,5),y:e.sy-rnd(4,14),vx:rnd(-4,4),vy:rnd(-22,-10),
        t:0,life:rnd(.25,.5),color:pick(['#f08b3a','#f5c56a']),size:rnd(1.5,2.5)})}
  // Poison runs on whole seconds, one beat per dose, and each dose carries the
  // percentage its own tower had when it landed.
  if(e.poisons.length){
    for(let i=e.poisons.length-1;i>=0;i--){const p=e.poisons[i];
      p.t-=dt;p.tick+=dt;
      while(p.tick>=1){p.tick-=1;hitHp(e,e.maxHp*p.pct,'poison')}
      if(p.t<=0||e.dead)e.poisons.splice(i,1)}
    if(e.dead)return;
    if(SV.particles&&Math.random()<dt*6)
      addPart({type:'dot',x:e.sx+rnd(-5,5),y:e.sy-rnd(4,14),vx:rnd(-3,3),vy:rnd(-18,-6),
        t:0,life:rnd(.3,.6),color:pick(['#7fd84a','#4a8a2c']),size:rnd(1.5,2.5)})}
  // tunnellers
  if(e.cfg.kind==='tunneller'||e.cfg.kind==='stealth_tunneller'){
    const cycle=(e.cfg.kind==='stealth_tunneller')?10:5;
    if(e.digging){
      e.digT-=dt;
      if(SV.particles&&Math.random()<dt*20)
        addPart({type:'dot',x:e.sx+rnd(-8,8),y:e.sy+rnd(-4,4),vx:rnd(-10,10),vy:rnd(-30,-10),
          t:0,life:.4,color:pick(['#7a5c38','#5c4428']),size:rnd(2,4)});
      if(e.digT<=0){e.digging=false;
        const m=worldToMap(e.px,e.py);
        burst(m.x,m.y-6,'#7a5c38',10,50,.5,3)}
      return}
    e.digCd=(e.digCd===undefined?cycle:e.digCd)-dt;
    if(e.digCd<=0){
      e.digCd=cycle;e.digging=true;e.digT=1.4;
      e.d=Math.min(e.d+5,PATH.total-1);
      setEnemyPos(e);
      const m=worldToMap(e.px,e.py);
      burst(m.x,m.y-6,'#7a5c38',8,50,.5,3);
      return}}
  // Silent Executioner sword swing
  if(e.cfg.sword){
    e.atkCd=(e.atkCd===undefined?6:e.atkCd)-dt;
    if(e.atkCd<=0){
      let hit=null;
      for(const t of towers)if(dist2(t.x,t.y,e.px,e.py)<.81){hit=t;break}
      if(hit){e.atkCd=10;
        damageTower(hit,2250);
        const m=worldToMap(hit.x,hit.y);
        ringFX(m.x,m.y-16,26,'#ff7060');Sfx.boom();
        if(SV.shake)G.shake=Math.max(G.shake,4)}
      else e.atkCd=.5}}
  // Fallen Obsidian King mass stun
  if(e.cfg.stuns){
    e.stunCd=(e.stunCd===undefined?rnd(10,20):e.stunCd)-dt;
    if(e.stunCd<=0){e.stunCd=rnd(10,20);
      let n=0;for(const t of towers){if(t.remote)continue;t.stunT=3;n++}
      if(n){toast('Fallen Obsidian King stuns your towers!','bad');
        Sfx.tone(150,.5,'sawtooth',.3,-60);
        if(SV.shake)G.shake=Math.max(G.shake,5)}}}
  // ---- nightmare: cloaker stealth cycle ----
  if(e.cfg.cloak){
    e.cloakT-=dt;
    if(e.cloakT<=0){e.stealth=!e.stealth;
      e.cloakT=e.stealth?e.cfg.cloak.on:e.cfg.cloak.off;
      const m=worldToMap(e.px,e.py);
      burst(m.x,m.y-8,e.stealth?'#5a3a6a':'#c05878',6,30,.4,2)}}
  // ---- nightmare: summoners (necromancer, necro-monarch, the misplaced) ----
  if(e.cfg.summon){
    e.sumT=(e.sumT===undefined?rnd(1,e.cfg.summon.every*.6):e.sumT)-dt;
    if(e.sumT<=0){e.sumT=e.cfg.summon.every;
      let pool=e.cfg.summon.pool;
      if(pool==='nm_random')pool=NM_RANDOM;
      else if(pool==='nm_blood')pool=NM_BLOOD;
      for(let i=0;i<e.cfg.summon.count;i++){
        const c=spawnEnemy(pick(pool),Math.min(e.d+(e.cfg.kind==='necromancer'?1.2:0),
          PATH.total-1),clamp(e.off+rnd(-.3,.3),-.26,.26));
        if(c){const m=worldToMap(c.px,c.py);
          burst(m.x,m.y-8,e.cfg.pal[2],8,36,.5,3)}}}}
  // ---- nightmare: healers (healer → necromancer, royal guard → necro-monarch) ----
  if(e.cfg.heals){const H=e.cfg.heals;
    e.healT=(e.healT||0)+dt;
    if(e.healT>=.25){e.healT=0;
      let tgt=null,bd=H.range*H.range;
      for(const o of enemies){if(o.dead||o===e)continue;
        if(H.of.indexOf(o.cfg.kind)<0)continue;
        const d2=dist2(e.px,e.py,o.px,o.py);
        if(d2<bd){bd=d2;tgt=o}}
      if(tgt&&tgt.hp<tgt.maxHp){
        tgt.hp=Math.min(tgt.maxHp,tgt.hp+H.rate*.25);
        const m=worldToMap(tgt.px,tgt.py);
        if(SV.particles&&Math.random()<.6)
          addPart({type:'dot',x:m.x+rnd(-6,6),y:m.y-rnd(6,16),vx:0,vy:-12,t:0,life:.35,
            color:'#8ce89a',size:2})}}}
  // ---- nightmare: royal guards escort their monarch ----
  if(e.cfg.follow){const fk=e.cfg.follow;let mon=null;
    for(const o of enemies){if(o.dead||o===e)continue;
      if(o.cfg.kind!==fk)continue;mon=o;break}
    // A guard whose king has fallen has nothing left to chase. Leaving the last
    // multiplier in place would put every survivor into a permanent sprint.
    e.spd=mon?mon.cfg.spd*G.mode.spdMul*(mon.d-e.d>1.5?2.2:(mon.d-e.d<-.8?.55:1))
             :e.cfg.spd*G.mode.spdMul}
  // Whatever is holding this enemy back decides its pace, and a boss reads the
  // boss figure from the same source: Corrupt drags a walker to a quarter speed
  // but only halves a boss, while Toxic does nothing to a boss at all. Applied
  // as a multiplier here rather than written into e.spd, because the royal-guard
  // escort above rewrites e.spd every single frame.
  const slow=e.slowT>0?(e.boss?e.slowBossMul:e.slowMul):1;
  e.anim+=dt*(1+e.spd*.4)*slow;
  e.d+=e.spd*dt*slow;
  if(e.d>=PATH.total){leak(e);e.dead=true;return}
  setEnemyPos(e)}

// ---------- towers ----------
// ---- village support aura ----
// Villages contribute to towers by DISTANCE from where they sit. The result IS
// cached in the buffed tower's stats, which means the cache has to be invalidated
// when the board changes — see refreshVillageChanges below for that bookkeeping.
const VILLAGE_BASE_RADIUS=3;    // tiles a village covers at zero upgrades
// How far a village reaches. This is the one thing villages DO inherit from
// each other: every village touching this one adds +1 tile, so clusters cover
// more ground while each village's percentage output stays flat.
function villageRadius(v){
  let r=VILLAGE_BASE_RADIUS;
  const S=v.S||{};
  r+=S.vRadius||0;
  for(const o of towers){
    if(o===v)continue;
    if(towerBehavior(o.type)!=='village')continue;
    const dx=o.x-v.x,dy=o.y-v.y,or=villageRadiusRaw(o);
    if(dx*dx+dy*dy<=or*or)r++}
  return r}
// A village's radius from its own upgrades alone. Split out so villageRadius
// can ask "is that village close enough to widen me?" without re-running the
// neighbour count for the village it is asking about.
function villageRadiusRaw(v){return VILLAGE_BASE_RADIUS+(((v.S||{}).vRadius)||0)}
// The buffs a single village grants, SPLIT BY WHICH PATH PAID FOR THEM. Each
// entry is one upgrade lane's worth of support, so a village's top path and
// bottom path stay separate contributions that are allowed to add together.
function villageBuff(v,x,y){
  if(towerBehavior(v.type)!=='village')return null;
  const dx=v.x-x,dy=v.y-y;
  const r=villageRadius(v);
  if(dx*dx+dy*dy>r*r)return null;
  return (v.S&&v.S.vLane)||null}
// Aggregate the villages covering (x,y) by UPGRADE PATH, one slot per lane plus
// the reserved base slot (see applyVillageUpgrades). Two rules, both from the design:
//   1. A boost does NOT stack across villages of the SAME path — for each path
//      and each stat, only the strongest village offering it counts.
//   2. Boosts from DIFFERENT paths DO stack, so a Buffs village and a Discounts
//      village pull together on one tower.
// There is deliberately no cap on how many villages get a say. Per-path maxima
// already stop stacking, and a helper cap could only ever REMOVE a benefit: a
// Discounts village scores low next to two maxed Buffs villages, so the third
// village in a cluster used to silently cancel the very discount it brought.
// Clusters are what the shared-radius mechanic encourages, so that trade could
// not have been intended. Cost stays one short pass over the towers.
function villageAura(x,y,skipSelf){
  const a={range:0,rate:0,dmg:0,discount:0};
  const lane=[];
  for(let li=0;li<=TOWERS.village.lanes;li++)
    lane.push({range:0,rate:0,dmg:0,discount:0});
  for(const v of towers){
    if(v===skipSelf)continue;
    const L=villageBuff(v,x,y);
    if(!L)continue;
    for(let li=0;li<lane.length;li++){
      const b=L[li],m=lane[li];
      if(!b)continue;
      if(b.range>m.range)m.range=b.range;
      if(b.rate>m.rate)m.rate=b.rate;
      if(b.dmg>m.dmg)m.dmg=b.dmg;
      if(b.discount>m.discount)m.discount=b.discount}}
  for(const m of lane){a.range+=m.range;a.rate+=m.rate;a.dmg+=m.dmg;a.discount+=m.discount}
  return a}
// A village's support is baked into the CACHED stats of every tower it covers,
// so whenever a village is placed, upgraded, sold or destroyed the towers it
// reaches have to be rebuilt or they keep serving the buff it used to give.
function refreshVillageCoverage(x,y,r){
  const rr=r*r;
  for(const o of towers){
    const dx=o.x-x,dy=o.y-y;
    if(dx*dx+dy*dy>rr)continue;
    o.S=towerStats(o)}}
// Current radius of every village, captured BEFORE a change so the aftermath
// can be diffed against it.
function villageRadii(){const m=new Map();
  for(const v of towers)if(towerBehavior(v.type)==='village')m.set(v,villageRadius(v));
  return m}
// Apply the fallout of a village change. `before` is the villageRadii() snapshot
// taken prior to the change, `dirty` the village whose OWN buffs changed (its
// reach may be identical while what it grants is different). Three cases:
//   gone   -> rebuild its old reach so the buffs it used to give are dropped
//   grown  -> rebuild the union of old and new reach (a village can grow a
//             NEIGHBOUR's radius too, which reaches past its own cover)
//   brand new -> build its fresh reach
function refreshVillageChanges(before,dirty){
  const now=villageRadii();
  for(const [v,r0] of before){
    const r1=now.get(v);
    if(r1===undefined)refreshVillageCoverage(v.x,v.y,r0);
    else if(r1!==r0||v===dirty)refreshVillageCoverage(v.x,v.y,Math.max(r0,r1))}
  for(const [v,r1] of now)if(!before.has(v))refreshVillageCoverage(v.x,v.y,r1)}
// How a tower attacks. Read off the definition rather than the type name,
// because a prestige clone inherits its base's behaviour by copying the config —
// keying this on 'grenadier' handed the Gold Grenadier a rifle.
// Memoised because the render pass resolves it for every tower on every frame.
// Every TOWERS entry, the prestige clones and the custom merge included, is
// registered while config.js loads, so a type's behaviour cannot change.
function towerBehavior(type){const c=towerBehavior.byType||(towerBehavior.byType={});
  let b=c[type];
  if(b===undefined){b=TOWERS[type].behavior||'bullet';c[type]=b}
  return b}
const upsOf=t=>(t&&Array.isArray(t.ups))?t.ups:[];
const totalUps=t=>{let n=0;for(const u of upsOf(t))n+=u;return n};
function towerMaxHP(t){let m=0;for(const v of upsOf(t))if(v>m)m=v;
  const idx=clamp(m-1,0,4);
  return Math.round((TOWER_HP[t.type]||[9999])[idx]*boostMul('hp'))}
function damageTower(t,amt){
  if(t.remote)return;                       // invader's copy: the defender owns its HP
  if(!towers.includes(t))return;
  t.hp-=amt;
  const m=worldToMap(t.x,t.y);
  burst(m.x,m.y-20,'#ff7060',10,60,.5,3);
  ftext(m.x,m.y-42,'-'+Math.round(amt),'#ff7060');
  if(t.hp<=0){
    // a destroyed village stops buffing — same cleanup as selling it
    const wasV=towerBehavior(t.type)==='village',before=wasV?villageRadii():null;
    towers=towers.filter(o=>o!==t);
    if(before)refreshVillageChanges(before,null);
    burst(m.x,m.y-14,'#8a4a3c',18,70,.7,4);
    Sfx.boom();if(SV.shake)G.shake=5;
    toast(TOWERS[t.type].name+' destroyed!','bad');
    if(G.sel===t)selectTower(null)}}
function towerStats(t){const d=TOWERS[t.type];
  const s={dmg:d.dmg,rate:d.rate,range:d.range,air:d.air,dtype:d.dtype||'bullet',
    splash:d.splash||0,fragCount:0,fragDmg:0,
    splashDmg:0,splashR:0,ign:{},
    charge:(d.charge!=null)?d.charge:0,chain:d.chain||0,
    income:d.income||0,
    stealthDetect:!!d.stealthDetect,
    cdAdd:0,burst:1,burstGap:.5,bulletCol:d.bulletCol||null,
    corrupt:0,corruptDur:0,bossMul:0,corruptAbility:false,
    patchDps:0,patchDur:0,patchRad:0,
    // VIPER — venom, volley shape, and how many barrels are doing the shooting
    poisonPct:(d.poison||{}).pct||0,poisonDur:(d.poison||{}).dur||0,
    poisonChance:(d.poison||{}).chance||0,
    spread:false,cluster:false,pierce:0,puddle:false,
    guns:1,gunDmg:1,gunRate:null,twin:false,toxic:false,cure:false};
  const ups=upsOf(t);
  for(let li=0;li<d.lanes;li++){
    const lv=ups[li]||0;
    for(let i=0;i<lv;i++){const fx=d.ups[li][i].fx;
      if(fx.dmg)s.dmg+=fx.dmg;
      if(fx.rate)s.rate+=fx.rate;
      if(fx.range)s.range+=fx.range;
      if(fx.splash)s.splash+=fx.splash;
      if(fx.frag){s.fragCount=5;s.fragDmg=5}
      if(fx.fragCount)s.fragCount+=fx.fragCount;
      if(fx.fragDmg)s.fragDmg+=fx.fragDmg;
      if(fx.burn){s.patchDps=10;s.patchDur=5}
      if(fx.burnDur)s.patchDur+=fx.burnDur;
      if(fx.burnDps)s.patchDps+=fx.burnDps;
      if(fx.burnRadius)s.patchRad+=fx.burnRadius;
      if(fx.income)s.income+=fx.income;
      if(fx.dtype)s.dtype=fx.dtype;
      if(fx.splashDmg)s.splashDmg+=fx.splashDmg;
      if(fx.splashR)s.splashR+=fx.splashR;
      if(fx.ignBullet)s.ign.bullet=true;
      if(fx.ignExplosive)s.ign.explosion=true;
      if(fx.charge)s.charge=fx.charge;
      if(fx.chain)s.chain=fx.chain;
      if(fx.stealthDetect)s.stealthDetect=true;
      if(fx.air)s.air=true;
      if(fx.cd)s.cdAdd+=fx.cd;
      if(fx.burst)s.burst=fx.burst;
      if(fx.bulletCol)s.bulletCol=fx.bulletCol;
      // Void Traitor — a sword swing that rots what it cuts
      if(fx.corrupt){s.corrupt=50;s.corruptDur=5}
      if(fx.ignAll)s.ign.all=true;
      if(fx.bossMul)s.bossMul+=fx.bossMul;
      if(fx.corruptAbility)s.corruptAbility=true;
      // VIPER — the venom gets stronger, the volley gets wider, the gun gets
      // a twin, and the shots start leaving the ground poisoned behind them.
      if(fx.poisonPct)s.poisonPct=fx.poisonPct;
      if(fx.poisonDur)s.poisonDur=fx.poisonDur;
      if(fx.spread)s.spread=true;
      if(fx.cluster)s.cluster=true;
      if(fx.pierce)s.pierce+=fx.pierce;
      if(fx.puddle)s.puddle=true;
      if(fx.guns)s.guns=fx.guns;
      if(fx.gunDmg)s.gunDmg*=fx.gunDmg;
      if(fx.twin)s.twin=true}}
  if(s.cdAdd)s.rate=1/Math.max(.1,1/s.rate+s.cdAdd);
  // Two barrels means two shots per volley and each one is lighter. The split is
  // applied after every flat damage upgrade so the pair stays worth the same
  // output per shot the player was quoted in the path list.
  if(s.gunDmg!==1)s.dmg*=s.gunDmg;
  if(s.guns>1){s.gunRate=[1,1];if(s.twin)s.gunRate[0]=1.3}
  if(elevAt(t.x,t.y)>0)s.range*=1.08;
  if(d.behavior==='village')applyVillageUpgrades(s,d,t);   // vRange/vRate/… fields
  // villages in range multiply this tower. rate is shots-per-second, so a
  // firerate buff scales it up; range and damage scale multiplicatively too.
  // A village buffs other villages as well, and that is allowed to stack —
  // what does NOT stack is two villages pushing the same path at one tower
  // (see villageAura). A village never buffs itself, hence skipSelf.
  const a=villageAura(t.x,t.y,t);
  s.vAura=a;
  // a village's own range is its BUFF RADIUS, governed by villageRadius(), not
  // by what it is being buffed with — leave it alone so the panel and the
  // placement ghost report the real reach
  if(d.behavior!=='village'){
    s.range*=1+a.range;
    s.dmg*=1+a.dmg;
    s.rate*=1+a.rate}
  // Match-wide tower_boost on top of everything else, so a boost reaches every
  // tower including ones placed after it was issued.
  s.dmg*=boostMul('dmg');
  s.rate*=boostMul('rate');
  // A Twin Gunner VIPER hands these out to whoever it likes. Both live on the
  // tower and inside the cached stats, so whoever starts or finishes one has to
  // revalidate — see the timers at the top of updTower.
  if(t.toxicT>0)s.toxic=true;
  if(t.cureT>0){s.cure=true;s.dmg*=1.25;s.rate*=1.25}
  return s}
// What a village's upgrades actually do to it. Kept separate from towerStats
// so village fields (vRange etc.) survive on t.S without clashing with the
// combat stats other towers use. vLane is the important one: it keeps each
// upgrade PATH's contribution apart, because a boost only fails to stack when
// it comes from the same path as another village's (see villageAura). Index
// d.lanes is a reserved slot holding the buffs the village has from birth —
// those count as their own path too, so two fresh villages don't stack their
// starting +5% either.
function applyVillageUpgrades(s,d,t){
  s.vRange=0;s.vRate=0;s.vDmg=0;s.vRadius=0;s.vDiscount=0;
  const ups=upsOf(t),lane=[];
  for(let li=0;li<=d.lanes;li++)lane.push({range:0,rate:0,dmg:0,discount:0});
  const base=d.vBase;
  if(base){const L=lane[d.lanes];
    if(base.range){s.vRange+=base.range;L.range+=base.range}
    if(base.rate){s.vRate+=base.rate;L.rate+=base.rate}
    if(base.dmg){s.vDmg+=base.dmg;L.dmg+=base.dmg}
    if(base.discount){s.vDiscount+=base.discount;L.discount+=base.discount}}
  for(let li=0;li<d.lanes;li++){
    const lv=ups[li]||0,L=lane[li];
    for(let i=0;i<lv;i++){const fx=d.ups[li][i].fx;
      if(fx.vRange){s.vRange+=fx.vRange;L.range+=fx.vRange}
      if(fx.vRate){s.vRate+=fx.vRate;L.rate+=fx.vRate}
      if(fx.vDmg){s.vDmg+=fx.vDmg;L.dmg+=fx.vDmg}
      if(fx.vRadius)s.vRadius+=fx.vRadius;
      if(fx.vDiscount){s.vDiscount+=fx.vDiscount;L.discount+=fx.vDiscount}}}
  s.vLane=lane;
  return s}
function laneCap(t,li){const d=TOWERS[t.type];
  if(d.lanes===1)return 5;
  return (upsOf(t)[1-li]||0)>=3?2:5}
// What an upgrade actually costs this tower. Villages nearby discount it, and
// the discount never applies to a tower's own final upgrade — that last step
// is meant to be the expensive payoff. A noDiscount tower (the Void Traitor)
// stays outside the village economy entirely, though it still takes their
// range/firate/damage buffs.
function upCost(t,li,lv){
  const d=TOWERS[t.type],base=d.ups[li][lv].cost;
  if(lv===d.ups[li].length-1||d.noDiscount)return base;
  const a=villageAura(t.x,t.y,t);
  return Math.round(base*(1-Math.min(.9,a.discount)))}
function canBuyUp(t,li){const d=TOWERS[t.type];
  const lv=upsOf(t)[li]||0;
  if(lv>=5)return false;
  if(lv>=laneCap(t,li))return false;
  return G.cash>=upCost(t,li,lv)}
function buyUp(t,li){const d=TOWERS[t.type];
  const lv=upsOf(t)[li]||0;
  if(!canBuyUp(t,li)){
    if(lv>=laneCap(t,li)&&lv<5)toast('Lane capped — the other path has 3+ upgrades','bad');
    else toast('Not enough cash','bad');
    return false}
  const cost=upCost(t,li,lv);
  // snapshot the radii before this upgrade lands, so the aftermath can be diffed
  const wasV=d.behavior==='village',before=wasV?villageRadii():null;
  G.cash-=cost;t.invested+=cost;t.ups[li]++;t.S=towerStats(t);
  // a village that just bought a path upgrade grants different buffs now (and
  // may have widened, which also widens its neighbours), so the whole affected
  // area picks up the new values on the spot
  if(before)refreshVillageChanges(before,t);
  t.hp=t.maxHp=towerMaxHP(t);
  Sfx.up();const m=worldToMap(t.x,t.y);
  burst(m.x,m.y-16,'#f5c56a',10,50,.6);
  refreshPanel();return true}
function fxText(fx){
  if(!fx)return '';
  const p=[];
  if(fx.dmg)p.push((fx.dmg>0?'+':'')+fx.dmg+' damage');
  if(fx.rate){const r=(Math.round(fx.rate*100)/100);
    p.push((r>0?'+':'')+r+' attack speed')}
  if(fx.range)p.push('+'+fx.range+' range');
  if(fx.splash)p.push('+'+fx.splash+' splash radius');
  if(fx.frag)p.push('grenades launch 5 shrapnel (5 dmg each)');
  if(fx.fragCount)p.push('+'+fx.fragCount+' shrapnel pieces');
  if(fx.fragDmg)p.push('+'+fx.fragDmg+' shrapnel damage');
  if(fx.burn)p.push('ground fire: 10 dmg/s for 5s');
  if(fx.burnDur)p.push('+'+fx.burnDur+'s fire duration');
  if(fx.burnDps)p.push('+'+fx.burnDps+' fire dmg/s');
  if(fx.burnRadius)p.push('+'+fx.burnRadius+' fire radius');
  if(fx.income)p.push('+$'+fx.income+' income per wave');
  if(fx.dtype)p.push('damage type: '+fx.dtype);
  if(fx.ignBullet)p.push('ignores bullet resistance');
  if(fx.ignExplosive)p.push('ignores explosive resistance');
  if(fx.stealthDetect)p.push('stealth detection');
  if(fx.charge)p.push('charge-up: '+fx.charge+'s');
  if(fx.chain)p.push(fx.chain+' enemy chain (15% dmg each)');
  if(fx.cd)p.push((fx.cd<0?'':'+')+fx.cd+'s reload time');
  if(fx.air)p.push('air detection');
  if(fx.burst)p.push('burst: '+fx.burst+' shots');
  // sword path — the Void Traitor's own vocabulary
  if(fx.corrupt)p.push('corrupts what it cuts: 50 dmg/s for 5s');
  if(fx.ignAll)p.push('ignores ALL resistances');
  if(fx.bossMul)p.push('+'+(fx.bossMul*100)+'% damage to bosses');
  if(fx.corruptAbility)p.push('ability: Corrupt (all enemies slowed 75% for 10s, 60s cooldown)');
  // VIPER — the venom, the shape of the volley, and the second barrel
  if(fx.poisonPct)p.push('poison: '+(Math.round(fx.poisonPct*10000)/100)+'% of max HP per second');
  if(fx.poisonDur)p.push('poison lasts '+fx.poisonDur+'s');
  if(fx.spread)p.push('every 3rd shot adds 2 diagonal shots');
  if(fx.cluster)p.push('splits into 3 on impact');
  if(fx.pierce)p.push('pierces '+fx.pierce+' more');
  if(fx.puddle)p.push('shots leave poison puddles');
  if(fx.guns)p.push(fx.guns+' independent guns, each with its own target priority');
  if(fx.gunDmg)p.push('-'+Math.round((1-fx.gunDmg)*100)+'% damage per shot');
  if(fx.twin)p.push('left gun +30% firerate; every 20s grants Toxic and Cure to random towers');
  // village support keys — these buff NEIGHBOURING towers, not this one
  const pct=function(v){return (Math.round(v*1000)/10)+'%'};
  if(fx.vRange)p.push('+'+pct(fx.vRange)+' range to towers in range');
  if(fx.vRate)p.push('+'+pct(fx.vRate)+' firerate to towers in range');
  if(fx.vDmg)p.push('+'+pct(fx.vDmg)+' damage to towers in range');
  if(fx.vRadius)p.push('+'+fx.vRadius+' village range');
  if(fx.vDiscount)p.push('+'+pct(fx.vDiscount)+' discount on nearby upgrades');
  return p.join(' · ')}
function placeTower(type,x,y){const d=TOWERS[type];
  const t={id:uid++,type:type,x:x,y:y,ups:new Array(d.lanes).fill(0),cd:0,invested:d.cost,
    flashT:0,aim:-Math.PI/4,target:null,tgtMode:'first',
    beamOn:false,chargeT:0,beamTick:0,hp:0,maxHp:0,stunT:0,corruptCd:0,
    // slug towers keep a cooldown and an aim per barrel, and count their shots
    // so Spreadshots can fire its diagonals on every third volley
    gunCd:[0,0],gunAim:[-Math.PI/4,-Math.PI/4],gunTgt:[null,null],
    gunFlash:[0,0],gunMode:[null,null],shotN:0,
    toxicT:0,cureT:0,toxicCd:0,cureCd:0};
  const wasV=d.behavior==='village',before=wasV?villageRadii():null;
  t.S=towerStats(t);towers.push(t);
  // A village's support is baked into the cached stats of every tower it
  // covers, so placing one has to refresh the neighbourhood immediately — and
  // it may widen the villages standing next to it, which reach further still.
  if(before)refreshVillageChanges(before,t);
  t.hp=t.maxHp=towerMaxHP(t);
  for(let i=decos.length-1;i>=0;i--){
    const dd=decos[i];
    if(hyp(dd.x+.5-x,dd.y+.5-y)<.8)decos.splice(i,1)}
  G.cash-=d.cost;
  const m=worldToMap(x,y);
  burst(m.x,m.y-10,'#d8c8a0',10,40,.5);smoke(m.x,m.y,4);Sfx.place();
  if(G.mp&&G.mp.inMatch&&G.mp.role==='defender')MP.reportPlace(t);
  return t}
function sellTower(t){const refund=Math.floor(t.invested*.7);G.cash+=refund;
  // snapshot first: after the removal the diff tells us both which reach has to
  // let go of the buffs and which neighbouring villages lost a step of radius
  const before=towerBehavior(t.type)==='village'?villageRadii():null;
  towers=towers.filter(o=>o!==t);
  if(before)refreshVillageChanges(before,null);
  const m=worldToMap(t.x,t.y);
  burst(m.x,m.y-10,'#f5c56a',8,40,.5);
  ftext(m.x,m.y-30,'+$'+refund,'#8ce89a');
  if(G.sel===t)selectTower(null)}
// Can a tower with these stats act on that enemy at all? Shared by the target
// search and the Void Traitor's area swing so the two can never disagree about
// stealth, flying or tunnelling enemies.
function targetable(e,S){
  return !(e.dead||e.digging||(e.stealth&&!S.stealthDetect)||(e.cfg.flying&&!S.air))}
// `mode` overrides the tower's own setting, which is how a second barrel can be
// told to hunt something else while still falling back on the VIPER's priority
// when the player has not said otherwise.
function acquireTarget(t,mode){const S=t.S,mode0=mode||t.tgtMode||'first';
  let best=null,bv=0;const r2=S.range*S.range;
  for(const e of enemies){
    if(!targetable(e,S))continue;
    const d2=dist2(t.x,t.y,e.px,e.py);if(d2>r2)continue;
    let v;switch(mode0){
      case'first':v=e.d;break;
      case'last':v=-e.d;break;
      case'strong':v=e.hp;break;
      case'weak':v=-e.hp;break;
      default:v=-d2}
    if(best===null||v>bv){best=e;bv=v}}
  return best}
function fireProj(t,e){const mx=mapPx(t.x,t.y),my=mapPy(t.x,t.y);
  t.flashT=.12;
  const muzzle=weaponPose(t);
  projs.push({kind:'bullet',x:muzzle.mx,y:muzzle.my,e:e,spd:12,dmg:t.S.dmg,dtype:t.S.dtype||'bullet',
    src:t,ign:t.S.ign,splashDmg:t.S.splashDmg,splashR:t.S.splashR,col:t.S.bulletCol,t:0,life:2,
    toxic:!!t.S.toxic})}
function spawnGrenade(t,tx,ty){const mx=mapPx(t.x,t.y),my=mapPy(t.x,t.y);
  const muzzle=weaponPose(t);
  projs.push({kind:'grenade',x:muzzle.mx,y:muzzle.my,launchX:muzzle.mx,launchY:muzzle.my,tx:tx,ty:ty,t:0,
    src:t,dmg:t.S.dmg,splash:t.S.splash,ign:t.S.ign,
    fragCount:t.S.fragCount,fragDmg:t.S.fragDmg,
    patchDps:t.S.patchDps,patchDur:t.S.patchDur,patchRad:t.S.patchRad,
    toxic:!!t.S.toxic,
    dur:.5+hyp(t.x-tx,t.y-ty)*.06})}
function explodeGrenade(p){
  const m=worldToMap(p.tx,p.ty);
  Sfx.boom();if(SV.shake)G.shake=Math.max(G.shake,2);
  if(typeof fxSprite==='function')fxSprite('explosion',m.x,m.y);   // ART V2
  burst(m.x,m.y-6,'#e8a05a',14,70,.55,4);smoke(m.x,m.y,5);
  ringFX(m.x,m.y-6,R_ISO_X(p.splash||1.25),'#e8c08a');
  const sr=p.splash||1.25,r2=sr*sr;
  for(const e of enemies){if(e.dead)continue;
    if(dist2(p.tx,p.ty,e.px,e.py)<r2){
      dealDamage(e,p.dmg,'explosion',p.ign);
      // A Toxic grenadier's blast slows everything it catches, same as any other
      // shot that lands. Shrapnel and the fire it leaves behind do not.
      if(p.toxic)applySlow(e,.5,1,2,false)}}
  if(p.patchDps>0)
    firePatches.push({x:p.tx,y:p.ty,r:.9+(p.patchRad||0),t:p.patchDur||5,
      dps:p.patchDps,tick:0});
  if(p.fragCount>0&&p.fragDmg>0)
    for(let i=0;i<p.fragCount;i++){
      const a=i/p.fragCount*Math.PI*2+rnd(-.15,.15);
      projs.push({kind:'frag',x:m.x,y:m.y-6,
        vx:Math.cos(a)*130,vy:Math.sin(a)*78,dmg:p.fragDmg,ign:p.ign,t:0})}}
// ---- Void Traitor: one swing, everything in reach at once ----
// Damage is resolved against the whole enemy list rather than the single
// acquired target, so a cluster is cut simultaneously. The same `targetable`
// gate the target search uses keeps stealth and air rules identical here.
function voidSlash(t,S){
  const r2=S.range*S.range;
  for(const e of enemies){
    if(!targetable(e,S))continue;
    if(dist2(t.x,t.y,e.px,e.py)>r2)continue;
    let amt=S.dmg;
    if(e.boss&&S.bossMul)amt*=1+S.bossMul;
    dealDamage(e,amt,S.dtype,S.ign);
    if(S.toxic)applySlow(e,.5,1,2,false);
    if(S.corrupt&&!e.dead){e.corruptT=S.corruptDur;e.corruptDps=S.corrupt}}
  const m=worldToMap(t.x,t.y);
  ringFX(m.x,m.y-16,R_ISO_X(S.range),'#a06ae0');
  burst(m.x,m.y-14,'#6a3a9a',6,44,.35,2);
  Sfx.shoot()}
// GOD Slayer's Corrupt. Everything alive is dragged down to a quarter of its
// pace for 10 seconds; bosses and minibosses only lose half of theirs.
// Friendlies are safe by construction — they live in ADMIN.friendlies, never in
// the enemy list.
function corruptAll(t){
  let n=0;
  for(const e of enemies){
    if(e.dead||e.digging)continue;
    // Count what the swing reached, not what it changed: a walker already held
    // by another Void Traitor is still being held by this one too.
    applySlow(e,.25,.5,10,true);n++}
  if(!n)return;
  const m=worldToMap(t.x,t.y);
  ringFX(m.x,m.y-16,64,'#a06ae0');
  burst(m.x,m.y-16,'#c88ae0',18,70,.7,3);
  Sfx.boom();if(SV.shake)G.shake=Math.max(G.shake,6);
  toast('CORRUPT — the whole board crawls','bad')}
// ---- VIPER: directional shots, venom, and a pair of barrels ----
// A Ranger's bullet homes in on one target and vanishes on it. A VIPER round
// keeps the direction it left the barrel in, which is the only reason a spread
// or cluster volley can look the way it does — and "pierce" is then simply "do
// not delete yourself on the first thing you touch".
const SLUG_SPD=340,SLUG_SQUASH=.6;
function spawnSlug(t,ang,S,gi=0){
  const mx=mapPx(t.x,t.y),my=mapPy(t.x,t.y);
  const muzzle=weaponPose(t,gi);
  projs.push({kind:'slug',x:muzzle.mx,y:muzzle.my,vx:Math.cos(ang)*SLUG_SPD,
    vy:Math.sin(ang)*SLUG_SPD*SLUG_SQUASH,dmg:S.dmg,dtype:S.dtype,src:t,ign:S.ign,
    col:S.bulletCol,
    // A round that is going to break apart does its own piercing on the way in;
    // the fragments are what carry the pierce afterwards.
    pierce:S.cluster?0:S.pierce,split:!!S.cluster,childPierce:S.pierce,hit:[],t:0,life:1.1,
    poison:S.poisonPct?{pct:S.poisonPct,dur:S.poisonDur,chance:S.poisonChance}:null,
    toxic:!!S.toxic,puddle:S.puddle?{pct:S.poisonPct,dur:S.poisonDur}:null})}
// Clustershots: the round does its work on whatever it hit, then breaks into
// three that fly on through the crowd. The fragments never split again and never
// drop a puddle — otherwise one volley would seed the whole board — and they
// start with their parent's victim already on the ignore list, so they go outward
// instead of re-shooting the same corpse.
function splitSlugs(p,victimId){
  const ang=Math.atan2(p.vy,p.vx);
  for(const off of [-.85,0,.85])
    projs.push({kind:'slug',x:p.x,y:p.y,vx:Math.cos(ang+off)*SLUG_SPD,
      vy:Math.sin(ang+off)*SLUG_SPD*SLUG_SQUASH,dmg:p.dmg,dtype:p.dtype,src:p.src,
      ign:p.ign,col:p.col,pierce:p.childPierce,hit:[victimId],t:0,life:.9,
      poison:p.poison,toxic:p.toxic,puddle:null,split:false,childPierce:0})}
// Every angle one barrel puts out for this volley, relative to the aim line.
function slugArc(t,S){
  // Only Spreadshots changes what leaves the barrel. Clustershots happens at the
  // far end of the round's life, when it lands.
  return(S.spread&&t.shotN%3===0)?[0,-.66,.66]:[0]}
function slugFire(t,gi,S,tgt){
  const mx=mapPx(t.x,t.y),my=mapPy(t.x,t.y);
  const ex=mapPx(tgt.px,tgt.py),ey=mapPy(tgt.px,tgt.py);
  const aim=weaponAimAt(t,tgt,gi);
  // Invert the isometric velocity squash once so the shot follows its barrel.
  const base=Math.atan2(Math.sin(aim)/SLUG_SQUASH,Math.cos(aim));
  t.gunAim[gi]=aim;if(gi===0)t.aim=aim;
  t.gunFlash[gi]=.1;
  for(const off of slugArc(t,S))spawnSlug(t,base+off,S,gi);
  Sfx.shoot()}
// Twin Gunner picks a beneficiary at random from everything on the board that
// actually shoots — a farm cannot drip poison and a village has no shots to
// speed up, so handing either a gift would quietly waste it. The VIPER itself is
// in the pool: its own barrels shoot, and a lone VIPER on the board should still
// show what the upgrade does.
function twinCandidate(t){
  const pool=[];
  for(const o of towers){
    if(o.remote)continue;
    const b=towerBehavior(o.type);
    if(b==='farm'||b==='village')continue;
    pool.push(o)}
  return pool.length?pick(pool):null}
function grantToxic(o){
  o.toxicT=10;o.S=towerStats(o);
  const m=worldToMap(o.x,o.y);
  ringFX(m.x,m.y-16,30,'#7fd84a');
  toast(TOWERS[o.type].name+' is TOXIC — its shots now slow','good')}
function grantCure(o){
  o.cureT=10;o.S=towerStats(o);
  const m=worldToMap(o.x,o.y);
  ringFX(m.x,m.y-16,30,'#f5d442');
  toast(TOWERS[o.type].name+' is CURED — +25% damage and firerate')}
function updSlugTower(t,dt){
  const S=t.S;
  for(let i=0;i<2;i++)if(t.gunFlash[i]>0)t.gunFlash[i]-=dt;
  if(S.twin){
    // Both clocks have to run down, or the first pair of gifts is also the last.
    if(t.toxicCd>0)t.toxicCd-=dt;
    if(t.cureCd>0)t.cureCd-=dt;
    // The left barrel infects an ally on a coin flip every 20s; the right one
    // cures one every 20s. Both run whether or not there is a target.
    if(t.toxicCd<=0){t.toxicCd=20;
      if(Math.random()<.5){const o=twinCandidate(t);if(o)grantToxic(o)}}
    if(t.cureCd<=0){t.cureCd=20;
      const o=twinCandidate(t);if(o)grantCure(o)}}
  const n=S.guns>1?2:1;
  // Both barrels on the same orders settle on the same enemy, and acquireTarget
  // reads nothing but the stats and the enemy list, so the second search would
  // return exactly what the first one did.
  const share=n===2&&t.gunMode[0]===t.gunMode[1];
  for(let gi=0;gi<n;gi++){
    t.gunCd[gi]-=dt;
    // Each barrel takes its own orders, and falls back on the VIPER's priority
    // when the player has not given it any.
    const tgt=(share&&gi===1)?t.gunTgt[0]:acquireTarget(t,t.gunMode[gi]);
    t.gunTgt[gi]=tgt;if(gi===0)t.target=tgt;
    if(!tgt){if(t.gunCd[gi]<0)t.gunCd[gi]=0;continue}
    if(t.gunCd[gi]>0)continue;
    t.gunCd[gi]=1/(S.rate*(S.gunRate?S.gunRate[gi]:1));
    t.shotN++;
    slugFire(t,gi,S,tgt)}}
function updFirePatches(dt){for(let i=firePatches.length-1;i>=0;i--){const f=firePatches[i];
  f.t-=dt;if(f.t<=0){firePatches.splice(i,1);continue}
  f.tick-=dt;
  if(f.tick<=0){f.tick=.5;
    const rr2=f.r*f.r,poison=f.kind==='poison';
    for(const e of enemies){if(e.dead)continue;
      if(dist2(f.x,f.y,e.px,e.py)<rr2){
        if(poison){
          // Standing in venom does not roll a chance: it infects, and it keeps
          // refreshing the dose for as long as the puddle lasts.
          applyPoison(e,f.srcId,f.pct,f.dur)}
        else{dealDamage(e,f.dps*.5,'fire');e.onFire=1.2;e.fireDps=f.dps}}}}
  if(SV.particles&&Math.random()<dt*16){
    const a=rnd(Math.PI*2),dd=rnd(f.r*.8);
    const m=worldToMap(f.x+Math.cos(a)*dd,f.y+Math.sin(a)*dd*.5);
    addPart({type:'dot',x:m.x,y:m.y-2,vx:rnd(-4,4),vy:rnd(-28,-14),t:0,life:rnd(.3,.6),
      color:pick(f.kind==='poison'?['#7fd84a','#4a8a2c']:['#f08b3a','#f5c56a']),size:rnd(2,4)})}}}

// ---- Phaser beam ----
const PHASER_COLS=['#7ec8ff','#4a7ad0','#f5d442','#ff5040','#ff5040','#ffffff'];
// upsOf always hands back an array, so there is no missing-ups case to guard.
function phaserBeamCol(t){return PHASER_COLS[Math.min(5,upsOf(t)[0]||0)]}
function phaserBeamW(t){return 2+Math.min(5,upsOf(t)[0]||0)*.7}
function phaserChain(t,main){
  const S=t.S,chain=S.chain||0;
  const links=[];
  if(chain<=0||!main||main.dead)return links;
  const used=new Set([main.id]);
  let cur=main;
  for(let i=0;i<chain;i++){
    let best=null,bd=9;
    for(const e of enemies){
      if(e.dead||e.digging||used.has(e.id))continue;
      if(e.d>=cur.d-.05)continue;
      const d2=dist2(cur.px,cur.py,e.px,e.py);
      if(d2<bd){bd=d2;best=e}}
    if(!best)break;
    used.add(best.id);links.push(best);cur=best}
  return links}

// ---------- tower update ----------
function updTower(t,dt){
  updateArtAim(t,dt);
  const beh=towerBehavior(t.type);
  // Toxic and Cure run down on their own schedule and the cached stats have to
  // follow the instant they lapse — including on a farm or a village, which
  // never get any further down this function.
  if(t.toxicT>0){t.toxicT-=dt;if(t.toxicT<=0){t.toxicT=0;t.S=towerStats(t)}}
  if(t.cureT>0){t.cureT-=dt;if(t.cureT<=0){t.cureT=0;t.S=towerStats(t)}}
  // The Fallen Obsidian King stuns the whole board, mills and villages with it,
  // so the stun has to wear off before the support types opt out below. Past
  // their return it never decremented again and the STUNNED mark stayed for good.
  if(t.flashT>0)t.flashT-=dt;
  if(t.stunT>0){t.stunT-=dt;
    if(t.beamOn){t.beamOn=false;t.chargeT=0;t.beamTick=0}
    return}
  // Remote copies -- the invader's view of the defender's towers -- simulate too.
  // Both sides run the same enemy HP maths off the same G.mode, so watching the
  // same towers chew through the same waves is what keeps the two views alike.
  if(beh==='farm'||beh==='village')return;   // neither one ever acquires a target
  if(beh==='slug'){updSlugTower(t,dt);return}
  if(beh==='beam'){
    const S=t.S;
    const tgt=acquireTarget(t);
    if(!tgt){
      if(t.beamOn){t.beamOn=false;t.chargeT=0;t.beamTick=0;t.target=null;t.chain=null}
      return}
    const mx=mapPx(t.x,t.y),my=mapPy(t.x,t.y);
    const ex=mapPx(tgt.px,tgt.py),ey=mapPy(tgt.px,tgt.py);
    t.aim=weaponAimAt(t,tgt);
    t.target=tgt;
    if(!t.beamOn){
      t.chargeT+=dt;
      if(t.chargeT>=S.charge){t.beamOn=true;t.beamTick=0;
        Sfx.tone(1200,.12,'sawtooth',.06,-400)}
      return}
    t.beamTick+=dt;
    while(t.beamTick>=.1){
      t.beamTick-=.1;
      const chain=phaserChain(t,tgt);
      t.chain=chain;   // the beam is drawn from this; rebuilding it per frame is the same scan again
      if(!tgt.dead){dealDamage(tgt,S.dmg,'laser',S.ign);
        if(S.toxic)applySlow(tgt,.5,1,2,false)}
      for(const c of chain)
        if(!c.dead)dealDamage(c,S.dmg*.15,'laser',S.ign);
      if(SV.particles&&Math.random()<.5){
        addPart({type:'dot',x:tgt.sx+rnd(-5,5),y:tgt.sy-10+rnd(-5,5),vx:rnd(-24,24),vy:rnd(-24,10),
          t:0,life:.18,color:phaserBeamCol(t),size:rnd(1,2)})}}
    return}
  if(beh==='sword'){
    const S=t.S;
    if(t.corruptCd>0)t.corruptCd-=dt;
    if(S.corruptAbility&&t.corruptCd<=0&&enemies.some(e=>!e.dead&&!e.digging)){
      corruptAll(t);t.corruptCd=60}
    t.cd-=dt;
    const tgt=acquireTarget(t);t.target=tgt;
    // Nothing in reach: hold the swing ready rather than banking negative
    // cooldown, so it goes off the instant something walks into the radius.
    if(!tgt){if(t.cd<0)t.cd=0;return}
    const mx=mapPx(t.x,t.y),my=mapPy(t.x,t.y);
    const ex=mapPx(tgt.px,tgt.py),ey=mapPy(tgt.px,tgt.py);
    t.aim=weaponAimAt(t,tgt);
    if(t.cd>0)return;
    t.cd=1/S.rate;t.flashT=.18;
    voidSlash(t,S);
    return}
  if(t.burstLeft>0){
    t.burstT-=dt;
    if(t.burstT<=0){
      const bt=acquireTarget(t);
      if(bt){fireProj(t,bt);t.flashT=.12;Sfx.shoot()}
      t.burstLeft--;t.burstT=t.S.burstGap}}
  t.cd-=dt;if(t.cd>0)return;
  const tgt=acquireTarget(t);t.target=tgt;
  if(!tgt)return;
  t.cd=1/t.S.rate+(t.S.burst>1?(t.S.burst-1)*t.S.burstGap:0);t.flashT=.12;
  const mx=mapPx(t.x,t.y),my=mapPy(t.x,t.y);
  const ex=mapPx(tgt.px,tgt.py),ey=mapPy(tgt.px,tgt.py);
  t.aim=weaponAimAt(t,tgt);
  if(beh==='lob'){
    const flight=.5+hyp(t.x-tgt.px,t.y-tgt.py)*.06;
    const p=posAt(tgt,tgt.d+tgt.spd*flight+rnd(-.1,.1));
    spawnGrenade(t,p.x,p.y);
    Sfx.shoot();
    return}
  fireProj(t,tgt);Sfx.shoot();
  if(t.S.burst>1){t.burstLeft=t.S.burst-1;t.burstT=t.S.burstGap}}

// ---------- projectile update ----------
// Every travelling round asks the same question about the same board, so the
// live walkers and their squared hit radii are collected once per call rather
// than once per round. The scans still re-read e.dead — a round earlier in this
// very call may have just killed one, and a piercing round must move on past it.
function updProjs(dt){
  const live=[],rad2=[];
  for(const e of enemies)if(!e.dead){live.push(e);const rr=e.cfg.r+7;rad2.push(rr*rr)}
  for(let i=projs.length-1;i>=0;i--){const p=projs[i];if(!p)continue;
  p.t+=dt;
  if(p.kind==='grenade'){
    const k=p.t/p.dur;
    if(k>=1){explodeGrenade(p);projs.splice(i,1);continue}
    const ax=p.launchX,ay=p.launchY;
    const bx=mapPx(p.tx,p.ty),by=mapPy(p.tx,p.ty);
    p.x=lerp(ax,bx,k);p.y=lerp(ay,by-6,k)-Math.sin(k*Math.PI)*46;
    continue}
  if(p.kind==='frag'){
    p.x+=p.vx*dt;p.y+=p.vy*dt;
    if(p.t>.32){projs.splice(i,1);continue}
    let hit=null;
    for(let j=0;j<live.length;j++){const e=live[j];
      if(e.dead)continue;
      if(dist2(e.sx,e.sy-8,p.x,p.y)<100){hit=e;break}}
    if(hit){dealDamage(hit,p.dmg,'bullet',p.ign);
      burst(p.x,p.y,'#e8dcc0',2,24,.2,2);
      projs.splice(i,1)}
    continue}
  if(p.kind==='slug'){
    p.x+=p.vx*dt;p.y+=p.vy*dt;
    if(p.t>p.life){projs.splice(i,1);continue}
    let hit=null;
    for(let j=0;j<live.length;j++){const e=live[j];
      if(e.dead||p.hit.indexOf(e.id)>=0)continue;
      if(dist2(e.sx,e.sy-8,p.x,p.y)<rad2[j]){hit=e;break}}
    if(!hit)continue;
    dealDamage(hit,p.dmg,p.dtype,p.ign);
    if(p.poison&&!hit.dead&&Math.random()<p.poison.chance)
      applyPoison(hit,p.src.id,p.poison.pct,p.poison.dur);
    // Toxic is a drip, not a hold: it never touches a boss or a miniboss, and
    // it wears off in two seconds so a slowed walker still makes progress.
    if(p.toxic&&!hit.dead)applySlow(hit,.5,1,2,false);
    burst(p.x,p.y,p.col||'#8ce85a',3,34,.25,2);Sfx.hit();
    if(p.split){                              // Clustershots breaks apart on impact
      splitSlugs(p,hit.id);projs.splice(i,1);continue}
    if(p.pierce>0){p.pierce--;p.hit.push(hit.id);continue}
    // A puddle is left where the shot finally landed, not at every enemy a
    // piercing round threaded through on its way there.
    if(p.puddle)firePatches.push({kind:'poison',x:hit.px,y:hit.py,r:.9,t:3,tick:0,
      pct:p.puddle.pct,dur:p.puddle.dur,srcId:p.src.id});
    projs.splice(i,1);continue}
  if(!p.e||p.e.dead){if(p.t>.3)projs.splice(i,1);continue}
  const emx=mapPx(p.e.px,p.e.py),emy=mapPy(p.e.px,p.e.py);
  const dx=emx-p.x,dy=emy-10-p.y,d=hyp(dx,dy);
  if(d<10){dealDamage(p.e,p.dmg,p.dtype,p.ign);
    if(p.toxic)applySlow(p.e,.5,1,2,false);
    if(p.splashDmg>0&&p.splashR>0){
      const gx=p.e.px,gy=p.e.py,sr2=p.splashR*p.splashR;
      for(const e of enemies){if(e.dead||e===p.e)continue;
        if(dist2(gx,gy,e.px,e.py)<sr2)
          dealDamage(e,p.splashDmg,'explosion',p.ign)}
      ringFX(p.x,p.y-8,R_ISO_X(p.splashR),'#e8a05a');
      burst(p.x,p.y-8,'#e8a05a',6,44,.4,3)}
    if(typeof fxSprite==='function')fxSprite('spark',p.x,p.y);   // ART V2
    burst(p.x,p.y,p.col||DMG_COLORS[p.dtype]||'#e8dcc0',3,30,.25,2);Sfx.hit();
    projs.splice(i,1);continue}
  const ang=Math.atan2(dy,dx);
  p.x+=Math.cos(ang)*p.spd*32*dt;p.y+=Math.sin(ang)*p.spd*32*dt;
  if(p.t>p.life)projs.splice(i,1)}}
