# Server-Side Devotional Generation

## Summary

Move ALL devotional generation (initial Day 1 + subsequent days) from the client to the server. This eliminates the iOS background execution problem (JS thread dies when app is suspended, killing in-flight API calls and creating phantom devotional series), simplifies the client by ~6K lines, and adds a "Reveal screen" UX for daily content discovery.

## Problem

1. **iOS kills generation**: When a user backgrounds the app during generation, iOS suspends the JS thread. In-flight `fetch()` promises die silently. The generating screen tells users "you can leave" but generation actually fails, creating phantom concurrent devotional series (empty shells saved before Day 1 completes).
2. **Complex client recovery**: 5 distinct retry/recovery mechanisms (AppState listener, watchdog timer, in-flight deduplication, validation retry, background fetch) add ~2K lines of fragile infrastructure code that still can't reliably recover from iOS suspension.
3. **Background fetch limitations**: iOS `BackgroundFetch` gives ~30 seconds of execution time, which is insufficient for the 10-15 second AI generation + 3-5 second memory layer maintenance + validation retries.

## Architecture Overview

```
┌─────────────┐     POST /api/jobs/generate    ┌──────────────┐
│   Client     │ ──────────────────────────────▶│   Backend     │
│   (Expo)     │                                │   (Express)   │
│              │◀─────── GET /api/jobs/:id ─────│               │
│  Poll/Push   │         (status + day data)    │  Worker Queue │
│              │                                │               │
│  Reveal      │◀─────── Push Notification ─────│  Midnight     │
│  Screen      │         (content ready)        │  Cron Job     │
└─────────────┘                                └──────────────┘
```

**Two trigger paths:**
1. **On-demand**: Client calls `POST /api/jobs/generate-day` → server generates → client polls for completion
2. **Scheduled**: Midnight cron queries users needing next-day content → generates in staggered 12am-5am window → push notification at user's preferred time

## Server-Side Components

### 1. Database Schema

#### `generation_jobs` table
```sql
CREATE TABLE generation_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL, -- Clerk user ID (FK added after users table creation)
  devotional_id TEXT NOT NULL,
  day_number    INTEGER NOT NULL,
  job_type      TEXT NOT NULL, -- 'initial_arc', 'day', 'memory_summary', 'narrative', 'arc_extension'
  status        TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'complete', 'failed'
  priority      INTEGER DEFAULT 0, -- higher = process first (on-demand > cron)
  result        JSONB, -- generated DevotionalDay or error details
  error         TEXT,
  retry_count   INTEGER DEFAULT 0,
  max_retries   INTEGER DEFAULT 3,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

-- Partial unique index: only prevent duplicates for active (pending/processing) jobs.
-- Failed/complete jobs don't block new submissions for the same devotional+day.
CREATE UNIQUE INDEX idx_generation_jobs_dedup
  ON generation_jobs(devotional_id, day_number, job_type)
  WHERE status IN ('pending', 'processing');

CREATE INDEX idx_generation_jobs_status ON generation_jobs(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_generation_jobs_user ON generation_jobs(user_id);
```

#### `user_generation_config` table
```sql
CREATE TABLE user_generation_config (
  user_id                TEXT PRIMARY KEY, -- Clerk user ID
  timezone               TEXT NOT NULL DEFAULT 'America/Chicago',
  preferred_notification_time TEXT DEFAULT '07:00', -- HH:MM in user's timezone
  stagger_offset_minutes INTEGER, -- random 0-300 (5 hours) assigned on first generation
  expo_push_token        TEXT,
  last_generation_date   TEXT, -- YYYY-MM-DD in user's timezone, prevents same-day double generation
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);
```

#### `progressive_memory` table (server becomes source of truth)
```sql
CREATE TABLE progressive_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL, -- Clerk user ID
  devotional_id   TEXT NOT NULL,
  layer           TEXT NOT NULL, -- 'full', 'summary', 'narrative'
  day_number      INTEGER, -- for 'full' layer
  day_range_start INTEGER, -- for 'summary' layer
  day_range_end   INTEGER, -- for 'summary' layer
  content         JSONB NOT NULL, -- MemoryLayerFull, MemoryLayerSummary, or MemoryLayerNarrative
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Separate unique constraints per layer type (NULL handling in Postgres):
CREATE UNIQUE INDEX idx_memory_full ON progressive_memory(devotional_id, day_number)
  WHERE layer = 'full';
CREATE UNIQUE INDEX idx_memory_summary ON progressive_memory(devotional_id, day_range_start, day_range_end)
  WHERE layer = 'summary';
CREATE UNIQUE INDEX idx_memory_narrative ON progressive_memory(devotional_id)
  WHERE layer = 'narrative'; -- only one narrative per devotional

CREATE INDEX idx_memory_devotional ON progressive_memory(devotional_id, layer);
```

#### `series_arcs` table
```sql
CREATE TABLE series_arcs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL, -- Clerk user ID
  devotional_id   TEXT NOT NULL UNIQUE,
  arc             JSONB NOT NULL, -- SeriesArc object
  last_extended_at TIMESTAMPTZ, -- 24h rate limit for extensions
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `used_scriptures` table
```sql
CREATE TABLE used_scriptures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL, -- Clerk user ID
  reference       TEXT NOT NULL,
  book            TEXT NOT NULL,
  devotional_id   TEXT NOT NULL,
  day_number      INTEGER NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scriptures_user ON used_scriptures(user_id);
```

#### `persona_history` table
```sql
CREATE TABLE persona_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL, -- Clerk user ID
  devotional_id   TEXT NOT NULL,
  persona_id      TEXT NOT NULL,
  persona_name    TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_persona_user ON persona_history(user_id, created_at);
```

### 2. API Endpoints

#### `POST /api/jobs/generate-day`
Submits a generation job. Used for both Day 1 (initial) and subsequent days.

```typescript
// Request
{
  devotionalId?: string;      // existing devotional ID; omit for Day 1 (server creates it)
  dayNumber: number;          // which day to generate (1 for initial)
  jobType: 'initial_arc' | 'day';
  // For Day 1 only:
  userContext?: {
    name: string;
    aboutMe: string;
    situation: string;
    emotion: string;
    seeking: string;
    themeCategory: string;
    devotionalType: string;
    studySubject?: string;
  };
}

// Response
{
  jobId: string;
  status: 'pending';
}
```

**Guards:**
- Clerk JWT auth required
- Rate limit: 5 jobs per minute per user
- Deduplication: If a job already exists for same `devotionalId + dayNumber + jobType` with status `pending` or `processing`, return existing jobId instead of creating duplicate
- Same-day check: If `last_generation_date` matches today (in user's timezone), reject Day N+1 generation (prevents same-day double generation)

#### `GET /api/jobs/:jobId`
Poll for job status.

```typescript
// Response (pending/processing)
{
  jobId: string;
  status: 'pending' | 'processing';
  createdAt: string;
}

// Response (complete)
{
  jobId: string;
  status: 'complete';
  result: {
    devotionalDay: DevotionalDay;
    seriesTitle?: string;     // included for Day 1
    totalDays?: number;       // included for Day 1
    arc?: SeriesArc;          // included for Day 1
  };
  completedAt: string;
}

// Response (failed)
{
  jobId: string;
  status: 'failed';
  error: string;
  retryCount: number;
  canRetry: boolean;
}
```

#### `POST /api/jobs/:jobId/retry`
Retry a failed job. Resets status to `pending`, increments `retry_count`.

**Guard:** `retry_count < max_retries`

#### `POST /api/users/push-token`
Register Expo push token for notifications.

```typescript
// Request
{
  expoPushToken: string;
  timezone: string;           // e.g., "America/Chicago"
  preferredNotificationTime: string; // e.g., "07:00"
}
```

#### `POST /api/users/notification-preferences`
Update notification time preference.

```typescript
// Request
{
  preferredNotificationTime: string; // HH:MM
  timezone: string;
}
```

### 3. Server Worker (Job Processor)

The worker processes jobs from the `generation_jobs` table. It runs as part of the Express server (not a separate process) using a polling loop.

```typescript
// Worker loop (runs every 5 seconds)
async function processNextJob() {
  // Stale job recovery: reset any 'processing' jobs stuck for >5 minutes
  // (handles server crashes, OOM, etc.)
  await resetStaleJobs({ olderThan: '5 minutes' });

  // Claim next pending job (atomic UPDATE ... SET status='processing'
  // WHERE status='pending' ORDER BY priority DESC, created_at ASC
  // LIMIT 1 RETURNING *)
  // Note: If scaling to multiple instances, use FOR UPDATE SKIP LOCKED.
  const job = await claimNextJob();
  if (!job) return;

  try {
    switch (job.job_type) {
      case 'initial_arc':
        await processInitialArc(job);
        break;
      case 'day':
        await processDayGeneration(job);
        break;
    }
    await markJobComplete(job.id, result);
  } catch (error) {
    if (job.retry_count < job.max_retries) {
      await markJobPending(job.id); // Will be retried
    } else {
      await markJobFailed(job.id, error.message);
    }
  }
}
```

#### `processInitialArc(job)`
1. Load user context from job data
2. Load `used_scriptures` for user (last 200)
3. Call `generateSeriesArc()` (Grok, ~2s)
4. Resolve persona (check `persona_history` for last 14 days, reuse if fresh)
5. Store arc in `series_arcs` table
6. Generate Day 1 inline (calls `processDayGeneration` directly — no separate chained job)
7. Return arc + Day 1 + series metadata in single job result (client only polls one jobId)

#### `processDayGeneration(job)`
1. Load devotional, arc, memory layers from DB
2. Call `assembleContextBuffer()` — query journal entries, SOAP responses, prayer requests, check-in mood from synced data
3. Call `maintainMemoryLayers()`:
   - Layer 1: Keep max 3 full-day records (FIFO eviction)
   - Layer 2 trigger: When 3+ completed days exist that are not covered by Layer 1 (FIFO) or any existing summary, generate `MemoryLayerSummary` via Grok (first fires on day 4, then whenever 3 more unsummarized days accumulate)
   - Layer 3 trigger: Every 7 days, generate `MemoryLayerNarrative` via Grok
4. Call `resolveMethodForDay()` — pick study method from arc hints, deduplicate (don't assign same method on sequential days, `Math.random() > 0.3` check)
5. Call `buildProgressiveUserPrompt()` — assemble 7-section prompt:
   - Reader Context (name, situation, emotion, seeking)
   - Journey Narrative (Layer 3 or intro text)
   - Summarized History (Layer 2 or empty)
   - Recent Days Full Detail (Layer 1, max 3)
   - Series Arc (overarchingTheme, narrativeShape, day context)
   - Study Method (method name, description)
   - Scripture/Variety Instructions
6. Call `generateProgressiveDay()` (Claude Sonnet, ~10-15s)
7. Validate response (Haiku validator, retry up to 2x with exponential backoff `delay(1000 * (attempt + 1))`)
8. If scripture not in Bible DB, substitute from series arc region
9. Store generated day in `devotional_days` table (via sync tables)
10. Update `last_generation_date` for user (in user's timezone)
11. Store memory layers in `progressive_memory` table
12. Record scripture usage in `used_scriptures`
13. If day is near series end, evaluate series extension:
    - Check 24h rate limit (`last_extended_at`)
    - Call `evaluateSeriesExtension()` via Grok
    - If yes, call `generateArcExtension()` via Grok, update arc

### 4. Midnight Cron Job

Runs once per minute, checks for users whose staggered generation window has arrived.

```typescript
// Cron: runs every minute
async function midnightGenerationCron() {
  const now = new Date();

  // Find users who:
  // 1. Have an active progressive devotional with incomplete days
  // 2. Their stagger time has arrived (midnight + stagger_offset in their timezone)
  // 3. Haven't already had generation today (last_generation_date != today in their tz)
  // 4. Next day doesn't already exist
  const users = await findUsersNeedingGeneration(now);

  for (const user of users) {
    // Check if next day's data already exists (guard)
    // Check if past their stagger window (12am + offset)
    // Submit generation job with priority=0 (lower than on-demand)
    await submitGenerationJob({
      userId: user.userId,
      devotionalId: user.activeDevotionalId,
      dayNumber: user.nextDayNumber,
      jobType: 'day',
      priority: 0, // cron jobs are lower priority than on-demand
    });
  }
}
```

**Stagger window calculation:**
```typescript
function isInStaggerWindow(user: UserGenerationConfig, now: Date): boolean {
  // Convert 'now' to user's timezone
  const userTime = toTimezone(now, user.timezone);
  const minutesSinceMidnight = userTime.getHours() * 60 + userTime.getMinutes();
  // User's offset is 0-300 minutes (0-5 hours after midnight)
  return minutesSinceMidnight >= user.stagger_offset_minutes;
}
```

**Stagger offset assignment:** Random integer 0-300, assigned on first generation, stored in `user_generation_config`. Prevents rate-limit spikes at midnight.

### 5. Push Notifications

After a cron-triggered generation completes:

1. Check user's `preferred_notification_time` (e.g., "07:00")
2. Convert to UTC using user's timezone
3. If notification time has already passed today, send immediately
4. If notification time is in the future, schedule delivery (use a scheduled job or delay queue)
5. Send via Expo Push API:

```typescript
import { Expo } from 'expo-server-sdk';

async function sendGenerationCompleteNotification(user: UserGenerationConfig, dayTitle: string) {
  const expo = new Expo();
  await expo.sendPushNotificationsAsync([{
    to: user.expo_push_token,
    title: "Your devotional is ready",
    body: dayTitle,
    data: {
      type: 'devotional_ready',
      devotionalId: user.activeDevotionalId,
      dayNumber: user.nextDayNumber,
    },
    sound: 'default',
    categoryId: 'devotional_ready',
  }]);
}
```

**Notification timing logic:**
- Generation completes at 2:47am, user wants notifications at 7:00am → schedule for 7:00am
- Generation completes at 8:15am (early bird on-demand), user wants 7:00am → send immediately
- User is in-app when generation completes → skip push, show in-app Reveal transition instead

## Client-Side Changes

### 1. Generating Screen (Replaces Current)

The generating screen becomes a **job submission + polling UI** instead of running generation locally.

**Flow:**
1. User completes onboarding → screen submits `POST /api/jobs/generate-day` with `jobType: 'initial_arc'`
2. Screen shows progress animation (no "you can leave" messaging — instead, engaging content about what's being created)
3. Polls `GET /api/jobs/:jobId` every 3 seconds
4. On `status: 'complete'`:
   - Store devotional + Day 1 in local Zustand store
   - Navigate to reading screen
5. On `status: 'failed'`:
   - Show retry button
   - User can retry via `POST /api/jobs/:jobId/retry`
6. **If user backgrounds the app**: Generation continues on server. When they return:
   - If complete → show Reveal screen
   - If still processing → resume polling
   - If failed → show retry

**No more phantom series**: Devotional shell is NOT saved locally until the server confirms Day 1 is complete.

### 2. Reveal Screen (New)

A full-screen overlay shown once per day when the user's next day content is ready.

**Layout (left-aligned):**
```
[Series Title]          ← Inter, all caps, eyebrow text, muted color
[Day Title]             ← Instrument Serif, large (28-32pt), primary color
[Day N of Total]        ← Inter, all caps, small, muted

                        ← Ambient glow effects behind text

        ∧               ← Animated chevron (smooth spring-based float, no bounce)
   Swipe up to begin    ← Inter, small, subtle
   today's reading
```

**Behavior:**
- Swipe up → navigates directly to reading screen for that day
- Only shows once per day (tracked by `lastRevealDate` in store)
- Only shows when content is already ready (never shows loading state)

**Three entry points:**
1. **Cold app open**: App launches, sync pull detects new day → Reveal
2. **In-app transition**: User is browsing, sync pull detects new day → animate transition to Reveal
3. **Push notification tap**: Deep link opens app → Reveal

**State tracking:**
```typescript
// In Zustand store
lastRevealShownDate: string | null; // YYYY-MM-DD, prevents showing twice same day
```

### 3. Home Screen Changes

**Remove:**
- Progressive generation trigger useEffect (lines 193-236 of index.tsx)
- `attemptEveningGeneration()` calls
- `progressiveGenTriggeredRef` deduplication
- `preGenerateAudio` fire-and-forget calls after generation

**Keep:**
- `computeDevotionalState` logic (still determines card state)
- `hasReadToday` computation (still needed for card display)
- DevotionalCardStack (still renders cards)

**Change:**
- "Preparing" state now means: server is generating, client is waiting
- When "preparing" is shown, client polls `GET /api/jobs/:jobId` (if a pending job exists) or shows static "Your next reading is being prepared" message
- No on-demand generation trigger from home screen — generation only happens via:
  1. Midnight cron (pre-scheduled)
  2. Day completion (server generates next day automatically)
  3. Manual "Generate" button (early bird fallback, submits job)

### 4. Day Completion Flow

When user marks a day as complete:

1. Client marks day `isRead = true`, sets `readAt` timestamp (existing behavior)
2. Client calls `POST /api/jobs/generate-day` with `dayNumber: completedDay + 1`
3. Server generates next day in background
4. Client does NOT wait — shows completed day card for rest of the day
5. Next day content arrives via:
   - Sync pull (if user is in-app later/next day)
   - Push notification (at user's preferred time)
   - Reveal screen (on next app open)

### 5. Files to Remove (Client)

| File | Lines | Reason |
|------|-------|--------|
| `src/lib/background-generation.ts` | ~97 | Background fetch task — server handles this |
| `src/lib/cutoff-logic.ts` | ~39 | Midnight/evening cutoffs — server handles timezone logic |

### 6. Files to Heavily Modify (Client)

| File | Changes |
|------|---------|
| `src/lib/progressive-generation.ts` | Remove ALL generation functions. Keep only types/interfaces that client needs. Or delete entirely and move types to a shared types file. |
| `src/app/generating.tsx` | Rewrite from generation orchestrator → job submission + polling UI. Remove AppState recovery, watchdog timer, in-flight tracking. |
| `src/app/(tabs)/(today)/index.tsx` | Remove generation trigger useEffect, evening generation calls. Add Reveal screen detection logic. |
| `src/lib/store.ts` | Remove: `progressiveGenerationState`, `lastGenerationCutoffDate`, `lastEveningGenerationDate`, generation-related actions. Add: `lastRevealShownDate`, `pendingJobId`. |

### 7. Files to Add (Client)

| File | Purpose |
|------|---------|
| `src/lib/generation-api.ts` | API client for job endpoints: `submitGenerationJob()`, `pollJobStatus()`, `retryJob()` |
| `src/app/reveal.tsx` | Reveal screen component |
| `src/lib/push-notifications.ts` | Expo push token registration, notification handlers, deep link routing to Reveal |

## Edge Cases Preserved from Client Audit

Every edge case from the current client implementation is accounted for:

| Edge Case | Current Client Handling | Server Handling |
|-----------|------------------------|-----------------|
| **Duplicate day generation** | `inFlightRequests` Map | `UNIQUE(devotional_id, day_number, job_type)` constraint + dedup check on submit |
| **Same-day Day 2 prevention** | `lastGenerationCutoffDate` | `last_generation_date` in user's timezone on server |
| **Double evening generation** | `lastEveningGenerationDate` | `last_evening_gen_date` on server |
| **Past end of series** | `nextDay > totalDays` guard | Server checks before creating job |
| **Validation failure** | Haiku validator + 3 retries | Same validator + retries on server |
| **Network timeout** | AppState recovery + watchdog | Server retries internally, client polls |
| **User suspends app** | Recovery mechanisms (fragile) | Server continues, client polls on return |
| **Memory Layer 1 FIFO (max 3)** | `pushFullDayMemory` eviction | Server maintains same FIFO in `progressive_memory` table |
| **Memory Layer 2 trigger (3+ unsummarized days)** | Fires when 3+ days fall outside Layer 1 FIFO and existing summaries | Server counts unsummarized days, triggers at same boundary |
| **Memory Layer 3 trigger (every 7 days)** | `daysSinceLastNarrative` | Server tracks `last_narrative_day`, triggers at same interval |
| **Scripture variety** | `usedScriptures[]` (last 200) | `used_scriptures` table with same lookback |
| **Study method deduplication** | `Math.random() > 0.3` check | Same logic on server |
| **Persona consistency (14-day window)** | `seriesPersonaHistory` | `persona_history` table with same 14-day lookback |
| **Series extension rate limit (24h)** | `lastExtendedAt` check | `last_extended_at` on `series_arcs` table |
| **Scripture not in Bible DB** | Fallback to arc region | Same fallback on server |
| **Empty memory (Day 1)** | Intro text / empty summaries | Same default handling on server |
| **Timezone boundary** | `todayDateString()` local time | Server uses user's stored timezone |

## API Models Used

| Function | Model | Latency | Purpose |
|----------|-------|---------|---------|
| `generateSeriesArc` | Grok | ~2s | Plan 3-30 day arc |
| `generateProgressiveDay` | Claude Sonnet | 10-15s | Generate daily content |
| `generateMemorySummary` | Grok | ~3-5s | Compress memory (Layer 2) |
| `generateNarrative` | Grok | ~3-5s | Spiritual biography (Layer 3) |
| `evaluateSeriesExtension` | Grok | ~2-3s | Extension decision |
| `generateArcExtension` | Grok | ~3-5s | Plan extension days |
| Haiku validator | Claude Haiku | ~1s | Validate JSON structure |

## Cloud Sync Integration

**Current state:** Generated days are created on client, synced up to server via `devotional_days` table.

**New state:** Generated days are created on server, synced down to client via the same `devotional_days` table.

**No sync conflict:** Server is source of truth for generated content. Client is source of truth for user-authored content (journal, highlights, reflections). These flow in opposite directions and never conflict.

**Memory layers:** Server becomes source of truth. Client receives memory state via sync pull (for display purposes only — client never writes memory layers).

## Navigation Bug Prevention

The user reported a bug where the Home tab was blocked after first devotional creation. The new design prevents this:

1. **Reveal screen is a modal overlay** (presented modally, not a route replacement) — Home tab navigation is never blocked
2. **Generating screen polls instead of running generation** — if user dismisses or navigates away, generation continues on server
3. **No local shell saved until server confirms** — no phantom devotional entries that confuse navigation state
4. **Deep link from push notification** → Reveal screen (modal) → swipe up → reading screen — Home tab accessible throughout

## Migration Strategy

### Phase 1: Backend (no client changes)
1. Create database tables (`generation_jobs`, `user_generation_config`, `progressive_memory`, `series_arcs`, `used_scriptures`, `persona_history`)
2. Port generation functions to server (arc, day, memory, validation)
3. Implement job queue worker (with stale-job recovery)
4. Implement API endpoints
5. Test with Postman/curl

### Phase 1.5: Data Migration
1. On first sync after server-side generation is enabled, client pushes existing `progressiveMemory`, `seriesArc`, `usedScriptures`, and `seriesPersonaHistory` to the new server tables
2. Server reconciles and becomes source of truth for generation state
3. Client clears local generation state after successful migration

### Phase 2: Client (generating screen)
1. Rewrite generating.tsx to submit job + poll
2. Add `generation-api.ts` client
3. Remove phantom shell creation (don't save devotional until server confirms)
4. Test Day 1 flow end-to-end

### Phase 3: Client (daily flow)
1. Wire day completion to submit next-day job
2. Remove home screen generation triggers
3. Remove `background-generation.ts` and `cutoff-logic.ts`
4. Remove progressive-generation.ts functions (keep types)
5. Clean up store (remove generation state, add reveal state)

### Phase 4: Reveal Screen + Push
1. Build Reveal screen component
2. Add push token registration
3. Implement push notification handling + deep links
4. Wire Reveal screen entry points (cold open, in-app, push tap)
5. Implement midnight cron job

### Phase 5: Cleanup
1. Remove dead client code
2. Verify cloud sync works correctly (server → client flow)
3. Test all edge cases (early bird, timezone boundaries, series extension)
4. Load test cron job (simulate 1K+ users)

## Success Criteria

1. **Generation never fails due to iOS suspension** — server completes all generation regardless of app state
2. **No phantom devotional series** — shells only created after server confirms Day 1
3. **Reveal screen shows once per day** — tracked by date, three entry points work
4. **Push notifications respect user's preferred time** — not sent at 3am
5. **All 18 edge cases preserved** — see table above
6. **3-layer memory system works identically** — same triggers, same content quality
7. **Cloud sync flows correctly** — generated content server→client, user content client→server
8. **Home tab never blocked** — Reveal is modal, navigation always accessible
9. **~6K lines removed from client** — net simplification

## Out of Scope

- TTS audio pre-generation (stays client-side for now, can be moved to server later)
- Daily Bridge feature (low priority, can be added to cron job later)
- Batch generation mode (legacy, can be deprecated)
- Companion chat changes (already server-side, no changes needed)
- Journal/reflection storage changes (already synced via cloud sync, no changes needed)
