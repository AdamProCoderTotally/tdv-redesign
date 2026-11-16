"use strict";
// ============================================================
//  tower-creator.js — TDV Tower Creator. Standalone tool:
//  designs towers, enemies and custom modes/waves, and exports
//  a snippet to paste into the paste zones in js/config.js.
// ============================================================
const $=id=>document.getElementById(id);
function slug(s){return (s||'thing').toLowerCase().replace(/[^a-z0-9]+/g,'_')
  .replace(/^_+|_+$/g,'').slice(0,18)||'thing'}
function flash(msg,bad){const el=$('status');el.textContent=msg;
  el.style.color=bad?'#f0a494':'#8ce89a';
  clearTimeout(flash._t);flash._t=setTimeout(()=>{el.textContent=''},3000)}

const DTYPES=['bullet','fire','explosion','energy','ice','laser'];
const KINDS=[['walker','Walk (default)'],['sprinter','Scurry'],['brute','Heavy stomp'],
  ['molten','Splits into Obsidian on death'],['mmolten','Splits into Mega Obsidian'],
  ['tunneller','Digs forward (bursts)'],['nightstalker','Walk'],['whisper','Float'],
  ['silent_exec','Boss: sword swings damage towers'],['fallen_oking','Boss: mass-stuns towers']];
const ENEMY_KEYS=[['walker','Walker'],['sprinter','Sprinter'],['brute','Brute'],
  ['rwalker','Revived Walker'],['rsprinter','Revived Sprinter'],['rbrute','Revived Brute'],
  ['molten','Molten'],['mmolten','Mega Molten'],['obsidian','Obsidian'],['mobsidian','Mega Obsidian'],
  ['blitz','Blitz'],['crawling_obsidian','Crawling Obsidian'],['tunneller','Tunneller'],
  ['nightstalker','Nightstalker'],['wraithling','Wraithling'],['lurker','Lurker'],
  ['whisper','Whisper'],['faceless_guardian','Faceless Guardian']];
const BOSS_KEYS=[['tank','TANK'],['rtank','Revived TANK'],['fbrute','FATHER BRUTE'],
  ['crawler','CRAWLER'],['rmmolten','Revived Mega Molten'],['oknight','Obsidian Knight'],
  ['mking','Molten King'],['wfbrute','Weakened Father Brute'],['oking','Obsidian King'],
  ['endbringer','ENDBRINGER'],['silent_exec','Silent Executioner'],['stealth_tunneller','Stealth Tunneller'],
  ['faceless','Faceless.'],['fallen_oking','Fallen Obsidian King'],['the_unseen','The Unseen']];
const PALETTE=['#ffffff','#1c2430','#2c2a24','#26262c','#3a3a44','#4a4438','#5c554a','#82888f',
  '#c8d4de','#8a94a2','#4c5a68','#241c2c','#3c3550','#8a7cc8','#c88ae0','#b89aff',
  '#4a3f2c','#33261a','#6a4a2c','#8a542c','#a06a38','#d8a878','#f5c56a','#e8a33d',
  '#ffe9a0','#f5e08a','#f08b3a','#e8722a','#b8401e','#8a2f0e','#b03a2e','#e0644c',
  '#ef8b7a','#568a44','#5c9448','#7fb069','#7cff5a','#4c6b3c','#8fd8dc','#7ec8ff',
  '#4a7ad0','#e8dcc0','#c9a86a','#d8c8a0','#8e7a5e','#f0c040','#3aff9a','#ff3030'];

// ---- state ----
const LS='tdv_tower_creator_v1';
function blankTower(){return{id:'',name:'NEW TOWER',desc:'',cost:150,price:0,dtype:'bullet',
  range:3,dmg:2,rate:2,air:false,lanes:1,limit:10,splash:0,behavior:'bullet',
  income:0,charge:0,chain:0,legs:true,hp:[200,300,450,600,800],
  sprite:blankSprite(),turret:Object.assign(blankSprite(),{ox:3,oy:12,tip:[23,12]}),
  laneNames:['PATH A'],ups:[upLane()]}}
function upLane(){return[0,1,2,3,4].map(()=>({name:'UPGRADE',cost:100,fx:{}}))}
function blankEnemy(){return{id:'',name:'NEW ENEMY',boss:false,hp:50,spd:1,rw:10,r:9,
  kind:'walker',flying:false,stealth:false,shield:0,shieldRes:0,sword:false,stuns:false,
  res:{},sprite:blankSprite()}}
function blankSprite(w,h){w=w||24;h=h||24;const rows=[];for(let i=0;i<h;i++)rows.push('.'.repeat(w));
  return{w:w,h:h,pal:[],rows:rows}}
// Body canvas sizes. 24x24 is the classic format (drawn at 1.3x in game);
// the larger ones match the ART V2 sprites and are drawn 1:1 (scale:1).
const CANVAS_SIZES=[[24,24,'24 x 24 (classic)'],[32,32,'32 x 32'],[44,62,'44 x 62 (ART V2 soldier)'],[64,72,'64 x 72 (ART V2 building)']];
function spriteW(spr){return spr.w||24}
function spriteH(spr){return spr.h||24}
// resize keeping the drawing anchored bottom-centre (where the figure stands)
function resizeSprite(spr,w,h){const ow=spriteW(spr),oh=spriteH(spr),dx=Math.floor((w-ow)/2),dy=h-oh,rows=[];
  for(let y=0;y<h;y++){let r='';for(let x=0;x<w;x++){const sy=y-dy,sx=x-dx;r+=(sy>=0&&sy<oh&&sx>=0&&sx<ow&&spr.rows[sy])?(spr.rows[sy][sx]||'.'):'.'}rows.push(r)}
  spr.rows=rows;spr.w=w;spr.h=h;
  if(w===24&&h===24)delete spr.scale;else spr.scale=1}
function blankMode(){return{name:'CUSTOM',startCash:500,hp:500,hpMul:1,spdMul:1,moneyMul:1,rewardMul:1}}
let data={towers:[],enemies:[],mode:blankMode(),waves:[]};
try{const s=JSON.parse(localStorage.getItem(LS));if(s&&s.towers)data=s}catch(e){}
function persist(){try{localStorage.setItem(LS,JSON.stringify(data))}catch(e){}}
let towerSel=-1,enemySel=-1;

// ---- tabs ----
document.querySelectorAll('#tabs .tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#tabs .tab').forEach(o=>o.classList.toggle('on',o===b));
  document.querySelectorAll('.tabpage').forEach(p=>p.classList.toggle('show',p.id==='tab-'+b.dataset.tab))});

// ---- pixel editor ----
function spriteGet(spr,x,y){const ch=(spr.rows[y]||'')[x];
  return(!ch||ch==='.'||ch===' ')?null:parseInt(ch,36)}
function spriteSet(spr,x,y,ch){const r=spr.rows[y];if(r===undefined)return;
  spr.rows[y]=r.slice(0,x)+ch+r.slice(x+1)}
function spriteColorIndex(spr,hex){const i=spr.pal.indexOf(hex);
  if(i>=0)return i;
  if(spr.pal.length>=36)spr.pal.length=35;
  spr.pal.push(hex);return spr.pal.length-1}
function makePixelEditor(cfg){
  let tool='pencil',color=PALETTE[22];
  const cv=cfg.canvas,g=cv.getContext('2d');let CELLPX=14,SW=24,SH=24;
  function fit(){const spr=cfg.get();SW=spr?spriteW(spr):24;SH=spr?spriteH(spr):24;CELLPX=Math.max(4,Math.floor(336/Math.max(SW,SH)));
    if(cv.width!==SW*CELLPX)cv.width=SW*CELLPX;if(cv.height!==SH*CELLPX)cv.height=SH*CELLPX}
  fit();
  cfg.toolEl.innerHTML='';
  const tools=[['pencil','&#9998; PEN'],['erase','ERASER'],['fill','FILL'],['pick','PICK'],['clear','CLEAR']];
  const tbs=tools.map(t=>{const b=document.createElement('button');
    b.className='btn tgl'+(t[0]==='pencil'?' on':'');b.innerHTML=t[1];
    b.onclick=()=>{tool=t[0];tbs.forEach(o=>o.classList.toggle('on',o===b))};
    cfg.toolEl.appendChild(b);return b});
  function renderPalette(){
    cfg.paletteEl.innerHTML='';
    const spr=cfg.get();if(!spr)return;
    PALETTE.forEach(col=>{
      const d=document.createElement('div');d.style.background=col;
      if(col===color)d.classList.add('sel');
      d.onclick=()=>{color=col;renderPalette()};
      cfg.paletteEl.appendChild(d)});
    spr.pal.forEach(col=>{const d=document.createElement('div');d.style.background=col;
      d.onclick=()=>{color=col;renderPalette()};
      cfg.paletteEl.appendChild(d)})}
  function cell(e){const r=cv.getBoundingClientRect();
    return{x:Math.floor((e.clientX-r.left)/r.width*SW),y:Math.floor((e.clientY-r.top)/r.height*SH)}}
  function apply(e){
    const spr=cfg.get();if(!spr)return;
    const c=cell(e);if(c.x<0||c.x>=SW||c.y<0||c.y>=SH)return;
    if(tool==='pencil')spriteSet(spr,c.x,c.y,spriteColorIndex(spr,color).toString(36));
    else if(tool==='erase')spriteSet(spr,c.x,c.y,'.');
    else if(tool==='pick'){const i=spriteGet(spr,c.x,c.y);if(i!=null){color=spr.pal[i];renderPalette()}}
    else if(tool==='clear'){if(confirm('Clear this sprite?'))for(let y=0;y<SH;y++)spr.rows[y]='.'.repeat(SW)}
    else if(tool==='fill'){
      const target=spriteGet(spr,c.x,c.y),rep=spriteColorIndex(spr,color).toString(36);
      if(target!==parseInt(rep,36)){
        const q=[[c.x,c.y]],seen=new Set();
        while(q.length){const xy=q.pop(),x=xy[0],y=xy[1];
          if(x<0||x>=SW||y<0||y>=SH||seen.has(x+','+y))continue;
          seen.add(x+','+y);
          if(spriteGet(spr,x,y)!==target)continue;
          spriteSet(spr,x,y,rep);
          q.push([x+1,y],[x-1,y],[x,y+1],[x,y-1])}}}
    render();cfg.onChange&&cfg.onChange()}
  cv.addEventListener('pointerdown',e=>{e.preventDefault();apply(e);
    const mv=ev=>apply(ev);
    const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up)};
    window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up)});
  function render(){
    const spr=cfg.get();fit();
    g.fillStyle='#100d0a';g.fillRect(0,0,cv.width,cv.height);
    if(!spr)return;
    for(let y=0;y<SH;y++)for(let x=0;x<SW;x++)
      if((x+y)%2){g.fillStyle='#16120e';g.fillRect(x*CELLPX,y*CELLPX,CELLPX,CELLPX)}
    drawRows(g,spr,0,0,CELLPX,false);
    g.strokeStyle='rgba(255,255,255,.06)';g.lineWidth=1;
    for(let i=0;i<=SW;i++){g.beginPath();g.moveTo(i*CELLPX,0);g.lineTo(i*CELLPX,cv.height);g.stroke()}
    for(let i=0;i<=SH;i++){g.beginPath();g.moveTo(0,i*CELLPX);g.lineTo(cv.width,i*CELLPX);g.stroke()}
    if(cfg.pivot){g.strokeStyle='#f5c56a';g.lineWidth=2;
      g.beginPath();g.arc(cfg.pivot.x*CELLPX,cfg.pivot.y*CELLPX,5,0,7);g.stroke()}
    if(cfg.tip){g.strokeStyle='#7cff5a';g.lineWidth=2;
      g.beginPath();g.arc(cfg.tip.x*CELLPX,cfg.tip.y*CELLPX,5,0,7);g.stroke()}}
  renderPalette();render();
  return{render:render,renderPalette:renderPalette}}
function drawRows(g,spr,ox,oy,scale,flip){
  for(let ry=0;spr&&ry<spr.rows.length;ry++){const row=spr.rows[ry];
    for(let rx=0;rx<row.length;rx++){const ch=row[rx];
      if(ch==='.'||ch===' ')continue;
      const col=spr.pal[parseInt(ch,36)];if(!col)continue;
      g.fillStyle=col;
      g.fillRect(ox+(flip?spr.w-rx-1:rx)*scale,oy+ry*scale,scale,scale)}}}
function renderList(el,items,selIdx,onPick,label){
  el.innerHTML='';
  items.forEach((o,i)=>{const b=document.createElement('button');
    b.className='btn'+(i===selIdx?' sel':'');
    b.innerHTML=label(o);
    b.onclick=()=>onPick(i);el.appendChild(b)})}

// ================= TOWERS =================
function fixTower(t){
  if(!t.sprite)t.sprite=blankSprite();
  if(!t.turret)t.turret=Object.assign(blankSprite(),{ox:3,oy:12,tip:[23,12]});
  if(!Array.isArray(t.hp)||t.hp.length!==5)t.hp=[200,300,450,600,800];
  if(!Array.isArray(t.ups)||!t.ups[0])t.ups=[upLane()];
  if(t.lanes===2&&!t.ups[1])t.ups[1]=upLane();
  t.ups.length=t.lanes||1;
  return t}
let towerUI=null;
function renderTowerForm(){
  const form=$('towerForm');
  if(towerSel<0||!data.towers[towerSel]){form.innerHTML='<div class="empty">Create or select a tower.</div>';return}
  const t=fixTower(data.towers[towerSel]);
  form.innerHTML='';
  const wrap=document.createElement('div');
  wrap.innerHTML=
   '<div class="frow"><label>Name</label><input data-f="name" type="text" value="'+t.name+'"></div>'+
   '<div class="frow"><label>ID (unique)</label><input data-f="id" type="text" value="'+t.id+'"></div>'+
   '<div class="frow"><label>Shop price</label><input data-f="price" type="number" value="'+t.price+'" min="0" step="50"><span class="hint">0 = free starter</span></div>'+
   '<div class="frow"><label>Place cost</label><input data-f="cost" type="number" value="'+t.cost+'" min="0" step="25"></div>'+
   '<div class="frow"><label>Damage type</label><select data-f="dtype">'+DTYPES.map(d=>'<option '+(t.dtype===d?'selected':'')+'>'+d+'</option>').join('')+'</select></div>'+
   '<div class="frow"><label>Behaviour</label><select data-f="behavior">'+
    '<option value="bullet" '+(t.behavior==='bullet'?'selected':'')+'>Bullet (aimed shot)</option>'+
    '<option value="lob" '+(t.behavior==='lob'?'selected':'')+'>Lob (grenade + splash)</option>'+
    '<option value="beam" '+(t.behavior==='beam'?'selected':'')+'>Beam (charging laser)</option>'+
    '<option value="farm" '+(t.behavior==='farm'?'selected':'')+'>Farm (passive income)</option></select></div>'+
   '<div class="frow"><label>Damage</label><input data-f="dmg" type="number" value="'+t.dmg+'"></div>'+
   '<div class="frow"><label>Attack rate /s</label><input data-f="rate" type="number" value="'+t.rate+'" step="0.25" min="0.01"></div>'+
   '<div class="frow"><label>Range (tiles)</label><input data-f="range" type="number" value="'+t.range+'" step="0.25" min="0.5"></div>'+
   '<div class="frow"><label>Splash radius</label><input data-f="splash" type="number" value="'+(t.splash||0)+'" step="0.25" min="0"></div>'+
   '<div class="frow"><label>Income / wave</label><input data-f="income" type="number" value="'+(t.income||0)+'" min="0"><span class="hint">farm behaviour</span></div>'+
   '<div class="frow"><label>Targets air</label><button class="btn tgl '+(t.air?'on':'')+'" data-f="air">'+(t.air?'YES':'NO')+'</button></div>'+
   '<div class="frow"><label>Stone legs</label><button class="btn tgl '+(t.legs!==false?'on':'')+'" data-f="legs">'+(t.legs!==false?'YES':'NO')+'</button><span class="hint">NO = full sprite stands on the ground</span></div>'+
   '<div class="frow"><label>Upgrade lanes</label><select data-f="lanes"><option value="1" '+(t.lanes===1?'selected':'')+'>1</option><option value="2" '+(t.lanes===2?'selected':'')+'>2</option></select></div>'+
   '<div class="frow"><label>Place limit</label><input data-f="limit" type="number" value="'+t.limit+'" min="1"></div>'+
   '<div class="frow"><label>Charge time</label><input data-f="charge" type="number" value="'+(t.charge||0)+'" step="0.25" min="0"></div>'+
   '<div class="frow"><label>Chain targets</label><input data-f="chain" type="number" value="'+(t.chain||0)+'" min="0"></div>'+
   '<div class="frow"><label>Body canvas</label><select data-size="1">'+CANVAS_SIZES.map(z=>'<option value="'+z[0]+'x'+z[1]+'" '+(spriteW(t.sprite)===z[0]&&spriteH(t.sprite)===z[1]?'selected':'')+'>'+z[2]+'</option>').join('')+'</select><span class="hint">bigger canvases draw 1:1 (no 1.3x stretch)</span></div>'+
   '<div class="frow"><label>Description</label><input data-f="desc" type="text" value="'+(t.desc||'').split('"').join('&quot;')+'" style="width:240px"></div>'+
   '<h3>TOWER HP PER UPGRADE TIER</h3><div class="fxgrid">'+
   [0,1,2,3,4].map(i=>'<div class="frow"><label>Tier '+(i+1)+' HP</label><input type="number" data-hp="'+i+'" value="'+t.hp[i]+'" min="10"></div>').join('')+'</div>';
  form.appendChild(wrap);
  { const sel=wrap.querySelector('[data-size]');sel.onchange=()=>{const [w,h]=sel.value.split('x').map(Number);
      if((w<spriteW(t.sprite)||h<spriteH(t.sprite))&&!confirm('Shrinking crops the edges of the drawing. Continue?')){renderTowerForm();return}
      resizeSprite(t.sprite,w,h);persist();renderTowerForm()} }
  // pixel editors
  const grid=document.createElement('div');grid.className='cols';
  const mk=(title,which,pivot,tip)=>{
    const pane=document.createElement('div');
    pane.innerHTML='<h3>'+title+'</h3>';
    const cv=document.createElement('canvas');cv.className='pix';cv.width=cv.height=336;
    pane.appendChild(cv);
    const tls=document.createElement('div');tls.className='pixtools';
    const pal=document.createElement('div');pal.className='palette';
    pane.appendChild(tls);pane.appendChild(pal);
    if(which==='turret'){
      pane.innerHTML+='<div class="frow"><label>Pivot</label>X <input type="number" style="width:50px" data-tf="ox" value="'+t.turret.ox+'"> Y <input type="number" style="width:50px" data-tf="oy" value="'+t.turret.oy+'">'+
        '<label style="flex-basis:60px">Tip</label>X <input type="number" style="width:50px" data-tf="tipx" value="'+t.turret.tip[0]+'"> Y <input type="number" style="width:50px" data-tf="tipy" value="'+t.turret.tip[1]+'"></div>'}
    grid.appendChild(pane);
    return makePixelEditor({canvas:cv,paletteEl:pal,toolEl:tls,
      get:()=>which==='body'?t.sprite:t.turret,
      pivot:pivot,tip:tip,
      onChange:()=>{drawPreview()}})};
  const bodyEd=mk('BODY SPRITE ('+spriteW(t.sprite)+'&times;'+spriteH(t.sprite)+')','body');
  const turEd=mk('TURRET (draw pointing RIGHT; gold=pivot, green=muzzle)','turret',
    {x:t.turret.ox||3,y:t.turret.oy||12},{x:t.turret.tip?t.turret.tip[0]:23,y:t.turret.tip?t.turret.tip[1]:12});
  form.appendChild(grid);
  // preview
  const prevPane=document.createElement('div');
  prevPane.innerHTML='<h3>GAME PREVIEW (on the map)</h3><canvas class="pix" id="twrPrev" width="240" height="'+(spriteH(t.sprite)>40?200:160)+'"></canvas>';
  form.appendChild(prevPane);
  function drawPreview(){
    const cv=document.getElementById('twrPrev');if(!cv)return;
    const g=cv.getContext('2d');g.imageSmoothingEnabled=false;
    const PH=cv.height;g.fillStyle='#183a41';g.fillRect(0,0,240,PH);
    g.fillStyle='#5c9448';g.fillRect(60,PH-40,120,40);
    const mx=120,my=PH-40,useLegs=t.legs!==false,sc=t.sprite.scale||1.3;
    if(useLegs){g.fillStyle='#3a3a44';g.fillRect(mx-6,my-11,5,11);g.fillRect(mx+1,my-11,5,11);
      g.fillStyle='#2c2c34';g.fillRect(mx-7,my-2,6,2);g.fillRect(mx+1,my-2,6,2)}
    drawRows(g,t.sprite,mx-t.sprite.w*sc/2,my-(useLegs?11:0)-t.sprite.h*sc,sc,false);
    g.save();g.translate(mx,my-(useLegs?21:14));g.rotate(-Math.PI/4);
    drawRows(g,t.turret,-(t.turret.ox||2)*sc,-(t.turret.oy||12)*sc,sc,false);
    g.restore()}
  drawPreview();
  towerUI={drawPreview:drawPreview};
  // field events
  form.querySelectorAll('[data-f]').forEach(inp=>{
    const f=inp.dataset.f;
    if(inp.tagName==='BUTTON'){
      inp.onclick=()=>{t[f]=f==='legs'?(t.legs===false):!t[f];
        inp.classList.toggle('on',f==='legs'?(t.legs!==false):!!t[f]);
        inp.textContent=(f==='legs'?(t.legs!==false):!!t[f])?'YES':'NO';
        persist();renderTowerForm()};
      return}
    if(inp.tagName==='SELECT'){
      inp.onchange=()=>{t[f]=(f==='lanes')?+inp.value:inp.value;
        if(f==='lanes'){t.ups.length=t.lanes;if(t.lanes===2&&!t.ups[1])t.ups[1]=upLane()}
        persist();renderTowerForm()};
      return}
    inp.onchange=()=>{
      t[f]=(f==='name'||f==='desc'||f==='id'||f==='dtype'||f==='behavior')?inp.value:+inp.value;
      if(f==='name'&&t.idAuto!==false){t.id=slug(inp.value);t.idAuto=true}
      persist();renderTowerList()}});
  form.querySelectorAll('[data-hp]').forEach(inp=>{inp.onchange=()=>{
    t.hp[+inp.dataset.hp]=Math.max(10,+inp.value||100);persist()}});
  form.querySelectorAll('[data-tf]').forEach(inp=>{inp.onchange=()=>{
    const f=inp.dataset.tf;
    if(f==='ox')t.turret.ox=+inp.value;
    if(f==='oy')t.turret.oy=+inp.value;
    if(f==='tipx')t.turret.tip=[+inp.value,t.turret.tip?t.turret.tip[1]:12];
    if(f==='tipy')t.turret.tip=[t.turret.tip?t.turret.tip[0]:23,+inp.value];
    persist();renderTowerForm()}});
  renderUpgradeEditor(t,form)}
function renderUpgradeEditor(t,form){
  const pane=document.createElement('div');
  pane.innerHTML='<h3>UPGRADE PATHS</h3>';
  for(let li=0;li<t.lanes;li++){
    t.ups[li]=t.ups[li]||upLane();
    const laneBox=document.createElement('div');
    const ln=document.createElement('div');ln.className='frow';
    ln.innerHTML='<label>Lane '+(li+1)+' name</label><input type="text" value="'+(t.laneNames[li]||'')+'" data-ln="'+li+'">';
    laneBox.appendChild(ln);
    t.ups[li].forEach((up,ui2)=>{
      const fx=up.fx=up.fx||{};
      const row=document.createElement('div');row.className='uprow';
      row.innerHTML=
       '<div class="frow"><label>#'+(ui2+1)+' name</label><input type="text" value="'+up.name+'" data-u="name" style="width:190px">'+
       '<label style="flex-basis:60px">Cost</label><input type="number" value="'+up.cost+'" data-u="cost" style="width:90px"></div>'+
       '<div class="fxgrid">'+
       '<div class="frow"><label>+ damage</label><input type="number" step="1" value="'+(fx.dmg||0)+'" data-x="dmg"></div>'+
       '<div class="frow"><label>+ attack rate</label><input type="number" step="0.1" value="'+(fx.rate||0)+'" data-x="rate"></div>'+
       '<div class="frow"><label>+ range</label><input type="number" step="0.25" value="'+(fx.range||0)+'" data-x="range"></div>'+
       '<div class="frow"><label>+ splash</label><input type="number" step="0.25" value="'+(fx.splash||0)+'" data-x="splash"></div>'+
       '<div class="frow"><label>+ income / wave</label><input type="number" value="'+(fx.income||0)+'" data-x="income"></div>'+
       '<div class="frow"><label>damage type</label><select data-x="dtype"><option value="">(keep)</option>'+DTYPES.map(d=>'<option '+(fx.dtype===d?'selected':'')+'>'+d+'</option>').join('')+'</select></div>'+
       '<div class="frow"><label>stealth detect</label><input type="checkbox" '+(fx.stealthDetect?'checked':'')+' data-x="stealthDetect"></div>'+
       '<div class="frow"><label>ignores bullet res</label><input type="checkbox" '+(fx.ignBullet?'checked':'')+' data-x="ignBullet"></div>'+
       '<div class="frow"><label>ignores explosive res</label><input type="checkbox" '+(fx.ignExplosive?'checked':'')+' data-x="ignExplosive"></div>'+
       '<div class="frow"><label>+ shrapnel count</label><input type="number" value="'+(fx.fragCount||0)+'" data-x="fragCount"></div>'+
       '<div class="frow"><label>+ shrapnel dmg</label><input type="number" value="'+(fx.fragDmg||0)+'" data-x="fragDmg"></div>'+
       '<div class="frow"><label>fire dmg/s</label><input type="number" value="'+(fx.burnDps||0)+'" data-x="burnDps"></div>'+
       '<div class="frow"><label>fire duration s</label><input type="number" step="0.5" value="'+(fx.burnDur||0)+'" data-x="burnDur"></div>'+
       '<div class="frow"><label>+ fire radius</label><input type="number" step="0.25" value="'+(fx.burnRadius||0)+'" data-x="burnRadius"></div>'+
       '<div class="frow"><label>chain targets</label><input type="number" value="'+(fx.chain||0)+'" data-x="chain"></div>'+
       '<div class="frow"><label>charge time s</label><input type="number" step="0.25" value="'+(fx.charge||0)+'" data-x="charge"></div>'+
       '</div>';
      row.querySelectorAll('[data-u]').forEach(inp=>{inp.onchange=()=>{
        up[inp.dataset.u]=(inp.dataset.u==='name')?inp.value:+inp.value;persist()}});
      row.querySelectorAll('[data-x]').forEach(inp=>{inp.onchange=()=>{
        const x=inp.dataset.x;
        if(inp.type==='checkbox'){if(inp.checked)fx[x]=true;else delete fx[x]}
        else if(x==='dtype'){if(inp.value)fx.dtype=inp.value;else delete fx.dtype}
        else{const v=+inp.value;if(v)fx[x]=v;else delete fx[x]}
        persist()}});
      laneBox.appendChild(row)});
    laneBox.querySelectorAll('[data-ln]').forEach(inp=>{inp.onchange=()=>{
      t.laneNames[li]=inp.value;persist()}});
    pane.appendChild(laneBox)}
  form.appendChild(pane)}
function renderTowerList(){
  renderList($('towerList'),data.towers,towerSel,
    i=>{towerSel=i;renderTowerList();renderTowerForm()},
    t=>(t.name||'(unnamed)')+(t.behavior==='farm'?' <small>FARM</small>':''))}
$('towerNew').onclick=()=>{const t=blankTower();
  t.name='TOWER '+(data.towers.length+1);t.id=slug(t.name);t.idAuto=true;
  data.towers.push(t);towerSel=data.towers.length-1;persist();renderTowerList();renderTowerForm()};
$('towerDel').onclick=()=>{if(towerSel<0)return;
  if(!confirm('Delete "'+data.towers[towerSel].name+'"?'))return;
  data.towers.splice(towerSel,1);towerSel=-1;persist();renderTowerList();renderTowerForm()};

// ================= ENEMIES =================
let enemyGen=0;
function renderEnemyForm(){
  const form=$('enemyForm');
  if(enemySel<0||!data.enemies[enemySel]){form.innerHTML='<div class="empty">Create or select an enemy.</div>';return}
  const e=data.enemies[enemySel];
  if(!e.sprite)e.sprite=blankSprite();
  form.innerHTML='';
  const wrap=document.createElement('div');
  wrap.innerHTML=
   '<div class="frow"><label>Name</label><input data-f="name" type="text" value="'+e.name+'"></div>'+
   '<div class="frow"><label>ID (unique)</label><input data-f="id" type="text" value="'+e.id+'"></div>'+
   '<div class="frow"><label>Boss?</label><button class="btn tgl '+(e.boss?'on':'')+'" data-f="boss">'+(e.boss?'YES':'NO')+'</button></div>'+
   '<div class="frow"><label>Health</label><input data-f="hp" type="number" value="'+e.hp+'" min="1"></div>'+
   '<div class="frow"><label>Speed tiles/s</label><input data-f="spd" type="number" value="'+e.spd+'" step="0.1" min="0.1"></div>'+
   '<div class="frow"><label>Gold reward</label><input data-f="rw" type="number" value="'+e.rw+'" min="0"></div>'+
   '<div class="frow"><label>Size radius</label><input data-f="r" type="number" value="'+e.r+'" min="5" max="22"></div>'+
   '<div class="frow"><label>Movement type</label><select data-f="kind">'+KINDS.map(k=>'<option value="'+k[0]+'" '+(e.kind===k[0]?'selected':'')+'>'+k[1]+'</option>').join('')+'</select></div>'+
   '<div class="frow"><label>Flying</label><button class="btn tgl '+(e.flying?'on':'')+'" data-f="flying">'+(e.flying?'YES':'NO')+'</button></div>'+
   '<div class="frow"><label>Stealth</label><button class="btn tgl '+(e.stealth?'on':'')+'" data-f="stealth">'+(e.stealth?'YES':'NO')+'</button></div>'+
   '<div class="frow"><label>Sword (boss)</label><button class="btn tgl '+(e.sword?'on':'')+'" data-f="sword">'+(e.sword?'YES':'NO')+'</button></div>'+
   '<div class="frow"><label>Mass stun (boss)</label><button class="btn tgl '+(e.stuns?'on':'')+'" data-f="stuns">'+(e.stuns?'YES':'NO')+'</button></div>'+
   '<div class="frow"><label>Shield HP</label><input data-f="shield" type="number" value="'+(e.shield||0)+'" min="0"></div>'+
   '<div class="frow"><label>Shield resist</label><input data-f="shieldRes" type="number" value="'+(e.shieldRes||0)+'" step="0.05" min="0" max="0.95"></div>'+
   '<div class="fxgrid">'+DTYPES.map(d=>'<div class="frow"><label>resists '+d+' %</label><input type="number" min="0" max="90" step="5" value="'+Math.round(((e.res&&e.res[d])||0)*100)+'" data-res="'+d+'"></div>').join('')+'</div>';
  form.appendChild(wrap);
  const pane=document.createElement('div');
  pane.innerHTML='<h3>SPRITE (24&times;24 PIXEL ART)</h3>';
  const cv=document.createElement('canvas');cv.className='pix';cv.width=cv.height=336;
  pane.appendChild(cv);
  const tls=document.createElement('div');tls.className='pixtools';
  const pal=document.createElement('div');pal.className='palette';
  pane.appendChild(tls);pane.appendChild(pal);
  pane.innerHTML+='<h3>GAME PREVIEW</h3><canvas class="pix" id="enPrev" width="200" height="120"></canvas>';
  form.appendChild(pane);
  const gen=++enemyGen;
  function drawPreview(){
    if(gen!==enemyGen)return;
    const g=document.getElementById('enPrev').getContext('2d');
    g.imageSmoothingEnabled=false;
    g.fillStyle='#183a41';g.fillRect(0,0,200,120);
    g.fillStyle='#8a6f4c';g.fillRect(0,95,200,25);
    const sc=(e.r*2.2)/24;
    drawRows(g,e.sprite,100-24*sc/2,95-24*sc,sc,false);
    requestAnimationFrame(drawPreview)}
  drawPreview();
  makePixelEditor({canvas:cv,paletteEl:pal,toolEl:tls,get:()=>e.sprite,onChange:()=>{}});
  form.querySelectorAll('[data-f]').forEach(inp=>{
    const f=inp.dataset.f;
    if(inp.tagName==='BUTTON'){inp.onclick=()=>{e[f]=!e[f];
      inp.classList.toggle('on',e[f]);inp.textContent=e[f]?'YES':'NO';
      persist();renderEnemyList()};return}
    if(inp.tagName==='SELECT'){inp.onchange=()=>{e[f]=inp.value;persist()};return}
    inp.onchange=()=>{e[f]=(f==='name'||f==='id')?inp.value:+inp.value;
      if(f==='name'&&e.idAuto!==false){e.id=slug(inp.value);e.idAuto=true}
      persist();renderEnemyList()}});
  form.querySelectorAll('[data-res]').forEach(inp=>{inp.onchange=()=>{
    e.res=e.res||{};const v=(+inp.value)/100;
    if(v)e.res[inp.dataset.res]=v;else delete e.res[inp.dataset.res];persist()}})}
function renderEnemyList(){
  renderList($('enemyList'),data.enemies,enemySel,
    i=>{enemySel=i;renderEnemyList();renderEnemyForm()},
    e=>(e.name||'(unnamed)')+(e.boss?' <small>BOSS</small>':''))}
$('enemyNew').onclick=()=>{const e=blankEnemy();
  e.name='ENEMY '+(data.enemies.length+1);e.id=slug(e.name);e.idAuto=true;
  data.enemies.push(e);enemySel=data.enemies.length-1;persist();renderEnemyList();renderEnemyForm()};
$('enemyDel').onclick=()=>{if(enemySel<0)return;
  if(!confirm('Delete "'+data.enemies[enemySel].name+'"?'))return;
  data.enemies.splice(enemySel,1);enemySel=-1;persist();renderEnemyList();renderEnemyForm()};

// ================= WAVES =================
function enemyOptions(){
  return ENEMY_KEYS.map(k=>'<option value="'+k[0]+'">'+k[1]+'</option>').join('')+
   data.enemies.filter(e=>!e.boss).map(e=>'<option value="'+e.id+'">'+e.name+' (yours)</option>').join('')}
function bossOptions(){
  return ['<option value="">— no boss —</option>']
   .concat(BOSS_KEYS.map(k=>'<option value="'+k[0]+'">'+k[1]+'</option>'))
   .concat(data.enemies.filter(e=>e.boss).map(e=>'<option value="'+e.id+'">'+e.name+' (yours)</option>'))
   .join('')}
function renderWaves(){
  const list=$('waveList');list.innerHTML='';
  data.waves.forEach((w,wi)=>{
    const box=document.createElement('div');box.className='wavebox';
    const total=(w.groups||[]).reduce((a,g)=>a+ +g.count,0);
    const head=document.createElement('div');head.className='wavehead';
    head.innerHTML='<b>WAVE '+(wi+1)+'</b><span class="sum">'+total+' unit(s)'+(w.big?' + BOSS '+w.big:'')+'</span>';
    const del=document.createElement('button');del.className='btn red';del.textContent='X';
    del.onclick=()=>{if(confirm('Delete wave '+(wi+1)+'?')){data.waves.splice(wi,1);persist();renderWaves()}};
    head.appendChild(del);box.appendChild(head);
    const brow=document.createElement('div');brow.className='grprow';
    brow.innerHTML='<span class="lbl">BOSS</span><select data-wb="'+wi+'">'+bossOptions()+'</select>';
    box.appendChild(brow);
    (w.groups||[]).forEach((g,gi)=>{
      const row=document.createElement('div');row.className='grprow';
      row.innerHTML='<span class="lbl">GROUP</span><select data-g="'+gi+'" data-gf="type">'+enemyOptions()+'</select>'+
       '<span class="lbl">count</span><input type="number" min="1" max="200" value="'+g.count+'" data-g="'+gi+'" data-gf="count">'+
       '<span class="lbl">gap s</span><input type="number" min="0.05" step="0.05" value="'+g.gap+'" data-g="'+gi+'" data-gf="gap">'+
       '<span class="lbl">start s</span><input type="number" min="0" step="0.5" value="'+g.delay+'" data-g="'+gi+'" data-gf="delay">';
      const gb=document.createElement('button');gb.className='btn red';gb.textContent='X';
      gb.onclick=()=>{w.groups.splice(gi,1);persist();renderWaves()};
      row.appendChild(gb);box.appendChild(row)});
    box.querySelector('select[data-wb="'+wi+'"]').value=w.big||'';
    box.querySelectorAll('select[data-g]').forEach(s=>{s.value=data.waves[wi].groups[+s.dataset.g].type});
    const addg=document.createElement('button');addg.className='btn';addg.textContent='+ ADD GROUP';
    addg.onclick=()=>{(w.groups=w.groups||[]).push({type:'walker',count:6,gap:1,delay:1});persist();renderWaves()};
    box.appendChild(addg);
    list.appendChild(box)});
  if(!data.waves.length)list.innerHTML='<div class="empty">No waves yet — add wave 1 below.</div>';
  document.querySelectorAll('#waveList [data-wb]').forEach(s=>{s.onchange=()=>{
    data.waves[+s.dataset.wb].big=s.value||null;persist();renderWaves()}});
  document.querySelectorAll('#waveList [data-g]').forEach(inp=>{inp.onchange=()=>{
    const box=inp.closest('.wavebox');
    const wi=Array.prototype.indexOf.call(document.querySelectorAll('#waveList .wavebox'),box);
    const g=data.waves[wi].groups[+inp.dataset.g];if(!g)return;
    const f=inp.dataset.gf;
    g[f]=(f==='type')?inp.value:Math.max(.05,+inp.value||1);
    if(f==='delay')g.delay=Math.max(0,+inp.value||0);
    persist();renderWaves()}});
}
$('waveNew').onclick=()=>{data.waves.push({big:null,groups:[{type:'walker',count:6,gap:1,delay:1}]});
  persist();renderWaves()};
[['modeName','name'],['modeStartCash','startCash'],['modeHp','hp'],['modeHpMul','hpMul'],
 ['modeSpdMul','spdMul'],['modeMoneyMul','moneyMul'],['modeRewardMul','rewardMul']]
.forEach(a=>{const el=$(a[0]);el.value=data.mode[a[1]]!=null?data.mode[a[1]]:el.value;
  el.onchange=()=>{data.mode[a[1]]=(a[1]==='name')?el.value:+el.value;persist()}});

// ================= EXPORT =================
function jsVal(v){return JSON.stringify(v)}
function towerSnippet(t){
  const parts=['CUSTOM_TOWERS.'+(t.id||slug(t.name))+'={'];
  parts.push('  name:'+jsVal(t.name)+',cost:'+t.cost+',price:'+t.price+
    ',dtype:'+jsVal(t.dtype)+',range:'+t.range+',dmg:'+t.dmg+',rate:'+t.rate+
    ',air:'+(!!t.air)+',lanes:'+t.lanes+',limit:'+t.limit+
    (t.splash?',splash:'+t.splash:'')+
    ',behavior:'+jsVal(t.behavior||'bullet')+
    (t.behavior==='farm'&&t.income?',income:'+t.income:'')+
    ((t.behavior==='beam'&&t.charge)?',charge:'+t.charge:'')+
    (t.chain?',chain:'+t.chain:'')+
    ',legs:'+(t.legs!==false)+
    ',tiers:'+jsVal(t.hp)+',');
  parts.push('  desc:'+jsVal(t.desc||'')+',');
  parts.push('  laneNames:'+jsVal(t.laneNames||['PATH A'])+',');
  parts.push('  ups:'+jsVal(t.ups));
  if(t.sprite&&t.sprite.pal.length)parts.push(',sprite:'+jsVal(t.sprite));
  if(t.turret&&t.turret.pal.length)parts.push(',turret:'+jsVal(t.turret));
  parts.push('};');
  return parts.join('\n')}
function enemySnippet(e){
  const parts=['CUSTOM_ENEMIES.'+(e.id||slug(e.name))+'={'];
  parts.push('  name:'+jsVal(e.name)+',boss:'+(!!e.boss)+
    ',hp:'+e.hp+',spd:'+e.spd+',rw:'+e.rw+',r:'+e.r+',kind:'+jsVal(e.kind)+
    (e.flying?',flying:true':'')+(e.stealth?',stealth:true':'')+
    (e.shield?',shield:'+e.shield+',shieldRes:'+(e.shieldRes||0):'')+
    (e.sword?',sword:true':'')+(e.stuns?',stuns:true':'')+
    (e.res&&Object.keys(e.res).length?',res:'+jsVal(e.res):'')+
    (e.sprite&&e.sprite.pal.length?',sprite:'+jsVal(e.sprite):''));
  parts.push('};');
  return parts.join('\n')}
function wavesSnippet(){
  const id=slug(data.mode.name);
  const m=data.mode;
  let s='MODES.'+id+'={id:'+jsVal(id)+',name:'+jsVal(m.name)+',desc:'+jsVal('Custom mode')+
   ',lockDesc:\'Locked\',unlock:true,hp:'+m.hp+',hpMul:'+m.hpMul+',spdMul:'+m.spdMul+
   ',moneyMul:'+m.moneyMul+',rewardMul:'+m.rewardMul+',waves:'+Math.max(1,data.waves.length)+
   ',startCash:'+m.startCash+'};\n';
  s+='window.CUSTOM_WAVES=window.CUSTOM_WAVES||{};\n';
  s+='CUSTOM_WAVES.'+id+'={\n';
  const entries=data.waves.map((w,i)=>{
    const groups=(w.groups||[]).map(g=>'{type:'+jsVal(g.type)+',count:'+g.count+',gap:'+g.gap+',delay:'+(g.delay!=null?g.delay:1)+'}');
    return '  '+(i+1)+':{big:'+(w.big?jsVal(w.big):'null')+',groups:['+groups.join(',')+']}'});
  s+=entries.join(',\n')+'\n};';
  return s}
$('btnExport').onclick=()=>{
  const errs=[];
  if(data.towers.some(t=>!t.id))errs.push('a tower is missing an ID');
  if(data.enemies.some(e=>!e.id))errs.push('an enemy is missing an ID');
  if(errs.length){flash('Fix first: '+errs.join('; '),true);return}
  const tw=data.towers.map(towerSnippet).join('\n');
  const en=data.enemies.map(enemySnippet).join('\n');
  $('exportTowers').value=[tw,en].filter(Boolean).join('\n')||'(nothing designed yet)';
  $('exportWaves').value=data.waves.length?wavesSnippet():'(no waves designed)';
  flash('Code ready — copy into js/config.js')};
function dl(text,name){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));
  a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
$('copyTowers').onclick=()=>{if(!$('exportTowers').value)$('btnExport').onclick();
  navigator.clipboard.writeText($('exportTowers').value)
   .then(()=>flash('Copied! Paste into js/config.js'))
   .catch(()=>{$('exportTowers').select();document.execCommand('copy');flash('Copied!')})};
$('copyWaves').onclick=()=>{if(!$('exportWaves').value)$('btnExport').onclick();
  navigator.clipboard.writeText($('exportWaves').value)
   .then(()=>flash('Copied! Paste into js/config.js'))
   .catch(()=>{$('exportWaves').select();document.execCommand('copy');flash('Copied!')})};
$('dlTowers').onclick=()=>{if(!$('exportTowers').value)$('btnExport').onclick();dl($('exportTowers').value,'tdv-towers.config.js')};
$('dlWaves').onclick=()=>{if(!$('exportWaves').value)$('btnExport').onclick();dl($('exportWaves').value,'tdv-waves.config.js')};
$('btnProject').onclick=()=>{
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,1)],{type:'application/json'}));
  a.download='tdv-towers-project.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000)};
$('fileImport').onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=()=>{try{
    const p=JSON.parse(rd.result);
    if(!p||!p.towers)throw 0;
    data=p;persist();towerSel=enemySel=-1;
    renderTowerList();renderTowerForm();renderEnemyList();renderEnemyForm();renderWaves();
    flash('Project loaded');
  }catch(err){flash('Not a valid project file',true)}};
  rd.readAsText(f)};

renderTowerList();renderTowerForm();renderEnemyList();renderEnemyForm();renderWaves();
