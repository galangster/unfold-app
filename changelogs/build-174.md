Production-profile TestFlight build for Today Companion targeting and check-in notification gating.

Focus areas:
- Keeps Today Companion surfaces anchored to the actually readable or completed day after a devotional is completed, instead of drifting to a prepared tomorrow.
- Midday check-ins now save to the currently readable day; evening wind-down targets the day actually completed today.
- Bridge and tomorrow companion cards only target an unread currently readable devotional, reducing one-day-ahead companion prompts.
- Premium recurring notification sync now defers while entitlement policy is unknown without scheduling new premium reminders, but preserves existing midday and evening schedules until premium is definitively denied or onboarding is incomplete.

What to test internally:
1. Complete today's devotional, return to Today, and confirm companion, check-in, and evening cards refer to the completed/current day, not tomorrow.
2. Tap midday check-in and evening wind-down entries and confirm journal/reflection actions attach to the expected day.
3. If tomorrow is prepared but locked, confirm bridge/tomorrow companion copy does not jump ahead or expose the locked day as today's target.
4. Launch cold/offline or with premium state still resolving and confirm existing paid-user check-in/evening schedules are not wiped.
5. For non-premium or onboarding-incomplete states, confirm reminder scheduling still cancels appropriately.
6. Smoke Today, reading, journaling, library, highlighting, notification re-entry, and premium state transitions.

Notes:
- This build is produced from the production profile; QA tools should be disabled.
- Build 168 remains the current App Store version 1.0 attachment unless Nick separately approves replacing it.
- Do not submit for review, external beta, subscription changes, or public release without explicit approval.
