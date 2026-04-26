# Cyrus OS — v6.1

个人运作系统。单文件 HTML，Cappa 编辑美学。

## 部署到 GitHub Pages（首次）

1. 在 GitHub 创建一个新仓库，名字 `cyrus-os`（**Public**——免费版 Pages 要求公开）
2. 在本地这个目录推上去：
   ```bash
   git remote add origin https://github.com/<你的用户名>/cyrus-os.git
   git branch -M main
   git push -u origin main
   ```
3. 进仓库 → **Settings → Pages**
4. **Source**: Deploy from a branch
5. **Branch**: `main` / `/ (root)` → Save
6. 等 30-60 秒，刷新页面顶部出现绿色 ✓ 和 URL：
   `https://<你的用户名>.github.io/cyrus-os/`

## 添加到手机主屏幕

### iPhone (Safari)
1. Safari 打开上面的 URL
2. 底部分享按钮 → "添加到主屏幕"
3. 名称改 "Cyrus OS"，确认

### Android (Chrome)
1. Chrome 打开 URL
2. 右上角菜单 → "添加到主屏幕"

## 后续迭代

每次改完代码：
```bash
git add -A
git commit -m "描述改了什么"
git push
```
推上去 30 秒后 Pages 自动更新。手机上 PWA 重新打开会拿到新版本（除非 Service Worker 缓存了——那是 Phase 1 的事）。

## 数据存储

所有数据在浏览器 `localStorage`，前缀 `cyrus_dashboard_v6_`。**不要改前缀**——会丢历史数据。

手机和电脑是**两份独立的 localStorage**——目前不同步。云同步是 Phase 2。

## 路线图

- [x] **Phase 0** — 部署 + PWA 添加到主屏幕（你在这里）
- [ ] **Phase 1** — Service Worker + Web Push 通知
- [ ] **Phase 2** — Supabase 云同步（手机 ↔ 电脑实时一致）
- [ ] **Phase 3** — Outlook / Gmail / Google Calendar 接入
- [ ] **Phase 4** — Claude API agent brain（晨简报、状态建议）

## 隐私

- 仓库公开，但代码里没有个人数据
- 个人数据全在 localStorage（只在你自己的浏览器里）
- Phase 2 上线时必须加认证
