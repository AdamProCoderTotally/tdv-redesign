const {build}=require('./deco');const {sheet}=require('./png');const d=build();sheet('/tmp/deco_'+(process.argv[2]||'')+'.png',Object.values(d),5,'#3d7a36');
