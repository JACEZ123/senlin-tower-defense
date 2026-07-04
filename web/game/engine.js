/* =========================================================================
 * 游戏引擎 — 纯逻辑（多人就绪：改状态都走 applyCommand；update 确定性推进）。
 *   createState(level)            level = levels.buildLevel(n) 的结果
 *   applyCommand(state, cmd)      build / upgrade / branch / sell / moveHero / startWave / select
 *   update(state, dt)
 * 坐标在虚拟空间 768x1152。
 * ========================================================================= */
const C = require('./config.js');

function dist(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

function createState(level) {
  const s = {
    level,
    gold: level.startGold, lives: level.startLives,
    wave: 0, totalWaves: level.waveCount, phase: 'ready',
    enemies: [], towers: [], bullets: [], floats: [],
    hero: null, heroEnabled: !!level.hero,
    spawnQueue: [], spawnTimer: 0, _eid: 1, _tid: 1, healTick: 0,
    nextTimer: 8, firstDelay: 8, betweenDelay: 6,   // 自动出怪倒计时
    effects: [], focusId: 0,                         // 命中特效 / 集火目标
    obstacles: (level.obstacles || []).map((o, i) => ({ id: 9000 + i, x: o.x, y: o.y, type: o.type, hp: o.hp, maxHp: o.hp, gold: o.gold, big: !!o.big, sizeScale: o.sizeScale || 1 })),
    chests: [], _cid: 1,                             // 已放置的宝箱（道具）
    maxTowers: level.maxTowers, selectedId: 0,
  };
  if (s.heroEnabled) spawnHero(s);
  return s;
}

/* 取塔当前生效属性（已分支则用分支专精，否则用基础等级） */
function towerStats(t) {
  const def = C.TOWERS[t.key];
  if (t.branch) {
    const b = def.branches[t.branch];
    return { dmg: b.dmg, range: b.range, rate: b.rate, attack: b.attack || def.attack,
      splash: b.splash != null ? b.splash : def.splash, slow: b.slow != null ? b.slow : def.slow,
      slowDur: b.slowDur != null ? b.slowDur : def.slowDur, dot: b.dot != null ? b.dot : def.dot,
      dotDur: b.dotDur != null ? b.dotDur : def.dotDur, chain: b.chain != null ? b.chain : def.chain,
      chainFalloff: b.chainFalloff != null ? b.chainFalloff : def.chainFalloff,
      crit: b.crit, critMul: b.critMul, bullet: b.bullet || def.bullet };
  }
  const lv = def.levels[t.level];
  return { dmg: lv.dmg, range: lv.range, rate: lv.rate, attack: def.attack, splash: def.splash,
    slow: def.slow, slowDur: def.slowDur, dot: def.dot, dotDur: def.dotDur, chain: def.chain,
    chainFalloff: def.chainFalloff, bullet: def.bullet };
}

function applyCommand(s, cmd) {
  switch (cmd.type) {
    case 'startWave': return startWave(s);
    case 'build':     return build(s, cmd.x, cmd.y, cmd.tower);
    case 'upgrade':   return upgrade(s, cmd.id);
    case 'branch':    return branch(s, cmd.id, cmd.branch);
    case 'sell':      return sell(s, cmd.id);
    case 'moveHero':  return moveHero(s, cmd.x, cmd.y);
    case 'select':    s.selectedId = cmd.id || 0; return true;
    case 'focus':     s.focusId = (s.focusId === cmd.id) ? 0 : cmd.id; return true;  // 点怪集火/再点取消
    case 'placeChest':return placeChest(s, cmd.x, cmd.y, cmd.item);
    case 'collectChest':return collectChest(s, cmd.id);
  }
  return false;
}

function startWave(s) {
  if (s.phase === 'spawning' || s.phase === 'won' || s.phase === 'lost') return false;
  if (s.wave >= s.totalWaves) return false;
  s.wave += 1;
  s.spawnQueue = s.level.buildWave(s.wave);
  s.spawnTimer = 0.3; s.phase = 'spawning';
  return true;
}

function towerById(s, id) { return s.towers.find((t) => t.id === id); }

// 路径距离（自由放置校验用）
function segDist(px, py, a, b) { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1; let t = ((px - a.x) * dx + (py - a.y) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t)); }
function distToPath(s, x, y) { const p = s.level.path; let m = 1e9; for (let i = 0; i < p.length - 1; i++) m = Math.min(m, segDist(x, y, p[i], p[i + 1])); return m; }

const MINSPACE = 74;               // 塔间最小间距（"各自塔之间有占比"）
/** 自由放置校验：返回 ok 及原因，供 UI 预览 */
function canBuild(s, x, y) {
  if (x < 44 || x > C.VW - 44 || y < 66 || y > C.VH - 46) return { ok: false, why: 'oob' };
  const d = distToPath(s, x, y);
  if (d < 40) return { ok: false, why: 'onpath' };        // 不能压在路上
  if (d > 135) return { ok: false, why: 'far' };          // 太远打不到
  if (s.towers.length >= s.maxTowers) return { ok: false, why: 'max' };   // 数量上限
  for (const t of s.towers) if (Math.hypot(t.x - x, t.y - y) < MINSPACE) return { ok: false, why: 'near' };
  for (const o of s.obstacles) if (Math.hypot(o.x - x, o.y - y) < 46 * (o.sizeScale || 1)) return { ok: false, why: 'obstacle' };
  return { ok: true };
}

function build(s, x, y, key) {
  const def = C.TOWERS[key]; if (!def || !s.level.towers.includes(key)) return false;
  if (!canBuild(s, x, y).ok) return false;
  if (s.gold < def.cost) return false;
  s.gold -= def.cost;
  const t = { id: s._tid++, key, level: 0, branch: null, cd: 0, x, y, angle: -Math.PI / 2 };
  s.towers.push(t); s.selectedId = t.id;
  pushFloat(s, x, y, '-' + def.cost, '#ffd23f');
  return true;
}

function upgrade(s, id) {
  const t = towerById(s, id); if (!t || t.branch) return false;
  const def = C.TOWERS[t.key], next = def.levels[t.level + 1];
  if (!next || s.gold < next.upgrade) return false;
  s.gold -= next.upgrade; t.level += 1;
  pushFloat(s, t.x, t.y, '-' + next.upgrade, '#ffd23f');
  return true;
}

function branch(s, id, which) {
  const t = towerById(s, id); if (!t || t.branch) return false;
  const def = C.TOWERS[t.key];
  if (t.level !== def.levels.length - 1) return false;
  const b = def.branches[which]; if (!b || s.gold < b.upgrade) return false;
  s.gold -= b.upgrade; t.branch = which;
  pushFloat(s, t.x, t.y, '★' + b.name, '#b6ff5a');
  return true;
}

function sell(s, id) {
  const i = s.towers.findIndex((t) => t.id === id); if (i < 0) return false;
  const t = s.towers[i], def = C.TOWERS[t.key];
  let spent = def.cost; for (let k = 1; k <= t.level; k++) spent += def.levels[k].upgrade;
  if (t.branch) spent += def.branches[t.branch].upgrade;
  const refund = Math.floor(spent * 0.6); s.gold += refund;
  pushFloat(s, t.x, t.y, '+' + refund, '#ffd23f'); s.towers.splice(i, 1);
  if (s.selectedId === id) s.selectedId = 0;
  return true;
}

/* ----- 宝箱（可放置道具） ----- */
// 宝箱占位规则：与塔类似但不计入塔上限；可稍靠近路径（部分效果需贴路）；不与塔/宝箱/障碍重叠。
function canPlaceChest(s, x, y) {
  if (x < 44 || x > C.VW - 44 || y < 66 || y > C.VH - 46) return { ok: false, why: 'oob' };
  const d = distToPath(s, x, y);
  if (d < 34) return { ok: false, why: 'onpath' };
  if (d > 150) return { ok: false, why: 'far' };
  for (const t of s.towers) if (Math.hypot(t.x - x, t.y - y) < 62) return { ok: false, why: 'near' };
  for (const c of s.chests) if (Math.hypot(c.x - x, c.y - y) < 62) return { ok: false, why: 'near' };
  for (const o of s.obstacles) if (Math.hypot(o.x - x, o.y - y) < 46 * (o.sizeScale || 1)) return { ok: false, why: 'obstacle' };
  return { ok: true };
}
function placeChest(s, x, y, item) {
  if (!item || !canPlaceChest(s, x, y).ok) return false;
  const c = { id: 20000 + s._cid++, x, y, item, t: 0, timer: item.period || 0, acc: 0 };
  s.chests.push(c);
  applyChestInstant(s, c);   // 即时类效果立刻结算
  return true;
}
// 拾取金币堆：加当前金币的 pct%，然后宝箱消失
function collectChest(s, id) {
  const i = s.chests.findIndex((c) => c.id === id); if (i < 0) return false;
  const c = s.chests[i]; if (c.item.effect !== 'goldpile') return false;
  const g = Math.max(1, Math.floor(s.gold * (c.item.pct || 0.25)));
  s.gold += g; pushFloat(s, c.x, c.y - 6, '+' + g, '#ffd23f');
  s.chests.splice(i, 1); return true;
}
function applyChestInstant(s, c) {
  const it = c.item;
  if (it.effect === 'gold') { s.gold += it.amount; pushFloat(s, c.x, c.y, '+' + it.amount, '#ffd23f'); }
  else if (it.effect === 'expbook') {
    let best = null, bd = 1e9;
    for (const t of s.towers) {
      const def = C.TOWERS[t.key], canUp = !t.branch && t.level < def.levels.length - 1;
      if (!canUp) continue; const d = dist(c.x, c.y, t.x, t.y);
      if (d <= it.radius && d < bd) { bd = d; best = t; }
    }
    if (best) { best.level += 1; pushFloat(s, best.x, best.y, '★免费升级', '#b6ff5a'); }
    else pushFloat(s, c.x, c.y, '附近无可升级塔', '#ffe27a');
  }
}
// 攻速光环：每帧刷新各塔 hasteMul（供 runTowers 缩短冷却）
function applyChestAuras(s) {
  for (const t of s.towers) t.hasteMul = 1;
  for (const c of s.chests) {
    if (c.item.effect !== 'haste') continue;
    for (const t of s.towers) if (dist(c.x, c.y, t.x, t.y) <= c.item.radius) t.hasteMul *= c.item.mul;
  }
}
function runChests(s, dt) {
  for (const c of s.chests) {
    const it = c.item; c.t += dt;
    if (it.effect === 'income') {
      c.acc += it.rate * dt;
      if (c.acc >= 1) { const g = Math.floor(c.acc); c.acc -= g; s.gold += g; pushFloat(s, c.x, c.y - 4, '+' + g, '#ffe27a'); }
    } else if (it.effect === 'net') {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.timer = it.period;
        let best = null, bl = 1e9;
        for (const e of s.enemies) { if (e.netT > 0 || e.def.boss) continue; if (dist(c.x, c.y, e.x, e.y) > it.range) continue; if (e.hp < bl) { bl = e.hp; best = e; } }
        if (best) {
          best.netT = it.dur;
          s.effects.push({ kind: 'netline', x: c.x, y: c.y - 14, tx: best.x, ty: best.y, color: '#bfe9d5', t: 0, life: 0.38 });   // 从宝箱抛出网
          s.effects.push({ kind: 'net', x: best.x, y: best.y, color: '#dfe', t: 0, life: 0.5 });
        }
      }
    } else if (it.effect === 'burst') {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.timer = it.period;
        let best = null, bh = -1;
        for (const e of s.enemies) { if (dist(c.x, c.y, e.x, e.y) > it.range) continue; if (e.maxHp > bh) { bh = e.maxHp; best = e; } }
        if (best) { dmgEnemy(s, best, it.dmg, true); s.effects.push({ kind: 'arcane', x: best.x, y: best.y, color: '#c77dff', r: 44, t: 0, life: 0.5 }); pushFloat(s, best.x, best.y, '-' + it.dmg, '#c77dff'); }
      }
    }
  }
}

function spawnHero(s, atX, atY) {
  s.hero = { x: atX || C.VW / 2, y: atY || C.VH - 120, tx: atX || C.VW / 2, ty: atY || C.VH - 120,
    cd: 0, hp: C.HERO.maxHp, maxHp: C.HERO.maxHp, angle: -Math.PI / 2 };
}
function moveHero(s, x, y) {
  if (!s.hero) return false;
  s.hero.tx = Math.max(0, Math.min(C.VW, x)); s.hero.ty = Math.max(0, Math.min(C.VH, y));
  s.hero.manual = true; s.hero.manualT = 2.5; return true;
}

function pushFloat(s, x, y, text, color) { s.floats.push({ x, y, text, color, t: 0 }); }

function spawnEnemy(s, item, atX, atY, hpScale) {
  const def = C.ENEMIES[item.type];
  const p0 = s.level.path[0];
  const hp = def.hp * (item.hpMul || 1) * (hpScale || 1) * (C.BALANCE ? C.BALANCE.ENEMY_HP : 1);
  s.enemies.push({ id: s._eid++, type: item.type, def,
    x: atX != null ? atX : p0.x, y: atY != null ? atY : p0.y, seg: atX != null ? (item._seg || 0) : 0, t: 0,
    hp, maxHp: hp, spMul: item.spMul || 1, goldMul: item.goldMul != null ? item.goldMul : 1, slowT: 0, slowMul: 1, poisonT: 0, poisonDps: 0, burnT: 0, netT: 0 });
}

function update(s, dt) {
  if (s.phase === 'won' || s.phase === 'lost') return;
  // 自动出怪：ready 阶段倒计时归零即开下一波（玩家也可手动提前）
  if (s.phase === 'ready' && s.wave < s.totalWaves) {
    s.nextTimer -= dt;
    if (s.nextTimer <= 0) startWave(s);
  }
  if (s.phase === 'spawning') {
    s.spawnTimer -= dt;
    if (s.spawnTimer <= 0 && s.spawnQueue.length) { const it = s.spawnQueue.shift(); spawnEnemy(s, it); s.spawnTimer = it.gap * (C.BALANCE ? C.BALANCE.SPAWN_GAP : 1); }
    if (!s.spawnQueue.length) s.phase = 'fighting';
  }
  moveEnemies(s, dt);
  healAura(s, dt);
  applyChestAuras(s);
  runTowers(s, dt);
  runChests(s, dt);
  runHero(s, dt);
  runBullets(s, dt);
  for (const f of s.floats) f.t += dt;
  s.floats = s.floats.filter((f) => f.t < 1.0);
  for (const e of s.effects) e.t += dt;
  s.effects = s.effects.filter((e) => e.t < e.life);
  // 障碍物被击破：给金币、腾出可建位
  if (s.obstacles.length) {
    const live = [];
    for (const o of s.obstacles) { if (o.hitT > 0) o.hitT -= dt; if (o.hp <= 0) { const og = Math.max(1, Math.round(o.gold * (C.BALANCE ? C.BALANCE.GOLD : 1))); s.gold += og; pushFloat(s, o.x, o.y, '+' + og, '#ffd23f'); } else live.push(o); }
    s.obstacles = live;
  }
  if (s.focusId && !s.enemies.some((e) => e.id === s.focusId) && !s.obstacles.some((o) => o.id === s.focusId)) s.focusId = 0;
  if (s.phase === 'fighting' && s.enemies.length === 0) {
    s.gold += Math.round(s.level.waveBonus(s.wave) * (C.BALANCE ? C.BALANCE.GOLD : 1));
    if (s.wave >= s.totalWaves) s.phase = 'won'; else { s.phase = 'ready'; s.nextTimer = s.betweenDelay; }
  }
  if (s.lives <= 0) { s.lives = 0; s.phase = 'lost'; }
}

function moveEnemies(s, dt) {
  const path = s.level.path;
  for (const e of s.enemies) {
    let speed = e.def.speed * e.spMul;
    if (e.slowT > 0) { e.slowT -= dt; speed *= e.slowMul; }
    if (e.netT > 0) { e.netT -= dt; speed = 0; }        // 捕网：完全定身
    if (e.poisonT > 0) { e.poisonT -= dt; e.hp -= e.poisonDps * dt; }
    if (e.burnT > 0) { e.burnT -= dt; e.hp -= e.burnDps * dt; }
    if (e.hitT > 0) e.hitT -= dt;
    let remain = speed * dt;
    while (remain > 0 && e.seg < path.length - 1) {
      const a = path[e.seg], b = path[e.seg + 1], segLen = dist(a.x, a.y, b.x, b.y), left = segLen * (1 - e.t);
      if (remain >= left) { remain -= left; e.seg += 1; e.t = 0; } else { e.t += remain / segLen; remain = 0; }
    }
    const a = path[e.seg], b = path[Math.min(e.seg + 1, path.length - 1)];
    e.x = a.x + (b.x - a.x) * e.t; e.y = a.y + (b.y - a.y) * e.t;
    e.angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (e.seg >= path.length - 1) e.reached = true;
  }
  const alive = [];
  for (const e of s.enemies) {
    if (e.reached) { s.lives -= e.def.boss ? 5 : 1; continue; }
    if (e.hp <= 0) { onDeath(s, e); continue; }
    alive.push(e);
  }
  s.enemies = alive;
}

function onDeath(s, e) {
  const g = Math.max(1, Math.round(e.def.gold * (e.goldMul || 1) * (C.BALANCE ? C.BALANCE.GOLD : 1)));   // 前期怪给钱少(goldMul) + 全局经济系数
  s.gold += g; pushFloat(s, e.x, e.y, '+' + g, '#ffd23f');
  s.effects.push({ kind: 'poof', x: e.x, y: e.y, r: (e.def.size || 60) * 0.6, t: 0, life: 0.45 });   // 死亡烟雾(图片)
  if (e.def.split && !e._splitChild) {
    for (let i = 0; i < e.def.split; i++) {
      const off = (i - (e.def.split - 1) / 2) * 24;
      s.enemies.push({ id: s._eid++, type: e.type, def: { ...e.def, hp: e.def.hp * 0.45, size: e.def.size * 0.7, split: 0 },
        x: e.x + off, y: e.y, seg: e.seg, t: e.t, _splitChild: true, spMul: e.spMul * 1.15,
        hp: e.maxHp * 0.4, maxHp: e.maxHp * 0.4, slowT: 0, slowMul: 1, poisonT: 0, poisonDps: 0, burnT: 0 });
    }
  }
}

function healAura(s, dt) {
  s.healTick -= dt; if (s.healTick > 0) return; s.healTick = 0.5;
  for (const h of s.enemies) {
    if (!h.def.heal) continue;
    for (const e of s.enemies) {
      if (e === h || e.hp >= e.maxHp) continue;
      if (dist(h.x, h.y, e.x, e.y) <= h.def.healRange) e.hp = Math.min(e.maxHp, e.hp + h.def.heal * 0.5);
    }
  }
}

function pickTarget(s, x, y, range) {
  // 集火：若锁定目标在射程内，优先打它
  if (s.focusId) { const f = s.enemies.find((e) => e.id === s.focusId); if (f && dist(x, y, f.x, f.y) <= range) return f; }
  let best = null, bestProg = -1;
  for (const e of s.enemies) { if (dist(x, y, e.x, e.y) > range) continue; const prog = e.seg + e.t; if (prog > bestProg) { bestProg = prog; best = e; } }
  return best;
}

// 障碍物只有被「集火指定」时才打：默认不攻击障碍物（点击障碍物→集火，再点取消）
function pickObstacle(s, x, y, range) {
  if (!s.focusId) return null;
  const f = s.obstacles.find((o) => o.id === s.focusId);
  return (f && dist(x, y, f.x, f.y) <= range) ? f : null;
}
function runTowers(s, dt) {
  for (const t of s.towers) {
    const st = towerStats(t);
    t.cd -= dt;
    // 集火障碍物优先于打怪:点选障碍物=「这波顶得住,先拆资源点拿启动资金」,再点一次取消恢复打怪
    let target = pickObstacle(s, t.x, t.y, st.range);
    if (!target) target = pickTarget(s, t.x, t.y, st.range);
    if (target) t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    if (target && t.cd <= 0) { t.cd = st.rate / (t.hasteMul || 1); fire(s, t.x, t.y - 18, target, st); }   // 疾速光环缩短冷却
  }
}

function fire(s, x, y, target, st) {
  const bl = st.bullet || { color: '#fff', speed: 600, r: 5 };
  const dmg = st.dmg * (C.BALANCE ? C.BALANCE.TOWER_DMG : 1);   // 全局塔伤系数(中等偏难)
  s.bullets.push({ x, y, sx: x, sy: y, target, dmg, speed: bl.speed, color: bl.color, r: bl.r,
    attack: st.attack, splash: st.splash, slow: st.slow, slowDur: st.slowDur, dot: st.dot, dotDur: st.dotDur,
    chain: st.chain, chainFalloff: st.chainFalloff, crit: st.crit, critMul: st.critMul });
  // 开火枪口闪光特效（指向目标方向）
  const ang = Math.atan2(target.y - y, target.x - x);
  s.effects.push({ kind: 'muzzle', x: x + Math.cos(ang) * 14, y: y + Math.sin(ang) * 14, ang, color: bl.color, t: 0, life: 0.16 });
}

function runBullets(s, dt) {
  const live = [];
  for (const b of s.bullets) {
    const tgt = b.target;
    if (!tgt || tgt.hp <= 0 || tgt.reached) continue;
    const d = dist(b.x, b.y, tgt.x, tgt.y), step = b.speed * dt;
    if (d <= step) { hit(s, b, tgt); continue; }
    b.x += (tgt.x - b.x) / d * step; b.y += (tgt.y - b.y) / d * step; live.push(b);
  }
  s.bullets = live;
}

function dmgEnemy(s, e, dmg, ignoreArmor) {
  let d = dmg; if (!ignoreArmor && e.def && e.def.armor) d = Math.max(1, d - e.def.armor);  // 障碍物无 def
  e.hp -= d; e.hitT = 0.12;   // 受击反馈（渲染层闪白/挤压）
}

function hit(s, b, tgt) {
  let dmg = b.dmg;
  if (b.crit && ((tgt.id * 2654435761 % 100) / 100 < b.crit)) dmg = Math.round(dmg * b.critMul);
  const A = b.attack;
  // 命中特效：按攻击类型生成不同表现（渲染层据 kind 画）。pierce 带射线起点。
  if (A !== 'spark') s.effects.push({ x: tgt.x, y: tgt.y, sx: b.sx, sy: b.sy, kind: A, color: b.color, r: b.splash || 34, t: 0, life: (A === 'slow' || A === 'frostnova') ? 0.6 : (A === 'pierce' ? 0.3 : 0.45) });
  const ignore = (A === 'arcane' || A === 'arcanechain' || A === 'pierce');
  dmgEnemy(s, tgt, dmg, ignore);

  if (A === 'splash' || A === 'burn' || A === 'frostnova' || A === 'poisonsplash') {
    for (const e of s.enemies) if (e !== tgt && dist(tgt.x, tgt.y, e.x, e.y) <= b.splash) dmgEnemy(s, e, dmg * 0.6, ignore);
  }
  if (A === 'slow' || A === 'frostnova') {
    tgt.slowT = b.slowDur; tgt.slowMul = b.slow;
    if (A === 'frostnova') for (const e of s.enemies) if (dist(tgt.x, tgt.y, e.x, e.y) <= b.splash) { e.slowT = b.slowDur; e.slowMul = b.slow; }
  }
  if (A === 'poison' || A === 'poisonsplash') {
    tgt.poisonT = b.dotDur; tgt.poisonDps = b.dot;
    if (A === 'poisonsplash') for (const e of s.enemies) if (dist(tgt.x, tgt.y, e.x, e.y) <= b.splash) { e.poisonT = b.dotDur; e.poisonDps = b.dot; }
  }
  if (A === 'burn') { tgt.burnT = b.dotDur; tgt.burnDps = b.dot; for (const e of s.enemies) if (dist(tgt.x, tgt.y, e.x, e.y) <= b.splash) { e.burnT = b.dotDur; e.burnDps = b.dot; } }
  if (A === 'chain' || A === 'arcanechain') {
    let cur = tgt, hops = (b.chain || 2) - 1, dm = dmg * (b.chainFalloff || 0.7), hitSet = new Set([tgt.id]);
    const pts = [{ x: b.sx, y: b.sy }, { x: tgt.x, y: tgt.y }];   // 从塔 → 首个目标
    while (hops-- > 0) {
      let nx = null, nd = 150;
      for (const e of s.enemies) { if (hitSet.has(e.id)) continue; const dd = dist(cur.x, cur.y, e.x, e.y); if (dd < nd) { nd = dd; nx = e; } }
      if (!nx) break;
      dmgEnemy(s, nx, dm, A === 'arcanechain'); hitSet.add(nx.id);
      pts.push({ x: nx.x, y: nx.y });
      cur = nx; dm *= (b.chainFalloff || 0.7);
    }
    s.effects.push({ kind: 'chainbolt', pts, color: b.color, t: 0, life: 0.32 });   // 闪电链：连接怪物
  }
}

function runHero(s, dt) {
  const h = s.hero; if (!h) return; const H = C.HERO;
  if (h.manualT > 0) { h.manualT -= dt; if (h.manualT <= 0) h.manual = false; }
  let target = null, bd = 1e9;
  for (const e of s.enemies) { const d = dist(h.x, h.y, e.x, e.y); if (d < bd) { bd = d; target = e; } }
  if (!h.manual && target && bd <= H.aggro) { if (bd > H.range * 0.85) { h.tx = target.x; h.ty = target.y; } else { h.tx = h.x; h.ty = h.y; } }
  const d = dist(h.x, h.y, h.tx, h.ty);
  if (d > 2) { const step = Math.min(d, H.speed * dt); h.x += (h.tx - h.x) / d * step; h.y += (h.ty - h.y) / d * step; }
  h.cd -= dt;
  if (target && bd <= H.range && h.cd <= 0) {
    h.cd = H.rate; let dmg = H.dmg;
    if ((target.id * 2654435761 % 100) / 100 < H.crit) dmg = Math.round(dmg * H.critMul);
    s.bullets.push({ x: h.x, y: h.y - 20, target, dmg, speed: H.bullet.speed, color: H.bullet.color, r: H.bullet.r, attack: 'single' });
    h.angle = Math.atan2(target.y - h.y, target.x - h.x);
  }
}

module.exports = { createState, applyCommand, update, dist, towerStats, canBuild, canPlaceChest };
