/**
 * core.test.ts — run with `npm test` (tsx, zero-framework asserts).
 */
import assert from "node:assert/strict";
import {
  parseScheduleLines,
  diffSchedules,
  isFutureLine,
  formatMessage,
  splitForGroupMe,
  type SimpleDate,
} from "../src/core";

const TODAY: SimpleDate = { year: 2026, month: 8, day: 29 };

/* Parsing — Weebly-ish HTML with entities, zero-width chars, dup lines */
{
  const html =
    "<div>Junk header</div>" +
    "<p><strong>9/2</strong> Practice @ 12 Oaks 3:30-5:00 Range/Short Game/Putting<br>" +
    "9/3 Practice @ 12 Oaks 3:30-4:30 \u200bShort Game/Putting<br>" +
    "10/19 or 10/20 Regionals<br>" +
    "10/26-10/27 State Championship<br>" +
    "&#039;quoted&#039; not a date line<br>" +
    "9/3 Practice @ 12 Oaks 3:30-4:30 Short Game/Putting</p>"; // exact dup after normalize
  const lines = parseScheduleLines(html);
  assert.deepEqual(lines, [
    "9/2 Practice @ 12 Oaks 3:30-5:00 Range/Short Game/Putting",
    "9/3 Practice @ 12 Oaks 3:30-4:30 Short Game/Putting",
    "10/19 or 10/20 Regionals",
    "10/26-10/27 State Championship",
  ]);
  console.log("PASS parsing + dedupe + entity/zero-width handling");
}

/* Future-date logic incl. year rollover */
{
  assert.equal(isFutureLine("8/17 Home Match", TODAY), false, "past date");
  assert.equal(isFutureLine("8/29 Same-day change", TODAY), true, "today counts");
  assert.equal(isFutureLine("10/13 Conference Championship", TODAY), true, "future");
  assert.equal(isFutureLine("1/15 Winter thing", TODAY), true, "Jan -> next year");
  console.log("PASS future-date logic");
}

/* Diff: added / changed(with was) / removed / past-date noise ignored */
{
  const oldLines = [
    "9/2 Practice @ 12 Oaks 3:30-5:00 Range/Short Game/Putting",
    "9/15 Practice @ 12 Oaks 3:30-5:00 Possibly on course",
    "8/17 Home Match @ 12 Oaks 1st Place 126",
    "9/17 Holly Springs Match @ Devils Ridge 3:00 Tee Times",
  ];
  const newLines = [
    "9/2 Practice @ 12 Oaks 3:30-5:00 Range/Short Game/Putting",
    "9/15 Practice @ 12 Oaks 3:30-5:15 course confirmed",
    "9/25 Practice @ 12 Oaks 3:30-5:00 NEW SESSION",
  ];
  const diff = diffSchedules(oldLines, newLines, TODAY);
  assert.deepEqual(diff.added, ["9/25 Practice @ 12 Oaks 3:30-5:00 NEW SESSION"]);
  assert.deepEqual(diff.changed, [
    {
      now: "9/15 Practice @ 12 Oaks 3:30-5:15 course confirmed",
      was: "9/15 Practice @ 12 Oaks 3:30-5:00 Possibly on course",
    },
  ]);
  assert.deepEqual(diff.removed, ["9/17 Holly Springs Match @ Devils Ridge 3:00 Tee Times"]);

  const msg = formatMessage(diff);
  assert.ok(msg.includes("NEW: 9/25"));
  assert.ok(msg.includes("(was: 9/15 Practice @ 12 Oaks 3:30-5:00"));
  assert.ok(msg.includes("REMOVED: 9/17"));
  console.log("PASS diff + message formatting");
}

/* GroupMe splitting */
{
  const long = Array.from({ length: 40 }, (_, i) => `line number ${i} `.repeat(4)).join("\n");
  const chunks = splitForGroupMe(long, 200);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 200));
  assert.equal(chunks.join("\n"), long, "no content lost");
  console.log("PASS GroupMe chunk splitting");
}

console.log("\nAll tests passed \u2705");
