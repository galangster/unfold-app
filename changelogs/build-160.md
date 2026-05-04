Build 160 — onboarding retry recovery

Fixes:
- Reconnects an already-generated onboarding sample devotional when retrying after app restart or anonymous-device state churn.
- Handles the production 409 DEVOTIONAL_ALREADY_EXISTS response by fetching the completed day instead of showing the retry error loop.
- Keeps first-time users anonymous through the existing device-id flow while preserving smooth onboarding recovery.

What to test:
- On a fresh install/reset, complete onboarding and confirm the first devotional opens.
- If onboarding is interrupted after the sample is generated, return to the devotional preparation step and confirm Try again reconnects the existing reading.
- Confirm repeated taps on Try again do not loop on “We couldn’t restart your devotional yet.”
