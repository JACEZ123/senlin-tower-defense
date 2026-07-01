/* 按 alpha 裁掉透明边. 用法: node trim.mjs <in.png> <out.png> [pad=6] */
import { execFileSync } from 'child_process'; import { deflateSync } from 'zlib'; import fs from 'fs';
const [,,inp,out,padArg]=process.argv; const PAD=parseInt(padArg||'6',10);
// 取尺寸
const probe=execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',inp]).toString().trim().split(',');
const W=parseInt(probe[0],10), H=parseInt(probe[1],10);
const raw=execFileSync('ffmpeg',['-i',inp,'-f','rawvideo','-pix_fmt','rgba','-'],{maxBuffer:1<<30});
let minx=W,miny=H,maxx=0,maxy=0;
for(let y=0;y<H;y++)for(let x=0;x<W;x++){ if(raw[(y*W+x)*4+3]>16){ if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; } }
if(maxx<minx){ minx=0;miny=0;maxx=W-1;maxy=H-1; }
minx=Math.max(0,minx-PAD); miny=Math.max(0,miny-PAD); maxx=Math.min(W-1,maxx+PAD); maxy=Math.min(H-1,maxy+PAD);
const w=maxx-minx+1,h=maxy-miny+1,px=Buffer.alloc(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const si=((miny+y)*W+(minx+x))*4,di=(y*w+x)*4;px[di]=raw[si];px[di+1]=raw[si+1];px[di+2]=raw[si+2];px[di+3]=raw[si+3];}
function crc32(b){let c=~0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const tt=Buffer.from(t);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(Buffer.concat([tt,d])),0);return Buffer.concat([l,tt,d,c]);}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=6;
const rows=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){rows[y*(w*4+1)]=0;px.copy(rows,y*(w*4+1)+1,y*w*4,(y+1)*w*4);}
fs.writeFileSync(out,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]));
console.log('trim',out,w+'x'+h);
