Production-profile internal TestFlight build for the Today visual simplification and Gupter display serif update.

Focus areas:
- Clean production profile build with QA tools disabled.
- Includes Today tab visual simplification: static/decorative card art removed so the screen is more text-first and calmer.
- Replaces live and native-editor Instrument Serif usage with bundled Gupter Regular, Medium, and Bold.
- Serif italic behavior has been removed; display serif text should render non-italic.
- Keeps onboarding generation recovery, profile/settings sync for future devotional generation, and backend structured Day-generation readiness from prior builds.

What to test internally before any App Review mutation:
1. Install this TestFlight build and open the Today tab.
2. Confirm the main Today devotional card no longer shows the old static right-side decorative graphic.
3. Confirm Today cards feel cleaner and text-first, with the decorative line drawings and halo/thread/dot art removed.
4. Confirm display serif text uses Gupter and does not render in serif italics.
5. Open a devotional reading, share card, PDF export, and notebook/editor flow to confirm typography still renders correctly.
6. Complete onboarding or use an existing internal tester account and confirm the first devotional opens instead of staying on the preparation loader.
7. Change profile or Writing Style values in Settings and confirm later generation remains stable.
8. Recheck basic reading, journaling, library, highlighting, and notification re-entry flows.

Notes:
- This build is produced from the production profile; QA tools should be disabled.
- Build 166 remains the previous clean App Review candidate fallback, but it does not include the Today/Gupter changes.
- Build 154 remains the currently attached App Review build until Nick explicitly approves replacing it.
- Do not submit this build for App Review, external beta, or release without explicit approval.
