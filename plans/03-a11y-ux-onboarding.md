# Plan 03 — A11y / UX / Onboarding P1 fixes (mobile batch 3)

**Repo:** Unfold iOS app (Expo / React Native). Worktree: `/Users/galangster/clawd/work/unfold-audit`
**Base commit:** `9f36ef6` (branch `audit/e2e-build218-2026-06` — `src/` at HEAD is byte-identical to `9f36ef6`; the commits on top only add audit docs `AUDIT-STATE.md`/`SYSTEM-MAP.md`. Verify with `git diff --stat 9f36ef6 HEAD -- src/` → empty.)
**Findings covered:** A11Y-1 (P1), A11Y-2 (P1), A11Y-4 (cheap P2, same file as A11Y-2), UX-1 (P1) + `[UNFOLDED]` debug-log cleanup (cheap P2, same file), UX-2 (P1), RT-ONB-1 (P1), RT-ONB-2 (P1).
**Estimated risk:** Low–medium. All fixes are additive gating, a11y attributes, copy, or feedback; no data-model or navigation changes. The riskiest item is RT-ONB-1 (changes a TextInput from controlled to uncontrolled) — it has a dedicated regression test and a narrow blast radius (one input on one onboarding step).

**Dependency order:** The six fixes are logically independent, but three files are shared between fixes, so execute in this order to avoid conflicting context:

1. Fix 4 (UX-2 — creation gate) — isolated files.
2. Fix 5 (RT-ONB-1 — name input) — `onboarding.tsx`.
3. Fix 6 (RT-ONB-2 — privacy copy) — `onboarding.tsx` (different lines).
4. Fix 2 (A11Y-2 + A11Y-4 — paywall a11y/contrast) — `ThreeStepPaywall.tsx` + `colors.ts` comment.
5. Fix 3 (UX-1 — debug chrome) — `unfolded.tsx`.
6. Fix 1 (A11Y-1 — reduce-motion gating) — touches 12 files including `onboarding.tsx`, `ThreeStepPaywall.tsx`, `unfolded.tsx`; do it last so its sweep test runs against the final state of those files.
7. Full verification gate.

**Test runner facts (verified in this worktree):** `npm test` = `jest --passWithNoTests`. `npm run typecheck` = `tsc --noEmit`. `npm run lint` = eslint. Baseline confirmed green on 2026-06-10: `npx jest src/lib/__tests__/creation-gate-policy.test.ts src/lib/__tests__/today-motion-regression.test.ts src/lib/__tests__/onboarding-step-helpers.test.ts` → `Test Suites: 3 passed / Tests: 31 passed`.

**Repo conventions you must follow (read before editing):**
- Reduce-motion: the shared hook is `useAccessibleAnimation()` in `src/hooks/useAccessibility.ts` (wraps reanimated's `useReducedMotion`). Screens/components in this repo gate loops with either `const reducedMotion = useReducedMotion()` (reanimated import) or `const { reducedMotion } = useAccessibleAnimation()`. Canonical gated examples to imitate: `src/components/CompanionOrb.tsx:150` (`if (reducedMotion || !animated) return;` inside the effect), `src/components/home/GoldEmberField.tsx:224` (`if (reducedMotion || !active) return null;` for decorative particle fields), `src/components/CompletionCelebration.tsx:286` (`{!reducedMotion && <GoldEmberField …/>}`).
- Regression tests for source-level invariants are plain Jest files in `src/lib/__tests__/` that `fs.readFileSync` the source and assert string/ordering contracts — see `src/lib/__tests__/today-motion-regression.test.ts` for the exact style (`const readSource = (relativePath) => fs.readFileSync(path.join(sourceRoot, relativePath), 'utf-8')`, then `expect(src).toContain(...)` and index-ordering assertions). Follow that style for the new contract tests below.
- No new dependencies. No bounce/spring additions (vault `no-bounce-animations`). Do not touch anything labeled out-of-scope.

**Product decisions flagged for Nick (plan implements the recommended option):**
- **UX-2:** what should the creation gate do while premium policy is `unknown`? Recommended (implemented): keep fail-closed, add non-blocking feedback (haptic + one-shot alert + VoiceOver announcement, throttled) so the gate is never a silent no-op. Alternatives documented in Fix 4.
- **RT-ONB-2:** "Your story stays on your device." is false (about-me text is sent to the backend and synced in the user profile). Recommended (implemented): delete the false sentence (minimal copy fix, zero new claims). Alternative replacement copy documented in Fix 6.
- **A11Y-4 token note:** a global `contrastText` token flip is NOT safe (computed: dark ink `#0A0A0A` on the tuned light accent `#866B2F` = 3.92:1, fails AA, while white passes at 5.05:1 — no single ink works on every accent). The fix is therefore scoped to the SAVE badge + a corrected doc comment. No decision needed unless Nick wants a per-theme token redesign later.

---

## Fix 1 — A11Y-1 (P1): gate every infinite `withRepeat` loop behind reduce motion

### Context

~10 surfaces run infinite (`numberOfReps: -1`) reanimated loops with no reduce-motion gate, including the entire mandatory new-user funnel (welcome carousel → onboarding → paywall) and the always-visible Today-header streak flame. The app has a clear reduce-motion policy (~25 other files gate correctly), so these are violations of an existing invariant, not a new policy. Per vault rule `invariants-must-hold-on-every-construction-and-update-path`, each gate goes **inside the component that owns the shared value / loop** (single owner), never at individual call sites — that way every present and future consumer is covered.

The complete enumerated set (verified by grep at plan time — re-verify with the STOP condition below):

| # | File | Loop site(s) | Gate strategy |
|---|---|---|---|
| 1 | `src/app/how-it-works.tsx` | 23 loops inside 14 internal animation components (lines 94–98, 154, 308, 423, 500, 538, 597, 652, 689, 763, 769, 834–836, 867, 892–894) | One gate in the `CardAnimation` dispatcher (`:1012`) — the ONLY construction path for all 14 components |
| 2 | `src/app/onboarding.tsx` | `PulsingText` (`:96`), adaptive-question ripples (`:685–697`) | Gate inside `PulsingText`; gate the ripple effect |
| 3 | `src/components/EmberParticles.tsx` | 3 loops per `Ember` (`:37`, `:51`, `:60`) | Decorative field → `return null` under RM in the exported `EmberParticles` wrapper (GoldEmberField precedent) |
| 4 | `src/components/onboarding/GrowthGraph.tsx` | `dotPulse` loop (`:118–125`) | Skip loop, leave `dotPulse` at its static initial 0.6 |
| 5 | `src/components/TypewriterText.tsx` | `MagicalChar` shimmer loop (`:91`) | Skip loop, `shimmerOpacity` stays 1 |
| 6 | `src/components/StreakDisplay.tsx` | flame pulse (`:52`) | Gate + fix the never-cancelled loop when streak drops to 0 |
| 7 | `src/app/(tabs)/(today)/evening-wind-down.tsx` | `RippleRingEvening` (`:60`) | Skip loop, `progress` stays 0 (static faint ring) |
| 8 | `src/app/unfolded.tsx` | `FloatingEmber` (`:415`, `:425`, `:432`), `PulsingRing` (`:485`, `:496`), plus decorative `SparkleBurst` render (`:1201`) | Gate effects (both components start at opacity 0 → invisible under RM); gate the burst render |
| 9 | `src/components/AccentGlow.tsx` | glow pulse (`:39`) | Skip loop, `progress` stays 0 (static min glow) |
| 10 | `src/components/companion/StreamingCursor.tsx` | blink (`:22`) | Skip loop, cursor stays solid (opacity 1) |
| 11 | `src/components/RippleLoader.tsx` | ring loops (`:60`) | Skip loops, pin rings to staggered static positions |
| 12 | `src/components/onboarding/ThreeStepPaywall.tsx` | Lottie bell `autoPlay loop` (`:531–532`), `GlowingCTA` phase loop (`:864`) | `autoPlay={!reducedMotion} loop={!reducedMotion}` (first frame is static); skip phase loop (static shadowOpacity 0.55) |
| 13 | `src/components/AudioWaveform.tsx` | bar loops (`:127`, `:151`) — latent (audio dark-launched) | Skip loops, bars stay at their static initial values |

NOT in scope (already gated or finite): `VoiceInputBar` recording bars (active-recording state indication, brief, user-initiated), `TypingIndicator`, `ShimmerText`, `AudioPlayerPill`, `DevotionalSegue`, `VulnerabilityValidation`, `highlights.tsx`, `reading.tsx`, `reveal.tsx`, `series-detail.tsx`, `my-content.tsx`, `BridgeShimmer`, `generating.tsx`, `GoldEmberField`, `GlowBackground`, `CompanionOrb`, `CompletionCelebration`, `EveningCelebration`, `StreakCelebration`, `SparkleBurst` (the shared one in `src/components/`), `DevotionalCard` — all verified to already contain reduce-motion references. Do not modify them.

### Failing test FIRST

Create `src/lib/__tests__/reduce-motion-loop-coverage.test.ts`. Follow the `today-motion-regression.test.ts` style exactly (same imports, same `readSource` helper). Contents:

```ts
import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(sourceRoot, relativePath), 'utf-8');

// Recursively collect .ts/.tsx files under src/
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('reduce-motion loop coverage', () => {
  it('every src file that starts a withRepeat loop references reduce motion', () => {
    const offenders = walk(sourceRoot)
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf-8');
        return src.includes('withRepeat(') && !/useReducedMotion|useAccessibleAnimation/.test(src);
      })
      .map((f) => path.relative(sourceRoot, f));
    expect(offenders).toEqual([]);
  });

  it('gates the welcome/how-it-works card animations at the CardAnimation dispatcher', () => {
    const src = readSource('app/how-it-works.tsx');
    const fnStart = src.indexOf('export function CardAnimation');
    expect(fnStart).toBeGreaterThan(-1);
    const gate = src.indexOf('if (reducedMotion) return null;', fnStart);
    const firstCase = src.indexOf("case 'dots'", fnStart);
    expect(gate).toBeGreaterThan(fnStart);
    expect(gate).toBeLessThan(firstCase);
  });

  it('gates the StreakDisplay flame pulse and cancels it when the streak resets', () => {
    const src = readSource('components/StreakDisplay.tsx');
    expect(src).toContain('if (streak > 0 && !reducedMotion) {');
    expect(src).toContain('cancelAnimation(flamePulse);');
    expect(src).toContain('flamePulse.value = 1;');
  });

  it('renders no onboarding ember particles under reduce motion', () => {
    const src = readSource('components/EmberParticles.tsx');
    const fnStart = src.indexOf('export function EmberParticles');
    const gate = src.indexOf('if (reducedMotion) return null;', fnStart);
    expect(gate).toBeGreaterThan(fnStart);
  });

  it('keeps the paywall Lottie bell and CTA glow static under reduce motion', () => {
    const src = readSource('components/onboarding/ThreeStepPaywall.tsx');
    expect(src).toContain('autoPlay={!reducedMotion}');
    expect(src).toContain('loop={!reducedMotion}');
    const ctaStart = src.indexOf('function GlowingCTA');
    const ctaGate = src.indexOf('if (reducedMotion) return;', ctaStart);
    const ctaLoop = src.indexOf('phase.value = withRepeat(', ctaStart);
    expect(ctaGate).toBeGreaterThan(ctaStart);
    expect(ctaGate).toBeLessThan(ctaLoop);
  });

  it('keeps the unfolded finale burst and ember field out of the reduce-motion tree', () => {
    const src = readSource('app/unfolded.tsx');
    expect(src).toContain('{showBurst && !reducedMotion && <SparkleBurst count={40} />}');
  });
});
```

Run: `npx jest src/lib/__tests__/reduce-motion-loop-coverage.test.ts`
**Expected now (before fixes): FAIL — 6 failed tests.** The sweep test must list exactly these 10 offenders (if the list differs, STOP — drift): `app/how-it-works.tsx`, `app/onboarding.tsx`, `app/unfolded.tsx`, `components/EmberParticles.tsx`, `components/onboarding/GrowthGraph.tsx`, `components/TypewriterText.tsx`, `components/AccentGlow.tsx`, `components/companion/StreamingCursor.tsx`, `components/RippleLoader.tsx`, `components/AudioWaveform.tsx`.
(Note `components/StreakDisplay.tsx`, `app/(tabs)/(today)/evening-wind-down.tsx`, and `ThreeStepPaywall.tsx` will NOT appear in the sweep list — they already import the hook but don't use it for their loops; that's why they get dedicated assertions.)

### Edits (one per file; use the exact before/after anchors)

**1. `src/app/how-it-works.tsx`** — add `useReducedMotion` to the existing reanimated import block (lines 11–23, which currently ends `interpolate, runOnJS,`), then gate the dispatcher. Before (`:1012`):

```tsx
export function CardAnimation({ type, accent }: { type: string; accent: string }) {
  switch (type) {
```

After:

```tsx
export function CardAnimation({ type, accent }: { type: string; accent: string }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;
  switch (type) {
```

This covers all 23 loops: the 14 animation components (`FloatingDots`, `PencilWriting`, `WeekCircleDay`/`WeekCircles`, `OpenBook`, `PulseLine`/`PulsePoint`, `NetworkNode`/`NetworkEdge`/`NetworkNodes`, `BeatingHeart`, `WaveBar`/`WaveformBars`, `PulseCircle`, `InfinityDot`/`InfinityIcon`, `SlidingLines`, `GlowCircle`, `ExpandingRings`) are file-private (not exported) and constructed ONLY via this switch. STOP condition: run `grep -n 'FloatingDots\|PencilWriting\|WeekCircles\|BeatingHeart\|WaveformBars\|PulseCircle\|InfinityIcon\|SlidingLines\|GlowCircle\|ExpandingRings\|NetworkNodes\|OpenBook\|PulseLine' src/app/index.tsx src/app/**/*.tsx | grep -v how-it-works` — if any external usage appears, STOP and report; do not gate per-component.
(`AnimatedHeadline`/`FeatureRevealWord`/`AnimatedBody` in this file use one-shot `withTiming` only — leave them alone.)

**2. `src/app/onboarding.tsx`** — add `useReducedMotion` to the reanimated import block (the block containing `withRepeat,` at `:26`).
   a. `PulsingText` (`:92–115`): the effect currently starts the loop unconditionally. After:

```tsx
function PulsingText({ text, style }: { text: string; style: any }) {
  const opacity = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [reducedMotion]);
```

   b. Adaptive-question ripples: in the main `OnboardingScreen` component, add `const reducedMotion = useReducedMotion();` near the other hooks (e.g. after `const isDark = true;` at `:426`), then change the effect at `:677–698`. Before:

```tsx
  useEffect(() => {
    if (!isLoadingAdaptive) {
      ripple1.value = 0;
      ripple2.value = 0;
      ripple3.value = 0;
      return;
    }

    ripple1.value = withRepeat(
```

After — only the guard line changes (and add `reducedMotion` to the dep array on `:698`):

```tsx
  useEffect(() => {
    if (!isLoadingAdaptive || reducedMotion) {
      ripple1.value = 0;
      ripple2.value = 0;
      ripple3.value = 0;
      return;
    }

    ripple1.value = withRepeat(
```

**3. `src/components/EmberParticles.tsx`** — add `useReducedMotion` to the reanimated import; gate the exported wrapper (decorative field → render nothing, GoldEmberField precedent). In `EmberParticles` (`:108`), add as the first lines of the function body... CAUTION rules-of-hooks: the two `useMemo` calls must run before the early return. Place the gate AFTER the `useMemo`s and before the `return (`:

```tsx
  const reducedMotion = useReducedMotion();
  // …existing upParticles/downParticles useMemos stay above…
  if (reducedMotion) return null;
```

Concretely: add `const reducedMotion = useReducedMotion();` after line `:110` (`const downCount = …`) and `if (reducedMotion) return null;` immediately before `return (` at `:138`.

**4. `src/components/onboarding/GrowthGraph.tsx`** — add `useReducedMotion` to the reanimated import. In the effect at `:112–129`, gate ONLY the infinite `dotPulse` loop (the 6s one-shot curve reveal is finite — leave it, including the `onDrawComplete` timer). Before (`:118–125`):

```tsx
    dotPulse.value = withDelay(animationDelay, withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    ));
```

After:

```tsx
    if (!reducedMotion) {
      dotPulse.value = withDelay(animationDelay, withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ));
    }
```

with `const reducedMotion = useReducedMotion();` added at the top of `GrowthGraph` (after `:53`).

**5. `src/components/TypewriterText.tsx`** — add `useReducedMotion` to the reanimated import. In `MagicalChar` (`:40`), add `const reducedMotion = useReducedMotion();` as the first hook, then wrap the shimmer block (`:88–100`). Before: `if (shimmer) {` → After: `if (shimmer && !reducedMotion) {` (leave the one-shot fade/rise/scale lines untouched).

**6. `src/components/StreakDisplay.tsx`** — `useReducedMotion` is already imported (`:14`) and read (`:34`); `cancelAnimation` is NOT imported — add it to the reanimated import. Replace the effect at `:50–58`. Before:

```tsx
  useEffect(() => {
    if (streak > 0) {
      flamePulse.value = withRepeat(
        withTiming(1.15, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    }
  }, [streak, flamePulse]);
```

After (also fixes the pre-existing bug that the loop keeps running on the shared value when streak drops to 0):

```tsx
  useEffect(() => {
    if (streak > 0 && !reducedMotion) {
      flamePulse.value = withRepeat(
        withTiming(1.15, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      cancelAnimation(flamePulse);
      flamePulse.value = 1;
    }
    return () => {
      cancelAnimation(flamePulse);
    };
  }, [streak, reducedMotion, flamePulse]);
```

**7. `src/app/(tabs)/(today)/evening-wind-down.tsx`** — `useReducedMotion` already imported (`:15`). In `RippleRingEvening` (`:54–66`), add `const reducedMotion = useReducedMotion();` after `:55`, then guard the effect. Before (`:57–66`):

```tsx
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.out(Easing.cubic) }),
        -1,
        false
      )
    );
  }, [delay, progress]);
```

After:

```tsx
  useEffect(() => {
    if (reducedMotion) {
      progress.value = 0;
      return;
    }
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 3000, easing: Easing.out(Easing.cubic) }),
        -1,
        false
      )
    );
  }, [delay, progress, reducedMotion]);
```

**8. `src/app/unfolded.tsx`** — add `useReducedMotion` to the reanimated import block (around `:19`).
   a. `FloatingEmber` (`:401`): add `const reducedMotion = useReducedMotion();` as the first hook in the component, and at the top of its `useEffect` (`:412`) add `if (reducedMotion) return;` (opacity starts at 0, so the embers are simply invisible under RM — do NOT add an early `return null` before the other hooks).
   b. `PulsingRing` (`:478`): same pattern — `const reducedMotion = useReducedMotion();` first, `if (reducedMotion) return;` at the top of the effect at `:482`.
   c. `ClosingCard` (`:1141`): add `const reducedMotion = useReducedMotion();` near `const [showBurst, setShowBurst] = useState(false);` (`:1142`) and change the render at `:1201`. Before: `{showBurst && <SparkleBurst count={40} />}` → After: `{showBurst && !reducedMotion && <SparkleBurst count={40} />}`.

**9. `src/components/AccentGlow.tsx`** — add `useReducedMotion` to the reanimated import. Add `const reducedMotion = useReducedMotion();` in the component, change the effect condition at `:37` from `if (active) {` to `if (active && !reducedMotion) {`, and add `reducedMotion` to the dep array at `:47`. (Under RM with `active=true`, `progress` stays 0 → static minimum glow; the `useAnimatedStyle` needs no change.)

**10. `src/components/companion/StreamingCursor.tsx`** — add `useReducedMotion` to the reanimated import. Guard the effect at `:21–29`:

```tsx
  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: HALF_CYCLE }),
        withTiming(1, { duration: HALF_CYCLE })
      ),
      -1
    );
  }, [opacity, reducedMotion]);
```

**11. `src/components/RippleLoader.tsx`** — add `useReducedMotion` to the reanimated import (the block already has `cancelAnimation`). In the effect at `:56–74`, before the `rings.forEach` add:

```tsx
    if (reducedMotion) {
      rings.forEach((sv, i) => {
        sv.value = (i + 0.5) / rings.length;
      });
      return;
    }
```

with `const reducedMotion = useReducedMotion();` added in the component body. This pins the rings to staggered static positions (a frozen ripple) so the loader still reads as a glyph. Keep the existing cleanup `return` as-is (note: the early return above replaces the cleanup for the RM branch — that is fine because no animations were started; structure it as `if (reducedMotion) { …; return; }` BEFORE the `rings.forEach` that starts animations, keeping the original `return () => …` for the animated branch).

**12. `src/components/onboarding/ThreeStepPaywall.tsx`** — `useReducedMotion` already imported (`:26`).
   a. `ScreenTrialReminder` (`:493`): add `const reducedMotion = useReducedMotion();` to the component body, then change the Lottie props at `:531–532`. Before: `autoPlay` / `loop` (bare). After: `autoPlay={!reducedMotion}` / `loop={!reducedMotion}`. (Lottie renders its first frame statically when not playing.)
   b. `GlowingCTA` (`:844`): add `const reducedMotion = useReducedMotion();`, then guard the effect at `:863–870`:

```tsx
  useEffect(() => {
    if (reducedMotion) return;
    phase.value = withRepeat(
      withTiming(1, { duration: 3600, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(phase);
  }, [phase, reducedMotion]);
```

(`phase` stays 0 → the worklet computes `sine = 0` → static `shadowOpacity: 0.55`.)

**13. `src/components/AudioWaveform.tsx`** — add `useReducedMotion` to the reanimated import. In the effect at `:117–162`, add a guard at the very top:

```tsx
    if (reducedMotion) {
      bars.forEach((bar, i) => {
        const barValue = barValues[i];
        if (!barValue) return;
        barValue.value = isPlaying ? bar.minHeight : 0.3;
      });
      return;
    }
```

with `const reducedMotion = useReducedMotion();` in the component body and `reducedMotion` added to the dep array at `:162`.

### Verification

- `npx jest src/lib/__tests__/reduce-motion-loop-coverage.test.ts` → **PASS, 6 tests**.
- `npx jest src/lib/__tests__/today-motion-regression.test.ts` → **PASS, 9 tests** (no regression — that suite asserts other files).
- `npm run typecheck` → exit 0. `npm run lint` → exit 0 (watch for unused-import or exhaustive-deps warnings on the files you touched; fix by including the new `reducedMotion` deps as specified).

### Hard boundaries / STOP conditions

- If any cited excerpt does not match the file at the cited line (±10 lines), STOP and report drift; do not improvise.
- Do NOT touch the already-gated files in the NOT-in-scope list.
- Do NOT change animation timings, easings, or visual values anywhere — only add gates.
- Do NOT convert one-shot (finite) animations to gated; this fix is infinite loops only.

---

## Fix 2 — A11Y-2 (P1) + A11Y-4 (cheap P2): ThreeStepPaywall plan-selector semantics and SAVE-badge contrast

### Context

`src/components/onboarding/ThreeStepPaywall.tsx` `ScreenPricing` (`:584–828`) renders the Monthly (`:723–770`) and Yearly (`:787–824`) pricing cards as plain `TouchableOpacity`s with **no `accessibilityRole`, no `accessibilityState`, no `accessibilityLabel`** — a VoiceOver user on the mandatory onboarding paywall cannot tell which plan is selected (selection is conveyed by border/background color only). The standalone `src/app/paywall.tsx:759–811` already does this correctly and is the pattern to port verbatim:

```tsx
            accessibilityLabel={`Yearly plan, ${perMonthFromYearly} per month`}
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedPlan === 'yearly' }}
```

A11Y-4 (same component): the SAVE badge at `:775–786` renders `colors.contrastText ?? '#FFFFFF'` (= `#FFFFFF`, `src/constants/colors.ts:75` and `:113`) on `colors.accent`. Onboarding forces dark theme (`onboarding.tsx:426` `const isDark = true;`), so this is white on gold `#C8A55C` = **2.34:1** (computed via WCAG relative-luminance formula), at 10px semibold (`saveBadgeText` style `:1570–1574`) — pricing-decision information failing every WCAG level. Computed alternatives: `#0A0A0A` ink on `#C8A55C` = **8.48:1**. The same file's `GlowingCTA` already uses `colors.background` as ink on accent fill (`:899` `color: colors.background`) — that is the convention to reuse. `ThreeStepPaywall` is rendered only from `onboarding.tsx:2837` where dark is forced, so `colors.background` is deterministically `#0A0A0A` here.

A global token change is NOT safe (see header note: dark ink fails on `#866B2F` at 3.92:1), so the token VALUE stays; only the false doc comment gets corrected.

### Failing test FIRST

Create `src/lib/__tests__/onboarding-paywall-a11y-contract.test.ts` (same `readSource` style as Fix 1):

```ts
import * as fs from 'fs';
import * as path from 'path';

const sourceRoot = path.join(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(sourceRoot, relativePath), 'utf-8');

describe('onboarding paywall accessibility contract', () => {
  const src = readSource('components/onboarding/ThreeStepPaywall.tsx');

  it('exposes the Monthly plan card as a selectable tab with a price-bearing label', () => {
    expect(src).toContain('accessibilityLabel={`Monthly plan, ${monthlyPrice} per month`}');
    expect(src).toContain("accessibilityState={{ selected: selectedPlan === 'monthly' }}");
  });

  it('exposes the Yearly plan card as a selectable tab with price and savings in the label', () => {
    expect(src).toContain(
      "accessibilityLabel={`Yearly plan, ${yearlyPrice} per year${savings > 0 ? `, save ${savings} percent` : ''}`}",
    );
    expect(src).toContain("accessibilityState={{ selected: selectedPlan === 'yearly' }}");
  });

  it('uses tab roles on both plan cards (paywall.tsx parity)', () => {
    const matches = src.match(/accessibilityRole="tab"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('hides the decorative SAVE badge from the accessibility tree (savings are in the card label)', () => {
    const badgeStart = src.indexOf('styles.saveBadge');
    const hidden = src.indexOf('accessibilityElementsHidden', badgeStart - 200);
    expect(hidden).toBeGreaterThan(-1);
  });

  it('renders the SAVE badge text with background ink on accent, not white (WCAG 8.48:1 vs 2.34:1)', () => {
    expect(src).not.toContain("{ color: colors.contrastText ?? '#FFFFFF' }");
    const badgeTextColor = src.indexOf('{ color: colors.background }', src.indexOf('saveBadgeText'));
    expect(badgeTextColor).toBeGreaterThan(-1);
  });
});
```

Run: `npx jest src/lib/__tests__/onboarding-paywall-a11y-contract.test.ts` → **Expected now: FAIL, 5 failed tests.**

### Edits

**1. Monthly card** — `ThreeStepPaywall.tsx:723–725`. Before:

```tsx
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => onSelectPlan('monthly')}
```

After:

```tsx
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => onSelectPlan('monthly')}
          accessibilityLabel={`Monthly plan, ${monthlyPrice} per month`}
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedPlan === 'monthly' }}
```

**2. Yearly card** — `:787–789`. Before:

```tsx
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => onSelectPlan('yearly')}
```

After:

```tsx
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => onSelectPlan('yearly')}
            accessibilityLabel={`Yearly plan, ${yearlyPrice} per year${savings > 0 ? `, save ${savings} percent` : ''}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: selectedPlan === 'yearly' }}
```

(`monthlyPrice`, `yearlyPrice`, `savings` are all in scope in `ScreenPricing` — `savings` is computed at `:600`.)

**3. SAVE badge** — `:775–786`. Before:

```tsx
          {savings > 0 && (
            <View style={[styles.saveBadge, { backgroundColor: colors.accent }]}>
              <Text
                style={[
                  styles.saveBadgeText,
                  { color: colors.contrastText ?? '#FFFFFF' },
                ]}
              >
                SAVE {savings}%
              </Text>
            </View>
          )}
```

After (contrast fix + hide from VO since the savings now live in the yearly card's label):

```tsx
          {savings > 0 && (
            <View
              style={[styles.saveBadge, { backgroundColor: colors.accent }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text
                style={[
                  styles.saveBadgeText,
                  { color: colors.background },
                ]}
              >
                SAVE {savings}%
              </Text>
            </View>
          )}
```

**4. Correct the false token doc comment** — `src/constants/colors.ts:37`. Before:

```ts
  /** Text color guaranteed readable on accent backgrounds. */
  contrastText?: string;
```

After:

```ts
  /**
   * Text color for accent backgrounds. NOT universally WCAG-safe: white on
   * the dark-theme gold accent (#C8A55C) is ~2.34:1. Prefer
   * `colors.background` as ink on accent fills (see GlowingCTA in
   * ThreeStepPaywall) and verify contrast per surface.
   */
  contrastText?: string;
```

Do NOT change the token values at `:75`/`:113`.

### Verification

- `npx jest src/lib/__tests__/onboarding-paywall-a11y-contract.test.ts` → **PASS, 5 tests**.
- `npm run typecheck` → exit 0. `npm run lint` → exit 0.

### Hard boundaries / STOP conditions

- If the pricing-card excerpts at `:723`/`:787` don't match, STOP and report drift.
- Do NOT touch `src/app/paywall.tsx` (it is the already-correct reference).
- Do NOT add haptics to `onSelectPlan` (paywall.tsx has them; ThreeStepPaywall's selection feedback design is out of scope).
- Do NOT modify `welcome-celebration.tsx` or `ui/Button.tsx` (orphan/dead `contrastText` consumers — other dimensions own dead-code removal).

---

## Fix 3 — UX-1 (P1): remove shipped debug chrome on /unfolded (+ cheap P2: `[UNFOLDED]` debug logs)

### Context

`src/app/unfolded.tsx` ships in the production binary with literal debug chrome on the `ClosingCard` share button (`:1219–1231`):

```tsx
      <TouchableOpacity
        onPress={() => {
          logger.log('[UNFOLDED] Share button onPress fired!');
          handleShare();
        }}
        style={[s.shareButton, { borderWidth: 2, borderColor: 'red' }]}
        activeOpacity={0.7}
      >
```

The route is registered and externally reachable via the unguarded `unfold://unfolded` scheme even though the in-app entry is dead-coded, so a user (or App Review) can see a red-bordered debug button. The file also contains 8 active-debug `logger.log('[UNFOLDED] …')` calls (lines 1152, 1159, 1164, 1172, 1175, 1221, 1394, 1400) and 2 legitimate `logger.error` calls (1187, 1404).

### Failing test FIRST

Add a small contract test — create `src/lib/__tests__/unfolded-debug-chrome.test.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '../../app/unfolded.tsx'),
  'utf-8',
);

describe('unfolded recap ships without debug chrome', () => {
  it('has no debug border on the share button', () => {
    expect(src).not.toContain("borderColor: 'red'");
  });

  it('has no [UNFOLDED] debug logs (errors may remain)', () => {
    expect(src).not.toMatch(/logger\.log\('\[UNFOLDED\]/);
  });
});
```

Run: `npx jest src/lib/__tests__/unfolded-debug-chrome.test.ts` → **Expected now: FAIL, 2 failed tests.**

### Edits

1. `:1219–1226` — replace the onPress wrapper and style override. After:

```tsx
      <TouchableOpacity
        onPress={handleShare}
        style={s.shareButton}
        activeOpacity={0.7}
      >
```

2. Delete the 7 remaining `logger.log('[UNFOLDED] …')` lines (1152, 1159, 1164, 1172, 1175, 1394, 1400). KEEP both `logger.error('[UNFOLDED] …')` calls (1187 share error, 1404 dismiss failed). If deleting a log leaves an empty `if` block or dangling braces, remove the now-empty statement cleanly (check `:1159` — the `shareCardRef is null` log is inside an early-return guard; keep the guard/`return`, drop only the log line).

### Verification

- `npx jest src/lib/__tests__/unfolded-debug-chrome.test.ts` → **PASS, 2 tests**.
- `npm run typecheck` / `npm run lint` → exit 0.

### Hard boundaries / STOP conditions

- Do NOT unregister/gate the `/unfolded` route (route-tree hygiene is UX-11, owned by another batch — coordinate, don't collide).
- Do NOT touch `handleShare` logic or the share-card capture flow.
- The `s.shareButton` style object (`:1942+`) is correct as-is — only the inline override goes.

---

## Fix 4 — UX-2 (P1): creation gate `unknown` policy must never be a silent no-op

### Context

`src/lib/creation-gate-policy.ts:18` maps `unknown` premium policy → `'blocked'`:

```ts
  if (policy === 'granted') return 'allow';
  if (policy === 'unknown') return 'blocked';
```

and `src/hooks/useCreationGate.ts:23–24` turns `blocked` into a bare `return false` with zero UI:

```ts
    if (action === 'allow') return true;
    if (action === 'blocked') return false;
```

Consequence: while RevenueCat is resolving (`unknown` — every cold start; **indefinitely** on an offline/cache-less cold start because `useRevenueCatSync.ts:71–78` deliberately does not set `revenueCatResolved` on failure), every keystroke in the journal editor (`src/app/(tabs)/(today)/journal.tsx:419–423` `handleTextChange = (text) => { if (!gate()) return; setContent(text); … }` — plus 9 more `gate()` sites in that file) is silently discarded, and the evening Goodnight button (`evening-wind-down.tsx:237–238`) does nothing. The app looks broken.

Two in-repo invariants constrain the fix (both are deliberate, commented decisions — do not violate them):
- `src/hooks/usePremiumAccessPolicy.ts` docstring: "Do NOT collapse `unknown` into `denied`… Show a neutral 'pending' affordance instead."
- `src/hooks/useRevenueCatSync.ts:73`: "downstream gates must continue to treat premium policy as `unknown` and fail closed."

### PRODUCT DECISION (flagged for Nick; plan implements Option A)

- **Option A (RECOMMENDED, implemented below): fail-closed + non-blocking feedback.** Keep `unknown → blocked`; in `useCreationGate`, a blocked action fires a warning haptic, a VoiceOver announcement, and a throttled (once per 30s) alert: "Checking your subscription — please try again in a moment." The RC listener already self-heals when connectivity returns, so the retry affordance is simply re-attempting the action. Respects both documented invariants; one-file blast radius; all 6 consumer screens (`journal.tsx`, `evening-wind-down.tsx`, `(ask)/index.tsx`, `(journal)/index.tsx`, `(journal)/note-detail.tsx`, `(today)/index.tsx`) get it for free via the shared hook.
- Option B: fail-open (`unknown → allow`) for local-only actions (journal keystrokes, Goodnight) while staying fail-closed for backend-generation actions. Better typing UX but splits gate semantics, requires classifying every call site (vault `enumerate-excluded-populations-for-every-filter-bound`), and contradicts the fail-closed comment.
- Option C: global fail-open `unknown → allow`. Rejected — directly contradicts both invariant comments.

### Failing test FIRST

Extend `src/lib/__tests__/creation-gate-policy.test.ts` (existing suite, currently passing; uses plain imports + `jest.isolateModules` — follow its style). Add a new `describe` block:

```ts
import {
  getChurnedCreationGateAction,
  shouldEmitPendingFeedback,
  PENDING_FEEDBACK_THROTTLE_MS,
} from '../creation-gate-policy';

describe('creation gate pending feedback (unknown policy must not be silent)', () => {
  it('still fails closed for unknown policy', () => {
    expect(
      getChurnedCreationGateAction({ policy: 'unknown', hasSeenExclusiveOffer: false }),
    ).toBe('blocked');
  });

  it('emits feedback on the first blocked action', () => {
    expect(shouldEmitPendingFeedback(0, 100_000)).toBe(true);
  });

  it('throttles repeat feedback inside the window (computed: 100000 + 30000 - 1)', () => {
    expect(shouldEmitPendingFeedback(100_000, 129_999)).toBe(false);
  });

  it('emits again once the throttle window has elapsed (computed: 100000 + 30000)', () => {
    expect(shouldEmitPendingFeedback(100_000, 130_000)).toBe(true);
  });

  it('uses a 30 second window', () => {
    expect(PENDING_FEEDBACK_THROTTLE_MS).toBe(30_000);
  });
});
```

(Expected values computed by formula: `now - lastAt >= 30_000` → `129_999 - 100_000 = 29_999 < 30_000` → false; `130_000 - 100_000 = 30_000 >= 30_000` → true.)

Also create `src/lib/__tests__/creation-gate-feedback-wiring.test.ts` (source contract, `readSource` style):

```ts
import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '../../hooks/useCreationGate.ts'),
  'utf-8',
);

describe('useCreationGate blocked-action feedback wiring', () => {
  it('never returns false for a blocked action without emitting pending feedback', () => {
    const blockedIdx = src.indexOf("if (action === 'blocked')");
    expect(blockedIdx).toBeGreaterThan(-1);
    const feedbackIdx = src.indexOf('notifyPendingSubscriptionCheck', blockedIdx);
    const returnIdx = src.indexOf('return false', blockedIdx);
    expect(feedbackIdx).toBeGreaterThan(blockedIdx);
    expect(feedbackIdx).toBeLessThan(returnIdx);
  });

  it('announces the pending state to screen readers', () => {
    expect(src).toContain('announceForAccessibility');
  });
});
```

Run: `npx jest src/lib/__tests__/creation-gate-policy.test.ts src/lib/__tests__/creation-gate-feedback-wiring.test.ts` → **Expected now: FAIL** (new policy tests fail on missing exports; wiring suite fails both tests; the 4 pre-existing winback tests must still pass).

### Edits

**1. `src/lib/creation-gate-policy.ts`** — append pure throttle logic (keep this file free of RN imports, per its existing header comment... it has no header comment, but it is imported by a pure test — keep it dependency-free):

```ts
/**
 * Pending-feedback throttle for blocked-while-unknown creation actions.
 * Pure (receives `now`) per vault: deterministic paths receive now as a
 * parameter.
 */
export const PENDING_FEEDBACK_THROTTLE_MS = 30_000;

export function shouldEmitPendingFeedback(lastEmittedAt: number, now: number): boolean {
  return now - lastEmittedAt >= PENDING_FEEDBACK_THROTTLE_MS;
}
```

**2. `src/hooks/useCreationGate.ts`** — wire the feedback. Full replacement of the gate branch (current lines `:23–24` shown in Context). New imports at top:

```ts
import { useCallback, useRef, useState } from 'react';
import { Alert, AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  getChurnedCreationGateAction,
  shouldEmitPendingFeedback,
} from '@/lib/creation-gate-policy';
```

Inside `useCreationGate()` add `const lastPendingFeedbackAtRef = useRef(0);` and a helper before `gate`:

```ts
  const notifyPendingSubscriptionCheck = useCallback(() => {
    const now = Date.now();
    if (!shouldEmitPendingFeedback(lastPendingFeedbackAtRef.current, now)) return;
    lastPendingFeedbackAtRef.current = now;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    AccessibilityInfo.announceForAccessibility(
      'Checking your subscription. Please try again in a moment.',
    );
    Alert.alert(
      'One moment',
      "We're checking your subscription. Please try again in a moment.",
    );
  }, []);
```

Then change the blocked branch in `gate`. Before:

```ts
    if (action === 'allow') return true;
    if (action === 'blocked') return false;
```

After:

```ts
    if (action === 'allow') return true;
    if (action === 'blocked') {
      notifyPendingSubscriptionCheck();
      return false;
    }
```

and add `notifyPendingSubscriptionCheck` to the `gate` useCallback dep array (`:32` currently `[policy, router]` → `[policy, router, notifyPendingSubscriptionCheck]`).

Why a ref (per-hook-instance) and not module state: each screen instance throttles independently, which is acceptable (a user bouncing between journal and evening sees at most one alert per screen per 30s), avoids cross-test bleed, and avoids hidden module-level mutable state.

### Verification

- `npx jest src/lib/__tests__/creation-gate-policy.test.ts` → **PASS, 9 tests** (4 pre-existing + 5 new).
- `npx jest src/lib/__tests__/creation-gate-feedback-wiring.test.ts` → **PASS, 2 tests**.
- `npm run typecheck` / `npm run lint` → exit 0.

### Hard boundaries / STOP conditions

- Do NOT change `unknown → 'blocked'` in `getChurnedCreationGateAction` (documented fail-closed invariant).
- Do NOT touch `useRevenueCatSync.ts` or `usePremiumAccessPolicy.ts`.
- Do NOT modify any of the 6 consumer screens — the fix lives entirely in the shared hook (vault `deterministic-twin-paths-must-share-one-helper`).
- If `useCreationGate.ts` does not match the excerpt in Context, STOP and report drift.

---

## Fix 5 — RT-ONB-1 (P1): onboarding name truncated under fast typing ("Quinn" → "Qu")

### Context

Runtime evidence (simulator, fresh install): the name field **displayed** "Quinn" after fast HID typing, but the committed value in onboarding state was **"Qu"** — the truncated name then appeared in every personalized headline, was baked server-side into AI-generated devotional text, and shows in the Today greeting.

The input is a fully controlled TextInput inside the 3,200-line onboarding screen — `src/app/onboarding.tsx:2025–2049`:

```tsx
          <TextInput
            value={data.name}
            onChangeText={(text) => setData((prev) => ({ ...prev, name: text }))}
            placeholder={step.placeholder}
            …
            autoFocus
            maxLength={INPUT_LIMITS.NAME.max}
            onSubmitEditing={canProceed() ? handleNext : undefined}
            returnKeyType="done"
          />
          <VoiceInputBar
            value={data.name}
            onChangeText={(text) => setData((prev) => ({ ...prev, name: text }))}
          />
```

Root-cause analysis (from code): `setData` uses functional updates, so JS-side ordering cannot lose characters by itself. For displayed-native-text ("Quinn") to diverge from JS state ("Qu"), one of two known controlled-TextInput race paths must occur under fast typing while the heavy parent re-renders on every keystroke:
1. **Lost change events** — late `onChange` events (carrying the full text, not deltas) never reach `setData`, leaving state at a prefix while native keeps the full text. Matches the observed symptom exactly.
2. **Stale value push-back** — a lagging render commits `value="Qu"` back into the native field after native reached "Quinn" (the classic RN controlled-input clobber; display divergence then depends on event-count timing).

The fix closes BOTH paths and is robust regardless of which occurred:
- Make the field **uncontrolled** (`defaultValue` instead of `value`) → React never writes back into the native field during typing (closes path 2).
- Add **`onEndEditing` reconciliation** — when editing ends (keyboard "done", or `Keyboard.dismiss()` inside `handleNext` at `onboarding.tsx:1069`), the event's `nativeEvent.text` carries the full, authoritative native text; committing it overwrites any prefix left by lost events (closes path 1). All consumers of `data.name` (personalization graph `:1505`, mirror-back generation `:711`, sample-generation request built in `handleNext` `:1050`, store persist `:865/:890`) read it after the step transition, well after the reconciliation lands.
- All three writers (TextInput typing, `onEndEditing`, VoiceInputBar) go through ONE helper (vault `deterministic-twin-paths-must-share-one-helper`).
- Voice dictation appends text programmatically; with `defaultValue` the field won't re-render the new value, so the voice path remounts the input via a `key` bump.

### Failing test FIRST

Create `src/lib/__tests__/onboarding-name-commit.test.ts` (source contract — behavioral simulator typing cannot run in Jest; this repo's convention for such invariants is source-contract tests, see `today-motion-regression.test.ts`):

```ts
import * as fs from 'fs';
import * as path from 'path';

const src = fs.readFileSync(
  path.join(__dirname, '../../app/onboarding.tsx'),
  'utf-8',
);

describe('onboarding name input commit safety (RT-ONB-1)', () => {
  // Slice the text-step block, then the TextInput JSX inside it, so the
  // assertions cannot accidentally match VoiceInputBar's `value` prop.
  const textStepStart = src.indexOf("if (step.type === 'text') {");
  const textStepEnd = src.indexOf("if (step.type === 'multiline') {", textStepStart);
  const textStepBlock = src.slice(textStepStart, textStepEnd);
  const textInputBlock = textStepBlock.slice(
    textStepBlock.indexOf('<TextInput'),
    textStepBlock.indexOf('<VoiceInputBar'),
  );

  it('does not drive the name field as a controlled input (no value-prop write-back race)', () => {
    expect(textStepStart).toBeGreaterThan(-1);
    expect(textStepEnd).toBeGreaterThan(textStepStart);
    expect(textInputBlock).toContain('defaultValue={data.name}');
    // lowercase-v `value=` prop must be gone (does not match `defaultValue=`)
    expect(textInputBlock).not.toMatch(/\svalue=\{data\.name\}/);
  });

  it('routes every name writer through the single commitName helper', () => {
    expect(src).toContain('const commitName = ');
    expect(src).toContain('onChangeText={commitName}');
    // No inline name writers remain anywhere (both old sites used this exact form)
    const inlineNameWrites =
      src.match(/setData\(\(prev\) => \(\{ \.\.\.prev, name: text \}\)\)/g) ?? [];
    expect(inlineNameWrites.length).toBe(0);
  });

  it('reconciles the committed name from the native field text when editing ends', () => {
    expect(src).toContain('onEndEditing={(e) => commitName(e.nativeEvent.text)}');
  });

  it('remounts the field after a voice-dictation commit so the appended text renders', () => {
    expect(src).toContain('nameInputResetKey');
  });
});
```

Run: `npx jest src/lib/__tests__/onboarding-name-commit.test.ts` → **Expected now: FAIL, 4 failed tests** (today the input is controlled, there is no `commitName`, no `onEndEditing`, no reset key — verify with `grep -n 'commitName\|onEndEditing\|nameInputResetKey' src/app/onboarding.tsx` → no matches).

### Edits (all in `src/app/onboarding.tsx`)

**1.** Near the other local state in `OnboardingScreen` (e.g. directly after `const [companionNameInput, setCompanionNameInput] = useState('');` at `:438`), add:

```tsx
  // RT-ONB-1: the name field is uncontrolled (defaultValue) so React never
  // writes back into the native field mid-typing; commitName is the single
  // writer for data.name; onEndEditing reconciles from the authoritative
  // native text; the reset key remounts the field after voice dictation.
  const [nameInputResetKey, setNameInputResetKey] = useState(0);
  const commitName = useCallback((text: string) => {
    setData((prev) => (prev.name === text ? prev : { ...prev, name: text }));
  }, []);
```

(`useCallback` is already imported at the top of the file; verify, otherwise add it to the React import.)

**2.** Replace the text-step input block at `:2022–2052`. Before — the excerpt in Context. After:

```tsx
    // Standard input types
    if (step.type === 'text') {
      return (
        <View style={{ marginTop: Spacing['2'] }}>
          <TextInput
            key={`name-input-${nameInputResetKey}`}
            defaultValue={data.name}
            onChangeText={commitName}
            onEndEditing={(e) => commitName(e.nativeEvent.text)}
            placeholder={step.placeholder}
            placeholderTextColor={colors.textMuted}
            style={{
              fontFamily: FontFamily.body,
              fontSize: FontSize.lg,
              color: colors.text,
              paddingVertical: Spacing['4'],
              paddingHorizontal: Spacing['5'],
              backgroundColor: colors.inputBackground,
              borderRadius: Radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            autoFocus
            maxLength={INPUT_LIMITS.NAME.max}
            onSubmitEditing={canProceed() ? handleNext : undefined}
            returnKeyType="done"
          />
          <VoiceInputBar
            value={data.name}
            onChangeText={(text) => {
              commitName(text);
              setNameInputResetKey((k) => k + 1);
            }}
          />
        </View>
      );
    }
```

Notes for the executor:
- The style object is unchanged — copy it verbatim from the existing code.
- `canProceed()` for the text step reads `data.name`, which still updates on every keystroke via `commitName` → the top-right Continue appears exactly as before.
- Known acceptable side effect: after a voice-dictation commit the remount re-triggers `autoFocus` (keyboard reopens). That matches the pre-existing behavior of returning to edit after dictation.
- This is the ONLY `step.type === 'text'` input (the name step, `id: 'name'` at `:271`); the `multiline` steps at `:2118/:2142` are out of scope (no truncation evidence; do not touch them).

### Verification

- `npx jest src/lib/__tests__/onboarding-name-commit.test.ts` → **PASS, 4 tests**.
- `npx jest src/lib/__tests__/onboarding-step-helpers.test.ts` → **PASS** (pre-existing 13+ tests; ensures step plumbing untouched).
- `npm run typecheck` / `npm run lint` → exit 0.
- MANUAL (flag for Nick's device pass, do not block the plan on it): fresh onboarding, type a 5+ character name as fast as possible, proceed to the personalization graph — headline must show the full name.

### Hard boundaries / STOP conditions

- If the TextInput block at `:2022–2052` does not match the Context excerpt, STOP and report drift.
- Do NOT change `VoiceInputBar` internals (`src/components/VoiceInputBar.tsx`) — its `valueRef`-based append already works with the new wiring.
- Do NOT add trimming/sanitization here (companion-name trim is RT-ONB-7, another batch).
- Do NOT touch `handleNext`, `canProceed`, or step-advance timing.

---

## Fix 6 — RT-ONB-2 (P1): "Your story stays on your device." is a false privacy claim

### Context

`src/app/onboarding.tsx:272` — the about-you step subtext:

```ts
  { id: 'aboutMe', question: 'Tell me about yourself.', subtext: 'The more you share, the more personal your devotionals become. Your story stays on your device.', type: 'multiline' as const, placeholder: "I'm a dad, an entrepreneur, and lately I've been wrestling with...", adaptive: false, skipIfHasValue: true, hasVariations: false },
```

The claim is contradicted by the code on the same screen flow: `aboutMe` is sent to the backend in the sample-generation request (`generation-api.ts:76` includes `aboutMe: string` in the request payload; `onboarding-step-helpers.ts:299` packs it), in mirror-back generation (`onboarding.tsx:712`), and is synced to the server user profile (`user-profile-sync.ts:43` `aboutMe: user.aboutMe`). Runtime evidence: the generated sample devotional echoed verbatim about-me details. This is a user-trust problem and an App Review exposure (false on-screen privacy claim) on the submission candidate. This is the only occurrence in `src/` (verified: `grep -rn "stays on your device" src` → 1 hit).

### PRODUCT DECISION (flagged for Nick; plan implements Option A)

- **Option A (RECOMMENDED, implemented): delete the false sentence.** Subtext becomes only "The more you share, the more personal your devotionals become." Zero new claims, minimal diff for the App Review-prep build.
- Option B: replace with honest reassurance, e.g. "Your story is used only to personalize your devotionals." — warmer, but introduces a new claim that must be checked against the privacy policy / data-use disclosures before shipping; Nick's call.
- Option C: behavior change (true on-device-only story). Infeasible — generation is server-side LLM by design.

### Failing test FIRST

Add to the existing onboarding contract coverage — create `src/lib/__tests__/onboarding-privacy-copy.test.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';

describe('onboarding privacy copy honesty (RT-ONB-2)', () => {
  it('makes no on-device privacy claim anywhere in src (aboutMe is sent to the backend)', () => {
    const sourceRoot = path.join(__dirname, '../..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          if (fs.readFileSync(full, 'utf-8').includes('stays on your device')) {
            offenders.push(path.relative(sourceRoot, full));
          }
        }
      }
    };
    walk(sourceRoot);
    expect(offenders).toEqual([]);
  });
});
```

Run: `npx jest src/lib/__tests__/onboarding-privacy-copy.test.ts` → **Expected now: FAIL — offenders `['app/onboarding.tsx']`.**

### Edit

`src/app/onboarding.tsx:272` — change only the `subtext` value. Before:

```
subtext: 'The more you share, the more personal your devotionals become. Your story stays on your device.'
```

After:

```
subtext: 'The more you share, the more personal your devotionals become.'
```

Everything else on the line stays byte-identical.

### Verification

- `npx jest src/lib/__tests__/onboarding-privacy-copy.test.ts` → **PASS, 1 test**.
- `npm run typecheck` / `npm run lint` → exit 0.

### Hard boundaries / STOP conditions

- Single-line copy change. Do NOT alter `question`, `placeholder`, step ids, or step ordering.
- Do NOT add replacement privacy copy without Nick's sign-off (Option B is his decision).
- Backend data handling, privacy-policy text, and App Store privacy labels are out of scope (backend batch owns server-side concerns).

---

## Final verification gate (run after all six fixes)

```bash
cd /Users/galangster/clawd/work/unfold-audit

# 1. New + extended suites, focused:
npx jest src/lib/__tests__/reduce-motion-loop-coverage.test.ts \
         src/lib/__tests__/onboarding-paywall-a11y-contract.test.ts \
         src/lib/__tests__/unfolded-debug-chrome.test.ts \
         src/lib/__tests__/creation-gate-policy.test.ts \
         src/lib/__tests__/creation-gate-feedback-wiring.test.ts \
         src/lib/__tests__/onboarding-name-commit.test.ts \
         src/lib/__tests__/onboarding-privacy-copy.test.ts
# EXPECTED: Test Suites: 7 passed, 7 total
# EXPECTED: Tests: 29 passed (6 + 5 + 2 + 9 + 2 + 4 + 1), 0 failed

# 2. Full suite (no regressions anywhere):
npm test
# EXPECTED: 0 failed suites, 0 failed tests (baseline was fully green at 9f36ef6)

# 3. Static gates:
npm run typecheck   # EXPECTED: exit 0, no output
npm run lint        # EXPECTED: exit 0

# 4. Diff hygiene — the change set must touch ONLY these files:
git status --short
# EXPECTED modified: src/app/how-it-works.tsx, src/app/onboarding.tsx,
#   src/app/unfolded.tsx, src/app/(tabs)/(today)/evening-wind-down.tsx,
#   src/components/EmberParticles.tsx, src/components/onboarding/GrowthGraph.tsx,
#   src/components/TypewriterText.tsx, src/components/StreakDisplay.tsx,
#   src/components/AccentGlow.tsx, src/components/companion/StreamingCursor.tsx,
#   src/components/RippleLoader.tsx, src/components/AudioWaveform.tsx,
#   src/components/onboarding/ThreeStepPaywall.tsx, src/constants/colors.ts,
#   src/lib/creation-gate-policy.ts, src/hooks/useCreationGate.ts,
#   src/lib/__tests__/creation-gate-policy.test.ts
# EXPECTED new: the 6 new test files listed above
# NOTE: ios/Podfile.lock shows as pre-existing dirty in this worktree — leave it; do not commit it.
```

Machine-checkable done criteria: all four gates above green + `git status --short -- src/ | wc -l` = 23 (17 modified + 6 new test files; untracked tests show as `??`).

## Global out-of-scope (entire plan)

- No App Review submission, build cutting, TestFlight, or release actions (Nick-gated).
- No route registration/unregistration (`/unfolded` gating = UX-11, other batch).
- No backend changes (tts/bug-report stubs = BCK findings, backend batch).
- No `UIBackgroundModes`/Info.plist/native config (NAT/DEP findings, other batch).
- No Dynamic Type, contrast-token retunes beyond the SAVE badge, or other A11Y P2s not explicitly folded in here (A11Y-3, 5–15 are separate).
- No animation redesigns — gates only, zero timing/easing/visual changes for motion-enabled users.
- Do not commit or push; leave the working tree for review.
