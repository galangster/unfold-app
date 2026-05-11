Production-profile TestFlight build for Day 7 pacing, notifications, and reader swipe recovery.

Focus areas:
- Keeps the Today tab anchored to the reading completed today when tomorrow's devotional has already been prepared.
- Routes Today and stale reader links back to the allowed current day instead of exposing tomorrow early.
- Restores left/right reader swipes between available devotional days.
- Pairs with backend deployment 1384e96 to suppress immediate next-day ready pushes after same-day completion.
- Preserves build 170 changes: completed-today/tomorrow reader gating, locked day-menu rows, Today hero cleanup, Today/My Library stack fix, Gupter display serif, no serif italics, Settings sync, and live backend style hardening.

What to test internally:
1. Finish today's devotional, then return to Today and confirm the hero still represents today's completed reading, not tomorrow.
2. Tap the Today CTA after completion and confirm it opens today's completed reading.
3. Try stale/direct reader links for tomorrow after completing today and confirm they clamp back to the allowed day.
4. Swipe left/right in the reader between already available days and confirm the day changes, not just haptic/motion feedback.
5. Confirm a prepared tomorrow can exist in the background without sending an immediate Day 7 ready push or becoming readable until tomorrow.
6. Recheck Today, reading, journaling, library, highlighting, and notification re-entry smoke paths.

Notes:
- This build is produced from the production profile; QA tools should be disabled.
- Build 168 remains the current App Store version 1.0 attachment unless Nick separately approves replacing it.
- Do not submit for review, external beta, subscription changes, or public release without explicit approval.
