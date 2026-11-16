"use strict";
// ============================================================
//  map.js — grid, path, terrain pre-render, decorations,
//  and the multi-map system (Custom Map Creator exports land
//  in the CUSTOM_MAPS paste zone below and appear in the map
//  select screen as fully playable maps).
// ============================================================
const TW=64,TH=32,GW=26,GH=26,BRD=6,ELEVH=14;
const EXT0=-BRD-1,EXT1=GW+BRD+1;
const ISO_XMIN=(EXT0-(EXT1-1))*TW/2-TW/2;
const ISO_XMAX=((EXT1-1)-EXT0)*TW/2+TW/2;
const ISO_YMIN=(EXT0*2)*TH/2-TH/2-ELEVH*2-8;
const ISO_YMAX=((EXT1-1)*2)*TH/2+TH/2+8;
const PADX=-ISO_XMIN,PADY=-ISO_YMIN;
const TERR_W=Math.ceil(ISO_XMAX-ISO_XMIN),TERR_H=Math.ceil(ISO_YMAX-ISO_YMIN);
const isoX=(x,y)=>(x-y)*TW/2,isoY=(x,y)=>(x+y)*TH/2;
// The projection in the two shapes callers actually want: the pair of scalars is
// what the per-frame loops use, worldToMap hands back the object for the ones
// that keep both axes around.
const mapPx=(x,y)=>PADX+isoX(x,y),mapPy=(x,y)=>PADY+isoY(x,y);
const worldToMap=(x,y)=>({x:mapPx(x,y),y:mapPy(x,y)});
const mapToGridPoint=(mx,my)=>{const X=mx-PADX,Y=my-PADY;return{x:X/TW+Y/TH,y:Y/TH-X/TW}};
const mapToTile=(mx,my)=>{const g=mapToGridPoint(mx,my);return{x:Math.floor(g.x),y:Math.floor(g.y)}};

// ---- tile palette (a custom map may override any of these) ----
const DEFAULT_MAP_COLORS={
  ocean:'#1d5068',ocean2:'#1d454d',
  water:'#2b7c8c',water2:'#2b565a',waterEdge:'#3f7478',
  sand:'#d6bc7c',sand2:'#c2a972',
  forest:'#336a35',forestDetail1:'#3a5f2e',forestDetail2:'#527a40',forestHi:'#5f8f4a',
  grass:'#4f9a3e',grassDetail1:'#4c8038',grassDetail2:'#6ea455',grassHi:'#7cb461',
  sandSpeck1:'#b9a066',sandSpeck2:'#dcc48e',
  elev1:'#5aa444',elev2:'#4f7c3e',elev3:'#47703a',
  cliffL:'#7a5a48',cliffD:'#3a3126',
  roadDark:'#5f4a30',road:'#a87c4c',roadLight:'#9a805c',
  roadSpeck1:'#7c6544',roadSpeck2:'#a89070',
  bridgeDark:'#3e2f1f',bridgeMid:'#6a5236',bridgeLight:'#8a6c48',bridgeRail:'#5c4430',bridgePost:'#4a3826',
  fencePost:'#5c4428',fenceTop:'#7a5c38',fenceRail:'#6a4e30',
  baseA:'#8c8a80',baseB:'#8a755a',baseC:'#7a6848',baseD:'#766446',
  baseSpeck1:'#6e5c40',baseSpeck2:'#9c8868'};

function mapColorsFor(data){return Object.assign({},DEFAULT_MAP_COLORS,(data&&data.colors)||{})}

// ---- path ----
const PATH_WP=[[-2,6],[7,6],[7,2],[13,2],[13,10],[4,10],[4,16],[10,16],[10,22],[18,22],[18,13],[21,13]];
function buildPath(wps,r){
  r=r||.75;
  const pts=wps.map(p=>({x:p[0]+.5,y:p[1]+.5}));
  const out=[{x:pts[0].x,y:pts[0].y}];
  for(let i=1;i<pts.length-1;i++){
    const p0=pts[i-1],p1=pts[i],p2=pts[i+1];
    const d1=hyp(p1.x-p0.x,p1.y-p0.y),d2=hyp(p2.x-p1.x,p2.y-p1.y);
    const r1=Math.min(r,d1*.45),r2=Math.min(r,d2*.45);
    const ax=p1.x+(p0.x-p1.x)/d1*r1,ay=p1.y+(p0.y-p1.y)/d1*r1;
    const bx=p1.x+(p2.x-p1.x)/d2*r2,by=p1.y+(p2.y-p1.y)/d2*r2;
    out.push({x:ax,y:ay});
    for(let t=.25;t<1;t+=.25)
      out.push({x:(1-t)*(1-t)*ax+2*(1-t)*t*p1.x+t*t*bx,y:(1-t)*(1-t)*ay+2*(1-t)*t*p1.y+t*t*by});
    out.push({x:bx,y:by});
  }
  out.push({x:pts[pts.length-1].x,y:pts[pts.length-1].y});
  const cum=[0];
  for(let i=1;i<out.length;i++)cum.push(cum[i-1]+hyp(out[i].x-out[i-1].x,out[i].y-out[i-1].y));
  return{pts:out,cum,total:cum[cum.length-1]};
}
function samplePath(P,d){
  d=clamp(d,0,P.total);
  let lo=0,hi=P.cum.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(P.cum[mid]<d)lo=mid+1;else hi=mid}
  const i=clamp(Math.max(1,lo),1,P.pts.length-1);
  const t=(d-P.cum[i-1])/((P.cum[i]-P.cum[i-1])||1);
  const a=P.pts[i-1],b=P.pts[i],dx=b.x-a.x,dy=b.y-a.y,L=hyp(dx,dy)||1;
  return{x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),dx:dx/L,dy:dy/L};
}

// ---- dirt road shape ----
// Smooth 1-D value noise, used to give the road a meandering centreline and an
// uneven width so it reads as a worn dirt track instead of a ruled line.
function vnoise(x,seed){
  const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);
  const a=hash2(i,seed),b=hash2(i+1,seed);
  return a+(b-a)*u}
// Build the ribbon the road is painted as. ONLY PIXELS MOVE: the true
// centreline (PATH / PATH_SAMPLES) still drives enemy movement and the tower
// blocking radius, so gameplay is untouched. `nx,ny` is the unit normal and
// `hw` the half width at that sample.
function dirtShape(samples){
  const out=[];
  for(let i=0;i<samples.length;i++){
    const s=samples[i],d=i*.2;
    // a slow drift plus a faster chatter - organic, but never leaves the lane
    let off=(vnoise(d*.20,17)-.5)*.66+(vnoise(d*.78,41)-.5)*.24;
    let hw=.74+(vnoise(d*.29,73)-.5)*.34+(vnoise(d*1.10,97)-.5)*.17;
    // the true centreline must always stay inside the painted road, so the
    // meander can never push the lane off the dirt; the ceiling keeps the
    // painted edge short of the tower-blocking radius (PATH_CLEAR = .75)
    hw=clamp(hw,Math.abs(off)+.46,.92);
    out.push({x:s.x-s.dy*off,y:s.y+s.dx*off,nx:-s.dy,ny:s.dx,hw:hw,i:i})}
  return out}
// Closed polygon spanning a ribbon, `inset` world units either side of centre
// (negative shrinks it). Must be called inside the iso transform.
function ribbon(g,path,inset){
  const n=path.length;
  g.beginPath();
  for(let i=0;i<n;i++){const p=path[i],h=Math.max(0,p.hw+inset);
    if(i)g.lineTo(p.x+p.nx*h,p.y+p.ny*h);else g.moveTo(p.x+p.nx*h,p.y+p.ny*h)}
  for(let i=n-1;i>=0;i--){const p=path[i],h=Math.max(0,p.hw+inset);
    g.lineTo(p.x-p.nx*h,p.y-p.ny*h)}
  g.closePath()}

// ---- live world state ----
let PATH=null,BASE_PT=null,SPAWN_PT=null,PATH_SAMPLES=[],BASE_RECT={x:20,y:12,w:3,h:3};
const grid=[],elevGrid=[];
for(let y=0;y<GH;y++){grid[y]=[];elevGrid[y]=[];for(let x=0;x<GW;x++){grid[y][x]=0;elevGrid[y][x]=0}}
const baseTiles=new Set();
const decos=[];
const borderRing=(x,y)=>Math.max(x<0?-x:(x>=GW?x-GW+1:0),y<0?-y:(y>=GH?y-GH+1:0));
const elevAt=(x,y)=>{const fx=Math.floor(x),fy=Math.floor(y);
  return(fx>=0&&fx<GW&&fy>=0&&fy<GH)?elevGrid[fy][fx]:0};

// ---- world construction (pure builder + live applier) ----
function defaultWaterTiles(){
  const w=[];
  for(let y=17;y<=25;y++)w.push([15,y]);
  for(let x=0;x<=6;x++)w.push([x,13]);
  for(let y=3;y<=6;y++)for(let x=20;x<=23;x++)if(hash2(x,y)>.15)w.push([x,y]);
  return w}
function defaultElevTiles(){
  const e=[];const push=(x0,y0,x1,y1,lvl)=>{
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)e.push([x,y,lvl])};
  push(19,17,23,20,1);push(22,18,23,19,2);push(0,0,3,2,1);
  push(24,8,25,11,1);push(0,22,2,25,1);
  return e}
function buildWorldData(wps,opts){
  opts=opts||{};
  const w={wps:wps,colors:mapColorsFor(opts),overrides:opts.overrides||null,
    texture:opts.texture||null,textureAlpha:opts.textureAlpha!=null?opts.textureAlpha:.3,
    grid:[],elevGrid:[],baseTiles:new Set(),decos:[],
    BASE_RECT:{x:20,y:12,w:3,h:3}};
  for(let y=0;y<GH;y++){w.grid.push(new Array(GW).fill(0));w.elevGrid.push(new Array(GW).fill(0))}
  w.PATH=buildPath(wps);
  w.BASE_PT=w.PATH.pts[w.PATH.pts.length-1];
  w.SPAWN_PT=w.PATH.pts[0];
  w.PATH_SAMPLES=[];
  for(let d=0;d<=w.PATH.total;d+=.2)w.PATH_SAMPLES.push(samplePath(w.PATH,d));
  for(const t of (opts.water||defaultWaterTiles()))
    if(t[0]>=0&&t[0]<GW&&t[1]>=0&&t[1]<GH&&w.grid[t[1]][t[0]]===0)w.grid[t[1]][t[0]]=2;
  for(const e of (opts.elev||defaultElevTiles()))
    if(e[0]>=0&&e[0]<GW&&e[1]>=0&&e[1]<GH&&w.grid[e[1]][e[0]]===0)w.elevGrid[e[1]][e[0]]=e[2];
  if(opts.base)w.BASE_RECT={x:opts.base.x,y:opts.base.y,w:opts.base.w,h:opts.base.h};
  for(let y=w.BASE_RECT.y;y<w.BASE_RECT.y+w.BASE_RECT.h;y++)
    for(let x=w.BASE_RECT.x;x<w.BASE_RECT.x+w.BASE_RECT.w;x++)w.baseTiles.add(x+','+y);
  genDecos(w);
  return w}
function genDecos(w){
  const tileTypeAt=(x,y)=>{
    if(x>=0&&x<GW&&y>=0&&y<GH)return w.grid[y][x]===2?'water':'grass';
    const ring=borderRing(x,y);
    if(ring>=5)return 'ocean';
    if(ring===4)return 'sand';
    return 'forest'};
  for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){
    if(w.grid[y][x]!==0||w.baseTiles.has(x+','+y))continue;
    let dp=1e9;for(let i=0;i<w.PATH_SAMPLES.length;i+=3){const s=w.PATH_SAMPLES[i];
      const d=dist2(x+.5,y+.5,s.x,s.y);if(d<dp)dp=d}
    dp=Math.sqrt(dp);if(dp<1)continue;
    const cluster=hash2(Math.floor(x/3)+7,Math.floor(y/3)+11);
    const h=hash2(x*3+7,y*5+11)*(cluster<.42?.65:1.3);
    if(h<.05&&dp>2.2)w.decos.push({x:x,y:y,t:'tree',s:hash2(x,y*2)});
    else if(h<.078)w.decos.push({x:x,y:y,t:'rock',s:hash2(x*2,y)});
    else if(h<.16&&dp>1.2)w.decos.push({x:x,y:y,t:'flower',s:hash2(x,y)});
    else if(h<.21&&dp>1.1)w.decos.push({x:x,y:y,t:'bush',s:hash2(x*5,y*3)});
    else if(h<.30&&dp>1.0)w.decos.push({x:x,y:y,t:'tuft',s:hash2(x*7,y*5)})}
  for(let y=EXT0;y<EXT1;y++)for(let x=EXT0;x<EXT1;x++){
    if(x>=0&&x<GW&&y>=0&&y<GH)continue;
    if(borderRing(x,y)>3)continue;
    let dp=1e9;for(let i=0;i<w.PATH_SAMPLES.length;i+=3){const s=w.PATH_SAMPLES[i];
      const d=dist2(x+.5,y+.5,s.x,s.y);if(d<dp)dp=d}
    if(Math.sqrt(dp)<1.1)continue;
    const h=hash2(x*3+7,y*5+11);
    if(h<.24)w.decos.push({x:x,y:y,t:'tree',s:hash2(x,y*2)});
    else if(h<.275)w.decos.push({x:x,y:y,t:'rock',s:hash2(x*2,y)});
    else if(h<.31)w.decos.push({x:x,y:y,t:'tuft',s:hash2(x*7,y*5)})}}
function applyWorldToGlobals(w){
  PATH=w.PATH;BASE_PT=w.BASE_PT;SPAWN_PT=w.SPAWN_PT;
  PATH_SAMPLES.length=0;
  for(const s of w.PATH_SAMPLES)PATH_SAMPLES.push(s);
  for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){
    grid[y][x]=w.grid[y][x];elevGrid[y][x]=w.elevGrid[y][x]}
  baseTiles.clear();
  for(const k of w.baseTiles)baseTiles.add(k);
  decos.length=0;
  for(const d of w.decos)decos.push(d);
  BASE_RECT={x:w.BASE_RECT.x,y:w.BASE_RECT.y,w:w.BASE_RECT.w,h:w.BASE_RECT.h}}
function buildWorld(wps,opts){
  const w=buildWorldData(wps,opts);
  applyWorldToGlobals(w);
  renderTerrainInto(terrain,w,true)}

// ---- terrain pre-render ----
const terrain=document.createElement('canvas');
terrain.width=TERR_W;terrain.height=TERR_H;
const waterFx=[];
// Baked, deterministic texture clusters; no gameplay grid changes or per-frame work.
function paintFieldGround(g,mx,my,x,y,C,forest){
  g.save();g.beginPath();g.moveTo(mx-32,my);g.lineTo(mx,my-16);g.lineTo(mx+32,my);g.lineTo(mx,my+16);g.closePath();g.clip();
  const patch=hash2(Math.floor(x/3)+71,Math.floor(y/3)+29);
  const dark=forest?C.forestDetail1:C.grassDetail1,light=forest?C.forestHi:C.grassHi;
  for(let i=0;i<5;i++){
    const px=mx-29+hash2(x*31+i,y*7)*54,py=my-12+hash2(x*5,y*17+i)*24;
    g.globalAlpha=.18+patch*.12;g.fillStyle=i%2?light:dark;
    g.fillRect(px,py,12+patch*10,3);g.fillRect(px+3,py-2,7+patch*5,2);
    g.globalAlpha=.55;g.fillStyle=dark;g.fillRect(px+2,py,3,1);
  }
  if(patch>.72){g.globalAlpha=.16;g.fillStyle=C.sand;g.fillRect(mx-9,my-3,16,5);g.fillRect(mx-4,my-5,10,2)}
  g.restore();
}
function paintFieldCliff(g,mx,my,height,C,seed){
  g.save();g.clip();
  for(let i=0;i<9;i++){
    const px=mx-32+i*8,py=my+hash2(i,seed)*10;
    g.globalAlpha=.3;g.fillStyle=i%2?C.cliffL:C.cliffD;
    g.fillRect(px,py,6,Math.max(4,height));
    g.globalAlpha=.16;g.fillStyle=C.sandSpeck2;g.fillRect(px,py,1,height*.65);
    if(i%3===0){g.globalAlpha=.5;g.fillStyle=C.grassDetail1;g.fillRect(px,my,4,4+hash2(seed,i)*7)}
  }g.restore();
}
function renderTerrainInto(canvas,w,live){
  // ART V2: crisp per-pixel terrain (js/terrain.js). Same world data in, same canvas out.
  if(typeof ART_V2!=='undefined'&&ART_V2&&typeof paintPixelTerrain==='function'){paintPixelTerrain(canvas,w,live);return}
  const g=canvas.getContext('2d');
  if(canvas.width!==TERR_W){canvas.width=TERR_W}
  if(canvas.height!==TERR_H){canvas.height=TERR_H}
  g.setTransform(1,0,0,1,0,0);
  g.clearRect(0,0,TERR_W,TERR_H);
  g.imageSmoothingEnabled=false;
  const C=w.colors;
  const ov=(x,y)=>w.overrides?w.overrides[x+','+y]:null;
  const tileTypeAt=(x,y)=>{
    if(x>=0&&x<GW&&y>=0&&y<GH)return w.grid[y][x]===2?'water':'grass';
    const ring=borderRing(x,y);
    if(ring>=5)return 'ocean';
    if(ring===4)return 'sand';
    return 'forest'};
  const isWaterish=(x,y)=>{const t=tileTypeAt(x,y);return t==='water'||t==='ocean'};
  const diamond=function(mx,my,c){g.fillStyle=c;g.beginPath();g.moveTo(mx,my-TH/2);g.lineTo(mx+TW/2,my);
    g.lineTo(mx,my+TH/2);g.lineTo(mx-TW/2,my);g.closePath();g.fill()};
  if(live)waterFx.length=0;
  for(let sum=EXT0*2;sum<=(EXT1-1)*2;sum++)for(let x=EXT0;x<EXT1;x++){
    const y=sum-x;if(y<EXT0||y>=EXT1)continue;
    const inGrid=x>=0&&x<GW&&y>=0&&y<GH;
    const e=inGrid?w.elevGrid[y][x]:0,tt=tileTypeAt(x,y),ovc=ov(x,y);
    const mx=PADX+isoX(x,y)+TW/2,myG=PADY+isoY(x,y)+TH/2,myTop=myG-e*ELEVH;
    if(tt==='ocean'){diamond(mx,myG,ovc||(hash2(x,y)<.5?C.ocean:C.ocean2));
      if(!ovc){                                // slow pale ripples so the sea isn't flat
        const r1=hash2(x*13+1,y*7);
        g.fillStyle=C.waterEdge;
        g.globalAlpha=.2;g.fillRect(mx-14+r1*12,myG-3,13,2);
        g.globalAlpha=.12;g.fillRect(mx-5-r1*7,myG+4,10,2);
        g.globalAlpha=1}
      if(live)waterFx.push({x:mx,y:myG,ph:hash2(x*3,y*7)});continue}
    if(tt==='water'){
      diamond(mx,myG,ovc||(hash2(x,y)<.5?C.water:C.water2));
      if(!ovc){                                // two tone ripple lines inside the tile
        const r1=hash2(x*13+1,y*7),r2=hash2(x*5,y*23+3);
        g.fillStyle=C.waterEdge;g.globalAlpha=.4;
        g.fillRect(mx-14+r1*10,myG-4+r2*2,12,2);
        g.globalAlpha=.28;g.fillRect(mx-3-r1*6,myG+3,9,2);
        g.globalAlpha=1}
      if(!ovc){
        g.save();diamond(mx,myG,'#00000000');g.clip();
        const edges=[[[mx-32,myG],[mx,myG-16],x-1,y],[[mx,myG-16],[mx+32,myG],x,y-1],
          [[mx+32,myG],[mx,myG+16],x+1,y],[[mx,myG+16],[mx-32,myG],x,y+1]];
        for(const [a,b,nx,ny] of edges)if(!isWaterish(nx,ny)){
          g.strokeStyle=C.sand2;g.lineWidth=5;g.beginPath();g.moveTo(...a);g.lineTo(...b);g.stroke();
          g.strokeStyle=C.waterEdge;g.lineWidth=2;g.stroke();
        }
        for(let j=0;j<4;j++){g.fillStyle=C.waterEdge;g.globalAlpha=.22;
          g.fillRect(mx-25+j*11,myG-7+hash2(x+j,y)*12,9,2)}g.restore();
      }
      if(live)waterFx.push({x:mx,y:myG,ph:hash2(x*3,y*7)});
      continue}
    if(tt==='sand'){
      diamond(mx,myG,ovc||(hash2(x,y)<.5?C.sand:C.sand2));
      if(!ovc)for(let s=0;s<5;s++){            // grain specks
        const r1=hash2(x*19+s*5,y*7),r2=hash2(x*5,y*23+s);
        g.fillStyle=r1<.5?C.sandSpeck1:C.sandSpeck2;
        g.fillRect(mx-15+r1*30,myG-5+r2*10,2,2)}
      continue}
    const eR=(x>=0&&x+1<GW&&y>=0&&y<GH)?w.elevGrid[y][x+1]:0;
    const eD=(x>=0&&x<GW&&y>=0&&y+1<GH)?w.elevGrid[y+1][x]:0;
    const hR=e>eR?(e-eR)*ELEVH:0;
    const hD=e>eD?(e-eD)*ELEVH:0;
    const rightX=mx+TW/2,rightY=myTop;
    const leftX=mx-TW/2,leftY=myTop;
    const botX=mx,botY=myTop+TH/2;
    if(hR){
      g.fillStyle=C.cliffD;g.beginPath();
      g.moveTo(rightX,rightY);g.lineTo(botX,botY);
      g.lineTo(botX,botY+hR);g.lineTo(rightX,rightY+hR);
      g.closePath();g.fill();
      paintFieldCliff(g,mx,myTop,hR+16,C,x*13+y);
      g.strokeStyle='rgba(0,0,0,.18)';g.lineWidth=1;      // rock striations
      for(let k=5;k<hR-3;k+=6){
        g.beginPath();g.moveTo(rightX-.5,rightY+k+.5);g.lineTo(botX,botY+k+.5);g.stroke()}
      g.strokeStyle='rgba(255,255,255,.10)';              // lit rim
      g.beginPath();g.moveTo(rightX,rightY+1.5);g.lineTo(botX,botY+1.5);g.stroke()}
    if(hD){
      g.fillStyle=C.cliffL;g.beginPath();
      g.moveTo(leftX,leftY);g.lineTo(botX,botY);
      g.lineTo(botX,botY+hD);g.lineTo(leftX,leftY+hD);
      g.closePath();g.fill();
      paintFieldCliff(g,mx,myTop,hD+16,C,x+y*13);
      g.strokeStyle='rgba(0,0,0,.14)';g.lineWidth=1;
      for(let k=5;k<hD-3;k+=6){
        g.beginPath();g.moveTo(leftX+.5,leftY+k+.5);g.lineTo(botX,botY+k+.5);g.stroke()}
      g.strokeStyle='rgba(255,255,255,.10)';
      g.beginPath();g.moveTo(leftX,leftY+1.5);g.lineTo(botX,botY+1.5);g.stroke()}
    if(hR&&hD&&hR!==hD){
      const hMin=Math.min(hR,hD),hMax=Math.max(hR,hD);
      if(hR>hD){
        g.fillStyle=C.cliffD;g.beginPath();
        g.moveTo(rightX,rightY+hMin);g.lineTo(rightX,rightY+hMax);
        g.lineTo(botX,botY+hMax);g.lineTo(botX,botY+hMin);
        g.closePath();g.fill()}
      else{
        g.fillStyle=C.cliffL;g.beginPath();
        g.moveTo(leftX,leftY+hMin);g.lineTo(leftX,leftY+hMax);
        g.lineTo(botX,botY+hMax);g.lineTo(botX,botY+hMin);
        g.closePath();g.fill()}}
    const forest=tt==='forest';
    const eTint=e===1?C.elev1:e===2?C.elev2:e>=3?C.elev3:null;
    diamond(mx,myTop,ovc||(eTint?eTint:(forest?C.forest:C.grass)));
    if(!ovc){
      paintFieldGround(g,mx,myTop,x,y,C,forest);
      // per-tile tint — a soft patchwork so the ground is never flat fill
      const tv=hash2(x*5+3,y*11+1);
      diamond(mx,myTop,tv<.34?'rgba(0,0,0,.05)':(tv>.74?'rgba(255,255,255,.05)':'rgba(0,0,0,.022)'));
      // hairline seam just inside the two lower edges (reads as tile depth)
      g.strokeStyle='rgba(0,0,0,.07)';g.lineWidth=2;
      g.beginPath();g.moveTo(mx-TW/2+3,myTop-1);
      g.lineTo(mx,myTop+TH/2-2);g.lineTo(mx+TW/2-3,myTop-1);g.stroke();
      // scatter: tufts, blades, highlight dabs, lone pixels
      const dkC=forest?C.forestDetail1:C.grassDetail1;
      const litC=forest?C.forestDetail2:(e>0?C.elev1:C.grassDetail2);
      const hiC=forest?C.forestHi:C.grassHi;
      for(let s=0;s<7;s++){
        const r1=hash2(x*17+s*3,y*29),r2=hash2(x*31+s*7,y*13+s);
        const px=mx-16+r1*32,py=myTop-6+r2*12;
        if(r1<.28){g.fillStyle=litC;g.fillRect(px,py,2,2);g.fillRect(px+1,py-2,2,3)}
        else if(r1<.56){g.fillStyle=dkC;g.fillRect(px,py,3,2)}
        else if(r1<.78){g.fillStyle=hiC;g.fillRect(px,py,2,1);g.fillRect(px+1,py-1,1,2)}
        else{g.fillStyle=litC;g.fillRect(px,py,1,1)}}
    }
  }
  for(let ty=w.BASE_RECT.y;ty<w.BASE_RECT.y+w.BASE_RECT.h;ty++)
    for(let tx=w.BASE_RECT.x;tx<w.BASE_RECT.x+w.BASE_RECT.w;tx++){
    const m=worldToMap(tx+.5,ty+.5);
    const cx=w.BASE_RECT.x+(w.BASE_RECT.w>>1),cy=w.BASE_RECT.y+(w.BASE_RECT.h>>1);
    const ring=Math.max(Math.abs(tx-cx),Math.abs(ty-cy));
    const ovc=ov(tx,ty);
    diamond(m.x,m.y,ovc||(ring<=1?(hash2(tx,ty)<.5?C.baseA:C.baseB):(hash2(tx,ty)<.5?C.baseC:C.baseD)));
    g.strokeStyle='rgba(40,32,20,.35)';g.lineWidth=1;
    g.beginPath();g.moveTo(m.x-TW/2,m.y);g.lineTo(m.x,m.y-TH/2);
    g.lineTo(m.x+TW/2,m.y);g.lineTo(m.x,m.y+TH/2);g.closePath();g.stroke();
    g.strokeStyle='rgba(255,255,255,.07)';g.lineWidth=1;   // lit upper rim
    g.beginPath();g.moveTo(m.x-TW/2,m.y);g.lineTo(m.x,m.y-TH/2);g.lineTo(m.x+TW/2,m.y);g.stroke();
    for(let s=0;s<3;s++){g.fillStyle=hash2(tx*7+s,ty*3)<.5?C.baseSpeck1:C.baseSpeck2;
      g.fillRect(m.x-14+hash2(tx+s,ty)*28,m.y-5+hash2(tx,ty+s)*10,2,2)}
  }
  // ---- the road: a worn dirt track, not a ruled line ----
  // The ribbon below is the SAME path the enemies walk (dirtShape only perturbs
  // pixels), so gameplay is untouched — it just meanders and varies in width so
  // it reads as trodden earth rather than a line drawn with a ruler.
  const DIRT=dirtShape(w.PATH_SAMPLES);
  const overWater=function(i){const s=w.PATH_SAMPLES[i],
    tx=Math.floor(s.x),ty=Math.floor(s.y);
    return tx>=0&&tx<GW&&ty>=0&&ty<GH&&w.grid[ty][tx]===2};
  const isoXf=function(fn){g.save();
    g.transform(TW/2,TH/2,-TW/2,TH/2,PADX,PADY);fn();g.restore()};
  isoXf(function(){
    g.lineJoin='round';g.lineCap='round';
    ribbon(g,DIRT,.30);g.fillStyle='rgba(24,18,10,.30)';g.fill();   // ground shadow
    ribbon(g,DIRT,0);g.fillStyle=C.roadDark;g.fill();               // churned rim
    ribbon(g,DIRT,-.09);g.fillStyle=C.road;g.fill();                // packed body
    ribbon(g,DIRT,-.30);g.fillStyle=C.roadLight;g.fill();
    g.globalAlpha=.25;
    for(let i=0;i<DIRT.length;i+=4){if(overWater(i))continue;const p=DIRT[i];
      g.fillStyle=i%8?C.roadSpeck1:C.roadSpeck2;
      g.fillRect(p.x-p.nx*.4-.1,p.y-p.ny*.4-.04,.2,.08)}g.globalAlpha=1;           // worn centre band
    // two ruts worn down the middle
    g.strokeStyle='rgba(74,54,34,.55)';g.lineWidth=.10;
    for(const side of[-1,1]){g.beginPath();
      for(let i=0;i<DIRT.length;i++){const p=DIRT[i],h=p.hw*side*.42;
        if(i)g.lineTo(p.x+p.nx*h,p.y+p.ny*h);else g.moveTo(p.x+p.nx*h,p.y+p.ny*h)}
      g.stroke()}
    // grass nibbles into the edges so the road never reads as a clean cut-out
    for(let i=0;i<DIRT.length;i++){
      if(overWater(i))continue;
      const p=DIRT[i];
      for(const side of[-1,1]){
        if(hash2(i*5+side,13)>.42)continue;
        const h=p.hw*(1.02+hash2(i,17+side)*.12)*side;
        g.fillStyle=hash2(i,23)<.5?C.grassDetail1:C.grass;
        g.fillRect(p.x+p.nx*h-.07,p.y+p.ny*h-.06,.14,.12)}}});
  // loose gravel and stones strewn along the track
  for(let i=0;i<DIRT.length;i++){
    if(overWater(i))continue;
    const p=DIRT[i],h=hash2(i*13,7);
    if(h>.62)continue;
    const f=(hash2(i*7,3)-.5)*1.7,w0=Math.max(-1,Math.min(1,f))*p.hw*.86;
    const m=worldToMap(p.x+p.nx*w0,p.y+p.ny*w0);
    g.fillStyle=h<.32?C.roadSpeck1:C.roadSpeck2;
    const wd=h<.32?3:2;
    g.fillRect(m.x-wd+Math.floor(h*3),m.y-3+hash2(i,9)*6,wd,2)}
  (function(){
    // --- bridges -----------------------------------------------------------
    // ribbon() builds its half width as p.hw + inset, and the road layers are
    // painted at 0 / -.09 / -.30, so the deck has to be inset from p.hw too.
    // The previous version inset by a FIXED +.72, which put the deck at
    // p.hw+.72 -- nearly double the track feeding it -- so the bridge flared
    // outward like a shape pasted on top of the map instead of continuing the
    // road. Everything below is measured from p.hw, so the span always lines
    // up with whatever width the dirt happens to have at the bank.
    const runs=[];let cur=null;
    for(let i=0;i<DIRT.length;i++){
      if(overWater(i)){if(!cur)cur={a:i,b:i};cur.b=i}
      else if(cur){runs.push(cur);cur=null}}
    if(cur)runs.push(cur);
    const BOARDS=['#8d6f4a','#846643','#937550','#7c5f3b'];
    for(const run of runs){
      if(run.b-run.a<2)continue;
      const i0=Math.max(0,run.a-2),i1=Math.min(DIRT.length-1,run.b+2);
      const deck=DIRT.slice(i0,i1+1);
      isoXf(function(){
        g.lineJoin='round';g.lineCap='round';
        // shadow cast on the water, just clear of the deck
        ribbon(g,deck,.13);g.fillStyle='rgba(14,10,5,.38)';g.fill();
        // deck edge / stringers -- a dark rim a hair proud of the road
        ribbon(g,deck,.03);g.fillStyle=C.bridgeDark;g.fill();
        // the board field itself
        ribbon(g,deck,-.015);g.fillStyle=C.bridgeMid;g.fill();
        // Boards laid across the span. Each is a dark gap with a lit board in
        // front of it, nudged along the path tangent so they read as separate
        // planks rather than one continuous ruled line.
        for(let i=1;i<deck.length;i+=2){
          const p=deck[i],h=Math.max(0,p.hw-.02);
          const ax=p.x+p.nx*h,ay=p.y+p.ny*h,bx=p.x-p.nx*h,by=p.y-p.ny*h;
          g.strokeStyle='rgba(28,19,11,.46)';g.lineWidth=.045;
          g.beginPath();g.moveTo(ax,ay);g.lineTo(bx,by);g.stroke();
          const o=.05,tx=p.ny,ty=-p.nx;
          g.strokeStyle=BOARDS[((i-1)>>1)%BOARDS.length];g.lineWidth=.05;
          g.beginPath();g.moveTo(ax+tx*o,ay+ty*o);g.lineTo(bx+tx*o,by+ty*o);g.stroke();
          g.strokeStyle=C.bridgeDark;g.lineWidth=.015;
          g.beginPath();g.moveTo(ax*.7+bx*.3+tx*.07,ay*.7+by*.3+ty*.07);
          g.lineTo(ax*.3+bx*.7+tx*.07,ay*.3+by*.7+ty*.07);g.stroke();
          for(const side of [-1,1]){g.fillStyle=C.bridgeDark;
            g.fillRect(p.x+p.nx*h*.83*side-.025,p.y+p.ny*h*.83*side-.025,.05,.05)}
        }
        // worn walk line down the middle, echoing the road's centre band
        ribbon(g,deck,-.30);g.fillStyle=C.bridgeLight;g.globalAlpha=.45;g.fill();
        g.globalAlpha=1});
      // --- rails: chunky posts on the deck edge joined by one solid beam ---
      for(const side of[-1,1]){
        const pts=[];
        for(let i=1;i<deck.length-1;i+=3){const p=deck[i];
          pts.push(worldToMap(p.x+p.nx*(p.hw+.04)*side,p.y+p.ny*(p.hw+.04)*side))}
        if(pts.length<2)continue;
        // Segment by segment. A single run from pts[0] to pts[last] is a
        // straight screen-space line, and because the deck meanders that line
        // cuts a diagonal wire across the boards instead of following the edge.
        g.lineCap='round';
        for(let k=1;k<pts.length;k++){
          const u=pts[k-1],v=pts[k];
          g.strokeStyle=C.bridgeDark;g.lineWidth=5;
          g.beginPath();g.moveTo(u.x,u.y-8);g.lineTo(v.x,v.y-8);g.stroke();
          g.strokeStyle=C.bridgeRail;g.lineWidth=3;
          g.beginPath();g.moveTo(u.x,u.y-9.5);g.lineTo(v.x,v.y-9.5);g.stroke()}
        // posts in front of the beam, shaded so they read as square timbers
        for(const pm of pts){
          g.fillStyle=C.bridgePost;g.fillRect(pm.x-2.5,pm.y-12,5,13);
          g.fillStyle=C.bridgeDark;g.fillRect(pm.x-2.5,pm.y-12,2,13);
          g.fillStyle=C.bridgeLight;g.fillRect(pm.x-3,pm.y-13.5,6,2)}}
      // --- abutments: a stone slab the deck lands on, extruded downward ---
      for(const idx of[0,deck.length-1]){
        const p=deck[idx],nb=deck[idx===0?1:deck.length-2];
        const ox=p.x-nb.x,oy=p.y-nb.y;            // points off the span onto the bank
        const h=p.hw+.05;
        const A=worldToMap(p.x+p.nx*h,     p.y+p.ny*h);
        const B=worldToMap(p.x-p.nx*h,     p.y-p.ny*h);
        const D=worldToMap(p.x+p.nx*h+ox,  p.y+p.ny*h+oy);
        const E=worldToMap(p.x-p.nx*h+ox,  p.y-p.ny*h+oy);
        const drop=4,P=[A,B,E,D];
        // one extruded quad per edge, then the top face over it: always forms a
        // correct isometric slab no matter which way the path runs
        g.fillStyle='#57503f';
        for(let k=0;k<4;k++){const u=P[k],v=P[(k+1)&3];
          g.beginPath();g.moveTo(u.x,u.y);g.lineTo(v.x,v.y);
          g.lineTo(v.x,v.y+drop);g.lineTo(u.x,u.y+drop);g.closePath();g.fill()}
        g.fillStyle='#807868';
        g.beginPath();g.moveTo(A.x,A.y);g.lineTo(B.x,B.y);
        g.lineTo(E.x,E.y);g.lineTo(D.x,D.y);g.closePath();g.fill();
        g.strokeStyle='rgba(30,26,20,.30)';g.lineWidth=1;g.stroke()}
    }
  })();
  (function(){
    const last={'-1':null,'1':null};
    for(let d=2;d<w.PATH.total-4;d+=.55){
      const s=samplePath(w.PATH,d),seg=Math.floor(d/4);
      for(const side of[-1,1]){
        if(hash2(seg*7+side*13,seg*29)<=.5){last[side]=null;continue}
        const fx=s.x-s.dy*side*.7,fy=s.y+s.dx*side*.7;
        const tx=Math.floor(fx),ty=Math.floor(fy);
        if(tx<0||tx>=GW||ty<0||ty>=GH||w.grid[ty][tx]===2||w.baseTiles.has(tx+','+ty)){last[side]=null;continue}
        const pm=worldToMap(fx,fy);
        g.fillStyle=C.fencePost;g.fillRect(pm.x-2,pm.y-9,4,9);
        g.fillStyle=C.fenceTop;g.fillRect(pm.x-2,pm.y-9,4,3);
        const lp=last[side];
        if(lp){g.strokeStyle=C.fenceRail;g.lineWidth=2;
          g.beginPath();g.moveTo(lp.x,lp.y-7);g.lineTo(pm.x,pm.y-7);g.stroke();
          g.beginPath();g.moveTo(lp.x,lp.y-3);g.lineTo(pm.x,pm.y-3);g.stroke()}
        last[side]=pm}}
  })();
  // optional custom ground texture, drawn over everything at low opacity
  if(w.texture){
    const img=new Image();
    img.onload=function(){
      g.save();g.globalAlpha=w.textureAlpha;
      const pat=g.createPattern(img,'repeat');
      g.fillStyle=pat;g.fillRect(0,0,TERR_W,TERR_H);
      g.restore()};
    img.src=w.texture}
}

// ---- build the default world, expose the editor hooks ----
buildWorld(PATH_WP);
window.TDV_MAP={
  reset:function(){
    buildWorld(PATH_WP);
    document.title='Tower Defence V'},
  apply:function(m){
    if(!m)return;
    buildWorld(m.wps&&m.wps.length>1?m.wps:PATH_WP,m);
    if(m.name)document.title='Tower Defence V — '+m.name}};

// ============ CUSTOM MAPS — PASTE ZONE ============
// The Map Creator tool exports code for below. Each entry becomes a new,
// fully playable map in the map select screen, side by side with TEST PLACE.
// Format: CUSTOM_MAPS.my_map={name:'..',desc:'..',wps:[[x,y]..],water:[[x,y]..],
//   elev:[[x,y,lvl]..],base:{x,y,w,h},colors:{..},overrides:{'x,y':'#hex'..},
//   texture:'data:image/png;base64,..',textureAlpha:.3};
const CUSTOM_MAPS={};
/* ---- paste map exports below this line ---- */
// ---- end paste zone (do not edit the merge below) ----

// engine merge — do not edit
(function(){
  for(const id in CUSTOM_MAPS){const m=CUSTOM_MAPS[id];
    MAPS.push({id:'c_'+id,name:m.name||id,desc:m.desc||'Custom map.',unlock:true,data:m})}
})();

// ---- map select thumbnail (renders any map's world into a small canvas) ----
function drawMapPreview(cv,entry){
  const data=entry&&entry.data?entry.data:null;
  const w=buildWorldData(data&&data.wps&&data.wps.length>1?data.wps:PATH_WP,data||null);
  const tmp=document.createElement('canvas');
  renderTerrainInto(tmp,w,false);
  const g=cv.getContext('2d');g.imageSmoothingEnabled=false;
  const s=Math.min(cv.width/TERR_W,cv.height/TERR_H);
  const dw=TERR_W*s,dh=TERR_H*s;
  g.clearRect(0,0,cv.width,cv.height);
  g.drawImage(tmp,(cv.width-dw)/2,(cv.height-dh)/2,dw,dh)}
