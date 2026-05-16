# Today Rive assets

Bundled assets:

- `today-wind-particles.riv`
  - Today state: unread.
  - Artboard: `Artboard`
  - State machine: `State Machine 1`
  - Numeric inputs used by the app: `lineThickness`, `opacity`, `particleCount`, `spawnRate`, `accentR`, `accentG`, `accentB`, `width`, `height`.
  - Rendered as the quiet/default ambient motion.
- `today-light-rays.riv`
  - Today state: reveal-ready.
  - Artboard: `Artboard`
  - State machine: `State Machine 1`
  - Numeric inputs used by the app: `lineThickness`, `opacity`, `particleCount`, `spawnRate`, `centerMaskRadius`, `centerMaskSoftness`, `accentR`, `accentG`, `accentB`, `width`, `height`.
  - Rendered directly (not through `MaskedView`), applies numeric inputs after the native view is ready, then uses a subtle native drift/pulse wrapper so the rays stay visibly alive.
- `today-rain-particles.riv`
  - Today states: complete-today and tomorrow-locked.
  - Artboard: `Artboard`
  - State machine: `State Machine 1`
  - Numeric inputs used by the app: `lineThickness`, `opacity`, `particleCount`, `spawnRate`, `accentR`, `accentG`, `accentB`, `width`, `height`.
  - Tomorrow-locked is intentionally quieter/slower than completed.

All three Rive files use the same direct-render integration path:

```ts
const TODAY_RIVE_SOURCES = {
  'wind-particles': require('../../../assets/rive/today-wind-particles.riv'),
  'light-rays': require('../../../assets/rive/today-light-rays.riv'),
  'rain-particles': require('../../../assets/rive/today-rain-particles.riv'),
}
```

Implementation notes:

- Keep decorative Rive under `AmbientArtCanvas`; do not put it inside semantic card/text components.
- Keep exactly one ambient slot active at a time.
- Gate rendering on screen focus, active app state, not Low Power Mode, and not Reduce Motion.
- Wait for `riveViewRef.awaitViewReady()` before setting inputs, then call `playIfNeeded()`/`play()`.
- Use `strings assets/rive/<file>.riv` to verify runtime names if the Rive authoring contract drifts.
