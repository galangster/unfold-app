# Reveal Screen Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the daily reveal screen into a polished, tactile moment with scatter-in title animation, shimmer swipe prompt, draggable curtain-lift gesture, and haptic choreography.

**Architecture:** Four independent layers composed in one screen rewrite. Two new reusable components (`ScatterTitle`, `ShimmerText`) extracted for clarity, plus a full rewrite of `reveal.tsx` to wire everything together with gesture tracking and haptics.

**Tech Stack:** react-native-reanimated v4, react-native-gesture-handler v2, expo-haptics, expo-linear-gradient, @react-native-masked-view/masked-view, phosphor-react-native

**Spec:** `docs/superpowers/specs/2026-03-30-reveal-screen-overhaul-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/components/ScatterTitle.tsx` | **New** — Reusable scatter-in text animation (RevealChar + shuffleOrder extracted from welcome screen) |
| `src/components/ShimmerText.tsx` | **New** — Reusable shimmer text effect (MaskedView + translating LinearGradient) |
| `src/app/reveal.tsx` | **Rewrite** — Compose ScatterTitle, ShimmerText, draggable curtain-lift gesture, dual chevrons, haptic choreography |

---

### Task 1: ScatterTitle Component

**Files:**
- Create: `src/components/ScatterTitle.tsx`

- [ ] **Step 1: Create ScatterTitle component**

This component extracts the `RevealChar` + `shuffleOrder` pattern from `src/app/index.tsx` (lines 38-112), adapting it for reuse. Key difference from welcome screen: start color is `colors.background` (not hardcoded `#FFFFFF`) so it works on both dark and light themes.

```tsx
import React, { useEffect, useMemo, useCallback } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
  cancelAnimation,
  interpolateColor,
  useReducedMotion,
} from 'react-native-reanimated';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';

// ─── Deterministic pseudo-random shuffle ─────────────────────────
function shuffleOrder(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(
      (Math.sin(i * 7919 + 104729) * 0.5 + 0.5) * (i + 1),
    );
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

// ─── Single character with fade + color transition ───────────────
const ScatterChar = React.memo(({
  char,
  animDelay,
  startColor,
  endColor,
  fontSize,
}: {
  char: string;
  animDelay: number;
  startColor: string;
  endColor: string;
  fontSize: number;
}) => {
  const opacity = useSharedValue(0);
  const colorProgress = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      animDelay,
      withTiming(1, { duration: 600, easing: EASE }),
    );
    colorProgress.value = withDelay(
      animDelay,
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }),
    );

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(colorProgress);
    };
  }, [animDelay]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const textColorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      colorProgress.value,
      [0, 1],
      [startColor, endColor],
    ),
  }));

  return (
    <Animated.View style={containerStyle}>
      <Animated.Text
        style={[
          {
            fontFamily: FontFamily.display,
            fontSize,
            lineHeight: 50,
          },
          textColorStyle,
        ]}
      >
        {char}
      </Animated.Text>
    </Animated.View>
  );
});

// ─── Main component ──────────────────────────────────────────────

interface ScatterTitleProps {
  text: string;
  fontSize?: number;
  baseDelay?: number;
  stagger?: number;
  onComplete?: () => void;
}

export function ScatterTitle({
  text,
  fontSize = 42,
  baseDelay = 500,
  stagger = 80,
  onComplete,
}: ScatterTitleProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  const chars = useMemo(() => text.split(''), [text]);
  const charOrder = useMemo(() => shuffleOrder(chars.length), [chars.length]);

  const charDelays = useMemo(
    () => chars.map((_, i) => baseDelay + charOrder[i] * stagger),
    [chars.length, baseDelay, stagger, charOrder],
  );

  // Calculate when the last character finishes appearing (for onComplete)
  const maxDelay = useMemo(
    () => Math.max(...charDelays) + 600, // 600ms is the fade duration
    [charDelays],
  );

  // Fire onComplete after all characters have appeared
  useEffect(() => {
    if (!onComplete || reducedMotion) {
      onComplete?.();
      return;
    }
    const timer = setTimeout(onComplete, maxDelay);
    return () => clearTimeout(timer);
  }, [maxDelay, onComplete, reducedMotion]);

  // Reduced motion: show immediately in accent color
  if (reducedMotion) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {chars.map((char, i) => (
          <Animated.Text
            key={`c-${i}`}
            style={{
              fontFamily: FontFamily.display,
              fontSize,
              lineHeight: fontSize * 1.2,
              color: colors.accent,
            }}
          >
            {char}
          </Animated.Text>
        ))}
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {chars.map((char, i) => (
        <ScatterChar
          key={`c-${i}`}
          char={char}
          animDelay={charDelays[i]}
          startColor={colors.background}
          endColor={colors.accent}
          fontSize={fontSize}
        />
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npx expo start --clear --port 8081` (if Metro isn't running), then check for TypeScript errors.
Expected: No red screen, no TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ScatterTitle.tsx
git commit -m "feat: add ScatterTitle component with random scatter-in animation"
```

---

### Task 2: ShimmerText Component

**Files:**
- Create: `src/components/ShimmerText.tsx`

- [ ] **Step 1: Create ShimmerText component**

A reusable shimmer effect that sweeps a highlight gradient across text on a repeating loop. Uses `MaskedView` (text as the mask) with a translating `LinearGradient` behind it.

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/theme';
import { alpha } from '@/components/ui';
import type { TextStyle, LayoutChangeEvent } from 'react-native';

interface ShimmerTextProps {
  text: string;
  style?: TextStyle;
  shimmerWidth?: number;
  sweepDuration?: number;
  pauseDuration?: number;
  initialDelay?: number;
}

export function ShimmerText({
  text,
  style,
  shimmerWidth = 60,
  sweepDuration = 800,
  pauseDuration = 2200,
  initialDelay = 0,
}: ShimmerTextProps) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const translateX = useSharedValue(-shimmerWidth);
  const [textWidth, setTextWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    setTextWidth(e.nativeEvent.layout.width);
  };

  useEffect(() => {
    if (reducedMotion || textWidth === 0) return;

    // Sweep from left edge to right edge, then pause, then repeat
    translateX.value = withDelay(
      initialDelay,
      withRepeat(
        withSequence(
          withTiming(textWidth, {
            duration: sweepDuration,
            easing: Easing.inOut(Easing.ease),
          }),
          withDelay(pauseDuration, withTiming(-shimmerWidth, { duration: 0 })),
        ),
        -1,
        false,
      ),
    );
  }, [reducedMotion, sweepDuration, pauseDuration, shimmerWidth, initialDelay, textWidth]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Reduced motion: plain text, no shimmer
  if (reducedMotion) {
    return <Text style={style}>{text}</Text>;
  }

  return (
    <View onLayout={onLayout}>
      {/* Base text layer — always visible */}
      <Text style={style}>{text}</Text>

      {/* Shimmer overlay — masked to text shape */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <MaskedView
          style={{ flex: 1 }}
          maskElement={
            <Text style={[style, { color: 'black' }]}>{text}</Text>
          }
        >
          <Animated.View
            style={[
              {
                flex: 1,
                width: shimmerWidth,
              },
              shimmerStyle,
            ]}
          >
            <LinearGradient
              colors={[
                'transparent',
                alpha(colors.accent, 0.18),
                'transparent',
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </MaskedView>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: Check Metro for errors.
Expected: No TS errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ShimmerText.tsx
git commit -m "feat: add ShimmerText component with traveling gradient highlight"
```

---

### Task 3: Rewrite reveal.tsx — Compose Everything

**Files:**
- Modify: `src/app/reveal.tsx` (full rewrite)

- [ ] **Step 1: Rewrite reveal.tsx**

Replace the entire file. This wires together ScatterTitle, ShimmerText, draggable curtain-lift gesture, dual chevrons, and haptic choreography.

```tsx
import { useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  FadeIn,
  runOnJS,
  useReducedMotion,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { CaretUp } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { alpha } from '@/components/ui';
import { ScatterTitle } from '@/components/ScatterTitle';
import { ShimmerText } from '@/components/ShimmerText';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Gesture thresholds
const APPROACH_THRESHOLD = -40;
const COMMIT_THRESHOLD = -120;

// Spring config — critically-damped (damping 30, stiffness 200, mass 1 = slightly overdamped)
const CURTAIN_SPRING = { damping: 30, stiffness: 200, mass: 1 };

/**
 * Reveal screen — full-screen overlay shown once per day
 * when new devotional content is ready. User drags up to
 * lift the curtain and begin today's reading.
 */
export default function RevealScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  const { devotionalId, dayNumber, seriesTitle, dayTitle, totalDays } =
    useLocalSearchParams<{
      devotionalId: string;
      dayNumber: string;
      seriesTitle: string;
      dayTitle: string;
      totalDays: string;
    }>();

  const setLastRevealShownDate = useUnfoldStore((s) => s.setLastRevealShownDate);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);

  // Mark today as revealed on mount
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setLastRevealShownDate(today);
  }, [setLastRevealShownDate]);

  // ─── Entrance stagger state ────────────────────────────────────
  const eyebrowOpacity = useSharedValue(0);
  const dayCounterOpacity = useSharedValue(0);
  const promptOpacity = useSharedValue(0);

  useEffect(() => {
    // Eyebrow fades in at 200ms
    eyebrowOpacity.value = withDelay(
      200,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  // Called when ScatterTitle finishes all letters
  const onTitleComplete = useCallback(() => {
    // Day counter fades in ~100ms after title completes
    dayCounterOpacity.value = withDelay(
      100,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );
    // Swipe prompt fades in ~300ms after title completes
    promptOpacity.value = withDelay(
      300,
      withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  const eyebrowStyle = useAnimatedStyle(() => ({
    opacity: eyebrowOpacity.value,
  }));
  const dayCounterStyle = useAnimatedStyle(() => ({
    opacity: dayCounterOpacity.value,
  }));
  const promptStyle = useAnimatedStyle(() => ({
    opacity: promptOpacity.value,
  }));

  // ─── Dual chevron float ────────────────────────────────────────
  const chevronY1 = useSharedValue(0);
  const chevronY2 = useSharedValue(0);

  useEffect(() => {
    const floatConfig = {
      duration: 1200,
      easing: Easing.inOut(Easing.ease),
    };
    chevronY1.value = withRepeat(withTiming(-8, floatConfig), -1, true);
    chevronY2.value = withDelay(
      200,
      withRepeat(withTiming(-8, floatConfig), -1, true),
    );
  }, []);

  const chevron1Style = useAnimatedStyle(() => ({
    transform: [{ translateY: chevronY1.value }],
  }));
  const chevron2Style = useAnimatedStyle(() => ({
    transform: [{ translateY: chevronY2.value }],
  }));

  // ─── Draggable curtain lift ────────────────────────────────────
  const translateY = useSharedValue(0);
  const hasNavigated = useRef(false);

  // Haptic flags — shared values for worklet access
  const didTickApproach = useSharedValue(0); // 0 = no, 1 = yes
  const didTickCommit = useSharedValue(0);

  const navigateToReading = useCallback(() => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (devotionalId) {
      setCurrentDevotional(devotionalId);
    }
    router.replace({
      pathname: '/(tabs)/(today)/reading',
      params: dayNumber ? { dayNumber } : undefined,
    });
  }, [devotionalId, dayNumber, router, setCurrentDevotional]);

  const fireApproachHaptic = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  const fireCommitHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      didTickApproach.value = 0;
      didTickCommit.value = 0;
    })
    .onUpdate((event) => {
      // Clamp to upward only
      translateY.value = Math.min(0, event.translationY);

      // Approach haptic at -40px
      if (event.translationY < APPROACH_THRESHOLD && didTickApproach.value === 0) {
        didTickApproach.value = 1;
        runOnJS(fireApproachHaptic)();
      }

      // Commit haptic at -120px
      if (event.translationY < COMMIT_THRESHOLD && didTickCommit.value === 0) {
        didTickCommit.value = 1;
        runOnJS(fireCommitHaptic)();
      }
    })
    .onEnd((event) => {
      if (event.translationY < COMMIT_THRESHOLD) {
        // Past threshold — spring off screen and navigate
        translateY.value = withSpring(-SCREEN_HEIGHT, CURTAIN_SPRING);
        runOnJS(navigateToReading)();
      } else {
        // Before threshold — spring back
        translateY.value = withSpring(0, CURTAIN_SPRING);
      }
    });

  const curtainStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Parallax: ambient glow moves at 0.3x drag speed
  const glowParallaxStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value * 0.3 }],
  }));

  // ─── Shimmer sweep across title after scatter completes ────────
  const shimmerSweepOpacity = useSharedValue(0);
  const shimmerSweepX = useSharedValue(-SCREEN_WIDTH);

  const onScatterComplete = useCallback(() => {
    onTitleComplete();

    if (reducedMotion) return;

    // Fire shimmer sweep across the title area
    shimmerSweepOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(700, withTiming(0, { duration: 300 })),
    );
    shimmerSweepX.value = withTiming(SCREEN_WIDTH, {
      duration: 800,
      easing: Easing.inOut(Easing.ease),
    });
  }, [onTitleComplete, reducedMotion]);

  const shimmerSweepStyle = useAnimatedStyle(() => ({
    opacity: shimmerSweepOpacity.value,
    transform: [{ translateX: shimmerSweepX.value }],
  }));

  // ─── Render ────────────────────────────────────────────────────

  const dayNum = dayNumber ? parseInt(dayNumber, 10) : 1;
  const total = totalDays ? parseInt(totalDays, 10) : 1;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        entering={FadeIn.duration(600)}
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
          curtainStyle,
        ]}
        accessible
        accessibilityLabel={`New devotional ready: ${seriesTitle ?? 'Series'}, ${dayTitle ?? 'Today'}. Day ${dayNum} of ${total}. Swipe up to reveal your devotional.`}
        accessibilityRole="header"
      >
        {/* Ambient glow effect — with parallax */}
        <Animated.View
          style={[
            styles.ambientGlow,
            { backgroundColor: alpha(colors.accent, 0.06) },
            glowParallaxStyle,
          ]}
        />

        {/* Main content — centered */}
        <View style={styles.content}>
          {/* Series title eyebrow */}
          <Animated.Text
            style={[
              styles.eyebrow,
              { color: colors.textMuted },
              eyebrowStyle,
            ]}
            numberOfLines={1}
            accessibilityRole="text"
          >
            {(seriesTitle ?? 'YOUR SERIES').toUpperCase()}
          </Animated.Text>

          {/* Day title — scatter-in animation */}
          <View style={styles.titleContainer}>
            <ScatterTitle
              text={dayTitle ?? "Today's Reading"}
              fontSize={42}
              baseDelay={500}
              stagger={80}
              onComplete={onScatterComplete}
            />

            {/* Shimmer sweep overlay — passes once after scatter */}
            <Animated.View
              style={[styles.shimmerSweep, shimmerSweepStyle]}
              pointerEvents="none"
            >
              <LinearGradient
                colors={[
                  'transparent',
                  alpha(colors.accent, 0.15),
                  'transparent',
                ]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ flex: 1, borderRadius: 30 }}
              />
            </Animated.View>
          </View>

          {/* Day counter */}
          <Animated.Text
            style={[
              styles.dayCounter,
              { color: colors.textMuted },
              dayCounterStyle,
            ]}
            accessibilityRole="text"
          >
            {`DAY ${dayNum} OF ${total}`}
          </Animated.Text>
        </View>

        {/* Swipe-up prompt — bottom of screen */}
        <Animated.View style={[styles.swipePrompt, promptStyle]}>
          {/* Dual stacked chevrons */}
          <View style={styles.chevronStack}>
            <Animated.View style={chevron1Style}>
              <CaretUp size={24} color={colors.textSubtle} weight="light" />
            </Animated.View>
            <Animated.View style={[{ marginTop: 2 }, chevron2Style]}>
              <CaretUp size={24} color={colors.textSubtle} weight="light" />
            </Animated.View>
          </View>

          <ShimmerText
            text="Swipe up to reveal your devotional"
            style={{
              fontFamily: FontFamily.ui,
              fontSize: 13,
              textAlign: 'center',
              lineHeight: 20,
              marginTop: 8,
              color: colors.textSubtle,
            }}
            shimmerWidth={60}
            sweepDuration={800}
            pauseDuration={2200}
            initialDelay={1800}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  ambientGlow: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_WIDTH * 0.8,
    borderRadius: SCREEN_WIDTH * 0.4,
    alignSelf: 'center',
    top: '30%',
    opacity: 0.7,
  },
  eyebrow: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  titleContainer: {
    marginBottom: 16,
    overflow: 'hidden',
  },
  shimmerSweep: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 60,
  },
  dayCounter: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  swipePrompt: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  chevronStack: {
    alignItems: 'center',
  },
});
```

- [ ] **Step 2: Verify it builds and renders**

Run:
```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim.png && sips -Z 1000 /tmp/sim.png
```
Expected: Reveal screen renders with scatter-in title, dual chevrons, shimmer text. No red screen.

- [ ] **Step 3: Test the drag gesture**

Manually test in simulator:
1. Drag up slightly (<40px) — screen follows finger, springs back on release
2. Drag up past -40px — feel approach haptic (on device)
3. Drag up past -120px — feel commit haptic, screen springs off top, navigates to reading
4. Drag down — no movement (clamped to upward only)

- [ ] **Step 4: Test light mode**

In the app settings, switch to light mode. Navigate to the reveal screen.
Expected: Letters scatter-in from cream background to darker gold (#9A7B3C). Shimmer highlight is visible on cream. All text readable.

- [ ] **Step 5: Commit**

```bash
git add src/app/reveal.tsx
git commit -m "feat: rewrite reveal screen with scatter title, shimmer prompt, curtain lift, haptics"
```

---

### Task 4: Visual Polish + Screenshot Verification

**Files:**
- Modify: `src/app/reveal.tsx` (if adjustments needed)
- Modify: `src/components/ScatterTitle.tsx` (if adjustments needed)
- Modify: `src/components/ShimmerText.tsx` (if adjustments needed)

- [ ] **Step 1: Take dark mode screenshot**

```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim-reveal-dark.png && sips -Z 1000 /tmp/sim-reveal-dark.png
```

Verify:
- Title is 42px, letters scatter in randomly with golden glow
- Two chevrons float with staggered rhythm
- Shimmer sweeps across "Swipe up to reveal your devotional" text
- Bottom prompt has adequate padding (not flush to bottom)
- Ambient glow circle visible behind title area

- [ ] **Step 2: Take light mode screenshot**

Switch theme to light, navigate to reveal screen.
```bash
xcrun simctl io "iPhone 17 Pro" screenshot /tmp/sim-reveal-light.png && sips -Z 1000 /tmp/sim-reveal-light.png
```

Verify:
- Cream background, letters materialize from invisible to deeper gold
- All text has sufficient contrast
- Shimmer is subtle but visible

- [ ] **Step 3: Adjust and commit if needed**

If visual adjustments are needed (timing, colors, spacing), make them and commit:
```bash
git add -u
git commit -m "fix: polish reveal screen visual details"
```

---

### Task 5: Final Build Verification

- [ ] **Step 1: Clean build**

```bash
npx expo start --clear --port 8081
```

Expected: No TypeScript errors, no warnings related to reveal screen.

- [ ] **Step 2: Full flow test**

Test the complete flow:
1. App loads → home screen shows "Preparing" or content
2. When new day is ready → reveal screen appears with scatter-in animation
3. Watch entrance sequence: eyebrow → scatter title → shimmer sweep → day counter → prompt
4. Drag up partially → screen follows finger → release → springs back
5. Drag past threshold → haptic feedback → screen lifts away → reading screen appears

- [ ] **Step 3: Reduced motion test**

Enable reduced motion in iOS Settings → Accessibility → Motion → Reduce Motion.
Expected: Title appears immediately (no scatter), no shimmer effects, drag gesture still works.

- [ ] **Step 4: Commit all remaining changes**

```bash
git add -u
git commit -m "feat: reveal screen overhaul complete — scatter title, shimmer, curtain lift, haptics"
```
