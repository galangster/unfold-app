Production-profile TestFlight and App Review candidate for the Today/My Library navigation fix.

Focus areas:
- Fixes a Today-stack navigation bug where opening My Library or My Devotionals from Today could flash the Today screen or fail to land cleanly.
- Fixes native swipe-back from My Library/My Devotionals so it returns naturally to Today instead of playing a duplicate Today redirect animation.
- Keeps Today-origin library and devotional screens inside the Today stack, while preserving existing My Library motion suppression and Today detail routing.
- Preserves build 167 changes: Today visual simplification, Gupter display serif, no serif italics, Settings sync for generation, and live backend structured Day-generation readiness.

What to test internally:
1. From Today, tap My Library several times and confirm it opens My Library without a Today flash or no-op.
2. From My Library, use the back button and native iOS swipe-back; both should return cleanly to Today.
3. From Today, open My Devotionals / See All and confirm it uses the same clean Today-stack transition.
4. From My Devotionals opened from Today, open a series detail and swipe/back; it should return to My Devotionals, then Today.
5. Recheck Today, reading, journaling, library, highlighting, and notification re-entry smoke paths.

Notes:
- This build is produced from the production profile; QA tools should be disabled.
- Build 167 was the prior App Review attachment before this fix.
- Do not submit for review, external beta, subscription changes, or public release without explicit approval.
