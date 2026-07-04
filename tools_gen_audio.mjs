/* MiniMax 音频生成管线:BGM(音乐) + 关键音效(短乐句/音效)。
 * 需要 key:把 MiniMax API Key 写入 tools/secrets/minimax.key(纯 key 一行;
 *          若需 GroupId,写成  <groupId>:<apiKey>  一行)。
 * 用法: node tools_gen_audio.mjs           # 全部生成(已存在的跳过)
 *       node tools_gen_audio.mjs bgm_main  # 只生成指定条目
 * 产物: web/assets/audio/<name>.mp3(游戏端自动优先用文件,缺文件回退合成音)。 */
import fs from 'fs';
import path from 'path';

const KEY_FILE = 'tools/secrets/minimax.key';
if (!fs.existsSync(KEY_FILE)) {
  console.error(`缺少 ${KEY_FILE} — 请把 MiniMax API Key 写进去(可选格式 <groupId>:<apiKey>)`);
  process.exit(1);
}
const rawKey = fs.readFileSync(KEY_FILE, 'utf8').trim();
const [groupId, apiKey] = rawKey.includes(':') ? rawKey.split(':') : [null, rawKey];
const OUT = 'web/assets/audio'; fs.mkdirSync(OUT, { recursive: true });

/* 条目:type=music 走 music_generation(BGM/长音);type=sfx 也走 music 但只要几秒,截短。 */
const ITEMS = [
  { id: 'bgm_main', type: 'music', secs: 60, prompt: '轻快可爱的森林冒险游戏背景音乐,八音盒+木笛+轻打击乐,循环感强,无人声,活泼但不吵闹' },
  { id: 'bgm_boss', type: 'music', secs: 45, prompt: '紧张激烈的Boss战斗背景音乐,急促鼓点+铜管+弦乐,压迫感强,无人声' },
  { id: 'wave',     type: 'sfx', secs: 3, prompt: '游戏波次开始号角,短促上扬的小号信号音,单音效' },
  { id: 'boss',     type: 'sfx', secs: 5, prompt: '巨兽出场低沉号角与战鼓,威胁感,单音效' },
  { id: 'spawn_boss', type: 'sfx', secs: 4, prompt: '巨大怪物咆哮低吼,单音效' },
  { id: 'win',      type: 'sfx', secs: 6, prompt: '关卡胜利欢快小号凯旋乐句,可爱游戏风,单音效' },
  { id: 'lose',     type: 'sfx', secs: 6, prompt: '关卡失败悲伤下行长号乐句,卡通风,单音效' },
  { id: 'die_boss', type: 'sfx', secs: 4, prompt: '巨大爆炸伴随怪物倒地轰响,单音效' },
];

async function genMusic(item) {
  const url = 'https://api.minimaxi.com/v1/music_generation' + (groupId ? `?GroupId=${groupId}` : '');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'music-1.5', prompt: item.prompt, lyrics: item.lyrics || '[intro]', audio_setting: { sample_rate: 44100, bitrate: 128000, format: 'mp3' } }),
  });
  const j = await res.json();
  const hex = j?.data?.audio;                       // hex 编码 mp3
  if (!hex) throw new Error('no audio in response: ' + JSON.stringify(j).slice(0, 300));
  return Buffer.from(hex, 'hex');
}

const only = process.argv[2];
let ok = 0, fail = 0;
for (const item of ITEMS) {
  if (only && item.id !== only) continue;
  const out = path.join(OUT, `${item.id}.mp3`);
  if (!only && fs.existsSync(out)) { console.log(`${item.id} 已存在,跳过`); continue; }
  try {
    const buf = await genMusic(item);
    const rawf = out + '.raw.mp3';
    fs.writeFileSync(rawf, buf);
    // 截到目标时长 + 尾部淡出(音效不要拖) + 响度统一
    const { execFileSync } = await import('child_process');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', rawf, '-t', String(item.secs),
      '-af', `afade=t=out:st=${Math.max(0, item.secs - 0.8)}:d=0.8,loudnorm=I=-18`, out]);
    fs.unlinkSync(rawf);
    console.log(`${item.id} OK (${(fs.statSync(out).size / 1024).toFixed(0)}KB, ${item.secs}s)`);
    ok++;
  } catch (e) { console.error(`${item.id} FAIL: ${e.message.slice(0, 200)}`); fail++; }
}
console.log(`DONE ok=${ok} fail=${fail} → ${OUT}/`);
