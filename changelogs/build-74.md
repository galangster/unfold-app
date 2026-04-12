# Build 74 — Paywall walkthrough video

## New

- **Paywall walkthrough video** — the three-step paywall's first screen now plays an auto-looping, muted walkthrough of the app inside the device mockup instead of a static screenshot. Content is bundled (no network fetch), clipped to the rounded bezel, and scoped so the player tears down the moment you advance past Screen 1.

## What to Test

- [ ] Trigger the paywall from anywhere (new devotional gate, upgrade card in You, etc.) and land on Screen 1 ("Unlock everything Unfold can do." or "We want you to try Unfold for free.")
- [ ] Verify the video plays automatically inside the device bezel — no black frame, no loading spinner
- [ ] Verify it loops cleanly with no audible sound
- [ ] Drag the content area up/down — the video should stay inside the bezel without visual glitches
- [ ] Advance to Screen 2 and back — returning should restart the video from frame 0
- [ ] Backgrounding the app mid-paywall and returning should resume the video, not freeze on a stale frame
- [ ] No new warnings in the console about expo-video player lifecycle

## Carried from Build 73

Everything from Build 73 still applies (stale daily reminder fix, silent purchase fix, paywall trial eligibility, light mode contrast, reading header, animation compliance). If you were already testing those, keep testing them.
