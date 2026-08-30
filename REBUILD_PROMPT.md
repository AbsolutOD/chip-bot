# Rebuild Prompt — Golf Schedule Watcher

Paste everything below this line into Claude (or Claude Code) to rebuild the project from scratch.

---

Build a "golf schedule watcher" in **TypeScript**: a Cloudflare Worker plus a commander-based CLI that share one pure core module. It monitors my kid's high-school golf coach's webpage and posts schedule changes to a GroupMe group so parents see exactly what changed.

## The source page

- URL: `http://www.brandonbritt.com/golf.html` (plain HTTP, static Weebly site — no JS rendering or scraping service needed; a plain fetch works).
- The schedule is free-text lines beginning with a `M/D` date, e.g. `9/2 Practice @ 12 Oaks 3:30-5:00 Range/Short Game/Putting`. Some lines are ranges or alternatives: `10/26-10/27 State Championship`, `10/19 or 10/20 Regionals`. Dates have **no year**.
- Matches appear in TWO sections of the page (a match-schedule paragraph and a combined daily list), sometimes with slightly different wording — de-duplicate exact repeats but expect near-duplicates for the same date.
- Weebly HTML quirks to handle when converting to text: `<br>` and block-element closes become newlines; strip all other tags, `<script>`, `<style>`; decode `&nbsp; &amp; &#039; &quot; &lt; &gt; &mdash; &ndash;`; strip zero-width characters (U+200B/C/D, U+FEFF); collapse runs of whitespace inside each line. These invisible-character and whitespace normalizations prevent false "changed" alarms when the coach re-saves the page.

## Project structure

```
src/core.ts     Pure logic only, no I/O: htmlToText, parseScheduleLines, isFutureLine,
                todayInET, diffSchedules, formatMessage, splitForGroupMe. Fully unit-tested.
src/worker.ts   Cloudflare Worker entry (cron + admin HTTP endpoints).
src/cli.ts      commander CLI ("golfbot").
test/core.test.ts  tsx + node:assert tests (no framework).
wrangler.toml, package.json, tsconfig.json
```

## Core behavior

1. **Parse**: extract all lines matching `/^\d{1,2}\/\d{1,2}/` from the text-converted page, normalized and de-duplicated, order preserved.
2. **Future filter**: only today-or-future events matter. Dates have no year: assume current year, but if that lands more than ~183 days in the past, treat it as next year (Dec→Jan rollover). "Today" must be computed in `America/New_York` via `Intl.DateTimeFormat` (Workers run in UTC).
3. **Diff** old vs new line sets (state = JSON array of lines in Workers KV, key `schedule_lines_v1`):
   - Line in new but not old, future-dated → **added**
   - Line in old but not new, future-dated → **removed**
   - Pair up added+removed lines sharing the same leading `M/D` date → **changed**, keeping both texts `{ now, was }`
   - Past-dated additions/removals (coach pruning old weeks) are silently ignored.
4. **Notify** via GroupMe bot API: `POST https://api.groupme.com/v3/bots/post` with JSON `{ bot_id, text }` (success = HTTP 202, empty body; no auth header needed — the bot_id is the credential and is scoped to one group). Message format:

   ```
   ⛳ Golf schedule update:
   🆕 NEW: <line>
   🔄 CHANGED: <new line>
      (was: <old line>)
   ❌ REMOVED: <line>
   Full schedule: brandonbritt.com/golf.html
   ```

   GroupMe caps messages at 1000 chars — split on line boundaries at ~990 and send chunks in order with a short delay between them.
5. **Safety rails**: if the page fetch fails or parses to zero lines, do nothing — no notification, and do NOT overwrite KV state. First-ever run baselines KV silently with no notification.

## Worker (src/worker.ts)

- `scheduled` handler (note: first param is `ScheduledController`, not `ScheduledEvent`) runs the check via `ctx.waitUntil`.
- `fetch` handler exposes admin endpoints, all requiring `?key=` to equal the `ADMIN_KEY` secret (403 otherwise):
  - `GET /run` — full check now, notifies on changes
  - `GET /dry` — returns the diff as JSON; no notification, no state write
  - `GET /reset` — re-baseline KV from the live page; no notification
- Bindings: KV namespace `SCHEDULE_KV`; secrets `GROUPME_BOT_ID`, `ADMIN_KEY`.
- Outbound page fetch: set a self-identifying User-Agent and `cf: { cacheTtl: 0 }`.

## CLI (src/cli.ts, commander)

Program name `golfbot`. Commands:

- `scrape [--json] [--all] [--file <path>]` — fetch the live page (or parse a local HTML file) and print parsed lines; upcoming-only by default, `--all` includes past dates. Nonzero exit + stderr message if zero lines parse.
- `post <text> [--bot-id <id>]` — send a test GroupMe message (bot id from flag or `GROUPME_BOT_ID` env). Treat HTTP 202 as success.
- `check` / `dry` / `reset` — call the deployed Worker's `/run` `/dry` `/reset`. Worker base URL from `-u/--url` or `GOLFBOT_WORKER_URL` env; admin key from `-k/--key` or `GOLFBOT_ADMIN_KEY` env. Print the JSON response; nonzero exit on HTTP error.

Flag beats env var everywhere. Run via `npm run cli -- <command>` (tsx).

## Config files

- `wrangler.toml`: `main = "src/worker.ts"` (wrangler compiles TS natively), `compatibility_date` = a current date, cron `["0 11,20 * * *"]` (7 AM / 4 PM EDT; comment that these are UTC and shift an hour when DST ends), KV binding block with a placeholder id and the creation command in a comment.
- `package.json`: `"type": "module"`; dependency `commander@^12`; devDeps `typescript@^5`, `tsx@^4`, `wrangler@^4`, `@cloudflare/workers-types@^4`, `@types/node`. Scripts: `deploy` (wrangler deploy), `dev` (wrangler dev), `typecheck` (tsc --noEmit), `test` (tsx test/core.test.ts), `cli` (tsx src/cli.ts). Known gotcha: wrangler has a peer-dependency conflict with workers-types — install with `npm install --legacy-peer-deps`.
- `tsconfig.json`: target/lib ES2022, module ESNext, moduleResolution bundler, strict, noEmit, skipLibCheck, `"types": ["@cloudflare/workers-types", "node"]`.

## Tests (must pass before delivering)

Cover at minimum: parsing of Weebly-style HTML (entities, zero-width chars, exact-duplicate removal, non-date lines excluded); future-date logic with a **fixed injected "today"** (past date false, same-day true, future true, January date in August → next year → true); a full diff producing one added, one changed-with-was, one removed, while a past-dated removal is ignored; message formatting contains NEW/CHANGED/(was:)/REMOVED; GroupMe splitting produces chunks all under the cap with no content lost. Make `isFutureLine`/`diffSchedules` take `today` as a parameter so tests are deterministic.

## Deployment notes (include in a SETUP.md)

GroupMe bot: create at dev.groupme.com/bots attached to the parents' group; the Bot ID is the only credential. Cloudflare: `wrangler login`, `wrangler kv namespace create SCHEDULE_KV` (paste id into wrangler.toml), `wrangler secret put GROUPME_BOT_ID`, `wrangler secret put ADMIN_KEY`, `wrangler deploy`. First step after deploy: hit `/reset` to baseline. Test end-to-end by editing one line of the KV value in the Cloudflare dashboard, then hitting `/run`. Everything fits Cloudflare's free tier; total cost $0.
