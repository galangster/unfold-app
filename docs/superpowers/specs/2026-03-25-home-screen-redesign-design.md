# Home Screen Redesign — Design Spec

**Date:** 2026-03-25
**Goal:** Consolidate the home screen from 10+ conditional vertical components into 6 fixed zones with an ambient art background layer, making the experience feel like art — beautiful, minimal, alive.
**Inspired by:** Endel (ambient motion), Linear (snappy UI), Callie (emotionally-sensitive Skia animation)

---

## 1. Problem Statement

The current home screen (`src/app/(tabs)/(today)/index.tsx`, ~1600 lines) stacks 10+ conditional components vertically in a ScrollView. The result:

- **The hero devotional card gets pushed down** behind DailyBridge, RememberThisCard, notification cards, and ResumeCard
- **Visual clutter** — 10+ components compete for attention, most conditional and unpredictable in ordering
- **No ambient life** — the background is flat `#0A0A0A` (dark) or `#FAF7F2` (light) with no motion
- **Inconsistent card sizing** — no intentional hierarchy based on user behavior frequency

### Current Render Order (ScrollView)

```
Header (greeting + avatar)
├── DailyBridge card (conditional)
├── RememberThisCard (conditional — if highlights exist)
├── MidDay check-in card (conditional — 12pm-5pm)
├── Evening wind-down card (conditional — 5pm-11:30pm)
├── ResumeCard (conditional — if paused reading)
├── Hero Journey Card (~200 lines, complex conditionals)
├── YourSeriesSection (vertical list of series)
├── Day1ReviewCard (conditional)
├── StreakBox (always shown)
└── PremiumNudgeCard (conditional)
```

---

## 2. Architecture: Two-Layer System

### Layer 0: Ambient Art Canvas (Skia — GPU only)

A single `<Canvas>` from `@shopify/react-native-skia` covers the full screen behind all UI content. It renders GPU-accelerated ambient art using SkSL shaders and Skia primitives. This layer:

- Runs entirely on the GPU (zero JS thread cost)
- Is `pointerEvents="none"` and `accessibilityElementsHidden`
- Derives all colors from `useTheme().colors.accent`
- Respects `prefers-reduced-motion` (renders nothing when enabled)
- Responds to device tilt for subtle parallax (2-8px) via `expo-sensors` Gyroscope or Reanimated's `useAnimatedSensor` (verify v4 availability at implementation time; fallback to `expo-sensors` + shared value bridge if deprecated)

### Layer 1: Content ScrollView (Reanimated)

The reorganized UI content with 6 fixed zones. Each zone has intentional sizing, staggered entrance animations, and scroll-driven effects.

```
┌─────────────────────────────────┐
│ Layer 0: Skia Canvas            │
│ ┌─────────────────────────────┐ │
│ │ Concentric Rings Shader     │ │
│ │ Organic Noise Field         │ │
│ │ Accent Glow Gradient        │ │
│ │ Gold Ember Particles (Atlas)│ │
│ └─────────────────────────────┘ │
│                                 │
│ Layer 1: ScrollView (on top)    │
│ ┌─────────────────────────────┐ │
│ │ Zone 1: Greeting + Avatar   │ │
│ │ Zone 2: Context Slot        │ │
│ │ Zone 3: Hero Devotional     │ │
│ │ Zone 4: Quick Actions Row   │ │
│ │ Zone 5: Your Series         │ │
│ │ Zone 6: Streak + Nudge      │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

---

## 3. Ambient Art Layer — Components

### 3.1 AmbientArtCanvas (new)

**File:** `src/components/home/AmbientArtCanvas.tsx`

A single Skia `<Canvas>` with layered `<Group>` elements. Driven by one shared `time` value from Reanimated that loops continuously.

```tsx
// Pseudocode structure
<Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
  <Group opacity={0.03}>
    <ConcentricRingsShader time={time} accent={accentRgb} />
  </Group>
  <Group opacity={0.02}>
    <OrganicNoiseField time={time} accent={accentRgb} />
  </Group>
  <AccentGlowGradient accent={accentRgb} />
  <EmberAtlas particles={particles} accent={accentRgb} />
</Canvas>
```

**Time driver:**
```tsx
const time = useSharedValue(0);
useEffect(() => {
  time.value = withRepeat(
    withTiming(Math.PI * 200, { duration: 600000, easing: Easing.linear }),
    -1, false
  );
}, []);
```

**Device tilt parallax:**

Option A (if `useAnimatedSensor` exists in Reanimated v4.2.1):
```tsx
const sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });
const tiltStyle = useAnimatedStyle(() => ({
  transform: [
    { translateX: sensor.sensor.value.roll * 6 },
    { translateY: sensor.sensor.value.pitch * 6 },
  ],
}));
```

Option B (fallback — `expo-sensors` Gyroscope + shared value bridge):
```tsx
import { Gyroscope } from 'expo-sensors';
// Subscribe to gyroscope, write pitch/roll to shared values via scheduleOnUI
```

**Note:** `expo-sensors` is NOT currently installed. If Option A is unavailable, add `expo-sensors` to dependencies.

**Reanimated ↔ Skia bridging:** Pass Reanimated shared values directly as Skia `<Shader>` uniform props — `@shopify/react-native-skia` 2.x supports this natively via `useDerivedValue`:
```tsx
const uniforms = useDerivedValue(() => ({
  iTime: time.value,
  iResolution: [width, height],
  accentColor: [r, g, b], // decomposed from hex
}));

<Fill>
  <Shader source={runtimeEffect} uniforms={uniforms} />
</Fill>
```

### 3.2 ConcentricRingsShader (new — SkSL RuntimeEffect)

**File:** `src/components/home/shaders/concentric-rings.ts`

GPU-computed concentric rings that breathe and slowly rotate. The Endel signature effect.

**Parameters:**
- Ring sets: 3-5 overlapping at different scales
- Speed: 0.1-0.5 radians/second (barely perceptible)
- Max opacity: 3-4%
- Breathing cycle: 5-8 seconds
- Ring thickness: thin lines via `smoothstep` with tight range
- Full rotation: 60-second cycle

**SkSL source:**
```glsl
// SkSL syntax (Skia's shader language — uses half4/float2, not vec4/vec2)
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
```

### 3.3 OrganicNoiseField (new — SkSL RuntimeEffect)

**File:** `src/components/home/shaders/organic-noise.ts`

Domain-warped Fractal Brownian Motion creates flowing, cloud-like patterns. Extremely subtle (2-3% opacity).

**Parameters:**
- Noise scale: 3.0
- Evolution speed: 0.1x
- Max opacity: 2-3%
- Domain warping: noise fed into itself for organic flow

### 3.4 EmberAtlas (evolution of GoldEmberField)

**File:** `src/components/home/EmberAtlas.tsx`

Migrate `GoldEmberField` from 70 individual `Animated.View` particles to Skia's `<Atlas>` component for a single batched draw call.

**Current:** 70 views = 70 draw calls
**Proposed:** 1 Atlas = 1 draw call (70x reduction)

Keep existing:
- Streak-reactive tier system (18-70 particles)
- Theme-aware color derivation (lighten/darken from accent)
- Self-looping animation pattern
- `reducedMotion` guard

Change:
- Replace `Animated.View` per particle with Atlas `sprites` + `transforms`
- Replace `expo-linear-gradient` glow with Skia `RadialGradient`

**Sprite generation:** Create a small off-screen Skia `<Canvas>` at init time that draws a single soft circle (RadialGradient from accent→transparent, ~16x16px). Capture it as an `SkImage` via `makeImageFromView` or draw directly into the Atlas sprite sheet. All 18-70 particles reference this single sprite with per-particle transforms (position, scale, opacity). The Atlas `transforms` array updates each frame via a Reanimated `useDerivedValue`.

### 3.5 Edge Fade Mask

The ambient art fades to transparent at the top and bottom edges so it doesn't abruptly clip:

```tsx
<Mask mask={
  <Rect x={0} y={0} width={width} height={height}>
    <LinearGradient
      start={vec(0, 0)}
      end={vec(0, height)}
      colors={['transparent', 'white', 'white', 'transparent']}
      positions={[0, 0.1, 0.85, 1]}
    />
  </Rect>
}>
  {/* All ambient art layers */}
</Mask>
```

---

## 4. Zone Layout — Content Layer

### Zone 1: Greeting + Check-in (top, compact)

**What:** Time-aware greeting ("Good morning", etc.) + profile avatar
**Size:** Single row, 48px height
**Animation:** Staggered FadeIn (greeting text 0ms, avatar 80ms)
**Interaction:** Avatar tap → You tab

**Keep from current:** `getGreeting()`, `ProfileAvatar`
**Remove:** The greeting no longer needs to be a separate animated text block — integrate into a clean single row.

### Zone 2: Context Slot (single rotating card)

**What:** One contextual card at a time, chosen by priority
**Size:** Medium card (~100px height), full width with `Spacing['4']` horizontal padding
**Animation:** Cards swap with a crossfade (FadeOut 180ms → FadeIn 250ms)

**Priority system (highest wins):**
1. **ResumeCard** — if user has paused reading in progress
2. **Evening Wind-Down** — if 5pm-11:30pm and today's reading is complete
3. **Midday Check-In** — if 12pm-5pm and today's reading is incomplete
4. **DailyBridge** — AI-generated thematic bridge (default fallback)
5. **DailyBridge (shimmer loading)** — While AI bridge text is generating, show a skeleton shimmer card (same ~100px height). Transitions to the full DailyBridge card when text arrives.
6. **Nothing** — slot collapses to 0 height with a `withTiming` layout animation (250ms, ease-out). Zones below shift up smoothly.

**Key change:** Only ONE card at a time (not stacked). Current home can show DailyBridge + ResumeCard + MidDay card simultaneously. This eliminates that.

**Collapse behavior:** When no context card applies, the slot animates its `height` shared value from ~100px to 0 over 250ms. Zone 3 and below translate up to fill the gap. This prevents a jarring layout jump.

### Zone 3: Hero Devotional Card (primary action — largest card)

**What:** Today's devotional — the single most important element
**Size:** Large card (~220px height), full width
**Animation:**
- Entrance: `FadeIn.duration(280).delay(160)` with scale from 0.97 → 1.0
- Press feedback: `withSpring` scale to 0.97 (duration: 150, dampingRatio: 1)
- Scroll parallax: Card moves at 0.95x scroll speed (subtle depth)
- Shared element transition: Card image/title morphs into reading screen header

**States (same card, different content):**
1. **Empty / first-time** — No series exists yet. Show a warm welcome card: "Start your first devotional" CTA with onboarding link. Uses the same card dimensions so the layout doesn't shift once a series is created.
2. **Preparing** — Series exists but today's devotional is still being generated (progressive generation). Show skeleton shimmer with "Preparing your devotional..." label and a subtle pulsing animation. Auto-transitions to "Unread today" when generation completes via store subscription.
3. **Unread today** — "Begin Day X" CTA, reading time estimate, study method chip
4. **In progress** — Progress bar (existing AnimatedProgressBar), "Continue" CTA
5. **Complete today** — Checkmark, "Read Again" secondary CTA, accent glow intensifies
6. **Tomorrow locked** — Muted, lock icon, "Unlocks tomorrow at midnight"
7. **Journey complete** — Entire series finished. Celebratory state: "You finished [Series Name]!" with confetti accent, "Start a new series" CTA, and option to revisit past days.

**Keep from current:** AnimatedProgressBar (with shimmer), progress calculation, navigation to reading
**Remove:** The complex conditional rendering across 200+ lines. Replace with a single `DevotionalCard` component that accepts a `state` prop.

### Zone 4: Quick Actions Row (horizontal pills)

**What:** 3-4 quick-tap actions in a horizontal row
**Size:** Compact row, ~56px height
**Animation:** Staggered entrance (each pill delays 60ms after previous)

**Actions:**
- Journal (pen icon) → Journal tab
- Companion (chat icon) → Ask tab
- Bible (book icon) → Bible reader
- RememberThis (optional 4th — if highlights exist, shows as a pill rather than a full card)

**Key change:** `RememberThisCard` demotes from a full card to a small pill in this row. Tapping it opens the same reading screen with highlight scroll target.

### Zone 5: Your Series (horizontal scroll)

**What:** User's devotional series in a horizontal scrollable carousel
**Size:** Horizontal scroll area, ~160px height
**Animation:**
- Entrance: Staggered FadeInRight (each card delays 80ms)
- Scroll: Slight scale reduction on cards far from center (0.97 → 1.0)

**Keep from current:** `YourSeriesSection` data logic (deduplicated, sorted by createdAt)
**Change:** Transform from vertical list to horizontal scroll cards. Each card shows: title, "Day X of Y", mini progress bar.

"See All" link if 4+ series → navigates to full series list.

**Single-series behavior:** When the user has only one series, skip the carousel entirely. Zone 5 collapses (same 250ms layout animation as Zone 2). The single series is already represented by the Hero Devotional Card in Zone 3. Zone 5 becomes relevant once the user creates a second series.

### Zone 6: Streak + Companion (bottom, compact)

**What:** Streak display (compact) + optional companion nudge
**Size:** Compact row + optional small card below
**Animation:** FadeIn with longest delay (appears last in stagger sequence)

**StreakBox changes:**
- Shrink from current large card to a compact inline display
- Keep: streak count, flame icon, freeze dots
- Remove: the large motivational copy and tier display (move to streak-settings deep screen)

**PremiumNudge changes:**
- Move from mid-scroll position to bottom (low priority, discovery-oriented)
- Show as a subtle text link or small card, not a prominent card competing with devotional

**AudioPlayerBar clearance:** The global `AudioPlayerBar` renders in the root layout above the tab bar. When audio is playing, Zone 6 needs additional bottom padding (~60px) to prevent content from hiding behind the player bar. Use the existing `useGlobalAudioPlayer().isPlaying` to conditionally add padding.

---

## 5. Animation Standards

### Spring Configurations (Critically-Damped Only)

These extend the existing `src/constants/animations.ts`:

```tsx
// Duration-based spring (Reanimated v4 style)
export const SpringConfig = {
  /** Button press, micro-interactions */
  quick: { duration: 150, dampingRatio: 1 },
  /** Card transitions, standard UI */
  standard: { duration: 280, dampingRatio: 1 },
  /** Sheets, modals, large elements */
  smooth: { duration: 340, dampingRatio: 1 },
} as const;

// Physics-based spring (keep existing for backwards compat)
// Spring.press, Spring.gentle, Spring.snappy from animations.ts
```

### Easing by Interaction Type

| Interaction | Easing | Duration | Notes |
|---|---|---|---|
| Card appearing | `Easing.out(Easing.cubic)` | 250-280ms | Decelerates into view |
| Card disappearing | `Easing.in(Easing.cubic)` | 180-220ms | Exits faster than enters |
| Card press feedback | `withSpring, dampingRatio: 1` | 150ms | Immediate response |
| Context slot swap | Crossfade | 180ms out, 250ms in | Old card fades, new appears |
| Ambient breathing | `Easing.inOut(Easing.sin)` | 3000-8000ms | Natural sine wave |
| Ambient rotation | `Easing.linear` | 60000ms | Constant, imperceptible |
| Particle float | `Easing.linear` | 7000-12000ms | Self-looping |

### Stagger Delays

| Element | Delay between items |
|---|---|
| Zone entrance (zone-to-zone) | 80ms |
| Quick action pills | 60ms |
| Series cards (horizontal) | 80ms |
| Zone 1 elements (greeting/avatar) | 80ms |

### Scroll-Driven Effects

```tsx
const scrollY = useSharedValue(0);
const scrollHandler = useAnimatedScrollHandler({
  onScroll: (event) => { scrollY.value = event.contentOffset.y; },
});

// Hero card parallax (moves 5% slower than scroll)
const heroStyle = useAnimatedStyle(() => ({
  transform: [{ translateY: scrollY.value * 0.05 }],
}));

// Ambient art opacity reduces as user scrolls deep
const ambientOpacity = useAnimatedStyle(() => ({
  opacity: interpolate(scrollY.value, [0, 400], [1, 0.3], Extrapolation.CLAMP),
}));
```

---

## 6. What Gets Removed or Relocated

| Current Component | Destination | Rationale |
|---|---|---|
| `DailyBridge` | Zone 2 context slot (lowest priority) | Still shows, but yields to higher-priority cards |
| `RememberThisCard` | Zone 4 pill (if highlights exist) | Demoted from full card — low daily frequency |
| `MidDay check-in card` | Zone 2 context slot | Time-gated, single slot |
| `Evening wind-down card` | Zone 2 context slot | Time-gated, single slot |
| `ResumeCard` | Zone 2 context slot (highest priority) | Most actionable — gets first slot |
| `YourSeriesSection` | Zone 5 horizontal scroll | Layout change from vertical to horizontal |
| `Day1ReviewCard` | Move to reading flow (post-completion) | Not a home screen concern |
| `StreakBox` | Zone 6 (compact) | Shrink, move to bottom |
| `PremiumNudgeCard` | Zone 6 (subtle) or paywall sheet | Deprioritize on home screen |
| `HomeOnboardingTooltips` | Keep (runs once for first-time users) | Still needed, retarget to new zones |

---

## 7. Performance Budget

| Component | Budget | Thread |
|---|---|---|
| Concentric rings shader | <2ms/frame | GPU |
| Organic noise shader | <1ms/frame | GPU |
| Ember Atlas draw | <0.5ms/frame | GPU |
| Device tilt sensor | <0.5ms/frame | UI thread |
| UI card animations | <4ms/frame | UI thread |
| **Total animation cost** | **<8ms/frame** | **Target: 60fps (16.67ms budget)** |

### Battery Mitigation

- Pause ambient canvas when app is backgrounded (`AppState` listener)
- Pause when tab is not focused (`useFocusEffect`)
- Ambient shaders target 30fps if device is in Low Power Mode
- `prefers-reduced-motion` → render no ambient art at all

---

## 8. Accessibility

- Ambient canvas: `pointerEvents="none"`, `accessibilityElementsHidden={true}`
- All interactive zones maintain WCAG AA contrast ratios (ambient art is purely decorative, below perception threshold)
- `useAccessibleAnimation()` hook gates all ambient components
- All cards maintain proper `accessibilityRole="button"` and `accessibilityLabel`
- Stagger animations respect `ReducedMotionConfig` — show content immediately without delay

---

## 9. Light Mode Considerations

The ambient art must adapt to light mode (`#FAF7F2` background):

- Shader colors: Use `darken(accent, 0.15)` instead of `lighten(accent, 0.1)`
- Ring opacity: Reduce to 2-3% (bright backgrounds need less)
- Noise opacity: Reduce to 1-2%
- Ember colors: Already handled by existing `GoldEmberField` dark/light logic
- Edge fade mask: Inverted gradient (fade to `#FAF7F2` instead of `#0A0A0A`)

**Light mode contrast fix (existing bug F1):** `buttonBackground` at 5% opacity and `textMuted` at 62% are both too low for light mode. This redesign addresses it by:
- Increasing `buttonBackground` to `rgba(28, 23, 16, 0.08)` minimum
- Increasing `textMuted` to `rgba(28, 23, 16, 0.68)` minimum

---

## 10. File Structure

```
src/components/home/
├── AmbientArtCanvas.tsx          (new — Skia canvas with all ambient layers)
├── shaders/
│   ├── concentric-rings.ts       (new — SkSL shader source)
│   └── organic-noise.ts          (new — SkSL shader source)
├── EmberAtlas.tsx                 (new — Skia Atlas replacement for GoldEmberField)
├── DevotionalCard.tsx             (new — single card with state prop)
├── ContextSlot.tsx                (new — priority-based card rotation)
├── QuickActionsRow.tsx            (new — horizontal pill actions)
├── SeriesCarousel.tsx             (refactored from YourSeriesSection)
├── CompactStreakRow.tsx           (refactored from StreakBox)
└── RememberThisCard.tsx           (keep — but render as pill in QuickActionsRow)
```

**Modified files:**
- `src/app/(tabs)/(today)/index.tsx` — rewrite render tree, reduce from ~1400 to ~300 lines
- `src/constants/animations.ts` — add `SpringConfig` duration-based presets and ambient timing constants
- `src/constants/colors.ts` — fix light mode contrast values

**Deprecated (delete after migration):**
- `src/components/GoldEmberField.tsx` → replaced by `EmberAtlas.tsx`

**Keep as-is:**
- `src/components/AccentGlow.tsx` — still used as card wrapper
- `src/components/CompanionOrb.tsx` — used on Companion screen, not home
- `src/components/StreakCelebration.tsx` — triggered on streak milestones, overlays on top of home
- `src/components/CheckInSheet.tsx` — bottom sheet, triggered by context slot cards (midday/evening check-in)
- `src/components/PremiumFeatureSheet.tsx` — bottom sheet, triggered by premium gating logic
- `src/components/HomeOnboardingTooltips.tsx` — first-time tooltip sequence, retargeted to new zones

---

## 11. Dependencies

**Already installed:**
- `@shopify/react-native-skia` v2.4.18
- `react-native-reanimated` (v4.x)
- `react-native-gesture-handler`

**Not installed (may be needed):**
- `expo-sensors` — Only needed if Reanimated's `useAnimatedSensor` is unavailable in v4. Check at implementation time. If needed: `npx expo install expo-sensors` (no native rebuild required — Expo Config Plugin).

**Note:** `@shopify/react-native-skia` is already in the project. No new native dependencies are required for the core ambient art layer.

---

## 12. Success Criteria

1. The home screen feels alive — ambient art moves slowly, breathes, responds to device tilt
2. The hero devotional card is always visible within the first scroll viewport (no pushing down)
3. Context-aware cards rotate in a single slot — never stacking vertically
4. All UI animations run at 60fps during scrolling
5. Ambient art runs at 60fps (or 30fps on low-power) without blocking JS thread
6. Light mode has proper contrast and adapted ambient art colors
7. `prefers-reduced-motion` users see a static, clean layout with no ambient art
8. Total home screen file reduced from ~1600 lines to ~300 lines via component extraction
9. Battery impact target: <2% increase during a 30-minute session (to be validated via Xcode Energy Gauge during implementation)

---

## 13. Implementation Phasing

This redesign should be implemented in 3 phases to minimize risk and allow visual verification at each stage.

### Phase 1: Zone Extraction (structural)
- Extract all 6 zones into their own component files
- Rewrite `index.tsx` render tree to use the new zone components
- Implement Context Slot priority system
- Implement DevotionalCard state machine (all 7 states)
- Implement SeriesCarousel horizontal scroll
- Implement CompactStreakRow
- Implement QuickActionsRow
- Fix light mode contrast values in `colors.ts`
- **Gate:** Home screen renders identically to current (same content, new structure), build passes, visual regression confirmed

### Phase 2: Ambient Art Layer
- Create `AmbientArtCanvas.tsx` with Skia Canvas
- Implement `ConcentricRingsShader` (SkSL)
- Implement `OrganicNoiseField` (SkSL)
- Migrate `GoldEmberField` → `EmberAtlas` (Skia Atlas)
- Add edge fade mask
- Add `reducedMotion` / accessibility guards
- Add `AppState` + `useFocusEffect` pause/resume
- **Gate:** Ambient art visible behind content, 60fps confirmed via Perf Monitor, reduced-motion users see no art

### Phase 3: Animation Polish
- Add staggered zone entrance animations
- Add scroll-driven parallax and opacity effects
- Add device tilt parallax (Option A or B)
- Add Context Slot crossfade transition
- Add card press feedback springs
- Tune all timing values against real device feel
- Add `SpringConfig` duration-based presets to `animations.ts`
- **Gate:** All animations feel natural, no jank on scroll, battery impact within target
