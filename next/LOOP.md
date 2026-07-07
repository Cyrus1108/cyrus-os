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

### T3 渲染层氛围大改 ✅ v7.3 (b992309)
- [x] 背景 `#0A0B06`→`#0A0E14`(scene.js BG/BG_V、fog 自动跟、style.css --bg/--bg-2、#hud scrim/vignette 同步蓝移);隐藏线截图验证零穿帮。
- [x] vignette 房间感:双层径向(中心 rgba(120,150,200,.05) 微亮 + 蓝黑边缘压暗)。
- [x] grid 提亮:base 0.42→0.56、ring 0.18→0.22。
- [x] bloom:`BLOOM_STRENGTH=0.75` 常量化(构造+每帧两处);**全部站线常驻 bloom 层**,hover 靠 colHot 提亮自然唤醒辉光(highlight() 不再切层)。
- [x] 体积面:占用 occ 同几何 `MeshBasicMaterial{站色, opacity FILL_OPACITY=.055, depthWrite:false, DoubleSide}`,dispose 补材质释放。
- [x] 分区配色:`STATION_HUE` 表(琥珀/青/紫/绿/黄),idle=向灰 lerp30%×0.52、hot=向白 lerp18%,帧循环 `colIdle.lerp(colHot, emph)`;标签 `--sthue` CSS 变量跟色(含 is-hot 光晕)。**决策:HUD 面板 chrome 保持全局终端黄,只有场景浮动标签跟站色**(面板是全局仪表,不该换肤)。
- [x] TUNING 调参地图:scene.js 顶部注释块(BG/fog/bloom/站色/fill/grid/dust 七项落点)。
- [x] 验证:总览截图分区配色全亮相、hover 唤醒(TRADING 琥珀提亮)、glErr=0。帧率满帧(动画平滑),留用户实机再感受。

### T4 银行加厚 ✅ v7.4 (2cf8b65)
- [x] 台阶深化(d 3.6/3.3/3.0,后延 z−0.55)、门面板挪至 FZ=0.45、**山墙 prismGeo 转 90°(三角真正朝街,此前一直是侧棱朝前!)**、殿身 3.5×1.55×2.4 + 前后脊殿顶(低于山墙尖)+ 门;旧"背板 slab"退役;solid 全同步。
- [x] 验证:OPERATIONS 正面(山墙+八柱+纵深脊线)+ 飞行途中背 3/4(侧墙/殿顶)都读得出厚实建筑;glErr=0。注:硬刷新+scroll 恢复偶见 fixed-UI 视口偏移截图伪影,浏览器瞬态非代码问题。

### T5 书堆精修 ✅ v7.5 (812b3b0)
- [x] 每本书=书壳(占 solid 遮挡)+ 内缩页块(w94%/h56%/d86%,沿前口探出 5%,偏移随本体 ry 旋转);5 本厚薄 0.20–0.34 错落 + x/z 平移错位;顶上摊开书放大(0.85 宽双叶 + 0.72 抬高扇页对,带 18° yaw)。
- [x] 线量:每本 2 box(24 边)×5 + 4 叶 ≈ 稳稳在预算内;隐藏线遮挡正常(zoom 验证页块线被上层书壳正确遮挡)。

### T6 TRADING K线行情动画 ⚠️ v7.6 (28b56ca) — 代码完成+node 仿真验证,**浏览器验证待补(下轮第一件事)**
- [x] 蜡烛拆动态双 buffer(wire 12 边+2 影线/根、occluder 12 tri/根,DynamicDrawUsage,frustumCulled=false),`{o,c,hi,lo}` 行情模型;选中(st.emph>0.6,hover 锁定与 HUD 聚焦均命中)时当前烛 smoothstep 生长+微抖,完成后 slide 0.5→0 左移换带,升→跌→升 节奏 legIdx 轮转,幅度 0.35–0.9 抖动,range 钳 [0.38,3.3]。
- [x] idle 冻结(emph<0.6 early-return)/reduced-motion 帧循环不跑=静止;封盘环/axis 不受影响;chart line 共站材质(琥珀+hover 提亮+bloom)。
- [x] node 桩仿真 600 帧:无 NaN、烛数恒 6、影线不倒挂、界内、idle 冻结 ✓。
- [ ] **浏览器补验**:hover TRADING 两帧对比行情走动、glErr=0、封盘环共存。(扩展断连,Chrome 关闭中)

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
| 2026-07-08 | v7.3 / b992309 | T3:蓝黑底+房间感+grid 提亮+常驻 holo-bloom+分区配色+体积面+TUNING 地图 | 总览配色全亮相、hover 琥珀唤醒、隐藏线零穿帮、glErr=0 | bloom 强度/fill opacity 如需微调见 scene.js TUNING 块 |
| 2026-07-08 | v7.4 / 2cf8b65 | T4:银行成建筑(深台阶/殿身/殿顶/山墙转90°朝街) | 正面+背3/4 双角度读得出体量、glErr=0 | — |
| 2026-07-08 | v7.5 / 812b3b0 | T5:书壳+页块+错位错落+大摊开书扇页 | zoom 验证页块线/遮挡正确、glErr=0;console 12 错误均为 Chrome 扩展自身(context invalidated),与 app 无关 | 入场 reveal 早期帧勿误判为"柱阵丢失" |
| 2026-07-08 | v7.6 / 28b56ca | T6:K線行情走带(动态双 buffer/升跌升/左移滑动/idle 冻结) | node 仿真 600 帧全绿;**浏览器验证待补**(扩展断连) | 下轮开工先补验 T6 再取 T7 |
