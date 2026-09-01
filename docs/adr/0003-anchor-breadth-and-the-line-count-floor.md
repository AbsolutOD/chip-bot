---
status: accepted
---

# The date anchor widens a little; a line-count floor covers the rest

A Schedule Line is recognised by a date at the start of the line. When a line stops matching that
anchor it is announced `REMOVED` once and then disappears from the parsed set permanently, so every
later change to that event goes unreported — **loud once, then silent forever**, which is the exact
inverse of this project's bias. The anchor is therefore widened to tolerate the three shapes known
to occur, and an Operator alert covers the shapes nobody predicted.

Widened for: **numeric HTML entities** (the page emits `&#8203;` twice today, and `htmlToText`
strips the zero-width *character* while never decoding the *entity*), a **leading day name**
(`Mon 9/2 …`), and a **dash-separated date** (`10-7`). Not widened for **continuation lines** — a
line wrapped onto a second `<br />`, whose trailing text is dropped with no loud phase at all.

Separately, the Operator is alerted when the parsed line count falls by more than five in a single
Check. Today the page yields 45 dated lines, and the largest legitimate one-tick drop is the coach
pruning a past week.

## Considered options

**Parsing continuation lines** needs a rule for "an undated line belongs to the line above it",
which is a real parser change carrying its own new ways to be wrong, guarding a shape the coach has
never once produced. The floor alarm catches it for a fraction of the cost.

**Alerting on any drop not explained by dates falling into the past** is more precise than a flat
threshold, but "explained by dates falling into the past" is real logic with real bugs, protecting a
low-stakes Operator alert. The flat threshold can be retuned freely because it costs parents
nothing.

## Consequences

**Widening the anchor trades precision for recall, deliberately.** Each widening admits more
non-schedule prose into the parsed set. Prose lines are loud, not silent, so this trade runs in the
safe direction — but it does mean the parsed count is expected to drift upward, not down, which is
also what makes a *downward* move worth alerting on.

**The floor is the only guard against markup nobody anticipated.** It is not a parser fix and does
not repair the missed line; it converts a permanent silence into a message the Operator can act on.
That is the whole of its job.

**Delivery of the alert belongs to #6**, as with the Contradiction in ADR-0002. This decision fixes
the condition and the threshold, not the transport.
