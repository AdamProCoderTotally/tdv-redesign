const {build}=require('./enemies');const {sheet}=require('./png');const items=[];
for(const id of ['walker','sprinter','brute']){const s=build(id);for(let i=0;i<4;i++)items.push({w:s.w,h:s.h,pal:s.pal,rows:s.frames[i]})}
sheet('/tmp/en_'+(process.argv[2]||'')+'.png',items,5,'#3d6a3a');
