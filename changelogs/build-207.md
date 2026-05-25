Build 207 collects three things since build 205: a Today tab visual pass that swaps stroked card chrome for an elevation system, the Day 10 missing-day handling fix from the 6:17 a.m. HST race, and the companion chat fallback race fix that build 206 was meant to ship.

What to test:

Today tab visual:
- Open the Today tab and confirm the Daily Thread card has no visible stroke or "1 of N" counter in the top-right; only the X dismiss remains.
- Confirm the stacked back-card silhouettes are still visible behind the top card as before.
- Confirm Daily Rhythm (the streak card) and the My Devotionals / My Library tiles have no visible strokes and read as elevated.
- Try this in both dark and light mode; in dark mode you should see a soft inner top highlight on the cards, in light mode the cards should sit above the canvas via shadow only.
- Swipe and dismiss the top card; confirm the swipe motion, dismiss X, and back-card promotion still work.

Day 10 missing-day handling:
- On a day where the next devotional has not yet generated, open the Today tab; confirm you see an inline "Preparing today" or "Day X is almost ready" status instead of a misleading "Begin your next series" prompt.
- Reopen the app a few minutes later; confirm Today recovers cleanly once the day generates.

Companion chat fallback:
- Open the Companion and ask a longer question (multi-day study plan, longer prayer, reflection).
- Confirm the response reaches a natural ending and does not stop mid-sentence.
- Confirm suggestion chips appear only after the final answer is complete.
- Try a follow-up; confirm conversation context, title generation, and suggestions still behave normally.

Sources:
- Shadow elevation: cbb2e9e, 89ea3fc, 5850c9e, ea76f87, 0989fe3
- Day 10 missing-day: b163516, 38df460
- Companion fallback: 390fdec

App Review build attachment is intentionally unchanged.
