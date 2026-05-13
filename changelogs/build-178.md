Production-profile TestFlight build for the Today bridge and reveal hero polish.

Focus areas:
- Moved the Companion bridge above the Today hero so it reads like a small chat bubble before the main devotional action.
- Removed the old full-card bridge framing and helper label to keep Companion nudges lightweight and conversational.
- Opened up the reveal-ready hero so the catch-up/reveal state is frameless, calmer, and more like the normal Today hero.
- Kept the refreshed Home/Today tooltip sequence aligned with the new Companion-first order.

What to test internally:
1. Open Today with an in-feed Companion bridge and confirm the bridge appears above the hero as a compact chat bubble.
2. Confirm the reveal-ready state feels open/frameless and the Reveal Today's Devotional button remains easy to tap.
3. Profile > Dev Tools > Replay Home Tooltips (Dev): confirm step 1 targets the Companion/check-in bubble, step 2 targets Today's thread, step 3 targets Daily Rhythm, and step 4 targets Bible/Companion/Journal.
4. Smoke Today loading, reveal/catch-up states, Daily Rhythm, and normal bottom-tab navigation after dismissing the tour.

Notes:
- This build is produced from the production profile; QA tools are not enabled by the production profile.
- Build 168 remains the current App Store version 1.0 attachment unless Nick separately approves replacing it.
- Do not submit for review, external beta, subscription changes, or public release without explicit approval.
