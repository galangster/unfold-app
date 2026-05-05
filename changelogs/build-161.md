Internal QA TestFlight build.

Focus areas:
- Onboarding paywall now has a QA-only "Continue for QA" path so internal testers can finish onboarding while Apple/RevenueCat subscription activation remains blocked upstream.
- The QA continue path does not fake premium, does not persist premium, and remains hidden from production/App Review profiles.
- Paywall plan cards and onboarding selection cards now use brighter accent selected states instead of dimmed/pressed-looking cards.
- Added regression coverage for onboarding/paywall selected-state styling and QA paywall gating.
- Added Today tab Endel-inspired animation concept notes for future Rive/native motion exploration.

Notes:
- QA tools are enabled in this build only for internal TestFlight testing.
- Production/App Review build remains separate; do not attach this build to App Store review.
- Real purchase/restore activation still depends on App Store Connect subscription review and RevenueCat returning the active Unfold Premium entitlement.
