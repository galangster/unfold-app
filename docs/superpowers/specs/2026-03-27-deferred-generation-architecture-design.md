# Deferred Generation Architecture — Design Spec (v2)

**Date:** 2026-03-27
**Status:** Reviewed (3-agent system: Proposer 8/10, Critic found 28 issues, Referee scored 4/10 on v1 → all fixes applied in v2)
**Scope:** Devotional generation timing, story variety, series finale, notification integration, incomplete reading handling

---

## 1. Problem Statement

The current progressive generation system fires immediately when the user completes a day's reading (`reading.tsx:748`) or when the app opens and the current day is missing (`index.tsx:214`). This creates three problems:

1. **Missing engagement context.** `assembleContextBuffer(devotionalId, completedDayNumber)` (progressive-generation.ts:948) reads journal entries, check-ins, and SOAP responses for the completed day. But generation triggers inside `handleComplete` — before the user has journaled, checked in, or reflected. The context buffer is systematically empty of today's engagement data. This compounds: Layer 1 → Layer 2 → Layer 3 memory all propagate impoverished data across the series.
2. **No background processing.** Generation only happens while the user is in the app, meaning they see loading states and can't receive a pre-built devotional in the morning.
3. **No series arc awareness.** The last day of a series has no special handling. Stories are fetched randomly with no deduplication. The experience lacks narrative closure.

## 2. Architecture Overview

### 2.1 Foreground-Primary with Background Optimization

The primary generation path remains **foreground** (triggered on day completion or app open), but with **deferred context assembly** — generation waits until after midnight so the context buffer captures a full day of engagement data.

Background fetch is an **optimization layer**, not the primary path. iOS `BGAppRefreshTask` provides ~30 seconds of wall-clock time, while generation takes 15-90 seconds. Background fetch cannot reliably complete generation. Instead:

- **Primary path:** User opens app next morning → generation triggers with full context (if not already generated)
- **Optimization path:** Background fetch attempts overnight generation → if it completes in time, the devotional is pre-loaded
- **Immediate path (preserved):** Series extension (`handleContinueJourney`, reading.tsx:833) and manual retry (`handleRetryGeneration`, reading.tsx:1097) still trigger generation immediately

### 2.2 Reliability Model

| Path | Reliability | When it fires |
|------|------------|---------------|
| App open fallback | ~100% (user opens app daily) | Morning, when user opens app and next day is missing |
| Background fetch | ~40-70% for daily-use apps | Overnight, iOS-determined timing |
| Immediate trigger | 100% (user-initiated) | Series extension and manual retry only |

Background fetch is best-effort. The system works correctly without it — it just means the user sees a brief loading state on app open instead of instant content.

### 2.3 Trigger Changes

Three call sites for `triggerNextDayGeneration` in `reading.tsx`:

| Location | Line | Current behavior | Change |
|----------|------|-----------------|--------|
| `handleComplete()` | 748 | Fires immediately after marking day read | **CHANGE:** Remove. Generation deferred to app open or background fetch. |
| `handleContinueJourney()` | 833 | Fires after series extension | **PRESERVE:** Immediate generation needed for continuation flow. |
| `handleRetryGeneration()` | 1097 | Manual retry when day is missing | **PRESERVE:** User escape hatch must remain. |

The fallback in `index.tsx:214` is preserved but gated: only generate if past midnight cutoff (ensuring full context).

---

## 3. Generation Timing

### 3.1 Cutoff Time

Fixed at **midnight (00:00) device local time** via `new Date()`. No user-configurable cutoff.

**Timezone note:** `new Date()` uses the device's current timezone. If a user travels across time zones, the cutoff shifts with them. This is acceptable — the cutoff's purpose is "wait until the user's day is over," which tracks local time naturally.

### 3.2 Infrastructure Prerequisites

**New dependencies (not currently installed):**
```bash
npx expo install expo-background-fetch expo-task-manager
```

**app.json changes:**
```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["audio", "fetch"]
      }
    }
  }
}
```

**Requires native rebuild** — this is not a JS-only change. Must run `npx expo run:ios` or do an EAS build after configuration.

### 3.3 Background Fetch Task

```typescript
// background-generation.ts (new file)
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { useUnfoldStore } from './store';
import { triggerNextDayGeneration } from './progressive-generation';
import { refreshDailyReminder } from './notifications';

const GENERATION_TASK = 'DEFERRED_DEVOTIONAL_GENERATION';

TaskManager.defineTask(GENERATION_TASK, async () => {
  const store = useUnfoldStore.getState();

  // Guard: find active progressive devotional
  const devotional = store.devotionals.find(
    (d) => d.id === store.currentDevotionalId && d.generationMode === 'progressive'
  );
  if (!devotional) return BackgroundFetch.BackgroundFetchResult.NoData;

  // Guard: past midnight cutoff?
  const lastCutoff = store.lastGenerationCutoffDate;
  const todayDate = new Date().toISOString().split('T')[0];
  if (lastCutoff === todayDate) {
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  // Guard: next day already exists?
  const nextDay = devotional.currentDay;
  if (devotional.days.some((d) => d.dayNumber === nextDay)) {
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  // Guard: not past end of series?
  if (nextDay > devotional.totalDays) {
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }

  // Attempt generation via the existing orchestrator
  // triggerNextDayGeneration handles all 7 args internally
  const completedDay = nextDay - 1;
  const result = await triggerNextDayGeneration(devotional.id, completedDay);

  if (result) {
    store.setLastGenerationCutoffDate(todayDate);
    // Refresh the morning notification with the new day's content
    refreshDailyReminder();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  }

  return BackgroundFetch.BackgroundFetchResult.Failed;
});
```

### 3.4 Registration

```typescript
// Called once during app startup
await BackgroundFetch.registerTaskAsync(GENERATION_TASK, {
  minimumInterval: 60 * 60, // 1 hour minimum between attempts
});
```

Note: `stopOnTerminate` and `startOnBoot` are Android-only options — omitted here since the app currently targets iOS. Add them when Android support ships.

### 3.5 New Store Fields

```typescript
// Added to UnfoldStore
lastGenerationCutoffDate: string;     // ISO date string (YYYY-MM-DD) of last processed cutoff
```

Store migration **v26 → v27** adds this with default: `lastGenerationCutoffDate: ''`.

**Note:** `pendingGeneration` flag is NOT needed. The existing `DayGenerationState.status` field (which tracks `'pending' | 'generating' | 'ready' | 'failed'`) combined with checking whether the next day exists in `devotional.days` is sufficient. Adding a redundant flag creates state synchronization risk.

### 3.6 Stale Generation Detection

If `DayGenerationState.status === 'generating'` and `startedAt` is older than 5 minutes, treat as failed and allow retry. This handles cases where the app was killed mid-generation (by iOS during background fetch or by the user).

### 3.7 Day 1 Exclusion

Day 1 is generated during onboarding (before any reading happens). The deferred/background system only applies to **Day 2+**. The onboarding generation flow is unchanged.

---

## 4. Story Variety & Deduplication

### 4.1 Reframing: Variety, Not Continuation

The `StoryResult` interface (story-service.ts:14) returns metadata only: `id`, `title`, `oneLineSummary`, `spiritualAngle`, `scriptureConnection`. Stories are illustration seeds — the AI generates the actual narrative content during devotional generation. That content is embedded in `bodyText`, not stored separately.

**True story continuation** (same narrative thread across days) would require extracting and storing generated story text separately. This is a future enhancement, not part of this spec.

**This spec implements story variety:** tracking which story seeds have been used and excluding them from future fetches so the user encounters diverse stories across a series.

### 4.2 Used Story Tracking

New field on `Devotional` interface:
```typescript
usedStoryIds?: string[];  // story IDs used in this series (cleared on series end)
```

After generation, if a story was fetched, push its ID into this array. When fetching stories for the next day, pass these as exclusions.

### 4.3 Client-Side Changes

Update `fetchStoriesForGeneration` options interface in `story-service.ts`:
```typescript
export async function fetchStoriesForGeneration(
  themes: string[],
  options: {
    category?: string;
    limit?: number;
    spinnable?: boolean;
    exclude?: string[];  // NEW: story IDs to exclude
  } = {}
)
```

Add to URLSearchParams construction:
```typescript
if (options.exclude?.length) {
  params.set('exclude', options.exclude.join(','));
}
```

### 4.4 Backend Changes

Add `exclude` query parameter to `GET /api/stories` in the backend route (`src/routes/stories.ts`):

```typescript
if (exclude) {
  const excludeIds = (exclude as string).split(',');
  query = query.where(not(inArray(stories.id, excludeIds)));
}
```

### 4.5 New Fields on DevotionalDay

```typescript
// Added to DevotionalDay interface (store.ts:166)
storyId?: string;  // which story seed was used (for dedup tracking)
```

---

## 5. Series Finale Closure

### 5.1 Detection

In `buildProgressiveUserPrompt()`, when `dayNumber === arc.totalDaysPlanned`, inject a finale directive. The existing `completingLastDay` check in reading.tsx:725 (`viewingDay >= expectedTotal`) already handles the UI side.

### 5.2 Closure Archetypes

Each finale is assigned one archetype, selected deterministically using a hash of the series ID (reproducible on retry):

```typescript
const archetypeIndex = hashString(devotionalId) % CLOSURE_ARCHETYPES.length;
const archetype = CLOSURE_ARCHETYPES[archetypeIndex];
```

The 11 archetypes:

1. **Commissioning** — sends the user forward with a charge and purpose
2. **Reflection mosaic** — weaves together threads from across the series
3. **Full circle** — returns to the opening theme with new depth and perspective
4. **Gratitude** — celebrates what the user brought to the journey
5. **Open door** — ends with a question, not an answer; invites continued exploration
6. **Letter to self** — reads like a letter the user wrote to their future self
7. **Benediction** — ends with a spoken blessing, priestly tone
8. **Campfire** — intimate storytelling, "remember when we started..."
9. **Milestone marker** — concrete acknowledgment of what was accomplished
10. **Quiet landing** — understated, peaceful, no fanfare — just stillness
11. **Torch pass** — frames the user as now equipped to help someone else

Each archetype includes a `description` field (2-3 sentences) injected into the prompt to guide the AI. These are defined as a new `CLOSURE_ARCHETYPES` constant array in `writing-craft.ts`, following the existing pattern of `STORY_TYPES`, `DIALOGUE_TYPES`, and `DAILY_CRAFT_TECHNIQUES`.

### 5.3 Finale Directive Template

Injected into Section 7 of the user prompt when `dayNumber === totalDays`:

```
This is the FINAL day of this devotional series. Create a meaningful conclusion.

Closure archetype for this finale: "{archetype.name}"
{archetype.description}

Guidelines:
- Reflect back on the journey themes from the series narrative (provided below)
- Revisit the user's original story/struggle from onboarding
- Show how the scripture and reflections have built toward this moment
- End with a commissioning prayer — sending the user forward
- Include a "looking ahead" reflection question that plants a seed for what's next
- Tone: warm, celebratory but grounded — like finishing a meaningful book with a friend

Series journey narrative (Layer 3 memory):
{layer3_narrative}
```

### 5.4 Completion Screen Enhancement

`CompletionCelebration` already handles series completion via `type: 'series'` (CompletionCelebration.tsx:240). The existing `SERIES_MESSAGES` array (line 83) provides celebration messages.

Enhancements when `type === 'series'`:
- Add `seriesReflectionSummary` prop — AI-generated 2-3 sentence summary of the series journey
- Display the reflection summary below the main celebration message
- Ember particle effect already runs at full intensity for series completion

### 5.5 New Fields on DevotionalDay

```typescript
// Added to DevotionalDay interface (store.ts:166)
seriesReflectionSummary?: string;     // AI-generated 2-3 sentence summary (finale only)
closureArchetype?: string;            // which archetype was used (finale only)
```

### 5.6 AI Response Schema Update

The JSON schema in `buildProgressiveUserPrompt` (progressive-generation.ts, Section 7) must be updated to request these new fields. The parsing code at lines 685-705 of `_generateProgressiveDayInternal` must map them from `dayData` to the `DevotionalDay` object:

```typescript
// Add to the DevotionalDay construction (after existing field mappings)
storyId: dayData.storyId,
seriesReflectionSummary: dayData.seriesReflectionSummary,
closureArchetype: selectedArchetype?.name,
```

---

## 6. Notification Integration

### 6.1 Existing Infrastructure

`notifications.ts` already has:
- `getTodayTeaser()` (line 94) — reads `dayTitle` and `quotableLine` from the current day in the store
- `generateNotificationTitle(teaser)` (line 143) — returns `teaser.dayTitle` or "Time to Unfold"
- `generateNotificationBody(teaser)` (line 119) — returns `quotableLine` truncated to 100 chars
- `scheduleDailyReminder(timeString)` (line 153) — schedules daily repeating notification
- `refreshDailyReminder()` — reschedules with current content

### 6.2 How It Works With Deferred Generation

No new notification functions needed. The existing system already works:

1. Background fetch generates next day → calls `refreshDailyReminder()`
2. `refreshDailyReminder()` calls `getTodayTeaser()` which reads the newly stored day
3. `getTodayTeaser()` returns the day's `title` and `quotableLine`
4. Morning notification fires with the AI-generated title and quotable line as teaser

**If background fetch didn't run:** User opens app → fallback generation triggers → `refreshDailyReminder()` is called after generation (already happens at reading.tsx:751). Next notification uses new content.

### 6.3 No Overnight Notification

There is no 3AM notification. The only notification is at the user's configured reminder time.

---

## 7. Incomplete Reading Handling

### 7.1 Completion Status

Generation does not require the user to have completed today's reading. A `completionStatus` is computed at generation time by `assembleContextBuffer(devotionalId, completedDayNumber)`:

```typescript
type CompletionStatus =
  | 'completed_with_engagement'   // isRead=true + journal/check-in data present
  | 'completed_minimal'           // isRead=true, no journal/check-in
  | 'in_progress'                 // readAt exists but isRead=false
  | 'not_started';                // no readAt, not read
```

### 7.2 Context Adaptation

The completion status is injected into Section 1 of the generation prompt:

| Status | Prompt injection | AI behavior |
|--------|-----------------|-------------|
| `completed_with_engagement` | "User completed Day N and engaged deeply — here are their reflections: {data}" | Full personalization, reference journals/check-ins |
| `completed_minimal` | "User completed Day N's reading." | Moderate personalization from reading completion |
| `in_progress` | "User is still working through Day N." | Gentle, no guilt, no assumptions about what they read |
| `not_started` | "User hasn't started Day N yet." | Compassionate re-engagement, memory layers carry the thread |

### 7.3 Principle

**Generation never blocks on user action.** The series keeps moving forward. The AI meets the user where they are. Users who skip days still get new content generated overnight (or on next app open), each adapting to their level of engagement.

---

## 8. Implementation Surface

### Infrastructure Prerequisites
1. `npx expo install expo-background-fetch expo-task-manager`
2. Add `"fetch"` to `UIBackgroundModes` in `app.json` → `ios.infoPlist`
3. Native rebuild required (`npx expo run:ios` or EAS build)

### New Files
| File | Purpose |
|------|---------|
| `src/lib/background-generation.ts` | Background fetch task definition, registration, cutoff guards |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/progressive-generation.ts` | Add: finale directive in `buildProgressiveUserPrompt()`, completion status in `assembleContextBuffer()`, story ID tracking, stale generation detection. Update: AI response JSON schema + parsing at lines 685-705 |
| `src/lib/store.ts` | Add to `DevotionalDay`: `storyId?`, `seriesReflectionSummary?`, `closureArchetype?`. Add to `Devotional`: `usedStoryIds?`. Add to store: `lastGenerationCutoffDate`. Migration v26→v27 |
| `src/app/(tabs)/(today)/reading.tsx` | Remove `triggerNextDayGeneration()` from `handleComplete()` (line 748 only). Lines 833 and 1097 UNCHANGED. Pass `seriesReflectionSummary` to CompletionCelebration |
| `src/app/(tabs)/(today)/index.tsx` | Gate fallback generation (line 214) behind midnight cutoff check |
| `src/lib/notifications.ts` | No changes needed — existing `refreshDailyReminder()` + `getTodayTeaser()` already reads stored day content |
| `src/lib/story-service.ts` | Add `exclude?: string[]` to options interface. Pass as query param |
| `src/components/CompletionCelebration.tsx` | Add optional `seriesReflectionSummary` prop. Display below celebration message when `type === 'series'` |
| `src/constants/writing-craft.ts` | Add `CLOSURE_ARCHETYPES` array (11 entries with name + description) and `getClosureArchetypeForSeries(devotionalId)` selection function |

### Backend Changes
| File | Changes |
|------|---------|
| `unfold-backend/src/routes/stories.ts` | Add `exclude` query parameter — filter out story IDs from results |

### Store Migration (v26 → v27)
```typescript
if (version < 27) {
  try {
    (state as any).lastGenerationCutoffDate = (state as any).lastGenerationCutoffDate ?? '';
    // usedStoryIds and new DevotionalDay fields are optional — no migration needed
  } catch (err) {
    console.error('[store] Migration v26→27 failed:', err);
  }
}
```

---

## 9. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| iOS doesn't wake background task | High | Background fetch is optimization only. Primary path is app-open generation with full context. System works 100% without background fetch. |
| Generation timeout in background (30s iOS limit) | High | Accept gracefully — return `Failed`, user gets foreground generation on app open. No data loss. |
| Generation fails overnight (network) | Medium | Background task returns `Failed`. Foreground fallback on app open. Existing retry UI (`handleRetryGeneration`) preserved. |
| Store migration breaks existing data | Low | All new fields are optional with `?`. Single additive field (`lastGenerationCutoffDate`) with safe default. 26 prior successful migrations validate the pattern. |
| AI generates poor finale | Low | 11 archetype options + anti-slop directive + existing persona system. Deterministic selection (hash-based) ensures consistency on retry. |
| Story exclusion list grows too large | Very low | Capped by series length (7-30 days). Stored per-devotional, cleared when series ends. |
| Stale 'generating' status after app kill | Medium | 5-minute timeout heuristic: if `startedAt` > 5 min old, treat as failed, allow retry. |
| Partial state on background kill | Low | `triggerNextDayGeneration` is non-atomic (7 steps), but each step is idempotent or safely re-runnable. Worst case: generation re-triggers on app open. |
| Cellular data usage from overnight generation | Low | Background fetch typically runs on WiFi. Future enhancement: check `NetInfo` for WiFi before generating in background. |

---

## 10. What This Does NOT Change

- No codebase restructuring or architecture refactoring
- No changes to the onboarding flow or Day 1 generation
- No changes to the store's fundamental structure (additive fields only)
- No changes to how the AI model is called (same Claude Sonnet 4.6 endpoint)
- No changes to series extension or manual retry flows (reading.tsx lines 833 and 1097 preserved)
- The existing foreground generation path remains and becomes the primary path (with deferred context)

**Backend note:** One backend route change is in scope — adding `exclude` query parameter to `GET /api/stories`. No database schema changes.

---

## 11. TDD Strategy

Per the TDD skill, implementation follows vertical slices with red-green-refactor cycles. Store migration comes first since other slices depend on new fields.

### Jest Configuration (prerequisite)
Before any slices, set up test infrastructure:
- Create `jest.config.js` for React Native + TypeScript
- Add `"test": "jest"` script to `package.json`
- Create basic test utilities for Zustand store mocking

### Slice Order

1. **Slice 1: Store migration v26→v27** — Add `lastGenerationCutoffDate` to store. Test: migration correctly adds field with default.
2. **Slice 2: Cutoff logic** — Pure function `isPastCutoff(lastCutoffDate, now)`. Test: returns true/false based on date comparison.
3. **Slice 3: Completion status computation** — Pure function `computeCompletionStatus(dayData, journal, checkIns)`. Test: all 4 status values from different input combinations.
4. **Slice 4: Closure archetype system** — `CLOSURE_ARCHETYPES` array + `getClosureArchetypeForSeries(devotionalId)`. Test: deterministic selection, all 11 archetypes reachable.
5. **Slice 5: Story deduplication** — `exclude` param in `fetchStoriesForGeneration`, `usedStoryIds` tracking. Test: exclusion list passed correctly, IDs accumulated.
6. **Slice 6: Finale directive injection** — Modify `buildProgressiveUserPrompt` for last day. Test: directive present when dayNumber === totalDays, absent otherwise.
7. **Slice 7: AI response schema + parsing** — Add new fields to JSON schema and DevotionalDay mapping. Test: new fields correctly extracted from AI response.
8. **Slice 8: Background fetch task** — `background-generation.ts` with guards. Test: guards return NoData for already-generated, pre-cutoff, non-progressive devotionals.
9. **Slice 9: Reading.tsx trigger change** — Remove generation from `handleComplete` (line 748 only). Preserve lines 833 and 1097. Test: verify handleContinueJourney and handleRetryGeneration still call triggerNextDayGeneration.
10. **Slice 10: Stale generation detection** — 5-minute timeout on `'generating'` status. Test: status reset to `'failed'` after timeout.
11. **Slice 11: CompletionCelebration enhancement** — Add `seriesReflectionSummary` prop. Test: renders summary when provided, omits when absent.

Each slice: write one failing test → write minimal code to pass → refactor → next slice.
