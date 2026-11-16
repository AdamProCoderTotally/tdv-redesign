"use strict";
// ============================================================
//  ashlands.js — ART V2: data for the second map slot (m2).
//  config.js is left byte-identical; this file fills in the empty
//  {id:'m2'} entry at load. ASHLANDS is plain map data in the same
//  format the Map Creator exports (wps/water/elev/base/colors), plus one
//  presentation-only field, biome:'ash', read by terrain.js/art.js.
//  NEW LAYOUT — path length matches Grasslands (74 tiles incl. the
//  off-map lead-in, 10 corners) but it has NOT been balance tested.
// ============================================================
const ASHLANDS={name:'Ashlands',
  desc:'A burnt-out frontier. Lava seams split the ash fields and the old fort lies in ruins.',
  biome:'ash',
  wps:[[27,20],[20,20],[20,15],[24,15],[24,8],[16,8],[16,17],[10,17],[10,5],[4,5],[4,13],[2,13]],
  // "water" tiles render as lava (unbuildable, same rule as water)
  water:(function(){const w=[];
    for(let x=11;x<=17;x++)w.push([x,2]);for(let x=17;x<=23;x++)w.push([x,1]);   // lava seam along the north rim
    for(let y=21;y<=23;y++)for(let x=5;x<=8;x++)if(!((x===5||x===8)&&y===23))w.push([x,y]);  // southern lava pool
    return w})(),
  elev:(function(){const e=[];const push=(x0,y0,x1,y1,l)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)e.push([x,y,l])};
    push(12,10,14,13,1);push(19,10,22,13,1);push(20,11,21,12,2);push(0,22,2,25,1);push(23,22,25,25,1);
    return e})(),
  base:{x:1,y:12,w:3,h:3},
  colors:{ocean:'#b8380e',ocean2:'#7a2410',water:'#e0561a',water2:'#9a2a0c',waterEdge:'#ff8a3a',
    sand:'#3a3030',sand2:'#2e2626',sandSpeck1:'#241e1e',sandSpeck2:'#4a3e3a',
    forest:'#3a3436',forestDetail1:'#2e2a2c',forestDetail2:'#4a4446',forestHi:'#5a5456',
    grass:'#5e5654',grassDetail1:'#524a48',grassDetail2:'#6e6662',grassHi:'#7e7672',
    elev1:'#6a605c',elev2:'#4e4644',elev3:'#443c3a',cliffL:'#4a3c3a',cliffD:'#241c1c',
    roadDark:'#3a2a24',road:'#7a5e4a',roadLight:'#8a6e58',roadSpeck1:'#5a4436',roadSpeck2:'#9a7e66',
    bridgeDark:'#2a201e',bridgeMid:'#5a4a44',bridgeLight:'#7a6a62',bridgeRail:'#3e3230',bridgePost:'#2e2422',
    fencePost:'#2e2422',fenceTop:'#4a3c36',fenceRail:'#3a2e2a',
    baseA:'#7a7470',baseB:'#6a5a50',baseC:'#5a4a40',baseD:'#544638',baseSpeck1:'#4a3c32',baseSpeck2:'#8a7a6c'}};
(function(){
  const m2=MAPS.find(m=>m.id==='m2');
  if(m2&&!m2.data){m2.name=ASHLANDS.name;m2.desc=ASHLANDS.desc;m2.data=ASHLANDS;m2.unlock=true}
  // carry the presentation-only biome tag onto the world, and dress the map edges
  const _bwd=buildWorldData;
  buildWorldData=function(wps,opts){const w=_bwd(wps,opts);w.biome=(opts&&opts.biome)||'grass';
    if(typeof ART_V2!=='undefined'&&ART_V2)artEdgeDecos(w);return w};
  const _apply=applyWorldToGlobals;
  applyWorldToGlobals=function(w){_apply(w);ART_BIOME=w.biome||'grass'};
  // Props (crates, barrels; ruins in the Ashlands) go ONLY on tiles outside
  // the 26x26 build grid, next to where the road enters/leaves the map.
  function artEdgeDecos(w){
    for(const d of w.decos){const inGrid=d.x>=0&&d.x<GW&&d.y>=0&&d.y<GH;if(inGrid)continue;
      let dp=1e9;for(let i=0;i<w.PATH_SAMPLES.length;i+=4){const s=w.PATH_SAMPLES[i];const q=dist2(d.x+.5,d.y+.5,s.x,s.y);if(q<dp)dp=q}
      dp=Math.sqrt(dp);const h=hash2(d.x*13+5,d.y*7+3);
      if(dp<3.2&&h<.55)d.t=h<.28?'crate':'barrel';
      else if(w.biome==='ash'&&d.t==='tree'&&h<.09&&hash2(Math.floor(d.x/4)+3,Math.floor(d.y/4)+9)<.45)d.t='ruin'}}
})();
