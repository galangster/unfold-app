# Plan 06 — Adversarial-review fixes (round-1 audit fixes, confirmed findings)

## Header

- **Source of truth for findings:** `/tmp/unfold-e2e-audit-2026-06/findings/REVIEW-RESULTS.md`. Note: that file truncates mid-REVM-9 and REVM-10 never appears in it; REVM-9 is a NIT (decision-helper proliferation) and is deliberately OUT OF SCOPE here; REVM-10's subject (outbox cap eviction-order coverage gap) was reconstructed from the orchestrator's instruction and verified directly against the code/test below.
- **MOBILE repo:** `/Users/galangster/clawd/work/unfold-audit` (branch `fix/01-streak-engine-and-journal`, HEAD `2806321`). Every MOBILE excerpt below was read from this tree at this commit. **If any excerpt does not match the file at the cited lines, STOP and report drift — do not improvise.**
- **BACKEND repo:** `/Users/galangster/clawd/work/unfold-backend-audit` (branch `fix/backend-p0-p1-2026-06`, HEAD `28fd780`). Same drift rule.
- **MOBILE commands** (run from mobile repo root):
  - `npm run typecheck` → exit 0, no output.
  - `npm run lint` → exit 0.
  - `npx jest <testfile> --silent` → `Tests: N passed` with the counts given per fix.
  - Full suite at the end: `npm test -- --silent` → 0 failures.
- **BACKEND commands** (run from backend repo root):
  - `./node_modules/.bin/tsc --noEmit` → exit 0.
  - `./node_modules/.bin/vitest run <testfile>` → counts given per fix.
  - Full suite at the end: `./node_modules/.bin/vitest run` → 0 failures (was 116 passing at `28fd780`; expected 127 after this plan).
- **Test conventions:** identical to plans 01–05. Mobile: jest, mocks per test file (`../mmkv-storage` Map-backed pattern), pure logic extracted to `src/lib/*.ts` and unit-tested. Backend: vitest, route tests boot a real express app with a mocked `../../db`. Vault rule `compute-test-expected-values-by-formula-not-intuition` applies to every expected value below — each is derived in-line.
- **Failing-test-first** applies to every fix that changes behavior: write the new test, run it, watch it fail for the stated reason, then apply the fix.

### Dependency order

1. **FIX-R1 + FIX-R8** (sync-outbox.ts + its test — same files, do together; R1 first).
2. **FIX-R2** (streak-helpers) — independent.
3. **FIX-R3** (bible-highlight-overlap) — independent.
4. **FIX-R4** (RevenueCat listener guard) — independent.
5. **FIX-R5** (REVM-7 `deleted:false` — keep + pin + staging gate) — independent; staging gate can run any time after.
6. **FIX-R6** (REVM-2 + REVM-8 — full-reset.ts + trial-notification.ts, same file pair).
7. **FIX-R7** (REVM-4 recovery namespace) — after FIX-R6 only because both plans' executors otherwise collide on `full-reset.test.ts` mock blocks; no code dependency.
8. **FIX-R9** (REVC-2 runtime gate) — LAST on mobile, after FIX-R7 (it runtime-verifies the same storage-open path FIX-R7 edits).
9. **FIX-B1…FIX-B5** (backend) — independent of mobile and of each other; FIX-B2 and FIX-B3 edit `sanitize.ts` in adjacent functions, apply in numeric order.

### Risk estimates

| Fix | Finding | Sev | Repo | Risk | Why |
|---|---|---|---|---|---|
| FIX-R1 | REVM-1 | **P1** | MOBILE | Medium | Touches the durability path's clear logic; a mistake here IS data loss. Concurrency test required |
| FIX-R2 | REVM-3 | P2 | MOBILE | Low | One conditional in a pure function; table-tested |
| FIX-R3 | REVM-5 | P2 | MOBILE | Low-medium | Pure planner; merge semantics must be stated and pinned |
| FIX-R4 | REVM-6 | P2 | MOBILE | Low-medium | New tiny stateful helper; hook wiring change |
| FIX-R5 | REVM-7 | P2 | MOBILE | Low | No code change (justified below); pin + staging gate |
| FIX-R6 | REVM-2+REVM-8 | P2/NIT | MOBILE | Low | One call + one list entry + one docstring |
| FIX-R7 | REVM-4 | P2 | MOBILE | Low-medium | One `clearAll()` on a throwaway namespace; must NEVER touch the real store |
| FIX-R8 | REVM-10 | NIT | MOBILE | Low | Test-only strengthening |
| FIX-R9 | REVC-2 | **P1 (gate)** | MOBILE | n/a | Verification only — the required runtime evidence was never recorded |
| FIX-B1 | REVB-1 | P2 | BACKEND | Low | Wiring + log truthfulness; behavior identical in all 3 valid modes |
| FIX-B2 | REVB-2 | P2 | BACKEND | Low | Regex tightening; inventory pinned by test |
| FIX-B3 | REVB-3 | P2 | BACKEND | Low | Character-class split; pinned both directions |
| FIX-B4 | REVB-8 | NIT | BACKEND | Low | Pure helper replaces raw-body capture |
| FIX-B5 | REVB-6 | P2 | BACKEND | Low | Observability only; dedup behavior unchanged (documented decision) |

---
---

# MOBILE — `/Users/galangster/clawd/work/unfold-audit`

---

# FIX-R1 (REVM-1, P1) — drainSyncOutbox success path destroys changes enqueued while the POST was in flight

## Context

`src/lib/sync-outbox.ts:87-135` (current HEAD):

```ts
export function drainSyncOutbox(): Promise<void> {
  if (inflight) return inflight;

  inflight = (async () => {
    const changes = readOutbox();
    if (changes.length === 0) return;
    ...
      const answeredCount = payload?.results?.length ?? 0;
      if (answeredCount >= changes.length) {
        writeOutbox([]);
      } else {
        // Partial answer: drop the answered prefix, keep the rest
        writeOutbox(changes.slice(answeredCount));
      }
    ...
```

The drain snapshots `changes` **before** the awaited `fetch`, then on success rewrites the outbox from that stale snapshot (`writeOutbox([])` / `writeOutbox(changes.slice(answeredCount))`). `enqueueSyncChanges` is callable at any time — `syncDevotionalDayRead`'s catch (`src/lib/devotional-read-sync.ts:107-110`) enqueues whenever a direct completion push fails, which can happen exactly while a reconnect-triggered drain is awaiting its POST. The success write then wipes a change the server never saw. The single-flight guard (line 85-88) prevents concurrent *drains*, not enqueue-during-drain. This silently loses the exact data NET-5 was built to preserve.

**Design (chosen): snapshot-keyed removal.** On success, re-read the outbox and remove **only** entries whose `table:id` is in the answered snapshot AND whose `clientUpdatedAt` is not newer than the snapshotted entry's. Consequences, enumerated (vault: `enumerate-excluded-populations-for-every-filter-bound`):

- New `table:id` enqueued mid-flight → not in snapshot map → **kept**.
- Same `table:id` re-enqueued mid-flight with a **newer** `clientUpdatedAt` → `c.clientUpdatedAt > sentAt` → **kept** (will be drained next trigger).
- Same `table:id` with equal-or-older `clientUpdatedAt` → impossible to differ from the in-flight entry: `enqueueSyncChanges` dedup (line 67) only replaces when strictly newer, so an equal/older mid-flight enqueue is a no-op against the still-present outbox entry — removal removes exactly what was sent. **Removed, correctly.**
- Partial server answer → only the answered prefix's keys are removed; unanswered tail and mid-flight arrivals both survive.

A versioned-queue alternative (monotonic seq per entry) was considered and rejected: it changes the persisted shape (`unfold-sync-outbox-v1` would need a migration) for no additional correctness over snapshot-keyed removal.

## Failing tests FIRST

Extend `src/lib/__tests__/sync-outbox.test.ts` (currently 6 tests; mocks at lines 1-35 already provide the Map-backed `../mmkv-storage` and `@/lib/api-config`; `makeChange(id, table, ts)` helper at lines 37-46). Add 3 tests inside the existing `describe('sync-outbox', ...)`:

1. `'changes enqueued while the drain POST is in flight survive the success clear (REVM-1)'`:

```ts
  it('changes enqueued while the drain POST is in flight survive the success clear (REVM-1)', async () => {
    const mockFetch = jest.fn().mockImplementation(async () => {
      // Lands between the drain's snapshot and its success write — the race.
      enqueueSyncChanges([makeChange('d-late', 'devotionals', '2026-06-03T00:00:00Z')]);
      return {
        ok: true,
        json: async () => ({ results: [{ status: 'accepted' }] }),
      };
    });
    global.fetch = mockFetch as any;

    enqueueSyncChanges([makeChange('d1', 'devotionals', '2026-06-01T00:00:00Z')]);
    await drainSyncOutbox();

    const outbox = peekSyncOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].id).toBe('d-late');
  });
```

   **Why it fails today:** success path runs `writeOutbox([])` (answeredCount 1 ≥ changes.length 1), wiping `d-late` → `outbox` is `[]`, length 0.

2. `'a same-key update enqueued mid-drain with a newer clientUpdatedAt is kept'`: enqueue `d1@2026-06-01T00:00:00Z`; fetch impl enqueues `makeChange('d1','devotionals','2026-06-02T00:00:00Z')` then answers `[{status:'accepted'}]` → after drain, outbox has exactly one entry, `id==='d1'`, `clientUpdatedAt==='2026-06-02T00:00:00Z'`. **Fails today:** outbox `[]`.

3. `'partial answers drop only the answered snapshot entries, never mid-flight arrivals'`: enqueue `d1@T1`, `d2@T2` (T1=`2026-06-01...`, T2=`2026-06-02...`); fetch impl enqueues `d3@2026-06-03T00:00:00Z` and answers `{ results: [{ status: 'accepted' }] }` (length 1 < 2). Outbox after: ids exactly `['d2','d3']` in any order (`d1` was the answered prefix — `Array.from(map.values())` preserves insertion order, so `changes[0]` is `d1`). **Fails today:** `writeOutbox(changes.slice(1))` from the stale snapshot leaves only `['d2']` — `d3` is destroyed.

## Minimal fix

In `src/lib/sync-outbox.ts`, replace lines 115-124 (from the `// Server is authoritative` comment through the `else { ... }` block) with:

```ts
      // Server is authoritative: accepted | conflict | rejected all clear from
      // the outbox. Two things must survive (REVM-1):
      //  - changes the server didn't answer for (partial response), and
      //  - anything enqueued while the POST was in flight. So: re-read the
      //    outbox and remove exactly the answered snapshot entries — a
      //    same-key change with a NEWER clientUpdatedAt stays queued.
      const answeredCount = payload?.results?.length ?? 0;
      const answered = changes.slice(0, answeredCount);
      const answeredAt = new Map(
        answered.map((c) => [`${c.table}:${c.id}`, c.clientUpdatedAt]),
      );
      const remaining = readOutbox().filter((c) => {
        const sentAt = answeredAt.get(`${c.table}:${c.id}`);
        return sentAt === undefined || c.clientUpdatedAt > sentAt;
      });
      writeOutbox(remaining);
```

No other changes. The non-ok branch (lines 106-109), catch, and finally stay byte-identical.

## Verification

- `npx jest src/lib/__tests__/sync-outbox.test.ts --silent` → `Tests: 9 passed` (6 existing + 3 new) — run **after** FIX-R8's test edit too if doing them together, counts unchanged (R8 strengthens an existing test in place).
- `npm run typecheck` → exit 0.
- Re-run the 4 pre-existing drain tests' semantics in your head against the new code: 'drain posts all changes and clears on accepted' still ends empty (no mid-flight enqueue → `remaining` filters everything out). 'rejected results are dropped' still ends empty (rejected counts as answered). They must pass UNCHANGED — if either needs editing, STOP: the fix is wrong.

## Out of scope / STOP

- Do NOT add a versioned/seq field to the persisted entries (shape migration; rejected above).
- Do NOT change `enqueueSyncChanges` dedup or cap logic (FIX-R8 touches only its test).
- Do NOT make `drainSyncOutbox` re-drain in a loop when `remaining.length > 0` — the next trigger (NetInfo/focus) owns retry; a loop here can ping-pong with a failing server.
- STOP if `drainSyncOutbox` at lines 87-135 differs from the Context excerpt.

---

# FIX-R2 (REVM-3, P2) — freeze-earn clamp zeroes a churned-premium user's banked freezes

## Context

`src/lib/streak-helpers.ts:186-192` (current HEAD):

```ts
  // Earn a freeze at every 7-day milestone of the CURRENT streak (premium
  // only — the free cap is 0). No longest-streak dedupe: after a reset the
  // user must be able to earn again while rebuilding (COR-3).
  if (newStreak > 0 && newStreak % 7 === 0) {
    const maxFreezes = input.isPremium ? MAX_FREEZES : 0;
    newFreezes = Math.min(newFreezes + 1, maxFreezes);
  }
```

For `isPremium: false` with banked `streakFreezes: 3` (earned during a past subscription), hitting any 7-day milestone computes `Math.min(3 + 1, 0) = 0` — the balance is destroyed. The COR-3 plan said "delete the streakLongest dedupe — earn a freeze at every 7-day milestone"; it never said "wipe existing balances for free users". The intended semantics: free users don't **earn**; banked freezes are **preserved** (and remain consumable — `decideStreakContinuation` already burns freezes independent of premium status, see the `'continue'` branch at lines 180-184, which is correct and untouched).

## Failing test FIRST

Extend `src/lib/__tests__/streak-helpers.test.ts` inside `describe('applyStreakRead', ...)` (the `read(now, over)` builder is at lines 341-355; `at`/`iso` at 338-339). Add after the `'free users never accumulate freezes at milestones'` test (line 419-424):

```ts
  it('a churned-premium user keeps banked freezes at a 7-day milestone (REVM-3)', () => {
    const now = at(2026, 6, 10);
    const r = read(now, {
      streakCurrent: 6,
      streakLastReadDate: iso(2026, 6, 9),
      streakFreezes: 3, // banked while subscribed; subscription has since lapsed
      isPremium: false,
    });
    // Formula: yesterday-read → 'continue', freezesConsumed 0 → newFreezes = 3.
    // Milestone: newStreak 7 % 7 === 0, but isPremium false → NO earn, NO clamp.
    expect(r?.streakCurrent).toBe(7);
    expect(r?.streakFreezes).toBe(3);
  });
```

**Why it fails today:** `Math.min(3 + 1, 0)` → `streakFreezes` comes back `0`.

## Minimal fix

Replace the excerpt above (lines 186-192) with:

```ts
  // Earn a freeze at every 7-day milestone of the CURRENT streak — premium
  // only. Free (incl. churned-premium) users simply do not EARN here; a
  // banked balance from a past subscription is preserved, never clamped
  // away (REVM-3). No longest-streak dedupe: after a reset the user must be
  // able to earn again while rebuilding (COR-3).
  if (input.isPremium && newStreak > 0 && newStreak % 7 === 0) {
    newFreezes = Math.min(newFreezes + 1, MAX_FREEZES);
  }
```

## Verification

- `npx jest src/lib/__tests__/streak-helpers.test.ts --silent` → `Tests: 33 passed` (32 existing — all must stay green, including `'free users never accumulate freezes at milestones'` (freezes 0→0, unaffected), `'premium earns a freeze at the 7-day milestone...'` (COR-3), `'freeze earning caps at 99'` — plus 1 new).
- `npm run typecheck` → exit 0.

## Out of scope / STOP

- Do NOT touch `decideStreakContinuation` or `reconcileStreakState` (the passive path never earns/consumes — comment at line 219 — and that stays true).
- Do NOT add freeze expiry for churned users — that is a product decision nobody made.
- STOP if lines 186-192 differ from the excerpt.

---

# FIX-R3 (REVM-5, P2) — highlight note transfer drops all but the last note; can attach a note to a run that never overlapped its source

## Context

`src/lib/bible-highlight-overlap.ts` (current HEAD). The single pending-note slot, line 75-77:

```ts
  // Note from a fully-replaced highlight that has no remainder segments —
  // needs to be attached to the first new-color segment.
  let pendingNoteForFirstRun: string | undefined;
```

overwritten per fully-replaced highlight at lines 136-141:

```ts
    // If no remainder segments, note needs to transfer to the first new-color
    // segment. Track it with a module-local set.
    if (!noteTransferredToRemainder && noteToTransfer !== undefined) {
      pendingNoteForFirstRun = noteToTransfer;
    }
```

and attached unconditionally to `runs[0]` at lines 144-151. Two bugs: (a) replacing 2+ noted same-translation highlights with no remainders silently destroys every note but the last; (b) the surviving note lands on `runs[0]` even when the source highlight only overlapped a later run (select v2+v9, noted highlight at v9 → note lands on the v2 record).

**Chosen semantics (least destructive — merge, never drop or block):** each orphaned note attaches to the **first new-color run that overlaps its source highlight** (locality restored); when multiple notes land on the same run they are **merged, joined with `'\n\n'`, ordered by source-highlight `verseStart`** (deterministic regardless of `chapterHighlights` input order). Nothing user-written is ever discarded — the exact data class DAT-3 protects. Blocking the gesture was rejected: it turns a common re-color into a dead-end, and the existing single-note transfer already established that notes follow the replacement.

Update the file-header invariant (lines 13-14) to match — vault rule `comment-invariants-must-grep-verify`:

```
 *  - Notes transfer to the first remainder segment, or — when a replaced
 *    highlight leaves no remainder — to the first new segment overlapping the
 *    source highlight; multiple notes on one segment merge ('\n\n', ordered
 *    by source verseStart). Notes are never dropped.
```

## Failing tests FIRST

Extend `src/lib/__tests__/bible-highlight-overlap.test.ts` inside `describe('planHighlightApplication', ...)` — `makeHighlight(id, verseStart, verseEnd, color, translation, note?)` is at lines 4-25, `defaultArgs` at 27-33:

```ts
  it('merges notes when one selection replaces two noted highlights (REVM-5)', () => {
    const h1 = makeHighlight('h1', 2, 3, 'yellow', 'BSB', 'first thought');
    const h2 = makeHighlight('h2', 5, 6, 'yellow', 'BSB', 'second thought');
    const plan = planHighlightApplication({
      ...defaultArgs,
      chapterHighlights: [h1, h2],
      selectedVerses: [2, 3, 4, 5, 6], // one run fully covering both → no remainders
      color: 'blue',
    });
    expect(plan.toRemove).toEqual(['h1', 'h2']);
    expect(plan.toAdd).toHaveLength(1);
    // Merge order by source verseStart: h1 (v2) before h2 (v5).
    expect(plan.toAdd[0].note).toBe('first thought\n\nsecond thought');
  });

  it('a transferred note lands on the run overlapping its source, not runs[0] (REVM-5)', () => {
    const h = makeHighlight('h1', 9, 9, 'yellow', 'BSB', 'keep me');
    const plan = planHighlightApplication({
      ...defaultArgs,
      chapterHighlights: [h],
      selectedVerses: [2, 9], // two runs: [2,2] and [9,9]; h overlaps only the second
      color: 'blue',
    });
    const v2 = plan.toAdd.find((a) => a.verseStart === 2)!;
    const v9 = plan.toAdd.find((a) => a.verseStart === 9)!;
    expect(v2.note).toBeUndefined();
    expect(v9.note).toBe('keep me');
  });
```

**Why they fail today:** (1) single slot — `pendingNoteForFirstRun` ends as `'second thought'`, so `note` is `'second thought'`, not the merge. (2) the slot attaches to `runs[0]` → `v2.note === 'keep me'`, `v9.note` undefined.

The existing `'notes survive a re-color'` test (line 76-88) must stay green: one note → one-element merge → identical string, attached to the only run, which overlaps its source.

## Minimal fix

1. Replace the slot declaration (lines 75-77) with:

```ts
  // Notes from fully-replaced highlights that left no remainder segments.
  // Keyed by the index of the first new-color run that overlaps the SOURCE
  // highlight; merged on attach (REVM-5: merge, never drop).
  const pendingNotesByRun = new Map<number, Array<{ sourceStart: number; note: string }>>();
```

2. Replace lines 136-141 (the `if (!noteTransferredToRemainder ...)` block) with:

```ts
    // No remainder segments — route the note to the first new-color run that
    // overlaps THIS highlight (guaranteed to exist: `overlaps` above used the
    // same predicate).
    if (!noteTransferredToRemainder && noteToTransfer !== undefined) {
      const runIndex = runs.findIndex(
        ([rStart, rEnd]) => h.verseStart <= rEnd && h.verseEnd >= rStart,
      );
      const list = pendingNotesByRun.get(runIndex) ?? [];
      list.push({ sourceStart: h.verseStart, note: noteToTransfer });
      pendingNotesByRun.set(runIndex, list);
    }
```

3. In the run-building loop (lines 144-151), replace the `isFirst`/`note`/reset logic:

```ts
  for (let ri = 0; ri < runs.length; ri++) {
    const [rStart, rEnd] = runs[ri];
    const text = Array.from({ length: rEnd - rStart + 1 }, (_, i) => verseText(rStart + i)).join(' ');
    const pendingNotes = pendingNotesByRun.get(ri);
    const note = pendingNotes
      ? pendingNotes
          .sort((a, b) => a.sourceStart - b.sourceStart)
          .map((p) => p.note)
          .join('\n\n')
      : undefined;
```

   (the `toAdd.push({...})` below it is unchanged — it already spreads `...(note !== undefined ? { note } : {})`).

4. Header-comment update per Context.

## Verification

- `npx jest src/lib/__tests__/bible-highlight-overlap.test.ts --silent` → `Tests: 9 passed` (7 existing + 2 new).
- `npm run typecheck` → exit 0.

## Out of scope / STOP

- Do NOT merge a remainder-carrying note with run notes — a highlight with remainders keeps its note on the first remainder exactly as today (lines 111-134 untouched).
- Do NOT change `planHighlightRemoval`.
- STOP if lines 75-77 / 136-151 differ from the excerpts.

---

# FIX-R4 (REVM-6, P2) — RevenueCat foreground-recovery listener leak / double-registration

## Context

`src/hooks/useRevenueCatSync.ts` (current HEAD). Launch-path registration (lines 99-111) correctly disposes when `didCancel`. The foreground-recovery path (lines 116-128) does not:

```ts
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (useUIState.getState().revenueCatResolved) return; // recovered already
      void (async () => {
        await retryRevenueCatIdentitySync();
        const result = await getCustomerInfo();
        if (result.ok) applyCustomerInfo(result.data);
        if (!removeCustomerInfoListener) {
          const reg = await addCustomerInfoUpdateListener(applyCustomerInfo);
          if (reg.ok && !didCancel) removeCustomerInfoListener = reg.data;
        }
      })();
    });
```

Confirmed leak modes: (a) `reg.ok && didCancel` → the remover is dropped un-invoked; (b) two rapid foreground events both pass `!removeCustomerInfoListener` before either await resolves → two native listeners, one remover retained. There is also a third race the review did not flag but the same guard must own: launch registration (line 101) in flight while a foreground event registers → second assignment overwrites the first remover → leak. One owner per OS resource (vault: `one-owner-per-os-resource`) means **one guard owns all registration paths**.

## Failing tests FIRST

New pure helper + test (repo's dominant pattern). New file `src/lib/__tests__/listener-registration.test.ts`:

```ts
import { createSingleListenerGuard } from '../listener-registration';

type Remover = jest.Mock<boolean, []>;
const okResult = (remover: Remover) => ({ ok: true as const, data: remover });

describe('createSingleListenerGuard', () => {
  it('registers exactly once across concurrent ensure() calls (REVM-6b)', async () => {
    const remover: Remover = jest.fn(() => true);
    let resolveReg!: (v: ReturnType<typeof okResult>) => void;
    const register = jest.fn(
      () => new Promise<ReturnType<typeof okResult>>((res) => { resolveReg = res; }),
    );
    const guard = createSingleListenerGuard(register);

    const p1 = guard.ensure();
    const p2 = guard.ensure(); // second caller while first is in flight
    resolveReg(okResult(remover));
    await Promise.all([p1, p2]);

    expect(register).toHaveBeenCalledTimes(1);
    expect(guard.hasListener()).toBe(true);
    expect(remover).not.toHaveBeenCalled();
  });

  it('dispose() during an in-flight registration removes the just-registered listener (REVM-6a)', async () => {
    const remover: Remover = jest.fn(() => true);
    let resolveReg!: (v: ReturnType<typeof okResult>) => void;
    const guard = createSingleListenerGuard(
      () => new Promise<ReturnType<typeof okResult>>((res) => { resolveReg = res; }),
    );

    const p = guard.ensure();
    guard.dispose(); // unmount races the await
    resolveReg(okResult(remover));
    await p;

    expect(remover).toHaveBeenCalledTimes(1); // never strand a registration
    expect(guard.hasListener()).toBe(false);
  });

  it('a failed registration allows a later retry', async () => {
    const remover: Remover = jest.fn(() => true);
    const register = jest
      .fn()
      .mockResolvedValueOnce({ ok: false as const, reason: 'identity not ready' })
      .mockResolvedValueOnce(okResult(remover));
    const guard = createSingleListenerGuard(register);

    await guard.ensure();
    expect(guard.hasListener()).toBe(false);
    await guard.ensure();
    expect(register).toHaveBeenCalledTimes(2);
    expect(guard.hasListener()).toBe(true);
  });

  it('ensure() after success is a no-op', async () => {
    const remover: Remover = jest.fn(() => true);
    const register = jest.fn().mockResolvedValue(okResult(remover));
    const guard = createSingleListenerGuard(register);
    await guard.ensure();
    await guard.ensure();
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('dispose() removes an established listener and blocks re-registration', async () => {
    const remover: Remover = jest.fn(() => true);
    const register = jest.fn().mockResolvedValue(okResult(remover));
    const guard = createSingleListenerGuard(register);
    await guard.ensure();
    guard.dispose();
    expect(remover).toHaveBeenCalledTimes(1);
    await guard.ensure(); // post-dispose ensure must not re-register
    expect(register).toHaveBeenCalledTimes(1);
  });
});
```

**Why it fails today:** `../listener-registration` does not exist — red at collection.

## Minimal fix

1. New `src/lib/listener-registration.ts`:

```ts
/**
 * At-most-one listener registration with safe disposal under races
 * (one-owner-per-os-resource). Wraps an async register() that resolves to a
 * Result whose data is the remover. Guarantees:
 *  - concurrent ensure() collapses to one register() call
 *  - dispose() during an in-flight register() invokes the remover the moment
 *    it lands (a registration is never stranded)
 *  - after dispose(), ensure() is a permanent no-op
 */
type RegisterResult<R> = { ok: true; data: R } | { ok: false; reason: string };

export function createSingleListenerGuard<R extends () => unknown>(
  register: () => Promise<RegisterResult<R>>,
) {
  let remover: R | undefined;
  let inFlight = false;
  let disposed = false;

  return {
    async ensure(): Promise<void> {
      if (remover || inFlight || disposed) return;
      inFlight = true;
      try {
        const result = await register();
        if (!result.ok) return;
        if (disposed || remover) {
          result.data(); // lost the race or unmounted — never strand it
          return;
        }
        remover = result.data;
      } finally {
        inFlight = false;
      }
    },
    dispose(): void {
      disposed = true;
      remover?.();
      remover = undefined;
    },
    hasListener(): boolean {
      return remover !== undefined;
    },
  };
}
```

2. In `src/hooks/useRevenueCatSync.ts`:
   - Add import: `import { createSingleListenerGuard } from '@/lib/listener-registration';`
   - Delete line 48 (`let removeCustomerInfoListener: (() => boolean) | undefined;`).
   - Replace the launch-path registration block (lines 99-111, from `// Set up real-time listener` through the closing `});`) with:

```ts
    // Set up real-time listener for subscription changes. ONE guard owns
    // registration for both the launch path and the foreground-recovery path
    // (REVM-6) — registration also waits for the deterministic identity.
    const listenerGuard = createSingleListenerGuard(async () => {
      const result = await addCustomerInfoUpdateListener(applyCustomerInfo);
      if (!result.ok) {
        logger.log('[RevenueCat] Customer info listener not registered:', result.reason);
      }
      return result;
    });
    void listenerGuard.ensure();
```

   - In the foreground handler, replace lines 123-126 (the `if (!removeCustomerInfoListener) { ... }` block) with:

```ts
        void listenerGuard.ensure();
```

   - In the cleanup (lines 130-134), replace `removeCustomerInfoListener?.();` with `listenerGuard.dispose();` (keep `didCancel = true;` — it still gates `applyCustomerInfo` — and `appStateSub.remove();`).

## Verification

- `npx jest src/lib/__tests__/listener-registration.test.ts --silent` → `Tests: 5 passed`.
- `npm run typecheck` → exit 0 (this also proves the hook wiring compiles — `addCustomerInfoUpdateListener`'s result type must satisfy `RegisterResult<() => boolean>`; if it does not, STOP and report the actual shape).
- `grep -n "removeCustomerInfoListener" src/hooks/useRevenueCatSync.ts` → 0 hits.
- `grep -c "listenerGuard.ensure()" src/hooks/useRevenueCatSync.ts` → 2 (launch + foreground).

## Out of scope / STOP

- Do NOT collapse the whole foreground-recovery body behind an in-flight flag — `retryRevenueCatIdentitySync`/`getCustomerInfo` are idempotent reads; only listener registration needs the guard.
- Do NOT convert the hook to a renderHook-tested unit — the guard carries the logic; the hook is wiring.
- STOP if lines 99-128 differ from the Context excerpts.

---

# FIX-R5 (REVM-7, P2) — `deleted: false` on the /api/sync/push wire payload: KEEP, pin, and run the staging gate

## Context — decision and justification

`src/lib/devotional-read-sync.ts:45-74` sends `deleted: false` on both change objects. REVM-7 calls this "a protocol change beyond plan FIX-7's intent". Resolution after reading both repos at HEAD:

1. **The field already exists server-side as a first-class protocol field.** Backend `src/routes/sync.ts:300` destructures `deleted` from every pushed change; `:338` forwards `!!deleted` into the series-boundary check; `:361` computes `deletedAt: deleted ? now : null`; the pull path `:562` emits `deleted: !!row.deletedAt` back to clients. `deleted: false` and an absent `deleted` are **provably identical** server-side: both `!!undefined` and `!!false` are `false`, and `undefined ? now : null` ≡ `false ? now : null` ≡ `null`.
2. **Removing it would re-fork the type.** Mobile `src/lib/sync-types.ts:35` declares `deleted: boolean` (required) on the shared `SyncPushChange`; plan 02 (line 733) explicitly prescribed retargeting devotional-read-sync onto that shared type "and adding `deleted: false` to its two changes, so there is ONE change type in the codebase". Stripping the field at send time or making it optional re-introduces the local-type fork that FIX-7/FIX-8 removed. So the executor's addition was *prescribed*, not invented — REVM-7's real residual is that the **staging verification enumerated only `schemaVersion`**, leaving the shipped payload unverified end-to-end.

**Decision: keep `deleted: false`.** Close the gap with (a) a unit pin and (b) the staging push gate run against the CURRENT payload.

## Test (pin, not failing-first — this pins existing behavior)

Extend `src/lib/__tests__/devotional-read-sync.test.ts` (3 existing tests) with:

```ts
  it('both changes carry the shared-protocol deleted:false flag (REVM-7 pin)', () => {
    const changes = buildDevotionalReadSyncChanges({ devotional, day, readAt });
    expect(changes).toHaveLength(2);
    expect(changes[0].deleted).toBe(false);
    expect(changes[1].deleted).toBe(false);
  });
```

(reuse the file's existing `devotional`/`day` fixtures; match its construction style.)

## Verification — MANDATORY staging gate

- `npx jest src/lib/__tests__/devotional-read-sync.test.ts --silent` → `Tests: 4 passed`.
- **Staging gate (closes REVM-7):** one manual push with the FULL current payload shape (`schemaVersion` in `data` AND top-level `deleted: false`) must return `accepted` for **both** tables. `authMiddleware` (backend `src/index.ts:101-107`) requires `X-Device-ID` to be a UUID — generate one with `uuidgen` and label it as an audit probe:

```bash
PROBE_ID=$(uuidgen | tr 'A-Z' 'a-z')
curl -sS -X POST https://api.unfoldapp.co/api/sync/push \
  -H 'Content-Type: application/json' \
  -H "X-Device-ID: ${PROBE_ID}" \
  -d '{"changes":[
    {"table":"devotionals","id":"audit-probe-revm7-devo","clientUpdatedAt":"2026-06-10T00:00:00Z","deleted":false,
     "data":{"schemaVersion":1,"title":"audit probe","totalDays":1,"currentDay":1}},
    {"table":"devotional_days","id":"audit-probe-revm7-day","clientUpdatedAt":"2026-06-10T00:00:00Z","deleted":false,
     "data":{"schemaVersion":1,"devotionalId":"audit-probe-revm7-devo","dayNumber":1,"isRead":true,"readAt":"2026-06-10T00:00:00Z"}}
  ]}'
```

  **EXPECTED:** HTTP 200, `results[0].status === "accepted"` and `results[1].status === "accepted"`. Record the response JSON in the findings ledger. If either is `rejected`, **STOP and report** — do not change the payload to make it pass.

## Out of scope / STOP

- Do NOT remove `deleted` or make it optional on `sync-types.ts`.
- Do NOT add `deleted: true` paths — no mobile deletion sync exists yet.
- The probe rows orphan under a synthetic device-id (same convention plan 02's FIX-7 gate used) — do not try to clean them up via SQL.

---

# FIX-R6 (REVM-2 P2 + REVM-8 NIT) — full reset never cancels the trial-ending OS notification; phantom MMKV "key" in the reset list

## Context

`src/lib/full-reset.ts:50-53` cancels only the daily reminders:

```ts
export async function performFullLocalReset(): Promise<void> {
  // 1. Cancel OS notifications BEFORE wiping store — frozen payloads
  //    would otherwise keep firing against content that no longer exists.
  await cancelAllReminders();
```

`cancelAllReminders` (`src/lib/notifications.ts:252-263`) cancels only DAILY_REMINDER/MIDDAY_CHECKIN/EVENING_WINDDOWN ids. The trial notification has its own id and its own exported cancel helper — `cancelTrialEndingNotification()` at `src/lib/trial-notification.ts:104-120` — which nothing in the reset path calls. Plan FIX-6 step 2 said "also cancel its scheduled notification if a cancel helper exists there". Meanwhile `clearTrialNotificationMirror`'s docstring (`trial-notification.ts:302-305`) falsely claims "cancels any pending OS notification first" while its body is only `trialNotificationStore.clearAll()` (vault: `comment-invariants-must-grep-verify`).

REVM-8: `FULL_RESET_MMKV_KEYS` (`full-reset.ts:39-48`) contains `'unfold-trial-notification'` — that is an MMKV **instance id** (`new MMKV({ id: 'unfold-trial-notification' })`, `trial-notification.ts:62`), not a key in the `mmkvStorage` namespace, so `mmkvStorage.removeItem('unfold-trial-notification')` is a no-op and the test green-lights a key that clears nothing. The instance is actually cleared by `clearTrialNotificationMirror()` (step 5).

## Failing test FIRST

Extend `src/lib/__tests__/full-reset.test.ts`. First update the `'../trial-notification'` mock (lines 50-52) to:

```ts
jest.mock('../trial-notification', () => ({
  clearTrialNotificationMirror: jest.fn(),
  cancelTrialEndingNotification: jest.fn(() => Promise.resolve()),
}));
```

and add `cancelTrialEndingNotification` to the import block at line 66. New test (mirror the ordering pattern of `'cancels reminders before store reset'`, lines 119-136):

```ts
  it('cancels the trial-ending OS notification before the store reset (REVM-2)', async () => {
    const order: string[] = [];
    (cancelTrialEndingNotification as jest.Mock).mockImplementation(async () => {
      order.push('cancelTrial');
    });
    (useUnfoldStore.getState as jest.Mock).mockImplementation(() => ({
      reset: jest.fn(() => order.push('reset')),
    }));

    await performFullLocalReset();

    expect(order.indexOf('cancelTrial')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('reset')).toBeGreaterThan(order.indexOf('cancelTrial'));
  });
```

**Why it fails today:** `cancelTrialEndingNotification` is never called — `order.indexOf('cancelTrial')` is `-1`.

For REVM-8, extend the existing `'covers the QA reset key set'` test (lines 92-105) with one assertion after the loop:

```ts
    // MMKV INSTANCE ids are not mmkvStorage keys — they must not masquerade
    // in this list (REVM-8); the trial instance is cleared via
    // clearTrialNotificationMirror() in step 5.
    expect(FULL_RESET_MMKV_KEYS).not.toContain('unfold-trial-notification');
```

**Why it fails today:** the entry is present at `full-reset.ts:47`.

## Minimal fix

1. `src/lib/full-reset.ts`:
   - Import: `import { cancelTrialEndingNotification, clearTrialNotificationMirror } from '@/lib/trial-notification';` (replacing the existing single-name import at line 30).
   - Step 1 becomes:

```ts
  // 1. Cancel OS notifications BEFORE wiping store — frozen payloads
  //    would otherwise keep firing against content that no longer exists.
  //    cancelAllReminders covers daily/midday/evening; the trial-ending
  //    notification has its own id and cancel helper (REVM-2).
  await cancelAllReminders();
  await cancelTrialEndingNotification();
```

   - Delete the `'unfold-trial-notification',` line from `FULL_RESET_MMKV_KEYS` (line 47) and leave a comment in its place inside the array block: `// NOTE: 'unfold-trial-notification' is an MMKV INSTANCE id, not a key here — cleared via clearTrialNotificationMirror() in step 5 (REVM-8).`

2. `src/lib/trial-notification.ts:302-305` — fix the false docstring:

```ts
/**
 * Clear the MMKV mirror of scheduled trial-notification state. Mirror ONLY —
 * cancelling the pending OS notification is the caller's job
 * (performFullLocalReset awaits cancelTrialEndingNotification() first).
 */
```

## Verification

- `npx jest src/lib/__tests__/full-reset.test.ts --silent` → `Tests: 5 passed` (4 existing + 1 new; the strengthened key-set test counts as existing).
- `npm run typecheck` → exit 0.
- `grep -n "cancelTrialEndingNotification" src/lib/full-reset.ts` → import + exactly 1 call.
- `grep -rn "cancels any pending OS notification" src/lib/trial-notification.ts` → 0 hits.

## Out of scope / STOP

- Do NOT fold the cancel into `clearTrialNotificationMirror` (it would make a sync function async and ripple through callers).
- Do NOT touch `cancelAllReminders`' id list.
- STOP if `full-reset.ts:39-53` differs from the excerpts.

---

# FIX-R7 (REVM-4, P2) — recovery namespace persists across Keychain outages; must be an empty one-session sandbox

## Context

`src/lib/mmkv-storage.ts:86-99` (current HEAD):

```ts
const mmkv =
  openPlan.mode === 'encrypted'
    ? new MMKV({ id: 'unfold-store-v2', encryptionKey })
    : openPlan.mode === 'plain'
      ? new MMKV({ id: 'unfold-store-v2' })
      : // recovery: Keychain down but the real file is encrypted — run this session
        // on a throwaway namespace; NEVER open the real file in the wrong mode.
        new MMKV({ id: 'unfold-store-v2-recovery' });

if (openPlan.mode === 'recovery') {
  logger.error(...);
}
```

`unfold-store-v2-recovery` is a real on-disk file that nothing ever wipes. Plan FIX-2's stated invariant: "recovery is a deliberately empty one-session sandbox". Two Keychain outages months apart currently share state: session 2 rehydrates session 1's stale writes as "current" data, which then vanishes again when the Keychain returns.

**Design:** the decision lives in the pure plan (`resolveMmkvOpenPlan`) so it is table-tested; `mmkv-storage.ts` only executes it. Add `clearOnOpen: boolean` to `MmkvOpenPlan` — `true` only on the recovery row.

## Failing test FIRST

`src/lib/__tests__/mmkv-open-mode.test.ts` (6 row tests, all `toEqual` exact-match). Update **all six** expected objects to include `clearOnOpen`:

- Row 2 (`'encrypted', false` → recovery): `expect(plan).toEqual({ mode: 'recovery', writeMarker: null, recrypt: false, clearOnOpen: true });`
- Rows 1, 3, 4, 5, 6: append `clearOnOpen: false` to each expected object.

**Why it fails today:** `clearOnOpen` does not exist on the returned objects — `toEqual` fails on all 6 (a defined `false`/`true` expectation never matches an absent property... specifically row 2's `true` always fails; rows with `false` fail because `toEqual` treats `false` ≠ missing). Red first, all six rows.

## Minimal fix

1. `src/lib/mmkv-open-mode.ts`:
   - Extend the interface (lines 17-21):

```ts
export interface MmkvOpenPlan {
  mode: MmkvMode;
  writeMarker: 'encrypted' | 'plain' | null;
  recrypt: boolean;
  /** Recovery only: wipe the throwaway namespace so it is an EMPTY
   *  one-session sandbox — a previous outage's writes must not resurrect
   *  as "current" data (REVM-4). Never true for the real store file. */
  clearOnOpen: boolean;
}
```

   - Add `clearOnOpen: false` to five return objects and `clearOnOpen: true` to the recovery return (line 45). Update the decision-table doccomment (lines 27-33) with the new column.

2. `src/lib/mmkv-storage.ts` — immediately after the `const mmkv = ...` construction (after line 93), before the recovery log block:

```ts
if (openPlan.clearOnOpen) {
  // Recovery sandbox must start EMPTY every session (REVM-4). This wipes only
  // the throwaway 'unfold-store-v2-recovery' namespace — the real
  // 'unfold-store-v2' file is untouched (clearOnOpen is never set for it).
  mmkv.clearAll();
}
```

## Verification

- `npx jest src/lib/__tests__/mmkv-open-mode.test.ts --silent` → `Tests: 6 passed`.
- `npm run typecheck` → exit 0 (also proves no other consumer of `MmkvOpenPlan` breaks — `grep -rn "MmkvOpenPlan" src/` should show only mmkv-open-mode.ts and mmkv-storage.ts; if more, STOP and report).
- `grep -n "clearAll" src/lib/mmkv-storage.ts` → exactly 2 hits: the new `mmkv.clearAll()` guarded by `openPlan.clearOnOpen`, and the pre-existing `oldMmkv.clearAll()` in `migrateData` (line ~137). Any hit on an unguarded `mmkv.clearAll()` is a STOP.
- FIX-R9's runtime gate (below) exercises this file's module-load path on device — required before calling this fix done.

## Out of scope / STOP

- Do NOT also clear recovery on *exit* from recovery (no reliable hook; entry-clear is sufficient — every recovery session starts empty).
- Do NOT attempt to merge recovery-session writes back into the real store when the Keychain returns (explicitly out of scope in plan FIX-2; data-loss surface).
- STOP if `mmkv-storage.ts:86-99` differs from the excerpt.

---

# FIX-R8 (REVM-10, NIT) — outbox cap test does not pin eviction order

## Context

`src/lib/sync-outbox.ts:74-79` evicts by keeping the newest `OUTBOX_CAP` entries by `clientUpdatedAt` (string-descending sort, slice 200). The test `'outbox is capped at 200'` (`sync-outbox.test.ts:142-151`) asserts only `length ≤ 200` — an implementation that dropped the NEWEST 50 would pass. Its generated timestamps (`2026-06-01T000000Z` …) are also not valid ISO strings (harmless for string comparison, but the fixture should match production format — `new Date().toISOString()`).

## Fix (test-only; strengthen in place)

Replace the body of `'outbox is capped at 200'` with:

```ts
  it('outbox is capped at 200, evicting the OLDEST by clientUpdatedAt', () => {
    const changes: SyncPushChange[] = [];
    // Formula: 250 entries, one minute apart starting 2026-06-01T00:00:00Z —
    // index i ↔ timestamp base + i minutes. Newest 200 = indices 50..249.
    const base = Date.parse('2026-06-01T00:00:00Z');
    for (let i = 0; i < 250; i++) {
      changes.push(makeChange(`id-${i}`, 'devotionals', new Date(base + i * 60_000).toISOString()));
    }
    enqueueSyncChanges(changes);

    const outbox = peekSyncOutbox();
    expect(outbox).toHaveLength(200);
    const ids = new Set(outbox.map((c) => c.id));
    expect(ids.has('id-49')).toBe(false);  // oldest 50 (0..49) evicted
    expect(ids.has('id-0')).toBe(false);
    expect(ids.has('id-50')).toBe(true);   // survivor boundary
    expect(ids.has('id-249')).toBe(true);  // newest retained
  });
```

This passes against the current implementation (it pins it) and fails against any eviction-order regression. Out-of-order enqueue is already covered by the dedup test; no second cap test needed.

## Verification

- Covered by FIX-R1's gate: `npx jest src/lib/__tests__/sync-outbox.test.ts --silent` → `Tests: 9 passed`.

## Out of scope / STOP

- Do NOT change `OUTBOX_CAP` or the comparator in `enqueueSyncChanges`.

---

# FIX-R9 (REVC-2, P1) — MMKV mode-marker fix: REQUIRED runtime gate was never recorded

## Context

REVC-2 confirmed the FIX-2 code is conformant (all 6 decision-table rows, recovery namespace, key retry, recrypt) but found the plan's **required** runtime gate (plan 02 line 285, finding confidence 0.65) has no recorded evidence: the `fix-verification/` screenshots are dated **before** the fix commits, so they verify a prior session. **This is a verification gap, not a code gap — no code change in this fix.** The failure mode FIX-2 guards is total data loss; it is not "verified" until this gate runs at current HEAD. FIX-R7 above edits the same module-load path, which makes this gate mandatory twice over.

## Runtime gate (MANDATORY — run AFTER FIX-R7 is applied)

On the iOS simulator, at the post-fix HEAD:

1. Build/launch the app (Metro attached), create identifiable data (one journal entry with a unique string, e.g. `revc2-gate-<date>`).
2. Kill the app process completely (not background — terminate).
3. Relaunch → the journal entry **persists** and is readable.
4. Grep the Metro session log for `[MMKV]` — EXPECTED lines include the open-mode path taken (e.g. no `recovery namespace` error on a healthy simulator; no `Migration failed`).
5. Record evidence with **post-fix timestamps**: 2 screenshots (pre-kill with data visible, post-relaunch with same data) + the `[MMKV]` log excerpt, saved under `/tmp/unfold-e2e-audit-2026-06/runtime/verify-fixes/` with a `revc2-` prefix, and note the HEAD commit SHA in the findings ledger.

**STOP conditions:** data does not persist across relaunch, or any `[MMKV]` error line appears → report immediately; do not proceed to commit FIX-R7.

---
---

# BACKEND — `/Users/galangster/clawd/work/unfold-backend-audit`

---

# FIX-B1 (REVB-1, P2) — COMPONENTS.cron is logged but never wired into startCron gating

## Context

`src/index.ts:961-964` logs the component split; `:1020-1023` starts cron **inside** the `if (COMPONENTS.http)` listen callback, gated only by `DATABASE_URL`:

```ts
const COMPONENTS = modeComponents(MODE);
console.log(
  `[unfold-backend] MODE=${MODE} → http=${COMPONENTS.http} cron=${COMPONENTS.cron} worker=${COMPONENTS.worker}`,
);
...
    // Cron runs only on api instances (single cron prevents duplicate job insertion)
    if (process.env.DATABASE_URL) {
      startCron();
    }
  });
```

**Intent confirmed** from `plans/01-backend-p0-p1.md` (line 53: "set `MODE=api` ... Verify the new startup log shows `mode=api → http=true cron=true worker=false`") and `src/lib/mode.ts:43-53` (`cron: mode !== "worker"`): **MODE=api keeps cron** — that split stays. Parity holds today only because `cron === http` in all three valid modes; the startup log can print `cron=true` while cron never starts (DATABASE_URL unset), and any future mode separating cron from http diverges silently.

## Minimal fix (wiring; gates are greps — no new unit test, `modeComponents` is already table-tested in `mode.test.ts`)

1. Delete lines 1020-1023 (the comment + `if (process.env.DATABASE_URL) { startCron(); }`) from inside the listen callback.
2. Add a top-level block AFTER the whole `if (COMPONENTS.http) { ... } else { ... }` statement (i.e. after line 1031) and BEFORE the worker block (`if (COMPONENTS.worker && process.env.DATABASE_URL)`):

```ts
// Cron runs whenever this MODE includes the cron component (api/all — single
// cron prevents duplicate job insertion; see modeComponents). Wired directly
// to COMPONENTS.cron so the startup log above cannot diverge from reality
// (REVB-1). Loud when configured-on but unstartable.
if (COMPONENTS.cron) {
  if (process.env.DATABASE_URL) {
    startCron();
  } else {
    console.error(
      `[unfold-backend] MODE=${MODE} enables cron but DATABASE_URL is unset — cron NOT started`,
    );
  }
}
```

Ordering note: cron now starts before `listen()`'s callback fires. `startCron` (`src/lib/cron.ts`) only registers a 60s `setInterval` (first tick ≥60s out) and itself guards `if (!_db)` — no dependency on the HTTP server. This is a deliberate, harmless ordering change; do not move it back inside the callback.

## Verification

- `./node_modules/.bin/tsc --noEmit` → exit 0.
- `grep -n "startCron" src/index.ts` → EXPECTED exactly 2 hits: the import and one call inside the new `if (COMPONENTS.cron)` block. Zero hits inside the `app.listen` callback.
- `grep -n "COMPONENTS.cron" src/index.ts` → EXPECTED 2 hits: the startup log + the new gate.
- `./node_modules/.bin/vitest run src/lib/__tests__/mode.test.ts` → pass, unchanged count.
- Full suite at end (see Final gates).

## Out of scope / STOP

- Do NOT change `modeComponents` (the api/worker/all split is the confirmed intent).
- Do NOT touch the DDL-ensure blocks in the listen callback or the worker-mode `ensureActiveJobDedupIndex` call.
- The Railway `MODE=api` env change remains **Nick's deploy-time action** — not this plan's.
- STOP if `index.ts:1020-1031` differs from the excerpt.

---

# FIX-B2 (REVB-2, P2) — stripPromptDelimiters prefix-matches tag names; pin the mobile tag inventory

## Context

`src/lib/sanitize.ts:30`:

```ts
  cleaned = cleaned.replace(/<\/?(?:system|user|assistant|prompt|instruction)[^>]*>/gi, "");
```

`[^>]*` consumes the rest of the tag NAME, so `<instructions>`, `<user_context>`, `<prompt_rules>` all strip — a routine prompt refactor to Anthropic-style tags would be silently gutted on every `/api/generate/*` route. No current mobile tag collides (build 218 inventory: `persona_example, example, dynamic_example, devotional, good, bad, task, examples`) but nothing pins that.

## Failing tests FIRST

Extend `src/lib/__tests__/sanitize.test.ts` inside `describe('stripPromptDelimiters', ...)`:

```ts
  it('matches delimiter tags only on exact-name boundaries (REVB-2)', () => {
    // Exact names (with/without attributes, self-closing) still strip:
    expect(stripPromptDelimiters('<system>')).toBe('');
    expect(stripPromptDelimiters('<system role="x">')).toBe('');
    expect(stripPromptDelimiters('<assistant/>')).toBe('');
    // Longer names that merely START with a delimiter name survive:
    expect(stripPromptDelimiters('<instructions>x</instructions>')).toBe('<instructions>x</instructions>');
    expect(stripPromptDelimiters('<user_context>y</user_context>')).toBe('<user_context>y</user_context>');
    expect(stripPromptDelimiters('<prompt_rules>z</prompt_rules>')).toBe('<prompt_rules>z</prompt_rules>');
  });

  it('never strips the mobile build-218 prompt-tag inventory', () => {
    const inventory = ['persona_example', 'example', 'dynamic_example', 'devotional', 'good', 'bad', 'task', 'examples'];
    for (const tag of inventory) {
      const text = `<${tag}>content</${tag}>`;
      expect(stripPromptDelimiters(text)).toBe(text);
    }
  });
```

**Why test 1 fails today:** `<instructions>` → regex matches `instruction` + `[^>]*` eats `s` → stripped to `x`; same for `<user_context>` (`user` + `_context`) and `<prompt_rules>`. Test 2 passes today (no inventory name starts with a delimiter name) — it is the disjointness pin REVB-2 demanded; keep it.

## Minimal fix

Replace line 30 with (tag name must be followed by whitespace, `/`, or `>` — attributes still accepted, vault: `html-tag-peel-must-accept-attributes`):

```ts
  cleaned = cleaned.replace(/<\/?(?:system|user|assistant|prompt|instruction)(?=[\s/>])[^>]*>/gi, "");
```

The other three delimiter regexes (lines 31-33) are exact-token matches — untouched.

## Verification

- `./node_modules/.bin/vitest run src/lib/__tests__/sanitize.test.ts` → 16 passed (11 existing + 2 here + 3 in FIX-B3). The pre-existing tests `'removes system-family tags including attributes'` (`</system>`, `<system role="x">`) and the NFKC fullwidth test (`＜system＞hello` → `hello`) MUST stay green — the lookahead accepts `>`, space, and `/`.
- `./node_modules/.bin/tsc --noEmit` → exit 0.

## Out of scope / STOP

- Do NOT expand or shrink the delimiter name list.
- Behavior change accepted and intended: `<userdata>`-style prefix tags are no longer stripped — that is the point; they were never delimiters.
- STOP if `sanitize.ts:27-35` differs from the excerpt.

---

# FIX-B3 (REVB-3, P2) — stripInvisibles deletes ZWJ (composed emoji) and merges separator-joined words

## Context

`src/lib/sanitize.ts:16-25` (regex shown with the exact escape sequences used in source):

```ts
export function stripInvisibles(text: string): string {
  let cleaned = text;
  // Unicode normalization to catch homoglyph bypasses
  try { cleaned = cleaned.normalize("NFKC"); } catch {}
  // Strip zero-width characters used for invisible payload injection
  cleaned = cleaned.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, "");
  ...
```

`U+200D` (ZWJ, inside `200B-200F`) is deleted → a composed family emoji ('\u{1F468}\u200D\u{1F469}\u200D\u{1F467}') decomposes into separate glyphs in the model input; `U+2028/2029` (line/paragraph separators) are deleted → `'line1\u2028line2'` becomes `'line1line2'` (words merged); `U+202F` narrow NBSP is deleted in the no-normalize fallback path (NFKC already maps it to a plain space on the happy path). Journal entries (`journal.tsx:707` on mobile) flow through this on go-deeper.

## Failing tests FIRST

Extend `src/lib/__tests__/sanitize.test.ts` inside `describe('stripInvisibles', ...)`. **Type the `\uXXXX` escape sequences exactly as written — never paste literal invisible characters into the test file:**

```ts
  it('preserves ZWJ emoji sequences (REVB-3)', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'; // composed family emoji, ZWJ-joined
    expect(stripInvisibles(family)).toBe(family);
  });
  it('converts line/paragraph separators to newlines instead of merging words (REVB-3)', () => {
    expect(stripInvisibles('line1\u2028line2')).toBe('line1\nline2');
    expect(stripInvisibles('para1\u2029para2')).toBe('para1\npara2');
  });
  it('still strips bidi controls and narrow-NBSP never merges words', () => {
    expect(stripInvisibles('a\u202Eb')).toBe('ab');      // RLO stripped
    expect(stripInvisibles('a\u200Bb')).toBe('ab');      // ZWSP stripped
    expect(stripInvisibles('12\u202Fh')).toBe('12 h');   // NNBSP → space (via NFKC and the explicit fallback)
  });
```

**Why they fail today:** test 1 — ZWJ deleted → joined glyphs string ≠ input. Test 2 — separators deleted → `'line1line2'`/`'para1para2'`. Test 3's first two assertions pass today; the NNBSP assertion passes via NFKC today and pins the fallback path after the fix.

## Minimal fix

Replace the single character-class line (line 21) with (escapes verbatim):

```ts
  // Line/paragraph separators become newlines — never merge words (REVB-3)
  cleaned = cleaned.replace(/[\u2028\u2029]/g, "\n");
  // Narrow NBSP → plain space (NFKC normally does this; keep the fallback)
  cleaned = cleaned.replace(/\u202F/g, " ");
  // Strip zero-width + bidi-control characters used for invisible payload
  // injection — PRESERVING U+200D (ZWJ): composed emoji are legitimate
  // journal text (REVB-3).
  cleaned = cleaned.replace(/[\u200B\u200C\u200E\u200F\u202A-\u202E\uFEFF]/g, "");
```

Enumerating the new exclusion bounds (vault: `enumerate-excluded-populations-for-every-filter-bound`): kept-and-stripped = ZWSP `200B`, ZWNJ `200C` (English-language app; not in scope to preserve), LRM/RLM `200E/200F`, bidi embeddings/overrides `202A-202E`, BOM `FEFF`. Kept-and-preserved = ZWJ `200D`. Transformed = `2028/2029 → \n`, `202F → space`. Control-char pass (line 23) unchanged.

## Verification

- `./node_modules/.bin/vitest run src/lib/__tests__/sanitize.test.ts` → 16 passed (shared gate with FIX-B2). Pre-existing `'removes zero-width and control characters, keeps newlines/tabs'` (its fixture embeds a literal U+200B) must stay green.
- `grep -c "\u200D" src/lib/sanitize.ts` → 0 (ZWJ appears in no strip class; preserved by omission).
- `./node_modules/.bin/tsc --noEmit` → exit 0.

## Out of scope / STOP

- Do NOT preserve ZWNJ/word-joiner/variation selectors beyond ZWJ — match the finding, nothing more.
- Do NOT reorder NFKC after the strip passes.
- STOP if `sanitize.ts:16-25` differs from the excerpt.

---

# FIX-B4 (REVB-8, NIT) — bug-report Sentry capture sends 2000 chars of raw body (device bundle and all)

## Context

`src/index.ts:797-812`:

```ts
app.post("/api/bug-report/email", authMiddleware, rateLimitMiddleware, (req: Request, res: Response) => {
  const uid = req.uid ?? "anon";
  let bodyPreview = "<unserializable>";
  try {
    bodyPreview = JSON.stringify(req.body).slice(0, 2000);
  } catch {}
  ...
    scope.setExtra("bodyPreview", bodyPreview);
```

Mobile sends `{source, label?, userNote?, report:{triageSummary,…}}` up to 5MB including a device bundle; the PD-3 inline justification covers the uid only. Scrub: keep only the four triage-relevant string fields, each length-capped; drop the device bundle and everything else.

## Failing test FIRST

New `src/lib/__tests__/bug-report-preview.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildBugReportPreview } from '../bug-report-preview';

describe('buildBugReportPreview', () => {
  it('keeps only triage fields and drops the device bundle (REVB-8)', () => {
    const preview = buildBugReportPreview({
      source: 'settings',
      label: 'Crash on save',
      userNote: 'it broke',
      report: { triageSummary: 'TypeError at X', device: { model: 'iPhone15,2', os: '18.1' }, logs: ['…'] },
      device: { locale: 'en-US' },
    });
    expect(preview).toEqual({
      source: 'settings',
      label: 'Crash on save',
      userNote: 'it broke',
      triageSummary: 'TypeError at X',
    });
  });
  it('caps field lengths by formula (userNote 500, triageSummary 1000, source 100, label 200)', () => {
    const preview = buildBugReportPreview({
      source: 'x'.repeat(150),
      label: 'y'.repeat(300),
      userNote: 'z'.repeat(600),
      report: { triageSummary: 'w'.repeat(1500) },
    });
    expect(preview.source).toHaveLength(100);
    expect(preview.label).toHaveLength(200);
    expect(preview.userNote).toHaveLength(500);
    expect(preview.triageSummary).toHaveLength(1000);
  });
  it('tolerates non-object bodies', () => {
    expect(buildBugReportPreview(null)).toEqual({});
    expect(buildBugReportPreview('raw string')).toEqual({});
  });
  it('tolerates a missing report object', () => {
    expect(buildBugReportPreview({ source: 's' })).toEqual({ source: 's' });
  });
});
```

**Why it fails today:** module does not exist — red at collection. (Note: `toEqual` ignores `undefined`-valued keys, so `{source:'s'}` matches a preview whose other fields are `undefined`.)

## Minimal fix

1. New `src/lib/bug-report-preview.ts`:

```ts
/**
 * Sentry extra for a bug report: ONLY the fields an operator needs to triage,
 * each length-capped. Never the raw body — mobile attaches a device bundle
 * and log excerpts that exceed the PII the PD-3 justification covers (REVB-8).
 */
export interface BugReportPreview {
  source?: string;
  label?: string;
  userNote?: string;
  triageSummary?: string;
}

export function buildBugReportPreview(body: unknown): BugReportPreview {
  const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const report = (obj.report && typeof obj.report === "object" ? obj.report : {}) as Record<string, unknown>;
  const pick = (value: unknown, cap: number): string | undefined =>
    typeof value === "string" && value.length > 0 ? value.slice(0, cap) : undefined;
  return {
    source: pick(obj.source, 100),
    label: pick(obj.label, 200),
    userNote: pick(obj.userNote, 500),
    triageSummary: pick(report.triageSummary, 1000),
  };
}
```

2. `src/index.ts`: import `buildBugReportPreview` from `./lib/bug-report-preview`; replace lines 799-802 (`let bodyPreview ... } catch {}`) with `const bodyPreview = buildBugReportPreview(req.body);`. The `setExtra("bodyPreview", bodyPreview)` line and everything else stays (uid stays — PD-3 covers it).

## Verification

- `./node_modules/.bin/vitest run src/lib/__tests__/bug-report-preview.test.ts` → 4 passed.
- `grep -n "JSON.stringify(req.body)" src/index.ts` → 0 hits.
- `./node_modules/.bin/tsc --noEmit` → exit 0.

## Out of scope / STOP

- Do NOT add new captured fields or change the route's response/auth/rate-limit.
- STOP if `index.ts:797-812` differs from the excerpt.

---

# FIX-B5 (REVB-6, P2) — changed-context onboarding resubmission silently returns the stale job: keep dedup, log a structured notice

## Context — documented decision

`src/routes/jobs.ts:233-264`: `resolvedDevotionalId` for onboarding is now deterministic (`onboarding-sample-${uid}`, BCOST-2), so re-submitting with CHANGED `userContext` while the previous job is pending/processing returns the stale job as a dedup-200; the new context is silently discarded. **Decision (per advisor recommendation): KEEP the dedup** — it is the BCOST-2 cost guard; the window is bounded by pending/processing; the real onboarding flow does not resubmit with changed context; mobile build 218 accepts any 2xx and already pins the deterministic id. The gap to close is **observability**: make the discard visible in Railway logs and documented in code.

## Failing test FIRST

Extend `src/routes/__tests__/jobs-onboarding-dedup.test.ts` (2 existing tests; `selectLimitMock` drives the dedup select — for onboarding jobs it is the FIRST select hit, verified against the route: no owned-devotional or completed-job select runs for `jobType==='onboarding'`):

```ts
  it('dedup-hit with CHANGED userContext logs a structured stale-context notice (REVB-6)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    selectLimitMock.mockResolvedValue([
      { id: 'existing-job', inputData: { context: { name: 'OLD' } } },
    ]);

    const response = await fetch(`http://127.0.0.1:${address.port}/api/jobs/generate-day`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dayNumber: 1, jobType: 'onboarding', userContext: { name: 'NEW' } }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      jobId: 'existing-job',
      status: 'pending',
      deduplicated: true,
    });
    expect(insertedJobs).toHaveLength(0); // dedup behavior unchanged
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dedup-stale-context'));
    warnSpy.mockRestore();
  });

  it('dedup-hit with IDENTICAL userContext logs no stale-context notice', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    selectLimitMock.mockResolvedValue([
      { id: 'existing-job', inputData: { context: { name: 'N' } } },
    ]);

    const response = await fetch(`http://127.0.0.1:${address.port}/api/jobs/generate-day`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dayNumber: 1, jobType: 'onboarding', userContext: { name: 'N' } }),
    });

    expect(response.status).toBe(200);
    const calls = warnSpy.mock.calls.filter((c) => String(c[0]).includes('dedup-stale-context'));
    expect(calls).toHaveLength(0);
    warnSpy.mockRestore();
  });
```

**Why test 1 fails today:** the dedup select fetches only `{ id }` and no notice is logged — `warnSpy` never receives a `dedup-stale-context` call.

## Minimal fix

In `src/routes/jobs.ts`:

1. Extend the dedup select (lines 242-254) to also fetch input data: `.select({ id: schema.generationJobs.id, inputData: schema.generationJobs.inputData })`.
2. Inside `if (existingJob) {` (line 256), before the `res.status(200)`:

```ts
      // BCOST-2 accepted residual (REVB-6, documented decision): an active
      // job's context wins — a resubmission with CHANGED userContext during
      // the pending/processing window is deduped and its new context
      // discarded. Bounded window; mobile does not resubmit with changed
      // context in the real flow. The notice below makes any occurrence
      // observable in Railway logs.
      if ((jobType === "initial_arc" || jobType === "onboarding") && userContext) {
        const existingContext = (existingJob.inputData as { context?: unknown } | null)?.context;
        if (
          existingContext !== undefined &&
          JSON.stringify(existingContext) !== JSON.stringify(userContext)
        ) {
          console.warn(
            `[jobs] dedup-stale-context jobType=${jobType} uid=${uid} jobId=${existingJob.id} — active job retains original userContext; resubmitted context discarded`,
          );
        }
      }
```

(`initial_arc` shares the same dedup path and inputData shape `{ context }`; covering it costs nothing.)

## Verification

- `./node_modules/.bin/vitest run src/routes/__tests__/jobs-onboarding-dedup.test.ts` → 4 passed (2 existing + 2 new).
- `./node_modules/.bin/vitest run src/routes/__tests__/jobs-initial-arc.test.ts src/routes/__tests__/jobs-find-completed.test.ts src/routes/__tests__/jobs-retry.test.ts` → pass, unchanged counts (regression guard: the widened select shape must not break their mocks; if any of these fixtures return rows the new code reads `inputData` from, `undefined` falls through the `!== undefined` guard safely).
- `./node_modules/.bin/tsc --noEmit` → exit 0.

## Out of scope / STOP

- Do NOT cancel/replace the active job or re-key the devotionalId by context hash — that re-opens the BCOST-2 duplicate-billing hole.
- Do NOT change the 23505 race-recovery path (jobs.ts:312+).
- STOP if jobs.ts:233-264 differs from the excerpt.

---
---

# FINAL GATES (run after all fixes, per repo)

**MOBILE** (`/Users/galangster/clawd/work/unfold-audit`):

1. `npm run typecheck` → exit 0. `npm run lint` → exit 0.
2. Per-file gates, expected counts: `sync-outbox` 9, `streak-helpers` 33, `bible-highlight-overlap` 9, `listener-registration` 5, `devotional-read-sync` 4, `full-reset` 5, `mmkv-open-mode` 6.
3. `npm test -- --silent` → 0 failures (count grows by +13 over the pre-plan total; record both numbers).
4. FIX-R5 staging gate response recorded; FIX-R9 runtime-gate evidence recorded with post-fix timestamps.

**BACKEND** (`/Users/galangster/clawd/work/unfold-backend-audit`):

1. `./node_modules/.bin/tsc --noEmit` → exit 0.
2. `./node_modules/.bin/vitest run` → 0 failures, 127 passed (116 + 5 sanitize + 4 bug-report-preview + 2 jobs-dedup).
3. FIX-B1 grep gates (exactly one `startCron()` call site, inside the `COMPONENTS.cron` block).

# OUT OF SCOPE for this plan (recorded so nothing silently disappears)

- **REVM-9 (NIT)** — decision-helper proliferation in `paywall-purchase-readiness.ts` / `push-notification-helpers.ts`: style-only; deliberately skipped (its full text is also truncated in REVIEW-RESULTS.md).
- **REVB-4, REVB-5, REVB-7 (NITs)** — comment-accuracy fixes ("byte-identical" → "no phrase-level stripping"; single-owner header scoping; mode.ts doc slips). Cheap but not in the confirmed-fix mandate; fold into any future backend pass.
- **REVC-3 residual** — device-id churn during a recovery-mode session (Keychain down + empty recovery mirror): strictly better than the pre-fix wipe; accepted residual, no fix designed.
- **REVC-4 residual** — `sanitizeContextField` in backend `companion-prompt.ts:42-75` is a third sanitizer copy contradicting sanitize.ts's single-owner header: follow-up to fold onto sanitize.ts primitives or scope the comment; NOT this plan (it predates the audit and is independently sanitized).
- **Deploy-time actions** — Railway `MODE=api` env change, any prod deploy, App Review submission: Nick-gated, never executor actions.
- **Global STOP rule** — any excerpt-vs-tree mismatch, any pre-existing test that needs editing to stay green (other than those explicitly listed), or any staging-gate rejection: STOP and report; do not improvise.
