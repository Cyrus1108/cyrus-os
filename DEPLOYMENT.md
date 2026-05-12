# DEPLOYMENT — bootstrapping Cyrus OS from zero

This is the full setup, in order. Time budget: ~45 minutes if nothing goes wrong.

Five accounts needed (all free):
- GitHub
- Supabase
- Cloudflare
- Email for Magic Link login
- Google (only if switching from Magic Link to Google OAuth — optional)

---

## 1. GitHub Pages

```bash
git clone <this repo>
cd cyrus-os
git remote add origin https://github.com/<you>/cyrus-os.git
git push -u origin main
```

GitHub → repo Settings → Pages:
- Source: Deploy from a branch
- Branch: `main` / `(root)` → Save

After ~30s the URL is `https://<you>.github.io/cyrus-os/`. **Keep the path lowercase** (`cyrus-os`, not `CyrusOS`) — every redirect URL downstream depends on it.

---

## 2. Supabase

### 2a. Create project

<https://supabase.com> → New project
- Name: `cyrus-os`
- Region: closest to you (Cyrus uses Singapore)
- DB password: auto-generate, save it

Wait ~2 minutes for the project to provision.

### 2b. Run schema SQL

Supabase → SQL Editor → New query → paste this whole block → Run:

```sql
-- Settings (per user)
create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  creed_idx int default 0,
  creed_open bool default false,
  show_done bool default false,
  symbols text[],
  notif_banner_dismissed bool default false,
  updated_at timestamptz default now()
);

create table public.morning (
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  list jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, date)
);

create table public.academics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  sub text, name text, date date, time time,
  pri text, remind int default 0,
  done bool default false,
  notified_for text,
  created_at timestamptz default now()
);

create table public.japanese (
  user_id uuid primary key references auth.users(id) on delete cascade,
  streak int default 0,
  last_date date,
  log jsonb default '{}'::jsonb,
  note text default '',
  list jsonb not null,
  updated_at timestamptz default now()
);

create table public.trading (
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  bias text default '',
  list jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, date)
);

create table public.categories (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table public.todos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  text text not null,
  cat_id uuid references public.categories(id) on delete set null,
  date date, time time, pri text,
  remind int default 0,
  repeat text default 'none',
  custom_days int default 0,
  done bool default false,
  done_at timestamptz,
  notified_for text,
  created_at timestamptz default now()
);

create table public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now()
);

create table public.the90_meta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  targets jsonb not null,
  current_phase text not null default 'standardize',
  updated_at timestamptz default now()
);

create table public.the90_daily (
  user_id uuid references auth.users(id) on delete cascade,
  date date not null,
  scores jsonb not null default '{}'::jsonb,
  note text default '',
  updated_at timestamptz default now(),
  primary key (user_id, date)
);

-- RLS
alter table public.settings enable row level security;
alter table public.morning enable row level security;
alter table public.academics enable row level security;
alter table public.japanese enable row level security;
alter table public.trading enable row level security;
alter table public.categories enable row level security;
alter table public.todos enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.the90_meta enable row level security;
alter table public.the90_daily enable row level security;

create policy "own_settings" on public.settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_morning" on public.morning for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_academics" on public.academics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_japanese" on public.japanese for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_trading" on public.trading for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_categories" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_todos" on public.todos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_push_subs" on public.push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_the90_meta" on public.the90_meta for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_the90_daily" on public.the90_daily for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime
alter publication supabase_realtime add table public.settings;
alter publication supabase_realtime add table public.morning;
alter publication supabase_realtime add table public.academics;
alter publication supabase_realtime add table public.japanese;
alter publication supabase_realtime add table public.trading;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.todos;
alter publication supabase_realtime add table public.push_subscriptions;
alter publication supabase_realtime add table public.the90_meta;
alter publication supabase_realtime add table public.the90_daily;
```

### 2c. Auth — Magic Link

Default works. Just configure URLs:

Authentication → URL Configuration:
- Site URL: `https://<you>.github.io/cyrus-os/`
- Redirect URLs (add both):
  - `https://<you>.github.io/cyrus-os/`
  - `http://localhost:8000/`

### 2d. Wire up the client

Project Settings → API:
- Copy **Project URL** and **publishable key** (`sb_publishable_...`)

Open `scripts/supabase.js`, replace the two constants:

```js
const SUPABASE_URL = 'https://<your-project-ref>.supabase.co';
const SUPABASE_KEY = 'sb_publishable_<your-key>';
```

Commit and push. Refresh the live URL — you should see the Magic Link login screen.

---

## 3. Cloudflare Worker (cron + push)

### 3a. Generate VAPID keys

Run this locally (needs Python + cryptography lib):

```python
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
import base64

priv = ec.generate_private_key(ec.SECP256R1())
pub_b = priv.public_key().public_bytes(
    serialization.Encoding.X962,
    serialization.PublicFormat.UncompressedPoint
)
priv_b = priv.private_numbers().private_value.to_bytes(32, 'big')

def b64u(b): return base64.urlsafe_b64encode(b).decode().rstrip('=')
print('VAPID_PUBLIC =', b64u(pub_b))
print('VAPID_PRIVATE =', b64u(priv_b))
```

Save the **public** one into `scripts/notifications.js` at the top:
```js
const VAPID_PUBLIC_KEY = '<paste here>';
```

Commit + push.

### 3b. Get the Supabase service role key

Supabase → Project Settings → API → reveal `service_role` key. **This bypasses RLS** — only Cloudflare Worker may see it, never the browser.

### 3c. Create the Worker

Cloudflare → Workers & Pages → Create → Create Worker
- Name: `cyrus-os-reminders`
- Deploy (default hello-world is fine for now)

Then Settings → Variables and Secrets → Add Secret (Encrypted) for each of:

```
SUPABASE_URL          = https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_KEY  = <service_role from step 3b>
VAPID_PUBLIC          = <from step 3a>
VAPID_PRIVATE         = <from step 3a>
VAPID_SUBJECT         = mailto:<your-email>
```

Settings → Triggers → Cron Triggers → Add → `* * * * *` (every minute).

### 3d. Replace Worker code

Open `cloudflare/worker.js` in this repo → copy entire file.

Cloudflare → cyrus-os-reminders → Edit code → select all, paste, **Save and Deploy**.

Test: open `https://<worker>.workers.dev/test` — it should print `OK — checkReminders ran`. Worker Console (Observability tab) should log `[cron] no due reminders` every minute when there's nothing to fire.

---

## 4. Adjust hardcoded values

- `cloudflare/worker.js` line ~242: timezone offset `+08:00` — change if not Taipei.
- `scripts/the90.js` top: `THE_90_START` / `THE_90_END` — change for a new 90-day cycle.
- `scripts/the90.js` defaults: `THE_90_TARGETS_DEFAULT`, `THE_90_IDENTITIES` — change for your own commitments. (Existing users won't see changes — those are only seeded on first pull. Use the SQL editor to update `the90_meta.targets` directly for an existing user.)

---

## 5. Install as PWA

### Android (Chrome / Edge — Chromium with Google Play services)
1. Open the live URL
2. Address bar menu → "Install app" / 安装应用
3. Icon appears on home screen, launches standalone

### Desktop Chrome / Edge
1. Address bar → install icon (right side)
2. Standalone window with the app

**Brave / Vivaldi / Comet** — these Chromium forks disable Google FCM by default for privacy. Push subscriptions appear to succeed but the push service returns 410 (subscription unknown). Either enable FCM in browser privacy settings, or use real Chrome for push-enabled use.

---

## 6. Verify end-to-end

After everything's deployed:

1. Open the live URL → Magic Link → check email → click link → see dashboard.
2. Open in second device → Magic Link with same email → see same data.
3. Modify on device A → device B updates within 1–2 seconds (Realtime).
4. Add a todo with `remind = 1 min before due`, `due = now + 2 min`. Lock the device. After 1 minute, notification should appear on the lock screen.
5. Worker Console should log `[cron] 1 due reminder(s)` for that minute.

---

## Rotating secrets

### If `service_role` leaks
1. Supabase → Settings → API → Generate new service_role key
2. Cloudflare → Worker → Settings → Variables → edit `SUPABASE_SERVICE_KEY` → paste new value → Save

### If VAPID private leaks
1. Regenerate keypair (step 3a)
2. Update `scripts/notifications.js` with new `VAPID_PUBLIC_KEY` → commit + push
3. Update Cloudflare Worker secrets `VAPID_PUBLIC` and `VAPID_PRIVATE`
4. Every existing subscription becomes invalid → users must re-subscribe (open app, click Enable banner again). Worker will see 410 for stale subscriptions and prune them.

### If you lose all the secrets but still have GitHub + accounts
Everything except VAPID is reproducible from the dashboards (Supabase regenerates keys; Cloudflare just needs the env vars re-entered). VAPID keypair must be regenerated and old subscriptions cleared.

---

## File checklist after a fresh clone

After `git clone` you should have all of these tracked:

```
README.md
DEPLOYMENT.md
index.html
manifest.json
sw.js
icon.svg
icons/{icon-192,icon-512,icon-maskable}.png
styles/{tokens,base,components,animations}.css
scripts/{supabase,state,auth,sync,notifications,creed,drawer,markets,morning,academics,japanese,trading,todos,the90,app}.js
cloudflare/worker.js
```
