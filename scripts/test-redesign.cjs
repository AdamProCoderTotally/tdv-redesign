// Visual contract and deterministic geometry checks. All accounts and network data are local.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
async function main(){
  const root=path.resolve(__dirname,'..'),output=path.join(root,'outputs/redesign');
  const served=process.argv.includes('--dist')?path.join(root,'dist'):root;
  await fs.mkdir(output,{recursive:true});
  const {default:worker}=await import(pathToFileURL(path.join(root,'cloud/worker.js')).href);
  const values=new Map(),env={KV:{async get(k){return values.get(k)||null},async put(k,v){values.set(k,String(v))},async delete(k){values.delete(k)}}};
  const resp=await worker.fetch(new Request('https://tdv.test/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'redesign_test',password:'isolated-redesign-test'})}),env);
  const account=await resp.json();assert.ok(account.ok);
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.ttf':'font/ttf'};
  const server=http.createServer(async(req,res)=>{try{const f=path.resolve(served,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(served+path.sep))throw Error();res.setHeader('Content-Type',types[path.extname(f)]||'application/octet-stream');res.end(await fs.readFile(f))}catch{res.writeHead(404);res.end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{const req=route.request(),u=new URL(req.url()),headers={'Access-Control-Allow-Origin':'*'};
      if(u.pathname.startsWith('/api/')){const r=await worker.fetch(new Request('https://tdv.test'+u.pathname,{method:req.method(),headers:{'content-type':'application/json'},body:req.postData()||'{}'}),env);return route.fulfill({status:r.status,headers,contentType:'application/json',body:await r.text()})}
      if(u.hostname==='localhost'&&u.port==='8322')return route.fulfill({headers,contentType:'application/json',body:'{"ok":true,"durable":true}'});
      if(u.hostname==='127.0.0.1'&&u.port===String(port))return route.continue();return route.abort()});
    await page.addInitScript(token=>{localStorage.setItem('tdv_cloud_token',token);localStorage.setItem('tdv_cloud_user','redesign_test')},account.token);
    await page.goto(`http://127.0.0.1:${port}/index.html`);await page.waitForFunction(()=>Cloud.ready&&document.getElementById('bootScreen').classList.contains('gone'));
    const result=await page.evaluate(()=>{
      G.state='paused';SV.particles=true;
      const cv=document.createElement('canvas');cv.id='artGallery';cv.width=1500;cv.height=2300;
      cv.style='position:absolute;inset:0;z-index:99999;background:#14212b';document.body.append(cv);
      const g=cv.getContext('2d');g.fillStyle='#14212b';g.fillRect(0,0,cv.width,cv.height);g.imageSmoothingEnabled=false;
      const label=(text,x,y)=>{g.fillStyle='#d9e1cc';g.font='12px monospace';g.textAlign='center';g.fillText(text,x,y)};
      label('TDV / FIELD GUIDE — CHARACTERS, UPGRADES AND BOSS SCALE',750,25);
      let row=0;
      for(const type of Object.keys(TOWERS)){
        const def=TOWERS[type];if(def.sprite)continue;
        for(let tier=0;tier<=5;tier++){
          const t={type,x:0,y:0,ups:new Array(def.lanes).fill(0),aim:-.3,flashT:0,gunAim:[-.3,-.7],gunFlash:[0,0],S:{guns:type==='viper'&&tier>=4?2:1}};
          t.ups[tier%def.lanes]=tier;drawTowerBody(g,type,120+tier*245,105+row*105,t,1);
          label(def.name+' / '+tier,120+tier*245,125+row*105);
        }row++;
      }
      let i=0;
      for(const c of Object.values(ENEMIES)){
        const x=90+(i%10)*150,y=1230+Math.floor(i/10)*105;
        g.save();g.translate(x,y);drawEnemyBody(g,{cfg:c,anim:1,dirx:1},1);g.restore();label(c.name,x,y+20);i++;
      }
      i=0;for(const c of Object.values(BIGS)){
        const x=125+(i%6)*250,y=1745+Math.floor(i/6)*175;
        g.save();g.translate(x,y);drawEnemyBody(g,{cfg:c,anim:1,dirx:1,boss:true},1);g.restore();label(c.name,x,y+24);i++;
      }
      // Complete upgrade paths (not just alternating sample tiers) must draw safely.
      for(const [type,d] of Object.entries(TOWERS))for(let lane=0;lane<d.lanes;lane++)for(let tier=0;tier<=5;tier++){
        const t={type,x:0,y:0,ups:new Array(d.lanes).fill(0),aim:0,gunAim:[0,1],gunFlash:[0,0],S:{guns:2}};
        t.ups[lane]=tier;const q=document.createElement('canvas').getContext('2d');drawTowerBody(q,type,50,70,t,1);
      }
      const t={type:'ranger',x:4,y:4,aim:0,flashT:0,S:{dmg:1,dtype:'bullet'},ups:[0,0]};
      let maxError=0;
      for(let i=0;i<32;i++){t.aim=i*Math.PI/16;fireProj(t,{px:5,py:5});const p=projs.pop(),m=weaponPose(t);maxError=Math.max(maxError,Math.hypot(p.x-m.mx,p.y-m.my))}
      spawnGrenade(t,6,6);const grenade=projs[projs.length-1],start=[grenade.x,grenade.y];t.x+=4;updProjs(0);const grenadeStable=Math.hypot(grenade.x-start[0],grenade.y-start[1])<.001;projs.length=0;
      t.aim=-Math.PI+.01;t.artAim=[Math.PI-.01,0];const prev=t.artAim[0];updateArtAim(t,.016);const wrapStep=Math.abs(t.artAim[0]-prev);
      const vt={type:'viper',x:4,y:4,aim:0,gunAim:[0,0],gunFlash:[0,0],shotN:1,S:{dmg:1,dtype:'bullet'},ups:[0,0]};
      let slugAlignment=0;for(let i=0;i<16;i++){
        const a=i*Math.PI/8,target={px:vt.x+Math.cos(a)*2,py:vt.y+Math.sin(a)*2};
        slugFire(vt,1,vt.S,target);const p=projs.pop(),m=weaponPose(vt,1);
        slugAlignment=Math.max(slugAlignment,Math.abs(Math.atan2(Math.sin(Math.atan2(p.vy,p.vx)-m.a),Math.cos(Math.atan2(p.vy,p.vx)-m.a))),Math.hypot(p.x-m.mx,p.y-m.my));
      }
      const elevated=defaultElevTiles()[0];t.x=elevated[0];t.y=elevated[1];
      const elevatedPose=weaponPose(t),elevationCorrect=Math.abs(elevatedPose.y-(mapPy(t.x,t.y)-elevAt(t.x,t.y)*ELEVH-23))<.001;
      const geometry=()=>JSON.stringify({grid,elevGrid,path:PATH,base:BASE_RECT});const before=geometry();
      const terrainTest=document.createElement('canvas'),world=buildWorldData(PATH_WP);renderTerrainInto(terrainTest,world,false);const unchanged=geometry()===before;
      const override=buildWorldData(PATH_WP,{colors:{grass:'#123456'},overrides:{'12,12':'#ff00ff'}});renderTerrainInto(terrainTest,override,false);
      // custom sprite/turret contracts, mirrored and elevated
      TOWERS.artTest={sprite:{w:2,h:2,pal:['#fff'],rows:['00','00'],scale:2},turret:{w:8,h:2,pal:['#fff'],rows:['00000000','00000000'],tip:[8,1],ox:2},legs:true};
      const custom=weaponPose({type:'artTest',x:0,y:0,aim:Math.PI});delete TOWERS.artTest;
      const fx=document.createElement('canvas').getContext('2d');
      for(const kind of ['bullet','slug','frag','grenade'])for(const dtype of Object.keys(DMG_COLORS)){
        drawFieldProjectile(fx,{kind,dtype,x:30,y:30,vx:40,vy:20,t:.2,dur:1,launchY:20,tx:1,ty:1,patchDps:dtype==='fire'?10:0});
      }
      for(const particles of [true,false]){SV.particles=particles;
        for(const kind of ['fire','poison'])drawFieldPatch(fx,{kind,x:1,y:1,r:1},2);
        parts.length=0;burst(20,20,'#fff',6,80,.5,3);smoke(20,20,3);ringFX(20,20,20,'#fca');updParts(.1);drawParts(fx);parts.length=0;
      }
      for(const enabled of [true,false]){
        const p={type:'phaser',x:0,y:0,ups:[3],aim:.4,flashT:0,beamOn:enabled,chargeT:.3,S:{charge:1,range:3},hp:100,maxHp:100,
          target:{sx:mapPx(0,0)+100,sy:mapPy(0,0)+30},chain:[{sx:mapPx(0,0)+150,sy:mapPy(0,0)+70}]};
        drawTower(fx,p,1);
      }
      for(const c of Object.values(BIGS)){drawBossIcon(c);const e={cfg:c,sx:10,sy:20,anim:1,dirx:1,flash:.1,hp:1,maxHp:2,shield:1,shieldMax:2,scale:.5};drawEnemy(document.createElement('canvas').getContext('2d'),e)}
      const bench=()=>{const q=document.createElement('canvas');q.width=1500;q.height=1000;const b=q.getContext('2d'),start=performance.now();
        for(let frame=0;frame<20;frame++){b.clearRect(0,0,1500,1000);for(let i=0;i<250;i++){const c=Object.values(ENEMIES)[i%Object.keys(ENEMIES).length];b.save();b.translate(40+i%25*55,70+Math.floor(i/25)*70);drawEnemyBody(b,{cfg:c,anim:frame*.1,dirx:1},1);b.restore()}}
        return (performance.now()-start)/20};
      const timing={};for(const particles of [true,false]){SV.particles=particles;timing[particles?'enabled':'disabled']=bench()}
      return {maxError,slugAlignment,elevationCorrect,grenadeStable,wrapStep,unchanged,customFinite:Number.isFinite(custom.mx),timing,roster:{towers:Object.keys(TOWERS).length,enemies:Object.keys(ENEMIES).length,bosses:Object.keys(BIGS).length}};
    });
    assert.equal(result.maxError,0);assert.ok(result.slugAlignment<1e-10);assert.ok(result.elevationCorrect);assert.ok(result.grenadeStable);assert.ok(result.wrapStep<.02);assert.ok(result.unchanged);assert.ok(result.customFinite);
    const baseline=await fs.readFile(path.join(output,'baseline/sprites.js'),'utf8');
    result.comparison=await page.evaluate(source=>{
      const old=new Function(source+';return {enemy:drawEnemyBody,tower:drawTowerBody,deco:drawDeco}')();
      const q=document.createElement('canvas');q.width=1500;q.height=1000;const g=q.getContext('2d'),ec=Object.values(ENEMIES),tc=Object.keys(TOWERS);
      const run=(enemy,tower,deco)=>{const start=performance.now();for(let frame=0;frame<30;frame++){
        g.clearRect(0,0,1500,1000);for(let i=0;i<250;i++){g.save();g.translate(30+i%25*58,70+Math.floor(i/25)*78);enemy(g,{cfg:ec[i%ec.length],anim:1,dirx:1},1);g.restore()}
        for(let i=0;i<40;i++){const type=tc[i%tc.length],t={type,x:0,y:0,ups:new Array(TOWERS[type].lanes).fill(3),aim:1,gunAim:[1,2],gunFlash:[0,0],S:{guns:2}};tower(g,type,60+i%20*65,200+Math.floor(i/20)*220,t,1)}
        for(let i=0;i<150;i++)deco(g,{x:i%25,y:Math.floor(i/25),t:['tree','rock','bush','flower','tuft'][i%5],s:(i%12)/12},1);
      }return (performance.now()-start)/30};
      // Warm both paths and their caches, alternate order, report medians.
      run(old.enemy,old.tower,old.deco);run(drawEnemyBody,drawTowerBody,drawDeco);
      const out={};for(const particles of [true,false]){SV.particles=particles;const before=[],after=[];for(let i=0;i<3;i++){
        before.push(run(old.enemy,old.tower,old.deco));after.push(run(drawEnemyBody,drawTowerBody,drawDeco))}
        out[particles?'enabled':'disabled']={beforeMs:before.sort((a,b)=>a-b)[1],afterMs:after.sort((a,b)=>a-b)[1]};}
      return out;
    },baseline);
    await page.locator('#artGallery').screenshot({path:path.join(output,'roster.png')});
    await page.evaluate(()=>{document.getElementById('artGallery').remove();G.state='menu';cam.x=cam.tx=worldToMap(13,13).x;cam.y=cam.ty=worldToMap(13,13).y;cam.zoom=cam.tz=.8;render()});
    await page.locator('#mainMenu').evaluate(el=>el.style.display='none');await page.screenshot({path:path.join(output,'map.png')});
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'verification.json'),JSON.stringify(result,null,2));
    console.log('PASS roster, upgrade paths, bosses, custom sprites, muzzle transforms, grenade launch, angle wrap, map geometry and runtime errors');console.log(JSON.stringify(result));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
