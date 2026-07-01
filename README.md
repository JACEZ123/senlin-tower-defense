# 绿色循环圈 · 微信小程序版

魔兽争霸自定义地图风格的合作塔防，卡通画风（保卫萝卜风格），移动端触控交互。
当前为单人版，逻辑已按多人架构设计（指令驱动 `applyCommand` + 确定性 `update`），后续可接入网络同步。

## 玩法
- 点击平台上的格子 → 弹出建造菜单（箭塔/炮塔/冰塔/毒塔）。
- 点击已建好的塔 → 升级或出售；塔升到满级即**解锁英雄**。
- 英雄登场后，点击地面空白处指挥它移动，平时自动追击并攻击附近的怪。
- 点右上角「出怪」开始一波；守住核心（生命值），打完 15 波获胜。
- 前几波很温和，建一两个塔也能积累金币（新手友好）。

## 运行
1. 用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)打开本目录。
2. AppID 选「测试号」即可（project.config.json 里是 `touristappid`）。
3. 编译预览 / 真机调试。

## 目录
```
app.json / app.js / app.wxss      小程序入口
project.config.json / sitemap.json
game/
  config.js   数值配置（塔/英雄/怪/波次），坐标在 768x1152 虚拟空间
  level.js    火山峡谷关卡：怪物路点 path + 建造槽位 slots
  engine.js   纯逻辑引擎：createState / applyCommand / update（多人就绪）
pages/game/   画布渲染 + 触控交互 + HUD
assets/       已抠图透明 PNG（AI 生成，卡通风）+ 地图大图
```

## 待办（可扩展）
- 第二关：暗黑森林（`assets/map_forest.png` 已就绪，分叉双路）。
- 标题页 / 胜利动画 / Boss 入场图生视频。
- 多人：把 `applyCommand` 指令经房间同步，`update` 用固定步长锁帧。
