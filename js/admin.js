"use strict";
/* ============================================================
   DEVELOPER COMMAND BAR
   Ships in every build and is gated at runtime by the staff role the cloud
   worker assigns (the STAFF map in cloud/worker.js). Only `developer`
   accounts get it — testers do not, until that is decided otherwise.

   Open with the backtick key. Escape, the close button, clicking anywhere
   outside it, or pressing backtick again all shut it.

   Every command lives once in CMDS below. The runner, the search panel, the
   `help` listing and the tests all read that single table, so a command
   cannot be documented in one place and implemented in another.
   ============================================================ */

// ---- search ----
// Subsequence match, scored so a prefix beats a word start beats a scattered
// hit, and a run of adjacent characters beats the same letters spread out.
// Returns the matched indices so the panel can highlight exactly what typed.
function fuzzy(text,frag){
  const t=text.toLowerCase(),f=frag.toLowerCase();
  let score=0,ti=0;const at=[];
  for(let i=0;i<f.length;i++){
    const c=f[i];
    while(ti<t.length&&t[ti]!==c)ti++;
    if(ti===t.length)return null;
    if(ti===0)score+=30;
    else if(t[ti-1]==='_'||t[ti-1]===' ')score+=18;
    if(i&&at[i-1]===ti-1)score+=12;
    score+=Math.max(0,8-ti);
    at.push(ti);ti++}
  return{score:score,at:at}}
const ESCAPES={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'};
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return ESCAPES[c]})}
function mark(text,at){
  if(!at||!at.length)return esc(text);
  const set=new Set(at);let h='';
  for(let i=0;i<text.length;i++)
    h+=(set.has(i)?'<i>':'')+esc(text[i])+(set.has(i)?'</i>':'');
  return h}

const CMDS=[
  {name:'help',args:'',desc:'list every command',
   run(){ADMIN.listCommands()}},
  {name:'cash',args:'<player> <amount>',desc:'set in-match cash',need:'match',
   example:'cash me 5000',
   argList(i){return i===1?ADMIN.playerNames():[]},
   run(p){
     if(!ADMIN.self(p[1]))return ADMIN.bad('cash','only your own client is reachable','cash me 5000');
     const n=Math.round(+p[2]);
     if(isNaN(n)||n<0)return ADMIN.bad('cash','amount must be a whole number','cash me 5000');
     G.cash=n;toast('Cash set to $'+fmt(n))}},
  {name:'spawn',args:'<name> <amount> <interval>',desc:'spawn enemies, or friendly_ ones',
   need:'match',example:'spawn walker 10 0.5',
   argList(i){return i===1?ADMIN.enemyNames():[]},
   run(p){ADMIN.cmdSpawn(p)}},
  {name:'grant',args:'<player> <stat> <amount>',desc:'gold, exp, level or a badge — saved permanently',
   example:'grant me gold 5000',
   argList(i){return i===1?ADMIN.playerNames():i===2?ADMIN.grantNames():[]},
   run(p){
     if(!ADMIN.self(p[1]))
       return ADMIN.bad('grant','there is no way to write another account','grant me gold 5000');
     const stat=(p[2]||'').toLowerCase();
     if(!stat)return ADMIN.bad('grant','which stat?','grant me gold 5000');
     const badge=BADGES.find(b=>b.id===stat||b.name.toLowerCase().replace(/ /g,'_')===stat);
     if(badge){
       if(p[3]!==undefined)return ADMIN.bad('grant','a badge takes no amount','grant me millionaire');
       // grantBadge already toasts on success and returns false when held.
       if(!grantBadge(badge.id))toast('You already hold '+badge.name,'bad');
       return}
     const n=Math.round(+p[3]);
     if(isNaN(n))return ADMIN.bad('grant','amount must be a number','grant me gold 5000');
     if(stat==='gold'){SV.gold=Math.max(0,SV.gold+n);Save.save();
       ADMIN.refreshMenus();toast('Gold '+(n<0?'-':'+')+fmt(Math.abs(n))+' → '+fmt(SV.gold));return}
     if(stat==='exp'){SV.xp=Math.max(0,SV.xp+n);Save.save();
       ADMIN.refreshMenus();toast('XP '+(n<0?'-':'+')+fmt(Math.abs(n))+' → level '+levelInfo(SV.xp).lvl);return}
     if(stat==='level'){
       const to=clamp(levelInfo(SV.xp).lvl+n,1,60);
       SV.xp=Math.max(0,xpForLevel(to));Save.save();
       ADMIN.refreshMenus();toast('Level set to '+to);return}
     ADMIN.bad('grant','unknown stat: '+stat,'grant me gold 5000')}},
  {name:'wave',args:'<amount>',desc:'jump to a wave',need:'match',
   example:'wave 25',
   run(p){
     const n=Math.round(+p[1]);
     if(isNaN(n)||n<1)return ADMIN.bad('wave','wave number must be at least 1','wave 25');
     ADMIN.setWave(n)}},
  {name:'game_speed',args:'<amount>',desc:'set a custom speed; a speed button overrides it',need:'match',
   example:'game_speed 8',
   run(p){
     const n=+p[1];
     if(isNaN(n)||n<=0||n>50)return ADMIN.bad('game_speed','a multiplier from 0.1 to 50','game_speed 8');
     G.speed=n;ADMIN.customSpeed=n;
     for(const o of spdBtns)o.classList.remove('on');
     toast('Game speed '+n+'x — click a speed button to take over')}},
  {name:'tower_boost',args:'<boost> <multiplier> <duration>',
   desc:'boost every tower now and later; omit duration to last the match',need:'match',
   example:'tower_boost damage 2 30',
   argList(i){return i===1?ADMIN.boostNames():[]},
   run(p){
     const kind=BOOST_KINDS[(p[1]||'').toLowerCase()];
     if(!kind)return ADMIN.bad('tower_boost','boost must be damage, firerate or health',
       'tower_boost damage 2 30');
     const mul=+p[2];
     if(isNaN(mul)||mul<=0||mul>1000)return ADMIN.bad('tower_boost','a multiplier above 0',
       'tower_boost damage 2 30');
     let dur=null;
     if(p[3]!==undefined&&p[3]!==''){
       dur=+p[3];
       if(isNaN(dur)||dur<=0)return ADMIN.bad('tower_boost',
         'seconds above 0, or leave it out to last the match','tower_boost damage 2 30')}
     G.boosts[kind]={mul:mul,t:dur};
     revalidateTowers();
     const label=(p[1]||'').toLowerCase();
     toast('All towers: '+label+' x'+mul+(dur?' for '+dur+'s':' until the match ends'))}},
  {name:'give_tower',args:'<player> <tower_name>',
   desc:'add an extra loadout slot for this match only',need:'match',
   example:'give_tower me voidtraitor',
   argList(i){return i===1?ADMIN.playerNames():i===2?ADMIN.towerNames():[]},
   run(p){
     if(!ADMIN.self(p[1]))
       return ADMIN.bad('give_tower','only your own loadout is reachable','give_tower me voidtraitor');
     const key=ADMIN.towerMap[(p[2]||'').toLowerCase()];
     if(!key)return ADMIN.bad('give_tower','unknown tower','give_tower me voidtraitor');
     // One slot per call, duplicates included — that is what makes a stack of
     // Void Traitors possible even though only one can ever be in the shop.
     ADMIN.extras.push(key);
     buildTowerbar();
     toast(TOWERS[key].name+' added for this match only')}},
  {name:'bless',args:'<player> <gold|exp|tower> <amount|tower_name>',
   desc:'send a permanent gift across a live match — the receiver earns Blessed',
   need:'match',example:'bless opponent gold 5000',
   argList(i){
     if(i===1)return ADMIN.playerNames();
     if(i===2)return ADMIN.giftNames();
     // The third slot is a tower name only when the gift IS a tower; gold and
     // exp take a number, and there is no sensible pool for those.
     const w=(ADMIN.el.input.value.toLowerCase().split(/\s+/)[2]||'');
     return w==='tower'?ADMIN.towerNames():[]},
   run(p){ADMIN.cmdBless(p)}}];
const BOOST_KINDS={damage:'dmg',dmg:'dmg',firerate:'rate',rate:'rate',attackspeed:'rate',
  health:'hp',hp:'hp'};

const ADMIN={
  visible:false,
  friendlies:[],spawnQueue:[],
  extras:[],customSpeed:null,
  lastT:0,live:false,
  nameMap:{},towerMap:{},
  el:{},items:[],cursor:-1,

  // ---- role gate: developer accounts only ----
  canUse(){return(window.Cloud&&Cloud.role)==='developer'},

  init(){
    for(const k in ENEMIES)this.nameMap[ENEMIES[k].name.toLowerCase().replace(/ /g,'_')]=k;
    for(const k in BIGS)this.nameMap[BIGS[k].name.toLowerCase().replace(/ /g,'_')]=k;
    for(const k in TOWERS){
      this.towerMap[k]=k;
      this.towerMap[TOWERS[k].name.toLowerCase().replace(/ /g,'_')]=k}
    const q=id=>document.getElementById(id);
    this.el={bar:q('cmdBar'),input:q('cmdInput'),sug:q('cmdSug'),role:q('cmdRole'),
      hint:q('cmdHint'),close:q('cmdClose')};
    if(!this.el.bar)return;
    const inp=this.el.input;
    inp.addEventListener('keydown',function(e){
      e.stopPropagation();
      if(e.key==='Escape'){ADMIN.close();return}
      if(e.key==='`'){e.preventDefault();ADMIN.close();return}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();ADMIN.move(e.key==='ArrowDown'?1:-1);return}
      if(e.key==='Tab'){e.preventDefault();ADMIN.accept(ADMIN.cursor);return}
      if(e.key==='Enter'){
        e.preventDefault();
        // Enter accepts a highlighted suggestion while the line is still a
        // fragment, and runs the command once it is a real one.
        if(ADMIN.cursor>=0&&!ADMIN.runnable(inp.value))ADMIN.accept(ADMIN.cursor);
        else ADMIN.run(inp.value)}});
    inp.addEventListener('input',function(){ADMIN.cursor=-1;ADMIN.suggest()});
    this.el.close.onclick=()=>ADMIN.close();
    // Clicking away closes it. Captured on the way down so a click that lands
    // on the battlefield never also places a tower behind the bar.
    addEventListener('pointerdown',function(e){
      if(!ADMIN.visible)return;
      if(ADMIN.el.bar.contains(e.target))return;
      ADMIN.close()},true);
  },

  // ---- open / close ----
  toggle(){this.visible?this.close():this.open()},
  open(){
    if(!this.canUse())return;          // no developer role: the bar never appears
    if(this.visible)return;
    this.visible=true;
    this.el.bar.classList.add('show');
    this.el.input.value='';this.cursor=-1;
    this.updateRole();this.suggest();
    this.el.input.focus()},
  close(){
    if(!this.visible)return;
    this.visible=false;this.cursor=-1;
    this.el.bar.classList.remove('show');
    this.el.input.blur();
    this.el.input.value='';
    this.el.sug.classList.remove('open')},

  updateRole(){
    this.el.role.textContent='DEVELOPER';
    const b=[];
    if(this.extras.length)b.push(this.extras.length+' GIVEN');
    for(const k in G.boosts)b.push(k.toUpperCase()+' x'+G.boosts[k].mul);
    if(this.customSpeed)b.push('SPEED '+this.customSpeed+'x');
    this.el.hint.textContent=b.length?b.join('  ·  '):'';
    this.el.hint.classList.toggle('on',b.length>0)},
  // Give-tower slots and boosts belong to one match, so both are wiped on the
  // edge into and out of a live game. Nothing here touches SV.
  resetMatch(){
    this.friendlies=[];this.spawnQueue=[];this.extras=[];this.customSpeed=null;
    G.boosts={};
    if(this.visible)this.updateRole()},

  // ---- per-frame: spawn pacing and boost expiry ----
  tick(){
    if(!this.el.bar)return;
    if(this.visible&&!this.canUse())this.close();
    const now=G.state==='playing'||G.state==='paused';
    if(now!==this.live){this.live=now;this.resetMatch();if(now)this.updateRole()}
    const dt=Math.min(.1,Math.max(0,G.time-this.lastT));this.lastT=G.time;
    if(G.state!=='playing')return;
    const sdt=dt*G.speed;
    for(let i=this.spawnQueue.length-1;i>=0;i--){const s=this.spawnQueue[i];
      s.t+=sdt;
      while(s.count>0&&s.t>=s.interval){s.t-=s.interval;this.spawnOne(s.friendly,s.type);s.count--}
      if(s.count<=0)this.spawnQueue.splice(i,1)}
    this.updFriendlies(sdt);
    this.updBoosts(sdt)},
  updBoosts(sdt){
    let dirty=false,done=[];
    for(const k in G.boosts){const b=G.boosts[k];
      if(b.t===null)continue;
      b.t-=sdt;
      if(b.t<=0){delete G.boosts[k];dirty=true;done.push(k)}}
    if(!dirty)return;
    revalidateTowers();
    this.updateRole();
    toast('Boost ended: '+done.join(', '),'bad')},

  // ---- search ----
  // The panel is the search surface for everything: command names until the
  // first word is complete, then the arguments that command accepts.
  suggest(){
    const raw=this.el.input.value,low=raw.toLowerCase();
    const sp=low.indexOf(' ');
    let items=[];
    if(sp<0){
      const q=low.trim();
      items=CMDS.map(function(c){
        const f=q?fuzzy(c.name,q):{score:0,at:[]};
        return f&&{name:c.name,args:c.args,desc:c.desc,at:f.at,score:f.score,
          scope:c.need?'match':'global'}})
        .filter(Boolean).sort(function(a,b){return b.score-a.score});
    }else{
      // Which argument the caret is on. "spawn " and "spawn wal" are both 1;
      // "spawn walker " is 2. The trailing empty token from split is what makes
      // a freshly-typed space land on the next argument.
      const cmd=CMDS.find(function(c){return c.name===low.slice(0,sp)});
      const last=low.lastIndexOf(' ');
      const frag=low.slice(last+1).trim();
      const idx=low.split(/\s+/).length-1;
      if(cmd&&cmd.argList){
        const head=raw.slice(0,last+1);
        items=cmd.argList(idx).map(function(a){
          const f=frag?fuzzy(a.name,frag):{score:0,at:[]};
          return f&&{name:a.name,desc:a.desc,lit:head+a.name,at:f.at,score:f.score,scope:'arg'}})
          .filter(Boolean).sort(function(a,b){return b.score-a.score})
          // Only a real filter needs a tight cap; with nothing typed yet the
          // whole pool is the answer, so truncating it just hides options.
          .slice(0,frag?12:40);
      }
    }
    this.renderList(items)},
  renderList(items){
    this.items=items;
    const box=this.el.sug;
    if(!items.length){
      // Say so rather than going blank: an empty panel looks exactly like a
      // broken one, and there is no other feedback while typing a command.
      box.innerHTML='<div class="cmdNone">no command matches that</div>';
      box.classList.add('open');return}
    box.innerHTML='';
    items.forEach((it,i)=>{
      const d=document.createElement('div');
      d.className='cmdItem'+(i===this.cursor?' cur':'');
      d.setAttribute('role','option');
      d.innerHTML='<span class="cn">'+mark(it.name,it.at)+'</span>'+
        (it.args?'<span class="ca">'+esc(it.args)+'</span>':'')+
        (it.desc?'<span class="cd">'+esc(it.desc)+'</span>':'')+
        (it.scope?'<span class="cs '+it.scope+'">'+it.scope+'</span>':'');
      d.onmousedown=function(e){e.preventDefault();ADMIN.accept(i)};
      box.appendChild(d)});
    box.classList.add('open')},
  move(dir){
    if(!this.items.length)return;
    this.cursor=(this.cursor+dir+this.items.length)%this.items.length;
    this.renderList(this.items);
    const cur=this.el.sug.querySelector('.cur');
    if(cur)cur.scrollIntoView({block:'nearest'})},
  accept(i){
    const it=this.items[i];
    if(!it)return;
    this.el.input.value=(it.lit||it.name)+' ';
    this.cursor=-1;
    this.el.input.focus();
    this.suggest()},
  runnable(str){
    const w=str.trim().toLowerCase().split(/\s+/)[0];
    return CMDS.some(function(c){return c.name===w})},
  // `help` shows the whole table, still filterable from the search box.
  listCommands(){
    this.renderList(CMDS.map(function(c){
      return{name:c.name,args:c.args,desc:c.desc,at:[],scope:c.need?'match':'global'}}));
    this.el.input.focus()},

  // ---- argument pools ----
  playerNames(){
    const me=(window.Cloud&&Cloud.user)||'you';
    const out=[{name:'me',desc:'the signed-in account: '+me}];
    const lob=(typeof MP!=='undefined'&&MP.lob)?MP.lob:null;
    const other=lob&&lob.players&&lob.players.find(p=>p.user!==me);
    if(other)out.push({name:other.user,desc:'your opponent — only bless can reach them'});
    return out},
  enemyNames(){
    const out=[];
    for(const n in this.nameMap)
      out.push({name:n,desc:(BIGS[this.nameMap[n]]?'boss: ':'enemy: ')+
        (ENEMIES[this.nameMap[n]]||BIGS[this.nameMap[n]]).name});
    for(const n in this.nameMap)out.push({name:'friendly_'+n,desc:'friendly spawn'});
    return out},
  towerNames(){
    const out=[];
    for(const k in TOWERS)
      out.push({name:k,desc:TOWERS[k].name+(TOWERS[k].adminOnly?' — admin only':'')});
    return out},
  boostNames(){
    return [{name:'damage',desc:'multiplies every tower\'s damage'},
      {name:'firerate',desc:'multiplies every tower\'s attack speed'},
      {name:'health',desc:'multiplies every tower\'s maximum HP'}]},
  grantNames(){
    const out=[{name:'gold',desc:'spendable shop gold'},{name:'exp',desc:'account experience'},
      {name:'level',desc:'levels added (derived from exp)'}];
    for(const b of BADGES)out.push({name:b.id,desc:'badge: '+b.name});
    return out},
  giftNames(){
    return [{name:'gold',desc:'permanent account gold — earns Blessed'},
      {name:'exp',desc:'permanent account experience'},
      {name:'tower',desc:'permanently unlock a tower from the roster'}]},

  // ---- targeting ----
  // There is no server-side write to another account and the match relay only
  // spans the two players in a live game, so anything but your own name is
  // refused outright rather than quietly applied to the wrong person.
  self(name){
    if(!name)return false;
    const v=name.toLowerCase();
    if(v==='me'||v==='self'||v==='my')return true;
    const me=(window.Cloud&&Cloud.user)||'';
    return !!me&&v===me.toLowerCase()},
  // `bless` is the one command addressed to somebody else. It resolves to an
  // account name in THIS match — the worker re-checks that on the way through,
  // so a typed name can never reach a stranger's client.
  blessTarget(name){
    const me=(window.Cloud&&Cloud.user)||'';
    if(!name||this.self(name))return me;
    const lob=(typeof MP!=='undefined'&&MP.lob)?MP.lob:null;
    const p=lob&&lob.players&&lob.players.find(x=>String(x.user).toLowerCase()===name);
    return p?p.user:''},
  bad(cmd,why,example){
    toast(cmd+': '+why+' — e.g. '+example,'bad');return false},
  // A grant changes numbers several menus display at once, so refresh whatever
  // happens to be open rather than leaving stale gold in the header.
  refreshMenus(){
    if($('shopMenu').classList.contains('show'))buildShop();
    if($('invMenu').classList.contains('show'))buildInv();
    if($('badgesMenu').classList.contains('show'))buildBadges();
    if($('mainMenu').classList.contains('show'))refreshMenu()},

  // ---- dispatch ----
  // Commands receive the WHOLE split line, so p[0] is the command name and the
  // first argument is p[1] — which is what every run() below is written against.
  run(str){
    str=str.trim();if(!str)return;
    const p=str.split(/\s+/);
    const c=p[0].toLowerCase();
    const cmd=CMDS.find(function(x){return x.name===c});
    if(!cmd){toast('Unknown command: '+c+' — type help','bad');return}
    if(cmd.need==='match'&&!this.live){
      toast(c+' needs a live match — it does nothing from the menus','bad');return}
    cmd.run(p)},

  // ---- gifting ----
  // The giver never writes another account. A gift to yourself lands straight
  // in your own save; a gift to the other player is posted to the worker, which
  // hands it to that client on its next poll and lets IT edit its own numbers.
  cmdBless(p){
    const to=ADMIN.blessTarget((p[1]||'').toLowerCase());
    if(!to)return ADMIN.bad('bless','nobody by that name is in this match','bless me gold 5000');
    const what=(p[2]||'').toLowerCase();
    let gift=null;
    if(what==='tower'){
      const key=ADMIN.towerMap[(p[3]||'').toLowerCase()];
      if(!key)return ADMIN.bad('bless','unknown tower','bless me tower ranger');
      gift={what:what,key:key}}
    else if(what==='gold'||what==='exp'){
      const n=Math.round(+p[3]);
      if(isNaN(n)||n<=0)return ADMIN.bad('bless','an amount above 0','bless me gold 5000');
      gift={what:what,n:n}}
    else return ADMIN.bad('bless','a gift is gold, exp or tower','bless me gold 5000');
    const me=(window.Cloud&&Cloud.user)||'';
    if(to===me){
      if(!applyGift(gift))return ADMIN.bad('bless','nothing to give','bless me gold 5000');
      // A developer blessing themselves is a grant, not a blessing: the badge
      // is about being on the receiving end of somebody else's generosity.
      toast('Gift applied: '+(gift.what==='tower'?TOWERS[gift.key].name:gift.n+' '+gift.what));
      this.refreshMenus();return}
    MP.reportCmd('bless',Object.assign({to:to},gift));
    toast('Gift sent to '+to+' — '+
      (gift.what==='tower'?TOWERS[gift.key].name:fmt(gift.n)+' '+gift.what))},

  // ---- spawn ----
  cmdSpawn(p){
    let name=(p[1]||'').toLowerCase();
    if(!name){toast('usage: spawn <name> <amount> <interval>','bad');return}
    const friendly=name.indexOf('friendly_')===0;
    if(friendly)name=name.slice(9);
    const key=this.nameMap[name];
    if(!key){toast('Unknown enemy: '+name,'bad');return}
    const count=clamp(Math.round(+p[2])||1,1,500);
    const interval=Math.max(0,+p[3]||0);
    this.doSpawn(friendly,key,count,interval,(friendly?'friendly_':'')+name);
    this.share('spawn',{name:key,friendly:friendly?1:0,count:count,interval:interval})},
  // Runs one spawn. Split out from cmdSpawn because the two callers arrive with
  // DIFFERENT strings: the command bar resolves the typed NAME to a config key,
  // while a command replayed from the other client already carries that key.
  // Sharing stays out of here so a replay cannot echo back forever.
  doSpawn(friendly,key,count,interval,label){
    count=clamp(Math.round(+count)||1,1,500);
    interval=Math.max(0,+interval||0);
    label=label||(friendly?'friendly_':'')+key;
    if(interval>0){
      this.spawnQueue.push({friendly:friendly,type:key,count:count,interval:interval,t:0});
      toast('Spawning '+count+' '+label+' every '+interval+'s')}
    else{for(let i=0;i<count;i++)this.spawnOne(friendly,key);
      toast('Spawned '+count+' '+label)}},
  share(c,args){
    if(typeof MP!=='undefined'&&MP.inMatch)MP.reportCmd(c,args)},
  spawnOne(friendly,key){
    if(friendly)this.spawnFriendly(key);
    else if(BIGS[key])spawnBig(key);
    else spawnEnemy(key,0)},
  spawnFriendly(key){
    const c=BIGS[key]||ENEMIES[key];if(!c)return;
    const f={cfg:c,hp:Math.ceil((c.hp+(c.shield||0))*G.mode.hpMul),maxHp:0,
      d:PATH.total-.1,off:rnd(-.2,.2),anim:rnd(10),flash:0,
      slowT:0,slowMul:1,slowBossMul:1,slowCorrupt:false,
      corruptT:0,corruptDps:0,corruptTick:0,poisons:[],
      dead:false,px:0,py:0,sx:0,sy:0,dirx:-1,diry:0};
    f.maxHp=f.hp;this.setFPos(f);this.friendlies.push(f);
    const m=worldToMap(BASE_PT.x,BASE_PT.y);
    burst(m.x,m.y-20,'#7cff5a',8,50,.5,3)},
  setFPos(f){
    const s=samplePath(PATH,f.d);
    f.px=s.x-s.dy*f.off;f.py=s.y+s.dx*f.off;
    f.dirx=-s.dx;f.diry=-s.dy;
    const m=worldToMap(f.px,f.py);f.sx=m.x;f.sy=m.y},
  updFriendlies(dt){
    for(let i=this.friendlies.length-1;i>=0;i--){const f=this.friendlies[i];
      if(f.dead){this.friendlies.splice(i,1);continue}
      if(f.flash>0)f.flash-=dt;
      f.anim+=dt*(1+f.cfg.spd*.4);
      f.d-=f.cfg.spd*G.mode.spdMul*dt;
      if(f.d<=0){
        const m=worldToMap(SPAWN_PT.x,SPAWN_PT.y);
        burst(m.x,m.y-8,'#7cff5a',10,50,.5,3);
        this.friendlies.splice(i,1);continue}
      this.setFPos(f);
      for(const e of enemies){
        if(e.dead)continue;
        if(dist2(f.px,f.py,e.px,e.py)<.36){this.clash(f,e);break}}}},
  clash(f,e){
    const eTot=e.hp+Math.max(0,e.shield);
    let rem=f.hp;
    if(e.shield>0){const s=Math.min(e.shield,rem);e.shield-=s;rem-=s;e.flash=.15}
    if(rem>0){e.hp-=rem;e.flash=.15}
    f.hp-=eTot;
    const mx=(f.sx+e.sx)/2,my=(f.sy+e.sy)/2;
    burst(mx,my-10,'#ffe9a0',8,50,.4,3);
    if(e.hp<=0)killEnemy(e);
    if(f.hp<=0){f.dead=true;
      burst(f.sx,f.sy-8,'#7cff5a',10,50,.5,3);
      ftext(f.sx,f.sy-f.cfg.r-16,'FALLEN','#7cff5a')}},

  // ---- rendering ----
  // Draws the friendly spawns on the battlefield. Distinct from renderList(),
  // which paints the command bar's suggestion panel.
  render(g){
    for(const f of this.friendlies){
      if(f.dead)continue;
      g.save();g.translate(f.sx,f.sy);
      g.strokeStyle='rgba(124,255,90,.7)';g.lineWidth=1.5;
      g.beginPath();g.ellipse(0,2,f.cfg.r*.9,f.cfg.r*.45,0,0,Math.PI*2);g.stroke();
      if(f.flash>0){g.globalAlpha=.45;g.fillStyle='#fff';
        g.fillRect(-f.cfg.r,-f.cfg.r-8,f.cfg.r*2,f.cfg.r+8);g.globalAlpha=1}
      drawEnemyBody(g,f,1);
      // Friendly bars are always up: they exist to be watched, and the enemy
      // rule of "only once damaged" hid the one number a test spawn is for.
      const w=Math.max(18,f.cfg.r*2),hpr=clamp(f.hp/f.maxHp,0,1);
      g.fillStyle='#000a';g.fillRect(-w/2-1,-f.cfg.r-9,w+2,5);
      g.fillStyle='#7cff5a';g.fillRect(-w/2,-f.cfg.r-8,w*hpr,3);
      g.restore()}},
  // Hover readout for friendly spawns, mirroring drawEnemyTip so the two read
  // alike. Runs outside the world transform, hence the mapToScreen.
  tip(cw,ch){
    if(!this.friendlies.length||!mouseClient||G.placeType)return;
    if(G.state!=='playing'&&G.state!=='paused')return;
    const mp=screenToMap(mouseClient.x,mouseClient.y);
    let best=null,bd=26*26;
    for(const f of this.friendlies){
      if(f.dead)continue;
      const d=dist2(mp.x,mp.y,f.sx,f.sy-8);
      if(d<bd){bd=d;best=f}}
    if(!best)return;
    const sp=mapToScreen(best.sx,best.sy-14);
    const res=best.cfg.res;
    const hasRes=!!(res&&Object.keys(res).length);
    const w=190;let h=66;if(hasRes)h+=12;
    let px=clamp(sp.x-w/2,8,cw-w-8),py=sp.y-h-14;
    if(py<110)py=sp.y+16;
    ctx.fillStyle='rgba(20,16,10,.93)';ctx.fillRect(px,py,w,h);
    ctx.strokeStyle='#3d6a2e';ctx.lineWidth=2;ctx.strokeRect(px,py,w,h);
    ctx.textAlign='left';ctx.font="12px 'Silkscreen','Pixelify Sans',monospace";
    ctx.fillStyle='#8ce89a';
    ctx.fillText('FRIENDLY  '+best.cfg.name,px+8,py+15);
    const bw=w-16,hpr=clamp(best.hp/best.maxHp,0,1);
    ctx.fillStyle='#0d0b08';ctx.fillRect(px+8,py+21,bw,10);
    ctx.fillStyle='#7cff5a';ctx.fillRect(px+8,py+21,bw*hpr,10);
    ctx.textAlign='center';ctx.font="bold 11px monospace";ctx.fillStyle='#fff';
    ctx.fillText(Math.ceil(best.hp)+'/'+best.maxHp+' HP',px+w/2,py+30);
    let ly=46;
    ctx.textAlign='left';ctx.font="12px 'Segoe UI',Verdana,sans-serif";ctx.fillStyle='#c9bca0';
    ctx.fillText('Speed  '+best.cfg.spd.toFixed(2)+' m/s',px+8,py+ly);ly+=12;
    // A friendly's shield was folded into its HP when it spawned, so there is no
    // separate pool to report — resistances are the next useful line, same as
    // the enemy tooltip.
    ctx.fillText('Walks to the spawn point',px+8,py+ly);ly+=12;
    if(hasRes){
      const parts=[];
      for(const k in res)parts.push(k.charAt(0).toUpperCase()+k.slice(1)+' '+Math.round(res[k]*100)+'%');
      ctx.fillStyle='#f0a494';
      ctx.fillText('Resists  '+parts.join(', '),px+8,py+ly)}},

  // ---- wave jump ----
  setWave(w){
    const max=(G.mode.waves===Infinity)?ENDLESS_LAST_WAVE:G.mode.waves;
    w=clamp(Math.round(w)||1,1,max);
    WaveMgr.queue=[];WaveMgr.active=false;WaveMgr.n=w-1;WaveMgr.cd=1;
    toast('Wave set to '+w)}
};
ADMIN.init();
window.ADMIN=ADMIN;

// ` opens the bar anywhere — menus and matches alike. Commands that need a
// live match refuse on their own, which is what makes the difference visible
// instead of a silent no-op.
addEventListener('keydown',function(e){
  if(e.key!=='`')return;
  if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return;
  if(document.getElementById('cloudGate').classList.contains('show'))return;
  e.preventDefault();
  ADMIN.toggle()});
