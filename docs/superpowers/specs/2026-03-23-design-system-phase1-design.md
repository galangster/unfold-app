# Design System Phase 1: Token Foundation + Button Component

## Goal

Establish the token foundation (spacing, radius, typography presets, shadows, animations) and build the first shared component (`Button`) on top of it. This is Phase 1 of a multi-phase design system that will grow iteratively alongside feature development.

## Motivation

Codebase audit (2026-03-23) revealed:
- **1,004 hardcoded spacing values** with no token system (0% adoption)
- **600+ hardcoded font sizes** despite a FontSize scale existing in constants
- **492 hardcoded border radius values** with no scale
- **266 inline shadow definitions** with no shared presets
- **0 shared Button components** — 5 distinct button variants hand-built across 51 component files
- **5 duplicate chip/pill implementations** doing the same thing

Colors (92%) and FontFamily (85%) have good token adoption. Everything else is chaos.

## Architecture

### Token Files (new)

All new files in `src/constants/`. Pure data — no React, no hooks. Importable anywhere.

#### `src/constants/spacing.ts`

8px base scale. Covers all 1,004 current inline spacing values.

```typescript
export const Spacing = {
  '0': 0,
  px: 1,
  '0.5': 2,
  '1': 4,
  '1.5': 6,
  '2': 8,
  '2.5': 10,
  '3': 12,
  '3.5': 14,
  '4': 16,
  '5': 20,
  '6': 24,
  '7': 28,
  '8': 32,
  '9': 36,
  '10': 40,
  '12': 48,
  '16': 64,
} as const;
```

Usage: `padding: Spacing[4]` → 16px. Half-steps (0.5, 1.5, 2.5, 3.5) cover the most common non-standard values found in the audit (2px: 71 uses, 6px: 87, 10px: 137, 14px: 106). Matches Tailwind naming for familiarity.

#### `src/constants/radius.ts`

5-tier scale covering all 492 current inline radius values.

```typescript
export const Radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 999,
} as const;
```

Usage: `borderRadius: Radius.md` → 12px.

#### `src/constants/typography.ts`

Named text style presets. Each preset combines fontFamily + fontSize + lineHeight into a single reusable object. Replaces 600+ hardcoded fontSize/lineHeight combos.

```typescript
import { FontFamily, FontSize, LineHeight } from './fonts';

// Named "Typography" to avoid collision with React Native's TextStyle type
export const Typography = {
  // Display — InstrumentSerif for headings
  displayLg: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['4xl'],  // 36
    lineHeight: FontSize['4xl'] * LineHeight.tight,  // 43.2
  },
  displayMd: {
    fontFamily: FontFamily.display,
    fontSize: FontSize['2xl'],  // 24
    lineHeight: FontSize['2xl'] * LineHeight.tight,  // 28.8
  },
  displaySm: {
    fontFamily: FontFamily.display,
    fontSize: FontSize.xl,  // 20
    lineHeight: FontSize.xl * LineHeight.tight,  // 24
  },

  // Body — Inter for reading content
  bodyLg: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.lg,  // 18
    lineHeight: FontSize.lg * LineHeight.normal,  // 27
  },
  bodyMd: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,  // 16
    lineHeight: FontSize.base * LineHeight.normal,  // 24
  },
  bodySm: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,  // 14
    lineHeight: FontSize.sm * LineHeight.normal,  // 21
  },

  // UI — Inter for buttons, labels, controls
  uiLg: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,  // 16
    lineHeight: FontSize.base * LineHeight.tight,  // 19.2
  },
  uiMd: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,  // 14
    lineHeight: FontSize.sm * LineHeight.tight,  // 16.8
  },
  uiSm: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.xs,  // 12
    lineHeight: FontSize.xs * LineHeight.tight,  // 14.4
  },

  // Caption — smallest text (uses raw 11 until FontSize['2xs'] is added to fonts.ts)
  caption: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    lineHeight: 11 * LineHeight.normal,  // 16.5
  },

  // Label — uppercase small text (section headers, metadata)
  label: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 11,
    lineHeight: 11 * LineHeight.tight,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
} as const;
```

Usage: `style={Typography.bodyMd}` replaces `{ fontFamily: FontFamily.body, fontSize: 16, lineHeight: 24 }`.

#### `src/constants/shadows.ts`

3 elevation tiers replacing 266 inline shadow definitions.

```typescript
import { Platform } from 'react-native';

export const Shadow = {
  sm: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
    },
    android: { elevation: 1 },
    default: {},
  }),
  md: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
    },
    android: { elevation: 3 },
    default: {},
  }),
  lg: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
    android: { elevation: 8 },
    default: {},
  }),
  sheet: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
    },
    android: { elevation: 12 },
    default: {},
  }),
} as const;
```

Note: `default: {}` prevents `Platform.select()` from returning `undefined`.

Usage: `style={Shadow.md}`.

#### `src/constants/animations.ts`

Shared timing and easing constants. Replaces 1,601 scattered animation values.

```typescript
import { Easing } from 'react-native-reanimated';

// Durations (ms) — all under 350ms for product UI per CLAUDE.md rules
export const Duration = {
  instant: 100,
  fast: 150,
  normal: 250,
  slow: 340,
} as const;

// Easing presets
export const Ease = {
  out: Easing.out(Easing.cubic),
  in: Easing.in(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
} as const;

// Spring configs — critically-damped only (no bounce, per user preference)
export const Spring = {
  press: { damping: 35, stiffness: 300, mass: 0.8 },
  gentle: { damping: 20, stiffness: 100, mass: 1 },
  snappy: { damping: 22, stiffness: 200, mass: 0.6 },
} as const;

// Stagger delay between list items
export const Stagger = {
  fast: 40,
  normal: 80,
  slow: 120,
} as const;
```

### Button Component

**File:** `src/components/ui/Button.tsx`

This is the first component in the new `ui/` subdirectory. All future design system components live here.

#### Variants

| Variant | Background | Text Color | Border | Use Case |
|---------|-----------|------------|--------|----------|
| `primary` | `colors.accent` | white (dark) / white (light) | none | Main CTAs: "Create", "Save", "Continue" |
| `secondary` | `colors.buttonBackground` | `colors.text` | `colors.border` | Secondary actions: settings toggles, filters |
| `ghost` | transparent | `colors.accent` | none | Tertiary: "Cancel", "Edit", "Done", nav links |
| `destructive` | `colors.error` (filled) or transparent (ghost) | white or `colors.error` | none | "Delete", "Remove" |
| `icon` | `colors.buttonBackground` | `colors.text` | none | Compact icon-only: +/-, close, controls |

#### Sizes

| Size | Height | Padding H | Font Preset | Icon Size | Border Radius |
|------|--------|-----------|-------------|-----------|---------------|
| `lg` | 52 | 24 | `Typography.uiLg` (16px SemiBold) | 20 | `Radius.lg` (16) |
| `md` | 44 | 16 | `Typography.uiMd` (14px Medium) | 18 | `Radius.md` (12) |
| `sm` | 32 | 12 | `Typography.uiSm` (12px Regular) | 14 | `Radius.sm` (8) |

#### Props

```typescript
import { TouchableOpacityProps } from 'react-native';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'icon';
type ButtonSize = 'lg' | 'md' | 'sm';

interface ButtonProps extends Omit<TouchableOpacityProps, 'children'> {
  variant?: ButtonVariant;        // default: 'primary'
  size?: ButtonSize;              // default: 'md'
  label?: string;                 // text content (required unless variant='icon')
  icon?: React.ReactNode;         // optional icon element
  iconPosition?: 'left' | 'right'; // default: 'left'
  loading?: boolean;              // shows ActivityIndicator, disables press
  fullWidth?: boolean;            // alignSelf: 'stretch'
  haptic?: boolean;               // trigger expo-haptics on press (default: true for primary)
  destructiveStyle?: 'filled' | 'ghost'; // only for variant='destructive', default: 'filled'
}
```

#### Behavior

- **Press feedback:** `activeOpacity: 0.7` (matches current app pattern)
- **Disabled state:** `opacity: 0.4`, no press handler. For `destructive` variant, disabled uses color desaturation instead of opacity stacking (since `colors.error` already has 0.9 alpha).
- **Loading state:** Label replaced with `ActivityIndicator`, button disabled, maintains width
- **Haptics:** `Haptics.impactAsync(ImpactFeedbackStyle.Light)` on press for all variants (default `true`)
- **Accessibility:** `accessibilityRole="button"`, `accessibilityState={{ disabled, busy: loading }}`, `accessibilityLabel={label}`. When `variant='icon'` and no `label` is provided, `accessibilityLabel` prop is **required** — the component logs a dev warning if neither `label` nor `accessibilityLabel` is set.

#### Internal Structure

```
TouchableOpacity
  └─ View (row container, centered)
       ├─ [icon] (if icon && iconPosition === 'left')
       ├─ [ActivityIndicator] (if loading, replaces label)
       ├─ [Text] (if label && !loading)
       └─ [icon] (if icon && iconPosition === 'right')
```

Gap between icon and label: `Spacing[2]` (8px).

### File Organization

```
src/constants/
  ├── colors.ts          (existing - unchanged)
  ├── fonts.ts           (existing - unchanged)
  ├── spacing.ts         (NEW)
  ├── radius.ts          (NEW)
  ├── typography.ts      (NEW)
  ├── shadows.ts         (NEW)
  └── animations.ts      (NEW)

src/components/
  ├── ui/
  │   ├── index.ts       (NEW - barrel export)
  │   └── Button.tsx     (NEW)
  ├── AccentGlow.tsx     (existing - unchanged)
  ├── StreakBox.tsx       (existing - unchanged)
  └── ...                (existing - unchanged)
```

## Migration Strategy

**Phase 1 (this spec):** Create token files + Button component. No existing files modified.

**Phase 1b (organic):** As features/bugs are worked on, swap inline buttons for `<Button>`. No dedicated migration sprint. Each screen touched = one more screen on the design system.

**Phase 2 (future spec):** Next components — Chip, Card, Sheet, Input, Typography (Text wrapper). Same pattern: build component, use in new code, backfill organically.

## What This Does NOT Cover

- NativeWind migration (staying with StyleSheet)
- Bulk migration of existing components or screens (one demo screen swap is in scope)
- Storybook or documentation catalog
- Linting rules for token enforcement
- Components beyond Button

## Success Criteria

1. All 5 token files created and importable
2. Button component renders all 5 variants x 3 sizes correctly
3. Button handles disabled, loading, icon, fullWidth states
4. Button uses tokens internally (no hardcoded spacing/radius/typography)
5. Button is theme-aware (dark/light/accent)
6. Existing app builds with zero changes — no regressions
7. At least one existing screen updated to use the new Button (CreateFolderSheet recommended — simplest primary + ghost button pair)
