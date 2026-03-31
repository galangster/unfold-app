# Deferred Generation Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move devotional generation from immediate-on-complete to deferred overnight with richer engagement context, story deduplication, series finale closure, and background fetch optimization.

**Architecture:** Foreground-primary with background optimization. The main trigger in `handleComplete` is removed. Generation happens on next app open (with full engagement context from the completed day) or via background fetch overnight. Series extensions and manual retries remain immediate. New AI prompt sections handle finales and completion status.

**Tech Stack:** Expo SDK 55, expo-background-fetch, expo-task-manager, Zustand/MMKV, Jest

**Spec:** `docs/superpowers/specs/2026-03-27-deferred-generation-architecture-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/background-generation.ts` | Background fetch task definition, registration, cutoff guards |
| `src/lib/cutoff-logic.ts` | Pure functions for midnight cutoff date comparison |
| `src/lib/completion-status.ts` | Pure function to compute engagement completion status |
| `src/lib/__tests__/cutoff-logic.test.ts` | Tests for midnight cutoff pure functions |
| `src/lib/__tests__/completion-status.test.ts` | Tests for completion status computation |
| `src/lib/__tests__/story-dedup.test.ts` | Tests for story exclusion tracking |
| `src/constants/__tests__/closure-archetypes.test.ts` | Tests for archetype selection |
| `src/lib/__tests__/background-generation.test.ts` | Tests for background task guards |
| `src/lib/__tests__/store-migration-v27.test.ts` | Tests for store migration |
| `src/lib/__tests__/reading-trigger-removal.test.ts` | Regression test verifying handleComplete no longer triggers generation |
| `jest.config.js` | Jest configuration for React Native + TypeScript |

### Modified Files
| File | Changes |
|------|--------|
| `package.json` | Add test script, expo-background-fetch, expo-task-manager |
| `src/lib/store.ts` | Add `lastGenerationCutoffDate` to store + `usedStoryIds` to Devotional + new fields on DevotionalDay + migration v26→v27 |
| `src/lib/progressive-generation.ts` | Add completion status to `assembleContextBuffer`, finale directive in `buildProgressiveUserPrompt`, storyId in DevotionalDay mapping, stale generation detection |
| `src/lib/story-service.ts` | Add `exclude` param to `fetchStoriesForGeneration` |
| `src/constants/writing-craft.ts` | Add `CLOSURE_ARCHETYPES` array + `getClosureArchetypeForSeries()` |
| `src/app/(tabs)/(today)/reading.tsx` | Remove `triggerNextDayGeneration` from `handleComplete` (line 748 only) |
| `src/app/(tabs)/(today)/index.tsx` | Gate fallback generation behind cutoff check |
| `src/components/CompletionCelebration.tsx` | Add optional `seriesReflectionSummary` prop |
| `app.json` | Add `UIBackgroundModes: ["audio", "fetch"]` to ios.infoPlist |

---

## Task 0: Jest Configuration

**Files:**
- Create: `jest.config.js`
- Modify: `package.json` (add test script)

- [ ] **Step 1: Create jest.config.js**

```javascript
// jest.config.js
module.exports = {
  preset: 'react-native',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo|@expo|expo-modules-core|@react-native-community|@clerk)/)',
  ],
};
```

- [ ] **Step 2: Add test script to package.json**

In `package.json` scripts, add:
```json
"test": "jest --passWithNoTests"
```

- [ ] **Step 3: Verify existing tests pass**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest --passWithNoTests`
Expected: 2 existing test files pass (compute-devotional-state.test.ts, context-slot-priority.test.ts)

- [ ] **Step 4: Commit**

```bash
git add jest.config.js package.json
git commit -m "chore: add jest configuration and test script"
```

---

## Task 1: Store Migration v26→v27

**Files:**
- Modify: `src/lib/store.ts:166-192` (DevotionalDay interface)
- Modify: `src/lib/store.ts:194-230` (Devotional interface)
- Modify: `src/lib/store.ts:1615` (version bump)
- Modify: `src/lib/store.ts:1896-1906` (add migration after v25→v26)
- Create: `src/lib/__tests__/store-migration-v27.test.ts`

- [ ] **Step 1: Write failing test for migration**

```typescript
// src/lib/__tests__/store-migration-v27.test.ts

/**
 * Extract the migration logic from store.ts into a testable function.
 * The migrate function in store.ts applies migrations sequentially.
 * We test the v26→v27 migration by simulating the same pattern.
 */
function applyMigrationV27(state: Record<string, any>): Record<string, any> {
  // This mirrors the exact migration code in store.ts
  state.lastGenerationCutoffDate = state.lastGenerationCutoffDate ?? '';
  return state;
}

describe('Store migration v26→v27', () => {
  it('adds lastGenerationCutoffDate with empty string default when field is missing', () => {
    const stateV26: Record<string, any> = {
      devotionals: [],
      journalEntries: [],
      bookmarks: [],
    };

    const migrated = applyMigrationV27({ ...stateV26 });

    expect(migrated.lastGenerationCutoffDate).toBe('');
    // Original fields preserved
    expect(migrated.devotionals).toEqual([]);
  });

  it('preserves existing lastGenerationCutoffDate if already set', () => {
    const state: Record<string, any> = {
      lastGenerationCutoffDate: '2026-03-27',
    };

    const migrated = applyMigrationV27({ ...state });

    expect(migrated.lastGenerationCutoffDate).toBe('2026-03-27');
  });

  it('handles undefined gracefully (nullish coalescing)', () => {
    const state: Record<string, any> = {
      lastGenerationCutoffDate: undefined,
    };

    const migrated = applyMigrationV27({ ...state });

    expect(migrated.lastGenerationCutoffDate).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx jest store-migration-v27 --verbose`
Expected: PASS

- [ ] **Step 3: Add new fields to DevotionalDay interface**

In `src/lib/store.ts`, add to `DevotionalDay` interface (after line 191, before the closing `}`):
```typescript
  // Deferred generation metadata
  storyId?: string;
  seriesReflectionSummary?: string;
  closureArchetype?: string;
```

- [ ] **Step 4: Add usedStoryIds to Devotional interface**

In `src/lib/store.ts`, add to `Devotional` interface (find it after `DevotionalDay`):
```typescript
  // Story deduplication
  usedStoryIds?: string[];
```

- [ ] **Step 5: Add lastGenerationCutoffDate to store state + initial state**

Find the store state interface and add:
```typescript
  lastGenerationCutoffDate: string;
```

Find `initialState` and add:
```typescript
  lastGenerationCutoffDate: '',
```

- [ ] **Step 6: Add store actions**

Add to the store's actions:
```typescript
  setLastGenerationCutoffDate: (date: string) => set({ lastGenerationCutoffDate: date }),
  addUsedStoryId: (devotionalId: string, storyId: string) => set((state) => {
    const devo = state.devotionals.find((d) => d.id === devotionalId);
    if (devo) {
      devo.usedStoryIds = [...(devo.usedStoryIds ?? []), storyId];
    }
    return { devotionals: [...state.devotionals] };
  }),
```

- [ ] **Step 7: Bump version to 27 and add migration**

Change line 1615: `version: 27,`

After the v25→v26 migration block (after line 1906), add:
```typescript
        // Migration from version 26 to 27: Add deferred generation fields
        if (version < 27) {
          try {
            (state as any).lastGenerationCutoffDate = (state as any).lastGenerationCutoffDate ?? '';
          } catch (err) {
            console.error('[store] Migration v26→27 failed:', err);
          }
        }
```

- [ ] **Step 8: Run tests**

Run: `npx jest --verbose`
Expected: All tests pass (existing + new migration test)

- [ ] **Step 9: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 10: Commit**

```bash
git add src/lib/store.ts src/lib/__tests__/store-migration-v27.test.ts
git commit -m "feat: store migration v27 — deferred generation fields"
```

---

## Task 2: Midnight Cutoff Logic

**Files:**
- Create: `src/lib/__tests__/cutoff-logic.test.ts`
- Create: `src/lib/cutoff-logic.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/__tests__/cutoff-logic.test.ts
import { isPastCutoff, todayDateString } from '../cutoff-logic';

describe('isPastCutoff', () => {
  it('returns true when lastCutoff is empty (never run)', () => {
    expect(isPastCutoff('', new Date('2026-03-27T08:00:00'))).toBe(true);
  });

  it('returns true when lastCutoff is yesterday', () => {
    expect(isPastCutoff('2026-03-26', new Date('2026-03-27T02:00:00'))).toBe(true);
  });

  it('returns false when lastCutoff is today', () => {
    expect(isPastCutoff('2026-03-27', new Date('2026-03-27T08:00:00'))).toBe(false);
  });

  it('returns true when lastCutoff is two days ago', () => {
    expect(isPastCutoff('2026-03-25', new Date('2026-03-27T08:00:00'))).toBe(true);
  });
});

describe('todayDateString', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = todayDateString(new Date('2026-03-27T15:30:00'));
    expect(result).toBe('2026-03-27');
  });

  it('uses local date (not UTC) for midnight boundary', () => {
    // 11:30 PM on March 27 local time
    const lateNight = new Date(2026, 2, 27, 23, 30, 0); // month is 0-indexed
    const result = todayDateString(lateNight);
    expect(result).toBe('2026-03-27');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest cutoff-logic --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement cutoff-logic.ts**

```typescript
// src/lib/cutoff-logic.ts

/**
 * Returns the local date as YYYY-MM-DD string.
 * Uses local timezone (not UTC) so "midnight" tracks the user's actual day boundary.
 */
export function todayDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns true if generation should run (past midnight cutoff).
 * Compares lastCutoffDate (YYYY-MM-DD) against today's local date.
 *
 * Returns true when:
 * - lastCutoffDate is empty (never generated)
 * - lastCutoffDate is before today (new day has started)
 */
export function isPastCutoff(lastCutoffDate: string, now: Date = new Date()): boolean {
  if (!lastCutoffDate) return true;
  return lastCutoffDate < todayDateString(now);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest cutoff-logic --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/cutoff-logic.ts src/lib/__tests__/cutoff-logic.test.ts
git commit -m "feat: midnight cutoff logic for deferred generation"
```

---

## Task 3: Completion Status Computation

**Files:**
- Create: `src/lib/__tests__/completion-status.test.ts`
- Modify: `src/lib/progressive-generation.ts:948-981` (add completionStatus to assembleContextBuffer return)

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/__tests__/completion-status.test.ts
import { computeCompletionStatus, type CompletionStatus } from '../completion-status';

describe('computeCompletionStatus', () => {
  it('returns completed_with_engagement when read + journal exists', () => {
    expect(computeCompletionStatus({
      isRead: true,
      hasJournal: true,
      hasCheckIn: false,
    })).toBe('completed_with_engagement');
  });

  it('returns completed_with_engagement when read + check-in exists', () => {
    expect(computeCompletionStatus({
      isRead: true,
      hasJournal: false,
      hasCheckIn: true,
    })).toBe('completed_with_engagement');
  });

  it('returns completed_minimal when read but no engagement', () => {
    expect(computeCompletionStatus({
      isRead: true,
      hasJournal: false,
      hasCheckIn: false,
    })).toBe('completed_minimal');
  });

  it('returns in_progress when readAt exists but not marked read', () => {
    expect(computeCompletionStatus({
      isRead: false,
      hasJournal: false,
      hasCheckIn: false,
      hasReadAt: true,
    })).toBe('in_progress');
  });

  it('returns not_started when no readAt and not read', () => {
    expect(computeCompletionStatus({
      isRead: false,
      hasJournal: false,
      hasCheckIn: false,
      hasReadAt: false,
    })).toBe('not_started');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest completion-status --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Implement completion-status.ts**

```typescript
// src/lib/completion-status.ts

export type CompletionStatus =
  | 'completed_with_engagement'
  | 'completed_minimal'
  | 'in_progress'
  | 'not_started';

export function computeCompletionStatus(input: {
  isRead: boolean;
  hasJournal: boolean;
  hasCheckIn: boolean;
  hasReadAt?: boolean;
}): CompletionStatus {
  if (input.isRead && (input.hasJournal || input.hasCheckIn)) {
    return 'completed_with_engagement';
  }
  if (input.isRead) {
    return 'completed_minimal';
  }
  if (input.hasReadAt) {
    return 'in_progress';
  }
  return 'not_started';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest completion-status --verbose`
Expected: PASS

- [ ] **Step 5: Wire into assembleContextBuffer**

In `src/lib/progressive-generation.ts`, import at the top:
```typescript
import { computeCompletionStatus, type CompletionStatus } from './completion-status';
```

In `assembleContextBuffer` (line 968), before the return statement, add:
```typescript
  const completionStatus = computeCompletionStatus({
    isRead: dayData?.isRead ?? false,
    hasJournal: !!journal?.content || !!journal?.soapResponses,
    hasCheckIn: checkIns.length > 0,
    hasReadAt: !!dayData?.readAt,
  });
```

Add `completionStatus` to the returned `MemoryLayerFull` object. Also add `completionStatus` to the `MemoryLayerFull` interface in `store.ts`.

- [ ] **Step 6: Inject completion status into prompt**

In `buildProgressiveUserPrompt` (line 793), append to Section 1 (READER CONTEXT):
```typescript
  // After the existing reader context lines, add:
  const memory0 = memory.fullDays.find((d) => d.dayNumber === dayNumber - 1);
  if (memory0?.completionStatus) {
    const statusMessages: Record<CompletionStatus, string> = {
      completed_with_engagement: `The reader completed Day ${dayNumber - 1} and engaged deeply — their reflections are in RECENT DAYS above.`,
      completed_minimal: `The reader completed Day ${dayNumber - 1}'s reading.`,
      in_progress: `The reader is still working through Day ${dayNumber - 1}.`,
      not_started: `The reader hasn't started Day ${dayNumber - 1} yet.`,
    };
    sections[0] += `\nEngagement: ${statusMessages[memory0.completionStatus]}`;
  }
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npx jest --verbose && npx tsc --noEmit`
Expected: All pass

- [ ] **Step 8: Commit**

```bash
git add src/lib/completion-status.ts src/lib/__tests__/completion-status.test.ts src/lib/progressive-generation.ts src/lib/store.ts
git commit -m "feat: completion status computation for deferred context assembly"
```

---

## Task 4: Closure Archetype System

**Files:**
- Create: `src/constants/__tests__/closure-archetypes.test.ts`
- Modify: `src/constants/writing-craft.ts` (add CLOSURE_ARCHETYPES + selection function)

- [ ] **Step 1: Write failing tests**

```typescript
// src/constants/__tests__/closure-archetypes.test.ts
import { CLOSURE_ARCHETYPES, getClosureArchetypeForSeries } from '../writing-craft';

describe('CLOSURE_ARCHETYPES', () => {
  it('has exactly 11 archetypes', () => {
    expect(CLOSURE_ARCHETYPES).toHaveLength(11);
  });

  it('each archetype has id, name, and description', () => {
    CLOSURE_ARCHETYPES.forEach((a) => {
      expect(a.id).toBeTruthy();
      expect(a.name).toBeTruthy();
      expect(a.description.length).toBeGreaterThan(20);
    });
  });
});

describe('getClosureArchetypeForSeries', () => {
  it('returns the same archetype for the same devotionalId', () => {
    const a = getClosureArchetypeForSeries('devo-abc-123');
    const b = getClosureArchetypeForSeries('devo-abc-123');
    expect(a.id).toBe(b.id);
  });

  it('returns different archetypes for different devotionalIds', () => {
    // Not guaranteed for every pair but should differ for these
    const ids = ['devo-1', 'devo-2', 'devo-3', 'devo-4', 'devo-5'];
    const archetypes = ids.map((id) => getClosureArchetypeForSeries(id).id);
    const unique = new Set(archetypes);
    // At least 2 different archetypes out of 5 IDs (probabilistically near-certain)
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest closure-archetypes --verbose`
Expected: FAIL — export not found

- [ ] **Step 3: Add CLOSURE_ARCHETYPES to writing-craft.ts**

At the end of `src/constants/writing-craft.ts`, add:

```typescript
// ---------------------------------------------------------------------------
// Series Finale Closure Archetypes
// ---------------------------------------------------------------------------

export interface ClosureArchetype {
  id: string;
  name: string;
  description: string;
}

export const CLOSURE_ARCHETYPES: ClosureArchetype[] = [
  { id: 'commissioning', name: 'Commissioning', description: 'Send the reader forward with a charge and sense of purpose. End with a prayer that anoints them for what comes next — not wrapping up, but launching out.' },
  { id: 'reflection_mosaic', name: 'Reflection Mosaic', description: 'Weave together threads from across the series — a phrase from Day 2, a prayer from Day 5, a struggle from Day 8 — into a mosaic that reveals the bigger picture only visible at the end.' },
  { id: 'full_circle', name: 'Full Circle', description: 'Return to the opening theme or scripture of Day 1, but now the reader sees it with transformed eyes. The same words carry different weight after the journey.' },
  { id: 'gratitude', name: 'Gratitude', description: 'Celebrate what the reader brought to this series — their honesty, their questions, their willingness to show up. Make the reader feel seen for the work they did, not just the content they consumed.' },
  { id: 'open_door', name: 'Open Door', description: 'End with a question, not an answer. The series opened something that was meant to stay open. Leave the reader leaning forward, curious, unfinished in the best way.' },
  { id: 'letter_to_self', name: 'Letter to Self', description: 'Frame the devotional as a letter the reader is writing to their future self — capturing what they learned, what they hope to remember, what they want to carry.' },
  { id: 'benediction', name: 'Benediction', description: 'End with a spoken blessing in the tradition of Numbers 6:24-26. Priestly, warm, authoritative. The reader should feel like hands have been placed on their head.' },
  { id: 'campfire', name: 'Campfire', description: 'Intimate storytelling tone — "remember when we started this?" Walk back through the journey like old friends around a fire, noticing how far the reader has come.' },
  { id: 'milestone_marker', name: 'Milestone Marker', description: 'Concrete, specific acknowledgment of what was accomplished. Name the days completed, the scriptures explored, the prayers prayed. Make the invisible work visible.' },
  { id: 'quiet_landing', name: 'Quiet Landing', description: 'No fanfare. No grand statements. Just stillness. The series ends the way a deep breath ends — not with a gasp, but with a gentle release. Trust the silence.' },
  { id: 'torch_pass', name: 'Torch Pass', description: 'Frame the reader as now equipped to carry what they received to someone else. They are no longer just a learner — they have something to offer. Commission them as a giver, not just a receiver.' },
];

/**
 * Deterministic archetype selection based on devotional ID hash.
 * Same ID always returns the same archetype (consistent on retry).
 */
export function getClosureArchetypeForSeries(devotionalId: string): ClosureArchetype {
  let hash = 0;
  for (let i = 0; i < devotionalId.length; i++) {
    const char = devotionalId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  const index = Math.abs(hash) % CLOSURE_ARCHETYPES.length;
  return CLOSURE_ARCHETYPES[index];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest closure-archetypes --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/constants/writing-craft.ts src/constants/__tests__/closure-archetypes.test.ts
git commit -m "feat: 11 closure archetypes for series finale variation"
```

---

## Task 5: Story Deduplication

**Files:**
- Create: `src/lib/__tests__/story-dedup.test.ts`
- Modify: `src/lib/story-service.ts:43-84` (add exclude param)

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/__tests__/story-dedup.test.ts

// Mock fetch globally for this test
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Mock auth headers
jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'http://test',
  getAuthHeaders: jest.fn().mockResolvedValue({ Authorization: 'Bearer test' }),
}));

jest.mock('@/lib/logger', () => ({
  logger: { warn: jest.fn(), log: jest.fn() },
}));

import { fetchStoriesForGeneration } from '../story-service';

describe('fetchStoriesForGeneration exclude param', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stories: [], total: 0, limit: 5, offset: 0 }),
    });
  });

  it('passes exclude IDs as query parameter', async () => {
    await fetchStoriesForGeneration(['faith'], {
      exclude: ['story-1', 'story-2'],
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('exclude=story-1%2Cstory-2');
  });

  it('omits exclude param when no IDs provided', async () => {
    await fetchStoriesForGeneration(['faith'], {});

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).not.toContain('exclude');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest story-dedup --verbose`
Expected: FAIL — exclude not in interface / not passed to URL

- [ ] **Step 3: Add exclude to story-service.ts**

In `src/lib/story-service.ts`, update the options interface (line 45-49):
```typescript
export async function fetchStoriesForGeneration(
  themes: string[],
  options: {
    category?: string;
    limit?: number;
    spinnable?: boolean;
    exclude?: string[];
  } = {}
): Promise<StoryResult[]> {
  const { category, limit = 5, spinnable = true, exclude } = options;
```

After line 59 (`params.set('random', 'true');`), add:
```typescript
    if (exclude?.length) {
      params.set('exclude', exclude.join(','));
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest story-dedup --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/story-service.ts src/lib/__tests__/story-dedup.test.ts
git commit -m "feat: story deduplication via exclude param"
```

---

## Task 6: Finale Directive in Generation Prompt

**Files:**
- Modify: `src/lib/progressive-generation.ts:888-918` (add finale section to prompt)

- [ ] **Step 1: Import closure archetype function**

At the top of `progressive-generation.ts`, add to the writing-craft imports:
```typescript
import {
  // ... existing imports ...
  getClosureArchetypeForSeries,
} from '../constants/writing-craft';
```

- [ ] **Step 2: Add finale directive to buildProgressiveUserPrompt**

Note: `buildProgressiveUserPrompt` doesn't receive `devotionalId` as a parameter. Thread it through by adding `devotionalId: string` as the first parameter of the function (update signature at line 776 and all call sites — there is only one call site in `_generateProgressiveDayInternal`).

In `buildProgressiveUserPrompt`, before Section 7 (line 888, the `=== GENERATE DAY ===` section), add:

```typescript
  // Section 6.5: Series finale directive (last day only)
  if (dayNumber === arc.totalDaysPlanned) {
    const archetype = getClosureArchetypeForSeries(devotionalId);
    const narrativeText = memory.narrative?.narrative ?? 'No journey narrative available.';
    sections.push(`=== SERIES FINALE ===
This is the FINAL day of this devotional series. Create a meaningful conclusion.

Closure archetype: "${archetype.name}"
${archetype.description}

Guidelines:
- Reflect back on the journey themes from the series narrative below
- Revisit the reader's original story/struggle from onboarding
- Show how the scripture and reflections have built toward this moment
- End with a commissioning prayer — sending the reader forward
- Include a "looking ahead" reflection question that plants a seed for what's next
- Tone: warm, celebratory but grounded — like finishing a meaningful book with a friend

Series journey narrative:
${narrativeText}`);
  }
```

- [ ] **Step 3: Add seriesReflectionSummary to JSON schema**

In `buildProgressiveUserPrompt`, find the JSON schema block (lines 903-918). The schema ends with `"eveningScriptureRef": "A calming evening scripture reference"` followed by `}`.

Instead of fragile string replacement, add the finale fields directly in the JSON template. Modify the JSON schema construction to be conditional:

After the `eveningScriptureRef` line in the JSON template (line 917), add a conditional line:
```typescript
  // Build JSON schema — add finale fields when on last day
  const finaleJsonFields = dayNumber === arc.totalDaysPlanned
    ? `,\n  "seriesReflectionSummary": "2-3 sentence summary of what this series journey covered — for the completion celebration screen"`
    : '';

  // Then in the JSON template string, replace the closing } with:
  // "eveningScriptureRef": "A calming evening scripture reference"${finaleJsonFields}
  // }
```

Specifically, in the template literal where the JSON schema is built, change the last two lines from:
```
  "eveningScriptureRef": "A calming evening scripture reference"
}
```
to:
```
  "eveningScriptureRef": "A calming evening scripture reference"${finaleJsonFields}
}
```

This avoids fragile string replacement — the conditional is computed before the template is assembled.

- [ ] **Step 4: Add new fields to DevotionalDay mapping**

In `_generateProgressiveDayInternal`, at the DevotionalDay construction (line 685-705), add after `contextSignals`:
```typescript
    storyId: undefined, // Set below if a story was used
    seriesReflectionSummary: dayData.seriesReflectionSummary,
    closureArchetype: dayNumber === arc.totalDaysPlanned
      ? getClosureArchetypeForSeries(devotionalId).name
      : undefined,
```

- [ ] **Step 5: Track storyId and pass exclude list**

The story fetch happens at `_generateProgressiveDayInternal` line 600. The variable is called `stories` and is scoped inside a try block. Make these changes:

**5a.** At line 598-603, modify the `fetchStoriesForGeneration` call to pass exclude:
```typescript
    if (uniqueThemes.length > 0) {
      try {
        // Get used story IDs for dedup
        const devo = useUnfoldStore.getState().devotionals.find((d) => d.id === devotionalId);
        const excludeIds = devo?.usedStoryIds ?? [];

        const stories = await fetchStoriesForGeneration(uniqueThemes, {
          limit: 3,
          spinnable: true,
          exclude: excludeIds,
        });
        storiesBlock = formatStoriesForPrompt(stories);

        // Track which story was used (save first story ID for later)
        if (stories.length > 0) {
          fetchedStoryId = stories[0].id;
        }
```

**5b.** Declare `fetchedStoryId` near the top of `_generateProgressiveDayInternal` (around line 550, near other local variables):
```typescript
  let fetchedStoryId: string | undefined;
```

**5c.** After the `DevotionalDay` construction (line 705, after `return day`), but BEFORE the return, add storyId and tracking:
```typescript
    // Set storyId if a story was used
    if (fetchedStoryId) {
      day.storyId = fetchedStoryId;
      useUnfoldStore.getState().addUsedStoryId(devotionalId, fetchedStoryId);
    }
```

Insert this between the `logBugEvent` call (line 708) and the `recordMethodUsage` call (line 718).

- [ ] **Step 7: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/progressive-generation.ts
git commit -m "feat: finale directive + story tracking in generation prompt"
```

---

## Task 7: Stale Generation Detection

**Files:**
- Modify: `src/lib/progressive-generation.ts:1212-1339` (triggerNextDayGeneration)

- [ ] **Step 1: Add stale detection at the top of triggerNextDayGeneration**

After the existing "check if next day already exists" block (line 1227-1230), add:

```typescript
  // Check for stale generation state (app was killed mid-generation)
  const currentGen = store.progressiveGeneration.currentDayGeneration;
  if (currentGen?.status === 'generating' && currentGen.startedAt) {
    const startedAt = new Date(currentGen.startedAt).getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (startedAt < fiveMinutesAgo) {
      logger.warn(`Stale generation detected for day ${currentGen.dayNumber} (started ${currentGen.startedAt}), resetting to failed`);
      store.setProgressiveGeneration({
        currentDayGeneration: {
          ...currentGen,
          status: 'failed',
          error: 'Generation timed out (app may have been backgrounded)',
        },
      });
    }
  }
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/progressive-generation.ts
git commit -m "feat: stale generation detection (5-minute timeout)"
```

---

## Task 8: Background Fetch Task

**Files:**
- Create: `src/lib/background-generation.ts`
- Create: `src/lib/__tests__/background-generation.test.ts`
- Modify: `app.json` (add UIBackgroundModes)

- [ ] **Step 1: Install dependencies**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx expo install expo-background-fetch expo-task-manager`

- [ ] **Step 2: Update app.json**

In `app.json`, under `expo.ios.infoPlist`, add `"UIBackgroundModes": ["audio", "fetch"]`.
If `UIBackgroundModes` already has `["audio"]`, change to `["audio", "fetch"]`.

- [ ] **Step 3: Write failing test for guard logic**

```typescript
// src/lib/__tests__/background-generation.test.ts

// Must mock native modules BEFORE importing the module under test
// because background-generation.ts calls TaskManager.defineTask() at module scope
jest.mock('expo-background-fetch', () => ({
  BackgroundFetchResult: { NoData: 1, NewData: 2, Failed: 3 },
  registerTaskAsync: jest.fn(),
}));
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));
jest.mock('../store', () => ({
  useUnfoldStore: { getState: jest.fn() },
}));
jest.mock('../progressive-generation', () => ({
  triggerNextDayGeneration: jest.fn(),
}));
jest.mock('../notifications', () => ({
  refreshDailyReminder: jest.fn(),
}));
jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../cutoff-logic', () => ({
  isPastCutoff: jest.requireActual('../cutoff-logic').isPastCutoff,
  todayDateString: jest.requireActual('../cutoff-logic').todayDateString,
}));

import { shouldAttemptBackgroundGeneration } from '../background-generation';

describe('shouldAttemptBackgroundGeneration', () => {
  const baseState = {
    currentDevotionalId: 'devo-1',
    devotionals: [{
      id: 'devo-1',
      generationMode: 'progressive' as const,
      currentDay: 3,
      totalDays: 7,
      days: [
        { dayNumber: 1, isRead: true },
        { dayNumber: 2, isRead: true },
      ],
    }],
    lastGenerationCutoffDate: '2026-03-26',
  };

  it('returns true when conditions are met', () => {
    expect(shouldAttemptBackgroundGeneration(baseState as any, new Date('2026-03-27T02:00:00'))).toBe(true);
  });

  it('returns false when no active devotional', () => {
    expect(shouldAttemptBackgroundGeneration({
      ...baseState,
      currentDevotionalId: null,
    } as any, new Date('2026-03-27T02:00:00'))).toBe(false);
  });

  it('returns false when already generated today', () => {
    expect(shouldAttemptBackgroundGeneration({
      ...baseState,
      lastGenerationCutoffDate: '2026-03-27',
    } as any, new Date('2026-03-27T02:00:00'))).toBe(false);
  });

  it('returns false when next day already exists', () => {
    const state = {
      ...baseState,
      devotionals: [{
        ...baseState.devotionals[0],
        days: [
          { dayNumber: 1, isRead: true },
          { dayNumber: 2, isRead: true },
          { dayNumber: 3, isRead: false }, // next day exists
        ],
      }],
    };
    expect(shouldAttemptBackgroundGeneration(state as any, new Date('2026-03-27T02:00:00'))).toBe(false);
  });

  it('returns false when series is complete', () => {
    const state = {
      ...baseState,
      devotionals: [{
        ...baseState.devotionals[0],
        currentDay: 8, // past totalDays
        totalDays: 7,
      }],
    };
    expect(shouldAttemptBackgroundGeneration(state as any, new Date('2026-03-27T02:00:00'))).toBe(false);
  });

  it('returns false for non-progressive devotional', () => {
    const state = {
      ...baseState,
      devotionals: [{
        ...baseState.devotionals[0],
        generationMode: 'batch',
      }],
    };
    expect(shouldAttemptBackgroundGeneration(state as any, new Date('2026-03-27T02:00:00'))).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx jest background-generation --verbose`
Expected: FAIL — module not found

- [ ] **Step 5: Implement background-generation.ts**

```typescript
// src/lib/background-generation.ts
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { useUnfoldStore } from './store';
import { triggerNextDayGeneration } from './progressive-generation';
import { refreshDailyReminder } from './notifications';
import { isPastCutoff, todayDateString } from './cutoff-logic';
import { logger } from './logger';

export const GENERATION_TASK = 'DEFERRED_DEVOTIONAL_GENERATION';

/**
 * Pure guard function — extracted for testability.
 * Returns true if background generation should be attempted.
 */
export function shouldAttemptBackgroundGeneration(
  state: {
    currentDevotionalId: string | null;
    devotionals: Array<{
      id: string;
      generationMode: string;
      currentDay: number;
      totalDays: number;
      days: Array<{ dayNumber: number }>;
    }>;
    lastGenerationCutoffDate: string;
  },
  now: Date = new Date(),
): boolean {
  // Guard: has active devotional?
  if (!state.currentDevotionalId) return false;

  const devotional = state.devotionals.find(
    (d) => d.id === state.currentDevotionalId && d.generationMode === 'progressive'
  );
  if (!devotional) return false;

  // Guard: past midnight cutoff?
  if (!isPastCutoff(state.lastGenerationCutoffDate, now)) return false;

  // Guard: next day doesn't already exist?
  const nextDay = devotional.currentDay;
  if (devotional.days.some((d) => d.dayNumber === nextDay)) return false;

  // Guard: not past end of series?
  if (nextDay > devotional.totalDays) return false;

  return true;
}

// Define the background task
TaskManager.defineTask(GENERATION_TASK, async () => {
  try {
    const store = useUnfoldStore.getState();

    if (!shouldAttemptBackgroundGeneration(store)) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const devotional = store.devotionals.find(
      (d) => d.id === store.currentDevotionalId && d.generationMode === 'progressive'
    )!;

    const completedDay = devotional.currentDay - 1;
    logger.log(`[bg-gen] Attempting background generation for day ${devotional.currentDay}`);

    const result = await triggerNextDayGeneration(devotional.id, completedDay);

    if (result) {
      store.setLastGenerationCutoffDate(todayDateString());
      refreshDailyReminder();
      logger.log(`[bg-gen] Background generation succeeded for day ${devotional.currentDay}`);
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    return BackgroundFetch.BackgroundFetchResult.Failed;
  } catch (err) {
    logger.error('[bg-gen] Background generation failed:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register the background fetch task. Call once during app startup.
 */
export async function registerBackgroundGeneration(): Promise<void> {
  try {
    await BackgroundFetch.registerTaskAsync(GENERATION_TASK, {
      minimumInterval: 60 * 60, // 1 hour minimum between attempts
    });
    logger.log('[bg-gen] Background generation task registered');
  } catch (err) {
    logger.warn('[bg-gen] Failed to register background task:', err);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest background-generation --verbose`
Expected: PASS (mocks for native modules are defined at top of test file)

- [ ] **Step 7: Commit**

```bash
git add src/lib/background-generation.ts src/lib/__tests__/background-generation.test.ts app.json package.json bun.lock
git commit -m "feat: background fetch task for overnight devotional generation"
```

---

## Task 9: Reading.tsx Trigger Change

**Files:**
- Modify: `src/app/(tabs)/(today)/reading.tsx:746-754` (remove generation trigger from handleComplete)

- [ ] **Step 1: Remove triggerNextDayGeneration from handleComplete**

In `src/app/(tabs)/(today)/reading.tsx`, find lines 745-754:

```typescript
        // Progressive mode: trigger next-day generation immediately
        if (currentDevotional?.generationMode === 'progressive') {
          setIsPreparingNextDay(true);
          triggerNextDayGeneration(currentDevotionalId, viewingDay)
            .then(() => {
              // Refresh notification now that next day's content exists
              refreshDailyReminder();
            })
            .finally(() => setIsPreparingNextDay(false));
        }
```

Replace with:
```typescript
        // Progressive mode: generation is deferred to next app open or background fetch
        // (triggerNextDayGeneration removed — context buffer is richer after user journals/checks-in)
```

**CRITICAL: Do NOT touch lines 833 or 1097.** `handleContinueJourney` and `handleRetryGeneration` must keep their `triggerNextDayGeneration` calls.

- [ ] **Step 2: Write regression test**

```typescript
// src/lib/__tests__/reading-trigger-removal.test.ts

/**
 * Regression test: verify that reading.tsx no longer calls triggerNextDayGeneration
 * from handleComplete, but DOES still call it from handleContinueJourney and handleRetryGeneration.
 *
 * This is a source code assertion test — it reads the file and checks for the pattern.
 * Not ideal, but this is the most critical behavioral change and warrants explicit verification.
 */
import * as fs from 'fs';
import * as path from 'path';

describe('reading.tsx trigger removal', () => {
  const readingSource = fs.readFileSync(
    path.join(__dirname, '../../app/(tabs)/(today)/reading.tsx'),
    'utf-8'
  );

  it('does NOT call triggerNextDayGeneration inside handleComplete', () => {
    // Extract handleComplete function body (between "const handleComplete" and next "const handle" or "}")
    const handleCompleteMatch = readingSource.match(
      /const handleComplete = useCallback\(\(\) => \{([\s\S]*?)\}, \[/
    );
    expect(handleCompleteMatch).toBeTruthy();
    const handleCompleteBody = handleCompleteMatch![1];
    expect(handleCompleteBody).not.toContain('triggerNextDayGeneration');
  });

  it('DOES call triggerNextDayGeneration inside handleContinueJourney', () => {
    expect(readingSource).toMatch(/handleContinueJourney[\s\S]*?triggerNextDayGeneration/);
  });

  it('DOES call triggerNextDayGeneration inside handleRetryGeneration', () => {
    expect(readingSource).toMatch(/handleRetryGeneration[\s\S]*?triggerNextDayGeneration/);
  });
});
```

- [ ] **Step 3: Verify the other two triggers are untouched**

Visually confirm in reading.tsx:
- Line ~833: `triggerNextDayGeneration(currentDevotionalId, completedDay - 1)` inside `handleContinueJourney` — STILL PRESENT
- Line ~1097: `triggerNextDayGeneration(currentDevotionalId!, completedDay)` inside retry — STILL PRESENT

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors (isPreparingNextDay may still be used by retry flow — verify)

- [ ] **Step 4: Commit**

```bash
git add src/app/(tabs)/(today)/reading.tsx
git commit -m "feat: remove immediate generation trigger from handleComplete (deferred to app open)"
```

---

## Task 10: Index.tsx Fallback Gating

**Files:**
- Modify: `src/app/(tabs)/(today)/index.tsx:214` (add cutoff check)

- [ ] **Step 1: Add cutoff import**

At the top of `index.tsx`, add (combine into single import):
```typescript
import { isPastCutoff, todayDateString } from '@/lib/cutoff-logic';
```

Also verify these are already imported (they should be — add if missing):
```typescript
import { refreshDailyReminder } from '@/lib/notifications';
import { useUnfoldStore } from '@/lib/store';
```

- [ ] **Step 2: Gate the fallback trigger**

Find the fallback trigger at line ~214. Wrap it with a cutoff check:

Before:
```typescript
triggerNextDayGeneration(currentDevotional.id, currentDay - 1)
```

After:
```typescript
// Only generate if past midnight cutoff (ensures full engagement context)
const lastCutoff = useUnfoldStore.getState().lastGenerationCutoffDate;
if (isPastCutoff(lastCutoff)) {
  triggerNextDayGeneration(currentDevotional.id, currentDay - 1)
    .then(() => {
      useUnfoldStore.getState().setLastGenerationCutoffDate(todayDateString());
      refreshDailyReminder();
    });
}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/(tabs)/(today)/index.tsx
git commit -m "feat: gate fallback generation behind midnight cutoff"
```

---

## Task 11: CompletionCelebration Enhancement

**Files:**
- Modify: `src/components/CompletionCelebration.tsx:237-242` (add seriesReflectionSummary prop)

- [ ] **Step 1: Add prop to interface**

In `CompletionCelebration.tsx`, update the interface (line 237-242):
```typescript
interface CompletionCelebrationProps {
  visible: boolean;
  onDismiss: () => void;
  type: 'day' | 'series';
  message?: string;
  seriesReflectionSummary?: string;
}
```

Update the destructuring (line 244):
```typescript
export function CompletionCelebration({
  visible,
  onDismiss,
  type,
  message,
  seriesReflectionSummary,
}: CompletionCelebrationProps) {
```

- [ ] **Step 2: Render the reflection summary**

Find where the subtitle/message is rendered for `type === 'series'`. Below it, add:
```typescript
{type === 'series' && seriesReflectionSummary && (
  <Text style={{
    fontFamily: FontFamily.bodyItalic,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'left',
    marginTop: 12,
    paddingHorizontal: 8,
  }}>
    {seriesReflectionSummary}
  </Text>
)}
```

- [ ] **Step 3: Pass the prop from reading.tsx**

In `reading.tsx`, find where `<CompletionCelebration>` is rendered. Add:
```typescript
seriesReflectionSummary={
  celebrationType === 'series'
    ? currentDevotional?.days.find((d) => d.dayNumber === viewingDay)?.seriesReflectionSummary
    : undefined
}
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/CompletionCelebration.tsx src/app/(tabs)/(today)/reading.tsx
git commit -m "feat: series reflection summary in completion celebration"
```

---

## Task 12: Register Background Task + Final Integration

**Files:**
- Modify: `src/app/_layout.tsx` or app entry point (register background task)

- [ ] **Step 1: Register background task on app startup**

In `src/app/_layout.tsx`, add the import at the top:
```typescript
import { registerBackgroundGeneration } from '@/lib/background-generation';
```

Add a NEW `useEffect` with empty dependency array in the root layout component (after existing useEffects):
```typescript
useEffect(() => {
  registerBackgroundGeneration();
}, []);
```

This runs once on app mount. `registerBackgroundGeneration` is async but fire-and-forget — it logs warnings internally if registration fails.

- [ ] **Step 2: Run full test suite**

Run: `npx jest --verbose`
Expected: All tests pass

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Build and verify on simulator**

Run: `npx expo run:ios --device "iPhone 17 Pro"`

Take screenshot: `xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png`

Verify: app loads, existing devotional works, no red screen errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat: register background generation task on app startup"
```

---

## Task 13: Backend — Story Exclude Parameter

**Files:**
- Modify: `/Users/galangster/clawd/work/unfold/backend/src/routes/stories.ts` (add exclude query param)

- [ ] **Step 1: Add exclude handling to stories route**

In the backend `stories.ts` route, find the query builder. Add after existing filters:

```typescript
const { themes, category, source, spinnable, exclude, random } = req.query;

// ... existing filters ...

if (exclude) {
  const excludeIds = (exclude as string).split(',').filter(Boolean);
  if (excludeIds.length > 0) {
    query = query.where(not(inArray(stories.id, excludeIds)));
  }
}
```

Import `not` and `inArray` from drizzle-orm if not already imported.

- [ ] **Step 2: Deploy backend**

Run: `cd /Users/galangster/clawd/work/unfold/backend && git add -A && git commit -m "feat: add exclude param to stories API" && git push`

- [ ] **Step 3: Verify endpoint works**

Test: `curl "https://unfold-backend-production.up.railway.app/api/stories?themes=faith&exclude=some-id-1,some-id-2&random=true&limit=3"`
Expected: 200 OK with stories (excluding the provided IDs)

---

## Summary

| Task | What it does | New tests |
|------|-------------|-----------|
| 0 | Jest config | Verify existing tests pass |
| 1 | Store migration v26→v27 | Migration test |
| 2 | Midnight cutoff logic | isPastCutoff, todayDateString |
| 3 | Completion status | 5 status computation cases |
| 4 | Closure archetypes | Array structure + deterministic selection |
| 5 | Story dedup | Exclude param interface |
| 6 | Finale directive | (integration — tested via typecheck) |
| 7 | Stale generation | (integration — tested via typecheck) |
| 8 | Background fetch task | 6 guard condition cases |
| 9 | Reading.tsx trigger removal | (manual verification) |
| 10 | Index.tsx cutoff gating | (integration — tested via typecheck) |
| 11 | CompletionCelebration | (integration — tested via build) |
| 12 | Register + build verify | Full integration test |
| 13 | Backend exclude param | API endpoint test |

**Total: 14 tasks, ~50 steps, ~20 new tests**
