"use strict";
// ============================================================
//  input.js — keyboard, mouse, touch, free-placement validation
// ============================================================
const keys={};let dragStart=null,isDragging=false,pinchD=0,mouseClient=null;
const touches=new Map();
const ZOOM_MIN=.5,ZOOM_MAX=2.4;
let hoverPx=null;
function updHover(cx,cy){hoverPx=screenToMap(cx,cy)}

// ---- pointer events ----
canvas.addEventListener('pointerdown',e=>{Sfx.init();
  if(e.button===2){e.preventDefault();
    if(G.state==='playing'||G.state==='paused'){
      if(G.placeType){G.placeType=null;updTowerbar()}
      else if(G.sel)selectTower(null)}
    return}
  if(e.button!==0)return;
  if(e.pointerType==='touch')touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  updHover(e.clientX,e.clientY);
  mouseClient={x:e.clientX,y:e.clientY};
  dragStart={x:e.clientX,y:e.clientY,cx:cam.tx,cy:cam.ty};isDragging=false;
  try{canvas.setPointerCapture(e.pointerId)}catch(err){}});

canvas.addEventListener('pointermove',e=>{
  if(e.pointerType==='touch'&&touches.has(e.pointerId))touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  updHover(e.clientX,e.clientY);mouseClient={x:e.clientX,y:e.clientY};
  if(!dragStart)return;
  const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;
  if(!isDragging&&hyp(dx,dy)>7)isDragging=true;
  if(isDragging){cam.tx=dragStart.cx-dx/cam.zoom;cam.ty=dragStart.cy-dy/cam.zoom;
    cam.x=cam.tx;cam.y=cam.ty;camClamp()}});

canvas.addEventListener('pointerup',e=>{touches.delete(e.pointerId);
  if(!isDragging&&dragStart&&e.button===0)handleClick(e.clientX,e.clientY);
  dragStart=null;isDragging=false});
canvas.addEventListener('pointerleave',()=>{mouseClient=null});
canvas.addEventListener('pointercancel',e=>{touches.delete(e.pointerId);dragStart=null;isDragging=false});
canvas.addEventListener('wheel',e=>{e.preventDefault();Sfx.init();
  const oldZ=cam.tz,nz=clamp(oldZ*(e.deltaY>0?.88:1.14),ZOOM_MIN,ZOOM_MAX);
  if(nz===oldZ)return;
  const cw=canvas.width/dpr,ch=canvas.height/dpr;
  const m=screenToMap(e.clientX,e.clientY);
  cam.tz=cam.zoom=nz;
  cam.tx=m.x-(e.clientX-cw/2)/nz;cam.ty=m.y-(e.clientY-ch/2)/nz;
  cam.x=cam.tx;cam.y=cam.ty;camClamp()},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());

// ---- keyboard ----
addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;
  if(G.state!=='playing'&&G.state!=='paused')return;
  const k=e.key.toLowerCase();
  if(k==='escape'){if(G.placeType){G.placeType=null;updTowerbar()}
    else if(G.sel)selectTower(null);else togglePause()}
  if(k==='q'&&G.placeType){G.placeType=null;updTowerbar()}
  if(k==='x'&&G.sel){sellTower(G.sel)}
  if(k===' '){e.preventDefault();
    if(!WaveMgr.active&&G.state==='playing')WaveMgr.start(WaveMgr.n+1)}
  if(k==='f')recenter();
  // Digits past 6 reach the slots `give_tower` adds during a match.
  if(/^[1-9]$/.test(k)&&G.state==='playing')selectLoadoutSlot(+k-1)});
addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
// A key released while the window is unfocused never sends its keyup, so the
// camera would still be panning the moment the player comes back.
addEventListener('blur',()=>{for(const k in keys)keys[k]=false});

// ---- pinch zoom (touch) ----
setInterval(function(){
  if(touches.size===2){const arr=[...touches.values()];
    const d=hyp(arr[0].x-arr[1].x,arr[0].y-arr[1].y);
    if(pinchD>0){cam.tz=cam.zoom=clamp(cam.tz*(d/pinchD),ZOOM_MIN,ZOOM_MAX);camClamp()}pinchD=d}
  else pinchD=0},16);

// ---- free-placement validation ----
function distToPath(px,py){let best=1e9;
  for(let i=0;i<PATH_SAMPLES.length;i++){const s=PATH_SAMPLES[i];
    const d=dist2(px,py,s.x,s.y);if(d<best)best=d}
  return Math.sqrt(best)}
const PATH_CLEAR=.75, TOWER_SPACING=.85;
function canPlaceAt(px,py){
  const tx=Math.floor(px),ty=Math.floor(py);
  if(tx<0||tx>=GW||ty<0||ty>=GH)return false;
  if(grid[ty][tx]===2)return false;
  if(baseTiles.has(tx+','+ty))return false;
  if(distToPath(px,py)<PATH_CLEAR)return false;
  const s2=TOWER_SPACING*TOWER_SPACING;
  for(const t of towers)if(dist2(t.x,t.y,px,py)<s2)return false;
  return true}

// placement limits
function towerCountOf(type){let n=0;for(const t of towers)if(t.type===type)n++;return n}
function atLimit(type){
  const d=TOWERS[type];return!!(d.limit&&towerCountOf(type)>=d.limit)}

function tryPlaceAt(px,py){if(G.mp&&G.mp.inMatch&&G.mp.role!=='defender')return;
  const d=TOWERS[G.placeType];
  if(G.cash<d.cost){toast('Not enough cash','bad');return}
  if(atLimit(G.placeType)){limitToast(G.placeType);return}
  if(!canPlaceAt(px,py)){
    const tx=Math.floor(px),ty=Math.floor(py);
    if(tx<0||tx>=GW||ty<0||ty>=GH||grid[ty][tx]===2||baseTiles.has(tx+','+ty)||distToPath(px,py)<PATH_CLEAR)
      toast('Cannot build here','bad');
    else toast('Too close to another tower','bad');
    return}
  placeTower(G.placeType,px,py);
  if(G.cash<d.cost)G.placeType=null;
  updTowerbar()}
function pickTower(mx,my){let best=null,bd=34*34;
  for(const t of towers){const c=worldToMap(t.x,t.y);
    const d=dist2(mx,my-8,c.x,c.y-elevAt(t.x,t.y)*ELEVH);
    if(d<bd){bd=d;best=t}}
  return best}
function handleClick(cx,cy){if(G.state!=='playing')return;
  const mp=screenToMap(cx,cy);
  if(G.placeType){const gp=mapToGridPoint(mp.x,mp.y);tryPlaceAt(gp.x,gp.y);return}
  selectTower(pickTower(mp.x,mp.y))}