Production-profile TestFlight build for the Today hero cleanup and live backend paragraph-rhythm fix.

Focus areas:
- Removes the repeated scripture-reference row from the open Today hero so the card stays focused on the title, pull quote, progress, and primary action.
- Keeps scripture references available in reveal/reading contexts where they are still useful.
- Uses the production backend with the paragraph-rhythm validator fix live on Railway deployment 9d0448fd.
- Preserves build 168 changes: Today/My Library stack navigation fix, Today visual simplification, Gupter display serif, no serif italics, Settings sync for generation, and production-profile App Review readiness.

What to test internally:
1. Open Today with an active devotional and confirm the open hero does not repeat the scripture reference under the title.
2. Confirm the hero still shows title, pull quote, study method when present, progress, and Continue/Return action correctly.
3. Confirm reveal-ready and reading screens still show scripture references where expected.
4. Retest Today -> My Library and Today -> My Devotionals navigation, including native iOS swipe-back.
5. Recheck Today, reading, journaling, library, highlighting, and notification re-entry smoke paths.

Notes:
- This build is produced from the production profile; QA tools should be disabled.
- Build 168 remains the current App Store version 1.0 attachment unless Nick separately approves replacing it.
- Do not submit for review, external beta, subscription changes, or public release without explicit approval.
