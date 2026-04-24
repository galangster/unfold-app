# Unfold — App Review Notes

## Summary for App Review
Unfold is a Christian devotional, Bible reading, and journaling app.

The main first-run experience is:
1. onboarding questions
2. premium/paywall step
3. devotional setup/discovery questions
4. devotional generation
5. reading, journaling, Bible, and companion features

The app’s primary tabs are:
- **Today** — current devotional and daily progress
- **Bible** — scripture reading and highlights
- **Companion** — guided spiritual support / reflection chat
- **Journal** — notebook notes and reflections

## Current release candidate
- iOS app version/build: **1.0.0 (137)**
- Bundle id: `com.unfoldapp.ios`
- App Store Connect app id: `6760814444`
- Backend used by the production build: Railway production URL configured through `EXPO_PUBLIC_BACKEND_URL`
- The Bible database download now uses the configured backend URL as well, so it does not depend on the custom API root domain.

## Reviewer access / account requirements
- **No reviewer login is required** to access the core app flow.
- The core onboarding and devotional-generation flow can be exercised without creating a separate reviewer account.
- Push token registration is device-based/anonymous in the current app flow.
- If Sign in with Apple capability is present in the app configuration, it is not required for basic review of the main user experience.

## Best reviewer path
For the clearest first review pass, please follow this path:
1. Open the app.
2. Complete onboarding.
3. Continue through the premium/paywall step.
4. Complete the devotional setup questions.
5. Wait on the generating screen for devotional creation to finish.
6. Review the generated devotional in **Today** / reading flow.
7. Optionally inspect **Journal**, **Bible**, and **Companion**.

## Premium / subscription notes
- The app includes a subscription paywall for premium access.
- **Restore Purchases** is available in the paywall flow.
- Terms and Privacy links are available in the paywall/legal surfaces.
- App Store Connect currently shows the Unfold Premium monthly and yearly products as `READY_TO_SUBMIT`.
- App Store Connect introductory-offer readback shows a **3-day free trial** for the monthly and yearly products.
- Legal links used by the app:
  - https://unfoldapp.co/terms
  - https://unfoldapp.co/privacy

## AI / generated content notes
- The app generates devotional content personalized to the user’s onboarding answers and selected context.
- The app also includes a guided companion/chat surface for spiritual support and reflection.
- This companion experience is **not** intended to represent professional counseling, therapy, crisis support, or emergency response.
- The devotional generation flow is structured/product-guided rather than an unrestricted open-ended chatbot experience.

## Permissions used in the app
The app may request the following permissions depending on feature use:
- **Notifications** — devotional reminders and check-in reminders
- **Microphone / Speech Recognition** — voice input / dictation features
- **Photos** — saving or sharing devotional images/content

## Background modes declared
The iOS app declares these background modes:
- `audio`
- `fetch`
- `remote-notification`

These support audio playback and notification-related behavior.

## Notes that may reduce reviewer confusion
- The onboarding flow is important to the app’s core value proposition; the generated devotional experience is intentionally personalized from those answers.
- After paywall completion/skip, users continue into devotional setup/discovery before generation.
- The app contains journaling/notebook features in addition to devotional reading.
- Companion/chat is a supporting reflection feature, not a claim of medical, psychiatric, or crisis expertise.

## Submission checklist
Before final submission, confirm:
- [ ] App Privacy / nutrition labels match actual SDK + backend data handling
- [ ] Subscription metadata in App Store Connect is accurate and attached to the app version
- [ ] Paywall pricing, billing cadence, restore flow, terms, and privacy are all current
- [ ] Screenshots reflect the current onboarding -> paywall -> discovery -> generating -> reading flow
- [ ] Build 1.0.0 (137) is selected/attached instead of superseded build 136
- [ ] Review notes mention personalized devotional generation and the premium flow
- [ ] Real-device notification tap routing and onboarding generation have been smoke-tested
- [ ] If desired, attach an app preview video to reduce reviewer confusion (recommended, not required)

## Internal QA notes (not for App Store Connect copy, but useful for submission confidence)
### Verified in recent hardening pass
- Release-facing dev/debug surfaces are gated away from the production profile.
- Premium purchase/restore code checks for the active `Unfold Premium` entitlement before granting local premium state.
- Devotional generation ownership, onboarding sample identity, and prompt-example authority were hardened across backend/mobile.
- Production backend health check returns DB connected.
- App Store Connect reports build 1.0.0 (137) as valid.
- App Store Connect subscription readback shows 3-day free trials for the main monthly/yearly subscriptions.

### Remaining confidence gaps
- RevenueCat dashboard offering/package/entitlement wiring could not be rechecked from Mina yet because the RevenueCat MCP server is not currently visible in this profile and browser-harness needs Chrome CDP approval.
- The project `verify:release` script passed, but its device-flow step skipped because no installed Unfold bundle was discovered.
- Real-device notification tap-through and full purchase/restore sandbox QA still need hands-on confirmation before public launch.
