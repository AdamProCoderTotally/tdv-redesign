const fx=require('./fx');const {sheet}=require('./png');const items=[];
for(const k of ['muzzle','spark','explosion','deathpuff','grenade']){const s=fx[k]();for(const fr of s.frames)items.push({w:s.w,h:s.h,pal:s.pal,rows:fr})}
for(const k of ['bullet','laser','plasma']){const s=fx.tracer(k);items.push(s)}
sheet('/tmp/fx_'+(process.argv[2]||'')+'.png',items,5,'#2c4a30');
