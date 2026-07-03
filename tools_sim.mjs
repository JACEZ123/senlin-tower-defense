/* 无头模拟：加载真实引擎，用「贪心自动玩家」跑完整关卡，输出胜负/存活波数/耗时/峰值实体数。
 * 用法: node sim.mjs [levelStart] [levelEnd] [runsPerLevel] */
import { createRequire } from 'module';
const require = createRequire('/Users/admin/green-cycle-mp/web/game/');
const C = require('/Users/admin/green-cycle-mp/web/game/config.js');
const E = require('/Users/admin/green-cycle-mp/web/game/engine.js');
const LV = require('/Users/admin/green-cycle-mp/web/game/levels.js');

const A = process.argv;
const L0 = parseInt(A[2] || '1', 10), L1 = parseInt(A[3] || '40', 10), RUNS = parseInt(A[4] || '1', 10);

function buildSpots(level) {
  // 沿路径两侧采样候选建造点（模拟人类：均匀覆盖整条路），按路径顺序返回
  const p = level.path, spots = [];
  for (let i = 0; i < p.length - 1; i += 2) {
    const a = p[i], b = p[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    for (const off of [70, -70, 100, -100, 55, -55]) spots.push({ x: mx + nx * off, y: my + ny * off });
  }
  return spots;
}
function autoPlay(state, level) {
  if (!level._spots) level._spots = buildSpots(level);
  let guard = 0;
  while (state.towers.length < state.maxTowers && guard++ < 60) {
    let placed = false;
    for (const sp of level._spots) {
      if (!E.canBuild(state, sp.x, sp.y).ok) continue;
      for (const k of level.towers) { if (state.gold >= C.TOWERS[k].cost) { if (E.applyCommand(state, { type: 'build', x: sp.x, y: sp.y, tower: k })) { placed = true; break; } } }
      if (placed) break;
    }
    if (!placed) break;
  }
  for (const t of state.towers) {
    const d = C.TOWERS[t.key];
    if (!t.branch) {
      const nx = d.levels[t.level + 1];
      if (nx && state.gold >= nx.upgrade + 10) E.applyCommand(state, { type: 'upgrade', id: t.id });
      else if (t.level === d.levels.length - 1 && d.branches && state.gold >= d.branches.A.upgrade) E.applyCommand(state, { type: 'branch', id: t.id, branch: t.id % 2 ? 'A' : 'B' });
    }
  }
}

function runLevel(n) {
  const level = LV.buildLevel(n);
  const state = E.createState(level);
  let t = 0, peak = 0, maxBullets = 0;
  const DT = 1 / 30, MAXT = 2400;
  // 开局布防
  autoPlay(state, level);
  while (state.phase !== 'won' && state.phase !== 'lost' && t < MAXT) {
    if (state.phase === 'ready') { E.applyCommand(state, { type: 'startWave' }); autoPlay(state, level); }
    E.update(state, DT); t += DT;
    if (state.enemies.length > peak) peak = state.enemies.length;
    if (state.bullets.length > maxBullets) maxBullets = state.bullets.length;
    // 每帧尝试花钱(模拟持续布防)
    if ((Math.round(t * 30) % 30) === 0) autoPlay(state, level);
  }
  return { n, result: state.phase, wave: state.wave, lives: state.lives, gold: state.gold, towers: state.towers.length, t: Math.round(t), peak, maxBullets };
}

const rows = [];
let wins = 0, losses = 0;
for (let n = L0; n <= L1; n++) {
  for (let r = 0; r < RUNS; r++) {
    const t0 = process.hrtime.bigint();
    const res = runLevel(n);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    res.simMs = Math.round(ms);
    rows.push(res);
    if (res.result === 'won') wins++; else losses++;
  }
}
console.log('lvl  result wave lives gold twr  gameSec peak bul simMs');
for (const r of rows) console.log(`${String(r.n).padStart(3)}  ${r.result.padEnd(5)} ${String(r.wave).padStart(4)} ${String(r.lives).padStart(5)} ${String(r.gold).padStart(5)} ${String(r.towers).padStart(3)} ${String(r.t).padStart(6)}s ${String(r.peak).padStart(4)} ${String(r.maxBullets).padStart(3)} ${String(r.simMs).padStart(5)}`);
console.log(`\nWIN ${wins}  LOSS ${losses}  winRate ${(wins / (wins + losses) * 100).toFixed(0)}%`);
