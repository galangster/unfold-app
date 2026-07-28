QA BUILD (internal only) - QA tools ENABLED. Supersedes build 237.

LIVE ACTIVITY CLEANUP (internal / defensive)
- Reading-session Live Activities are now ended on every audio stop path (stop, completion, errors, timeout) instead of lingering on the lock screen.
- On app launch, any Live Activity orphaned by a force-quit or crash in a previous run is dismissed automatically.
- No visible change in this build: the audio narration button is still hidden, so Live Activities never start. This is groundwork so re-enabling audio later can't leave stuck lock-screen cards.

Please test (regression only — no new UI):
1. Normal reading flow: open today's devotional, read to completion, confirm streak/widgets update as usual.
2. Force-quit and reopen the app; confirm no errors on launch and lock screen shows no Unfold cards.
3. Home/lock-screen widgets still update after completing a reading.

Report the device/iOS version, approximate time, and a screenshot if any error appears.

Carries forward all build 237 onboarding-crash, writing, free-tier, notebook, sync, dictation, privacy, and Companion fixes.
