# CYRUS://NEXT — 宪法(场景优先的全新 CyrusOS)

> 教训:上一轮改版保留了旧信息架构,做成了"换皮"。NEXT 的第一原则:
> **场景优先,内容长在场景里**。这不是一个"有背景动画的页面",这是一个
> "可以住进去的终端"。

## 判据(Awwwards 级的可操作定义)
1. 打开后 10 秒内必须有一次"哇"(开机仪式 → 甲板显形)。
2. 每一次交互都有物理感(相机运动、惯性、音画同步)。
3. 截任何一帧都能当壁纸。
4. 但它仍是每天要用的工具:任何核心操作(看今日状态、进模块)≤2 次点击,
   动画绝不挡路(可跳过/可加速)。

## 灵魂:终末地终端(terminal 回归)
- 底:`#0A0B06` 战术暗;主强调:警示黄 `#EFE000`/`#C9C90E`;
  信息青 `#38D9D0`(次强调,克制);危险红仅表状态。
- 黄是**刻线与标签**,不是泛光——辉光配额同旧法(仪式时刻才发光)。
- 排版:JetBrains Mono 基线 + Oswald display;微标签全真实数据,禁装饰乱码。
- 形状:斜切、hairline、战术网格、reticle 十字准星光标、目标锁定框。

## 场景结构(COMMAND DECK)
- **开机序列**(≤1.6s,点击可跳):终端自检文字流 → 网格地面从线扫描成形。
- **主场景**:Three.js 倾斜俯视战术甲板——
  - 中央:**The 90 数据碑阵**(90 根线框光柱 = 90 天,高度/亮度 = 当日达标度,
    今日柱呼吸;这是场景的心脏,也是数据的真身)。
  - 环绕:6 个模块站点(低多边形线框结构体 + 黄色悬浮标签:MORNING /
    ACADEMICS / JP-N2 / TRADING / TODOS / SYSTEM)。
  - 相机:受限 orbit(拖拽微视差)+ 滚动推进;点击站点 = GSAP 相机飞近 →
    DOM overlay HUD(斜切面板)展开承载真实交互(3D 只做场景,表单/清单
    永远是 DOM——可访问性与手感)。
- **HUD overlay 层**:斜切面板、mono 数据网格、扫描线;Esc/背板返回甲板。

## 技术与预算(硬约束)
- 栈:vanilla + `../vendor/`(gsap/ScrollTrigger/SplitText/lenis/three.module)。
  禁新依赖、禁构建工具。文件:`next/index.html` + `next/style.css` + `next/main.js`
  (+按需 `next/scene.js`),自包含,Pages 直接跑 `/next/`。
- 单 WebGL context、DPR≤2、不可见暂停、context-loss 恢复;
  手机 60fps 优先于视觉密度(降质不降玩法);reduced-motion → 静态俯视图。
- **本阶段全部假数据**,但形状必须真实(90 天×5 柱、真日期、可信的完成率),
  数据接口集中在一个 `MOCK` 对象——接真数据时只换这一处(数据层沿用主 app 的
  Supabase 管线,后续阶段做)。
- 音效:可复用 `../scripts/sound.js` 的合成引擎思路,或先内联极简 WebAudio
  cue(开机/锁定/展开三个即可);遵守手势门闸。

## 与主 app 的关系
- 主 app(/)原样运行,零改动;NEXT 平行生长于 /next/。
- 不进 sw.js APP_SHELL(network-only,原型期无需离线)。
- 谁都不许 import 主 app 的渲染/主题代码——NEXT 无历史包袱。
