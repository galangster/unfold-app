# Build 60 — TestFlight Changelog

## New
- **Post-generation flow**: After devotional generation, go straight into reading instead of the home screen

## Fixed
- **Audio timeout for long devotionals**: 15-minute devotionals no longer fail with AbortError — timeout scales with content length (up to 3 minutes)
- **"Not a...it's a..." writing pattern**: Devotional prose no longer overuses the negative-then-positive reframe pattern
- **Devotional titles**: Titles now aim for book-title quality — tension, paradox, mystery instead of generic phrasing
- **Deferred generation**: Day 2 no longer generates immediately after completing Day 1 — waits until the next day as intended
- **Reflection shows wrong day**: Journal reflection card now shows the last completed day (e.g., Day 1) instead of the next day (Day 2)
- **Companion bridge message covered**: Bridge message at top of home screen no longer hidden behind the devotional card

## Improved
- **Audio loading text**: "Preparing audio" now includes time estimate so users know to wait
- **Title generation prompt**: Rewritten with examples of great titles and anti-examples of bland ones

## What to Test
- [ ] Create a new devotional — check that the series title feels catchy and book-like
- [ ] After generation completes, verify you land on the reading screen (not home)
- [ ] Read through a devotional day — check for the "not a...it's a..." pattern (should be gone)
- [ ] Tap play on audio — verify "Preparing audio — this may take a minute or two..." shows
- [ ] Try audio on a 15-minute devotional — should load without error
- [ ] Complete Day 1 — verify Day 2 does NOT generate immediately (should say "come back tomorrow")
- [ ] Check Journal > Reflections — should show Day 1 reflection prompt, not Day 2
- [ ] On home screen after completing a day — companion bridge message should show above the devotional card, not behind it
