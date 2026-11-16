// minimal PNG writer for quick previews (no deps)
const zlib=require('zlib'),fs=require('fs');
function crc(buf){let c,crcTable=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0}
  let x=0xffffffff;for(const b of buf)x=crcTable[(x^b)&255]^(x>>>8);return (x^0xffffffff)>>>0}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])}
function writePNG(file,w,h,rgba){const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;rgba.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4)}
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;ih[10]=0;ih[11]=0;ih[12]=0;
  fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]))}
function parseCol(c){if(c[0]==='#'){const n=parseInt(c.slice(1),16);return[n>>16&255,n>>8&255,n&255,255]}
  const m=c.match(/rgba?\(([^)]+)\)/);const p=m[1].split(',').map(Number);return[p[0],p[1],p[2],Math.round((p[3]==null?1:p[3])*255)]}
// sheet: list of {spr(rows-format), frame idx}, laid out in a row, scaled
function sheet(file,items,scale,bg){scale=scale||4;let W=0,H=0;for(const it of items){W+=it.w+4;H=Math.max(H,it.h)}H+=4;
  const buf=Buffer.alloc(W*scale*H*scale*4);const bgc=parseCol(bg||'#2a3a2a');
  for(let i=0;i<buf.length;i+=4){buf[i]=bgc[0];buf[i+1]=bgc[1];buf[i+2]=bgc[2];buf[i+3]=255}
  let ox=2;for(const it of items){const rows=it.rows;for(let y=0;y<it.h;y++)for(let x=0;x<it.w;x++){const ch=rows[y][x];if(ch==='.')continue;
      const c=parseCol(it.pal[parseInt(ch,36)]);for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++){const o=(((y+2)*scale+sy)*W*scale+(ox+x)*scale+sx)*4;
        const a=c[3]/255;buf[o]=buf[o]*(1-a)+c[0]*a;buf[o+1]=buf[o+1]*(1-a)+c[1]*a;buf[o+2]=buf[o+2]*(1-a)+c[2]*a}}ox+=it.w+4}
  writePNG(file,W*scale,H*scale,buf)}
// grid version: cols items per row, each cell sized to the largest item
function grid(file,items,scale,bg,cols){scale=scale||3;cols=cols||8;let cw=0,ch=0;for(const it of items){cw=Math.max(cw,it.w);ch=Math.max(ch,it.h)}cw+=4;ch+=4;
  const rowsN=Math.ceil(items.length/cols),W=cw*cols,H=ch*rowsN;const buf=Buffer.alloc(W*scale*H*scale*4);const bgc=parseCol(bg||'#2a3a2a');
  for(let i=0;i<buf.length;i+=4){buf[i]=bgc[0];buf[i+1]=bgc[1];buf[i+2]=bgc[2];buf[i+3]=255}
  items.forEach((it,n)=>{const ox=(n%cols)*cw+2+Math.floor((cw-4-it.w)/2),oy=Math.floor(n/cols)*ch+2+(ch-4-it.h);
    for(let y=0;y<it.h;y++)for(let x=0;x<it.w;x++){const c0=it.rows[y][x];if(c0==='.')continue;const c=parseCol(it.pal[parseInt(c0,36)]);
      for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++){const o=(((oy+y)*scale+sy)*W*scale+(ox+x)*scale+sx)*4;const a=c[3]/255;
        buf[o]=buf[o]*(1-a)+c[0]*a;buf[o+1]=buf[o+1]*(1-a)+c[1]*a;buf[o+2]=buf[o+2]*(1-a)+c[2]*a}}});
  writePNG(file,W*scale,H*scale,buf)}
module.exports={writePNG,sheet,grid};
