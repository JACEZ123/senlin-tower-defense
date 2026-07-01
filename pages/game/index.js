/* =========================================================================
 * 游戏页 — 负责：画布初始化、坐标变换（虚拟 768x1152 → 屏幕，CONTAIN 等比）、
 * 渲染循环、触摸交互、把玩家操作翻译成引擎指令。游戏逻辑全在 engine.js。
 * ========================================================================= */
const C = require('../../game/config.js');
const LEVEL = require('../../game/level.js');
const E = require('../../game/engine.js');
const ANIM = require('../../game/anim.js');

const IMG_KEYS = [
  'map_volcano', 'hero_ranger',
  't_arrow', 't_cannon', 't_frost', 't_poison',
  'slime', 'runner', 'tank', 'swarm', 'boss',
];

Page({
  data: {
    screenW: 360, screenH: 640, safeTop: 20, safeBottom: 20,
    gold: 0, lives: 0, wave: 0, totalWaves: C.TOTAL_WAVES, phase: 'ready',
    shop: [], popup: { show: false },
  },

  onLoad() {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const screenW = info.windowWidth, screenH = info.windowHeight;
    const safe = info.safeArea || { top: 20, bottom: screenH - 20 };
    this.dpr = info.pixelRatio || 2;

    // CONTAIN：整张地图都可见，上下留边
    const scale = Math.min(screenW / C.VW, screenH / C.VH);
    this.tf = {
      scale,
      offX: (screenW - C.VW * scale) / 2,
      offY: (screenH - C.VH * scale) / 2,
    };

    const shop = C.TOWER_KEYS.map((k) => ({ key: k, name: C.TOWERS[k].name, cost: C.TOWERS[k].cost, img: C.TOWERS[k].img }));

    this.setData({
      screenW, screenH,
      safeTop: safe.top || 20,
      safeBottom: Math.max(20, screenH - (safe.bottom || screenH - 20)),
      shop,
    });

    this.state = E.createState(LEVEL);
    this.imgs = {};
    this._hud = {};
  },

  onReady() {
    const q = wx.createSelectorQuery();
    q.select('#game').fields({ node: true, size: true }).exec((res) => {
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      canvas.width = this.data.screenW * this.dpr;
      canvas.height = this.data.screenH * this.dpr;
      ctx.scale(this.dpr, this.dpr);
      this.canvas = canvas; this.ctx = ctx;
      this.loadImages(canvas, () => this.startLoop());
    });
  },

  loadImages(canvas, done) {
    let n = IMG_KEYS.length;
    IMG_KEYS.forEach((k) => {
      const img = canvas.createImage();
      img.onload = () => { this.imgs[k] = img; if (--n === 0) done(); };
      img.onerror = () => { if (--n === 0) done(); };
      img.src = `/assets/${k}.png`;
    });
  },

  startLoop() {
    this.last = 0; this.anim = 0;
    const frame = (t) => {
      if (!this.last) this.last = t;
      let dt = (t - this.last) / 1000; this.last = t;
      if (dt > 0.05) dt = 0.05;
      this.anim += dt;
      E.update(this.state, dt);
      this.render();
      this.syncHud();
      this._raf = this.canvas.requestAnimationFrame(frame);
    };
    this._raf = this.canvas.requestAnimationFrame(frame);
  },

  onUnload() { if (this._raf) this.canvas.cancelAnimationFrame(this._raf); },

  /* ----------------- 坐标变换 ----------------- */
  vx(x) { return this.tf.offX + x * this.tf.scale; },
  vy(y) { return this.tf.offY + y * this.tf.scale; },
  vk(s) { return s * this.tf.scale; },
  toVirtual(sx, sy) { return { x: (sx - this.tf.offX) / this.tf.scale, y: (sy - this.tf.offY) / this.tf.scale }; },

  /* 绘制单位：序列帧精灵表则播放当前帧，否则整图。
   * key=图片键, cx/cy=虚拟坐标, targetH=虚拟目标高, footFrac=锚点(底部贴合比例) */
  drawSprite(key, cx, cy, targetH, footFrac) {
    const img = this.imgs[key]; if (!img) return;
    const a = ANIM[key];
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (a && a.frames > 1) {
      sw = img.width / a.frames;
      const fi = Math.floor(this.anim * a.fps) % a.frames;
      sx = fi * sw;
    }
    const h = this.vk(targetH), w = h * (sw / sh);
    const dx = this.vx(cx) - w / 2, dy = this.vy(cy) - h * (footFrac == null ? 0.82 : footFrac);
    this.ctx.drawImage(img, sx, sy, sw, sh, dx, dy, w, h);
  },

  /* ----------------- 渲染 ----------------- */
  render() {
    const ctx = this.ctx, s = this.state;
    ctx.clearRect(0, 0, this.data.screenW, this.data.screenH);

    // 地图
    const map = this.imgs.map_volcano;
    if (map) ctx.drawImage(map, this.vx(0), this.vy(0), this.vk(C.VW), this.vk(C.VH));
    else { ctx.fillStyle = '#2a1812'; ctx.fillRect(this.vx(0), this.vy(0), this.vk(C.VW), this.vk(C.VH)); }

    // 空槽位标记
    for (let i = 0; i < s.level.slots.length; i++) {
      if (s.towers.find((t) => t.slot === i)) continue;
      const p = s.level.slots[i];
      ctx.beginPath();
      ctx.arc(this.vx(p.x), this.vy(p.y), this.vk(22), 0, Math.PI * 2);
      ctx.fillStyle = (i === s.selectedSlot) ? 'rgba(255,210,90,0.35)' : 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.lineWidth = this.vk(2);
      ctx.strokeStyle = 'rgba(255,210,120,0.55)';
      ctx.stroke();
      // 加号
      ctx.strokeStyle = 'rgba(255,235,180,0.8)'; ctx.lineWidth = this.vk(3);
      const cx = this.vx(p.x), cy = this.vy(p.y), r = this.vk(9);
      ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
    }

    // 选中塔的射程
    if (s.selectedSlot >= 0) {
      const t = s.towers.find((x) => x.slot === s.selectedSlot);
      if (t) {
        const lv = C.TOWERS[t.key].levels[t.level];
        ctx.beginPath();
        ctx.arc(this.vx(t.x), this.vy(t.y), this.vk(lv.range), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(120,200,255,0.12)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,200,255,0.5)'; ctx.lineWidth = this.vk(2); ctx.stroke();
      }
    }

    // 塔
    for (const t of s.towers) {
      this.drawSprite(C.TOWERS[t.key].img, t.x, t.y, 74, 0.82);
      // 等级点
      const lvl = t.level + 1;
      for (let k = 0; k < lvl; k++) {
        ctx.beginPath();
        ctx.arc(this.vx(t.x) - this.vk(12) + this.vk(12) * k, this.vy(t.y) + this.vk(14), this.vk(3.2), 0, Math.PI * 2);
        ctx.fillStyle = '#ffd23f'; ctx.fill();
      }
    }

    // 敌人
    for (const e of s.enemies) {
      const h = this.vk(e.def.size);
      if (this.imgs[e.def.img]) {
        this.drawSprite(e.def.img, e.x, e.y, e.def.size, 0.85);
      } else {
        ctx.beginPath(); ctx.arc(this.vx(e.x), this.vy(e.y), this.vk(e.def.size * 0.35), 0, Math.PI * 2);
        ctx.fillStyle = '#c0392b'; ctx.fill();
      }
      // 血条
      const bw = this.vk(e.def.size * 0.7), bh = this.vk(6);
      const bx = this.vx(e.x) - bw / 2, by = this.vy(e.y) - h * 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx, by, bw, bh);
      const ratio = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = ratio > 0.5 ? '#7CFC4D' : ratio > 0.25 ? '#ffd23f' : '#ff5a4d';
      ctx.fillRect(bx, by, bw * ratio, bh);
      if (e.slowT > 0) { ctx.fillStyle = 'rgba(120,220,255,0.6)'; ctx.fillRect(bx, by - bh - 1, bw, bh * 0.5); }
    }

    // 子弹
    for (const b of s.bullets) {
      ctx.beginPath();
      ctx.arc(this.vx(b.x), this.vy(b.y), this.vk(b.r), 0, Math.PI * 2);
      ctx.fillStyle = b.color; ctx.fill();
    }

    // 英雄
    if (s.hero) {
      // 移动目标标记
      if (E.dist(s.hero.x, s.hero.y, s.hero.tx, s.hero.ty) > 4) {
        ctx.beginPath(); ctx.arc(this.vx(s.hero.tx), this.vy(s.hero.ty), this.vk(10), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(182,255,90,0.8)'; ctx.lineWidth = this.vk(2.5); ctx.stroke();
      }
      // 脚下光环
      ctx.beginPath(); ctx.ellipse(this.vx(s.hero.x), this.vy(s.hero.y), this.vk(26), this.vk(11), 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(182,255,90,0.22)'; ctx.fill();
      this.drawSprite('hero_ranger', s.hero.x, s.hero.y, 96, 0.86);
    }

    // 飘字
    for (const f of s.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t);
      ctx.fillStyle = f.color; ctx.font = `bold ${this.vk(22)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, this.vx(f.x), this.vy(f.y) - this.vk(30) - f.t * this.vk(24));
      ctx.globalAlpha = 1;
    }
  },

  /* ----------------- HUD 同步（仅变化时 setData） ----------------- */
  syncHud() {
    const s = this.state, h = this._hud;
    const g = Math.floor(s.gold);
    if (h.gold === g && h.lives === s.lives && h.wave === s.wave && h.phase === s.phase) return;
    h.gold = g; h.lives = s.lives; h.wave = s.wave; h.phase = s.phase;
    this.setData({ gold: g, lives: s.lives, wave: s.wave, phase: s.phase });
  },

  /* ----------------- 交互 ----------------- */
  onTouch(e) {
    const t = e.touches[0] || e.changedTouches[0]; if (!t) return;
    const v = this.toVirtual(t.x, t.y);
    const s = this.state;

    // 弹窗开着时，点画布关闭弹窗
    if (this.data.popup.show) { this.onClosePopup(); return; }

    // 命中槽位？
    let hit = -1, best = 40;
    for (let i = 0; i < s.level.slots.length; i++) {
      const p = s.level.slots[i];
      const d = E.dist(v.x, v.y, p.x, p.y);
      if (d < best) { best = d; hit = i; }
    }
    if (hit >= 0) { this.openSlot(hit); return; }

    // 否则：指挥英雄移动
    if (s.hero) E.applyCommand(s, { type: 'moveHero', x: v.x, y: v.y });
  },

  openSlot(slot) {
    const s = this.state;
    E.applyCommand(s, { type: 'select', slot });
    const t = s.towers.find((x) => x.slot === slot);
    if (!t) {
      this.setData({ popup: { show: true, mode: 'build', slot } });
    } else {
      const def = C.TOWERS[t.key];
      const next = def.levels[t.level + 1];
      let spent = def.cost; for (let k = 1; k <= t.level; k++) spent += def.levels[k].upgrade;
      this.setData({
        popup: {
          show: true, mode: 'manage', slot,
          name: def.name, lvText: '等级 ' + (t.level + 1),
          canUp: !!next, upCost: next ? next.upgrade : 0,
          refund: Math.floor(spent * 0.6),
          heroHint: (t.level === def.levels.length - 1),
        },
      });
    }
  },

  onBuild(e) {
    const key = e.currentTarget.dataset.key;
    const slot = this.data.popup.slot;
    if (E.applyCommand(this.state, { type: 'build', slot, tower: key })) this.onClosePopup();
  },

  onUpgrade() {
    const slot = this.data.popup.slot;
    if (E.applyCommand(this.state, { type: 'upgrade', slot })) this.openSlot(slot);
  },

  onSell() {
    const slot = this.data.popup.slot;
    E.applyCommand(this.state, { type: 'sell', slot });
    this.onClosePopup();
  },

  onClosePopup() {
    E.applyCommand(this.state, { type: 'select', slot: -1 });
    this.setData({ popup: { show: false } });
  },

  onStartWave() { E.applyCommand(this.state, { type: 'startWave' }); },

  onRestart() {
    this.state = E.createState(LEVEL);
    this._hud = {};
    this.setData({ popup: { show: false } });
  },
});
