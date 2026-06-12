# CyrusOS · 活体架构地图（ARCHITECTURE.md）

> **对齐版本：`cyrus-os-v7.4.0`**（= sw.js `CACHE_VERSION`，每次 bump 顺手更新此行——
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
   23 张表 · RLS=auth.uid() · Realtime · pg_cron(周期交易/资产快照/已完成清理)
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

### 模块一览（28 个，scripts/；行数会变，不在此维护——需要时 `wc -l`）

| 文件 | 职责（关键导出 → 被谁用） |
|---|---|
| supabase.js | 创建 `sb` 客户端（anon key，唯一可进客户端的 key） |
| state.js | 全局 `S`、`TODAY`、常量（MR_DEFAULT/DEF_JP/DEF_TR/FIN_*/CREED_VARIANTS）、`loadLS/saveLSRaw/saveLS`、`SETTINGS_KEYS`、`dirty`、全部 `saveXX()` |
| sync.js | `pullAll`+全部 `pullXX`、全部 `syncPushXX`、`replaceTable`、`subscribeRealtime`(rtCoalesce)、`rehydrateOnFocus`、`waitForPull`、`initialPullDone` |
| auth.js | Magic Link 登录、session → `currentUser`、登录卡（用 CREED_VARIANTS 随机一条）、`onAuthReady` |
| app.js | `init`/`renderAll`/`rDate`/`rMetrics`、时钟 `tick`、表单键盘导航(openFormNav/segSet/segPick)、`escH`、`attachRipples`、提醒检查 |
| notifications.js | Web Push 订阅/权限横幅（VAPID public key） |
| creed.js | （v6.50 退役）旧三段轮播；文件仍在但主页不再调用，见 §7 技术债 5 |
| drawer.js | 右缘抽屉开合 |
| markets.js | TradingView widgets + 财经日历 + 符号选择 |
| morning.js | 晨间药丸 `rMR`/`toggleMR`（全清 quest 音按日闩锁 `_mrQuestDate`） |
| academics.js | 课业任务 CRUD + 提醒（`rAC/toggleAC`） |
| japanese.js | N2 清单；**完成即打卡**：`jpSettle()` 全勾→log[TODAY]，streak 由 `jpComputeStreak()` 从 log 推导（连续天数）；清单按日重置（jp.date）；ci-btn 仅展示 |
| trading.js | 交易清单 + 偏向笔记（每日重置） |
| todos.js | 待办 + 分类 + 重复 + 提醒（`toggleTd` 完成时生成下一次重复） |
| the90.js | 90 天五柱：打卡格（stabilize 期 0–3 档循环，`the90ScoreMet` 判达标）、热力圈、streak（低谷日门槛 1 否则 3）、硬标准、`_the90PerfectSfxDate` 闩锁 |
| hermes.js | Hermes 通知列表；`_hermesSeen` id 差分 + `window._hermesPulled` 门 → 新通知才 `Sfx.notice()`；dismiss 幂等 |
| finance.js | 记账全家桶：账户/分类/交易(插入式)/预算/目标/周期/隐私遮罩/CSV/主题日历与时间选择器；`finSubmitTx` 与 `finWizSave` 两条保存路径 |
| finance-charts.js | Chart.js 分析图 |
| motivation.js | 动机视频墙（YouTube unlisted） |
| sound.js | `Sfx` 合成音效引擎：17 个 cue（tick/untick/tab/open/close/toast/quest/perfect/levelup/rankup/achievement/notice/save/lowday/cross/blocked/penalty）；程序化混响、噪声声部、手势门闸 `interacted`、`gate()` 节流、静音 LS 键 `cyrus_sfx_muted`（无前缀） |
| rpg.js | RPG 系统层：属性=真实数据计算（多对多矩阵）、EXP/等级单调、**41 个成就**（RPG_ACHIEVEMENTS，tier→EXP）、每日挑战、庆祝弹窗（手动确认不自动关）、`rpgAfterChange` 全局结算钩子、`sysToast(msg,{silent})` |
| lowday.js | 低谷日断路器：`_amp/_low/_lowx/_trig` 命名空间键写进 the90_daily.scores；协议弹窗、战略面封锁 `lowdayBlocked`、渡 `lowdayCross`、`adversityLedger()` |
| principles.js | 信条与原则弹窗三模式（宣读/核查/修订）；`principlesAutoShow`/`principlesEveningAutoShow`（标记列见 §3 settings）；修订被低谷锁；核查草稿 `prDraft` 保存才落库 |
| applock.js | 应用锁（PIN/生物识别可选） |
| theme.js | 主题切换 cappa/sterile；sterile 时 `ensureLifeTree()` 动态 import |
| ambient.js | sterile 主题环境音 |
| lifetree.js | Three.js 粒子生命树（The 90 进度驱动生长；不可见自动暂停）；动态 import 加载，但**仍列在 APP_SHELL**（SW 缓存它，离线 sterile 才能用——别"清理"掉） |
| dragsort.js | 通用拖拽排序 `makeSortable`（jp/tr/todos/principles 等共用） |
| glass.js | v7.1 黄铜玻璃 maximalist 交互层（GSAP 栈）：Lenis 平滑滚动（内部滚动容器**必须**带 `data-lenis-prevent`）；文字一律**闪烁显形**（glassFlicker——信号灯式逐字符随机眨亮，无位移，用户钦定；英雄字符 revert 归还 brassFlow，标题滚动可逆熄灭/复燃）；**粘性堆叠卡**（glassInitStacking 用 JS 把四个顶层段落包进 .stack-card：sticky 钉顶+DOM 序覆盖+scrub 缩暗被埋卡——包装层不碰面板内部，renderAll 无感知）；指针 tilt（JS lerp ±3.2°，CSS transition 不得含 transform）+ 光斑；素描墨线 v2（15 走线、指针吸引）；sterile 与 reduced-motion 全跳过。v7.2 增：**高卡钉底**（卡比视口高→负 top 钉底边，内容先看完再被盖；refreshInit 时重算）、**3D 卡片翻转**（glassInitFlip，交易面板 front=清单/back=市场时段，子节点连 id 整体搬进面、tick() 无感知；扩展到其他面板照此模式）、**pageDepth(on)** 景深后退（信条/低谷/系统弹层打开时 .page-wrapper 退后——新全屏层记得调它）。v7.4 改：**Focus Spaces 无按钮版**——点卡任意空白即聚焦（10px/600ms 触摸阈值防滚动误触 + FOCUS_INTERACTIVE 选择器豁免交互元素）；退出只有背板/Esc/系统返回。**手动 FLIP**取代 Flip 插件（视口坐标计算，免疫祖先 scrub 变换——插件 absolute 模式在变换祖先里会算歪）；`.in-flight` 飞行中停玻璃滤镜（顺滑关键）；粗指针设备玻璃降至 blur(13px)。**财务 HUD 统一**：glassInitFinanceHUD 把 #finance-view 包成 .sys-backdrop+.sys-window.fin-hud，复用系统卷轴开合 keyframes（finance.css 末段）；closeFinance 拆出 _closeFinanceCore 以播收卷动画；全局无 ×（.sys-back关闭/.fin-back 均隐藏）。"空间内细化功能"逐板块待填。**坑：改 glass.js 后预览必须 bump CACHE_VERSION 或清 caches——SW 缓存优先会喂旧文件** |
| herocube.js | v7.0 五柱黄铜立方（ES module，importmap three）：六面 canvas 纹理（Ⅰ–Ⅴ+◆，HUD 角标边框），固定定位 z:-1 翻滚，滚动速度加转、指针拉拽、浮沉；sterile/reduced-motion 跳过 |

### styles/（10 个）

tokens（全部变量源）→ base → components（含 v6.47+ 主页 HUD 化：面板角标
background-gradient、todo/.row 行角标、定制 `.row-cb` 勾选框、`brassFlow` 液态流光
打在 `.creed-pillars/#dateline/#the90-tagline`）→ animations → theme-sterile
（作用域 `html[data-theme="sterile"]`，默认主题的新装饰一律用
`html:not([data-theme="sterile"])` 隔离）→ finance → motivation → system（RPG HUD：
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
| trading | B | bias, list | tr | ✓ |
| categories | C | name | cats | ✓ |
| todos | C | text/cat/date/time/pri/remind/repeat/done… | todos | ✓ |
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
  `TIER_EXP{15/30/50/100}` · `ACH_TIER`（**断言 41 条**）· `ACTIVITY_ATTR` 多对多矩阵
  （睡眠喂全部 5 维）· `TARGET_LABEL{I睡眠 II冥想 III课业 IV健身 V性能量}` ·
  `ATTR_ORDER[STR,AGI,INT,WIS,VIT]` · `THE90_START=2026-05-11`
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
   ——应为 II=冥想/III=课业/IV=健身/V=性能量 per §5 TARGET_LABEL）：早晚 RPG 推送
   会报错误的目标名。属性计算本身正确，仅文案错。待决定：更新 or 删除该推送功能
2. **README.md 模块/数据表清单停在 v6.2**（已替换为指向本文档的摘要——若再见到
   旧清单复活即为腐烂）
3. **auth 里有第二个账号**（kuang.lo433@gmail.com，2026-05-23 注册，零数据）——
   待用户确认是否清除
4. 财务**利息计算疑似不正确**（用户报告，未排查；fin_accounts.interestRate 相关）
5. creed.js 整文件已无主页调用（登录卡只用 state.js 的 CREED_VARIANTS）——
   可在下次清理时删除文件并从 APP_SHELL/index.html 移除

更多产品向 backlog（滑动切换、健身面板、Morning Ritual 改造等）在 Claude 的
跨会话记忆里维护，不在本文档。
