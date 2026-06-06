# CLAUDE.md — operating manual for Claude

CyrusOS is a **vanilla-JS PWA. No build, no bundler, no npm.** You edit static
files and they ship as-is. Full architecture, data model, sync and push design
live in [README.md](./README.md) — read it for the "how it works". This file is
the "how to change it safely".

## Golden rules (do not break)

- **Finance is insert-only.** Write new rows into `fin_transactions`; never edit
  or delete existing transactions. Corrections are new offsetting rows.
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

## Layout (current; README has the base set)

The README module map is the v6.2 baseline. The app has since grown — notably:

- `scripts/finance.js`, `scripts/finance-charts.js` — finance ledger, budgets,
  analytics (Chart.js), insert-only transactions, themed calendar/time pickers.
- `scripts/the90.js` — 90-day tracker: check-in cells, per-target hard-standard
  boxes, weekly stats, streak, 90-day heatmap, lifetree hero.
- `scripts/theme.js` + `styles/theme-sterile.css` — theme switcher (Cappa /
  Sterile).
- `scripts/hermes.js` — notices from the Hermes agent (`hermes_notices` table).
- `scripts/ambient.js`, `lifetree.js`, `dragsort.js`, `applock.js`.

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
- **Render functions rebuild `innerHTML` on every change** (e.g. `rThe90()` runs
  on every check-in toggle and rebuilds the 450-cell heatmap). Consequences:
  - **Looping** animations (breathing/glow) are safe — they just restart.
  - **Entrance** animations (cascades, count-ups) MUST be gated by a
    session flag so they don't replay on every toggle. See `the90Cascaded` /
    `the90ArmCascade` (IntersectionObserver, because the heatmap has
    `content-visibility:auto` and is off-screen at first render).

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
