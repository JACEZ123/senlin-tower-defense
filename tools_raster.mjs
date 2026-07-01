/* 用无头 Chrome 把文字渲染成透明 PNG(真·图片字体). 生成数字字形 + 固定标签.
 * 产物 -> web/assets 与 root/assets. */
import { execFileSync } from 'child_process'; import fs from 'fs';
const SP='/private/tmp/claude-501/-Users-admin/7be6af16-bddf-42d5-a403-435148799354/scratchpad';
const WEB='/Users/admin/green-cycle-mp/web/assets', ROOT='/Users/admin/green-cycle-mp/assets';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FONT="'Yuanti SC','Hiragino Sans GB','PingFang SC',sans-serif";
// 数字字形(金色渐变+棕描边) & 标签(白字棕描边)
const digitCss=`font-family:${FONT};font-weight:900;font-size:120px;line-height:1;color:#ffe272;-webkit-text-stroke:9px #7a3e12;paint-order:stroke fill;text-shadow:0 5px 0 #7a3e12;`;
const labelCss=`font-family:${FONT};font-weight:900;font-size:96px;line-height:1.05;color:#fff;-webkit-text-stroke:8px #6b3d12;paint-order:stroke fill;text-shadow:0 5px 0 rgba(120,70,20,.55);`;
const titleCss=`font-family:${FONT};font-weight:900;font-size:104px;line-height:1.05;color:#ffe9a8;-webkit-text-stroke:9px #6b3d12;paint-order:stroke fill;text-shadow:0 6px 0 #6b3d12;`;
const DIGITS={num_0:'0',num_1:'1',num_2:'2',num_3:'3',num_4:'4',num_5:'5',num_6:'6',num_7:'7',num_8:'8',num_9:'9',num_slash:'/',num_plus:'+',num_x:'×',num_dot:'·',num_pct:'%',num_dash:'-'};
const LABELS={
 t_start:['开始游戏',titleCss], t_continue:['继续冒险',titleCss], t_levels:['关卡选择',titleCss],
 t_codex:['图鉴',titleCss], t_shop:['商店',titleCss], t_settings:['设置',titleCss],
 t_shoptitle:['商店 · 皮肤',titleCss], t_dextitle:['图鉴',titleCss], t_pause:['游戏暂停',titleCss],
 t_resume:['继续游戏',labelCss], t_replay:['重玩本关',labelCss], t_backsel:['返回选关',labelCss], t_home:['返回首页',labelCss],
 t_music:['音乐',labelCss], t_sfx:['音效',labelCss],
 t_guard:['守卫',labelCss], t_mob:['怪物',labelCss], t_boss:['Boss',labelCss],
 t_next:['下一关',labelCss], t_replay2:['重玩',labelCss], t_sel:['选关',labelCss],
 t_know:['知道了',labelCss], t_step:['下一步',labelCss], t_getchest:['获取宝箱',titleCss],
 t_win:['过关！',titleCss], t_lose:['失败',titleCss],
 t_equip:['装备',labelCss], t_equipped:['已装备',labelCss], t_owned:['已拥有',labelCss], t_buy:['购买',labelCss],
};
function render(name,text,css){
  const html=`<!doctype html><meta charset=utf8><body style="margin:0;padding:40px;background:transparent"><span style="${css}white-space:nowrap">${text}</span></body>`;
  const hp=`${SP}/_r.html`, sp=`${SP}/_r.png`; fs.writeFileSync(hp,html);
  execFileSync(CHROME,['--headless=new','--disable-gpu','--hide-scrollbars','--force-device-scale-factor=2','--default-background-color=00000000',`--screenshot=${sp}`,'--window-size=1400,400',`file://${hp}`],{stdio:'ignore'});
  execFileSync('node',[`${SP}/trim.mjs`,sp,`${WEB}/${name}.png`,'8']);
  try{fs.copyFileSync(`${WEB}/${name}.png`,`${ROOT}/${name}.png`);}catch(e){}
}
let done=0;
for(const [n,t] of Object.entries(DIGITS)){ render(n,t,digitCss); done++; }
for(const [n,[t,css]] of Object.entries(LABELS)){ render(n,t,css); done++; }
console.log('RASTER DONE',done,'glyphs+labels');
