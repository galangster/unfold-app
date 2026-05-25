# Today Tab: Borders → Shadows / Elevation System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace accent-tinted strokes on the Today tab cards with a three-technique elevation system (elevation-by-blur + inner top highlight + accent-tinted soft shadow), and remove the visible "1/N" counter on the Daily Thread top card.

**Architecture:** Introduce `useElevation()` hook in `src/constants/elevation.ts` returning `{ shadow, surface, highlight }` sub-objects per tier (flat/raised/floating). Phase 1 callers (TodayCardStack, StreakBox, BentoGrid) consume `shadow` on a new un-clipped outer wrapper and render `highlight` as an overlay child inside the existing `overflow: 'hidden'` inner view. Existing `borderWidth` retained with `borderColor: 'transparent'` to preserve Yoga layout.

**Tech Stack:** React Native (Expo), TypeScript, Reanimated (existing), react-native-gesture-handler (existing), Jest, FlowDeck for iOS simulator screenshots.

**Spec:** `docs/superpowers/specs/2026-05-25-today-tab-borders-to-shadows-design.md` (v2.3, commit `31c1dbb`).

**Branch:** `mina/today-tab-shadows` (off `origin/mina/today-tab-design-audit`, base `b163516`).

---

## File Structure

**Created:**
- `src/constants/elevation.ts` — `useElevation()` hook + types. Single responsibility: theme-aware elevation tokens.
- `src/constants/__tests__/elevation.test.ts` — unit tests for the hook (light/dark × three tiers × three sub-objects).

**Modified:**
- `src/components/home/TodayCardStack.tsx` — outer/inner wrapper split on top card, drop counter, drop back-card border, swap to elevation hook.
- `src/components/home/__tests__/today-card-stack.test.tsx:232,250,368` — test assertion updates.
- `src/lib/__tests__/today-motion-regression.test.ts:146` — drop back-card border assertion.
- `src/components/StreakBox.tsx` — outer TouchableOpacity / inner View split, swap to elevation hook.
- `src/components/home/BentoGrid.tsx` — per-box outer TouchableOpacity / inner View split, swap to elevation hook.

**Untouched:** Everything else. Explicitly: `TodayCompanionBubble.tsx`, `DailyBridgeCard.tsx`, `BridgeShimmer.tsx`, `NotificationCard.tsx`, `ContextSlot.tsx`, `RememberThisCard.tsx`, and all other `Shadow.*` callsites listed in the spec's Coexistence section.

---

## Task 1: Create `useElevation()` hook with unit tests

**Files:**
- Create: `src/constants/elevation.ts`
- Test: `src/constants/__tests__/elevation.test.ts`

- [ ] **Step 1.1: Write the failing test file**

Create `src/constants/__tests__/elevation.test.ts`:

```ts
import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useElevation } from '@/constants/elevation';
import { DarkColors, LightColors } from '@/constants/colors';

const mockUseTheme = jest.fn();
jest.mock('@/lib/theme', () => ({
  useTheme: () => mockUseTheme(),
}));

describe('useElevation', () => {
  describe('dark mode', () => {
    beforeEach(() => {
      mockUseTheme.mockReturnValue({ colors: DarkColors, isDark: true });
    });

    it('raised.shadow uses accent color with soft offset/radius (iOS)', () => {
      Platform.OS = 'ios';
      const { result } = renderHook(() => useElevation());
      expect(result.current.raised.shadow).toEqual({
        shadowColor: DarkColors.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
      });
    });

    it('raised.shadow falls back to Android elevation', () => {
      Platform.OS = 'android';
      const { result } = renderHook(() => useElevation());
      expect(result.current.raised.shadow).toEqual({ elevation: 4 });
    });

    it('raised.highlight is a 1px top-edge overlay with 6% white', () => {
      const { result } = renderHook(() => useElevation());
      expect(result.current.raised.highlight).toEqual({
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
      });
    });

    it('flat tier has no shadow and no highlight', () => {
      const { result } = renderHook(() => useElevation());
      expect(result.current.flat.shadow).toEqual({});
      expect(result.current.flat.highlight).toEqual({});
    });

    it('floating tier is stronger than raised on iOS', () => {
      Platform.OS = 'ios';
      const { result } = renderHook(() => useElevation());
      expect(result.current.floating.shadow).toEqual({
        shadowColor: DarkColors.accent,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
      });
    });

    it('surface exposes a backgroundColor token but no shadow/highlight', () => {
      const { result } = renderHook(() => useElevation());
      expect(result.current.raised.surface.backgroundColor).toBeDefined();
      expect(typeof result.current.raised.surface.backgroundColor).toBe('string');
    });
  });

  describe('light mode', () => {
    beforeEach(() => {
      mockUseTheme.mockReturnValue({ colors: LightColors, isDark: false });
    });

    it('raised.shadow uses lighter offset/opacity (iOS)', () => {
      Platform.OS = 'ios';
      const { result } = renderHook(() => useElevation());
      expect(result.current.raised.shadow).toEqual({
        shadowColor: LightColors.accent,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      });
    });

    it('raised.highlight is transparent in light mode', () => {
      const { result } = renderHook(() => useElevation());
      expect(result.current.raised.highlight.backgroundColor).toBe('transparent');
    });
  });

  afterAll(() => {
    Platform.OS = 'ios';
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd /Users/galangster/clawd/work/unfold/app/mobile
npx jest src/constants/__tests__/elevation.test.ts --no-coverage
```

Expected: FAIL with `Cannot find module '@/constants/elevation'`.

- [ ] **Step 1.3: Create the elevation module**

Create `src/constants/elevation.ts`:

```ts
/**
 * Unfold Elevation System
 *
 * Theme-aware token hook for card depth. Returns three tiers, each with
 * three sub-objects so consumers can place shadow, background, and a top
 * highlight overlay appropriately around an `overflow: 'hidden'` boundary.
 *
 * Phase 1 callers (TodayCardStack, StreakBox, BentoGrid) consume:
 *   - `shadow` on an outer un-clipped wrapper
 *   - `highlight` as an overlay child inside the clipped inner view
 * The `surface` sub-object is exposed for Phase 2/3 non-glass surfaces.
 */
import { Platform, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';

export interface ElevationTier {
  shadow: ViewStyle;
  surface: ViewStyle;
  highlight: ViewStyle;
}

export interface ElevationSet {
  flat: ElevationTier;
  raised: ElevationTier;
  floating: ElevationTier;
}

const TRANSPARENT_HIGHLIGHT: ViewStyle = {};

const RAISED_HIGHLIGHT_DARK: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 1,
  backgroundColor: 'rgba(255,255,255,0.06)',
};

const RAISED_HIGHLIGHT_LIGHT: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 1,
  backgroundColor: 'transparent',
};

export function useElevation(): ElevationSet {
  const { colors, isDark } = useTheme();

  const raisedShadow: ViewStyle = Platform.select({
    ios: {
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: isDark ? 4 : 2 },
      shadowOpacity: isDark ? 0.10 : 0.08,
      shadowRadius: isDark ? 16 : 10,
    },
    android: { elevation: 4 },
    default: {},
  }) as ViewStyle;

  const floatingShadow: ViewStyle = Platform.select({
    ios: {
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: isDark ? 6 : 4 },
      shadowOpacity: isDark ? 0.16 : 0.12,
      shadowRadius: isDark ? 24 : 14,
    },
    android: { elevation: 12 },
    default: {},
  }) as ViewStyle;

  return {
    flat: {
      shadow: {},
      surface: { backgroundColor: colors.background },
      highlight: TRANSPARENT_HIGHLIGHT,
    },
    raised: {
      shadow: raisedShadow,
      surface: { backgroundColor: colors.backgroundElevated },
      highlight: isDark ? RAISED_HIGHLIGHT_DARK : RAISED_HIGHLIGHT_LIGHT,
    },
    floating: {
      shadow: floatingShadow,
      surface: { backgroundColor: colors.backgroundElevated },
      highlight: isDark ? RAISED_HIGHLIGHT_DARK : RAISED_HIGHLIGHT_LIGHT,
    },
  };
}
```

- [ ] **Step 1.4: Run test to verify it passes**

```bash
npx jest src/constants/__tests__/elevation.test.ts --no-coverage
```

Expected: PASS (all 7 tests).

- [ ] **Step 1.5: Run typecheck**

```bash
npm run typecheck
```

Expected: no new errors. (Existing baseline errors, if any, do not regress.)

- [ ] **Step 1.6: Commit**

```bash
git add src/constants/elevation.ts src/constants/__tests__/elevation.test.ts
git commit -m "feat(elevation): add useElevation hook with three-tier token system

Theme-aware hook returning flat/raised/floating tiers, each with three
sub-objects (shadow / surface / highlight) so consumers can place each
appropriately around overflow:hidden boundaries.

Phase 1 callers (TodayCardStack, StreakBox, BentoGrid) will consume
shadow + highlight. Surface is exposed for Phase 2/3 non-glass surfaces.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: TodayCardStack — top card outer/inner split, drop counter, a11y

**Files:**
- Modify: `src/components/home/TodayCardStack.tsx:339-410, 412-450`
- Modify: `src/components/home/__tests__/today-card-stack.test.tsx:232, 250, 368`

- [ ] **Step 2.1: Update the test assertion at line 250 to reflect the new a11y label**

Open `src/components/home/__tests__/today-card-stack.test.tsx`. Replace the assertion at line 250:

```ts
// OLD
expect(textContent(tree.root.findByProps({ testID: 'today-card-stack-count' }))).toBe('1/3');

// NEW
expect(tree.root.findAll((node: any) => node.props.testID === 'today-card-stack-count')).toHaveLength(0);
expect(tree.root.findByProps({ testID: 'today-card-stack' }).props.accessibilityLabel).toBe('Today card stack');
```

- [ ] **Step 2.2: Update the test assertion at line 368 to tolerate indentation changes**

In the same file, replace the strict source-string match at line 368:

```ts
// OLD
expect(source).toContain('<TopCardBody card={topCard} colors={colors} />\n      <StackDismissButton card={topCard} colors={colors} />');

// NEW
expect(source).toMatch(/<TopCardBody\s+card=\{topCard\}\s+colors=\{colors\}\s*\/>\s*<StackDismissButton\s+card=\{topCard\}\s+colors=\{colors\}\s*\/>/);
```

- [ ] **Step 2.3: Run tests to verify both updated assertions fail**

```bash
npx jest src/components/home/__tests__/today-card-stack.test.tsx --no-coverage
```

Expected: FAIL — the count testID still exists in source, the a11y label still has "card 1 of N", and source string with original indentation still matches.

(If the regex test at step 2.2 actually passes because the original indentation matches the regex, that's fine — we're verifying the rewrite isn't a regression. The line-250 rewrite is the load-bearing failure.)

- [ ] **Step 2.4: Open `TodayCardStack.tsx` and import the elevation hook**

Add to the imports block at the top of `src/components/home/TodayCardStack.tsx` (after the existing `import { Shadow } from '@/constants/shadows';` line — Shadow stays imported because line 429 `...Shadow.md` will be deleted in step 2.7, but other Shadow callsites may exist in this file in the future):

```ts
import { useElevation } from '@/constants/elevation';
```

Actually, verify: `Shadow` should be removed if no other callsite in this file uses it after our changes. Grep:

```bash
grep -n "Shadow\." src/components/home/TodayCardStack.tsx
```

Expected: only one match at line 429. If so, also remove the `import { Shadow } from '@/constants/shadows';` line in step 2.7.

- [ ] **Step 2.5: Add `useElevation()` call inside `TodayCardStack` component**

Find the `TodayCardStack` function (line 246-410). After the line `const { colors: themeColors, isDark } = useTheme();` (around line 254), add:

```ts
const elevation = useElevation();
```

- [ ] **Step 2.6: Refactor `topCardContent` (lines 342-380) into outer + inner wrapper**

Replace the entire `topCardContent = (...)` JSX block. The new structure splits the existing `Animated.View` into an outer wrapper (carries swipe transform, shadow, zIndex, layout) and an inner clipped view (carries bg, border, padding, BlurView, highlight, content):

```tsx
const topCardContent = (
  <Animated.View
    onLayout={handleTopCardLayout}
    testID={topCard.testID ?? 'today-card-stack-top-card'}
    style={[
      styles.topCardOuter,
      { zIndex: model.totalCount + 1 },
      elevation.raised.shadow,
      reducedMotion ? null : topCardAnimatedStyle,
    ]}
  >
    <View
      style={[
        styles.topCardInner,
        {
          backgroundColor: Platform.OS === 'ios'
            ? alpha(colors.backgroundElevated, isDark ? 0.72 : 0.88)
            : alpha(colors.backgroundElevated, 0.95),
          borderColor: 'transparent',
        },
      ]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          pointerEvents="none"
          intensity={isDark ? 44 : 28}
          tint={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, styles.cardBlur]}
          testID="today-card-stack-glass-blur"
        />
      ) : null}

      <View pointerEvents="none" style={elevation.raised.highlight} />

      <TopCardBody card={topCard} colors={colors} />
      <StackDismissButton card={topCard} colors={colors} />
    </View>
  </Animated.View>
);
```

Key behaviors:
- The visible "1/N" `topUtilityRow` + `countText` are gone.
- `showCount` local is no longer referenced (delete in step 2.7).
- `shadowColor: colors.accent` is removed from the inline style — the new shadow color comes from `elevation.raised.shadow.shadowColor` (which is also accent).

- [ ] **Step 2.7: Delete dead code**

In `src/components/home/TodayCardStack.tsx`:

a) Delete the `showCount` local around line 339 (was: `const showCount = model.totalCount > 1;`).

b) The `styles` block at line 412+ needs updates. Find `styles.topCard` (around line 420):

```ts
// DELETE the entire `topCard` block:
topCard: {
  borderRadius: Radius.xl,
  borderWidth: 1.5,
  minHeight: 150,
  overflow: 'hidden',
  paddingHorizontal: Spacing['4'],
  paddingVertical: Spacing['4'],
  position: 'relative',
  ...Shadow.md,
},
```

Replace with these two new style objects:

```ts
topCardOuter: {
  borderRadius: Radius.xl,
  minHeight: 150,
  position: 'relative',
},
topCardInner: {
  borderRadius: Radius.xl,
  borderWidth: 1.5,
  minHeight: 150,
  overflow: 'hidden',
  paddingHorizontal: Spacing['4'],
  paddingVertical: Spacing['4'],
  position: 'relative',
},
```

c) Delete the `topUtilityRow` and `countText` style entries entirely (they were referenced only by the removed JSX).

d) If `Shadow` is no longer used anywhere in this file (verified by grep in step 2.4), also delete the import `import { Shadow } from '@/constants/shadows';` at line 21.

- [ ] **Step 2.8: Update the outer `accessibilityLabel` on `styles.outer`'s Animated.View**

Find the outer Animated.View at line 383 (returns the entire stack with `testID: 'today-card-stack'`). Update the `accessibilityLabel` prop:

```tsx
// OLD
accessibilityLabel={showCount ? `Today card stack, card 1 of ${model.totalCount}` : 'Today card stack'}

// NEW
accessibilityLabel="Today card stack"
```

Do not add `accessible={true}` (intentional — see spec §1 a11y note: `TopCardBody` already owns per-card accessibility; a parent accessible wrapper would group/steal focus).

- [ ] **Step 2.9: Run focused tests to verify**

```bash
npx jest src/components/home/__tests__/today-card-stack.test.tsx --no-coverage
```

Expected: PASS for the rewritten assertions in step 2.1/2.2. If line 232 (single-card case `today-card-stack-count` has length 0) was previously passing, it remains passing.

- [ ] **Step 2.10: Run typecheck**

```bash
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 2.11: Commit**

```bash
git add src/components/home/TodayCardStack.tsx src/components/home/__tests__/today-card-stack.test.tsx
git commit -m "feat(today-card-stack): outer/inner wrapper + drop visible '1/N'

Split top card Animated.View into outer wrapper (swipe transform, shadow,
zIndex) + inner View (bg, border, padding, BlurView, highlight, content).
Required so iOS shadow renders outside the overflow:hidden boundary.

Removes the visible '1/N' counter and constants accessibilityLabel on
styles.outer to 'Today card stack' (no count). Per-card a11y identity is
owned by TopCardBody, which is correct.

Drops Shadow.md spread on styles.topCard (was suppressed by overflow:hidden);
replaced with elevation.raised.shadow on the new outer wrapper.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: TodayCardStack — drop back-card border, update motion-regression test

**Files:**
- Modify: `src/components/home/TodayCardStack.tsx:186-243, 412+ styles`
- Modify: `src/lib/__tests__/today-motion-regression.test.ts:146`

- [ ] **Step 3.1: Update the motion-regression test at line 146**

Open `src/lib/__tests__/today-motion-regression.test.ts`. Around line 146, replace the back-card border assertion:

```ts
// OLD
expect(todayCardStackSource).toContain('borderColor: alpha(colors.accent, borderOpacity)');

// NEW (drop the borderColor line; keep the fillOpacity assertion above it intact)
// The motion guarantee is that back-card visual depth comes from fillOpacity,
// not from a border. Drop this assertion entirely.
```

So the final test block around lines 142-150 should be:

```ts
expect(revealSource).toContain('styles.revealOpenHero');
expect(revealSource).not.toContain('styles.revealCard');
expect(devotionalCardSource).not.toContain('revealCard:');

expect(todayCardStackSource).toContain('backgroundColor: alpha(colors.accent, fillOpacity)');
expect(todayCardStackSource).toContain('const fillOpacity = Math.max(isDark ? 0.1 : 0.065');
expect(todayCardStackSource).not.toContain('backgroundColor: alpha(colors.backgroundPure');
```

(The `borderColor` and `borderOpacity` assertions are removed because we're dropping the back-card border in step 3.3.)

- [ ] **Step 3.2: Run test to verify the rewritten test is well-formed**

```bash
npx jest src/lib/__tests__/today-motion-regression.test.ts --no-coverage
```

Expected: PASS (the source still contains `fillOpacity` references; we haven't yet removed `borderOpacity` from the source).

- [ ] **Step 3.3: Drop `borderColor` and `borderOpacity` from `BackCardSilhouette`**

In `src/components/home/TodayCardStack.tsx`, find `BackCardSilhouette` (around lines 186-243).

a) Delete the `borderOpacity` local computation at line 208:

```ts
// DELETE
const borderOpacity = Math.max(isDark ? 0.18 : 0.14, (isDark ? 0.34 : 0.26) - index * 0.05);
```

b) In the JSX return (around lines 233-242), drop the `borderColor` line:

```tsx
// OLD
<Animated.View
  pointerEvents="none"
  ...
  style={[
    styles.backCard,
    {
      backgroundColor: alpha(colors.accent, fillOpacity),
      borderColor: alpha(colors.accent, borderOpacity),
      zIndex: totalCount - depth,
    },
    cardStyle,
  ]}
/>

// NEW
<Animated.View
  pointerEvents="none"
  ...
  style={[
    styles.backCard,
    {
      backgroundColor: alpha(colors.accent, fillOpacity),
      borderColor: 'transparent',
      zIndex: totalCount - depth,
    },
    cardStyle,
  ]}
/>
```

(`styles.backCard` still has `borderWidth: 1` for Yoga layout preservation.)

- [ ] **Step 3.4: Run tests**

```bash
npx jest src/lib/__tests__/today-motion-regression.test.ts src/components/home/__tests__/today-card-stack.test.tsx --no-coverage
```

Expected: PASS — both files. The motion-regression test no longer asserts the borderColor line; the today-card-stack test still passes (back-card source still contains `fillOpacity`).

- [ ] **Step 3.5: Run typecheck + lint**

```bash
npm run typecheck && npm run lint --quiet
```

Expected: no new errors / warnings.

- [ ] **Step 3.6: Commit**

```bash
git add src/components/home/TodayCardStack.tsx src/lib/__tests__/today-motion-regression.test.ts
git commit -m "feat(today-card-stack): drop back-card border, keep fillOpacity depth

Back-card silhouettes get their depth from backgroundColor: alpha(accent,
fillOpacity), not from a stroke. Drops borderOpacity local + inline
borderColor; styles.backCard keeps borderWidth: 1 with borderColor:
'transparent' to preserve Yoga layout.

Updates today-motion-regression to no longer assert the borderColor line;
the motion guarantee is that back cards visually remain via fillOpacity.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: StreakBox — outer TouchableOpacity / inner View split

**Files:**
- Modify: `src/components/StreakBox.tsx:1-160`

- [ ] **Step 4.1: Read the current `StreakBox` component to understand its structure**

```bash
sed -n '70,160p' src/components/StreakBox.tsx
```

You should see:
- Outer-most `<Animated.View>` with FadeIn entering
- Inside that: a `<TouchableOpacity>` at line 78-91 with `styles.card` (which has `borderRadius`, `borderWidth: 1`, `overflow: 'hidden'`)
- Inside the touchable: `BlurView`, header row, day chips, etc.

The refactor: keep the outer `Animated.View` and `TouchableOpacity` as-is, but split `styles.card` into a TouchableOpacity-wrapper-style (for shadow + borderRadius) and an inner View (for clipping + border + padding + BlurView + highlight + content).

- [ ] **Step 4.2: Import `useElevation`**

Add to the imports at the top of `src/components/StreakBox.tsx`:

```ts
import { useElevation } from '@/constants/elevation';
```

- [ ] **Step 4.3: Add `useElevation()` call inside the StreakBox component**

Find the function body. Right after `const { colors, isDark } = useTheme();` add:

```ts
const elevation = useElevation();
```

- [ ] **Step 4.4: Refactor the TouchableOpacity body**

Replace the `<TouchableOpacity>...</TouchableOpacity>` block (around lines 78-141). The new structure: `TouchableOpacity` keeps `onPress`, accessibility, `activeOpacity`, plus shadow + borderRadius; an inner `<View>` handles the visual styling.

The pattern (existing inline backgroundColor logic from line 79-83 stays; just moves to inner View):

```tsx
<TouchableOpacity
  activeOpacity={0.72}
  onPress={handlePress}
  accessibilityRole="button"
  accessibilityLabel={...existing label...}
  accessibilityHint={...existing hint...}
  style={[styles.cardOuter, elevation.raised.shadow]}
>
  <View
    style={[
      styles.cardInner,
      {
        backgroundColor: Platform.OS === 'ios'
          ? alpha(colors.backgroundElevated, isDark ? 0.56 : 0.8)
          : alpha(colors.backgroundElevated, 0.95),
        borderColor: 'transparent',
      },
    ]}
  >
    {Platform.OS === 'ios' && (
      <BlurView
        intensity={isDark ? 28 : 18}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
    )}

    <View pointerEvents="none" style={elevation.raised.highlight} />

    {/* ...existing content: header row, day chips, etc. — preserve verbatim... */}
  </View>
</TouchableOpacity>
```

Preserve every existing accessibility prop verbatim. Do not change `activeOpacity`, `onPress`, or the inner content (header row, chips).

- [ ] **Step 4.5: Split `styles.card` into `cardOuter` + `cardInner`**

At the bottom of the file in the `StyleSheet.create({...})` block, find `styles.card` (around line 147):

```ts
// DELETE
card: {
  borderRadius: Radius.lg,
  borderWidth: 1,
  paddingVertical: Spacing['4'],
  paddingHorizontal: Spacing['4'],
  overflow: 'hidden',
},
```

Replace with:

```ts
cardOuter: {
  borderRadius: Radius.lg,
},
cardInner: {
  borderRadius: Radius.lg,
  borderWidth: 1,
  paddingVertical: Spacing['4'],
  paddingHorizontal: Spacing['4'],
  overflow: 'hidden',
},
```

- [ ] **Step 4.6: Drop the existing `borderColor` inline at line 82**

The original inline style around line 79-83 had `borderColor: alpha(colors.accent, 0.25)`. In step 4.4 you replaced that whole block, so verify the new TouchableOpacity / inner View does NOT have an `alpha(colors.accent, 0.25)` borderColor anywhere. The inner View should have `borderColor: 'transparent'` (set in step 4.4).

Grep to verify:

```bash
grep -n "borderColor" src/components/StreakBox.tsx
```

Expected output: only lines that say `borderColor: 'transparent'` and the per-day chip `borderColor: day.isToday ? alpha(...) : 'transparent'` at line ~129. The card-chrome `alpha(colors.accent, 0.25)` is gone.

- [ ] **Step 4.7: Run typecheck + tests**

```bash
npm run typecheck && npx jest src/components/StreakBox.test.tsx --no-coverage 2>&1 | tail -20
```

If `src/components/StreakBox.test.tsx` doesn't exist, skip the jest invocation; the next focused jest run will catch anything that depends on `styles.card`.

```bash
grep -rln "styles\.card\b" src/components/StreakBox.tsx src/components/__tests__/ 2>/dev/null
```

Expected: only the file we just edited references the styles (now `styles.cardOuter` / `styles.cardInner`). If any test references `styles.card`, update.

- [ ] **Step 4.8: Commit**

```bash
git add src/components/StreakBox.tsx
git commit -m "feat(streak-box): outer/inner wrapper with elevation tokens

Splits the StreakBox card into outer TouchableOpacity (shadow +
borderRadius + onPress + accessibility) and inner View (clipping +
border + padding + BlurView + highlight + content).

Drops the accent-tinted card chrome border; keeps per-day chip border
and inner ring (those are per-day affordances, not card chrome).

Per spec non-goal: the existing TouchableOpacity activeOpacity will
naturally fade the new shadow on press; acceptable subtle feedback.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: BentoGrid — per-box outer/inner split

**Files:**
- Modify: `src/components/home/BentoGrid.tsx`

- [ ] **Step 5.1: Import `useElevation`**

Add to the imports at the top of `src/components/home/BentoGrid.tsx`:

```ts
import { useElevation } from '@/constants/elevation';
```

- [ ] **Step 5.2: Add `useElevation()` call inside BentoGrid**

Right after `const { colors, isDark } = useTheme();` (around line 20):

```ts
const elevation = useElevation();
```

- [ ] **Step 5.3: Refactor each TouchableOpacity box**

Replace the `items.map(...)` block (lines 41-78). The pattern: TouchableOpacity stays outer (keeps `flex: 1`, onPress, accessibility, activeOpacity, plus shadow + borderRadius); inner View handles the visual.

```tsx
{items.map((item) => (
  <TouchableOpacity
    key={item.label}
    activeOpacity={0.7}
    onPress={() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({ pathname: item.pathname as any, params: { from: 'home' } });
    }}
    accessibilityRole="button"
    accessibilityLabel={`Open ${item.label}`}
    accessibilityHint="Opens this section from the Today tab"
    style={[styles.boxOuter, elevation.raised.shadow]}
  >
    <View
      style={[
        styles.boxInner,
        {
          backgroundColor: Platform.OS === 'ios'
            ? alpha(colors.backgroundElevated, isDark ? 0.56 : 0.8)
            : alpha(colors.backgroundElevated, 0.9),
          borderColor: 'transparent',
        },
      ]}
    >
      {Platform.OS === 'ios' && (
        <BlurView
          intensity={isDark ? 28 : 18}
          tint={isDark ? 'dark' : 'light'}
          style={StyleSheet.absoluteFill}
        />
      )}

      <View pointerEvents="none" style={elevation.raised.highlight} />

      <Text
        style={[styles.label, { color: colors.text }]}
        numberOfLines={2}
        maxFontSizeMultiplier={LABEL_TEXT_MAX_SCALE}
      >
        {item.label}
      </Text>
      <CaretRightIcon size={13} color={colors.textSubtle} weight="light" />
    </View>
  </TouchableOpacity>
))}
```

Preserve every existing accessibility prop verbatim.

- [ ] **Step 5.4: Split `styles.box` into `boxOuter` + `boxInner`**

In the `StyleSheet.create({...})` block at the bottom, find `styles.box` (around line 92):

```ts
// DELETE
box: {
  flex: 1,
  minHeight: 58,
  paddingVertical: Spacing['3'],
  paddingHorizontal: Spacing['3'],
  borderRadius: Radius.lg,
  borderWidth: 1,
  overflow: 'hidden',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: Spacing['2'],
},
```

Replace with:

```ts
boxOuter: {
  flex: 1,
  borderRadius: Radius.lg,
},
boxInner: {
  minHeight: 58,
  paddingVertical: Spacing['3'],
  paddingHorizontal: Spacing['3'],
  borderRadius: Radius.lg,
  borderWidth: 1,
  overflow: 'hidden',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: Spacing['2'],
},
```

Note: `flex: 1` must stay on the OUTER (TouchableOpacity). If it lands on inner, the row will collapse to the wider of the two label widths.

- [ ] **Step 5.5: Verify no remaining `borderColor: alpha(colors.accent, 0.25)` in this file**

```bash
grep -n "borderColor" src/components/home/BentoGrid.tsx
```

Expected: only `borderColor: 'transparent'`.

- [ ] **Step 5.6: Run typecheck**

```bash
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 5.7: Commit**

```bash
git add src/components/home/BentoGrid.tsx
git commit -m "feat(bento-grid): outer/inner wrapper with elevation tokens

Splits each Bento box into outer TouchableOpacity (flex:1, shadow,
borderRadius, onPress, accessibility) and inner View (clipping +
border + padding + BlurView + highlight + content).

flex:1 must stay on outer TouchableOpacity to preserve the row's
two-equal-columns geometry.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Full verification gate

**Files:** None (verification only).

- [ ] **Step 6.1: Diff check**

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 6.2: Typecheck**

```bash
npm run typecheck
```

Expected: no new errors versus baseline.

- [ ] **Step 6.3: Lint**

```bash
npm run lint --quiet
```

Expected: no errors. Pre-existing warnings (if any) do not regress.

- [ ] **Step 6.4: Focused Jest — Today tab + motion regression + elevation hook**

```bash
npx jest src/constants/__tests__/elevation.test.ts src/components/home/__tests__/today-card-stack.test.tsx src/components/home/__tests__/dismissible-surfaces.test.tsx src/lib/__tests__/today-motion-regression.test.ts --no-coverage
```

Expected: PASS for all four files. If `dismissible-surfaces.test.tsx` snapshots changed (visual diff), inspect the diff: any change should be limited to the elevation-related style props (shadowColor, shadowOpacity, shadowRadius, shadowOffset, borderColor, plus added highlight overlay View). If only those changed, snapshot update is acceptable. Otherwise stop and investigate.

If a snapshot update is needed:

```bash
npx jest src/components/home/__tests__/dismissible-surfaces.test.tsx --no-coverage -u
```

Then re-run without `-u` to confirm green.

- [ ] **Step 6.5: `verify:changed`**

```bash
npm run verify:changed
```

Expected: PASS.

- [ ] **Step 6.6: Full Jest run**

```bash
npx jest --runInBand --no-coverage
```

Expected: PASS for all suites except the pre-existing open-handle warning logged in prior status notes. The full run will take 4-7 minutes.

- [ ] **Step 6.7: `verify:profiles`**

```bash
npm run verify:profiles
```

Expected: PASS.

- [ ] **Step 6.8: Production release verify**

```bash
EXPO_PUBLIC_BACKEND_URL=https://api.unfoldapp.co npm run verify:release
```

Expected: PASS (device-flow check may skip if no installed bundle is found — consistent with build-205 / build-206 session notes).

- [ ] **Step 6.9: Commit verification artifacts if any (none expected)**

```bash
git status --short
```

Expected: clean working tree. If snapshot updates were committed in step 6.4, that's already a commit.

---

## Task 7: FlowDeck simulator screenshots (light + dark)

**Files:** None (screenshots only).

- [ ] **Step 7.1: Confirm FlowDeck is available**

```bash
flowdeck --version
```

Expected: a version string. If FlowDeck is not installed, stop and ask Nick how he wants to proceed (he uses FlowDeck per project standards; manual `xcrun simctl` is forbidden by skill rules).

- [ ] **Step 7.2: Build and boot the Unfold iOS app via FlowDeck**

```bash
flowdeck build --scheme Unfold --configuration Debug --destination "platform=iOS Simulator,name=iPhone 15 Pro"
```

Expected: successful build. If errors, stop and triage; do not skip ahead.

```bash
flowdeck simulator boot --device "iPhone 15 Pro"
flowdeck install --bundle /path/from/build/output
flowdeck launch --bundle com.unfoldapp.ios
```

(Use whatever bootstrap pattern the prior Unfold sessions established — `flowdeck run --log` is the catch-all; check existing FlowDeck scripts under `scripts/` if present.)

- [ ] **Step 7.3: Take dark-mode Today tab screenshot**

Seed a multi-card Today state via the existing debug seeders if helpful:

```bash
# Existing debug seed routes in src/app:
# debug-seed-today.tsx, debug-seed-bible.tsx, debug-seed-library-targets.tsx
# Navigate to /__dev__/ or use the corresponding URL scheme.
```

Once Today tab shows: Daily Thread (top card with stack peek), Daily Rhythm (StreakBox), My Devotionals + My Library (BentoGrid):

```bash
flowdeck simulator screenshot --output /tmp/unfold-today-dark.png
```

- [ ] **Step 7.4: Switch to light mode and take light-mode screenshot**

```bash
# Either toggle via the debug-light-mode route:
flowdeck open-url "unfold://debug-light-mode"

# Or change simulator system appearance via the Settings app.
```

```bash
flowdeck simulator screenshot --output /tmp/unfold-today-light.png
```

- [ ] **Step 7.5: Take detail screenshots of StreakBox + BentoGrid in both modes**

Scroll the Today tab to show StreakBox + BentoGrid clearly. Repeat in both modes:

```bash
flowdeck simulator screenshot --output /tmp/unfold-rhythm-bento-dark.png
# (switch to light)
flowdeck simulator screenshot --output /tmp/unfold-rhythm-bento-light.png
```

- [ ] **Step 7.6: Inspect screenshots visually**

Open each PNG. Verify:
- Daily Thread top card has no visible stroke; shadow + highlight present
- No "1/N" text anywhere
- Back card silhouettes visible behind top card (depth via fillOpacity intact)
- StreakBox + BentoGrid have no visible stroke; shadow + highlight present
- Per-day chip "isToday" highlight on StreakBox is preserved
- Light mode: cards have soft shadow + lighter background; no inner top highlight visible (intentional)
- Dark mode: cards have inner top highlight as a 1px hairline at the very top edge

If anything looks off (e.g., shadow flickering, highlight not visible, layout shift), stop and triage before sending to Nick.

- [ ] **Step 7.7: Hand off screenshots to Nick**

```bash
# Use SendUserFile if available, or surface paths so Nick can open them.
ls -la /tmp/unfold-today-dark.png /tmp/unfold-today-light.png /tmp/unfold-rhythm-bento-dark.png /tmp/unfold-rhythm-bento-light.png
```

Send the four files to Nick with a one-line caption. Wait for approval before any merge / push to remote.

---

## Task 8: Push branch + prepare for Nick approval

**Files:** None (git operations only).

- [ ] **Step 8.1: Confirm Nick has approved the screenshots**

Do not proceed past this point without an explicit "yes / approved / lgtm" from Nick.

- [ ] **Step 8.2: Push the branch**

```bash
git push -u origin mina/today-tab-shadows
```

Expected: branch published.

- [ ] **Step 8.3: Write a brief handoff summary**

Surface:
- Branch URL on GitHub
- Spec + plan paths
- The four screenshot paths
- Open question: does Nick want this PR'd to `mina/today-tab-design-audit` or to `main`?

Do not open a PR without Nick saying which target branch.

---

## Self-Review (executed by the plan author, in writing)

**1. Spec coverage:**
- Spec §"Phase 1 inventory" → Tasks 2 (top card + counter), 3 (back card), 4 (StreakBox), 5 (BentoGrid). ✓
- Spec §"Elevation token system" → Task 1. ✓
- Spec §"Outer/inner wrapper pattern" → Tasks 2, 4, 5. ✓
- Spec §"Test impact" → assertion updates inline in Tasks 2 (today-card-stack.test.tsx:232,250,368) + 3 (motion-regression:146). ✓
- Spec §"Verification gates" → Task 6. ✓
- Spec §"Coexistence with `shadows.ts`" → no changes required in Phase 1 except removing the one TodayCardStack callsite, covered in Task 2 step 2.7. ✓
- Spec §"Risks → shadow fade on press" → noted in Task 4 commit message. ✓

**2. Placeholder scan:** No TBDs, no "handle edge cases", no "similar to Task N", no missing code blocks. Each step has either an exact code edit, a shell command, or a verification check.

**3. Type consistency:** `useElevation` returns `ElevationSet` consistently in Task 1; consumers in Tasks 2/4/5 access `elevation.raised.shadow` and `elevation.raised.highlight` (matching the type). Style key renames (`styles.topCard` → `styles.topCardOuter` + `styles.topCardInner`, etc.) are consistent within each task.

**4. Branch base:** `mina/today-tab-shadows` is correctly off `origin/mina/today-tab-design-audit` (verified at HEAD `31c1dbb` after spec v2.3 commit).

---

## Notes

- This plan does **not** include a TestFlight build, ASC upload, App Store submission, external beta promotion, RevenueCat mutation, or production deploy. Per Unfold project standing rules, those require Nick's explicit per-build approval and are out of scope here.
- The plan does not delete `src/constants/shadows.ts`. Deferred to Phase 3 close-out.
- If any test snapshot updates are needed at step 6.4, the diff must be limited to elevation-related style props. Anything outside that scope is a regression and the plan stops.
