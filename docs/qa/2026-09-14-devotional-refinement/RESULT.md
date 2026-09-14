# Unfold 1.1.12 UI and performance audit

The changed interfaces pass the native Debug acceptance checks. Root applied ui-polish, ui-review, performance, and one simplify pass. Final embedded Release acceptance and publication are separate gates.

## Resulting behavior

- Reflection writing provides Previous, Next, and Done above the keyboard. Blank answers remain optional. Return inserts a newline. Navigation preserves drafts and brings the focused answer into view.
- One announcement sequence covers Bookshelf, Companion, Music, and reflection navigation. Each feature has permanent history. Next advances, Done finishes, and close dismisses remaining eligible pages. Music previews stop when users leave their page.
- Large announcement text scrolls within the sheet. Close and navigation controls remain independently accessible. Long reflection answers remain scrollable at enlarged text sizes.
- Reading typography stays upright. Tomorrow paints both full lines and responds to system text changes. Native text reflow preserves journal state.
- Completion status is separate from Share. Card actions, section alignment, sound controls, and the optional breath practice received native checks.
- Sound sheets animate without per-frame React state. Volume persists after a completed adjustment. Timer width stays stable. Ended notices reserve their measured height above navigation.

## Automated validation

461 suites and 3,954 tests pass. One suite and one test remain intentionally skipped. Typecheck, lint, profile safety, and Maestro selector verification pass.

Commands: `bun test --runInBand`, `bun run typecheck`, `bun run lint`, `bun run verify:profiles`, and `node scripts/verify-maestro-selectors.mjs`.

## Native evidence

The simulator checks cover dark and light appearance, enlarged text, keyboard focus, draft round trips, blank Next, multiline entry, Done, the four announcement pages, preview cleanup, all nine recordings, sound sheet gestures, timer layout, and the enlarged practice entry.

The isolated Release build compiles with embedded JavaScript. Its bundle SHA-256 is `45496f74f756bb027c5323d8902faf65cae1f75d906b5861bc96bcf2af211a30`. Final combined Release interaction checks follow this source audit.

Evidence root: `operations/2026-09-14-release-takeover/` in the Unfold workspace. See `receipt.json`, `final-candidate-source.json`, `final-feature-validation/`, `candidate-native/feature-announcements-proof/RESULT.md`, and the native reading captures.

## Performance scope

Seven 30-second Debug probes recorded JavaScript callbacks near 60 Hz. UI callbacks were about 58 Hz during scrolling and 59.7–60 Hz elsewhere. These are callback measurements, not rendered frame rates.

Isolated Release samples measured 13.69% of one host CPU core during the prism scene and 18.73% on quiet Today. Simulator load and configuration differ from Debug. The remaining CPU use is unattributed. These samples do not establish physical-device energy use or GPU performance.

## Release boundary

Production practice remains disabled. The audio patch and approved recordings remain part of the integrated candidate. Publish one reviewed source head, require current-head CI and Greptile review, then build the production successor from a fresh checkout.
