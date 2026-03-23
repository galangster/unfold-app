Build 30 — What to Test

NEW:
- Notebook system: rich text editor (bold, italic, headings, lists, checklists, blockquotes) with auto-save, categories (Sermon, Quiet Time, Study, Prayer, General), scripture linking, and folder management
- Voice input: dictate journal entries, check-in reflections, and prayers — tap the mic, speak freely (pauses won't cut you off), tap checkmark to commit
- Night Sky evening celebration: dark starfield animation when you finish your evening check-in, distinct from the daytime completion celebration
- Bible reader overhaul: scroll-to-hide header for immersive reading, bottom sheet book/chapter navigator with search, cross-book navigation, swipe between chapters, reading settings (font size, line height, verse numbers), auto-resume last-read position
- Paywall redesign: concrete feature descriptions with icons, free vs premium comparison table, stacked plan cards, trial timeline
- Share card improvements: save to Camera Roll button alongside Share
- Check-in now has 8 mood options (expanded from previous set) with better chip spacing
- Midday and evening check-in notification cards with rotating messages and settings toggles
- Curated story illustrations: 1,016 real-world stories (biblical, church history, cultural, science) now woven into daily devotionals via Railway backend
- AI data consent screen in onboarding (App Store compliance)
- Account deletion flow with two-step confirmation
- Sentry error tracking and session replay for crash diagnostics
- Reading settings (Aa button): adjust font size and reading font within devotionals
- Encrypted local storage (MMKV with Keychain-backed encryption)
- Prompt injection defense on all user text sent to AI
- Widget extension now has proper display name

FIXED:
- Check-in cards no longer disappear when accidentally tapped — they now use time-based expiration (midday: 12pm-5pm, evening: 5pm-11:30pm) instead of dismissible X buttons
- Evening check-in no longer vanishes after completing the day's reading
- Replaced ~55 instances of banned word "journey" with contextually appropriate alternatives
- Eliminated AI slop from user-facing text (false agency, dramatic fragmentation, banned phrases across 44 fixes in 10 files)
- Onboarding improvements from real user feedback: faster how-it-works animations, simplified check-in copy, "A little about you" heading, Continue button below name input, skip paywall on first-time onboarding, auto-open first reflection question
- Prayers now generated in first-person POV (I/me/my instead of third-person)
- Subscription pipeline: catches lapsed subscriptions on launch, cancel no longer shows error toast, RevenueCat checks correct entitlement
- Keyboard no longer hides text input in onboarding and journal flows
- Reflection questions now scale with font size setting
- Journal navigation no longer flashes white
- Profile photo picker works correctly (switched from document picker to image picker)
- Memory prompt optimization: capped at 5 most recent summaries to prevent unbounded growth at Day 90+
- TTS proxy now routes through authenticated Railway backend (was unauthenticated Vercel)
- Deep codebase audit: removed 25 unused files (7,400+ lines), fixed rate-limit race condition, fixed AbortController reuse, fixed stale closures, removed 5 unused npm dependencies
- Flattened app icons (no more dark corners from alpha channel)
- Generation error handling improved with better logging

KNOWN ISSUES:
- Bible translations are limited to BSB (Berean Standard Bible) — additional translations are a future feature
- TTS audio playback button may not be immediately obvious to new users (discoverability improvement planned)
- Check-in timing may feel misaligned if you do evening check-in late and morning devo early

FOCUS AREAS:
- Notebook: Create notes, try rich text formatting, organize by category, link scriptures — does auto-save work reliably?
- Voice input: Try dictating in journal, check-in, and prayer screens — does it capture your speech accurately? Any awkward cutoffs?
- Bible reader: Navigate between books/chapters, try the search, adjust reading settings, swipe between chapters — is it smooth and intuitive?
- Check-in flow: Do midday and evening cards appear at the right times? Do they feel natural and not intrusive?
- Onboarding: Walk through the full onboarding as a new user — does the how-it-works flow feel snappy? Is the AI consent screen clear?
- Paywall: Does the free vs premium comparison make the value clear? Does the trial timeline make sense?
- Evening celebration: Complete your evening check-in and watch for the Night Sky animation
- Story illustrations: Do the real-world stories woven into devotionals feel relevant and enriching?
- Overall text quality: Does the app copy feel natural and human? Any remaining "AI-sounding" phrases that feel off?
