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
  { id: 'bgm_main', type: 'music', secs: 120, prompt: '休闲娱乐小游戏背景音效,无人声,无哼唱,轻松欢快' },
  { id: 'bgm_boss', type: 'music', secs: 120, prompt: '休闲娱乐小游戏背景音效,无人声,无哼唱,轻松欢快,稍紧张的Boss战版本' },
  { id: 'spawn_horn', type: 'sfx', secs: 3, prompt: '小程序游戏,怪物出场,小号乐器,战争号角,无人声,无哼唱' },
  { id: 'wave',     type: 'sfx', secs: 3, prompt: '纯音乐音效,游戏波次开始的短促上扬小号信号音,无人声,无歌词,无数拍,无哼唱' },
  { id: 'boss',     type: 'sfx', secs: 5, prompt: '纯音乐音效,巨兽出场的低沉号角与战鼓,威胁感,无人声,无歌词,无数拍,无哼唱' },
  { id: 'spawn_boss', type: 'sfx', secs: 4, prompt: '纯音效,低沉轰鸣与战鼓,巨物登场压迫感,无人声,无歌词,无数拍,无哼唱' },
  { id: 'win',      type: 'sfx', secs: 6, prompt: '纯音乐音效,欢快小号凯旋短乐句,可爱游戏胜利,无人声,无歌词,无数拍,无哼唱' },
  { id: 'lose',     type: 'sfx', secs: 5, prompt: '纯音乐音效,悲伤下行长号短乐句,卡通游戏失败,无人声,无歌词,无数拍,无哼唱' },
  { id: 'die_boss', type: 'sfx', secs: 4, prompt: '纯音效,巨大爆炸轰响与低音冲击,无人声,无歌词,无数拍,无哼唱' },
];

async function genMusic(item) {
  const url = 'https://api.minimaxi.com/v1/music_generation' + (groupId ? `?GroupId=${groupId}` : '');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'music-2.5', prompt: item.prompt, lyrics: item.lyrics || (item.type === 'music' ? '[intro]\n[inst]\n[outro]' : '[intro]'), audio_setting: { sample_rate: 44100, bitrate: 128000, format: 'mp3' } }),
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
    const { execFileSync } = await import('child_process');
    if (item.type === 'music') {
      // BGM:交叉淡化自拼 3 遍成长循环,再截到目标时长(游戏里 loop 播放)
      const dur = parseFloat(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','csv=p=0', rawf]).toString());
      const body = Math.max(4, dur - 1);
      execFileSync('ffmpeg', ['-y','-v','error','-i', rawf,'-i', rawf,'-i', rawf,
        '-filter_complex', `[0][1]acrossfade=d=2:c1=tri:c2=tri[a01];[a01][2]acrossfade=d=2:c1=tri:c2=tri[aa];[aa]atrim=0:${item.secs},afade=t=out:st=${item.secs-2}:d=2,loudnorm=I=-18[o]`,
        '-map','[o]', out]);
      void body;
    } else {
      // 音效:截短 + 尾部淡出 + 响度统一
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', rawf,
        '-af', `silenceremove=start_periods=1:start_threshold=-40dB,atrim=0:${item.secs},afade=t=out:st=${Math.max(0, item.secs - 0.8)}:d=0.8,loudnorm=I=-18`, out]);
    }
    fs.unlinkSync(rawf);
    console.log(`${item.id} OK (${(fs.statSync(out).size / 1024).toFixed(0)}KB, ${item.secs}s)`);
    ok++;
  } catch (e) { console.error(`${item.id} FAIL: ${e.message.slice(0, 200)}`); fail++; }
}
console.log(`DONE ok=${ok} fail=${fail} → ${OUT}/`);
