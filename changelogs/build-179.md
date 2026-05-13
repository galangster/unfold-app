Production-profile TestFlight build for Today Companion speech-bubble polish.

Focus areas:
- Redrew the Companion bridge bubble and tail as one continuous SVG shape so the outline does not show an internal seam where the tail enters the bubble.
- Preserved the lightweight Companion-above-hero placement from build 178.
- Re-checked the Home/Today tooltip replay sequence against the current Companion-first order.

What to test internally:
1. Open Today with an in-feed Companion bridge and confirm the bubble tail feels like one continuous speech-bubble outline with no interior line at the join.
2. Profile > Dev Tools > Replay Home Tooltips (Dev): confirm step 1 targets the Companion/check-in bubble, step 2 targets Today's thread, step 3 targets Daily Rhythm, and step 4 targets Bible/Companion/Journal.
3. Smoke Today reveal/catch-up states, Daily Rhythm, Keep Going, and normal bottom-tab navigation after dismissing the tour.

Notes:
- This build is produced from the production profile; QA tools are not enabled by the production profile.
- The App Store version 1.0 attachment remains unchanged unless Nick separately approves replacing it.
- Do not submit for review, external beta, subscription changes, or public release without explicit approval.
