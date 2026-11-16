const {buildTower}=require('./towers');const {sheet}=require('./png');
const which=process.argv[2]||'a';
const list=which==='a'?[['ranger',0,0],['ranger',3,0],['ranger',5,1],['grenadier',0,0]]:[['grenadier',5,1],['sniper',0,0],['sniper',5,0],['ranger',5,0]];
const items=[];for(const [t,tier,lane] of list){const s=buildTower(t,tier,lane);items.push({w:s.w,h:s.h,pal:s.pal,rows:s.frames[0]})}
sheet('/tmp/tw_'+which+(process.argv[3]||'')+'.png',items,6,'#3d6a3a');
