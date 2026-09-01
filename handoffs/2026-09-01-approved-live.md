# Handoff — App Review approved, Unfold 1.0 live (2026-09-01)

## State

- **App Review: APPROVED.** The build 251 resubmission (see
  `2026-08-28-rejection-fix-resubmission.md`) passed. ASC shows the version as
  **Ready for Distribution**, which is Apple's post-approval "released" state
  (it replaced "Ready for Sale"). Nothing further is needed to "push" the app —
  it is already on the App Store.
- **Verified live (2026-09-01, ~15:00 UTC):**
  - Storefront page returns 200: https://apps.apple.com/us/app/unfold-personal-bible-study/id6760814444
  - iTunes lookup: version `1.0`, released `2026-09-01T14:32:20Z`, Free,
    Lifestyle, 4+, min iOS 16.4, 4 iPhone + 4 iPad screenshots.
  - Available in US, GB, CA, AU, DE; correctly absent in CN and SA (the
    territory removals from 08-28 took effect).
  - `unfoldapp.co`, `/terms`, `/privacy` all 200; `api.unfoldapp.co` root 200.
- `main` == `claude/unfold-app-store-distribution-pwou1p` at `69a3dac` + this
  note. No code changes since the 3.1.2(c) paywall fix (`37acae4`).

## Post-launch follow-ups (not blockers)

1. Confirm the first live purchase / trial start lands in RevenueCat
   (products `unfold_premium_monthly_v2`, `unfold_premium_yearly`).
2. Watch Sentry for release `1.0.0 (251)` crashes over the first 48 h.
3. Ratings/reviews are 0 — consider prompting via `StoreReview` after the
   first completed devotional (not on first launch).
4. `app.json` `buildNumber` is stale (`183`); EAS `appVersionSource: remote`
   is authoritative, so this is cosmetic. Next store build should bump
   `version` to `1.0.1`/`1.1.0` in ASC (remote) before `eas build --profile production`.
5. Android: `production` profile has `distribution: store` but no Play
   submission has been done — separate track.

## Tooling

- ASC API key (`AuthKey_NW2SL2F4ZN.p8`) is gitignored and not present in
  cloud sessions; live status was verified via the public storefront/lookup
  endpoints instead.
