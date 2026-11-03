# Pillar

Habits, training, health, money and goals on one screen, with prayer times and
Qur'an for those who want them, and **Rafiq**, a built-in AI companion that reads
across all of it.

## Running it

```bash
npm install
npm run dev
```

Opens on http://localhost:3001. Create an account at `/signup`. The first account
on a machine becomes the owner, and takes over any existing `pillar.db`.

Only `npm run dev` is needed to start. `.env.example` lists what each optional
service needs; the app runs without any of them.

## Putting it online

```bash
powershell -ExecutionPolicy Bypass -File scripts/deploy-fly.ps1
```

Runs on Fly.io in Toronto, as one always-on machine with one encrypted disk at
`/data` (`fly.toml`, `Dockerfile`). It must stay at one machine: the data is SQLite
files on that disk. The script installs Fly's command-line tool if needed, signs in,
sets the secrets and deploys. Run it again to ship an update. Generated secrets are
saved in `.env.fly`, and losing `PILLAR_SECRET` means everyone reconnects their apps.

- Sign-ups need `PILLAR_INVITE_CODE` until it's removed. Share `/signup?invite=CODE`.
- The owner is `PILLAR_OWNER_EMAIL`, and moves home data in from Owner setup.
- Fly copies the disk daily and keeps each copy for 14 days.
- Add the server's callback URL to the Google client, as the script prints at the end.

## How accounts and data work

- **Every user has their own database file**, at `data/users/<id>.db`. `lib/db/index.ts`
  exports one `db`, which looks up the signed-in user on each query. Application
  code never filters by user, so a query can't return someone else's data.
- `data/auth.db` holds only accounts and sessions (`lib/auth/store.ts`). Passwords
  are scrypt hashes, and session tokens are stored hashed.
- **Background work has no request**, so it names its user with `runAsUser()`
  (`lib/auth/context.ts`). With no user at all, the database refuses to open.
- **New migrations apply themselves** the first time each user's file is opened.
- **No server-wide keys for user data.** Connections live encrypted in each user's
  own database (`lib/connections/vault.ts`). A shared env key would show one
  person's data to everyone.
- `proxy.ts` redirects when there's no session cookie. That's for a clean redirect:
  real enforcement is `requireUser()` and the database layer.

## Keeping data current

`instrumentation.ts` starts `lib/sync/scheduler.ts` with the server. Every 5 minutes
it runs each active user's sources through their own throttles (health 10 min, sales
30, banks 60), with no browser open. Open dashboards also re-render every 2 minutes.
Hosts that freeze between requests should call `POST /api/refresh` with
`Authorization: Bearer $CRON_SECRET` instead.

`/app/connect` shows how old each source's data actually is, and which ones can only
be updated by uploading a statement.

## Reminders

`lib/reminders/`. Browser push, with no accounts or keys to set up: the signing key is
made once in the data folder (`.vapid.json`). `schedule.ts` decides what's due and
`run.ts` sends it, once a minute for each active user. `public/sw.js` only shows
notifications and caches nothing. Subscriptions are only accepted for real push
services, because the server POSTs to the address they name.

## Time and place

`lib/date.ts`: the day rolls over at 4am in the user's own timezone, which follows
their device (`components/TimezoneSync.tsx`). Prayer times use the location, method and
Asr school each user set (`lib/prayer-options.ts`). With no location the tile asks
rather than guessing a city.

## Rafiq

- `lib/rafiq/prompt.ts`: standing instructions, including the firm religious-integrity
  rules (no fatwas, no Qur'an or hadith quoted from memory).
- `lib/rafiq/agent.ts`: the tool loop, on `claude-haiku-5-5`. Reads run straight away.
  **Any write stops the turn** and comes back as a confirm chip.
- `lib/rafiq/review.ts`: the weekly review. Every figure is counted from the database,
  so it works without an API key.
- Needs `ANTHROPIC_API_KEY`. Capped at 300 messages per user per month.

## Adding a widget

One folder under `lib/widgets/`. It owns how it loads, how it draws and what Rafiq may
ask it (see `lib/widgets/types.ts`). Register it in `registry.ts` and add it to
`lib/dashboard/catalog.ts`.

## Rules worth keeping

- **Money is integer cents** everywhere. Dollars exist only in `lib/format.ts`.
- **Uniqueness is enforced by the database**, so a double-tap can't corrupt a streak.
- **Rafiq has no delete tools**, and every write lands in `audit_log`.
- **No AI-written religious content.** Qur'an text, translation and tafsir are
  quoted from their source and cached unchanged (`lib/quran/source.ts`).
- **Client components can't import server modules as values.** `tsc` doesn't catch
  this; it shows up as a blank page. Shared helpers go in server-free files.
- **Arabic and `truncate`/`leading-none` don't mix**: clipping cuts marks below the line.

## Scripts

| Command | Does |
| ------- | ---- |
| `npm run db:generate` | Regenerate SQL after editing `lib/db/schema.ts` |
| `npm run db:migrate` | Migrate every user's database now |
| `npm run backup` | Dump the owner's database to `backups/YYYY-MM-DD.json` |
| `npm run backup:verify` | Dump, restore to a scratch db, and compare |
| `npm run import:money`, `import:holdings`, `import:sleep` | Command-line imports for the owner |

## Before opening to the public

- [ ] **Open sign-ups**: remove `PILLAR_INVITE_CODE`, once email is set up (Rafiq needs a confirmed address)
- [ ] **Google review**: Health scopes are Restricted. Testing mode allows named test
      users only and expires connections every 7 days; past 100 users needs an outside
      security assessment
- [ ] **Billing**: Pillar is free for now (`BILLING_LIVE = false` in `lib/dashboard/catalog.ts`), so Rafiq's cost is the owner's, capped at 100 messages per person per month. For paid plans: wire up Stripe, then set it to true
- [ ] **Email** for password resets (`RESEND_API_KEY`, and `MAIL_FROM` on a verified domain)
- [ ] **Licensing** for the Qur'an text, Saheeh translation and tafsir, and for Yahoo prices
- [ ] **Legal review** of `/privacy`, plus terms of service
- [ ] Domain and trademark checks on the name
