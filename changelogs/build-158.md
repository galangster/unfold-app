Beginning reset internal TestFlight QA build.

What changed:
- Added a QA-only beginning reset deep link for replaying the first-run/onboarding path from a returning-user TestFlight install.
- The reset preserves the stable Unfold device ID while clearing targeted onboarding, first-run, paywall confirmation, local devotional, QA preview, and session-only QA premium state.
- The You screen now links to the reset route only when QA tools are enabled.
- Added route tests to guard that the reset stays QA-gated and preserves the device identity key.

What to test:
1. Install this internal QA TestFlight build only. Do not use it for App Review or external beta distribution.
2. From an existing/returning-user install, open unfold://debug-reset-beginning.
3. Confirm the app returns through the normal first-run/onboarding path instead of landing in a stale returning-user state.
4. Complete the early onboarding/paywall-confirmation/discovery path and check for obvious stale state or duplicate generated samples.
5. From the You tab, confirm the QA beginning-reset entry is visible only in this QA build.
6. After using QA routes, reset local app data before testing real onboarding, purchases, restore purchases, or App Review behavior.

Notes:
- This is a QA-gated TestFlight build with EXPO_PUBLIC_ENABLE_QA_TOOLS=1.
- QA tools are for internal validation only and should not be used as production entitlement proof.
- Production/App Review build 154 remains separate and should not be replaced by this QA build.
