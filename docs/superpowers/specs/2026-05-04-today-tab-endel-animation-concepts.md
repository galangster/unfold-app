# Today Tab Animation Concepts — Endel-inspired

Date: 2026-05-04
Scope: Unfold Today tab motion direction for a calm, devotional, adaptive-feeling home surface.

## Motion principles

- Calm, not gamified: motion should feel like breath, candlelight, sunrise, or ink settling.
- Critically damped only: no bounce. Use gentle ease-out or spring configs with no overshoot.
- Ambient first, reactive second: default state should be almost still; user actions can briefly brighten or gather motion.
- Accessible by default: honor reduced motion by replacing loops with static gradients/embers and short opacity changes.
- Battery-aware: prefer native/Reanimated/Skia lightweight loops over Lottie-heavy continuous animation; pause offscreen.

## Concept 1 — Sacred Dawn Field

A slow radial dawn glow sits behind the Today hero. It subtly shifts from deep plum/brown to warm gold as the reading becomes available, complete, or tomorrow-locked.

### States

- New day / unread: soft center glow behind Today reading CTA, 20-30s drift loop.
- In progress: glow narrows toward the current reading card, like attention focusing.
- Completed: glow settles lower and warmer; add faint ember ring around the completion mark.
- Tomorrow locked: glow fades to a quiet horizon band; no celebratory pulse.

### Implementation

- Preferred native: `react-native-skia` radial/linear gradients plus `react-native-reanimated` shared values.
- Rive option: one artboard with `state` number input (`0=unread`, `1=inProgress`, `2=complete`, `3=tomorrowLocked`) and `intensity` input (`0..1`).
- Keep loop under 30fps-equivalent; animate only gradient center/opacity, not layout.
- Reduced motion: render static gradient based on state.

## Concept 2 — Breath Ring / Rhythm Halo

A very thin halo around the daily reading card expands and contracts like slow breathing. It implies presence and rhythm without calling attention to itself.

### States

- Unread: 8-second inhale/exhale opacity + scale loop at 4-8% opacity.
- Loading/generating: halo tightens into a slow orbiting segment.
- Complete: halo closes into a full stable ring for 800ms, then becomes static.

### Implementation

- Preferred native: Skia `Circle`/`Path` stroke with Reanimated-driven opacity and stroke dash offset.
- Rive option: vector ring with `progress`, `isGenerating`, and `isComplete` inputs.
- Avoid continuous scale of the actual card; animate only the decorative stroke layer.
- Reduced motion: static accent border/ring.

## Concept 3 — Ember Constellation

Tiny gold dust/ember points drift behind the hero and occasionally align into a subtle cross/branch/seed shape when the user completes a reading.

### States

- Unread: sparse drifting particles, nearly imperceptible.
- Complete: particles gather once into a soft constellation, then disperse/freeze.
- Streak milestones: slightly denser particles for 1.2s, no confetti explosion.

### Implementation

- Preferred native: Skia particle field using deterministic seeded positions so screenshots are stable.
- Rive option: particle-like vector dots on a fixed timeline with `completeTrigger` fire input.
- Keep particle count low (12-24) and opacity low (0.08-0.22).
- Pause when Today tab is not focused.
- Reduced motion: static sparse dots.

## Concept 4 — Scripture Ink Reveal

Supporting text on Today appears as if ink is gently resolving onto paper: a masked opacity/blur reveal, not a typewriter.

### States

- First load: card title and scripture reference reveal over 500-700ms.
- Daily reading ready after generation: scripture reference resolves first, CTA second.
- Error/retry: no flourish; use direct opacity so error states feel clear and trustworthy.

### Implementation

- Preferred native: Reanimated opacity + slight translateY + blur/gradient mask if performant.
- Rive option: text should remain native for accessibility; use Rive only as the mask/background accent, not the text itself.
- Reduced motion: direct opacity fade under 150ms.

## Concept 5 — Endel-style Adaptive Soundless “Focus Mode”

Today hero subtly adapts to time-of-day without promising actual audio: morning is lifted/warm, evening is dimmer/slower, overdue is quiet and grounded.

### States

- Morning: higher glow center, slightly brighter gold.
- Afternoon: balanced center, neutral warmth.
- Evening: lower horizon glow, slower breath loop.
- Overdue: motion nearly stops; CTA remains clear, not shamey.

### Implementation

- Use existing Today state helpers to derive `timeMood` separately from devotional completion state.
- Native: theme tokens + Reanimated shared values.
- Rive: `timeMood` enum input and `completionState` enum input.
- Never let ambient mood override business-state copy, routing, or accessibility labels.

## Recommended first build

Ship Concepts 1 + 2 only:

1. `SacredDawnField` component behind Today hero.
2. `BreathHalo` component around the primary devotional card/CTA.
3. State inputs: `unread`, `inProgress`, `complete`, `tomorrowLocked`, `overdue`.
4. Runtime controls: reduced motion, tab focus pause, app background pause.
5. QA route params: `todayState=unread|complete|tomorrow-locked|overdue` and `motion=on|reduced`.

This gives the Endel feeling with the lowest risk: calm adaptive ambience, no heavy asset pipeline, no text accessibility loss, and no motion that can be mistaken for a loading spinner.

## Rive handoff notes

If John/art team builds this in Rive:

- Use one artboard per ambient system, not one per state.
- Inputs:
  - `state: number` (`0 unread`, `1 inProgress`, `2 complete`, `3 tomorrowLocked`, `4 overdue`)
  - `timeMood: number` (`0 morning`, `1 afternoon`, `2 evening`)
  - `intensity: number` (`0..1`)
  - `completeTrigger: trigger`
  - `reduceMotion: boolean`
- Export vector-only where possible; avoid embedded bitmap textures for the looping background.
- Keep loop seamless at 20-30 seconds.
- Provide a static poster frame for reduced motion and low-power fallback.

## Native engineering checklist

- Keep animation layers decorative: `pointerEvents="none"`, hidden from accessibility tree.
- Use `useIsFocused()` / app state to pause loops offscreen/backgrounded.
- Use `useReducedMotion()` to disable loops.
- Add tests for state mapping only; do not snapshot animation frames.
- Verify Today state semantics stay distinct: completed copy must not leak into tomorrow-locked or overdue states.
