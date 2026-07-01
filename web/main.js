/* 横屏版（仿保卫萝卜）入口：复用 game/ 纯逻辑，套横屏 canvas 渲染 + 选关/解锁/进度。 */
(async function () {
  const mods = {};
  const req = (p) => mods[p.replace(/^\.\//, '').replace(/^\.\.\/game\//, '').replace(/\.js$/, '')];
  async function load(name) { const src = await (await fetch(`game/${name}.js`)).text(); const m = { exports: {} }; new Function('module', 'exports', 'require', src)(m, m.exports, req); mods[name] = m.exports; }
  await load('config'); await load('anim'); await load('levels'); await load('engine');
  const C = mods.config, ANIM = mods.anim, LV = mods.levels, E = mods.engine, THEME = LV.THEME_NAME;

  const cv = document.getElementById('game'), ctx = cv.getContext('2d');
  let tf, dpr = window.devicePixelRatio || 1;
  function resize() {
    const W = innerWidth, H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.min(W / C.VW, H / C.VH);
    tf = { scale, offX: (W - C.VW * scale) / 2, offY: (H - C.VH * scale) / 2, W, H };
  }
  addEventListener('resize', resize); resize();
  const vx = (x) => tf.offX + x * tf.scale, vy = (y) => tf.offY + y * tf.scale, vk = (s) => s * tf.scale;
  const toV = (sx, sy) => ({ x: (sx - tf.offX) / tf.scale, y: (sy - tf.offY) / tf.scale });

  const TKEYS = ['arrow', 'cannon', 'frost', 'poison', 'lightning', 'sniper', 'flame', 'arcane'];
  const TW = []; for (const k of TKEYS) for (let l = 1; l <= 3; l++) TW.push(`tw_${k}_${l}`);
  const ATKIMG = TKEYS.map((k) => `tw_${k}_atk`);   // 攻击动画精灵表(若已生成则加载)
  const ICONS = ['ic_upgrade', 'ic_sell', 'ic_branchA', 'ic_branchB', 'ic_coin', 'ic_heart', 'ic_speed', 'ic_menu'];
  const OBS = ['ob_rock', 'ob_crystal', 'ob_barrel', 'ob_stump'];
  const THEMES = ['grass', 'volcano', 'forest', 'ice', 'desert', 'swamp', 'cavern', 'sky'];
  const BG = THEMES.map((t) => 'b_' + t);
  const PORTALS = THEMES.map((t) => 'portal_' + t);                       // 8 主题怪物入口传送门
  const BASES = []; for (const t of THEMES) for (let s = 0; s < 3; s++) BASES.push(`base_${t}_${s}`);   // 每主题基地×3态(完好/残破/倒塌)
  const UIIMG = ['ic_play', 'ic_win', 'ic_lose', 'ic_star', 'ic_lock', 'logo_title'];        // 替代 emoji 的图标（Boss来袭用视频，无需 ic_boss）
  const FXIMG = ['fx_burst', 'fx_puff', 'fx_ring', 'fx_magic', 'fx_ice', 'fx_poison', 'fx_zap', 'fx_muzzle', 'fx_poof'];   // 图片化命中/攻击特效精灵
  const NUMIMG = ['num_0', 'num_1', 'num_2', 'num_3', 'num_4', 'num_5', 'num_6', 'num_7', 'num_8', 'num_9', 'num_slash', 'num_plus', 'num_x', 'num_dot', 'num_pct', 'num_dash'];  // 图片数字字体
  const CHESTIMG = ['chest_closed', 'ic_hand', 'sign_wood', 'frame_common', 'frame_rare', 'frame_epic', ...C.CHEST_ITEMS.map((it) => it.img)];  // 宝箱/引导美术
  const ENIMG = [...new Set(Object.values(C.ENEMIES).map((e) => e.img))];   // 每种怪的专属立绘 en_<key>
  const towerImg = (t) => `tw_${t.key}_${t.branch ? 3 : t.level + 1}`;   // 按等级取形象
  const IMG = {};
  await Promise.all([...TW, ...ATKIMG, ...ICONS, ...OBS, 'hero_ranger', ...ENIMG, ...BG, ...PORTALS, ...BASES, ...UIIMG, ...FXIMG, ...NUMIMG, ...CHESTIMG].map((k) => new Promise((r) => { const im = new Image(); im.onload = () => { IMG[k] = im; r(); }; im.onerror = () => r(); im.src = `assets/${k}.png`; })));
  // ---- 图片数字字体：把字符串渲染成字形图片 ----
  const CH2NUM = { '0': 'num_0', '1': 'num_1', '2': 'num_2', '3': 'num_3', '4': 'num_4', '5': 'num_5', '6': 'num_6', '7': 'num_7', '8': 'num_8', '9': 'num_9', '/': 'num_slash', '+': 'num_plus', '×': 'num_x', 'x': 'num_x', '·': 'num_dot', '%': 'num_pct', '-': 'num_dash', '−': 'num_dash' };
  function numHTML(str, h) {   // HTML: 一串字形 <img>
    return String(str).split('').map((c) => { const k = CH2NUM[c]; return k ? `<img class="ni" style="height:${h}px" src="assets/${k}.png">` : (c === ' ' ? `<span style="display:inline-block;width:${h * 0.3}px"></span>` : `<span>${c}</span>`); }).join('');
  }
  function setNum(id, val, h) { const el = $(id); if (el) el.innerHTML = numHTML(val, h || 20); }
  function drawNum(str, cx, cy, h, align) {   // 画布: 居中/左对齐画一串字形图
    const s = String(str); let tw = 0; const ws = [];
    for (const c of s) { const im = IMG[CH2NUM[c]]; if (im) { const w = h * im.width / im.height; ws.push({ im, w }); tw += w; } else { ws.push({ im: null, w: h * 0.3 }); tw += h * 0.3; } }
    let x = align === 'left' ? cx : cx - tw / 2;
    for (const g of ws) { if (g.im) ctx.drawImage(g.im, x, cy - h / 2, g.w, h); x += g.w; }
    return tw;
  }
  // 动画清单(由生成流水线产出): {tag:{asset,frames}}. tag=idle_<key>/atk_<key>. 决定哪些精灵表按帧动画。
  const ATK = {};   // key -> {asset, frames} 攻击动画
  try {
    const man = await (await fetch('assets/anim_manifest.json?' + Date.now())).json();
    for (const tag in man) {
      const { asset, frames } = man[tag];
      if (!IMG[asset] || !frames) continue;
      if (tag.startsWith('idle_')) ANIM[asset] = { frames, fps: 12 };          // 待机:全局时间循环
      else if (tag.startsWith('atk_')) { ANIM[asset] = { frames, fps: 24 }; ATK[tag.slice(4)] = { asset, frames }; }
    }
  } catch (e) { /* 清单不存在则全部走静态/已配置动画 */ }
  // 皮肤清单(生成流水线产出): { towerKey: [{id,name,gem}] }
  let SKINMAN = {};
  try { SKINMAN = await (await fetch('assets/skins/skins_manifest.json?' + Date.now())).json(); } catch (e) { SKINMAN = {}; }
  let menu = null;   // 就地环形菜单 {mode:'build'|'manage', x, y, towerId, items:[{img,label,sub,action,enabled}]}
  // #6 环境色调融合：给所有精灵套一层与该主题光照一致的轻度滤镜，使卡通角色"落"进画面
  // 暖色主题用 sepia+轻微 hue-rotate 统一暖调；冷色主题只调亮度/饱和，不旋转色相(避免角色变蓝失真)
  const THEME_GRADE = {
    grass:   'saturate(1.06) brightness(1.02)',
    volcano: 'sepia(.22) saturate(1.2) brightness(1.02) hue-rotate(-12deg)',
    forest:  'sepia(.12) saturate(1.04) brightness(.97) hue-rotate(6deg)',
    ice:     'saturate(.9) brightness(1.08) contrast(.98)',
    desert:  'sepia(.26) saturate(1.12) brightness(1.05) hue-rotate(-6deg)',
    swamp:   'sepia(.16) saturate(.92) brightness(.93) hue-rotate(28deg)',
    cavern:  'saturate(.96) brightness(.9) contrast(1.04)',
    sky:     'saturate(1.04) brightness(1.06)',
  };
  let grade = '';   // 当前关卡的色调滤镜

  const PKEY = 'wttl_prog';
  const prog = () => { try { const p = JSON.parse(localStorage.getItem(PKEY)) || {}; return { cleared: p.cleared || 0, seen: p.seen || [], stars: p.stars || {} }; } catch { return { cleared: 0, seen: [], stars: {} }; } };
  const save = (p) => localStorage.setItem(PKEY, JSON.stringify(p));
  const clear = (n, stars) => { const p = prog(); if (n > p.cleared) p.cleared = n; if (stars != null && stars > (p.stars[n] || 0)) p.stars[n] = stars; save(p); };
  // 星级：按剩余生命评定（满/半/破）
  const starsFor = (lives, startLives) => { const f = lives / (startLives || 20); return f >= 0.9 ? 3 : f >= 0.5 ? 2 : 1; };
  // 钻石经济：通关获得，商店购买皮肤消费
  const GKEY = 'wttl_gems';
  const gems = () => { try { return parseInt(localStorage.getItem(GKEY), 10) || 0; } catch { return 0; } };
  const setGems = (v) => localStorage.setItem(GKEY, String(Math.max(0, v | 0)));
  const addGems = (n) => { setGems(gems() + n); return gems(); };
  // 宝箱库存(持久化)：每局胜利 +1；钻石购买；看广告(接入微信后启用)。新玩家赠 1 个试玩。
  const CHKEY = 'wttl_chests', CHSEED = 'wttl_chests_seed', CHEST_PRICE = 20;
  const chestStock = () => { try { return parseInt(localStorage.getItem(CHKEY), 10) || 0; } catch { return 0; } };
  const setChestStock = (v) => localStorage.setItem(CHKEY, String(Math.max(0, v | 0)));
  const addChest = (n) => { setChestStock(chestStock() + n); return chestStock(); };
  if (!localStorage.getItem(CHSEED)) { localStorage.setItem(CHSEED, '1'); if (chestStock() === 0) setChestStock(1); }   // 首次赠箱
  const RARITY_CN = { common: '普通', rare: '稀有', epic: '史诗' };
  function rollChestItem() {
    const pool = C.CHEST_ITEMS, W = C.CHEST_RARITY_WEIGHT;
    let tot = 0; for (const it of pool) tot += (W[it.rarity] || 10);
    let r = Math.random() * tot;
    for (const it of pool) { r -= (W[it.rarity] || 10); if (r <= 0) return it; }
    return pool[0];
  }
  let chestMode = false;   // 放置宝箱模式：点击空地放置
  function updateChestBtn() {
    const inGame = !!state, n = chestStock();
    $('chestBtn').style.display = inGame ? 'flex' : 'none';
    setNum('chestNum', n, 15);
    $('chestBtn').style.outline = chestMode ? '3px solid #ffd23f' : 'none';
  }
  function toggleChestMode() {
    if (!state) return;
    if (chestMode) { chestMode = false; updateChestBtn(); return; }
    if (chestStock() <= 0) { openChestBuy(); return; }
    chestMode = true; updateChestBtn();
    state.floats.push({ x: C.VW / 2, y: 120, text: '点击空地放置宝箱', color: '#ffe27a', t: -0.6 });   // 提示(延迟淡出)
  }
  function showChestReveal(item) {
    $('crFrame').src = `assets/frame_${item.rarity}.png`;
    $('crItem').src = `assets/${item.img}.png`; $('crItem').style.display = '';
    $('crName').textContent = `${RARITY_CN[item.rarity] || ''} · ${item.name}`;
    $('crDesc').textContent = item.desc || '';
    const box = $('chestReveal'); box.style.display = 'flex';
    // 重新触发弹出动画
    const card = $('crCard'); card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    clearTimeout(showChestReveal._t); showChestReveal._t = setTimeout(() => { box.style.display = 'none'; }, 1900);
  }
  function openChestBuy() { chestMode = false; updateChestBtn(); $('chestBuy').style.display = 'flex'; }
  function closeChestBuy() { $('chestBuy').style.display = 'none'; }
  // 皮肤拥有/装备持久化：{ owned:{'arrow_royal':true}, equip:{arrow:'royal'} }
  const SKKEY = 'wttl_skins';
  const skinData = () => { try { return JSON.parse(localStorage.getItem(SKKEY)) || { owned: {}, equip: {} }; } catch { return { owned: {}, equip: {} }; } };
  const saveSkins = (d) => localStorage.setItem(SKKEY, JSON.stringify(d));
  const equippedSkin = (key) => { const e = skinData().equip[key]; return e && e !== 'default' ? e : null; };   // 皮肤id或null(默认)
  // 游戏内换装：懒加载已装备皮肤的待机/攻击精灵表并注册动画
  function ensureSkinSheets(k) {
    const id = equippedSkin(k); if (!id) return;
    for (const kind of ['idle', 'atk']) {
      const key = `sk${kind}_${k}_${id}`;
      if (key in IMG) continue;                       // 已尝试(成功=Image, 失败=null)
      IMG[key] = null;
      const im = new Image();
      im.onload = () => { IMG[key] = im; ANIM[key] = { frames: 16, fps: kind === 'idle' ? 12 : 24 }; };
      im.onerror = () => { IMG[key] = null; };
      im.src = `assets/skins/sheet_${kind}_${k}_${id}.png`;
    }
  }

  let state = null, level = null, anim = 0, speed = 1, popupSlot = -1, unlockQ = [];
  let baseHitAt = -99, lastLives = null, cutBusy = false, paused = false;   // 基地受击时刻 / 上帧生命 / 过场播放中 / 手动暂停
  const $ = (id) => document.getElementById(id);

  /* ---------- 选关（蜿蜒地图，每章=1主题=5关） ---------- */
  const GROUPS = LV.THEME_GROUPS;                       // 8 主题
  const PER = 5;                                        // 每主题 5 关
  // 5 个节点在 1280×720 viewBox 内的蛇形锚点
  const NODEPTS = [[170, 560], [430, 300], [640, 545], [860, 285], [1120, 520]];
  let chapter = 0;
  function smoothPath(pts) {                            // 经过各点的平滑曲线
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], mx = (x0 + x1) / 2;
      d += ` C ${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
    }
    return d;
  }
  function showMenu() {
    state = null; grade = ''; hideScreens(); $('menu').style.display = 'flex';
    const p = prog(); chapter = Math.min(GROUPS.length - 1, Math.floor(Math.min(p.cleared, 39) / PER));   // 默认打开当前进度所在章
    renderChapters(); renderChapter();
  }
  function renderChapters() {
    const p = prog(), ch = $('chapters'); ch.innerHTML = '';
    GROUPS.forEach((th, i) => {
      const reached = i * PER + 1 <= p.cleared + 1;      // 该章首关是否已可达
      const d = document.createElement('div');
      d.className = 'chap' + (chapter === i ? ' on' : '') + (reached ? '' : ' lock');
      d.innerHTML = (reached ? '' : '<img src="assets/ic_lock.png" onerror="this.style.display=\'none\'" style="width:13px;height:13px;object-fit:contain;vertical-align:middle;margin-right:3px">') + THEME[th];
      if (reached) d.onclick = () => { chapter = i; renderChapters(); renderChapter(); };
      ch.appendChild(d);
    });
  }
  function renderChapter() {
    const p = prog(), th = GROUPS[chapter];
    $('mapTitle').textContent = `第${'一二三四五六七八'[chapter]}章 · ${THEME[th]}`;
    setNum('mapCleared', p.cleared, 18);
    $('mapArea').style.backgroundImage = `url(assets/b_${th}.png)`;
    $('mapPath').setAttribute('d', smoothPath(NODEPTS));
    const box = $('mapNodes'); box.innerHTML = '';
    for (let k = 0; k < PER; k++) {
      const n = chapter * PER + k + 1;
      const cleared = n <= p.cleared, current = n === p.cleared + 1, locked = n > p.cleared + 1;
      const [vX, vY] = NODEPTS[k];
      const el = document.createElement('div');
      el.className = 'node ' + (cleared ? 'cleared' : current ? 'current' : 'locked');
      el.style.left = (vX / 1280 * 100) + '%'; el.style.top = (vY / 720 * 100) + '%';
      let inner = '';
      if (cleared) { const st = p.stars[n] || 1; inner += `<div class="stars">${[1,2,3].map((i)=>`<img src="assets/ic_star.png" class="${i<=st?'on':'off'}" onerror="this.style.display='none'">`).join('')}</div>`; }
      if (current) inner += `<div class="badge">当前</div>`;
      const face = locked ? `<img class="lk" src="assets/ic_lock.png" onerror="this.textContent='🔒'">` : (n);
      inner += `<div class="disc">${face}</div>`;
      el.innerHTML = inner;
      if (!locked) el.onclick = () => startLevel(n);
      box.appendChild(el);
    }
    const cur = Math.min(40, p.cleared + 1);
    const cta = $('mapCta'); cta.textContent = `进入 第 ${cur} 关 →`;
    cta.onclick = () => startLevel(cur);
  }

  /* ---------- 首页（入口） ---------- */
  const ATKDESC = { single: '单体物理', splash: '范围溅射', slow: '减速冰冻', poison: '持续中毒', chain: '闪电连锁', pierce: '穿透狙击', burn: '范围灼烧', arcane: '真伤奥术' };
  function hideScreens() { for (const id of ['menu', 'home', 'shop', 'codex', 'settings', 'overlay', 'popup']) $(id).style.display = 'none'; updateChestBtn(); }
  function showHome() {
    state = null; grade = ''; hideScreens();
    $('home').style.display = 'block'; $('home').style.backgroundImage = 'url(assets/bg_home.png)';
    const p = prog(); $('hContSub').textContent = '上次进度 · 第 ' + Math.min(40, p.cleared + 1) + ' 关';
    setNum('homeGems', gems(), 22);
  }

  /* ---------- 商店（角色特色皮肤：钻石购买 + 装备） ---------- */
  let shopChar = 'arrow', shopSel = 'default';
  function showShop() { hideScreens(); $('shop').style.display = 'block'; shopSel = 'default'; renderShop(); }
  // 某角色的皮肤列表：default + 清单皮肤(缺图由 onerror 兜底，生成后自动显示)
  function skinsOf(k) { return [{ id: 'default', name: '默认', gem: 0 }].concat(SKINMAN[k] || []); }
  function skinImg(k, id) { return id === 'default' ? `assets/tw_${k}_s3.png` : `assets/skins/tw_${k}_${id}.png`; }
  function renderShop() {
    setNum('shopGems', gems(), 20);
    const sd = skinData();
    // 角色选择行
    const cbar = $('shopChars'); cbar.innerHTML = '';
    C.TOWER_KEYS.forEach((k) => {
      const el = document.createElement('div'); el.className = 'shopChar' + (k === shopChar ? ' on' : '');
      el.innerHTML = `<img src="assets/tw_${k}_1.png" onerror="this.style.display='none'">`;
      el.onclick = () => { shopChar = k; shopSel = 'default'; renderShop(); };
      cbar.appendChild(el);
    });
    // 皮肤网格
    const list = skinsOf(shopChar), grid = $('shopGrid'); grid.innerHTML = '';
    list.forEach((s) => {
      const owned = s.id === 'default' || sd.owned[`${shopChar}_${s.id}`];
      const equipped = (sd.equip[shopChar] || 'default') === s.id;
      const el = document.createElement('div'); el.className = 'skin' + (s.id === shopSel ? ' sel' : '');
      const tag = equipped ? '<div class="sktag eq">已装备</div>' : owned ? '<div class="sktag own">已拥有</div>'
        : `<div class="sktag buy"><img src="assets/ic_gem.png" onerror="this.style.display='none'" style="width:11px;height:11px;vertical-align:-1px"> ${s.gem}</div>`;
      el.innerHTML = `<img class="skthumb" src="${skinImg(shopChar, s.id)}" onerror="this.src='assets/tw_${shopChar}_1.png'"><div class="sknm">${s.name}</div>${tag}`;
      el.onclick = () => { shopSel = s.id; renderShop(); };
      grid.appendChild(el);
    });
    renderShopPreview();
  }
  function renderShopPreview() {
    const k = shopChar, id = shopSel, d = C.TOWERS[k], sd = skinData();
    const s = id === 'default' ? { id: 'default', name: '默认', gem: 0 } : (SKINMAN[k] || []).find((x) => x.id === id) || { id, name: id, gem: 0 };
    const owned = id === 'default' || sd.owned[`${k}_${id}`];
    const equipped = (sd.equip[k] || 'default') === id;
    // 预览优先用待机 gif（透明），无则静态立绘
    const gif = id === 'default' ? '' : `assets/skins/idle_${k}_${id}.gif`;
    const still = skinImg(k, id);
    const previewImg = gif
      ? `<img class="spimg" src="${gif}" onerror="this.onerror=null;this.src='${still}'">`
      : `<img class="spimg" src="${still}" onerror="this.src='assets/tw_${k}_1.png'">`;
    let btn;
    if (equipped) btn = `<div class="spbuy e">已装备</div>`;
    else if (owned) btn = `<div class="spbuy q" id="spEquip">装备</div>`;
    else btn = `<div class="spbuy g" id="spBuy"><img src="assets/ic_gem.png" onerror="this.style.display='none'" style="width:18px;height:18px;vertical-align:-3px"> ${s.gem} · 购买</div>`;
    $('shopPreview').innerHTML =
      `<div class="spname">${d.name} · 皮肤</div><div class="sptitle">${s.name}</div>` +
      previewImg +
      `<div class="spdesc">${ATKDESC[d.attack] || ''} · 仅改变外观，属性不变<br>${id === 'default' ? '守卫默认外观' : '专属待机/攻击动画 · <b style="color:#ffe27a">升到终极形态后生效</b>'}</div>` +
      btn;
    const buy = $('spBuy'); if (buy) buy.onclick = () => {
      if (gems() < s.gem) { buy.textContent = '钻石不足'; return; }
      addGems(-s.gem); const d2 = skinData(); d2.owned[`${k}_${id}`] = true; d2.equip[k] = id; saveSkins(d2); renderShop();
    };
    const eq = $('spEquip'); if (eq) eq.onclick = () => { const d2 = skinData(); d2.equip[k] = id; saveSkins(d2); renderShop(); };
  }

  /* ---------- 图鉴（守卫/怪物/Boss） ---------- */
  let dexTab = 'guard', dexSel = 0;
  function showCodex() { hideScreens(); $('codex').style.display = 'block'; dexTab = 'guard'; dexSel = 0; renderCodex(); }
  function dexList() {
    const p = prog();
    if (dexTab === 'guard') return C.TOWER_KEYS.map((k) => ({ k, name: C.TOWERS[k].name, img: `tw_${k}_1`, un: C.TOWERS[k].unlock <= p.cleared + 1 }));
    const boss = dexTab === 'boss';
    return Object.keys(C.ENEMIES).filter((k) => !!C.ENEMIES[k].boss === boss)
      .map((k) => ({ k, name: C.ENEMIES[k].name, img: C.ENEMIES[k].img, un: (C.ENEMIES[k].unlock || 1) <= p.cleared + 1 }));
  }
  function renderCodex() {
    const tabs = [['guard', '守卫'], ['mob', '怪物'], ['boss', 'Boss']], tb = $('dexTabs'); tb.innerHTML = '';
    tabs.forEach(([id, lbl]) => { const el = document.createElement('div'); el.className = 'dxtab' + (dexTab === id ? ' on' : ''); el.textContent = lbl; el.onclick = () => { dexTab = id; dexSel = 0; renderCodex(); }; tb.appendChild(el); });
    const list = dexList(), unlocked = list.filter((x) => x.un).length;
    $('dexCount').textContent = `已收集 ${unlocked} / ${list.length}`;
    const grid = $('dexGrid'); grid.innerHTML = '';
    list.forEach((it, i) => {
      const el = document.createElement('div'); el.className = 'dexcell' + (i === dexSel ? ' sel' : '') + (it.un ? '' : ' lock');
      el.innerHTML = it.un ? `<div class="dc"><img src="assets/${it.img}.png" onerror="this.style.display='none'"></div><div class="dcn">${it.name}</div>` : `<div class="dc">?</div><div class="dcn">未解锁</div>`;
      if (it.un) el.onclick = () => { dexSel = i; renderCodex(); };
      grid.appendChild(el);
    });
    const it = list[dexSel] || list[0], det = $('dexDetail');
    if (!it || !it.un) { det.innerHTML = '<div class="dxdesc" style="margin:auto">未解锁 · 通关更多关卡以收集</div>'; return; }
    if (dexTab === 'guard') {
      const d = C.TOWERS[it.k], b = d.levels[0], aps = 1 / b.rate;   // 1级基础属性
      const stats = statBars([
        ['ic_atk', '攻击', b.dmg, b.dmg / 60, '#ff8a5a'],
        ['ic_range', '射程', b.range, b.range / 260, '#7ad4f7'],
        ['ic_speed', '攻速', aps.toFixed(1) + '/s', aps / 3, '#ffd868'],
      ]);
      det.innerHTML = `<div class="dxcat">防御塔</div><div class="dxname">${d.name}</div>` +
        `<div class="dxtags"><span>${ATKDESC[d.attack] || ''}</span><span>第${d.unlock}关解锁</span><span>造价${d.cost}</span></div>` +
        `<div class="dxevo"><img src="assets/tw_${it.k}_1.png"><span>→</span><img src="assets/tw_${it.k}_2.png"><span>→</span><img src="assets/tw_${it.k}_s3.png"></div>` +
        stats +
        `<div class="dxdesc">满级二选一专精：「${d.branches.A.name}」${d.branches.A.desc} / 「${d.branches.B.name}」${d.branches.B.desc}</div>`;
    } else {
      const e = C.ENEMIES[it.k];
      const feats = [e.fly && '飞行', e.split && '分裂', e.heal && '治疗', e.boss && '首领'].filter(Boolean).join(' · ') || '普通';
      const stats = statBars([
        ['ic_heart', '血量', e.hp, e.hp / 220, '#ff5a5a'],
        ['ic_speed', '速度', e.speed, e.speed / 160, '#7ad4f7'],
        ['ic_def', '护甲', e.armor || 0, (e.armor || 0) / 6, '#9aa6b0'],
        ['ic_coin', '金币', e.gold, e.gold / 10, '#ffd868'],
      ]);
      det.innerHTML = `<div class="dxcat">${dexTab === 'boss' ? 'Boss' : '怪物'}</div><div class="dxname">${e.name}</div>` +
        `<div class="dxtags"><span>${feats}</span></div>` +
        `<div class="dxevo"><img src="assets/${e.img}.png" style="width:96px;height:96px"></div>` +
        stats +
        `<div class="dxdesc">${dexTab === 'boss' ? '强大的关底首领，抵达基地扣 5 点生命；血量随关卡提升。' : '沿路径进攻基地的敌人，抵达基地扣 1 点生命，击杀获得金币。'}</div>`;
    }
  }
  function statBars(rows) {   // rows: [iconKey, 标签, 数值, 占比0~1, 颜色]
    return '<div class="dxstats">' + rows.map(([ic, lb, val, frac, col]) =>
      `<div class="dxstat"><div class="sl"><img src="assets/${ic}.png" onerror="this.style.display='none'">${lb}</div>` +
      `<div class="sbarwrap"><div class="sbar" style="width:${Math.max(4, Math.min(100, frac * 100))}%;background:${col}"></div></div>` +
      `<div class="sv">${val}</div></div>`).join('') + '</div>';
  }
  function startLevel(n) {
    level = LV.buildLevel(n); state = E.createState(level); anim = 0; speed = 1; setNum('speedNum', 1, 14);
    grade = THEME_GRADE[level.theme] || ''; setPaused(false); chestMode = false;
    baseHitAt = -99; lastLives = null;
    popupSlot = -1; for (const k in hud) delete hud[k];
    level.towers.forEach(ensureSkinSheets);   // 预载已装备皮肤精灵表
    hideScreens();   // 隐藏首页/选关/商店/图鉴/设置等一切界面
    // 解锁说明 (#9)：本关新解锁、且没看过的塔
    const p = prog(); unlockQ = level.towers.filter((k) => C.TOWERS[k].unlock === n && !p.seen.includes(k));
    // 开场过场视频（缺失则立即跳过），播完再弹解锁说明
    playCut('cut_start', level.name, showNextUnlock);
  }
  function showNextUnlock() {
    if (!unlockQ.length) { $('unlock').style.display = 'none'; tutStart(level.id); return; }
    const k = unlockQ[0], d = C.TOWERS[k];
    $('uImg').src = `assets/${d.img}.png`; $('uName').textContent = '新守卫 · ' + d.name;
    const ad = { single: '直线单体远程攻击', splash: '范围溅射爆炸', slow: '减速冰冻', poison: '持续中毒', chain: '闪电连锁多目标', pierce: '超远穿透狙击', burn: '范围灼烧', arcane: '无视护甲奥术' }[d.attack] || '';
    $('uDesc').innerHTML = `${ad} · 造价 <img class="hud-ic" src="assets/ic_coin.png">${d.cost}`; $('unlock').style.display = 'flex';
  }
  $('uOk').onclick = () => { const p = prog(); if (unlockQ[0] && !p.seen.includes(unlockQ[0])) { p.seen.push(unlockQ[0]); save(p); } unlockQ.shift(); showNextUnlock(); };

  /* ---------- 绘制 ---------- */
  function shadow(cx, cy, rw) { ctx.save(); ctx.beginPath(); ctx.ellipse(vx(cx), vy(cy), vk(rw), vk(rw * 0.42), 0, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill(); ctx.restore(); }
  function drawSprite(key, cx, cy, h, foot, opt) {
    const im = IMG[key]; if (!im) return; const a = ANIM[key]; let sx = 0, sw = im.width, sh = im.height;
    if (a && a.frames > 1) { sw = im.width / a.frames; const fr = (opt && opt.frame != null) ? (opt.frame % a.frames) : (Math.floor(anim * a.fps) % a.frames); sx = fr * sw; }
    const sq = opt && opt.squash ? opt.squash : 1, H = vk(h) * sq, Wd = vk(h) * (sw / sh) * (opt && opt.flash ? 1.04 : 1);
    ctx.save(); ctx.filter = (opt && opt.flash) ? 'brightness(2.6) saturate(.4)' : (grade || 'none');
    if (opt && opt.flip) { const X = vx(cx); ctx.translate(X, 0); ctx.scale(-1, 1); ctx.translate(-X, 0); }   // 水平镜像(朝向目标)
    ctx.drawImage(im, sx, 0, sw, sh, vx(cx) - Wd / 2, vy(cy) - H * (foot == null ? 0.82 : foot), Wd, H);
    ctx.restore();
  }
  // 怪物身上的持续状态层（冰冻/中毒/灼烧）
  function statusOverlay(e) {
    const X = vx(e.x), Y = vy(e.y) - vk(e.def.size * 0.42), R = vk(e.def.size * 0.42);
    if (e.slowT > 0) {                       // 冰冻：包裹的冰晶 + 蓝色调
      ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#bfefff';
      for (let i = 0; i < 5; i++) { const a = i * 1.256 + e.id; ctx.beginPath(); const px = X + Math.cos(a) * R * 0.8, py = Y + Math.sin(a) * R * 0.8; ctx.moveTo(px, py - vk(6)); ctx.lineTo(px - vk(3.5), py + vk(4)); ctx.lineTo(px + vk(3.5), py + vk(4)); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 0.22; ctx.beginPath(); ctx.arc(X, Y, R, 0, 7); ctx.fillStyle = '#7fd4ef'; ctx.fill(); ctx.restore();
    }
    if (e.poisonT > 0) {                     // 中毒：上升绿泡
      ctx.save(); ctx.fillStyle = 'rgba(140,230,90,.8)';
      for (let i = 0; i < 3; i++) { const ph = (anim * 1.5 + i * 0.6 + e.id) % 1; ctx.globalAlpha = (1 - ph) * 0.8; ctx.beginPath(); ctx.arc(X + Math.sin(i * 2 + e.id) * R * 0.5, Y - ph * R * 1.4, vk(3.5), 0, 7); ctx.fill(); }
      ctx.restore();
    }
    if (e.netT > 0) {                        // 捕网：网格罩住 + 定身标记
      ctx.save(); ctx.strokeStyle = 'rgba(210,255,225,.85)'; ctx.lineWidth = vk(2); const gr = R * 1.1;
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(X + i * gr / 2.2, Y - gr); ctx.lineTo(X + i * gr / 2.2, Y + gr); ctx.stroke(); ctx.beginPath(); ctx.moveTo(X - gr, Y + i * gr / 2.2); ctx.lineTo(X + gr, Y + i * gr / 2.2); ctx.stroke(); }
      ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(X, Y, gr, 0, 7); ctx.fillStyle = '#8fe3c8'; ctx.fill(); ctx.restore();
    }
    if (e.burnT > 0) {                       // 灼烧：跳动火舌
      ctx.save();
      for (let i = 0; i < 4; i++) { const fx = X + (i - 1.5) * vk(7), fl = vk(10) * (0.6 + 0.4 * Math.sin(anim * 12 + i + e.id)); ctx.globalAlpha = 0.8; ctx.fillStyle = i % 2 ? '#ffce4d' : '#ff7a2a'; ctx.beginPath(); ctx.moveTo(fx - vk(4), Y + R * 0.3); ctx.quadraticCurveTo(fx, Y + R * 0.3 - fl, fx + vk(4), Y + R * 0.3); ctx.fill(); }
      ctx.restore();
    }
  }
  function strokePath(w, color) { const p = level.path; ctx.beginPath(); ctx.moveTo(vx(p[0].x), vy(p[0].y)); for (let i = 1; i < p.length; i++) ctx.lineTo(vx(p[i].x), vy(p[i].y)); ctx.lineWidth = vk(w); ctx.strokeStyle = color; ctx.stroke(); }
  function drawPlatform() {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.save(); ctx.translate(0, vk(11)); strokePath(70, '#b98d63'); ctx.restore();  // 侧壁厚度(暖棕)
    strokePath(68, '#e9cfa0');     // 底边(浅棕)
    strokePath(58, '#f6e6c2');     // 路面(奶油)
    strokePath(50, 'rgba(255,251,238,.55)'); // 柔和高光
    // 可爱圆点虚线中缝(像小脚印/踏石)
    const p = level.path; ctx.save(); ctx.setLineDash([vk(3), vk(22)]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(vx(p[0].x), vy(p[0].y)); for (let i = 1; i < p.length; i++) ctx.lineTo(vx(p[i].x), vy(p[i].y));
    ctx.lineWidth = vk(7); ctx.strokeStyle = 'rgba(196,156,102,.5)'; ctx.stroke(); ctx.restore();
  }
  function drawBase() {
    const p = level.path[level.path.length - 1];
    const frac = state.lives / (level.startLives || 20);
    const bs = state.lives <= 0 ? 2 : frac <= 0.5 ? 1 : 0;               // 0完好 / 1残破(≤50%) / 2倒塌(0)
    const img = IMG[`base_${level.theme}_${bs}`] || IMG[`base_${level.theme}_0`];
    const hit = Math.max(0, 1 - (anim - baseHitAt) / 0.4);              // 受击闪光衰减
    const pulse = 0.5 + 0.5 * Math.sin(anim * 2.2);
    // 待机发光光环（完好/残破态；倒塌不发光）
    if (bs < 2) {
      ctx.save(); ctx.globalAlpha = 0.22 + 0.2 * pulse;
      const g = ctx.createRadialGradient(vx(p.x), vy(p.y), vk(6), vx(p.x), vy(p.y), vk(50));
      g.addColorStop(0, bs === 1 ? 'rgba(255,150,60,.95)' : 'rgba(130,220,255,.95)'); g.addColorStop(1, 'rgba(130,220,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(vx(p.x), vy(p.y), vk(50), 0, 7); ctx.fill(); ctx.restore();
    }
    shadow(p.x, p.y + 6, 32);
    if (img) {
      const bw = vk(100), bh = bw * (img.height / img.width), sh = 1 - hit * 0.06;
      ctx.save(); ctx.filter = hit > 0 ? `brightness(${1 + hit * 1.7}) saturate(.55)` : (grade || 'none');
      ctx.drawImage(img, vx(p.x) - bw / 2, vy(p.y) - bh * 0.72 * sh, bw, bh * sh); ctx.restore();
    } else {   // 兜底
      ctx.beginPath(); ctx.arc(vx(p.x), vy(p.y), vk(28), 0, 7); ctx.fillStyle = bs === 2 ? 'rgba(90,80,70,.85)' : 'rgba(190,150,95,.92)'; ctx.fill();
      ctx.strokeStyle = '#5b4a2c'; ctx.lineWidth = vk(3); ctx.stroke();
    }
    // 受击冲击环
    if (hit > 0) { ctx.save(); ctx.globalAlpha = hit; ctx.strokeStyle = '#ff5a4d'; ctx.lineWidth = vk(4) * hit; ctx.beginPath(); ctx.arc(vx(p.x), vy(p.y) - vk(10), vk(32) * (1.4 - hit), 0, 7); ctx.stroke(); ctx.restore(); }
    // 生命：心形图标 + 数字
    const hi = IMG.ic_heart, hy = vy(p.y) - vk(56), hs = vk(22);
    if (hi) ctx.drawImage(hi, vx(p.x) - vk(24), hy - hs / 2, hs, hs);
    drawNum(state.lives, vx(p.x) + vk(2), hy, vk(22), 'left');   // 图片数字
  }
  function jagged(ax, ay, bx, by, amp) {     // 在两点间画锯齿闪电
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, segs = Math.max(3, Math.round(len / vk(22)));
    ctx.beginPath(); ctx.moveTo(ax, ay);
    for (let i = 1; i < segs; i++) { const t = i / segs, j = (Math.random() - 0.5) * amp; ctx.lineTo(ax + dx * t + nx * j, ay + dy * t + ny * j); }
    ctx.lineTo(bx, by); ctx.stroke();
  }
  // 命中/攻击类型 → 生成的特效精灵图。图片化特效(缩放放大+淡出)
  const FXMAP = { muzzle: 'fx_muzzle', splash: 'fx_puff', burn: 'fx_puff', slow: 'fx_ice', frostnova: 'fx_ice',
    poison: 'fx_poison', poisonsplash: 'fx_poison', chain: 'fx_zap', chainbolt: 'fx_zap', arcanechain: 'fx_zap',
    arcane: 'fx_magic', pierce: 'fx_burst', net: 'fx_ring', spark: 'fx_burst', single: 'fx_burst', poof: 'fx_poof' };
  function blitFx(key, X, Y, size, alpha, rot) {
    const im = IMG[key]; if (!im) return false;
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, alpha)); ctx.translate(X, Y); if (rot) ctx.rotate(rot);
    ctx.drawImage(im, -size / 2, -size / 2, size, size); ctx.restore(); return true;
  }
  function drawEffect(e) {
    const k = e.kind, pr = Math.min(1, e.t / e.life), X = vx(e.x), Y = vy(e.y), col = e.color || '#fff';
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 先叠加图片特效精灵（爆炸/冰霜/毒云/闪电/奥术/命中/死亡烟）——图片化特效
    const fxk = FXMAP[k] || (k === 'poof' ? 'fx_poof' : null);
    if (fxk && IMG[fxk]) {
      const base = k === 'muzzle' ? 30 : k === 'poof' ? 46 : (e.r ? Math.max(46, e.r * 1.6) : 56);
      const grow = k === 'muzzle' ? (0.7 + pr * 0.5) : (0.5 + pr * 1.1);
      const fade = k === 'muzzle' ? (1 - pr) : (1 - pr) * (1 - pr) + 0.15 * (1 - pr);
      const rot = (k === 'muzzle') ? (e.ang || 0) : ((e.x * 7 + e.y) % 6.28);
      blitFx(fxk, X, Y, vk(base) * grow, Math.min(1, fade * 1.3), rot);
    }
    if (k === 'poof') { ctx.restore(); return; }   // 死亡烟：纯图片
    if (k === 'muzzle') {                       // 开火枪口闪光：朝目标方向的星芒 + 亮心
      const a = e.ang || 0, f = 1 - pr;
      ctx.globalAlpha = f;
      // 亮心
      ctx.beginPath(); ctx.arc(X, Y, vk(7) * (0.7 + f * 0.5), 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(X, Y, vk(11) * (0.6 + f * 0.6), 0, 7); ctx.fillStyle = col; ctx.globalAlpha = f * 0.55; ctx.fill();
      // 十字星芒（主轴对准射向）
      ctx.globalAlpha = f; ctx.strokeStyle = '#fff'; ctx.lineWidth = vk(3) * f;
      for (const d of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const rr = (d === 0 ? vk(20) : vk(11)) * (0.6 + f * 0.7); ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(a + d) * rr, Y + Math.sin(a + d) * rr); ctx.stroke(); }
    } else if (k === 'chainbolt') {                  // 闪电链：连接怪物的锯齿电弧
      ctx.globalAlpha = (1 - pr) * (0.6 + 0.4 * Math.random());
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i], b = e.pts[i + 1];
        ctx.strokeStyle = 'rgba(180,225,255,.6)'; ctx.lineWidth = vk(7); jagged(vx(a.x), vy(a.y), vx(b.x), vy(b.y), vk(13));   // 外辉光
        ctx.strokeStyle = '#eaf6ff'; ctx.lineWidth = vk(2.5); jagged(vx(a.x), vy(a.y), vx(b.x), vy(b.y), vk(13));            // 亮芯
      }
      for (const p of e.pts) { ctx.beginPath(); ctx.arc(vx(p.x), vy(p.y), vk(6) * (1 - pr), 0, 7); ctx.fillStyle = '#eaf6ff'; ctx.fill(); }
    } else if (k === 'slow' || k === 'frostnova') {   // 冰从地下钻出
      if (k === 'frostnova') { ctx.globalAlpha = (1 - pr) * 0.7; ctx.beginPath(); ctx.arc(X, Y, vk(e.r) * (0.3 + pr), 0, 7); ctx.strokeStyle = '#bdeeff'; ctx.lineWidth = vk(4) * (1 - pr); ctx.stroke(); }
      ctx.globalAlpha = 1 - pr * 0.7;
      for (let i = 0; i < 5; i++) {
        const off = (i - 2) * vk(13), h = vk(26) * Math.min(1, pr * 2.2) * (0.7 + (i % 2) * 0.5), bx = X + off, by = Y + vk(6);
        const grd = ctx.createLinearGradient(bx, by, bx, by - h); grd.addColorStop(0, '#7fd4ef'); grd.addColorStop(1, '#eaffff');
        ctx.fillStyle = grd; ctx.beginPath(); ctx.moveTo(bx - vk(5), by); ctx.lineTo(bx, by - h); ctx.lineTo(bx + vk(5), by); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = vk(1); ctx.stroke();
      }
    } else if (k === 'pierce') {                 // 狙击：粗光束 + 命中爆闪
      if (e.sx != null) {
        ctx.globalAlpha = (1 - pr) * 0.5; ctx.strokeStyle = col; ctx.lineWidth = vk(9) * (1 - pr);   // 外辉光束
        ctx.beginPath(); ctx.moveTo(vx(e.sx), vy(e.sy)); ctx.lineTo(X, Y); ctx.stroke();
        ctx.globalAlpha = 1 - pr; ctx.strokeStyle = '#fff'; ctx.lineWidth = vk(3) * (1 - pr);          // 亮芯
        ctx.beginPath(); ctx.moveTo(vx(e.sx), vy(e.sy)); ctx.lineTo(X, Y); ctx.stroke();
      }
      ctx.globalAlpha = (1 - pr); ctx.beginPath(); ctx.arc(X, Y, vk(16) * (0.5 + pr), 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    } else if (k === 'splash' || k === 'burn') {  // 爆炸环（火焰塔加火舌）—— 更大更亮
      ctx.globalAlpha = (1 - pr); ctx.beginPath(); ctx.arc(X, Y, vk(e.r) * (0.5 + pr * 1.1), 0, 7); ctx.strokeStyle = col; ctx.lineWidth = vk(9) * (1 - pr); ctx.stroke();
      ctx.beginPath(); ctx.arc(X, Y, vk(e.r) * (0.35 + pr * 0.8), 0, 7); ctx.fillStyle = col; ctx.globalAlpha = (1 - pr) * 0.5; ctx.fill();
      ctx.beginPath(); ctx.arc(X, Y, vk(e.r) * (0.18 + pr * 0.4), 0, 7); ctx.fillStyle = '#fff'; ctx.globalAlpha = (1 - pr) * 0.7; ctx.fill();   // 白色爆心
      if (k === 'burn') for (let i = 0; i < 8; i++) { const a = i * 0.8 + pr; const r = vk(e.r) * (0.4 + pr * 1.0); ctx.beginPath(); ctx.arc(X + Math.cos(a) * r, Y + Math.sin(a) * r, vk(6) * (1 - pr), 0, 7); ctx.fillStyle = i % 2 ? '#ffce4d' : '#ff7a2a'; ctx.globalAlpha = 1 - pr; ctx.fill(); }
    } else if (k === 'poison' || k === 'poisonsplash') {  // 上升毒泡
      ctx.globalAlpha = 1 - pr;
      for (let i = 0; i < 6; i++) { const a = i * 1.05; ctx.beginPath(); ctx.arc(X + Math.cos(a) * vk(12) * (0.4 + pr), Y - vk(22) * pr + Math.sin(a) * vk(5), vk(4) * (1 - pr * 0.4), 0, 7); ctx.fillStyle = col; ctx.fill(); }
    } else if (k === 'arcane' || k === 'arcanechain') {   // 奥术符文环
      ctx.globalAlpha = 1 - pr; ctx.strokeStyle = col; ctx.lineWidth = vk(2.5);
      ctx.beginPath(); ctx.arc(X, Y, vk(16) * (0.5 + pr), 0, 7); ctx.stroke();
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + pr * 3; ctx.beginPath(); ctx.arc(X + Math.cos(a) * vk(16) * (0.5 + pr), Y + Math.sin(a) * vk(16) * (0.5 + pr), vk(2.5), 0, 7); ctx.fillStyle = col; ctx.fill(); }
    } else if (k === 'net') {                    // 捕网撒出：扩散网环
      ctx.globalAlpha = 1 - pr; ctx.strokeStyle = col; ctx.lineWidth = vk(2.5);
      ctx.beginPath(); ctx.arc(X, Y, vk(30) * (0.3 + pr), 0, 7); ctx.stroke();
      for (let i = 0; i < 8; i++) { const a = i * 0.785; const rr = vk(30) * (0.3 + pr); ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(a) * rr, Y + Math.sin(a) * rr); ctx.stroke(); }
    } else {                                     // 单体（箭）命中星爆 —— 亮闪 + 冲击环 + 星芒
      const f = 1 - pr;
      // 白色亮闪爆心
      ctx.globalAlpha = f * 0.9; ctx.beginPath(); ctx.arc(X, Y, vk(9) * (0.5 + pr * 0.9), 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      // 彩色冲击环
      ctx.globalAlpha = f; ctx.strokeStyle = col; ctx.lineWidth = vk(3) * f; ctx.beginPath(); ctx.arc(X, Y, vk(14) * (0.4 + pr), 0, 7); ctx.stroke();
      // 放射星芒
      ctx.strokeStyle = '#fff'; ctx.lineWidth = vk(2.5) * f;
      for (let i = 0; i < 8; i++) { const a = i * 0.785; const r0 = vk(4), r1 = vk(6 + 15 * pr); ctx.beginPath(); ctx.moveTo(X + Math.cos(a) * r0, Y + Math.sin(a) * r0); ctx.lineTo(X + Math.cos(a) * r1, Y + Math.sin(a) * r1); ctx.stroke(); }
    }
    ctx.restore();
  }
  function render() {
    ctx.clearRect(0, 0, tf.W, tf.H);
    // 基地受击屏震（衰减；背景多画一圈防止边缘露白）
    const shT = Math.max(0, 1 - (anim - baseHitAt) / 0.32), shm = shT * shT * vk(7);
    ctx.save();
    if (shm > 0.2) ctx.translate(Math.sin(anim * 92) * shm, Math.cos(anim * 71) * shm);
    const bg = IMG[level.bg]; if (bg) ctx.drawImage(bg, vx(0) - 12, vy(0) - 12, vk(C.VW) + 24, vk(C.VH) + 24); else { ctx.fillStyle = '#2c3a26'; ctx.fillRect(vx(0) - 12, vy(0) - 12, vk(C.VW) + 24, vk(C.VH) + 24); }
    drawPlatform();
    const s = state;
    // 怪物入口传送门（每主题一套图；缺失则画暗色洞口兜底）
    const p0 = level.path[0], portal = IMG['portal_' + level.theme];
    if (portal) {
      const pw = vk(78), ph = pw * (portal.height / portal.width);
      const gp = 0.5 + 0.5 * Math.sin(anim * 2.6);   // 入口呼吸辉光
      ctx.save(); ctx.globalAlpha = 0.35 + 0.25 * gp; const gg = ctx.createRadialGradient(vx(p0.x + 8), vy(p0.y), vk(4), vx(p0.x + 8), vy(p0.y), vk(40));
      gg.addColorStop(0, 'rgba(180,120,240,.8)'); gg.addColorStop(1, 'rgba(180,120,240,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(vx(p0.x + 8), vy(p0.y), vk(40), 0, 7); ctx.fill(); ctx.restore();
      shadow(p0.x + 8, p0.y + 6, 26);
      ctx.save(); ctx.filter = grade || 'none'; ctx.drawImage(portal, vx(p0.x + 8) - pw / 2, vy(p0.y) - ph * 0.62, pw, ph); ctx.restore();
    } else {
      ctx.beginPath(); ctx.ellipse(vx(p0.x + 8), vy(p0.y), vk(24), vk(15), 0, 0, 7); ctx.fillStyle = 'rgba(22,14,28,.8)'; ctx.fill();
      ctx.strokeStyle = 'rgba(150,110,180,.75)'; ctx.lineWidth = vk(3); ctx.stroke();
    }
    // 障碍物（可被攻击、击破得金币）
    for (const o of s.obstacles) {
      const sc = o.sizeScale || 1, sz = 56 * sc, topY = vy(o.y) - vk(sz * 0.62);
      shadow(o.x, o.y, 22 * sc);
      drawSprite(o.type, o.x, o.y, sz, 0.7, { flash: o.hitT > 0 });
      const focused = o.id === s.focusId;
      if (focused) {   // 集火攻击中：红色准星 + 虚线环（明确"正在攻击此障碍"）
        const cx2 = vx(o.x), cy2 = vy(o.y) - vk(sz * 0.32), rr = vk(20 * sc);
        ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = vk(2.5);
        ctx.beginPath(); ctx.arc(cx2, cy2, rr, 0, 7); ctx.setLineDash([vk(5), vk(4)]); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { ctx.moveTo(cx2 + Math.cos(a) * rr * 0.7, cy2 + Math.sin(a) * rr * 0.7); ctx.lineTo(cx2 + Math.cos(a) * rr * 1.25, cy2 + Math.sin(a) * rr * 1.25); } ctx.stroke();
      }
      // 大障碍物标记(更宽血条 + 角标)
      const bw = vk((o.big ? 52 : 34)), bh = vk(o.big ? 6 : 4), bx = vx(o.x) - bw / 2, by = topY - vk(6);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = o.big ? '#e0962f' : '#caa84a'; ctx.fillRect(bx, by, bw * Math.max(0, o.hp / o.maxHp), bh);
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = vk(1); ctx.strokeRect(bx, by, bw, bh);
    }
    // 建造预览：菜单打开且为 build 模式时，显示落点与射程
    if (menu && menu.mode === 'build') { ctx.beginPath(); ctx.arc(vx(menu.x), vy(menu.y), vk(10), 0, 7); ctx.fillStyle = 'rgba(255,235,140,.5)'; ctx.fill(); }
    // 选中塔射程
    if (s.selectedId) { const t = s.towers.find((x) => x.id === s.selectedId); if (t) { const st = E.towerStats(t); ctx.beginPath(); ctx.arc(vx(t.x), vy(t.y), vk(st.range), 0, 7); ctx.fillStyle = 'rgba(120,200,255,.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(120,200,255,.5)'; ctx.lineWidth = vk(2); ctx.stroke(); } }
    // 新手引导：把引导建造点画成"发光建造台"(虚线框+加号+脉冲金光)，让位置醒目
    if (tut.active && tut.buildSpot && tut.steps[tut.step] && tut.steps[tut.step].wait === 'build') {
      const bx = vx(tut.buildSpot.x), by = vy(tut.buildSpot.y), pl = 0.5 + 0.5 * Math.sin(anim * 4);
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.4 * pl;
      const g = ctx.createRadialGradient(bx, by, vk(4), bx, by, vk(48));
      g.addColorStop(0, 'rgba(255,242,180,.95)'); g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, vk(48), 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = vk(3); ctx.setLineDash([vk(8), vk(5)]);
      ctx.strokeRect(bx - vk(27), by - vk(27), vk(54), vk(54)); ctx.setLineDash([]);
      ctx.lineWidth = vk(4.5); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx - vk(12), by); ctx.lineTo(bx + vk(12), by); ctx.moveTo(bx, by - vk(12)); ctx.lineTo(bx, by + vk(12)); ctx.stroke();
      ctx.restore();
    }
    // 宝箱（可放置道具）：光环/范围提示 + 箱体 + 顶部道具图标浮动
    for (const c of s.chests) {
      const it = c.item;
      if (it.effect === 'haste') { ctx.save(); ctx.globalAlpha = 0.14 + 0.06 * (0.5 + 0.5 * Math.sin(anim * 3)); ctx.beginPath(); ctx.arc(vx(c.x), vy(c.y), vk(it.radius), 0, 7); ctx.fillStyle = '#7CFC4D'; ctx.fill(); ctx.strokeStyle = 'rgba(124,252,77,.5)'; ctx.lineWidth = vk(2); ctx.stroke(); ctx.restore(); }
      else if (it.effect === 'burst' || it.effect === 'net') { ctx.save(); ctx.globalAlpha = 0.10; ctx.beginPath(); ctx.arc(vx(c.x), vy(c.y), vk(it.range), 0, 7); ctx.fillStyle = it.effect === 'burst' ? '#c77dff' : '#8fe3c8'; ctx.fill(); ctx.restore(); }
      const isPile = it.effect === 'goldpile';
      if (isPile) { const pl = 0.5 + 0.5 * Math.sin(anim * 3.5); ctx.save(); ctx.globalAlpha = 0.35 + 0.4 * pl; const g = ctx.createRadialGradient(vx(c.x), vy(c.y), vk(3), vx(c.x), vy(c.y), vk(40)); g.addColorStop(0, 'rgba(255,232,120,.95)'); g.addColorStop(1, 'rgba(255,210,80,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(vx(c.x), vy(c.y), vk(40), 0, 7); ctx.fill(); ctx.restore(); }
      shadow(c.x, c.y, 18);
      const cbob = isPile ? Math.abs(Math.sin(anim * 3.5)) * 4 : Math.sin(anim * 2.4 + c.id) * 2;   // 金币堆跳动提示可点击
      drawSprite(it.img || 'chest_closed', c.x, c.y + 2 + cbob, 62, 0.72);
    }
    // 塔
    for (const t of s.towers) {
      const st = E.towerStats(t), bob = Math.sin(anim * 3 + t.id * 1.7) * 1.6;       // 待机起伏
      const punch = (st.rate - t.cd) < 0.1 ? 1.16 : 1;                                  // 开火回弹
      // 底座：把塔"落"在棋盘上，统一画风、消除悬浮违和
      const px = vx(t.x), py = vy(t.y);
      ctx.beginPath(); ctx.ellipse(px, py + vk(7), vk(26), vk(13), 0, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fill();
      const grd = ctx.createRadialGradient(px, py + vk(2), vk(4), px, py + vk(2), vk(24)); grd.addColorStop(0, '#caa86e'); grd.addColorStop(1, '#8a6a3e');
      ctx.beginPath(); ctx.ellipse(px, py + vk(2), vk(24), vk(12), 0, 0, 7); ctx.fillStyle = grd; ctx.fill();
      ctx.lineWidth = vk(2); ctx.strokeStyle = 'rgba(60,42,22,.7)'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(px, py - vk(1), vk(19), vk(9), 0, 0, 7); ctx.fillStyle = 'rgba(255,235,190,.35)'; ctx.fill();
      // 攻击动画：仅 3级/分支塔播放攻击精灵表(该表按3级形象生成)；1/2级塔用各自静态形象+回弹，
      // 避免低级塔开火时错误显示成高级形象（#3 修复）
      const atk = ATK[t.key], tsf = st.rate - t.cd, ATKDUR = 0.42, isMax = t.branch || t.level >= 2, firing = tsf >= 0 && tsf < ATKDUR;
      const sid = equippedSkin(t.key), skIdle = sid && `skidle_${t.key}_${sid}`, skAtk = sid && `skatk_${t.key}_${sid}`;
      const faceLeft = Math.cos(t.angle) < -0.15;   // 目标在左侧 → 镜像朝左，让塔面向怪物
      // 皮肤=终极形态外观：仅当塔升到最高级/进化(isMax)才生效；1/2 级仍用各自进阶形象
      if (sid && isMax && IMG[skAtk] && firing) {                            // 皮肤攻击动画
        drawSprite(skAtk, t.x, t.y + 4, 80, 0.78, { frame: Math.floor((tsf / ATKDUR) * 16), flip: faceLeft });
      } else if (sid && isMax && IMG[skIdle]) {                              // 皮肤待机动画
        drawSprite(skIdle, t.x, t.y + 4 + bob, 78 * punch, 0.78, { flip: faceLeft });
      } else if (atk && isMax && firing) {                                   // 默认攻击动画(仅3级/分支)
        drawSprite(atk.asset, t.x, t.y + 4, 80, 0.78, { frame: Math.floor((tsf / ATKDUR) * atk.frames), flip: faceLeft });
      } else {
        drawSprite(towerImg(t), t.x, t.y + 4 + bob, 78 * punch, 0.78, { flip: faceLeft });
      }
      const dots = t.branch ? 4 : t.level + 1; for (let k = 0; k < dots; k++) { ctx.beginPath(); ctx.arc(vx(t.x) - vk(12) + vk(8) * k, vy(t.y) + vk(11), vk(2.8), 0, 7); ctx.fillStyle = t.branch ? '#b6ff5a' : '#ffd23f'; ctx.fill(); }
    }
    // 怪
    for (const e of s.enemies) {
      const h = vk(e.def.size);
      shadow(e.x, e.y, e.def.size * 0.32);
      const hitFlash = e.hitT > 0, hp01 = Math.min(1, (e.hitT || 0) / 0.12), squash = hitFlash ? 0.82 : 1;
      const jx = hitFlash ? (((e.id * 53) % 7) - 3) * hp01 * 1.4 : 0;   // 受击抖动(被击退感)
      drawSprite(e.def.img, e.x + jx, e.y, e.def.size, 0.85, { flash: hitFlash, squash });
      if (hitFlash) {   // 受击冲击：白色星爆 + 扩散环（受击特效更明显）
        const cx2 = vx(e.x), cy2 = vy(e.y) - h * 0.42;
        ctx.save(); ctx.globalAlpha = hp01;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = vk(2.4);
        ctx.beginPath(); ctx.arc(cx2, cy2, vk(e.def.size * 0.36) * (1.2 - hp01 * 0.5), 0, 7); ctx.stroke();
        for (let i = 0; i < 5; i++) { const a = i * 1.257 + e.id; const r0 = vk(e.def.size * 0.2), r1 = r0 + vk(13) * (1 - hp01 + 0.4); ctx.beginPath(); ctx.moveTo(cx2 + Math.cos(a) * r0, cy2 + Math.sin(a) * r0); ctx.lineTo(cx2 + Math.cos(a) * r1, cy2 + Math.sin(a) * r1); ctx.stroke(); }
        ctx.restore();
      }
      statusOverlay(e);
      if (e.id === s.focusId) { ctx.beginPath(); ctx.arc(vx(e.x), vy(e.y) - h * 0.4, vk(e.def.size * 0.5), 0, 7); ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = vk(2.5); ctx.setLineDash([vk(4), vk(4)]); ctx.stroke(); ctx.setLineDash([]); }
      const bw = vk(e.def.size * .7), bh = vk(5), bx = vx(e.x) - bw / 2, by = vy(e.y) - h * .92;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(bx, by, bw, bh);
      const rt = Math.max(0, e.hp / e.maxHp); ctx.fillStyle = rt > .5 ? '#7CFC4D' : rt > .25 ? '#ffd23f' : '#ff5a4d'; ctx.fillRect(bx, by, bw * rt, bh);
      if (e.slowT > 0) { ctx.fillStyle = 'rgba(120,220,255,.7)'; ctx.fillRect(bx, by - bh - 1, bw, bh * .5); }
      if (e.def.armor) { ctx.fillStyle = 'rgba(210,210,220,.9)'; ctx.fillRect(bx - vk(4), by, vk(3), bh); }
    }
    // 弹丸：拖尾 + 发光核（攻击路径更明显）
    for (const b of s.bullets) {
      const bx = vx(b.x), by = vy(b.y), tr = Math.atan2(b.y - b.sy, b.x - b.sx), tl = vk(b.r * 4 + 14);
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = b.color; ctx.lineCap = 'round'; ctx.lineWidth = vk(b.r * 1.6);
      ctx.beginPath(); ctx.moveTo(bx - Math.cos(tr) * tl, by - Math.sin(tr) * tl); ctx.lineTo(bx, by); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(bx, by, vk(b.r + 3), 0, 7); ctx.fillStyle = b.color; ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;   // 外辉
      ctx.beginPath(); ctx.arc(bx, by, vk(b.r), 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(bx, by, vk(b.r * 0.7), 0, 7); ctx.fillStyle = b.color; ctx.fill();
    }
    for (const e of s.effects) drawEffect(e);
    if (s.hero) { ctx.beginPath(); ctx.ellipse(vx(s.hero.x), vy(s.hero.y), vk(24), vk(10), 0, 0, 7); ctx.fillStyle = 'rgba(182,255,90,.22)'; ctx.fill(); drawSprite('hero_ranger', s.hero.x, s.hero.y, 92, 0.86); }
    drawBase();
    for (const f of s.floats) { ctx.globalAlpha = Math.max(0, 1 - f.t); drawNum(f.text, vx(f.x), vy(f.y) - vk(26) - f.t * vk(20), vk(20), 'center'); ctx.globalAlpha = 1; }
    ctx.restore();
    drawMenu();
  }

  /* ---------- HUD ---------- */
  const hud = {};
  function syncHud() {
    const s = state, g = Math.floor(s.gold);
    if (hud.g !== g) { hud.g = g; setNum('gold', g, 22); }
    // 基地受击：生命下降 → 记录闪光时刻
    if (lastLives != null && s.lives < lastLives) baseHitAt = anim;
    lastLives = s.lives;
    $('waveFill').style.width = (100 * s.wave / s.totalWaves) + '%';
    if (s.phase === 'ready' && s.wave < s.totalWaves) { const pv = level.wavePreview(s.wave + 1) || {}; $('waveTxt').textContent = `${s.wave}/${s.totalWaves}波 · 下一波 ${pv.boss ? 'Boss·' : ''}${pv.name || ''} ${Math.ceil(Math.max(0, s.nextTimer))}s`; }
    else $('waveTxt').textContent = `${s.wave}/${s.totalWaves} 波`;
    // Boss 来袭：波次推进到 boss 波时播放该主题 Boss 视频
    if (hud.w !== s.wave) {
      hud.w = s.wave;
      if (s.wave >= 1 && s.phase === 'spawning' && (level.wavePreview(s.wave) || {}).boss) { playCut('cut_boss_' + level.theme, 'Boss 即将出现', null); bossAlarm(); }
    }
    if (hud.p !== s.phase) {
      hud.p = s.phase;
      if (s.phase === 'won' || s.phase === 'lost') {
        let reward = 0, stars = 0;
        if (s.phase === 'won') { const first = level.id > prog().cleared; stars = starsFor(s.lives, level.startLives); const best = prog().stars[level.id] || 0; reward = (first ? 10 : 3) + (stars > best ? (stars - best) * 2 : 0); addGems(reward); addChest(1); clear(level.id, stars); }   // 胜利赠1宝箱 + 星级奖励钻石
        const showBox = () => {
          $('overlay').style.display = 'flex';
          $('ovT').innerHTML = s.phase === 'won'
            ? '<img class="ovic" src="assets/ic_win.png" onerror="this.style.display=\'none\'"> 过关！'
            : '<img class="ovic" src="assets/ic_lose.png" onerror="this.style.display=\'none\'"> 失败';
          // 星级条（点亮 stars 颗，共 3 颗）
          const starRow = s.phase === 'won'
            ? `<div class="ovstars">${[1,2,3].map((i)=>`<img src="assets/ic_star.png" class="${i<=stars?'on':'off'}" onerror="this.style.display='none'">`).join('')}</div>`
            : '';
          $('ovS').innerHTML = starRow + (s.phase === 'won'
            ? (level.id >= 40 ? '通关全部 40 关！' : level.name + ' 通关') + `　<img class="ovic" style="width:18px;height:18px" src="assets/ic_gem.png" onerror="this.style.display='none'"> +${reward}　<img class="ovic" style="width:18px;height:18px" src="assets/chest_closed.png" onerror="this.style.display='none'"> +1`
            : '基地被攻破，再试一次');
          $('ovNext').style.display = (s.phase === 'won' && level.id < 40) ? '' : 'none';
        };
        playCut(s.phase === 'won' ? 'cut_win' : 'cut_lose', s.phase === 'won' ? '过关！' : '失败', showBox);
      } else $('overlay').style.display = 'none';
    }
  }

  /* ---------- 就地环形图标菜单 (#4，全部用图片) ---------- */
  const RAD = 58, ICON = 30;   // 环半径 / 图标半径（虚拟px）
  // 自适应扇形：根据锚点位置朝屏内展开(近顶向下、近底向上)，避免图标飞出屏幕/被HUD遮挡
  function layout(n, x, y) {
    const a = [], span = Math.min(Math.PI * 1.7, n * 0.7);
    const down = y < 235;                               // 近顶部 → 向下扇形
    const base = down ? Math.PI / 2 : -Math.PI / 2;
    let bias = 0;                                       // 近左右边时整体偏转，避免出界
    if (x < 230) bias = 0.5; else if (x > C.VW - 230) bias = -0.5;
    for (let i = 0; i < n; i++) a.push(base + bias * (down ? -1 : 1) + (n === 1 ? 0 : (i - (n - 1) / 2) * (span / Math.max(1, n - 1))));
    return a;
  }
  function openBuild(x, y) {
    const items = level.towers.map((k) => { const d = C.TOWERS[k]; return { img: `tw_${k}_1`, sub: '' + d.cost, coin: true, enabled: state.gold >= d.cost, act: () => E.applyCommand(state, { type: 'build', x, y, tower: k }) && closeMenu() }; });
    menu = { mode: 'build', x, y, items, ang: layout(items.length, x, y) };
  }
  function openManage(t) {
    E.applyCommand(state, { type: 'select', id: t.id });
    const d = C.TOWERS[t.key], maxed = t.level === d.levels.length - 1; let spent = d.cost; for (let k = 1; k <= t.level; k++) spent += d.levels[k].upgrade; if (t.branch) spent += d.branches[t.branch].upgrade;
    const refund = Math.floor(spent * .6), items = [];
    if (!t.branch && !maxed) { const nx = d.levels[t.level + 1]; items.push({ icon: 'ic_upgrade', sub: '' + nx.upgrade, coin: true, enabled: state.gold >= nx.upgrade, act: () => { E.applyCommand(state, { type: 'upgrade', id: t.id }); openManage(t); } }); }
    else if (!t.branch && maxed) {
      const A = d.branches.A, B = d.branches.B;
      items.push({ icon: 'ic_branchA', sub: A.name, enabled: state.gold >= A.upgrade, act: () => { E.applyCommand(state, { type: 'branch', id: t.id, branch: 'A' }); closeMenu(); } });
      items.push({ icon: 'ic_branchB', sub: B.name, enabled: state.gold >= B.upgrade, act: () => { E.applyCommand(state, { type: 'branch', id: t.id, branch: 'B' }); closeMenu(); } });
    }
    items.push({ icon: 'ic_sell', sub: '+' + refund, enabled: true, act: () => { E.applyCommand(state, { type: 'sell', id: t.id }); closeMenu(); } });
    menu = { mode: 'manage', x: t.x, y: t.y, items, ang: layout(items.length, t.x, t.y) };
  }
  function closeMenu() { menu = null; if (state) E.applyCommand(state, { type: 'select', id: 0 }); }
  function menuItemPos(i) { const a = menu.ang[i]; return { x: menu.x + Math.cos(a) * RAD, y: menu.y + Math.sin(a) * RAD - 14 }; }
  function drawMenu() {
    if (!menu) return;
    for (let i = 0; i < menu.items.length; i++) {
      const it = menu.items[i], p = menuItemPos(i), X = vx(p.x), Y = vy(p.y), R = vk(ICON);
      ctx.beginPath(); ctx.arc(X, Y, R + vk(3), 0, 7); ctx.fillStyle = it.enabled ? 'rgba(28,38,28,.92)' : 'rgba(40,40,40,.8)'; ctx.fill(); ctx.lineWidth = vk(2); ctx.strokeStyle = it.enabled ? '#ffd23f' : '#777'; ctx.stroke();
      const im = IMG[it.icon || it.img]; if (im) { ctx.save(); if (!it.enabled) ctx.globalAlpha = 0.45; const w = R * 1.7 * (im.width / im.height > 1 ? 1 : im.width / im.height), h = R * 1.7 * (im.height / im.width > 1 ? 1 : im.height / im.width); ctx.drawImage(im, X - w / 2, Y - h / 2 - vk(3), w, h); ctx.restore(); }
      if (it.sub) {
        ctx.font = `bold ${vk(12)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        const ty = Y + R - vk(1), tw = ctx.measureText(it.sub).width, off = it.coin ? vk(6) : 0;
        if (it.coin && IMG.ic_coin) { const cs = vk(13); ctx.drawImage(IMG.ic_coin, X - tw / 2 - cs + off, ty - cs + vk(2), cs, cs); }
        ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = vk(3);
        ctx.strokeText(it.sub, X + off, ty); ctx.fillText(it.sub, X + off, ty);
      }
    }
    // 关闭按钮（中心 ✕，用线绘制，不用 emoji）
    const cx2 = vx(menu.x), cy2 = vy(menu.y - 14); ctx.beginPath(); ctx.arc(cx2, cy2, vk(13), 0, 7); ctx.fillStyle = 'rgba(20,20,20,.7)'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = vk(2.4); ctx.lineCap = 'round'; const xr = vk(5);
    ctx.beginPath(); ctx.moveTo(cx2 - xr, cy2 - xr); ctx.lineTo(cx2 + xr, cy2 + xr); ctx.moveTo(cx2 + xr, cy2 - xr); ctx.lineTo(cx2 - xr, cy2 + xr); ctx.stroke();
  }

  /* ---------- 新手引导（第1关手把手：遮罩 + 高亮镂空 + 木牌 + 手指） ---------- */
  const TUTKEY = 'wttl_tut_done';
  const tut = { active: false, step: 0, steps: [], buildSpot: null };
  const domCenter = (id) => { const r = $(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  function findBuildSpot() {
    for (let yy = 130; yy < C.VH - 100; yy += 14) for (let xx = 120; xx < C.VW - 120; xx += 14) if (E.canBuild(state, xx, yy).ok) return { x: xx, y: yy };
    return { x: C.VW / 2, y: C.VH / 2 };
  }
  function buildTutSteps() {
    const bs = tut.buildSpot;
    tut.steps = [
      { text: '欢迎来到森林塔防大作战！跟着提示，几步就能上手。', next: true },
      { text: '点击这块发光的空地，建造你的第一座守卫。', target: () => ({ x: vx(bs.x), y: vy(bs.y) }), holeR: 46, hand: true, wait: 'build' },
      { text: '守卫会自动攻击路过的怪物。点击守卫可以升级、进化它。', target: () => { const t = state.towers[0]; return t ? { x: vx(t.x), y: vy(t.y) } : { x: vx(bs.x), y: vy(bs.y) }; }, holeR: 42, next: true },
      { text: '点击右上角的宝箱按钮，把宝箱放到空地，开出随机增益！', target: () => domCenter('chestBtn'), holeR: 30, hand: true, wait: 'chestPlaced' },
      { text: '怪物从传送门出发，走到你的基地就会扣血。守住基地！', target: () => { const p = level.path[level.path.length - 1]; return { x: vx(p.x), y: vy(p.y) }; }, holeR: 50, next: true },
      { text: '准备完成！波次会自动开始，祝你好运~', next: true, done: true },
    ];
  }
  function tutStart(n) {
    if (n !== 1 || localStorage.getItem(TUTKEY)) return;
    if (chestStock() === 0) setChestStock(1);   // 确保引导中有宝箱可放
    updateChestBtn();
    tut.buildSpot = findBuildSpot(); tut.active = true; tut.step = 0;
    buildTutSteps(); $('tut').style.display = 'block'; renderTutStep();
  }
  function renderTutStep() {
    const st = tut.steps[tut.step]; if (!st) return tutFinish();
    $('tutTxt').textContent = st.text;
    $('tutNext').style.display = st.wait ? 'none' : 'block';
    const hole = $('tutHole'), hand = $('tutHand'), mask = $('tutMask');
    mask.style.display = 'block';
    if (st.target) {   // 有目标：真·聚光灯——目标处不变暗(镂空)，四周压暗 + 金环 + 手指
      const p = st.target(), r = st.holeR || 44;
      mask.style.background = `radial-gradient(circle at ${p.x}px ${p.y}px, rgba(4,10,6,0) ${r - 6}px, rgba(4,10,6,.66) ${r + 46}px)`;
      hole.style.display = 'block'; hole.style.width = hole.style.height = (r * 2) + 'px';
      hole.style.left = (p.x - r) + 'px'; hole.style.top = (p.y - r) + 'px';
      if (st.hand) { hand.style.display = 'block'; hand.style.left = (p.x + r * 0.4) + 'px'; hand.style.top = (p.y + r * 0.4) + 'px'; } else hand.style.display = 'none';
    } else { mask.style.background = 'rgba(4,10,6,.62)'; hole.style.display = 'none'; hand.style.display = 'none'; }   // 无目标：整屏均匀变暗
  }
  function tutAdvance() {
    const cur = tut.steps[tut.step];
    if (cur && cur.done) return tutFinish();
    tut.step++;
    if (tut.step >= tut.steps.length) return tutFinish();
    renderTutStep();
  }
  function tutOnEvent(evt) { if (!tut.active) return; const st = tut.steps[tut.step]; if (st && st.wait === evt) tutAdvance(); }
  function tutFinish() { tut.active = false; $('tut').style.display = 'none'; localStorage.setItem(TUTKEY, '1'); }
  $('tutNext').onclick = tutAdvance;

  /* ---------- 交互 ---------- */
  function onTap(cx, cy) {
    if (!state || $('unlock').style.display === 'flex') return;
    const v = toV(cx, cy);
    if (chestMode) {   // 放置宝箱：点空地落箱→随机开箱
      const res = E.canPlaceChest(state, v.x, v.y);
      if (res.ok) {
        const item = rollChestItem();
        if (E.applyCommand(state, { type: 'placeChest', x: v.x, y: v.y, item })) {
          addChest(-1); chestMode = false; updateChestBtn(); showChestReveal(item);
          if (tut.active) tutOnEvent('chestPlaced');
        }
      } else { state.floats.push({ x: v.x, y: v.y, text: '此处不可放置', color: '#ff7a6a', t: 0 }); }
      return;
    }
    if (menu) {   // 菜单打开：命中图标执行；点中心或外部关闭
      for (let i = 0; i < menu.items.length; i++) { const p = menuItemPos(i); if (Math.hypot(v.x - p.x, v.y - p.y) < ICON + 6) { if (menu.items[i].enabled) menu.items[i].act(); return; } }
      closeMenu(); return;
    }
    // 点金币堆 → 拾取(加当前金币25%，堆消失)
    let gp = null, gpb = 52; for (const c of state.chests) { if (c.item.effect !== 'goldpile') continue; const dd = Math.hypot(v.x - c.x, v.y - c.y); if (dd < gpb) { gpb = dd; gp = c; } }
    if (gp) { E.applyCommand(state, { type: 'collectChest', id: gp.id }); return; }
    // 点已有塔 → 管理菜单
    let t = null, tb = 46; for (const x of state.towers) { const dd = Math.hypot(v.x - x.x, v.y - x.y); if (dd < tb) { tb = dd; t = x; } }
    if (t) { openManage(t); return; }
    // 点障碍物 → 集火清除
    let ob = null, obb = 40; for (const o of state.obstacles) { const dd = Math.hypot(v.x - o.x, v.y - o.y); if (dd < obb) { obb = dd; ob = o; } }
    if (ob) { E.applyCommand(state, { type: 'focus', id: ob.id }); return; }
    // 点怪 → 集火
    let en = null, eb = 1e9; for (const e of state.enemies) { const dd = Math.hypot(v.x - e.x, v.y - e.y); if (dd < e.def.size * 0.6 && dd < eb) { eb = dd; en = e; } }
    if (en) { E.applyCommand(state, { type: 'focus', id: en.id }); return; }
    // 空地：可建则开建造菜单，否则指挥英雄
    if (E.canBuild(state, v.x, v.y).ok) { openBuild(v.x, v.y); return; }
    if (state.hero) E.applyCommand(state, { type: 'moveHero', x: v.x, y: v.y });
  }
  cv.addEventListener('click', (e) => onTap(e.clientX, e.clientY));
  cv.addEventListener('touchstart', (e) => { const t = e.touches[0]; onTap(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
  // #4 播放键 = 暂停/继续游戏（波次由倒计时自动开始，不再手动出怪）
  function setPaused(p) { paused = p; $('playIco').style.display = p ? 'block' : 'none'; $('pauseIco').style.display = p ? 'none' : 'flex'; }
  $('startBtn').onclick = () => { if (state) setPaused(!paused); };
  $('chestBtn').onclick = toggleChestMode;
  $('cbClose').onclick = closeChestBuy;
  $('cbBuy').onclick = () => { if (gems() >= CHEST_PRICE) { addGems(-CHEST_PRICE); addChest(1); updateChestBtn(); closeChestBuy(); } else { $('cbBuy').textContent = '钻石不足'; setTimeout(() => { $('cbBuy').innerHTML = '<img class="hud-ic" src="assets/ic_gem.png" onerror="this.style.display=\'none\'"> ' + CHEST_PRICE + ' 钻 换 1 个宝箱'; }, 1200); } };
  $('menuBtn').onclick = openSettings;   // 游戏内 ☰ → 暂停/设置面板（面板内可返回选关）
  // 首页导航
  const goCur = () => { const p = prog(); startLevel(Math.min(40, p.cleared + 1)); };
  $('hStart').onclick = goCur; $('hCont').onclick = goCur;
  $('hLevels').onclick = showMenu; $('hCodex').onclick = showCodex; $('hShop').onclick = showShop; $('hSet').onclick = openSettings;
  $('shopBack').onclick = showHome; $('dexBack').onclick = showHome; $('mapBack').onclick = showHome;
  $('speedBtn').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; setNum('speedNum', speed, 14); };
  $('ovReplay').onclick = () => startLevel(level.id); $('ovNext').onclick = () => startLevel(Math.min(40, level.id + 1)); $('ovMenu').onclick = showMenu;

  /* ---------- 轻量过渡横幅（开场/过关/失败/Boss来袭） ----------
   * 不再全屏播视频；改为居中横幅 + 小 gif，~1.8s 自动消失。
   * 开场/过关/失败会短暂暂停(cutBusy)；Boss来袭是战斗中的警告，不暂停。 */
  // Boss 来袭红色警报：屏幕四周红光脉冲 ~1.7s
  function bossAlarm() { const el = $('bossAlarm'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); clearTimeout(bossAlarm._t); bossAlarm._t = setTimeout(() => el.classList.remove('on'), 1750); }
  function playCut(name, tag, onDone) {
    const box = $('banner'), gif = $('bnGif');
    const kind = /boss/.test(name) ? 'boss' : /win/.test(name) ? 'win' : /lose/.test(name) ? 'lose' : 'start';
    let ended = false, cap = 0;
    const finish = () => { if (ended) return; ended = true; clearTimeout(cap); cutBusy = false; box.style.display = 'none'; if (onDone) onDone(); };
    box.className = kind;
    $('bnText').textContent = tag || '';
    gif.style.display = ''; gif.src = `assets/gif/${name}.gif`;
    cutBusy = (kind !== 'boss');           // Boss 警告不冻结战斗
    box.style.display = 'flex';
    cap = setTimeout(finish, kind === 'boss' ? 1600 : 1900);
  }

  /* ---------- 设置 / 暂停面板 ---------- */
  const AKEY = 'wttl_audio';
  const audio = (() => { try { return JSON.parse(localStorage.getItem(AKEY)) || { music: true, sfx: true }; } catch { return { music: true, sfx: true }; } })();
  const saveAudio = () => localStorage.setItem(AKEY, JSON.stringify(audio));
  let settingsBusy = false;
  function paintToggles() { $('swMusic').className = 'sw' + (audio.music ? ' on' : ''); $('swSfx').className = 'sw' + (audio.sfx ? ' on' : ''); }
  function openSettings() {
    const inGame = !!state;                    // 首页也可打开(仅音乐/音效)
    settingsBusy = inGame;                     // 首页打开不需暂停战斗
    paintToggles();
    $('setTitle').textContent = inGame ? '游戏暂停' : '设置';
    $('setSub').textContent = inGame ? level.name : '音乐 / 音效';
    $('setResume').textContent = inGame ? '继续游戏' : '关闭';
    $('setRowBtn').style.display = inGame ? 'flex' : 'none';
    $('settings').style.display = 'flex';
  }
  function closeSettings() { settingsBusy = false; $('settings').style.display = 'none'; }
  $('swMusic').onclick = () => { audio.music = !audio.music; saveAudio(); paintToggles(); };
  $('swSfx').onclick = () => { audio.sfx = !audio.sfx; saveAudio(); paintToggles(); };
  $('setClose').onclick = closeSettings; $('setResume').onclick = closeSettings;
  $('setReplay').onclick = () => { closeSettings(); startLevel(level.id); };
  $('setHome').onclick = () => { closeSettings(); showMenu(); };
  $('setHomePage').onclick = () => { closeSettings(); showHome(); };

  /* ---------- 启动加载页（等待页） ---------- */
  function runLoading(then) {
    const fill = $('ldFill'), pct = $('ldPct'), box = $('loading');
    // 用主题草原背景衬底
    box.style.backgroundImage = 'url(assets/b_grass.png)';
    let v = 0; box.style.display = 'flex';
    const tick = () => {
      v = Math.min(100, v + 6 + Math.random() * 12);
      fill.style.width = v + '%'; pct.textContent = Math.floor(v) + '%';
      if (v < 100) setTimeout(tick, 130 + Math.random() * 120);
      else setTimeout(() => { box.style.opacity = '0'; box.style.transition = 'opacity .45s'; setTimeout(() => { box.style.display = 'none'; then(); }, 460); }, 350);
    };
    tick();
  }

  /* ---------- 主循环 ---------- */
  let last = 0;
  function frame(t) { if (!last) last = t; let dt = (t - last) / 1000; last = t; if (dt > .05) dt = .05; dt *= speed; anim += dt; if (state && $('unlock').style.display !== 'flex' && !cutBusy && !settingsBusy) { if (tut.active && state.towers.length > 0) tutOnEvent('build'); if (!paused && !tut.active) E.update(state, dt); render(); syncHud(); if (tut.active) renderTutStep(); } requestAnimationFrame(frame); }
  requestAnimationFrame(frame);

  const q = new URLSearchParams(location.search), pn = parseInt(q.get('play') || '0', 10);
  // 调试充值：?gems=99999 / ?chests=99（写入 localStorage，之后正常浏览保留）
  if (q.get('gems') != null) setGems(parseInt(q.get('gems'), 10) || 0);
  if (q.get('chests') != null) setChestStock(parseInt(q.get('chests'), 10) || 0);
  if (pn >= 1) { $('loading').style.display = 'none'; startLevel(pn); }
  else if (q.has('shopdbg')) { $('loading').style.display = 'none'; showShop(); }
  else if (q.has('dexdbg')) { $('loading').style.display = 'none'; showCodex(); const tb = q.get('dexdbg'); if (tb === 'mob' || tb === 'boss') { dexTab = tb; dexSel = 0; renderCodex(); } }
  else if (q.has('homedbg')) { $('loading').style.display = 'none'; showHome(); }
  else if (q.has('chestdbg') || q.has('tutdbg') || q.has('bossdbg')) { $('loading').style.display = 'none'; startLevel(1); }
  else if (q.has('skindbg')) { const [key, id] = (q.get('skindbg') || 'arrow:royal').split(':'); const d = skinData(); d.owned[`${key}_${id}`] = true; d.equip[key] = id; saveSkins(d); $('loading').style.display = 'none'; startLevel(1); }
  else if (q.has('demo') || q.has('menudbg') || q.has('solo') || q.has('vfxtest') || q.has('setdbg')) { $('loading').style.display = 'none'; showMenu(); }
  else runLoading(showHome);   // 正常进入：先播加载页，再进首页
  if (q.has('setdbg')) setTimeout(() => {   // 截图调试：进第1关并打开设置面板
    startLevel(1);
    setTimeout(() => { $('banner').style.display = 'none'; cutBusy = false; unlockQ = []; $('unlock').style.display = 'none'; openSettings(); }, 400);
  }, 200);
  if (q.has('menudbg')) setTimeout(() => {   // 截图调试：展示就地环形菜单
    if (!state) return;
    unlockQ = []; $('unlock').style.display = 'none';
    if (q.get('menudbg') === 'manage') {
      // 找一个能建的点先建塔再升一级，打开管理菜单
      outer: for (let yy = 90; yy < C.VH - 60; yy += 20) for (let xx = 60; xx < C.VW - 60; xx += 20) {
        if (E.canBuild(state, xx, yy).ok) { E.applyCommand(state, { type: 'build', x: xx, y: yy, tower: level.towers[0] }); break outer; }
      }
      const t = state.towers[0]; if (t) { E.applyCommand(state, { type: 'upgrade', id: t.id }); openManage(t); }
    } else {
      outer2: for (let yy = 90; yy < C.VH - 60; yy += 20) for (let xx = 60; xx < C.VW - 60; xx += 20) {
        if (E.canBuild(state, xx, yy).ok) { openBuild(xx, yy); break outer2; }
      }
    }
  }, 500);
  if (q.has('solo')) {   // 截图调试：放一座指定塔并升到L3形象，验证待机精灵表
    const key = q.get('solo') || 'arrow';
    if (pn < 1) startLevel(1); unlockQ = []; $('unlock').style.display = 'none';
    setTimeout(() => {
      state.gold = 99999;
      outer: for (let yy = 110; yy < C.VH - 80; yy += 18) for (let xx = 80; xx < C.VW - 80; xx += 18) {
        if (E.canBuild(state, xx, yy).ok && (level.towers.includes(key) || (level.towers = [...new Set([...level.towers, key])]))) { if (E.applyCommand(state, { type: 'build', x: xx, y: yy, tower: key })) break outer; }
      }
      const t = state.towers[0]; if (t) { E.applyCommand(state, { type: 'upgrade', id: t.id }); E.applyCommand(state, { type: 'upgrade', id: t.id }); E.applyCommand(state, { type: 'branch', id: t.id, branch: 'A' }); E.applyCommand(state, { type: 'select', id: 0 }); }
    }, 300);
  }
  if (q.has('vfxtest')) {   // 确定性战斗截图：建强塔 + 固定步长泵入 update，保证捕捉到弹道/特效/受击
    if (pn < 1) startLevel(parseInt(q.get('vfxtest'), 10) || 14); unlockQ = []; $('unlock').style.display = 'none';
    setTimeout(() => {
      let placed = 0;
      for (let yy = 90; yy < C.VH - 60 && placed < 8; yy += 16) for (let xx = 60; xx < C.VW - 60 && placed < 8; xx += 16) {
        if (!E.canBuild(state, xx, yy).ok) continue;
        const order = ['lightning', 'sniper', 'cannon', 'flame', 'frost', 'poison', 'arrow'].filter((k) => level.towers.includes(k));
        const k = order[placed % order.length];
        if (state.gold >= C.TOWERS[k].cost && E.applyCommand(state, { type: 'build', x: xx, y: yy, tower: k })) { placed++; }
      }
      for (const t of state.towers) { E.applyCommand(state, { type: 'upgrade', id: t.id }); E.applyCommand(state, { type: 'upgrade', id: t.id }); }
      let steps = parseInt(q.get('steps') || '210', 10);   // 有界泵入，跑完即停留最后一帧（避免无限计时器卡住截图）
      const pump = () => { if (state.phase === 'ready') E.applyCommand(state, { type: 'startWave' }); E.update(state, 1 / 30); render(); syncHud(); if (--steps > 0) setTimeout(pump, 16); };
      pump();
    }, 400);
  }
  if (q.has('chestdbg')) {   // 截图调试：放置各类型宝箱 + 展示开箱揭示卡
    setTimeout(() => {
      $('banner').style.display = 'none'; cutBusy = false; unlockQ = []; $('unlock').style.display = 'none'; tut.active = false; $('tut').style.display = 'none';
      state.gold = 9999; const spots = [];
      for (let yy = 120; yy < C.VH - 90 && spots.length < 8; yy += 14) for (let xx = 130; xx < C.VW - 130 && spots.length < 8; xx += 14) { if (E.canPlaceChest(state, xx, yy).ok && spots.every((p) => Math.hypot(p.x - xx, p.y - yy) > 120)) spots.push({ x: xx, y: yy }); }
      C.CHEST_ITEMS.forEach((it, i) => { if (spots[i]) E.applyCommand(state, { type: 'placeChest', x: spots[i].x, y: spots[i].y, item: it }); });
      updateChestBtn();
      if (q.get('chestdbg') === 'reveal') setTimeout(() => { tut.active = false; $('tut').style.display = 'none'; showChestReveal(C.CHEST_ITEMS[5]); }, 2200);
    }, 400);
  }
  if (q.has('tutdbg')) {   // 截图调试：强制第1关新手引导
    localStorage.removeItem(TUTKEY);
    setTimeout(() => { $('banner').style.display = 'none'; cutBusy = false; unlockQ = []; $('unlock').style.display = 'none'; tutStart(1); const step = parseInt(q.get('tutdbg'), 10); if (step > 0) { tut.step = Math.min(tut.steps.length - 1, step); renderTutStep(); } }, 2100);
  }
  if (q.has('skindbg')) {   // 截图调试：装备皮肤后游戏内是否换装
    setTimeout(() => {
      $('banner').style.display = 'none'; cutBusy = false; unlockQ = []; $('unlock').style.display = 'none'; tut.active = false; $('tut').style.display = 'none';
      const key = (q.get('skindbg') || 'arrow:royal').split(':')[0];
      if (!level.towers.includes(key)) level.towers = [...new Set([...level.towers, key])];
      ensureSkinSheets(key); state.gold = 99999;
      outer: for (let yy = 120; yy < C.VH - 90; yy += 14) for (let xx = 130; xx < C.VW - 130; xx += 14) {
        if (E.canBuild(state, xx, yy).ok && E.applyCommand(state, { type: 'build', x: xx, y: yy, tower: key })) { const t = state.towers[state.towers.length - 1]; E.applyCommand(state, { type: 'upgrade', id: t.id }); E.applyCommand(state, { type: 'upgrade', id: t.id }); E.applyCommand(state, { type: 'select', id: 0 }); break outer; }
      }
    }, 500);
  }
  if (q.has('bossdbg')) {   // 截图调试：Boss 来袭横幅 + 红色警报
    setTimeout(() => { $('unlock').style.display = 'none'; unlockQ = []; tut.active = false; $('tut').style.display = 'none'; playCut('cut_boss_' + level.theme, 'Boss 即将出现', null); bossAlarm(); }, 500);
  }
  if (q.has('demo')) {
    if (pn < 1) startLevel(parseInt(q.get('demo'), 10) || 1); unlockQ = []; $('unlock').style.display = 'none';
    const auto = () => {
      if (!state) return;
      let guard = 0;
      while (state.towers.length < state.maxTowers && guard++ < 30) {
        let placed = false;
        for (let yy = 80; yy < C.VH - 50 && !placed; yy += 26) for (let xx = 50; xx < C.VW - 50 && !placed; xx += 26) {
          if (!E.canBuild(state, xx, yy).ok) continue;
          for (const k of level.towers) { if (state.gold >= C.TOWERS[k].cost) { if (E.applyCommand(state, { type: 'build', x: xx, y: yy, tower: k })) placed = true; break; } }
        }
        if (!placed) break;
      }
      for (const t of state.towers) { const d = C.TOWERS[t.key]; if (!t.branch) { const nx = d.levels[t.level + 1]; if (nx && state.gold >= nx.upgrade + 20) E.applyCommand(state, { type: 'upgrade', id: t.id }); else if (t.level === d.levels.length - 1 && state.gold >= d.branches.A.upgrade) E.applyCommand(state, { type: 'branch', id: t.id, branch: t.id % 2 ? 'A' : 'B' }); } }
      if (state.phase === 'ready') E.applyCommand(state, { type: 'startWave' });
      if (state.phase !== 'won' && state.phase !== 'lost') setTimeout(auto, 1100);
    };
    setTimeout(auto, 700);
  }
})();
