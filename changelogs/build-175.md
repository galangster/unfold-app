Production-profile TestFlight build for series-complete and post-series Today polish.

Focus areas:
- Series Complete now shows a short, readable completion reflection instead of the full long backend summary.
- The completion reflection uses larger non-italic body text and is capped so it does not take over the screen.
- Removed the right-side orbital/thread graphic from the Up Next recommendation card.
- Removed the same right-side graphic from the post-series premium invitation card.
- Clarified the post-series upsell copy as a Premium series option and only allows premium nudges when premium access is definitively denied, avoiding cold-start flashes while entitlement status is unknown.

What to test internally:
1. Complete the final day of a series and confirm the Series Complete overlay feels short, readable, and not tiny.
2. Return to Today and confirm the Up Next card has no top-right orbital/thread graphic.
3. Confirm the post-series premium card has no top-right orbital/thread graphic.
4. Confirm the Premium series card appears only for definitively non-premium users after completing a series, and does not flash while premium state is still resolving.
5. Smoke Today, reading completion, create-new-series entry points, premium sheet opening, and bottom tab navigation.

Notes:
- This build is produced from the production profile; QA tools should be disabled.
- Build 168 remains the current App Store version 1.0 attachment unless Nick separately approves replacing it.
- Do not submit for review, external beta, subscription changes, or public release without explicit approval.
