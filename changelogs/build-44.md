# Build 44 — Server-Gated Day Progression

## New
- seriesStartDate now set on client-side devotional creation (fixes calendar day gating)
- Device timezone syncs to server on every push (supports timezone changes from travel/moves)

## Fixed
- **Devotional days no longer unlock prematurely.** Day progression is now controlled by the server cron instead of firing immediately when you finish reading. After completing a day, the card shows your completed reading until the next calendar day.
- Removed client-side `advanceDay` and on-demand next-day generation from reading completion
- Removed `isCatchUp` logic that was bypassing the tomorrow-locked gate
- Infinite render loop from `.find()` inside Zustand selector
- Google auth freeze — dismiss modal before navigating after OAuth
- Sync dirty detection skips records without id
- Reading screen polish — larger cross-references, cleaned up unused imports

## Improved
- Onboarding redesign screens 1-3 with continuous particle narrative system
- Recommended series card wired into empty + journey-complete states
- All API traffic routed through Cloudflare WAF

## What to Test
- [ ] Start a new devotional series and complete day 1
- [ ] After completing day 1, verify the home card stays on day 1 (shows quotable line + "Your next reading will be ready tomorrow")
- [ ] Verify day 2 does NOT appear immediately after completing day 1
- [ ] Next morning: verify day 2 appears via the reveal screen
- [ ] Open the day menu — days beyond currentDay should still show as locked
- [ ] Check that streaks still record correctly after completing a day
- [ ] Verify the "Return to Reading" button works on the completed day card
