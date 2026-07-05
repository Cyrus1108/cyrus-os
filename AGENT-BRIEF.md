# AGENT-BRIEF — 实现代理必读(全文 ~60 行,读完即可动工)

> 取代「CLAUDE.md+ARCHITECTURE.md+REDESIGN.md 全文必读」。任务书只会额外指定
> 与你任务直接相关的小节/文件。仓库:WSL `~/cyrus-os`,经 UNC
> `\\wsl.localhost\Ubuntu\home\cyrus1108\cyrus-os` 访问(偶发 EUNKNOWN,重试)。

## 产品红线(违反 = 返工)
1. 财务只插入(`fin_transactions` 永不改史,更正=冲销行);币种是账户属性。
2. 不碰 secrets(repo 公开);anon key 是唯一可进客户端的 key。
3. RLS:user_id 运行时派生,永不硬编码。
4. **渲染纯度**:`r*()` 渲染函数零副作用(无音效/弹窗/写库);副作用只挂用户
   手势变异路径(toggleXX 等),写在状态变更后、守卫内。
5. 不引入构建工具/框架/npm 运行时依赖;新第三方资产一律 vendored。
6. 时区硬编码 +08:00;the90_daily.scores 禁止 for-in/Object.keys 遍历。

## SOVEREIGN 设计红线(REDESIGN.md §1/§2.4 摘要)
- 静息界面:扁平、零辉光、零 blur(全站唯一 blur = system.css `.sys-backdrop`)、
  无边框卡片靠明度浮起(#08060F/#120D22/#1A1330)、组件壳 4px、pill 999。
- 辉光/典礼金 `#E8C878` 只许出现在仪式时刻(升级/成就/满勤),≤800ms 归零。
- 微标签必须是真实数据(编号/时间戳/统计),禁装饰乱码;日常操作动效 ≤300ms。
- 颜色/时长/缓动一律用 tokens.css 变量,不许硬编码色值(状态语义色除外)。
- `prefers-reduced-motion` 全退化;动画只碰 transform/opacity。

## 架构常识(详情见 ARCHITECTURE.md 对应节,按需查)
- 渲染层 = 骨架+局部更新(scripts/render-core.js:ensureSkeleton/reconcileList/
  setText/setHTML/setClass/setAttr);动画可绑持久节点,但驱动节点的代码要容忍
  被再次驱动(见 animateNumber 的 `_anGen`)。
- 三拍交互原语在 scripts/beat.js(beatTap/ritualPulse);HUD 开合降临编排在
  glass.js(playSysDescent,MutationObserver 侦测 `.open`);面板斜切框在
  sovereign.js(mountPanelFrame);图标用 `<svg class="ic"><use
  href="./vendor/icons.svg#i-xxx"/></svg>`(17 个 symbol,见 sprite 头注释)。
- 能力标志:`<html data-fx="glass flow-additive deco crest">`(固定集,
  index.html 预绘 + theme.js SOVEREIGN_FX 两处同步)。
- 音效:`Sfx.*`(sound.js)只在手势路径调;庆祝音按日闩锁;`sysToast` 加
  `{silent:true}` 当调用方已有专属音。

## 工作纪律
- **严守任务书给的文件边界**——其他代理在并行,越界=冲突。
- **禁碰**:sw.js / CACHE_VERSION / git 操作 / design/ 目录(除非任务书明说)。
  APP_SHELL 注册、版本 bump、提交推送由总监督统一做——你在报告里列清单即可。
- 每改一个 JS:`wsl.exe -e bash -lc 'cd ~/cyrus-os && node --check scripts/<f>.js'`。
- 删 CSS 规则前 grep 全库(js+html)确认零引用;拿不准就留下并报告。
- CSS 改动若涉及 index.html 带 `?v=` 查询串的文件(components.css/energyflow.js),
  报告里提醒总监督 bump 查询串。

## 交付报告(硬性 ≤40 行)
只写:1) 改动文件+每文件一句话;2) 关键决策与取舍;3) 风险与需总监督跟进项
(含 APP_SHELL/查询串);4) node --check 结果。不要贴代码、不要复述任务书。
