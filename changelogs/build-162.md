Internal QA TestFlight build.

Focus areas:
- Onboarding sample generation now sends the selected writing style plus relationship, growth goals, and obstacles so Day 1 personalization has the same context as regular generation.
- Onboarding completion now preserves the existing writing style and marks style onboarding complete for returning users.
- Regular generation payloads now include the same pastoral personalization fields.
- Store user updates refresh userUpdatedAt so cached personalization is not treated as stale.
- Added regression coverage for onboarding sample defaults and style/pastoral field propagation.

QA notes:
- QA tools are enabled in this build only for internal TestFlight testing.
- Use the QA beginning reset and deep-link tools to replay first-run onboarding; reset data intentionally clears first-run/onboarding state while preserving the stable device id, so an old recovered Day 1 can still appear until the backend sample is regenerated for that device.
- Production/App Review build remains separate; do not attach build 162 to App Store review.
- Real purchase/restore activation still depends on App Store Connect subscription review and RevenueCat returning the active Unfold Premium entitlement.
