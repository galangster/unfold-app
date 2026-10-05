# Handoff: keep the "ready" push waiting until the day opens (unfold-backend)

Date: 2026-10-04. Scope: `unfold-backend` only. The app side is in unfold-app on
branch `claude/day-unlock-contract-2026-10-04`. This brief is self-contained.

## Why this exists

A tester in Hawaii finished Day 3 of a 7-day series on the morning of
2026-10-04. A push then said Day 4 was ready. The app kept Day 4 locked until the
next local midnight and showed "Tomorrow". The reader reported a broken app.

The app is right. The owner ruled on 2026-09-23 that the next reading stays
locked until the next local day. That includes a reader behind the series
calendar. The push timing is the likely defect. It is server-side.

A backend fix reaches every installed app version once it is deployed. An app fix
reaches readers only after a store release. The backend fix is the one that
matters.

## Probable cause (not yet confirmed)

Nobody has read the server code, the push payload or the production rows for this
report. This Mac had no galangster login. The cause below comes from the app code
and from the 2026-09-23 record (`docs/bugs/2026-09-23-today-pacing.md`).

1. A reader behind the series calendar finishes Day N.
2. The app pushes `currentDay = N+1` with the read. The server cron, the app's
   own Today watch, or both, start generating Day N+1 within minutes. The
   2026-09-23 record shows Day 6 generated nine minutes after a Day 5 completion.
3. When the job finishes, the worker sends `devotional_ready`, timed to the
   reader's preferred notification time.
4. The push arrives the same morning. The app keeps Day N+1 locked until midnight.
5. The next morning no push is left, because generation already used it.

Confirm this first. Read the worker log lines and the job rows for the reader's
last three days (read-only). If the cause differs, change the plan below and say
so in the PR.

## The rule and the vectors

Read these two files in unfold-app first:

- `docs/day-unlock-contract.md`: the rule, the push timing rule, the owners.
- `src/lib/__tests__/fixtures/day-unlock-vectors-v1.json`: the table both repos test.

Copy the vectors file byte-identical into the backend, next to the other pinned
fixtures (the `auto-trial-*-v1.json` files are the precedent). Do not edit it
there. A change goes to both repos together.

Pin the file's SHA-256 in the backend test, as the app test does:
`54e3cfd898eda181cb78b0422bd1711accb8868f389968238f6e70b46dc781b9`. If your copy has a different digest, the copy is wrong.

## What to change

Names come from older notes. Check each one in the code before you rely on it.

1. Find where a `devotional_ready` push is sent. Earlier notes name
   `src/lib/push-notifications.ts` (`sendGenerationCompleteNotification`), called
   from `persistJobSuccess` in `src/lib/worker.ts`, with timing in
   `resolveCompletionPushTiming`. Find the deferred-push path too.
2. Add two pure functions with no database access:
   - `openThroughDay({ reads, currentDay, timeZone, now })`
   - `readyPushSendAt({ ..., generatedAt, preferredTime })`

   Both follow `docs/day-unlock-contract.md`. Use the reader's zone calendar. Do
   not use UTC dates. Do not add 24 hours. Both break on Hawaii evenings and on
   daylight-saving days. The vectors cover both.
3. Send only through one gate. The gate computes `readyPushSendAt`. When that
   instant is later than now, it stores a queued push and returns. A cron tick
   sends due queued pushes.
4. Persist the queued push. A Railway deploy restarts both services, so an
   in-memory timer is not enough. A table or a column on the job row both work.
5. Run the cancel checks at send time, not at queue time. The checks are the push
   token, the local-daily-reminder flag in `sync_users.settings`, and whether the
   day is already read. When `ENFORCE_SERVER_PREMIUM_GATE` is `true`, also cancel
   for inactive premium status at send time. This follows the contract and the
   shipped backend gate; it does not enable premium enforcement. A reader can
   lose premium access, get a local reminder, or read the day between queueing
   and sending.
6. At send time, recompute `readyPushSendAt` from the current reads. If the result
   is later than now, queue the push again. This covers a read that arrives after
   the push was queued.
7. Send once per `(userId, devotionalId, dayNumber)`. A retry or a restart must not
   send twice.
8. Add an alarm. Suppose the send path is about to send a day above
   `openThroughDay`, and step 6 did not catch it. Do not send. Do not drop the
   push. Queue it again. Log one line that starts with `[push] ALARM` and carries
   the day number and the zone. The line must stay at zero.
9. Log each queue with the day number and the planned send time. Do not log text a
   reader wrote.

## Inputs

| Input | Source |
| --- | --- |
| reads | `sync_devotional_days` rows with `is_read`. Use the pushed `readAt`, never the server receive time |
| `currentDay` | `sync_devotionals.current_day` |
| time zone | `user_generation_config.timezone` (the app sends the device zone with every sync push) |
| preferred time | `user_generation_config.preferred_notification_time`, `HH:MM`, default `07:00` |

If the zone is missing or invalid, queue the push and log it. Do not guess UTC.

## Tests

- A vitest file that loads the vectors file. For `cases`, assert `openThroughDay`.
  For `pushCases`, assert `readyPushSendAt` equals `sendAtLocal` in the vector's zone.
- The `America/Los_Angeles` vectors cover the 25-hour and 23-hour days.
- A test that a queued push survives a restart and sends once.
- A test that a cancel check which turns true after queueing cancels the send.
- A test that a read arriving after queueing moves the send time, and the push
  queues again.
- Run the backend gate: `bun run typecheck`, `typecheck:tests`, `test`.

## Do not

- Do not change when days are generated. That is an open choice below.
- Do not write production data. Do not merge or deploy without Nick's word in the
  thread. A merge to `main` deploys both Railway services by itself.
- Do not put a Support ID or any reader identifier in the repo or the PR.

## Verify after deploy (read-only)

- The log has `[push]` queue lines and no `[push] ALARM` line.
- For three mornings, a Hawaii reader who finishes a reading gets no push that
  day. The next local day the reader gets exactly one, at the preferred time.
- The reader who reported this can open Day 4 after midnight on 2026-10-05,
  Hawaii time. The Support ID is in the Day 4 thread. The app unlocks the day
  without a data change.

## Open choices for Nick

1. Hold generation as well. A behind-calendar reader's next day is generated
   minutes after a reading. Generation could wait for the overnight window. Then the
   day can use the reader's check-ins and evening reflection from the same day. It
   also matches an on-pace reader. It costs the same-day "Tomorrow's thread"
   teaser for readers behind the calendar. Readers without cron enrollment would
   wait about 2.5 minutes at morning open. The app has the same early trigger in
   `shouldPrepareCurrentDevotionalDay` (`src/lib/home-devotional-state.ts`), which
   still follows the series calendar and not the lock.
2. Push copy. Today it reads as a ready announcement. It stays correct once the
   push waits for the open day.

## What is not done

The app change is done and tested. The server code, the production rows and the
Railway logs were not read. Reading them is step 1 of the backend work.
