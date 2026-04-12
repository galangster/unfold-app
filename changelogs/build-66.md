# Build 66 — Honest Trial Copy (Per-User Eligibility)

## Fixed
- **Paywall no longer promises a "free trial" to users who aren't eligible.** The onboarding three-step paywall was branching on `!!product.introPrice` — which only tells you whether the SKU *has* an intro offer, not whether *this user* is eligible. Returning users who already consumed their trial (or users on a SKU where the intro offer isn't currently active in their App Store territory) were being shown "7 days free, then $X/yr" copy and a "Start Free Trial" CTA that actually charged them immediately. Apple Guideline 3.1.2 rejection risk.
- **Source of truth is now compound:** `yearlyHasFreeTrial = (yearly SKU has a zero-price intro offer) AND (RevenueCat confirms this user is ELIGIBLE)`. Either query unresolved, any error, or Android → defaults to `false`. Showing non-trial pricing to a trial-eligible user is a missed upsell; showing trial copy to an ineligible user is a lie. We default to honesty.
- **Trial reminder screen is now conditional.** When there's no trial to promise, the paywall is 2 screens (Product in Action → Pricing), not 3 — the middle "Trial Reminder" screen is skipped entirely, and `totalPages` adapts.
- **All trial copy surfaces flip when no trial is available:**
  - Headline: `"We want you to try Unfold for free."` → `"Unlock everything Unfold can do."`
  - CTA labels: `"Start Free Trial"` / `"Continue for FREE"` / `"Try for $0.00"` → `"Continue"` / `"Subscribe"`
  - Disclosure: `"7 days free, then $X/yr. Cancel anytime."` → `"$X/yr. Cancel anytime."`
  - "No Payment Due Now" reassurance row → hidden
- **Monthly-plan cadence is fixed.** Previously if the user switched to monthly on the pricing screen while a yearly trial was eligible, the disclosure still said `"7 days free, then $Xyr"` (wrong cadence, and promising a trial on a plan whose eligibility wasn't checked). Monthly now always shows `"$X/mo. Cancel anytime."` regardless of the yearly flag.
- **Async-latch to prevent mid-flow remapping.** Offerings + eligibility resolve asynchronously, so `hasFreeTrial` can flip false → true milliseconds after the paywall mounts. Without latching, `totalPages` would jump 2 → 3 while the user was already navigating, remapping pages in place. `stableHasFreeTrial` is latched via `useState(() => hasFreeTrial)` on first render, and only updates while the user is still on page 0.

## Backend
- No backend changes in this build.

## What to Test
- [ ] **Fresh install on a new device, Apple ID with no trial history** — expect full 3-step paywall, "Start Free Trial" CTA, "7 days free" disclosure, "No Payment Due Now" row visible.
- [ ] **Fresh install on a device whose Apple ID previously used the trial** — expect 2-step paywall (no Trial Reminder screen), headline reads "Unlock everything Unfold can do.", CTA reads "Subscribe", disclosure reads "$X/yr. Cancel anytime." (no "free" anywhere).
- [ ] **Switch to monthly plan on pricing screen while trial is eligible** — disclosure should flip to `"$X/mo. Cancel anytime."`, CTA should say "Subscribe", "No Payment Due Now" row should disappear.
- [ ] **Switch back to yearly** — trial copy should return.
- [ ] **Sandbox tester: consume trial, sign out/in, reopen onboarding** — expect the ineligible-user path (no trial claims).
- [ ] **Slow network / airplane mode during paywall mount** — expect ineligible-user path (fail-closed defaults), NOT trial copy then a flip.
- [ ] **Tap "Start Free Trial" then cancel the Apple sheet** — no state corruption, paywall still navigable.
- [ ] **Complete purchase with a real trial-eligible account** — receipt comes back as trial, premium unlocks, no "already paid" confusion.
- [ ] **Restore purchases** on an expired-trial account — entitlement restores correctly, paywall doesn't re-appear claiming a trial.
- [ ] **Verify no regressions from build 64** — fresh install still lands on home without auth prompts, existing users keep library/highlights/premium.
