/* =========================================================================
 * 动画清单 — 哪些素材是「序列帧精灵表」(由 Agnes 视频抽帧拼成的横向条带)。
 * frames: 横向帧数；fps: 播放速度。渲染器据此循环播放；未列入的素材按整图静态绘制。
 * 所有单位统一烘焙为 8 帧，便于管理。
 * ========================================================================= */
const F = 8;
module.exports = {
  hero_ranger: { frames: F, fps: 10 },
  t_arrow:     { frames: F, fps: 8 },
  t_cannon:    { frames: F, fps: 8 },
  t_frost:     { frames: F, fps: 8 },
  t_poison:    { frames: F, fps: 8 },
  slime:       { frames: F, fps: 12 },
  runner:      { frames: F, fps: 16 },
  tank:        { frames: F, fps: 10 },
  swarm:       { frames: F, fps: 16 },
  boss:        { frames: F, fps: 9 },
  c_arrow:{frames:1,fps:1}, c_cannon:{frames:1,fps:1}, c_frost:{frames:1,fps:1}, c_poison:{frames:1,fps:1},
  c_lightning:{frames:1,fps:1}, c_sniper:{frames:1,fps:1}, c_flame:{frames:1,fps:1}, c_arcane:{frames:1,fps:1},
  tw_arrow_1:{frames:1,fps:1},
  tw_arrow_2:{frames:1,fps:1},
  tw_arrow_3:{frames:16,fps:12},
  tw_cannon_1:{frames:1,fps:1},
  tw_cannon_2:{frames:1,fps:1},
  tw_cannon_3:{frames:1,fps:1},
  tw_frost_1:{frames:1,fps:1},
  tw_frost_2:{frames:1,fps:1},
  tw_frost_3:{frames:1,fps:1},
  tw_poison_1:{frames:1,fps:1},
  tw_poison_2:{frames:1,fps:1},
  tw_poison_3:{frames:1,fps:1},
  tw_lightning_1:{frames:1,fps:1},
  tw_lightning_2:{frames:1,fps:1},
  tw_lightning_3:{frames:1,fps:1},
  tw_sniper_1:{frames:1,fps:1},
  tw_sniper_2:{frames:1,fps:1},
  tw_sniper_3:{frames:1,fps:1},
  tw_flame_1:{frames:1,fps:1},
  tw_flame_2:{frames:1,fps:1},
  tw_flame_3:{frames:1,fps:1},
  tw_arcane_1:{frames:1,fps:1},
  tw_arcane_2:{frames:1,fps:1},
  tw_arcane_3:{frames:1,fps:1},
};
