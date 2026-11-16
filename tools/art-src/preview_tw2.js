// node preview_tw2.js out.png type lane  -> tiers 0..5 idle + fire frames
const {buildTower}=require('./towers');const {buildFarm,buildVillage}=require('./buildings');const {grid}=require('./png');
const items=[];const specs=process.argv.slice(3);
for(const sp of specs){const [type,lane,gold]=sp.split(':');for(let t=0;t<=5;t++){let s;
  if(type==='farm')s=buildFarm(t);else if(type==='village')s=buildVillage(t,+lane||0);else s=buildTower(type,t,+lane||0,{gold:!!gold});
  items.push({w:s.w,h:s.h,pal:s.pal,rows:s.frames[0]});items.push({w:s.w,h:s.h,pal:s.pal,rows:s.frames[s.frames.length-1]})}}
grid(process.argv[2],items,3,'#3f6e3a',12);
