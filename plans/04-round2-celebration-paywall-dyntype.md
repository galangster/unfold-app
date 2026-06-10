# Plan 04 — Round 2: streak celebration day-flip, paywall close/disclosure/a11y, You-tab Dynamic Type

**Repo:** Unfold mobile app (`unfold-app`), worktree `/Users/galangster/clawd/work/unfold-audit`.
**Base commit:** `11a8151` (`fix(A11Y-1): gate all infinite withRepeat loops behind useReducedMotion across 13 files [audit]`).
This is CURRENT HEAD of the audit branch — round-1 fix commits (NET-15, DAT-*, A11Y-2/4, UX-1/2, …) are already
landed on top of build-218 base `9f36ef6`. **All code excerpts and line numbers in this plan were read at
`11a8151`. Work directly on top of `11a8151`.** If `git rev-parse HEAD` is not `11a8151`, re-verify every
excerpt against the actual file before editing; if any excerpt no longer matches, STOP and report.

**Findings covered:**
- FIX-1: COR-7 (P2) + COR-8 (P2) — duplicate/missing StreakCelebration. **Decision already made by Nick
  (implement, do not re-litigate): celebration fires once per CALENDAR DAY, keyed off the streak engine's
  day-flip.**
- FIX-2: RT-PAYWALL-1 (P1) — paywall close button (**decided: paywall gets a close button**).
- FIX-3: RT-PAYWALL-2 (P1) + RT-PAYWALL-8 (TASTE) — annual charge disclosure (**decided: visible annual price
  disclosure**).
- FIX-4: RT-PAYWALL-4 (P2) radio roles, RT-PAYWALL-6 (P2) comparison icon labels, RT-PAYWALL-3 (P2) SAVE badge
  contrast — cheap same-file P2s folded in.
- FIX-5: RT-DYN-1 (P1) + RT-DYN-2 (P2, same root cause) — You-tab Preferences rows fragment at XXL Dynamic Type.
- RT-NOTIF-3 (P1): **ALREADY COVERED by round-1 NET-15 (commit `6a352e8`) — no code change. See §6 for the
  verification the executor must still run.**

**Explicitly out of scope:** COR-9, COR-10, RT-PAYWALL-5, RT-PAYWALL-7, RT-DYN-3, RT-DYN-4, RT-DYN-5,
RT-NOTIF-1/2/4/5/6, all widget findings (RT-WIDGETS-*, separate build-219 batch), RT-REDUCE-MOTION-1/2,
RT-LIFECYCLE-1. Do not "improve" anything outside the excerpts below.

**Dependency order:** all five fixes are independent of each other. Suggested order: FIX-1 → FIX-2 → FIX-3 →
FIX-4 → FIX-5 (FIX-2/3/4 all touch `src/app/paywall.tsx`; do them in that order to keep the excerpts' line
anchors valid — each fix's "current code" excerpt is quoted with enough surrounding context to locate it even
after the previous fix shifted line numbers).

**Verified baselines at `11a8151` (executor: re-run these FIRST; if they don't match, STOP and report):**

```
npm run typecheck      # exits 0, no output after the tsc banner
npx jest               # Test Suites: 108 passed, 108 total / Tests: 723 passed, 723 total
```

**Worktree hygiene:** `ios/Podfile.lock` is locally modified in this worktree. Leave it alone; never stage or
commit it. Commit one commit per fix, message style matching round 1, e.g.
`fix(COR-7,COR-8): celebration fires once per calendar day off streak day-flip [audit]`, ending with
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

**General conventions:**
- TypeScript, 2-space indent, single quotes, semicolons, trailing commas in multiline literals.
- Pure logic lives in small `src/lib/*.ts` modules with tests in `src/lib/__tests__/*.test.ts`. Alias `@/` → `src/`.
- Tests are plain jest `describe`/`it`/`expect` (`@react-native/jest-preset`); no test renderer. Source-contract
  tests (read the file with `fs`, assert on strings) are an established pattern here — see
  `src/lib/__tests__/onboarding-paywall-a11y-contract.test.ts`.
- Do NOT add dependencies. Do NOT touch the store persist version or `store-migrations.ts` — this plan introduces
  no persisted fields.
- Vault rules in force: deterministic helpers receive `now` as a parameter; invariants must hold on every
  construction/update path; no bounce animations (none introduced here).

---

## FIX-1 — COR-7 + COR-8: StreakCelebration fires once per calendar day, keyed off the streak day-flip

### Files
- `src/lib/streak-helpers.ts` (add two pure exports at end of file)
- `src/app/(tabs)/(today)/index.tsx` (replace the trigger)
- `src/lib/__tests__/streak-helpers.test.ts` (table-driven tests)
- NEW `src/lib/__tests__/today-celebration-contract.test.ts` (source contract)

### Context the executor needs

The Today screen currently triggers the full-screen `StreakCelebration` overlay on a `hasReadToday`
false→true flip, where `hasReadToday` is **per-CURRENT-devotional** (checks only the active devotional's
`days[].readAt`). Two bugs:

- **COR-7 (duplicate "+1"):** read series A today (celebration #1) → open any day of series B (series-detail tap,
  highlights tap, library deep-link — `reading.tsx` mirrors any `devotionalId` param into
  `setCurrentDevotional`) → `hasReadToday` drops to false → complete B's day → flips true again → a SECOND
  celebration plays, while `recordStreakRead` was a same-day no-op (the streak did NOT increment — the overlay
  lies).
- **COR-8 (missing celebration after midnight):** the memo's deps are `[currentDevotionalId, devotionals]` but
  the helper calls `new Date()` internally, so `hasReadToday` stays stale-true across midnight while Today is
  mounted. A user reading shortly after midnight gets NO celebration: when `markDayAsRead` changes `devotionals`,
  the memo recomputes directly to `true`, so the false→true flip never happens.

The correct signal is the **unified streak engine's** own state. `streakLastReadDate` (store field) is written by
exactly ONE production path: `recordStreakRead` (store.ts:1304-1321) → `applyStreakRead`
(`src/lib/streak-helpers.ts:162-202`), which returns `null` on same-day re-reads (key invariant: the timestamp's
calendar day changes **at most once per calendar day**). Verified by fresh grep at plan time — the only other
writers are two QA seeds in `src/app/debug-seed-today.tsx` (lines 454, 534; seeding a today-read firing a
celebration is acceptable QA behavior). No server-sync path writes it. `reconcileStreakState` (foreground
reconcile via `src/hooks/useStreakReconcile.ts`) writes `streakCurrent`/grace/week fields but never
`streakLastReadDate`. Bonus alignment: `src/lib/widget-bridge.ts:39-40` already defines the widget's
`hasReadToday` from `streakLastReadDate` `toDateString()` — this fix makes the celebration agree with the widget
definition (shrinks COR-9's blast radius without touching it).

### Current code (read at `11a8151`)

`src/app/(tabs)/(today)/index.tsx:344-356`:

```tsx
  // Check if today's reading has been completed — drives ember visibility
  const hasReadToday = useMemo(() => (
    hasReadDevotionalToday({ devotionals, currentDevotionalId })
  ), [currentDevotionalId, devotionals]);

  // Streak celebration: show once when hasReadToday flips from false->true
  const [showCelebration, setShowCelebration] = useState(false);
  const prevHasReadToday = usePrevious(hasReadToday);
  useEffect(() => {
    if (hasReadToday && prevHasReadToday === false) {
      setShowCelebration(true);
    }
  }, [hasReadToday, prevHasReadToday]);
```

Supporting facts, all verified at `11a8151`:
- `clockNow` already exists in this component: `const [clockNow, setClockNow] = useState(() => new Date());` at
  line 235, refreshed every 60s by an interval effect at lines 242-247.
- `hasReadDevotionalToday` (`src/lib/home-devotional-state.ts:38-56`) already accepts an optional `now?: Date`
  parameter (defaults to `new Date()`).
- Store selectors live at lines 108-138; `streakCurrent` is selected at line 116. `streakLastReadDate` is NOT
  currently selected in this file — you will add it.
- `usePrevious` (`src/hooks/usePrevious.ts`) returns `undefined` on the first render. Keep its import — the new
  trigger still uses it.
- `prevHasReadToday` has NO other consumer in this file (verified by grep) — safe to delete.
- The overlay mount at lines 1344-1350 (`{showCelebration && (<StreakCelebration streak={streakCurrent} …`)
  stays AS-IS. `StreakCelebration` is consumed nowhere else (grep-verified).
- This file currently has NO import from `@/lib/streak-helpers`.

### Step 1 — failing tests first

Append this describe block to `src/lib/__tests__/streak-helpers.test.ts` (imports: add `getStreakDayKey,
shouldCelebrateStreakDayFlip` to the existing import from `'../streak-helpers'`). Run `npx jest streak-helpers`
— the new tests must FAIL (functions don't exist yet) while the existing ones still pass.

```ts
describe('streak celebration day-flip gate (COR-7/COR-8)', () => {
  it('derives a calendar-day key from streakLastReadDate', () => {
    expect(getStreakDayKey(null)).toBeNull();
    expect(getStreakDayKey('2026-06-10T08:30:00.000Z')).toBe(
      new Date('2026-06-10T08:30:00.000Z').toDateString(),
    );
  });

  const TODAY = new Date('2026-06-10T12:00:00.000Z').toDateString();
  const YESTERDAY = new Date('2026-06-09T12:00:00.000Z').toDateString();

  it.each([
    // [label, prevDayKey, dayKey, todayKey, expected]
    ['first-ever read today fires', null, TODAY, TODAY, true],
    ['yesterday→today flip fires (post-midnight session, COR-8)', YESTERDAY, TODAY, TODAY, true],
    ['mount with an already-read today never fires (prev undefined)', undefined, TODAY, TODAY, false],
    ['same-day re-read never fires (key unchanged, COR-7)', TODAY, TODAY, TODAY, false],
    ['no read recorded never fires', null, null, TODAY, false],
    ['flip to a non-today day never fires (QA seed of historic read)', null, YESTERDAY, TODAY, false],
    ['read date wiped (reset) never fires', TODAY, null, TODAY, false],
  ] as const)('%s', (_label, prevDayKey, dayKey, todayKey, expected) => {
    expect(shouldCelebrateStreakDayFlip({ prevDayKey, dayKey, todayKey })).toBe(expected);
  });
});
```

### Step 2 — add the pure helpers

Append to the END of `src/lib/streak-helpers.ts` (after `reconcileStreakState`):

```ts
/**
 * Calendar-day key for the unified streak engine's last-read timestamp.
 * toDateString() matches the day arithmetic used by decideStreakContinuation
 * and by widget-bridge's hasReadToday, so all "did I read today" definitions
 * derived from the engine agree.
 */
export function getStreakDayKey(streakLastReadDate: string | null): string | null {
  return streakLastReadDate ? new Date(streakLastReadDate).toDateString() : null;
}

export type StreakCelebrationFlipInput = {
  /** Day key from the previous render; undefined = first render after mount. */
  prevDayKey: string | null | undefined;
  /** Day key for the current render. */
  dayKey: string | null;
  /** Fresh calendar-day key for "now" — compute at event time, not render time. */
  todayKey: string;
};

/**
 * Celebrate at most once per calendar day: only when the streak engine's
 * last-read day key CHANGES (day-flip) and lands on today (COR-7/COR-8).
 * - Mount/remount never fires (prevDayKey undefined — no observed transition).
 * - Same-day re-reads never fire: recordStreakRead is a same-day no-op, so
 *   streakLastReadDate (and therefore the key) never changes (kills COR-7).
 * - A flip observed across midnight (yesterday→today) fires (kills COR-8).
 * - A flip to a non-today day (historic QA seed, clock rollback) never fires.
 */
export function shouldCelebrateStreakDayFlip({
  prevDayKey,
  dayKey,
  todayKey,
}: StreakCelebrationFlipInput): boolean {
  if (prevDayKey === undefined) return false;
  if (dayKey === null) return false;
  if (dayKey === prevDayKey) return false;
  return dayKey === todayKey;
}
```

`npx jest streak-helpers` must now be fully green.

### Step 3 — rewire the Today screen

In `src/app/(tabs)/(today)/index.tsx`:

(a) Add the import (the file has no streak-helpers import yet; put it next to the other `@/lib/` imports):

```tsx
import { getStreakDayKey, shouldCelebrateStreakDayFlip } from '@/lib/streak-helpers';
```

(b) Add the selector directly below the existing `streakCurrent` selector at line 116:

```tsx
  const streakCurrent = useUnfoldStore((s) => s.streakCurrent);
  const streakLastReadDate = useUnfoldStore((s) => s.streakLastReadDate);
```

(c) Replace the entire block quoted in "Current code" above (lines 344-356) with:

```tsx
  // Check if today's reading has been completed — drives ember visibility.
  // clockNow in deps + passed as `now`: recomputes each minute so "today"
  // stays fresh across midnight while the screen stays mounted (COR-8).
  const hasReadToday = useMemo(() => (
    hasReadDevotionalToday({ devotionals, currentDevotionalId, now: clockNow })
  ), [currentDevotionalId, devotionals, clockNow]);

  // Streak celebration: once per calendar day, keyed off the unified streak
  // engine's day-flip. streakLastReadDate is only written by recordStreakRead,
  // which is a same-day no-op — so the key flips at most once per day and
  // devotional switches cannot re-fire a misleading "+1" (COR-7).
  const streakDayKey = getStreakDayKey(streakLastReadDate);
  const prevStreakDayKey = usePrevious(streakDayKey);
  const [showCelebration, setShowCelebration] = useState(false);
  useEffect(() => {
    if (shouldCelebrateStreakDayFlip({
      prevDayKey: prevStreakDayKey,
      dayKey: streakDayKey,
      todayKey: new Date().toDateString(),
    })) {
      setShowCelebration(true);
    }
  }, [streakDayKey, prevStreakDayKey]);
```

Notes:
- `usePrevious(hasReadToday)` and the old effect are GONE. Nothing else may keep a `prevHasReadToday` binding.
- `hasReadToday` itself (the memo) keeps all its ~12 other consumers (embers, bridge day number, evening window,
  devotionalState, etc.) — only the deps/`now` change. Do not rename it.
- `todayKey` is computed inside the effect (event time), not at render time — vault rule
  `deterministic-paths-must-receive-now-as-parameter` applied at the call boundary.
- The overlay mount (`{showCelebration && (<StreakCelebration streak={streakCurrent} onComplete={() =>
  setShowCelebration(false)} />)}`) is untouched. After this fix, when the celebration fires the streak HAS
  actually changed (engine counted the read), so `streakCurrent` shown by the overlay is truthful.

### Step 4 — source-contract test

Create `src/lib/__tests__/today-celebration-contract.test.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const src = fs.readFileSync(
  path.join(sourceRoot, 'app/(tabs)/(today)/index.tsx'),
  'utf-8',
);

describe('Today streak celebration contract (COR-7/COR-8)', () => {
  it('triggers the celebration through the shared day-flip gate, not hasReadToday flips', () => {
    expect(src).toContain('shouldCelebrateStreakDayFlip({');
    expect(src).toContain('getStreakDayKey(streakLastReadDate)');
    expect(src).not.toContain('prevHasReadToday');
  });

  it('keeps the hasReadToday memo fresh across midnight (clockNow in deps and as now)', () => {
    expect(src).toContain('hasReadDevotionalToday({ devotionals, currentDevotionalId, now: clockNow })');
    expect(src).toContain('), [currentDevotionalId, devotionals, clockNow]);');
  });
});
```

### Verification gate (FIX-1)

```
npx jest streak-helpers today-celebration-contract   # all green, includes the 7-row table
npm run typecheck                                     # exits 0
npx jest                                              # 109 suites (was 108), 0 failures
```

Manual (OPTIONAL, only if a simulator is already running): seed via `/debug-seed-today` "read today" path —
celebration fires once; re-completing another series' day the same day does NOT re-fire it.

### STOP-on-drift (FIX-1)
- The "Current code" block at index.tsx:344-356 doesn't match byte-for-byte → STOP.
- You find any additional production writer of `streakLastReadDate` beyond `recordStreakRead` + the two
  debug-seed lines → STOP and report (the trigger-safety argument depends on it).
- You feel the need to persist a "lastCelebratedDate" field → STOP; the design intentionally avoids new
  persisted state (mount-guard + same-day-no-op already give once-per-day).

---

## FIX-2 — RT-PAYWALL-1: working close (X) button on /paywall

### Files
- `src/app/paywall.tsx`
- NEW `src/lib/__tests__/paywall-a11y-contract.test.ts` (shared with FIX-3/FIX-4 — create it here, extend there)

### Root cause — read this before editing

`paywall.tsx` ALREADY contains a close button (lines 983-1002) — but it has never rendered at runtime. Runtime
evidence: `/tmp/unfold-e2e-audit-2026-06/runtime/paywall/paywall--deeplink-dark.png`, `paywall--top--light.png`
(no X anywhere), `paywall-a11y-tree-dark.json` (zero dismiss elements). Cause: the file imports
`TouchableOpacity` from **`react-native-gesture-handler`** (line 4). RNGH's `GenericTouchable` renders
`<BaseButton style={containerStyle}><Animated.View style={style}>…` — i.e. the `style` prop goes to an INNER
view; layout/positioning must go on `containerStyle`. The close button passes `position:'absolute', top:
insets.top + 8, right: 16` via `style`, so the inner view is absolutely positioned **relative to the unstyled
outer BaseButton**, which sits in normal flow after the sticky footer with zero height — the X lands off-screen
below the sheet, unreachable and excluded from the a11y tree. (The plan chips/CTA/Restore work because they're in
normal flow.) This is also why build 218's shipped paywall has NO discoverable close affordance — only the iOS
sheet swipe-down.

Fix: render the X **inside the planned "Unfold icon + close button row"** (line 557 comment names it) using
React Native's `Pressable` (immune to the RNGH style split), and DELETE the broken absolute button.

### Entry-point semantics — enumerated (no non-dismissable entries exist)

All 12 production entry points push `/paywall` with NO `source` param (grep-verified at `11a8151`):
`share-card.tsx:451`, `(you)/index.tsx:232,242,256,265,573`, `(you)/checkin-schedule.tsx:183`,
`(you)/past-devotionals.tsx:562`, `PremiumFeatureSheet.tsx:190`, `ExclusiveOfferSheet.tsx:164`,
`useCreationGate.ts:53`. With no source, `resolvePaywallCompletionNavigation` (`src/lib/paywall-guardrails.ts:
32-52`) returns `{ action: 'back' }` → `router.back()` to the pushing screen — correct for every caller. The
creation gate (`useCreationGate.gate()`) already returned `false` to its caller before pushing, so dismissing the
paywall safely means "user declined". The route is `presentation: 'modal'` with default gestures
(`src/app/_layout.tsx:162-168` — no `gestureEnabled: false`), so swipe-down dismissal ALREADY works from every
entry (runtime-confirmed: `paywall--dismissed-swipe--light.png`); the X adds a discoverable, accessible
equivalent and no new escape path. The only dismissal block is mid-purchase: `handleClose` (lines 384-389)
guards `if (isPurchasing) return;` — keep routing through it.

### Current code (read at `11a8151`)

`src/app/paywall.tsx:556-564` (inside the ScrollView):

```tsx
        <View style={{ paddingHorizontal: Spacing['7'], paddingTop: insets.top }}>
          {/* Unfold icon + close button row */}
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing['6'] }}>
            <Image
              source={require('@/app/icon-paywall-light.png')}
              style={{ width: 28, height: 28, tintColor: colors.accent, opacity: 0.8 }}
              resizeMode="contain"
            />
          </Animated.View>
```

`src/app/paywall.tsx:983-1002` (the broken, never-rendered button — to DELETE, including its comment):

```tsx
      {/* Close button — absolute, top right */}
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={handleClose}
        disabled={isPurchasing}
        accessibilityLabel="Close paywall"
        accessibilityRole="button"
        accessibilityState={{ disabled: isPurchasing }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{
          position: 'absolute',
          top: insets.top + 8,
          right: 16,
          padding: 8,
          opacity: isPurchasing ? 0.5 : 1,
          zIndex: 10,
        }}
      >
        <XIcon size={22} color={colors.textMuted} weight="light" />
      </TouchableOpacity>
```

### Edits

(a) Line 2 — add `Pressable` to the react-native import:

```tsx
import { View, Text, ActivityIndicator, Linking, ScrollView, Image, StyleSheet, Platform, Pressable } from 'react-native';
```

(b) Replace the icon row (the first excerpt's `Animated.View`) with:

```tsx
          {/* Unfold icon + close button row */}
          <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing['6'] }}>
            <Image
              source={require('@/app/icon-paywall-light.png')}
              style={{ width: 28, height: 28, tintColor: colors.accent, opacity: 0.8 }}
              resizeMode="contain"
            />
            {/* RN Pressable, NOT the RNGH TouchableOpacity imported above: RNGH
                touchables apply `style` to an inner view, which is what kept the
                old absolute-positioned close button off-screen (RT-PAYWALL-1). */}
            <Pressable
              onPress={handleClose}
              disabled={isPurchasing}
              accessibilityLabel="Close"
              accessibilityRole="button"
              accessibilityState={{ disabled: isPurchasing }}
              hitSlop={6}
              style={{
                width: 44,
                height: 44,
                marginVertical: -8,
                marginRight: -11,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isPurchasing ? 0.5 : 1,
              }}
            >
              <XIcon size={22} color={colors.textMuted} weight="light" />
            </Pressable>
          </Animated.View>
```

Why these values: 44×44 = the required minimum target (plus `hitSlop 6` → 56pt effective); `marginVertical: -8`
keeps the row's visual height at the original 28pt so the hero block does not shift; `marginRight: -11` optically
aligns the 22pt glyph with the content's right edge (`(44-22)/2 = 11`). `accessibilityLabel="Close"` is the
decided label. `XIcon` is already imported (line 11). `handleClose` already exists (lines 384-389) and routes
through the completion-nav matrix described above — do NOT write new navigation logic.

(c) Delete the entire broken absolute button block (second excerpt, lines 983-1002) including the
`{/* Close button — absolute, top right */}` comment. The next sibling (`{/* Purchase loading overlay */}`)
must now directly follow the closing `</View>` of the footer.

### Step — contract test

Create `src/lib/__tests__/paywall-a11y-contract.test.ts` (FIX-3/FIX-4 will append to it):

```ts
import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const src = fs.readFileSync(path.join(sourceRoot, 'app/paywall.tsx'), 'utf-8');

describe('paywall close button (RT-PAYWALL-1)', () => {
  it('renders the close affordance with an RN Pressable (RNGH touchables strand absolute styles off-screen)', () => {
    expect(src).toMatch(/import \{[^}]*Pressable[^}]*\} from 'react-native'/);
    expect(src).toContain('accessibilityLabel="Close"');
  });

  it('removed the never-rendered absolute RNGH close button', () => {
    expect(src).not.toContain('accessibilityLabel="Close paywall"');
    expect(src).not.toContain("position: 'absolute',\n          top: insets.top + 8,");
  });

  it('close button routes through handleClose (completion-nav matrix) and blocks mid-purchase', () => {
    const pressableStart = src.indexOf('<Pressable');
    expect(pressableStart).toBeGreaterThan(-1);
    const pressableBlock = src.slice(pressableStart, src.indexOf('</Pressable>'));
    expect(pressableBlock).toContain('onPress={handleClose}');
    expect(pressableBlock).toContain('disabled={isPurchasing}');
  });
});
```

### Verification gate (FIX-2)

```
npx jest paywall-a11y-contract    # green
npm run typecheck                 # exits 0
```

Manual (OPTIONAL, simulator): open You tab → any premium row → paywall shows an X top-right; tap → returns to
You tab. With VoiceOver (or Accessibility Inspector): the element reads "Close, button".

### STOP-on-drift (FIX-2)
- Either excerpt fails to match → STOP.
- You are tempted to keep the absolute-positioned variant "but fixed with containerStyle" → don't; the in-row
  Pressable is the decided design (`paywall.tsx:557` planned row) and avoids the RNGH trap entirely.
- If an X is somehow ALREADY visible at runtime before your change (someone fixed it in parallel) → STOP and report.

---

## FIX-3 — RT-PAYWALL-2 + RT-PAYWALL-8: real annual charge disclosure near the plan selector

### File
- `src/app/paywall.tsx` (+ append to `paywall-a11y-contract.test.ts`)

### Context

The actual annual charge is never displayed: `yearlyPrice` (line 493: `yearlyPackage?.product.priceString ??
'$59.99'`) is only used to extract a currency symbol; the chip and CTA show only the `$5.00/mo` equivalent. The
first time a user sees the real number is Apple's IAP sheet. App Review Guideline 3.1.2 requires the subscription
screen itself to disclose the charge amount and period. **Decided copy: `Billed as {yearlyPrice}/year · Cancel
anytime` sub-label near the plan selector.**

RC-derived price when available + honest fallback is ALREADY what `yearlyPrice`/`monthlyPrice` give you (lines
492-493) — use them verbatim, do not introduce new price math, do not use `yearlyRaw` with a hardcoded `$`
(locale-hostile). When the user is trial-eligible the CTA reads "Start My Free Trial", so the disclosure must
state the post-trial charge (`selectedTrialDuration` at line 243 is e.g. `'3-day'`; mirror ThreeStepPaywall's
precedent of "N days free, then $X/yr" at its lines 961-963).

### Current code (read at `11a8151`)

`src/app/paywall.tsx:751-752` (plan stack opener) and `845-846` (CTA opener) bracket the insertion point. The
monthly chip's closing `</TouchableOpacity>` is followed by:

```tsx
        </View>

        {/* CTA button */}
        <TouchableOpacity
```

(The plan stack opens at line 752 with `<View style={{ gap: Spacing['2'], marginBottom: 14 }}>`.)

### Edits

(a) Change the plan-stack wrapper's `marginBottom: 14` → `marginBottom: 10` (the disclosure supplies the rest of
the spacing; keeps footer height stable).

(b) Insert between the plan stack's closing `</View>` and the `{/* CTA button */}` comment:

```tsx
        {/* Billing disclosure — real charge amount and period (App Review 3.1.2).
            yearlyPrice/monthlyPrice are RC priceStrings with honest fallbacks. */}
        <Text
          style={{
            fontFamily: FontFamily.ui,
            fontSize: FontSize.xs,
            color: colors.textMuted,
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          {selectedPlan === 'yearly'
            ? (isTrialEligible
              ? `${selectedTrialDuration} free trial, then ${yearlyPrice}/year \u00B7 Cancel anytime`
              : `Billed as ${yearlyPrice}/year \u00B7 Cancel anytime`)
            : (isTrialEligible
              ? `${selectedTrialDuration} free trial, then ${monthlyPrice}/month \u00B7 Cancel anytime`
              : `Billed as ${monthlyPrice}/month \u00B7 Cancel anytime`)}
        </Text>
```

The `\u00B7` escapes are LITERAL six-character escapes in the SOURCE template strings (matching the file's
existing style — the separator dots at line 941 use `'\u00B7'`, the hero copy uses `\u2019`). JS renders them as
`·` at runtime, and the contract test below matches the literal `\u00B7` text.

All referenced bindings (`selectedPlan`, `isTrialEligible`, `selectedTrialDuration`, `yearlyPrice`,
`monthlyPrice`, `FontSize`, `FontFamily`) already exist in scope — add nothing else.

### Contract test (append to `paywall-a11y-contract.test.ts`)

```ts
describe('paywall billing disclosure (RT-PAYWALL-2/RT-PAYWALL-8)', () => {
  it('discloses the real annual charge near the plan selector, RC-derived with honest fallback', () => {
    expect(src).toContain('`Billed as ${yearlyPrice}/year \\u00B7 Cancel anytime`');
    expect(src).toContain('`Billed as ${monthlyPrice}/month \\u00B7 Cancel anytime`');
    expect(src).toContain("yearlyPackage?.product.priceString ?? '$59.99'");
  });

  it('states the post-trial charge when trial-eligible', () => {
    expect(src).toContain('`${selectedTrialDuration} free trial, then ${yearlyPrice}/year \\u00B7 Cancel anytime`');
  });
});
```

(In the TEST file, `\\u00B7` — double backslash — produces the literal six-character text `\u00B7`, which is
exactly what the SOURCE template strings contain. Copy both snippets verbatim and they match.)

### Verification gate (FIX-3)

```
npx jest paywall-a11y-contract    # green
npm run typecheck                 # exits 0
```

Manual (OPTIONAL, simulator): paywall shows "Billed as $59.99/year · Cancel anytime" under the chips with Yearly
selected (RC-disabled dev env exercises the fallback — that IS the honest fallback path); selecting Monthly swaps
the line.

### STOP-on-drift (FIX-3)
- The insertion anchors don't match → STOP.
- Do NOT restyle the chips or CTA copy here (the CTA keeps the /mo framing; the disclosure is the legal line).

---

## FIX-4 — same-file paywall P2s: radio roles (RT-PAYWALL-4), comparison icon labels (RT-PAYWALL-6), SAVE badge contrast (RT-PAYWALL-3)

### Files
- `src/app/paywall.tsx`
- `src/components/onboarding/ThreeStepPaywall.tsx` (parity — amends round-1 commit `f36597e`)
- `src/lib/__tests__/onboarding-paywall-a11y-contract.test.ts` (UPDATE existing assertions)
- `src/lib/__tests__/paywall-a11y-contract.test.ts` (append)

### 4a — plan chips become radios with checked state + truthful labels (RT-PAYWALL-4)

Runtime evidence: `accessibilityRole="tab"` bridges to `GenericElement` on iOS — VoiceOver announces no role and
no selection state. The correct role for a mutually exclusive selector is `radio` with
`accessibilityState.checked`. Also: the yearly chip's current label says "per month", hiding the annual charge
from VoiceOver users — the label must carry the real annual price (the a11y twin of FIX-3).

**Round-1 interaction you must know:** commit `f36597e` (already on this branch) gave the ONBOARDING paywall
(`ThreeStepPaywall.tsx`) `accessibilityRole="tab"` "for paywall.tsx parity", with a contract test pinning it.
Round 2 supersedes that role choice on BOTH paywalls; you must update that contract test in the same commit or
the suite goes red.

Current code, `src/app/paywall.tsx:759-761` (yearly chip):

```tsx
            accessibilityLabel={`Yearly plan, ${perMonthFromYearly} per month`}
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedPlan === 'yearly' }}
```

Replace with:

```tsx
            accessibilityLabel={`Yearly plan, ${yearlyPrice} per year, equal to ${perMonthFromYearly} per month${savingsPercent > 0 ? `, save ${savingsPercent} percent` : ''}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedPlan === 'yearly', checked: selectedPlan === 'yearly' }}
```

Current code, `src/app/paywall.tsx:809-811` (monthly chip):

```tsx
            accessibilityLabel={`Monthly plan, ${monthlyPrice} per month`}
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedPlan === 'monthly' }}
```

Replace with (label unchanged — monthly price is already truthful):

```tsx
            accessibilityLabel={`Monthly plan, ${monthlyPrice} per month`}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedPlan === 'monthly', checked: selectedPlan === 'monthly' }}
```

Parity in `src/components/onboarding/ThreeStepPaywall.tsx` — lines 729-731 (monthly) and 800-802 (yearly)
currently read:

```tsx
          accessibilityLabel={`Monthly plan, ${monthlyPrice} per month`}
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedPlan === 'monthly' }}
…
            accessibilityLabel={`Yearly plan, ${yearlyPrice} per year${savings > 0 ? `, save ${savings} percent` : ''}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedPlan === 'yearly' }}
```

Change ONLY the role (`"tab"` → `"radio"`) and the state (add `checked:` mirroring `selected:`) on both; labels
there are already correct (yearly already carries the annual price).

Update `src/lib/__tests__/onboarding-paywall-a11y-contract.test.ts`:
- Lines 13 and 20: change the two `accessibilityState` expectations to the new two-key strings, e.g.
  `"accessibilityState={{ selected: selectedPlan === 'monthly', checked: selectedPlan === 'monthly' }}"`.
- Lines 23-26: rename the test to `'uses radio roles on both plan cards (paywall.tsx parity)'` and match
  `/accessibilityRole="radio"/g` (still `>= 2`).
- Leave the label and SAVE-badge tests untouched.

Leave the CTA as-is: it already declares `accessibilityRole="button"` (line 857); its `GenericElement` bridging
is an RNGH-touchable artifact, and swapping the CTA's touchable implementation is out of scope for this batch.

### 4b — comparison-table boolean cells get labels (RT-PAYWALL-6)

Current code, `src/app/paywall.tsx:676-695` (inside `comparison.map`):

```tsx
                <View style={{ width: 60, alignItems: 'center' }}>
                  {typeof row.free === 'boolean' ? (
                    row.free
                      ? <CheckIcon size={15} color={colors.textMuted} weight="bold" />
                      : <XCircleIcon size={15} color={colors.textSubtle} weight="light" />
                  ) : (
                    <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted, textAlign: 'center' }}>
                      {row.free}
                    </Text>
                  )}
                </View>
                <View style={{ width: 100, alignItems: 'center' }}>
                  {typeof row.premium === 'boolean' ? (
                    <CheckIcon size={15} color={colors.accent} weight="bold" />
                  ) : (
                    <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: FontSize.xs, color: colors.accent, textAlign: 'center' }}>
                      {row.premium}
                    </Text>
                  )}
                </View>
```

Replace the two cell-opening `<View …>` tags (only the opening tags; children unchanged) with:

```tsx
                <View
                  style={{ width: 60, alignItems: 'center' }}
                  accessible={typeof row.free === 'boolean'}
                  accessibilityLabel={typeof row.free === 'boolean' ? (row.free ? 'Included in Free' : 'Not included in Free') : undefined}
                >
```

and

```tsx
                <View
                  style={{ width: 100, alignItems: 'center' }}
                  accessible={typeof row.premium === 'boolean'}
                  accessibilityLabel={typeof row.premium === 'boolean' ? 'Included in Premium' : undefined}
                >
```

(The audit only flagged the FREE column, but the PREMIUM column's `Journal prompts` row renders a bare CheckIcon
with the same defect — vault rule: invariants hold on every path, so both columns get the guard. Text cells keep
`accessible` false so VoiceOver reads their text directly, as today.)

### 4c — SAVE badge contrast (RT-PAYWALL-3) — mirror the round-1 ThreeStepPaywall pattern exactly

Round-1 commit `f36597e` (ALREADY LANDED — verify with `git show f36597e --stat`) fixed the identical badge in
`ThreeStepPaywall.tsx`: solid `colors.accent` background, `colors.background` ink (8.48:1 in dark theme vs the
old ~2:1), badge hidden from the a11y tree because the savings live in the yearly card's label (which 4a just
guaranteed here too). Mirror it.

Current code, `src/app/paywall.tsx:784-790`:

```tsx
              {savingsPercent > 0 && (
                <View style={{ backgroundColor: `${colors.accent}30`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: 10, color: colors.accent }}>
                    SAVE {savingsPercent}%
                  </Text>
                </View>
              )}
```

Replace with:

```tsx
              {savingsPercent > 0 && (
                <View
                  style={{ backgroundColor: colors.accent, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: 10, color: colors.background }}>
                    SAVE {savingsPercent}%
                  </Text>
                </View>
              )}
```

Do NOT use `colors.contrastText` — `src/constants/colors.ts` (since `f36597e`) documents it as NOT WCAG-safe on
the dark-theme gold accent.

### Contract tests (append to `paywall-a11y-contract.test.ts`)

```ts
describe('paywall plan selector semantics (RT-PAYWALL-3/4/6)', () => {
  it('exposes both plan chips as radios with checked state', () => {
    expect((src.match(/accessibilityRole="radio"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(src).toContain("accessibilityState={{ selected: selectedPlan === 'yearly', checked: selectedPlan === 'yearly' }}");
    expect(src).toContain("accessibilityState={{ selected: selectedPlan === 'monthly', checked: selectedPlan === 'monthly' }}");
    expect(src).not.toContain('accessibilityRole="tab"');
  });

  it('yearly chip label carries the real annual price', () => {
    expect(src).toContain('`Yearly plan, ${yearlyPrice} per year, equal to ${perMonthFromYearly} per month');
  });

  it('comparison boolean cells expose Free/Premium inclusion labels', () => {
    expect(src).toContain("row.free ? 'Included in Free' : 'Not included in Free'");
    expect(src).toContain("'Included in Premium'");
  });

  it('SAVE badge uses background ink on solid accent and is hidden from the a11y tree', () => {
    const badge = src.slice(src.indexOf('SAVE {savingsPercent}%') - 600, src.indexOf('SAVE {savingsPercent}%'));
    expect(badge).toContain('backgroundColor: colors.accent,');
    expect(badge).toContain('accessibilityElementsHidden');
    expect(badge).toContain('color: colors.background');
    expect(src).not.toContain('`${colors.accent}30`');
  });
});
```

### Verification gate (FIX-4)

```
npx jest paywall-a11y-contract onboarding-paywall-a11y-contract   # both green
npm run typecheck                                                  # exits 0
npx jest                                                           # full suite green
```

### STOP-on-drift (FIX-4)
- Any excerpt mismatch → STOP.
- `onboarding-paywall-a11y-contract.test.ts` contains assertions beyond the five quoted in this plan's §"Update"
  → STOP and re-read it before editing.
- Do not touch `ThreeStepPaywall.tsx` beyond the 4 lines specified (2 roles + 2 states).

---

## FIX-5 — RT-DYN-1 + RT-DYN-2: You-tab Theme / Font size rows fragment at XXL Dynamic Type

### Files
- `src/app/(tabs)/(you)/index.tsx`
- NEW `src/lib/__tests__/you-settings-dynamic-type-contract.test.ts`

### Context

Evidence: `/tmp/unfold-e2e-audit-2026-06/runtime/matrix-dynamic-type/you-settings--prefs--xxl--dark.png` —
"Theme" fragments to three lines ("Th/em/e") and "Font size" wraps with a squeezed trailing control. Root cause:
both rows are `flexDirection:'row'` with a `flex:1` label next to an UNSHRINKABLE chip group (3 chips whose text
scales without cap), so at XXL the chips consume nearly the full row width and the label wraps mid-word.

Sweep result (per the matrix-dynamic-type segment, RT-DYN-1..5): within the You tab, ONLY these two rows have
the label-vs-fixed-chip-group pattern. Verified at `11a8151`: "Accent Colors" (line ~872) and "Reading Font" rows
are icon+label+caret collapsibles (no chip group, render fine at XXL per the same screenshot); REMINDERS rows
("Daily reminders" etc.) have small trailing values and held up at XXL
(`you-settings--reminders--xxl--dark.png`). Do not touch them. RT-DYN-3/4/5 are different surfaces (Today bottom
buttons, reader WebView, hero transition) — out of scope.

Fix pattern (established in this codebase — see `src/components/StreakBox.tsx:25-27`,
`src/components/PremiumNudgeCard.tsx:35-37`: per-file `*_MAX_SCALE` constants + `maxFontSizeMultiplier`): cap
chip-control text scaling, keep the label scaling further but capped, and let the label own leftover width.

### Current code (read at `11a8151`)

`src/app/(tabs)/(you)/index.tsx:90-94`:

```tsx
const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof SunIcon }[] = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
];
```

Theme row label, lines 810-819:

```tsx
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 15,
                    color: colors.text,
                    flex: 1,
                  }}
                >
                  Theme
                </Text>
```

Theme chip text, lines 853-862:

```tsx
                          <Text
                            style={{
                              fontFamily: FontFamily.uiMedium,
                              fontSize: FontSize.xs,
                              color: isSelected ? colors.background : colors.text,
                              marginLeft: Spacing['1.5'],
                            }}
                          >
                            {option.label}
                          </Text>
```

Font size row label, lines 1086-1095 (identical shape, text `Font size`), and Font size chip text, lines
1122-1130 (identical shape, `fontSize: 13`, text `{size.label}`).

### Edits

(a) Add constants immediately AFTER the `THEME_OPTIONS` array (after line 94):

```tsx
// Dynamic Type caps for settings rows with trailing chip groups (RT-DYN-1/2).
// Codebase pattern: per-file *_MAX_SCALE consts + maxFontSizeMultiplier (see
// StreakBox.tsx, PremiumNudgeCard.tsx). Labels scale further than chips so the
// chip group can never starve the label into per-character wrapping at XXL/AX.
const SETTINGS_LABEL_MAX_SCALE = 1.4;
const SETTINGS_CHIP_MAX_SCALE = 1.2;
```

(b) Theme row label — add two props (style unchanged):

```tsx
                <Text
                  numberOfLines={2}
                  maxFontSizeMultiplier={SETTINGS_LABEL_MAX_SCALE}
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 15,
                    color: colors.text,
                    flex: 1,
                  }}
                >
                  Theme
                </Text>
```

(c) Theme chip text — add one prop:

```tsx
                          <Text
                            maxFontSizeMultiplier={SETTINGS_CHIP_MAX_SCALE}
                            style={{
```

(rest of the element unchanged).

(d) Font size row label — same two props as (b), on the `Font size` Text at lines 1086-1095.

(e) Font size chip text — same prop as (c), on the `{size.label}` Text at lines 1122-1130.

Numbers check (why this is sufficient): at XXL the body multiplier is ~1.35 and AX sizes go far higher. Capping
chips at 1.2 bounds the 3-chip group to roughly its current XXL-light footprint minus ~15%, leaving the `flex:1`
label ≥ the width of "Theme" at 15pt × 1.4 = 21pt (~64pt) — single line. `numberOfLines={2}` is the safety rail
for any locale/AX combination; word-level wrap at 2 lines is acceptable, character fragmentation is not.

### Contract test

Create `src/lib/__tests__/you-settings-dynamic-type-contract.test.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const src = fs.readFileSync(path.join(sourceRoot, 'app/(tabs)/(you)/index.tsx'), 'utf-8');

describe('You-tab settings rows Dynamic Type contract (RT-DYN-1/RT-DYN-2)', () => {
  it('defines the settings-row scale caps', () => {
    expect(src).toContain('const SETTINGS_LABEL_MAX_SCALE = 1.4;');
    expect(src).toContain('const SETTINGS_CHIP_MAX_SCALE = 1.2;');
  });

  it('caps both row labels and both chip groups', () => {
    expect((src.match(/maxFontSizeMultiplier=\{SETTINGS_LABEL_MAX_SCALE\}/g) ?? []).length).toBe(2);
    expect((src.match(/maxFontSizeMultiplier=\{SETTINGS_CHIP_MAX_SCALE\}/g) ?? []).length).toBe(2);
  });
});
```

### Verification gate (FIX-5)

```
npx jest you-settings-dynamic-type-contract   # green
npm run typecheck                              # exits 0
```

Manual (OPTIONAL, simulator): Settings → Accessibility → Larger Text → XXL; You tab → Preferences: "Theme" and
"Font size" each render on one line (two max), chips fully visible and tappable.

### STOP-on-drift (FIX-5)
- Excerpt mismatch → STOP.
- If you find yourself adding caps to MORE than these 4 Text elements in this file, you've drifted — the sweep
  concluded only these two rows have the failing pattern.

---

## §6 — RT-NOTIF-3: ALREADY COVERED by round-1 NET-15 — verify, do not re-implement

The finding (cold-start unconditional `requestPermissionsAsync` at `_layout.tsx:76`) was fixed on this branch by
commit `6a352e8` (`fix(NET-15): remove launch-time push permission request; add session dedupe and foreground
retry [audit]`). Verified at `11a8151`:

- `src/lib/push-notifications.ts:98-117` — `registerPushToken` now checks `getPermissionsAsync()` and EARLY
  RETURNS when not granted, with the comment "NEVER request permission here — the in-context ask
  (generating.tsx / settings) owns requestPermissionsAsync."
- `src/app/_layout.tsx:96-102` — the mount effect calls `registerPushToken()` (now permission-safe) plus a
  foreground retry listener; session dedupe via `registeredThisSession`.
- `src/app/generating.tsx` calls `registerPushToken` after the user grants permission (per the NET-15 diff).
- Decision-table tests exist: `src/lib/__tests__/push-notification-helpers.test.ts`
  (`shouldProceedWithPushRegistration`, `shouldPostPushRegistration`).

**Residual: NONE.** Executor action: run the three commands below; if all pass, write nothing for this finding —
it ships in the same build.

```
grep -n "requestPermissionsAsync" src/lib/push-notifications.ts   # expect: ZERO matches
grep -rn "requestPermissionsAsync" src/app/_layout.tsx            # expect: ZERO matches
npx jest push-notification-helpers                                 # green
```

If any grep matches or the test fails → the branch is not what this plan assumes → STOP and report.

---

## §7 — Final verification (run after ALL fixes, before declaring done)

```
npm run typecheck     # exits 0
npx jest              # Test Suites: 111 passed, 111 total (108 baseline + 3 new files)
                      # Tests: > 723 passed, 0 failed
git status --short    # only intended files + the pre-existing 'M ios/Podfile.lock' (NOT staged)
```

Expected changed files (exactly these, plus 3 new test files):
- `src/lib/streak-helpers.ts`
- `src/app/(tabs)/(today)/index.tsx`
- `src/app/paywall.tsx`
- `src/components/onboarding/ThreeStepPaywall.tsx`
- `src/app/(tabs)/(you)/index.tsx`
- `src/lib/__tests__/streak-helpers.test.ts`
- `src/lib/__tests__/onboarding-paywall-a11y-contract.test.ts`
- NEW `src/lib/__tests__/today-celebration-contract.test.ts`
- NEW `src/lib/__tests__/paywall-a11y-contract.test.ts`
- NEW `src/lib/__tests__/you-settings-dynamic-type-contract.test.ts`

Any other file in the diff = drift → revert it.

## §8 — Notes for Nick (do not block execution; FYIs surfaced by planning)

1. **Build 218 ships with NO working close button on /paywall** — the source has one, but the RNGH
   style-vs-containerStyle split strands it off-screen (FIX-2 root cause). Combined with the missing annual-price
   disclosure (FIX-3), the CURRENT App Review candidate carries two Guideline-3.1.2-adjacent risks. These fixes
   target build 219; worth weighing if 218 is still queued for submission.
2. FIX-3 extends the decided copy for the trial-eligible case ("{N}-day free trial, then {price}/year · Cancel
   anytime") — mirrors the ThreeStepPaywall precedent; without it the decided copy would understate the trial.
3. FIX-4a flips round-1's `accessibilityRole="tab"` (commit `f36597e`, ThreeStepPaywall) to `radio` on both
   paywalls — runtime proved `tab` bridges to nothing on iOS. The round-1 contract test is updated accordingly.
4. RT-PAYWALL-7 (dead `isFromOnboarding` branch — no caller passes `?source=`) remains open; the close button
   routes through the existing matrix so it inherits whatever future fix lands there.
5. COR-9 (widget vs app "read today" definitions) is narrowed by FIX-1 (celebration now agrees with the widget's
   streak-based definition) but the Today hero still uses the per-devotional definition — still open, widget
   batch territory.
6. QA debug-seeds that set `streakLastReadDate` to now will fire one celebration — judged acceptable (seeding
   simulates a real read).
