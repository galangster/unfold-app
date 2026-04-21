# Unfold — Final App Store Submission Checklist

## Purpose
Use this as the final go/no-go sheet before submitting Unfold to App Review / TestFlight.

Primary supporting docs already prepared:
- `APP_REVIEW_NOTES_DRAFT.md` — fuller internal + reviewer guidance notes
- `APP_REVIEW_NOTES_ASC_READY.md` — short App Store Connect paste-ready review notes
- `APP_REVIEW_ASSETS_CHECKLIST.md` — screenshots + app preview capture checklist

---

## 1) App Review notes
### Required
- [ ] Paste `APP_REVIEW_NOTES_ASC_READY.md` into App Store Connect review notes
- [ ] Confirm the notes still accurately describe the current onboarding -> paywall -> discovery -> generating -> reading flow
- [ ] Confirm the “no reviewer login required” statement is still true for the build being submitted

### Current reviewer messaging should include
- [ ] personalized devotional generation
- [ ] no login required for core flow
- [ ] subscription/paywall present
- [ ] restore purchases available
- [ ] companion is not therapy/crisis support
- [ ] legal links

---

## 2) Screenshots
### Core screenshot set
- [ ] onboarding/discovery
- [ ] paywall
- [ ] generating
- [ ] today
- [ ] reading
- [ ] journal/notebook
- [ ] Bible
- [ ] companion

### Screenshot quality rules
- [ ] no debug/dev controls visible
- [ ] no permission/system alerts
- [ ] no keyboard unless intentionally desired
- [ ] no partial typing / broken-looking input states
- [ ] no loading / bundling / refresh artifacts
- [ ] no onboarding coach overlays
- [ ] pricing shown is current if a paywall screenshot is used
- [ ] text is readable and polished at a glance

### Recommended order
- [ ] onboarding
- [ ] paywall
- [ ] generating
- [ ] today
- [ ] reading
- [ ] journal
- [ ] Bible
- [ ] companion

Reference:
- `APP_REVIEW_ASSETS_CHECKLIST.md`

---

## 3) App preview / screen recording (recommended, not required)
### Decision
- [ ] decide whether to include a short preview video

### If yes, recommended sequence
- [ ] onboarding
- [ ] paywall
- [ ] generating
- [ ] reading
- [ ] journal / Bible / companion

### Recording rules
- [ ] no Metro/dev launcher UI
- [ ] no accidental notifications/popups mid-recording
- [ ] no awkward long typing sequences
- [ ] no UI that implies therapy/medical/crisis claims
- [ ] first 5 seconds clearly explain what the app is

Reference:
- `APP_REVIEW_ASSETS_CHECKLIST.md`

---

## 4) Subscription / paywall sanity
- [ ] App Store Connect subscription products are active and correctly configured
- [ ] paywall pricing matches live product metadata
- [ ] billing cadence is clearly understandable
- [ ] restore purchases flow is working
- [ ] terms/privacy links are visible and current
- [ ] free trial messaging matches the actual configured intro offer

Current legal links used by app:
- [ ] `https://unfoldapp.co/terms`
- [ ] `https://unfoldapp.co/privacy`

---

## 5) Privacy / permissions / compliance
### Privacy labels
- [ ] App Privacy / nutrition labels match real SDK + backend data handling
- [ ] Sentry / RevenueCat / notifications / any analytics disclosures are aligned with App Store Connect answers

### Permissions copy
Confirm these are still appropriate and justified by actual features:
- [ ] Notifications
- [ ] Microphone / Speech Recognition
- [ ] Photos

### Background modes
Confirm the current submission still intentionally declares:
- [ ] `audio`
- [ ] `fetch`
- [ ] `remote-notification`

---

## 6) Reviewer confusion reducers
- [ ] App Review notes mention the personalized devotional generation flow
- [ ] screenshots show the app as a devotional product, not a generic chat app
- [ ] companion screenshots/copy do not imply therapy, counseling, or emergency response
- [ ] generating + reading surfaces are visible enough to explain the core loop
- [ ] if paywall is early in the flow, screenshots/notes make that feel intentional and understandable

---

## 7) Build / runtime confidence checks
### Already hardened recently
- [x] release-facing debug/dev surfaces gated away from non-dev builds
- [x] premium gating consolidated/hardened
- [x] devotional generation reconciliation hardened
- [x] notification preference formatting hardened
- [x] notebook create/edit/save/persist verified
- [x] native notebook scripture insertion fixed to insert at active cursor/selection instead of always appending to bottom
- [x] onboarding step filtering re-aligned with actual flow state
- [x] branch merged to `main`

### Final sanity before submission
- [ ] submission build produced from current intended `main`
- [ ] smoke test the actual submission/TestFlight build
- [ ] verify no dev-only routes/tools are reachable in that build
- [ ] verify paywall renders cleanly in the submission build
- [ ] verify generating -> reading works in the submission build
- [ ] verify Journal / Bible / Companion at least open cleanly in the submission build

---

## 8) Suggested final operator order
1. [ ] confirm latest `main` is the intended submission source
2. [ ] paste App Review notes from `APP_REVIEW_NOTES_ASC_READY.md`
3. [ ] upload/select final screenshots
4. [ ] optionally upload preview video
5. [ ] verify subscriptions / pricing / trial copy in App Store Connect
6. [ ] verify privacy labels and permissions disclosures
7. [ ] install and smoke-test the final TestFlight/submission build
8. [ ] submit

---

## 9) Final go / no-go call
### GO if all are true
- [ ] reviewer notes are pasted and accurate
- [ ] screenshots are current and polished
- [ ] paywall/subscription details are accurate
- [ ] privacy labels are accurate
- [ ] final build smoke test is clean
- [ ] no known release-blocking issue remains

### NO-GO if any are true
- [ ] screenshots show stale or misleading UI
- [ ] subscription/trial copy does not match live products
- [ ] privacy labels are not reconciled with actual SDK/data handling
- [ ] final build still exposes dev/debug routes or tools
- [ ] a core flow (onboarding/paywall/generating/reading) is broken in the actual submission build
