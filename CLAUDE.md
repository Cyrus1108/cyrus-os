# CLAUDE.md — operating manual for Claude

> ⚠️ **动工前先读 [ARCHITECTURE.md](./ARCHITECTURE.md)** —— 环境拓扑、模块地图、
> 数据层、接入配方（Recipes）全在那里，读它代替考古式读码。本文件只保留
> 红线（golden rules）与部署纪律。

CyrusOS is a **vanilla-JS PWA. No build, no bundler, no npm.** You edit static
files and they ship as-is.

## Golden rules (do not break)

- **Finance is full CRUD.** `fin_transactions` may be inserted, edited, and
  deleted (owner-confirmed 2026-07-06 — supersedes the former insert-only rule;
  the main app already ships `finUpdateTx`/`finDeleteTx`). Keep writes RLS-scoped
  and currency derived from the account (below).
- **Currency is an account property, not a per-transaction one.** Do not
  reintroduce a per-transaction currency picker.
- **Never commit or paste secrets.** Repo is **public** (GitHub Pages). The
  Supabase `service_role` key bypasses RLS and lives only as a Cloudflare Worker
  secret — it must never appear in the repo, a commit, or chat. The anon key in
  `scripts/supabase.js` is the only key that belongs client-side.
- **All DB writes are RLS-scoped to `auth.uid() = user_id`.** Derive `user_id`
  from the session / existing rows at runtime; never hardcode it.

## Build & deploy ritual

There is no build. To ship a change to the live app:

1. Edit the file(s) under `styles/` / `scripts/` / `index.html`.
2. **Bump `CACHE_VERSION` in `sw.js`** (e.g. `cyrus-os-v6.34.3` → `v6.34.4`).
   This is mandatory for any change to the app shell — without it, clients keep
   serving the old cached file. Patch for fixes, minor for features.
3. `git add … && git commit && git push` (see commit convention below).
4. GitHub Pages auto-deploys from `main`. The Service Worker's
   `controllerchange` handler auto-reloads open clients onto the new version.

**Docs-only changes (like this file) do NOT bump `CACHE_VERSION`** — CLAUDE.md,
README, etc. are not part of the PWA shell, so bumping would force a pointless
re-download for every client.

## Repo & git

- The repo lives natively in WSL at `~/cyrus-os` (`/home/cyrus1108/cyrus-os`).
  Run `git` directly here — it's a Linux repo, no wrappers needed.
- Default branch: `main`, pushes to `git@github.com:Cyrus1108/cyrus-os.git`.
- Commit only when asked. End commit messages with the project's trailer:
  `Co-Authored-By: Claude <noreply@anthropic.com>`. A one-line subject naming
  the version + what changed works well (matches existing history).

## Layout

完整模块地图（28 JS / 10 CSS，一行一文件）在 **[ARCHITECTURE.md §2](./ARCHITECTURE.md)**，
此处不再维护副本。仅保留一条部署规则：

`sw.js`'s `APP_SHELL` array is the authoritative list of shipped files — **add
any new CSS/JS module there**, or it won't be cached/offline-available.

## CSS & animation conventions

- **Use design tokens, never hardcode.** Colors, easings and durations are in
  `styles/tokens.css`: brass/cream palette; easings `--ease-silk / --ease-drawer
  / --ease-press`; durations `--dur-fast (120ms) / --dur-base (200ms) / --dur-slow
  (320ms) / --dur-slower (480ms)`.
- **Avoid `transition: all`** — animate specific GPU-friendly props
  (`transform`, `opacity`) so layout-triggering properties don't get animated.
- **`prefers-reduced-motion` is globally honored** (`animations.css`): all
  animations collapse to ~0.01ms. New keyframes inherit this automatically;
  JS-driven motion (e.g. `animateNumber` in `app.js`) guards it explicitly.
- **Render model (v7.32+): skeleton-once + partial update** — render functions
  no longer blow away `innerHTML`; they build a static skeleton once
  (`ensureSkeleton`) and then do keyed row reconciliation + guarded text/class
  writes (`reconcileList`/`setText`/`setHTML`… in `scripts/render-core.js`).
  Consequences:
  - Panel-interior nodes are **persistent** — animations/GSAP may bind to them,
    but anything driving a node over time must tolerate being re-driven
    (see `animateNumber`'s `_anGen` generation guard).
  - New list renders follow the same pattern: container holds only keyed rows;
    row inner markup rewritten only when its own data changed.
  - **Entrance** animations are still gated by session flags (`the90Cascaded` /
    `the90ArmCascade`); the 450-cell heatmap keeps its signature-memo rebuild.

## Data & backend

- Supabase Postgres + Realtime, RLS per `user_id`. Tables include the README set
  plus finance (`fin_*`), `the90_meta` / `the90_daily`, `hermes_notices`.
- Server-side jobs use Supabase `pg_cron` (e.g. recurring transactions, asset
  snapshots, completed-todo cleanup) and a Cloudflare Worker for Web Push.
- Timezone is hardcoded `+08:00` (Taipei) in date logic and the worker.

## Verify before shipping

- JS syntax: `node --check scripts/<file>.js`.
- Run locally: `python3 -m http.server 8000 --directory ~/cyrus-os` →
  <http://localhost:8000> (Service Worker works on localhost).
- After deploy, hard-refresh (Ctrl+Shift+R) if the SW seems to serve stale files.
