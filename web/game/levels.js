/* =========================================================================
 * 40 关进程系统（程序化生成，难度递增）。
 *   buildLevel(n)  -> { id,name,theme,path,slots,waves,startGold,startLives,
 *                       towers[可用塔], hero(bool), difficulty }
 *   每关：地形主题轮换、蛇形路径折数随关卡增加、建造台沿路径铺开（间距大）、
 *         波次/数值递增、塔类型与怪物种类按 config.unlock 解锁、英雄第 40 关解锁。
 * 坐标在虚拟空间 768x1152。
 * ========================================================================= */
const C = require('./config.js');
const VW = C.VW, VH = C.VH;

// 8 个主题 × 每主题 5 关 = 40
const THEME_GROUPS = ['grass', 'volcano', 'forest', 'ice', 'desert', 'swamp', 'cavern', 'sky'];
const THEME_NAME = { grass: '翠绿草原', volcano: '火山峡谷', forest: '暗黑密林', ice: '极寒冰原', desert: '黄沙荒漠', swamp: '迷雾沼泽', cavern: '水晶洞窟', sky: '天空浮岛' };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* 平滑 Catmull-Rom 采样：把控制点插值成密集平滑折线（自动实现蜿蜒曲线 + 怪物顺滑行走）。 */
function smoothPath(ctrl, perSeg) {
  if (ctrl.length < 3) return ctrl.slice();
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[i - 1] || ctrl[i], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[i + 2] || ctrl[i + 1];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      out.push({ x: clamp(x, 40, VW - 40), y: clamp(y, 120, VH - 100) });
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

/* 横屏程序化「蜿蜒曲线」路径：从左侧入口平滑地蛇形到右侧基地。
 * 前几关：路线短、弯少、起伏小(易上手)；后段：段数多、起伏大、更曲折。
 * 由游戏绘制成可爱奶油小路，槽位落在小路两侧。 */
function genPath(level) {
  const early = level <= 3;
  const mx = early ? 260 : 70, my = 150;
  const top = my, bot = VH - (early ? 210 : 120), left = mx, right = VW - (mx + 20), cy = (top + bot) / 2;
  // 拐弯段数：前几关少，后段随关卡增多，最多 6
  const runs = level <= 1 ? 2 : level <= 3 ? 2 : level <= 5 ? 3 : clamp(3 + Math.floor((level - 5) / 5), 3, 6);
  // 起伏幅度：前几关小(0.42)，后段接近满幅(0.95)
  const ampF = early ? 0.42 : clamp(0.55 + level * 0.018, 0.55, 0.95);
  const half = (bot - top) / 2 * ampF;
  const xs = []; for (let i = 0; i <= runs; i++) xs.push(left + (right - left) * i / runs);
  // 控制点：左入口 → 交替上/下的蛇形站点 → 右基地
  const ctrl = [{ x: 62, y: cy }];
  for (let i = 0; i <= runs; i++) ctrl.push({ x: xs[i], y: cy + (i % 2 === 0 ? half : -half) });
  const lastY = cy + (runs % 2 === 0 ? half : -half);
  ctrl.push({ x: VW - 62, y: lastY });
  // 平滑成曲线（前几关采样密度低一点即可）
  return smoothPath(ctrl, early ? 12 : 16);
}

function segDist(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy || 1;
  let t = ((px - a.x) * dx + (py - a.y) * dy) / L2; t = clamp(t, 0, 1);
  const cx = a.x + dx * t, cy = a.y + dy * t;
  return Math.hypot(px - cx, py - cy);
}
function distToPath(x, y, path) {
  let m = 1e9;
  for (let i = 0; i < path.length - 1; i++) m = Math.min(m, segDist(x, y, path[i], path[i + 1]));
  return m;
}

/* ----- 建造台：路径两侧网格采样 + 贪心间距；并「保证全路径可被覆盖」 ----- */
function genSlots(path, level) {
  const cands = [];
  for (let y = 95; y < VH - 70; y += 46) {
    for (let x = 80; x < VW - 60; x += 46) {
      const d = distToPath(x, y, path);
      if (d > 48 && d < 120) cands.push({ x, y, d });
    }
  }
  cands.sort((a, b) => a.d - b.d);
  const gap = 118, chosen = [];
  const ok = (x, y) => chosen.every((s) => Math.hypot(s.x - x, s.y - y) >= gap);
  for (const c of cands) if (ok(c.x, c.y)) chosen.push({ x: c.x, y: c.y });

  // 覆盖保证：沿路径采样，凡是 150px 内没有槽位的点，就在其侧方补一个槽位
  const COVER = 150;
  const sampleP = [];
  for (let i = 0; i < path.length - 1; i++) for (let t = 0; t < 1; t += 0.34) sampleP.push({ x: path[i].x + (path[i + 1].x - path[i].x) * t, y: path[i].y + (path[i + 1].y - path[i].y) * t, dx: path[i + 1].x - path[i].x, dy: path[i + 1].y - path[i].y });
  for (const p of sampleP) {
    if (chosen.some((s) => Math.hypot(s.x - p.x, s.y - p.y) <= COVER)) continue;
    const len = Math.hypot(p.dx, p.dy) || 1, nx = -p.dy / len, ny = p.dx / len;
    for (const off of [80, -80, 100, -100]) {
      const x = p.x + nx * off, y = p.y + ny * off;
      if (x < 55 || x > VW - 55 || y < 85 || y > VH - 60) continue;
      if (distToPath(x, y, path) < 44) continue;
      if (ok(x, y)) { chosen.push({ x: Math.round(x), y: Math.round(y) }); break; }
    }
  }
  const cap = clamp(11 + Math.floor(level / 5) * 2, 11, 20);
  return chosen.slice(0, cap);
}

/* ----- 波次组配（每关固定 10 波，第 10 波出 Boss）-----
 * 节奏曲线：前 3 波「慢速·低金·大量」小怪（新手缓冲）；中段(4-6)提量；
 *          后段(7-9)加入重型/治疗且提速提质；第 10 波末尾出 Boss。 */
const WAVES = 10;              // 每关波数固定为 10
const EARLY = 3;               // 前 3 波为「慢速低金高量」缓冲段
const BASIC = ['slime', 'runner', 'swarm', 'bouncer', 'stinger', 'flyer', 'warrunner', 'splitter', 'swarmer', 'ghost'];
const HEAVY = ['tank', 'ironbug', 'healer', 'brute', 'juggernaut'];
function unlockedOf(list, level) { return list.filter((k) => C.ENEMIES[k] && (C.ENEMIES[k].unlock || 1) <= level); }
function pickBoss(level) {
  const bosses = Object.keys(C.ENEMIES).filter((k) => C.ENEMIES[k].boss && (C.ENEMIES[k].unlock || 1) <= level);
  return bosses.length ? bosses[bosses.length - 1] : 'boss';
}
// boss 血量随关卡线性放大（基础血已下调）
function bossHpMul(level) { return 1 + (level - 1) * 0.13; }

function buildWave(level, w, waveCount) {
  const basics = unlockedOf(BASIC, level), heavies = unlockedOf(HEAVY, level);
  const list = [];
  const push = (type, n, gap) => { for (let i = 0; i < n; i++) list.push({ type, gap }); };
  const early = w <= EARLY;
  // 主力数量：前期就给大量小怪（走得慢、给钱少，用数量施压但不致崩）；后期随波数提量
  const main = basics[(w + level) % basics.length] || 'slime';
  const mainN = early ? (13 + w * 3) : (9 + Math.round((w - EARLY) * 2.6));
  push(main, mainN, early ? 0.4 : 0.5);
  if (basics.length > 1) { const alt = basics[(w + level + 2) % basics.length]; push(alt, (early ? 3 : 2) + Math.floor(w / 2), 0.42); }
  if (basics.length > 3 && w >= 4) { const alt2 = basics[(w + level + 5) % basics.length]; push(alt2, 2 + Math.floor((w - 3) / 2), 0.4); }
  // 重型/治疗（质量）：仅后半段(第4波起)登场，越靠后越多
  if (heavies.length && w >= 4) { const hv = heavies[(w + level) % heavies.length]; push(hv, Math.floor((w - 3) / 2) + (w >= waveCount - 1 ? 1 : 0), 0.85); }
  // 虫潮洪流：每隔几波一大波廉价小怪
  const swk = basics.includes('swarmer') ? 'swarmer' : (basics.includes('swarm') ? 'swarm' : null);
  if (swk && w % 3 === 0) push(swk, 9 + Math.round(w * 1.5), 0.18);
  // Boss：固定第 10 波（末波）末尾登场
  if (w === waveCount) list.push({ type: pickBoss(level), gap: 1.6, boss: true });
  // 强度：血量随关卡/波次爬升；速度前期慢、后期加速
  const hpMul = (1 + (level - 1) * 0.05) * (1 + (w - 1) * 0.05);
  const baseSp = 1 + Math.min(0.45, (level - 1) * 0.009);
  const waveSp = early ? 0.7 : (w <= 5 ? 0.92 : 1 + Math.min(0.28, (w - 5) * 0.055));   // 前期慢，后期越来越快
  const spMul = baseSp * waveSp;
  const goldMul = early ? 0.55 : 1;   // 前期怪给钱少
  return list.map((e) => e.boss
    ? { type: e.type, gap: e.gap, hpMul: bossHpMul(level), spMul: baseSp, goldMul: 1, boss: true }
    : { type: e.type, gap: e.gap, hpMul, spMul, goldMul });
}

// 下一波预览：主力怪名称 + 是否 Boss 波（Boss 固定第 10 波）
function wavePreview(level, w, waveCount) {
  if (w > waveCount) return null;
  const basics = unlockedOf(BASIC, level);
  if (w === waveCount) { const b = pickBoss(level); return { name: C.ENEMIES[b].name, boss: true }; }
  const main = basics[(w + level) % basics.length] || 'slime';
  return { name: C.ENEMIES[main].name, boss: false };
}

function buildLevel(n) {
  const theme = THEME_GROUPS[clamp(Math.floor((n - 1) / 5), 0, 7)];
  const path = genPath(n);
  const spots = genSlots(path, n);                 // 候选位（用于撒障碍物）
  // 障碍物：占据部分候选位，击破得金币、腾出可建位。分大/小两类：
  //   大障碍：血厚(打得久)、金币多、占地大；小障碍：血薄(打得快)、金币少、占地小。数量随关卡增加。
  const obTypes = ['ob_rock', 'ob_crystal', 'ob_barrel', 'ob_stump'];
  const obCount = n <= 1 ? 1 : n <= 3 ? 2 : clamp(4 + Math.floor(n / 3), 4, 11);   // 前几关障碍更少
  const obstacles = [];
  for (let i = 0; i < obCount && i < spots.length; i++) {
    const p = spots[Math.floor((i + 0.5) * spots.length / obCount)];
    const big = (i % 2 === 0);                      // 大小交替
    obstacles.push({
      x: p.x, y: p.y, type: obTypes[(i + n) % obTypes.length],
      big, sizeScale: big ? 1.35 : 0.8,
      hp: big ? (130 + n * 26) : (45 + n * 9),       // 大的血多、打得久
      gold: big ? (24 + n * 3) : (8 + n),            // 大的金币多
    });
  }
  const waveCount = WAVES;   // 固定 10 波，第 10 波 Boss
  const towers = C.TOWER_KEYS.filter((k) => (C.TOWERS[k].unlock || 1) <= n);
  const maxTowers = clamp(8 + Math.floor(n / 4), 8, 18);   // 防御塔总数上限（限制策略；障碍清除后可用位更多）
  return {
    id: n,
    name: `第 ${n} 关 · ${THEME_NAME[theme]}`,
    theme, bg: 'b_' + theme,
    path, obstacles, maxTowers,
    waveCount,
    startGold: 220 + n * 6,
    startLives: 20,
    towers,
    hero: n >= (C.HERO.unlockLevel || 40),
    buildWave: (w) => buildWave(n, w, waveCount),
    wavePreview: (w) => wavePreview(n, w, waveCount),
    waveBonus: (w) => 18 + n * 2 + w * 4,
  };
}

module.exports = { buildLevel, TOTAL_LEVELS: C.TOTAL_LEVELS, THEME_GROUPS, THEME_NAME };
