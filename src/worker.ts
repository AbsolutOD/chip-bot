/**
 * worker.ts — Cloudflare Worker entry point.
 *
 * Cron: scrapes the golf page, diffs against KV, posts changes to GroupMe.
 * HTTP (all require ?key=ADMIN_KEY):
 *   GET /run    -> run a check now (sends notifications)
 *   GET /dry    -> run a check, return diff JSON, no notification, no state update
 *   GET /reset  -> re-baseline from the current page (no notification)
 */

import {
  PAGE_URL,
  GROUPME_POST_URL,
  parseScheduleLines,
  diffSchedules,
  formatMessage,
  splitForGroupMe,
  hasChanges,
  todayInET,
} from "./core";

export interface Env {
  SCHEDULE_KV: KVNamespace;
  GROUPME_BOT_ID: string;
  ADMIN_KEY: string;
}

const KV_KEY = "schedule_lines_v1";

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCheck(env, { notify: true, persist: true }));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.searchParams.get("key") !== env.ADMIN_KEY) {
      return new Response("Forbidden", { status: 403 });
    }
    switch (url.pathname) {
      case "/run":
        return json(await runCheck(env, { notify: true, persist: true }));
      case "/dry":
        return json(await runCheck(env, { notify: false, persist: false }));
      case "/reset": {
        const lines = await fetchScheduleLines();
        if (!lines) return json({ ok: false, error: "fetch failed" });
        await env.SCHEDULE_KV.put(KV_KEY, JSON.stringify(lines));
        return json({ ok: true, baselined: lines.length });
      }
      default:
        return new Response("Not found", { status: 404 });
    }
  },
} satisfies ExportedHandler<Env>;

function json(obj: unknown): Response {
  return new Response(JSON.stringify(obj, null, 2), {
    headers: { "content-type": "application/json" },
  });
}

interface CheckOptions {
  notify: boolean;
  persist: boolean;
}

async function runCheck(env: Env, { notify, persist }: CheckOptions) {
  const newLines = await fetchScheduleLines();
  if (!newLines || newLines.length === 0) {
    // Fetch/parse failure — do NOT touch stored state, do not notify.
    return { ok: false as const, error: "Failed to fetch or parse schedule page" };
  }

  const storedRaw = await env.SCHEDULE_KV.get(KV_KEY);

  // First run: baseline silently.
  if (!storedRaw) {
    await env.SCHEDULE_KV.put(KV_KEY, JSON.stringify(newLines));
    return {
      ok: true as const,
      baselined: newLines.length,
      message: "Baseline stored, no notification sent",
    };
  }

  const oldLines: string[] = JSON.parse(storedRaw);
  const diff = diffSchedules(oldLines, newLines, todayInET());

  if (persist) {
    await env.SCHEDULE_KV.put(KV_KEY, JSON.stringify(newLines));
  }

  if (hasChanges(diff) && notify) {
    await postToGroupMe(env.GROUPME_BOT_ID, formatMessage(diff));
  }

  return { ok: true as const, hasChanges: hasChanges(diff), diff };
}

async function fetchScheduleLines(): Promise<string[] | null> {
  let res: Response;
  try {
    res = await fetch(PAGE_URL, {
      headers: {
        "User-Agent": "GolfScheduleWatcher/1.0 (team parent notification bot)",
      },
      cf: { cacheTtl: 0 },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  return parseScheduleLines(await res.text());
}

async function postToGroupMe(botId: string, text: string): Promise<void> {
  const chunks = splitForGroupMe(text);
  for (const chunk of chunks) {
    await fetch(GROUPME_POST_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bot_id: botId, text: chunk }),
    });
    // Small delay between multi-part messages so they arrive in order.
    if (chunks.length > 1) await new Promise((r) => setTimeout(r, 800));
  }
}
