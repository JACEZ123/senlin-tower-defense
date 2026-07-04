/* 洋红抠图: 把纯洋红背景(#FF00FF 附近)转透明 + 去边缘溢色。
 * 用法: node tools_matte.mjs <in.png> <out.png> */
import { execFileSync } from 'child_process'; import { deflateSync } from 'zlib'; import fs from 'fs';
const [,, inp, out] = process.argv;
const probe = execFileSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0', inp]).toString().trim().split(',');
const W = parseInt(probe[0],10), H = parseInt(probe[1],10);
const raw = execFileSync('ffmpeg', ['-i', inp, '-f','rawvideo','-pix_fmt','rgba','-'], { maxBuffer: 1<<30 });
const px = Buffer.from(raw);
const isMag = (i) => { const r=px[i],g=px[i+1],b=px[i+2]; return r>120 && b>120 && g < Math.min(r,b)*0.62; };
// 1) 从四边 flood-fill 清除洋红背景(避免误删主体内部的粉紫色)
const seen = new Uint8Array(W*H); const stack = [];
for (let x=0;x<W;x++){ stack.push(x, (H-1)*W+x); }
for (let y=0;y<H;y++){ stack.push(y*W, y*W+W-1); }
while (stack.length) {
  const p = stack.pop(); if (seen[p]) continue; seen[p]=1;
  const i = p*4; if (!isMag(i)) continue;
  px[i+3] = 0;
  const x=p%W, y=(p/W)|0;
  if (x>0) stack.push(p-1); if (x<W-1) stack.push(p+1);
  if (y>0) stack.push(p-W); if (y<H-1) stack.push(p+W);
}
// 2) 边缘半透明+去洋红溢色(把邻接透明区的洋红味像素压掉)
for (let y=0;y<H;y++) for (let x=0;x<W;x++){
  const p=y*W+x, i=p*4; if (px[i+3]===0) continue;
  const nb = [p-1,p+1,p-W,p+W].some(q=>q>=0&&q<W*H&&px[q*4+3]===0);
  if (nb) { const r=px[i],g=px[i+1],b=px[i+2]; if (r>g&&b>g) { const m=(r+b)/2-g; if (m>30){ px[i]=Math.max(0,r-m*0.7); px[i+2]=Math.max(0,b-m*0.7); if (m>90) px[i+3]=Math.round(px[i+3]*0.4); } } }
}
// 3) 小碎片清除(连通块 < 0.05% 面积的删掉)
const lab = new Int32Array(W*H).fill(-1); let nl=0; const sizes=[];
for (let p=0;p<W*H;p++){ if (px[p*4+3]===0||lab[p]>=0) continue; const st=[p]; lab[p]=nl; let c=0;
  while(st.length){const q=st.pop();c++;const x=q%W,y=(q/W)|0;for(const d of [[-1,0],[1,0],[0,-1],[0,1]]){const nx=x+d[0],ny=y+d[1];if(nx<0||ny<0||nx>=W||ny>=H)continue;const r=ny*W+nx;if(px[r*4+3]>0&&lab[r]<0){lab[r]=nl;st.push(r);}}}
  sizes.push(c); nl++; }
const minSz = W*H*0.0005;
for (let p=0;p<W*H;p++) if (lab[p]>=0 && sizes[lab[p]]<minSz) px[p*4+3]=0;
function crc32(b){let c=~0;for(let i=0;i<b.length;i++){c^=b[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length,0);const tt=Buffer.from(t);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(Buffer.concat([tt,d])),0);return Buffer.concat([l,tt,d,c]);}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=6;
const rows=Buffer.alloc((W*4+1)*H);for(let y=0;y<H;y++){rows[y*(W*4+1)]=0;px.copy(rows,y*(W*4+1)+1,y*W*4,(y+1)*W*4);}
fs.writeFileSync(out,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]));
console.log('matte', out, W+'x'+H);
