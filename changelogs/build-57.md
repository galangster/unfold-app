# Build 57 — TestFlight 26-Issue Fix Batch

**Date:** 2026-03-26
**Commit:** 4cddbcc

## What to Test

This build resolves 26 issues reported by TestFlight testers. Key areas to verify:

### Scripture & Reading
- Scripture font size is larger and more readable (19/21/24pt depending on size setting)
- Red-letter Bible verses are brighter in dark mode
- Highlight colors have better contrast — not too faint, not overpowering
- Share card elements are left-aligned and smaller/more refined

### Audio & TTS
- TTS narration reads scripture references naturally ("chapter 1, verse 3" instead of "1:3")
- Audio prefetch cache should match playback (no re-downloads)
- TTS works correctly after toggling silent mode off in settings

### Completion & Celebration
- Day/series completion modal has opaque background with ember particles
- Text is left-aligned throughout completion and generating screens

### Premium & Payments
- Paywall has drag handle indicator at top
- Paywall has reversed ember particles as background
- No duplicate icons in premium benefits list (SquaresFour replaces second Infinity)
- Streak freezes are premium-only (free users see "Premium" label, can't accumulate)
- Custom check-in schedules are premium-gated

### Navigation & UX
- Past devotionals sorted by most recent first
- Apple Sign In button logo no longer clips/overflows
- Companion keyboard doesn't cover input
- Conversation history filters correctly
- "Preparing" state on home screen resolves properly
- Reset data works correctly in settings

### Auth
- Sign-in sheet Apple logo displays properly
- Auth hooks work correctly across flows
- Journal keyboard padding is correct
