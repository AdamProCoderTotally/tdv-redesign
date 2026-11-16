"use strict";
// ============================================================
//  particles.js — particle effects (dots, smoke, text, rings)
// ============================================================
const parts=[];const partCap=()=>SV.particles?650:260;
function addPart(p){if(parts.length>=partCap()){if(p.type==='txt')return;if(parts.length>200)parts.splice(0,60)}parts.push(p)}
function ftext(x,y,txt,color){addPart({type:'txt',x:x,y:y,txt:txt,color:color||'#fff',t:0,life:.85,vy:-26})}
function burst(x,y,color,n,spd,life,size){if(!SV.particles)n=Math.ceil(n/3);
  n=n||8;spd=spd||40;life=life||.5;size=size||3;
  for(let i=0;i<n;i++){const a=rnd(Math.PI*2),s=rnd(spd*.3,spd);
    addPart({type:'dot',x:x,y:y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-14,t:0,life:rnd(life*.5,life),color:color,size:rnd(size*.6,size)})}}
function smoke(x,y,n){if(!SV.particles)n=1;n=n||4;
  for(let i=0;i<n;i++)
    addPart({type:'smoke',x:x+rnd(-4,4),y:y+rnd(-4,4),vx:rnd(-6,6),vy:rnd(-22,-10),t:0,life:rnd(.6,1.1),size:rnd(3,6)})}
function ringFX(x,y,r,color){addPart({type:'ring',x:x,y:y,r:r,t:0,life:.4,color:color})}
// ART V2: sprite-sheet effects (muzzle, spark, explosion, deathpuff) from js/artpack.js
function fxSprite(name,x,y,opts){if(typeof ART==='undefined'||!ART_V2||!ART.fx[name])return false;const s=ART.fx[name];
  addPart(Object.assign({type:'spr',spr:s,x:x,y:y,t:0,life:(s.frames?s.frames.length:1)/(s.fps||12),flip:false},opts||{}));return true}
function updParts(dt){for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.t+=dt;
  if(p.t>=p.life){parts[i]=parts[parts.length-1];parts.pop();continue}
  if(p.type==='dot'||p.type==='smoke'){p.x+=p.vx*dt;p.y+=p.vy*dt;
    if(p.type==='dot')p.vy+=60*dt;else p.vy-=8*dt}
  else if(p.type==='txt')p.y+=p.vy*dt}}
function drawParts(g){for(const p of parts){const a=1-p.t/p.life;g.globalAlpha=a;
  if(p.type==='dot'){if(SV.particles&&hyp(p.vx,p.vy)>35){g.strokeStyle=p.color;g.lineWidth=Math.max(1,p.size*.45);g.beginPath();g.moveTo(p.x-p.vx*.025,p.y-p.vy*.025);g.lineTo(p.x,p.y);g.stroke()}g.fillStyle=p.color;const s=Math.max(1,p.size*a);g.fillRect(p.x-s/2,p.y-s/2,s,s)}
  else if(p.type==='smoke'){g.fillStyle='#78817c';const s=p.size*(1+p.t);g.fillRect(p.x-s/2,p.y-s/2,s,s);
    if(SV.particles){g.globalAlpha=a*.35;g.fillStyle='#bdc1ab';g.fillRect(p.x-s*.3,p.y-s*.55,s*.6,s*.3)}}
  else if(p.type==='ring'){g.strokeStyle=p.color;g.lineWidth=2;const r=p.r*(p.t/p.life);g.beginPath();
    g.ellipse(p.x,p.y,r,r/2,0,0,Math.PI*2);g.stroke();
    if(SV.particles){g.globalAlpha=a*.25;g.lineWidth=4;g.stroke();
      g.globalAlpha=a*.6;g.strokeStyle='#f1d8ae';g.lineWidth=1;g.beginPath();g.ellipse(p.x,p.y,r*.82,r*.41,0,0,Math.PI*2);g.stroke()}}
  else if(p.type==='spr'){g.globalAlpha=1;artBlit(g,p.spr,Math.floor(p.t/p.life*(p.spr.frames?p.spr.frames.length:1)),p.x,p.y,p.flip,null,p.sc||1)}
  else if(p.type==='txt'){g.font="bold 11px 'Silkscreen','Pixelify Sans',monospace";
    g.textAlign='center';g.fillStyle='#000';g.fillText(p.txt,p.x+1,p.y+1);
    g.fillStyle=p.color;g.fillText(p.txt,p.x,p.y)}
  g.globalAlpha=1}}
