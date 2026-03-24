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
  alpha.ts          — Color opacity utility
  renderIcon.ts     — Shared icon cloning helper
```

### Modified Files

```
src/constants/radius.ts         — Add card: 14
src/components/ui/Button.tsx    — Use renderIcon, contrastText color
src/components/ui/Chip.tsx      — Use renderIcon, alpha()
src/components/ui/Card.tsx      — Use Shadow tokens, Radius.card
src/components/ui/Input.tsx     — Use renderIcon, alpha()
src/components/ui/Sheet.tsx     — Use Shadow.sheet, Duration/Ease tokens, add backdrop dim
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
 * Usage: alpha('#C8A55C', 0.08) → 'rgba(200, 165, 92, 0.08)'
 */
export function alpha(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
```

**Replaces these patterns:**
- `colors.accent + '14'` (≈8% opacity) → `alpha(colors.accent, 0.08)`
- `colors.accent + '18'` (≈9% opacity) → `alpha(colors.accent, 0.09)`
- `colors.accent + '30'` (≈19% opacity) → `alpha(colors.accent, 0.19)`
- `colors.accent + '33'` (≈20% opacity) → `alpha(colors.accent, 0.20)`
- `colors.accent + '40'` (≈25% opacity) → `alpha(colors.accent, 0.25)`
- `colors.accent + '0D'` (≈5% opacity) → `alpha(colors.accent, 0.05)`

### 2. `renderIcon()` Utility

```typescript
// src/components/ui/utils/renderIcon.ts

import React from 'react';

/**
 * Clone a React icon element with standardized size and color props.
 * Returns null if no icon provided, passes through non-element nodes.
 */
export function renderIcon(
  icon: React.ReactNode | undefined,
  props: { size: number; color: string; weight?: string }
): React.ReactNode | null {
  if (!icon) return null;
  if (!React.isValidElement(icon)) return icon;
  return React.cloneElement(icon as React.ReactElement<any>, props);
}
```

**Replaces the identical block in:** Button.tsx (lines 184-191), Chip.tsx (lines 174-181), Input.tsx (lines 113-121).

### 3. Radius Token Addition

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

### 4. Card.tsx Changes

- Delete inline `SHADOW_SM` and `SHADOW_LG` constants (lines 48-68)
- Import `Shadow` from `@/constants/shadows`
- Replace `...SHADOW_SM` → `...Shadow.sm`
- Replace `...SHADOW_LG` → `...Shadow.lg`
- Replace `borderRadius: 14` → `borderRadius: Radius.card`
- Import `Radius` from `@/constants/radius`
- Replace `colors.accent + '14'` → `alpha(colors.accent, 0.08)`
- Replace `colors.accent + '30'` → `alpha(colors.accent, 0.19)`

### 5. Sheet.tsx Changes

- Delete inline shadow values from styles
- Import `Shadow` from `@/constants/shadows`
- Replace sheet shadow → `...Shadow.sheet`
- Replace `SLIDE_IN = { duration: 340, easing: Easing.out(Easing.cubic) }` → `{ duration: Duration.slow, easing: Ease.out }`
- Replace `DISMISS_DURATION = 180` → `Duration.fast`
- Import `Duration`, `Ease` from `@/constants/animations`
- Remove local `Easing` import from reanimated (no longer needed)
- Add backdrop dim: `backgroundColor: 'rgba(0,0,0,0.4)'` on the dismiss area TouchableOpacity

### 6. Button.tsx Changes

- Add `contrastText: string` to `ColorTheme` interface in `constants/colors.ts` — value `'#FFFFFF'` for both dark and light themes (all accent colors are mid-tone, white always works)
- Replace `'#FFFFFF'` hardcodes → `colors.contrastText`
- Replace icon cloning block → `renderIcon(icon, { size: sizeConfig.iconSize, color: textColor })`
- Extract disabled opacity: define `const DISABLED_OPACITY = 0.4` at top of file (shared constant for Chip to import too)

### 7. Chip.tsx Changes

- Replace `colors.accent + '18'` → `alpha(colors.accent, 0.09)`
- Replace `colors.accent + '40'` → `alpha(colors.accent, 0.25)`
- Replace `colors.accent + '33'` → `alpha(colors.accent, 0.20)`
- Replace `colors.accent + '0D'` → `alpha(colors.accent, 0.05)`
- Replace icon cloning block → `renderIcon()`
- Use shared disabled opacity constant

### 8. Input.tsx Changes

- Replace `colors.accent + '40'` → `alpha(colors.accent, 0.25)`
- Replace icon cloning block → `renderIcon()`

## Disabled Opacity

Extract as a shared constant rather than a full token file (YAGNI — it's one value):

```typescript
// src/components/ui/utils/constants.ts
export const DISABLED_OPACITY = 0.4;
```

Used by Button and Chip `styles.disabled`. Input doesn't have a disabled visual state currently.

## Verification

After all changes:
1. TypeScript check passes (`npx tsc --noEmit`)
2. Component catalog renders identically (screenshot comparison) — except Sheet now has visible backdrop dim
3. All 7 accent themes still work correctly (accent color swapped in settings)

## Future Work (Layer 2)

Layer 2 will cover:
- Missing primitives: `Text`, `Divider`, `Badge`, `ListItem` components
- ESLint rules flagging hardcoded `fontSize`, `borderRadius`, `shadowColor` (Approach B from audit)
- Component API normalization: consistent prop names across all components (Approach C from audit)
- Migration strategy: phased adoption of design system across app screens
