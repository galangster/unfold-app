# Today Rive assets

Bundled assets:

- `today-wind-particles.riv`
  - Today state: unread.
  - Artboard: `Artboard`
  - State machine: `State Machine 1`
  - Runtime inputs used by the app today: none. The current file renders as a self-contained white loop.
  - Rendered as the quiet/default ambient motion.
- `today-light-rays.riv`
  - Today state: reveal-ready.
  - Artboard: `Artboard`
  - State machine: `State Machine 1`
  - Runtime inputs used by the app today: none. The current file renders as a self-contained white loop.
  - Rendered directly (not through `MaskedView`) with a subtle native drift/pulse wrapper so the rays stay visibly alive.
- `today-rain-particles.riv`
  - Today states: complete-today, tomorrow-locked, and journey-complete after the person has read today.
  - Artboard: `Artboard`
  - State machine: `State Machine 1`
  - Runtime inputs used by the app today: none. The current file renders as a self-contained white loop.
  - Tomorrow-locked currently shares the same white loop until the updated controllable-color asset arrives.

Note: `strings assets/rive/<file>.riv` shows names like `accentR`, `accentG`, `accentB`, `width`, and `height`, but React Native's `RiveView.setNumberInputValue()` does not currently find those names as state-machine inputs at runtime. Until the animator returns files with real runtime color controls, the app intentionally passes an empty input object so screenshots and logs stay clean.

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
- Wait for `riveViewRef.awaitViewReady()`, then call `playIfNeeded()`/`play()`. Keep autoplay disabled so future controllable-color files can receive app inputs before playback.
- Use `strings assets/rive/<file>.riv` to verify runtime names if the Rive authoring contract drifts.
