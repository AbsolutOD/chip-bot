/**
 * core.ts — pure, environment-agnostic logic shared by the Worker and the CLI.
 * No I/O in this file: everything takes inputs and returns outputs, so it's
 * trivially testable.
 */

export const PAGE_URL = "http://www.brandonbritt.com/golf.html";
export const GROUPME_POST_URL = "https://api.groupme.com/v3/bots/post";
export const GROUPME_MAX_LEN = 990; // GroupMe hard limit is 1000 chars
export const TZ = "America/New_York";

export interface ChangedEntry {
  now: string;
  was: string;
}

export interface ScheduleDiff {
  added: string[];
  changed: ChangedEntry[];
  removed: string[];
}

export interface SimpleDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export function htmlToText(html: string): string {
  let t = html;
  t = t.replace(/<script[\s\S]*?<\/script>/gi, "");
  t = t.replace(/<style[\s\S]*?<\/style>/gi, "");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer)>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");
  // Decode the entities that actually appear on Weebly pages.
  t = t
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&mdash;/gi, "\u2014")
    .replace(/&ndash;/gi, "\u2013")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, ""); // zero-width chars Weebly loves
  return t;
}

/**
 * Extract every schedule line: lines that start with a M/D date, e.g.
 * "9/2 Practice @ 12 Oaks 3:30-5:00". Also matches "10/19 or 10/20 Regionals"
 * and "10/26-10/27 State Championship". De-duplicates exact repeats
 * (the page lists matches in two sections) while preserving order.
 */
export function parseScheduleLines(html: string): string[] {
  const text = htmlToText(html);
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => /^\d{1,2}\/\d{1,2}/.test(l));
  return [...new Set(lines)];
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

export function todayInET(now: Date = new Date()): SimpleDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (type: string): number =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * The page's dates carry no year. Assume the current year, but if that lands
 * more than ~6 months in the past, it must mean next year (Dec -> Jan rollover).
 * Keeps today's events too — same-day changes matter most.
 */
export function isFutureLine(line: string, today: SimpleDate): boolean {
  const m = line.match(/^(\d{1,2})\/(\d{1,2})/);
  if (!m) return false;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  let year = today.year;
  const todayUTC = Date.UTC(today.year, today.month - 1, today.day);
  const candidate = Date.UTC(year, month - 1, day);
  const diffDays = (candidate - todayUTC) / 86_400_000;
  if (diffDays < -183) year += 1;

  return Date.UTC(year, month - 1, day) >= todayUTC;
}

/* ------------------------------------------------------------------ */
/* Diffing                                                             */
/* ------------------------------------------------------------------ */

export function diffSchedules(
  oldLines: string[],
  newLines: string[],
  today: SimpleDate
): ScheduleDiff {
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  // Only care about upcoming events. (Coach deleting past weeks = noise.)
  const added = newLines.filter((l) => !oldSet.has(l) && isFutureLine(l, today));
  const removed = oldLines.filter((l) => !newSet.has(l) && isFutureLine(l, today));

  // Pair removed+added lines that share the same leading date -> "changed".
  const changed: ChangedEntry[] = [];
  const addedByDate = groupByDate(added);
  const removedByDate = groupByDate(removed);

  const finalAdded: string[] = [];
  const consumedRemoved = new Set<string>();

  for (const [date, addList] of addedByDate) {
    const remList = removedByDate.get(date) ?? [];
    const n = Math.min(addList.length, remList.length);
    for (let i = 0; i < n; i++) {
      changed.push({ now: addList[i], was: remList[i] });
      consumedRemoved.add(remList[i]);
    }
    for (let i = n; i < addList.length; i++) finalAdded.push(addList[i]);
  }

  const finalRemoved = removed.filter((l) => !consumedRemoved.has(l));

  return { added: finalAdded, changed, removed: finalRemoved };
}

function groupByDate(lines: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const line of lines) {
    const date = line.match(/^\d{1,2}\/\d{1,2}/)![0];
    const list = map.get(date);
    if (list) list.push(line);
    else map.set(date, [line]);
  }
  return map;
}

export function hasChanges(diff: ScheduleDiff): boolean {
  return diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0;
}

/* ------------------------------------------------------------------ */
/* Message formatting                                                  */
/* ------------------------------------------------------------------ */

export function formatMessage(diff: ScheduleDiff): string {
  const parts: string[] = ["\u26f3 Golf schedule update:"];

  for (const line of diff.added) parts.push(`\ud83c\udd95 NEW: ${line}`);
  for (const { now, was } of diff.changed) {
    parts.push(`\ud83d\udd04 CHANGED: ${now}`);
    parts.push(`   (was: ${was})`);
  }
  for (const line of diff.removed) parts.push(`\u274c REMOVED: ${line}`);

  parts.push("Full schedule: brandonbritt.com/golf.html");
  return parts.join("\n");
}

/** Split on line boundaries so each chunk fits GroupMe's 1000-char cap. */
export function splitForGroupMe(text: string, maxLen: number = GROUPME_MAX_LEN): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if (current && (current + "\n" + line).length > maxLen) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + "\n" + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
