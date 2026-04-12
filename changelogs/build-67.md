# Build 67 — Churned User Experience + Win-Back Offers

## Added
- **Surgical creation gates** — non-premium users can browse all tabs but creation actions (new note, new journal entry, send companion message, new series, check-in, prayer, SOAP, questions) trigger paywall
- **ExclusiveOfferSheet** — one-time retention offer shown when Apple Pay is cancelled or on first churned-user creation gate hit
- **Win-back offering** — $44.99/yr annual plan via RevenueCat `winback` offering for churned users
- **Debug toggles** — reset exclusive offers + force win-back offer in debug settings
- **useCreationGate hook** — centralized premium gating for all creation actions

## Changed
- Removed TrialExpiredOverlay full-tab blocking — churned users can now browse freely
- Disabled inline reflection for non-premium users (no gate, just hidden)

## Fixed
- Onboarding tooltips not appearing (Fabric ref timing — use event.nativeEvent.layout instead of measureInWindow)
- Purchase state derived from CustomerInfo result, not second async call
- Apple Pay cancellation now intercepted with exclusive offer instead of silent dismiss
- Note creation gated for non-premium (was ungated before)

## What to Test

- [ ] Fresh install: complete onboarding, see tooltips on home screen
- [ ] After trial expires: verify all tabs are browsable (no blocking overlay)
- [ ] Tap "New Note" as churned user — should show paywall
- [ ] Tap "Send" in companion as churned user — should show paywall
- [ ] Tap "New Journal Entry" as churned user — should show paywall
- [ ] Tap "Add Series" / "Check In" as churned user — should show paywall
- [ ] Tap "Add Prayer" / "SOAP" / "Questions" as churned user — should show paywall
- [ ] On paywall, start Apple Pay then cancel — should see exclusive offer sheet
- [ ] Exclusive offer sheet should only appear ONCE (dismiss and try again — should not reappear)
- [ ] Win-back offer pricing shows $44.99/yr (not $59.99)
- [ ] Debug settings: "Reset Exclusive Offers" toggle works, "Show Win-Back Offer" toggle works
- [ ] Premium user: all creation actions work normally without gates
- [ ] Tooltips: "Next" advances through 5 steps, "Skip" dismisses, overlay tap dismisses
