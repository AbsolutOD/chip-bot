# Chip Bot

A watcher for a high-school golf team's schedule. It reads the coach's page, works out what
changed, and tells the team's parents. One pure core module is shared by a scheduled Worker
and a hand-run CLI.

## Language

**Schedule Line**:
A single free-text entry from the coach's page, beginning with an `M/D` date and carrying no
year — e.g. `9/2 Practice @ 12 Oaks 3:30-5:00`.
_Avoid_: Event, entry, row

**Match Section**:
The region of the coach's page headed "Match Schedule (subject to change)", listing matches only.
_Avoid_: Match schedule, summary block, top section

**Full Section**:
The region of the coach's page below the Match Section, listing practices, meetings and matches.
Where the two Sections agree, its wording is the one parents are given.
_Avoid_: Full schedule, detail block, bottom section

**Restatement**:
A Schedule Line that describes the same real event as a Schedule Line carrying the same date in the
other Section. A Restatement exists whether or not the two agree.
_Avoid_: Duplicate, near-duplicate, twin, echo

**Contradiction**:
A Restatement whose two Schedule Lines disagree about when or where the event happens. Additional
detail in one Section — a roster, a ranking note — is not a Contradiction.
_Avoid_: Conflict, mismatch, disagreement

**Observed Schedule**:
The set of Schedule Lines the page carried the last time it was read successfully.
_Avoid_: Current schedule, stored schedule, state

**Announced Schedule**:
The set of Schedule Lines the parents have been told about. Distinct from the Observed
Schedule: a change that was read but never delivered is in one and not the other.
_Avoid_: Sent schedule, last known schedule

**Change**:
The difference between two schedules, split into added, changed, and removed Schedule Lines.
Only today-or-future lines count; the coach pruning past weeks is not a Change.
_Avoid_: Diff (in prose — `diff` remains the code identifier), delta, update

**Announcement**:
One posting of a Change to the parents' group. A Change split across several GroupMe messages
is still one Announcement.
_Avoid_: Notification, message, post

**Delivered**:
An Announcement is Delivered only when every one of its messages came back `res.ok`. A thrown
request is not Delivered. Anything less than every message is not Delivered.
_Avoid_: Sent, posted, succeeded

**At-Least-Once**:
The delivery guarantee the bot makes to parents: a Change is never silently dropped, and may
therefore be announced more than once. A repeat costs a parent two seconds; a miss costs a kid
a match.
_Avoid_: Exactly-once, best-effort

**Operator**:
The person running the bot — distinct from a parent. Operator alerts go to a separate GroupMe
bot, never the parents' group.
_Avoid_: Admin, owner

**Check**:
One run of the watcher: read the page, work out the Change, announce it. The cron trigger and
the manual admin endpoint perform the same Check and differ only in what they report.
_Avoid_: Run, poll, tick (reserve "tick" for the cron interval itself)

**Message**:
A single GroupMe post. One Announcement may span several Messages when a Change is too large
for one; each carries the header and its position in the sequence.
_Avoid_: Chunk (in prose — `chunk` remains the code identifier), part

**Collapsed Announcement**:
An Announcement of a Change too large to send in full, replaced by one Message stating how many
Schedule Lines moved and pointing at the coach's page. Counts as Delivered — the Change is
signalled, not dropped.
_Avoid_: Summary, digest, rollup

**Over-long Line**:
A Schedule Line far longer than any the coach writes, which is evidence of a parsing fault
rather than a long entry. Shown truncated to parents; reported in full to the Operator.
_Avoid_: Bad line, malformed line
