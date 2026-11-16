"use strict";
var CURRENT_SAVE_VERSION=4;
var SAVE_MIGRATIONS={
  2:function(d){
    if(Array.isArray(d.owned)){
      d.owned=d.owned.map(function(t){return t==='test'?'ranger':t});
      if(d.owned.indexOf('ranger')<0)d.owned.push('ranger');
      d.owned=d.owned.filter(function(t,i){return d.owned.indexOf(t)===i})}
    if(Array.isArray(d.loadout)){
      d.loadout=d.loadout.map(function(t){return t==='test'?'ranger':t});
      var seen={};
      d.loadout=d.loadout.filter(function(t){
        if(seen[t]||!TOWERS[t]||d.owned.indexOf(t)<0)return false;
        seen[t]=1;return true})}
  },
  3:function(d){
    if(Array.isArray(d.owned)&&d.owned.indexOf('grenadier')<0)d.owned.push('grenadier');
    if(Array.isArray(d.loadout)&&d.loadout.indexOf('grenadier')<0&&d.loadout.length<6)
      d.loadout.push('grenadier');
  },
  4:function(d){
    if(Array.isArray(d.owned)&&d.owned.indexOf('sniper')<0)d.owned.push('sniper');
    if(Array.isArray(d.loadout)&&d.loadout.indexOf('sniper')<0&&d.loadout.length<6)
      d.loadout.push('sniper');
  }
};
var Save={
  key:'tdv_save_v1', data:null,
  defaults:function(){return{saveVersion:CURRENT_SAVE_VERSION,gold:0,xp:0,
    owned:['ranger','grenadier','sniper'],loadout:['ranger','grenadier','sniper'],badges:{},
    lbWins:{},lbEndlessWave:0,
    vol:70,sfx:80,music:60,uiScale:1,particles:true,shake:true}},
  sanitize:function(d){
    if(!Array.isArray(d.owned)||!d.owned.length)d.owned=['ranger','grenadier','sniper'];
    if(!Array.isArray(d.loadout))d.loadout=['ranger','grenadier','sniper'];
    if(!d.badges||typeof d.badges!=='object')d.badges={};
    if(!d.lbWins||typeof d.lbWins!=='object')d.lbWins={};
    d.lbEndlessWave=Math.max(0,Math.floor(+d.lbEndlessWave)||0);
    d.gold=Math.max(0,+d.gold||0);d.xp=Math.max(0,+d.xp||0);
    d.vol=Math.min(100,Math.max(0,+d.vol||0));d.sfx=Math.min(100,Math.max(0,+d.sfx||0));
    d.music=Math.min(100,Math.max(0,+d.music||0));
    d.uiScale=Math.min(2,Math.max(.5,+d.uiScale||1));
    d.loadout=d.loadout.filter(function(t,i){
      return TOWERS[t]&&d.owned.indexOf(t)>=0&&d.loadout.indexOf(t)===i}).slice(0,6);
    return d},
  load:function(){var d=this.defaults();
    try{var p=JSON.parse(localStorage.getItem(this.key)||'{}');
      this.data=this.sanitize(Object.assign(d,p))}
    catch(e){this.data=this.defaults()}
    var v=this.data.saveVersion||0;
    if(v<CURRENT_SAVE_VERSION){
      while(v<CURRENT_SAVE_VERSION){v++;
        if(SAVE_MIGRATIONS[v])SAVE_MIGRATIONS[v](this.data);
        this.data.saveVersion=v}
      this.data=this.sanitize(this.data);
      this.save()}
  },
  save:function(){
    try{localStorage.setItem(this.key,JSON.stringify(this.data))}
    catch(e){if(window.Cloud)Cloud.saveFailed(
      'Device storage is full - progress is not saved on this device','NOT SAVED')}
    if(window.Cloud&&Cloud.ready)Cloud.queuePush();},
  reset:function(){
    var fresh=this.defaults();
    for(var k in SV)delete SV[k];
    for(var k2 in fresh)SV[k2]=fresh[k2];
    this.data=SV;
    this.save()}
};
Save.load();
var SV=Save.data;

// ---- badges ----
function grantBadge(id){
  if(SV.badges[id])return false;
  SV.badges[id]=true;Save.save();
  const bd=BADGES.find(function(b){return b.id===id});
  toast('Badge earned: '+(bd?bd.name:id)+'!');
  return true}
// passive badges: held gold + account level (checked periodically)
const STAT_BADGES={gold:[[50000,'millionaire'],[25000,'monayyy'],[5000,'rich']],
  lvl:[[50,'veteran'],[30,'professional'],[15,'knowledgeable'],[5,'new']]};
function checkStatBadges(){
  for(const g of STAT_BADGES.gold)if(SV.gold>g[0])grantBadge(g[1]);
  const lvl=levelInfo(SV.xp).lvl;
  for(const l of STAT_BADGES.lvl)if(lvl>=l[0])grantBadge(l[1])}

// ---- developer gifts ----
// A gift is always applied by the account that receives it: the giver's client
// asks the worker to carry the promise across a match and this side writes its
// own numbers, which is why no server-side account write is ever needed.
// Returns a phrase for the toast, or null when there is nothing to give.
function applyGift(g){
  const what=g.what;
  let msg=null;
  if(what==='gold'||what==='exp'){
    const n=Math.max(0,Math.floor(+g.n||0));
    if(n){
      if(what==='gold'){SV.gold+=n;msg='+'+fmt(n)+' Gold'}
      else{SV.xp+=n;msg='+'+fmt(n)+' XP'}}}
  else if(what==='tower'&&TOWERS[g.key]){
    if(SV.owned.indexOf(g.key)<0)SV.owned.push(g.key);
    msg=TOWERS[g.key].name+' unlocked'}
  if(!msg)return null;
  Save.save();
  return msg}

function levelInfo(xp){var lvl=1,need=150,rem=xp;
  while(rem>=need&&lvl<60){rem-=need;lvl++;need=150+50*(lvl-1)}
  return{lvl:lvl,rem:rem,need:need}}
// XP needed to be standing AT a level, level 1 being zero. The inverse of
// levelInfo above, and the only honest way to grant levels: the account level is
// derived from xp and never stored, so there is no field to write.
function xpForLevel(l){var x=0;
  for(var k=1;k<clamp(l,2,60);k++)x+=150+50*(k-1);
  return x}

// ---------- encrypted save codes ----------
var SAVE_CODE_PREFIX='TDV';
var SAVE_OBF_KEY=0x5a17c3;
function saveChecksum(str){
  var h=0x811c9dc5;
  for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);
    h=Math.imul(h,0x01000193)}
  return(h>>>0).toString(16).padStart(8,'0')}
function streamByte(salt,i){
  var h=((i*0x9e3779b1)^salt^SAVE_OBF_KEY)>>>0;
  h^=h>>>15;h=Math.imul(h,0x85ebca6b);
  h^=h>>>13;h=Math.imul(h,0xc2b2ae35);
  h^=h>>>16;
  return h&0xff}
function strToBytes(s){var b=[];
  var lat=unescape(encodeURIComponent(s));
  for(var i=0;i<lat.length;i++)b.push(lat.charCodeAt(i)&0xff);
  return b}
function bytesToStr(b){var lat='';
  for(var i=0;i<b.length;i++)lat+=String.fromCharCode(b[i]);
  return decodeURIComponent(escape(lat))}
function bytesToB64(b){var s='';
  for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);
  return btoa(s)}
function b64ToBytes(b64){var s=atob(b64),b=[];
  for(var i=0;i<s.length;i++)b.push(s.charCodeAt(i)&0xff);
  return b}
function scramble(bytes,salt){
  var n=bytes.length,out=new Array(n);
  for(var i=0;i<n;i++)out[i]=(bytes[n-1-i]^streamByte(salt,i))&0xff;
  return out}
function unscramble(bytes,salt){
  var n=bytes.length,out=new Array(n);
  for(var i=0;i<n;i++)out[n-1-i]=(bytes[i]^streamByte(salt,i))&0xff;
  return out}

function encodeSave(){
  try{
    SV.saveVersion=CURRENT_SAVE_VERSION;
    var bytes=strToBytes(JSON.stringify(SV));
    var salt=Math.floor(Math.random()*0x10000);
    var scr=scramble(bytes,salt);
    var b64=bytesToB64(scr);
    var saltHex=salt.toString(16).padStart(4,'0');
    return SAVE_CODE_PREFIX+CURRENT_SAVE_VERSION+'.'+saltHex+'.'+b64+'.'+saveChecksum(b64)}
  catch(e){return null}}

function decodeSaveCode(code){
  code=(code||'').trim();
  if(!code)return{ok:false,err:'Empty'};
  var parts=code.split('.');
  if(parts.length===4&&parts[0].indexOf(SAVE_CODE_PREFIX)===0){
    var ver=parseInt(parts[0].slice(SAVE_CODE_PREFIX.length),10);
    if(isNaN(ver))return{ok:false,err:'Corrupt version'};
    if(ver>CURRENT_SAVE_VERSION)return{ok:false,err:'From a newer game version'};
    var salt=parseInt(parts[1],16);
    if(isNaN(salt))return{ok:false,err:'Corrupt salt'};
    var b64=parts[2];
    if(saveChecksum(b64)!==parts[3])return{ok:false,err:'Checksum failed'};
    try{
      var json=bytesToStr(unscramble(b64ToBytes(b64),salt));
      var obj=JSON.parse(json);
      if(!obj||typeof obj!=='object'||typeof obj.gold!=='number'||typeof obj.xp!=='number')
        return{ok:false,err:'Not a valid save'};
      return{ok:true,data:obj}}
    catch(e){return{ok:false,err:'Could not decrypt'}}}
  return{ok:false,err:'Not a valid save code'}}

function applySaveData(obj){
  // Badges are permanent achievements: a cloud save written BEFORE one was
  // earned must never take it back. Losing it locally meant checkStatBadges()
  // re-granted it on the very next refreshMenu() and re-toasted "Badge
  // earned: ...!" on every single launch.
  var had=Save.data?(Save.data.badges||{}):{};
  var merged=Save.sanitize(Object.assign(Save.defaults(),obj));
  var v=merged.saveVersion||0;
  while(v<CURRENT_SAVE_VERSION){v++;
    if(SAVE_MIGRATIONS[v])SAVE_MIGRATIONS[v](merged);
    merged.saveVersion=v}
  for(var bk in had)if(had[bk])merged.badges[bk]=true;
  merged.saveVersion=CURRENT_SAVE_VERSION;
  for(var k in SV)delete SV[k];
  for(var k2 in merged)SV[k2]=merged[k2];
  Save.save();
  refreshMenu();
  return merged}

// ============================================================
//  CLOUD SAVE
// ============================================================
var CLOUD_URL='https://tdv-cloud-save.adamdalisanskas.workers.dev';
// Local dev pairs with the worker shim (`npm run mp`) on port 8322 — same rule
// as MP_URL in mp.js, so sign-in/saves and multiplayer share one backend and
// the STAFF roles in cloud/worker.js apply while testing. Desktop + https
// always use the real cloud.
if(location.protocol==='http:'&&/^(localhost|127\.0\.0\.1)$/.test(location.hostname))
  CLOUD_URL='http://localhost:8322';

var Cloud={
  token:localStorage.getItem('tdv_cloud_token')||null,
  user:localStorage.getItem('tdv_cloud_user')||null,
  // staff role granted by the worker (server-authoritative): 'developer' |
  // 'tester' | null. Cached locally so the admin tools know their access
  // before the first save pull returns.
  role:localStorage.getItem('tdv_cloud_role')||null,
  ready:false,dirty:false,online:true,
  _timer:null,_pushing:false,_retry:null,_busy:false};

Cloud.setRole=function(r){
  // the role arrives from the worker and from localStorage, neither trusted
  r=(r==='developer'||r==='tester')?r:null;
  this.role=r;
  if(r)localStorage.setItem('tdv_cloud_role',r);
  else localStorage.removeItem('tdv_cloud_role');
  if(window.TDVUpdate&&TDVUpdate.onRole)TDVUpdate.onRole(r)};

function cloudApi(path,body){
  return fetch(CLOUD_URL+path,{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})})
  .then(function(r){
    return r.json().catch(function(){return{ok:false,err:'Network error'}})})
  .then(function(j){
    if(!j.ok){
      const e=new Error(j.err||'HTTP error');
      // carry server hints on the error (e.g. needPassword from the lobby join)
      for(const k of Object.keys(j))
        if(k!=='ok'&&k!=='err')e[k]=j[k];
      throw e}
    return j})}

// ---- leaderboards ----
// These endpoints use the SAME session as saves and multiplayer. cloudApi
// does not attach credentials automatically: both reads and reports need it.
function lbApi(path,body){
  if(!Cloud.ready||!Cloud.token)
    return Promise.reject(new Error('Sign in to view the leaderboards.'));
  return cloudApi(path,Object.assign({},body,{token:Cloud.token}))}
function lbReport(){
  if(!Cloud.ready||!Cloud.token)return Promise.resolve(false);
  const wins={};
  for(const k in SV.lbWins)if(SV.lbWins[k]>0)wins[k]=SV.lbWins[k];
  return lbApi('/api/lb/report',{stats:{
    wins:wins,gold:SV.gold,lvl:levelInfo(SV.xp).lvl,endless:SV.lbEndlessWave}})
    .then(function(){return true}).catch(function(){return false})}
function lbTop(board){
  return lbApi('/api/lb/top',{board:board}).then(function(r){
    return Array.isArray(r.board)?r.board:[]})}

function cloudStatus(txt,bad){var el=$('cloudInfo');
  if(!el)return;el.textContent=txt;
  el.style.color=bad?'#ff9aa4':'#9fb0c2'}

(function(){
  var chip=document.createElement('div');chip.id='cloudChip';
  chip.setAttribute('data-state','idle');
  chip.innerHTML=
    '<svg class="ci ic-spin" viewBox="0 0 16 16" aria-hidden="true">'+
      '<path d="M8 1.9a6.1 6.1 0 1 1-4.3 1.8" fill="none" stroke="currentColor" '+
      'stroke-width="2.4" stroke-linecap="round"/></svg>'+
    '<svg class="ci ic-ok" viewBox="0 0 16 16" aria-hidden="true">'+
      '<circle class="cc" cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="2"/>'+
      '<path class="ck" d="M4.9 8.4 7 10.5l4.2-4.7" fill="none" stroke="currentColor" '+
      'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'+
    '<svg class="ci ic-bad" viewBox="0 0 16 16" aria-hidden="true">'+
      '<circle class="cc" cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="2"/>'+
      '<path class="ck" d="M5.7 5.7 10.3 10.3M10.3 5.7 5.7 10.3" fill="none" stroke="currentColor" '+
      'stroke-width="2.2" stroke-linecap="round"/></svg>'+
    '<span class="ct">SYNCED</span>';
  $('uiRoot').appendChild(chip);   // scaled with the interface it reports on
  Cloud.chipEl=chip;   // screens.js re-parents it into the main-menu profile bar

  // state: 'spin' = saving, 'ok' = synced, 'bad' = failed, 'idle' = settled
  Cloud.chip=function(state,txt){
    if(!Cloud.ready||!state){chip.classList.remove('on');return}
    if(Cloud._idleT){clearTimeout(Cloud._idleT);Cloud._idleT=null}
    chip.setAttribute('data-state',state);
    chip.querySelector('.ct').textContent=txt||'';
    // drop + reflow so the entrance / icon animations replay every state change
    chip.classList.remove('on');void chip.offsetWidth;chip.classList.add('on');
    // let the green check show off for a while, then settle into the quiet chip
    if(state==='ok')Cloud._idleT=setTimeout(function(){
      Cloud._idleT=null;
      if(Cloud.ready&&chip.getAttribute('data-state')==='ok')Cloud.chip('idle','SYNCED')},3800)};
})();

// A save that reaches neither disk nor the cloud exists only in this tab: say so
// once per session, not on every autosave, rather than losing it quietly.
Cloud.saveFailed=function(msg,chipTxt){
  this.chip('bad',chipTxt||'SAVE FAILED');
  if(this._saveFailShown)return;
  this._saveFailShown=true;
  toast(msg,'bad')};

// ---- cloud sync ----
// Data-saving is one of the features an update is required for; when the
// player declines an update, queueing stops before anything is marked dirty.
Cloud.queuePush=function(){
  if(!this.ready)return;
  if(window.TDVUpdate&&TDVUpdate.locked('cloud')){this.dirty=false;return}
  this.dirty=true;
  if(this._timer)clearTimeout(this._timer);
  this._timer=setTimeout(function(){Cloud.flush()},3000)};

Cloud.flush=function(){
  var self=this;
  if(!this.ready||this._pushing||!this.online)return;
  if(window.TDVUpdate&&TDVUpdate.locked('cloud'))return;
  var code=encodeSave();
  if(!code){this.saveFailed('Save could not be encoded - progress is not uploaded');return}
  this._pushing=true;this.dirty=false;
  var t0=Date.now(),seq=(this._seq=(this._seq||0)+1);
  this.chip('spin','SAVING...');
  cloudApi('/api/push',{token:this.token,code:code})
  .then(function(){
    self.online=true;
    if(self._retry){clearTimeout(self._retry);self._retry=null}
    // hold the spinner on screen long enough for players to actually see it
    setTimeout(function(){
      if(self._seq===seq&&self.ready)self.chip('ok','SYNCED')},
      Math.max(0,1500-(Date.now()-t0)))})
  .catch(function(e){
    self.dirty=true;
    if(/sign in/i.test(e.message)){self.sessionEnd(e.message);return}
    self.online=false;self.chip('bad','OFFLINE');
    if(!self._retry)self._retry=setTimeout(function(){self._retry=null;self.flush()},15000)})
  .then(function(){self._pushing=false})};

Cloud.pull=function(){
  var self=this;
  if(!this.token)return Promise.resolve(null);
  return cloudApi('/api/pull',{token:this.token}).then(function(j){
    self.online=true;
    if('role' in j)self.setRole(j.role);
    var applied=false;
    if(typeof j.code==='string'&&j.code){
      var r=decodeSaveCode(j.code);
      if(r.ok){applySaveData(r.data);applied=true}}
    return{raw:j,applied:applied}})};

Cloud.sessionEnd=function(msg){
  this.ready=false;this.token=null;this.setRole(null);
  localStorage.removeItem('tdv_cloud_token');
  this.chip('');
  gateShow(msg||'Cloud session ended - sign in again')};

// ---- sign-in gate ----
function gateMsg(txt,bad){var el=$('gateStatus');
  if(!el)return;el.textContent=txt;el.dataset.bad=bad?'1':'';
  el.style.color=bad?'#ff9aa4':'#9fb0c2'}
function gateShow(msg){
  $('cloudGate').classList.add('show');
  $('gateRetry').style.display=msg?'':'none';
  gateMsg(msg||'Choose a username and password to play',!!msg)}
function gateAuth(mode){
  if(Cloud._busy)return;
  var u=$('gateUser').value.trim(),p=$('gatePass').value;
  if(!u||!p){gateMsg('Enter a username and password',true);return}
  Cloud._busy=true;
  gateMsg(mode==='register'?'Creating account...':'Signing in...');
  cloudApi('/api/'+mode,{username:u,password:p})
  .then(function(j){
    if(typeof j.token!=='string'||!j.token)
      throw new Error('The server sent no session - try again');
    Cloud.token=j.token;Cloud.user=j.username||u.toLowerCase();Cloud.online=true;
    Cloud.setRole(j.role||null);
    localStorage.setItem('tdv_cloud_token',j.token);
    localStorage.setItem('tdv_cloud_user',Cloud.user);
    $('gatePass').value='';
    return Cloud.pull().then(function(res){
      Cloud.ready=true;
      if(!res.applied)Cloud.queuePush();
      $('cloudGate').classList.remove('show');
      cloudStatus('Signed in as '+Cloud.user);
      Cloud.chip('ok','SYNCED');
      toast(res.applied?'Cloud save loaded':'Welcome, '+Cloud.user+'!');
      if(window.TDVUpdate)TDVUpdate.onSignedIn();
      refreshMenu()})})
  .catch(function(e){Cloud.ready=false;gateMsg(e.message,true)})
  .then(function(){Cloud._busy=false})}

function cloudBoot(){
  if(Cloud._busy)return;
  Cloud._busy=true;
  $('gateRetry').style.display='none';
  gateMsg('Connecting...');
  fetch(CLOUD_URL,{method:'GET'}).then(function(r){return r.json()}).then(function(){
    Cloud.online=true;
    if(!(Cloud.token&&Cloud.user)){gateShow();return}
    gateMsg('Restoring session...');
    return Cloud.pull().then(function(res){
      Cloud.ready=true;
      if(!res.applied)Cloud.queuePush();
      $('cloudGate').classList.remove('show');
      cloudStatus('Signed in as '+Cloud.user);
      Cloud.chip('ok','SYNCED');
      if(res.applied)toast('Cloud save loaded');
      if(window.TDVUpdate)TDVUpdate.onSignedIn();
      refreshMenu()})
    .catch(function(e){
      Cloud.ready=false;Cloud.token=null;
      localStorage.removeItem('tdv_cloud_token');
      gateShow(/sign in/i.test(e.message)?'Session expired - sign in again'
        :'Could not reach the cloud server')})})
  .catch(function(){
    Cloud.online=false;
    gateShow('Could not reach the cloud server - check your connection')})
  .then(function(){Cloud._busy=false})}
window.addEventListener('load',cloudBoot);

$('gateLogin').onclick=function(){gateAuth('login')};
$('gateRegister').onclick=function(){gateAuth('register')};
// WebView2 autofill quirk: accepting a saved-username suggestion can fire the
// Enter handlers while the password field is still empty, leaving a red gate
// error stuck on screen — nothing else ever clears #gateStatus until restart.
// Clear any stale red error as soon as the user types or autofill fills a field.
function gateInputReset(){
  if(Cloud._busy)return;
  var el=$('gateStatus');
  if(el&&el.dataset.bad)gateMsg('Choose a username and password to play')}
$('gateUser').oninput=gateInputReset;
$('gatePass').oninput=gateInputReset;
$('gateUser').onkeydown=function(e){if(e.key==='Enter')gateAuth('login')};
$('gatePass').onkeydown=function(e){if(e.key==='Enter')gateAuth('login')};
$('gateRetry').onclick=function(){cloudBoot()};

$('cloudPull').onclick=function(){Sfx.click();
  if(!Cloud.ready){toast('Not signed in to the cloud','bad');return}
  if(Cloud._busy||Cloud._pushing){cloudStatus('A cloud request is already running');return}
  Cloud._busy=true;
  cloudStatus('Loading from cloud...');
  Cloud.pull().then(function(res){
    cloudStatus('Signed in as '+Cloud.user);
    if(res.applied){toast('Cloud save loaded');Cloud.chip('ok','SYNCED')}
    else{toast('No cloud save on file - local progress will upload');Cloud.queuePush()}})
  .catch(function(){cloudStatus('Could not reach the cloud',true)})
  .then(function(){Cloud._busy=false})};
$('cloudLogout').onclick=function(){Sfx.click();
  if(Cloud.token)cloudApi('/api/logout',{token:Cloud.token}).catch(function(){});
  Cloud.ready=false;Cloud.token=null;Cloud.user=null;Cloud.dirty=false;
  Cloud.setRole(null);
  localStorage.removeItem('tdv_cloud_token');
  localStorage.removeItem('tdv_cloud_user');
  Cloud.chip('');
  cloudStatus('Signed out');
  gateShow()};