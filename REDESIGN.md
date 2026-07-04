# CyrusOS 重设计方向书 —— 代号 SOVEREIGN(君主终端)

> **本文件是本次全面重设计的唯一方向来源。** 所有参与实现的代理动工前必读本文
> + [ARCHITECTURE.md](./ARCHITECTURE.md)(现状地图)+ [CLAUDE.md](./CLAUDE.md)(红线)
> + `.claude/skills/typeui-design-system/SKILL.md`(Kinetic 结构规范,绑定级)。
> 方向裁定权在总监督(主会话),实现代理不得自行更改本文所定方向。

状态:**P0 地基完成(v7.32.0,2026-07-05,4 个 Opus 子代理并行交付)**;P1 未动工。
定稿日 2026-07-05。

---

## §0 决策记录(用户已拍板,不再重议)

| # | 决策 | 内容 |
|---|---|---|
| D1 | **单一旗舰主题** | 新设计「君主终端」成为 CyrusOS 唯一身份。cappa / sterile / terminal / monarch 四主题连同主题切换按钮全部退役(代码归档删除,`settings.theme` 旧值静默迁移为默认)。 |
| D2 | **typeui 基底 = Kinetic** | Kinetic 管「骨」(结构/排版/密度/组件规范,绑定级);我们管「魂」(品牌色由动能黄换成君主紫 + 自研辉光/斜切层)。fundamentals 守门文件(a11y/间距/排版)同为绑定级。 |
| D3 | **渲染层定点重构** | 主页各面板从 innerHTML 全量重绘改为「外壳+骨架稳定,只局部更新数据文本/状态类」。不引框架,仍是 vanilla。这是深度动效的前提。 |
| D4 | **分级特效·手机同权** | 桌面全编排,手机自动降级(粒子减半、blur 减半、Three.js 场景可关),但交互手感(音效/触觉节奏/转场时序)两端完全一致。爽感来自时序而非像素量。 |

范围裁定(总监督):**信息架构不动**。主页区块(The 90 / 晨间仪式 / 三卡 /
待办)、7 个 HUD 频道、SAO 导览抽屉的概念全部保留——重设计的对象是**视觉语言、
交互编排、渲染层**,不是功能布局。SAO 导览及其 mp3 音效是已被验证喜爱的资产,升级
不推翻。

---

## §1 设计愿景

**一句话:一台由暗影君主执掌的战术终端。**

- 《明日方舟:终末地》给**结构**:工程感、密集数据、精准的直线与斜切、mono 微标签、
  克制到近乎冷淡的界面纪律。
- 《我独自升级》的君主给**灵魂**:虚空紫、稀缺而有分量的辉光、"系统窗"降临的仪式感、
  等级/暗影军团的权力叙事(RPG 系统层已有,视觉上补足)。

### 三条北极星(每个设计决定都要能对上其中一条)

1. **结构即终端** —— 界面 95% 的时间是一台克制、扁平、精密的仪器。信息密度是美学,
   不是负担。
2. **辉光即权柄** —— 发光是稀缺资源。它只出现在"系统承认你"的时刻:HUD 展开、
   升级、满勤、连击。滥用辉光 = 中二;配额辉光 = 高级。
3. **爽感即时序** —— awwwards 级的"用起来爽"来自动效-音效-触觉的毫秒级同步编排
   (choreography),不来自更多的粒子。每个交互都有起手-确认-余韵三拍。

### 反面清单(什么会让它变中二/变宅——全部禁止)

- ❌ 满屏常驻辉光、彩虹渐变、镜头光晕滥用
- ❌ 漫画感字体、锯齿状"能量"字效、红黑闪电俗套
- ❌ 无意义的装饰性日文/英文乱码堆砌(终末地的微标签都是真实数据——我们的也必须是:
  真时间戳、真版本号、真统计值)
- ❌ 动漫立绘、角色形象、"影子士兵"具象化
- ❌ 每次点击都放大招——日常操作(勾选、切 tab)必须轻、快、几乎无声
- ❌ 加载动画超过 800ms 的自我陶醉

---

## §2 设计语言规范(SOVEREIGN 语言)

### 2.1 色彩 —— Kinetic 结构 × 君主调色

Kinetic 的色彩角色(单一表面、卡片浮于更亮一档、brand 承载主行动)全盘保留,
仅做色相置换:

| 角色 | Kinetic 原值 | SOVEREIGN 置换 | 备注 |
|---|---|---|---|
| 表面(唯一,不条纹交替) | `#0E1312`(暗) | **`#08060F`** 虚空紫黑 | 承自 theme-monarch,已验证 |
| 卡片(浮起=更亮一档) | 亮一档派生 | `#120D22` → `#1A1330` 两级 | 无边框、无阴影,靠明度浮起 |
| brand(主行动/链接) | 动能黄 | **`#9D7BE6`** 君主紫 | 深色 label 反白按 Kinetic 对比规则重算 |
| brand 亮态/辉光源 | — | **`#B892FF`** | 只用于辉光配额场景 |
| 次强调 | 深海军蓝 | `#241B45` 暗紫蓝 | 面板结构线、次级填充 |
| success / danger / warning | 各语义色 | 保留语义,向紫底重校(danger 偏品红红 `#FF5C7A` 系,warning 偏琥珀) | 只表状态,永不装饰 |
| **典礼金**(新增,唯一例外色) | — | `#E8C878` 系(承自 cappa 黄铜) | **只给成就/升级/满勤的仪式时刻**,静息界面绝不出现。黄铜的记忆以此保留一缕 |

对比度按 fundamentals:所有状态(含 hover 中间帧)WCAG 2.2 AA。

### 2.2 排版

- **UI 基线**:JetBrains Mono,14px 紧凑刻度(Kinetic 绑定)。数字、时间、金额、
  统计一律 mono——这本身就是终端感的主要来源。
- **中文搭配**:JetBrains Mono 无 CJK。中文正文/标题配 **Noto Sans SC**(已在字体栈),
  微标签中文可用 mono 数字+黑体汉字混排。
- **展示层级**(大标题/日期/称号):Oswald 保留作 display(theme-terminal 已验证),
  压缩字距、全大写英文微标签。Cormorant Garamond 衬线体随 cappa 退役。
- **微标签系统**(终末地签名):每个面板左上/右上的 mono 小字——模块编号
  (`SYS.01 // THE-90`)、真实时间戳、真实统计。全部来自真数据,禁止装饰乱码。
- **字体自托管**:JetBrains Mono / Noto Sans SC / Oswald 下载进 `vendor/fonts/`,
  `@font-face` + `font-display: swap`,加入 APP_SHELL。Google Fonts CDN 退役
  (离线 PWA 隐患,审计已确认)。

### 2.3 形状

双层形状体系(解决 Kinetic 4px 与终末地斜切的表面冲突):

- **组件壳**(按钮/输入框/下拉/弹框/表格/徽章):**4px**(`radius-xxl`),
  toggle/badge 全 pill——Kinetic 绑定,一个不改。
- **面板/HUD 级**(结构层,typeui 管不到的"section"层):**斜切角 clip-path**
  (theme-terminal 的 16px 斜切是正确起点)+ 1px hairline 结构线 + 左上警示刻线
  换成紫。斜切只出现在面板级,组件级绝不斜切——层级差本身就是设计。
- 分隔:Kinetic 渐变分隔线(中央 hairline 向两侧淡出),不用实线。

### 2.4 材质与辉光配额(本设计最重要的一张表)

基调:**flat-first,无阴影**(Kinetic 绑定)。玻璃与辉光是受配额管制的例外:

| 层 | 允许的材质/辉光 | 上限 |
|---|---|---|
| 静息面板/卡片 | 纯色浮起,无 blur 无辉光无阴影 | — |
| 悬停/聚焦组件 | 4px brand 焦点环;hover 只变填充/边线 | 无发光 |
| HUD 遮罩层(打开时) | backdrop blur(桌面 ≤16px,手机 ≤8px) | 同屏 **1 个** |
| 悬浮层(下拉/菜单) | Kinetic 规定的 medium shadow(唯一阴影例外) | — |
| **仪式时刻**(HUD 展开、升级、rankup、满勤、渡低谷) | `#B892FF` 辉光 + 典礼金 + 粒子爆发,800ms 内收场 | 一次一个 |
| 背景氛围层 | energyflow 能量丝(紫)+ 微弱环境明暗呼吸 | 常驻但 opacity ≤0.5 |

> 现状 blur(26px) 玻璃全面退役。这是性能预算最大的一笔回收,拿它去换 Three.js 场景。

### 2.5 动效语法

- **时长/缓动 token 保留**并扩充:`--dur-fast/base/slow/slower` + 新增
  `--dur-ritual (800ms)`;easing 沿用 `--ease-silk/drawer/press`。
- **三拍原则**:起手(anticipation,≤80ms)→ 确认(主动作)→ 余韵(settle,
  微过冲或残光)。勾选一个待办也有三拍,只是每拍都在 50ms 量级。
- **编排词汇**(GSAP,升级现有资产):
  - `glassFlicker` 逐字符闪现 → 保留,更名并调优为**终端点亮**(它天生就是终端语言);
  - `sysScrollOpen` 卷轴展开 → **退役**,替换为「系统窗降临」:斜切外框先以 1px 线
    描边成形(120ms)→ 面板体积从中线展开(240ms)→ 内容逐区块点亮(stagger)
    ——这是全应用最大的仪式时刻,配 HUD 开启音;
  - 数字变化一律滚动补间(现有 `animateNumber` 升级为 mono 逐位翻牌);
  - 滚动叙事(Lenis + ScrollTrigger)保留:粘性堆叠卡、视差保留但重新调性;
  - FLIP/View Transitions 聚焦飞行保留(已是最先进实现)。
- **prefers-reduced-motion** 全覆盖(现有纪律延续)。

### 2.6 Three.js / Canvas 场景(游戏感的主载体)

预算:**同屏 WebGL context 恒为 1**,DPR≤2,不可见即暂停(现有纪律)。

1. **energyflow 升级为主背景**:2D canvas 能量丝 → 保留架构,调紫、加深度分层
   (前景丝更亮更快、背景丝更暗更慢),它已是三主题验证过的最稳资产。
2. **herocube 退役,换「君主徽记」**:App 图标的紫「C」徽纹(v7.30 已做)转为
   Three.js 线框浮雕,呼吸悬浮于 The 90 面板后,升级/满勤时短暂点亮。一个场景,
   讲一个故事,不贪多。
3. **lifetree 归档**(随 sterile 退役)。粒子系统骨架保留在 git 历史,徽记场景可复用
   其 settled 优化与 context-loss 恢复代码。
4. 手机端:徽记场景默认降为静态 SVG + CSS 呼吸,energyflow 条数减半(现有降级逻辑)。

### 2.7 声音

Sfx 合成引擎与 17 个 cue **全部保留**(零成本、离线、已调优)。重设计只做映射校对:
新「系统窗降临」动画的时间轴要与 `open` cue 逐毫秒对齐;SAO 导览 mp3 保留。
新增唯一 cue:`sovereign`(升级仪式的低频降临音,复用 rankup 变体即可,不必新写)。

### 2.8 图标

- 黄铜浮雕 PNG(icons/nav/)与 inline SVG 杂烩 → 统一换 **Lucide outline**
  (Kinetic 绑定:线性图标、真图标库),vendored 单文件 SVG sprite,不走 CDN。
- App 图标/封面(君主紫徽记,v7.30-31)**保留不动**——它已经是新方向的定调之作。

---

## §3 不要做清单(Do NOT)

**产品红线(CLAUDE.md 四条金律,原文有效):**
1. 财务只插入,永不改史;2. 币种是账户属性;3. 不碰 secrets(repo 公开);
4. RLS 派生 user_id。

**本次重设计新增红线:**
5. 不改信息架构、不改数据层、不改 sync/state 逻辑——只动 styles/、渲染函数的
   DOM 生成部分、glass.js/drawer.js/theme 相关、index.html 结构层。
6. 不引入构建工具/框架/npm 依赖。仍是 vanilla 静态文件。新第三方资产一律 vendored。
7. 不新增常驻 backdrop-filter 表面(配额表 §2.4 之外)。
8. 不在渲染函数里挂副作用(音效/弹窗/写库——ARCHITECTURE.md 渲染纪律原文有效)。
9. 不动 rpg-stats.py 镜像耦合面(§5 ARCHITECTURE.md)——视觉重设计不碰 RPG 数值。
10. 不删除 `settings.theme` 列;旧值(cappa/sterile/terminal/monarch)读到即视为默认,
    静默迁移,不弹任何提示。
11. typeui skill 文件(.claude/skills/、.agents/skills/)**不入公开 repo**——加入
    .gitignore(生成的 workspace 规范,不确认其再分发许可)。
12. 每个 shell 文件改动必 bump `CACHE_VERSION`;APP_SHELL 增删同步(部署纪律原文有效)。

---

## §4 动工前置改造(Phase 0,还债)

审计确认的三笔债,不还清不准开始视觉工作:

1. **主题 guard 收敛**:散落 5+ 处的 `['sterile','terminal','monarch']` 字符串黑白名单
   → 收敛为 `<html data-fx="...">` 能力标志(如 `glass cube trails flow`)。单主题化后
   大部分 guard 直接删除。涉及:herocube.js:10,86 / glass.js:15 / lifetree.js:117,137 /
   theme.js / energyflow.js:27 / index.html:45,48 预绘脚本 / components.css 几十处
   `html:not([data-theme="sterile"])`。
2. **HUD 外壳工厂**:glass.js:390-457 五个逐字重复的包裹函数 → 单一
   `mountHudShell(viewId, opts)`;z-index 魔数收敛为 tokens.css 的 `--z-*` 梯度。
3. **渲染层定点重构**(D3):逐面板把 `rXX()` 拆为「一次性骨架 + `uXX()` 局部更新」。
   迁移顺序(风险从低到高):rMR 晨间 → rJP/rTR/rAC 三卡 → rTodos → rThe90(最复杂,
   450 格热力图已有签名 memo 可依托)→ finance/fitness 系 HUD。每迁一个面板,
   真机回归一次。

**性能预算表(验收硬指标,桌面/手机):**
- 交互响应(勾选→视觉反馈)≤ 50ms;任何常驻动画不掉出 60fps(手机 ≥50fps)
- 同屏 backdrop-filter ≤1,WebGL context =1,DPR≤2
- 首屏可交互(暖缓存 PWA)≤ 1.5s;Lighthouse Perf ≥90(移动端)
- 内存:Three.js 场景常驻 ≤80MB

---

## §5 路线图与子代理分工(3–5 个 Opus 4.8 实现代理)

总监督(本会话)负责:方向裁定、每阶段验收、压力测试。实现代理不得跨阶段自作主张。

| 阶段 | 内容 | 代理 | 验收标准 |
|---|---|---|---|
| **P0 地基** | §4 三笔债 + 字体自托管 + .gitignore | A1(重构专职) | 全功能零回归(真机),无视觉变化,`node --check` 全绿 |
| **P1 token & 外壳** | tokens.css 重写为 SOVEREIGN 语言;面板斜切结构;旧主题 css 退役归档;微标签系统;图标置换 | A2(设计系统专职,读 Kinetic skill 全量) | 静态视觉全站成立,对比度 AA 全过,截图评审 |
| **P2 动效编排** | 系统窗降临、终端点亮、三拍交互、数字翻牌、滚动叙事重调 | A3(GSAP 专职) | 每个动效与音效时间轴对齐;reduced-motion 全退化;60fps |
| **P3 场景层** | energyflow 紫化分层、君主徽记 Three.js 场景、仪式时刻粒子 | A4(WebGL 专职) | 性能预算表全达标,context-loss 恢复,手机降级路径实测 |
| **P4 HUD 精修** | 7 频道逐个套用新语言(FIN 最重,最后做) | A2+A3 并行分包 | 每 HUD 单独真机验收 |
| **P5 压测** | 总监督主导:真机双端、离线、慢网、低电量模式、a11y、金律回归 | 总监督+1 审计代理 | 全项通过才准 bump 大版本上线 |

各阶段独立 commit 系列、独立 CACHE_VERSION bump,任一阶段可单独回滚。
P1 起每阶段先出**The 90 面板单板样张**(它是最大最复杂区块)给用户过目,批准后再铺全站。

---

## §6 现状资产处置清单

| 资产 | 处置 |
|---|---|
| tokens.css 语义 token 架构 | **保留架构**,值全换 |
| Sfx 音效引擎 + SAO mp3 | **保留** |
| GSAP/Lenis/Three vendor | **保留**(动效编排的地基) |
| glassFlicker / FLIP 聚焦 / View Transitions / 粘性堆叠 | **保留升级** |
| energyflow | **保留升级**(主背景) |
| sysScrollOpen 卷轴 | **退役**(换系统窗降临) |
| herocube / lifetree / ambient.js | **归档退役** |
| theme-cappa(:root 默认值)/ sterile / terminal / monarch css | **退役**(terminal 的斜切与 monarch 的调色被吸收进新语言) |
| brassFlow 流光 | **退役**(身份宣言文字改用终端点亮;典礼金只在仪式时刻) |
| 黄铜浮雕导览图标 | **退役**(换 Lucide outline;PNG 留在 git 历史) |
| Cormorant Garamond 衬线 | **退役** |
| 主题切换按钮 + theme.js 循环 | **退役**(theme.js 缩为遗留值迁移垫片) |
