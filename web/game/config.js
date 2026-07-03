/* =========================================================================
 * 绿色循环圈（微信小程序版）— 全局配置
 * 坐标/距离单位 = 虚拟像素；运行时整体等比缩放到屏幕。
 *
 * 40 关进程：
 *   - 塔类型随关卡解锁（开局 2 种 → 第 32 关集齐 8 种）
 *   - 每种塔满级后可二选一「分支」专精（不同终极效果/技能）
 *   - 怪物种类随关卡递增、数值递增
 *   - 英雄在第 40 关解锁
 * ========================================================================= */
const VW = 1280, VH = 720;   // 横屏 16:9 虚拟画布
const TOTAL_LEVELS = 40;

/* ---------------- 全局平衡系数（中等偏难调校，集中可调） ----------------
 * TOWER_DMG 塔伤害倍率(<1 更弱) / ENEMY_HP 怪物血量倍率(>1 更厚) /
 * GOLD 经济倍率(击杀/波次/障碍金币，<1 更穷) / SPAWN_GAP 出怪间隔倍率(>1 更不密集)。 */
const BALANCE = { TOWER_DMG: 0.72, ENEMY_HP: 1.22, GOLD: 0.6, SPAWN_GAP: 3.2 };

/* ---------------- 防御塔（8 种 + 分支技能树） ----------------
 * 每塔：cost 建造价；levels[] 三级基础升级；branches{A,B} 满级后二选一专精。
 * unlock 表示在第几关解锁。img 为精灵键（部分新塔暂复用现有美术，后续替换）。
 * attack: single 单体 / splash 溅射 / slow 减速 / poison 中毒 / chain 连锁 / pierce 穿透 / burn 灼烧 / arcane 真伤 */
const TOWERS = {
  arrow: {
    name: '兔弓手', img: 'tw_arrow_1', cost: 50, attack: 'single', unlock: 1,
    levels: [ { dmg: 12, range: 165, rate: 0.5 }, { dmg: 22, range: 180, rate: 0.45, upgrade: 60 }, { dmg: 38, range: 195, rate: 0.4, upgrade: 110 } ],
    branches: {
      A: { name: '速射弩', dmg: 40, range: 200, rate: 0.22, upgrade: 200, bullet: { color: '#ffe23f', speed: 760, r: 4 }, desc: '极快连射' },
      B: { name: '强弓', dmg: 95, range: 250, rate: 0.7, upgrade: 200, attack: 'pierce', bullet: { color: '#fff1a0', speed: 820, r: 6 }, desc: '高伤穿透' },
    },
    bullet: { color: '#ffd23f', speed: 620, r: 5 },
  },
  cannon: {
    name: '熊炮手', img: 'tw_cannon_1', cost: 90, attack: 'splash', splash: 80, unlock: 1,
    levels: [ { dmg: 26, range: 150, rate: 1.3 }, { dmg: 44, range: 160, rate: 1.2, upgrade: 100 }, { dmg: 70, range: 170, rate: 1.1, upgrade: 170 } ],
    branches: {
      A: { name: '榴弹炮', dmg: 110, range: 185, rate: 1.0, splash: 120, upgrade: 320, bullet: { color: '#ff7b29', speed: 440, r: 10 }, desc: '大范围爆炸' },
      B: { name: '导弹塔', dmg: 160, range: 230, rate: 1.6, splash: 70, upgrade: 320, bullet: { color: '#ff5a3d', speed: 520, r: 8 }, desc: '远程高爆' },
    },
    bullet: { color: '#ff7b29', speed: 420, r: 8 },
  },
  frost: {
    name: '企鹅法师', img: 'tw_frost_1', cost: 70, attack: 'slow', slow: 0.5, slowDur: 1.6, unlock: 5,
    levels: [ { dmg: 7, range: 160, rate: 0.9 }, { dmg: 13, range: 175, rate: 0.85, upgrade: 80 }, { dmg: 20, range: 190, rate: 0.8, upgrade: 140 } ],
    branches: {
      A: { name: '冰川', dmg: 30, range: 205, rate: 0.8, slow: 0.3, slowDur: 2.4, upgrade: 260, desc: '强力减速' },
      B: { name: '霜冻', dmg: 24, range: 210, rate: 0.7, slow: 0.55, slowDur: 1.6, attack: 'frostnova', splash: 110, upgrade: 260, bullet: { color: '#8be8e5', speed: 600, r: 7 }, desc: '范围冰冻' },
    },
    bullet: { color: '#8be8e5', speed: 560, r: 6 },
  },
  poison: {
    name: '毒蛙', img: 'tw_poison_1', cost: 80, attack: 'poison', dot: 9, dotDur: 3, unlock: 8,
    levels: [ { dmg: 5, range: 170, rate: 1.0 }, { dmg: 9, range: 185, rate: 0.95, upgrade: 95 }, { dmg: 15, range: 200, rate: 0.9, upgrade: 160 } ],
    branches: {
      A: { name: '剧毒', dmg: 18, range: 210, rate: 0.9, dot: 26, dotDur: 4, upgrade: 280, desc: '超高持续毒' },
      B: { name: '瘟疫', dmg: 14, range: 220, rate: 1.0, dot: 14, dotDur: 3, attack: 'poisonsplash', splash: 100, upgrade: 280, desc: '毒云传播' },
    },
    bullet: { color: '#7bd66b', speed: 500, r: 6 },
  },
  lightning: {
    name: '电力松鼠', img: 'tw_lightning_1', cost: 120, attack: 'chain', chain: 3, chainFalloff: 0.7, unlock: 13,
    levels: [ { dmg: 30, range: 180, rate: 0.9 }, { dmg: 50, range: 195, rate: 0.85, upgrade: 150 }, { dmg: 78, range: 210, rate: 0.8, upgrade: 230 } ],
    branches: {
      A: { name: '雷暴', dmg: 120, range: 230, rate: 0.8, chain: 5, upgrade: 400, desc: '连锁更多目标' },
      B: { name: '电磁炮', dmg: 230, range: 250, rate: 1.0, chain: 2, upgrade: 400, desc: '单体超高伤' },
    },
    bullet: { color: '#9fd8ff', speed: 900, r: 5 },
  },
  sniper: {
    name: '鹰眼狙击', img: 'tw_sniper_1', cost: 150, attack: 'pierce', unlock: 18,
    levels: [ { dmg: 90, range: 320, rate: 1.6 }, { dmg: 150, range: 360, rate: 1.5, upgrade: 180 }, { dmg: 240, range: 400, rate: 1.4, upgrade: 280 } ],
    branches: {
      A: { name: '歼灭者', dmg: 520, range: 460, rate: 1.6, upgrade: 480, desc: '超远超高伤' },
      B: { name: '爆头', dmg: 300, range: 420, rate: 0.9, crit: 0.4, critMul: 3, upgrade: 480, desc: '高暴击快射' },
    },
    bullet: { color: '#e8f0ff', speed: 1400, r: 4 },
  },
  flame: {
    name: '火龙宝宝', img: 'tw_flame_1', cost: 110, attack: 'burn', splash: 90, dot: 14, dotDur: 2.5, unlock: 25,
    levels: [ { dmg: 18, range: 140, rate: 0.5 }, { dmg: 30, range: 150, rate: 0.45, upgrade: 160 }, { dmg: 48, range: 160, rate: 0.4, upgrade: 250 } ],
    branches: {
      A: { name: '炼狱', dmg: 80, range: 175, rate: 0.4, splash: 130, dot: 34, dotDur: 3, upgrade: 420, desc: '范围灼烧地狱' },
      B: { name: '熔火', dmg: 130, range: 165, rate: 0.5, splash: 80, dot: 20, dotDur: 2.5, upgrade: 420, desc: '高爆灼烧' },
    },
    bullet: { color: '#ff9333', speed: 360, r: 9 },
  },
  arcane: {
    name: '猫头鹰法师', img: 'tw_arcane_1', cost: 160, attack: 'arcane', unlock: 32,
    levels: [ { dmg: 55, range: 200, rate: 0.8 }, { dmg: 90, range: 215, rate: 0.75, upgrade: 200 }, { dmg: 140, range: 230, rate: 0.7, upgrade: 320 } ],
    branches: {
      A: { name: '虚空', dmg: 260, range: 250, rate: 0.7, upgrade: 520, desc: '无视护甲真伤' },
      B: { name: '秘法', dmg: 150, range: 260, rate: 0.5, attack: 'arcanechain', chain: 4, chainFalloff: 0.8, upgrade: 520, desc: '奥术连锁' },
    },
    bullet: { color: '#c9a0ff', speed: 760, r: 6 },
  },
};
// 解锁顺序（与 unlock 一致，便于商店排序）
const TOWER_KEYS = ['arrow', 'cannon', 'frost', 'poison', 'lightning', 'sniper', 'flame', 'arcane'];

// 英雄：第 40 关解锁。机动单位，自动靠近攻击附近敌人，点地面下达移动指令
const HERO = {
  name: '风暴游侠', img: 'hero_ranger', ranged: true, unlockLevel: 40,
  dmg: 60, range: 230, rate: 0.35, speed: 160, aggro: 320, crit: 0.3, critMul: 2.2, maxHp: 800,
  bullet: { color: '#b6ff5a', speed: 760, r: 5 },
};

/* ---------------- 敌人（随关卡逐步登场） ----------------
 * armor 减伤(固定值)；fly 飞行；heal 治疗周围；split 死亡分裂；boss 首领。
 * unlock = 首次出现的关卡。img 暂复用现有怪物美术，后续可加新美术。 */
const ENEMIES = {
  // 基础怪（金币普遍下调，靠「数量多」补偿经济）
  slime:   { name: '史莱姆', img: 'en_slime',  hp: 34,  speed: 72,  gold: 3,  size: 64,  unlock: 1 },
  runner:  { name: '疾行虫', img: 'en_runner', hp: 24,  speed: 122, gold: 3,  size: 56,  unlock: 2 },
  swarm:   { name: '虫群',   img: 'en_swarm',  hp: 16,  speed: 98,  gold: 2,  size: 46,  unlock: 3 },
  bouncer: { name: '弹跳兽', img: 'en_bouncer',  hp: 46,  speed: 96,  gold: 3,  size: 60,  unlock: 4 },          // 快血厚史莱姆
  tank:    { name: '甲壳兽', img: 'en_tank',   hp: 130, speed: 46,  gold: 8,  size: 78,  armor: 3, unlock: 6 },
  stinger: { name: '毒刺虫', img: 'en_stinger', hp: 60,  speed: 110, gold: 4,  size: 58,  unlock: 7 },          // 快且有点血
  flyer:   { name: '飞蝠',   img: 'en_flyer',  hp: 40,  speed: 130, gold: 4,  size: 50,  fly: true, unlock: 9 },
  warrunner:{ name: '冲锋虫', img: 'en_warrunner', hp: 95, speed: 150, gold: 5,  size: 60,  unlock: 11 },         // 超快冲锋
  splitter:{ name: '裂解史莱姆', img: 'en_splitter', hp: 70, speed: 70, gold: 5, size: 70, split: 2, unlock: 13 },
  ironbug: { name: '铁甲虫', img: 'en_ironbug',   hp: 170, speed: 58,  gold: 9,  size: 72,  armor: 5, unlock: 16 }, // 中速重甲
  healer:  { name: '治疗灵', img: 'en_healer',  hp: 90,  speed: 80,  gold: 7,  size: 60,  heal: 12, healRange: 110, unlock: 19 },
  swarmer: { name: '虫潮',   img: 'en_swarmer',  hp: 28,  speed: 112, gold: 1,  size: 42,  unlock: 21 },          // 极廉价大群
  ghost:   { name: '幽影',   img: 'en_ghost',  hp: 120, speed: 96,  gold: 6,  size: 58,  fly: true, unlock: 22 }, // 飞行+较厚
  brute:   { name: '重甲兽', img: 'en_brute',   hp: 280, speed: 40,  gold: 13, size: 90,  armor: 6, unlock: 24 },
  juggernaut:{ name: '碾压者', img: 'en_juggernaut', hp: 460, speed: 50,  gold: 16, size: 96,  armor: 8, unlock: 30 }, // 又快又厚
  // 首领（基础血量下调 + 按关卡缩放，使「每关都能出 boss」且早期可击破）
  boss:    { name: '熔岩巨兽', img: 'en_boss', hp: 320,  speed: 42, gold: 60,  size: 140, armor: 3,  boss: true, unlock: 1 },
  bossfast:{ name: '狂奔魔像', img: 'en_bossfast', hp: 520,  speed: 66, gold: 90,  size: 145, armor: 4,  boss: true, unlock: 10 },
  bosstank:{ name: '不灭石神', img: 'en_bosstank', hp: 1000, speed: 34, gold: 140, size: 160, armor: 9,  boss: true, unlock: 25 },
};

/* 宝箱道具池：像塔一样放置到空位，开箱随机翻出一种效果，原地生效。
 *   effect: gold(即时金币) / income(每秒补给) / expbook(相邻塔免费升级) /
 *           net(周期困住濒死怪) / haste(相邻塔攻速光环) / burst(周期真伤爆发)
 *   rarity: common/rare/epic 决定抽中权重 CHEST_RARITY_WEIGHT。img=chest_<id>. */
const CHEST_ITEMS = [
  { id: 'gold',    name: '金币宝箱', rarity: 'common', effect: 'goldpile', pct: 0.25,             img: 'chest_gold',   desc: '地上出现金币堆，点击拾取当前金币的 25%' },
  { id: 'income',  name: '补给宝箱', rarity: 'common', effect: 'income',  rate: 1,               img: 'chest_income', desc: '每秒 +1 金币（整局）' },
  { id: 'expbook', name: '经验之书', rarity: 'common', effect: 'expbook', radius: 150,           img: 'chest_exp',    desc: '相邻一座塔立即免费升 1 级' },
  { id: 'net',     name: '捕网宝箱', rarity: 'rare',   effect: 'net',     period: 15, dur: 3, range: 280, img: 'chest_net', desc: '每 15s 困住范围内最濒死的怪 3s' },
  { id: 'haste',   name: '疾速光环', rarity: 'rare',   effect: 'haste',   mul: 1.15, radius: 155, img: 'chest_haste',  desc: '相邻塔攻速 +15%' },
  { id: 'burst',   name: '奥能宝箱', rarity: 'epic',   effect: 'burst',   period: 20, dmg: 600, range: 230, img: 'chest_burst', desc: '每 20s 对范围内最强怪造成 600 真伤' },
];
const CHEST_RARITY_WEIGHT = { common: 60, rare: 30, epic: 10 };

/* 运营化调价：建塔略便宜（好起步），升级/分支显著更贵（升级节奏放慢，边打边攒钱）。
 * 只需改这两个系数即可整体调节奏，UI/引擎/出售退款均自动一致。 */
const COST_MUL = 0.8, UPGRADE_MUL = 1.35;
const r5 = (v) => Math.max(5, Math.round(v / 5) * 5);
for (const k of Object.keys(TOWERS)) {
  const t = TOWERS[k];
  t.cost = r5(t.cost * COST_MUL);
  for (const lv of t.levels) if (lv.upgrade) lv.upgrade = r5(lv.upgrade * UPGRADE_MUL);
  for (const b of Object.values(t.branches)) b.upgrade = r5(b.upgrade * UPGRADE_MUL);
}

module.exports = { VW, VH, TOTAL_LEVELS, BALANCE, TOWERS, TOWER_KEYS, HERO, ENEMIES, CHEST_ITEMS, CHEST_RARITY_WEIGHT };
