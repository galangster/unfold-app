Build 209 reverts the shadow elevation experiment from builds 207 and 208 and goes back to the visible card strokes from build 205, but thinned to StyleSheet.hairlineWidth (single device pixel). Builds 207 and 208 are expired and should not be installed.

What changed since build 205:
- All Today tab card borders use StyleSheet.hairlineWidth instead of 1 or 1.5. Single device pixel on @2x/@3x. Same accent color and opacity as before.
- The "1 of N" counter on the Daily Thread top card stays removed. The stacked back-card silhouettes communicate "more below" visually.
- No elevation token system. The shadow + outline experiment is reverted.

Also carried forward from build 206 / 207 (still in effect, no change since they shipped):
- Companion chat fallback race fix
- Day 10 missing-day handling fix

What to test:

Today tab visual:
- Open the Today tab and confirm the Daily Thread card, Daily Rhythm card, and My Devotionals / My Library tiles all have visible but thin accent-tinted strokes.
- Strokes should read as a clean defined edge, not as a heavy chrome line.
- Confirm there is no "1 of N" counter in the top right of the Daily Thread card. The X dismiss button is still there.
- Try this in both dark and light mode.
- Swipe and dismiss the top card; confirm motion, X dismiss, and back-card promotion still work.

Day 10 missing-day handling (unchanged from 207):
- On a day where the next devotional has not yet generated, open the Today tab; confirm you see an inline "Preparing today" or "Day X is almost ready" status.

Companion chat fallback (unchanged from 206):
- Open the Companion and ask a longer question.
- Confirm the response reaches a natural ending and does not stop mid-sentence.

Sources:
- Revert + hairline strokes: ef0b2da
- Day 10 missing-day (carried): b163516, 38df460
- Companion fallback (carried): 390fdec

App Review build attachment is intentionally unchanged.
