# Handoff — P0 onboarding restart fixed, 1.1.0 released, 1.1.1 in review (2026-09-03)

## The bug

Onboarding kept every answer in React state and wrote the user record only on
its final step, which sits behind a paywall with no exit. Anyone who closed the
app at that paywall relaunched as a brand-new install and was asked their name
again. It also silently hit people who had already started a trial, because
`updateUser` no-ops while the user record is null.

Full diagnosis, evidence and design: `plans/08-p0-onboarding-restart.md`.

## Release state

| Version | Build | State |
|---|---|---|
| 1.1.1 | 254 | **Waiting for Review** (submission `7d4bf0d2-928a-4ed2-b89f-7953f93405f3`, submitted 2026-09-03 21:06 UTC) |
| 1.1.0 | 253 | Released to the App Store today, live on the storefront |
| 1.0 | 251 | Superseded |

1.1.0 was found sitting in Pending Developer Release, already approved and
never shipped. It was released rather than discarded: it carries ~90 fixes,
and the onboarding bug only affects people mid-signup, who were hitting it on
1.0 anyway. 1.1.1 follows with the fix.

Release type is MANUAL, matching 1.0 and 1.1.0, so **1.1.1 will need the
Release button once approved.**

## What shipped in 1.1.1

- Onboarding answers persist to an MMKV draft from the name step on, 300ms
  debounce with a 1.5s ceiling, plus a synchronous flush on background.
- `resolveOnboardingResumeStep` decides re-entry: never a cutscene, payoff or
  marketing beat; holds at or after the reading step once a devotional exists;
  skips the paywall for someone who already bought.
- The sample-job pointer survives delivery, so a resumed session shows the same
  devotional instead of generating a second one.
- A warm welcome-back beat after 30 minutes away. Its copy does not promise the
  devotional opens next when the next screen is the subscription pitch.
- "I'll decide later" on the final paywall page: completes onboarding without
  premium, seeds the sample devotional into the store, never starts a paid
  generation. Creation from Today then hits the existing `useCreationGate`.
- A purchase inside `ExclusiveOfferSheet` now advances the flow. It previously
  charged the card and left the buyer on the paywall.
- Keychain items migrate to `AFTER_FIRST_UNLOCK` under `-v2` names, read
  v2-then-v1, copy forward, never delete v1. A Keychain throw is unproven
  absence and can no longer mint a replacement identity. A storage-locked
  session renders a recovery screen above the whole tree.

## Verification

219 Jest suites / 1854 tests green, 0 lint errors, 0 type errors in `src`.
Simulator walkthrough with hard process kills at the name step and at the
paywall: both resume to the right step with answers intact and no welcome
screen. Details in the plan.

## Open items

1. **Release 1.1.1 when approved** (manual release type).
2. Anthony's original answers are unrecoverable; they were never sent to the
   server. His sample devotional is on the server under his device id and
   returns through sync. Suggested reply is in the plan, section 5.
3. Seven simplify-pass follow-ups are recorded in the plan. The largest are one
   shared device-scoped record store, and moving the never-replay property onto
   the step definitions.
4. **No mobile telemetry or crash reporting.** `src/lib/analytics.ts` imports
   `mockFirebaseAnalytics`, so there is no funnel data; this incident was only
   visible because the backend logs a sync uid. Lane 4 in the plan.
5. `main` has the native version bump now. The `release/1.1.0` branch also
   swapped the ASC key to `38BW73P7M5`, whose `.p8` is not on this machine;
   main still uses `NW2SL2F4ZN`, which works.

## Tooling notes

- ASC API helper pattern is in the plan; key `NW2SL2F4ZN`, issuer
  `52f4e617-a4b3-4cee-bcd0-23f8e653d7b5`, key file `keys/`.
- The release call returned HTTP 500 but had actually succeeded. Always re-read
  the version state before retrying an ASC write.
- Pushing needs the `galangster` GitHub account; the active `gh` account is
  `NickMetaDAO` and lacks write access. Scope it per command rather than
  switching the global account.
