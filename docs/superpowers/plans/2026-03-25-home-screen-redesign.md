# Home Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the ~1600-line home screen into 6 focused zone components with a Skia ambient art background layer, following the two-layer architecture from the design spec.

**Architecture:** Layer 0 is a full-screen Skia Canvas (GPU) for ambient art (concentric rings, organic noise, ember particles). Layer 1 is the reorganized content in 6 zones: Greeting, Context Slot, Hero Devotional, Quick Actions, Series Carousel, Streak. Implemented in 3 phases: zone extraction (structural), ambient art (Skia), animation polish (springs + scroll effects).

**Tech Stack:** React Native 0.83 / Expo SDK 55, `@shopify/react-native-skia` v2.4.18 (already installed), `react-native-reanimated` v4, Zustand, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-25-home-screen-redesign-design.md`

---

## File Structure

```
src/constants/
├── animations.ts                    (modify — add SpringConfig, AmbientTiming)
├── colors.ts                        (modify — fix light mode contrast)

src/components/home/
├── AmbientArtCanvas.tsx             (create — Skia canvas orchestrator)
├── shaders/
│   ├── concentric-rings.ts          (create — SkSL RuntimeEffect source)
│   └── organic-noise.ts             (create — SkSL RuntimeEffect source)
├── EmberAtlas.tsx                    (create — Skia Atlas particle system)
├── compute-devotional-state.ts       (create — state machine derivation)
├── DevotionalCard.tsx               (create — 7-state hero card)
├── ContextSlot.tsx                   (create — priority-based single card)
├── QuickActionsRow.tsx              (create — horizontal pill actions)
├── SeriesCarousel.tsx               (create — horizontal scroll, replaces YourSeriesSection)
├── CompactStreakRow.tsx             (create — compact streak display)
├── GreetingRow.tsx                  (create — Zone 1 header row)
├── NotificationCard.tsx             (create — extracted from index.tsx)
├── BridgeShimmer.tsx                (create — extracted shimmer loader)
├── DailyBridgeCard.tsx              (create — extracted bridge card)

src/components/home/__tests__/
├── compute-devotional-state.test.ts (create — state machine tests)

src/lib/
├── context-slot-priority.ts         (create — pure logic for slot priority)

src/lib/__tests__/
├── context-slot-priority.test.ts    (create — priority logic tests)

src/app/(tabs)/(today)/
├── index.tsx                        (modify — rewrite to ~300 lines)

src/components/
├── GoldEmberField.tsx               (delete after Phase 2)
```

---

## Phase 1: Zone Extraction (structural)

### Task 1: Update design tokens

**Files:**
- Modify: `src/constants/animations.ts`
- Modify: `src/constants/colors.ts`

- [ ] **Step 1: Add SpringConfig and AmbientTiming to animations.ts**

```tsx
// Add after existing Stagger export in src/constants/animations.ts

// Duration-based spring configs — critically-damped only (no bounce)
export const SpringConfig = {
  /** Button press, micro-interactions */
  quick: { duration: 150, dampingRatio: 1 },
  /** Card transitions, standard UI */
  standard: { duration: 280, dampingRatio: 1 },
  /** Sheets, modals, large elements */
  smooth: { duration: 340, dampingRatio: 1 },
} as const;

// Ambient art timing constants
export const AmbientTiming = {
  /** Shader breathing cycle (ms) */
  breathCycle: 5000,
  /** Full ring rotation (ms) */
  ringRotation: 60000,
  /** Particle float duration range */
  particleMin: 7000,
  particleMax: 12000,
  /** Time loop total (ms) — 10 minutes */
  timeLoop: 600000,
} as const;
```

- [ ] **Step 2: Fix light mode contrast values in colors.ts**

In `src/constants/colors.ts`, update `LightColors`:
```tsx
// Change these values in the LightColors object:
textMuted: 'rgba(28, 23, 16, 0.68)',          // was 0.62
buttonBackground: 'rgba(28, 23, 16, 0.08)',   // was 0.05
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/constants/animations.ts src/constants/colors.ts
git commit -m "feat(home): add SpringConfig tokens, fix light mode contrast"
```

---

### Task 2: Create context slot priority logic

**Files:**
- Create: `src/lib/context-slot-priority.ts`

This is a pure function with no UI — easy to test.

- [ ] **Step 1: Create the priority function**

```tsx
// src/lib/context-slot-priority.ts

/**
 * Context Slot Priority System
 * Determines which single card to show in Zone 2.
 * Only one card at a time — highest priority wins.
 */

export type ContextSlotType =
  | 'resume'
  | 'evening'
  | 'midday'
  | 'bridge'
  | 'bridge-loading'
  | 'none';

export interface ContextSlotInput {
  /** User has a paused reading in progress */
  hasResumeContext: boolean;
  /** Current hour (0-23) */
  currentHour: number;
  /** Current minute (0-59) */
  currentMinute: number;
  /** User has a current devotional */
  hasDevotional: boolean;
  /** Today's reading is complete */
  hasReadToday: boolean;
  /** Midday check-in already done today */
  hasMiddayCheckIn: boolean;
  /** Evening check-in already done today */
  hasEveningCheckIn: boolean;
  /** Bridge text is loaded */
  hasBridgeText: boolean;
  /** Bridge is currently loading */
  isBridgeLoading: boolean;
  /** Bridge input is available (not day 1, has user name) */
  hasBridgeInput: boolean;
}

export function getContextSlotType(input: ContextSlotInput): ContextSlotType {
  // Priority 1: Resume card
  if (input.hasResumeContext) return 'resume';

  if (!input.hasDevotional) return 'none';

  // Priority 2: Evening wind-down (5pm-11:30pm, reading complete, no evening check-in)
  const isEveningWindow =
    (input.currentHour >= 17 && input.currentHour < 23) ||
    (input.currentHour === 23 && input.currentMinute < 30);
  if (isEveningWindow && input.hasReadToday && !input.hasEveningCheckIn) {
    return 'evening';
  }

  // Priority 3: Midday check-in (12pm-5pm, reading incomplete, no midday check-in)
  const isMiddayWindow = input.currentHour >= 12 && input.currentHour < 17;
  if (isMiddayWindow && !input.hasReadToday && !input.hasMiddayCheckIn) {
    return 'midday';
  }

  // Priority 4: Daily bridge
  if (input.hasBridgeInput && input.hasBridgeText) return 'bridge';

  // Priority 5: Bridge loading shimmer
  if (input.hasBridgeInput && input.isBridgeLoading) return 'bridge-loading';

  return 'none';
}
```

- [ ] **Step 2: Write unit tests**

Create: `src/lib/__tests__/context-slot-priority.test.ts`

```tsx
// src/lib/__tests__/context-slot-priority.test.ts
import { getContextSlotType, type ContextSlotInput } from '../context-slot-priority';

const base: ContextSlotInput = {
  hasResumeContext: false,
  currentHour: 10,
  currentMinute: 0,
  hasDevotional: true,
  hasReadToday: false,
  hasMiddayCheckIn: false,
  hasEveningCheckIn: false,
  hasBridgeText: false,
  isBridgeLoading: false,
  hasBridgeInput: false,
};

describe('getContextSlotType', () => {
  it('returns resume when hasResumeContext is true (highest priority)', () => {
    expect(getContextSlotType({ ...base, hasResumeContext: true })).toBe('resume');
  });

  it('returns resume even during evening window', () => {
    expect(getContextSlotType({
      ...base, hasResumeContext: true, currentHour: 20, hasReadToday: true,
    })).toBe('resume');
  });

  it('returns none when no devotional exists', () => {
    expect(getContextSlotType({ ...base, hasDevotional: false })).toBe('none');
  });

  it('returns evening during evening window when read today and no check-in', () => {
    expect(getContextSlotType({
      ...base, currentHour: 19, hasReadToday: true, hasEveningCheckIn: false,
    })).toBe('evening');
  });

  it('returns none during evening if already checked in', () => {
    expect(getContextSlotType({
      ...base, currentHour: 19, hasReadToday: true, hasEveningCheckIn: true,
    })).toBe('none');
  });

  it('returns midday during midday window when not read and no check-in', () => {
    expect(getContextSlotType({
      ...base, currentHour: 14, hasReadToday: false, hasMiddayCheckIn: false,
    })).toBe('midday');
  });

  it('returns none during midday if already checked in', () => {
    expect(getContextSlotType({
      ...base, currentHour: 14, hasReadToday: false, hasMiddayCheckIn: true,
    })).toBe('none');
  });

  it('returns bridge when hasBridgeInput and hasBridgeText', () => {
    expect(getContextSlotType({
      ...base, hasBridgeInput: true, hasBridgeText: true,
    })).toBe('bridge');
  });

  it('returns bridge-loading when hasBridgeInput and isBridgeLoading', () => {
    expect(getContextSlotType({
      ...base, hasBridgeInput: true, isBridgeLoading: true,
    })).toBe('bridge-loading');
  });

  it('returns none when nothing applies', () => {
    expect(getContextSlotType(base)).toBe('none');
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest src/lib/__tests__/context-slot-priority.test.ts --no-coverage 2>&1 | tail -10`
Expected: 10 tests passing

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/context-slot-priority.ts src/lib/__tests__/context-slot-priority.test.ts
git commit -m "feat(home): add context slot priority logic with tests"
```

---

### Task 3: Extract helper components from index.tsx

**Files:**
- Create: `src/components/home/NotificationCard.tsx`
- Create: `src/components/home/BridgeShimmer.tsx`
- Create: `src/components/home/DailyBridgeCard.tsx`
- Create: `src/components/home/GreetingRow.tsx`

These are direct extractions of existing components from `index.tsx` with no logic changes.

- [ ] **Step 1: Create NotificationCard.tsx**

Extract the `NotificationCard` function component (lines 196-243 of current index.tsx) into its own file. It takes: `colors`, `onPress`, `message`, `icon`, `accentColor`, `delay?`.

```tsx
// src/components/home/NotificationCard.tsx
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { CaretRightIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { Duration } from '@/constants/animations';
import { alpha } from '@/components/ui';
import { CompanionOrb } from '@/components/CompanionOrb';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
  onPress: () => void;
  message: string;
  icon: React.ReactNode;
  accentColor: string;
  delay?: number;
}

export function NotificationCard({ colors, onPress, message, icon, accentColor, delay = 150 }: Props) {
  const { entering, exiting } = useAccessibleAnimation();

  return (
    <Animated.View
      entering={entering(FadeIn.duration(400).delay(delay))}
      exiting={exiting(FadeOut.duration(Duration.slow))}
      style={{ paddingHorizontal: Spacing['6'], marginTop: Spacing['3'] }}
    >
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        <View style={{
          borderRadius: Radius.card,
          paddingVertical: Spacing['4'],
          paddingHorizontal: Spacing['4'],
          paddingRight: Spacing['3'],
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: alpha(accentColor, 0.05),
          ...Shadow.sm,
        }}>
          <View style={{ marginRight: Spacing['3'] }}>
            <CompanionOrb accentColor={accentColor} size={28} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{
              fontFamily: FontFamily.body,
              fontSize: FontSize.sm,
              lineHeight: 20,
              color: colors.text,
            }}>
              {message}
            </Text>
          </View>
          <CaretRightIcon size={16} color={colors.textSubtle} weight="light" style={{ marginLeft: Spacing['2'] }} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
```

- [ ] **Step 2: Create BridgeShimmer.tsx**

```tsx
// src/components/home/BridgeShimmer.tsx
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn, useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, Easing, interpolate,
} from 'react-native-reanimated';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration } from '@/constants/animations';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
}

export function BridgeShimmer({ colors }: Props) {
  const { reducedMotion, entering } = useAccessibleAnimation();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, [shimmer, reducedMotion]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
  }));

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.slow))}
      style={{ paddingHorizontal: Spacing['6'], marginTop: Spacing['3'] }}
    >
      <View style={{
        borderRadius: Radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.inputBackground,
        padding: Spacing['4'],
      }}>
        <Animated.View style={shimmerStyle}>
          <View style={{ height: 12, width: '80%', borderRadius: 6, backgroundColor: colors.border, marginBottom: 8 }} />
          <View style={{ height: 12, width: '50%', borderRadius: 6, backgroundColor: colors.border }} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}
```

- [ ] **Step 3: Create DailyBridgeCard.tsx**

```tsx
// src/components/home/DailyBridgeCard.tsx
import React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { CompanionOrb } from '@/components/CompanionOrb';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  text: string;
  colors: ColorTheme;
}

export function DailyBridgeCard({ text, colors }: Props) {
  const { entering } = useAccessibleAnimation();

  return (
    <Animated.View
      entering={entering(FadeIn.duration(600))}
      style={{ paddingHorizontal: Spacing['6'], marginTop: Spacing['3'] }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing['2'] }}>
        <View style={{ marginTop: 4 }}>
          <CompanionOrb accentColor={colors.accent} size={24} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{
            backgroundColor: alpha(colors.accent, 0.06),
            borderColor: alpha(colors.accent, 0.13),
            borderWidth: 1,
            borderRadius: Radius.lg,
            paddingVertical: Spacing['3'],
            paddingHorizontal: Spacing['4'],
          }}>
            <Text style={{
              fontFamily: FontFamily.body,
              fontSize: FontSize.sm,
              lineHeight: 20,
              color: colors.text,
            }}>
              {text}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
```

- [ ] **Step 4: Create GreetingRow.tsx**

Extract the greeting header (lines 782-825) — the "Good morning" + name + avatar row. Move `getGreeting()` and `getTimeOfDay()` into this file. Accept `userName`, `onAvatarPress` as props.

```tsx
// src/components/home/GreetingRow.tsx
import React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { useTheme } from '@/lib/theme';
import { StreakDisplay } from '@/components/StreakDisplay';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still awake?';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Wind down';
}

interface Props {
  userName?: string;
  onAvatarPress: () => void;
}

export function GreetingRow({ userName, onAvatarPress }: Props) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();

  return (
    <View style={{
      paddingHorizontal: Spacing['6'],
      paddingTop: Spacing['5'],
      paddingBottom: Spacing['3'],
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    }}>
      {/* Greeting text — stagger 0ms */}
      <Animated.View entering={entering(FadeIn.duration(400))} style={{ flex: 1 }}>
        <Text style={{
          fontFamily: FontFamily.bodyItalic,
          fontSize: 15,
          color: colors.textSubtle,
          marginBottom: 6,
        }}>
          {getGreeting()}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{
            fontFamily: FontFamily.display,
            fontSize: 34,
            color: colors.text,
            letterSpacing: -0.5,
          }}>
            {userName}
          </Text>
          <StreakDisplay compact hideDayLabel />
        </View>
      </Animated.View>
      {/* Avatar — stagger 80ms per spec Zone 1 */}
      <Animated.View entering={entering(FadeIn.duration(400).delay(80))} style={{ marginTop: Spacing['1'] }}>
        <ProfileAvatar size={38} onPress={onAvatarPress} />
      </Animated.View>
    </View>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add src/components/home/NotificationCard.tsx src/components/home/BridgeShimmer.tsx src/components/home/DailyBridgeCard.tsx src/components/home/GreetingRow.tsx
git commit -m "feat(home): extract NotificationCard, BridgeShimmer, DailyBridgeCard, GreetingRow"
```

---

### Task 4: Create ContextSlot component

**Files:**
- Create: `src/components/home/ContextSlot.tsx`

The ContextSlot uses the priority logic from Task 2 and renders the winning card. Handles the collapse animation when `type === 'none'`.

- [ ] **Step 1: Create ContextSlot.tsx**

```tsx
// src/components/home/ContextSlot.tsx
import React from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  withTiming,
  useSharedValue,
  useEffect as useReanimatedEffect,
} from 'react-native-reanimated';
import { Ease, Duration } from '@/constants/animations';
import type { ContextSlotType } from '@/lib/context-slot-priority';
import type { ColorTheme } from '@/constants/colors';

// Import the card components
import { NotificationCard } from './NotificationCard';
import { BridgeShimmer } from './BridgeShimmer';
import { DailyBridgeCard } from './DailyBridgeCard';

interface ResumeProps {
  onPress: () => void;
  label: string;        // "Resume where you left off" or "Resume your reflection"
  title: string;        // "Series Title · Day N: Day Title"
  timeAgo: string;      // "Saved 5m ago"
}

interface Props {
  slotType: ContextSlotType;
  colors: ColorTheme;
  // Card-specific props
  onMiddayPress?: () => void;
  middayMessage?: string;
  onEveningPress?: () => void;
  eveningMessage?: string;
  bridgeText?: string;
  resumeProps?: ResumeProps;
}

export function ContextSlot({ slotType, colors, ...props }: Props) {
  const height = useSharedValue(slotType === 'none' ? 0 : 100);

  // Animate height collapse/expand
  useReanimatedEffect(() => {
    height.value = withTiming(slotType === 'none' ? 0 : 100, {
      duration: Duration.normal,
      easing: Ease.out,
    });
  }, [slotType]);

  const containerStyle = useAnimatedStyle(() => ({
    height: slotType === 'none' ? height.value : undefined,
    overflow: 'hidden',
  }));

  if (slotType === 'none') {
    return <Animated.View style={containerStyle} />;
  }

  // Render the winning card based on priority
  return (
    <Animated.View
      key={slotType}
      entering={FadeIn.duration(Duration.normal)}
      exiting={FadeOut.duration(180)}
    >
      {slotType === 'midday' && props.onMiddayPress && (
        <NotificationCard
          colors={colors}
          onPress={props.onMiddayPress}
          message={props.middayMessage || ''}
          icon={null}
          accentColor={colors.accent}
        />
      )}
      {slotType === 'evening' && props.onEveningPress && (
        <NotificationCard
          colors={colors}
          onPress={props.onEveningPress}
          message={props.eveningMessage || ''}
          icon={null}
          accentColor={colors.accent}
        />
      )}
      {slotType === 'bridge' && props.bridgeText && (
        <DailyBridgeCard text={props.bridgeText} colors={colors} />
      )}
      {slotType === 'bridge-loading' && (
        <BridgeShimmer colors={colors} />
      )}
      {slotType === 'resume' && props.resumeProps && (
        <View style={{ paddingHorizontal: Spacing['6'], marginTop: Spacing['4'] }}>
          <TouchableOpacity activeOpacity={0.7} onPress={props.resumeProps.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${props.resumeProps.label}, ${props.resumeProps.title}`}
          >
            <View style={{
              backgroundColor: colors.inputBackground,
              borderRadius: Radius.card,
              borderWidth: 1,
              borderColor: colors.border,
              padding: Spacing['4'],
              ...Shadow.sm,
            }}>
              <Text style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 13,
                color: colors.accent,
                marginBottom: 6,
              }}>
                {props.resumeProps.label}
              </Text>
              <Text numberOfLines={1} style={{
                fontFamily: FontFamily.body,
                fontSize: 15,
                color: colors.text,
                marginBottom: Spacing['1'],
              }}>
                {props.resumeProps.title}
              </Text>
              <Text style={{
                fontFamily: FontFamily.ui,
                fontSize: FontSize.xs,
                color: colors.textSubtle,
              }}>
                {props.resumeProps.timeAgo}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}
```

Add missing imports at top of ContextSlot.tsx:
```tsx
import { TouchableOpacity, View, Text } from 'react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/home/ContextSlot.tsx
git commit -m "feat(home): create ContextSlot with priority-based card rotation"
```

---

### Task 5: Create DevotionalCard component

**Files:**
- Create: `src/components/home/DevotionalCard.tsx`

This is the largest extraction — the hero card currently spans lines 925-1323 of index.tsx. It needs to support all 7 states from the spec.

- [ ] **Step 1: Create computeDevotionalState helper**

Add to the end of `src/lib/context-slot-priority.ts` (or create a separate file `src/components/home/compute-devotional-state.ts`):

```tsx
// src/components/home/compute-devotional-state.ts
import type { DayData, Devotional } from '@/lib/store';

export type DevotionalCardState =
  | { type: 'empty'; onCreateNew: () => void }
  | { type: 'preparing' }
  | { type: 'unread'; dayData: DayData; seriesTitle: string; totalDays: number; onContinue: () => void; onCreateNew: () => void; ctaText: string }
  | { type: 'in-progress'; dayData: DayData; seriesTitle: string; progress: number; daysCompleted: number; totalDays: number; onContinue: () => void; onCreateNew: () => void; ctaText: string }
  | { type: 'complete-today'; dayData: DayData; seriesTitle: string; progress: number; daysCompleted: number; totalDays: number; onContinue: () => void; onCreateNew: () => void }
  | { type: 'tomorrow-locked'; dayData: DayData; seriesTitle: string; progress: number; daysCompleted: number; totalDays: number; tomorrowTeaser: string | null }
  | { type: 'journey-complete'; seriesTitle: string; onCreateNew: () => void };

interface ComputeInput {
  currentDevotional: Devotional | null;
  currentDayData: DayData | null;
  hasReadToday: boolean;
  isJourneyComplete: boolean;
  isPreparing: boolean;
  daysCompleted: number;
  totalDays: number;
  progress: number;
  tomorrowTeaser: string | null;
  onContinue: () => void;
  onCreateNew: () => void;
  ctaText: string;
}

export function computeDevotionalState(input: ComputeInput): DevotionalCardState {
  // State 1: No devotional at all
  if (!input.currentDevotional) {
    return { type: 'empty', onCreateNew: input.onCreateNew };
  }

  // State 2: Devotional exists but current day is still generating
  if (input.isPreparing || !input.currentDayData) {
    return { type: 'preparing' };
  }

  // State 7: All days complete
  if (input.isJourneyComplete) {
    return { type: 'journey-complete', seriesTitle: input.currentDevotional.title, onCreateNew: input.onCreateNew };
  }

  // State 6: Today done, tomorrow locked
  if (input.hasReadToday && input.daysCompleted < input.totalDays) {
    return {
      type: 'tomorrow-locked',
      dayData: input.currentDayData,
      seriesTitle: input.currentDevotional.title,
      progress: input.progress,
      daysCompleted: input.daysCompleted,
      totalDays: input.totalDays,
      tomorrowTeaser: input.tomorrowTeaser,
    };
  }

  // State 5: Today complete (review mode)
  if (input.currentDayData.isRead) {
    return {
      type: 'complete-today',
      dayData: input.currentDayData,
      seriesTitle: input.currentDevotional.title,
      progress: input.progress,
      daysCompleted: input.daysCompleted,
      totalDays: input.totalDays,
      onContinue: input.onContinue,
      onCreateNew: input.onCreateNew,
    };
  }

  // State 4: In progress (partially read)
  if (input.daysCompleted > 0) {
    return {
      type: 'in-progress',
      dayData: input.currentDayData,
      seriesTitle: input.currentDevotional.title,
      progress: input.progress,
      daysCompleted: input.daysCompleted,
      totalDays: input.totalDays,
      onContinue: input.onContinue,
      onCreateNew: input.onCreateNew,
      ctaText: input.ctaText,
    };
  }

  // State 3: Unread (Day 1, fresh)
  return {
    type: 'unread',
    dayData: input.currentDayData,
    seriesTitle: input.currentDevotional.title,
    totalDays: input.totalDays,
    onContinue: input.onContinue,
    onCreateNew: input.onCreateNew,
    ctaText: input.ctaText,
  };
}
```

- [ ] **Step 2: Create DevotionalCard.tsx**

The component accepts a `state` discriminated union and renders based on `state.type`:

```tsx
// src/components/home/DevotionalCard.tsx
import React, { useMemo, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, {
  FadeIn, useSharedValue, useAnimatedStyle, withTiming, withDelay,
  withRepeat, withSequence, interpolate, interpolateColor,
  Easing, cancelAnimation, type SharedValue,
} from 'react-native-reanimated';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { Duration, SpringConfig } from '@/constants/animations';
import { BIBLE_STUDY_METHODS } from '@/constants/bible-study-methods';
import { useTheme } from '@/lib/theme';
import { AccentGlow } from '@/components/AccentGlow';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { DevotionalCardState } from './compute-devotional-state';
import type { ColorTheme } from '@/constants/colors';

// Re-export for convenience
export type { DevotionalCardState } from './compute-devotional-state';
export { computeDevotionalState } from './compute-devotional-state';

interface Props {
  state: DevotionalCardState;
  scrollY?: SharedValue<number>;
}

export function DevotionalCard({ state, scrollY }: Props) {
  const { colors } = useTheme();
  const { entering, reducedMotion } = useAccessibleAnimation();

  // Press feedback spring
  const scale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      ...(scrollY ? [{ translateY: scrollY.value * 0.05 }] : []),
    ],
  }));

  const onPressIn = useCallback(() => {
    scale.value = withTiming(0.97, { duration: SpringConfig.quick.duration });
  }, []);
  const onPressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: SpringConfig.quick.duration });
  }, []);

  switch (state.type) {
    case 'empty':
      return <EmptyState onCreateNew={state.onCreateNew} colors={colors} />;
    case 'preparing':
      return <PreparingState colors={colors} />;
    case 'journey-complete':
      return <JourneyCompleteState
        seriesTitle={state.seriesTitle}
        onCreateNew={state.onCreateNew}
        colors={colors}
        cardStyle={cardStyle}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />;
    default:
      // States: unread, in-progress, complete-today, tomorrow-locked
      // These all share the main card layout with different CTA and info
      return <MainCard
        state={state}
        colors={colors}
        cardStyle={cardStyle}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />;
  }
}
```

**Extraction approach:**
1. Move `AnimatedProgressBar` into this file (only used here)
2. Copy the main card JSX (lines 925-1323 of index.tsx) into `MainCard` sub-component, render different CTAs based on state type
3. Move `getCtaText()`, `getReadingDayLabel()` helpers into this file
4. `EmptyState` = lines 675-737 (the RevealChar welcome screen)
5. `PreparingState` = skeleton shimmer with "Preparing your devotional..." (lines 1173-1188)
6. `JourneyCompleteState` = lines 930-1018 (celebration + "Start new series" CTA)
7. `MainCard` = lines 1020-1323 (progress bar, study method chip, CTA, tomorrow lock toggle)

**Key details to preserve:**
- `sharedTransitionTag` on title text (line 1099) — for future shared element transitions
- `AccentGlow` wrapper on CTA button (line 1261)
- `BIBLE_STUDY_METHODS` chip display (lines 1148-1171)
- Tomorrow lock info toggle (lines 1244-1258)
- "New Series" secondary CTA (lines 1290-1319)
- Move `RevealChar` and `shuffleRevealOrder` into this file (only used in EmptyState)

- [ ] **Step 3: Write test for computeDevotionalState**

Create: `src/components/home/__tests__/compute-devotional-state.test.ts`

```tsx
// src/components/home/__tests__/compute-devotional-state.test.ts
import { computeDevotionalState } from '../compute-devotional-state';

const baseDayData = { dayNumber: 3, title: 'Day 3', isRead: false } as any;
const baseDevotional = { title: 'Walking in Grace', days: [] } as any;
const noop = () => {};

describe('computeDevotionalState', () => {
  it('returns empty when no currentDevotional', () => {
    const result = computeDevotionalState({
      currentDevotional: null, currentDayData: null, hasReadToday: false,
      isJourneyComplete: false, isPreparing: false, daysCompleted: 0,
      totalDays: 7, progress: 0, tomorrowTeaser: null,
      onContinue: noop, onCreateNew: noop, ctaText: 'Start',
    });
    expect(result.type).toBe('empty');
  });

  it('returns preparing when day data is null', () => {
    const result = computeDevotionalState({
      currentDevotional: baseDevotional, currentDayData: null, hasReadToday: false,
      isJourneyComplete: false, isPreparing: true, daysCompleted: 0,
      totalDays: 7, progress: 0, tomorrowTeaser: null,
      onContinue: noop, onCreateNew: noop, ctaText: 'Start',
    });
    expect(result.type).toBe('preparing');
  });

  it('returns journey-complete when all days done', () => {
    const result = computeDevotionalState({
      currentDevotional: baseDevotional, currentDayData: baseDayData, hasReadToday: true,
      isJourneyComplete: true, isPreparing: false, daysCompleted: 7,
      totalDays: 7, progress: 1, tomorrowTeaser: null,
      onContinue: noop, onCreateNew: noop, ctaText: 'Start',
    });
    expect(result.type).toBe('journey-complete');
  });

  it('returns tomorrow-locked when read today but not all complete', () => {
    const result = computeDevotionalState({
      currentDevotional: baseDevotional, currentDayData: baseDayData, hasReadToday: true,
      isJourneyComplete: false, isPreparing: false, daysCompleted: 3,
      totalDays: 7, progress: 0.43, tomorrowTeaser: 'Tomorrow: Patience',
      onContinue: noop, onCreateNew: noop, ctaText: 'Start',
    });
    expect(result.type).toBe('tomorrow-locked');
  });

  it('returns unread on Day 1 with no progress', () => {
    const result = computeDevotionalState({
      currentDevotional: baseDevotional, currentDayData: baseDayData, hasReadToday: false,
      isJourneyComplete: false, isPreparing: false, daysCompleted: 0,
      totalDays: 7, progress: 0, tomorrowTeaser: null,
      onContinue: noop, onCreateNew: noop, ctaText: 'Begin Day 1',
    });
    expect(result.type).toBe('unread');
  });

  it('returns in-progress when partially through series', () => {
    const result = computeDevotionalState({
      currentDevotional: baseDevotional, currentDayData: baseDayData, hasReadToday: false,
      isJourneyComplete: false, isPreparing: false, daysCompleted: 2,
      totalDays: 7, progress: 0.28, tomorrowTeaser: null,
      onContinue: noop, onCreateNew: noop, ctaText: 'Continue Day 3',
    });
    expect(result.type).toBe('in-progress');
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx jest src/components/home/__tests__/compute-devotional-state.test.ts --no-coverage 2>&1 | tail -10`
Expected: 6 tests passing

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add src/components/home/DevotionalCard.tsx src/components/home/compute-devotional-state.ts src/components/home/__tests__/compute-devotional-state.test.ts
git commit -m "feat(home): create DevotionalCard with 7-state machine and tests"
```

---

### Task 6: Create QuickActionsRow component

**Files:**
- Create: `src/components/home/QuickActionsRow.tsx`

New component — 3-4 horizontal pill actions (Journal, Companion, Bible, optional RememberThis).

- [ ] **Step 1: Create QuickActionsRow.tsx**

```tsx
// src/components/home/QuickActionsRow.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { PenIcon, ChatCircleDotsIcon, BookOpenIcon, HighlighterIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Stagger } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

interface Props {
  onJournalPress: () => void;
  onCompanionPress: () => void;
  onBiblePress: () => void;
  /** If set, shows a 4th pill for "Remember This" highlight */
  onRememberThisPress?: () => void;
  hasHighlights?: boolean;
}

function ActionPill({
  icon,
  label,
  onPress,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  delay: number;
}) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();

  return (
    <Animated.View entering={entering(FadeIn.duration(250).delay(delay))}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.pill, { backgroundColor: colors.buttonBackground }]}
      >
        {icon}
        <Text style={[styles.pillLabel, { color: colors.text }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function QuickActionsRow({
  onJournalPress,
  onCompanionPress,
  onBiblePress,
  onRememberThisPress,
  hasHighlights,
}: Props) {
  const { colors } = useTheme();
  const baseDelay = 240; // After Zone 3 entrance

  return (
    <View style={styles.row}>
      <ActionPill
        icon={<PenIcon size={16} color={colors.textMuted} weight="light" />}
        label="Journal"
        onPress={onJournalPress}
        delay={baseDelay}
      />
      <ActionPill
        icon={<ChatCircleDotsIcon size={16} color={colors.textMuted} weight="light" />}
        label="Companion"
        onPress={onCompanionPress}
        delay={baseDelay + Stagger.normal}
      />
      <ActionPill
        icon={<BookOpenIcon size={16} color={colors.textMuted} weight="light" />}
        label="Bible"
        onPress={onBiblePress}
        delay={baseDelay + Stagger.normal * 2}
      />
      {hasHighlights && onRememberThisPress && (
        <ActionPill
          icon={<HighlighterIcon size={16} color={colors.accent} weight="light" />}
          label="Highlight"
          onPress={onRememberThisPress}
          delay={baseDelay + Stagger.normal * 3}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['4'],
    gap: Spacing['2'],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['3'],
    borderRadius: Radius.xl,
  },
  pillLabel: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/home/QuickActionsRow.tsx
git commit -m "feat(home): create QuickActionsRow horizontal pills"
```

---

### Task 7: Create SeriesCarousel component

**Files:**
- Create: `src/components/home/SeriesCarousel.tsx`
- Reference: `src/components/home/YourSeriesSection.tsx` (existing — will be replaced)

Refactor the existing vertical `YourSeriesSection` into a horizontal scroll carousel. Keep the same data logic (deduplication, sorting).

- [ ] **Step 1: Create SeriesCarousel.tsx**

Copy the data logic from `YourSeriesSection.tsx` (lines 71-98 — deduplicate, sort, handleSeriesPress, handleSeeAll). Change the layout from vertical list to a horizontal `FlatList` with `horizontal={true}`.

Key changes from YourSeriesSection:
- `FlatList horizontal` instead of `.map()` vertical
- Card width: ~160px with `Spacing['3']` gap between cards
- Staggered `FadeInRight` entrance per card (80ms delay between cards)
- Single-series behavior: if `uniqueSeries.length <= 1`, return `null` (Zone 5 collapses — the single series is shown in Zone 3)
- "See All" link when `uniqueSeries.length >= 4` — navigates to full series list
- Scroll-driven scale: cards far from horizontal center scale to 0.97

```tsx
// src/components/home/SeriesCarousel.tsx
import React, { useMemo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Dimensions } from 'react-native';
import Animated, { FadeIn, FadeInRight, useAnimatedStyle, useSharedValue, useAnimatedScrollHandler, interpolate } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

const CARD_WIDTH = 160;
const CARD_GAP = parseInt(Spacing['3'], 10) || 12;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function SeriesCarousel() {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();
  const router = useRouter();
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const scrollX = useSharedValue(0);

  // Same dedup + sort logic from YourSeriesSection.tsx
  const recentSeries = useMemo(() => {
    const seen = new Set<string>();
    return devotionals
      .filter(d => d.id !== currentDevotionalId)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .filter(d => { if (seen.has(d.title)) return false; seen.add(d.title); return true; })
      .slice(0, 10);
  }, [devotionals, currentDevotionalId]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollX.value = e.contentOffset.x; },
  });

  const handleSeriesPress = useCallback((id: string) => {
    router.push({ pathname: '/(tabs)/(today)/reading', params: { devotionalId: id } });
  }, [router]);

  // Collapse Zone 5 when 0-1 series
  if (recentSeries.length <= 1) return null;

  return (
    <Animated.View entering={entering(FadeIn.duration(280).delay(320))} style={{ marginTop: Spacing['5'] }}>
      {/* Header with "See All" */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing['6'], marginBottom: Spacing['3'] }}>
        <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: FontSize.sm, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Your Series
        </Text>
        {recentSeries.length >= 4 && (
          <TouchableOpacity onPress={() => router.push('/(tabs)/(you)/past-series')}>
            <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.sm, color: colors.accent }}>
              See All
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Horizontal scroll */}
      <Animated.FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={recentSeries}
        keyExtractor={(item) => item.id}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: parseInt(Spacing['6'], 10) || 24, gap: CARD_GAP }}
        renderItem={({ item, index }) => (
          <SeriesCard
            devotional={item}
            index={index}
            scrollX={scrollX}
            colors={colors}
            onPress={() => handleSeriesPress(item.id)}
            enterDelay={index * 80}
          />
        )}
      />
    </Animated.View>
  );
}

function SeriesCard({ devotional, index, scrollX, colors, onPress, enterDelay }: any) {
  const { entering } = useAccessibleAnimation();

  // Scroll-driven scale: cards further from center scale down to 0.97
  const cardStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * (CARD_WIDTH + CARD_GAP),
      index * (CARD_WIDTH + CARD_GAP),
      (index + 1) * (CARD_WIDTH + CARD_GAP),
    ];
    const scaleVal = interpolate(scrollX.value, inputRange, [0.97, 1, 0.97], 'clamp');
    return { transform: [{ scale: scaleVal }] };
  });

  const daysCompleted = devotional.days?.filter((d: any) => d.isRead).length ?? 0;
  const totalDays = devotional.days?.length ?? 0;

  return (
    <Animated.View entering={entering(FadeInRight.duration(280).delay(enterDelay))} style={cardStyle}>
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={{
        width: CARD_WIDTH,
        backgroundColor: colors.inputBackground,
        borderRadius: Radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        padding: Spacing['3'],
      }}>
        <Text numberOfLines={2} style={{ fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.text, marginBottom: 4 }}>
          {devotional.title}
        </Text>
        <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.xs, color: colors.textMuted }}>
          Day {daysCompleted} of {totalDays}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/home/SeriesCarousel.tsx
git commit -m "feat(home): create SeriesCarousel horizontal scroll"
```

---

### Task 8: Create CompactStreakRow component

**Files:**
- Create: `src/components/home/CompactStreakRow.tsx`
- Reference: `src/components/StreakBox.tsx` (existing — kept for streak-settings)

Compact inline version of StreakBox for Zone 6. Shows: flame icon, streak count, freeze dots. No motivational copy, no 7-day calendar strip.

- [ ] **Step 1: Create CompactStreakRow.tsx**

```tsx
// src/components/home/CompactStreakRow.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SunIcon, SnowflakeIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

interface Props {
  streakCount: number;
  onPress: () => void;
}

export function CompactStreakRow({ streakCount, onPress }: Props) {
  const { colors } = useTheme();
  const { entering } = useAccessibleAnimation();

  const freezeProgress = streakCount > 0 ? streakCount % 7 : 0;
  const freezeDots = streakCount > 0 && freezeProgress === 0 ? 7 : freezeProgress;

  return (
    <Animated.View entering={entering(FadeIn.duration(400).delay(400))}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${streakCount} day streak. Tap for details.`}
        style={[styles.row, {
          backgroundColor: colors.inputBackground,
          borderColor: streakCount > 0 ? alpha(colors.accent, 0.08) : colors.border,
        }]}
      >
        <SunIcon
          size={20}
          color={colors.accent}
          weight={streakCount >= 7 ? 'fill' : 'light'}
        />
        <Text style={[styles.count, { color: streakCount > 0 ? colors.accent : colors.text }]}>
          {streakCount}
        </Text>
        <Text style={[styles.label, { color: colors.textMuted }]}>
          {streakCount === 1 ? 'day' : 'days'}
        </Text>

        {/* Freeze dots */}
        {streakCount > 0 && (
          <View style={styles.freezeSection}>
            <SnowflakeIcon size={10} color={colors.textSubtle} weight="light" />
            <View style={styles.dots}>
              {Array.from({ length: 7 }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, {
                    backgroundColor: i < freezeDots ? colors.accent : colors.border,
                  }]}
                />
              ))}
            </View>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['4'],
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: 6,
  },
  count: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.lg,
    letterSpacing: -0.5,
  },
  label: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
  freezeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: 4,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/home/CompactStreakRow.tsx
git commit -m "feat(home): create CompactStreakRow for Zone 6"
```

---

### Task 9: Rewrite index.tsx with zone components

**Files:**
- Modify: `src/app/(tabs)/(today)/index.tsx`

This is the big rewrite. Replace the ~1600-line file with ~300 lines that compose the zone components.

- [ ] **Step 1: Read the current index.tsx in full to understand all state/hooks used**

Read: `src/app/(tabs)/(today)/index.tsx` (all 1580 lines)

Inventory the hooks, state, effects, and callbacks that must be preserved. The key categories:
- **Store selectors:** user, devotionals, currentDevotionalId, resumeContext, streakCurrent, checkIns, etc.
- **Query hooks:** premium check, bridge text
- **Effects:** time-of-day interval, Bible DB download, progressive generation trigger, celebration detection
- **Callbacks:** handleContinueReading, handleResume, handleCreateNew, handleCheckIn, handleEveningWindDown, etc.
- **Refs:** journeyCardRef, streakBoxRef (for onboarding tooltips)

- [ ] **Step 2: Rewrite the component**

Structure:
```tsx
export default function HomeScreen() {
  // === All hooks, state, effects, callbacks (kept from current) ===
  // Minimize changes to hook logic — just restructure the JSX

  // === Audio player clearance ===
  const { isPlaying: audioIsPlaying } = useGlobalAudioPlayer();
  const audioPlayerPadding = audioIsPlaying ? 80 : Spacing['12']; // ~60px extra when player bar visible

  // === Compute derived state ===
  const slotType = getContextSlotType({
    hasResumeContext: shouldShowResumeCard,
    currentHour: new Date().getHours(),
    currentMinute: new Date().getMinutes(),
    hasDevotional: !!currentDevotional,
    hasReadToday: hasReadToday,
    hasMiddayCheckIn: todayCheckIns.some(c => c.type === 'midday'),
    hasEveningCheckIn: todayCheckIns.some(c => c.type === 'evening'),
    hasBridgeText: !!bridgeText,
    isBridgeLoading: bridgeLoading,
    hasBridgeInput: !!bridgeInput,
  });
  const devotionalState = computeDevotionalState({
    currentDevotional,
    currentDayData,
    hasReadToday,
    isJourneyComplete,
    isPreparing: !currentDayData && !!currentDevotional,
    daysCompleted,
    totalDays: currentDevotional?.days.length ?? 0,
    progress,
    tomorrowTeaser,
    onContinue: handleContinueReading,
    onCreateNew: handleCreateNew,
    ctaText: getCtaText(),
  });

  // === Render ===
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Zone 0: Ambient Art — added in Phase 2 */}

        <Animated.ScrollView
          contentContainerStyle={{ paddingBottom: audioPlayerPadding }}
          showsVerticalScrollIndicator={false}
        >
          {/* Zone 1: Greeting */}
          <GreetingRow
            userName={user?.name}
            onAvatarPress={() => router.push('/(tabs)/(you)')}
          />

          {/* Zone 2: Context Slot */}
          <ContextSlot
            slotType={slotType}
            colors={colors}
            onMiddayPress={handleCheckIn}
            middayMessage={middayMessage}
            onEveningPress={handleEveningWindDown}
            eveningMessage={eveningMessage}
            bridgeText={bridgeText}
          />

          {/* Zone 3: Hero Devotional */}
          <View ref={journeyCardRef} collapsable={false}>
            <DevotionalCard state={devotionalState} />
          </View>

          {/* Zone 4: Quick Actions */}
          <QuickActionsRow
            onJournalPress={() => router.push('/(tabs)/(journal)')}
            onCompanionPress={() => router.push('/(tabs)/(ask)')}
            onBiblePress={() => router.push('/bible')}
            hasHighlights={!!getRandomHighlight()}
            onRememberThisPress={() => { /* navigate to highlight */ }}
          />

          {/* Zone 5: Series Carousel */}
          <SeriesCarousel />

          {/* Zone 6: Streak + Premium */}
          <View style={{ paddingHorizontal: Spacing['6'], marginTop: Spacing['6'] }}>
            <View ref={streakBoxRef} collapsable={false}>
              <CompactStreakRow
                streakCount={streakCurrent}
                onPress={() => router.push('/(tabs)/(you)/streak-settings')}
              />
            </View>
            {premiumNudge && (
              <PremiumNudgeCard ... />
            )}
          </View>
        </Animated.ScrollView>
      </SafeAreaView>

      {/* Sheets + overlays (kept as-is) */}
      <CheckInSheet ... />
      <PremiumFeatureSheet ... />
      {showCelebration && <StreakCelebration ... />}
      <HomeOnboardingTooltips targets={onboardingTargets} />
    </View>
  );
}
```

**Important:** Keep all hooks, effects, and callbacks in the same file. Only the JSX render tree changes. This ensures no behavioral regressions.

- [ ] **Step 3: Remove unused imports and the old homeStyles StyleSheet**

Delete: `RevealChar`, `shuffleRevealOrder`, `NotificationCard`, `BridgeShimmer`, `DailyBridgeCard`, `AnimatedProgressBar`, `getGreeting`, `getTimeOfDay`, `formatResumeRelativeTime` — all now in extracted components.

Add new imports:
```tsx
import { useGlobalAudioPlayer } from '@/hooks/useGlobalAudioPlayer';
import { getContextSlotType } from '@/lib/context-slot-priority';
import { computeDevotionalState, DevotionalCard } from '@/components/home/DevotionalCard';
import { ContextSlot } from '@/components/home/ContextSlot';
import { GreetingRow } from '@/components/home/GreetingRow';
import { QuickActionsRow } from '@/components/home/QuickActionsRow';
import { SeriesCarousel } from '@/components/home/SeriesCarousel';
import { CompactStreakRow } from '@/components/home/CompactStreakRow';
```

- [ ] **Step 3b: Remove Day1ReviewCard from home screen**

The spec says Day1ReviewCard moves to the reading flow (post-completion). Remove the `<Day1ReviewCard>` render from the home screen. The component itself stays — it will be wired into the reading completion flow separately.

- [ ] **Step 3c: Update HomeOnboardingTooltips targets**

The tooltip target refs (`journeyCardRef`, `streakBoxRef`) now wrap the new zone components. Verify the refs are assigned correctly:
- `journeyCardRef` wraps the `<DevotionalCard>` container (Zone 3)
- `streakBoxRef` wraps the `<CompactStreakRow>` container (Zone 6)

Both refs are already in the render tree from Step 2. Verify `HomeOnboardingTooltips` still receives them via `onboardingTargets` — the prop names should match existing usage.

- [ ] **Step 4: Delete old YourSeriesSection.tsx**

```bash
rm src/components/home/YourSeriesSection.tsx
```

Update any other imports that reference it (should be none — only index.tsx imported it).

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Build and take screenshot**

Run: `npx expo run:ios --device "iPhone 17 Pro"`
Then: `xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim-phase1.png && sips -Z 1000 /tmp/sim-phase1.png`

Verify: Home screen renders with same content as before, just reorganized. Context slot shows the highest-priority card. Series is horizontal. Streak is compact at bottom.

- [ ] **Step 7: Commit**

```bash
git add -A src/app/\(tabs\)/\(today\)/index.tsx src/components/home/
git commit -m "feat(home): rewrite index.tsx with 6-zone layout (~300 lines)"
```

---

---

### PHASE 1 GATE — STOP AND VERIFY

Before proceeding to Phase 2, confirm:
1. Home screen renders identically to current (same content, new structure)
2. Build passes with no TypeScript errors
3. Visual regression confirmed via screenshot comparison (dark + light mode)
4. All context slot priority tests pass
5. All computeDevotionalState tests pass
6. index.tsx is ~300 lines

**Do not proceed to Phase 2 until all gate criteria are met.**

---

## Phase 2: Ambient Art Layer

### Task 10: Create SkSL shader sources

**Files:**
- Create: `src/components/home/shaders/concentric-rings.ts`
- Create: `src/components/home/shaders/organic-noise.ts`

- [ ] **Step 1: Create concentric-rings.ts**

```tsx
// src/components/home/shaders/concentric-rings.ts
import { Skia } from '@shopify/react-native-skia';

/**
 * SkSL shader: concentric rings that breathe and slowly rotate.
 * Uniform inputs: iTime (float), iResolution (float2), accentColor (half3).
 * Output: premultiplied half4 at 2-4% opacity.
 */
export const concentricRingsSource = Skia.RuntimeEffect.Make(`
  uniform float iTime;
  uniform float2 iResolution;
  uniform half3 accentColor;

  half4 main(float2 fragCoord) {
    float2 uv = (fragCoord - iResolution * 0.5) / min(iResolution.x, iResolution.y);
    float dist = length(uv);

    // Multiple ring sets at different scales and speeds
    float ring1 = smoothstep(0.002, 0.0, abs(sin(dist * 20.0 - iTime * 0.3) - 0.7));
    float ring2 = smoothstep(0.003, 0.0, abs(sin(dist * 15.0 + iTime * 0.2) - 0.6));
    float ring3 = smoothstep(0.002, 0.0, abs(sin(dist * 25.0 - iTime * 0.15) - 0.8));

    // Breathing modulation (5-second cycle)
    float breath = sin(iTime * 0.4) * 0.3 + 0.7;

    // Combine with very low opacity
    half alpha = half((ring1 * 0.03 + ring2 * 0.02 + ring3 * 0.015) * breath);
    return half4(accentColor * alpha, alpha);
  }
`)!;
```

- [ ] **Step 2: Create organic-noise.ts**

```tsx
// src/components/home/shaders/organic-noise.ts
import { Skia } from '@shopify/react-native-skia';

/**
 * SkSL shader: domain-warped Fractal Brownian Motion.
 * Creates flowing, cloud-like patterns at 2-3% opacity.
 */
export const organicNoiseSource = Skia.RuntimeEffect.Make(`
  uniform float iTime;
  uniform float2 iResolution;
  uniform half3 accentColor;

  // Simple hash-based noise
  float hash(float2 p) {
    float h = dot(p, float2(127.1, 311.7));
    return fract(sin(h) * 43758.5453);
  }

  float noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    float2 u = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + float2(1.0, 0.0));
    float c = hash(i + float2(0.0, 1.0));
    float d = hash(i + float2(1.0, 1.0));

    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(float2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  half4 main(float2 fragCoord) {
    float2 uv = fragCoord / iResolution;
    float t = iTime * 0.1;

    // Domain warping — noise fed into itself
    float2 q = float2(fbm(uv * 3.0 + t), fbm(uv * 3.0 + float2(5.2, 1.3) + t));
    float f = fbm(uv * 3.0 + q * 1.5);

    half alpha = half(f * 0.025); // 2.5% max opacity
    return half4(accentColor * alpha, alpha);
  }
`)!;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/components/home/shaders/
git commit -m "feat(home): add SkSL concentric rings and organic noise shaders"
```

---

### Task 11: Create EmberAtlas component

**Files:**
- Create: `src/components/home/EmberAtlas.tsx`
- Reference: `src/components/GoldEmberField.tsx` (existing — will be deprecated)

Migrate the 70 individual `Animated.View` particles to Skia's `<Atlas>` for a single batched draw call.

- [ ] **Step 1: Create EmberAtlas.tsx**

Port the logic from `GoldEmberField.tsx`:
- Keep: `getEmberTier()`, `hexToRgb`, `lighten`, `darken`, particle generation logic, streak-reactive tiers
- Replace: Individual `Animated.View` particles → Skia `<Atlas>` with sprite sheet
- Replace: `expo-linear-gradient` glow → Skia `<Rect>` with `<RadialGradient>`

```tsx
// src/components/home/EmberAtlas.tsx
import React, { useMemo, useEffect } from 'react';
import { Dimensions } from 'react-native';
import {
  Canvas, Atlas, rect, useImage,
  Circle, RadialGradient, vec, Group,
  useCanvasRef,
} from '@shopify/react-native-skia';
import {
  useSharedValue, useDerivedValue, withRepeat,
  withTiming, withDelay, Easing, interpolate,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

// ... (copy getEmberTier, hexToRgb, lighten, darken from GoldEmberField.tsx)

interface Props {
  streakLevel?: number;
  active?: boolean;
}

export function EmberAtlas({ streakLevel, active = true }: Props) {
  const { colors, isDark } = useTheme();
  const { reducedMotion } = useAccessibleAnimation();

  if (reducedMotion || !active) return null;

  const tier = useMemo(() =>
    streakLevel !== undefined ? getEmberTier(streakLevel) : null,
    [streakLevel],
  );
  const particleCount = tier?.count ?? 18;

  // Generate particle data (positions, sizes, timing)
  const particles = useMemo(() => {
    const { width, height } = Dimensions.get('window');
    return Array.from({ length: particleCount }, (_, i) => ({
      x: Math.random() * width,
      y: height + 20 + Math.random() * 60,
      size: (tier?.sizeMin ?? 2) + Math.random() * ((tier?.sizeMax ?? 4) - (tier?.sizeMin ?? 2)),
      duration: 7000 + Math.random() * 5000,
      delay: Math.random() * 4000,
    }));
  }, [particleCount, tier]);

  // One shared value drives all particles via useDerivedValue
  const time = useSharedValue(0);
  useEffect(() => {
    time.value = withRepeat(
      withTiming(1, { duration: 12000, easing: Easing.linear }),
      -1, false,
    );
  }, []);

  // Create sprite: 16x16 soft circle with accent color
  const spriteSize = 16;
  const sprite = useMemo(() => {
    const surface = Skia.Surface.MakeOffscreen(spriteSize, spriteSize)!;
    const canvas = surface.getCanvas();
    const paint = Skia.Paint();
    const accentRgb = hexToRgb(colors.accent);
    const r = accentRgb ? accentRgb[0] : 200;
    const g = accentRgb ? accentRgb[1] : 165;
    const b = accentRgb ? accentRgb[2] : 92;

    // Soft radial gradient circle
    paint.setShader(
      Skia.Shader.MakeRadialGradient(
        { x: spriteSize / 2, y: spriteSize / 2 },
        spriteSize / 2,
        [Skia.Color(`rgba(${r},${g},${b},0.8)`), Skia.Color(`rgba(${r},${g},${b},0)`)],
        [0, 1],
        0, // TileMode.Clamp
      )
    );
    canvas.drawCircle(spriteSize / 2, spriteSize / 2, spriteSize / 2, paint);
    surface.flush();
    return surface.makeImageSnapshot();
  }, [colors.accent]);

  // Sprite rects (all the same — one sprite repeated)
  const sprites = useMemo(
    () => particles.map(() => rect(0, 0, spriteSize, spriteSize)),
    [particles],
  );

  // Derive RSXform transforms from time shared value
  const transforms = useDerivedValue(() => {
    return particles.map((p) => {
      const t = time.value;
      // Each particle cycles at its own rate
      const cycle = ((t * p.duration + p.delay) % 1);
      const { width, height } = Dimensions.get('window');

      // Float upward: y goes from bottom to top
      const y = p.y - cycle * (height + 100);
      // Gentle horizontal drift
      const x = p.x + Math.sin(cycle * Math.PI * 2 + p.delay) * 15;
      // Scale pulses slightly
      const s = (p.size / spriteSize) * (0.8 + Math.sin(cycle * Math.PI) * 0.2);

      // RSXform: [scos, ssin, tx, ty]
      return Skia.RSXform(s, 0, x - (spriteSize * s) / 2, y - (spriteSize * s) / 2);
    });
  });

  if (!sprite) return null;

  return (
    <Canvas style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      {/* Ambient glow from below */}
      <Group opacity={tier?.glowOpacity ?? 0.05}>
        <Circle cx={Dimensions.get('window').width / 2} cy={Dimensions.get('window').height} r={Dimensions.get('window').width * 0.6}>
          <RadialGradient
            c={vec(Dimensions.get('window').width / 2, Dimensions.get('window').height)}
            r={Dimensions.get('window').width * 0.6}
            colors={[`rgba(${hexToRgb(colors.accent)?.[0] ?? 200},${hexToRgb(colors.accent)?.[1] ?? 165},${hexToRgb(colors.accent)?.[2] ?? 92},0.15)`, 'transparent']}
          />
        </Circle>
      </Group>
      {/* Atlas: all particles in 1 draw call */}
      <Atlas image={sprite} sprites={sprites} transforms={transforms} />
    </Canvas>
  );
}
```

Add to imports at top of EmberAtlas.tsx:
```tsx
import { Skia } from '@shopify/react-native-skia';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/home/EmberAtlas.tsx
git commit -m "feat(home): create EmberAtlas with Skia batched particle rendering"
```

---

### Task 12: Create AmbientArtCanvas component

**Files:**
- Create: `src/components/home/AmbientArtCanvas.tsx`
- Modify: `src/app/(tabs)/(today)/index.tsx` — add Layer 0 behind ScrollView

- [ ] **Step 1: Create AmbientArtCanvas.tsx**

```tsx
// src/components/home/AmbientArtCanvas.tsx
import React, { useEffect } from 'react';
import { StyleSheet, AppState, Dimensions, type AppStateStatus } from 'react-native';
import {
  Canvas, Fill, Shader, Group, Rect, Mask, LinearGradient, vec,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue, useDerivedValue, withRepeat, withTiming,
  Easing, useAnimatedStyle, cancelAnimation,
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { AmbientTiming } from '@/constants/animations';
import { concentricRingsSource } from './shaders/concentric-rings';
import { organicNoiseSource } from './shaders/organic-noise';
import { EmberAtlas } from './EmberAtlas';

function hexToRgbArray(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

interface Props {
  streakLevel: number;
  hasReadToday: boolean;
  /** Scroll position for opacity fade */
  scrollY: Animated.SharedValue<number>;
}

export function AmbientArtCanvas({ streakLevel, hasReadToday, scrollY }: Props) {
  const { colors, isDark } = useTheme();
  const { reducedMotion } = useAccessibleAnimation();

  // Reduced motion: render nothing
  if (reducedMotion) return null;

  const { width, height } = Dimensions.get('window');
  const accentRgb = hexToRgbArray(colors.accent);

  // Continuous time driver
  const time = useSharedValue(0);

  useEffect(() => {
    time.value = withRepeat(
      withTiming(Math.PI * 200, {
        duration: AmbientTiming.timeLoop,
        easing: Easing.linear,
      }),
      -1, false,
    );
    return () => cancelAnimation(time);
  }, []);

  // Pause/resume on tab focus
  useFocusEffect(
    React.useCallback(() => {
      // Resume time animation when tab focused
      time.value = withRepeat(
        withTiming(Math.PI * 200, {
          duration: AmbientTiming.timeLoop,
          easing: Easing.linear,
        }),
        -1, false,
      );
      return () => cancelAnimation(time);
    }, [])
  );

  // Pause when app backgrounded (battery mitigation)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        time.value = withRepeat(
          withTiming(Math.PI * 200, {
            duration: AmbientTiming.timeLoop,
            easing: Easing.linear,
          }),
          -1, false,
        );
      } else {
        cancelAnimation(time);
      }
    });
    return () => sub.remove();
  }, []);

  // Shader uniforms via Reanimated → Skia bridge
  const ringsUniforms = useDerivedValue(() => ({
    iTime: time.value,
    iResolution: [width, height],
    accentColor: accentRgb,
  }));

  const noiseUniforms = useDerivedValue(() => ({
    iTime: time.value,
    iResolution: [width, height],
    accentColor: accentRgb,
  }));

  // Opacity fades as user scrolls down
  const ambientStyle = useAnimatedStyle(() => ({
    opacity: scrollY.value < 400
      ? 1 - (scrollY.value / 400) * 0.7
      : 0.3,
  }));

  // Light mode: reduce shader opacity
  const ringsOpacity = isDark ? 0.03 : 0.02;
  const noiseOpacity = isDark ? 0.02 : 0.01;

  // Note: Low Power Mode detection is not natively available in Expo/RN.
  // The spec targets 30fps during Low Power Mode. If needed, use
  // expo-battery (isLowPowerModeEnabled) or a native module check.
  // For now, the reduced-motion guard already disables ambient art entirely
  // when the user has enabled "Reduce Motion" in iOS settings, which is
  // the primary battery-conscious signal. Low Power Mode FPS throttling
  // can be added as a future enhancement if battery metrics warrant it.

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, ambientStyle]}
      pointerEvents="none"
      accessibilityElementsHidden
    >
      <Canvas style={StyleSheet.absoluteFill}>
        {/* Edge fade mask */}
        <Mask
          mask={
            <Rect x={0} y={0} width={width} height={height}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, height)}
                colors={['transparent', 'white', 'white', 'transparent']}
                positions={[0, 0.1, 0.85, 1]}
              />
            </Rect>
          }
        >
          {/* Concentric rings */}
          {concentricRingsSource && (
            <Group opacity={ringsOpacity}>
              <Fill>
                <Shader source={concentricRingsSource} uniforms={ringsUniforms} />
              </Fill>
            </Group>
          )}

          {/* Organic noise */}
          {organicNoiseSource && (
            <Group opacity={noiseOpacity}>
              <Fill>
                <Shader source={organicNoiseSource} uniforms={noiseUniforms} />
              </Fill>
            </Group>
          )}
        </Mask>
      </Canvas>

      {/* Ember particles — only when today's reading is complete */}
      {hasReadToday && (
        <EmberAtlas streakLevel={streakLevel} active />
      )}
    </Animated.View>
  );
}
```

- [ ] **Step 2: Wire AmbientArtCanvas into index.tsx**

In `src/app/(tabs)/(today)/index.tsx`, add:
1. A `scrollY` shared value and `useAnimatedScrollHandler`
2. `<AmbientArtCanvas>` as the first child of the root `<View>`, before `<SafeAreaView>`
3. Remove the standalone `<GoldEmberField>` (now rendered inside AmbientArtCanvas)

```tsx
// In the HomeScreen component:
const scrollY = useSharedValue(0);
const scrollHandler = useAnimatedScrollHandler({
  onScroll: (event) => { scrollY.value = event.contentOffset.y; },
});

// In the render:
<View style={{ flex: 1, backgroundColor: colors.background }}>
  <AmbientArtCanvas
    streakLevel={streakCurrent}
    hasReadToday={hasReadToday}
    scrollY={scrollY}
  />
  <SafeAreaView style={{ flex: 1 }} edges={['top']}>
    <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16} ...>
```

- [ ] **Step 3: Remove GoldEmberField import and usage**

Delete the old `<GoldEmberField>` from index.tsx. The EmberAtlas inside AmbientArtCanvas replaces it.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Build and take screenshot**

Run: `npx expo run:ios --device "iPhone 17 Pro"`
Then: `xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim-phase2.png && sips -Z 1000 /tmp/sim-phase2.png`

Verify:
- Ambient art visible as subtle rings/noise behind content
- Embers appear after completing today's reading
- Light mode: reduced opacity, adapted colors
- Check Perf Monitor for 60fps

- [ ] **Step 6: Commit**

```bash
git add src/components/home/AmbientArtCanvas.tsx src/app/\(tabs\)/\(today\)/index.tsx
git commit -m "feat(home): add AmbientArtCanvas with Skia shaders and EmberAtlas"
```

---

### Task 13: Delete GoldEmberField.tsx

**Files:**
- Delete: `src/components/GoldEmberField.tsx`

- [ ] **Step 1: Check for remaining imports of GoldEmberField**

Run: `grep -r "GoldEmberField" src/ --include="*.tsx" --include="*.ts" -l`

Expected: No results (should have been removed in Task 12). If any remain, update those imports.

- [ ] **Step 2: Delete the file**

```bash
rm src/components/GoldEmberField.tsx
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(home): delete deprecated GoldEmberField (replaced by EmberAtlas)"
```

---

---

### PHASE 2 GATE — STOP AND VERIFY

Before proceeding to Phase 3, confirm:
1. Ambient art (rings + noise) visible at very low opacity behind content
2. Embers appear only after completing today's reading
3. 60fps maintained during scrolling (check Perf Monitor)
4. Light mode: adapted colors, reduced opacity
5. Reduced motion: no ambient art rendered
6. GoldEmberField.tsx deleted, no remaining imports

**Do not proceed to Phase 3 until all gate criteria are met.**

---

## Phase 3: Animation Polish

### Task 14: Add staggered zone entrances and scroll-driven effects

**Files:**
- Modify: `src/app/(tabs)/(today)/index.tsx`
- Modify: `src/components/home/DevotionalCard.tsx`
- Modify: `src/components/home/ContextSlot.tsx`

- [ ] **Step 1: Add staggered entrance animations to each zone**

Each zone gets a `FadeIn` with increasing delay:
- Zone 1 (Greeting): 0ms (already has `FadeIn.duration(400)`)
- Zone 2 (Context): 80ms delay
- Zone 3 (Hero): 160ms delay
- Zone 4 (Quick Actions): 240ms delay (already set in QuickActionsRow)
- Zone 5 (Series): 320ms delay
- Zone 6 (Streak): 400ms delay (already set in CompactStreakRow)

Wrap each zone in `<Animated.View entering={FadeIn.duration(280).delay(N)}>` in index.tsx.

- [ ] **Step 2: Add entrance scale-up to Zone 3 (hero card)**

The spec says the hero card entrance should scale from 0.97 to 1.0:

In the Zone 3 wrapper in `index.tsx`:
```tsx
{/* Zone 3: Hero Devotional — entrance includes scale */}
<Animated.View
  entering={entering(
    FadeIn.duration(280).delay(160)
      .withInitialValues({ transform: [{ scale: 0.97 }] })
  )}
>
  <View ref={journeyCardRef} collapsable={false}>
    <DevotionalCard state={devotionalState} scrollY={scrollY} />
  </View>
</Animated.View>
```

If `withInitialValues` doesn't support scale directly, use a custom entering animation via `useSharedValue` that interpolates scale from 0.97 → 1.0 over 280ms with 160ms delay.

- [ ] **Step 2b: Add scroll-driven parallax to hero card**

In `DevotionalCard.tsx`, the `scrollY` shared value prop is already accepted (from Step 1 of Task 5). The parallax `translateY` is applied in the card's `useAnimatedStyle`.

- [ ] **Step 2c: Shared element transition note**

The spec mentions shared element transition (card title morphs into reading screen header). This is a Phase 3+ enhancement — requires `react-native-shared-element` or Expo Router's built-in shared transitions. Add a `sharedTransitionTag="devotional-title"` prop to the title `<Text>` inside `DevotionalCard` to prepare for this. The actual transition wiring is out of scope for this plan.

- [ ] **Step 3: Add crossfade transition to ContextSlot**

The ContextSlot already has `FadeIn`/`FadeOut` on its key change. Verify the crossfade timing: `FadeOut.duration(180)` then `FadeIn.duration(250)`.

- [ ] **Step 4: Add card press feedback springs**

In `DevotionalCard.tsx`, update the `onPressIn`/`onPressOut` to use the new `SpringConfig`:

```tsx
import { SpringConfig } from '@/constants/animations';
// ...
onPressIn: () => { scale.value = withSpring(0.97, SpringConfig.quick); }
onPressOut: () => { scale.value = withSpring(1, SpringConfig.quick); }
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(home): add staggered entrances, scroll parallax, press feedback springs"
```

---

### Task 15: Add device tilt parallax

**Files:**
- Modify: `src/components/home/AmbientArtCanvas.tsx`

- [ ] **Step 1: Check if useAnimatedSensor is available**

```tsx
import { useAnimatedSensor, SensorType } from 'react-native-reanimated';
```

If this import resolves (it should — confirmed in node_modules), use Option A.

- [ ] **Step 2: Add tilt parallax to AmbientArtCanvas**

Inside `AmbientArtCanvas.tsx`:

```tsx
// Only on real device — simulator has no gyroscope
const sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });

const tiltStyle = useAnimatedStyle(() => ({
  transform: [
    { translateX: sensor.sensor.value.roll * 6 },
    { translateY: sensor.sensor.value.pitch * 6 },
  ],
}));
```

Wrap the entire `<Canvas>` in an `<Animated.View style={tiltStyle}>`.

**Fallback:** If `useAnimatedSensor` causes issues at runtime, gate it behind a try-catch or platform check. The ambient art works perfectly without tilt — this is polish, not critical.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/components/home/AmbientArtCanvas.tsx
git commit -m "feat(home): add device tilt parallax to ambient art canvas"
```

---

### Task 16: Final verification and cleanup

**Files:**
- All modified files from previous tasks

- [ ] **Step 1: Run full TypeScript check**

Run: `cd /Users/galangster/clawd/work/unfold/app/mobile && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Build the app**

Run: `npx expo run:ios --device "iPhone 17 Pro"`
Expected: Successful build, no red screen

- [ ] **Step 3: Take screenshots in both themes**

Dark mode:
```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim-final-dark.png && sips -Z 1000 /tmp/sim-final-dark.png
```

Switch to light mode (Settings → Display & Brightness → Light), then:
```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim-final-light.png && sips -Z 1000 /tmp/sim-final-light.png
```

- [ ] **Step 4: Verify success criteria from spec**

Check each item:
1. ✅ Ambient art moves slowly (concentric rings, noise field visible at low opacity)
2. ✅ Hero devotional card visible in first viewport (no pushing down)
3. ✅ Context slot shows single card, rotates by priority
4. ✅ 60fps during scrolling (check Perf Monitor)
5. ✅ Ambient art doesn't block JS thread (Skia GPU only)
6. ✅ Light mode has adapted colors and proper contrast
7. ✅ Reduced motion: no ambient art, content appears immediately
8. ✅ index.tsx is ~300 lines (count: `wc -l src/app/\(tabs\)/\(today\)/index.tsx`)
9. ✅ Battery target to be validated separately via Xcode Energy Gauge

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(home): complete home screen redesign — all 3 phases"
```
