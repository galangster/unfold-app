# Design System Layer 1: Internal Hygiene — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire all 5 UI components to shared design tokens, extract duplicated utilities, fix fragile patterns. Zero API changes.

**Architecture:** Create 3 utility files (`alpha.ts`, `renderIcon.ts`, `constants.ts`) in `src/components/ui/utils/`. Update token files (`shadows.ts`, `radius.ts`, `colors.ts`) to match actual shipped component values. Then refactor each component to import tokens instead of defining values inline.

**Tech Stack:** React Native, TypeScript, react-native-reanimated, phosphor-react-native, expo-haptics

**Spec:** `docs/superpowers/specs/2026-03-23-design-system-layer1-hygiene-design.md`

---

## File Structure

```
src/components/ui/utils/          (NEW directory)
  index.ts                        — Barrel export
  alpha.ts                        — Color opacity utility
  renderIcon.ts                   — Shared icon cloning helper
  constants.ts                    — DISABLED_OPACITY

src/constants/
  shadows.ts                      — MODIFY: Update sm/lg/sheet to match components
  radius.ts                       — MODIFY: Add card: 14
  colors.ts                       — MODIFY: Add optional contrastText

src/components/ui/
  Button.tsx                      — MODIFY: Use renderIcon, contrastText, shared opacity
  Chip.tsx                        — MODIFY: Use renderIcon, alpha(), shared opacity
  Card.tsx                        — MODIFY: Use Shadow tokens, Radius.card, alpha()
  Input.tsx                       — MODIFY: Use renderIcon (weight: 'light'), alpha()
  Sheet.tsx                       — MODIFY: Use Shadow/Duration/Ease tokens, Radius['2xl'], animated backdrop
```

---

### Task 1: Create Utility Files

**Files:**
- Create: `src/components/ui/utils/alpha.ts`
- Create: `src/components/ui/utils/renderIcon.ts`
- Create: `src/components/ui/utils/constants.ts`
- Create: `src/components/ui/utils/index.ts`

- [ ] **Step 1: Create `alpha.ts`**

```typescript
// src/components/ui/utils/alpha.ts

/**
 * Convert a 6-digit hex color + opacity (0-1) into an rgba string.
 * Replaces the fragile `color + 'XX'` hex suffix pattern.
 *
 * Expects a 6-digit hex string starting with '#'.
 * Opacity values are intentional approximations for readability,
 * not exact hex-to-decimal conversions.
 *
 * Usage: alpha('#C8A55C', 0.08) → 'rgba(200, 165, 92, 0.08)'
 */
export function alpha(hex: string, opacity: number): string {
  if (__DEV__ && (!hex.startsWith('#') || hex.length !== 7)) {
    console.warn(`[alpha] Expected 6-digit hex color, got: ${hex}`);
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
```

- [ ] **Step 2: Create `renderIcon.ts`**

```typescript
// src/components/ui/utils/renderIcon.ts

import React from 'react';

type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

/**
 * Clone a React icon element with standardized size and color props.
 * Returns null if no icon provided, passes through non-element nodes.
 */
export function renderIcon(
  icon: React.ReactNode | undefined,
  props: { size: number; color: string; weight?: IconWeight }
): React.ReactNode | null {
  if (!icon) return null;
  if (!React.isValidElement(icon)) return icon;
  return React.cloneElement(icon as React.ReactElement<any>, props);
}
```

- [ ] **Step 3: Create `constants.ts`**

```typescript
// src/components/ui/utils/constants.ts
export const DISABLED_OPACITY = 0.4;
```

- [ ] **Step 4: Create `index.ts` barrel**

```typescript
// src/components/ui/utils/index.ts
export { alpha } from './alpha';
export { renderIcon } from './renderIcon';
export { DISABLED_OPACITY } from './constants';
```

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -v "e2e/" | grep -v "playwright" | head -20`
Expected: No new errors from our files

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/utils/
git commit -m "feat: add design system utilities — alpha, renderIcon, constants"
```

---

### Task 2: Update Token Files

**Files:**
- Modify: `src/constants/shadows.ts`
- Modify: `src/constants/radius.ts`
- Modify: `src/constants/colors.ts`

- [ ] **Step 1: Update `shadows.ts` — align tokens with shipped component values**

In `src/constants/shadows.ts`, update the `sm`, `lg`, and `sheet` tiers:

```typescript
// sm — match Card.tsx SHADOW_SM (shadowOffset height 1→2, shadowRadius 4→10, elevation 1→2)
sm: Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  android: { elevation: 2 },
  default: {},
}),

// md stays unchanged

// lg — match Card.tsx SHADOW_LG Android elevation (8→6, iOS unchanged)
lg: Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  android: { elevation: 6 },
  default: {},
}),

// sheet — match Sheet.tsx inline values (opacity 0.15→0.12, radius 16→20, elevation 12→24)
sheet: Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
  },
  android: { elevation: 24 },
  default: {},
}),
```

- [ ] **Step 2: Update `radius.ts` — add `card: 14`**

Insert `card: 14` between `md: 12` and `lg: 16`:

```typescript
export const Radius = {
  none: 0,
  sm: 8,
  md: 12,
  card: 14,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 999,
} as const;
```

- [ ] **Step 3: Update `colors.ts` — add optional `contrastText`**

Add to the `ColorTheme` interface:

```typescript
// After the accent field:
/** Text color guaranteed readable on accent backgrounds. */
contrastText?: string;
```

Add to `DarkColors`:
```typescript
contrastText: '#FFFFFF',
```

Add to `LightColors`:
```typescript
contrastText: '#FFFFFF',
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -v "e2e/" | grep -v "playwright" | head -20`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/constants/shadows.ts src/constants/radius.ts src/constants/colors.ts
git commit -m "feat: update tokens — shadows match components, add Radius.card, add contrastText"
```

---

### Task 3: Refactor Card.tsx

**Files:**
- Modify: `src/components/ui/Card.tsx`

- [ ] **Step 1: Replace shadow constants and radius**

In `Card.tsx`:

1. Delete the `SHADOW_SM` constant (lines 48-57) and `SHADOW_LG` constant (lines 59-68)

2. Add imports at the top:
```typescript
import { Shadow } from '@/constants/shadows';
import { Radius } from '@/constants/radius';
import { alpha } from './utils';
```

3. In `getVariantStyles()`, replace:
   - `...SHADOW_SM` → `...Shadow.sm`
   - `...SHADOW_LG` → `...Shadow.lg`

4. In `styles.base`, replace:
   - `borderRadius: 14` → `borderRadius: Radius.card`

5. In `getVariantStyles()` accent case, replace:
   - `colors.accent + '14'` → `alpha(colors.accent, 0.08)`
   - `colors.accent + '30'` → `alpha(colors.accent, 0.19)`

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -v "e2e/" | grep -v "playwright" | head -20`
Expected: No new errors

- [ ] **Step 3: Visual verification**

Open the component catalog in the simulator and scroll to the Card section. Take a screenshot:
```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png
```
Expected: Cards look identical to before (same shadows, same radius, same accent tints)

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Card.tsx
git commit -m "refactor: Card — use Shadow tokens, Radius.card, alpha() utility"
```

---

### Task 4: Refactor Button.tsx

**Files:**
- Modify: `src/components/ui/Button.tsx`

- [ ] **Step 1: Replace icon cloning, white hardcode, and disabled opacity**

In `Button.tsx`:

1. Add imports:
```typescript
import { renderIcon, DISABLED_OPACITY } from './utils';
```

2. Replace the icon cloning block (lines 184-191):
```typescript
// Before:
const iconElement = icon
  ? React.isValidElement(icon)
    ? React.cloneElement(icon as React.ReactElement<any>, {
        size: sizeConfig.iconSize,
        color: textColor,
      })
    : icon
  : null;

// After:
const iconElement = renderIcon(icon, { size: sizeConfig.iconSize, color: textColor });
```

3. In `getTextColor()`, replace all `'#FFFFFF'` with `colors.contrastText ?? '#FFFFFF'`:
   - `case 'primary': return colors.contrastText ?? '#FFFFFF';`
   - `case 'destructive': ... return colors.contrastText ?? '#FFFFFF';`
   - `default: return colors.contrastText ?? '#FFFFFF';`

4. In `styles.disabled`, replace:
   - `opacity: 0.4` → `opacity: DISABLED_OPACITY`

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -v "e2e/" | grep -v "playwright" | head -20`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Button.tsx
git commit -m "refactor: Button — use renderIcon, contrastText, shared disabled opacity"
```

---

### Task 5: Refactor Chip.tsx

**Files:**
- Modify: `src/components/ui/Chip.tsx`

- [ ] **Step 1: Replace icon cloning, alpha patterns, and disabled opacity**

In `Chip.tsx`:

1. Add imports:
```typescript
import { alpha, renderIcon, DISABLED_OPACITY } from './utils';
```

2. Replace the icon cloning block (lines 174-181) with:
```typescript
const iconElement = renderIcon(icon, { size: config.iconSize, color: textColor });
```

3. In `getVariantStyles()`, replace hex suffix patterns:
   - `colors.accent + '18'` → `alpha(colors.accent, 0.09)`
   - `colors.accent + '40'` → `alpha(colors.accent, 0.25)`
   - `colors.accent + '33'` → `alpha(colors.accent, 0.20)`
   - `colors.accent + '0D'` → `alpha(colors.accent, 0.05)`

4. In `styles.disabled`, replace:
   - `opacity: 0.4` → `opacity: DISABLED_OPACITY`

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -v "e2e/" | grep -v "playwright" | head -20`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Chip.tsx
git commit -m "refactor: Chip — use renderIcon, alpha(), shared disabled opacity"
```

---

### Task 6: Refactor Input.tsx

**Files:**
- Modify: `src/components/ui/Input.tsx`

- [ ] **Step 1: Replace icon cloning and alpha pattern**

In `Input.tsx`:

1. Add imports:
```typescript
import { alpha, renderIcon } from './utils';
```

2. Replace the icon cloning block (lines 113-121) with:
```typescript
const iconElement = renderIcon(icon, {
  size: 18,
  color: focused ? colors.accent : colors.textMuted,
  weight: 'light',
});
```

**IMPORTANT:** The `weight: 'light'` parameter MUST be included. Input icons currently pass `weight: 'light'` in the existing clone block. Omitting it would change the icon appearance.

3. In `getBorderColor()`, replace:
   - `colors.accent + '40'` → `alpha(colors.accent, 0.25)`

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -v "e2e/" | grep -v "playwright" | head -20`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Input.tsx
git commit -m "refactor: Input — use renderIcon (weight: light), alpha() utility"
```

---

### Task 7: Refactor Sheet.tsx

**Files:**
- Modify: `src/components/ui/Sheet.tsx`

- [ ] **Step 1: Replace shadow, animation tokens, and radius**

In `Sheet.tsx`:

1. Add/update imports:
```typescript
import { Shadow } from '@/constants/shadows';
import { Duration, Ease } from '@/constants/animations';
import { Radius } from '@/constants/radius';
```

2. Remove `Easing` from the `react-native-reanimated` import (no longer needed directly).

3. Replace animation constants at top of file:
```typescript
// Before:
const OFFSCREEN = 500;
const SLIDE_IN = { duration: 340, easing: Easing.out(Easing.cubic) };
const DISMISS_DURATION = 180;

// After:
const OFFSCREEN = 500;
const SLIDE_IN = { duration: Duration.slow, easing: Ease.out };
const DISMISS_DURATION = Duration.fast;
```

4. In `styles.sheet`, replace the inline shadow properties:
```typescript
// Before:
sheet: {
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: -4 },
  shadowOpacity: 0.12,
  shadowRadius: 20,
  elevation: 24,
},

// After:
sheet: {
  borderTopLeftRadius: Radius['2xl'],
  borderTopRightRadius: Radius['2xl'],
  ...Shadow.sheet,
},
```

- [ ] **Step 2: Add animated backdrop dim**

1. Add a `backdropOpacity` shared value alongside `translateY`:
```typescript
const translateY = useSharedValue(OFFSCREEN);
const backdropOpacity = useSharedValue(0);
```

2. In the `useEffect` that fires on `visible`, animate backdrop in:
```typescript
useEffect(() => {
  if (visible) {
    dismissing.current = false;
    translateY.value = OFFSCREEN;
    backdropOpacity.value = 0;
    translateY.value = withTiming(0, SLIDE_IN);
    backdropOpacity.value = withTiming(0.4, SLIDE_IN);
  }
}, [visible, translateY, backdropOpacity]);
```

3. In `dismissSheet`, animate backdrop out:
```typescript
const dismissSheet = useCallback(() => {
  if (dismissing.current) return;
  dismissing.current = true;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  translateY.value = withTiming(OFFSCREEN, { duration: DISMISS_DURATION });
  backdropOpacity.value = withTiming(0, { duration: DISMISS_DURATION });
  setTimeout(onClose, DISMISS_DURATION);
}, [onClose, translateY, backdropOpacity]);
```

4. In `panGesture.onEnd`, also animate backdrop on swipe dismiss:
```typescript
.onEnd((e) => {
  if (e.translationY > SWIPE_THRESHOLD || e.velocityY > VELOCITY_THRESHOLD) {
    translateY.value = withTiming(OFFSCREEN, { duration: DISMISS_DURATION });
    backdropOpacity.value = withTiming(0, { duration: DISMISS_DURATION });
    runOnJS(dismissSheet)();
  } else {
    translateY.value = withTiming(0, SLIDE_IN);
    backdropOpacity.value = withTiming(0.4, SLIDE_IN);
  }
})
```

5. Create an animated style for the backdrop:
```typescript
const backdropAnimatedStyle = useAnimatedStyle(() => ({
  backgroundColor: `rgba(0, 0, 0, ${backdropOpacity.value})`,
}));
```

6. Replace the `TouchableOpacity` dismiss area with an `Animated.View` wrapping a `TouchableOpacity`:
```tsx
{/* Backdrop — animated dim + tap to dismiss */}
<Animated.View style={[styles.dismissArea, backdropAnimatedStyle]}>
  <TouchableOpacity
    style={styles.dismissArea}
    activeOpacity={1}
    onPress={dismissSheet}
  />
</Animated.View>
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -v "e2e/" | grep -v "playwright" | head -20`
Expected: No new errors

- [ ] **Step 4: Visual verification — Sheet backdrop**

Open the component catalog, scroll to the Sheet section, tap "Open Sheet":
```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png
```
Expected: Sheet slides up with a dark backdrop dimming behind it. Backdrop fades in smoothly, not instantly.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Sheet.tsx
git commit -m "refactor: Sheet — use Shadow/Duration/Ease/Radius tokens, add animated backdrop"
```

---

### Task 8: Final Verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -v "e2e/" | grep -v "playwright" | head -20`
Expected: No errors from our files

- [ ] **Step 2: Visual verification — full catalog**

Open the component catalog and scroll through ALL sections. Take screenshots of each section:
```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png
```

Verify:
- Buttons: all variants, sizes, states look identical
- Chips: all variants, filter toggle, badges work
- Cards: all 4 variants look identical (shadows, borders, accent tints)
- Inputs: focus border, icon, clearable, error state work
- Sheet: both basic and form sheets open with animated backdrop dim

- [ ] **Step 3: Test accent theme switching**

If possible, switch accent theme in Settings and verify the catalog still renders correctly with a non-Gold accent (e.g., Ocean `#5B9BD5`). All `alpha()` calls should produce correct tints.

- [ ] **Step 4: Verify no token files have zero imports anymore**

Run these checks:
```bash
# Shadow should now be imported by Card and Sheet
grep -r "from.*constants/shadows" src/components/ui/ --include="*.tsx"

# Radius should now be imported by all 5 components
grep -r "from.*constants/radius" src/components/ui/ --include="*.tsx"

# Duration/Ease should now be imported by Sheet
grep -r "from.*constants/animations" src/components/ui/ --include="*.tsx"
```
Expected: Shadow in 2 files (Card, Sheet), Radius in 5 files, animations in 1 file (Sheet)

- [ ] **Step 5: Commit verification summary (if any final adjustments needed)**

If everything passes, no commit needed. If minor fixes were required, commit them:
```bash
git add -A src/components/ui/ src/constants/
git commit -m "fix: final adjustments from Layer 1 verification"
```
