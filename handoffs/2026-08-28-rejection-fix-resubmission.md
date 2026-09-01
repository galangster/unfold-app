# Handoff — App Review rejection fix + resubmission (2026-08-28, overnight session)

> **Outcome (2026-09-01): approved and live.** See `2026-09-01-approved-live.md`.

## State

- **Rejection (2026-08-28, submission `3298c2f4-27ff-48cc-aeab-796ce4cafdae`, build 250):**
  1. Guideline **3.1.2(c)** — yearly plan marketed as `$5.83/mo` (calculated)
     more conspicuously than the billed `$69.99/yr`; reviewer screenshot showed
     the onboarding ThreeStepPaywall pricing screen.
  2. Guideline **5.0 Legal Preamble** — app on sale in all 175 territories.
- **Code fix: DONE.** Commit `37acae4` on `main`, pushed. Billed amount is the
  primary price on both paywall surfaces; per-month equivalent subordinate;
  CTA "Try for $0.00" → "Start My Free Trial"; fabricated "Trusted by
  thousands · 4.8 ★" removed. 1280 jest tests pass, tsc + eslint clean,
  simplify pass applied. Visually verified on iPhone 17 Pro Max sim with live
  RevenueCat prices (before/after screenshots delivered in chat).
- **Territories: DONE.** ASC availability 175 → 165. Removed: CHN, AFG, BRN,
  LBY, MDV, MRT, SAU, TKM, UZB, YEM (religious-text distribution illegal or
  state-licensed). Verified server-side. Takes effect within 24 h; no
  resubmission required for this change.
- **Build 251: DONE.** EAS build `2f3e0ee0-051e-48b3-bcf1-0bc8278a30d8`
  (1.0.0 / 251), auto-submitted, processed by Apple (`VALID`), and **attached
  to App Store version 1.0** (`215fd90c-9f3a-407a-934d-27a687c12222`), whose
  state moved REJECTED → PREPARE_FOR_SUBMISSION.
- **Resubmission: DONE (2026-08-28 8:32 AM).** Resolved via the ASC UI: the "Update Review" button on the version page flipped the rejected item to Ready for Review (the step the public API could not perform), then "Resubmit to App Review" succeeded. All 5 items now Waiting for Review on build 251. The reply box closed on resubmission, so no Resolution Center reply was sent. Original blocker notes below for the record: `PATCH
  /v1/reviewSubmissions/3298c2f4-…` with `submitted: true` returns **409
  "Version is not ready to be submitted yet, please try again later"** — for
  4+ hours. Ruled out: encryption declaration (set, false), age rating
  (complete, incl. social-media questions), review detail, localizations,
  build attach (verified), detach/re-attach jiggle. An overnight retry loop
  is running (10-min intervals). The ASC **web session expired** mid-run, so
  the one-click UI path needs Nick's login + 2FA.

## Next actions (ordered)

1. Check whether the retry loop landed it:
   `cd <scratchpad> && bun asc.mjs GET "/v1/reviewSubmissions/3298c2f4-27ff-48cc-aeab-796ce4cafdae?fields[reviewSubmissions]=state"`
   — state `WAITING_FOR_REVIEW` means done.
2. If still `UNRESOLVED_ISSUES`: sign in at appstoreconnect.apple.com →
   Unfold → App Review → the Tuesday submission → **Resubmit to App Review**
   (build 251 is already attached; everything else is ready). If the UI shows
   a specific readiness error, that is the real blocker the API hides.
3. Optional but recommended: reply in the Resolution Center thread. Draft at
   scratchpad `resolution-center-reply.md` (update [BUILD_NUMBER] → 251):
   explains the 3.1.2(c) UI changes and the 10 removed territories.

## Tooling receipts

- ASC API helper: scratchpad `asc.mjs` (JWT from
  `app/mobile/keys/AuthKey_NW2SL2F4ZN.p8`, issuer
  `52f4e617-a4b3-4cee-bcd0-23f8e653d7b5`). Works for builds, versions,
  reviewSubmissions.
- Before/after screenshots: scratchpad `verify/*.png`.
- Local dev leftovers from a prior session (web-screenshot experiment) were
  archived to `app/mobile/tmp/prev-session-leftovers/` and reverted from the
  working tree (`app.config.js` deleted, `metro.config.js` restored).
- `ios/Podfile.lock` was regenerated locally to unbreak the sim build after
  the Gupter→PP Editorial font migration; deliberately NOT committed (EAS
  builds run their own pod install).
