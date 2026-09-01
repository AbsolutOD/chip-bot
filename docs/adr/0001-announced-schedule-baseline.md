---
status: accepted
---

# The Announced Schedule is a separate baseline from the Observed Schedule

The watcher keeps two independent line-sets in KV. The **Observed Schedule** advances on every
successful read of the coach's page. The **Announced Schedule** advances only after an
Announcement is Delivered — every one of its Messages returning `res.ok`. Every Check computes
the Change as *Announced Schedule → live page*, never from the Observed Schedule.

This exists because the watcher promises **At-Least-Once** delivery to parents: a Change may be
announced twice, but is never silently dropped. A single baseline cannot keep that promise —
advancing it before a confirmed post loses the Change permanently, and advancing it after
requires the baseline to mean two things at once.

## Considered options

**A stored pending Change**, written to a second key when delivery fails and merged with the
next Check's Change, was rejected. Because the Observed Schedule advances every tick, the
pending record must be *merged* rather than replayed, and merging needs rules for
added-then-removed, added-then-changed, and changed-then-changed. Under 30-minute ticks and a
coach editing live, that merge is the normal path, not the edge case: a practice moved twice in
an hour would otherwise announce an intermediate time that never existed. Diffing from the
Announced Schedule gets the same result with no merge step, because accumulation is a property
of the diff rather than code anyone has to maintain.

## Consequences

**Delivery failures block rather than drop.** While GroupMe is unreachable or `GROUPME_BOT_ID`
is wrong, the Announced Schedule does not move and every Change stays pending. This is
intended — the backlog flushes correctly once the Operator fixes the cause — but it means a
broken delivery channel halts announcements rather than degrading them.

**Two failure modes had to be closed to make blocking safe.** An Over-long Line would otherwise
be unpostable forever and block every later Change behind it, so lines are truncated at 500
characters and the Operator is alerted. And an Announcement is Collapsed above five Messages,
so a long outage flushes as one summary rather than forty consecutive posts.

**`/reset` writes both keys.** Re-baselining means declaring the live page fully announced;
moving only the Observed Schedule would leave the Announced Schedule empty and cause the next
cron to announce the entire season to the parents' group.
