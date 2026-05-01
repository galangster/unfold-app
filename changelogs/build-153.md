Build 153 - paywall purchase diagnostics QA build

What to test:
- Update this same TestFlight install in place.
- Open the paywall and confirm the selected monthly/yearly package still appears normally.
- Tap Monthly once only if the account is still non-premium.
- Note whether the native Apple purchase sheet appears before any app message.
- If premium does not activate, stop repeated retries so we can inspect the device logs and diagnostic file.
- Restore should still only succeed when RevenueCat reports active Unfold Premium.

Diagnostic focus:
- QA-gated paywall diagnostics are enabled for this TestFlight build.
- The app records paywall environment, offerings, selected package, purchase start, RevenueCat result, restore result, and customer info listener updates.
- Diagnostics are sanitized to avoid raw app user IDs, transaction IDs, receipts, auth tokens, JWTs, and RevenueCat keys.
- Premium guardrails remain fail-closed: no local unlock without active Unfold Premium.
