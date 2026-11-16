"use strict";
// ============================================================
//  music.js — the score: the multiplayer lobby, victory, defeat, the ending
//
//  Everything is synthesized, so the game still ships no audio files. A track
//  is a short score laid out on a grid of sixteenth steps: one token per step,
//  '.' rests, '-' holds the note before it, 'x' is a hit for the unpitched
//  drum voices. A pitched token is either a note with an octave ('A4', 'F#3')
//  or a chord with none ('Am', 'Bb', 'Dm7'), a chord being rooted where the
//  pads want to sit. Written that way the melodies below stay readable as
//  melodies instead of tables of frequencies.
// ============================================================

const SEMI={c:0,'c#':1,db:1,d:2,'d#':3,eb:3,e:4,f:5,'f#':6,gb:6,g:7,'g#':8,ab:8,a:9,'a#':10,bb:10,b:11};
const SHAPES={maj:[0,4,7],m:[0,3,7],dim:[0,3,6],sus:[0,5,7],aug:[0,4,8],
  maj7:[0,4,7,11],m7:[0,3,7,10],dom7:[0,4,7,10]};
const NOTE_RE=/^([a-g])(#|b)?(-?\d)$/i,
      CHORD_RE=/^([a-g])(#|b)?(m7|maj7|dim|sus|aug|m|maj)?(7)?(\d)?$/i;
const midiHz=m=>440*Math.pow(2,(m-69)/12);
// Every token answers with an array of frequencies, so a voice never has to
// care whether it was given a note or a chord.
function tokHz(tok){
  let m=NOTE_RE.exec(tok);
  if(m)return[midiHz(12*(+m[3]+1)+SEMI[m[1].toLowerCase()+(m[2]||'').toLowerCase()])];
  m=CHORD_RE.exec(tok);
  if(!m)return null;
  const root=SEMI[m[1].toLowerCase()+(m[2]||'').toLowerCase()],shape=m[3]||(m[4]?'dom7':'maj');
  // Chords are written without an octave and rooted at 3; add one to move it.
  const oct=m[5]==null?3:+m[5],steps=SHAPES[shape]||SHAPES.maj;
  return steps.map(s=>midiHz(12*(oct+1)+root+s))}

// One voice pattern -> hits. A pattern has to be exactly `bars` x 16 tokens:
// a short one would not loop early, it would simply leave the rest of the
// loop silent, which is the easiest way for a score to rot unnoticed.
function parsePattern(pat,bars){
  const toks=pat.trim().split(/\s+/),cells=bars*16,out=[];
  if(toks.length!==cells)
    throw new Error('music: '+toks.length+' steps written into a '+cells+'-step loop');
  for(let i=0;i<toks.length;i++){
    const t=toks[i];
    if(t==='.'||t==='-')continue;
    // 'x' is a hit with no pitch — the drum voices have nothing to tune.
    const hz=t==='x'?null:tokHz(t);
    if(t!=='x'&&!hz)throw new Error('music: bad token "'+t+'"');
    let dur=1,j=i+1;
    while(toks[j]==='-'){dur++;j++}
    out.push({step:i,hz:hz,dur:dur})}
  return out}

// ---- voices ---------------------------------------------------------------
// Deliberately blunt: an oscillator, a filter, an envelope, and a shared
// reverb send. A generated impulse is what turns that into a place.
function tone(o){
  const ctx=Music.ctx,dest=o.dest,t=o.t,d=o.d||.25,g=o.g==null?.2:o.g;
  const osc=ctx.createOscillator(),gn=ctx.createGain();
  osc.type=o.w||'square';osc.frequency.setValueAtTime(o.f,t);
  if(o.detune)osc.detune.value=o.detune;
  // Percussive hits snap, held notes lean in. Without the difference a pad of
  // detuned sawtooths arrives with a click.
  const atk=o.a==null?(d>.12?.05:.004):o.a;
  gn.gain.setValueAtTime(0,t);
  gn.gain.linearRampToValueAtTime(g,t+atk);
  gn.gain.setTargetAtTime(0,t+atk,.08+d*.3);
  if(o.lp){
    const fl=ctx.createBiquadFilter();fl.type='lowpass';
    fl.frequency.value=o.lp;fl.Q.value=o.q||.8;
    osc.connect(fl);fl.connect(gn)}
  else osc.connect(gn);
  gn.connect(dest);
  if(o.send)Music.wet(gn,o.send);
  osc.start(t);osc.stop(t+d+.5)}

function chord(o,list){
  // Spread the voices a few cents apart so a triad does not read as one loud note.
  for(let i=0;i<list.length;i++)
    tone(Object.assign({},o,{f:list[i],detune:(i-(list.length-1)/2)*8}))}

function drum(o){
  const ctx=Music.ctx,t=o.t;
  if(o.k==='kick'){
    const osc=ctx.createOscillator(),gn=ctx.createGain();
    osc.type='sine';osc.frequency.setValueAtTime(o.f||150,t);
    osc.frequency.exponentialRampToValueAtTime(44,t+.11);
    gn.gain.setValueAtTime(o.g||.5,t);
    gn.gain.exponentialRampToValueAtTime(.001,t+(o.d||.2));
    osc.connect(gn);gn.connect(o.dest);
    if(o.send)Music.wet(gn,o.send);
    osc.start(t);osc.stop(t+.4);return}
  const dur=o.d||(o.k==='hat'?.045:.13),n=Math.floor(ctx.sampleRate*dur),
    src=ctx.createBufferSource(),fl=ctx.createBiquadFilter(),gn=ctx.createGain();
  src.buffer=Music.noise(n);
  fl.type=o.k==='hat'?'highpass':'bandpass';
  fl.frequency.value=o.f||(o.k==='hat'?7600:1900);fl.Q.value=o.q||1.1;
  gn.gain.setValueAtTime(o.g||.15,t);
  gn.gain.exponentialRampToValueAtTime(.001,t+dur);
  src.connect(fl);fl.connect(gn);gn.connect(o.dest);
  if(o.send)Music.wet(gn,o.send);
  src.start(t);src.stop(t+dur+.05)}

// ---- the score ------------------------------------------------------------
const TRACKS={
  // Staging Area: waiting on a second player and a host who has not started.
  lobby:{
    bpm:92,bars:2,g:.5,voices:[
      {v:'bass', pat:'A1 - - - A1 - - - E1 - - - A1 - - - F1 - - - F1 - - - C2 - - - G1 - - -',g:.3},
      {v:'pad',  pat:'Am - - - - - - - - - - - - - - - F - - - - - - - - - - - - - - -',g:.09,send:.5},
      {v:'arp',  pat:'A4 . C5 . E5 . C5 . A4 . C5 . E5 . G5 . F4 . A4 . C5 . A4 . E5 . G5 . C5 . B4 .',g:.07,send:.4},
      {v:'hat',  pat:'. . . x . . . x . . . x . . . x . . . x . . . x . . . x . . . x',g:.04},
      {v:'kick', pat:'x . . . . . . . x . . . . . . . . . . . x . . . . . . . . . . x',g:.2}
    ]},
  // The Line Holds: a march home, and deliberately a little corny.
  win:{
    bpm:128,bars:2,g:.55,voices:[
      {v:'bass', pat:'C2 . C2 . G1 . C2 . A1 . A1 . G1 . G1 . F1 . F1 . C2 . F1 . G1 . G1 . C2 . C2 .',g:.26},
      {v:'pad',  pat:'C - - - - - - - - - - - - - - - F - - - - - - - - - - - - - - -',g:.1,send:.5},
      {v:'lead', pat:'G4 . C5 . E5 . G5 . E5 . C5 . D5 . E5 . F5 . E5 . D5 . C5 . A4 . C5 . G4 - - -',g:.13,send:.3},
      {v:'kick', pat:'x . . . x . . . x . . . x . . . x . . . x . . . x . x . x . x .',g:.3},
      {v:'snare',pat:'. . . . x . . . . . . . x . . . . . . . x . . . x x x x . . . .',g:.07}
    ]},
  // Ashes: the lobby's own key, emptied out.
  lose:{
    bpm:66,bars:2,g:.45,voices:[
      {v:'bass', pat:'A1 - - - - - - - - - - - - - - - F1 - - - - - - - - - - - - - - -',g:.28},
      {v:'pad',  pat:'Am - - - - - - - - - - - - - - - E - - - - - - - - - - - - - - -',g:.11,send:.6},
      {v:'lead', pat:'A4 - - - E4 - - - C4 - - - - - - - B3 - - - C4 - - - G3 - - - - - - -',g:.1,send:.5},
      {v:'kick', pat:'x . . . . . . . . . . . . . . . x . . . . . . . . . . . . . . .',g:.22,send:.4}
    ]},
  // It.. Ends?: written to be heard underneath the ending itself. F - Dm - Bb - C
  // lifts out of the minor, the snare rolls into the fourth bar, and the loop
  // carries that resolution onto the result card.
  secret:{
    bpm:78,bars:4,g:.5,voices:[
      {v:'pad',  pat:'F - - - - - - - - - - - - - - - Dm - - - - - - - - - - - - - - - Bb - - - - - - - - - - - - - - - C - - - - - - - - - - - - - - -',g:.12,send:.7},
      {v:'arp',  pat:'F4 . . . A4 . . . C5 . . . A4 . . . D4 . . . F4 . . . A4 . . . F4 . . . Bb4 . . . D5 . . . F5 . . . D5 . . . C5 . . . E5 . . . G5 . . . E5 . . .',g:.08,send:.5},
      {v:'bass', pat:'F1 - - - - - - - - - - - - - - - D2 - - - - - - - - - - - - - - - Bb1 - - - - - - - - - - - - - - - C2 - - - - - - - - - - - - - - -',g:.26},
      {v:'kick', pat:'x . . . . . . . . . . . . . . . x . . . . . . . . . . . . . . . x . . . . . . . x . . . . . . . x . . . x . . . x . . . x . . .',g:.28,send:.4},
      {v:'snare',pat:'. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . x x x x x x x x . . . . . . . . . . . . . . . .',g:.06}
    ]}
};

const Music={
  ctx:null,bus:null,space:null,timer:null,g:null,
  name:null,want:null,playing:false,
  buckets:null,stepDur:0,barDur:0,loopBars:0,barIdx:0,nextBar:0,

  // A second and a half of decaying noise, used as a convolution impulse: the
  // difference between beeps and a room.
  impulse(ctx){
    const dur=1.8,n=Math.floor(ctx.sampleRate*dur),buf=ctx.createBuffer(2,n,ctx.sampleRate);
    for(let c=0;c<2;c++){const ch=buf.getChannelData(c);
      for(let i=0;i<n;i++)ch[i]=(Math.random()*2-1)*Math.pow(1-i/n,2.6)}
    return buf},
  // One shared burst of white noise per length for every drum. It has to be an
  // AudioBuffer, not the raw samples: a BufferSource will not accept anything
  // else, and building one per hit would be the expensive part of a hi-hat.
  noise(n){
    this._nb=this._nb||{};
    if(this._nb[n])return this._nb[n];
    const ctx=this.ctx,b=ctx.createBuffer(1,n,ctx.sampleRate),ch=b.getChannelData(0);
    for(let i=0;i<n;i++)ch[i]=Math.random()*2-1;
    return this._nb[n]=b},
  // Send one voice node into the reverb at a given depth.
  wet(node,amt){
    if(!this.space)return;
    const g=this.ctx.createGain();g.gain.value=amt;node.connect(g);g.connect(this.space)},
  apply(){
    if(this.bus)this.bus.gain.value=(SV.vol/100)*((SV.music==null?60:SV.music)/100)*.5},

  // Reached from Sfx.init(): an AudioContext only exists after a real gesture,
  // so any request made before the first one waits here and then starts.
  arm(ctx){
    this.ctx=ctx;
    if(this.bus){this.apply();if(this.want)this.play(this.want);return}
    try{
      this.bus=ctx.createGain();this.bus.connect(ctx.destination);
      this.space=ctx.createConvolver();this.space.buffer=this.impulse(ctx);
      const wet=ctx.createGain();wet.gain.value=.85;
      this.space.connect(wet);wet.connect(ctx.destination);
      this.apply()}
    catch(e){this.bus=null;this.space=null}   // no convolution: play dry
    if(this.want)this.play(this.want)},

  play(name){
    if(!TRACKS[name]){this.stop();return}
    if(this.name===name&&(this.playing||this.want===name))return;
    this.name=name;this.want=name;
    if(!this.ctx)Sfx.init();
    if(!this.ctx)return;             // still waiting on a gesture
    this.start(name)},

  // Start something only if nothing has been asked for — used by the ending,
  // whose score is already running by the time the result card appears.
  rest(name){if(!this.name&&!this.want)this.play(name)},

  start(name){
    const tr=TRACKS[name];if(!tr||!this.ctx)return;
    this.kill();
    this.playing=true;this.want=null;
    const ctx=this.ctx,step=60/tr.bpm/4,bars=tr.bars,buckets=[];
    this.stepDur=step;this.barDur=step*16;this.loopBars=bars;
    for(let i=0;i<bars;i++)buckets.push([]);
    for(const voice of tr.voices){
      const timbre={v:voice.v,g:voice.g,send:voice.send};
      for(const e of parsePattern(voice.pat,bars))
        buckets[Math.floor(e.step/16)%bars]
          // the bucket holds the parsed hit — the voice's own object has no
          // pitch to read, and mixing the two up silences every melody line
          .push({o:Object.assign({hz:e.hz},timbre),off:(e.step%16)*step,
            dur:Math.max(.09,e.dur*step*(voice.gate||1.7))});
    }
    this.buckets=buckets;
    const g=ctx.createGain();
    g.gain.setValueAtTime(0,ctx.currentTime);
    // The bed fades in rather than arriving — a cut at a screen boundary is
    // exactly what the ending spends fifteen seconds avoiding.
    g.gain.linearRampToValueAtTime(tr.g,ctx.currentTime+.6);
    g.connect(this.bus);this.g=g;
    this.barIdx=0;this.nextBar=ctx.currentTime+.06;
    if(!this.timer)this.timer=setInterval(()=>this.tick(),80)},

  tick(){
    const ctx=this.ctx;if(!this.playing||!ctx||!this.buckets)return;
    // One bar of lookahead per pass: enough to survive a frame hitch without
    // committing the next several seconds to the graph.
    while(this.nextBar<ctx.currentTime+this.barDur+1.2){
      const t0=this.nextBar,bucket=this.buckets[this.barIdx%this.loopBars];
      if(t0>ctx.currentTime-.05)
        for(const e of bucket)this.emit(e.o,t0+e.off,e.dur);
      this.nextBar+=this.barDur;this.barIdx++}},

  emit(o,t,d){
    const base={dest:this.g,t:t,d:d,g:o.g==null?.12:o.g,send:o.send};
    // Drum voices are written as bare hits, so they have no pitch to read —
    // routing one into `chord` would iterate undefined and throw every bar.
    switch(o.v){
      case 'kick': drum(Object.assign(base,{k:'kick',f:150}));break;
      case 'snare':drum(Object.assign(base,{k:'snare',d:Math.min(d,.15)}));break;
      case 'hat':  drum(Object.assign(base,{k:'hat',d:Math.min(d,.05)}));break;
      case 'bass': chord(Object.assign(base,{w:'triangle',lp:360}),o.hz);break;
      case 'pad':  chord(Object.assign(base,{w:'sawtooth',lp:1200,a:.4}),o.hz);break;
      case 'arp':  chord(Object.assign(base,{w:'square',lp:2400}),o.hz);break;
      case 'lead': chord(Object.assign(base,{w:'sawtooth',lp:2200,a:.03}),o.hz);break;
      case 'bell': chord(Object.assign(base,{w:'sine',a:.005,send:o.send||.6}),o.hz);break;
    }},

  // Fade out and stop scheduling. The nodes go on ringing into the reverb for
  // their own tail, which is what makes a handover between cues feel like one
  // piece of music rather than two files butt-spliced.
  stop(){
    this.name=null;this.want=null;this.playing=false;
    if(this.g&&this.ctx){
      const g=this.g,t=this.ctx.currentTime;
      try{
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value,t);
        g.gain.linearRampToValueAtTime(0,t+.45)}catch(e){}
      setTimeout(((old)=>()=>{try{old.disconnect()}catch(e){}})(g),1200)}
    this.g=null;this.buckets=null;
    if(this.timer){clearInterval(this.timer);this.timer=null}},

  // Silence without remembering a request: leaving a lobby for a match.
  kill(){
    this.playing=false;this.buckets=null;this.g=null;
    if(this.timer){clearInterval(this.timer);this.timer=null}}
};

// Which bed belongs to which screen. Multiplayer has a waiting room to fill;
// the solo menus stay quiet and the match itself has its own sound.
const MUSIC_FOR={mpMenu:'lobby',mpModeMenu:'lobby',mpLobby:'lobby',
  // The endings are cued by victory(), defeat() and startEnding() on the way
  // in, so showScreen must not decide them a second time.
  endMenu:'keep',mpEnd:'keep',challengeMenu:'keep',pauseMenu:'keep',
  settingsMenu:'keep',confirmModal:'keep'};
function musicForScreen(id){
  const t=MUSIC_FOR[id];
  if(t==='keep')return;
  if(t)Music.play(t);
  else if(Music.name)Music.stop()}

// Same convention the command bar uses: a const object at top level is not a
// window property, and everything that guards on it reads better than a
// try/catch around a name that may not have loaded.
window.Music=Music;
