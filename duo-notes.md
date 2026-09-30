# iPhone Duo redesign notes
Journey: Today → day menu → devotional reading → reflection; series book; evening wind-down; Ask
Stack: Expo 57, React Native 0.86, JS tab bar and headers; iOS 16.4 target; local Xcode 27.0, no Duo simulator; EAS default image uses the iOS 26 SDK
Stage: 4  Next: build the facing-page reader, book spread, two-page Today and wind-down, docked Ask history, then verify

## Findings
- Build: the iOS 26 SDK build shows Unfold letterboxed on the open Duo — Change (release): build with Xcode 27.1 once its RC ships [T461]
- Bars: the tab bar and every header are JavaScript views, so none can go vertical — Decision: keep them now; native tabs and stack headers are engineer work [T462]
- Layout source: live window size and safe areas, no idiom, orientation or UIScreen checks — Ready [T461, HIG]
- Resizability: ten files read the window size once at module scope and go stale on open or close — Change [T461]
- Outer display: screens pad both side insets, but the journal button, note dock, audio pill and ambient controls do not — Change [HIG, T461]
- Inner display: every screen is one centered column across 951pt — Change: pair content [HIG, T466]
- Fold: Today's 1.35:1 split puts the devotional card across the midline — Change [HIG, T463]
- Tab bar and JS sheets center across the midline — Decision: keep the flat-state layout until the fold is observable from JavaScript [T463]
- Arrangements, reserved regions, hinge: iOS 27.1 native APIs with no React Native bridge — Decision: 40pt gutter on the window midline [T463]
- N/A: camera, multiwindow (single scene), games

## Decisions
- Open display: facing pages in the reader, open-book spread for a series, two pages for Today and the wind-down, docked history in Ask: recommended; chosen (agent, 2026-09-30) — Nick asked for a one-shot; extends the facing-page direction accepted 2026-09-14
- Tall regular window: reading above, reflection below: chosen (agent, 2026-09-30) — the seated pose without pose detection
- Fold handling: equal panes around a 40pt midline gutter: chosen (agent, 2026-09-30) — provisional until reserved regions reach JavaScript
- Outer landscape and tent stance: not now (agent, 2026-09-30) — needs landscape on every iPhone
- Standing: "Stay with this prayer" session: chosen (agent, 2026-09-30) — accepted 2026-09-14 direction

## Done / verified
- apple-hig 2026-09-27 and /duo installed; /duo ran — verified
- Pane geometry for Duo, iPad and phone windows — unit tests
