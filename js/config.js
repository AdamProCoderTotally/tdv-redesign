"use strict";
// ============================================================
//  config.js — ALL game data: towers, enemies, bosses,
//  modes, maps, wave tables, and wave generation
// ============================================================
const R_ISO_X=r=>r*TW/2*Math.SQRT2, R_ISO_Y=r=>r*TH/2*Math.SQRT2;
const DMG_COLORS={bullet:'#e8dcc0',fire:'#f08b3a',explosion:'#e8a05a',energy:'#c88ae0',ice:'#8fd8dc',laser:'#7ec8ff',void:'#a06ae0',poison:'#7fd84a'};

// ---- TOWERS (upgrade paths + base stats) ----
const TOWERS={
  ranger:{name:'Ranger',cost:150,price:0,dtype:'bullet',range:3.5,dmg:4,rate:2,air:true,lanes:2,limit:20,
    desc:'A marksman with a trusty rifle.',
    laneNames:['Machine Gunner','Juggernaught'],
    ups:[
      [
        {name:'More Gunpowder',cost:100,fx:{dmg:3}},
        {name:'High Quality Bullets',cost:175,fx:{dmg:5}},
        {name:'Goggles',cost:500,fx:{range:.5}},
        {name:'M240',cost:650,fx:{dmg:-3,rate:2}},
        {name:'Explosive Rounds',cost:1200,fx:{dmg:22,dtype:'explosion',splashDmg:20,splashR:1.1}}],
      [
        {name:'Better Handle',cost:75,fx:{range:.25}},
        {name:'Radio',cost:200,fx:{range:.25,rate:.5,stealthDetect:1}},
        {name:'Piercing Rounds',cost:550,fx:{dmg:5,ignBullet:1}},
        {name:'Better Equipment',cost:800,fx:{range:.5,dmg:10,rate:.83}},
        {name:'Super Soldier',cost:1450,fx:{range:.25}}]]},
  grenadier:{name:'Grenadier',cost:450,price:350,dtype:'explosion',range:3,dmg:25,rate:1/1.5,
    splash:1.25,air:false,lanes:2,limit:10,behavior:'lob',
    desc:'Throws grenades at the enemies.',
    laneNames:['Shrapnel Grenadier','Incendiary Grenadier'],
    ups:[
      [
        {name:'Training',cost:150,fx:{range:.25,rate:.1}},
        {name:'Bigger Boom',cost:365,fx:{splash:.25}},
        {name:'Shrapnel',cost:650,fx:{frag:1}},
        {name:'Sharper Shrapnel',cost:950,fx:{fragCount:5,fragDmg:5}},
        {name:'Quick Access Grenades',cost:1550,fx:{rate:.23}}],
      [
        {name:'Goggles',cost:50,fx:{range:.25}},
        {name:'Loaded Grenades',cost:175,fx:{splash:.25,dmg:20}},
        {name:'Incendiary Grenades',cost:550,fx:{burn:1}},
        {name:'Mask',cost:750,fx:{range:.5,stealthDetect:1}},
        {name:'Carbon disulfide',cost:1450,fx:{dmg:40,burnDps:20,burnDur:2,burnRadius:.25}}]]},
  phaser:{name:'Phaser',cost:5750,price:1500,dtype:'laser',range:5,dmg:20,rate:10,
    air:true,lanes:1,limit:5,charge:1,chain:0,behavior:'beam',
    desc:'A laser gunner. Charges up, then locks a constant beam on its target until nothing is left in its range.',
    laneNames:['ENERGY PATH'],
    ups:[[
      {name:'More Photons',cost:2500,fx:{dmg:5}},
      {name:'Juiced Up Batteries',cost:3200,fx:{dmg:10}},
      {name:'Improved Technology',cost:7500,fx:{dmg:15,range:2.5,charge:.5,stealthDetect:1,chain:3}},
      {name:'Goggles',cost:12500,fx:{range:2.5}},
      {name:'Energy Of The Sun',cost:35000,fx:{dmg:150,chain:8}}]]},
  farm:{name:'Farm',cost:500,price:150,dtype:'bullet',range:1,dmg:0,rate:.01,lanes:1,limit:5,behavior:'farm',income:100,legs:false,
    desc:'A quiet little farm that pays gold after every wave.',
    laneNames:['HARVEST'],
    ups:[[
      {name:'Bigger Fruits',cost:250,fx:{income:50}},
      {name:'More Trees',cost:500,fx:{income:100}},
      {name:'Fertilizer',cost:750,fx:{income:150}},
      {name:'Automation',cost:1250,fx:{income:200}},
      {name:'Genetically Modified Fruits',cost:1750,fx:{income:250}}]]},
  village:{name:'Village',cost:1000,price:0,dtype:'bullet',range:3,dmg:0,rate:.01,lanes:2,limit:10,behavior:'village',legs:false,
    // buffs granted from the moment it is placed, before any upgrade
    vBase:{range:.05,rate:.05},
    desc:'Grants Boosts to nearby enemies. (discounts or buffs)',
    laneNames:['Buffs','Discounts'],
    ups:[
      [
        {name:'More Supplies',cost:600,fx:{vRange:.05,vRate:.05}},
        {name:'Extra Motivation',cost:1250,fx:{vRange:.10,vRate:.05}},
        {name:'Ammunition Storage',cost:2750,fx:{vRadius:2,vDmg:.15}},
        {name:'Lookout Towers',cost:4500,fx:{vRadius:3,vRange:.10}},
        {name:'Town',cost:9500,fx:{vRange:.10,vDmg:.10,vRate:.05}}],
      [
        {name:'Better Infrastructure',cost:300,fx:{vRadius:1}},
        {name:'Cheaper Housing',cost:750,fx:{vRate:.05}},
        {name:'More Businesses',cost:1550,fx:{vDiscount:.05}},
        {name:'Subsidies',cost:5500,fx:{vDiscount:.10}},
        {name:'Marketplace',cost:12500,fx:{vDiscount:.15,vRadius:1}}]]},
  sniper:{name:'Sniper',cost:550,price:0,dtype:'bullet',range:5.5,dmg:75,rate:1/3,
    air:false,stealthDetect:true,lanes:2,limit:20,
    desc:'A patient sharpshooter. Slow, heavy shots.',
    laneNames:['Futuristic','Anti-Tank Sniper'],
    ups:[
      [
        {name:'Better Grip',cost:75,fx:{range:.5,cd:-.5}},
        {name:'Loaded rounds',cost:550,fx:{dmg:50}},
        {name:'Laser technology',cost:950,fx:{burst:2,dmg:-75,dtype:'laser',bulletCol:'#4aa8ff'}},
        {name:'Plasma Bullets',cost:2750,fx:{dmg:50,bulletCol:'#ff4a3a'}},
        {name:'Future Tech',cost:5750,fx:{range:5,cd:-.5,dmg:50}}],
      [
        {name:'Goggles',cost:100,fx:{range:.5}},
        {name:'Professional Scope',cost:200,fx:{range:1}},
        {name:'Stabilisers',cost:300,fx:{air:true}},
        {name:'BFG-50',cost:1250,fx:{dmg:75,cd:1}},
        {name:'Specialised Anti-Boss Rounds',cost:2500,fx:{dmg:250,cd:1,dtype:'explosion'}}]]},
  // Green-themed poison marksman. Its shots are directional rather than homing,
  // which is what lets the top path fan them out and thread them through crowds.
  // Poison is a share of the enemy's own health per second, so it never one-shots
  // trash but never stops mattering against a wave-90 brute.
  viper:{name:'VIPER',cost:1250,price:3000,dtype:'bullet',range:3,dmg:40,rate:2,
    air:true,lanes:2,limit:10,behavior:'slug',bulletCol:'#8ce85a',
    poison:{pct:.0025,dur:15,chance:.1},
    desc:'A poison marksman. Every shot is a risk of infecting whatever it hits.',
    laneNames:['Venom Payload','Twin Barrels'],
    ups:[
      [
        {name:'Venom Inflix',cost:500,fx:{poisonPct:.003,poisonDur:20}},
        {name:'Scope',cost:950,fx:{range:2}},
        {name:'Spreadshots',cost:2250,fx:{spread:1}},
        {name:'Clustershots',cost:3500,fx:{cluster:1,pierce:1}},
        {name:'Chemical Mixture',cost:5500,fx:{dmg:20,poisonPct:.004,poisonDur:18}}],
      [
        {name:'Dissolution',cost:550,fx:{cd:-.1}},
        {name:'Snake Eyes',cost:750,fx:{range:1}},
        {name:'Poison Puddles',cost:2550,fx:{puddle:1}},
        {name:'Double Gunner',cost:13750,fx:{guns:2,gunDmg:.65}},
        {name:'Twin Gunner',cost:36500,fx:{twin:1}}]]},
  // Admin-only. Never appears in the shop and can only enter a loadout through
  // the `give_tower` command, so `adminOnly` is what keeps it out of the grid.
  voidtraitor:{name:'Void Traitor',cost:5000,price:0,dtype:'void',range:1,dmg:300,rate:1/5,
    air:true,lanes:1,limit:5,behavior:'sword',adminOnly:true,noDiscount:true,
    desc:'A traitor to the light. Walks up to whatever comes and answers it with a sword.',
    laneNames:['THE VOID'],
    ups:[[
      {name:'Larger Sword',cost:5000,fx:{dmg:200}},
      {name:'Corruption',cost:7500,fx:{dmg:50,corrupt:1}},
      {name:'Void General',cost:15000,fx:{dmg:100,cd:-1}},
      {name:'Egoist',cost:30000,fx:{ignAll:1,bossMul:.5}},
      {name:'GOD Slayer',cost:75000,fx:{dmg:1500,corruptAbility:1}}]]}
};

// ---- TOWER HP per upgrade tier (tier 1s don't raise it) ----
const TOWER_HP={
  ranger:[150,200,350,500,800],
  grenadier:[200,450,700,700,700],
  phaser:[1250,2500,3450,3450,5500],
  farm:[200,300,450,600,800],
  sniper:[120,160,220,300,450],
  // VIPER starts tough at 1250 and keeps pace with the rest of the roster as its
  // paths fill in.
  viper:[1250,1400,1650,1950,2300],
  // Flat 12500 at every tier — the Void Traitor is meant to be a wall, and its
  // upgrades buy reach and cruelty, not more body.
  voidtraitor:[12500,12500,12500,12500,12500],
  village:[400,600,900,1300,1800]};

// ---- PRESTIGE towers ----
// A prestige buy is a second copy of a tower you already own, cast in gold and
// listed beside the original in your loadout. Same weapon, same upgrade paths —
// but every upgrade costs three times as much and every damage figure is two and
// a half times the base tower's, at every tier. The definitions are GENERATED
// from the base towers for exactly that reason: hand-copying an upgrade table
// would let the two drift the moment anyone retuned an upgrade. Only the name,
// the gold price and the blurb are authored here.
const PRESTIGE={
  ranger:{id:'goldranger',name:'Gold Ranger',gold:3000,lvl:5,dmgMul:2.5,costMul:3,
    desc:'The Ranger, cast in gold. Same rifle, same upgrade paths.'},
  grenadier:{id:'goldgrenadier',name:'Gold Grenadier',gold:4250,lvl:5,dmgMul:2.5,costMul:3,
    desc:'The Grenadier, cast in gold. Same launcher, same upgrade paths.'}};
// Damage deltas that must keep the 2.5x ratio. Anything non-damage (range, rate,
// splash radius, utility) is shared with the base tower untouched.
const DMG_FX=['dmg','splashDmg','fragDmg','burnDps'];
for(const base in PRESTIGE){const p=PRESTIGE[base],b=TOWERS[base];
  // Clone the whole base definition first, then overwrite. Listing fields by
  // hand silently dropped the Grenadier's splash radius the day it was added.
  const g=Object.assign({},b);
  g.name=p.name;g.desc=p.desc;g.price=0;g.laneNames=b.laneNames;
  g.dmg=b.dmg*p.dmgMul;
  g.prestige=base;g.prestigeGold=p.gold;g.prestigeLvl=p.lvl;
  g.ups=b.ups.map(function(lane){return lane.map(function(u){
    const fx=Object.assign({},u.fx);
    for(const k of DMG_FX)if(fx[k])fx[k]*=p.dmgMul;
    return {name:u.name,cost:u.cost*p.costMul,fx:fx}})});
  TOWERS[p.id]=g;
  TOWER_HP[p.id]=TOWER_HP[base]}

// ---- ENEMIES ----
const ENEMIES={
  walker:{name:'Walker',hp:50,spd:1.2,rw:10,r:9,kind:'walker',pal:['#8a9aa8','#4c5a68','#c8d4de']},
  sprinter:{name:'Sprinter',hp:25,spd:2.2,rw:8,r:7,kind:'sprinter',pal:['#e8a03c','#9c5c14','#f8d888']},
  brute:{name:'Brute',hp:150,spd:.8,rw:25,r:11,kind:'brute',pal:['#8a7263','#4a3a30','#c8b4a0']},
  rwalker:{name:'Revived Walker',hp:75,spd:1.2,rw:15,r:9,kind:'rwalker',res:{bullet:.3},pal:['#9cbf9a','#4f7a52','#d2ead0']},
  rsprinter:{name:'Revived Sprinter',hp:75,spd:2.5,rw:15,r:7,kind:'rsprinter',res:{bullet:.3},pal:['#a8c89a','#5a8a5c','#e0f0d8']},
  rbrute:{name:'Revived Brute',hp:300,spd:.8,rw:50,r:11,kind:'rbrute',res:{bullet:.3},pal:['#7a9a7e','#3e5c44','#b8d8ba']},
  molten:{name:'Molten',hp:150,spd:1.5,rw:20,r:10,kind:'molten',pal:['#e06a28','#8a2f0e','#f8b060']},
  mmolten:{name:'Mega Molten',hp:500,spd:1,rw:60,r:13,kind:'mmolten',pal:['#e06a28','#8a2f0e','#f8b060']},
  obsidian:{name:'Obsidian',hp:50,spd:0,rw:10,r:10,kind:'obsidian',pal:['#4a4258','#2a2436','#7a6f8e']},
  mobsidian:{name:'Mega Obsidian',hp:250,spd:0,rw:30,r:13,kind:'mobsidian',pal:['#4a4258','#2a2436','#7a6f8e']},
  blitz:{name:'Blitz',hp:20,spd:4,rw:5,r:7,kind:'blitz',pal:['#f5e28a','#b09020','#ffffff']},
  fakewalker:{name:'Fake Walker',hp:100,shield:1000,shieldRes:.99,spd:1.2,rw:0,r:9,kind:'walker',
    noIgnore:true,res:{bullet:.99,fire:.99,explosion:.99,laser:.99},pal:['#8a9aa8','#4c5a68','#c8d4de']},
  crawling_obsidian:{name:'Crawling Obsidian',hp:1500,spd:.5,rw:60,r:12,kind:'crawling_obsidian',
    res:{fire:.8},pal:['#3c3550','#241c2c','#8a7cc8']},
  tunneller:{name:'Tunneller',hp:300,spd:1.2,rw:25,r:9,kind:'tunneller',pal:['#6a5540','#4a3826','#c8a860']},
  nightstalker:{name:'Nightstalker',hp:300,spd:1.2,rw:30,r:9,kind:'nightstalker',stealth:true,pal:['#2c2438','#181226','#b89aff']},
  wraithling:{name:'Wraithling',hp:150,spd:2.2,rw:20,r:7,kind:'wraithling',stealth:true,pal:['#241c2e','#141020','#8a7cb0']},
  lurker:{name:'Lurker',hp:750,spd:.8,rw:60,r:11,kind:'lurker',stealth:true,pal:['#20182c','#100c18','#9a8aff']},
  whisper:{name:'Whisper',hp:200,spd:.8,rw:40,r:8,kind:'whisper',stealth:true,flying:true,pal:['#1c1626','#0c0814','#7a6ba8']},
  faceless_guardian:{name:'Faceless Guardian',hp:1250,spd:.8,rw:100,r:12,kind:'faceless_guardian',pal:['#2a2434','#161220','#6a5f8e']},
  // ---- NIGHTMARE: blood & voidborn ----
  blood_clot:{name:'Blood Clot',hp:350,spd:1.2,rw:25,r:10,kind:'blood_clot',pal:['#8a1420','#4a0810','#d0404a']},
  splitter:{name:'Splitter',hp:25,spd:1.2,rw:4,r:9,kind:'splitter',pal:['#a02838','#5a1020','#e07080']},
  damned:{name:'Damned',hp:350,spd:2.2,rw:15,r:8,kind:'damned',pal:['#6a1a24','#38090e','#c05058']},
  demonic_spirit:{name:'Demonic Spirit',hp:550,spd:.8,rw:20,r:8,kind:'demonic_spirit',flying:true,pal:['#5a1030','#2a0618','#e05888']},
  cloaker:{name:'Cloaker',hp:1000,spd:1.2,rw:30,r:9,kind:'cloaker',cloak:{on:5,off:5},pal:['#2a1420','#150a12','#c05878']},
  blood_soldier:{name:'Blood Soldier',hp:2500,spd:1.2,rw:120,r:12,kind:'blood_soldier',pal:['#7a1c28','#3c0c14','#c85860']},
  necromancer:{name:'Necromancer',hp:10000,spd:.8,rw:300,r:12,kind:'necromancer',healable:true,
    summon:{every:7,count:1,pool:['rwalker','rsprinter','rbrute']},pal:['#2c2036','#160e1e','#8a5ac0']},
  healer:{name:'Healer',hp:350,spd:.8,rw:10,r:8,kind:'healer',
    heals:{rate:10,of:['necromancer'],range:3.5},pal:['#d8d0c0','#8a8478','#8ce89a']},
  royal_guard:{name:'Royal Guard',hp:2500,spd:.8,rw:400,r:13,kind:'royalguard',
    heals:{rate:25,of:['necro_monarch'],range:4},follow:'necro_monarch',pal:['#4a2430','#241018','#d0a860']}
};

// ---- BOSSES ----
const BIGS={
  tank:{name:'TANK',hp:2000,shield:1000,shieldRes:.30,spd:.5,rw:250,r:15,kind:'tank',pal:['#6a7480','#3c4450','#8a94a2']},
  rtank:{name:'Revived TANK',hp:7500,shield:2500,shieldRes:.50,spd:.5,rw:500,r:17,kind:'rtank',pal:['#5a7050','#33422c','#88a878']},
  fbrute:{name:'FATHER BRUTE',hp:5000,shield:1500,shieldRes:.15,spd:.5,rw:600,r:16,kind:'fbrute',pal:['#8a4a3c','#4c241e','#c88a6a']},
  crawler:{name:'CRAWLER',hp:10000,shield:5000,shieldRes:.20,spd:.5,rw:1000,r:18,kind:'crawler',pal:['#4a3c50','#2c2434','#6a5a74']},
  rmmolten:{name:'Revived Mega Molten',hp:3000,shield:1000,shieldRes:.20,spd:.55,rw:500,r:15,kind:'rmmolten',pal:['#c04a20','#6a2a10','#f09050']},
  oknight:{name:'Obsidian Knight',hp:7500,shield:5000,shieldRes:.25,spd:.5,rw:800,r:17,kind:'oknight',pal:['#3c3550','#1e1a2c','#6a5f8e']},
  mking:{name:'Molten King',hp:10000,shield:5000,shieldRes:.20,spd:.6,rw:1000,r:18,kind:'mking',pal:['#e05818','#7a2808','#f8a840']},
  wfbrute:{name:'Weakened Father Brute',hp:1500,shield:500,shieldRes:.35,spd:1.2,rw:600,r:16,kind:'wfbrute',pal:['#7a4a44','#3c2420','#a07a6a']},
  oking:{name:'Obsidian King',hp:25000,shield:10000,shieldRes:.25,spd:.45,rw:2000,r:20,kind:'oking',pal:['#35304a','#16121f','#5c5480']},
  endbringer:{name:'ENDBRINGER',hp:1500000,shield:100000,shieldRes:.50,spd:.2,rw:5000,r:22,kind:'endbringer',pal:['#1a1424','#0c0812','#8a7cff']},
  silent_exec:{name:'Silent Executioner',hp:7500,shield:3000,shieldRes:.10,spd:.6,rw:1200,r:16,kind:'silent_exec',
    sword:true,pal:['#1a1424','#0c0814','#8a7cc8']},
  stealth_tunneller:{name:'Stealth Tunneller',hp:5000,shield:2500,shieldRes:.30,spd:.6,rw:1500,r:16,kind:'stealth_tunneller',pal:['#241c2c','#120e18','#c8b8ff']},
  faceless:{name:'Faceless.',hp:10000,shield:7500,shieldRes:.20,spd:.6,rw:2000,r:18,kind:'faceless',pal:['#221c30','#0e0a18','#8a7cc8']},
  fallen_oking:{name:'Fallen Obsidian King',hp:20000,shield:7500,shieldRes:.30,spd:.6,rw:3000,r:20,kind:'fallen_oking',
    stuns:true,pal:['#2a2036','#120c1c','#7a6ba8']},
  the_unseen:{name:'The Unseen',hp:35000,shield:12500,shieldRes:.25,spd:.6,rw:5000,r:22,kind:'the_unseen',
    stealth:true,pal:['#141020','#08060e','#e8dcff']},
  // ---- NIGHTMARE minibosses ----
  necro_monarch:{name:'Necro-Monarch',hp:10500,shield:5000,shieldRes:.10,spd:.8,rw:2000,r:19,kind:'necro_monarch',
    res:{bullet:.1,explosion:.1,fire:.1,laser:.1},
    summon:{every:15,count:6,pool:'nm_random'},
    banner:['THE NECRO-MONARCH','RISES'],pal:['#2c2038','#140c1e','#9a6ad0']},
  deformed_king:{name:'Deformed King',hp:45000,shield:15000,shieldRes:.15,spd:.8,rw:3000,r:20,kind:'deformed_king',
    res:{bullet:.15,explosion:.15,fire:.15,laser:.15},banner:['THE DEFORMED KING','APPROACHES'],
    pal:['#7a2c3a','#3a1018','#c87a8a']},
  endbringer_guardian:{name:'Endbringer Guardian',hp:75000,shield:15000,shieldRes:.30,spd:.8,rw:4500,r:21,kind:'endbringer_guardian',
    res:{bullet:.3,explosion:.3,fire:.3,laser:.3},banner:['THE ENDBRINGER GUARDIAN','STANDS IN YOUR WAY'],
    pal:['#1e1830','#0c0a18','#8a7cff']},
  error_void_leak:{name:'eRR0r: Vo1d_L34k',hp:10000,shield:55000,shieldRes:.60,spd:.8,rw:3500,r:18,kind:'error_void_leak',
    res:{bullet:.6,explosion:.6,fire:.6,laser:.6},banner:['eRRor: Void_leak','SIGNAL LOST'],
    pal:['#3a2a5a','#181030','#b060ff']},
  the_misplaced:{name:'The Misplaced',hp:175000,shield:35000,shieldRes:.30,spd:.8,rw:6000,r:22,kind:'the_misplaced',
    res:{bullet:.3,explosion:.3,fire:.3,laser:.3},
    summon:{every:6,count:1,pool:'nm_blood'},
    banner:['THE MISPLACED','A MASS OF BLOOD'],pal:['#6a1420','#300810','#c04a50']}
};

const BASE_WIN_GOLD=500, BASE_WIN_XP=750;
const BOSS_CASH_MUL=1.5;

// ============ CUSTOM TOWERS & ENEMIES — PASTE ZONE ============
// The Tower Creator tool exports code for below. Towers need a
// tiers:[hp1..hp5] array; enemies with boss:true become bosses.
const CUSTOM_TOWERS={};
const CUSTOM_ENEMIES={};
/* ---- paste tower/enemy exports below this line ---- */
// ---- end paste zone (do not edit the merge below) ----

// engine merge — do not edit
(function(){
  for(const id in CUSTOM_TOWERS){const d=CUSTOM_TOWERS[id];
    TOWERS[id]=d;
    TOWER_HP[id]=d.tiers||[200,300,450,600,800]}
  for(const id in CUSTOM_ENEMIES){const d=CUSTOM_ENEMIES[id];
    if(!d.pal)d.pal=['#8a9aa8','#4c5a68','#c8d4de'];
    (d.boss?BIGS:ENEMIES)[id]=d}
})();

// ---- BADGES ----
const BADGES=[
  {id:'newcomer',name:'Newcomer',desc:'Beat EASY mode for the first time.'},
  {id:'crawly',name:'Crawly',desc:'Beat INTERMEDIATE mode for the first time.'},
  {id:'onfire',name:'On Fire',desc:'Beat HARD mode for the first time.'},
  {id:'canyouseethem',name:'Can you see them?',desc:'Beat EXPERT mode for the first time.'},
  // nightmare is latest-only content, so the badge sits behind the same
  // update gate as the mode that earns it
  {id:'massacre',name:'Massacre',desc:'Beat NIGHTMARE mode for the first time.',latest:true},
  {id:'goingstrong',name:'Going Strong',desc:'Reach wave 50 in Endless mode.'},
  {id:'tripledigits',name:'Triple Digits',desc:'Reach wave 100 in Endless mode.'},
  {id:'stillgoing',name:'Still Going?',desc:'Reach wave 200 in Endless mode.'},
  {id:'howlong',name:'How Long Did You Spend?',desc:'Reach wave 500 in Endless mode.'},
  {id:'itends',name:'It.. Ends?',desc:'Beat wave 501 in Endless mode.'},
  // ---- newest content: shown as "UPDATE REQUIRED" on an outdated build ----
  {id:'guardian',name:'Just a Guardian?',desc:'Meet the Endbringer Guardian.',latest:true},
  {id:'void',name:'Void.. ?',desc:'Encounter the voidmare easter egg.',latest:true},
  {id:'rich',name:'Rich',desc:'Hold over 5,000 Gold.',latest:true},
  {id:'monayyy',name:'Monayyy',desc:'Hold over 25,000 Gold.',latest:true},
  {id:'millionaire',name:'Millionaire (not)',desc:'Hold over 50,000 Gold.',latest:true},
  {id:'new',name:'New?',desc:'Reach level 5.',latest:true},
  {id:'knowledgeable',name:'Knowledgeable',desc:'Reach level 15.',latest:true},
  {id:'professional',name:'Professional',desc:'Reach level 30.',latest:true},
  {id:'veteran',name:'Veteran',desc:'Reach level 50.',latest:true},
  // staff encounters: both are awarded by another account's status, never by
  // your own numbers, so nothing here is checked in checkStatBadges
  {id:'blessed',name:'Blessed',desc:'A developer gave you Gold, XP or a tower.',latest:true},
  {id:'meetgreet',name:"Meet n' Greet",desc:'Shared a lobby or a match with a developer.',latest:true}
];
const BADGE_FOR_MODE={easy:'newcomer',intermediate:'crawly',hard:'onfire',expert:'canyouseethem',nightmare:'massacre'};
const ENDLESS_BADGE_WAVES={50:'goingstrong',100:'tripledigits',200:'stillgoing',500:'howlong'};
const ENDLESS_LAST_WAVE=501;
// clearing this one is what asks whether you want the Endbringer at all
const ENDLESS_CHALLENGE_WAVE=ENDLESS_LAST_WAVE-1;

// ---- MODES ----
const MODES={
  easy:{id:'easy',name:'EASY',desc:'0.75&times; Gold &amp; XP rewards',lockDesc:'Locked',
    hp:250,hpMul:.5,spdMul:.5,moneyMul:.5,rewardMul:.75,waves:15,startCash:250,unlock:true},
  intermediate:{id:'intermediate',name:'INTERMEDIATE',desc:'1&times; Gold &amp; XP rewards',lockDesc:'Locked',
    hp:500,hpMul:1,spdMul:1,moneyMul:1,rewardMul:1,waves:25,startCash:500,unlock:true},
  hard:{id:'hard',name:'HARD',desc:'1.25&times; Gold &amp; XP rewards',lockDesc:'Locked',
    hp:750,hpMul:1,spdMul:1,moneyMul:1,rewardMul:1.25,waves:40,startCash:750,unlock:true},
  expert:{id:'expert',name:'EXPERT',desc:'Stealth enemies &mdash; 1.75&times; rewards',lockDesc:'Locked',
    hp:2250,hpMul:1,spdMul:1,moneyMul:1,rewardMul:1.75,waves:50,startCash:2500,unlock:true},
  pvp:{id:'pvp',name:'PVP',desc:'Online 1v1 — one player sends enemies, the other defends.',
    hidden:true,unlock:true,
    hp:250,hpMul:1,spdMul:1,moneyMul:1,rewardMul:1,waves:Infinity,startCash:750},
  nightmare:{id:'nightmare',name:'NIGHTMARE',desc:'Blood &amp; nightmares &mdash; 2.25&times; rewards',lockDesc:'Locked',
    hp:10500,hpMul:1,spdMul:1,moneyMul:1,rewardMul:2.25,waves:70,startCash:17500,unlock:true,latest:true},
  voidmare:{id:'voidmare',name:'VOIDMARE',desc:'',lockDesc:'???',unlock:false},
  endless:{id:'endless',name:'ENDLESS',desc:'Infinite waves &mdash; a boss every 15 waves',lockDesc:'Locked',
    hp:5250,hpMul:1,spdMul:1,moneyMul:1,rewardMul:1,waves:Infinity,startCash:1500,unlock:true}
};

const MAPS=[
  {id:'test',name:'Grasslands',desc:'A simple starter-friendly map.',unlock:true},
  {id:'m2',name:'',desc:'',unlock:false}
];

// ---- WAVE TABLES ----
const WAVE_TABLES={
  easy:{
    1:{w:6},2:{w:9},3:{w:8,s:4},4:{w:6,s:8},5:{w:6,b:3},
    6:{w:6,s:4,b:4},7:{s:8,b:6},8:{w:10,s:6,b:5},9:{w:6,s:8,b:8},
    11:{s:10,b:6},12:{w:8,b:10},13:{s:12,b:8},14:{w:10,s:8,b:12}},
  intermediate:{
    1:{w:6},2:{w:10},3:{w:8,s:4},4:{w:6,s:8},5:{w:6,b:3},
    6:{w:6,s:4,b:4},7:{s:8,b:6},8:{w:10,s:6,b:5},9:{w:6,s:8,b:8},
    11:{w:6,rw:6},12:{w:4,s:6,rw:5},13:{rw:8,rs:5},14:{w:6,rs:6,rb:3},
    15:{rw:8,rb:4},16:{rs:8,rb:5},17:{w:8,rs:8,rb:5},18:{rw:8,rs:6,rb:6},
    19:{rs:10,rb:8},
    21:{rw:8,rs:6,rb:5},22:{w:8,rs:10,rb:7},23:{rw:10,rs:10,rb:8},24:{rw:10,rs:12,rb:10}},
  hard:{
    1:{rw:6},2:{rw:10},3:{rw:8,rs:4},4:{rw:6,rs:6},5:{rw:6,mo:3},
    6:{rw:6,rs:4,rb:3},7:{rs:8,mo:4},8:{rw:6,bz:12},9:{mo:5,rb:4,rs:4},
    11:{mo:6,rs:6,bz:10},12:{rb:5,mmo:2},13:{rs:10,mo:4},14:{bz:18,rw:6},
    15:{mmo:3,rb:4},16:{mo:8,rs:6},17:{rb:6,bz:12},18:{mmo:4,mo:4,rs:6},
    19:{rs:12,rb:5,bz:10},
    21:{mmo:5,mo:6},22:{rs:10,rb:6,bz:14},23:{mmo:4,mo:8},24:{bz:24,rs:8},
    25:{rb:8,mmo:4},26:{mo:10,rs:8},27:{rb:6,mmo:5,bz:12},28:{rs:14,mo:8},
    29:{mmo:6,rb:6,bz:16},
    31:{mmo:6,mo:8,rs:8},32:{rb:8,bz:20},33:{mmo:8,mo:6},34:{rs:16,rb:8,mmo:4},
    36:{mmo:8,mo:8,bz:16},37:{rb:10,mmo:6},38:{bz:30,rs:10,mo:6},39:{mmo:10,rb:8,mo:6}},
  expert:{
    1:{ns:4},2:{ns:6,wr:6},3:{tu:4,wr:8},4:{ns:6,tu:4},5:{mo:3,wr:6},
    6:{lu:2,ns:6},7:{wr:10,tu:4},8:{co:2,ns:6},9:{mo:4,lu:2,wr:8},
    11:{co:3,tu:4,ns:6},12:{lu:3,wr:10},13:{wh:4,mo:4},14:{co:4,ns:8,wr:6},
    15:{lu:4,tu:4},16:{mo:6,wh:4},17:{co:5,ns:8},18:{fg:1,lu:3,wr:8},
    19:{wh:6,mo:6},
    21:{co:6,tu:6},22:{ns:10,lu:4},23:{fg:2,wr:10},24:{wh:6,co:4},
    25:{mmo:2,lu:4},26:{mo:8,ns:8},27:{fg:2,co:5,tu:4},28:{wh:8,wr:10},
    29:{lu:6,mmo:2},
    31:{co:8,wh:6},32:{fg:3,mo:8},33:{lu:6,ns:10},34:{wr:12,wh:6},
    36:{mmo:4,co:6},37:{fg:3,lu:6},38:{wh:8,tu:6,mo:6},39:{co:8,ns:10,mmo:2},
    41:{fg:4,lu:6,wh:6},42:{mmo:4,co:8},43:{ns:12,wr:12},44:{lu:8,fg:4},
    46:{mmo:6,wh:8},47:{co:10,fg:4},48:{lu:8,mmo:4,ns:8},49:{fg:5,wh:8,co:8}}
};

const SPECIAL_WAVES={
  easy:{10:{big:'tank',escort:[['walker',6,1.2]]},15:{big:'rtank'}},
  intermediate:{
    10:{big:'tank',escort:[['walker',8,1.1],['brute',3,2.2]]},
    20:{big:'fbrute',escort:[['rwalker',6,1.2],['rbrute',3,2.2]]},
    25:{big:'crawler'}},
  hard:{
    10:{big:'rmmolten',escort:[['molten',4,1.4]]},
    20:{big:'oknight',escort:[['mmolten',2,2.5],['blitz',10,.2]]},
    30:{big:'mking',escort:[['mmolten',3,2.2],['molten',6,1.2]]},
    35:{big:'wfbrute',escort:[['blitz',12,.18]]},
    40:{big:'oking'}},
  expert:{
    10:{big:'silent_exec',escort:[['nightstalker',6,1.2],['wraithling',6,.6]]},
    20:{big:'stealth_tunneller',escort:[['lurker',3,2.2],['whisper',4,1.5]]},
    30:{big:'faceless',escort:[['faceless_guardian',2,3],['tunneller',4,1.5]]},
    40:{big:'fallen_oking',escort:[['crawling_obsidian',3,2],['nightstalker',8,1]]},
    50:{big:'the_unseen'}},
  nightmare:{
    10:{big:'necro_monarch',escort:[['royal_guard',2,3],['damned',8,.7]]},
    25:{big:'deformed_king',escort:[['blood_clot',8,1.2],['splitter',6,1.6]]},
    40:{big:'endbringer_guardian',escort:[['blood_soldier',4,3],['cloaker',5,1.6]]},
    60:{big:'error_void_leak',escort:[['wraithling',10,.5],['nightstalker',8,.8]]},
    70:{big:'the_misplaced',escort:[['blood_soldier',6,2.6],['blood_clot',12,1]]}}
};

// ---- ENDLESS mode generator ----
// The nightmare minibosses join the rotation after the classic nine, in the
// order NIGHTMARE itself introduces them.
const ENDLESS_BOSSES=['wfbrute','tank','rmmolten','fbrute','rtank','oknight','crawler','mking','oking',
  'necro_monarch','deformed_king','endbringer_guardian','error_void_leak','the_misplaced'];

// ---- NIGHTMARE summon pools ----
const NM_RANDOM=['walker','sprinter','brute','rwalker','rsprinter','rbrute','molten',
  'damned','blood_clot','splitter','demonic_spirit','cloaker','nightstalker','wraithling'];
const NM_BLOOD=['blood_clot','damned','splitter','blood_soldier'];

// ---- NIGHTMARE mode generator ----
function nmPool(n){
  const pool=['walker','sprinter'];
  if(n>=4)pool.push('brute');
  if(n>=6)pool.push('rwalker','rsprinter');
  if(n>=8)pool.push('blood_clot');
  if(n>=10)pool.push('damned','rbrute');
  if(n>=12)pool.push('splitter','nightstalker');
  if(n>=14)pool.push('molten','wraithling');
  if(n>=16)pool.push('demonic_spirit');
  if(n>=19)pool.push('blitz','lurker');
  if(n>=22)pool.push('cloaker','mmolten');
  if(n>=26)pool.push('whisper');
  if(n>=30)pool.push('blood_soldier');
  if(n>=38)pool.push('blood_soldier','mmolten','cloaker');
  return pool}

function buildNightmareWave(n){
  const spec=SPECIAL_WAVES.nightmare[n];
  if(spec){
    const q=[{t:1.5,big:spec.big}];
    if(spec.escort)for(const es of spec.escort)
      for(let i=0;i<es[1];i++)q.push({t:4+i*es[2],type:es[0]});
    return q}
  const q=[];
  const pool=nmPool(n);
  const cnt=Math.min(46,8+Math.round(n*1.35));
  const iv=Math.max(.4,1.15-n*.012);
  for(let i=0;i<cnt;i++)
    q.push({t:1+i*iv+rnd(0,.4),type:pick(pool)});
  // necromancers march with their healers only after wave 10
  if(n>=11&&(n-11)%4===0){
    const nc=1+Math.floor((n-11)/24);
    for(let k=0;k<nc;k++){const t=3+k*9+rnd(0,2);
      q.push({t:t,type:'necromancer'});
      q.push({t:t+.4,type:'healer'});
      q.push({t:t+.8,type:'healer'})}}
  q.sort((a,b)=>a.t-b.t);
  return q}


function endlessPool(n){
  const pool=['walker','walker','sprinter'];
  if(n>=4)pool.push('brute');
  if(n>=8)pool.push('rwalker','rsprinter');
  if(n>=12)pool.push('rbrute');
  if(n>=14)pool.push('molten');
  if(n>=18)pool.push('mmolten');
  if(n>=22)pool.push('blitz');
  if(n>=26)pool.push('rbrute','mmolten');
  if(n>=35)pool.push('mmolten','rbrute','blitz','rsprinter');
  // ---- NIGHTMARE blood & voidborn ----
  // staggered in by how much they weigh: damned and splitters are rbrute-tier,
  // cloakers/blood soldiers are elites, royal guards only show up once the rest
  // of the wave is already nightmare stock
  if(n>=10)pool.push('damned');
  if(n>=16)pool.push('blood_clot','splitter');
  if(n>=22)pool.push('demonic_spirit','cloaker');
  if(n>=30)pool.push('blood_soldier');
  if(n>=40)pool.push('royal_guard');
  return pool}

// Endless health scaling: classic exponential up to wave 59, then the curve
// flattens — late waves stay brutal without going mathematically impossible.
function endlessHpMul(n){
  if(n<60)return Math.pow(1.045,n);
  return Math.pow(1.045,60)*(1+(n-60)*.05)}

function buildEndlessWave(n){
  const q=[];
  // wave 501 is the secret challenge — and only for the player who accepted it
  if(n===ENDLESS_LAST_WAVE&&G.secret==='accepted'){q.push({t:2,big:'endbringer'});return q}
  const hpMul=endlessHpMul(n);
  if(n>=15&&n%15===0){
    const idx=Math.floor(n/15)-1;
    const cycle=Math.floor(idx/ENDLESS_BOSSES.length);
    const key=ENDLESS_BOSSES[idx%ENDLESS_BOSSES.length];
    const bossMul=1+cycle*.75;
    q.push({t:1.5,big:key,hpMul:bossMul});
    const pool=endlessPool(n);
    const cnt=Math.min(30,6+Math.floor(n*.25));
    const iv=Math.max(.8,2-n*.02);
    for(let i=0;i<cnt;i++)
      q.push({t:4+i*iv+rnd(0,.4),type:pick(pool),hpMul});
    q.sort((a,b)=>a.t-b.t);
    return q}
  if(n>=7&&n%7===0){
    let pool=['sprinter'];
    if(n>=22)pool=['blitz','sprinter','blitz'];
    const iv=Math.max(.12,.5-n*.004);
    const cnt=Math.min(48,Math.round(10+n*1.2));
    for(let i=0;i<cnt;i++)
      q.push({t:1+i*iv+rnd(0,.15),type:pick(pool),hpMul});
    q.sort((a,b)=>a.t-b.t);
    return q}
  const pool=endlessPool(n);
  const iv=Math.max(.5,1.4-n*.015);
    const cnt=Math.min(42,Math.round(7+n*.8));
  for(let i=0;i<cnt;i++)
    q.push({t:1+i*iv+rnd(0,.4),type:pick(pool),hpMul});
  // a necromancer column arrives with its own healers, the way it does in
  // NIGHTMARE — a lone healer would just be walking 150 HP of nothing
  if(n>=20&&n%5===0){
    const nc=1+Math.floor((n-20)/30);
    for(let k=0;k<nc;k++){const t=3+k*9+rnd(0,2);
      q.push({t:t,type:'necromancer',hpMul});
      q.push({t:t+.4,type:'healer',hpMul});
      q.push({t:t+.8,type:'healer',hpMul})}}
  q.sort((a,b)=>a.t-b.t);
  return q}

function buildCustomQueue(spec){
  const q=[];
  if(spec.big)q.push({t:1.5,big:spec.big,hpMul:spec.bigHpMul});
  for(const grp of (spec.groups||[]))
    for(let i=0;i<grp.count;i++)
      q.push({t:(grp.delay!=null?grp.delay:1)+i*(grp.gap||1),type:grp.type});
  q.sort((a,b)=>a.t-b.t);
  return q}

function buildWaveQueue(modeId,n){
  if(window.CUSTOM_WAVES&&CUSTOM_WAVES[modeId]){
    const spec=CUSTOM_WAVES[modeId][n];
    if(spec)return buildCustomQueue(spec)}
  if(modeId==='endless')return buildEndlessWave(n);
  if(modeId==='nightmare')return buildNightmareWave(n);
  const q=[];
  const spec=(SPECIAL_WAVES[modeId]||{})[n];
  if(spec){
    q.push({t:1.5,big:spec.big});
    if(spec.escort)for(const es of spec.escort)
      for(let i=0;i<es[1];i++)q.push({t:4+i*es[2],type:es[0]});
    return q}
  const c=(WAVE_TABLES[modeId]||{})[n]||{w:8,s:6,b:6};
  if(c.b)for(let i=0;i<c.b;i++)q.push({t:.6+i*1.7,type:'brute'});
  if(c.w)for(let i=0;i<c.w;i++)q.push({t:1.6+i*1.0,type:'walker'});
  if(c.s)for(let i=0;i<c.s;i++)q.push({t:2.6+i*.7,type:'sprinter'});
  if(c.rb)for(let i=0;i<c.rb;i++)q.push({t:.6+i*1.7,type:'rbrute'});
  if(c.rw)for(let i=0;i<c.rw;i++)q.push({t:1.6+i*1.0,type:'rwalker'});
  if(c.rs)for(let i=0;i<c.rs;i++)q.push({t:2.6+i*.65,type:'rsprinter'});
  if(c.mo)for(let i=0;i<c.mo;i++)q.push({t:.6+i*1.5,type:'molten'});
  if(c.mmo)for(let i=0;i<c.mmo;i++)q.push({t:.6+i*2.2,type:'mmolten'});
  if(c.bz)for(let i=0;i<c.bz;i++)q.push({t:1.2+i*.18,type:'blitz'});
  if(c.co)for(let i=0;i<c.co;i++)q.push({t:.6+i*1.6,type:'crawling_obsidian'});
  if(c.tu)for(let i=0;i<c.tu;i++)q.push({t:1.4+i*1.2,type:'tunneller'});
  if(c.ns)for(let i=0;i<c.ns;i++)q.push({t:1.6+i*1.0,type:'nightstalker'});
  if(c.wr)for(let i=0;i<c.wr;i++)q.push({t:2.2+i*.7,type:'wraithling'});
  if(c.lu)for(let i=0;i<c.lu;i++)q.push({t:.6+i*1.7,type:'lurker'});
  if(c.wh)for(let i=0;i<c.wh;i++)q.push({t:2.6+i*.8,type:'whisper'});
  if(c.fg)for(let i=0;i<c.fg;i++)q.push({t:1+i*2.5,type:'faceless_guardian'});
  q.sort((a,b)=>a.t-b.t);
  return q}

// ============ CUSTOM MODES & WAVES — PASTE ZONE ============
// The Tower Creator (WAVES tab) exports code for here. Format:
// MODES.my_mode={id:'my_mode',name:'MY MODE',desc:'..',unlock:true,hp:500,
//   hpMul:1,spdMul:1,moneyMul:1,rewardMul:1,waves:10,startCash:500};
// window.CUSTOM_WAVES=window.CUSTOM_WAVES||{};
// CUSTOM_WAVES.my_mode={1:{big:null,groups:[{type:'walker',count:6,gap:1,delay:1}]}};
/* ---- paste mode/wave exports below this line ---- */
// ---- end paste zone ----