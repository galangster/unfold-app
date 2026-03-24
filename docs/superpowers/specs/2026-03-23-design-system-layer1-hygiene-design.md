# Design System Layer 1: Internal Hygiene

## Goal

Make all 5 existing UI components (Button, Chip, Card, Input, Sheet) consume shared design tokens instead of defining values inline. Extract duplicated utility patterns. Fix fragile color patterns. Zero API changes — purely internal refactor.

## Motivation

The design system audit (2026-03-23) revealed that the 5 components define their own shadow constants, border radii, animation configs, and color opacity values inline — bypassing the token system they're supposed to demonstrate. Before driving adoption across the app (Layer 2), the components themselves must eat their own dog food.

### Key Findings

| Problem | Scope |
|---------|-------|
| `Shadow` tokens: 0 imports across entire app | Card and Sheet define their own shadows inline |
| `Radius` tokens: only used in Button, Chip, Input | Card uses `borderRadius: 14` as raw number |
| `Duration`/`Ease` tokens: not used in any component | Sheet defines its own animation constants |
| `colors.accent + 'XX'` hex suffix pattern | Used in Chip (3x), Card (2x), Input (1x) — fragile, undocumented |
| Icon cloning block | Identical 7-line pattern copy-pasted in Button, Chip, Input |
| Hardcoded `#FFFFFF` for button text | Doesn't adapt to theme; could break contrast on light accents |

## Architecture

### New Files

```
src/components/ui/utils/
  index.ts          — Barrel export for utilities
  alpha.ts          — Color opacity utility
  renderIcon.ts     — Shared icon cloning helper
  constants.ts      — Shared component constants (DISABLED_OPACITY)
```

### Modified Files

```
src/constants/radius.ts         — Add card: 14
src/constants/shadows.ts        — Update sm/sheet tiers to match actual component values
src/constants/colors.ts         — Add optional contrastText to ColorTheme
src/components/ui/Button.tsx    — Use renderIcon, contrastText color, shared disabled opacity
src/components/ui/Chip.tsx      — Use renderIcon, alpha(), shared disabled opacity
src/components/ui/Card.tsx      — Use Shadow tokens, Radius.card, alpha()
src/components/ui/Input.tsx     — Use renderIcon (with weight: 'light'), alpha()
src/components/ui/Sheet.tsx     — Use Shadow.sheet, Duration/Ease tokens, Radius['2xl'], animated backdrop
```

### No Changes To

- Component prop APIs (zero breaking changes)
- Barrel export (`index.ts`)
- Files outside `src/components/ui/` and `src/constants/`
- Visual appearance (except Sheet backdrop dim addition)

## Detailed Changes

### 1. `alpha(color, opacity)` Utility

```typescript
// src/components/ui/utils/alpha.ts

/**
 * Convert a 6-digit hex color + opacity (0-1) into an rgba string.
 * Replaces the fragile `color + 'XX'` hex suffix pattern.
 *
 * Expects a 6-digit hex string starting with '#'.
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

**Replaces these patterns (values are intentional approximations for readability, not exact hex-to-decimal conversions):**
- `colors.accent + '14'` (hex 0x14 = 7.8%) → `alpha(colors.accent, 0.08)`
- `colors.accent + '18'` (hex 0x18 = 9.4%) → `alpha(colors.accent, 0.09)`
- `colors.accent + '30'` (hex 0x30 = 18.8%) → `alpha(colors.accent, 0.19)`
- `colors.accent + '33'` (hex 0x33 = 20.0%) → `alpha(colors.accent, 0.20)`
- `colors.accent + '40'` (hex 0x40 = 25.1%) → `alpha(colors.accent, 0.25)`
- `colors.accent + '0D'` (hex 0x0D = 5.1%) → `alpha(colors.accent, 0.05)`

### 2. `renderIcon()` Utility

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

**Replaces the identical block in:** Button.tsx, Chip.tsx, Input.tsx.

**Important:** Input.tsx must call `renderIcon(icon, { size: 18, color, weight: 'light' })` to preserve the current icon weight behavior. Button and Chip omit the `weight` parameter.

### 3. Shared Constants

```typescript
// src/components/ui/utils/constants.ts
export const DISABLED_OPACITY = 0.4;
```

```typescript
// src/components/ui/utils/index.ts
export { alpha } from './alpha';
export { renderIcon } from './renderIcon';
export { DISABLED_OPACITY } from './constants';
```

### 4. Shadow Token Updates

The existing `Shadow` token values differ from Card and Sheet inline values. **Update the token file to match the actual component values**, since the components have been live and tested:

```typescript
// constants/shadows.ts — update sm to match Card's inline SHADOW_SM
sm: Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },   // was 1
    shadowOpacity: 0.06,
    shadowRadius: 10,                         // was 4
  },
  android: { elevation: 2 },                  // was 1
  default: {},
}),

// lg stays the same (matches Card's SHADOW_LG on iOS)
// Update Android elevation only:
lg: Platform.select({
  ios: { /* unchanged */ },
  android: { elevation: 6 },                  // was 8, match Card
  default: {},
}),

// sheet — update to match Sheet's inline values
sheet: Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,                      // was 0.15
    shadowRadius: 20,                         // was 16
  },
  android: { elevation: 24 },                 // was 12
  default: {},
}),
```

**Rationale:** The components have been live in the app. Their shadow values are the tested, shipped values. The token file was written before the components existed and hasn't been used. Updating the tokens to match reality preserves visual fidelity.

### 5. Radius Token Addition

```typescript
// constants/radius.ts — add one value
export const Radius = {
  none: 0,
  sm: 8,
  md: 12,
  card: 14,   // ← NEW: Card component default
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 999,
} as const;
```

**Why 14?** The audit found 5 of 8 existing card patterns use `borderRadius: 14`. Rather than force-fitting to 12 or 16 (which would change the visual appearance), we bring the actual value into the system.

### 6. Card.tsx Changes

- Delete inline `SHADOW_SM` and `SHADOW_LG` constants (lines 48-68)
- Import `Shadow` from `@/constants/shadows`
- Replace `...SHADOW_SM` → `...Shadow.sm`
- Replace `...SHADOW_LG` → `...Shadow.lg`
- Replace `borderRadius: 14` → `borderRadius: Radius.card`
- Import `Radius` from `@/constants/radius`
- Replace `colors.accent + '14'` → `alpha(colors.accent, 0.08)`
- Replace `colors.accent + '30'` → `alpha(colors.accent, 0.19)`

### 7. Sheet.tsx Changes

- Delete inline shadow values from styles
- Import `Shadow` from `@/constants/shadows`
- Replace sheet shadow → `...Shadow.sheet`
- Replace `SLIDE_IN = { duration: 340, easing: Easing.out(Easing.cubic) }` → `{ duration: Duration.slow, easing: Ease.out }`
- Replace `DISMISS_DURATION = 180` → `Duration.fast`
- Import `Duration`, `Ease` from `@/constants/animations`
- Remove local `Easing` import from reanimated (no longer needed)
- Replace hardcoded `borderTopLeftRadius: 24` and `borderTopRightRadius: 24` → `Radius['2xl']`
- Add animated backdrop dim using Reanimated:
  - Backdrop `Animated.View` with `backgroundColor: 'rgba(0,0,0, <interpolated>)'`
  - Animate opacity from 0 → 0.4 in sync with sheet slide-in (using `withTiming`, same duration as `SLIDE_IN`)
  - On dismiss, animate opacity back to 0 in sync with slide-out
  - Use `0.4` opacity for dark theme, same for light (dark backgrounds get subtle dim, light backgrounds get noticeable dim — both are functional)

### 8. Button.tsx Changes

- Add optional `contrastText?: string` to `ColorTheme` interface in `constants/colors.ts`
- Set value to `'#FFFFFF'` in both `DarkColors` and `LightColors`
- Replace `'#FFFFFF'` hardcodes → `colors.contrastText ?? '#FFFFFF'` (fallback ensures no breakage if contrastText is undefined)
- Replace icon cloning block → `renderIcon(icon, { size: sizeConfig.iconSize, color: textColor })`
- Import `DISABLED_OPACITY` from `./utils/constants` and use in styles

### 9. Chip.tsx Changes

- Replace `colors.accent + '18'` → `alpha(colors.accent, 0.09)`
- Replace `colors.accent + '40'` → `alpha(colors.accent, 0.25)`
- Replace `colors.accent + '33'` → `alpha(colors.accent, 0.20)`
- Replace `colors.accent + '0D'` → `alpha(colors.accent, 0.05)`
- Replace icon cloning block → `renderIcon(icon, { size: config.iconSize, color: textColor })`
- Import `DISABLED_OPACITY` from `./utils/constants` and use in styles

### 10. Input.tsx Changes

- Replace `colors.accent + '40'` → `alpha(colors.accent, 0.25)`
- Replace icon cloning block → `renderIcon(icon, { size: 18, color: focused ? colors.accent : colors.textMuted, weight: 'light' })` — **must include `weight: 'light'`** to preserve existing icon appearance

## Verification

After all changes:
1. TypeScript check passes (`npx tsc --noEmit`)
2. Component catalog renders identically (screenshot comparison) — except Sheet now has visible animated backdrop dim
3. All 7 accent themes still work correctly (accent color swapped in settings)
4. Sheet open/dismiss animation is smooth with backdrop fade in sync

## Future Work (Layer 2)

Layer 2 will cover:
- Missing primitives: `Text`, `Divider`, `Badge`, `ListItem` components
- ESLint rules flagging hardcoded `fontSize`, `borderRadius`, `shadowColor` (Approach B from audit)
- Component API normalization: consistent prop names across all components (Approach C from audit)
- Migration strategy: phased adoption of design system across app screens
