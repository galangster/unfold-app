# Build 265 (1.1.6) - Daily reading recovery

Everything in build 264, plus the improvements below.

## What's New (App Store)

Daily readings now explain when preparation fails, takes longer, or loses its connection. Recovery follows the same reading across navigation and relaunches, with clear retry and status controls.

## Fixed

- **Clear preparation status** - Today and the reader distinguish active, delayed, failed, offline, and exhausted jobs.
- **Safe retry** - Repeated taps retry the same failed job once without creating a replacement reading.
- **Recovery after returning** - Backgrounding, navigation, reconnecting, and relaunching rediscover the server's current reading status.
- **Existing queued work** - Opening a reading prioritizes its existing queued job instead of submitting another one.
- **Library reading protection** - Library readings remain read-only across repeated visits, including the current series. Today retains retry for an active missing reading.

## What to Test

- [ ] Open Today with a failed Day 2. Confirm the card explains the failure and offers Try Again.
- [ ] Open the failed day in the reader. Tap Try Again rapidly and confirm one recovery starts for that reading.
- [ ] While Day 2 is preparing, leave and return to Today. Confirm the same reading status reappears.
- [ ] Force-quit and relaunch while a day is missing. Confirm Unfold rediscovers its current status.
- [ ] Interrupt the connection. Confirm Check Again recovers after the connection returns without creating another reading.
- [ ] Check a delayed job. Confirm the copy explains the delay and the action remains available.
- [ ] Exhaust the retry allowance. Confirm no further generation action appears.
- [ ] Open a Library reading twice, including the current series. Confirm it reports status without offering a retry or starting generation.
- [ ] Confirm an existing queued day progresses through preparation and opens the completed reading.
- [ ] Verify the refreshed onboarding walkthrough still plays and uses the current poster.
