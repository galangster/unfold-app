# Unfold — App Review Notes

## Summary for App Review
Unfold is a Christian devotional, Bible reading, and journaling app.

The main first-run experience is:
1. onboarding questions
2. premium/paywall step
3. short subscription confirmation when purchase succeeds
4. devotional setup/discovery questions
5. devotional generation
6. reading, journaling, Bible, and companion features

The app’s primary tabs are:
- **Today** — current devotional and daily progress
- **Bible** — scripture reading and highlights
- **Companion** — guided spiritual support / reflection chat
- **Journal** — notebook notes and reflections

## Current release / submission state as of 2026-05-01
- Bundle id: `com.unfoldapp.ios`
- App Store Connect app id: `6760814444`
- App Store version: `1.0`
- App Store version id: `215fd90c-9f3a-407a-934d-27a687c12222`
- Current App Store version state before this resubmission lane: `DEVELOPER_REJECTED`
- Current attached App Store build before this lane: build `148`
- Latest valid uploaded build before this lane: build `153`, but build `153` was a QA/TestFlight diagnostics build with `EXPO_PUBLIC_ENABLE_QA_TOOLS=1`; it should not be treated as the final App Review binary.
- Intended next step: create and attach a clean production-profile App Review build with QA tools disabled, then rerun preflight and submit after the intended build is attached.
- Backend used by the production build: `https://api.unfoldapp.co` via `EXPO_PUBLIC_BACKEND_URL`.
- The Bible database download uses the configured backend URL, so it does not depend on a generic custom API root-domain request succeeding.

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
- App-side premium access remains fail-closed: premium is granted only when RevenueCat reports an active `Unfold Premium` entitlement.
- The intended review subscriptions are:
  - Unfold Premium Monthly — `unfold_premium_monthly_v2` — currently `WAITING_FOR_REVIEW`
  - Unfold Premium Yearly — `unfold_premium_yearly` — currently `WAITING_FOR_REVIEW`
- App Store Connect introductory-offer readback shows a **3-day free trial** for monthly/yearly where the customer is eligible.
- The yearly win-back subscription (`unfold_yearly_winback`) remains `READY_TO_SUBMIT` separately and is not the core first-review purchase path.
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
- [x] Screenshots reflect the current onboarding -> paywall -> discovery -> generating -> reading flow enough for App Review; live ASC assets were dimension-checked and visually reviewed on 2026-05-01. Future marketing optimization can add a clearer premium/paywall screenshot, but the current set has no visible debug/error states.
- [ ] A clean production-profile build is uploaded, processed, and explicitly attached to App Store version `1.0`
- [ ] App Store Connect preflight passes after the intended build is attached
- [ ] Review notes mention personalized devotional generation and the premium flow
- [ ] Real-device notification tap routing and onboarding generation have been smoke-tested as far as practical before release
- [ ] If desired, attach an app preview video to reduce reviewer confusion (recommended, not required)

## Internal QA notes (not for App Store Connect copy, but useful for submission confidence)
### Verified in recent hardening pass
- Release-facing dev/debug surfaces are gated away from the production profile.
- QA paywall diagnostics are gated by `EXPO_PUBLIC_ENABLE_QA_TOOLS=1`; the production profile does not set that flag.
- Premium purchase/restore code checks for the active `Unfold Premium` entitlement before granting local premium state.
- Build 153 TestFlight diagnostics verified the app selected the correct monthly product (`unfold_premium_monthly_v2`) and correctly refused premium unlock when RevenueCat/StoreKit did not produce an active entitlement.
- Build 153 device receipt inspection showed no fresh active transaction after the failing sandbox tap/restore, so the next lane is App Store/subscription lifecycle review rather than local fake premium unlocks.
- Production backend health and custom domain behavior have been previously checked; generic `api.unfoldapp.co` curl may 403 without an app/browser User-Agent.
- App Store Connect reports monthly/yearly subscriptions in `WAITING_FOR_REVIEW`; this submission lane is intended to move the app version/subscriptions through review together.

### Remaining confidence gaps
- Build 153 was diagnostic-only; the final App Review build must be a clean production-profile build.
- The currently attached App Store build was stale (`148`) before this lane; the intended processed production build must be explicitly attached before submission.
- A clean purchase-to-`Unfold Premium` verification may need to wait until App Store/subscription review moves the products out of `WAITING_FOR_REVIEW` / `action_in_progress`.
