#!/usr/bin/env node
/**
 * cli.ts — hand-run the watcher from your terminal (commander-based).
 *
 * Local commands (no deployed worker needed):
 *   golfbot scrape [--json] [--all] [--file <path>]   Fetch & parse the page (or a local HTML file)
 *   golfbot post <text> [--bot-id <id>]               Send a test message to GroupMe
 *
 * Remote commands (drive the deployed Worker's admin endpoints):
 *   golfbot check   [-u <url>] [-k <key>]             Full check now; notifies GroupMe on changes
 *   golfbot dry     [-u <url>] [-k <key>]             Diff preview: no notification, no state change
 *   golfbot reset   [-u <url>] [-k <key>]             Re-baseline KV from the live page
 *
 * Config resolution order: flag > environment variable.
 *   GOLFBOT_WORKER_URL   e.g. https://golf-schedule-watcher.you.workers.dev
 *   GOLFBOT_ADMIN_KEY    the ADMIN_KEY secret you set with wrangler
 *   GROUPME_BOT_ID       only needed for `post`
 */

import { Command } from "commander";
import { readFile } from "node:fs/promises";
import process from "node:process";
import {
  PAGE_URL,
  GROUPME_POST_URL,
  parseScheduleLines,
  isFutureLine,
  todayInET,
  splitForGroupMe,
} from "./core";

const program = new Command();

program
  .name("golfbot")
  .description("Golf schedule watcher — scrape locally or drive the deployed Cloudflare Worker")
  .version("1.0.0");

/* ------------------------------------------------------------------ */
/* Local: scrape                                                       */
/* ------------------------------------------------------------------ */

program
  .command("scrape")
  .description("Fetch the coach's page and print the parsed schedule lines")
  .option("--json", "output as JSON instead of plain text")
  .option("--all", "include past-dated lines (default: upcoming only)")
  .option("--file <path>", "parse a local HTML file instead of fetching the live page")
  .action(async (opts: { json?: boolean; all?: boolean; file?: string }) => {
    let html: string;
    if (opts.file) {
      html = await readFile(opts.file, "utf8");
    } else {
      const res = await fetch(PAGE_URL, {
        headers: { "User-Agent": "GolfScheduleWatcher-CLI/1.0" },
      });
      if (!res.ok) fail(`Fetch failed: HTTP ${res.status}`);
      html = await res.text();
    }

    let lines = parseScheduleLines(html);
    if (!opts.all) {
      const today = todayInET();
      lines = lines.filter((l) => isFutureLine(l, today));
    }

    if (lines.length === 0) {
      fail("No schedule lines parsed — page structure may have changed.");
    }

    if (opts.json) {
      console.log(JSON.stringify({ count: lines.length, lines }, null, 2));
    } else {
      console.log(`${lines.length} ${opts.all ? "" : "upcoming "}schedule line(s):\n`);
      for (const line of lines) console.log(`  ${line}`);
    }
  });

/* ------------------------------------------------------------------ */
/* Local: post a test message to GroupMe                               */
/* ------------------------------------------------------------------ */

program
  .command("post")
  .description("Send a test message to the GroupMe group")
  .argument("<text>", "message text")
  .option("--bot-id <id>", "GroupMe bot id (or set GROUPME_BOT_ID)")
  .action(async (text: string, opts: { botId?: string }) => {
    const botId = opts.botId ?? process.env.GROUPME_BOT_ID;
    if (!botId) fail("Missing bot id: pass --bot-id or set GROUPME_BOT_ID");

    for (const chunk of splitForGroupMe(text)) {
      const res = await fetch(GROUPME_POST_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bot_id: botId, text: chunk }),
      });
      // GroupMe returns 202 with an empty body on success.
      if (!res.ok && res.status !== 202) {
        fail(`GroupMe post failed: HTTP ${res.status}`);
      }
    }
    console.log("Posted \u2713");
  });

/* ------------------------------------------------------------------ */
/* Remote: drive the deployed Worker                                   */
/* ------------------------------------------------------------------ */

for (const [name, path, desc] of [
  ["check", "/run", "Run a full check now (posts to GroupMe if anything changed)"],
  ["dry", "/dry", "Preview the diff without notifying or saving state"],
  ["reset", "/reset", "Re-baseline stored state from the current page (no notification)"],
] as const) {
  program
    .command(name)
    .description(desc)
    .option("-u, --url <url>", "worker base URL (or set GOLFBOT_WORKER_URL)")
    .option("-k, --key <key>", "admin key (or set GOLFBOT_ADMIN_KEY)")
    .action(async (opts: { url?: string; key?: string }) => {
      const base = opts.url ?? process.env.GOLFBOT_WORKER_URL;
      const key = opts.key ?? process.env.GOLFBOT_ADMIN_KEY;
      if (!base) fail("Missing worker URL: pass --url or set GOLFBOT_WORKER_URL");
      if (!key) fail("Missing admin key: pass --key or set GOLFBOT_ADMIN_KEY");

      const target = new URL(path, base);
      target.searchParams.set("key", key);

      const res = await fetch(target);
      const body = await res.text();
      if (!res.ok) fail(`Worker returned HTTP ${res.status}: ${body}`);
      console.log(body);
    });
}

function fail(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

program.parseAsync(process.argv);
