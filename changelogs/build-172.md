Production-profile TestFlight build for completed Today card polish after the Day 7 pacing fix.

Focus areas:
- Makes a completed-today hero feel intentionally complete instead of like a normal in-progress reading.
- Changes the completed primary CTA to Read Again so users know it will reopen the completed day.
- Adds a completed status pill with clearer accessibility copy for the finished reading.
- Adds a reflection next-step card that opens the journal for the completed day, with copy for empty, started, and captured reflection states.
- Preserves build 171 fixes: Today stays anchored to the allowed completed day when tomorrow is prepared, stale links clamp back to the allowed day, reader swipes work between available days, and same-day next-day ready pushes are suppressed.

What to test internally:
1. Finish today's devotional, return to Today, and confirm the hero shows Completed plus the completed day number rather than making tomorrow look readable.
2. Tap Read Again and confirm it opens the completed current day, not the prepared tomorrow.
3. Tap Write a Reflection / Continue Reflection / Review Reflection and confirm it opens the journal for the same completed day.
4. Add or edit journal reflection content, return to Today, and confirm the reflection card copy updates appropriately.
5. Recheck reader left/right swipes between available days and stale/direct tomorrow links to ensure build 171 behavior is preserved.
6. Smoke Today, reading, journaling, library, highlighting, and notification re-entry paths.

Notes:
- This build is produced from the production profile; QA tools should be disabled.
- Build 168 remains the current App Store version 1.0 attachment unless Nick separately approves replacing it.
- Do not submit for review, external beta, subscription changes, or public release without explicit approval.
