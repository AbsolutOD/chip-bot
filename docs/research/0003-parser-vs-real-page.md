# Research #3 — The parser against the real page

**Question:** what does `parseScheduleLines` actually do against
`http://www.brandonbritt.com/golf.html`, as opposed to the hand-written sample
HTML in `src/core.test.ts`?

- **Captured:** 2026-08-30 13:43 UTC, `curl` → `src/fixtures/golf-2026-08-30.html`
  (28,784 bytes, sha256 `80a7747…95598b`). Two fetches 30 s apart were
  **byte-identical**, so the page carries no per-request nonce or timestamp in
  the content region — a re-fetch on its own can never produce a spurious diff.
- **Method:** ran the real `src/core.ts` exports over the fixture, plus mutation
  scenarios (below). No code was changed.
- **Scope note:** this ticket reports what the parser *does*. It does not decide
  the diff-correctness ticket (#5 / #7); §5 is the input to that decision.

---

## 1. Headline numbers

| | count |
|---|---|
| Non-empty text lines after `htmlToText` | 64 |
| Lines matching the `/^\d{1,2}\/\d{1,2}/` anchor | 45 |
| Exact duplicates collapsed by the `Set` | 5 |
| **`parseScheduleLines` output** | **40** |
| Distinct leading dates | 33 |
| Dates carrying **more than one** line | **7** |
| Survive `isFutureLine` on 2026-08-30 | 39 (only `8/17` drops) |

**Does 40 match what a human reads?** Yes, exactly. The page renders 45 dated
line items — 13 in the "Match Schedule (subject to change)" `<h2>` block and 32
in the detailed paragraph below it. Five of those are byte-identical across the
two blocks and collapse. Nothing a human sees as a dated line is missing from
the 40, and nothing in the 40 is an artefact the page doesn't show.

Counted as *real-world events*, the page holds **33** — one per distinct date.
Every duplicate-date group is the same event described twice, never two events
on one day. That is a property of this snapshot, not a guarantee.

## 2. The two sections, and how the pairs differ

Twelve of the thirteen matches appear in both blocks (`8/17` is summary-only,
and it carries a *result*, "1st Place 126", not a schedule).

**Five pairs are byte-identical and collapse silently:**
`9/8`, `9/14` (differs only by a trailing `&nbsp;`, normalised away), `9/17`,
`9/28`, `10/26-10/27`.

**Seven pairs survive as near-duplicates** — the summary block is terse, the
detail block appends a roster or ranking note:

| date | summary block | detail block |
|---|---|---|
| `8/31` | …at 4:00 **(All Players Are Playing)** | …at 4:00 **(will be used as qualifying for Hedingham match )** |
| `9/1` | …Tee Times **(Charlotte, Amelia, Taylor, Peyton, Clara)** | …Tee Times |
| `9/16` | …12:30 **confirmed** | …12:30 **(Best 4 Rankings confirmed)** |
| `9/22` | …2:00 Tee Times | …2:00 Tee Times **(Best 5 Rankings)** |
| `10/13` | …White to Orange Rotation | …White to Orange Rotation **(Best 5 Rankings)** |
| `10/14` | …Pinehurst #8 1:00 | …Pinehurst #8 1:00 **(Best 4 Rankings)** |
| `10/19` | 10/19 or 10/20 Regionals | 10/19 or 10/20 Regionals **(Best 5 Rankings)** |

Consequence for the bot: **every match is announced twice**, in two slightly
different wordings, and any edit the coach makes to both blocks fires two
notifications for one real change. Loud, but consistent with the map's bias.

## 3. Lines the anchor misses

Nothing on today's page. Every non-anchored text line is chrome (nav, footer,
headings) or prose. Two are worth naming:

- `&#8203;&#8203;` — a bare spacer line (see §4).
- *"There are no practices or course privileges on Fridays."* — schedule-relevant
  policy, but not a dated line and not something the diff should chase.

The **shapes** the anchor would miss are not hypothetical for a Weebly page. Each
was tested by mutating the real fixture:

| mutation | result |
|---|---|
| `&#8203;` prefixed to a line | line vanishes → reported `REMOVED` |
| `Mon ` prefixed to a line | line vanishes → reported `REMOVED` |
| `10/7` rewritten `10-7` | line vanishes → reported `REMOVED` |
| detail wrapped onto a second `<br>` line | continuation text **silently dropped** |

The failure mode matters for "err loud": these fail **loud once, then silent**.
The line is announced as `REMOVED`, and from then on it is simply absent from the
parsed set — every later real change to that event goes unreported forever.
The continuation case is worse: it is loud once as a `CHANGED` that *looks* like
the coach deleted the detail, then silent.

## 4. Weebly quirks — which the code actually earns

Entities present in the raw HTML: `&nbsp;` ×23, `&#039;` ×1, `&gt;` ×1,
**`&#8203;` ×2**. `<br>` appears 48 times, always as `<br />`.

| handled by `htmlToText` | present? |
|---|---|
| `&nbsp;` | yes ×23 — load-bearing |
| `&#039;` | yes ×1 (page title) |
| `&gt;` | yes ×1 (in a JS template string, never reaches text) |
| `<br>` | yes ×48 |
| literal `​`/`‌`/`‍`/`﻿` | **zero** — the code strips the character, the page emits the entity |
| `&amp;` `&quot;` `&lt;` `&mdash;` `&ndash;` | zero |

**The one real gap: `&#8203;` is not decoded.** `htmlToText` strips zero-width
*characters* but the page writes them as numeric *entities*, so `&#8203;` passes
through verbatim into the parsed text. Today both sit on a spacer line that no
anchor matches, so nothing breaks. The moment Weebly puts one at the head of a
schedule line — which is exactly where a WYSIWYG editor leaves them — that line
disappears (tested, §3). Cheap fix: decode numeric entities generally, or at
minimum `&#8203;`/`&#x200b;`, before the zero-width strip.

Markup patterns the parser handles **well**, worth recording so they aren't
"fixed": dates are wrapped in `<strong>` in the summary block and bare inside
`<font>`/`<span>` in the detail block; the `<tag> → " "` + `\s+ → " "` +
`trim()` combination absorbs both. Recolouring a phrase mid-line — adding a
`<font>` boundary without touching a word — produced **zero** diff. Weebly's
constant colour churn is genuinely safe.

Two cosmetic artefacts leak into the message text, from tags becoming spaces:
`…for Hedingham match )` and `…Possibly on course/ qualifying for Devils Ridge
match )` (the source is missing its opening paren; that one is the coach's typo).
Harmless, but they will appear verbatim in GroupMe.

## 5. Is the positional pairing exercised? — **Yes, on 7 of 33 dates**

All seven multi-entry dates are in the future, so `diffSchedules` runs its
`addList[i]` / `remList[i]` pairing on live data, not in theory. Scenarios run
against the fixture with `today = 2026-08-30`:

- **Edit one copy of a two-copy date** → correct single `CHANGED`.
- **Edit both copies** (the typical real edit) → two `CHANGED` entries for one
  real change. Noisy, correctly paired.
- **Delete one line and add an unrelated line on the same date** → **mispaired.**
  Deleting the summary `9/22 Sanderson match…` while adding `9/22 Practice @ 12
  Oaks…` reports:

  > `CHANGED 9/22 Practice @ 12 Oaks 3:30-5:00 Range/Short Game/Putting`
  > `   (was: 9/22 Sanderson match @ Wildwood 2:00 Tee Times)`

  A deletion and an addition are fused into a false "the match became a
  practice". This is wrong in *content*, not merely loud — the parents are told
  something that did not happen.

- **Both copies edited and page order flipped** → pairing crosses over
  (`…#8 2:00 (Best 4 Rankings)` reported as `was: …#8 1:00`, and vice versa).
  Both facts are true; the attribution is scrambled.

The pairing is only sound when, within a date, the added and removed lists
describe the same events in the same order. On this page they usually do,
because order is stable and each date holds one event stated twice. The failure
needs a same-date add *and* a same-date delete that are unrelated — rare, but
the practice block gains and loses lines weekly.

## 6. Cold start and message size

With empty stored state the bot produces **39 `NEW` lines, 2,745 characters,
3 GroupMe chunks**. Worth knowing before the first deploy or any KV reset.

## 7. Incidental

`package.json` runs `tsx test/core.test.ts`, but the test lives at
`src/core.test.ts` — `npm test` fails as configured. Unrelated to this ticket.

---

## What this decides, and what it hands on

**Settled here:**
- The parser sees all 45 dated lines a human sees; 40 after dedup. No silent
  under-read on today's page.
- Near-duplicate cross-section pairs are real: 7 of them.
- `&#8203;` is an unhandled entity that the page already emits.
- Markup/colour churn is safe; the whitespace normalisation earns its keep.

**Handed to #5 / #7 (diff correctness) — not decided here:**
- Positional same-date pairing is exercised on 7 dates and mispairs an unrelated
  add+delete into a false `CHANGED` (§5). A similarity threshold, or pairing only
  when one side has exactly one candidate, would both address it.
- "Err loud" currently degrades to *loud once, then permanently silent* whenever
  a line stops matching the anchor (§3). If that is unacceptable, the anchor
  needs to widen or the bot needs a "line count dropped" alarm.
