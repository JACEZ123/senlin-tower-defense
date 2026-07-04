/* 批量生成障碍物素材: Agnes 生图(洋红底) → 抠图 → 裁边 → web/assets + assets。
 * 用法: node tools_gen_obstacles.mjs [起始序号]  (中断后可续跑) */
import { execFileSync } from 'child_process'; import fs from 'fs';
const DRIVER = '/Users/admin/agnes-picture-video-skill/.claude/skills/run-agnes-pic-video/driver.mjs';
const TMP = '/tmp/ob_gen'; fs.mkdirSync(TMP, { recursive: true });
const STYLE = 'Cute cartoon tower-defense game prop, chibi style, thick painted, vibrant colors, soft rim light, single object centered, isometric 3/4 top-down game view, on a PURE SOLID MAGENTA background (#FF00FF), no shadow on ground, no text';
const ITEMS = [
  ['ob2_rock_s1', 'a small round grey pebble rock'],
  ['ob2_rock_s2', 'a small mossy stone'],
  ['ob2_rock_m1', 'a medium cracked boulder with moss patches'],
  ['ob2_rock_m2', 'a medium stacked stone pile'],
  ['ob2_rock_b1', 'a HUGE massive boulder, towering rock, epic scale'],
  ['ob2_rock_b2', 'a HUGE mossy ancient megalith rock with runes, epic scale'],
  ['ob2_crystal_s', 'a small blue crystal shard cluster'],
  ['ob2_crystal_m', 'a medium purple crystal formation, glowing'],
  ['ob2_crystal_b', 'a HUGE giant teal crystal spire cluster, glowing, epic scale'],
  ['ob2_stump_s', 'a small tree stump with rings'],
  ['ob2_stump_m', 'a medium wide tree stump with a mushroom on it'],
  ['ob2_tree_b1', 'a HUGE gnarled dead tree with twisted branches, epic scale'],
  ['ob2_tree_b2', 'a HUGE thick old oak tree, dense round canopy, epic scale'],
  ['ob2_log_s', 'a small fallen wooden log'],
  ['ob2_log_m', 'a medium mossy fallen log with mushrooms'],
  ['ob2_mush_s', 'a small red mushroom cluster with white dots'],
  ['ob2_mush_m', 'a medium group of colorful glowing mushrooms'],
  ['ob2_mush_b', 'a HUGE giant fantasy mushroom, thick stem, epic scale'],
  ['ob2_bush_s', 'a small round green bush'],
  ['ob2_bush_m', 'a medium berry bush with red berries'],
  ['ob2_ice_s', 'a small spiky ice shard'],
  ['ob2_ice_b', 'a HUGE giant iceberg spike cluster, frosty, epic scale'],
  ['ob2_lava_m', 'a medium volcanic rock with glowing lava cracks'],
  ['ob2_lava_b', 'a HUGE massive obsidian boulder with glowing magma veins, epic scale'],
  ['ob2_barrel_s', 'a small wooden barrel with metal bands'],
  ['ob2_crate_s', 'a small wooden crate'],
  ['ob2_crate_m', 'a medium stack of wooden crates and a sack'],
  ['ob2_vine_b', 'a HUGE tangle of thorny vines with big leaves, epic scale'],
  ['ob2_ruin_b', 'a HUGE broken ancient stone pillar ruin, mossy, epic scale'],
  ['ob2_thorn_m', 'a medium cluster of purple thorny brambles'],
];
const start = parseInt(process.argv[2] || '0', 10);
let ok = 0, fail = 0;
for (let i = start; i < ITEMS.length; i++) {
  const [id, desc] = ITEMS[i];
  const raw = `${TMP}/${id}_raw.png`, mat = `${TMP}/${id}_mat.png`, fin = `${TMP}/${id}.png`;
  if (fs.existsSync(`web/assets/${id}.png`)) { console.log(`[${i}] ${id} exists, skip`); continue; }
  let done = false;
  for (let att = 0; att < 3 && !done; att++) {
    try {
      execFileSync('node', [DRIVER, 'image', `${desc}, ${STYLE}`, '--model', 'agnes-image-2.0-flash', '--size', '1024x1024', '--output', raw], { stdio: 'inherit', timeout: 300000 });
      execFileSync('node', ['tools_matte.mjs', raw, mat], { stdio: 'inherit' });
      execFileSync('node', ['tools_trim.mjs', mat, fin, '8'], { stdio: 'inherit' });
      fs.copyFileSync(fin, `web/assets/${id}.png`);
      fs.copyFileSync(fin, `assets/${id}.png`);
      done = true; ok++;
      console.log(`[${i + 1}/${ITEMS.length}] ${id} OK`);
    } catch (e) { console.log(`[${i}] ${id} attempt ${att + 1} failed: ${e.message.slice(0, 120)}`); }
  }
  if (!done) fail++;
}
console.log(`DONE ok=${ok} fail=${fail}`);
