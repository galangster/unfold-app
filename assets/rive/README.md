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
  - Each file exposes `accentR`, `accentG`, and `accentB` in strings; some also expose generic `color` / `Color` fields.

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
- **MEASURED runtime contract (today-wind-leaves.riv, on-device 2026-06-16):** the file
  exposes exactly ONE ViewModel (`ViewModel1`) with exactly 5 **color** properties and
  ZERO number properties: `background__color`, `glow_color`, `artwork_color`,
  `mask_gradient_start`, `mask_gradient_end`. The leaves/lines are drawn by an embedded
  Rive script with a **baked** color; `accentR/G/B` are script-internal constants and are
  **not** bindable (not as data-bind numbers, not as state-machine inputs). Measured
  slot → element map:
  - `background__color` → full-canvas fill → **the accent "wash"**. App keeps it `#00000000`.
  - `mask_gradient_start/end` → text-protection gradient. App sets neutral surface (follows light/dark), never the accent.
  - `glow_color` → bottom glow; `artwork_color` → diffuse haze. App keeps these off.
- **To make the leaves/lines follow the accent, the `.riv` must be re-exported** with the
  leaf/line paint bound to a ViewModel **color** property named `accent_color` (canonical)
  — see `assets/rive/RIVE_ACCENT_CONTRACT.md` for the full animator spec. `buildRiveThemeValues`
  already sets `accent_color`/`leaf_color`/`line_color` to the user accent, so the leaves
  light up with zero code changes once the new file lands.
- `TodayCompletionRive` applies the color properties in `RIVE_ACCENT_COLOR_PROPERTIES` and
  (forward-compat) the `accentR/G/B` numbers; properties a file doesn't expose are skipped
  quietly, so one wrapper covers current and future animator exports.
- Light mode darkens the leaf/line accent slightly (`darken(accent, 0.06)`) so it keeps
  contrast on paper; the app keeps the background transparent in both modes.
- Avoid high-alpha app-side overrides on `background__color`/`mask_gradient_*`. Those are the
  "atmosphere" the app keeps neutral; tinting them is what produced the rejected wash.
- Runtime-proof theme interactions across all production accents in both dark and light mode before declaring the visual final.
- Use a red/blue extreme probe or full accent matrix if a future animator file changes the exposed ViewModel contract.
- Use `strings assets/rive/<file>.riv` to verify runtime names if the Rive authoring contract drifts.
