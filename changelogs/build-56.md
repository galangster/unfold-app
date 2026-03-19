# Build 56 — March 18, 2026

**Commit:** eb506f4 | **Branch:** main
*(Changes since Build 28, March 12)*

---

## New

- **Unified note editor** — Read and edit notes on the same screen. Tap Edit/Done to toggle. No more screen transitions or white flash.
- **Notebook system** — Folders, folder chips filter, move-to-folder, scripture search in editor, swipeable note cards with delete/move actions.
- **Night Sky evening celebration** — New celebration animation when completing your evening wind-down.
- **Voice input** — Dictate into journal entries and check-in responses.
- **Bible reader overhaul** — Section headings, improved verse display, App Store compliance (AI consent disclosure, account deletion).
- **Bible study methods** — Study method badges, cross-series tracking.
- **Onboarding redesign** — Swipeable how-it-works pages, restructured flow, smooth orb animation.
- **Paywall redesign** — New layout, share card save, RevenueCat pricing.
- **Sentry error tracking** — Crash reporting now active.
- **Encrypted storage** — Sensitive data now stored securely.

## Fixed

- No more white flash during screen transitions
- Segmented control tab slider no longer bounces
- Note body text loads instantly (no delay)
- App icons no longer have dark corners
- Voice, color picker, keyboard, and share bugs resolved
- Celebration message copy cleaned up
- Comprehensive security and accessibility audit applied

---

## What to Test

### Notes (most important)
- [ ] Journal > Notebook > open a note > tap Edit > tap Done
- [ ] Tap + to create new note > type > go back
- [ ] Switch Reflections/Notebook tabs — smooth slide
- [ ] ··· menu — favorite, move to folder, delete (double-tap to confirm)

### Transitions
- [ ] Navigate between all screens — no white flash at edges
- [ ] Tab switching animations feel crisp, no bounce

### New Features
- [ ] Evening celebration after completing reading
- [ ] Voice input in journal
- [ ] Bible reader chapter navigation and section headings
- [ ] Onboarding flow (fresh install or clear data)
- [ ] Paywall screen appearance and pricing

### General
- [ ] Devotional generation works end-to-end
- [ ] Streak tracking updates correctly
- [ ] Share card saves to photos
