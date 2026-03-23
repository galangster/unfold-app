# Build 11 — March 21, 2026

**Commit:** a30d57e | **Branch:** main

---

## New

- Massive variety engine expansion — 3.3 trillion unique devotional configurations
- 12 new persona voices (elder, iconoclast, pilgrim, apophatic, comic, prophetic lament, monastic, doxological, socratic, midwife, artisan, intercessor)
- 9 new structural templates (Lowry Loop, Four Pages, chiastic, Brueggemann arc, mystagogical, diatribe, wisdom collection, catena, hermit crab)
- 17 new hook styles, 10 new transitions, 10 new closings
- 14 new story types, 10 new dialogue types, 12 new craft techniques
- Story database integration — 1,016 real stories from psychology, literature, church history woven into devotionals
- Anonymous Firebase auth created early in onboarding for backend access
- Widget extension CFBundleDisplayName added

## Fixed

- Anthropic-format response parsing in commentary API
- Study method repetition eliminated in devotional arc generation
- TTS proxy pointed to Railway backend (was Vercel)
- AI slop removed from all user-facing text
- Banned "journey" word replaced across all copy
- Onboarding UX, copy, and prayer point-of-view fixes from tester feedback
- Check-in cards use time-based expiration (no more dismissible cards)
- Data usage screen layout compacted
- Generation error handling improved
- Subscription pipeline: stale premium, cancel handling, key sync

## Improved

- Memory summaries capped in prompts to prevent unbounded growth
- Prompt injection defense hardened, Sentry PII minimized
- Deep codebase audit — dead code cleanup, race conditions, tooltip redesign
- Onboarding tooltips stability and performance
- Welcome screen icon animation polish
- 12,617 lines of story staging files removed

---

## What to Test
- [ ] Complete onboarding flow end-to-end — should generate devotional without errors
- [ ] Read a generated devotional — check for voice variety, story references, structural variation
- [ ] Listen to TTS audio — verify audio loads and plays
- [ ] Check evening celebration flow
- [ ] Verify streak tracking works across days
- [ ] Test subscription/paywall screens
- [ ] Check widget renders correctly on home screen
