# A "ready" push for a day the app keeps closed

Status: app side done in this change. Cause on the server side is inferred, not
confirmed. The server fix is still to do in unfold-backend, from
`handoffs/2026-10-04-ready-push-backend-brief.md`.
Rule and owners: `docs/day-unlock-contract.md`.

## What the reader saw

A tester in Hawaii finished Day 3 of a seven-day series. Later that morning a
push said Day 4 was ready. Tapping it landed on Today, which labeled Day 4
Tomorrow. "Return to Today's Reading" opened Day 3. The day picker kept Day 4
locked under Tomorrow. The reader reported the app as broken.

## Expected behavior

The owner's rule from 2026-09-23 stands: the next reading stays locked until
the next local day, including for readers behind the series calendar. A push
must never announce a reading the app will not open.

## Evidence and diagnosis

Confirmed from the screenshots and the code:

- The Today card was in the `tomorrow-locked` state with Day 4's title and
  teaser. That state needs a read day whose `readAt` is on today's local date
  and an unread day at `currentDay`.
- A push tap for Day 4 goes to `/reveal`. The resolver returned no target
  because Day 4 is above `getTodayReaderDayNumber`, so the screen sent the
  reader to Today without a word. `resolveInitialReadingDayNumber` clamps the
  reader to the locked-through day, which is why every path ended on Day 3.
- The app behaves as designed.

Inferred, not yet checked against the push payload, the server code or
production rows:

- The push that said Day 4 was ready is the part that disagreed with the app.
- The 2026-09-23 record (`2026-09-23-today-pacing.md`) shows the server
  generating the next day nine minutes after a completion for a reader behind
  the series calendar. The server sends its `devotional_ready` push when that
  job finishes, timed to the reader's preferred notification time.
- That push goes out the same morning the reader finished, while the app keeps
  the day locked until midnight. The next morning no push is left, because
  generation already used it.
- #175 changed the app only. Nothing tied the server's timing to the new rule.

## Acceptance criteria

App, this change:

1. A ready push that names a day the pacing lock keeps closed raises the Sentry
   signal `ready_push_for_locked_day` and still lands on Today.
2. A push for an unknown series, a junk day or a day past the series stays an
   ordinary bail to Today with no signal. So does a day above `currentDay` when no
   lock is in force.
3. The shared vectors in `src/lib/__tests__/fixtures/day-unlock-vectors-v1.json`
   pass under every time zone the run uses (`bun run test:day-unlock`), and the app
   keeps every behavior from 2026-09-23.

Server, unfold-backend:

4. No ready push is sent for a day above `openThroughDay` at send time.
5. When the day opens, the reader gets one ready push at their preferred time,
   even if the day was generated earlier.
6. The server carries the same vectors file, pins the same digest, and its test
   passes.

## Verification

Run `bun run test:day-unlock`, typecheck, lint and `bun run verify:changed`. After
release, watch the Sentry issue `ready_push_for_locked_day`. Native compilation and
device checks remain separate gates.
