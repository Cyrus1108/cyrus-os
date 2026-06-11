# Cyrus OS

Personal operating system. Five pillars. Nothing else earns your time.

Live: <https://cyrus1108.github.io/cyrus-os/>

> 📐 **当前架构的唯一权威地图是 [ARCHITECTURE.md](./ARCHITECTURE.md)**（模块、
> 数据层、部署拓扑、接入配方）。本 README 是公开门面 + v6.2 时代的设计背景，
> 下方清单不再逐版本维护。

## What's here

Six panels, brass + cream Cappa aesthetic, full cloud sync:

- **The Creed** — manifesto, two variants, rotates
- **The 90** — 90-day commitment tracker (5 targets · daily check-ins · heatmap · phase auto-advance)
- **Morning Ritual** — 8-pill daily routine
- **Academics** — university tasks with reminders
- **Japanese N2** — daily streak + practice list + notes
- **Trading Desk** — daily checklist + session clock + bias notes
- **General Todos** — categorized, repeating, with reminders

Right-edge drawer: TradingView markets + economic calendar.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla JS, no build, no npm. 4 CSS + 12 JS modules, served as static files |
| Hosting | GitHub Pages |
| Auth | Supabase Magic Link (passwordless, single-user) |
| DB | Supabase Postgres + Realtime (cross-device sync) |
| Cron + Push | Cloudflare Worker (every minute) + VAPID Web Push |
| PWA | manifest + Service Worker (offline shell + push handler) |

## Local development

```bash
python -m http.server 8000 --directory /path/to/cyrus-os
```

Then <http://localhost:8000>. Service Worker works on localhost too.

## Module layout & data model

→ **[ARCHITECTURE.md](./ARCHITECTURE.md)** §2（28 个 JS 模块地图 + 启动时序）与
§3（23 张表、四种存储原型、LS 镜像、realtime）。本节在 v6.2 后不再维护清单副本。

当前规模一览：28 JS + 10 CSS 模块；面板含 The 90 五柱、晨间、课业、日语 N2
（完成即打卡）、交易、待办、财务（插入式记账 + 预算/目标/周期）、动机墙、
RPG 系统层（属性/成就/低谷日断路器）、信条与原则（每日宣读/晚间核查）。

## Sync strategy

- **On login** → `pullAll()` fetches every table in parallel, fills `S`, renders.
- **On every local save** → fire-and-forget `syncPushXxx()`. Failures logged, dirty flag stays set.
- **On visibility/focus return** → if Realtime channel dropped (Android Chrome suspends WebSockets in background), re-subscribe; if any `dirty.*` flag is set, replay the push; then re-pull and re-render.
- **Realtime** → per-table channel; remote change → re-pull that table only → re-render its panel.
- **Conflict policy** → last-write-wins (single user, multi-device — acceptable).

## Reminders (Web Push)

Server-driven, not client-driven (Android Chrome kills `setInterval` in background):

1. Every minute, Cloudflare Worker queries `todos` + `academics` for rows where `done=false AND remind>0 AND date>=yesterday`.
2. For each row: compute `dueAt = date + (time or 23:59) at +08:00`, `remindAt = dueAt - remind*60s`. If `remindAt <= now < dueAt` and `notified_for != currentDedupeKey`, dispatch a push.
3. Send VAPID-signed, aes128gcm-encrypted Web Push to every `push_subscriptions` row for that user. Stamp `notified_for` so the same `(date, time, remind)` tuple never fires twice.
4. Service Worker receives `push` event → `showNotification(...)`.

Dedupe key = `${date}T${time}|${remind}`. Editing the row changes the key → reminder fires again.

## Deploying / disaster recovery

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full bootstrap.

## Privacy

Repo is public; code contains no personal data. All user data lives in Supabase under RLS, accessible only with the user's session token. Service role key never ships to the client — it's a Cloudflare Worker secret.

## Roadmap (post-v6.2)

- Offline write queue (replay on reconnect — current behavior loses offline edits if another device wrote while offline)
- Profile timezone (currently hardcoded `+08:00` in worker)
- The 90 retroactive editing (only today is editable now)
- Outlook / Gmail / Google Calendar inbox (drawer pane stub already exists)
- Daily AI briefing via Claude API
