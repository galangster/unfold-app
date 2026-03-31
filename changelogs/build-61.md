# Build 34 — TestFlight Changelog

## New
- **Swipeable devotional card stack**: Home screen now shows devotional days as a swipeable card stack instead of a flat list
- **Pull-down search bar**: My Studies screen has a search bar to quickly find past series
- **My Studies redesign**: Past series section reorganized with grouped series rows and renamed to "My Studies"
- **TTS pre-generation pipeline**: Audio is now pre-generated on the backend using Fish Audio with R2 caching — faster playback, lower latency
- **Audio cache eviction**: Client-side audio cache auto-manages itself (500MB / 100 file cap with LRU eviction)
- **Background fetch**: Overnight devotional generation via background fetch task
- **Series finale**: Completion celebration now shows series reflection summary with 11 closure archetypes
- **Tappable scripture anchor**: Scripture reference in devotionals is now tappable to return to reading
- **Expanded quote sources**: Daily quotes now pull from a broader range of authors beyond theologians

## Fixed
- **Bridge auth race condition**: Bridge generation no longer fires before auth token is ready on cold start (was causing 401s)
- **Home screen card stack bugs**: Various touch and layout fixes for the new card stack
- **Companion bridge message**: No longer hidden behind the devotional card on home screen
- **Same-day generation**: Day 2 no longer generates on the same day as Day 1 completion
- **Reflection day display**: Journal reflection card shows correct completed day
- **Apple logo size**: Properly sized on onboarding sign-in screen
- **Go Deeper questions**: Now persist correctly; SOAP saves flush on dismiss
- **Journal prompt visibility**: Questions stay visible while writing responses
- **Sign-out reset**: Full state reset on sign-out

## Improved
- **Deferred generation**: Generation now waits until next app open instead of triggering immediately after completion
- **Stale generation detection**: 5-minute timeout prevents stuck generation states
- **Story deduplication**: Completed stories excluded from future generation prompts
- **Companion chat performance**: Faster response times and welcome screen polish
- **Backend TTS**: Retry with exponential backoff, request deduplication, structured metrics/logging

## What to Test
- [ ] Swipe through devotional cards on home screen — should feel smooth
- [ ] Pull down on My Studies to reveal search bar
- [ ] Tap play on audio — should load noticeably faster (pre-generated on backend)
- [ ] Complete a devotional day — next day should NOT generate immediately
- [ ] Re-open app later — next day should generate on open
- [ ] Check companion bridge message on home screen — should be visible above cards
- [ ] Sign out and sign back in — verify clean state
- [ ] Try journal reflection — prompt question should stay visible while typing
- [ ] Complete a full series — should see reflection summary celebration
- [ ] Leave app overnight — background fetch should prepare next devotional
