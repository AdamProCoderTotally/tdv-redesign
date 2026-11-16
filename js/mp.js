"use strict";
// ============================================================
//  mp.js — multiplayer client: menu flow, lobby (host powers),
//  and the PVP match bridge (invader hotbar / defender TD).
//  Talks to cloud/worker.js /api/mp/* endpoints.
// ============================================================

// Local dev: the game devserver (8321) pairs with the worker shim on 8322
// (`npm run mp`). Production + desktop go straight to the cloud worker.
const MP_URL=(location.protocol==='http:'&&/^(localhost|127\.0\.0\.1)$/.test(location.hostname))
  ?'http://localhost:8322':CLOUD_URL;

// Staff name icon — 'developer' or 'tester' (from cloud/worker.js's STAFF
// list, server-authoritative). Shown next to usernames in lobbies and matches.
function staffChip(role){
  if(role==='developer')return '<span class="stf dev" title="Developer">&#9881; DEV</span>';
  if(role==='tester')return '<span class="stf tst" title="Tester">&#9873; TESTER</span>';
  return ''}

const MP={
  active:false,          // in a lobby or a match
  inMatch:false,
  lob:null,              // last lobby view from the server
  game:null,             // last game view from the server
  role:null,             // 'invader' | 'defender'
  cursor:0,              // next spawn index this client has not handled
  cmdCursor:0,           // last staff-command index this client has handled
  offset:0,              // serverNow - clientNow (seconds)
  enemies:{},            // enemy shop table from the worker
  stateT:0, gameT:0, hudT:0,
  defPaid:0,             // defender: gold the mirrored income drip has already paid
  reported:false,
  // Spawns are SCHEDULED server-side (each queue item carries `at`), but a
  // client that has been polled slowly — a throttled tab, a lag spike, a
  // late joiner whose cursor starts at 0 — receives a whole backlog of them in
  // one response. Releasing that backlog the moment it lands is what makes a
  // big queue appear to spawn "all at once". Items are buffered here and then
  // drained on their own clock instead.
  pending:[],
  lastSpawnT:0,
  SPAWN_GAP:.15,         // floor between two spawns, so a backlog trickles

  // mirrors cloud/worker.js's MP tuning — MUST match it or the invader's HUD
  // will disagree with the gold the server actually allows them to spend.
  START_GOLD:200,
  INC_BASE:100, INC_PERIOD:7, INC_MINUTE:60, INC_STEP:100,

  // How often the client re-reads match state. This is now the ENTIRE latency
  // budget: Durable Object reads are strongly consistent, so the only delay
  // left between one player acting and the other seeing it is how long we wait
  // to ask. (The old 2s default predates the move off Cloudflare KV, where a
  // faster poll would only have re-read replicated data sooner.)
  //
  // Cost: each poll is 1 Worker request + 1 Durable Object request, and DO
  // requests share the Workers Free 100,000/day bucket with everything else.
  // Both players polling every POLL_S costs 4/POLL_S requests/sec — at .5s
  // that's ~4,800 per 10-minute match, roughly 20 matches/day on free. Raise
  // this toward 2 if you start hitting quota; drop to .3 while playtesting.
  POLL_S:.5,

  now(){return Date.now()/1000+this.offset},
  isHost(){return !!(this.lob&&this.lob.host===Cloud.user)},

  // gold derivation, mirrors the worker tick for tick (start + every tick - spent).
  // Summed rather than `ticks * rate`, because income steps up mid-match: one
  // flat multiply would mis-pay the moment a minute boundary is crossed.
  //
  // The server owns gold — this exists only so the invader's HUD moves between
  // polls. tickPay() mirrors the worker's, so the number on screen can never
  // drift from the arithmetic the server actually charges purchases against.
  tickPay(k){return this.INC_BASE+Math.floor(k*this.INC_PERIOD/this.INC_MINUTE)*this.INC_STEP},

  ticks(){const g=this.game;if(!g)return 0;
    return Math.max(0,Math.floor(Math.max(0,this.now()-g.startedAt)/this.INC_PERIOD))},

  gold(){const g=this.game;if(!g||g.role!=='invader')return 0;
    let total=this.START_GOLD;const n=this.ticks();
    for(let k=0;k<n;k++)total+=this.tickPay(k);
    return Math.max(0,total-g.spent)},

  // the rate the NEXT tick will pay — what the HUD quotes as "+$X / 7s"
  incomeRate(){const g=this.game;if(!g||g.role!=='invader')return 0;
    return this.tickPay(this.ticks())},

  // The drip owed after n ticks, with no starting stake on top. The invader's
  // deriveGold() adds START_GOLD because they begin the match at zero; the
  // defender begins with a normal match's cash and only needs the money that
  // comes after, so both sides earn the same per second from the same clock.
  earned(n){let total=0;for(let k=0;k<n;k++)total+=this.tickPay(k);return total},

  serverElapsed(){const g=this.game;return g?Math.max(0,this.now()-g.startedAt):0},

  api(path,body){
    const payload={token:Cloud.token};
    // Attaching our own lobby code lets the worker go worker -> Match in a
    // single Durable Object hop, instead of asking the Directory index which
    // lobby we are in first. That halves the request cost of every poll, which
    // matters on the free plan (DO requests share the Workers 100k/day bucket).
    //
    // create/join are excluded: there the `code` in the body is the TARGET
    // lobby we are trying to reach, not the one we belong to, and both always
    // route through Directory anyway (they have to touch two lobbies at once).
    if(this.lob&&this.lob.code&&path!=='create'&&path!=='join'&&path!=='list')
      payload.code=this.lob.code;
    return cloudApi('/api/mp/'+path,Object.assign(payload,body||{}))
      .catch(function(e){
        if(/sign in/i.test(e.message)){MP.abort();Cloud.sessionEnd(e.message)}
        throw e})},

  // ---------- lifecycle ----------
  abort(){this.active=false;this.inMatch=false;this.lob=null;this.game=null;
    this.role=null;this.cursor=0;this.cmdCursor=0;this.pending.length=0;this.lastSpawnT=0;
    this.reported=false;G.mp=null;
    const vo=$('voteOverlay');if(vo)vo.classList.remove('show');
    const bar=$('mpBar');if(bar)bar.style.display='none';
    const mr=$('mpRoster');if(mr)mr.style.display='none';
    // leave no match HUD behind if we abort out of a live game
    if(G.state==='playing'){
      const h=$('hudTop');if(h)h.style.display='none';
      const tb=$('towerbar');if(tb)tb.style.display='none';
      const mm=$('mmWrap');if(mm)mm.style.display='none';
      const bb=$('bossbar');if(bb)bb.style.display='none'}
    const ctx=$('mpCtx');if(ctx)ctx.classList.remove('open');
    if(G.state==='playing')resetBattlefield()},

  openMenu(){
    if(!Cloud.ready){toast('Sign in to play multiplayer','bad');return}
    if(window.TDVUpdate&&TDVUpdate.locked('mp')){
      toast('Update required to play multiplayer','bad');return}
    Sfx.init();Sfx.click();
    $('mpStatus').textContent='';$('mpJoinRow').classList.remove('open');
    showScreen('mpMenu');
    this.startRoomList()},

  // ---------- room browser ----------
  // The Directory serves a live list of open lobbies; the client re-polls
  // every 4s while the MP menu is on screen and filters by name locally.
  startRoomList(){
    this.refreshRooms();
    if(this._roomTimer)clearInterval(this._roomTimer);
    this._roomTimer=setInterval(()=>this.refreshRooms(),4000)},
  stopRoomList(){
    if(this._roomTimer){clearInterval(this._roomTimer);this._roomTimer=null}},
  refreshRooms(){
    if(!$('mpMenu').classList.contains('show')){this.stopRoomList();return}
    this.api('list',{}).then(r=>{
      this._rooms=(r&&r.rooms)||[];
      this.renderRooms()}).catch(()=>{})},
  renderRooms(){
    const el=$('roomList');if(!el)return;
    const q=($('roomSearch').value||'').trim().toLowerCase();
    const rooms=(this._rooms||[]).filter(r=>!q||r.name.toLowerCase().indexOf(q)>=0);
    el.innerHTML='';
    if(!rooms.length){
      el.innerHTML='<div class="roomEmpty">No open lobbies'+(q?' match that name':' yet')+
        ' — create one!</div>';return}
    for(const r of rooms){
      const row=document.createElement('div');
      row.className='roomRow';
      row.innerHTML='<span class="nm">'+String(r.name||'Unnamed room').replace(/</g,'&lt;')+'</span>'+
        '<span class="cnt">'+r.players+'/2</span>'+
        (r.hasPassword?'<span class="chipTag" title="Password required"><i class="icLock"></i>LOCKED</span>':'');
      row.onclick=()=>{Sfx.click();this.joinLobby(r.code)};
      el.appendChild(row)}},

  // ---------- menu flow ----------
  createLobby(mode,opts){
    if(mode==='coop'){toast('CO-OP is coming soon','bad');Sfx.click();return}
    Sfx.click();
    opts=opts||{};
    $('mpStatus').textContent='Creating lobby...';
    this.api('create',{mode:mode,name:opts.name,password:opts.password}).then(r=>{
      this.active=true;this.showLobby(r.lobby);
      $('mpStatus').textContent=''}).catch(e=>{$('mpStatus').textContent=e.message})},

  joinLobby(code,password){
    Sfx.click();
    code=String(code||'').trim().toUpperCase();
    if(!code){$('mpStatus').textContent='Enter a lobby code';return}
    $('mpStatus').textContent='Joining '+code+'...';
    this._pwCode=code;                        // remembered if a password is needed
    this.api('join',{code:code,password:password||''}).then(r=>{
      this.active=true;this.showLobby(r.lobby);
      $('pwPrompt').classList.remove('show');
      $('mpStatus').textContent=''}).catch(e=>{
      if(e&&e.needPassword){
        $('mpStatus').textContent='';
        $('pwRoom').textContent='Room: '+code;
        $('pwInput').value='';$('pwInput').focus();
        $('pwPrompt').classList.add('show');return}
      $('mpStatus').textContent=e.message})},

  // ---------- staff encounters ----------
  // The badge is for meeting the people who BUILD the game, so the worker's
  // `developer` flag is the only one that counts (a tester does not), the
  // account has to be somebody else's, and grantBadge stays quiet once the
  // badge is held — these run on every lobby repaint.
  metDeveloper(user,role){
    if(role!=='developer')return;
    if(!user||user===Cloud.user)return;
    grantBadge('meetgreet')},

  // The other half of the last match, for the result card. Staff shows as a
  // word rather than the lobby chip because the card's values are plain text.
  oppName(){
    const ps=(this.game&&this.game.players)||[];
    const o=ps.find(p=>p.user&&p.user!==Cloud.user);
    if(!o)return 'Unknown';
    return o.user+(o.staff==='developer'?' · developer':'')},

  // ---------- lobby ----------
  showLobby(lob){
    this.lob=lob;this.inMatch=false;
    this.stopRoomList();                      // in a lobby now — the browser is done
    $('pwPrompt').classList.remove('show');
    showScreen('mpLobby');
    this.renderLobby();
    this.stateT=0},

  renderLobby(){
    const lob=this.lob;if(!lob)return;
    $('mpCode').textContent=lob.code;
    // copy the code to the clipboard on click (feedback: the hint line flips)
    const hero=$('mpCodeBox'),hint=hero.querySelector('.copyHint');
    hero.onclick=function(){
      const done=()=>{hero.classList.add('copied');
        hint.innerHTML='&#10003; COPIED!';
        setTimeout(()=>{hero.classList.remove('copied');
          hint.innerHTML='&#128203; CLICK TO COPY'},900)};
      if(navigator.clipboard&&navigator.clipboard.writeText)
        navigator.clipboard.writeText(lob.code).then(done,done);
      else done()};
    $('mpCount').textContent=lob.players.length+'/2';
    $('mpLobbyStatus').textContent=lob.status==='playing'?'Match starting...':'';
    const host=this.isHost();
    $('mpStart').style.display=host?'':'none';
    const wrap=$('mpPlayers');wrap.innerHTML='';
    for(const p of lob.players){
      const row=document.createElement('div');
      const host=p.user===lob.host;
      this.metDeveloper(p.user,p.role);
      row.className='mpPlayer'+(host?' isHost':'');
      row.innerHTML=(host?'<span class="mpCrown">&#9819;</span><span class="mpHostTag">HOST</span>':'')+
        '<span class="nm">'+p.user.replace(/</g,'&lt;')+(p.user===Cloud.user?' <i>(you)</i>':'')+'</span>'+
        staffChip(p.role)+
        (p.seen>20?'<span class="mpAway">AFK</span>':'');
      if(host&&p.user!==Cloud.user&&lob.status==='lobby'){
        row.oncontextmenu=function(e){e.preventDefault();MP.openCtx(e,p.user)}}
      else row.oncontextmenu=function(e){e.preventDefault()};
      wrap.appendChild(row)}
    // guests get pulled into a match the host started
    if(lob.status==='playing'&&!this.inMatch){
      this.stateT=0;                       // poll fast, enter as soon as game data lands
      this.api('game',{cursor:this.cursor}).then(r=>{
        // Checked again on arrival, not just when the request left: the host's
        // own start path enters synchronously, so this reply can land a moment
        // later and reset the battlefield a second time.
        if(!this.inMatch&&r.game&&r.game.role)this.enterMatch(r.game)}).catch(()=>{})}},

  openCtx(e,user){
    const ctx=$('mpCtx');
    ctx.dataset.user=user;
    // #mpCtx sits in the zoomed layer, so both the cursor and the edge it must
    // stay clear of are read in that layer's pixels — the 150/90 are its own size
    ctx.style.left=Math.min(uiLocal(e.clientX),uiLocal(innerWidth)-150)+'px';
    ctx.style.top=Math.min(uiLocal(e.clientY),uiLocal(innerHeight)-90)+'px';
    ctx.classList.add('open');
    Sfx.click()},
  closeCtx(){const ctx=$('mpCtx');if(ctx)ctx.classList.remove('open')},
  ctxAction(a){
    const user=$('mpCtx').dataset.user;this.closeCtx();
    if(!user)return;
    this.api(a==='kick'?'kick':'host',{user:user})
      .then(r=>{if(r.lobby){this.lob=r.lobby;this.renderLobby();
        toast(a==='kick'?(user+' was kicked'):(user+' is now the host'))}})
      .catch(e=>toast(e.message,'bad'))},

  // ---------- leaving ----------
  // Leaving a live match FORFEITS it. The worker hands the win to the opponent
  // and returns OUR loser share in `ended`, so we pay that out and drop
  // straight back to the menu — the person who quit gets no loss card. The
  // opponent picks the same `ended` up from its next poll and gets the full
  // VICTORY screen through finishMatch().
  settleLeave(ended){
    if(ended&&typeof ended==='object'){
      const me=this.role,reward=(ended.rewards&&ended.rewards[me])||0;
      if(reward>0){SV.gold+=reward;SV.xp+=reward;Save.save();
        toast('+'+reward+' Gold & XP (forfeit)')}}
    this.abort();toMenu()},

  leaveNow(){
    this.api('leave',{}).then(r=>this.settleLeave(r.ended))
      .catch(e=>{this.abort();toMenu();
        if(e&&e.message&&!/sign in/i.test(e.message))toast(e.message,'bad')})},

  leaveLobby(){Sfx.click();this.leaveNow()},

  startMatch(){
    Sfx.click();
    $('mpLobbyStatus').textContent='Starting...';
    this.api('start',{}).then(r=>{
      this.showLobby(r.lobby);
      if(r.game)this.enterMatch(r.game)})
      .catch(e=>{$('mpLobbyStatus').textContent=e.message})},

  // ---------- match ----------
  // Both players + their staff icons, top-left during the match.
  renderRoster(){
    const el=$('mpRoster');if(!el)return;
    const g=this.game;if(!g||!g.players){el.style.display='none';return}
    let html='';
    for(const p of g.players){
      const me=p.user===Cloud.user;
      this.metDeveloper(p.user,p.staff);
      html+='<div class="mpRRow'+(me?' me':'')+'">'+
        '<span class="mpRDot '+(p.role||'')+'"></span>'+
        '<span class="mpRNm">'+String(p.user||'').replace(/</g,'&lt;')+(me?' (you)':'')+'</span>'+
        '<span class="mpRRole">'+(p.role==='invader'?'INVADER':'DEFEND')+'</span>'+
        staffChip(p.staff)+
      '</div>'}
    el.innerHTML=html;el.style.display='block'},

  enterMatch(view){
    this.game=view;this.inMatch=true;this.role=view.role;this.cursor=0;
    // The lobby bed belongs to the waiting room, not the battlefield.
    Music.stop();
    this.pending.length=0;this.lastSpawnT=0;this.farmT=0;this.defPaid=0;
    this.enemies=view.enemies||{};this.reported=false;
    this.offset=(view.startedAt+view.elapsed)-Date.now()/1000;
    G.mp=this;
    TDV_MAP.reset();
    enemies=[];towers=[];projs=[];firePatches.length=0;parts.length=0;
    WaveMgr.reset();
    G.mode=MODES.pvp;
    const defender=this.role==='defender';
    G.cash=defender?G.mode.startCash:0;lastCash=null;
    G.lives=G.maxLives=defender?G.mode.hp:999999;
    G.kills=0;G.sel=null;G.placeType=null;G.speed=1;G.leakFlash=0;G.shake=0;G.mpPaused=false;
    G.bossBanner=null;G.endT=0;G.endBlack=false;
    for(const o of spdBtns)o.classList.toggle('on',o.dataset.spd==='1');
    hideScreens();this.closeCtx();
    $('hudTop').style.display='flex';
    $('towerbar').style.display=defender?'flex':'none';
    $('mpBar').style.display=defender?'none':'flex';
    $('mmWrap').style.display='block';
    $('bossbar').style.display='none';
    $('sidepanel').classList.remove('show');
    $('skipWave').style.display='none';
    uptip.style.display='none';
    const c=worldToMap(BASE_PT.x,BASE_PT.y);cam.tx=cam.x=c.x;cam.ty=cam.y=c.y;cam.tz=cam.zoom=1.05;camClamp();
    G.state='playing';
    this.renderRoster();
    if(defender){buildTowerbar();updTowerbar()}
    else this.buildBar();
    const winMins=Math.round((view.winSecs||600)/60);
    if(defender)toast('PVP — survive '+winMins+' minutes and the base holds!');
    else toast('PVP — send enemies and crush the base before the clock runs out!');
    this.gameT=0},

  // invader hotbar
  buildBar(){
    const slots=$('mpSlots');slots.innerHTML='';
    const defs=Object.keys(this.enemies).map(k=>Object.assign({key:k},this.enemies[k]));
    defs.sort((a,b)=>a.cost-b.cost);
    for(const d of defs){
      const el=document.createElement('div');el.className='mpSlot';el.dataset.type=d.key;
      el.innerHTML='<canvas width="64" height="50"></canvas>'+
        '<span class="nm">'+((ENEMIES[d.key]&&ENEMIES[d.key].name)||d.key).replace(/</g,'&lt;')+'</span>'+
        '<span class="cost">$'+d.cost+'</span>'+
        '<span class="int">1 / '+d.int+'s</span>';
      el.title='Shift-click to send 5';
      el.onclick=function(e){MP.buy(this.dataset.type,e.shiftKey?5:1)};
      slots.appendChild(el);
      this.drawPreview(el.querySelector('canvas'),d.key)}
    this.refreshBar()},

  // render the actual enemy sprite into a hotbar slot, scaled to fit
  drawPreview(cv,type){
    const cfg=ENEMIES[type]||BIGS[type];
    const g=cv.getContext('2d');g.imageSmoothingEnabled=false;
    if(!cfg){g.fillStyle='#7e93a8';g.fillRect(28,20,8,8);return}
    const sc=Math.min(1.4,Math.max(.5,30/((cfg.r||10)*2.2)));
    g.save();g.translate(cv.width/2,cv.height-4);g.scale(sc,sc);
    try{drawEnemyBody(g,{cfg:cfg,anim:2,dirx:1,flash:0},1)}catch(e){}
    g.restore()},

  refreshBar(){
    if(this.role!=='invader')return;
    const gold=this.gold();
    $('mpGoldV').textContent='$'+fmt(gold);
    $('mpIncomeV').textContent='+$'+this.incomeRate()+' / 7s';
    $('mpQueueV').textContent=fmt(this.game.pendingCount||0)+' incoming';
    const poor=gold;
    for(const el of document.querySelectorAll('.mpSlot')){
      const d=this.enemies[el.dataset.type];
      el.classList.toggle('poor',!d||gold<d.cost)}},

  buy(type,count){
    Sfx.click();
    this.api('buy',{type:type,count:count}).then(r=>{
      this.applyGame(r.game);
      Sfx.shoot()})
      .catch(e=>toast(e.message,'bad'))},

  // defender -> worker: this tower was just placed, so the invader can render it
  reportPlace(t){
    if(this.role!=='defender')return;
    this.api('place',{id:t.id,type:t.type,x:t.x,y:t.y,ups:t.ups}).catch(()=>{})},

  // ---------- staff command relay ----------
  // A command typed on THIS client already ran locally; this hands it to the
  // worker purely so the opponent's next poll replays it. The worker strips
  // our own entries out of the view, which is why running one of these never
  // applies our own command a second time.
  reportCmd(c,args){
    if(!this.inMatch)return;
    this.api('cmd',Object.assign({c:c},args||{}))
      .catch(e=>toast(e.message,'bad'))},

  // Replay what the OTHER client posted. Applied through the same functions
  // the command bar uses but bypassing its role gate: the sender passed that
  // gate on their side and the worker already checked they are staff.
  //
  // Never re-broadcast from here. Doing so would bounce the command back and
  // forth forever — Alice spawns, Bob replays and re-posts, Alice replays and
  // re-posts, and each round spawns another wave on one of the two screens.
  applyCmds(list){
    if(!list||!list.length||typeof window.ADMIN==='undefined')return;
    const A=window.ADMIN;
    for(const it of list){
      if(it.i<=this.cmdCursor)continue;
      this.cmdCursor=it.i;
      if(it.c==='spawn')A.doSpawn(!!it.friendly,it.name,it.count,it.interval);
      else if(it.c==='bless')this.receiveGift(it)}},

  // A gift arrives as a claim about THIS account, never as a write from the
  // other side: only the addressed account applies it, and only to its own save.
  receiveGift(it){
    if(it.to&&it.to!==Cloud.user)return;
    const msg=applyGift(it);
    if(!msg){toast((it.by||'A developer')+' sent a gift that cannot be used','bad');return}
    toast((it.by||'A developer')+' blessed you: '+msg);
    // Earning Blessed is the whole point of the badge, so a self-grant from
    // your own command bar never lights it up.
    if(it.by&&it.by!==Cloud.user)grantBadge('blessed')},

  applyGame(view){
    if(!view)return;
    this.game=view;
    this.offset=(view.startedAt+view.elapsed)-Date.now()/1000;
    if(view.enemies)this.enemies=view.enemies;
    // Buffer due spawns instead of firing them straight into the sim. The
    // server hands back everything past its scheduled time, which is the whole
    // backlog after a slow patch of polling — see drainSpawns for the release.
    if(view.due&&view.due.length)this.queueDue(view.due);
    // staff commands the OTHER client posted — replayed before towers, since a
    // dev spawn has to land on the field this same frame
    if(view.cmds&&view.cmds.length)this.applyCmds(view.cmds);
    // rebuild the defender's towers (invader only; the defender already has them)
    if(this.role==='invader'&&view.towers!==undefined)this.syncTowers(view.towers||[]);
    // server-owned game speed: the vote resolved (or a new match view arrived)
    if(view.speed!=null&&view.speed!==G.speed){
      G.speed=view.speed;
      for(const o of spdBtns)o.classList.toggle('on',+o.dataset.spd===view.speed);
      toast('Game speed changed to '+view.speed+'x')}
    this.renderVote(view.vote);
    if(view.ended&&!this.reported)this.finishMatch(view.ended)},

  // ---------- speed voting ----------
  // Clicking a speed button in PVP opens a 15s poll on both screens; the
  // server applies the change at >=50% yes (strict majority locks it early).
  requestSpeed(v){
    if(!this.inMatch)return;
    this.api('speedVote',{value:v}).catch(e=>toast(e.message,'bad'))},

  // Vote state arrives on the regular poll — no extra requests. The overlay
  // sits outside the SCREENS mechanism so it can coexist with the pause menu.
  renderVote(v){
    const el=$('voteOverlay');if(!el)return;
    if(!v){el.classList.remove('show');this._voteKey=null;return}
    const key=v.ends+':'+v.value;
    if(this._voteKey!==key){this._voteKey=key;
      $('voteText').textContent='Change game speed to '+v.value+'x?'}
    $('voteCount').textContent=v.yes+' YES  -  '+v.no+' NO';
    const mine=!!v.my;
    $('voteYes').disabled=mine;$('voteNo').disabled=mine;
    el.classList.add('show')},

  // Merge a poll's due list into the local buffer, oldest first. Items the
  // cursor has already passed are dropped, and the buffer is keyed on `i` so a
  // re-sent item (a poll that lands while another is in flight) never spawns
  // twice.
  queueDue(list){
    for(const it of list){
      if(it.i<this.cursor)continue;
      if(this.pending.some(p=>p.i===it.i))continue;
      this.pending.push(it)}
    this.pending.sort(function(a,b){return a.i-b.i})},

  // Release buffered spawns on their SERVER schedule, never faster than
  // SPAWN_GAP apart. Anything that is already overdue (a backlog) comes out as
  // a steady trickle instead of one identical frame full of enemies, and both
  // sides pace from the same `at` values so they still agree on what is on the
  // field. The gap is checked against the PREVIOUS release, not just within
  // this call — otherwise every tick would let one more through and a backlog
  // would still burst out at the tick rate.
  drainSpawns(){
    if(!this.pending.length)return;
    const now=this.now();
    let n=0;
    while(this.pending.length&&n<32){
      const it=this.pending[0];
      if(it.at>now)break;                                // not scheduled yet
      if(this.lastSpawnT&&now-this.lastSpawnT<this.SPAWN_GAP)break;   // pace
      this.pending.shift();
      // Bosses live in their own table (BIGS) and must go through spawnBig():
      // that is what sets boss:true and drives the arrival banner, sound and
      // screen shake. Going via spawnEnemy() for a boss type spawned NOTHING —
      // it looks up ENEMIES only and returns null — yet the hotbar draws from
      // ENEMIES||BIGS, so every boss was buyable and then silently vanished.
      if(BIGS[it.type])spawnBig(it.type,1);
      else spawnEnemy(it.type,0,undefined,1);
      this.cursor=it.i+1;
      this.lastSpawnT=now;n++}},

  // The worker's list is authoritative for the invader. Match on position rather
  // than id: each client owns its own `uid` counter, so the defender's ids mean
  // nothing here, and (x,y) is unique anyway (canPlaceAt blocks overlaps).
  // Towers are UPDATED in place, not rebuilt: throwing the objects away every
  // poll would reset cd/aim/flashT/chargeT and make every gun visibly stutter,
  // and the defender's upgrade levels have to ride along or the invader's copy
  // would shoot with base stats while the defender's shoots with upgraded ones.
  syncTowers(list){
    const seen=[];
    for(const s of list){
      if(!TOWERS[s.type])continue;      // unknown type: skip rather than crash the render
      const d=TOWERS[s.type];
      const ups=new Array(d.lanes).fill(0);
      if(Array.isArray(s.ups))
        for(let li=0;li<d.lanes;li++){
          const v=Math.round(+s.ups[li]);
          if(Number.isFinite(v)&&v>=0)ups[li]=Math.min(v,(d.ups[li]||[]).length)}
      let t=null;
      for(const o of towers)
        if(o.remote&&o.type===s.type&&o.x===s.x&&o.y===s.y){t=o;break}
      if(!t){
        t={id:uid++,type:s.type,x:s.x,y:s.y,remote:true,ups:ups,cd:0,invested:0,
          flashT:0,aim:-Math.PI/4,target:null,tgtMode:'first',beamOn:false,
          chargeT:0,beamTick:0,burstLeft:0,burstT:0,hp:0,maxHp:0,stunT:0,
          gunCd:[0,0],gunAim:[-Math.PI/4,-Math.PI/4],gunTgt:[null,null],
          gunFlash:[0,0],gunMode:[null,null],shotN:0,
          toxicT:0,cureT:0,toxicCd:0,cureCd:0};
        t.hp=t.maxHp=towerMaxHP(t);
        towers.push(t)}
      else if(t.ups.join()!==ups.join()){   // an upgrade landed: rebuild stats only
        t.ups=ups}
      seen.push(t)}
    for(let i=towers.length-1;i>=0;i--)
      if(towers[i].remote&&seen.indexOf(towers[i])<0)towers.splice(i,1);
    // Two passes over the survivors. Village buffs read the contributing
    // village's own S, and villages can widen each other's radius, so a single
    // pass would let a tower compute before the village covering it has stats.
    for(let pass=0;pass<2;pass++)
      for(const t of towers)if(t.remote)t.S=towerStats(t)},

  // ---------- reporting ----------
  report(reason){
    if(this.reported)return;
    this.reported=true;
    this.api('result',{reason:reason}).then(r=>{
      if(r.ended)this.finishMatch(r.ended)})
      .catch(e=>{this.reported=false;
        if(!/not been reached/.test(e.message))toast(e.message,'bad')})},

  baseFell(){                       // defender's base hit 0 lives
    if(this.reported)return;
    toast('The Ember Flame has fallen...','bad');
    this.report('base_destroyed')},

  finishMatch(ended){
    if(!this.inMatch&&!this.active)return;
    const myRole=this.role;
    const won=ended.winner===myRole;
    const reward=(ended.rewards&&ended.rewards[myRole])||0;
    if(reward>0){SV.gold+=reward;SV.xp+=reward;Save.save();
      toast('+'+reward+' Gold & XP')}
    if(won){ // Persist the win before the cloud save is queued.
      SV.lbWins.pvp=(SV.lbWins.pvp||0)+1;Save.save()}
    lbReport();
    const winMins=Math.round((this.game&&this.game.winSecs||600)/60);
    const REASONS={survived:'The defender survived the full '+winMins+' minutes!',
      wave50:'The defender survived the full '+winMins+' minutes!',
      base_destroyed:'The Ember Flame was destroyed!',
      forfeit:'Your opponent forfeited.',opponent_left:'Your opponent disconnected.'};
    this.inMatch=false;this.active=false;G.mp=null;
    this.pending.length=0;this.lastSpawnT=0;
    const vo=$('voteOverlay');if(vo)vo.classList.remove('show');
    resetBattlefield();
    G.state='menu';
    $('mpBar').style.display='none';
    // mirror endGameCommon(): the match HUD must not linger behind the end card
    hideMatchHud();
    $('mpEnd').classList.toggle('win',won);
    $('mpEnd').classList.toggle('lose',!won);
    const mins=Math.floor((ended.elapsed||0)/60),secs=(ended.elapsed||0)%60;
    // The same pair of cues the campaign cards use, so a win feels like a win
    // wherever it happens.
    Music.play(won?'win':'lose');
    // The same card the campaign uses: emblem, verdict, meter, numbers. The
    // verdict is written per role, because winning as the invader and winning
    // as the defender are two different achievements.
    const held=(ended.elapsed||0)/Math.max(60,(this.game&&this.game.winSecs)||600);
    const VERDICT={
      'defender-win':'You held the Ember Flame for '+mins+'m '+secs+'s.',
      'invader-win':'Their line broke at '+mins+'m '+secs+'s. Everything you sent got through.',
      'defender-loss':'The Flame went out at '+mins+'m '+secs+'s. Build the second layer earlier.',
      'invader-loss':'The defender held for the full '+winMins+' minutes — that is a wall, not luck.'};
    const myKey=(won?(myRole==='defender'?'defender-win':'invader-win'):
      (myRole==='defender'?'defender-loss':'invader-loss'));
    renderResult('mpe',{kind:won?'win':'lose',crest:won?'win':'lose',
      kicker:'MULTIPLAYER · YOU WERE THE '+(myRole==='defender'?'DEFENDER':'INVADER'),
      title:won?'VICTORY':'DEFEAT',
      sub:REASONS[ended.reason]||'',
      verdict:VERDICT[myKey]||'',
      tone:won?'':'hint',
      meter:{label:'SURVIVED '+mins+'M '+secs+'S',frac:Math.min(1,held),
        note:'The defender wins outright at '+winMins+' minutes'},
      stats:[
        // The title already says WIN or LOSS, so the row answers the question a
        // result card otherwise leaves open: who was on the other side.
        resRow('Opponent',MP.oppName()),
        resRow('Match length',mins+'m '+secs+'s'),
        resNum('Gold earned',reward,'+','',320),
        resNum('XP earned',reward,'+','',460)]});
    showScreen('mpEnd');
    refreshMenu()},

  // ---------- per-frame tick (called from the main loop) ----------
  // One match poll. The defender rides along with the two facts only it can
  // know — remaining base HP and the current tower list — so the invader gets
  // both without needing a separate channel. Towers are ALSO pushed the moment
  // one is placed (see reportPlace) for instant feedback; repeating them here
  // is what makes a dropped placement heal itself instead of costing that
  // tower for the rest of the match.
  poll(){
    const body={cursor:this.cursor,cmdCursor:this.cmdCursor};
    if(this.role==='defender'){
      body.hp=Math.max(0,Math.round(G.lives));
      body.maxHp=Math.max(0,Math.round(G.maxLives));
      body.towers=towers.map(t=>({type:t.type,x:t.x,y:t.y,ups:t.ups}))}
    return this.api('game',body).then(r=>{
      this.applyGame(r.game);return r})},

  // Drives ALL MP polling (lobby refresh, spawn queue, end-of-match). Uses a
  // wall-clock delta instead of the caller's rdt and is also pumped by a
  // setInterval fallback in init(): rAF stops completely in hidden tabs and
  // minimized desktop windows, which would otherwise freeze polling and get
  // the player flagged as disconnected.
  tick(){
    const now=performance.now();
    if(!this._lastT)this._lastT=now;
    let dt=(now-this._lastT)/1000;this._lastT=now;
    if(!(dt>0))return;
    if(dt>5)dt=5;                       // clamp after a long stall
    const rdt=dt;
    this.closeCtxOnOutside();
    if(!this.active)return;
    // lobby polling — also our heartbeat + the guest's start signal
    if(!this.inMatch){
      this.stateT-=rdt;
      if(this.stateT<=0){this.stateT=this.lob&&this.lob.status==='playing'?0.8:2;
        this.api('state',{}).then(r=>{
          if(!r.lobby){if(this.lob){toast('Lobby closed','bad');this.abort();toMenu()}return}
          this.lob=r.lobby;
          if($('mpLobby').classList.contains('show'))this.renderLobby()})
        .catch(()=>{})}
      return}
    // match polling
    this.gameT-=rdt;
    if(this.gameT<=0){this.gameT=this.POLL_S;
      // a dropped poll is retried on the next beat; one blip is not worth a toast
      this.poll().catch(()=>{})}
    this.drainSpawns();   // release scheduled spawns at their own pace
  // defender: outlast the clock -> report (server validates it)
  if(this.role==='defender'&&!this.reported&&
     this.serverElapsed()>=(this.game&&this.game.winSecs||600)+2)this.report('survived');
  // defender: the invader's income drip, mirrored locally. The worker owns the
  // invader's purse because only it can stop them overspending; nothing
  // server-side spends the defender's cash, so this side can pay itself — off
  // the same server-synced clock, so a tick lands for both players at once and a
  // stalled tab catches up in one go rather than skipping the payday.
  if(this.role==='defender'&&G.state==='playing'){
    const owed=this.earned(this.ticks())-this.defPaid;
    if(owed>0){this.defPaid+=owed;G.cash+=owed}
    // defender farms: there is no wave system in PVP, so farms pay on their own
    // 30-second clock instead of at wave end (waves.js farmPay never runs here).
    // Only LOCAL towers pay — remote ones belong to the mirror render, and both
    // sides counting them would double-pay.
    this.farmT=(this.farmT||0)+rdt;
    if(this.farmT>=30){this.farmT-=30;this.payFarms()}}
    // either side: claim a win if the opponent vanished 45s+. This reads the
    // MATCH poll, not the lobby roster: lobby polling stops the moment a match
    // starts, so its `seen` values froze at the start-of-match heartbeat and this
    // claim could never be reached. The worker re-checks the same figure and
    // refuses an early claim, so being trigger-happy here costs nothing.
    const gg=this.game;
    if(!this.reported&&gg&&gg.oppSeen!=null&&gg.oppSeen>=45)this.report('opponent_left')
    // HUD refresh at ~4Hz (gold ticks, affordability, income countdown)
    this.hudT-=rdt;
    if(this.hudT<=0){this.hudT=.25;
      if(this.role==='invader')this.refreshBar();
      MP.hud()}},

  // PVP farm payout — every 30s, see tick(). Mirrors waves.js farmPay but for
  // the waveless PVP mode: sum income over the defender's own towers.
  payFarms(){
    let f=0;
    for(const t of towers)if(!t.remote&&t.S&&t.S.income)f+=t.S.income;
    if(!f)return;
    G.cash+=f;
    toast('Farm income  +$'+f)},

  closeCtxOnOutside(){
    const ctx=$('mpCtx');
    if(ctx&&ctx.classList.contains('open')&&!ctx.dataset.hold){
      // closed by the document-level handler; nothing to do here
    }},

  hud(){
    if(!this.inMatch)return;
    const g=this.game;if(!g)return;
    // the whole match is one clock now: survive it and the defender wins
    const left=Math.max(0,(g.winSecs||600)-this.serverElapsed());
    const mm=Math.floor(left/60),ss=Math.floor(left%60);
    $('stWave').textContent='SURVIVE '+mm+':'+(ss<10?'0':'')+ss;
    $('skipWave').style.display='none';
    $('bossbar').style.display='none';
    if(this.role==='defender'){
      $('stLives').innerHTML='&#9829; '+Math.max(0,G.lives);
      $('stCash').innerHTML='<span class="coin"></span>'+fmt(G.cash);
      $('waveSub').textContent=g.pendingCount>0?(g.pendingCount+' incoming')
        :('income +$'+g.income+' in '+Math.max(1,Math.ceil(g.nextIncomeIn))+'s')}
    else{
      // the invader's real objective is the base, so show how it's wearing down
      const hp=g.baseHp,max=g.baseMax;
      let txt;
      if(hp==null)txt='&#9876; BASE &mdash;';
      else{const frac=max?clamp(hp/max,0,1):1;
        const col=frac>.6?'#8ce89a':frac>.3?'#f5c56a':'#ef8b7a';
        txt='<span style="color:'+col+'">&#9876; BASE '+hp+'/'+(max||'?')+'</span>'}
      $('stLives').innerHTML=txt;
      $('stCash').innerHTML='<span class="coin"></span>'+fmt(this.gold());
      $('waveSub').textContent='income +$'+g.income+' in '+Math.max(1,Math.ceil(g.nextIncomeIn))+'s'}},

  // wiring (called once at load)
  init(){
    $('btnMulti').onclick=()=>this.openMenu();
    $('mpBack').onclick=()=>{Sfx.click();this.stopRoomList();showScreen('mainMenu')};
    $('mpCreate').onclick=()=>{Sfx.click();
      this._createMode='pvp';
      document.querySelectorAll('#mpCreateMode .tgl').forEach(b=>b.classList.toggle('on',b.dataset.mode==='pvp'));
      $('roomName').value='';$('roomPass').value='';
      showScreen('mpCreateModal')};
    // mode switch — PVP only for now, CO-OP stays locked (server rejects it too)
    document.querySelectorAll('#mpCreateMode .tgl').forEach(b=>b.onclick=()=>{
      Sfx.click();
      if(b.dataset.mode==='coop'){toast('CO-OP is coming soon','bad');return}
      this._createMode=b.dataset.mode;
      document.querySelectorAll('#mpCreateMode .tgl').forEach(o=>o.classList.toggle('on',o===b))});
    $('mpCreateCancel').onclick=()=>{Sfx.click();showScreen('mpMenu')};
    $('mpCreateGo').onclick=()=>{
      const name=$('roomName').value.trim();
      const pw=$('roomPass').value;
      this.createLobby(this._createMode||'pvp',{name:name,password:pw})};
    $('roomName').onkeydown=e=>{if(e.key==='Enter')$('mpCreateGo').onclick()};
    $('roomPass').onkeydown=e=>{if(e.key==='Enter')$('mpCreateGo').onclick()};
    $('mpJoin').onclick=function(){Sfx.click();$('mpJoinRow').classList.toggle('open');$('mpCodeInput').focus()};
    $('mpJoinGo').onclick=()=>this.joinLobby($('mpCodeInput').value);
    $('mpCodeInput').onkeydown=e=>{if(e.key==='Enter')this.joinLobby($('mpCodeInput').value)};
    $('roomSearch').oninput=()=>this.renderRooms();
    $('pwGo').onclick=()=>{Sfx.click();
      this.joinLobby(this._pwCode,$('pwInput').value)};
    $('pwCancel').onclick=()=>{Sfx.click();$('pwPrompt').classList.remove('show')};
    $('pwInput').onkeydown=e=>{if(e.key==='Enter')$('pwGo').onclick()};
    $('mpModeBack').onclick=()=>{Sfx.click();showScreen('mpMenu')};
    $('mpPvp').onclick=()=>this.createLobby('pvp');
    $('mpCoop').onclick=()=>{Sfx.click();toast('CO-OP is coming soon','bad')};
    $('mpMap').onclick=()=>{Sfx.click();toast('More maps are coming soon — basic map only','bad')};
    $('mpStart').onclick=()=>this.startMatch();
    $('mpLeave').onclick=()=>this.leaveLobby();
    $('mpeBack').onclick=()=>{Sfx.click();this.leaveNow()};
    $('voteYes').onclick=()=>{Sfx.click();
      this.api('speedVote',{choice:'yes'}).catch(e=>toast(e.message,'bad'))};
    $('voteNo').onclick=()=>{Sfx.click();
      this.api('speedVote',{choice:'no'}).catch(e=>toast(e.message,'bad'))};
    for(const b of document.querySelectorAll('#mpCtx button'))
      b.onclick=()=>this.ctxAction(b.dataset.a);
    document.addEventListener('pointerdown',e=>{
      const ctx=$('mpCtx');
      if(ctx&&ctx.classList.contains('open')&&!ctx.contains(e.target))this.closeCtx()},true);
    // Pump the ticker on a timer too: the rAF loop in main.js is suspended
    // while the tab/window is hidden, but MP polls (and the opponent's
    // heartbeat) must keep running or the player is dropped as disconnected.
    setInterval(()=>{if(window.MP)MP.tick()},500)}
};
// main.js drives MP from the frame loop (`if(window.MP)MP.tick(rdt)`) — the
// object must be global or none of the lobby/match polling ever runs.
window.MP=MP;
MP.init();
