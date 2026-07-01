import { createRequire } from 'module';
const require = createRequire('/Users/admin/green-cycle-mp/web/game/');
const C = require('/Users/admin/green-cycle-mp/web/game/config.js');
const E = require('/Users/admin/green-cycle-mp/web/game/engine.js');
const LV = require('/Users/admin/green-cycle-mp/web/game/levels.js');
for (let n=1;n<=40;n++){
  const level=LV.buildLevel(n); const s=E.createState(level);
  let cnt=0;
  for(let y=70;y<C.VH-46;y+=20)for(let x=44;x<C.VW-44;x+=20){ if(E.canBuild(s,x,y).ok){cnt++;} }
  // greedy non-overlapping capacity estimate
  const chosen=[]; const MIN=64;
  for(let y=70;y<C.VH-46;y+=16)for(let x=44;x<C.VW-44;x+=16){ if(!E.canBuild(s,x,y).ok)continue; if(chosen.every(c=>Math.hypot(c.x-x,c.y-y)>=MIN)){chosen.push({x,y});} }
  console.log(`L${String(n).padStart(2)} maxTowers=${String(level.maxTowers).padStart(2)} buildableGrid=${String(cnt).padStart(4)} capacity~${String(chosen.length).padStart(2)}`);
}
