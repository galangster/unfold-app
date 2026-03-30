# Reveal Screen Overhaul — Design Spec

## Goal

Transform the daily reveal screen from a static overlay into a polished, tactile moment users look forward to every day. Four layers: scatter-in title animation, shimmer swipe prompt, draggable curtain-lift transition, and haptic choreography.

## Current State

**File:** `src/app/reveal.tsx`

The reveal screen is a full-screen overlay shown once per day when new devotional content is ready. Current implementation:
- Static title text (FontFamily.display, 32px)
- Single floating chevron (withRepeat translateY, 1200ms)
- "Swipe up to begin today's reading" text at bottom
- Simple `Gesture.Pan()` with -80px threshold that fires `router.replace()`
- FadeIn.duration(600) on mount
- Ambient circle glow (accent color at 6% opacity)

## Design

### Layer 1: Random Scatter Title

Reuses the exact `RevealChar` + `shuffleOrder` pattern from `src/app/index.tsx` (welcome screen).

**Changes to existing title:**
- Font size: 32px → **42px**, lineHeight: 40px → **50px**
- Animation: Each letter fades in (opacity 0→1, 600ms cubic ease) with `colors.background`→`colors.accent` color interpolation (1200ms). Letters start invisible against the background and materialize into gold — works on both dark (#0A0A08 → gold) and light (#FAF7F2 → deeper gold) themes.
- Order: Letters appear in shuffled pseudo-random order via `shuffleOrder()` (deterministic per title length)
- Stagger: **80ms** between characters (faster than welcome screen's 200ms, since titles are longer — e.g. "Barren Years, Buried Promises" is 30 chars)
- Base delay: 500ms after mount (after eyebrow fades in)
- Post-animation shimmer: Once all letters are placed, a diagonal gradient mask sweeps left→right over 800ms. Implemented as an `Animated.View` with a `LinearGradient` (accent at 15% opacity → transparent) that translates across the title width using withTiming.

**Eyebrow + day counter:** Simple opacity fade-in. Eyebrow at 200ms, day counter at ~100ms after last title letter lands.

**Light mode:** All colors come from `useTheme().colors` which returns the correct palette for dark/light/system. The scatter start color (`colors.background`) and end color (`colors.accent`) adapt automatically. The shimmer gradient uses `colors.accent` at 15% opacity, which reads well on both cream and dark backgrounds.

**Reduced motion:** Detected via reanimated's `useReducedMotion()` hook. Skip scatter animation, show title immediately at full opacity in `colors.accent`. Skip shimmer.

### Layer 2: Shimmer Swipe Prompt

**Position:** `paddingBottom: 40px` (down from 60px, maintaining comfortable padding above safe area inset bottom)

**Text:** "Swipe up to reveal your devotional" (updated copy — "reveal" instead of "begin")

**Shimmer effect:** A soft highlight gradient sweeps across the text every 3 seconds. Implementation: `MaskedView` wrapping the text, with a `LinearGradient` child (transparent → accent at 15% → transparent, ~40px wide) that translates from left edge to right edge using withRepeat + withTiming (800ms sweep, 2200ms pause = 3s cycle).

**Dual chevrons:** Two stacked `CaretUp` icons (size 24, textSubtle color). Both use the existing withRepeat float animation (-8px, 1200ms, Easing.inOut(ease)). Second chevron is delayed 200ms, creating a staggered "pull upward" rhythm. Spacing between chevrons: 2px (tight stack).

**Entrance:** Fades in ~1.8s after mount (after title animation completes). Uses withDelay + withTiming opacity.

### Layer 3: Draggable Curtain Lift

Replace the current fire-and-forget `Pan.onEnd()` with a fully tracked drag gesture.

**Gesture tracking:**
- `Gesture.Pan().onUpdate()` — tracks `translationY` on every frame, updates a `translateY` shared value
- Clamped to upward only: `Math.min(0, translationY)` — screen can't be dragged down
- The entire reveal screen container gets `useAnimatedStyle` with `transform: [{ translateY }]`

**Parallax:** The ambient circle glow moves at 0.3x the drag speed (its own animated style: `translateY * 0.3`)

**Threshold behavior:**
- Released **before** -120px: Spring back to 0 (critically-damped: damping 30, stiffness 200, mass 1 — slightly overdamped to guarantee no overshoot)
- Released **past** -120px: Spring to `-SCREEN_HEIGHT` (same spring config), triggering navigation

**Navigation timing:** `router.replace()` fires via `runOnJS` when the spring animation starts (on `onEnd` when past threshold), not when the spring completes. The visual exit animation and route change happen concurrently.

**Reading screen underneath:** Not pre-mounted — the `router.replace()` handles the transition. The reveal screen animating off-screen and the reading screen mounting create the curtain-lift illusion naturally.

**Cancel behavior:** If user drags up partially and releases, the screen springs back smoothly to origin.

### Layer 4: Haptic Choreography

Three haptic events during the swipe gesture, each firing once per gesture (tracked via shared value flags, reset in `onBegin`):

| Drag position | Haptic | Purpose |
|---|---|---|
| -40px | `Haptics.selectionAsync()` | Subtle tick — "you're getting close" |
| -120px (threshold) | `Haptics.impactAsync(Medium)` | Commit point — "you've committed" |
| Past threshold, on release | `Haptics.notificationAsync(Success)` | Reward — satisfying confirmation |

**Implementation:** Haptics must fire from the JS thread. Use `runOnJS` within `onUpdate` (for the first two) and `onEnd` (for the success notification). Track two boolean shared values (`didTickApproach`, `didTickCommit`) that reset to false in `onBegin`.

### Mount Timeline

```
0ms     Screen fades in (FadeIn.duration(600)), ambient glow visible
200ms   Series eyebrow fades in (opacity, 300ms)
500ms   Title letters begin scatter-in (~80ms stagger)
~1.5s   All letters placed → shimmer sweep across title (800ms)
~1.6s   Day counter fades in (opacity, 300ms)
~1.8s   Swipe prompt + dual chevrons appear
∞       Chevrons float, shimmer loops on prompt text every 3s
```

User can swipe at any point during the entrance sequence — animations never block gesture detection.

## What's NOT Changing

- Background: solid `colors.background`, no pattern overlays
- Ambient circle glow: existing `alpha(colors.accent, 0.06)`, ~80% screen width
- Safe area insets handling (paddingTop: insets.top, paddingBottom: insets.bottom)
- Accessibility label (updated to match new copy)
- `setLastRevealShownDate` logic on mount
- `setCurrentDevotional` + `router.replace` to reading screen
- Route params interface (devotionalId, dayNumber, seriesTitle, dayTitle, totalDays)

## File Changes

| File | Change |
|---|---|
| `src/app/reveal.tsx` | Major rewrite — scatter title, shimmer prompt, draggable gesture, haptics |
| `src/components/ShimmerText.tsx` | **New** — reusable shimmer text effect (MaskedView + LinearGradient) |
| `src/components/ScatterTitle.tsx` | **New** — extracts RevealChar + shuffleOrder into a reusable component (used by reveal screen only for now; welcome screen migration is a separate future task) |

## Dependencies

All dependencies are already in the project:
- `react-native-reanimated` (shared values, springs, withRepeat, withDelay)
- `react-native-gesture-handler` (Gesture.Pan with onBegin/onUpdate/onEnd)
- `expo-haptics` (selectionAsync, impactAsync, notificationAsync)
- `expo-linear-gradient` (for shimmer gradient)
- `@react-native-masked-view/masked-view` v0.3.2 (already installed — used for shimmer text)
- `phosphor-react-native` (CaretUp icon)

## Animation Constraints

- All springs critically-damped (no bounce/overshoot)
- Entrance sequence completes in <2s
- All shared value animations run on UI thread (60fps)
- Haptics fire via `runOnJS` (JS thread) — negligible latency for 3 events
- `prefers-reduced-motion`: skip scatter, skip shimmer, show static content immediately
