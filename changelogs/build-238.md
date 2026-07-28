Build 238 fixes the onboarding hang where the sample devotional appeared to load forever.

What changed:
- The sample devotional step now waits up to 4 minutes and always checks one last time before showing the "taking longer" card, so a devotional that finishes late still opens.
- Force-quitting during generation no longer loses your devotional: reopening the app resumes the same one instead of silently starting a new job.
- The post-paywall generating screen shows a clear error with Retry instead of spinning when the server returns something unexpected.
- Paywall buttons can no longer get stuck on a spinner if the App Store request fails.
- Internal: reading-session Live Activities are now ended on every audio stop path, and any activity orphaned by a force-quit or crash is dismissed at launch. No visible change yet (audio narration is still hidden) — this is groundwork so re-enabling audio can't leave stuck lock-screen cards.

What to test:
1. Delete the app, reinstall, and run fresh onboarding through the sample devotional. If a "taking longer" card appears, tap Keep checking and confirm the reading arrives.
2. Force-quit the app during the generating animation, reopen it, and confirm onboarding resumes the same devotional without starting over.
3. Open the Word Study card after the sample and confirm there is no crash (verifies the build 237 fix).
4. On the paywall, tap Restore Purchases with and without a network connection; the button must never spin forever.
5. Force-quit and reopen the app; confirm no errors on launch and the lock screen shows no Unfold cards.
