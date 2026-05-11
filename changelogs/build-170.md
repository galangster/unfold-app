Production-profile TestFlight build for devotional day pacing and reader/day-menu access.

Focus areas:
- Prevents completed-today users from opening tomorrow's prepared devotional as TODAY.
- Keeps reader route params, headers, and day-menu selection clamped to the latest day that is actually readable today.
- Locks tomorrow/future day-menu rows with calmer "Being prepared..." copy instead of exposing generation mechanics.
- Preserves build 169 changes: Today hero scripture-reference cleanup, Today/My Library stack navigation fix, Today visual simplification, Gupter display serif, no serif italics, Settings sync for generation, and the live backend paragraph-rhythm fix on Railway deployment 9d0448fd.

What to test internally:
1. Finish today's devotional, then open the reader from Today and confirm it returns to today's completed day instead of tomorrow.
2. Try direct/stale reader links for tomorrow after completing today and confirm they clamp back to the allowed day.
3. Open the reader day menu after completion and confirm tomorrow/future rows are locked and say "Being prepared...".
4. Confirm tomorrow can still prepare in the background without becoming readable until the next day.
5. Recheck Today, reading, journaling, library, highlighting, and notification re-entry smoke paths.

Notes:
- This build is produced from the production profile; QA tools should be disabled.
- Build 168 remains the current App Store version 1.0 attachment unless Nick separately approves replacing it.
- Do not submit for review, external beta, subscription changes, or public release without explicit approval.
