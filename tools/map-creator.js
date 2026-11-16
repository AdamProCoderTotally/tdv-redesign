"use strict";
// ============================================================
//  map-creator.js — TDV Map Creator. Standalone tool: paints
//  maps and exports a CUSTOM_MAPS snippet to paste into the
//  paste zone at the bottom of js/map.js.
// ============================================================
const $=id=>document.getElementById(id);
function hash2(x,y){let h=(x*374761393+y*668265263)|0;h=(h^(h>>13))*1274126177|0;
  return((h^(h>>16))>>>0)/4294967295}
function slug(s){return (s||'map').toLowerCase().replace(/[^a-z0-9]+/g,'_')
  .replace(/^_+|_+$/g,'').slice(0,18)||'map'}
function flash(msg,bad){const el=$('status');el.textContent=msg;
  el.style.color=bad?'#f0a494':'#8ce89a';
  clearTimeout(flash._t);flash._t=setTimeout(()=>{el.textContent=''},3000)}

const GW=26,GH=26;
const DEFAULT_COLORS={
  grass:'#5c9448',grassDetail1:'#4c8038',grassDetail2:'#6ea455',
  forest:'#446e37',forestDetail1:'#3a5f2e',forestDetail2:'#527a40',
  water:'#2e5a5e',water2:'#2b565a',waterEdge:'#3f7478',
  ocean:'#1c4149',ocean2:'#1d454d',sand:'#c9b178',
  elev1:'#568a44',elev2:'#4f7c3e',elev3:'#47703a',
  cliffL:'#4a3f2f',cliffD:'#3a3126',
  road:'#8a6f4c',roadLight:'#9a805c',roadDark:'#5f4a30',
  baseA:'#8e7a5e',baseB:'#8a755a',baseC:'#7a6848',baseD:'#766446'};
const COLOR_LABELS=[
  ['grass','Grass'],['grassDetail1','Grass speck A'],['grassDetail2','Grass speck B'],
  ['forest','Forest ring'],['forestDetail1','Forest speck A'],['forestDetail2','Forest speck B'],
  ['water','Water A'],['water2','Water B'],['waterEdge','Water edge'],
  ['ocean','Ocean A'],['ocean2','Ocean B'],['sand','Beach ring'],
  ['elev1','Hill tint'],['elev2','Mountain tint'],['elev3','Peak tint'],
  ['cliffL','Cliff light'],['cliffD','Cliff dark'],
  ['road','Road'],['roadLight','Road centre'],['roadDark','Road border'],
  ['baseA','Base tile A'],['baseB','Base tile B'],['baseC','Base outer A'],['baseD','Base outer B']];

const LS='tdv_map_creator_v1';
function blankMap(){return{id:'',name:'NEW MAP',desc:'A custom arena.',wps:[],water:[],elev:[],
  base:null,colors:{},overrides:{},texture:null,textureAlpha:.3}}
let maps=[],sel=-1,tool='path';
try{maps=JSON.parse(localStorage.getItem(LS))||[]}catch(e){maps=[]}
if(!maps.length)maps.push(seedMap());
if(sel<0&&maps.length)sel=0;
function seedMap(){const m=blankMap();m.name='MY MAP';m.id='my_map';
  m.wps=[[-2,13],[8,13],[8,4],[18,4],[18,18],[23,18]];m.base={x:21,y:16,w:3,h:3};return m}
function persist(){try{localStorage.setItem(LS,JSON.stringify(maps))}catch(e){}}
function cur(){return maps[sel]}

// ---- map list ----
function renderList(){
  const el=$('mapList');el.innerHTML='';
  maps.forEach((m,i)=>{
    const b=document.createElement('button');b.className='btn'+(i===sel?' sel':'');
    b.textContent=m.name||'(unnamed)';
    b.onclick=()=>{sel=i;syncFields();renderList();draw()};
    el.appendChild(b)})}
$('mapNew').onclick=()=>{maps.push(seedMap());sel=maps.length-1;persist();syncFields();renderList();draw()};
$('btnNew').onclick=()=>{if(!confirm('Start a brand-new empty map? (Export/save backups first!)'))return;
  maps.push(blankMap());sel=maps.length-1;persist();syncFields();renderList();draw()};

// ---- fields ----
function syncFields(){const m=cur();
  $('mName').value=m.name;$('mDesc').value=m.desc;
  $('texAlpha').value=m.textureAlpha}
$('mName').oninput=e=>{cur().name=e.target.value;cur().id=slug(e.target.value);persist();renderList();draw()};
$('mDesc').oninput=e=>{cur().desc=e.target.value;persist()};

// ---- tools ----
document.querySelectorAll('#tools .btn').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('#tools .btn').forEach(o=>o.classList.toggle('on',o===b));
  tool=b.dataset.tool});
$('undoWp').onclick=()=>{cur().wps.pop();persist();draw()};
$('clearPath').onclick=()=>{cur().wps=[];persist();draw()};
$('clearAll').onclick=()=>{if(!confirm('Clear the whole map?'))return;
  Object.assign(cur(),{wps:[],water:[],elev:[],base:null,overrides:{}});persist();draw()};
$('loadDefault').onclick=()=>{
  const water=[];
  for(let y=17;y<=25;y++)water.push([15,y]);
  for(let x=0;x<=6;x++)water.push([x,13]);
  for(let y=3;y<=6;y++)for(let x=20;x<=23;x++)if(hash2(x,y)>.15)water.push([x,y]);
  const elev=[];const push=(x0,y0,x1,y1,l)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)elev.push([x,y,l])};
  push(19,17,23,20,1);push(22,18,23,19,2);push(0,0,3,2,1);push(24,8,25,11,1);push(0,22,2,25,1);
  Object.assign(cur(),{wps:[[-2,6],[7,6],[7,2],[13,2],[13,10],[4,10],[4,16],[10,16],[10,22],[18,22],[18,13],[21,13]],
    water:water,elev:elev,base:{x:20,y:12,w:3,h:3}});
  persist();draw()};

// ---- canvas ----
const MC=$('mapCanvas'),MG=MC.getContext('2d');
function cell(e){const r=MC.getBoundingClientRect();
  return{x:Math.floor((e.clientX-r.left)/r.width*GW),y:Math.floor((e.clientY-r.top)/r.height*GH)}}
function applyTool(c){
  const m=cur();
  if(c.x<0||c.x>=GW||c.y<0||c.y>=GH)return;
  const k=c.x+','+c.y;
  const inWater=i=>m.water.findIndex(w=>w[0]===i.x&&w[1]===i.y);
  const inElev=i=>m.elev.findIndex(v=>v[0]===i.x&&v[1]===i.y);
  if(tool==='path'){m.wps.push([c.x,c.y]);persist();draw()}
  else if(tool==='water'){
    if(inWater(c)<0){m.water.push([c.x,c.y]);
      let i=inElev(c);if(i>=0)m.elev.splice(i,1);
      if(m.overrides[k])delete m.overrides[k]}
    persist();draw()}
  else if(tool==='grass'){
    let i=inWater(c);if(i>=0)m.water.splice(i,1);
    i=inElev(c);if(i>=0)m.elev.splice(i,1);
    if(m.overrides[k])delete m.overrides[k];
    persist();draw()}
  else if(tool==='elev1'||tool==='elev2'||tool==='elev3'){
    const lvl=+tool.slice(4);
    let i=inElev(c);if(i>=0)m.elev.splice(i,1);
    i=inWater(c);if(i>=0)m.water.splice(i,1);
    m.elev.push([c.x,c.y,lvl]);persist();draw()}
  else if(tool==='base'){
    m.base={x:Math.min(Math.max(c.x-1,1),GW-2),y:Math.min(Math.max(c.y-1,1),GH-2),w:3,h:3};
    persist();draw()}
  else if(tool==='paint'){
    m.overrides[k]=$('paintCol').value;
    let i=inWater(c);if(i>=0)m.water.splice(i,1);
    persist();draw()}
  else if(tool==='clear'){
    if(m.overrides[k])delete m.overrides[k];
    persist();draw()}}
MC.addEventListener('pointerdown',e=>{
  if(e.button===2)return;
  applyTool(cell(e));
  if(tool==='water'||tool==='grass'||tool==='paint'||tool==='clear'){
    const mv=ev=>applyTool(cell(ev));
    const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up)};
    window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up)}});
MC.addEventListener('contextmenu',e=>{
  e.preventDefault();
  if(tool==='path'&&cur().wps.length){cur().wps.pop();persist();draw()}});

function draw(){
  const m=cur(),s=MC.width/GW;
  const em=new Map();for(const e of m.elev)em.set(e[0]+','+e[1],e[2]);
  const ws=new Set();for(const w of m.water)ws.add(w[0]+','+w[1]);
  const C=Object.assign({},DEFAULT_COLORS,m.colors);
  MG.fillStyle=C.ocean;MG.fillRect(0,0,MC.width,MC.height);
  for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){
    const k=x+','+y,ovc=m.overrides[k];
    let col;
    if(ovc)col=ovc;
    else if(ws.has(k))col=hash2(x,y)<.5?C.water:C.water2;
    else{const lv=em.get(k)||0;
      col=lv===3?C.elev3:lv===2?C.elev2:lv===1?C.elev1:(hash2(x,y)<.5?C.grass:C.grass)}
    MG.fillStyle=col;MG.fillRect(x*s,y*s,s+.5,s+.5);
    if(!ovc&&!ws.has(k))for(let d=0;d<2;d++){
      const r1=hash2(x*17+d*3,y*29),r2=hash2(x*31,y*13+d);
      MG.fillStyle=r1<.5?C.grassDetail1:C.grassDetail2;
      MG.fillRect(x*s+r1*s*.8,y*s+r2*s*.8,2,2)}}
  MG.strokeStyle='rgba(0,0,0,.18)';MG.lineWidth=1;
  for(let i=0;i<=GW;i++){MG.beginPath();MG.moveTo(i*s,0);MG.lineTo(i*s,GH*s);MG.stroke();
    MG.beginPath();MG.moveTo(0,i*s);MG.lineTo(GW*s,i*s);MG.stroke()}
  if(m.base){const b=m.base;
    MG.fillStyle=C.baseA;MG.fillRect(b.x*s,b.y*s,b.w*s,b.h*s);
    MG.strokeStyle='#f5c56a';MG.lineWidth=2;MG.strokeRect(b.x*s+1,b.y*s+1,b.w*s-2,b.h*s-2)}
  if(m.wps.length){
    MG.strokeStyle='#e8dcc0';MG.lineWidth=Math.max(3,s*.3);MG.lineJoin='round';MG.lineCap='round';
    MG.beginPath();
    m.wps.forEach((w,i)=>{const X=(w[0]+.5)*s,Y=(w[1]+.5)*s;i?MG.lineTo(X,Y):MG.moveTo(X,Y)});
    MG.stroke();
    m.wps.forEach((w,i)=>{const X=(w[0]+.5)*s,Y=(w[1]+.5)*s;
      MG.fillStyle=i===0?'#7cff5a':(i===m.wps.length-1?'#f5c56a':'#ffffff');
      MG.beginPath();MG.arc(X,Y,4,0,7);MG.fill();
      MG.fillStyle='#000';MG.font='9px monospace';MG.textAlign='center';MG.fillText(i+1,X,Y+3)})}
  const warn=$('warn');let msg='';
  if(m.wps.length<2)msg='Path needs at least 2 waypoints.';
  else if(!m.base)msg='Place the base with the BASE tool.';
  else{const last=m.wps[m.wps.length-1],b=m.base;
    if(last[0]<b.x||last[0]>=b.x+b.w||last[1]<b.y||last[1]>=b.y+b.h)
      msg='Tip: end the path on the base so leaks look right.'}
  warn.textContent=msg}

// ---- palette ----
function renderPalette(){
  const m=cur(),el=$('palette');el.innerHTML='';
  COLOR_LABELS.forEach(([key,label])=>{
    const row=document.createElement('div');row.className='frow';
    const lab=document.createElement('label');lab.textContent=label;
    const inp=document.createElement('input');inp.type='color';
    inp.value=m.colors[key]||DEFAULT_COLORS[key];
    inp.oninput=()=>{m.colors[key]=inp.value;persist();draw()};
    row.appendChild(lab);row.appendChild(inp);el.appendChild(row)})}
$('palReset').onclick=()=>{cur().colors={};persist();renderPalette();draw()};

// ---- texture ----
$('texFile').onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const img=new Image();
  img.onload=()=>{
    const c=document.createElement('canvas');c.width=c.height=128;
    c.getContext('2d').drawImage(img,0,0,128,128);
    cur().texture=c.toDataURL('image/png');
    persist();$('texPrev').textContent='Texture set ('+f.name+')';draw()};
  img.src=URL.createObjectURL(f)};
$('texAlpha').oninput=e=>{cur().textureAlpha=+e.target.value;persist()};
$('texClear').onclick=()=>{cur().texture=null;persist();$('texPrev').textContent='';flash('Texture removed')};

// ---- export ----
function buildSnippet(){
  const m=cur(),id=m.id||slug(m.name);
  const colors={};for(const k in m.colors)
    if(m.colors[k]&&m.colors[k].toLowerCase()!==DEFAULT_COLORS[k].toLowerCase())colors[k]=m.colors[k];
  const parts=[];
  parts.push("CUSTOM_MAPS."+id+"={");
  parts.push("  name:"+JSON.stringify(m.name)+",");
  parts.push("  desc:"+JSON.stringify(m.desc)+",");
  parts.push("  wps:"+JSON.stringify(m.wps)+",");
  parts.push("  water:"+JSON.stringify(m.water)+",");
  parts.push("  elev:"+JSON.stringify(m.elev)+",");
  parts.push("  base:"+JSON.stringify(m.base));
  if(Object.keys(colors).length)parts.push("  ,colors:"+JSON.stringify(colors));
  if(Object.keys(m.overrides).length)parts.push("  ,overrides:"+JSON.stringify(m.overrides));
  if(m.texture)parts.push("  ,texture:'"+m.texture+"',textureAlpha:"+m.textureAlpha);
  parts.push("};");
  return parts.join('\n')}
function doExport(){
  const m=cur();
  if(m.wps.length<2||!m.base){flash('Path (2+ points) and base required to export',true);return}
  $('exportBox').value=buildSnippet();
  flash('Code ready — copy into js/map.js')}
$('btnExport').onclick=doExport;
$('copyExport').onclick=()=>{
  if(!$('exportBox').value)doExport();
  navigator.clipboard.writeText($('exportBox').value)
    .then(()=>flash('Copied! Paste into js/map.js'))
    .catch(()=>{$('exportBox').select();document.execCommand('copy');flash('Copied!')})};
$('dlExport').onclick=()=>{
  if(!$('exportBox').value)doExport();
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([$('exportBox').value],{type:'text/javascript'}));
  a.download=(cur().id||'my_map')+'.map.js';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000)};
$('btnProject').onclick=()=>{
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(maps,null,1)],{type:'application/json'}));
  a.download='tdv-maps-project.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000)};
$('fileImport').onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=()=>{try{
    const p=JSON.parse(rd.result);
    if(!Array.isArray(p))throw 0;
    maps=p;sel=0;persist();syncFields();renderList();renderPalette();draw();flash('Project loaded');
  }catch(err){flash('Not a valid project file',true)}};
  rd.readAsText(f)};

syncFields();renderList();renderPalette();draw();
