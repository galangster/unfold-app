Build 159 — onboarding generation recovery

Fixes:
- Prevents the first onboarding devotional from getting stuck on “Preparing your reading…” when generation completes without a locally attached devotional id.
- Preserves the backend-owned onboarding sample devotional id from job submission through polling.
- Adds visible recovery states for failed jobs, repeated polling errors, and long-running preparation instead of leaving reviewers on an indefinite spinner.
- Adds a retry path from the fallback reading spinner back into devotional preparation.

What to test:
- Fresh install / reset onboarding: complete paywall + discovery and confirm the first devotional opens with generated content.
- Verify the “Open your devotional” CTA only appears after real devotional content is ready.
- If the network or generation is slow, confirm the app shows retry/status copy instead of spinning forever.
- After reading the first devotional, confirm “I’ve finished reading” advances normally.
