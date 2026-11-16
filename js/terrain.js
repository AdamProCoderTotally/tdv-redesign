"use strict";
// ============================================================
//  terrain.js — ART V2 pixel terrain painter.
//  Same world data as before (grid, elevGrid, path, base, colours,
//  overrides, texture), painted per pixel instead of with
//  anti-aliased shapes, so the ground is crisp pixel art with
//  hue-shifted ramps. Loaded BEFORE map.js; map.js calls
//  paintPixelTerrain() from renderTerrainInto() when ART_V2 is on.
//  Gameplay never reads anything in here.
// ============================================================
var ART_V2=true;   // flip to false to get the original renderer back
// ---- colour ramps generated from ONE base colour (so Map Creator colours still work) ----
function _h2rgb(h){const n=parseInt(h.slice(1),16);return[n>>16&255,n>>8&255,n&255]}
function _rgb2hsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h=0,s=0;const l=(mx+mn)/2;
  if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h*=60}return[h,s,l]}
function _hsl2rgb(h,s,l){h=((h%360)+360)%360;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  const [r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return[(r+m)*255,(g+m)*255,(b+m)*255].map(Math.round)}
function _towardHue(h,t,k){let d=((t-h+540)%360)-180;return h+d*k}
// 7 steps, index 3 = the given colour. Darker steps drift toward violet-blue,
// lighter steps toward warm yellow: the classic hue-shifted pixel ramp.
const _RAMPS={};
function rampFrom(hex){let r=_RAMPS[hex];if(r)return r;const [h,s,l]=_rgb2hsl(..._h2rgb(hex));r=[];
  for(let i=-3;i<=3;i++){const k=Math.abs(i)/3;const hh=i<0?_towardHue(h,245,.22*k):_towardHue(h,55,.18*k);
    const ll=Math.max(.04,Math.min(.95,l+i*(i<0?.075:.065)));const ss=Math.max(0,Math.min(1,s*(i<0?1+.12*k:1-.18*k)));r.push(_hsl2rgb(hh,ss,ll))}
  _RAMPS[hex]=r;return r}
function _hash(x,y){let h=(x*374761393+y*668265263)|0;h=(h^(h>>13))*1274126177|0;return((h^(h>>16))>>>0)/4294967295}
function _vn(x,y,s){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
  const a=_hash(xi+s,yi),b=_hash(xi+1+s,yi),c=_hash(xi+s,yi+1),d=_hash(xi+1+s,yi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v}
const K_NONE=0,K_GRASS=1,K_FOREST=2,K_SAND=3,K_WATER=4,K_OCEAN=5,K_CLIFFL=6,K_CLIFFR=7,K_BASE=8;
var ART_BIOME='grass';   // set per map by js/ashlands.js (presentation only)
function paintPixelTerrain(canvas,w,live){
  const ASH=w.biome==='ash';
  const W=TERR_W,H=TERR_H;if(canvas.width!==W)canvas.width=W;if(canvas.height!==H)canvas.height=H;
  const g=canvas.getContext('2d');g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,W,H);g.imageSmoothingEnabled=false;
  const C=w.colors,N=W*H;
  const kind=new Uint8Array(N),tX=new Int16Array(N),tY=new Int16Array(N),lit=new Int8Array(N),depth=new Uint8Array(N);
  const ovr=new Int16Array(N).fill(-1),ovList=[];
  const tileType=(x,y)=>{if(x>=0&&x<GW&&y>=0&&y<GH)return w.grid[y][x]===2?K_WATER:K_GRASS;const r=borderRing(x,y);return r>=5?K_OCEAN:r===4?K_SAND:K_FOREST};
  const elev=(x,y)=>(x>=0&&x<GW&&y>=0&&y<GH)?w.elevGrid[y][x]:0;
  if(live)waterFx.length=0;
  // ---- 1. raster every tile, back to front (top face + cliff faces) ----
  for(let sum=EXT0*2;sum<=(EXT1-1)*2;sum++)for(let x=EXT0;x<EXT1;x++){const y=sum-x;if(y<EXT0||y>=EXT1)continue;
    let tt=tileType(x,y);const e=tt===K_GRASS?elev(x,y):0;
    if(w.baseTiles.has(x+','+y))tt=K_BASE;
    // tile centre, aligned with worldToMap (the old painter sat 32px right of the gameplay cell)
    const cx=Math.round(PADX+isoX(x+.5,y+.5)),cyG=Math.round(PADY+isoY(x+.5,y+.5)),cy=cyG-e*ELEVH;
    const ov=w.overrides?w.overrides[x+','+y]:null;let oi=-1;if(ov){oi=ovList.indexOf(ov);if(oi<0){oi=ovList.length;ovList.push(ov)}}
    if(e>0){const hR=Math.max(0,e-elev(x,y+1))*ELEVH,hL=Math.max(0,e-elev(x+1,y))*ELEVH;
      // left-facing face (toward +y neighbour) and right-facing face (toward +x neighbour)
      for(let px=-32;px<32;px++){const left=px<0;const hh=left?hR:hL;if(!hh)continue;
        const top=cy+16-Math.floor(Math.abs(px+.5)/2);for(let k=0;k<hh;k++){const yy=top+k,xx=cx+px;if(xx<0||xx>=W||yy<0||yy>=H)continue;
          const i=yy*W+xx;kind[i]=left?K_CLIFFL:K_CLIFFR;tX[i]=x;tY[i]=y;depth[i]=k;lit[i]=0;ovr[i]=-1}}}
    for(let r=0;r<32;r++){const kk=r<16?r:31-r,half=2*(kk+1),yy=cy-16+r;if(yy<0||yy>=H)continue;
      for(let px=-half;px<half;px++){const xx=cx+px;if(xx<0||xx>=W)continue;const i=yy*W+xx;
        kind[i]=tt;tX[i]=x;tY[i]=y;depth[i]=e;ovr[i]=oi;
        // rim light on the two upper edges of raised ground, lip shade on the lower ones
        // rim light only on edges that actually drop to lower ground
        lit[i]=e>0?((r<16&&px<-half+2&&elev(x-1,y)<e)||(r<16&&px>=half-2&&elev(x,y-1)<e)?1:0):0}}
    if(live&&!ASH&&(tt===K_WATER||tt===K_OCEAN))waterFx.push({x:cx,y:cyG,ph:_hash(x*3,y*7)})}
  // ---- 2. road mask (same ribbon the old painter used, just thresholded) ----
  const DIRT=dirtShape(w.PATH_SAMPLES);
  const mc=document.createElement('canvas');mc.width=W;mc.height=H;const mg=mc.getContext('2d');
  mg.setTransform(TW/2,TH/2,-TW/2,TH/2,PADX,PADY);ribbon(mg,DIRT,0);mg.fillStyle='#fff';mg.fill();
  const md=mg.getImageData(0,0,W,H).data;const road=new Uint8Array(N);for(let i=0;i<N;i++)road[i]=md[i*4+3]>110?1:0;
  // distance (px) from the road edge, chamfer 2-pass, capped
  const dist=new Uint8Array(N);for(let i=0;i<N;i++)dist[i]=road[i]?60:0;
  for(let y=1;y<H;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(!dist[i])continue;dist[i]=Math.min(dist[i],dist[i-1]+1,dist[i-W]+1,dist[i-W-1]+1,dist[i-W+1]+1)}
  for(let y=H-2;y>=0;y--)for(let x=W-2;x>0;x--){const i=y*W+x;if(!dist[i])continue;dist[i]=Math.min(dist[i],dist[i+1]+1,dist[i+W]+1,dist[i+W+1]+1,dist[i+W-1]+1)}
  // ---- 3. ramps ----
  const RG=rampFrom(C.grass),RF=rampFrom(C.forest),RS=rampFrom(C.sand),RW=rampFrom(C.water),RO=rampFrom(C.ocean),
    RC=rampFrom(C.cliffL),RD=rampFrom(C.road),RB=rampFrom(C.baseA),RWood=rampFrom(C.bridgeMid),RSt=rampFrom('#7a7a8e'),
    E1=rampFrom(C.elev1);
  const ovR=ovList.map(rampFrom);
  const img=g.createImageData(W,H),D=img.data;
  const put=(i,c,a)=>{const o=i*4;D[o]=c[0];D[o+1]=c[1];D[o+2]=c[2];D[o+3]=a===undefined?255:a};
  const shore=(x,y)=>{const t=tileType(x,y);return t!==K_WATER&&t!==K_OCEAN};
  for(let py=0;py<H;py++)for(let px=0;px<W;px++){const i=py*W+px,k=kind[i];if(!k)continue;
    const tx=tX[i],ty=tY[i],h=_hash(px,py);
    if(road[i]&&(k===K_GRASS||k===K_FOREST||k===K_BASE||k===K_WATER||k===K_SAND)){
      const d=dist[i];
      if(k===K_WATER){// ---- bridge deck ----
        const plank=((px>>1)+py)%5===0;let c=d<=1?RWood[0]:d<=2?RWood[1]:plank?RWood[2]:(h<.08?RWood[2]:RWood[4-((py>>1)&1)]);
        if(d>=3&&((px+py*2)%23===0))c=RWood[1];
        if(d===2)c=(px%6===0)?RWood[0]:RWood[5];        // hand rail with posts
        else if(d===3)c=RWood[1];                         // rail shadow on the deck
        put(i,c);continue}
      // sunken dirt track: shaded top edge, lit bottom edge, ruts, pebbles
      const above=road[i-W],below=road[i+W];
      let r=d<=1?1:d<=3?2:d<=6?3:4;
      if(d>=2&&!road[i-2*W])r=1;               // grass lip shadow on the upper bank
      if(d<=2&&!road[i+2*W]&&road[i-W])r=Math.max(r,4); // lit lower bank
      if((d===5||d===6)&&_hash(px>>2,py>>1)<.75)r=2;      // cart ruts
      if(d>=8&&h<.05)r=5;
      const n=_vn(px*.08,py*.12,3);if(r>=3&&n<.3)r-=1;if(r===4&&n>.78)r=5;
      let c=RD[r];
      if(d>=2&&h>.985){c=RSt[4]}else if(d>=2&&h>.975)c=RSt[2];
      if(d<=1&&_hash(px>>1,py)<.18)c=RG[2];     // grass nibbling the edge
      put(i,c);continue}
    if(k===K_GRASS||k===K_FOREST){
      const R0=ovr[i]>=0?ovR[ovr[i]]:(k===K_FOREST?RF:(depth[i]>0?E1:RG));
      // broad soft patches (3 tones) instead of per-pixel noise
      const patch=_vn(px*.022,py*.04,11)*.75+_vn(px*.08,py*.14,5)*.25;
      let r=patch>.6?4:(patch<.2&&k===K_FOREST)?2:3;
      // clustered grass tufts on a coarse cell grid: a little "w" of lit blades over a dark root
      const cxl=Math.floor(px/7),cyl=Math.floor(py/5),lx=px-cxl*7,ly=py-cyl*5,th=_hash(cxl*3+1,cyl*5+2);
      if(th<(k===K_FOREST?.2:.11)){const ox=1+Math.floor(_hash(cxl,cyl)*3),oy=Math.floor(_hash(cxl+5,cyl)*2);const ly2=ly-oy;
        if(ly2===1&&(lx===ox||lx===ox+2))r=Math.min(6,r+2);else if(ly2===2&&lx===ox+1)r=Math.min(6,r+1);else if(ly2===3&&lx>=ox&&lx<=ox+2)r=Math.max(0,r-1)}
      if(false){const ox=0;
        if(ly===1&&(lx===ox||lx===ox+2))r=Math.min(6,r+2);else if(ly===2&&lx===ox+1)r=Math.min(6,r+1);else if(ly===3&&lx>=ox&&lx<=ox+2)r=Math.max(0,r-1)}
      // near-road grass is darker (trodden + shadowed)
      if(!road[i]){if(road[i+W])r=5;else if(road[i+2*W]||road[i+3*W])r=Math.max(1,r-1)}
      if(lit[i]===1)r=Math.min(6,r+2);else if(lit[i]===-1)r=Math.max(0,r-2);
      let c=R0[r];
      // TDX-style faint checker on the build grid so cells read without lines
      if(k===K_GRASS&&ovr[i]<0&&tx>=0&&tx<GW&&ty>=0&&ty<GH&&((tx+ty)&1))c=[c[0]*.9,c[1]*.93,c[2]*.92];
      // Ashlands: thin glowing ember cracks through the ash (value-noise ridges), never on the road
      if(ASH){const n=_vn(px*.035,py*.07,31),n2=_vn(px*.11,py*.2,37);
        if(Math.abs(n-.5)<.012&&n2>.45&&!road[i+W]&&!road[i-W]){put(i,n2>.7?[255,179,71]:[194,65,12]);continue}
        if(Math.abs(n-.5)<.03&&n2>.45){put(i,R0[1]);continue}
        put(i,c);continue}
      // sparse flowers, always in small clusters
      if(k===K_GRASS&&th>.985&&ly===2&&(lx===2||lx===4)){put(i,[[255,224,102],[255,140,170],[190,160,255],[255,255,255]][Math.floor(_hash(cxl,cyl+9)*4)&3]);continue}
      put(i,c);continue}
    if(k===K_CLIFFL||k===K_CLIFFR){const d=depth[i];const left=k===K_CLIFFL;
      if(d===0){put(i,RG[1]);continue}                 // grass overhang
      if(d===1&&_hash(px,ty*7)<.5){put(i,RG[0]);continue}
      const band=((d+(px>>3))>>2)&1;let r=(left?3:1)+band-(d>ELEVH-3?1:0);
      if(h<.06)r=Math.min(6,r+1);if(((px*3+d*5)%17)===0)r=Math.max(0,r-1);
      put(i,RC[Math.max(0,Math.min(6,r))]);continue}
    if(k===K_SAND){let r=2+(_vn(px*.05,py*.09,9)>.6?1:0);if(h<.012)r=5;else if(h>.988)r=1;
      // wet, darker sand where the sea laps it
      for(const [dx,dy] of [[0,3],[0,-3],[6,0],[-6,0]]){if(kind[(py+dy)*W+px+dx]===K_OCEAN){r=2;break}}
      put(i,RS[r]);continue}
    if(k===K_WATER||k===K_OCEAN){const R0=k===K_OCEAN?RO:RW;
      let land=0;for(const [dx,dy,wt] of [[0,-2,2],[0,2,2],[-4,0,2],[4,0,2],[0,-4,1],[0,4,1],[-7,0,1],[7,0,1]]){const j=(py+dy)*W+px+dx;const k2=kind[j];
        if(k2&&k2!==K_WATER&&k2!==K_OCEAN&&!road[j]){land=Math.max(land,wt)}}
      const wv=_vn(px*.018,py*.05,21);let r=3+(wv>.7?1:0)-(k===K_WATER&&wv<.22?1:0);   // open sea: no dark blobs, only soft light swells
      // wave crests: short iso-slanted dashes that wobble along a slow noise
      const ph=Math.floor(_vn(px*.03,py*.02,7)*10);
      if(((py*2+px+ph*3)%(k===K_OCEAN?22:14))===0&&_hash(px>>3,py>>2)<.55)r+=1;
      if(ASH){const cr=_vn(px*.028,py*.056,41);if(cr>.6)r=cr>.66?1:cr>.63?2:5;}
      if(ASH){if(land===2)r=0;else if(land===1)r=1;else if(((px*3+py*7)%29===0)&&_hash(px>>2,py>>2)<.4)r=6}   // lava: dark crust rim, hot specks
      else if(land===2)r=6;else if(land===1)r=5;
      put(i,R0[Math.max(0,Math.min(6,r))]);continue}
    if(k===K_BASE){const bx=((px>>3)+((py>>2)&1))&1,edge=((px&7)===0)||((py&3)===0);
      let r=edge?2:3+bx;if(h<.05)r=2;put(i,(ovr[i]>=0?ovR[ovr[i]]:RB)[r]);continue}
  }
  g.putImageData(img,0,0);
  // ---- 4. soft contact shadow where cliffs meet the ground (alpha, crisp) ----
  if(w.texture){const im=new Image();im.onload=function(){g.save();g.globalAlpha=w.textureAlpha;g.fillStyle=g.createPattern(im,'repeat');g.fillRect(0,0,W,H);g.restore()};im.src=w.texture}
}
