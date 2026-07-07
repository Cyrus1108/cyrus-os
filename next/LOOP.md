# CYRUS://NEXT 打磨循环 · LOOP BRIEF

> 自读文件。每次循环迭代:按下面的协议,从 BACKLOG 取**一个**未勾任务(大任务取一个子步),
> 手写实现 → 验证 → 上线 → 勾掉 → 写迭代日志。全部勾完 → 停止循环并给用户发总结。
> 用户授权:遇到方案选项,选**最猛/最 Awwwards** 的;编码由总监督亲手写,不派子代理。

## 每迭代协议

1. 读本文件,找 BACKLOG 第一个未勾任务。
2. 动手前先读相关代码段(不确定处查 ARCHITECTURE.md §2;主战场 `next/scene.js` / `next/main.js` / `next/style.css`)。
3. 手写实现,增量小而完整(每迭代都必须是可上线状态)。
4. 验证:`node --check` 所有改过的 JS;然后按"浏览器验证配方"跑一遍。
5. 上线:`git add`(只加动过的 next/* 与本文件)→ commit(`next: vX.Y — <一句话>` + `Co-Authored-By: Claude <noreply@anthropic.com>`)→ `wsl.exe -d Ubuntu bash -lc "cd ~/cyrus-os && git push origin main"` → curl 轮询 Pages 直到新代码上线(grep 本次特征串)。
6. 回本文件:勾掉任务、在"迭代日志"追加一行。
7. BACKLOG 全空 → 停止循环(ScheduleWakeup stop),向用户汇报全程。

### 浏览器验证配方
- MCP tab 打开 `https://cyrus1108.github.io/cyrus-os/next/`,**必须 Ctrl+Shift+R**(CDN 边缘会供旧 module,普通刷新验的是旧代码)。
- 等 boot 完(约 15s),查 `glGetError=0`、console 无 error。
- 视觉项用 screenshot + zoom 对比;动效项隔 2s 拍两帧对比;交互抽查:拖转、滚轮飞区(磁吸+SECTOR 播报)、点站开 HUD、Esc 返回。
- 冻结标签页里验不了的(音感/流畅度)在日志里标注"留用户实机"。

## 红线(每迭代自检)

- 不碰 `sw.js`/`CACHE_VERSION`(next/ 是 network-only)、不碰主 app 文件、不碰 `next/data.js` 的写语义、不碰密钥。
- 交互契约零回归:drag orbit / scroll advance + 磁吸停靠 / click station / SECTOR 播报 / TRADING 封盘环同步 / reduced-motion 豁免。
- **隐藏线机制**:遮挡体颜色 = 场景背景色。改背景色时,`scene.js` 的 `BG` 常量、`occluderMaterial`、fog、`style.css --bg` 必须**同一个值**,否则隐藏线穿帮。
- 性能:笔记本 60fps;DPR≤2;新几何合并进单 LineSegments;持续动画走增量旋转/uniform,不每帧重建 geometry(T6 的 K线是小 buffer 增量更新,允许)。
- MOCK(demo)与 LIVE 都要能跑;写入路径一律不动。

## BACKLOG(按序执行)

### T1 快赢包(一次迭代打完)✅ v7.1 (97aead1)
- [x] 音效:hover tick 已移除(main.js onHover,函数保留)。
- [x] SYSTEM 动效:`spinPart` 升级为 `spinParts[]` 多层机制(每层自带 pivot/axis/speed/bob,共站材质);每道阶位环独立轴进动(交替正反向,速度 0.22+k·0.07),碎晶层 −0.16 反向公转 + 0.09 y 浮动。
- [x] MORNING 核心 0.55→0.7。

### T2 HUD 打开时主物体前置 ✅ v7.2 (0084a62)
- [x] 元凶=`#hud.is-open` 的全屏 rgba(.42) 压暗 + backdrop-blur(2px) → 改为 `#hud::before` 横向渐变 scrim(左 46% 全透、贴面板处渐暗),opacity 淡入(渐变无法 transition)。
- [x] focus 取景右偏:`focusStation` 里 look-at 沿相机右向量偏移,角度 = hFOV × min(0.16, hudW/W×0.375),hudW 由 main.js 传 `hudWidth:()=>min(560, innerWidth×0.92)`(镜像 #hud-panel 宽,不量隐藏节点)。
- [x] 验证:MORNING(地面站)+ SYSTEM(高架站)开 HUD,碑体清晰立于左区中央、零虚化;Esc 返回正常。注:返程飞行期间点击被吞是既有设计(mode≠deck 忽略),非回归。

### T3 渲染层氛围大改(用户 spec 适配本仓库)
> 用户原 spec 按"单文件 + CDN + UnrealBloomPass"写;本仓库是 next/ 多文件 + vendored three +
> 自写半分辨率选择性 bloom(scene.js 的 bright-pass→高斯→合成)。按**精神**落地,不推翻管线。
- [ ] 背景:`#0A0B06` → 深蓝黑 `#0A0E14`。同步改:`scene.js BG`、fog 色、`style.css --bg`(+`--bg-2` 配套微调)。**遮挡体自动跟 BG,验证隐藏线无穿帮。**
- [ ] vignette"房间感":#fx 暗角调成中心稍亮/边缘更暗(可叠一层极淡径向提亮)。
- [ ] grid floor:透明度提到 5–10%,确认随雾自然淡出(现 shader grid 调 uniform/色值)。
- [ ] bloom 全息感:自写 bloom 等效 strength 调到 0.6–0.9 档,保持半分辨率;不过曝(核对最亮的 today 柱与 seal 环)。
- [ ] 体积感:每站叠一层同色半透明面 —— 克隆 solid 几何,`MeshBasicMaterial{color:站色, transparent, opacity:.04–.07, depthWrite:false}`,与 bg 色遮挡体共存(半透明面画在遮挡体之上,叠加顺序验一下)。
- [ ] 分区配色(信息层级):TRADING/FINANCE `#F5A623` 琥珀 · JP-N2 `#4ECDC4` 青 · ACADEMICS `#9B8CFF` 紫 · MORNING/TODOS `#5FD068` 绿 · SYSTEM/THE90 保黄 `#EFE000`。idle 低饱和低亮、hover/active 提亮(重写 frame 里 `st.mat.color.setRGB(...)` 那段为"站基色 × emph 提亮");DOM 标签 `.lbl-name` 颜色跟随站色(inline style 或 CSS var)。
- [ ] **调参地图**:`scene.js` 顶部加 `/* == TUNING == */` 注释块,列出:bloom 强度、fog 近远、站色表、半透明面 opacity、grid 透明度的位置与当前值;同一份抄进迭代日志(用户点名要)。
- [ ] 验证:总览+四区各截图,横向对比"变亮变有深度但不过曝";rAF 帧率抽查。

### T4 银行加厚(用户:上次要的其实是"厚",不是"宽")
- [ ] FINANCE 从"片状门面"变"有体积的建筑":台阶/楣/山墙 z 深加大(台阶 d 1.7→~3.2 起),山墙后接完整屋体(prismGeo 长体带屋脊)+ 侧墙轮廓线;solid 遮挡体同步;8 柱门面与门保留。
- [ ] 验证:OPERATIONS 停靠正面 + 拖转侧面,都读得出"厚实的银行"。

### T5 书堆精修(参考用户给的插画感觉)
- [ ] 每本书:书壳(封面/封底沿外缘略大)+ 内缩的书页体 + 书页侧面 2–3 条平行线示意纸纹;厚薄不一、错落角度保留;顶上摊开的书放大、页面微曲(两叶各拆两段小板拼折角)。
- [ ] 线量控制(单站增量 < ~2k 线段);隐藏线风格不破。

### T6 TRADING K线行情动画(选中时"行情在走")
- [ ] 蜡烛部分从主 wire 拆成独立 LineSegments(参考 sealWire 路径),position buffer CPU 增量更新:focus/hover-lock 时蜡烛队列整体左移,右端按 升→跌→升 的节奏生长新蜡烛(伪随机走势;candles≤12,buffer 极小)。
- [ ] idle 时静止(或极慢呼吸);reduced-motion 完全静止;封盘环共存不冲突;axis 框架不动。

### T7 鸟居 + 日式生活街区(最大项,按子步多迭代)
- [ ] 7a 鸟居精修:双柱微内倾(~2°)、笠木+岛木双横梁(笠木两端上翘)、中央额束、柱脚基石;**移到甲板入口**(总览相机进场方向、纪律区外缘)作为入口牌坊;JP-N2 站位原地换 7b。
- [ ] 7b JP-N2 站 → 日式町屋组:两层小楼(格子窗线、披檐、二层阳台栏杆,参考用户图的生活感)+ 石灯笼 + 庭院围篱。
- [ ] 7c 樱花:2–3 株树(枝干线框,花冠用粉色 Points 微粒团)+ 花瓣飘落粒子(复用 dust 着色器思路,粉色、限定在 JP 区局部)。
- [ ] 7d 生活感:石板小径线 + 极简线条小人 2–3 个沿路径缓慢走动(路径 lerp,几根线段一个人,合并进一个动态 buffer)。
- [ ] 每子步独立上线验证;性能预算:全组新增 ≤1 个大合并 LineSegments + ≤1 个 Points。

### T8 MORNING redesign(开放题 → 选最猛直接做)
- [ ] 日志里先写 2–3 个概念(一句话)+ 选择理由,然后直接做。倾向候选:**破晓拱门 —— 地平线拱门 + 太阳半升,太阳高度 = 今日晨间完成度(数据驱动,与 SYSTEM 碑体同哲学)**;备选:日晷(影子指向当前时段)、禅庭石阵+耙纹。
- [ ] 实现 + 验证(数据驱动部分 MOCK/LIVE 都要对)。

## 迭代日志(追加式,每迭代一行起)

| 日期 | 版本/commit | 做了什么 | 验证 | 遗留 |
|---|---|---|---|---|
| 2026-07-08 | (建档) | 创建本 LOOP 简报 | — | — |
| 2026-07-08 | v7.1 / 97aead1 | T1:tick 静音、spinParts 多层动效(环进动/碎晶反向公转+浮动)、晨核提速 | glErr=0、7 标签、两帧对比环姿态翻转+碎晶漂移 ✓;音感/晨核速度留用户实机 | 小怪癖:EXP 横档随主自转偶有边缘朝向瞬间变淡(0.028 厚),可接受 |
| 2026-07-08 | v7.2 / 0084a62 | T2:HUD scrim 左透右暗+去 blur、focus look-at 右偏(hudWidth 动态角度) | MORNING+SYSTEM 双站 HUD 构图落左区、清晰无虚化 ✓ Esc 返回 ✓ | SYSTEM 焦点近景构图极佳,可当宣传帧 |
