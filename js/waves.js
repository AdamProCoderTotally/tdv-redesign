"use strict";
// ============================================================
//  waves.js — wave manager, wave completion, skip, badges
// ============================================================
const WaveMgr={
  active:false,n:0,queue:[],t:0,cd:10,
  // Spawns that a SKIP left behind. Skipping ends the wave, not the enemies it
  // already had scheduled — those keep walking out on their original timetable
  // (measured on their own clock, `resT`, so the next wave's `t` reset does not
  // swallow them). Without this, skipping silently deleted every enemy that had
  // not yet reached the spawn point.
  residual:[],resT:0,
  reset(){this.active=false;this.n=0;this.queue=[];this.t=0;this.cd=10;
    this.residual.length=0;this.resT=0},
  farmPay(){let f=0;for(const t of towers)if(!t.remote&&t.S&&t.S.income)f+=t.S.income;   // !remote: never pay the invader for the defender's farms
    if(f){G.cash+=f;toast('Farm income  +$'+f)}},
  start(n){
    // Wave 501 is the door to the secret challenge, and there are several ways
    // to reach it (skip, the spacebar early-start, the admin panel) — so the
    // question is asked here as well as the moment wave 500 is cleared.
    if(G.mode.id==='endless'&&n===ENDLESS_LAST_WAVE&&G.secret==='pending'){openChallenge();return}
    this.n=n;this.active=true;this.queue=buildWaveQueue(G.mode.id,n);this.t=0;
    Sfx.wave()},
  spawn(s){if(s.big)spawnBig(s.big,s.hpMul);
    else spawnEnemy(s.type,0,undefined,s.hpMul)},
  update(dt){
    if(G.state!=='playing')return;
    if(G.mp&&G.mp.inMatch)return;   // PVP spawns come from the server, not WaveMgr
    // left-behind skips run on their own clock, independent of the live wave
    if(this.residual.length){
      this.resT+=dt;
      while(this.residual.length&&this.residual[0].due<=this.resT)
        this.spawn(this.residual.shift())}
    if(!this.active){
      this.cd-=dt;
      if(this.cd<=0)this.start(this.n+1);
      return}
    this.t+=dt;
    while(this.queue.length&&this.queue[0].t<=this.t)this.spawn(this.queue.shift());
    if(!this.queue.length&&!this.residual.length&&enemies.length===0){
      this.active=false;
      this.finish()}
  },
  canSkip(){const maxW=(G.mode.waves===Infinity)?ENDLESS_LAST_WAVE:G.mode.waves;
    return this.active&&this.t>10&&this.n<maxW},
  skip(){
    if(!this.canSkip())return;
    const n=this.n;const bonus=Math.round((100+25*n)*G.mode.moneyMul);
    G.cash+=bonus;
    this.farmPay();
    toast('Wave '+n+' cleared  +$'+bonus+' — next wave in 3s');
    // hand whatever is still scheduled over to the residual clock instead of
    // deleting it, then close the wave out
    for(const s of this.queue)
      this.residual.push({due:this.resT+Math.max(0,s.t-this.t),
        big:s.big,type:s.type,hpMul:s.hpMul});
    this.residual.sort(function(a,b){return a.due-b.due});
    this.queue=[];
    this.active=false;
    this.cd=3},
  finish(){const n=this.n;const bonus=Math.round((100+25*n)*G.mode.moneyMul);
    G.cash+=bonus;
    this.farmPay();
    toast('Wave '+n+' cleared  +$'+bonus);
    if(G.mode.id==='endless'){
      const bid=ENDLESS_BADGE_WAVES[n];
      if(bid&&!SV.badges[bid]){SV.badges[bid]=true;Save.save();
        const bd=BADGES.find(b=>b.id===bid);
        if(bd)toast('Badge earned: '+bd.name+'!')}
      // the endless board only ever moves forward, so a new record is worth a report
      if(n>SV.lbEndlessWave){SV.lbEndlessWave=n;Save.save();lbReport()}
      if(n===ENDLESS_CHALLENGE_WAVE&&G.secret==='pending'){openChallenge();return}
      if(n>=ENDLESS_LAST_WAVE&&G.secret==='accepted'){startEnding();return}}
    if(n>=G.mode.waves){victory();return}
    this.cd=10},
  remaining(){return this.queue.length+this.residual.length+enemies.length}
};