# Today Rive assets

Bundled assets:

- `today-wind-leaves.riv`
  - Today state: completed/rest ambience option (`complete-today`, `tomorrow-locked`, `journey-complete` after the person has read today).
  - Source handoff: `wind_v3_unfold.riv` from Desktop intake, SHA-256 `57aa5348b877a034845b10a567b627317233b7037087f5c56405842026ae63b8`, size `19,810` bytes.
  - Artboard-like string: `Unfold_leaf&wind_Animation`.
  - State machine: `State Machine 1`.
  - ViewModel string: `ViewModel1`.
  - Data color fields visible in strings: `background__color`, `glow_color`, `artwork_color`, `mask_gradient_start`, `mask_gradient_end`.
  - Script/numeric fields visible in strings: `accentR`, `accentG`, `accentB`, `width`, `height`, `particleCount`, `spawnRate`, etc.
  - Rendered through `TodayCompletionRive`, not directly in `AmbientArtCanvas`.
- `today-wind-particles.riv`, `today-light-rays.riv`, `today-rain-particles.riv`
  - Legacy bundled Today Rive experiments retained for reference, but not mapped into current production Today ambience.
  - Prior runtime finding: strings show names like `accentR`, `accentG`, `accentB`, `width`, and `height`, but React Native's legacy `RiveView.setNumberInputValue()` did not find those names as state-machine inputs at runtime.

Current production behavior:

```txt
Completed Today ambience slot
  options: EmberSystem | today-wind-leaves.riv
  selection: deterministic hash of devotional/day/date completion key
  pre-completion: no ambient Rive/embers
```

Implementation notes:

- Keep decorative Rive under `AmbientArtCanvas`; do not put it inside semantic card/text components.
- Keep exactly one ambient slot active at a time. Do not stack Rive on top of EmberSystem except during deliberate crossfade experiments.
- Gate rendering on screen focus, active app state, not Low Power Mode, and not Reduce Motion. Reduced Motion / Low Power currently falls back to EmberSystem's low-cost still path.
- Wait for `riveViewRef.awaitViewReady()`, then call `playIfNeeded()`/`play()`. Keep autoplay disabled so runtime values can be applied before playback.
- Prefer ViewModel data binding (`useViewModelInstance(..., { viewModelName: 'ViewModel1' })`) for `today-wind-leaves.riv`. Do not call legacy `RiveView.setNumberInputValue()` for the visible `accentR/G/B` strings unless the animator explicitly exports them as state-machine inputs; previous files logged missing-input warnings despite the strings existing in the binary.
- Runtime-proof color binding with extreme red/blue and real accent values before claiming app theme colors work visually.
- Use `strings assets/rive/<file>.riv` to verify runtime names if the Rive authoring contract drifts.
