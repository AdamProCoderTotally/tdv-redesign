"use strict";
// ============================================================
//  screens.js — menus, shop, inventory, badges, settings
// ============================================================
const SCREENS=['mainMenu','mapMenu','modeMenu','shopMenu','invMenu','badgesMenu',
  'settingsMenu','pauseMenu','endMenu','confirmModal',
  'mpMenu','mpModeMenu','mpLobby','mpEnd','mpCreateModal','lbMenu','challengeMenu'];
function showScreen(id){for(const s of SCREENS)$(s).classList.toggle('show',s===id);
  dockSyncChip();musicForScreen(id)}
function hideScreens(){for(const s of SCREENS)$(s).classList.remove('show');dockSyncChip()}

// Over the battlefield the cloud chip floats in the bottom-right corner; on the
// main menu that corner belongs to the profile bar, so the chip moves into it.
function dockSyncChip(){
  const chip=window.Cloud&&Cloud.chipEl;
  if(!chip)return;
  const slot=$('mainMenu').classList.contains('show')&&$('mmSyncSlot');
  // uiRoot, not body: it has to scale with the interface like everything else
  const home=slot||$('uiRoot');
  if(chip.parentElement!==home)home.appendChild(chip)}

function refreshMenu(){const li=levelInfo(SV.xp);
  checkStatBadges();
  dockSyncChip();
  const progress=Math.max(0,Math.min(100,li.rem/li.need*100));
  $('mmLvl').textContent='LVL '+li.lvl;
  $('mmLvlFill').style.width=progress+'%';
  $('mmLvlFill').parentElement.setAttribute('aria-valuenow',Math.round(progress));
  $('mmLvlTxt').textContent=li.rem+' / '+li.need+' XP';
  $('mmUser').textContent=Cloud&&Cloud.ready&&Cloud.user?Cloud.user:'DEFENDER';
  $('mmGold').textContent=fmt(SV.gold);
  $('mmBuildVer').textContent=window.TDV_VERSION||''}

// ---- tower info side panel (click cards in SHOP / TOWERS) ----
function showTowerInfo(id){const d=TOWERS[id];
  const p=$('twrInfo');
  drawTowerThumb(p.querySelector('canvas'),id);
  p.querySelector('.nm').textContent=d.name;
  p.querySelector('.pr').textContent=(d.prestige?('Prestige: '+d.prestigeGold+' Gold — ')
    :(d.price>0?('Shop: '+d.price+' Gold — '):''))+'Place: $'+d.cost;
  $('tiTraits').innerHTML=traitChips({air:d.air,stealthDetect:d.stealthDetect});
  const beh=towerBehavior(id),vb=d.vBase||{};
  const rows=beh==='village'?
   [statrow('Buff range',d.range.toFixed(1)),
    statrow('Range buff','+'+pct(vb.range||0),BOOST),
    statrow('Firerate buff','+'+pct(vb.rate||0),BOOST),
    statrow('Damage',SUPPORT_ONLY),
    statrow('Place limit',d.limit)]:
  beh==='farm'?
   [statrow('Income','$'+fmt(d.income||0)+' / wave'),
    statrow('Place limit',d.limit)]:
   [statrow('Damage',d.dmg),
    statrow('Attack speed',(1/d.rate).toFixed(2)+'s'),
    statrow('DPS',Math.round(d.dmg*d.rate)),
    statrow('Range',d.range.toFixed(1)),
    dmgTypeRow(d.dtype),
    // The venom is what a VIPER is, so it belongs on the shop card too — the
    // path list only says what each upgrade changes.
    ...(d.poison?[poisonRow(d.poison.pct,d.poison.dur,d.poison.chance)]:[]),
    statrow('Targets air',d.air?'YES':'NO'),
    statrow('Place limit',d.limit)];
  $('tiStats').innerHTML=rows.join('');
  $('tiDesc').textContent=d.desc||'No description yet.';
  p.classList.add('show')}
 $('tiClose').onclick=function(){Sfx.click();$('twrInfo').classList.remove('show')};

// ---- shop ----
// The card shell (art, name, blurb) never changes after it is built, so the
// grids build once and only the state under the shell is repainted.
function cardEl(cls,name,desc,art){const card=document.createElement('div');
  card.className='shopCard'+(cls?' '+cls:'');
  card.innerHTML='<div class="shopArt"><canvas width="72" height="72"></canvas></div>'+
    '<div class="t">'+name+'</div><div class="d">'+desc+'</div>';
  try{art(card.querySelector('canvas'))}catch(e){}
  return card}
function towerCard(cls,id){const d=TOWERS[id];
  const card=cardEl(cls,d.name,d.desc,cv=>drawTowerThumb(cv,id));
  card.dataset.tower=id;
  card.onclick=function(e){if(e.target.closest('button'))return;
    Sfx.click();showTowerInfo(id)};
  const btn=document.createElement('button');btn.className='btn';
  card.appendChild(btn);
  return card}
function buildShop(){
  const g=$('shopGrid');g.innerHTML='';
  for(const id in TOWERS)if(!TOWERS[id].prestige&&!TOWERS[id].adminOnly)
    g.appendChild(towerCard('',id));  // prestige has its own section; admin towers are unlisted
  buildPrestige();
  syncShop()}
function syncShop(){const li=levelInfo(SV.xp);
  $('shopLvl').textContent='LVL '+li.lvl;
  $('shopGold').textContent=fmt(SV.gold);
  for(const c of $('shopGrid').children)syncShopCard(c);
  for(const c of $('prestigeGrid').children)syncPrestigeCard(c)}
function syncShopCard(card){const id=card.dataset.tower,d=TOWERS[id],btn=card.querySelector('.btn');
  if(SV.owned.includes(id)){btn.className='btn';btn.disabled=true;btn.textContent='OWNED';return}
  btn.disabled=false;
  btn.className='btn gold'+(SV.gold>=d.price?'':' poor');
  btn.innerHTML=d.price>0?'<span class="coin sm"></span>BUY '+d.price:'BUY - FREE';
  btn.onclick=function(){Sfx.click();
    if(SV.gold<d.price){toast('Not enough Gold - win matches to earn more','bad');return}
    SV.gold-=d.price;SV.owned.push(id);
    if(SV.loadout.length<6){SV.loadout.push(id);toast(d.name+' unlocked & equipped!')}
    else toast(d.name+' unlocked! - loadout full, equip it in TOWERS');
    Save.save();syncShop()}}

// ---- prestige ----
// Three states gate the buy, in this order: the account level unlocks the
// feature, owning the base tower unlocks the entry, and gold pays for it. A
// prestige buy adds a SEPARATE loadout entry — the base tower keeps working,
// its own price and its own upgrades untouched.
function buildPrestige(){const g=$('prestigeGrid');g.innerHTML='';
  for(const base in PRESTIGE){const card=towerCard('prestige',PRESTIGE[base].id);
    card.dataset.base=base;g.appendChild(card)}}
function syncPrestigeCard(card){const base=card.dataset.base,p=PRESTIGE[base],d=TOWERS[p.id],
    btn=card.querySelector('.btn'),owned=SV.owned.includes(p.id),
    gated=!owned&&levelInfo(SV.xp).lvl<p.lvl,
    waiting=!owned&&!gated&&!SV.owned.includes(base);
  card.classList.toggle('locked',gated);
  card.classList.toggle('waiting',waiting);
  if(owned){btn.className='btn';btn.disabled=true;btn.textContent='PRESTIGED';return}
  if(gated){btn.className='btn';btn.disabled=true;
    btn.innerHTML='<i class="icLock"></i>LVL '+p.lvl+' REQUIRED';return}
  if(waiting){btn.className='btn';btn.disabled=true;
    btn.textContent='OWN '+TOWERS[base].name.toUpperCase()+' FIRST';return}
  btn.className='btn gold'+(SV.gold>=p.gold?'':' poor');btn.disabled=false;
  btn.innerHTML='<span class="coin sm"></span>PRESTIGE '+p.gold;
  btn.onclick=function(){Sfx.click();
    if(SV.gold<p.gold){toast('Not enough Gold - win matches to earn more','bad');return}
    SV.gold-=p.gold;SV.owned.push(p.id);
    if(SV.loadout.length<6){SV.loadout.push(p.id);toast(d.name+' unlocked & equipped!')}
    else toast(d.name+' unlocked! - loadout full, equip it in TOWERS');
    Save.save();syncShop()}}

// ---- inventory ----
function buildInv(){
  const li=levelInfo(SV.xp);
  $('invLvl').textContent='LVL '+li.lvl;
  $('invGold').textContent=fmt(SV.gold);
  const lg=$('loadoutGrid');lg.innerHTML='';
  for(let i=0;i<6;i++){
    const id=SV.loadout[i];
    const slot=document.createElement('div');
    if(id&&TOWERS[id]){
      slot.className='loSlot filled';
      slot.innerHTML='<canvas width="52" height="52"></canvas><div class="nm">'+TOWERS[id].name+'</div>'+
        '<div class="tag">click to remove</div>';
      slot.onclick=function(){Sfx.click();unequip(id)}}
    else{slot.className='loSlot empty';
      slot.innerHTML='<div class="nm" style="color:var(--dim)">EMPTY</div>'}
    lg.appendChild(slot);
    if(id&&TOWERS[id]){try{drawTowerThumb(slot.querySelector('canvas'),id)}catch(e){}}}
  const list=$('invList');list.innerHTML='';
  for(const id of SV.owned){const d=TOWERS[id];if(!d)continue;
    const equipped=SV.loadout.includes(id);
    const row=document.createElement('div');row.className='invRow';
    row.innerHTML='<canvas width="56" height="56"></canvas>'+
      '<div><div class="t">'+d.name+'</div><div class="d">'+d.desc+'</div></div><div class="grow"></div>';
    const btn=document.createElement('button');
    if(equipped){btn.className='btn red';btn.textContent='UNEQUIP';
      btn.onclick=function(){Sfx.click();unequip(id)}}
    else{btn.className='btn gold';btn.textContent='EQUIP';
      btn.onclick=function(){Sfx.click();
        if(SV.loadout.length>=6){toast('Loadout full (6 max)','bad');return}
        SV.loadout.push(id);Save.save();buildInv()}}
    row.onclick=function(e){if(e.target.closest('button'))return;
      Sfx.click();showTowerInfo(id)};
    row.appendChild(btn);
    list.appendChild(row);
    try{drawTowerThumb(row.querySelector('canvas'),id)}catch(e){}}}
function unequip(id){SV.loadout=SV.loadout.filter(t=>t!==id);Save.save();buildInv()}

// ---- badges ----
// ---- badges: 24x24 pixel art (palette + rows, '.' = transparent) ----
const BADGE_ART={
  newcomer:{p:['#b03a2e', '#7a2a22', '#3a1e0a', '#8a5420', '#c07a30', '#e8a860', '#7a4a18', '#fff0c0', '#ffffff'],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2335554444444332....',
    '....2355444744444432....',
    '...235544478744444432...',
    '...235544477744444432...',
    '...235777787777774432...',
    '..23556777777777644432..',
    '..23554677777776444432..',
    '...234447777777444432...',
    '...234477766677744432...',
    '...234477644467744432...',
    '....2346644444664432....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................']},
  massacre:{p:['#7d1418','#4e0c10','#16110d','#5f5a54','#857e76','#b3aba1','#3d3833','#e8e0d2','#ffffff'],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2335554444444332....',
    '....2355444444444432....',
    '...235547777777744432...',
    '...235577777777774432...',
    '...235547227777227432...',
    '..23556722777722764442..',
    '..23554777722777764442..',
    '...235477777777774432...',
    '...234777722277744432...',
    '...234727272727644432...',
    '....2346644444664432....',
    '....2334444444444432....',
    '.....23344444444432.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................']},
  crawly:{p:['#3a5a9a', '#28406e', '#262a32', '#6a7480', '#9aa4b2', '#d0d8e4', '#2c2434', '#5a4a68', '#c8ff5a'],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2335554444444332....',
    '....2355444444444432....',
    '...235564446644464432...',
    '...236646468684646632...',
    '...236446466666644632...',
    '..23556446677664464432..',
    '..23566666677666666432..',
    '...236444667766444632...',
    '...264666666666666462...',
    '...234644666666446432...',
    '....2644664444664462....',
    '....2634644444464362....',
    '.....23644444444632.....',
    '......263334433362......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................']},
  onfire:{p:['#c8501e', '#8a3414', '#4a2e06', '#a87c20', '#e8a33d', '#f8d878', '#c8401a', '#f08a1e', '#ffe9a0'],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2335554444444332....',
    '....2355444644444432....',
    '...235544466444444432...',
    '...235544466644444432...',
    '...235444666764444432...',
    '..23554466777664444432..',
    '..23554466777664444432..',
    '...234466778776644432...',
    '...234466778876644432...',
    '...234446778876444432...',
    '....2344467776444432....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................']},
  canyouseethem:{p:['#4a3a7a', '#2e2450', '#100c18', '#7a6fb8', '#2a2440', '#4a3e70', '#16121f', '#d8ccff', '#8a7cff', '#0a0612', '#ffffff', '#e8dcff'],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2335554444444332....',
    '....2355444444444432....',
    '...235544446644444432...',
    '...235546633336644432...',
    '...2356673aa883766432...',
    '..23556773b99837764432..',
    '..23556773899837764432..',
    '...234667388883766432...',
    '...234446633336644432...',
    '...234444446644444432...',
    '....2344444444444432....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................']},
  goingstrong:{p:['#0c1a14', '#3a6a4a', '#1c3626', '#2a5238', '#c8f0a8', '#0f2418', '#8fc878', '#5e9850'],
   r:[
    '........................',
    '.........000000.........',
    '......000111111000......',
    '.....00113333321100.....',
    '....0113333332222110....',
    '...011332222422222110...',
    '..00133222444442222100..',
    '..01332244445444422210..',
    '..01322444552554442210..',
    '.0133224552222255422210.',
    '.0133225222262222522210.',
    '.0133222226666622222210.',
    '.0133222666656666222210.',
    '.0132226665525566622210.',
    '.0122226552222255622210.',
    '..01222522227222252210..',
    '..01222222777772222210..',
    '..00122277775777722100..',
    '...011277755255777110...',
    '....0117552222255710....',
    '.....00512222221150.....',
    '......000111111000......',
    '.........000000.........',
    '........................']},
  tripledigits:{p:['#2a1a04', '#c9a040', '#2a2010', '#4a3818', '#8a6a18', '#f5e08a'],
   r:[
    '........................',
    '.........000000.........',
    '......000111111000......',
    '.....00113333321100.....',
    '....0113333332222110....',
    '...011332222222222110...',
    '..00133222222222222100..',
    '..01355225552225552210..',
    '..01555455455255455210..',
    '.0133554554554554554210.',
    '.0133554554554554554210.',
    '.0133554554554554554210.',
    '.0133554554554554554210.',
    '.0132554554554554554210.',
    '.0122554554554554554210.',
    '..01255425554425554410..',
    '..01224422444222444210..',
    '..00144444444444444100..',
    '...011222222222222110...',
    '....0112222222222110....',
    '.....00112222221100.....',
    '......000111111000......',
    '.........000000.........',
    '........................']},
  stillgoing:{p:['#08121c', '#3a7aa8', '#14283a', '#1e3e58', '#1a4a6a', '#5aa8e0', '#9ad8ff', '#e8f8ff'],
   r:[
    '........................',
    '.........000000.........',
    '......000111111000......',
    '.....00113333321100.....',
    '....0113333332222110....',
    '...011332222222222110...',
    '..00133222222222222100..',
    '..01337665222222766510..',
    '..01366566652266656650..',
    '.0136654447522654446650.',
    '.0137542226656652224750.',
    '.0136522224676542222650.',
    '.0137522222475422222650.',
    '.0136522222766522222650.',
    '.0126522226656652222750.',
    '..01675222654465222665..',
    '..01466567652266657654..',
    '..00146665442244666540..',
    '...011444422222244440...',
    '....0112222222222110....',
    '.....00112222221100.....',
    '......000111111000......',
    '.........000000.........',
    '........................']},
  howlong:{p:['#1a1408', '#8a7440', '#1e1810', '#3a3018', '#4a5c70', '#c9b178', '#f5e08a', '#e8d8a0', '#fff6c8'],
   r:[
    '........................',
    '.........000000.........',
    '......000111111000......',
    '.....07777777777777.....',
    '....0155555555555550....',
    '...011544444444444510...',
    '..00133544444444452100..',
    '..01332256666666522210..',
    '..01322225866665222210..',
    '.0133222256666652222210.',
    '.0133222225666522222210.',
    '.0133222222565222222210.',
    '.0133222225464522222210.',
    '.0132222254464452222210.',
    '.0122222254444452222210.',
    '..01222254666664522210..',
    '..01222546666666452210..',
    '..00125466666666645100..',
    '...011555555555555510...',
    '....0111111111111110....',
    '.....00112222221100.....',
    '......000111111000......',
    '.........000000.........',
    '........................']},
  itends:{p:['#07050c', '#5a4a9a', '#14101e', '#241c38', '#4a3a8a', '#8a7cff', '#f2dcff', '#05030a', '#ffffff'],
   r:[
    '........................',
    '.........000000.........',
    '......000111111000......',
    '.....00113344321100.....',
    '....0113554444552110....',
    '...011445555555544110...',
    '..00144556666665544100..',
    '..01345567777776554210..',
    '..01555678777777655510..',
    '.0135567877777777655210.',
    '.0134567777777777654210.',
    '.0144567777777777654410.',
    '.0144567777777777654410.',
    '.0134567777777777654210.',
    '.0125567777777777655210.',
    '..01555677777777655510..',
    '..01245567777776554210..',
    '..00144556666665544100..',
    '...011445555555544110...',
    '....0112554444552110....',
    '.....00112244221100.....',
    '......000111111000......',
    '.........000000.........',
    '........................']},
  guardian:{p:["#b03a2e","#7a2a22","#3a1e0a","#8a5420","#c07a30","#e8a860","#7a4a18","#fff0c0","#ffffff","#7ec8ff","#3a5a7a"],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2335554444444332....',
    '....2359999999994432....',
    '...2359aaaaaaaaa94432...',
    '...2359a9999999a94432...',
    '...2359a9977999a94432...',
    '..23559a7777777a944432..',
    '..23559a9977999a944432..',
    '...2349a9977999a94432...',
    '...23449a99799a944432...',
    '...234479aaa9a9744432...',
    '....2346699999664432....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................'
   ]},
  void:{p:["#3a2a5c","#241a3c","#160e26","#3a2c58","#5a4488","#8a6cc8","#2a1844","#b89aff","#e8dcff","#b060ff","#0e0818","#c8a8ff","#f2dcff"],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2b355544444443b2....',
    '....23bbbbbbbbbbb432....',
    '...23bb999999999bb432...',
    '...23b999aaaaa999b432...',
    '...23b99aa000aa99b432...',
    '..235b99aa0c0aa99b4432..',
    '..235b99aa000aa99b4432..',
    '...23b999aaaaa999b432...',
    '...234bb99999999bb432...',
    '...b344bbbbbbbbb444b2...',
    '....b3466444446644b2....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................'
   ]},
  rich:{p:["#b03a2e","#7a2a22","#3a1e0a","#8a5420","#c07a30","#e8a860","#7a4a18","#fff0c0","#ffffff","#f5c56a","#8a6a20","#fff0b0"],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2335554444444332....',
    '....2355999999944432....',
    '...23599bbbbbbb994432...',
    '...239bbaaaaaaabb9432...',
    '...239baabbbbbaab9432...',
    '..2359bab7777bbab94432..',
    '..2359bab7bb77bab94432..',
    '...239baab777baab9432...',
    '...239bbaaaaaaabb9432...',
    '...23499bbbbbbb994432...',
    '....2346999999964432....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................'
   ]},
  monayyy:{p:["#b03a2e","#7a2a22","#3a1e0a","#8a5420","#c07a30","#e8a860","#7a4a18","#fff0c0","#ffffff","#f5c56a","#8a6a20","#fff0b0"],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2339999999994332....',
    '....239bbbbbbbbbb932....',
    '...2359baaaaaaaab9432...',
    '...235999999999999432...',
    '...2399bbbbbbbbbbb932...',
    '..2359baaaaaaaaaab9432..',
    '..23599999999999999432..',
    '...299bbbbbbbbbbbbb92...',
    '...29baaaaaaaaaaaaab9...',
    '...299999999999999992...',
    '....2346644444664432....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................'
   ]},
  millionaire:{p:["#b03a2e","#7a2a22","#3a1e0a","#8a5420","#c07a30","#e8a860","#7a4a18","#fff0c0","#ffffff","#f5c56a","#8a6a20","#fff0b0"],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2335554444444332....',
    '....23b544b744b444b2....',
    '...235bb4bbb7bbb4bb32...',
    '...235bbbbbbbbbbbb432...',
    '...239999999999999932...',
    '..2359bbbbbbbbbbbbb932..',
    '..23599999999999999932..',
    '...299bbbbbbbbbbbbb99...',
    '...299999999999999999...',
    '...234477644467744432...',
    '....2346644444664432....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................'
   ]},
  new:{p:["#b03a2e","#7a2a22","#3a1e0a","#8a5420","#c07a30","#e8a860","#7a4a18","#fff0c0","#ffffff","#cd7f32","#8a5420","#e8b070"],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....233555a444444332....',
    '....23554aaa44444432....',
    '...235544aaa744444432...',
    '...23554aaaaa44444432...',
    '...23aaaaaaaaaaa74432...',
    '..2355aaaa9aaaaa644432..',
    '..2355aaa999aaaa444432..',
    '...23aaaa999aaaaa4432...',
    '...23aaa99999aaaa4432...',
    '...2aaaa99999aaaaa432...',
    '....aaaaaaaaaaaaaa32....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................'
   ]},
  knowledgeable:{p:["#b03a2e","#7a2a22","#3a1e0a","#8a5420","#c07a30","#e8a860","#7a4a18","#fff0c0","#ffffff","#f0ead0","#8a5420","#c8b890"],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2335554444444332....',
    '....2999999999999932....',
    '...23977777a777779432...',
    '...23977777a777779432...',
    '...2397a777a777a79432...',
    '..235977777a7777794432..',
    '..23597a777a77a7794432..',
    '...23977777a777779432...',
    '...239999999999999432...',
    '...23499aaaaaaa994432...',
    '....2349999999994432....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................'
   ]},
  professional:{p:["#b03a2e","#7a2a22","#3a1e0a","#8a5420","#c07a30","#e8a860","#7a4a18","#fff0c0","#ffffff","#c8ccd8","#5a6070","#eef0f8"],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2335554444444332....',
    '....2355888888844432....',
    '...235887777777884432...',
    '...238776666666778432...',
    '...238766555566678432...',
    '..23587655775566784432..',
    '..23587655775566784432..',
    '...238766555566678432...',
    '...238776666666778432...',
    '...234887777777884432...',
    '....2346888888864432....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................'
   ]},
  veteran:{p:["#b03a2e","#7a2a22","#3a1e0a","#8a5420","#c07a30","#e8a860","#8a6a20","#fff0c0","#ffffff","#f5c56a","#8a5420","#ffe9a0"],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '..6..23355555444632.....',
    '...62335999994444632....',
    '..662359999999444662....',
    '..6235999999999446432...',
    '...635999999999446432...',
    '..6239999999999976632...',
    '..63599999999999664432..',
    '..63599999999999464432..',
    '..6639999999999946632...',
    '...639999999999746432...',
    '..6639999999999766432...',
    '..6.2399999994666432....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................'
   ]},
  // a halo over three descending beams: the blessing that falls on the account
  blessed:{p:['#5a3a12','#2e1d08','#141009','#7d5a24','#c8a24a','#f0d68a','#a482ff','#f8d878','#fff6d0'],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2335554444444332....',
    '....2355444444444432....',
    '...235544777777444432...',
    '...235548774477844432...',
    '...235548444444844432...',
    '..23554444488444444432..',
    '..23554447488474444432..',
    '...235444748847444432...',
    '...235444647746444432...',
    '...235444446644444432...',
    '....2344444444444432....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................']},
  // two helmets, one clasp: an encounter in a lobby or across a board
  meetgreet:{p:['#33414d','#1b242c','#0e1216','#5a6f80','#8fa8b8','#c8d8e4','#4ab8e8','#e8a33d','#ffffff'],
   r:[
    '...........22...........',
    '........22233222........',
    '......223335533322......',
    '.....23355555444332.....',
    '....2335554444444332....',
    '....2355444444444432....',
    '...235546644447744432...',
    '...235546644447744432...',
    '...235566644447774432...',
    '..23554666844877744432..',
    '..23554666488477744432..',
    '...235466444444774432...',
    '...235466444444774432...',
    '...235444444444444432...',
    '....2344444444444432....',
    '....2334444444444332....',
    '.....23344444444332.....',
    '......223334433322......',
    '......002223322201......',
    '......000012210001......',
    '......00001..10001......',
    '......00001..10001......',
    '......00........01......',
    '........................']}
};
function badgeLock(h){const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16);
  const v=Math.round(26+(.3*r+.59*g+.11*b)*.26);
  return 'rgb('+(v-2)+','+v+','+(v+5)+')'}
function drawBadgeIcon(cv,id,owned){
  const g=cv.getContext('2d');g.imageSmoothingEnabled=false;
  g.fillStyle='#0a0e13';g.fillRect(0,0,cv.width,cv.height);
  const a=BADGE_ART[id];if(!a)return;
  const sc=cv.width/24,pal=owned?a.p:a.p.map(badgeLock);
  for(let y=0;y<a.r.length;y++){const row=a.r[y];
    for(let x=0;x<row.length;x++){const ch=row[x];if(ch==='.')continue;
      g.fillStyle=pal[parseInt(ch,36)];g.fillRect(x*sc,y*sc,sc,sc)}}}

function buildBadges(){
  let owned=0;
  const updLock=window.TDVUpdate&&TDVUpdate.locked('latest');
  const g=$('badgeGrid');g.innerHTML='';
  for(const b of BADGES){
    const has=!!SV.badges[b.id];if(has)owned++;
    // newest badges sit behind an update on an outdated build
    const needsUpd=updLock&&b.latest;
    const card=cardEl(needsUpd?'updLock':(has?'':'locked'),b.name,b.desc,
      cv=>drawBadgeIcon(cv,b.id,has&&!needsUpd));
    card.insertAdjacentHTML('beforeend','<div class="badgeState">'+
      (needsUpd?'<span class="chipTag hot">UPDATE REQUIRED</span>':
        has?'<span class="chipTag earned">EARNED</span>':
        '<span class="chipTag"><i class="icLock"></i>LOCKED</span>')+'</div>');
    g.appendChild(card)}
  $('badgeCount').textContent=owned+' / '+BADGES.length}

// ---- leaderboards ----
const LB_BOARDS=[
  {id:'win:easy',label:'EASY',desc:'Most victories on Easy difficulty.'},
  {id:'win:intermediate',label:'INTERMEDIATE',desc:'Most victories on Intermediate difficulty.'},
  {id:'win:hard',label:'HARD',desc:'Most victories on Hard difficulty.'},
  {id:'win:expert',label:'EXPERT',desc:'Most victories on Expert difficulty.'},
  {id:'win:nightmare',label:'NIGHTMARE',desc:'Most victories on Nightmare difficulty.'},
  {id:'win:pvp',label:'PVP',desc:'Most victories in multiplayer battles.'},
  {id:'gold',label:'GOLD',desc:'Highest recorded gold balances.'},
  {id:'level',label:'LEVEL',desc:'Highest recorded account levels.'},
  {id:'endless',label:'ENDLESS WAVE',desc:'Highest wave cleared in Endless mode.'}
];
let lbTab='win:easy',lbWinTab='win:easy',lbRequest=0;
function lbValue(board,value){
  const n=Math.max(0,Math.floor(Number(value)||0)).toLocaleString('en-US');
  if(board.id==='gold')return n+' G';
  if(board.id==='level')return 'LVL '+n;
  if(board.id==='endless')return 'WAVE '+n;
  return n+' wins'}
function lbLocalValue(board){
  if(board.id==='gold')return SV.gold;
  if(board.id==='level')return levelInfo(SV.xp).lvl;
  if(board.id==='endless')return SV.lbEndlessWave;
  return (SV.lbWins||{})[board.id.slice(4)]||0}
function buildLbTabs(){
  const wins=lbTab.indexOf('win:')===0;
  const groups=$('lbGroups');groups.replaceChildren();
  for(const g of [{id:'wins',label:'WINS',sub:'Victories by mode'},
    {id:'gold',label:'GOLD',sub:'Your recorded fortune'},
    {id:'level',label:'LEVEL',sub:'Account progression'},
    {id:'endless',label:'ENDLESS',sub:'Deepest endless run'}]){
    const btn=document.createElement('button');
    const active=g.id==='wins'?wins:g.id===lbTab;
    btn.className='btn lbGroup'+(active?' on':'');
    btn.setAttribute('aria-pressed',String(active));
    const label=document.createElement('strong');label.textContent=g.label;
    const sub=document.createElement('small');sub.textContent=g.sub;
    btn.append(label,sub);
    btn.onclick=function(){Sfx.click();lbTab=g.id==='wins'?lbWinTab:g.id;buildLbTabs();showLb()};
    groups.appendChild(btn)}
  const tabs=$('lbTabs');tabs.replaceChildren();tabs.hidden=!wins;
  $('lbModesLabel').hidden=!wins;
  for(const b of LB_BOARDS.filter(b=>b.id.indexOf('win:')===0)){
    const btn=document.createElement('button');
    btn.className='btn lbMode'+(b.id===lbTab?' on':'');btn.textContent=b.label;
    btn.setAttribute('aria-pressed',String(b.id===lbTab));
    btn.onclick=function(){Sfx.click();lbTab=lbWinTab=b.id;buildLbTabs();showLb()};
    tabs.appendChild(btn)}}
function lbEmpty(title,detail){
  const el=document.createElement('div');el.className='lbEmpty';
  const heading=document.createElement('strong');heading.textContent=title;
  const text=document.createElement('p');text.textContent=detail;
  el.append(heading,text);$('lbList').replaceChildren(el)}
function lbPlayerName(user,mine){
  const el=document.createElement('span');el.className='nm';
  const name=document.createElement('span');name.className='lbUsername';name.textContent=user;
  el.appendChild(name);
  if(mine){const you=document.createElement('span');you.className='lbYouTag';you.textContent='YOU';el.appendChild(you)}
  return el}
function renderLb(rows,board){
  const podium=$('lbPodium');podium.replaceChildren();podium.hidden=!rows.length;
  // Natural podium order: second, first, third; no fake entries for empty slots.
  for(const index of [1,0,2]){
    const entry=rows[index];if(!entry)continue;
    const card=document.createElement('div');card.className='lbChampion place'+(index+1);
    const badge=document.createElement('span');badge.className='lbMedal';badge.textContent='#'+(index+1);
    const title=document.createElement('small');title.textContent=index===0?'CHAMPION':index===1?'RUNNER-UP':'THIRD PLACE';
    const name=lbPlayerName(entry.u,entry.u===Cloud.user);
    const score=document.createElement('strong');score.className='lbChampionScore';score.textContent=lbValue(board,entry.v);
    card.append(badge,title,name,score);podium.appendChild(card)}
  const list=$('lbList');list.replaceChildren();
  if(!rows.length)lbEmpty('THE BOARD IS OPEN','No rankings yet. Play a match and claim the first spot.');
  else for(const [index,entry] of rows.entries()){
    const row=document.createElement('div');row.className='lbRow'+(entry.u===Cloud.user?' me':'')+(index<3?' top'+(index+1):'');
    const rank=document.createElement('span');rank.className='rank';rank.textContent=String(index+1).padStart(2,'0');
    const score=document.createElement('span');score.className='val';score.textContent=lbValue(board,entry.v);
    row.append(rank,lbPlayerName(entry.u,entry.u===Cloud.user),score);list.appendChild(row)}
  const mine=rows.findIndex(e=>e.u===Cloud.user);
  $('lbMyRank').textContent=mine>=0?'#'+(mine+1):'UNRANKED';
  $('lbMyScore').textContent=mine>=0?lbValue(board,rows[mine].v):lbValue(board,lbLocalValue(board));
  list.scrollTop=0}
async function showLb(sync){
  // Capture the board and a generation number: old responses must never
  // overwrite the selected tab or use the wrong value formatter.
  const request=++lbRequest,board=LB_BOARDS.find(b=>b.id===lbTab);
  const list=$('lbList'),refresh=$('lbRefresh');
  $('lbBoardTitle').textContent=board.label+(board.id.indexOf('win:')===0?' WINS':'');
  $('lbBoardDesc').textContent=board.desc;
  $('lbMetric').textContent=board.id==='gold'?'GOLD':board.id==='level'?'LEVEL':
    board.id==='endless'?'WAVE':'WINS';
  $('lbMyRank').textContent='—';$('lbMyScore').textContent='';
  $('lbPodium').hidden=true;list.setAttribute('aria-busy','true');refresh.disabled=true;
  $('lbHint').textContent=sync?'Syncing your stats and fetching rankings...':'Fetching online rankings...';
  lbEmpty('LOADING RANKINGS','Checking the Ember Hall.');
  try{
    if(!Cloud.ready||!Cloud.token)throw new Error('Sign in to view the leaderboards.');
    const synced=sync?await lbReport():null;
    if(request!==lbRequest)return;
    const data=await lbTop(board.id);
    if(request!==lbRequest)return;
    const rows=data.filter(e=>e&&typeof e.u==='string'&&Number.isFinite(+e.v))
      .map(e=>({u:e.u,v:+e.v})).sort((a,b)=>b.v-a.v||a.u.localeCompare(b.u)).slice(0,100);
    renderLb(rows,board);
    $('lbHint').textContent=(synced===false?'Stats sync unavailable. ':'')+
      rows.length+' ranked '+(rows.length===1?'player':'players')+' · Updated '+
      new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+' · Refresh to check again.';
  }catch(e){
    if(request!==lbRequest)return;
    const auth=/sign in|signed in|session/i.test(e.message||'');
    lbEmpty(auth?'SESSION NOT ACCEPTED':'RANKINGS UNAVAILABLE',
      auth?'The server could not validate your session. Your local progress is safe.':
      'The leaderboard could not be loaded. Check your connection and use Refresh.');
    // textContent only: server errors and usernames are never HTML.
    $('lbHint').textContent=e.message||'Could not reach the leaderboard server.';
  }finally{
    if(request===lbRequest){refresh.disabled=false;list.setAttribute('aria-busy','false')}}}

// ---- map & mode menus ----
function buildMapMenu(){
  const g=$('mapGrid');g.innerHTML='';
  for(const mp of MAPS){
    const card=document.createElement('div');
    if(mp.unlock){
      card.className='mapCard';
      card.innerHTML='<div class="mapArt"><canvas width="220" height="130"></canvas></div>'+
        '<div class="mn">'+mp.name+'</div><div class="md">'+mp.desc+'</div>'+
        '<div class="mapGo"><span>DEPLOY</span><span class="mmArrow" aria-hidden="true">&#8250;</span></div>';
      const cv=card.querySelector('canvas'),cg=cv.getContext('2d');
      cg.imageSmoothingEnabled=false;
      drawMapPreview(cv,mp);
      card.onclick=function(){Sfx.click();openModeMenu(mp)}}
    else{card.className='mapCard locked';
      card.innerHTML='<div class="mapArt lockArt"><span class="lockMark" aria-hidden="true">?</span></div>'+
        '<div class="mn">NO SURVEY DATA</div>'+
        '<div class="md">This theatre has not been charted yet.</div>'+
        '<div class="mapGo"><span class="chipTag"><i class="icLock"></i>COMING SOON</span></div>'}
    g.appendChild(card)}}

function openModeMenu(mp){
  G.mapSel=mp;
  $('modeTitle').textContent=mp.name;
  const g=$('modeGrid');g.innerHTML='';
  for(const mid in MODES){const m=MODES[mid];
    if(m.hidden)continue;                      // engine-internal modes (PVP etc.)
    const b=document.createElement('button');
    const locked=!m.unlock;
    // newest modes sit behind an update on an outdated build
    const needsUpd=m.latest&&window.TDVUpdate&&TDVUpdate.locked('latest');
    b.className='btn modeBtn'+(needsUpd?' updLock':(locked?' locked':''));
    if(mid==='voidmare')b.classList.add('vm');
    if(mid==='nightmare')b.classList.add('nm');
    const titleCls=(mid==='voidmare')?' class="vmTitle"':'';
    const chip=needsUpd?'<span class="chipTag hot">UPDATE REQUIRED</span>':
      locked?'<span class="chipTag"><i class="icLock"></i>'+(m.lockDesc||'LOCKED')+'</span>':'';
    let inner='<span'+titleCls+'>'+m.name+'</span>'+
      '<small>'+(needsUpd?'Update the game to deploy '+m.name+'.':m.desc)+'</small>'+
      (chip?'<span class="modeMeta">'+chip+'</span>':'');
    if(mid==='voidmare'){
      let fl='<div class="vmglow"></div>'+
        '<div class="vmportal"><i></i><b></b><em></em></div>'+
        '<div class="vmflame">';
      for(let i=0;i<9;i++)
        fl+='<i style="left:'+(2+i*11.5)+'%;animation-delay:'+(i*.11)+'s;animation-duration:'+(.85+(i%3)*.28)+'s"></i>';
      fl+='</div><div class="vmembers">';
      for(let i=0;i<7;i++)
        fl+='<i style="left:'+(6+i*13)+'%;animation-delay:'+(i*.37)+'s;animation-duration:'+(2.2+(i%4)*.7)+'s"></i>';
      fl+='</div>';
      inner+=fl}
    b.innerHTML=inner;
    if(needsUpd)b.onclick=function(){Sfx.click();
      toast('Update required to unlock '+m.name,'bad')};
    else if(m.unlock)b.onclick=function(){Sfx.click();startGame(m.id)};
    g.appendChild(b)}
  showScreen('modeMenu')}

// ---- menu buttons ----
 $('btnPlay').onclick=function(){Sfx.init();Sfx.click();buildMapMenu();showScreen('mapMenu')};
 $('btnShop').onclick=function(){Sfx.init();Sfx.click();buildShop();showScreen('shopMenu')};
 $('btnTowers').onclick=function(){Sfx.init();Sfx.click();buildInv();showScreen('invMenu')};
 $('btnBadges').onclick=function(){Sfx.init();Sfx.click();buildBadges();showScreen('badgesMenu')};
 $('btnLb').onclick=function(){Sfx.init();Sfx.click();buildLbTabs();showScreen('lbMenu');showLb(true)};
 $('lbRefresh').onclick=function(){Sfx.click();showLb(true)};
// which screen opened Settings — closing returns there (main menu or pause)
let settingsReturn='mainMenu';
 $('btnSettings').onclick=function(){Sfx.init();Sfx.click();settingsReturn='mainMenu';refreshSettings();showScreen('settingsMenu')};
 $('btnQuit').onclick=function(){Sfx.click();
  if(window.__TAURI__&&window.__TAURI__.window){
    try{window.__TAURI__.window.getCurrentWindow().close();return}catch(e){}}
  window.close();setTimeout(function(){toast('You can close this tab now')},200)};
 $('mapBack').onclick=function(){Sfx.click();showScreen('mainMenu')};
 $('modeBack').onclick=function(){Sfx.click();showScreen('mapMenu')};
 $('shopBack').onclick=function(){Sfx.click();showScreen('mainMenu');refreshMenu()};
 $('invBack').onclick=function(){Sfx.click();showScreen('mainMenu');refreshMenu()};
 $('badgesBack').onclick=function(){Sfx.click();showScreen('mainMenu')};
 $('lbBack').onclick=function(){Sfx.click();lbRequest++;showScreen('mainMenu');refreshMenu()};
 $('setBack').onclick=function(){Sfx.click();showScreen(settingsReturn==='pause'?'pauseMenu':'mainMenu')};

// ---- settings ----
function refreshSettings(){
  $('setVol').value=SV.vol;$('setSfx').value=SV.sfx;
  $('setMusic').value=(SV.music==null?60:SV.music);
  $('setPart').textContent=SV.particles?'FULL':'REDUCED';$('setPart').classList.toggle('on',SV.particles);
  $('setShake').textContent=SV.shake?'ON':'OFF';$('setShake').classList.toggle('on',SV.shake);
  document.querySelectorAll('#setScale .tgl').forEach(function(b){b.classList.toggle('on',+b.dataset.s===SV.uiScale)})}
 $('setVol').oninput=function(e){SV.vol=+e.target.value;Sfx.apply();Save.save()};
 $('setSfx').oninput=function(e){SV.sfx=+e.target.value;Sfx.apply();Save.save()};
 // A volume control you cannot hear is not a volume control, so dragging this
 // one plays the score while you drag. Only outside a match: the battlefield
 // has its own sound and the pause overlay belongs to it.
 $('setMusic').oninput=function(e){SV.music=+e.target.value;Sfx.apply();Save.save();
   if(G.state==='playing'||G.state==='paused')return;
   Sfx.init();
   if(!Music.playing)Music.play(Music.name||'lobby')};
 $('setPart').onclick=function(){SV.particles=!SV.particles;this.textContent=SV.particles?'FULL':'REDUCED';
  this.classList.toggle('on',SV.particles);Save.save();Sfx.click()};
 $('setShake').onclick=function(){SV.shake=!SV.shake;this.textContent=SV.shake?'ON':'OFF';
  this.classList.toggle('on',SV.shake);Save.save();Sfx.click()};
document.querySelectorAll('#setScale .tgl').forEach(function(b){b.onclick=function(){
  SV.uiScale=+this.dataset.s;Save.save();Sfx.click();
  uiScaleApply();
  // arrow keeps the clicked button as `this`; a nested function would read the
  // global object here and switch every size off
  document.querySelectorAll('#setScale .tgl').forEach(o=>o.classList.toggle('on',o===this))}});

// ---- confirm dialog ----
let cfAction=null;
function confirmDlg(title,msg,fn){$('cfTitle').textContent=title;$('cfMsg').textContent=msg;
  cfAction=fn;showScreen('confirmModal')}
 $('cfYes').onclick=function(){hideScreens();if(cfAction)cfAction()};
 $('cfNo').onclick=function(){showScreen('settingsMenu')};
 $('setReset').onclick=function(){confirmDlg('Reset progress?','Gold, level, towers, badges and loadout will be reset.',
  function(){Save.reset();toast('Progress reset');refreshMenu();settingsReturn='mainMenu';showScreen('mainMenu')})};