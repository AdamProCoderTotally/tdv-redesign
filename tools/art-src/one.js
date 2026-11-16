const {sheet}=require('./png');const [mod,fn,arg,out,scale]=process.argv.slice(2);
const m=require('./'+mod);const s=m[fn](...JSON.parse(arg));const n=s.frames?s.frames.length:1;const items=[];
for(let i=0;i<n;i++)items.push({w:s.w,h:s.h,pal:s.pal,rows:s.frames?s.frames[i]:s.rows});sheet(out,items,+scale||8,'#3d6a3a');
