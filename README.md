# Cyrus OS — v6.2

Personal operating system. Four pillars. Nothing else earns your time.

Live: <https://cyrus1108.github.io/cyrus-os/>

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

## Module layout

```
index.html              shell only (HTML)
manifest.json           PWA manifest
sw.js                   Service Worker (cache + push)
icon.svg, icons/*.png   PWA icons (incl. maskable)

styles/
  tokens.css            CSS variables (brass, cream, easings)
  base.css              typography, layout, inputs
  components.css        all panel/drawer/button styles
  animations.css        @keyframes

scripts/
  supabase.js           creates the sb client
  state.js              S, TODAY, constants, saveXX(), dirty flags
  auth.js               Magic Link, session bridge
  sync.js               pull/push/Realtime, focus rehydration
  notifications.js      Web Push subscription + permission UI
  creed.js              expandable manifesto
  drawer.js             right-edge reference drawer
  markets.js            TradingView widgets + calendar
  morning.js            morning ritual pills
  academics.js          academic tasks panel
  japanese.js           N2 streak + checklist + note
  trading.js            trading checklist + bias
  todos.js              general todos + categories
  the90.js              90-day tracker (Stage 5)
  app.js                init, clock, render orchestration, SW reg

cloudflare/
  worker.js             cron worker (VAPID + aes128gcm + Supabase reads)
```

Loading order in `index.html`: Supabase CDN → state.js (defines globals) → feature modules (function declarations) → sync.js → auth.js → app.js (calls `initAuth()` at the bottom).

## Data model

All Supabase tables RLS-scoped to `auth.uid() = user_id`. Realtime enabled on all of them.

| Table | Shape |
|---|---|
| `settings` | one row · creed_idx, show_done, symbols, banner state |
| `morning` | (user_id, date) · list jsonb |
| `academics` | one row per task · sub, name, date, time, pri, remind, done, notified_for |
| `japanese` | one row · streak, last_date, log jsonb, note, list jsonb |
| `trading` | (user_id, date) · bias, list jsonb |
| `categories` | one row per cat · name |
| `todos` | one row per todo · text, cat_id, date, time, pri, remind, repeat, custom_days, done, done_at, notified_for |
| `push_subscriptions` | one row per device · endpoint, p256dh, auth |
| `the90_meta` | one row · start_date, end_date, targets jsonb, current_phase |
| `the90_daily` | (user_id, date) · scores jsonb {I..V}, note |

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
