# CyrusOS · 活体架构地图（ARCHITECTURE.md）

> **对齐版本:`cyrus-os-v7.40.0`**(= sw.js CACHE_VERSION;版本叙事在 [CHANGELOG.md](./CHANGELOG.md),本文件只描述现状。v7.40.0:**减法**——按 2026-08-25 真实使用数据审查,收缩为五件套核心:打卡(morning + the90 赛季记分板 + rpg/lowday)、待办 todos、日历 calendar、信条 principles、账本 finance。下架并删除模块:健身 fitness、AI 产出日志 ai、心愿单 store、课业 academics、日语 japanese、动力墙 motivation、Hermes 通知 hermes、Web 推送 notifications(含 sw.js push 处理与 cloudflare/ worker)、markets(原已退役)。交易台面板保留但默认收起(v7.39.0 面板归档机制)。**下架 ≠ 删数据:全部 Supabase 表与历史行原样保留**,只是前端不再读写(§3 标 ❄)。EC2/Hermes 服务端已停用,由云端「早间简报」(Claude 定时任务,读 Supabase)取代。利息自动入账已关(2026-08-25 fin_accounts.interest_rate 全部归零,pg_cron fin_accrue_interest 变 no-op)。方向书 REDESIGN.md;实现代理必读 AGENT-BRIEF.md。)
> 两者不一致即说明本文档已开始腐烂，修文档）。最后全面核对：2026-06-11。

**这份文档的用途**：动工前读它，代替考古式读码。红线与部署纪律在
[CLAUDE.md](./CLAUDE.md)，从零搭建在 [DEPLOYMENT.md](./DEPLOYMENT.md)，本文负责
"系统长什么样、东西在哪、怎么接"。

## 维护律（本文档自己的规则）

1. **结构性改动 = 文档同 commit**。新文件 / 新表 / 新约定 / 时序变化的 commit
   必须同步更新本文对应小节，否则视为未完成。纯数值调整（音量 gain、颜色、文案）不必动文档。
2. 文首"对齐版本"随每次 `CACHE_VERSION` bump 更新。
3. 发现文档与代码不符：以代码为准，**当场修文档**（哪怕只改一行）。

---

## §1 环境与部署拓扑（先读这节，避免找错机器）

### 三层环境

| 层 | 路径 | 性质 |
|---|---|---|
| Windows | `C:\Users\qjuna\OneDrive\Desktop\Hermes Agent` | Claude 会话工作目录；**内容陈旧**，不是真实代码 |
| WSL Ubuntu | `~/cyrus-os`（本仓库）+ `~/hermes-cyrus` | **真实代码与 git**；从 Windows 经 `\\wsl.localhost\Ubuntu\home\cyrus1108\...` 访问（此 UNC 桥偶发 EUNKNOWN 瞬断，重试即可） |
| EC2（东京） | ~~实例 `i-054241bf9badb9655`~~ | **已退役**(2026-08-25 确认 SSM 已探不到实例;Hermes 由云端早间简报取代)。下方 SSM 用法仅存档 |

EC2 访问（无 SSH，走 SSM）：
```bash
# 在 WSL 中（aws CLI 在交互 shell 的 PATH 里 → 用 bash -ic）
aws ssm send-command --profile hermes --region ap-northeast-1 \
  --instance-ids i-054241bf9badb9655 --document-name AWS-RunShellScript \
  --parameters '{"commands":["sudo -u ubuntu bash -c \"...\""]}'
aws ssm get-command-invocation --profile hermes --region ap-northeast-1 \
  --instance-id i-054241bf9badb9655 --command-id <id>
```
已知坑：EC2 的 `~/hermes-cyrus` 是 SSH remote 但**没有 deploy key**（git pull 会
Permission denied）；SSM 以非 ubuntu 用户跑会触发 git `safe.directory` 拒绝。
绕法：文件 base64 分块经 SSM 写入（先例：rpg-stats.py 的部署，2026-06-10）。

### 三个部署面

| 面 | 怎么部署 | 备注 |
|---|---|---|
| PWA（GitHub Pages） | `git push origin main` 即部署 | **改 shell 文件必须先 bump `sw.js` 的 `CACHE_VERSION`**；纯文档不 bump |
| ~~EC2（crons + skills）~~ | — | **已退役**(v7.40.0) |
| ~~Cloudflare Worker~~ | — | **代码已删**(v7.40.0,推送订阅数为 0);线上实例待 dashboard/`wrangler delete` 撤销(持有 service key),见 §7 |

### 系统图

```
┌─ PWA (GitHub Pages, 离线 SW 缓存) ──────────────┐
│ index.html + 28 JS + 10 CSS  (vanilla, 无构建) │
└──────┬──────────────────────────────────────────┘
       │ supabase-js (anon key, RLS)        ┌─ Cloudflare Worker (每分钟 cron)
       ▼                                    │   提醒推送 + RPG 早晚推送 (Web Push,
  Supabase Postgres ◄───────────────────────┘   VAPID + aes128gcm; service key)
   25 张表 · RLS=auth.uid() · Realtime · pg_cron(周期交易/资产快照/已完成清理)
       ▲ REST (service key, 只读为主 + hermes_notices/fin_transactions 写)
       │
┌─ EC2 ~/.hermes (systemd: hermes.service) ────────────────────────────┐
│ Nous Hermes Agent gateway (Telegram 双向, Haiku 默认)                │
│ cron: 06:55 morning-brief / 21:00 evening-checkin / 21:30周日 weekly │
│       (Gemini Flash-Lite 合成, rpg-stats.py 出「系统」战报)          │
└──────────────────────────────────────────────► Telegram             │
```

> **v7.40.0 起系统图只剩两层:PWA ↔ Supabase。** 上图中 Cloudflare Worker(推送)与 EC2/Hermes(Telegram 战报)均已退役;服务端仅存 Supabase pg_cron(资产快照/周期交易/已完成清理;利息任务因利率归零变 no-op)。

---

## §2 前端模块地图

### 脚本加载顺序（index.html 底部）

Supabase CDN → `supabase.js`(sb 客户端) → `state.js`(S/TODAY/常量/saveXX/dirty)
→ `vendor/`（gsap + ScrollTrigger + SplitText + lenis，UMD 本地化供离线；GSAP
3.13 起全插件免费）→ 各功能模块（纯函数声明，互不执行）→ `sync.js` → `auth.js`
→ `app.js`（末尾 `initAuth()` 启动一切）。ES module 例外：`crest.js`（importmap 'three'）。

### init() 时序（app.js，auth 成功后 onAuthReady → init）

1. LS 水合（`loadLS` 全部模块；mr/tr/jp 各自做"非今日则重置勾选"）
2. `initTheme()` `initFinance()` `initPrinciples()`（creed-trigger → 信条弹窗）等
3. `renderAll()` ①（LS 数据先画，秒开）
4. `await pullAll()`（全表并行拉取 → `initialPullDone=true`）
5. `renderAll()` ②（云端数据覆盖）
6. `principlesAutoShow()`（晨间宣读/晚间核查，一天一次，标记先写后弹）
7. `subscribeRealtime()`（每表 `rtCoalesce` 订阅）

另有 `rehydrateOnFocus`（sync.js，visibility/focus）：重连 realtime → 重放 dirty
推送 → `pullAll(true)` → `renderAll()` → `principlesEveningAutoShow()`。

### renderAll() 扇出

`rDate → rMR → rAC → rJP → rTR → rCats → rTodos → rThe90 → rLowDay → rHermes →
rMotivation → rMetrics → rpgAfterChange → attachRipples`

**渲染纪律（红线级）**：`r*()` 是纯渲染，会在页面加载、realtime 回声、每次无关
交互时反复执行——**绝不在渲染函数里挂音效、弹窗、写库等副作用**。副作用只挂在
用户手势的变异路径（toggleXX/addXX 等），且写在状态变更成功之后、守卫(`if(i)`)之内。

### 模块一览（v7.40.0 减法后;行数会变，不在此维护——需要时 `wc -l`）

> 减法说明:下表已随模块删除移除 notifications/markets/academics/japanese/hermes/fitness/ai/store/motivation 及早已不存在的 herocube/lifetree/ambient 各行;drawer.js 的导览由 7 频道减为 **3 频道(系统/财务/日历)**,其行内描述中的 7 频道/黄铜图标叙述为历史。

| 文件 | 职责（关键导出 → 被谁用） |
|---|---|
| supabase.js | 创建 `sb` 客户端（anon key，唯一可进客户端的 key） |
| state.js | 全局 `S`、`TODAY`、常量（MR_DEFAULT/DEF_JP/DEF_TR/FIN_*/CREED_VARIANTS）、`loadLS/saveLSRaw/saveLS`、`SETTINGS_KEYS`、`dirty`、全部 `saveXX()` |
| render-core.js | P0 渲染原语（v7.32.0）：`ensureSkeleton`(骨架一次成型)/`setText`/`setHTML`/`setClass`/`setAttr`(变了才写)/`reconcileList`(键控行调和；容器内只放键控行)——零副作用零状态依赖，被六个渲染件使用；约定见文件头注释与 REDESIGN.md §4.3 |
| sync.js | `pullAll`+全部 `pullXX`、全部 `syncPushXX`、`replaceTable`、`subscribeRealtime`(rtCoalesce)、`rehydrateOnFocus`、`waitForPull`、`initialPullDone` |
| auth.js | Magic Link 登录、session → `currentUser`、登录卡（用 CREED_VARIANTS 随机一条）、`onAuthReady` |
| app.js | `init`/`renderAll`/`rDate`/`rMetrics`、时钟 `tick`、表单键盘导航(openFormNav/segSet/segPick)、`escH`、`attachRipples`、提醒检查 |
| drawer.js | **SAO 导览抽屉**(v7.18.0，前身=Markets 抽屉)：`openDrawer/closeDrawer`(级联进/反序退 + SAO 菜单音 `sounds/sao-menu.mp3`)、`navOpen(which)`(选定音 `sao-menu-select.mp3` → 其余板淡出 + 选中板滑向荧幕正中 → 其 HUD 自带展开；`_navOpenMap/_navIdMap` 复用旧按钮 id 故 rCalDot/rAiDot 不变)、键盘(←开/↑↓选/Enter定/Esc关)、右缘左滑开启；`_navMuted()` 认 `cyrus_sfx_muted`；reduced-motion 退化即时切。**v7.23.0**：导览 7 频道(+第 7 格 `shop-btn` SHOP/心愿→openStore,占位矢量购物袋待换黄铜);6 频道图标换成用户自制**黄铜浮雕 PNG**(`icons/nav/*.png`,img 替原 inline SVG;切图法见徽标) |
| morning.js | 晨间药丸（v7.7 身心灵 6 项：Water/Meditation/Bath·切换/Calisthenics/Bath·洗净/Men's work，MR_DEFAULT+cleanMorning 迁移在 state.js）；`rMR`/`toggleMR`（全清 quest 音按日闩锁 `_mrQuestDate`）；**完成态** `rMRReady`：全勾→面板玻璃遮罩 `#mr-ready` + 日随机短句(MR_READY_PHRASES,date-seeded)glassFlicker 闪现 + 双段穿线(CSS)，点遮罩 `mrDismissReady` 收起(当日不重弹除非破完成) |
| trading.js | 交易清单 + 偏向笔记（每日重置） |
| todos.js | 待办 + 分类 + 重复 + 提醒（`toggleTd` 完成时生成下一次重复） |
| the90.js | **赛季记分板**（v7.39.0 起 = S2 · 营收之季 2026-08-13→11-13，93 天）：文件头一个 **RENAME POINT 常量块**装下全部季名/日期/文案/四柱/计数器，换季只改那一块；四柱 `ai/jp/fit/ball` **全程分级打卡**（点一下升一级 1→2→3、第四下清空；`the90Graded()` 恒真，`the90Num` 兼容旧布尔 true→3/false→0；`the90ScoreMet` 对历史数据与旧的分阶段判定逐位等价）；三阶段（开局/加速/收成，31 天一段）只是标签+里程碑，仍照写 `meta.currentPhase`；三个销售计数器 `dm/follow/scan` 存**同一个 scores 对象**（数字键，靠「只按显式键访问」的红线与柱子及 `_amp` 等命名空间键共处）；`ensureThe90Defaults` 按 `startDate < SEASON_START` **每次渲染重迁**旧赛季 meta（pull/realtime 会把旧行灌回来）；网格列数走 CSS 变量 `--the90-n`/`--the90-days`；streak 门槛 `SEASON_ACTIVE_THRESHOLD`（低谷日 1）；旧赛季日行一行不删 |
| goals.js | **目标面板**（v7.39.0）：title/说明/期限 + 倒数标签（Xd / 今天 / 逾期 Xd / 达成）、增删改、拖拽排序、达成沉底；**只存 localStorage**（`goals` 键，`saveLSRaw`，不进 SETTINGS_KEYS、不设 dirty）——Supabase 没有 goals 表，刻意不改 schema，代价是不跨设备同步 |
| finance.js | 记账全家桶：账户/分类/交易(插入式)/预算/目标/周期/隐私遮罩/CSV/主题日历与时间选择器；`finSubmitTx` 与 `finWizSave` 两条保存路径 |
| finance-charts.js | Chart.js 分析图 |
| calendar.js | 专属日历 HUD（克隆 finance 外壳）：月历格（改编 finCalHtml，有项日显点）+ 选中日详情；**当日事项**=聚合 `S.todos`(未归档)+`S.ac` 同日只读（点击 `calJumpTo` 关闭并滚回原面板），**行程**=`S.cal`(cal_events) 可增删（复用 `finOpenCal` 选日 + 原生 time）；`openCalendar/closeCalendar` 逐字克隆 finance；`rCalDot` 主页按钮今日有项点亮 |
| sound.js | `Sfx` 合成音效引擎：17 个 cue（tick/untick/tab/open/close/toast/quest/perfect/levelup/rankup/achievement/notice/save/lowday/cross/blocked/penalty）；程序化混响、噪声声部、手势门闸 `interacted`、`gate()` 节流、静音 LS 键 `cyrus_sfx_muted`（无前缀） |
| rpg.js | RPG 系统层：属性=真实数据计算（多对多矩阵）、EXP/等级单调、**47 个成就**（RPG_ACHIEVEMENTS，tier→EXP；含 fitness 体魄类 6 个）、每日挑战、庆祝弹窗（手动确认不自动关）、`rpgAfterChange` 全局结算钩子、`sysToast(msg,{silent})` |
| lowday.js | 低谷日断路器：`_amp/_low/_lowx/_trig` 命名空间键写进 the90_daily.scores；协议弹窗、战略面封锁 `lowdayBlocked`、渡 `lowdayCross`、`adversityLedger()` |
| principles.js | 信条与原则弹窗三模式（宣读/核查/修订）；`principlesAutoShow`/`principlesEveningAutoShow`（标记列见 §3 settings）；修订被低谷锁；核查草稿 `prDraft` 保存才落库 |
| applock.js | 应用锁（PIN/生物识别可选） |
| theme.js | 主题切换 **三态** `THEMES=['sovereign','terminal','notebook']`(`toggleTheme` 按数组循环 君主→终端→奶白 / `applyTheme(name,persist)` 落 LS+推 settings+reload 一次 / `currentTheme`);每个身份 = 一个 `data-theme` 值 + 一串 `data-fx` 能力标志(sovereign 全开、terminal 无 crest/flow-additive、**notebook 只留 glass** —— 深色重装饰打在奶油纸上会变灰雾);`THEME_FX` 与 index.html 预绘脚本里的副本**必须同步**;`updateThemeBtn` 标签 ♛君主/◈终端/✎奶白 |
| dragsort.js | 通用拖拽排序 `makeSortable`（jp/tr/todos/principles 等共用） |
| swipe.js | 手机滑动切换：`makeHudSwipe(viewId,opts)` 单窗格 follow-finger pager（财务/健身/系统 HUD 的 tab——拖当前 body 跟手、过阈滑出+滑入，raw switch 不走 withViewTransition 防双动画，reduced-motion 退化即时切，竖向手势放行原生滚动）；`initTriCarousel` 主页三栏（CSS scroll-snap）的圆点指示器 |
| glass.js | v7.1 黄铜玻璃 maximalist 交互层（GSAP 栈）：Lenis 平滑滚动（内部滚动容器**必须**带 `data-lenis-prevent`）；文字一律**闪烁显形**（glassFlicker——信号灯式逐字符随机眨亮，无位移，用户钦定；英雄字符 revert 归还 brassFlow，标题滚动可逆熄灭/复燃）；**粘性堆叠卡**（glassInitStacking 用 JS 把四个顶层段落包进 .stack-card：sticky 钉顶+DOM 序覆盖+scrub 缩暗被埋卡——包装层不碰面板内部，renderAll 无感知）；指针 tilt（JS lerp ±3.2°，CSS transition 不得含 transform）+ 光斑；素描墨线 v2（15 走线、指针吸引）；sterile 与 reduced-motion 全跳过。v7.2 增：**高卡钉底**（卡比视口高→负 top 钉底边，内容先看完再被盖；refreshInit 时重算）、**3D 卡片翻转**（glassInitFlip，交易面板 front=清单/back=市场时段，子节点连 id 整体搬进面、tick() 无感知；扩展到其他面板照此模式）、**pageDepth(on)** 景深后退（信条/低谷/系统弹层打开时 .page-wrapper 退后——新全屏层记得调它）。v7.4 改：**Focus Spaces 无按钮版**——点卡任意空白即聚焦（10px/600ms 触摸阈值防滚动误触 + FOCUS_INTERACTIVE 选择器豁免交互元素）；退出只有背板/Esc/系统返回。v7.5 改：**聚焦飞行 = View Transitions API 优先**（合成器线程对快照做 FLIP——起飞帧再贵也吞不掉动画；view-transition-name 开飞前挂、finished 后摘，否则退化成中央淡入；CSS `::view-transition-group(focus-card)` 配速）；GSAP 手动 FLIP 仅作老浏览器回退（lagSmoothing(100,16) + 背板/景深推迟 90ms 出起飞帧）；`.in-flight` 飞行中停玻璃滤镜（顺滑关键）；粗指针设备玻璃降至 blur(13px)。**财务 HUD 统一**：glassInitFinanceHUD 把 #finance-view 包成 .sys-backdrop+.sys-window.fin-hud，复用系统卷轴开合 keyframes（finance.css 末段）；closeFinance 拆出 _closeFinanceCore 以播收卷动画；全局无 ×（.sys-back关闭/.fin-back 均隐藏）。"空间内细化功能"逐板块待填。**坑：改 glass.js 后预览必须 bump CACHE_VERSION 或清 caches——SW 缓存优先会喂旧文件** |
| energyflow.js | v7.25 流动能量背景（自启 IIFE，仿 herocube 模式）：全屏 canvas `#energy-flow`（z:-2 最深层）画缓慢漂移发光能量丝带（Solo Leveling 系统氛围）；**三主题都显示**，取 `--brass-soft` 着色（MutationObserver 听 data-theme 重着色），深色 additive(`lighter`)/浅色普通混合；CSS（components.css）管每主题 opacity + 全屏 HUD 时 display:none；reduced-motion 只一帧静态；`init` 等 load、resize 宽度有 `innerWidth||clientWidth||screen.width||1280` 兜底 |

### styles/（12 个,v7.40.0 减法后）

tokens（全部变量源；v7.32.0 起含 `--z-*` 全局层叠梯度）→ fonts（v7.32.0 自托管
@font-face,字体文件在 `vendor/fonts/`）→ base → components（含 v6.47+ 主页 HUD 化：面板角标
background-gradient、todo/.row 行角标、定制 `.row-cb` 勾选框、`brassFlow` 液态流光
打在 `.creed-pillars/#dateline/#the90-tagline`；v7.18.0 末段附 SAO 导览样式
`.nav-arrow`/`.drawer-nav`/`.navd-list`/`.navd-item`/`.hn-item` + 进/退/选 keyframes）→
animations → finance → calendar → system（RPG HUD：
角标/扫描线/辉光/庆祝弹窗/段位流光）→ lowday → principles → fonts →
**主题 overlay 必须最后加载**（同权重时才赢得过 components）：
**theme-terminal**（v7.18.0，作用域 `html[data-theme="terminal"]`，深色 token 重映射）→
**theme-notebook**（v7.39.0，作用域 `html[data-theme="notebook"]`，奶白纸感浅色：
页面 `#FAF6F0` / 面板 `#FDFAF4` / 内嵌纸块 `#F2EDE4` / 墨 `#2A2A2A` / 细线 `#1E1E1E` 低透明度 /
金 `--brass-soft:#D4A574` 做填充、`--brass:#8F6222` 做小字与线条；四支荧光笔
`--accent-{yellow,red,blue,amber}` 各带 `-ink`（压暗版，给文字）与 `-soft`（淡洗，给底纹）——
**淡色只做填充，永不承载小字**）。
**写主题 overlay 的三个坑**：①`color-scheme` 在 tokens.css 里写死在裸 `html` 上，浅色主题
必须在自己的作用域里改回 `light`，否则滚动条/日期选择器/autofill 仍是深色；②深色专属的
硬编码色（`#app-cover` 内联开屏、`.focus-backdrop` 近黑遮罩、date/time 控件的 invert 滤镜）
不吃 token，要逐个点名覆盖；③重装饰不要在 CSS 里一条条关——用 `data-fx` 能力标志
（notebook 只给 `glass`），这正是它被设计出来的用途。

---

## §3 数据层（Supabase，全表 RLS = `auth.uid() = user_id`）

> **❄ = v7.40.0 冻结表**:历史数据原样保留(供复盘/成长回顾),前端已不再读写,realtime 不再订阅。解冻=按 §4 R1 重新接线。

四种存储原型（新表先决定原型再写代码，配方见 §4）：

- **A 单行每用户**：upsert by user_id
- **B 按日键控**：upsert `onConflict:'user_id,date'`，只推 TODAY 行
- **C 列表整替**：`replaceTable()`（先删不在本地 id 集的行再 upsert；push 前
  `waitForPull()` 防清库）
- **D 服务端写**：客户端只读

| 表 | 原型 | 形态要点 | LS 镜像键 | RT订阅 |
|---|---|---|---|---|
| settings | A | 列：creed_idx, creed_open, show_done, symbols, subjects, notif_banner_dismissed, theme, fin_base_currency, fin_fx_rates, **principles_last_shown**(晨间宣读标记), **principles_review_prompted**(晚间核查弹出标记) | SETTINGS_KEYS 所列 9 键走 LS 镜像；fin 两列直接进 S.fin 不镜像 | ✓ |
| morning | B | list jsonb | mr | ✓ |
| academics ❄ | C | 任务行 | ac | ✓ |
| japanese ❄ | A | **date**(清单归属日，跨设备重置), streak(派生), last_date, log jsonb(打卡史), note, list | jp | ✓ |
| trading | B | bias, list, **sealed/sealed_at/broke**(盘前封条) | tr | ✓ |
| categories | C | name | cats | ✓ |
| todos | C | text/cat/date/time/pri/remind/repeat/done…, **no_carry/archived/archived_at**(过期不顺延→跨日 sweepExpiredTodos 自动归档) | todos | ✓ |
| push_subscriptions ❄ | – | 每设备一行（notifications.js 写） | – | ✗ |
| the90_meta | A | targets jsonb（含 standard/twoMin/badDay）, start_date, current_phase | the90_meta | ✓ |
| the90_daily | B | **scores jsonb：目标键 I–V + 命名空间键 `_amp`(振幅1-5) `_low`(低谷日) `_lowx`(已渡) `_trig`(诱因)**, note | the90_daily | ✓ |
| hermes_notices ❄ | D | Hermes 写（kind: insight/reminder/nudge），客户端只 dismiss | – | ✓ |
| motivation_videos ❄ | C | videoId/title/position | –(motiv 内存) | ✓ |
| rpg_state | A | seen_level, achievements jsonb(**append-only**), bonus_exp, daily | rpg | ✓ |
| principles | C | kind('creed'/'principle'), text, why, position, active | principles | ✓ |
| principles_daily | B | checks jsonb{id:'kept'/'broke'/'na'}, revise jsonb, note | principles_daily | ✓ |
| fin_accounts | C | currency 是账户属性 | fin_accounts | ✓ |
| fin_categories | C | kind income/expense | fin_categories | ✓ |
| fin_transactions | **插入式** | 单行 insert/update/delete 函数，**永不整替、永不改史**（更正=冲销行） | fin_transactions | ✓ |
| fin_budgets / fin_goals / fin_recurring | C | – | 各自键 | ✓ |
| fin_asset_snapshots | D | pg_cron 夜间快照 | – | ✗ |
| fit_exercises ❄ | C | 动作库 name/kind('reps'/'time')/sort/archived；首次开健身页注入预设 | fit_exercises | ✓ |
| fit_plan ❄ | A | week jsonb{mon..sun:[{exId,sets,target}]}, rest_default（计划驱动今日） | fit_plan | ✓ |
| fit_log ❄ | B | entries jsonb[{exId,sets,target,done:[reps...]}], done, duration_sec | fit_log | ✓ |
| fit_body ❄ | B | weight, metrics jsonb(waist/chest/arm/thigh) | fit_body | ✓ |
| fit_diet ❄ | B | meals jsonb[{name,kcal,time}] | fit_diet | ✓ |
| cal_events | C | 行程 title/date/start_time/end_time/location/notes/position（当日事项=渲染时聚合 todos+academics 只读，不入此表） | cal_events | ✓ |
| ai_outputs ❄ | C | AI Automation 产出日志 title/date/kind(built/learned/shipped)/notes/link/position（RPG v2 信号源；streak/活跃天/总数 派生；Phase 1 暂不喂进度） | ai_outputs | ✓ |
| wishlist ❄ | C | 心愿单 name/description/price/currency/image_path/link/category/priority(0随缘/1一般/2很想)/status(want/bought)/bought_at/actual_paid/position（v7.23.0；**CyrusOS 首次用 Supabase Storage**：私有桶 `wishlist`,5MB+image/* 白名单,`storage.objects` 四策略限每用户 `用户id/` 文件夹,签名链接显示；RLS 四策略用 `(select auth.uid())`） | wishlist | ✓ |
| system_push_log ❄ | D | worker 推送去重（slot 占位） | – | ✗ |

pg_cron 服务端任务：周期交易生成、资产快照、已完成 todo 清理。
迁移一律走 MCP `apply_migration`（项目 id `whmdrabescmchkupazjh`）；**本项目
realtime publication 是逐表的**——新表必须 `alter publication supabase_realtime add table ...`。

---

## §4 配方（Recipes）——查表代替考古

### R1 新增一个同步模块（七步）
1. state.js：`S` 里加形态 + `dirty` 加键 + `saveXX()`（saveLSRaw + dirty + push）
2. 迁移：建表（选 §3 原型）+ RLS 四策略(select/insert/update/delete own) + 加入 publication
3. sync.js：`pullXX()`（含 `saveLSRaw` 镜像）+ `syncPushXX()`（A/B 用 upsert，C 用
   `replaceTable`，都先 `if(!currentUser) return; await waitForPull();`）
4. sync.js `pullAll` 的 Promise.all 注册 pull
5. sync.js `subscribeRealtime` 加 `rtCoalesce('表名', async()=>{ await pullXX(); rXX(); })`
6. sync.js `rehydrateOnFocus` 的 dirty 重放块加一行
7. app.js init 加 LS 水合一行；UI 模块照 japanese.js 模式写（行内编辑 + makeSortable）

### R2 音效接入规则
- 只在**用户手势变异路径**调 `Sfx.*`，写在守卫内、状态变更后；渲染函数禁止
- 频繁动作用 tick/untick；庆祝音（quest/perfect）**按日闩锁**（模块级 `_xxDate !== TODAY`）
- `sysToast(msg, {silent:true})`：凡调用方已有专属音、或 toast 由加载/同步驱动，必须 silent
- 引擎自带：手势门闸（加载期静音）、`gate(key,ms)` 同键节流、挂起时间线拒绝调度

### R3 面板视觉语言（默认主题）
- 角标：background 8 渐变画 1px brass 短线（零 DOM）；行内元素用左缘 4 渐变缩小版
- 标签：`panel-label-row::before` brass 菱形 kicker
- 流光：复用 `@keyframes brassFlow`（components.css），只给"身份宣言级"文字
- **玻璃（v6.51 起的面板材质）**：`background-color: color-mix(bg-primary 66%, transparent)`
  + `backdrop-filter: blur(16px) saturate(1.15)`（带 -webkit- 前缀）+ inset 顶部高光；
  玻璃只上**面板级**容器（panel/the90/hermes/弹窗卡），绝不上列表行（性能）；
  底下必须有东西可糊——`body::before` 三团 brass 流光底场（ambientDrift 90s）就是为此存在
- **transform 归属权**：面板的 transform 由 glass.js tilt 独占（--rx/--ry），
  CSS hover 只许碰 border/box-shadow——再写 `:hover{transform:...}` 会覆盖 tilt
- 每日文字浮现：新增目标加进 `glassDailyReveal()`，配 `.rv-pre-*` 预隐类；
  **绝不在渲染函数里触发**（同音效纪律）
- **一切新装饰作用域 `html:not([data-theme="sterile"])`**，sterile 有自己的语言

### R4 SW 部署纪律
shell 文件（HTML/CSS/JS）增删改 → `sw.js`：APP_SHELL 增删条目 + `CACHE_VERSION`
bump（fix=patch，feature=minor）→ 顺手更新本文档"对齐版本"。纯文档改动不 bump。

### R5 低谷锁接入（战略面 = 低谷日禁用的功能）
入口处 `if(typeof isLowDayActive==='function' && isLowDayActive()){ lowdayBlocked('某某'); return; }`
——每个 mutator 都要重查（防低谷日中途从别的设备同步进来）。先例：openFinance
包装、principles 修订模式 `prEditGuard()`。

### R6 「一天一次」自动弹窗
synced settings date 列 + SETTINGS_KEYS 镜像；**先写标记再弹**（backdrop 关闭也算）；
条件含 `initialPullDone`（离线不弹）+ 弹窗互斥检查。先例：principlesAutoShow。

---

## §5 不变量与红线（CLAUDE.md 四条黄金法则之外的补充）

- **RPG 单调律**：等级/EXP 永不回退；`achievements` jsonb append-only；
  `rpgAchExp()` 只读已存键，绝不实时重测；逆境账户(渡)计数只增
- **换季不许让 EXP 倒退**（v7.39.0 起）：柱子 id 换了一整套，但历史日行里存的还是
  上一季的 `I–V`。`rpgTargetIdsFor(date)` 按日期分流——早于 `SEASON_START` 的用
  `SEASON_LEGACY_TARGET_IDS`，其余用当季 targets；`rpgTotalExp` 的满勤 +25 也按
  「那一天当时有几根柱子」判定。少了这两条，换季当天全部历史会被算成 0 达标，
  累计 EXP 崩塌、等级倒退，直接撞上上一条红线。**下次换季必须照做。**
  `RPG_ACTIVITY_ATTR` 则是**整组替换**（不能留旧行：`rpgAttrFromCounts` 把每一行
  都算进权重和，死行会永久拉低全部属性）——代价是新柱子没有历史，属性从 10 起
  在新赛季前 30 天内爬升。
- **rpg-stats.py ↔ rpg.js 镜像耦合**（改任何一边必须同步另一边 + EC2 重部署）：
  `TIER_EXP{15/30/50/100}` · `ACH_TIER`（**断言 55 条**）· `ACTIVITY_ATTR` 多对多矩阵
  （v7.39.0 起 = `ai/jp/fit/ball` 四柱：ai→INT+CRE、jp→INT+WIS、fit→STR+AGI+VIT、
  ball→AGI+VIT+STR）· `TARGET_LABEL`（应随之变为 `{ai AI 生意, jp 日本語, fit 健身, ball 篮球}`；
  rpg.js 无 TARGET_LABEL，前端柱名走 the90_meta.targets） ·
  `ATTR_ORDER[STR,AGI,INT,WIS,VIT,CRE]`（v7.15.0 加第6属性 创造） ·
  `THE90_START`（应随之变为 `SEASON_START=2026-08-13`）
  **(v7.40.0:EC2/Hermes 已退役,rpg-stats.py 不再运行——本镜像律失效存档,若日后复活服务端战报再启用)**
- **finBalance 的 transfer 不对称**（toAmount vs amount）字节级保留；不就地 sort
  `S.fin.transactions`
- 隐私遮罩 = 值**不进 DOM**，不是 CSS 隐藏
- the90_daily.scores 只按显式键访问——**禁止 `for in scores`/`Object.keys(scores)`
  遍历**（命名空间键 `_amp` 等会混入）
- 时区硬编码 `+08:00`（date 逻辑与 worker）

---

## §6 服务端（hermes-cyrus 仓库 → EC2 `~/.hermes/`）——**已整体退役(v7.40.0)**

> 2026-08-25:EC2 实例 SSM 已探不到(hermes_notices 最后一条 2026-06-28),Hermes/Telegram 战报停用,由云端「早间简报」定时任务取代。以下为存档;AWS 帐单侧确认实例已终止(而非仅 stopped)由 Cyrus 自查。

```
hermes-cyrus/
├─ SOUL.md            Hermes 人格与行为边界（Telegram 语气、cyrus-os 技能路由）
├─ config.yaml        Nous Hermes Agent 配置（默认模型 claude-haiku-4-5，max_turns=15）
├─ deploy.sh          拷贝 SOUL/config/skills/scripts → ~/.hermes/（.sh chmod +x）
├─ bin/hermes-start   systemctl restart hermes 包装
├─ skills/            cyrus-os（读写 Supabase 的总技能）/ daily-reflection /
│                     focus-coaching / weekly-review
└─ scripts/
   ├─ morning-brief.sh    06:55  数据+天气+rpg-stats → Gemini Flash-Lite → Telegram
   ├─ evening-checkin.sh  21:00  streak 风险+当日结算；先写 hermes_notices(nudge) 再发 TG
   ├─ weekly-review.sh    21:30周日  14 天对比；先写 hermes_notices(insight) 再发 TG
   └─ rpg-stats.py        服务端 RPG 计算（镜像 rpg.js，见 §5）
```

- cron 注册在 EC2 `~/.hermes/cron/jobs.json`（Asia/Taipei）；三个 cron 的合成模型是
  **Gemini Flash-Lite**（零成本偏好），Hermes 网关本体（Telegram 对话）是 Haiku
- 脚本读 Supabase 用 `~/.hermes/.env` 的 `SUPABASE_SERVICE_KEY`（REST + curl）
- `rpg-stats.py <YYYY-MM-DD>` 输出 JSON 关键键：`level/rank/title/power/power_delta/
  today_met/weakest{attr,name,val,label,focus_id,feeders}/attrs/notice_daily/notice_weekly`
- cyrus-os SKILL 的写权限：todos/academics 标记完成、fin_transactions 仅插入、
  hermes_notices 发布——其余只读

---

## §7 已知技术债（修掉就从这里删）

1. **Cloudflare Worker 线上实例待撤销**:代码已随 v7.40.0 从 repo 删除(推送订阅 0、旧映射问题随之作废),
   但线上 worker 仍部署着且持有 `SUPABASE_SERVICE_KEY`——需 Cyrus 在 Cloudflare dashboard 删除(或 `wrangler delete`),
   删除后顺手在 Supabase 轮换 service key 更稳妥
2. **README.md 模块/数据表清单停在 v6.2**（已替换为指向本文档的摘要——若再见到
   旧清单复活即为腐烂）
3. **auth 里有第二个账号**（kuang.lo433@gmail.com，2026-05-23 注册，零数据）——
   待用户确认是否清除
4. ~~财务利息计算疑似不正确~~ **已了结(2026-08-25)**:每日计息为 pg_cron `fin_accrue_interest` 所写(共 74 笔「利息」行,2026-06-14 起),现已把全部账户 interest_rate 归零使其 no-op;历史利息行保留。若重启计息先修算法再开利率
5. ~~creed.js 死文件~~ **已删（v7.17.0）**：文件 + index.html 脚本标签 + APP_SHELL 条目均移除；CREED_VARIANTS(state.js) 与 #creed-trigger/#creed-wrap 标记保留(principles.js 用)
6. ~~rpg-stats.py 停在上一季~~ **随 EC2/Hermes 退役作废(v7.40.0)**——服务端战报不再运行。
7. **rpg.js 的 `day30/day60/day90` 成就与 `comeback` 的硬编码 `3`**：里程碑成就的文案
   仍写「The 90 第 30 天」，且 day 计数已随 S2 重新从 1 开始（成就 append-only，已解锁的
   不会被撤销，会在 S2 第 30/60/90 天再次达成）；`comeback` 里的门槛 `3` 没有跟着
   `SEASON_ACTIVE_THRESHOLD` 走。都属文案/口径小瑕疵，未改。
8. **目标面板不跨设备同步**（v7.39.0）：`goals` 只存 localStorage —— 本次刻意不动
   schema。若要同步，按 §4 R1 建 `goals` 表（原型 C 列表整替）并把 `saveGoals`
   接进 dirty/push 链路。面板归档状态（`archived_panels`）则是有意只留本机。

更多产品向 backlog（滑动切换、健身面板、Morning Ritual 改造等）在 Claude 的
跨会话记忆里维护，不在本文档。
