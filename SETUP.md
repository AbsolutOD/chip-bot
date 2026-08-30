# Golf Schedule Watcher — Setup (TypeScript)

Cloudflare Worker + `golfbot` CLI that watch brandonbritt.com/golf.html and post upcoming-schedule changes to GroupMe, showing exactly what changed and what it used to say.

## Layout

```
src/core.ts      Pure shared logic (parse / diff / format) — unit tested
src/worker.ts    Cloudflare Worker (cron + /run /dry /reset admin endpoints)
src/cli.ts       commander CLI
test/core.test.ts
```

## 1. GroupMe bot (~2 min)

dev.groupme.com/bots → Create Bot → pick the parents' group → copy the **Bot ID** (that's the only credential; it can only post to that one group).

## 2. Install & verify locally

```bash
npm install --legacy-peer-deps   # wrangler has a peer-dep conflict with workers-types
npm run typecheck
npm test
```

## 3. Try the CLI by hand

```bash
npm run cli -- scrape                 # fetch live page, print upcoming lines
npm run cli -- scrape --all --json    # everything, machine-readable
npm run cli -- post "test message" --bot-id YOUR_BOT_ID
```

## 4. Deploy the Worker

```bash
npx wrangler login
npx wrangler kv namespace create SCHEDULE_KV   # paste the id into wrangler.toml
npx wrangler secret put GROUPME_BOT_ID
npx wrangler secret put ADMIN_KEY              # any long random string
npm run deploy
```

## 5. Baseline & drive it from the CLI

```bash
export GOLFBOT_WORKER_URL=https://golf-schedule-watcher.<you>.workers.dev
export GOLFBOT_ADMIN_KEY=your-admin-key

npm run cli -- reset    # store current schedule as baseline (silent)
npm run cli -- dry      # preview diff: no notification, no state change
npm run cli -- check    # real check now: posts to GroupMe if changed
```

End-to-end test without waiting on the coach: `reset`, then edit one line of the KV value in the Cloudflare dashboard (Workers → KV → SCHEDULE_KV → schedule_lines_v1), then `check` — a CHANGED message should hit GroupMe.

## Behavior

- Cron 11:00 & 20:00 UTC = 7 AM / 4 PM EDT (shifts an hour when DST ends — see wrangler.toml).
- Only today-or-future events alert; deleting past weeks is silent. Dec→Jan rollover handled.
- Same-date text edits report as CHANGED with "(was: …)". New dates = NEW, vanished future events = REMOVED.
- Site down or unparseable → does nothing, state untouched.
- Messages auto-split under GroupMe's 1000-char cap.
- Cost: $0 (Cloudflare free tier, GroupMe bots free).
