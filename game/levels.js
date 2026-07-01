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

/* 横屏程序化「阶梯蛇形」路径：从左侧入口蜿蜒到右侧基地。折数随关卡增加。
 * 由游戏绘制成抬升的 3D 平台(保卫萝卜风)，槽位落在平台两侧。 */
function genPath(level) {
  const top = 150, bot = VH - 130, left = 70, right = VW - 90, cy = (top + bot) / 2;
  const runs = clamp(3 + Math.floor((level - 1) / 8), 3, 6);   // 横向段数
  const xs = []; for (let i = 0; i <= runs; i++) xs.push(left + (right - left) * i / runs);
  const pts = [{ x: 20, y: cy }, { x: xs[0], y: bot }];
  let y = bot;
  for (let i = 0; i < runs; i++) {
    pts.push({ x: xs[i + 1], y });                 // 水平段
    if (i < runs - 1) { y = (y === bot) ? top : bot; pts.push({ x: xs[i + 1], y }); }  // 竖直台阶
  }
  pts.push({ x: VW - 20, y });
  return pts;
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

/* ----- 波次组配 -----
 * 主力(bulk)只从「基础怪」里选(可被便宜塔清理)；「重型/治疗」只作少量点缀；
 * 里程碑关(每 5 关 + 第40关)最后一波出 Boss。难度随关卡/波数递增。 */
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
  // 主力数量随波数增长；"更多怪"主要靠更多怪种 + 每关 boss + 适度提量承载（避免开局即崩）
  const main = basics[(w + level) % basics.length] || 'slime';
  push(main, 5 + Math.round(w * 1.15), 0.5);
  if (basics.length > 1) { const alt = basics[(w + level + 2) % basics.length]; push(alt, 1 + Math.floor(w / 3), 0.44); }
  if (basics.length > 3 && w >= 3) { const alt2 = basics[(w + level + 5) % basics.length]; push(alt2, 1 + Math.floor(w / 4), 0.42); }
  if (heavies.length) { const hv = heavies[(w + level) % heavies.length]; push(hv, Math.floor(w / 4) + (w >= waveCount - 1 ? 1 : 0), 0.85); }
  // 虫群洪流：每隔几波来一大波廉价小怪
  const swk = basics.includes('swarmer') ? 'swarmer' : (basics.includes('swarm') ? 'swarm' : null);
  if (swk && w % 3 === 0) push(swk, 6 + w, 0.18);
  // Boss：每关「最后一波」末尾出一个 boss（每关都有 boss）；里程碑关(每5关/第40关)再加一只前置 boss
  if (w === waveCount) list.push({ type: pickBoss(level), gap: 1.5, boss: true });
  else if ((level % 5 === 0 || level === 40) && w === Math.floor(waveCount * 0.6)) list.push({ type: pickBoss(level), gap: 1.5, boss: true });
  // 强度：血量随关卡/波次爬升，速度随关卡略升
  const hpMul = (1 + (level - 1) * 0.05) * (1 + (w - 1) * 0.04);
  const spMul = 1 + Math.min(0.45, (level - 1) * 0.009);
  return list.map((e) => e.boss ? { type: e.type, gap: e.gap, hpMul: bossHpMul(level), spMul } : { type: e.type, gap: e.gap, hpMul, spMul });
}

// 下一波预览：主力怪名称 + 是否 Boss 波
function wavePreview(level, w, waveCount) {
  if (w > waveCount) return null;
  const basics = unlockedOf(BASIC, level);
  const isBoss = (w === waveCount) || ((level % 5 === 0 || level === 40) && w === Math.floor(waveCount * 0.6));
  if (isBoss) { const b = pickBoss(level); return { name: C.ENEMIES[b].name, boss: true }; }
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
  const obCount = clamp(4 + Math.floor(n / 3), 4, 11);
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
  const waveCount = clamp(8 + Math.floor(n / 3), 8, 18);
  const towers = C.TOWER_KEYS.filter((k) => (C.TOWERS[k].unlock || 1) <= n);
  const maxTowers = clamp(8 + Math.floor(n / 4), 8, 18);   // 防御塔总数上限（限制策略；障碍清除后可用位更多）
  return {
    id: n,
    name: `第 ${n} 关 · ${THEME_NAME[theme]}`,
    theme, bg: 'b_' + theme,
    path, obstacles, maxTowers,
    waveCount,
    startGold: 260 + n * 7,
    startLives: 20,
    towers,
    hero: n >= (C.HERO.unlockLevel || 40),
    buildWave: (w) => buildWave(n, w, waveCount),
    wavePreview: (w) => wavePreview(n, w, waveCount),
    waveBonus: (w) => 24 + n * 3 + w * 5,
  };
}

module.exports = { buildLevel, TOTAL_LEVELS: C.TOTAL_LEVELS, THEME_GROUPS, THEME_NAME };
