# iPhone Duo redesign notes
Journey: Today → day menu → devotional reading → reflection; series book; evening wind-down; Ask
Stack: Expo 57, React Native 0.86, JS tab bar and headers; iOS 16.4 target; local Xcode 27.0, no Duo simulator; EAS default image uses the iOS 26 SDK
Stage: 5  Next: build with the Xcode 27.1 RC image, then run the Stage 5 checks in the Device Hub iPhone Duo simulator

## Findings
- Build: the iOS 26 SDK build shows Unfold letterboxed on the open Duo — Change (release): build with Xcode 27.1 once its RC ships [T461]
- Bars: the tab bar and every header are JavaScript views, so none can go vertical — Decision: keep them now; native tabs and stack headers are engineer work [T462]
- Layout source: live window size and safe areas, no idiom, orientation or UIScreen checks — Ready [T461, HIG]
- Resizability: views that read the window once at module scope now read it live — Done [T461]
- Outer display: the journal button, note dock, audio pill and ambient controls now clear both side insets — Done [HIG, T461]
- Inner display: facing pages replace one column stretched across 951pt — Done [HIG, T466]
- Fold: Today, You, the series book, the wind-down, Ask and the reader meet on the midline gutter — Done [HIG, T463]
- Tab bar, JS sheets and reader toasts still center across the midline — Decision: flat-state layout until the fold reaches JavaScript [T463]
- Arrangements, reserved regions, hinge: iOS 27.1 native APIs with no React Native bridge — Decision: 40pt gutter on the window midline [T463]
- N/A: camera, multiwindow (single scene), games

## Decisions
- Open display: facing pages in the reader, open-book series spread, two pages for Today, You and the wind-down, docked Ask history that can hide: chosen (agent, 2026-09-30) — extends the facing-page direction accepted 2026-09-14
- Tall regular window (Duo upright, iPad portrait): reading above, reflection below; the reading steps aside while typing: chosen (agent, 2026-09-30)
- Today pages: equal, not 1.35:1: recommended; pending (Nick) — keeps the devotional card off the fold
- "Stay with this prayer": regular-width windows only; recommended; pending (Nick) — phones stay unchanged unless Nick wants it there
- Outer landscape and tent stance: not now (agent, 2026-09-30) — needs landscape on every iPhone

## Done / verified
- apple-hig 2026-09-27 and /duo installed; /duo ran — verified
- Typecheck, lint, Jest 522 suites and 4,665 tests — run: pass
- iPad mini simulator (iOS 27.0) as the open-display stand-in, landscape and portrait, fictional fixtures, backend blocked — run: Today, book, reader, writing desk, Stay, Ask, wind-down
- iPhone 17 simulator — run: Today, book and reader unchanged
- Device Hub iPhone Duo simulator, fold, Split View, PiP, Reduce Transparency, RTL — not run: needs Xcode 27.1
- Physical iPhone Duo — not run
- Known limit: a failed reflection save shows as saved after a fold remounts the journal, as a day change already does — engineer follow-up
