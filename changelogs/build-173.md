Production-profile TestFlight build for the completed Today hero CTA cleanup.

Focus areas:
- Removes the extra reflection prompt card that appeared between progress and Read Again on the completed Today hero.
- Keeps the saved reflection card with the feather icon as the single reflection entry point.
- Preserves the completed state: Completed pill, completed day number, Read Again routing to the completed day, and available-day reader swipes.
- Preserves build 171/172 pacing behavior: Today stays anchored to the allowed completed day when tomorrow is prepared, stale links clamp back to the allowed day, reader swipes work between available days, and same-day next-day ready pushes are suppressed.

What to test internally:
1. Finish today's devotional, return to Today, and confirm the hero flows from progress directly to Read Again without the extra Let today settle / Write a Reflection card.
2. Confirm the saved reflection card lower on Today still shows the feather icon and Open reflection button.
3. Tap Read Again and confirm it opens the completed current day, not the prepared tomorrow.
4. Tap Open reflection from the saved reflection card and confirm it opens the journal for the same completed day.
5. Recheck reader left/right swipes between available days and stale/direct tomorrow links to ensure pacing behavior is preserved.
6. Smoke Today, reading, journaling, library, highlighting, and notification re-entry paths.

Notes:
- This build is produced from the production profile; QA tools should be disabled.
- Build 168 remains the current App Store version 1.0 attachment unless Nick separately approves replacing it.
- Do not submit for review, external beta, subscription changes, or public release without explicit approval.
