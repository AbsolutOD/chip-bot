---
status: accepted
---

# Both Sections are parsed; a Change is collapsed, never the Schedule

The coach's page states every match twice — once in the **Match Section**, once in the **Full
Section** — in different wording, so every match edit currently produces two Announcements. The
watcher parses **both** Sections and keeps both Schedule Lines in its baselines. The pair is
collapsed only at announcement time: when one date changes in both Sections during a single Check,
parents receive one entry, in the Full Section's wording. A **Contradiction** — a Restatement whose
two lines disagree on time or location — is *not* collapsed: both wordings go to parents and the
Operator is alerted.

The Sections are told apart structurally, not by matching heading text. On the captured page the
Match Section is the single `<h2 class="wsite-content-title">` element, holding all 13 of its dated
lines separated by `<br />`; every other dated line belongs to the Full Section.

## Considered options

**Parsing the Full Section only** was the obvious simplification and is the one option that can go
silent. The Match Section already carries a date the Full Section does not (`8/17` on the
2026-08-30 fixture), and a coach who adds a match to the list literally headed *"Match Schedule"*
before writing it below would never be announced at all. It also inverts the failure of Section
detection: if Weebly ever changes that heading's markup, this option drops the *other* Section
instead — a mass `REMOVED`, then permanent silence.

**Collapsing at parse time** — keeping the Full Section's wording and discarding the Match Section
twin — fails the same way, more narrowly. The discarded line stops being observed, so a coach's
edit to the Match Section alone changes nothing the watcher can see. Only collapsing the *Change*
keeps every line under observation.

**Fuzzy de-duplication by text similarity** was rejected as unnecessary. Within a Section the
leading date is unique (13 of 13 and 32 of 32 on the fixture), so `(Section, date)` is an exact
key. No threshold has to be chosen and none can be got wrong.

## Consequences

**Section detection fails loud.** If the markup landmark stops working, both Sections merge and the
watcher degrades to announcing every match twice — the behaviour that prompted this decision. That
is noise, not silence, and is the reason this shape was chosen over parsing one Section.

**Diff pairing is keyed on `(Section, date)`.** Because the date is unique within a Section, the
added/removed pairing that produces a `CHANGED` entry has at most one candidate on each side. The
false `CHANGED` that fused an unrelated deletion and addition on a single date — a match reported to
parents as having become a practice — is unreachable while that holds.

**Collapsing is licensed by agreement, not assumed.** Electing the Full Section's wording is only
sound because the alternative was checked and found to agree. When it does not, the watcher does not
know which is true, and says so: both lines are announced. Silently preferring one Section would
mean a coin flip on a tee time, which is the failure the whole project exists to prevent.

**A Contradiction is defined narrowly, by design.** It fires when the extracted time (`H:MM`) or
`@` location disagree. It will not catch a wrong opponent name, which cannot be extracted from free
text with comparable reliability. On the fixture this rule produces zero alerts across the 12 shared
dates, where "any textual difference" produces seven — all of them benign additive detail. A
credible Operator alert is one that has never cried wolf.

**Delivery of the alert belongs to #6.** This decision fixes what a Contradiction *is* and that it
alerts once per distinct occurrence. Transport, dedup and backoff are the alerting ticket's.
