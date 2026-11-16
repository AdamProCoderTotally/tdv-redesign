"use strict";
// Presentation only. World geometry, damage and acquisition never read these sizes.
const BOSS_ART={tank:[1.45,1.15],rtank:[1.6,1.25],fbrute:[1.65,1.4],wfbrute:[1.25,1.1],
  crawler:[2.1,1.15],rmmolten:[1.45,1.5],oknight:[1.35,1.65],mking:[1.7,1.9],
  oking:[1.85,2.15],endbringer:[2.3,2.65],silent_exec:[1.05,1.5],stealth_tunneller:[1.45,1.1],
  faceless:[1.4,1.95],fallen_oking:[1.8,1.85],the_unseen:[1.35,2.25],necro_monarch:[1.55,1.9],
  deformed_king:[2,1.85],endbringer_guardian:[1.95,2.25],error_void_leak:[1.55,1.7],the_misplaced:[2.5,2.05]};
function enemyArt(c){const s=BOSS_ART[c.kind]||[1,1];
  if(typeof artEnemySprite==='function'){const a=artEnemySprite(c);if(a){const k=a.px||1,t=typeof artBounds==='function'?artBounds(a,0).y:0;return {x:1,y:1,height:(a.ay-t+3)*k,width:a.w*.8*k}}}
  if(c.sprite)return {x:1,y:1,height:c.sprite.h*c.r*2.2/c.sprite.w+8,width:c.r*2.2};
  return {x:s[0],y:s[1],height:(c.r*2.8+26)*s[1],width:(c.r*2.8+12)*s[0]}}
function artRect(g,x,y,w,h,c){g.fillStyle=c;g.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)))}
function artPoly(g,pts,c){g.fillStyle=c;g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();g.fill()}
function artShadow(g,x,y,w){g.fillStyle='#080e1938';g.beginPath();g.ellipse(x,y,w,w*.32,0,0,Math.PI*2);g.fill()}
const WEAPON_ART={ranger:{length:29,color:'#c2c9b1'},sniper:{length:39,color:'#79c7f2'},grenadier:{length:25,color:'#edb66c'},
  phaser:{length:30,color:'#7edfff'},viper:{length:29,color:'#a7ee66'},voidtraitor:{length:41,color:'#d4a1ff'}};
function visualType(type){return TOWERS[type]&&TOWERS[type].prestige||type}
function weaponPose(t,gi=0,angle){
  const type=visualType(t.type),d=TOWERS[t.type]||{},v=WEAPON_ART[type]||{length:24};
  const a=angle===undefined?(t.gunAim&&type==='viper'?t.gunAim[gi]:t.aim)||0:angle;
  const custom=d.sprite&&d.turret,sc=d.sprite&&(d.sprite.scale||1.3);
  const tip=custom?[(d.turret.tip?d.turret.tip[0]:d.turret.w)-(d.turret.ox||2),
    (d.turret.tip?d.turret.tip[1]:d.turret.h/2)-(d.turret.oy||d.turret.h/2)]:[v.length,0];
  const recoil=custom?0:Math.max(0,type==='viper'?(t.gunFlash&&t.gunFlash[gi]||0):(t.flashT||0))*18;
  const x=mapPx(t.x||0,t.y||0),y=mapPy(t.x||0,t.y||0)-elevAt(t.x||0,t.y||0)*ELEVH-(custom?(d.legs===false?14:21):23)-(gi?6:0);
  const tx=tip[0]*(custom?sc:1)-recoil,ty=tip[1]*(custom?sc:1)*(custom?1:Math.cos(a)<0?-1:1);
  return {x,y,a,recoil,length:v.length,mx:x+Math.cos(a)*tx-Math.sin(a)*ty,my:y+Math.sin(a)*tx+Math.cos(a)*ty};
}
function updateArtAim(t,dt){
  if(t.target&&!t.target.dead&&towerBehavior(t.type)!=='slug'){
    const p=weaponPose(t);t.aim=Math.atan2(t.target.sy-10-p.y,t.target.sx-p.x)}
  if(!t.artAim)t.artAim=[t.aim||0,t.aim||0];
  for(let i=0;i<2;i++){const goal=visualType(t.type)==='viper'&&t.gunAim?t.gunAim[i]:t.aim||0;
    const d=Math.atan2(Math.sin(goal-t.artAim[i]),Math.cos(goal-t.artAim[i]));
    t.artAim[i]+=d*(1-Math.exp(-dt*22));}
}
function weaponAimAt(t,e,gi=0){const p=weaponPose(t,gi);return Math.atan2(mapPy(e.px,e.py)-10-p.y,mapPx(e.px,e.py)-p.x)}
function drawFieldWeapon(g,type,t,time,gi){
  const v=WEAPON_ART[type],pose=weaponPose(t,gi),a=t.artAim?t.artAim[gi]:pose.a;
  // During emission use the exact pose used by the projectile, not a trailing interpolation.
  const firing=type==='viper'?(t.gunFlash&&t.gunFlash[gi]>0):t.flashT>0;
  const charging=t.chargeT>0,ang=firing||t.beamOn||charging?pose.a:a,flip=Math.cos(ang)<0?-1:1;
  const tier=Math.max(0,...(t.ups||[0])),lane=(t.ups&&t.ups[1]||0)>(t.ups&&t.ups[0]||0)?1:0;
  const gold=!!TOWERS[t.type].prestige,metal=gold?'#b58b3c':'#4b5c68',hi=gold?'#ffe09a':'#98aeb5';
  const col=towerTint(t);const R=(x,y,w,h,c)=>artRect(g,x,y,w,h,col?tintCol(c,col):c);
  g.save();g.translate(pose.x,pose.y);g.rotate(ang);g.scale(1,flip);g.translate(-pose.recoil,0);
  if(type==='voidtraitor'){
    const phase=firing?1-t.flashT/.18:0;g.rotate(firing?-.8+phase*1.6:0);
    R(-10,-2,15,5,'#30263c');R(1,-8,4,17,'#ae89c4');
    artPoly(g,[[5,-5],[36+ tier,-4],[43+tier,0],[36+tier,4],[5,5]],'#40334f');
    R(7,-3,29+tier,2,'#dcb7ff');R(7,2,26+tier,1,'#796197');
    for(let i=0;i<tier;i++)R(10+i*5,-1,2,3,'#f6dfff');
  }else{
    R(-12,-3,9,7,gold?'#795622':'#3b302a');R(-12,-3,8,1,hi);
    R(-4,-5,17,10,metal);R(-3,-5,15,2,hi);R(-3,4,15,1,'#18232e');
    R(1,5,4,6,'#23303a');R(6,5,5,8,metal);R(6,5,1,7,hi);
    R(13,-3,v.length-15,5,metal);R(13,-3,v.length-15,1,hi);R(v.length-3,-4,3,7,'#17212d');
    if(type==='sniper'){R(0,-11,19,5,'#22313c');R(1,-11,17,1,hi);R(18,-10,2,3,v.color);R(22,3,2,7,metal)}
    if(type==='grenadier'){R(3,4,10,9,'#27313a');R(5,5,6,2,'#a0a88d');for(let i=0;i<3;i++)R(14+i*3,-4,1,8,hi)}
    if(type==='phaser'||type==='viper'||type==='sniper'&&lane===0&&tier>=3){
      for(let i=0;i<3;i++)R(12+i*4,-4,2,7,v.color);R(1,-3,8,3,v.color);R(2,-3,3,1,'#edffff')}
    if(tier>=2){R(-2,-8,10,3,metal);R(6,-7,2,2,v.color)}
    if(tier>=4){R(8,6,4,9,metal);R(8,6,1,7,hi);R(16,-6,7,2,lane?'#d7ba78':v.color)}
    // Gloves stay attached to the grip and fore-end through the entire rotation.
    R(-4,2,5,4,gold?'#9d752f':'#333d35');R(15,1,5,4,gold?'#9d752f':'#333d35');
    if(firing){artPoly(g,[[v.length,-5],[v.length+5,-2],[v.length+10,0],[v.length+5,2],[v.length,5]],v.color);
      R(v.length,-1,7,2,'#fff8df')}
  }
  if(type==='voidtraitor'&&firing&&SV.particles){
    g.strokeStyle='#d9b3ff';g.lineWidth=2;g.beginPath();g.arc(0,0,36+tier,-.9,.9);g.stroke();
    g.globalAlpha=.25;g.lineWidth=7;g.stroke();g.globalAlpha=1;
  }
  g.restore();
}
function drawFieldTower(g,type,mx,my,t,time){
  if(!TOWERS[type]||TOWERS[type].sprite)return false;
  if(typeof drawArtTower==='function'&&drawArtTower(g,type,mx,my,t,time))return true;   // ART V2
  const base=visualType(type),tier=Math.max(0,...(t&&t.ups||[0]));
  if(!WEAPON_ART[base]&&base!=='farm'&&base!=='village')return false;
  t=t||{type,ups:[0],aim:-Math.PI/4};
  // The same artist is used by icons, placement ghosts and the live board.
  const fake=Object.assign({},t,{type,x:t.x||0,y:t.y||0});
  const p=weaponPose(fake);g.save();g.translate(mx-p.x,my-(p.y+23));
  if(base==='farm'||base==='village'){g.restore();drawFieldSettlement(g,base,mx,my,t,time);return true}
  const branch=(t.ups&&t.ups[1]||0)>(t.ups&&t.ups[0]||0)?1:0;
  const gold=!!TOWERS[type].prestige,colors={ranger:['#334c3e','#65856a','#c7d9ad'],grenadier:['#493a37','#8b6255','#bfc3ac'],
    sniper:['#2d433e','#597564','#b4c29b'],viper:['#23453c','#438c59','#b5ed73'],phaser:['#26394e','#536982','#f3cd75'],voidtraitor:['#292039','#57406e','#ca9af1']};
  let [dark,mid,light]=gold?['#684b24','#bc9145','#ffe5a0']:colors[base];
  const tint=towerTint(t),R=(x,y,w,h,c)=>artRect(g,p.x+x,p.y+23+y,w,h,tint?tintCol(c,tint):c);
  artShadow(g,p.x,p.y+25,15);
  // Rear weapon is occluded by shoulders when aimed away.
  const exactPose=fake.flashT>0||fake.beamOn||fake.chargeT>0;
  const back=Math.sin(!exactPose&&fake.artAim?fake.artAim[0]:fake.aim)<-.15;
  if(base==='viper'&&t.S&&t.S.guns>1)drawFieldWeapon(g,base,fake,time,1);
  if(back)drawFieldWeapon(g,base,fake,time,0);
  R(-8,-5,6,5,'#1b252d');R(3,-5,6,5,'#1b252d');R(-7,-15,5,11,dark);R(3,-15,5,11,dark);
  R(-7,-9,5,3,mid);R(3,-9,5,3,mid);R(-10,-31,20,17,dark);R(-8,-30,16,13,mid);
  R(-8,-30,16,2,light);R(-2,-28,4,14,dark);R(-9,-16,18,3,'#263039');
  R(-14,-30,5+tier*.4,7,dark);R(9,-30,5+tier*.4,7,dark);R(-14,-30,5,2,light);R(9,-30,5,2,light);
  for(let i=0;i<3;i++){R(-8+i*6,-23,4,5,dark);R(-8+i*6,-23,4,1,light)}
  if(base==='sniper'||base==='voidtraitor'){
    artPoly(g,[[p.x-11,p.y-10],[p.x+11,p.y-10],[p.x+15,p.y+19],[p.x+6,p.y+16],[p.x,p.y+21],[p.x-14,p.y+18]],dark);
    for(let i=0;i<5;i++)R(-10+i*5,-24+i%2*3,2,14,mid)}
  R(-8,-43,16,13,dark);R(-7,-43,14,3,base==='phaser'?light:mid);R(-5,-39,10,7,'#15212b');
  R(-4,-37,8,2,base==='viper'?'#b5ed73':base==='voidtraitor'?'#ddbbff':base==='phaser'?'#ff715d':'#c4dce1');
  R(-7,-32,14,3,mid);R(-10,-38,3,7,dark);R(7,-38,3,7,dark);
  if(base==='grenadier')for(let i=0;i<4;i++){R(-9+i*5,-27+i*2,3,5,'#303f38');R(-9+i*5,-27+i*2,3,1,'#e3c787')}
  if(base==='viper'){R(-12,-24,3,12,'#243b37');R(-11,-22,1,7,'#a5eb5a')}
  if(tier>=1)R(6,-42,3,3,light);
  if(tier>=2){R(-7,-27,3,8,light);R(5,-27,3,8,light)}
  if(tier>=3){R(-10,-48,2,10,mid);R(-10,-48,2,2,light);R(-5,-44,10,2,light)}
  if(tier>=4){R(-16,-30,4,10,mid);R(12,-30,4,10,mid);R(-16,-30,4,2,light);R(12,-30,4,2,light)}
  if(tier>=5){R(-3,-48,6,4,dark);R(-2,-48,4,2,light)}
  if(tier>=2&&branch===1){
    if(base==='ranger'){R(-11,-30,22,5,dark);R(-10,-30,20,2,light);R(-5,-35,10,3,'#1c2f35')}
    if(base==='grenadier'){R(-6,-35,12,7,'#323e43');R(-7,-34,3,5,'#afb4a0');R(4,-34,3,5,'#afb4a0');R(-2,-33,4,2,'#edaa62')}
    if(base==='sniper'){R(-14,-32,4,18,'#415164');R(-13,-32,2,14,'#8cabb9');R(-5,-39,10,3,'#79c7f2')}
    if(base==='viper'){R(-13,-25,4,10,'#547b70');R(-12,-24,2,7,'#c9e98c');R(10,-25,4,10,'#547b70')}
  }else if(tier>=2){
    if(base==='ranger'){R(-14,-23,5,12,'#353a32');for(let i=0;i<4;i++)R(-13,-22+i*3,3,1,'#d4b478')}
    if(base==='sniper'){R(-8,-41,16,3,'#3c5968');R(-6,-40,12,1,'#a4deef');R(-13,-28,3,12,'#79a3af')}
    if(base==='viper'){R(-14,-32,4,16,'#244438');R(-13,-29,2,10,'#beed71');R(10,-32,4,16,'#244438');R(11,-29,2,10,'#beed71')}
  }
  if(!back)drawFieldWeapon(g,base,fake,time,0);
  for(let i=0;i<Math.min(5,totalUps(t));i++)R(-13+i*6,7,4,2,'#f4cc81');
  g.restore();return true;
}
function drawFieldSettlement(g,type,x,y,t,time){
  const lv=Math.max(0,...(t&&t.ups||[0])),farm=type==='farm';
  const R=(a,b,w,h,c)=>artRect(g,x+a,y+b,w,h,c);
  artShadow(g,x,y+2,26);
  artPoly(g,[[x-26,y-4],[x,y-17],[x+27,y-3],[x,y+11]],farm?'#594530':'#7d7864');
  for(let i=0;i<6;i++){R(-22+i*8,-3+i%2*3,6,2,farm?'#3d3028':'#555e5b')}
  const house=(hx,hy,w,h,wall,roof)=>{
    R(hx,hy-h,w,h,wall);R(hx+w-5,hy-h,5,h,'#726e5d');R(hx,hy-h,2,h,'#e1cca0');
    R(hx,hy-2,w,3,'#4d524d');
    artPoly(g,[[x+hx-3,y+hy-h],[x+hx+w/2,y+hy-h-12],[x+hx+w+3,y+hy-h],[x+hx+w,y+hy-h+3],[x+hx-3,y+hy-h+3]],roof);
    for(let i=0;i<4;i++)R(hx+2+i*3,hy-h-3,2,2,'#ffffff20');
    R(hx+w/2-3,hy-10,6,10,'#373d3c');R(hx+w/2-2,hy-10,1,9,'#b7a37e');R(hx+w/2+1,hy-5,1,1,'#edc783');
    R(hx+3,hy-h+4,4,5,'#293e46');R(hx+3,hy-h+4,3,2,'#e8c77e');
  };
  if(farm){
    for(let row=0;row<3;row++)for(let col=0;col<4;col++){
      const xx=-23+col*5,yy=-9+row*5;R(xx,yy,4,2,'#302a23');R(xx+1,yy-5-lv*.4,1,6,'#699154');
      R(xx-1,yy-6-lv*.4,4,3,lv>=3?'#e9b656':'#b8c571');R(xx,yy-6-lv*.4,2,1,'#f6df97')}
    house(2,0,22,25,'#a54e3c','#493b3c');R(10,-21,7,6,'#e3c89a');R(12,-20,3,4,'#374b50');
    if(lv>=2){house(-10,-9,10,12,'#a28e63','#596d58');R(18,-37,3,10,'#8e9787')}
    if(lv>=4){R(-20,-17,25,2,'#abb7a6');for(let i=0;i<3;i++){R(-18+i*9,-19,2,15,'#728d8b');R(-18+i*9,-19,4,2,'#9dd4df')}}
    if(lv>=5){R(23,-32,5,30,'#717f79');R(23,-32,5,2,'#c2d1be');R(24,-28,3,3,'#b8e6a1')}
  }else{
    house(-10,-7,22,25,'#c2b18a','#405b6c');house(-24,1,15,16,'#a58b66','#4b6572');house(11,2,14,15,'#c8b995','#405b6c');
    R(-2,-47,6,12,'#8d9689');R(-4,-48,10,3,'#4d6978');R(-1,-44,2,3,'#263d47');
    R(1,-58,1,10,'#b5a37f');R(2,-57,8,4,'#d7b15f');R(2,-57,8,1,'#f1d48a');
    if(lv>=2){R(-24,2,49,2,'#a89b7a');R(-22,-5,2,8,'#c2b18a');R(22,-5,2,8,'#c2b18a')}
    if(lv>=3){R(-24,-9,12,3,'#b8774b');for(let i=0;i<4;i++)R(-24+i*3,-9,2,3,'#e2c48e');R(-23,-6,1,7,'#8e7754')}
    if(lv>=4){house(17,-12,10,28,'#98a293','#435b6c');R(18,-43,9,4,'#b8c2ad')}
    if(lv>=5){R(-6,-39,14,2,'#d7b15f');R(-4,-40,2,4,'#f4dc98');R(4,-40,2,4,'#f4dc98')}
  }
  for(let i=0;i<Math.min(5,totalUps(t));i++)R(-13+i*6,14,4,2,'#f4cc81');
}
const FIELD_DECO_CACHE=new Map();
function drawFieldDeco(g,d,time){
  if(typeof drawArtDeco==='function'&&drawArtDeco(g,d,time))return;   // ART V2
  const key=d.t+':'+Math.floor(d.s*12);let cv=FIELD_DECO_CACHE.get(key);
  if(!cv){cv=document.createElement('canvas');cv.width=96;cv.height=112;const q=cv.getContext('2d'),x=48,y=101;
    const R=(a,b,w,h,c)=>artRect(q,x+a,y+b,w,h,c),v=Math.floor(d.s*12),pal=TREE_PALS[v%3];
    if(d.t==='tree'){
      artShadow(q,x+4,y+1,23);R(-4,-36,8,37,'#443e30');R(-3,-36,3,35,'#887351');R(-7,-1,13,3,'#584b34');
      artPoly(q,[[x-3,y-20],[x-17,y-37],[x-15,y-41],[x+1,y-27],[x+13,y-44],[x+16,y-40],[x+4,y-16]],'#625139');
      for(let i=0;i<5;i++){const yy=-37-i*10,w=29-i*5;
        artPoly(q,[[x-w,y+yy+7],[x-w+5,y+yy-6],[x-3,y+yy-14],[x+w-6,y+yy-7],[x+w,y+yy+6],[x+8,y+yy+10]],pal[0]);
        R(-w+5,yy-4,w*1.5,7,pal[1]);R(-w+8,yy-5,w*.7,3,pal[2]);
        for(let j=0;j<4;j++){const xx=-w+5+hash2(v+i,j)*w*1.4;R(xx,yy+hash2(j+i,v)*5,3,2,j%2?pal[0]:pal[2])}}
    }else if(d.t==='rock'){
      artShadow(q,x,y,15);artPoly(q,[[x-14,y-2],[x-11,y-17],[x+2,y-22],[x+14,y-13],[x+17,y-2],[x+5,y+3]],'#555d60');
      artPoly(q,[[x-11,y-17],[x+2,y-22],[x+12,y-13],[x-1,y-9],[x-14,y-2]],'#9ca294');
      artPoly(q,[[x-1,y-9],[x+12,y-13],[x+17,y-2],[x+5,y+3]],'#727e79');R(-8,-15,8,2,'#c2c5af');
      R(-9,-2,6,3,pal[0]);R(10,-3,5,2,pal[1]);R(2,-12,1,9,'#485556');
    }else if(d.t==='bush'){
      artShadow(q,x,y,14);for(let i=0;i<4;i++){const xx=-14+i*7,yy=-9-(i%2)*5;
        R(xx,yy,9,10,pal[0]);R(xx+1,yy,7,6,pal[1]);R(xx+2,yy,4,2,pal[2]);if(v%3===0)R(xx+4,yy+4,2,2,'#d7a273')}
    }else if(d.t==='flower'){
      for(let i=0;i<3;i++){R(-5+i*5,-7-i%2*4,1,10,pal[1]);R(-7+i*5,-10-i%2*4,5,4,['#deb49a','#e8ce89','#aba0c7'][v%3]);R(-5+i*5,-9-i%2*4,1,1,'#f5e9ba')}
    }else{for(let i=0;i<5;i++){R(-8+i*4,-2-i%3*2,2,5+i%3*2,pal[1]);R(-8+i*4,-2-i%3*2,1,2,pal[2])}}
    FIELD_DECO_CACHE.set(key,cv);
  }
  const m=worldToMap(d.x+.5,d.y+.5),y=m.y-elevAt(d.x,d.y)*ELEVH;
  g.drawImage(cv,Math.round(m.x-48),Math.round(y-101));
}
function drawFieldEnemy(g,e,pal){
  const c=e.cfg,k=c.kind;if(c.sprite)return false;
  if(typeof drawArtEnemy==='function'&&drawArtEnemy(g,e,pal))return true;   // ART V2
  const p=pal||c.pal,[mid,dark,hi]=p,art=enemyArt(c),r=c.r;
  const blood=/blood|damned|splitter|deformed|misplaced/.test(k),molten=/molten|mking/.test(k),
    royal=/king|knight|monarch|guardian|royalguard/.test(k),ghost=c.flying||/wraith|unseen|spirit/.test(k),
    crawler=/crawl|tunnel/.test(k),tank=/tank/.test(k),brute=/brute|lurker/.test(k),
    priest=/necro|healer|faceless|silent/.test(k),boss=!!BOSS_ART[k];
  const R=(x,y,w,h,col)=>artRect(g,x,y,w,h,col),step=Math.sin(e.anim*9),h=r*2.8+7;
  g.save();g.scale(art.x*(e.dirx<0?-1:1),art.y);
  if(!ghost)artShadow(g,0,0,r*1.15);
  if(k==='blood_clot'||k==='splitter'){
    const pulse=Math.sin(e.anim*5)*1.5;
    artPoly(g,[[-r-2,-5],[-r-4,-14],[-r+2,-24],[2,-27-pulse],[r+3,-20],[r+5,-9],[r-2,-2]],dark);
    artPoly(g,[[-r,-14],[-r+3,-23],[2,-25-pulse],[r,-18],[r+1,-8],[0,-5]],mid);
    for(let i=0;i<5;i++){const x=-r+4+i*3;R(x,-17+i%2*4,2,6,hi);R(x,-17+i%2*4,1,2,'#f1bcad')}
    if(k==='splitter'){R(-1,-24,2,18,dark);R(-2,-22,1,13,hi)}
  }else if(crawler){
    for(let i=0;i<4;i++){
      const x=-r+i*r*.6,sy=Math.sin(e.anim*9+i)*2;
      artPoly(g,[[x,-12],[x-8,-5+sy],[x-10,1],[x-6,2],[x-3,-5],[x+3,-9]],dark);
      artPoly(g,[[x,-15],[x+6,-9-sy],[x+10,-2],[x+6,-1],[x+3,-8]],mid)}
    artPoly(g,[[-r-4,-12],[-r,-25],[r-3,-22],[r+9,-12],[r+6,-5],[-r,-5]],dark);
    for(let i=0;i<5;i++){R(-r+i*5,-23+i%2*2,5,13,mid);R(-r+i*5,-23+i%2*2,4,2,hi)}
    R(r+1,-17,9,8,dark);R(r+5,-15,4,2,hi);R(r+6,-10,5,2,'#d7d2ba');
    if(/tunnel/.test(k)){artPoly(g,[[r+8,-16],[r+19,-11],[r+8,-7]],hi);R(-r,-29,9,6,mid)}
  }else if(tank){
    R(-r-3,-11,r*2+6,11,'#182029');R(-r-1,-10,r*2+2,2,hi);
    for(let i=0;i<7;i++){R(-r+i*r*.3,-7,3,5,dark);R(-r+i*r*.3,-7,2,1,mid)}
    artPoly(g,[[-r-2,-13],[-r+3,-27],[r-3,-27],[r+5,-12]],mid);
    R(-r+3,-25,r*1.5,3,hi);R(-7,-35,17,12,dark);R(-6,-35,15,2,mid);
    R(5,-32,r+7,5,dark);R(5,-32,r+7,1,hi);R(r+10,-33,4,7,mid);
    R(-4,-30,4,2,'#ecbc78');R(-r,-19,4,3,hi);
    if(k==='rtank'){R(-10,-39,4,13,mid);R(-9,-39,2,8,'#b6e18d')}
  }else{
    const w=brute?r:royal?r*.8:r*.62,bob=ghost?Math.sin(e.anim*3)*2:Math.abs(step)*1.2;
    g.translate(0,bob);
    if(ghost||priest||royal){
      artPoly(g,[[-w,-h*.72],[w,-h*.72],[w+5,-3],[w*.5,-6],[0,0],[-w*.5,-4],[-w-4,-1]],dark);
      for(let i=0;i<4;i++)R(-w+2+i*w*.5,-h*.65,2,h*.5,mid)}
    if(!ghost){R(-w,-9+step*2,w*.7,9-step*2,dark);R(w*.25,-9-step*2,w*.7,9+step*2,dark);
      R(-w-2,-3+step, w*.8+2,3,mid);R(w*.25,-3-step,w*.8+2,3,mid)}
    artPoly(g,[[-w-3,-h*.72],[-w,-h*.9],[w,-h*.9],[w+3,-h*.72],[w,-12],[-w,-12]],mid);
    R(-w,-h*.88,w*1.8,3,hi);R(-w,-17,w*2,4,dark);
    for(let i=0;i<3;i++){R(-w+2,-h*.7+i*4,w*1.6,2,dark);R(-w+2,-h*.7+i*4,2,2,hi)}
    R(-w-6,-h*.78,6,13+step*2,dark);R(w,-h*.78,7,13-step*2,dark);
    R(-w-7,-h*.84,8,6,mid);R(w,-h*.84,8,6,mid);R(-w-7,-h*.84,7,2,hi);R(w,-h*.84,7,2,hi);
    R(-6,-h-5,13,12,dark);R(-5,-h-5,11,3,mid);R(-4,-h,9,5,'#19202a');
    R(-3,-h+1,3,2,hi);R(3,-h+1,3,2,hi);R(-3,-h+5,8,2,mid);
    if(royal){for(let i=0;i<3;i++){R(-7+i*6,-h-12+(i===1?-3:0),3,9,'#b79559');R(-7+i*6,-h-12+(i===1?-3:0),2,2,'#f0d9a1')}
      R(-7,-h-5,16,3,'#b79559');R(w+6,-h*.8,3,h*.7,'#b49b7c');
      artPoly(g,[[w+4,-h*.8],[w+7,-h-4],[w+11,-h*.8]],hi)}
    if(priest){R(w+7,-h,2,h,'#8c776d');R(w+4,-h-7,8,9,dark);R(w+6,-h-5,4,5,hi);
      artPoly(g,[[-9,-h-3],[0,-h-13],[9,-h-3]],mid)}
    if(brute){R(-w-10,-h*.75,11,10,dark);R(w,-h*.75,11,10,dark);
      R(-w-9,-h*.75,9,2,hi);R(w+1,-h*.75,9,2,hi)}
    if(/sprinter|blitz|damned/.test(k)){artPoly(g,[[-5,-h-4],[-15,-h-8],[-9,-h+1]],hi);R(w+3,-18,4,8,hi)}
    if(blood){for(let i=0;i<4;i++)R(-w+2+i*4,-h*.7+i%2*5,2,5,'#efb3ab');R(-3,-h+4,2,4,'#f2c6b3')}
    if(/revived|^rwalker|^rsprinter|^rbrute/.test(k)){R(-w-4,-h*.85,3,12,'#c4d1a5');R(5,-h-9,2,8,hi)}
    if(k==='healer'){R(-4,-h*.65,9,3,'#d3f3c5');R(-1,-h*.65-3,3,9,'#d3f3c5')}
    if(molten){for(let i=0;i<4;i++){R(-w+3+i*4,-h*.7+i%2*7,2,9,'#f8b66a');R(-w+3+i*4,-h*.7+i%2*7,1,5,'#fff0b0')}
      artPoly(g,[[-7,-h-4],[-4,-h-17],[0,-h-7],[4,-h-20],[8,-h-4]],'#ef9b4a')}
    if(k==='endbringer'||k==='endbringer_guardian'){
      for(const s of [-1,1])artPoly(g,[[s*w,-h*.8],[s*(w+12),-h-12],[s*(w+19),-h*.6],[s*(w+8),-h*.65]],dark);
      R(-4,-h*.7,8,12,'#9272e3');R(-2,-h*.7+2,4,6,'#e9d6ff')}
    if(k==='error_void_leak'){for(let i=0;i<6;i++)R(-w-5+Math.sin(e.anim*4+i)*5,-h+i*7,w*2+8,1,i%2?hi:'#a3d8df')}
    if(k==='the_misplaced'||k==='deformed_king'){
      R(-w-8,-h*.6,9,13,dark);R(-w-6,-h*.6+2,6,7,hi);R(w,-h*.5,12,12,mid);R(w+3,-h*.5+2,5,2,'#f6b4a2')}
  }
  if(/obsidian/.test(k)){
    for(const side of [-1,1])for(let i=0;i<3;i++){
      const x=side*(r*.6+i*3),y=-h*.7+i*7;
      artPoly(g,[[x,y+5],[x+side*6,y],[x+side*2,y-8],[x-side*2,y]],i%2?mid:dark);
      R(x,y-5,1,5,hi)}
  }
  if(ghost){
    for(const s of [-1,1])artPoly(g,[[s*5,-h*.6],[s*(r+9),-h*.8],[s*(r+5),-h*.3],[s*10,-h*.4]],dark);
    for(let i=0;i<3;i++)R(-r+i*r,-4+Math.sin(e.anim*4+i)*3,2,4,mid);
  }
  if(/faceless/.test(k)){R(-5,-h,11,8,dark);R(-4,-h,9,1,hi)}
  if(k==='nightstalker'||k==='cloaker'){artPoly(g,[[r,-h*.6],[r+9,-h*.4],[r+4,-5],[r-1,-h*.3]],dark);R(r+5,-h*.4,1,9,hi)}
  if(k==='blood_soldier'){R(r+1,-h*.65,5,h*.45,dark);R(r+2,-h*.65,3,2,hi)}
  if(k==='silent_exec'){artPoly(g,[[r+2,-h*.8],[r+8,-h-9],[r+12,-h*.6],[r+6,-h*.5]],'#a99bb4');R(r+4,-h*.65,2,h*.55,dark)}
  if(boss&&!crawler&&!tank){
    const w=brute?r:royal?r*.8:r*.62;
    // Inset plates, rivets, bevels and engraved channels survive boss enlargement.
    R(-w+2,-h*.82,w*.65,2,hi);R(w*.25,-h*.82,w*.65,2,hi);
    for(const s of [-1,1]){
      for(let i=0;i<3;i++){R(s*(w+2),-h*.75+i*3,2,1,hi);R(s*(w-2),-h*.6+i*4,1,2,hi)}
      R(s*(w*.5),-h*.67,1,h*.25,dark);R(s*(w*.5)+1,-h*.67,1,h*.15,hi);
      R(s*(w*.5)-2,-7,4,1,hi);
    }
    R(-w+2,-15,w*2-4,1,hi);
    if(royal){for(let i=0;i<5;i++)R(-w+3+i*w*.35,-12,2,4,hi);R(-2,-h*.55,4,5,'#b29b7b')}
    if(blood){for(let i=0;i<6;i++){R(-w+3+i*4,-h*.72+i%3*3,1,h*.24,hi);R(-w+3+i*4,-h*.72+i%3*3,2,1,'#f0a998')}}
    if(k==='endbringer'||k==='endbringer_guardian'){
      for(const s of [-1,1])for(let i=0;i<3;i++)artPoly(g,[[s*(w+4+i*3),-h*.7+i*5],[s*(w+9+i*3),-h*.86+i*5],[s*(w+10+i*3),-h*.65+i*5]],mid);
      R(-2,-h*.7+2,4,9,'#e9d6ff');R(-1,-h*.7+3,2,6,'#fff8ff');R(-1,-h*.4,2,6,hi);
    }
  }
  if(c.stealth){R(-r,-10,r*2,1,hi)}
  g.restore();return true;
}
function drawFieldProjectile(g,p){
  if(typeof drawArtProjectile==='function'&&drawArtProjectile(g,p))return;   // ART V2
  if(p.kind==='grenade'){
    const k=clamp(p.t/p.dur,0,1),ground=mapPy(p.tx,p.ty)-6;
    artShadow(g,p.x,lerp(p.launchY+23,ground,k),4+Math.sin(k*Math.PI)*2);
    g.save();g.translate(p.x,p.y);g.rotate(p.t*13);
    const hot=p.patchDps>0,col=hot?'#c97643':'#6b8060';
    artRect(g,-4,-5,8,10,'#202d32');artRect(g,-3,-4,6,8,col);artRect(g,-3,-4,2,7,'#c2caa0');
    for(let i=0;i<3;i++)artRect(g,-4,-3+i*3,8,1,'#344339');
    artRect(g,-2,-7,4,3,'#d4bd83');artRect(g,1,-8,4,2,'#8e9691');artRect(g,4,-7,1,5,'#8e9691');
    if(hot)artRect(g,-2,-2,4,3,'#ffbd70');g.restore();return;
  }
  let a=p.kind==='slug'||p.kind==='frag'?Math.atan2(p.vy,p.vx):p.e?Math.atan2(p.e.sy-10-p.y,p.e.sx-p.x):0;
  const col=p.col||DMG_COLORS[p.dtype]||'#e8dcc0',energy=p.dtype==='laser'||p.kind==='slug';
  g.save();g.translate(p.x,p.y);g.rotate(a);
  if(SV.particles){g.globalAlpha=.22;artRect(g,-(energy?17:11),-3,energy?20:14,6,col);g.globalAlpha=1}
  artRect(g,-(p.kind==='frag'?4:energy?12:8),-1,p.kind==='frag'?5:energy?15:10,2,col);
  artRect(g,0,-1,3,2,'#fff5d7');g.restore();
}
function drawFieldLandmark(g,pt,spawn,time){
  const m=worldToMap(pt.x,pt.y),R=(x,y,w,h,c)=>artRect(g,m.x+x,m.y+y,w,h,c);
  artShadow(g,m.x,m.y+3,spawn?42:55);
  // Low retaining walls, capstones and lanterns frame the existing architecture.
  for(const s of [-1,1]){
    for(let i=0;i<3;i++){
      const x=s*(25+i*7),y=8+i*3;
      R(x-5,y-9,10,10,spawn?'#373946':'#515e62');R(x-5,y-10,10,2,spawn?'#716279':'#a2a18a');
      R(x,y-8,1,8,'#242e36');R(x-4,y-4,9,1,'#2a343d');
    }
    R(s*37-3,-18,6,22,'#35404a');R(s*37-4,-19,8,2,'#98a296');
    R(s*37-2,-16,4,6,spawn?'#ec9b79':'#e7d3a1');R(s*37-1,-16,1,5,'#fff0cd');
    if(SV.particles){g.globalAlpha=.08;g.fillStyle=spawn?'#ec9b79':'#e7d3a1';g.beginPath();g.ellipse(m.x+s*37,m.y-8,12,7,0,0,Math.PI*2);g.fill();g.globalAlpha=1}
  }
}
function drawFieldPatch(g,f,time){
  const m=worldToMap(f.x,f.y),poison=f.kind==='poison',rx=R_ISO_X(f.r),ry=R_ISO_Y(f.r);
  g.save();g.translate(m.x,m.y);g.fillStyle=poison?'#456c3245':'#4b2a234d';
  g.beginPath();g.ellipse(0,0,rx,ry,0,0,Math.PI*2);g.fill();
  const count=SV.particles?12:5;
  for(let i=0;i<count;i++){
    const phase=hash2(i+3,Math.floor(f.x*11)),a=i*2.39996,r=Math.sqrt(phase)*.82;
    const x=Math.cos(a)*rx*r,y=Math.sin(a)*ry*r,fl=.6+Math.sin(time*7+i)*.2;
    if(poison){g.fillStyle='#7bba4b66';g.beginPath();g.ellipse(x,y,5+phase*4,2+phase*2,0,0,Math.PI*2);g.fill();
      if(SV.particles)artRect(g,x,y-((time*7+i*4)%11),2,2,'#c9ec8888')}
    else{artRect(g,x-2,y-5*fl,5,6*fl,'#b45436');artRect(g,x-1,y-9*fl,3,9*fl,'#e99749');artRect(g,x,y-6*fl,1,5*fl,'#f9d994')}
  }g.restore();
}
