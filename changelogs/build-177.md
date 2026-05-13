Production-profile TestFlight build for the Today onboarding tooltip alignment polish.

Focus areas:
- Polished spotlight padding, tooltip gaps, rounded-corner geometry, and arrow visibility for the refreshed Today onboarding tour.
- Improved tooltip contrast/readability and the spotlight halo so each coachmark target is easier to read on device.
- Kept the final Read, Ask & Write tooltip focused on the Bible, Companion, and Journal tabs instead of the Today tab.

What to test internally:
1. Open the internal/dev QA path: Profile > Dev Tools > Replay Home Tooltips (Dev).
2. Confirm step 1 points cleanly at Today's reading/thread card.
3. Confirm step 2 points cleanly at the in-feed Companion Check-in card, not the bottom Companion tab.
4. Confirm step 3 points cleanly at Daily Rhythm.
5. Confirm step 4 spotlights Bible, Companion, and Journal together and excludes Today.
6. Smoke Today loading plus normal bottom-tab navigation after dismissing the tour.

Notes:
- This build is produced from the production profile; QA tools should be disabled unless an internal/dev path explicitly exposes the replay helper.
- Build 168 remains the current App Store version 1.0 attachment unless Nick separately approves replacing it.
- Do not submit for review, external beta, subscription changes, or public release without explicit approval.
