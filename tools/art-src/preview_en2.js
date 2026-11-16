// node preview_en2.js out.png kind1,kind2,...  -> sheet of 8 frames per kind (front walk | back walk + hit tint)
const {build,KINDS}=require('./enemies');const {grid}=require('./png');
const ks=(process.argv[3]||KINDS.join(',')).split(',');const items=[];
for(const k of ks){const s=build(k);for(let i=0;i<8;i++)items.push({w:s.w,h:s.h,pal:s.pal,rows:s.frames[i]})}
grid(process.argv[2]||'/tmp/en2.png',items,+(process.argv[4]||3),'#3f6e3a',8);
