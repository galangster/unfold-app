Build 124 — companion polish + notification QA TestFlight build

What to test:
- Companion chat titles seed and recover more cleanly for new/existing conversations.
- Companion streaming stays stable at the end of responses (no broken trailing-buffer behavior).
- Notification QA tools are available in this QA TestFlight build.
- Seed a devotional-ready notification and verify delivery on device.
- Tap the notification from foreground/background/cold start and confirm it opens the correct devotional/reveal flow.
- Verify the app can route correctly even when launched from the root welcome screen.
- Sanity check Today and You tab QA entry points.

Focus areas:
- Notification tap-through on a real device
- Reveal handoff
- Reading handoff
- Companion naming/continuity polish