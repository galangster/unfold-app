# Day-unlock contract

One rule decides when a reader may open the next reading. The app, the server
and every notification must agree with it. Two readings of the rule have already
surfaced as bugs. On 2026-09-23 the app opened the next day on the morning a
reader finished a day. On 2026-10-04 a push announced a day the app kept closed.

This file is the source of truth for the rule, who enforces it, and what to run
when you touch any part of it. The vectors file repeats the rule in a few lines
so it reads on its own. If the two differ, this file wins.

## The rule

A reading finished on a local day opens the next reading at the start of the
following local day. The series calendar never opens a day earlier. "Local" is
the reader's own time zone.

In data terms:

```
latestReadToday = highest dayNumber whose readAt falls on today's local date
openThroughDay  =
  latestReadToday, when latestReadToday exists, currentDay is above it and the
                   day at currentDay is unread
  currentDay,      otherwise
```

- A day that is missing counts as unread.
- The two conditions on `currentDay` overlap in every state the app produces. The
  vectors do not tell them apart.
- `readAt` is the time the app reports. When a reading begins before midnight and
  ends within four hours after it, the app reports the start time
  (`src/lib/ritual-session.ts`). The next day is then open once midnight has
  passed.
- A reader behind the series calendar follows the same rule. Being behind never
  opens a second reading on the same local day.
- `getTodayReaderDayNumber` in `src/lib/devotional-day-access.ts` implements
  `openThroughDay`. `getSelectableDayLimit` adds two things for the picker and the
  reader. It keeps already-read days after `currentDay` reachable, and it needs
  the day's content on the device.

## Push timing

A `devotional_ready` push for day N goes out at the earliest instant `t` that is
at or after the moment day N finishes generating and meets both conditions:

1. Day N is open at `t`: `N <= openThroughDay(t)`.
2. `t` is not before the reader's preferred notification time on its local day.

When both hold at the moment of generation, the push goes out at once. A day that
finishes generating while it is locked waits for the next local midnight, then for
the preferred time.

A queued push survives a restart and goes out once. Checks that can cancel it run
at send time, not when the push is queued. They are a missing push token, a local
daily reminder already scheduled, and the day already read. At send time the
server also recomputes the send time from the current reads. If the day is still
locked, it queues the push again.

## Who enforces what

| Surface | Owner | Requirement |
| --- | --- | --- |
| Day picker, reader, Today card, reveal route | `src/lib/devotional-day-access.ts` (this repo) | `getTodayReaderDayNumber` and `getSelectableDayLimit` implement `openThroughDay` |
| A `devotional_ready` push | unfold-backend | Never sent for a day above `openThroughDay` at send time. A day generated early keeps its push until the day opens, then the push goes out at the reader's preferred time |
| Cron and on-demand day generation | unfold-backend | May finish early. Finishing never announces the day |
| Local daily reminder | `src/lib/daily-reminder-content.ts` (this repo) | After a read today the reminder does not fire again today: a one-shot for tomorrow when today's time is still ahead, the daily trigger otherwise |
| A tapped ready push for a locked day | `resolveRevealOutcome` in `src/lib/reveal-params.ts` | Outcome `locked`. The screen raises the Sentry signal `ready_push_for_locked_day` (`src/lib/day-unlock-telemetry.ts`) and shows Today |

## The vectors

`src/lib/__tests__/fixtures/day-unlock-vectors-v1.json` has two tables, in several
time zones and across daylight-saving changes. Times are wall-clock times in the
reader's own zone.

- `cases`: a reader's reads and the `openThroughDay` at chosen times.
- `pushCases`: a day that finished generating, the reader's preferred time, what
  delays the push (`pacingLock`, `preferredTime` or `none`) and the exact
  `sendAtLocal`.

The file must be byte-identical in unfold-backend. Each repo's test pins the
file's SHA-256. This repo's test does. The backend test must pin the same value.
A vector changes only together with the same change, and the same new digest, in
the other repo.

Who checks what:

- This repo: `src/lib/__tests__/day-unlock-contract.test.ts` checks the app
  against `cases`. For `pushCases` it checks that the day is open in the app at
  `sendAtLocal`, and that the app's own lock is what delays a `pacingLock` push.
- unfold-backend: its test must compute the same `openThroughDay` for `cases` and
  the same `sendAtLocal` for `pushCases`, in the vector's own time zone.

## When you change any of these

1. Change the rule here first, then the vectors, then both repos.
2. Run `bun run test:day-unlock`. It runs the contract, reveal and pacing tests
   under `TZ=Pacific/Honolulu`, `TZ=America/Los_Angeles` and `TZ=UTC`.
3. Search the other repo for the same surface: push sending, generation timing,
   and any copy that says a day is "ready".
4. Watch the Sentry issue `ready_push_for_locked_day` after release. It fires only
   when a reader taps a ready push, or follows a link, for a locked day. A few
   are possible. A cluster after a release means the server timing regressed.
   The server's own alarm is the first guard. This one only sees taps.

## History

- 2026-04-03: server-gated progression spec. It gated by series calendar. The
  app has since moved to the rule above (`docs/bugs/2026-09-23-today-pacing.md`).
- 2026-09-23 (#175): the app keeps the next day locked until the next local day,
  also for a reader behind the series calendar. The server was not changed.
- 2026-10-04: a push announced Day 4 to a reader whose app kept it locked
  (`docs/bugs/2026-10-04-ready-push-vs-pacing-lock.md`).
