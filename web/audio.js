/* =========================================================================
 * 声音引擎 — WebAudio 程序化合成音效 + BGM 文件播放。
 * 优先播放 assets/audio/<name>.mp3(MiniMax 生成的成品);缺文件时用内置合成音,保证游戏一定有声。
 * 消费引擎的 state.sounds 事件队列。window.SND 全局单例。
 * ========================================================================= */
window.SND = (function () {
  let ctx = null, master = null, muted = false, bgmEl = null, bgmName = '';
  // 音量/开关(由设置面板通过 config() 控制;默认音乐 30%、音效 27%)
  let musicOn = true, sfxOn = true, musicVol = 0.30, sfxVol = 0.27;
  const sfxGain = () => 0.25 * sfxVol, bgmVol = () => 0.35 * musicVol;
  const buffers = {};          // 已加载的 mp3 → AudioBuffer
  const lastPlay = {};         // 限频
  try { muted = localStorage.getItem('wttl_mute') === '1'; } catch (e) {}

  function ac() {
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = sfxGain(); master.connect(ctx.destination); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // 首次用户手势解锁音频(浏览器策略)
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { ac(); tryBgm(); }, { once: true, capture: true });

  // ---------- 文件音效(MiniMax 成品,存在则优先) ----------
  const fileTried = {};
  function fileBuf(name, cb) {
    if (buffers[name] !== undefined) return cb(buffers[name]);
    if (fileTried[name]) return cb(null);
    fileTried[name] = 1; buffers[name] = null;
    fetch(`assets/audio/${name}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((ab) => ac().decodeAudioData(ab)).then((b) => { buffers[name] = b; cb(b); }).catch(() => cb(null));
  }

  // ---------- 合成音效配方 ----------
  function tone(fa, fb, dur, type, vol, delay) {   // 扫频振荡器
    const c = ac(), o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + (delay || 0);
    o.type = type || 'sine'; o.frequency.setValueAtTime(fa, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, fb), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, fa, fb, delay) {        // 滤波噪声(爆炸/碎裂/风声)
    const c = ac(), n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = b;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; const t0 = c.currentTime + (delay || 0);
    f.frequency.setValueAtTime(fa || 1200, t0); f.frequency.exponentialRampToValueAtTime(Math.max(60, fb || 200), t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t0);
  }
  function arp(freqs, step, dur, type, vol) { freqs.forEach((f, i) => tone(f, f, dur, type || 'triangle', vol, i * step)); }

  const RECIPES = {
    shoot_single:   () => tone(900, 500, 0.07, 'square', 0.10),
    shoot_pierce:   () => { tone(1500, 700, 0.08, 'square', 0.10); noise(0.06, 0.10, 3000, 900); },
    shoot_splash:   () => { tone(170, 60, 0.16, 'sine', 0.22); noise(0.12, 0.10, 700, 150); },
    shoot_slow:     () => tone(1300, 1700, 0.10, 'triangle', 0.08),
    shoot_frostnova:() => tone(1200, 1800, 0.14, 'triangle', 0.09),
    shoot_poison:   () => tone(320, 150, 0.12, 'sine', 0.12),
    shoot_poisonsplash: () => tone(300, 120, 0.16, 'sine', 0.12),
    shoot_chain:    () => { tone(2200, 300, 0.09, 'sawtooth', 0.08); },
    shoot_arcanechain: () => { tone(1800, 500, 0.11, 'sawtooth', 0.08); },
    shoot_burn:     () => noise(0.18, 0.12, 1600, 500),
    shoot_arcane:   () => { tone(660, 660, 0.12, 'sine', 0.08); tone(990, 990, 0.12, 'sine', 0.06, 0.02); },
    die:            () => tone(420, 90, 0.12, 'sine', 0.14),
    die_boss:       () => { noise(0.55, 0.30, 1000, 80); tone(130, 40, 0.5, 'sine', 0.25); },
    leak:           () => { tone(240, 240, 0.09, 'square', 0.16); tone(180, 180, 0.12, 'square', 0.16, 0.11); },
    wave:           () => arp([330, 392, 494], 0.09, 0.22, 'triangle', 0.14),
    boss:           () => { tone(110, 98, 0.7, 'sawtooth', 0.20); tone(55, 49, 0.7, 'sawtooth', 0.16, 0.05); noise(0.5, 0.08, 400, 100, 0.1); },
    spawn_horn:     () => { tone(392, 392, 0.5, 'sawtooth', 0.14); tone(523, 523, 0.6, 'sawtooth', 0.13, 0.25); tone(659, 659, 0.9, 'sawtooth', 0.14, 0.55); },   // 战争号角(缺文件时的合成兜底)
    waveclear:      () => arp([523, 659, 784], 0.07, 0.18, 'triangle', 0.12),
    spawn_normal:   () => tone(500, 700, 0.08, 'triangle', 0.08),
    spawn_fast:     () => tone(800, 1400, 0.10, 'triangle', 0.08),
    spawn_fly:      () => { tone(900, 1100, 0.05, 'sine', 0.07); tone(1100, 900, 0.05, 'sine', 0.07, 0.06); tone(900, 1100, 0.05, 'sine', 0.06, 0.12); },
    spawn_heavy:    () => { noise(0.12, 0.16, 300, 80); tone(90, 60, 0.14, 'sine', 0.18, 0.02); },
    spawn_boss:     () => { tone(75, 60, 0.5, 'sawtooth', 0.22); noise(0.35, 0.14, 300, 70, 0.06); },
    build:          () => { noise(0.08, 0.12, 1200, 400); tone(520, 380, 0.10, 'square', 0.10, 0.05); },
    upgrade:        () => arp([392, 494, 587, 784], 0.06, 0.14, 'triangle', 0.11),
    branch:         () => arp([392, 494, 587, 784, 988], 0.06, 0.16, 'triangle', 0.12),
    sell:           () => arp([700, 500, 350], 0.06, 0.12, 'triangle', 0.10),
    coin:           () => { tone(1320, 1320, 0.07, 'sine', 0.12); tone(1760, 1760, 0.10, 'sine', 0.10, 0.06); },
    ob_break:       () => { noise(0.25, 0.18, 900, 120); tone(200, 90, 0.15, 'sine', 0.10); },
    net:            () => { noise(0.14, 0.10, 2400, 800); tone(600, 300, 0.12, 'triangle', 0.08, 0.05); },
    burst:          () => { tone(880, 220, 0.25, 'sawtooth', 0.12); noise(0.2, 0.10, 1500, 300, 0.03); },
    win:            () => arp([523, 659, 784, 1047, 1319], 0.11, 0.4, 'triangle', 0.16),
    lose:           () => { arp([392, 349, 311, 262], 0.16, 0.42, 'sawtooth', 0.10); tone(98, 65, 0.9, 'sine', 0.12, 0.2); },
  };
  const MIN_GAP = { default: 130, shoot: 75, die: 60 };   // 同名限频(ms)

  function play(name) {
    if (muted || !sfxOn) return;
    const now = performance.now();
    const cls = name.startsWith('shoot_') ? 'shoot' : (name === 'die' ? 'die' : 'default');
    const gap = MIN_GAP[cls];
    if (lastPlay[name] && now - lastPlay[name] < gap) return;
    lastPlay[name] = now;
    try {
      fileBuf(name, (buf) => {
        if (buf) { const c = ac(), src = c.createBufferSource(); src.buffer = buf; const g = c.createGain();
          const t0 = c.currentTime; g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.8, t0 + 0.03);   // 淡入防爆音(文件尾部已在生成时淡出)
          src.connect(g); g.connect(master); src.start(t0); }
        else if (RECIPES[name]) RECIPES[name]();
      });
    } catch (e) {}
  }
  function consume(state) { if (!state || !state.sounds) return; for (const n of state.sounds) play(n); state.sounds.length = 0; }

  // ---------- BGM(仅文件,MiniMax 生成后自动生效) ----------
  function tryBgm() { if (bgmName) bgm(bgmName); }
  function fadeEl(el, to, ms, done) {        // <audio> 音量线性渐变
    const from = el.volume, t0 = performance.now();
    (function step() {
      if (!el.parentNode && el.paused && to > 0) return;
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.volume = from + (to - from) * k;
      if (k < 1) requestAnimationFrame(step); else if (done) done();
    })();
  }
  function bgm(name) {                       // bgm('main') / bgm('boss') / bgm(null) 停;切换带淡入淡出
    bgmName = name;
    if (!name || muted || !musicOn) { if (bgmEl) { const old = bgmEl; bgmEl = null; fadeEl(old, 0, 500, () => old.pause()); } return; }
    if (bgmEl && bgmEl.dataset.name === name) return;
    if (bgmEl) { const old = bgmEl; fadeEl(old, 0, 600, () => old.pause()); }   // 旧曲淡出
    bgmEl = new Audio(`assets/audio/bgm_${name}.mp3`); bgmEl.dataset.name = name; bgmEl.loop = true; bgmEl.volume = 0;
    const el = bgmEl;
    el.play().then(() => fadeEl(el, bgmVol(), 900)).catch(() => { if (bgmEl === el) bgmEl = null; });   // 新曲淡入;未解锁则静默
  }
  function setMuted(m) { muted = m; try { localStorage.setItem('wttl_mute', m ? '1' : '0'); } catch (e) {} if (m && bgmEl) { bgmEl.pause(); bgmEl = null; } else if (!m) tryBgm(); }
  function config(o) {   // {musicOn,sfxOn,musicVol(0-1),sfxVol(0-1)}
    if (o.musicOn != null) musicOn = o.musicOn;
    if (o.sfxOn != null) sfxOn = o.sfxOn;
    if (o.musicVol != null) musicVol = o.musicVol;
    if (o.sfxVol != null) sfxVol = o.sfxVol;
    if (master) master.gain.value = sfxGain();
    if (!musicOn) { if (bgmEl) { const old = bgmEl; bgmEl = null; fadeEl(old, 0, 400, () => old.pause()); } }
    else if (bgmEl) bgmEl.volume = bgmVol();
    else tryBgm();
  }
  return { play, consume, bgm, setMuted, isMuted: () => muted, config };
})();
