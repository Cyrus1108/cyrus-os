# CyrusOS · 活体架构地图（ARCHITECTURE.md）

> **对齐版本：`cyrus-os-v7.27.4`**（v7.27.4 = **Todo bug 修复**:勾「过期不顺延(noCarry)」会把**重复任务**也归档隐藏、并断掉循环(变单次)。根因——`sweepExpiredTodos`(todos.js)对任何 noCarry 过期未完成任务一律归档,未豁免重复任务;而下一次循环实例只在「完成时」(toggleTd)生成,故未完成的重复任务被归档后系列即终结。修复:**重复任务(repeat≠none)豁免归档**——repeat 本身就是顺延机制;只「单次」noCarry 过期才归档。并加**自愈**:`sweepExpiredTodos` 唯一会设 archived=true 的地方,故凡 `archived&&重复&&noCarry` 必是旧 bug 误归档→自动恢复(init 本地 + pull 后权威两处 sweep,沿用既有不抢跑 pull 的同步模式)。v7.27.3 = 能量丝带**曲线平滑**(中点二次贝塞尔 `quadraticCurveTo`,消除手机端低采样折线尖角;手机采样 26→40、桌面 46→56;真机 A/B 验证)。v7.27.2 = 能量丝带**调细**(用户反映线条太粗、盖住 Saturday/日期/时钟标题)：`energyflow.js` 三层描边 核心 `×1.3→×0.85`、中层 `×3→×1.9`、外辉光 `×7→×4.2`,基宽 `rnd(1.2,2.8)×1.25→rnd(0.55,1.25)×1.15`,alpha 略降——丝带成细发光线、不再盖标题;`?v=` 同步 `7.27.1→7.27.2`(改了 energyflow.js 必须 bump 查询串否则旧版缓存命中)。真机 Chrome 验证标题清晰可读。v7.27.1 = 能量背景 **URL 级缓存爆破**:`index.html` 对 `components.css`/`energyflow.js` 引用加 `?v=7.27.1`、`sw.js` APP_SHELL 同步+`CACHE_VERSION→v7.27.1`。即使某设备 SW 卡旧版(cache-first),新查询串在旧缓存必 miss→走网络取最新→一刷新即拿到带 isolation 修复的 CSS;`index.html` 本就 network-first 故引用恒为新版;查询串只改 URL 不改路径、服务器忽略,零破坏。真机 Chrome 验证:已加载 `components.css?v=7.27.1`+`isolation:isolate`+canvas litPct~23%。v7.27.0 = 流动能量背景**真正可见**(用户反映 v7.26 仍全黑、经连真机 Chrome 扩展截图三主题定位)：根因——terminal/sterile 的 `body` 背景**不透明**(`theme-*.css` 里 `body{background:#0a0b06/#FAFAFA}`),把 `z:-1` 的 `#energy-flow` canvas 画在 body 底色**之下**、完全遮住;canvas 其实一直在画(litPct~20%),之前所有「读 canvas 像素 toDataURL」验证都因只读缓冲区而**误判成功**。修复=`body{ isolation:isolate }` 给 body 建独立层叠上下文,令 body 自身背景画在它的**负 z 子元素之下**→三主题(cappa 黄铜/terminal 黄/sterile 黄)能量丝带全部显现(cappa 早已是上下文故先前仅它可见;isolation 不为 fixed 子元素建包含块,弹窗/HUD 层级不受影响)。v7.26.0 = 流动能量背景**调到清晰可见**(用户反映 v7.25 看不到)：`#energy-flow` z:-2→**z:-1**(避开不透明 body 背景遮挡)、不透明度 .6→**.9**(terminal .8/sterile .5)、丝带 alpha 上调；`init` **立即先画一帧静态**(不等首个 rAF,即使 rAF 被 visibility 暂停也有内容、首屏即可见)。v7.25.0 = **主页流动能量背景**（`scripts/energyflow.js`，参考《Solo Leveling》系统窗口氛围）：全屏 canvas `#energy-flow`（**z:-2**，比 cube/trails/blob 更深一层）画缓慢漂移的发光能量丝带；**三主题都显示**（不同于 cube/trails 在 sterile/terminal 隐藏），颜色取自当前主题 `--brass-soft`（cappa `#D9BE92`/sterile `#FBFB45`/terminal `#EFE000`），`MutationObserver` 监听 `data-theme` 自动重新着色；深色主题用 `'lighter'` additive 叠辉光、浅色 sterile 用普通混合避免过曝；每主题不同 `opacity`（cappa .6/terminal .5/sterile .32）；生命周期照搬 glass-trails（debounce resize + `visibilitychange` RAF 开关）；`prefers-reduced-motion` 只画一帧静态；全屏 HUD/聚焦时 `display:none`。`init` 等 `load` + `resize()` 用 `innerWidth||clientWidth||screen.width||1280` 兜底（脚本内联早于 layout）。v7.24.0 = 5 项 bug 修复：①原则晚 9pm 核查提醒——整天开着的 tab `init` 不重跑,加每分钟重判 21:00 的计时器(`principlesEveningAutoShow` 自带幂等);②手机打卡闪蓝色选取框盖整面板——全局 `*{-webkit-tap-highlight-color:transparent}` + 可点控件 `user-select:none`(输入框/文本域保留可选可编辑);③`8/9` 倒计时跨午夜停在昨天——the90 tagline 改读实时日期(`new Date().toLocaleDateString('sv-SE')`)而非冻结的 `TODAY`;④日文「记录被删」实为周历只显本周→加「累计 N 天」总数(`Object.keys(S.jp.log).length`;数据其实完好,代理已查线上库确认);⑤交易手机晨间打卡电脑端不同步——电脑「翻篇」在 `pullAll` 前就把全未打卡重置 `saveTR()` 推上云、覆盖手机打卡;改成翻篇 `saveLSRaw` 只写本地不推云、让 `pullTrading` 作权威(晨间 `saveMR`/日文 `saveJP` 同隐患一并堵)。v7.23.0 = **心愿单/商店模块 + 导览黄铜图标**。①心愿单(`store.js`/`store.css`,克隆 calendar HUD 外壳)：记录想买的真实东西——图片(**CyrusOS 首次用 Supabase Storage**,私有桶 `wishlist`,每用户 `用户id/` 文件夹权限,上传+签名链接显示)/价格+币种(复用财务 baseCurrency+finMoney)/名称/描述/购买链接/分类/想要程度/想要⇄已买;顶部统计(想要·总价值≈·已买·已花);新表 `wishlist`(RLS×4 用 `(select auth.uid())` + realtime + index)。**导览加第 7 格 SHOP/心愿**(占位矢量购物袋,待换黄铜版),nth-child 级联动画扩到 7。②导览 6 个图标换成用户自制**黄铜浮雕图标**(从一张拉丝金属板抠出、悬浮无方框):PowerShell+System.Drawing **「亮度保护」flood-fill** 切图(从 4 角算底板亮度,绝不流进明显更亮的像素→保住细的剑刃/火焰细节)+ 300px 高分辨率处理;6 图=芯片/剑/齿轮+循环箭头/叠币+$/日历/篝火,存 `icons/nav/*.png`(img 替原 inline SVG)。v7.18.0 = 导览重做 + 第 3 主题：**terminal 终端主题**（明日方舟式深色战术——`theme-terminal.css`，`html[data-theme="terminal"]` 暗色 token 重映射、黄警示色 `--brass:#C9C90E`、直角斜切面板、mono 标签；herocube/glass-trails 在此主题停渲染；theme.js `THEMES=['cappa','sterile','terminal']` 三态循环）；**SAO 导览抽屉**——原 Markets 抽屉(`drawer.js`)改造成全屏居中导览：左缘单箭头把手 / 右缘左滑 / ← 键开启；6 块斜切板(系统/健身/AI/财务/日历/动力)在磨砂模糊页面上 1→6 级联滑入(SAO 菜单音)；点选播 SAO 选定音→其余 5 块依序淡出、选中块滑向荧幕正中→其 HUD 从该处自带展开；关闭播同一 SAO 音、级联反序退出(PWR 先→SYS 后)；桌面键盘(←开 / ↑↓选 / Enter 定 / Esc 关)；新音效 `sounds/sao-menu*.mp3`。**Markets 退役**(→ 日后并入 Trading Desk 专注页)。v7.17.0 = 全量审计修复批（30-agent 审计 116 项确认 → 实现约 92 项）：**数据完整性**——财务 5 张配置表补 `dirty` 标记+focus 重放（离线编辑不再被 stale 云端覆盖）、跨午夜 `tick()` 自 reload（不再写昨天行）、rehydrate 先 flush 再 reload、pullAll 失败清 `pullAllPromise` 可重试、`pullThe90Daily` 合并保留本地脏 TODAY、pull 守卫(jp/trading/settings 空列表不覆盖)、`cleanJapanese` 进 pull 自愈、todo 拖序只重排可见项、循环交易拉回 cron 的 next_date/last_run。**安全**——应用锁 `?pinreset=1` 须有本次导航的 magic-link token（堵掉裸参数绕过）、锁定退避持久化、CSV 公式注入中和、AI 链接 `javascript:` 方案白名单、搜索在隐私遮罩下不匹配金额。**渲染纯度**——rMR/rFitToday 去掉 DB 写副作用、the90 庆祝/AI 趋势 peek 不再误触发。**财务**——`finFromBase` 修净值/目标换汇(漏 base-rate)、循环跨币种 toAmount 走实时汇率(非 1:1)。**离线/PWA**——SW 导航回退、弹性预缓存(单资产失败不再整体 brick)、SWR 兜底 Response。**性能/杂项**——the90 热力图 450 格签名 memo、herocube 切 sterile 停渲染+WebGL 上下文丢失恢复、lifetree 静止跳算、健身全 +08:00、Lenis 补 fitness-view、reduced-motion 补漏、sterile 配色作用域、焦点轮廓/触控尺寸/aria 一批 a11y、creed.js 死文件删除。**延后(需部署/大改)**：RPG↔rpg-stats.py 镜像那几项(挑战推荐/权重/bool/注释，要 EC2 重部署)、DB RLS 性能迁移(`auth.uid()`→`select`)、字体自托管、replaceTable 跨设备删除、a11y 焦点 trap。v7.16.0 = RPG v2 Phase 3：成就那一波——新增 **自动化 · AUTOMATION** 类(ai_first/vol10/vol50/vol200/streak7/streak30/ship10) + 创造属性成就 attr_cre35 共 8 个；**ACH_TIER 47→55**(rpg.js 目录 + rpg-stats.py 断言同步 + EC2)；attr_balanced 文案修六维；新成就配进度条。v7.15.0 = RPG v2 Phase 2：第 6 属性 **创造/CRE**（雷达五边→六边、战力=6 和，rpgRadarSVG/rpgGrowthSVG 本就泛型）+ 属性接真实活动：**AI 产出 / 健身打卡 自动勾对应 The 90 柱**（`the90AutoMet`，幂等只增不撤；III=AI→智力+创造，IV=健身→力量/敏捷）→ 经验/属性反映真实模块投入；EXP 公式不变（单调）；镜像 rpg-stats.py ATTR_ORDER/ATTR_NAME/ACTIVITY_ATTR +CRE（已 EC2 重部署）；AI 开场动效放慢到 2600ms。v7.14.2 = AI HUD 卷轴开场 AI logo 动效（.ai-cover：黄铜六边环旋转+神经节点+「AI」+副标「AUTOMATION」信号灯式逐字闪入，1500ms 后淡出露内容；仅 cappa，sterile/reduced-motion 跳过；纯 CSS）；v7.14.0 = RPG v2 Phase 1：AI Automation 产出日志 HUD（新表 ai_outputs，独立模块=信号源；记录 构建/学会/交付，派生 streak/活跃天/总数；**本期不接经验/属性/成就**，留 Phase 2/3）；v7.13.2 = The 90 柱 III 课业→AI Automation（暑假重心；信条五柱句 + 服务端战报 rpg-stats.py TARGET_LABEL 同步 + cleanThe90Targets 数据自愈迁移；III→INT 映射不变）；v7.13.1 = HUD tab 真·跟手轮播（拖动时相邻 tab 从边缘实时露出，固定定位幽灵层+id剥离）；v7.13.0 = 专属日历 HUD（新表 cal_events，聚合现有带日期项 + 可增删行程）+ Todo 过期不顺延自动归档（todos +no_carry/archived/archived_at）+ 手机滑动切换（主页三栏 scroll-snap + 各 HUD tab follow-finger pager，新 swipe.js）+ 交易盘前封条（trading +sealed/sealed_at/broke，偏向自动勾 t6）。v7.12.0 = 多代理审计后 35 项 bug/UX 修复：交易日翻篇保留、隐私日合计遮罩、标签 onclick 转义、晨间详情守卫、低谷渡保连续、reduced-motion HUD 外壳、安全区内距、移动端断点、SDK/Chart/three 本地化离线、各 overlay Esc、抽屉 inert 等。SDK 现已 vendored 到 vendor/。）（= sw.js `CACHE_VERSION`，每次 bump 顺手更新此行——
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
| EC2（东京） | 实例 `i-054241bf9badb9655`，运行时布局 `~/.hermes/` | Hermes agent 运行处；`hermes.service`（systemd）**只存在于 EC2**，WSL 里找不到是正常的 |

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
| EC2（crons + skills） | `cd ~/hermes-cyrus && git pull && bash deploy.sh`（或 SSM 注入） | deploy.sh 把 SOUL/config/skills/scripts 拷到 `~/.hermes/` |
| Cloudflare Worker | `wrangler deploy`（独立面） | 持有 `SUPABASE_SERVICE_KEY` secret；见 §7 技术债 |

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

---

## §2 前端模块地图

### 脚本加载顺序（index.html 底部）

Supabase CDN → `supabase.js`(sb 客户端) → `state.js`(S/TODAY/常量/saveXX/dirty)
→ `vendor/`（gsap + ScrollTrigger + SplitText + lenis，UMD 本地化供离线；GSAP
3.13 起全插件免费）→ 各功能模块（纯函数声明，互不执行）→ `sync.js` → `auth.js`
→ `app.js`（末尾 `initAuth()` 启动一切）。ES module 例外：`lifetree.js`（仅
sterile 时 theme.js 动态 import）与 `herocube.js`（importmap 'three'）。

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

### 模块一览（27 个，scripts/；行数会变，不在此维护——需要时 `wc -l`）

| 文件 | 职责（关键导出 → 被谁用） |
|---|---|
| supabase.js | 创建 `sb` 客户端（anon key，唯一可进客户端的 key） |
| state.js | 全局 `S`、`TODAY`、常量（MR_DEFAULT/DEF_JP/DEF_TR/FIN_*/CREED_VARIANTS）、`loadLS/saveLSRaw/saveLS`、`SETTINGS_KEYS`、`dirty`、全部 `saveXX()` |
| sync.js | `pullAll`+全部 `pullXX`、全部 `syncPushXX`、`replaceTable`、`subscribeRealtime`(rtCoalesce)、`rehydrateOnFocus`、`waitForPull`、`initialPullDone` |
| auth.js | Magic Link 登录、session → `currentUser`、登录卡（用 CREED_VARIANTS 随机一条）、`onAuthReady` |
| app.js | `init`/`renderAll`/`rDate`/`rMetrics`、时钟 `tick`、表单键盘导航(openFormNav/segSet/segPick)、`escH`、`attachRipples`、提醒检查 |
| notifications.js | Web Push 订阅/权限横幅（VAPID public key） |
| drawer.js | **SAO 导览抽屉**(v7.18.0，前身=Markets 抽屉)：`openDrawer/closeDrawer`(级联进/反序退 + SAO 菜单音 `sounds/sao-menu.mp3`)、`navOpen(which)`(选定音 `sao-menu-select.mp3` → 其余板淡出 + 选中板滑向荧幕正中 → 其 HUD 自带展开；`_navOpenMap/_navIdMap` 复用旧按钮 id 故 rCalDot/rAiDot 不变)、键盘(←开/↑↓选/Enter定/Esc关)、右缘左滑开启；`_navMuted()` 认 `cyrus_sfx_muted`；reduced-motion 退化即时切。**v7.23.0**：导览 7 频道(+第 7 格 `shop-btn` SHOP/心愿→openStore,占位矢量购物袋待换黄铜);6 频道图标换成用户自制**黄铜浮雕 PNG**(`icons/nav/*.png`,img 替原 inline SVG;切图法见徽标) |
| markets.js | TradingView widgets + 财经日历 + 符号选择（**已退役**：导览不再挂 Markets，v7.18.0；文件保留，待并入 Trading Desk 专注页） |
| morning.js | 晨间药丸（v7.7 身心灵 6 项：Water/Meditation/Bath·切换/Calisthenics/Bath·洗净/Men's work，MR_DEFAULT+cleanMorning 迁移在 state.js）；`rMR`/`toggleMR`（全清 quest 音按日闩锁 `_mrQuestDate`）；**完成态** `rMRReady`：全勾→面板玻璃遮罩 `#mr-ready` + 日随机短句(MR_READY_PHRASES,date-seeded)glassFlicker 闪现 + 双段穿线(CSS)，点遮罩 `mrDismissReady` 收起(当日不重弹除非破完成) |
| academics.js | 课业任务 CRUD + 提醒（`rAC/toggleAC`） |
| japanese.js | N2 清单；**完成即打卡**：`jpSettle()` 全勾→log[TODAY]，streak 由 `jpComputeStreak()` 从 log 推导（连续天数）；清单按日重置（jp.date）；ci-btn 仅展示 |
| trading.js | 交易清单 + 偏向笔记（每日重置） |
| todos.js | 待办 + 分类 + 重复 + 提醒（`toggleTd` 完成时生成下一次重复） |
| the90.js | 90 天五柱：打卡格（stabilize 期 0–3 档循环，`the90ScoreMet` 判达标）、热力圈、streak（低谷日门槛 1 否则 3）、硬标准、`_the90PerfectSfxDate` 闩锁 |
| hermes.js | Hermes 通知列表；`_hermesSeen` id 差分 + `window._hermesPulled` 门 → 新通知才 `Sfx.notice()`；dismiss 幂等 |
| finance.js | 记账全家桶：账户/分类/交易(插入式)/预算/目标/周期/隐私遮罩/CSV/主题日历与时间选择器；`finSubmitTx` 与 `finWizSave` 两条保存路径 |
| finance-charts.js | Chart.js 分析图 |
| fitness.js | 健身 HUD（克隆 finance 外壳）：今日/计划/趋势/饮食 4 tab；自重训练，计划驱动今日，`fitSettle` 完成全部计划组数→自动打卡（仿 jpSettle）；两个独立计时器（正计时 stopwatch + 组间/保持倒计时，time 动作点 pip 自动起倒计时）；`fitComputeStreak`（休息日不断签）；体征/饮食记录；暴露 `fitWorkoutCount/fitTotalReps/fitBodyLogged/fitPlanWeekComplete` 供成就软引用 |
| ai.js | AI Automation HUD（克隆 finance 外壳，RPG v2 Phase 1）：产出/交付日志(构建/学会/交付)+streak/活跃天/总数+趋势(Chart.js 近12周)+滑动 tab；暴露 `aiStreak/aiActiveDays30/aiTotalOutputs` 供 Phase 2/3 软引用；**独立、暂不接经验/属性/成就** |
| store.js | 心愿单/商店 HUD（克隆 calendar 外壳，v7.23.0）：想买的真实东西——`openStore/closeStore/rStore`(玻璃卷轴铁律照搬,`.store-closing` 保 furl)、CRUD modal(图片上传 `sb.storage.from('wishlist').upload(用户id/itemId.ext)`、显示 `createSignedUrl` 1h 缓存 `_storeImg`)、想要/已买 tab、统计条(想要/总价值≈/已买/已花,价格复用 `S.fin.baseCurrency`+`finMoney`)、商品卡(图/价/分类/描述/链接仅 http(s)/标记已买/编辑/删)、`rStoreDot` 点亮 shop-btn；`storeWants/storeBought` 派生 |
| calendar.js | 专属日历 HUD（克隆 finance 外壳）：月历格（改编 finCalHtml，有项日显点）+ 选中日详情；**当日事项**=聚合 `S.todos`(未归档)+`S.ac` 同日只读（点击 `calJumpTo` 关闭并滚回原面板），**行程**=`S.cal`(cal_events) 可增删（复用 `finOpenCal` 选日 + 原生 time）；`openCalendar/closeCalendar` 逐字克隆 finance；`rCalDot` 主页按钮今日有项点亮 |
| motivation.js | 动机视频墙（YouTube unlisted） |
| sound.js | `Sfx` 合成音效引擎：17 个 cue（tick/untick/tab/open/close/toast/quest/perfect/levelup/rankup/achievement/notice/save/lowday/cross/blocked/penalty）；程序化混响、噪声声部、手势门闸 `interacted`、`gate()` 节流、静音 LS 键 `cyrus_sfx_muted`（无前缀） |
| rpg.js | RPG 系统层：属性=真实数据计算（多对多矩阵）、EXP/等级单调、**47 个成就**（RPG_ACHIEVEMENTS，tier→EXP；含 fitness 体魄类 6 个）、每日挑战、庆祝弹窗（手动确认不自动关）、`rpgAfterChange` 全局结算钩子、`sysToast(msg,{silent})` |
| lowday.js | 低谷日断路器：`_amp/_low/_lowx/_trig` 命名空间键写进 the90_daily.scores；协议弹窗、战略面封锁 `lowdayBlocked`、渡 `lowdayCross`、`adversityLedger()` |
| principles.js | 信条与原则弹窗三模式（宣读/核查/修订）；`principlesAutoShow`/`principlesEveningAutoShow`（标记列见 §3 settings）；修订被低谷锁；核查草稿 `prDraft` 保存才落库 |
| applock.js | 应用锁（PIN/生物识别可选） |
| theme.js | 主题切换 **三态** `THEMES=['cappa','sterile','terminal']`（`toggleTheme` 循环 / `applyTheme(name,persist)` / `currentTheme`）；仅 sterile 走 `ensureLifeTree()`+ambient 动态 import；`updateThemeBtn` 标签 ◆终末/▣终端/☼经典 |
| ambient.js | sterile 主题环境音 |
| lifetree.js | Three.js 粒子生命树（The 90 进度驱动生长；不可见自动暂停）；动态 import 加载，但**仍列在 APP_SHELL**（SW 缓存它，离线 sterile 才能用——别"清理"掉） |
| dragsort.js | 通用拖拽排序 `makeSortable`（jp/tr/todos/principles 等共用） |
| swipe.js | 手机滑动切换：`makeHudSwipe(viewId,opts)` 单窗格 follow-finger pager（财务/健身/系统 HUD 的 tab——拖当前 body 跟手、过阈滑出+滑入，raw switch 不走 withViewTransition 防双动画，reduced-motion 退化即时切，竖向手势放行原生滚动）；`initTriCarousel` 主页三栏（CSS scroll-snap）的圆点指示器 |
| glass.js | v7.1 黄铜玻璃 maximalist 交互层（GSAP 栈）：Lenis 平滑滚动（内部滚动容器**必须**带 `data-lenis-prevent`）；文字一律**闪烁显形**（glassFlicker——信号灯式逐字符随机眨亮，无位移，用户钦定；英雄字符 revert 归还 brassFlow，标题滚动可逆熄灭/复燃）；**粘性堆叠卡**（glassInitStacking 用 JS 把四个顶层段落包进 .stack-card：sticky 钉顶+DOM 序覆盖+scrub 缩暗被埋卡——包装层不碰面板内部，renderAll 无感知）；指针 tilt（JS lerp ±3.2°，CSS transition 不得含 transform）+ 光斑；素描墨线 v2（15 走线、指针吸引）；sterile 与 reduced-motion 全跳过。v7.2 增：**高卡钉底**（卡比视口高→负 top 钉底边，内容先看完再被盖；refreshInit 时重算）、**3D 卡片翻转**（glassInitFlip，交易面板 front=清单/back=市场时段，子节点连 id 整体搬进面、tick() 无感知；扩展到其他面板照此模式）、**pageDepth(on)** 景深后退（信条/低谷/系统弹层打开时 .page-wrapper 退后——新全屏层记得调它）。v7.4 改：**Focus Spaces 无按钮版**——点卡任意空白即聚焦（10px/600ms 触摸阈值防滚动误触 + FOCUS_INTERACTIVE 选择器豁免交互元素）；退出只有背板/Esc/系统返回。v7.5 改：**聚焦飞行 = View Transitions API 优先**（合成器线程对快照做 FLIP——起飞帧再贵也吞不掉动画；view-transition-name 开飞前挂、finished 后摘，否则退化成中央淡入；CSS `::view-transition-group(focus-card)` 配速）；GSAP 手动 FLIP 仅作老浏览器回退（lagSmoothing(100,16) + 背板/景深推迟 90ms 出起飞帧）；`.in-flight` 飞行中停玻璃滤镜（顺滑关键）；粗指针设备玻璃降至 blur(13px)。**财务 HUD 统一**：glassInitFinanceHUD 把 #finance-view 包成 .sys-backdrop+.sys-window.fin-hud，复用系统卷轴开合 keyframes（finance.css 末段）；closeFinance 拆出 _closeFinanceCore 以播收卷动画；全局无 ×（.sys-back关闭/.fin-back 均隐藏）。"空间内细化功能"逐板块待填。**坑：改 glass.js 后预览必须 bump CACHE_VERSION 或清 caches——SW 缓存优先会喂旧文件** |
| herocube.js | v7.0 五柱黄铜立方（ES module，importmap three）：六面 canvas 纹理（Ⅰ–Ⅴ+◆，HUD 角标边框），固定定位 z:-1 翻滚，滚动速度加转、指针拉拽、浮沉；sterile/terminal/reduced-motion 跳过（v7.18.0 加 terminal） |
| energyflow.js | v7.25 流动能量背景（自启 IIFE，仿 herocube 模式）：全屏 canvas `#energy-flow`（z:-2 最深层）画缓慢漂移发光能量丝带（Solo Leveling 系统氛围）；**三主题都显示**，取 `--brass-soft` 着色（MutationObserver 听 data-theme 重着色），深色 additive(`lighter`)/浅色普通混合；CSS（components.css）管每主题 opacity + 全屏 HUD 时 display:none；reduced-motion 只一帧静态；`init` 等 load、resize 宽度有 `innerWidth||clientWidth||screen.width||1280` 兜底 |

### styles/（15 个）

tokens（全部变量源）→ base → components（含 v6.47+ 主页 HUD 化：面板角标
background-gradient、todo/.row 行角标、定制 `.row-cb` 勾选框、`brassFlow` 液态流光
打在 `.creed-pillars/#dateline/#the90-tagline`；v7.18.0 末段附 SAO 导览样式
`.nav-arrow`/`.drawer-nav`/`.navd-list`/`.navd-item`/`.hn-item` + 进/退/选 keyframes）→
animations → theme-sterile（作用域 `html[data-theme="sterile"]`，默认主题的新装饰一律用
`html:not([data-theme="sterile"])` 隔离）→ **theme-terminal**（v7.18.0，作用域
`html[data-theme="terminal"]`，深色 token 重映射；**坑**：cappa 装饰的
`html:not([data-theme="sterile"])` 隔离把 terminal 也算进默认装饰，故 theme-terminal 必须
**晚于** components 加载以覆盖，herocube 另在 JS 里 guard `['sterile','terminal']`）→
finance → fitness → calendar → ai → store → motivation → system（RPG HUD：
角标/扫描线/辉光/庆祝弹窗/段位流光）→ lowday → principles。

---

## §3 数据层（Supabase，全表 RLS = `auth.uid() = user_id`）

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
| academics | C | 任务行 | ac | ✓ |
| japanese | A | **date**(清单归属日，跨设备重置), streak(派生), last_date, log jsonb(打卡史), note, list | jp | ✓ |
| trading | B | bias, list, **sealed/sealed_at/broke**(盘前封条) | tr | ✓ |
| categories | C | name | cats | ✓ |
| todos | C | text/cat/date/time/pri/remind/repeat/done…, **no_carry/archived/archived_at**(过期不顺延→跨日 sweepExpiredTodos 自动归档) | todos | ✓ |
| push_subscriptions | – | 每设备一行（notifications.js 写） | – | ✗ |
| the90_meta | A | targets jsonb（含 standard/twoMin/badDay）, start_date, current_phase | the90_meta | ✓ |
| the90_daily | B | **scores jsonb：目标键 I–V + 命名空间键 `_amp`(振幅1-5) `_low`(低谷日) `_lowx`(已渡) `_trig`(诱因)**, note | the90_daily | ✓ |
| hermes_notices | D | Hermes 写（kind: insight/reminder/nudge），客户端只 dismiss | – | ✓ |
| motivation_videos | C | videoId/title/position | –(motiv 内存) | ✓ |
| rpg_state | A | seen_level, achievements jsonb(**append-only**), bonus_exp, daily | rpg | ✓ |
| principles | C | kind('creed'/'principle'), text, why, position, active | principles | ✓ |
| principles_daily | B | checks jsonb{id:'kept'/'broke'/'na'}, revise jsonb, note | principles_daily | ✓ |
| fin_accounts | C | currency 是账户属性 | fin_accounts | ✓ |
| fin_categories | C | kind income/expense | fin_categories | ✓ |
| fin_transactions | **插入式** | 单行 insert/update/delete 函数，**永不整替、永不改史**（更正=冲销行） | fin_transactions | ✓ |
| fin_budgets / fin_goals / fin_recurring | C | – | 各自键 | ✓ |
| fin_asset_snapshots | D | pg_cron 夜间快照 | – | ✗ |
| fit_exercises | C | 动作库 name/kind('reps'/'time')/sort/archived；首次开健身页注入预设 | fit_exercises | ✓ |
| fit_plan | A | week jsonb{mon..sun:[{exId,sets,target}]}, rest_default（计划驱动今日） | fit_plan | ✓ |
| fit_log | B | entries jsonb[{exId,sets,target,done:[reps...]}], done, duration_sec | fit_log | ✓ |
| fit_body | B | weight, metrics jsonb(waist/chest/arm/thigh) | fit_body | ✓ |
| fit_diet | B | meals jsonb[{name,kcal,time}] | fit_diet | ✓ |
| cal_events | C | 行程 title/date/start_time/end_time/location/notes/position（当日事项=渲染时聚合 todos+academics 只读，不入此表） | cal_events | ✓ |
| ai_outputs | C | AI Automation 产出日志 title/date/kind(built/learned/shipped)/notes/link/position（RPG v2 信号源；streak/活跃天/总数 派生；Phase 1 暂不喂进度） | ai_outputs | ✓ |
| wishlist | C | 心愿单 name/description/price/currency/image_path/link/category/priority(0随缘/1一般/2很想)/status(want/bought)/bought_at/actual_paid/position（v7.23.0；**CyrusOS 首次用 Supabase Storage**：私有桶 `wishlist`,5MB+image/* 白名单,`storage.objects` 四策略限每用户 `用户id/` 文件夹,签名链接显示；RLS 四策略用 `(select auth.uid())`） | wishlist | ✓ |
| system_push_log | D | worker 推送去重（slot 占位） | – | ✗ |

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
- **rpg-stats.py ↔ rpg.js 镜像耦合**（改任何一边必须同步另一边 + EC2 重部署）：
  `TIER_EXP{15/30/50/100}` · `ACH_TIER`（**断言 55 条**）· `ACTIVITY_ATTR` 多对多矩阵
  （睡眠 I 喂全部 6 维；III AI Automation 加喂 CRE 创造）· `TARGET_LABEL{I睡眠 II冥想 III AI Automation IV健身 V性能量}`（III 暑假由「课业」重命名，v7.13.2；rpg.js 无 TARGET_LABEL，前端柱名走 the90_meta.targets） ·
  `ATTR_ORDER[STR,AGI,INT,WIS,VIT,CRE]`（v7.15.0 加第6属性 创造） · `THE90_START=2026-05-11`
- **finBalance 的 transfer 不对称**（toAmount vs amount）字节级保留；不就地 sort
  `S.fin.transactions`
- 隐私遮罩 = 值**不进 DOM**，不是 CSS 隐藏
- the90_daily.scores 只按显式键访问——**禁止 `for in scores`/`Object.keys(scores)`
  遍历**（命名空间键 `_amp` 等会混入）
- 时区硬编码 `+08:00`（date 逻辑与 worker）

---

## §6 服务端（hermes-cyrus 仓库 → EC2 `~/.hermes/`）

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

1. **cloudflare/worker.js 旧映射**（`SYS_TARGETS` ~301 行：II=篮球/III=赚钱/IV=日语
   ——应为 II=冥想/III=AI Automation/IV=健身/V=性能量 per §5 TARGET_LABEL）：早晚 RPG 推送
   会报错误的目标名。属性计算本身正确，仅文案错。待决定：更新 or 删除该推送功能
2. **README.md 模块/数据表清单停在 v6.2**（已替换为指向本文档的摘要——若再见到
   旧清单复活即为腐烂）
3. **auth 里有第二个账号**（kuang.lo433@gmail.com，2026-05-23 注册，零数据）——
   待用户确认是否清除
4. 财务**利息计算疑似不正确**（用户报告，未排查；fin_accounts.interestRate 相关）
5. ~~creed.js 死文件~~ **已删（v7.17.0）**：文件 + index.html 脚本标签 + APP_SHELL 条目均移除；CREED_VARIANTS(state.js) 与 #creed-trigger/#creed-wrap 标记保留(principles.js 用)

更多产品向 backlog（滑动切换、健身面板、Morning Ritual 改造等）在 Claude 的
跨会话记忆里维护，不在本文档。
