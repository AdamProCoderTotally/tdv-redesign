"use strict";
// ============================================================
//  audio.js — all sound effects, synthesized with WebAudio
// ============================================================
const Sfx={
  ctx:null,master:null,lastShot:0,
  init(){if(this.ctx){if(this.ctx.state==='suspended')this.ctx.resume();
      if(typeof Music!=='undefined')Music.arm(this.ctx);return}
    try{this.ctx=new (window.AudioContext||window.webkitAudioContext)();
      this.master=this.ctx.createGain();this.master.connect(this.ctx.destination);this.apply();
      // The context only exists once something has been clicked, which is also
      // the earliest any screen's music request can honestly be honoured.
      if(typeof Music!=='undefined')Music.arm(this.ctx)}catch(e){}},
  apply(){if(this.master)this.master.gain.value=(SV.vol/100)*(SV.sfx/100)*0.55;
    if(typeof Music!=='undefined')Music.apply()},
  tone(f,d,type,v,slide){if(!this.ctx)return;const t=this.ctx.currentTime;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type||'square';o.frequency.setValueAtTime(f,t);
    if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,f+slide),t+d);
    g.gain.setValueAtTime(v||.5,t);g.gain.exponentialRampToValueAtTime(.001,t+d);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+d)},
  noise(d,v,fq){if(!this.ctx)return;const t=this.ctx.currentTime,n=Math.floor(this.ctx.sampleRate*d),
    buf=this.ctx.createBuffer(1,n,this.ctx.sampleRate),ch=buf.getChannelData(0);
    for(let i=0;i<n;i++)ch[i]=(Math.random()*2-1)*(1-i/n);
    const s=this.ctx.createBufferSource();s.buffer=buf;
    const f=this.ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=fq||1200;
    const g=this.ctx.createGain();g.gain.value=v||.4;s.connect(f);f.connect(g);g.connect(this.master);s.start(t)},
  click(){this.tone(660,.05,'square',.2);this.tone(990,.04,'square',.12)},
  place(){this.tone(220,.1,'square',.3,-80);this.noise(.08,.2,800)},
  shoot(){const n=performance.now();if(n-this.lastShot<70)return;this.lastShot=n;this.tone(rnd(700,900),.05,'square',.08,-300)},
  boom(){this.noise(.35,.5,700);this.tone(90,.3,'triangle',.4,-50)},
  hit(){this.tone(rnd(300,380),.04,'square',.07,-60)},
  die(){this.tone(200,.12,'triangle',.2,-120);this.noise(.07,.12,2000)},
  up(){this.tone(440,.08,'square',.25);setTimeout(()=>this.tone(660,.1,'square',.25),70)},
  wave(){this.tone(330,.12,'square',.3);setTimeout(()=>this.tone(494,.12,'square',.3),110);setTimeout(()=>this.tone(659,.2,'square',.3),220)},
  boss(){this.tone(80,.6,'sawtooth',.4,-30);this.noise(.5,.3,300)},
  leak(){this.tone(160,.25,'sawtooth',.35,-90)},
  over(){[392,330,262,196].forEach((f,i)=>setTimeout(()=>this.tone(f,.3,'triangle',.35),i*220))},
  win(){[523,659,784,1047].forEach((f,i)=>setTimeout(()=>this.tone(f,.25,'square',.3),i*160))}
};