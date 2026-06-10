# Plan 01 — Streak engine unification + journal entry fixes

**Repo:** Unfold mobile app (`unfold-app`).
**Base commit:** `9f36ef6` (`origin/main`, build 218 source). The audit worktree at
`/Users/galangster/clawd/work/unfold-audit` has audit-notes commits on top, but `git diff --stat 9f36ef6 HEAD -- src/` is
EMPTY — `src/` is byte-identical to base. Work on a fresh branch off `9f36ef6`.
**Findings covered:** COR-1 (P1), COR-2 (P1), COR-5 (P1), COR-3 (P2), COR-6 (P2), COR-11 (P2).
**Folded-in extras (cheap, same files):** third streak-logic twin in `usePremiumNudge.ts` unified onto the shared
helper; duplicate `getWeekStart` in `store.ts` deleted in favor of the `streak-helpers` export.
**Explicitly out of scope:** COR-4, COR-7, COR-8, COR-9, COR-10 (see §6).

**Dependency order:**
1. Fix 1 (streak engine — `streak-helpers.ts`, `store.ts`, `usePremiumNudge.ts`) — independent.
2. Fix 2 (journal TDZ — `journal.tsx`, new `journal-entry-state.ts`) — do BEFORE Fix 3.
3. Fix 3 (SOAP flush — same `journal.tsx`) — depends on Fix 2's new lib module and its hoisted anchors.

**Estimated risk:** Medium for Fix 1 (user-visible streak semantics change — that change IS the fix; mitigated by
table-driven tests + a paths-agree property test). Low for Fixes 2–3 (pure reordering + guard removal).

**Verified baselines at base commit (executor: re-run these FIRST; if they don't match, STOP and report):**

```
npm run typecheck      # exits 0, no output after the tsc banner
npx jest               # Test Suites: 91 passed, 91 total / Tests: 609 passed, 609 total
npm run lint           # ✖ 3415 problems (0 errors, 3415 warnings)
```

**General conventions (read before editing):**
- TypeScript, 2-space indent, single quotes, semicolons, trailing commas in multiline literals.
- Pure logic lives in small `src/lib/*.ts` modules with tests in `src/lib/__tests__/*.test.ts`
  (see `src/lib/streak-helpers.ts`, `src/lib/journal-freewrite-placeholder.ts`, `src/lib/home-devotional-state.ts`).
- Lib modules import store types as `import type { ... } from '@/lib/store';` (alias `@/` → `src/`).
- Tests use plain `describe`/`it`/`expect` (jest, `@react-native/jest-preset`); no test renderer needed here.
- Do NOT add dependencies. Do NOT touch the store persist `version: 37` or `store-migrations.ts` — no new
  persisted fields are introduced by this plan.

---

## PRODUCT DECISIONS (flagged for Nick — plan is written for the recommended options)

### Decision 1 — Lapse-forgiveness model (drives COR-1 + COR-2)

Today the engine forgives unbounded lapses (a 6-month absence continues a 50-day streak) while burning premium
freezes on free-forgiven weekend gaps. A correct engine needs an explicit rule. Options:

- **Option A (RECOMMENDED, plan implements this):** Weekend days in the gap are free (amnesty, existing toggle).
  The weekly grace day covers **one** missed weekday per week, for everyone, at no cost — consulted first. Each
  freeze (premium only) covers **one** additional missed weekday. If the whole gap is covered, the streak
  continues (costs applied only when the user actually reads); otherwise it resets. Long lapses now reset; a
  hoarder with N freezes can bridge N+1 missed weekdays — freezes behave as earned currency.
- Option B: one freeze bridges an entire gap of any length. Rejected: premium streaks would still never reset
  (re-introduces COR-1 for premium).
- Option C: coverage hard-capped at grace + 1 freeze (max 2 missed weekdays bridged, ever). Simpler mental model,
  harsher for freeze hoarders.

Consequence of A worth stating plainly: a free user who misses two single, non-adjacent weekdays in the same week
still resets on the second miss (1 grace/week). That matches the original "grace day" copy and design intent.

### Decision 2 — Freeze earning after a reset (COR-3)

Today earning is deduped against all-time `streakLongest`, so a user rebuilding after losing a 49-day streak earns
nothing until day 56 while the "Till Freeze" countdown promises otherwise.

- **Option A (RECOMMENDED, plan implements this):** delete the `streakLongest` dedupe — earn a freeze at every
  7-day milestone of the **current** streak. No new state, no migration. Double-earn is impossible: the streak
  value passes each multiple of 7 exactly once per build (same-day reads are no-ops; resets restart from 1).
- Option B: persist an explicit `lastFreezeEarnedAtStreak` field, reset on streak reset. Equivalent behavior but
  requires a new persisted field + migration v38 + reset bookkeeping on every reset path. Only worth it if some
  future feature writes `streakCurrent` backwards without a reset.

### Decision 3 — Celebration semantics (COR-7/COR-8) — DEFERRED, decide for a future batch

The Today-screen `StreakCelebration` fires on per-current-devotional `hasReadToday` false→true
(`src/app/(tabs)/(today)/index.tsx:340-352`), so switching devotionals re-fires a misleading "+1" and the memo
goes stale across midnight. The shared-helper refactor in this plan does NOT touch that trigger, so these are NOT
naturally fixed here (assessment in §6). Recommended future fix: trigger off `streakLastReadDate` day-flip (the
actual streak truth) — needs a small product call on "celebrate once per day vs once per devotional".

### Behavior notes (not gated, but Nick should know)

- Active reset now keeps the week-rolled grace counter instead of zeroing it, so "reconcile then read" and "read"
  produce identical state (pinned by a test). Net effect: a freshly reset streak may use its weekly grace sooner.
- A `streakLastReadDate` in the future (device clock rolled back) now CONTINUES the streak instead of resetting
  (old code reset). Forgiving is the right behavior for clock skew; pinned by a test.

---

## FIX 1 — One shared streak decision helper; lapses reset; freezes/grace ordered correctly; earning un-suppressed

**Findings:** COR-11 (structural), COR-1, COR-2, COR-3.

### 1.1 Context

The miss/amnesty/freeze/grace decision tree exists in THREE places that must agree but are maintained separately:

1. `src/lib/store.ts:1303-1386` — `recordStreakRead` (active path, runs on reading completion via
   `src/app/(tabs)/(today)/reading.tsx:875`). Untested.
2. `src/lib/streak-helpers.ts:29-105` — `reconcileStreakState` (passive path, runs on hydrate + every foreground
   via `src/hooks/useStreakReconcile.ts`). Thinly tested; its only reset test uses a production-unreachable state.
3. `src/hooks/usePremiumNudge.ts:36-82` — `detectStreakLoss` (already diverged: ignores grace entirely and
   ignores `isPremium` when honoring freezes).

The shared bugs (present in paths 1 and 2; verified excerpts):

`src/lib/store.ts:1348-1365` (inside `recordStreakRead`):
```ts
            const effectiveMissed = daysMissed - missedWeekendDays;

            // Use freeze if available for first missed day (premium only)
            if (effectiveMissed >= 1 && state.streakFreezes > 0 && state.user?.isPremium) {
              newFreezes--;
              newStreak = state.streakCurrent + 1;
            } else if (effectiveMissed === 1) {
              // Just missed yesterday but no freeze - continue
              newStreak = state.streakCurrent + 1;
            } else if (effectiveMissed > 1 && newGraceDays < 1) {
              // Use grace day for extra missed day
              newGraceDays++;
              newStreak = state.streakCurrent + 1;
            } else {
              // Streak broken
              newStreak = 1;
              newGraceDays = 0;
            }
```

`src/lib/streak-helpers.ts:84-88` (inside `reconcileStreakState`):
```ts
  const effectiveMissed = daysMissed - missedWeekendDays;
  const streakWouldContinue =
    (effectiveMissed >= 1 && input.streakFreezes > 0 && input.isPremium) ||
    effectiveMissed === 1 ||
    (effectiveMissed > 1 && nextGraceDays < 1);
```

Why this is broken:

- **COR-1 (never reset):** `daysMissed` is the day-boundary span (`floor((today − lastRead)/24h)` on
  `toDateString()` midnights), so the number of days the user actually skipped is `daysMissed − 1`. The code
  treats `effectiveMissed === 1` (which really means "every in-between day was an amnestied weekend") as "missed
  one day", and the grace branch `effectiveMissed > 1 && grace < 1` has NO upper bound. Grace resets to 0 every
  new week (`isNewWeek` → 0), and any lapse ≥ 1 week necessarily lands in a new week — so a 6-month lapse always
  finds grace available and CONTINUES the streak. The whole streak-loss infrastructure (`streakJustReset`,
  streak-loss nudge) is near-dead.
- **COR-1 (off-by-one, opposite direction):** a single missed weekday yields `effectiveMissed = 2`, silently
  consuming the weekly grace; a free user who misses two single weekdays in one week resets while a user missing
  30 consecutive days does not.
- **COR-2 (freeze burned for free gaps):** the freeze branch is consulted FIRST and fires at
  `effectiveMissed >= 1`. An ordinary Fri→Mon weekend gap computes `daysMissed=3, missedWeekendDays=2,
  effectiveMissed=1` — the exact case the next branch continues at zero cost — so every premium freeze-holder
  burns one freeze per skipped weekend while free users pay nothing.
- **COR-3 (earning suppressed):** `src/lib/store.ts:1368-1376`:
```ts
          // Check if earned a freeze (perfect week = 7 days, streak divisible by 7)
          if (newStreak > 0 && newStreak % 7 === 0) {
            // Check if we already earned for this week
            const lastEarnedStreak = Math.floor((state.streakLongest || 0) / 7) * 7;
            if (newStreak > lastEarnedStreak) {
              const maxFreezes = state.user?.isPremium ? 99 : 0;
              newFreezes = Math.min(newFreezes + 1, maxFreezes);
            }
          }
```
  `streakLongest` never resets, so after losing a 49-day streak the user earns nothing at 7/14/…/49 while the
  "Till Freeze" countdown (`src/app/streak-settings.tsx:158` `7 - (streak % 7)`) counts down to earns that never
  happen.

Also relevant: `store.ts` carries a private duplicate of `getWeekStart` at lines 1955-1963 (identical to the
exported one in `streak-helpers.ts:20-27`) — delete it as part of this fix (vault:
`deterministic-twin-paths-must-share-one-helper`).

Call-site map (verified by grep — do not modify these, they keep working unchanged):
- `recordStreakRead`: `src/app/(tabs)/(today)/reading.tsx:152,875` (+ dep array at 913).
- `reconcileStreakState` (store action): `src/hooks/useStreakReconcile.ts`.
- `streakJustReset` consumers: `src/hooks/usePremiumNudge.ts:95`, `src/lib/nudges.ts:114,126`,
  `src/lib/store.ts:1498` (`clearStreakJustReset`), `src/lib/store.ts:1895`.
- `resetStreakGraceDays` (store.ts:1400-1404) keeps using `getWeekStart` — switch it to the imported one.

### 1.2 Failing tests FIRST

Edit `src/lib/__tests__/streak-helpers.test.ts`. KEEP the three existing tests byte-identical (they remain valid
and must stay green after the refactor — re-derivation: test 1's fixture has `graceUsed=1` in the current week and
one unforgiven missed Friday, which under the new rules is 1 missed weekday with no grace and no freezes → still
reset; tests 2 and 3 are weekend-only and yesterday cases → still continue).

Add these two reconcile-level regression tests inside the existing `describe('streak helpers', ...)` block now,
BEFORE touching implementation, and confirm they FAIL against current code (current code continues the streak in
both — the grace branch fires):

```ts
  it('resets after a multi-weekday gap when the user has no freezes (COR-1)', () => {
    const now = new Date(2026, 5, 12, 12); // Friday Jun 12 2026 (local noon)

    const result = reconcileStreakState(
      {
        streakCurrent: 50,
        streakLastReadDate: new Date(2026, 5, 8, 12).toISOString(), // Monday — Tue/Wed/Thu all missed
        streakGraceDaysUsedThisWeek: 0,
        streakWeekStart: getWeekStart(now).toISOString(),
        streakWeekendAmnesty: true,
        streakFreezes: 0,
        isPremium: false,
        streakJustReset: false,
      },
      now,
    );

    expect(result.streakCurrent).toBe(0);
    expect(result.streakJustReset).toBe(true);
  });

  it('resets after a 6-month lapse (COR-1 headline)', () => {
    const now = new Date(2026, 5, 8, 12); // Monday Jun 8 2026

    const result = reconcileStreakState(
      {
        streakCurrent: 50,
        streakLastReadDate: new Date(2025, 11, 8, 12).toISOString(), // Monday Dec 8 2025
        streakGraceDaysUsedThisWeek: 0,
        streakWeekStart: getWeekStart(new Date(2025, 11, 8, 12)).toISOString(),
        streakWeekendAmnesty: true,
        streakFreezes: 0,
        isPremium: false,
        streakJustReset: false,
      },
      now,
    );

    expect(result.streakCurrent).toBe(0);
    expect(result.streakJustReset).toBe(true);
  });
```

Gate (RED): `npx jest src/lib/__tests__/streak-helpers.test.ts` → `Tests: 2 failed, 3 passed, 5 total`.
If either new test PASSES against unmodified code, STOP — the engine does not behave as the audit found; report.

Note on date construction: use LOCAL constructors (`new Date(2026, 5, 8, 12)`) everywhere in new tests so
day-of-week is correct in any runner timezone. Existing tests use UTC ISO strings — leave them as-is.

### 1.3 Implementation

#### 1.3.1 Replace `src/lib/streak-helpers.ts` with the following full content

Design: ONE pure decision function (`decideStreakContinuation`) consumed by both engine paths and the nudge
detector. The ACTIVE path (`applyStreakRead`) applies costs (grace/freeze consumption, freeze earning); the
PASSIVE path (`reconcileStreakState`, unchanged public signature) only reads the decision and never consumes
anything. Vault rules honored: `deterministic-twin-paths-must-share-one-helper`,
`deterministic-paths-must-receive-now-as-parameter` (both take `now` explicitly),
`invariants-must-hold-on-every-construction-and-update-path` (every result variant carries the week bookkeeping).

```ts
const DAY_MS = 24 * 60 * 60 * 1000;

/** Maximum freezes a premium user can hold (free users cannot hold any). */
export const MAX_FREEZES = 99;

export type StreakDecisionInput = {
  streakCurrent: number;
  streakLastReadDate: string | null;
  streakGraceDaysUsedThisWeek: number;
  streakWeekStart: string | null;
  streakWeekendAmnesty: boolean;
  streakFreezes: number;
  isPremium: boolean;
};

export type ReconcileStreakInput = StreakDecisionInput & {
  streakJustReset: boolean;
};

export type ReconcileStreakResult = Pick<
  ReconcileStreakInput,
  | 'streakCurrent'
  | 'streakGraceDaysUsedThisWeek'
  | 'streakWeekStart'
  | 'streakJustReset'
>;

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type StreakDecisionKind = 'no-streak' | 'same-day' | 'continue' | 'reset';

export type StreakDecision = {
  kind: StreakDecisionKind;
  /** ISO week start (Sunday) at `now`; both engine paths persist this. */
  weekStart: string;
  /** Grace counter after the weekly rollover, BEFORE any consumption by this decision. */
  graceAfterWeekRollover: number;
  /** True when kind === 'continue' and the weekly grace day covers one missed weekday. */
  usedGrace: boolean;
  /** Freezes consumed when kind === 'continue' — one per missed weekday not covered by grace. */
  freezesConsumed: number;
  /** Weekdays strictly between lastRead and now that weekend amnesty did not forgive. */
  missedWeekdays: number;
};

/**
 * Single source of truth for the streak miss/amnesty/grace/freeze decision.
 * Consumed by BOTH engine paths — applyStreakRead (active: applies costs) and
 * reconcileStreakState (passive: display only, never consumes grace/freezes) —
 * and by the premium-nudge streak-loss detector.
 *
 * Rules:
 *  - Reading today or yesterday continues the streak at no cost.
 *  - Saturdays/Sundays in the gap are forgiven when weekend amnesty is on.
 *  - The weekly grace day covers ONE missed weekday per week, for everyone.
 *  - Each freeze (premium only) covers ONE additional missed weekday.
 *  - If the gap cannot be fully covered, the streak resets.
 */
export function decideStreakContinuation(
  input: StreakDecisionInput,
  now = new Date(),
): StreakDecision {
  const weekStart = getWeekStart(now).toISOString();
  const isNewWeek = !input.streakWeekStart || input.streakWeekStart !== weekStart;
  const graceAfterWeekRollover = isNewWeek ? 0 : input.streakGraceDaysUsedThisWeek;

  const base = {
    weekStart,
    graceAfterWeekRollover,
    usedGrace: false,
    freezesConsumed: 0,
    missedWeekdays: 0,
  };

  if (!input.streakLastReadDate) {
    return { ...base, kind: 'no-streak' };
  }

  const today = now.toDateString();
  const lastRead = new Date(input.streakLastReadDate).toDateString();

  // Same-day must win over no-streak so a completed read stays a no-op.
  if (lastRead === today) {
    return { ...base, kind: 'same-day' };
  }

  if (input.streakCurrent === 0) {
    return { ...base, kind: 'no-streak' };
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (lastRead === yesterday.toDateString()) {
    return { ...base, kind: 'continue' };
  }

  const daySpan = Math.floor(
    (new Date(today).getTime() - new Date(lastRead).getTime()) / DAY_MS,
  );

  // Count weekdays strictly between lastRead and today. Weekend amnesty
  // (when enabled) forgives Saturdays/Sundays in the gap. A future lastRead
  // (negative span, device clock rolled back) counts zero missed days.
  let missedWeekdays = 0;
  for (let i = 1; i < daySpan; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (!(input.streakWeekendAmnesty && isWeekend)) {
      missedWeekdays++;
    }
  }

  if (missedWeekdays === 0) {
    return { ...base, kind: 'continue' };
  }

  // Coverage: the free weekly grace day covers one missed weekday; each
  // premium freeze covers one more. The whole gap must be covered to continue.
  const graceCover = graceAfterWeekRollover < 1 ? 1 : 0;
  const freezesAvailable = input.isPremium ? Math.max(0, input.streakFreezes) : 0;
  const freezesNeeded = missedWeekdays - graceCover;

  if (freezesNeeded <= freezesAvailable) {
    return {
      ...base,
      kind: 'continue',
      usedGrace: graceCover === 1,
      freezesConsumed: Math.max(0, freezesNeeded),
      missedWeekdays,
    };
  }

  return { ...base, kind: 'reset', missedWeekdays };
}

export type StreakReadInput = StreakDecisionInput & { streakLongest: number };

export type StreakReadResult = {
  streakLastReadDate: string;
  streakCurrent: number;
  streakLongest: number;
  streakGraceDaysUsedThisWeek: number;
  streakWeekStart: string;
  streakFreezes: number;
};

/**
 * Active engine path: apply a completed reading at `now`.
 * Returns null when the user already read today (caller keeps state as-is).
 * Reset keeps the week-rolled grace counter (not zero) so that running the
 * passive reconcile first and then reading yields identical state to reading
 * directly — the two paths must commute.
 */
export function applyStreakRead(
  input: StreakReadInput,
  now = new Date(),
): StreakReadResult | null {
  const decision = decideStreakContinuation(input, now);

  if (decision.kind === 'same-day') {
    return null;
  }

  let newStreak: number;
  let newGrace: number;
  let newFreezes = input.streakFreezes;

  if (decision.kind === 'reset') {
    newStreak = 1;
    newGrace = decision.graceAfterWeekRollover;
  } else {
    // 'no-streak' and 'continue' both extend by this read.
    newStreak = input.streakCurrent + 1;
    newGrace = decision.graceAfterWeekRollover + (decision.usedGrace ? 1 : 0);
    newFreezes = input.streakFreezes - decision.freezesConsumed;
  }

  // Earn a freeze at every 7-day milestone of the CURRENT streak (premium
  // only — the free cap is 0). No longest-streak dedupe: after a reset the
  // user must be able to earn again while rebuilding (COR-3).
  if (newStreak > 0 && newStreak % 7 === 0) {
    const maxFreezes = input.isPremium ? MAX_FREEZES : 0;
    newFreezes = Math.min(newFreezes + 1, maxFreezes);
  }

  return {
    streakLastReadDate: now.toISOString(),
    streakCurrent: newStreak,
    streakLongest: Math.max(input.streakLongest, newStreak),
    streakGraceDaysUsedThisWeek: newGrace,
    streakWeekStart: decision.weekStart,
    streakFreezes: newFreezes,
  };
}

export function reconcileStreakState(
  input: ReconcileStreakInput,
  now = new Date(),
): ReconcileStreakResult {
  const decision = decideStreakContinuation(input, now);

  if (decision.kind === 'reset') {
    return {
      streakCurrent: 0,
      streakGraceDaysUsedThisWeek: decision.graceAfterWeekRollover,
      streakWeekStart: decision.weekStart,
      streakJustReset: input.streakCurrent > 0,
    };
  }

  // Passive path: never consumes grace or freezes — costs are only applied
  // by applyStreakRead when the user actually reads.
  return {
    streakCurrent: input.streakCurrent,
    streakGraceDaysUsedThisWeek: decision.graceAfterWeekRollover,
    streakWeekStart: decision.weekStart,
    streakJustReset: input.streakJustReset,
  };
}
```

Equivalence check you must understand before proceeding (passive path, old vs new): for non-reset outcomes the old
code returned `nextGraceDays` (the week-rolled value) — the new code returns `decision.graceAfterWeekRollover`,
the same value. For resets the old code ALSO returned `nextGraceDays` (it never zeroed grace on passive reset) —
preserved. The public `ReconcileStreakInput`/`ReconcileStreakResult` types are structurally unchanged.

#### 1.3.2 `src/lib/store.ts` — port the action to the shared helper

(a) Update the import at line 20.

Before:
```ts
import { reconcileStreakState } from './streak-helpers';
```
After:
```ts
import { applyStreakRead, getWeekStart, reconcileStreakState } from './streak-helpers';
```

(b) Replace the ENTIRE `recordStreakRead` action (lines 1302-1386, from the `// Streak actions` comment through
the closing `}),` of `recordStreakRead` — the full current body is the block whose excerpts appear in §1.1; it
begins `recordStreakRead: () =>` and ends with the `return { streakLastReadDate: now.toISOString(), ... };`
object). New body:

```ts
      // Streak actions
      recordStreakRead: () =>
        set((state) => {
          const result = applyStreakRead(
            {
              streakCurrent: state.streakCurrent,
              streakLastReadDate: state.streakLastReadDate,
              streakGraceDaysUsedThisWeek: state.streakGraceDaysUsedThisWeek,
              streakWeekStart: state.streakWeekStart,
              streakWeekendAmnesty: state.streakWeekendAmnesty,
              streakFreezes: state.streakFreezes,
              isPremium: Boolean(state.user?.isPremium),
              streakLongest: state.streakLongest,
            },
            new Date()
          );
          // null = already read today — no change.
          return result ?? state;
        }),
```

Do NOT touch the adjacent `reconcileStreakState` action (store.ts:1387-1399) — it already delegates to the
helper — nor `resetStreakGraceDays`/`toggleWeekendAmnesty` (1400-1408).

(c) Delete the private duplicate `getWeekStart` at the bottom of the file (lines 1955-1963 — the comment
`// Helper function to get the start of the current week (Sunday)` plus the 8-line function). The two remaining
uses (`recordStreakRead` is gone; `resetStreakGraceDays` at 1403) now resolve to the import added in (a).
After this step `grep -n "function getWeekStart" src/lib/store.ts` must return NOTHING.

#### 1.3.3 `src/hooks/usePremiumNudge.ts` — unify the third twin

(a) Delete the entire `detectStreakLoss` function INCLUDING its doc comment (lines 28-82: from
`/**\n * Detect whether the user's streak has effectively been lost.` through the closing `}` after
`return effectiveMissed > 1;`).

(b) Add the import:
```ts
import { decideStreakContinuation } from '@/lib/streak-helpers';
```

(c) Add the missing selectors next to the existing streak selectors (after line 94
`const streakFreezes = useUnfoldStore((s) => s.streakFreezes);`):
```ts
  const streakGraceDaysUsedThisWeek = useUnfoldStore((s) => s.streakGraceDaysUsedThisWeek);
  const streakWeekStart = useUnfoldStore((s) => s.streakWeekStart);
  const isPremiumUser = useUnfoldStore((s) => Boolean(s.user?.isPremium));
```
(`isPremiumUser` deliberately mirrors the engine's `Boolean(state.user?.isPremium)` rather than the hook's
RevenueCat-policy-based `shouldSuppressPremiumNudges` — the detector must predict what the ENGINE will do.)

(d) Replace the `streakJustReset` memo. Before (lines 116-120):
```ts
  // Detect streak loss
  const streakJustReset = useMemo(
    () => streakJustResetFlag || detectStreakLoss(streakCurrent, streakLastReadDate, streakWeekendAmnesty, streakFreezes),
    [streakJustResetFlag, streakCurrent, streakLastReadDate, streakWeekendAmnesty, streakFreezes]
  );
```
After:
```ts
  // Detect streak loss — same decision helper as the engine, so the nudge
  // can never disagree with what recordStreakRead/reconcileStreakState do.
  const streakJustReset = useMemo(
    () =>
      streakJustResetFlag ||
      decideStreakContinuation({
        streakCurrent,
        streakLastReadDate,
        streakGraceDaysUsedThisWeek,
        streakWeekStart,
        streakWeekendAmnesty,
        streakFreezes,
        isPremium: isPremiumUser,
      }).kind === 'reset',
    [streakJustResetFlag, streakCurrent, streakLastReadDate, streakGraceDaysUsedThisWeek, streakWeekStart, streakWeekendAmnesty, streakFreezes, isPremiumUser]
  );
```
(`kind === 'reset'` only occurs for `streakCurrent > 0`, so the old `streakCurrent === 0 → false` early-out is
preserved by construction.)

### 1.4 Table-driven tests for the full matrix (GREEN phase)

Append to `src/lib/__tests__/streak-helpers.test.ts` (after the existing `describe('streak helpers', ...)`
block). Update the import line to:

```ts
import {
  applyStreakRead,
  decideStreakContinuation,
  getWeekStart,
  reconcileStreakState,
  type StreakDecisionInput,
} from '../streak-helpers';
```

Calendar facts used below (verify once against any calendar before writing — vault:
`compute-test-expected-values-by-formula-not-intuition`): June 2026: 1=Mon, 4=Thu, 5=Fri, 6=Sat, 7=Sun, 8=Mon,
9=Tue, 10=Wed, 11=Thu, 12=Fri, 13=Sat, 14=Sun, 15=Mon. March 2026: 6=Fri, 8=Sun (US spring-forward). Oct 30
2026=Fri, Nov 1 2026=Sun (US fall-back), Nov 2=Mon. Dec 8 2025=Mon. Expected `missedWeekdays` for each row is
the hand-count of Mon–Fri dates STRICTLY between lastRead and now, written in the comment.

```ts
describe('decideStreakContinuation', () => {
  const at = (y: number, m1: number, d: number) => new Date(y, m1 - 1, d, 12, 0, 0);
  const iso = (y: number, m1: number, d: number) => at(y, m1, d).toISOString();

  const base = (now: Date, over: Partial<StreakDecisionInput> = {}): StreakDecisionInput => ({
    streakCurrent: 10,
    streakLastReadDate: null,
    streakGraceDaysUsedThisWeek: 0,
    streakWeekStart: getWeekStart(now).toISOString(),
    streakWeekendAmnesty: true,
    streakFreezes: 0,
    isPremium: false,
    ...over,
  });

  it('returns same-day when last read is today', () => {
    const now = at(2026, 6, 10); // Wed
    const d = decideStreakContinuation(base(now, { streakLastReadDate: iso(2026, 6, 10) }), now);
    expect(d.kind).toBe('same-day');
    expect(d.freezesConsumed).toBe(0);
  });

  it('continues at no cost when last read was yesterday', () => {
    const now = at(2026, 6, 10); // Wed; lastRead Tue 9
    const d = decideStreakContinuation(base(now, { streakLastReadDate: iso(2026, 6, 9) }), now);
    expect(d).toMatchObject({ kind: 'continue', usedGrace: false, freezesConsumed: 0, missedWeekdays: 0 });
  });

  it('returns no-streak when streakCurrent is 0', () => {
    const now = at(2026, 6, 10);
    const d = decideStreakContinuation(
      base(now, { streakCurrent: 0, streakLastReadDate: iso(2026, 6, 1) }),
      now,
    );
    expect(d.kind).toBe('no-streak');
  });

  it('returns no-streak when there is no last read date', () => {
    const now = at(2026, 6, 10);
    expect(decideStreakContinuation(base(now), now).kind).toBe('no-streak');
  });

  it('weekend-only gap continues free — no freeze burn even for premium holders (COR-2)', () => {
    const now = at(2026, 6, 15); // Mon; lastRead Fri 12; between = {Sat 13, Sun 14} → 0 missed weekdays
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2026, 6, 12),
        streakWeekStart: getWeekStart(at(2026, 6, 12)).toISOString(), // previous week
        streakFreezes: 3,
        isPremium: true,
      }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: false, freezesConsumed: 0, missedWeekdays: 0 });
  });

  it('weekend gap with amnesty OFF: 2 missed days — grace covers 1, free user resets', () => {
    const now = at(2026, 6, 15); // between = {Sat 13, Sun 14} → 2 missed (no amnesty)
    const d = decideStreakContinuation(
      base(now, { streakLastReadDate: iso(2026, 6, 12), streakWeekendAmnesty: false }),
      now,
    );
    expect(d.kind).toBe('reset');
    expect(d.missedWeekdays).toBe(2);
  });

  it('weekend gap with amnesty OFF: premium with 1 freeze continues (grace + 1 freeze)', () => {
    const now = at(2026, 6, 15);
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2026, 6, 12),
        streakWeekendAmnesty: false,
        streakFreezes: 1,
        isPremium: true,
      }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: true, freezesConsumed: 1, missedWeekdays: 2 });
  });

  it('single missed weekday uses grace BEFORE freezes (COR-2 ordering)', () => {
    const now = at(2026, 6, 10); // Wed; lastRead Mon 8; between = {Tue 9} → 1 missed
    const d = decideStreakContinuation(
      base(now, { streakLastReadDate: iso(2026, 6, 8), streakFreezes: 5, isPremium: true }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: true, freezesConsumed: 0, missedWeekdays: 1 });
  });

  it('single missed weekday with grace already used: free user resets (1 grace/week)', () => {
    const now = at(2026, 6, 10);
    const d = decideStreakContinuation(
      base(now, { streakLastReadDate: iso(2026, 6, 8), streakGraceDaysUsedThisWeek: 1 }),
      now,
    );
    expect(d.kind).toBe('reset');
  });

  it('single missed weekday with grace already used: premium burns exactly one freeze', () => {
    const now = at(2026, 6, 10);
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2026, 6, 8),
        streakGraceDaysUsedThisWeek: 1,
        streakFreezes: 1,
        isPremium: true,
      }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: false, freezesConsumed: 1, missedWeekdays: 1 });
  });

  it('three missed weekdays reset a free user even with fresh grace (COR-1)', () => {
    const now = at(2026, 6, 12); // Fri; lastRead Mon 8; between = {Tue 9, Wed 10, Thu 11} → 3 missed
    const d = decideStreakContinuation(base(now, { streakLastReadDate: iso(2026, 6, 8) }), now);
    expect(d.kind).toBe('reset');
    expect(d.missedWeekdays).toBe(3);
  });

  it('three missed weekdays: premium with 2 freezes continues via grace + 2 freezes', () => {
    const now = at(2026, 6, 12);
    const d = decideStreakContinuation(
      base(now, { streakLastReadDate: iso(2026, 6, 8), streakFreezes: 2, isPremium: true }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: true, freezesConsumed: 2, missedWeekdays: 3 });
  });

  it('three missed weekdays: premium with only 1 freeze resets (gap must be fully covered)', () => {
    const now = at(2026, 6, 12);
    const d = decideStreakContinuation(
      base(now, { streakLastReadDate: iso(2026, 6, 8), streakFreezes: 1, isPremium: true }),
      now,
    );
    expect(d.kind).toBe('reset');
  });

  it('a new week renews the grace day (cross-week single missed weekday continues)', () => {
    const now = at(2026, 6, 8); // Mon (new week, weekStart Sun Jun 7); lastRead Thu 4
    // between = {Fri 5, Sat 6, Sun 7}; amnesty forgives Sat+Sun → 1 missed weekday (Fri 5)
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2026, 6, 4),
        streakWeekStart: getWeekStart(at(2026, 6, 4)).toISOString(), // stale (previous week)
        streakGraceDaysUsedThisWeek: 1, // used LAST week — must roll over to 0
      }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: true, freezesConsumed: 0, missedWeekdays: 1 });
    expect(d.graceAfterWeekRollover).toBe(0);
  });

  it('a 6-month lapse resets even a premium user holding the max 99 freezes (COR-1 headline)', () => {
    const now = at(2026, 6, 8); // Mon Jun 8 2026; lastRead Mon Dec 8 2025
    // Span Mon→Mon = 182 days → 181 strictly-between days (Tue Dec 9 … Sun Jun 7):
    // 25 full Tue-anchored weeks (50 weekend days) + 6 remainder days Tue–Sun (2 weekend)
    // = 52 weekend days → 129 missed weekdays in UTC. In a US-DST timezone the
    // local-midnight span loses 1h at spring-forward → 128. Either way >> 99 + 1.
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2025, 12, 8),
        streakWeekStart: getWeekStart(at(2025, 12, 8)).toISOString(),
        streakFreezes: 99,
        isPremium: true,
      }),
      now,
    );
    expect(d.kind).toBe('reset');
    expect(d.missedWeekdays).toBeGreaterThan(100);
  });

  it('spring-forward weekend gap continues free in any timezone (DST)', () => {
    // lastRead Fri Mar 6 2026, now Mon Mar 9 2026; US DST starts Sun Mar 8.
    // DST zones: local-midnight span = 71h → daySpan 2, between = {Sun 8} (amnestied).
    // Non-DST zones: daySpan 3, between = {Sat 7, Sun 8} (amnestied). Both → 0 missed.
    const now = at(2026, 3, 9);
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2026, 3, 6),
        streakWeekStart: getWeekStart(at(2026, 3, 6)).toISOString(),
        streakFreezes: 2,
        isPremium: true,
      }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: false, freezesConsumed: 0, missedWeekdays: 0 });
  });

  it('fall-back weekend gap continues free in any timezone (DST)', () => {
    // lastRead Fri Oct 30 2026, now Mon Nov 2 2026; US DST ends Sun Nov 1.
    // DST zones: span 73h → daySpan 3; non-DST: 3. Between = {Sat 31, Sun 1} → 0 missed.
    const now = at(2026, 11, 2);
    const d = decideStreakContinuation(
      base(now, {
        streakLastReadDate: iso(2026, 10, 30),
        streakWeekStart: getWeekStart(at(2026, 10, 30)).toISOString(),
      }),
      now,
    );
    expect(d).toMatchObject({ kind: 'continue', usedGrace: false, freezesConsumed: 0, missedWeekdays: 0 });
  });

  it('a future lastRead (device clock rolled back) continues at no cost', () => {
    const now = at(2026, 6, 10);
    const d = decideStreakContinuation(base(now, { streakLastReadDate: iso(2026, 6, 12) }), now);
    expect(d).toMatchObject({ kind: 'continue', usedGrace: false, freezesConsumed: 0, missedWeekdays: 0 });
  });
});

describe('applyStreakRead', () => {
  const at = (y: number, m1: number, d: number) => new Date(y, m1 - 1, d, 12, 0, 0);
  const iso = (y: number, m1: number, d: number) => at(y, m1, d).toISOString();

  const read = (now: Date, over: Partial<Parameters<typeof applyStreakRead>[0]> = {}) =>
    applyStreakRead(
      {
        streakCurrent: 10,
        streakLastReadDate: null,
        streakGraceDaysUsedThisWeek: 0,
        streakWeekStart: getWeekStart(now).toISOString(),
        streakWeekendAmnesty: true,
        streakFreezes: 0,
        isPremium: false,
        streakLongest: 20,
        ...over,
      },
      now,
    );

  it('returns null for a same-day repeat read', () => {
    const now = at(2026, 6, 10);
    expect(read(now, { streakLastReadDate: iso(2026, 6, 10) })).toBeNull();
  });

  it('extends the streak and stamps lastRead/weekStart on a next-day read', () => {
    const now = at(2026, 6, 10);
    const r = read(now, { streakLastReadDate: iso(2026, 6, 9) });
    expect(r).toEqual({
      streakLastReadDate: now.toISOString(),
      streakCurrent: 11,
      streakLongest: 20,
      streakGraceDaysUsedThisWeek: 0,
      streakWeekStart: getWeekStart(now).toISOString(),
      streakFreezes: 0,
    });
  });

  it('does not burn freezes across a weekend gap (COR-2)', () => {
    const now = at(2026, 6, 15); // Mon after lastRead Fri 12
    const r = read(now, {
      streakLastReadDate: iso(2026, 6, 12),
      streakWeekStart: getWeekStart(at(2026, 6, 12)).toISOString(),
      streakFreezes: 3,
      isPremium: true,
    });
    expect(r?.streakCurrent).toBe(11);
    expect(r?.streakFreezes).toBe(3);
  });

  it('burns one freeze per uncovered missed weekday and records the grace day', () => {
    const now = at(2026, 6, 12); // 3 missed weekdays (Tue/Wed/Thu)
    const r = read(now, {
      streakLastReadDate: iso(2026, 6, 8),
      streakFreezes: 2,
      isPremium: true,
    });
    expect(r?.streakCurrent).toBe(11);
    expect(r?.streakFreezes).toBe(0);
    expect(r?.streakGraceDaysUsedThisWeek).toBe(1);
  });

  it('resets to 1 on an uncoverable gap, preserving longest and freezes', () => {
    const now = at(2026, 6, 12);
    const r = read(now, { streakLastReadDate: iso(2026, 6, 8) }); // free, 3 missed
    expect(r?.streakCurrent).toBe(1);
    expect(r?.streakLongest).toBe(20);
    expect(r?.streakFreezes).toBe(0);
  });

  it('premium earns a freeze at the 7-day milestone even when streakLongest is far higher (COR-3)', () => {
    const now = at(2026, 6, 10);
    const r = read(now, {
      streakCurrent: 6,
      streakLastReadDate: iso(2026, 6, 9),
      streakLongest: 49, // rebuilt streak after losing a 49-day streak
      isPremium: true,
    });
    expect(r?.streakCurrent).toBe(7);
    expect(r?.streakFreezes).toBe(1);
  });

  it('free users never accumulate freezes at milestones', () => {
    const now = at(2026, 6, 10);
    const r = read(now, { streakCurrent: 6, streakLastReadDate: iso(2026, 6, 9) });
    expect(r?.streakCurrent).toBe(7);
    expect(r?.streakFreezes).toBe(0);
  });

  it('freeze earning caps at 99', () => {
    const now = at(2026, 6, 10);
    const r = read(now, {
      streakCurrent: 6,
      streakLastReadDate: iso(2026, 6, 9),
      streakFreezes: 99,
      isPremium: true,
    });
    expect(r?.streakFreezes).toBe(99);
  });

  it('passive reconcile followed by a read equals reading directly (paths commute)', () => {
    const rows: { name: string; now: Date; over: Partial<Parameters<typeof applyStreakRead>[0]> }[] = [
      {
        name: 'weekend gap, premium holder',
        now: at(2026, 6, 15),
        over: {
          streakLastReadDate: iso(2026, 6, 12),
          streakWeekStart: getWeekStart(at(2026, 6, 12)).toISOString(),
          streakFreezes: 3,
          isPremium: true,
        },
      },
      {
        name: '3-weekday gap, free user (reset)',
        now: at(2026, 6, 12),
        over: { streakLastReadDate: iso(2026, 6, 8) },
      },
      {
        name: 'single missed weekday covered by grace',
        now: at(2026, 6, 10),
        over: { streakLastReadDate: iso(2026, 6, 8), streakFreezes: 2, isPremium: true },
      },
    ];

    for (const row of rows) {
      const input = {
        streakCurrent: 10,
        streakLastReadDate: null as string | null,
        streakGraceDaysUsedThisWeek: 0,
        streakWeekStart: getWeekStart(row.now).toISOString(),
        streakWeekendAmnesty: true,
        streakFreezes: 0,
        isPremium: false,
        streakLongest: 20,
        ...row.over,
      };
      const direct = applyStreakRead(input, row.now);
      const rec = reconcileStreakState({ ...input, streakJustReset: false }, row.now);
      const viaReconcile = applyStreakRead(
        {
          ...input,
          streakCurrent: rec.streakCurrent,
          streakGraceDaysUsedThisWeek: rec.streakGraceDaysUsedThisWeek,
          streakWeekStart: rec.streakWeekStart,
        },
        row.now,
      );
      expect({ name: row.name, result: viaReconcile }).toEqual({ name: row.name, result: direct });
    }
  });
});
```

### 1.5 Verification gates (Fix 1)

```
npx jest src/lib/__tests__/streak-helpers.test.ts
  → Test Suites: 1 passed / Tests: 32 passed, 32 total
    (3 pre-existing + 2 COR-1 regressions + 18 decide + 9 apply)
npx jest src/lib/__tests__/nudges.test.ts
  → passes unchanged (nudges.test.ts does not touch detectStreakLoss)
npm run typecheck        → exits 0
npm run lint             → 0 errors; warnings ≤ 3415
grep -n "function getWeekStart" src/lib/store.ts            → no matches
grep -rn "detectStreakLoss" src                              → no matches
grep -rn "effectiveMissed" src                               → no matches (the old tree is fully gone)
grep -c "export function decideStreakContinuation" src/lib/streak-helpers.ts → 1
grep -rln "decideStreakContinuation" src --include='*.ts*'
  → exactly: src/lib/streak-helpers.ts, src/lib/__tests__/streak-helpers.test.ts, src/hooks/usePremiumNudge.ts
```

### 1.6 STOP conditions (Fix 1)

- If `src/lib/store.ts:1302-1386` does not start with `// Streak actions` / `recordStreakRead: () =>` and end
  with the `streakFreezes: newFreezes,` return object — STOP, report drift.
- If `src/lib/streak-helpers.ts` differs from the excerpt in §1.1 at lines 84-88 — STOP, report drift.
- If `usePremiumNudge.ts` `detectStreakLoss` (lines 36-82) or the memo at 116-120 do not match §1.3.3 — STOP.
- If the two RED tests in §1.2 do not fail before implementation — STOP (engine behavior differs from audit).
- If any of the 3 pre-existing streak tests fails AFTER the refactor — STOP and report which; do NOT edit the
  pre-existing tests to make them pass.

---

## FIX 2 — journal.tsx TDZ: `currentDay` read before declaration kills SOAP auto-select (COR-5)

### 2.1 Context

`src/app/(tabs)/(today)/journal.tsx`: two `useState` lazy initializers run synchronously during the FIRST render
and read `currentDay` — a `const` declared ~90 lines LATER in the same function scope (temporal dead zone). Hermes
does not enforce TDZ by default, so the reads silently yield `undefined`: (1) days with
`studyMethod === 'soap_journal'` NEVER auto-open in SOAP mode; (2) persisted question responses never hydrate the
local Map (masked by store fallbacks). On any TDZ-enforcing engine this is a render crash.

Current code (verified):

Lines 190-196:
```ts
  // Journal mode
  // Initialize mode from existing entry, or auto-suggest based on study method
  const [activeMode, setActiveMode] = useState<JournalMode>(() => {
    if (existingEntry?.journalMode) return existingEntry.journalMode;
    if (currentDay?.studyMethod === 'soap_journal') return 'soap';
    return 'freewrite';
  });
```

Lines 257-268:
```ts
  // Expandable question response state
  const [expandedQuestionIndex, setExpandedQuestionIndex] = useState<number | null>(null);
  const [questionResponses, setQuestionResponses] = useState<Map<number, string>>(() => {
    if (!existingEntry?.questionResponses) return new Map();
    const initial = new Map<number, string>();
    const allQuestions = currentDay?.reflectionQuestions ?? [];
    for (const qr of existingEntry.questionResponses) {
      const idx = allQuestions.findIndex((q) => q === qr.question);
      if (idx >= 0) initial.set(idx, qr.response);
    }
    return initial;
  });
```

Lines 280-282 (the late declaration):
```ts
  // Get devotional context
  const currentDevotional = devotionals.find((d) => d.id === devotionalId);
  const currentDay = currentDevotional?.days.find((d) => d.dayNumber === dayNumber);
```

The derivation depends only on `devotionals` (selected at line 170), `devotionalId` (line 156) and `dayNumber`
(line 157) — all available well before line 183. Hoisting is safe.

### 2.2 Failing tests FIRST

Create `src/lib/__tests__/journal-entry-state.test.ts` (new file; the module under test does not exist yet, so
the suite is RED at creation — run it once to confirm it fails to resolve the import):

```ts
import {
  buildInitialQuestionResponses,
  diffSoapWrites,
  resolveInitialJournalMode,
} from '../journal-entry-state';

describe('resolveInitialJournalMode', () => {
  it('honors a persisted journal mode over the study-method suggestion', () => {
    expect(
      resolveInitialJournalMode({ journalMode: 'guided' }, { studyMethod: 'soap_journal' }),
    ).toBe('guided');
  });

  it('auto-selects SOAP for soap_journal study-method days with no persisted mode (COR-5)', () => {
    expect(resolveInitialJournalMode(undefined, { studyMethod: 'soap_journal' })).toBe('soap');
  });

  it('defaults to freewrite otherwise — including when the day is missing', () => {
    expect(resolveInitialJournalMode(undefined, { studyMethod: 'lectio' })).toBe('freewrite');
    expect(resolveInitialJournalMode(undefined, undefined)).toBe('freewrite');
  });
});

describe('buildInitialQuestionResponses', () => {
  it('hydrates responses onto the indices of matching question text', () => {
    const map = buildInitialQuestionResponses(
      { questionResponses: [{ question: 'Q2', response: 'my answer' }] },
      { reflectionQuestions: ['Q1', 'Q2'] },
    );
    expect(map.get(1)).toBe('my answer');
    expect(map.size).toBe(1);
  });

  it('returns an empty map when nothing is persisted or no questions match', () => {
    expect(buildInitialQuestionResponses(undefined, { reflectionQuestions: ['Q1'] }).size).toBe(0);
    expect(
      buildInitialQuestionResponses(
        { questionResponses: [{ question: 'gone', response: 'x' }] },
        { reflectionQuestions: ['Q1'] },
      ).size,
    ).toBe(0);
  });
});

describe('diffSoapWrites', () => {
  const soap = (over: Partial<Record<'scripture' | 'observation' | 'application' | 'prayer', string>>) => ({
    scripture: '',
    observation: '',
    application: '',
    prayer: '',
    ...over,
  });

  it('includes a field the user cleared to empty so deletions persist (COR-6)', () => {
    expect(diffSoapWrites(soap({}), soap({ observation: 'old text' }))).toEqual([
      { field: 'observation', value: '' },
    ]);
  });

  it('skips fields whose value is unchanged', () => {
    expect(diffSoapWrites(soap({ prayer: 'same' }), soap({ prayer: 'same' }))).toEqual([]);
  });

  it('treats a missing persisted record as all-empty (fresh entry writes only non-empty fields)', () => {
    expect(diffSoapWrites(soap({ scripture: 'John 3:16' }), undefined)).toEqual([
      { field: 'scripture', value: 'John 3:16' },
    ]);
  });
});
```

### 2.3 Implementation

#### 2.3.1 New module `src/lib/journal-entry-state.ts`

```ts
import type { DevotionalDay, JournalEntry, JournalMode, SoapResponses } from '@/lib/store';

/**
 * Pure derivations for the journal entry screen's local state.
 * Kept out of the component so the useState lazy initializers cannot close
 * over component consts declared after them (Hermes silently reads undefined
 * across a temporal dead zone; TDZ-enforcing engines crash).
 */

export function resolveInitialJournalMode(
  existingEntry: Pick<JournalEntry, 'journalMode'> | undefined,
  currentDay: Pick<DevotionalDay, 'studyMethod'> | undefined,
): JournalMode {
  if (existingEntry?.journalMode) return existingEntry.journalMode;
  if (currentDay?.studyMethod === 'soap_journal') return 'soap';
  return 'freewrite';
}

export function buildInitialQuestionResponses(
  existingEntry: Pick<JournalEntry, 'questionResponses'> | undefined,
  currentDay: Pick<DevotionalDay, 'reflectionQuestions'> | undefined,
): Map<number, string> {
  const initial = new Map<number, string>();
  if (!existingEntry?.questionResponses) return initial;
  const allQuestions = currentDay?.reflectionQuestions ?? [];
  for (const qr of existingEntry.questionResponses) {
    const idx = allQuestions.findIndex((q) => q === qr.question);
    if (idx >= 0) initial.set(idx, qr.response);
  }
  return initial;
}

export const SOAP_FIELDS = ['scripture', 'observation', 'application', 'prayer'] as const;

/**
 * Fields whose local value differs from the persisted value — INCLUDING
 * fields the user cleared to empty. Flush paths must write exactly these so
 * a deletion made inside the debounce window is not resurrected (COR-6).
 */
export function diffSoapWrites(
  local: SoapResponses,
  persisted: SoapResponses | undefined,
): { field: keyof SoapResponses; value: string }[] {
  const writes: { field: keyof SoapResponses; value: string }[] = [];
  for (const field of SOAP_FIELDS) {
    const localValue = local[field] ?? '';
    if ((persisted?.[field] ?? '') !== localValue) {
      writes.push({ field, value: localValue });
    }
  }
  return writes;
}
```

(Type check: `DevotionalDay`, `JournalEntry`, `JournalMode`, `SoapResponses` are all exported from
`src/lib/store.ts` — verified at lines 183, 250, 252, 267.)

#### 2.3.2 `src/app/(tabs)/(today)/journal.tsx`

(a) Add to the imports (near line 59, alongside the other `@/lib/...` imports):
```ts
import { buildInitialQuestionResponses, diffSoapWrites, resolveInitialJournalMode } from '@/lib/journal-entry-state';
```
(`diffSoapWrites` is used by Fix 3; import it now so the import line is edited once.)

(b) HOIST the devotional-context derivation. Insert immediately AFTER the `existingEntry` memo (the block ending
`[journalEntries, devotionalId, dayNumber],\n  );` at line 182) and BEFORE
`const [content, setContent] = useState(existingEntry?.content ?? '');`:

```ts
  // Get devotional context — MUST stay above the useState lazy initializers
  // below; they read currentDay during the first render (was a TDZ
  // use-before-declaration that silently produced undefined on Hermes).
  const currentDevotional = devotionals.find((d) => d.id === devotionalId);
  const currentDay = currentDevotional?.days.find((d) => d.dayNumber === dayNumber);
```

(c) DELETE the original declaration block (lines 280-282 — the exact three lines quoted in §2.1, starting
`// Get devotional context`). After (b)+(c) there must be exactly ONE declaration of each const:
`grep -c "const currentDay = " "src/app/(tabs)/(today)/journal.tsx"` → `1`.

(d) Replace the `activeMode` initializer (lines 190-196 quoted in §2.1) with:
```ts
  // Journal mode
  // Initialize mode from existing entry, or auto-suggest based on study method
  const [activeMode, setActiveMode] = useState<JournalMode>(() =>
    resolveInitialJournalMode(existingEntry, currentDay)
  );
```

(e) Replace the `questionResponses` initializer (the `useState<Map<number, string>>(() => { ... })` block quoted
in §2.1, lines 259-268) with:
```ts
  const [questionResponses, setQuestionResponses] = useState<Map<number, string>>(() =>
    buildInitialQuestionResponses(existingEntry, currentDay)
  );
```
(Keep the `expandedQuestionIndex` line above it untouched.)

### 2.4 Verification gates (Fix 2)

```
npx jest src/lib/__tests__/journal-entry-state.test.ts
  → Test Suites: 1 passed / Tests: 8 passed, 8 total
npm run typecheck   → exits 0
node -e "
  const src = require('fs').readFileSync('src/app/(tabs)/(today)/journal.tsx','utf8');
  const decl = src.indexOf('const currentDay = ');
  const use = src.indexOf('resolveInitialJournalMode(existingEntry, currentDay)');
  if (decl < 0 || use < 0 || decl > use) { console.error('TDZ ORDER WRONG'); process.exit(1); }
  console.log('declaration precedes use: OK');
"
  → declaration precedes use: OK
```

### 2.5 STOP conditions (Fix 2)

- If the three excerpts in §2.1 do not match the file at (approximately) the cited lines — STOP, report drift.
- If `currentDay` or `currentDevotional` is referenced anywhere between line 183 and the old declaration site
  OTHER than the two initializers being replaced (check with a grep of the region before editing) — re-read those
  uses; if any executes during render before your new insertion point, STOP and report.
- Do NOT reorder, rename, or memoize anything else in the component.

---

## FIX 3 — SOAP flush drops cleared fields; unmount path duplicates the flush logic (COR-6)

### 3.1 Context

`src/app/(tabs)/(today)/journal.tsx`. `handleSoapChange` (lines 475-488) debounces SOAP persistence by 800ms and
persists empties correctly. But BOTH flush paths skip empty strings via a truthiness guard, so clearing a field
and exiting (Done or swipe-back) within 800ms drops the pending deletion — the old text resurrects on revisit,
despite the field showing "Auto-saved".

Flush path 1 — `flushSoapSaves` (lines 490-504, called by `handleDone` at 439):
```ts
  // Flush all pending SOAP values to the store immediately
  const flushSoapSaves = useCallback(() => {
    if (!hasPendingSoapRef.current) return;
    if (soapSaveTimerRef.current) clearTimeout(soapSaveTimerRef.current);
    const entryId = ensureEntry();
    if (entryId) {
      const vals = soapValuesRef.current;
      for (const key of ['scripture', 'observation', 'application', 'prayer'] as const) {
        if (vals[key]) {
          updateSoapResponse(entryId, key, vals[key]);
        }
      }
    }
    hasPendingSoapRef.current = false;
  }, [ensureEntry, updateSoapResponse]);
```

Flush path 2 — an INLINE DUPLICATE inside the unmount effect (lines 359-394; note it re-implements both
`ensureEntry` and the flush loop, with the same `if (vals[key])` bug):
```ts
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      if (justSavedTimerRef.current) clearTimeout(justSavedTimerRef.current);
      // Flush any pending SOAP saves before unmount
      if (hasPendingSoapRef.current && soapSaveTimerRef.current) {
        clearTimeout(soapSaveTimerRef.current);
        // Ensure an entry exists before flushing — if user typed SOAP for the
        // first time and navigates away within the debounce window, the entry
        // may not have been created yet.
        let entryId = savedEntryIdRef.current;
        if (!entryId) {
          addJournalEntry({ devotionalId, dayNumber, content: '', journalMode: activeMode });
          const entry = getJournalEntry(devotionalId, dayNumber);
          if (entry) {
            entryId = entry.id;
            savedEntryIdRef.current = entryId;
          }
        }
        if (entryId) {
          const vals = soapValuesRef.current;
          for (const key of ['scripture', 'observation', 'application', 'prayer'] as const) {
            if (vals[key]) updateSoapResponse(entryId, key, vals[key]);
          }
        }
      } else if (soapSaveTimerRef.current) {
        clearTimeout(soapSaveTimerRef.current);
      }
      // Flush any pending freewrite changes on unmount
      if (hasChangesRef.current) {
        saveEntry(contentRef.current);
      }
      isMountedRef.current = false;
    };
  }, [saveEntry, updateSoapResponse]);
```

The store action `updateSoapResponse` (store.ts:1036-1047) handles empty values correctly — the bug is purely the
component-side guards. Fix: route BOTH paths through the single `flushSoapSaves` (vault:
`deterministic-twin-paths-must-share-one-helper`) and compute writes via `diffSoapWrites` from Fix 2 (writes
every changed field INCLUDING empties; skips no-op writes).

The failing-test for the full component flow would require rendering `journal.tsx` (expo-router screen with heavy
native deps) — not feasible in this jest setup. The deletion behavior is pinned at the unit level by the
`diffSoapWrites` COR-6 test in Fix 2; component wiring is verified by the structural gates below plus the manual
QA script in §5.

### 3.2 Implementation (all in `src/app/(tabs)/(today)/journal.tsx`; do AFTER Fix 2)

(a) Add a latest-flush ref next to the other SOAP refs (after line 209 `const hasPendingSoapRef = useRef(false);`):
```ts
  const flushSoapSavesRef = useRef<() => void>(() => {});
```

(b) Replace `flushSoapSaves` (the full block quoted in §3.1) with:
```ts
  // Flush all pending SOAP values to the store immediately. Writes every
  // field that differs from the persisted entry — including cleared (empty)
  // fields — so deletions made inside the debounce window stick (COR-6).
  const flushSoapSaves = useCallback(() => {
    if (!hasPendingSoapRef.current) return;
    if (soapSaveTimerRef.current) clearTimeout(soapSaveTimerRef.current);
    const entryId = ensureEntry();
    if (entryId) {
      const persisted = getJournalEntry(devotionalId, dayNumber)?.soapResponses;
      for (const { field, value } of diffSoapWrites(soapValuesRef.current, persisted)) {
        updateSoapResponse(entryId, field, value);
      }
    }
    hasPendingSoapRef.current = false;
  }, [ensureEntry, updateSoapResponse, getJournalEntry, devotionalId, dayNumber]);
  flushSoapSavesRef.current = flushSoapSaves;
```
(The render-phase ref assignment mirrors the existing `soapValuesRef.current = soapValues;` pattern at lines
207-208.)

(c) Replace the SOAP portion of the unmount effect. The whole block from
`// Flush any pending SOAP saves before unmount` through the `} else if (soapSaveTimerRef.current) { clearTimeout(soapSaveTimerRef.current); }`
close (see §3.1 excerpt) becomes:
```ts
      // Flush any pending SOAP saves before unmount — single owner:
      // flushSoapSavesRef always points at the latest flushSoapSaves.
      if (soapSaveTimerRef.current) clearTimeout(soapSaveTimerRef.current);
      flushSoapSavesRef.current();
```
Keep the freewrite flush (`if (hasChangesRef.current) { saveEntry(contentRef.current); }`) and
`isMountedRef.current = false;` untouched. Update the effect's dependency array from
`[saveEntry, updateSoapResponse]` to `[saveEntry]` (the effect body no longer references `updateSoapResponse`,
`addJournalEntry`, `getJournalEntry`, `devotionalId`, `dayNumber`, or `activeMode`; refs are exempt from
exhaustive-deps).

Behavior notes the executor should be able to defend:
- `flushSoapSaves` already begins with the `hasPendingSoapRef` guard, so the unmount call is a no-op when nothing
  is pending — identical to the old `else` branch after the unconditional `clearTimeout`.
- `diffSoapWrites` against the persisted entry means a freshly created entry (persisted soap = undefined) writes
  only non-empty locals — same as before — while a cleared field (persisted non-empty, local '') is now written.

### 3.3 Verification gates (Fix 3)

```
npm run typecheck   → exits 0
npm run lint        → 0 errors; warnings ≤ 3415 (exhaustive-deps must not flag the edited effect/callback)
grep -c "updateSoapResponse(entryId" "src/app/(tabs)/(today)/journal.tsx"
  → 1   (the flush write-loop exists exactly once, inside flushSoapSaves)
grep -n "if (vals\[key\])" "src/app/(tabs)/(today)/journal.tsx"
  → no matches (both truthiness guards gone)
grep -c "flushSoapSavesRef.current()" "src/app/(tabs)/(today)/journal.tsx"
  → 1   (unmount path delegates to the shared flush)
npx jest            → full suite green (see §5 for exact counts)
```

### 3.4 STOP conditions (Fix 3)

- If `flushSoapSaves` or the unmount effect do not match the §3.1 excerpts — STOP, report drift.
- Note: `handleSoapChange` (475-488) and `handleDone` (433-443) are NOT modified; if you find yourself editing
  them, STOP — you have drifted from the plan.

---

## 4. Out of scope — DO NOT TOUCH

- **COR-7 / COR-8 (Today-screen celebration duplicate "+1" / midnight-stale `hasReadToday` memo),
  `src/app/(tabs)/(today)/index.tsx:340-352, 1341-1346`.** Assessed per the batch instruction: the shared-helper
  refactor does NOT naturally fix these — the celebration trigger keys off per-current-devotional
  `hasReadDevotionalToday` (`home-devotional-state.ts`), not off the streak engine, and this plan changes nothing
  in `index.tsx`. Correct fix (trigger off a `streakLastReadDate` day-flip) needs the Decision-3 product call;
  leave for a future batch.
- COR-4 (DST calendar-day math in `devotional-day-access.ts`/`home-devotional-state.ts`), COR-9 (widget vs app
  "read today" definitions), COR-10 (deep-link switches active series) — separate batches.
- `src/app/streak-settings.tsx` copy, `StreakDisplay.tsx`, widget-bridge, store persist `version`,
  `store-migrations.ts`, anything under `backend/`, any navigation/UX behavior in `journal.tsx` beyond the exact
  blocks quoted above.
- No new dependencies, no eslint-config changes, no test-infrastructure changes.

## 5. Final verification (run after all three fixes)

```
npm run typecheck   → exits 0, clean
npm run lint        → ✖ N problems (0 errors, ≤3415 warnings)
npx jest            → Test Suites: 92 passed, 92 total
                      Tests: 646 passed, 646 total
                      (baseline 91/609 + 1 new suite + 29 new streak tests + 8 journal-entry-state tests)
```

If counts differ, every delta must be accounted for by name before declaring done.

Manual QA script (simulator, optional but recommended — note for the runner, not a blocking gate):
1. SOAP deletion: open a journal entry with saved SOAP text → clear a section → tap Done within ~0.5s → reopen →
   the section must be EMPTY.
2. SOAP auto-select: on a devotional day whose `studyMethod` is `soap_journal` with no existing entry, the journal
   must open in SOAP mode (was: always Free Write).
3. Streak: with a seeded `streakLastReadDate` 10+ days back (debug-seed-today.tsx) and no freezes, foregrounding
   the app must show streak 0 (was: streak preserved forever).

## 6. Vault-rule compliance map

- `deterministic-twin-paths-must-share-one-helper` — decision tree now exists ONCE (`decideStreakContinuation`);
  `recordStreakRead`, `reconcileStreakState`, and the nudge detector all consume it; store's private
  `getWeekStart` deleted; journal unmount flush delegates to `flushSoapSaves`.
- `deterministic-paths-must-receive-now-as-parameter` — `decideStreakContinuation`/`applyStreakRead` take `now`;
  the store action passes `new Date()` at the single boundary.
- `compute-test-expected-values-by-formula-not-intuition` — every `missedWeekdays` expectation carries its
  hand-count derivation; the 6-month case documents the TZ-dependent ±1 and asserts the formula-safe bound.
- `invariants-must-hold-on-every-construction-and-update-path` — every `StreakDecision` variant carries
  weekStart/grace bookkeeping; commutativity test pins reconcile∘read ≡ read.
- `gate-all-write-paths` — both SOAP flush paths route through one helper whose writes are diff-gated.
- `enumerate-excluded-populations-for-every-filter-bound` — weekend-amnesty loop counts STRICTLY-between days;
  boundary days (lastRead day, today) are excluded by construction and the tests enumerate them in comments.
