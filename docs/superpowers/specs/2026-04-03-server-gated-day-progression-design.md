# Server-Gated Day Progression

**Date:** 2026-04-03
**Status:** Approved
**Approach:** B — Server-Gated Day Advance

## Problem

Devotional days unlock prematurely. When a user finishes reading day N, `advanceDay()` fires immediately on the client, bumping `currentDay` to N+1. If day N+1 content exists (from the midnight cron or on-demand generation), it becomes visible instantly — even though it's supposed to be tomorrow's reading.

The `isCatchUp` flag (which checks whether the day was generated on a different date than it was read) compounds the issue by bypassing the `tomorrow-locked` gate when generation difficulties cause stale `generatedAt` timestamps.

**Root cause:** The client controls day progression. It should be the server's job.

## Design

### Core Rule

**One day per calendar day.** Day N+1 is not available until the calendar rolls over in the user's timezone. The server (cron) is the sole authority for advancing `currentDay`.

### Generation Rule

The cron generates days up to: `min(calendarDay, lastReadDay + 1)`

- `calendarDay` = `floor((today - seriesStartDate) / 1 day) + 1` in the user's timezone
- `lastReadDay` = highest `dayNumber` where `isRead = true`
- This means the cron generates at most **1 day ahead** of the last read day

This cap of 1 saves generation costs and has a side benefit: each day's generation can use the previous day's engagement data (check-ins, journal entries, reflections) since the user must read day N before day N+1 generates.

### New Field: `seriesStartDate`

Added to the `syncDevotionals` table. Set when day 1 content is first generated. Used by the cron to calculate `calendarDay`.

- **New series:** Set automatically during day 1 generation.
- **Existing series (null):** Cron skips calendar-based logic and falls back to current `currentDay`-only behavior. No backfill needed — only one test user has existing data.

### Timezone Handling

- The user's timezone is already stored in `userGenerationConfig.timezone`.
- The client sends its device timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) on every sync push.
- If the device timezone differs from the stored value, the server updates it.
- This handles permanent moves automatically. Travel may cause a one-off day boundary shift, which self-corrects.

## Changes

### Backend: Cron (`cron.ts`)

**Split into two phases that run on every 60-second tick:**

**Phase 1 — Day advance (runs every tick, no stagger window):** Check if `currentDay` has been read in `sync_devotional_days`. If yes, increment `currentDay` on the `syncDevotionals` record. Loop through consecutive read days — if days 4, 5, and 6 are all read, advance `currentDay` to 7 in one tick. This runs unconditionally so catch-up users don't wait until midnight.

**Phase 2 — Content generation (runs every tick, pacing-gated):** After advancing, calculate `calendarDay` from `seriesStartDate`. Only generate if `currentDay <= calendarDay` AND `currentDay <= lastReadDay + 1` AND day content doesn't already exist. For users who are **current** (caught up), generation naturally fires overnight after the advance at midnight. For users who are **behind** (catch-up), generation fires immediately after Phase 1 advances `currentDay` — no stagger window needed.

**Stagger window becomes generation-only for current users.** The stagger window (0-240 min past midnight) still applies to the overnight pre-generation case (user is current, advance + generate next day). For catch-up (user is behind calendar), skip the stagger check and generate immediately.

**Remove `lastGenerationDate` as a hard gate.** Replace with per-day existence checks (already done via Guard 4). This allows the cron to advance `currentDay` and generate multiple catch-up days across cron ticks without being blocked.

### Backend: Sync Push (`sync.ts`)

Update `userGenerationConfig.timezone` when the client sends a different timezone than what's stored.

### Backend: Schema (`schema.ts`)

Add `seriesStartDate: timestamp` to `syncDevotionals` table.

### Frontend: Reading Screen (`reading.tsx`)

- **Remove** `advanceDay(currentDevotionalId)` call from `handleComplete` (currently line ~731).
- **Remove** the on-demand `submitGenerationJob` for `viewingDay + 1` (currently lines ~735-743). The cron handles next-day generation.
- **Keep** `markDayAsRead()` — this is what the cron checks to know when to advance.

### Frontend: Home Screen (`index.tsx`)

- **Remove** `isCatchUp` logic entirely (currently lines ~642-651).
- **Simplify** `getReadingDayLabel()`: if `currentDayData.isRead`, label is "Today" (completed). If not read and `generatedAt` is before today, label is "Yesterday" (overdue). Otherwise "Today."

### Frontend: State Machine (`compute-devotional-state.ts`)

- **Remove** `isCatchUp` from `ComputeInput` interface.
- **Remove** `&& !isCatchUp` from the `tomorrow-locked` check (line 145).
- After reading, `currentDayData.isRead` is true, so the state machine hits `complete-today`. The `tomorrow-locked` state only triggers if the cron has advanced `currentDay` but content hasn't arrived yet (edge case, covered by `preparing`).

### Frontend: Store (`store.ts`)

- **Keep** `advanceDay` function (sync pull updates `currentDay` from server). No client code calls it proactively.

### Frontend: Sync Push

- **Add** device timezone to sync push payload: `Intl.DateTimeFormat().resolvedOptions().timeZone`.

## Catch-Up Flow

**Example: User reads day 3 on Monday, opens app Wednesday.**

| When | Event |
|------|-------|
| Monday | User reads day 3. `markDayAsRead` fires. `currentDay` stays at 3. |
| Monday night cron | Day 3 is read. Advance `currentDay` to 4. `calendarDay` = 4 (Tuesday). `lastReadDay + 1` = 4. Generate day 4. |
| Tuesday night cron | Day 4 not read. `currentDay` stays at 4. `calendarDay` = 5 (Wednesday). `lastReadDay + 1` = 4. Cap is `min(5, 4)` = 4. Day 4 already exists. No generation. |
| Wednesday | User opens app. Sync pull: `currentDay = 4`, day 4 content ready. User reads day 4. |
| Next cron tick (~1 min) | Day 4 is read. Advance `currentDay` to 5. `calendarDay` = 5. `lastReadDay + 1` = 5. Generate day 5. |
| ~1-3 min later | Day 5 content arrives via sync. User can read day 5 in the same session. |
| Wednesday night cron | Day 5 is read. Advance `currentDay` to 6. Generate day 6. |

**Long absence (read Monday, open Friday):**

| When | Event |
|------|-------|
| Tuesday-Thursday crons | Day 4 not read. No advancement. `lastReadDay + 1` = 4. Day 4 already generated Monday night. Nothing to do. |
| Friday | User opens app. Day 4 ready. Reads it. Cron advances to 5, generates day 5 (~1-3 min wait). Reads day 5. Cron advances to 6, generates day 6 (~1-3 min wait). Etc. |

Each catch-up day gets full personalization from the previous day's engagement data.

## What's NOT Changing

- **Reveal screen** — teaser/swipe-up flow stays as-is.
- **Day menu** — lock check (`dayNumber > currentDay`) still works since `currentDay` is server-controlled.
- **Progressive memory / engagement pipeline** — untouched.
- **Batch generation mode** — unaffected (all days generated upfront).
- **Generation worker** — no changes.
- **`hasReadToday` check** — stays for streak/celebration logic.

## Testing Plan

1. Delete current series, start a new one. Complete day 1.
2. Verify `seriesStartDate` is set on the devotional record.
3. Verify `currentDay` does NOT advance after completing day 1.
4. Wait for midnight cron (or manually trigger). Verify `currentDay` advances to 2 and day 2 content is generated.
5. Open app next day. Verify day 2 appears correctly.
6. Skip a day. Verify the app shows the overdue day and catch-up flow works.
