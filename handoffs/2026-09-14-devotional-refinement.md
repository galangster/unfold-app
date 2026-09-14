# Devotional refinement for the next build

Nick approved this design on September 14. The release orchestrator owns merge and packaging.

The change replaces app-owned italic presentation with upright type. Reflection and Tomorrow share editorial alignment. Breath prayer has a radial halo, stationary cue, reserved peak bounds, and explicit press feedback.

Evidence: /Users/galangster/clawd/work/unfold/operations/2026-09-14-devotional-refinement/receipt.json
Source hashes: source-manifest.json beside that receipt.
Native screenshots and breath-native.mp4 are in the same directory.

Validation: 46 focused tests passed. Final press and scripture regression tests passed. TypeScript passed. Targeted lint has zero errors and 16 existing warnings.

Parent Simplify was a single pass. It removed a redundant native suppression variable. It reused font selection and color helpers. Native QA caught a dropped Pressable style callback, which is corrected. No four-agent fan-out ran.

## Required integration gates

1. Compose after sound. Preserve sound imports and reading completion hooks.
2. Rebuild the combined native runtime. Older gradient binary cannot validate changed Swift files.
3. Insert scripture into a native journal note. Confirm upright blockquote and reference text.
4. Apply italic manually to one phrase inside that blockquote. Save, close, and reopen. Confirm explicit italics remain.
5. Open an existing note containing explicit italic text. Confirm content and marks survive save/reopen.
6. Verify real reading completion, Reflection save/retry, Continue in Journal navigation, and Tomorrow access rules.
7. Check combined ambient-player clearance and the final native text-size behavior.
8. Require current-head CI and Greptile 5/5 before merge. Root owns final acceptance and packaging.

Native QA used released simulator4FEA33BF-3B0E-4EB1-9E8A-CAF215040415 and owned Metro8198. Sound simulator and protected simulator stayed untouched. Synthetic QA files are excluded from this commit and preserved in the external evidence fixtures directory.

Open observation: changing OS text size live produced stale clipped measurements. Reloading produced correct large-text rendering. Do not describe this as verified live resizing.

## Button-width correction

Nick requested this correction after the first review. The old head was d8c0b8fad0bcf398ae815d9402b67494ad107f63.

Dismiss clearance now applies to headings only in TodayCardStack and ContextSlot. Card action groups use the complete content width. Today reveal/read/recovery/new-study actions and compact premium/resume actions stretch to their content margins. Inline text links and paired shortcuts retain their intended layouts.

Native proof: buttons-native.png and buttons-dark.png show the real card component. home-full-width.png shows the real Today route. Reveal measures354x48 points at x24. The feedback actions share both content margins.

Validation: 61 focused tests passed, TypeScript passed, and targeted lint has zero errors. Parent Simplify reviewed this small correction directly. No new layout abstraction was necessary.

The earlier CI failure expected the intentionally removed breath phrase. Its assertion now checks absence and accessible retention. Review feedback prompted class-scoped upright emphasis and a word-boundary teaser length cap. Full titles and large-text wrapping remain readable.
