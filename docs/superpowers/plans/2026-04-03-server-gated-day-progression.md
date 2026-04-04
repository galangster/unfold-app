# Server-Gated Day Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move day advancement from the client to the server cron so that devotional days unlock one per calendar day, not instantly on read.

**Architecture:** The cron (`cron.ts`) becomes the sole authority for advancing `currentDay` and generating content, gated by `min(calendarDay, lastReadDay + 1)`. The client removes `advanceDay()` from the reading completion handler and lets sync pull deliver the updated `currentDay`. A new `seriesStartDate` field anchors calendar calculations.

**Tech Stack:** Express + Drizzle (backend), Expo/React Native + Zustand (mobile), PostgreSQL

**Spec:** `docs/superpowers/specs/2026-04-03-server-gated-day-progression-design.md`

---

### Task 1: Add `seriesStartDate` to Schema + Migration

**Files:**
- Modify: `/Users/galangster/clawd/work/unfold/backend/src/db/schema.ts:143-162`
- Create: `/Users/galangster/clawd/work/unfold/backend/drizzle/0006_series_start_date.sql`

- [ ] **Step 1: Add `seriesStartDate` column to `syncDevotionals` table in schema**

In `/Users/galangster/clawd/work/unfold/backend/src/db/schema.ts`, add inside the `syncDevotionals` definition after `progressiveMemory`:

```typescript
    seriesStartDate: timestamp("series_start_date", { withTimezone: true }),
```

- [ ] **Step 2: Create the SQL migration**

Create `/Users/galangster/clawd/work/unfold/backend/drizzle/0006_series_start_date.sql`:

```sql
ALTER TABLE sync_devotionals ADD COLUMN series_start_date TIMESTAMPTZ;
```

- [ ] **Step 3: Run the migration**

```bash
cd ~/clawd/work/unfold/backend
npx drizzle-kit push
```

Expected: Schema synced, `series_start_date` column added to `sync_devotionals`.

- [ ] **Step 4: Commit**

```bash
cd ~/clawd/work/unfold/backend
git add src/db/schema.ts drizzle/0006_series_start_date.sql
git commit -m "feat: add seriesStartDate to syncDevotionals schema"
```

---

### Task 2: Set `seriesStartDate` in Worker on Day 1 Generation

**Files:**
- Modify: `/Users/galangster/clawd/work/unfold/backend/src/lib/worker.ts:366-398`

When the worker persists a day result for day 1 (from an `initial_arc` job), it should also set `seriesStartDate` on the devotional record.

- [ ] **Step 1: Add `seriesStartDate` update inside the worker transaction**

In `/Users/galangster/clawd/work/unfold/backend/src/lib/worker.ts`, find the block that persists the day result to `syncDevotionalDays` (around line 366). After that block, add a conditional update for day 1:

```typescript
      // Set seriesStartDate when day 1 is persisted (initial_arc or first day job)
      if (dayResult && job.dayNumber === 1) {
        await tx
          .update(schema.syncDevotionals)
          .set({
            seriesStartDate: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.syncDevotionals.id, job.devotionalId),
              sql`series_start_date IS NULL`
            )
          );
        console.log(`[worker] Set seriesStartDate for devotional=${job.devotionalId}`);
      }
```

Place this after the `syncDevotionalDays` insert/upsert block (after line ~398) and before the `lastGenerationDate` update (line ~401).

- [ ] **Step 2: Verify build**

```bash
cd ~/clawd/work/unfold/backend && npm run build
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
cd ~/clawd/work/unfold/backend
git add src/lib/worker.ts
git commit -m "feat: set seriesStartDate on day 1 generation"
```

---

### Task 3: Rewrite Cron — Phase 1 (Day Advance) + Phase 2 (Paced Generation)

**Files:**
- Modify: `/Users/galangster/clawd/work/unfold/backend/src/lib/cron.ts` (major rewrite of `processUserCron`)

This is the core change. The cron's `processUserCron` function gets rewritten into two phases.

- [ ] **Step 1: Add helper function `advanceCurrentDay`**

Add this new function above `processUserCron` in `cron.ts`:

```typescript
/**
 * Phase 1: Advance currentDay through consecutive read days.
 * Returns the new currentDay value after advancement.
 */
async function advanceCurrentDay(
  db: NonNullable<typeof _db>,
  devotional: {
    id: string;
    currentDay: number | null;
    totalDays: number | null;
  }
): Promise<number> {
  let currentDay = devotional.currentDay ?? 1;
  const totalDays = devotional.totalDays ?? 0;

  // Loop: advance through consecutive read days
  while (currentDay <= totalDays) {
    const [dayRecord] = await db
      .select({ isRead: schema.syncDevotionalDays.isRead })
      .from(schema.syncDevotionalDays)
      .where(
        and(
          eq(schema.syncDevotionalDays.devotionalId, devotional.id),
          eq(schema.syncDevotionalDays.dayNumber, currentDay)
        )
      )
      .limit(1);

    // If current day doesn't exist or isn't read, stop advancing
    if (!dayRecord || !dayRecord.isRead) break;

    // This day is read — advance
    currentDay += 1;
  }

  // Cap at totalDays + 1 (series complete)
  currentDay = Math.min(currentDay, totalDays + 1);

  // Persist if changed
  if (currentDay !== (devotional.currentDay ?? 1)) {
    await db
      .update(schema.syncDevotionals)
      .set({
        currentDay,
        updatedAt: new Date(),
      })
      .where(eq(schema.syncDevotionals.id, devotional.id));
    console.log(
      `[cron] Advanced currentDay to ${currentDay} for devotional=${devotional.id}`
    );
  }

  return currentDay;
}
```

- [ ] **Step 2: Add helper function `calculateCalendarDay`**

Add this function after `advanceCurrentDay`:

```typescript
/**
 * Calculate which calendar day it is for this series.
 * Day 1 = the seriesStartDate. Returns null if seriesStartDate is not set.
 */
function calculateCalendarDay(
  seriesStartDate: Date | null,
  tz: string,
  now: Date
): number | null {
  if (!seriesStartDate) return null;

  // Get the date string in the user's timezone for both dates
  const startDateStr = seriesStartDate.toLocaleDateString("en-CA", { timeZone: tz });
  const nowDateStr = now.toLocaleDateString("en-CA", { timeZone: tz });

  // Calculate difference in days
  const startMs = new Date(startDateStr + "T00:00:00").getTime();
  const nowMs = new Date(nowDateStr + "T00:00:00").getTime();
  const diffDays = Math.floor((nowMs - startMs) / (24 * 60 * 60 * 1000));

  return diffDays + 1; // Day 1 = start date
}
```

- [ ] **Step 3: Rewrite `processUserCron`**

Replace the entire `processUserCron` function with:

```typescript
async function processUserCron(
  db: NonNullable<typeof _db>,
  config: schema.UserGenerationConfig,
  now: Date
): Promise<void> {
  const tz = config.timezone || "America/Chicago";

  // Find their active progressive devotional
  const [devotional] = await db
    .select({
      id: schema.syncDevotionals.id,
      clerkUserId: schema.syncDevotionals.clerkUserId,
      currentDay: schema.syncDevotionals.currentDay,
      totalDays: schema.syncDevotionals.totalDays,
      generationMode: schema.syncDevotionals.generationMode,
      seriesStartDate: schema.syncDevotionals.seriesStartDate,
    })
    .from(schema.syncDevotionals)
    .where(
      and(
        eq(schema.syncDevotionals.clerkUserId, config.userId),
        eq(schema.syncDevotionals.generationMode, "progressive")
      )
    )
    .orderBy(desc(schema.syncDevotionals.createdAt))
    .limit(1);

  if (!devotional) return;

  const totalDays = devotional.totalDays ?? 0;

  // ── Phase 1: Advance currentDay (runs every tick) ──
  const currentDay = await advanceCurrentDay(db, devotional);

  // Past end of series — nothing to generate
  if (currentDay > totalDays) return;

  // ── Phase 2: Content generation (pacing-gated) ──

  // Calculate the highest read day
  const [lastReadResult] = await db
    .select({
      maxDay: sql<number>`COALESCE(MAX(${schema.syncDevotionalDays.dayNumber}), 0)`,
    })
    .from(schema.syncDevotionalDays)
    .where(
      and(
        eq(schema.syncDevotionalDays.devotionalId, devotional.id),
        eq(schema.syncDevotionalDays.isRead, true)
      )
    );
  const lastReadDay = lastReadResult?.maxDay ?? 0;

  // Pacing cap: only generate up to 1 day ahead of last read
  if (currentDay > lastReadDay + 1) return;

  // Calendar cap: only generate up to today's calendar position
  const calendarDay = calculateCalendarDay(
    devotional.seriesStartDate,
    tz,
    now
  );
  if (calendarDay !== null && currentDay > calendarDay) return;

  // If user is current (not behind), apply stagger window for overnight generation
  const isBehind = calendarDay !== null && currentDay < calendarDay;
  if (!isBehind) {
    if (!isInStaggerWindow(config, now) && !hasStaggerWindowPassedToday(config, now)) {
      return;
    }
  }

  // Check if this day's content already exists
  const [existingDay] = await db
    .select({ id: schema.syncDevotionalDays.id })
    .from(schema.syncDevotionalDays)
    .where(
      and(
        eq(schema.syncDevotionalDays.devotionalId, devotional.id),
        eq(schema.syncDevotionalDays.dayNumber, currentDay)
      )
    )
    .limit(1);

  if (existingDay) return;

  // Check for existing pending/processing/failed job
  const [existingJob] = await db
    .select({ id: schema.generationJobs.id })
    .from(schema.generationJobs)
    .where(
      and(
        eq(schema.generationJobs.devotionalId, devotional.id),
        eq(schema.generationJobs.dayNumber, currentDay),
        inArray(schema.generationJobs.status, [
          "pending",
          "processing",
          "failed",
        ])
      )
    )
    .limit(1);

  if (existingJob) return;

  // ── Build inputData (same as before) ──

  const [lastSuccessfulJob] = await db
    .select({ inputData: schema.generationJobs.inputData })
    .from(schema.generationJobs)
    .where(
      and(
        eq(schema.generationJobs.userId, config.userId),
        eq(schema.generationJobs.devotionalId, devotional.id),
        eq(schema.generationJobs.status, "complete")
      )
    )
    .orderBy(sql`created_at DESC`)
    .limit(1);

  let inputData: Record<string, unknown> | null =
    (lastSuccessfulJob?.inputData as Record<string, unknown>) ?? null;

  // Fetch persona history
  const [personaHistory] = await db
    .select({
      primaryTrait: schema.syncSeriesPersonaHistory.primaryTrait,
      secondaryTrait: schema.syncSeriesPersonaHistory.secondaryTrait,
      templateSeed: schema.syncSeriesPersonaHistory.templateSeed,
    })
    .from(schema.syncSeriesPersonaHistory)
    .where(
      and(
        eq(schema.syncSeriesPersonaHistory.clerkUserId, config.userId),
        eq(schema.syncSeriesPersonaHistory.devotionalId, devotional.id),
      ),
    )
    .orderBy(sql`updated_at DESC`)
    .limit(1);

  const persona = personaHistory?.primaryTrait
    ? {
        primary: personaHistory.primaryTrait as PersonaTrait,
        secondary: personaHistory.secondaryTrait as PersonaTrait,
        templateSeed: personaHistory.templateSeed ?? 0,
      }
    : undefined;

  if (!inputData) {
    const [user] = await db
      .select({
        name: schema.syncUsers.name,
        aboutMe: schema.syncUsers.aboutMe,
        currentSituation: schema.syncUsers.currentSituation,
        emotionalState: schema.syncUsers.emotionalState,
        spiritualSeeking: schema.syncUsers.spiritualSeeking,
        settings: schema.syncUsers.settings,
      })
      .from(schema.syncUsers)
      .where(eq(schema.syncUsers.clerkUserId, config.userId))
      .limit(1);

    const [devData] = await db
      .select({
        userContext: schema.syncDevotionals.userContext,
        themeCategory: schema.syncDevotionals.themeCategory,
        devotionalType: schema.syncDevotionals.devotionalType,
        studySubject: schema.syncDevotionals.studySubject,
      })
      .from(schema.syncDevotionals)
      .where(eq(schema.syncDevotionals.id, devotional.id))
      .limit(1);

    if (user) {
      const devCtx = (devData?.userContext as Record<string, unknown>) ?? {};
      inputData = {
        context: {
          name: user.name ?? "",
          aboutMe: user.aboutMe ?? "",
          currentSituation: user.currentSituation ?? "",
          emotionalState: user.emotionalState ?? "",
          spiritualSeeking: user.spiritualSeeking ?? "",
          readingDuration: (devCtx.readingDuration as number) ?? 5,
          devotionalLength: (devCtx.devotionalLength as number) ?? 7,
          bibleTranslation: (devCtx.bibleTranslation as string) ?? "BSB",
          themeCategory:
            devData?.themeCategory ??
            (devCtx.themeCategory as string) ??
            "",
          devotionalType:
            devData?.devotionalType ??
            (devCtx.devotionalType as string) ??
            "",
          studySubject:
            devData?.studySubject ??
            (devCtx.studySubject as string) ??
            undefined,
          writingStyle:
            (devCtx.writingStyle as Record<string, string> | undefined) ??
            (
              (user.settings as Record<string, unknown> | undefined)
                ?.writingStyle as Record<string, string> | undefined
            ),
        },
        persona,
        completedDay: currentDay - 1,
      };
    }
  }

  if (!inputData) {
    console.warn(
      `[cron] Skipping user=${config.userId} devotional=${devotional.id} — no input data`
    );
    return;
  }

  if (!inputData.persona && persona) {
    inputData = { ...inputData, persona };
  }

  inputData = { ...inputData, completedDay: currentDay - 1 };

  // Gather engagement data
  try {
    const engagement = await gatherEngagementData(
      db,
      config.userId,
      devotional.id,
      currentDay,
    );

    if (engagement.completedDayData) {
      inputData = { ...inputData, completedDayData: engagement.completedDayData };
    }
    if (engagement.dayContexts.length > 0) {
      inputData = { ...inputData, dayContexts: engagement.dayContexts };
    }
    if (engagement.totalCompletedDays > 0) {
      inputData = { ...inputData, totalCompletedDays: engagement.totalCompletedDays };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[cron] Failed to gather engagement data for user=${config.userId}: ${errMsg}`
    );
  }

  // Insert generation job
  const [job] = await db
    .insert(schema.generationJobs)
    .values({
      userId: config.userId,
      devotionalId: devotional.id,
      dayNumber: currentDay,
      jobType: "day",
      status: "pending",
      priority: isBehind ? 5 : 0, // Higher priority for catch-up
      inputData,
    })
    .returning({ id: schema.generationJobs.id });

  console.log(
    `[cron] Queued generation: job=${job.id} user=${config.userId} devotional=${devotional.id} day=${currentDay}${isBehind ? " (catch-up)" : ""}`
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd ~/clawd/work/unfold/backend && npm run build
```

Expected: No type errors. The `seriesStartDate` field is now available on the select since we added it to schema in Task 1.

- [ ] **Step 5: Commit**

```bash
cd ~/clawd/work/unfold/backend
git add src/lib/cron.ts
git commit -m "feat: rewrite cron with server-gated day advance and paced generation"
```

---

### Task 4: Update Sync Push to Accept Device Timezone

**Files:**
- Modify: `/Users/galangster/clawd/work/unfold/backend/src/routes/sync.ts:120-200`
- Modify: `/Users/galangster/clawd/work/unfold/app/mobile/src/lib/sync-service.ts:209-294`

- [ ] **Step 1: Update server sync push endpoint to handle timezone**

In `/Users/galangster/clawd/work/unfold/backend/src/routes/sync.ts`, inside the `POST /push` handler, after extracting `changes` from `req.body` (line 129), add timezone handling:

```typescript
  const { changes, deviceTimezone } = req.body;

  // Update user's timezone if the device reports a different one
  if (deviceTimezone && typeof deviceTimezone === "string" && uid) {
    try {
      await db
        .update(schema.userGenerationConfig)
        .set({
          timezone: deviceTimezone,
          updatedAt: new Date(),
        })
        .where(eq(schema.userGenerationConfig.userId, uid));
    } catch {
      // Non-critical — timezone update failure shouldn't block sync
    }
  }
```

Add the necessary import if `eq` isn't already imported (it likely is — check the top of the file).

- [ ] **Step 2: Update client sync push to send timezone**

In `/Users/galangster/clawd/work/unfold/app/mobile/src/lib/sync-service.ts`, inside the `push()` method, update the `body` of the fetch call (around line 293) to include the device timezone:

Change:
```typescript
        body: JSON.stringify({ changes }),
```

To:
```typescript
        body: JSON.stringify({
          changes,
          deviceTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
```

- [ ] **Step 3: Verify both build**

```bash
cd ~/clawd/work/unfold/backend && npm run build
cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit
```

Expected: No type errors on either.

- [ ] **Step 4: Commit**

```bash
cd ~/clawd/work/unfold/backend
git add src/routes/sync.ts
git commit -m "feat: accept deviceTimezone in sync push and update user config"

cd ~/clawd/work/unfold/app/mobile
git add src/lib/sync-service.ts
git commit -m "feat: send device timezone on sync push"
```

---

### Task 5: Remove Client-Side `advanceDay` and On-Demand Generation from Reading Screen

**Files:**
- Modify: `/Users/galangster/clawd/work/unfold/app/mobile/src/app/(tabs)/(today)/reading.tsx:702-785`

- [ ] **Step 1: Remove `advanceDay` call and on-demand generation from `handleComplete`**

In `/Users/galangster/clawd/work/unfold/app/mobile/src/app/(tabs)/(today)/reading.tsx`, find the `handleComplete` callback (around line 702).

Remove these lines (around lines 730-743):

```typescript
      if (viewingDay < expectedTotal) {
        advanceDay(currentDevotionalId);
        refreshDailyReminder();

        // Progressive mode: fire-and-forget server-side generation for the next day
        if (currentDevotional?.generationMode === 'progressive') {
          submitGenerationJob({
            devotionalId: currentDevotionalId,
            dayNumber: viewingDay + 1,
            jobType: 'day',
          }).catch((err) => {
            console.warn('[day-complete] Failed to submit next-day server job:', err);
          });
        }
      }
```

Replace with just the daily reminder refresh (which should still fire):

```typescript
      if (viewingDay < expectedTotal) {
        refreshDailyReminder();
      }
```

- [ ] **Step 2: Remove `advanceDay` from the store selector and dependency array**

In the same file, find where `advanceDay` is imported from the store (around line 145):

```typescript
  const advanceDay = useUnfoldStore((s) => s.advanceDay);
```

Remove this line. Also remove `advanceDay` from the `handleComplete` dependency array (around line 785). And remove the `submitGenerationJob` import if it's no longer used in this file — check for other usages first.

- [ ] **Step 3: Verify build**

```bash
cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit
```

Expected: No type errors. If `submitGenerationJob` is used elsewhere in the file (e.g., `generateRemainingDays`), keep the import.

- [ ] **Step 4: Commit**

```bash
cd ~/clawd/work/unfold/app/mobile
git add src/app/\(tabs\)/\(today\)/reading.tsx
git commit -m "fix: remove client-side advanceDay and on-demand generation from reading completion"
```

---

### Task 6: Remove `isCatchUp` from Home Screen and State Machine

**Files:**
- Modify: `/Users/galangster/clawd/work/unfold/app/mobile/src/app/(tabs)/(today)/index.tsx:640-670`
- Modify: `/Users/galangster/clawd/work/unfold/app/mobile/src/components/home/compute-devotional-state.ts:66-82,145`

- [ ] **Step 1: Remove `isCatchUp` from `compute-devotional-state.ts`**

In `/Users/galangster/clawd/work/unfold/app/mobile/src/components/home/compute-devotional-state.ts`:

Remove `isCatchUp` from the `ComputeInput` interface (line 70):
```typescript
  isCatchUp: boolean;
```

Remove `isCatchUp` from the destructuring in `computeDevotionalState` (line 104 area — remove `isCatchUp,` from the destructured variables).

Change the tomorrow-locked check (line 145) from:
```typescript
  if (hasReadToday && !currentDayData.isRead && !isCatchUp) {
```
To:
```typescript
  if (hasReadToday && !currentDayData.isRead) {
```

- [ ] **Step 2: Remove `isCatchUp` from `index.tsx`**

In `/Users/galangster/clawd/work/unfold/app/mobile/src/app/(tabs)/(today)/index.tsx`:

Remove the entire `isCatchUp` useMemo block (lines 642-651):
```typescript
  const isCatchUp = useMemo(() => {
    if (!hasReadToday || !currentDevotional) return false;
    const todayStr = new Date().toDateString();
    const readToday = (currentDevotional.days ?? []).filter(
      d => d.isRead && d.readAt && new Date(d.readAt).toDateString() === todayStr
    );
    return readToday.some(d => d.generatedAt && new Date(d.generatedAt).toDateString() !== todayStr);
  }, [hasReadToday, currentDevotional, devotionals]);
```

Remove `isCatchUp` from the `computeDevotionalState` call (around line 658):
```typescript
    isCatchUp,
```

- [ ] **Step 3: Update the test file for compute-devotional-state**

In `/Users/galangster/clawd/work/unfold/app/mobile/src/components/home/__tests__/compute-devotional-state.test.ts`, remove all `isCatchUp` properties from test inputs. Set them to... actually just remove the property entirely since it no longer exists on the interface.

Search for `isCatchUp` in the test file and remove every occurrence.

- [ ] **Step 4: Verify build and tests**

```bash
cd ~/clawd/work/unfold/app/mobile && npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
cd ~/clawd/work/unfold/app/mobile
git add src/components/home/compute-devotional-state.ts src/components/home/__tests__/compute-devotional-state.test.ts src/app/\(tabs\)/\(today\)/index.tsx
git commit -m "fix: remove isCatchUp logic — server now controls day pacing"
```

---

### Task 7: Verify End-to-End

**Files:** None (manual testing)

- [ ] **Step 1: Deploy backend changes**

```bash
cd ~/clawd/work/unfold/backend
# Push to trigger Railway deploy, or restart local dev server
```

- [ ] **Step 2: Start the mobile app in dev mode**

```bash
cd ~/clawd/work/unfold/app/mobile && npx expo start
```

- [ ] **Step 3: Delete existing series and start a new one**

In the app, go to settings or create a new series. Complete the onboarding flow to generate day 1.

- [ ] **Step 4: Verify `seriesStartDate` is set**

Check the database:
```sql
SELECT id, title, current_day, series_start_date FROM sync_devotionals ORDER BY created_at DESC LIMIT 1;
```

Expected: `series_start_date` is set to today's timestamp.

- [ ] **Step 5: Complete day 1 and verify `currentDay` does NOT advance**

Read through day 1 and mark complete. Check the home screen — it should show the `complete-today` state with "Return to Reading" and "Your next reading will be ready tomorrow."

Verify in the database:
```sql
SELECT current_day FROM sync_devotionals ORDER BY created_at DESC LIMIT 1;
```

Expected: `current_day` is still 1.

- [ ] **Step 6: Manually trigger cron or wait for midnight**

To test without waiting, you can temporarily call the cron function manually via a test endpoint, or wait for the stagger window.

After cron runs:
```sql
SELECT current_day FROM sync_devotionals ORDER BY created_at DESC LIMIT 1;
```

Expected: `current_day` is now 2, and a generation job for day 2 exists in `generation_jobs`.

- [ ] **Step 7: Open app next morning and verify day 2 appears**

Pull sync, verify day 2 content is on the home screen as `reveal-ready` or `unread`.

- [ ] **Step 8: Take simulator screenshot for verification**

```bash
xcrun simctl io booted screenshot /tmp/day-progression-test.png && sips -Z 1000 /tmp/day-progression-test.png
```
