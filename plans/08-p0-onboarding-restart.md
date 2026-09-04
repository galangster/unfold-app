# P0 — Returning users are sent through onboarding again

Investigated 2026-09-03 by Fable 5.1. Report: a new user (Anthony Galang)
completed onboarding and "created a devotional series" on the evening of
2026-09-02, then opened the app on the morning of 2026-09-03 and was taken
through onboarding, including name entry, from the start.

## 1. Diagnosis

**Root cause: onboarding never persists anything until its final step, and
the final steps sit behind a hard paywall.** Every answer lives in React state
(`data` / `dataRef`) in `src/app/onboarding.tsx`. The user record is written
only by `saveOnboardingData()` (line ~1037), which is called only from
`proceedToGeneration()` (line ~1116) on the LAST step (`reminderTime`). The
"first devotional" the user sees is the onboarding *sample* job, submitted at
`devotionalSegue` and read at `readDevotional`, which comes long before that
last step. The step order is:

```
hook → solution → unfoldIntro → name → aboutMe → relationshipWithGod →
bibleFrequency → shockStat → growthGraph → growthGoals → obstacles →
keyPeople → aspiration → vulnerabilityValidation → mirrorBack →
featureSummary → founderNote → devotionalSegue → readDevotional →
celebration → commitment1 → commitment2 → threeStepPaywall →
purchaseConfirmation → themeType → studySubject → currentSituation →
diagnosticRound → spiritualSeeking → upcomingEvent → readingDuration →
devotionalLength → reminderTime → [save + /generating]
```

`threeStepPaywall` (`src/components/onboarding/ThreeStepPaywall.tsx`) has no
forward exit in a production build other than a purchase or a Restore that
finds an existing entitlement (line ~1300). The only skip control is
`Continue for QA`, gated by `isQaToolsEnabled()` (line ~1426), which returns
false unconditionally for the `production` EAS profile
(`src/lib/build-profile.ts:70`). The screen has no close control, the stack
sets `gestureEnabled: false` (`src/app/_layout.tsx:197`), and swipes only
rotate review cards. So a user who reads their sample devotional, hits the
paywall, and closes the app has "finished" in their own mind, but
`store.user` is still `null`. On the next launch `src/app/index.tsx` finds no
user and renders the welcome screen; the Continue button routes to
`/onboarding`, and `getInitialOnboardingStepId()`
(`src/lib/onboarding-step-helpers.ts:213`) starts at `hook` with an empty
form. Name is asked again. The same code ships in 1.0 (build 251, live) and
1.1 (build 253).

**This also hits paying users.** `updateUser` returns early when `user` is
null (`src/lib/store.ts:896-898`), so the paywall's
`onPurchaseSuccess → updateUser({ isPremium: true })` is a silent no-op for a
first-run user, and `purchasedDuringOnboarding` is React state. Someone who
starts the trial and then closes the app before the final `reminderTime` step
relaunches at `hook` with nothing saved and must find Restore Purchases on
their own. Every `updateUser` call earlier in onboarding has the same
problem, including the companion name at `featureSummary`.

**Adjacent money bug found while verifying.** A purchase completed inside
`ExclusiveOfferSheet` (shown when the user cancels the main purchase) never
calls `onPurchaseSuccess`; `onDismiss` only sets a seen flag and closes the
sheet (`ThreeStepPaywall.tsx:1510-1513`). That buyer is charged and stays on
the paywall. Fix it in the same release.

Contributing defect: the app has no way to know a user *started*. Nothing is
written to the store, MMKV, or the server about the person until the last
step. The only durable artifact is the sample-job record
(`src/lib/onboarding-sample-job-store.ts`), which exists solely to avoid a
duplicate job and does not resume the flow.

### Evidence (production backend, Railway project `unfold-backend`)

Two brand-new devices installed on the evening of 2026-09-02 (times UTC;
subtract 7 h for Pacific). Both are on `Unfold/1.0.0`.

| uid | first pull | mirror-back | sample job | sample done | paywall / trial | real series job | profile pushed | pulls on 9/3 |
|---|---|---|---|---|---|---|---|---|
| `anon_583f924a-…97803` | 01:58 | 02:08:37 | 02:08:23 (stalled 5 min by a backend deploy at 02:07–02:08, retried once) | 02:14:35 | none | none | never | 13:49, 13:50 |
| `anon_9ad893e6-…e520` | 02:13 (since=null) | 02:31:23 | 02:31:04 | 02:31:38 | none | none | never | 15:09 (received the 2 sample rows for the first time) |

- `sync_users` has 20 rows, all Nick / QA / Dev / Dino / Mi Young. Neither
  device has a row. A row is written 1 s after `setUser` by
  `useUserProfileSync`, so `setUser` never ran on either device.
- `generation_jobs` for both devices contain only the `onboarding` job with
  `devotional_id = onboarding-sample-<uid>`. No `generate-day` job, so
  `/generating` was never reached.
- `ai_usage` for both devices stops at `onboarding-generation` + `validation`.
  The next server call in the flow is `/api/generate/adaptive-question`
  (`diagnosticRound`, after the paywall). Neither device made it.
- No RevenueCat trial: no `is_premium` row, no purchase-confirmation step.
- Both devices kept the same identity and the same `since` cursor across the
  night, so Keychain, MMKV, and the device id were intact. This is not data
  loss; it is data that was never written.
- Anthony is one of these two devices; the server cannot say which because
  no profile was ever sent.

### Ruled out

- Store migration v40 → v42 in 1.1: both devices are on 1.0.0; no migration ran.
- MMKV wipe or encryption-key loss: the `unfold-last-pulled-at` cursor (same
  MMKV file as the store blob) survived on both devices.
- Identity rotation / full reset: same uid before and after; the 1.0 error
  boundary has no reset button; no server erase was requested.
- Server pull overwriting `user`: `full-sync-pull.ts` never touches `user`.

### Second defect — latent, same symptom, unproven population

`src/lib/mmkv-storage.ts` reads the MMKV encryption key and the device id
from `expo-secure-store` at JS module init with the library default
`keychainAccessible = WHEN_UNLOCKED`. If that read throws (iOS returns
`errSecInteractionNotAllowed` when the process starts while the device is
locked), the app boots into the throwaway `unfold-store-v2-recovery`
namespace, which is cleared on open. The store hydrates empty, a fully
onboarded user lands on the new-user welcome screen and can only go to
onboarding from there, `getDeviceId()` hands out an `ephemeral-` id, and no
screen explains anything (`isRecoverySession()` has no UI consumer at all).
During that session `useCheckInNotifications` also cancels the midday
check-in and evening wind-down schedules because `hasCompletedOnboarding`
reads false.

How likely is the trigger? Narrower than it first looks. The backend's only
push sender emits a visible alert with no `_contentAvailable`
(`backend/src/lib/push-notifications.ts:96-112`), and a visible push does not
launch a terminated app. The `fetch` background mode in
`ios/Unfold/Info.plist:123` comes from the auto-applied legacy
`expo-background-fetch` plugin and no JS ever registers a task. `audio` does
not launch a terminated app either. That leaves iOS prewarming, and the
recovery session only reaches a person if that process survives until they
foreground it. So this did not cause the reported incident and the affected
population is speculative. Fix it anyway: it is cheap, the symptom is
identical, and it will be indistinguishable from Lane 1 in the next report.

### Observability gaps found on the way

- The mobile app has no crash reporter. `bug-logger` writes to local
  AsyncStorage and only uploads on user action.
- `src/lib/analytics.ts` imports `mockFirebaseAnalytics`. There is no funnel
  data anywhere; `onboarding_step_completed` events go nowhere.
- Railway `get-logs` returns the latest deployment only; last night's deploy
  at 02:07–02:08 UTC hid the first ten minutes of device `583f924a`.

### How this was verified

Two independent reviewers were run against the codebase and told to refute
the diagnosis, one per claim. Both returned "not refuted" at high confidence
with file-and-line citations. Their corrections are already folded in above:
the `commitment1` / `commitment2` steps, Restore Purchases as a non-QA
forward exit, the `updateUser` no-op that extends the bug to paying users,
the `ExclusiveOfferSheet` purchase that never advances, the fact that
`index.tsx` renders the welcome screen rather than auto-routing, and the
narrower trigger surface for the Keychain defect.

## 2. Product decision needed from Nick (blocks nothing below, changes copy)

The fix below is monetization-neutral and assumes the hard paywall stays. A
person who declines still cannot use the app. What changes is that they keep
their answers and their devotional, and they re-enter on a warm screen rather
than a wall.

**Decided by Nick, 2026-09-03: add the exit.** The paywall was the only screen
in the app a person could not leave. Force-quitting was the exit, which is
exactly how this bug reached a user. The final paywall page now carries a
low-emphasis "I'll decide later".

What it does: completes onboarding with `isPremium` false, seeds the sample
devotional into the store so Today has content immediately, clears the draft,
and lands the person on Today. It never routes to `/generating`, because an
unpaid person must not trigger a paid generation.

Why it is safe. The app already gates creation for non-premium people through
`useCreationGate`, so a create action from Today reaches the paywall through
machinery that exists today. Someone who later wants a series re-enters
onboarding, where `getFilteredOnboardingSteps` already skips the marketing
steps and the paywall for a completed user and asks only the remaining
personalisation questions. The trial offer is one tap away from Today rather
than one force-quit away from nothing.

A fuller free tier is a larger product decision and is not in this plan.

## 3. Fix plan

Optimised for the returning person, not for the smallest diff. Four
principles, in priority order:

1. **Nothing a person gives us is ever lost.** Every answer is durable from
   the moment it is typed.
2. **Coming back feels like coming back.** A returning person never sees the
   first-run welcome animation or a cold form.
3. **No moment is replayed.** Cutscenes, the shock stat, the growth graph,
   the founder note and the celebration happen once in a lifetime.
4. **Re-entry lands on their own content, never on a wall.** The first thing
   a returning person sees is their devotional and their progress.

### The resume map

Where a person left, and where they come back to:

| Left at | Comes back to | Why |
|---|---|---|
| before `name` | `hook` | Nothing given yet, and the opening is the pitch |
| `name` … `mirrorBack` | the same step, answers filled | Their words are still there |
| `featureSummary`, `founderNote`, `devotionalSegue` | `devotionalSegue` | Reuses the sample job rather than paying for a second one |
| `readDevotional` and later | the same step, same devotional | They have already read it; show that exact one |
| any step, purchase made | first step after `purchaseConfirmation` | Never ask a paying person to buy twice |

A resumed session that is more than thirty minutes old opens on a short
**welcome-back** beat: their name, one line saying their answers are saved
and their first devotional is ready, one button reading "Pick up where I
left off". Under thirty minutes there is no ceremony at all, because that is
a person who glanced at a text message.

The re-entry beat is an overlay, not a step. Step indices stay untouched, so
none of the existing navigation arithmetic moves.

### Lane 1 — Draft persistence and resume (the fix)

Owner files: new `src/lib/onboarding-draft-store.ts`, `src/app/onboarding.tsx`,
`src/app/index.tsx`, `src/lib/onboarding-step-helpers.ts`,
`src/lib/full-reset.ts`, new `src/components/onboarding/WelcomeBackStep.tsx`.

1. **Draft store**, modelled on `onboarding-sample-job-store.ts`. MMKV key
   `onboarding-draft-v1`, scoped by device id, thirty-day TTL, every storage
   error swallowed. It holds the step id, the whole `OnboardingData` object,
   `purchasedDuringOnboarding`, and the sample devotional id and day.
2. **Write it** 300 ms after any change to the answers or the step, from the
   `name` step onward, plus an immediate synchronous write when the app
   backgrounds. Clear it in `proceedToGeneration` right after the real save.
3. **Keep the sample recoverable.** `onDevotionalReady` currently calls
   `clearOnboardingSampleJob()` the instant the devotional arrives, which
   destroys the only pointer to it. Move that clear to `proceedToGeneration`.
   The draft also carries the rendered day, so a resumed session shows the
   same devotional with no network round trip.
4. **Resolve the resume step** in a new pure function
   `resolveOnboardingResumeStep`, unit tested against every row of the map
   above. No early user record is created: `getFilteredOnboardingSteps` keys
   its `skipIfHasValue` rules off the persisted user, so writing one
   mid-flow would silently drop steps out from under the index arithmetic.
   The draft is the single source of truth until completion.
5. **Route correctly.** `src/app/index.tsx` renders the decorated welcome
   screen whenever the user is null, which is exactly the returning person.
   Read the draft there and replace straight into onboarding behind the same
   quiet placeholder a completed user already gets.

### Lane 2 — Purchase correctness

Owner files: `src/components/onboarding/ThreeStepPaywall.tsx`,
`src/components/onboarding/ExclusiveOfferSheet.tsx`, `src/lib/store.ts`.

1. A purchase inside `ExclusiveOfferSheet` must call the same
   `onPurchaseSuccess` path the main call-to-action uses. Today it is charged
   and dropped.
2. `updateUser` must log when it drops a write because the user is null.
   Keys only, never values.
3. The final paywall page gains a low-emphasis "I'll decide later" that calls
   a new `onDecideLater` prop, shown in every build and kept separate from
   the QA skip. It appears even when offerings fail to load, since a person
   who cannot see a price is the most stuck of all. Lane 1 owns the handler.

### Lane 3 — Keychain hardening and honest recovery

Owner files: `src/lib/mmkv-storage.ts`, `src/lib/device-id.ts`,
`src/lib/mmkv-open-mode.ts`, new `src/components/RecoveryScreen.tsx`.

1. Both Keychain items move to `AFTER_FIRST_UNLOCK`, migrated by writing new
   `-v2` key names, reading v2 first and falling back to v1. Accessibility
   cannot be changed in place.
2. Only a null read may mint a new key or device id. A throw means the
   Keychain was busy and must never create a new identity.
3. A recovery session shows a screen that says the data is safe and asks the
   person to unlock the phone and reopen. It never routes to onboarding, and
   it cancels no notifications.

### Lane 4 — See the next one coming

`src/lib/analytics.ts` imports `mockFirebaseAnalytics`, so no funnel data
exists anywhere, and the app carries no crash reporter. Add a real sink for
`onboarding_started`, `onboarding_step_completed` and `onboarding_completed`,
and add Sentry to the mobile app. Not a hotfix blocker, but this incident was
only visible because the backend happened to log a sync uid.

### Acceptance

- Unit: draft store round trip, TTL, wrong device, malformed JSON, clear on
  completion, clear on full reset; every row of the resume map.
- Contract: `proceedToGeneration` clears the draft and writes
  `hasCompletedOnboarding: true`; a sheet purchase advances the flow.
- Simulator walkthrough, per the recipe in memory
  `unfold-simulator-verification-recipe`. Quit and relaunch at `aboutMe`,
  at `readDevotional`, at `threeStepPaywall`, and at `themeType`. Each must
  return to the mapped step with answers intact and no welcome animation.
- Purchaser path: start the sandbox trial, force-quit before the last step,
  relaunch. Must resume past the paywall and never ask for Restore.
- Buy through `ExclusiveOfferSheet`. Must advance to `purchaseConfirmation`.
- Full reset returns a person to `hook` with nothing carried over.
- "I'll decide later" on the paywall lands on Today with the sample
  devotional readable, leaves `isPremium` false, and never starts a
  generation. A create action from there reaches the paywall.
- `bun run lint`, `bun run typecheck`, `bun test` green. `/simplify` run on
  the merged diff before the build.

### Simulator verification (2026-09-03, iPhone 17 Pro, dev client)

Run against the branch build, hard-killing the process each time so no
background flush could rescue the write. `flowdeck stop` reported "Force kill
was required" on both runs.

| Case | Result |
|---|---|
| Type a name, hard kill, relaunch | Returns to the name step with the typed value still in the field. No welcome screen, no cutscenes. |
| Reach the paywall, hard kill, relaunch | Returns to the paywall. No welcome screen, no name re-prompt. This is the reported bug, reproduced and fixed. |
| "I'll decide later" | Completes onboarding, lands on Today greeting the person by the name they typed, starts no generation. |
| Storage boot path | `unfold-store-v2` opened encrypted; the recovery namespace is touched only by the outbox merge, so the storage-locked gate correctly stayed off. |

Two notes on what the dev client cannot show. `__DEV__` forces the premium
policy to `granted`, so the paywall CTA completes a purchase and the final page
cannot be reached by tapping through; the decide-later run above is
distinguishable because a purchase lands on `themeType` while decide-later
lands on Today. The welcome-back beat needs a draft older than thirty minutes,
so it is covered by unit tests rather than by this walkthrough. The
decide-later control's render gate (`currentPage === totalPages - 1`, not
QA-gated) carries five unit tests of its own.

### Follow-ups from the simplify pass

Recorded, not done. None blocks the hotfix; all were judged too structural to
land in a P0 that must ship.

1. **One device-scoped record store.** `onboarding-draft-store.ts` and
   `onboarding-sample-job-store.ts` share their TTL check, device scoping,
   swallowed writes and error handling almost line for line. Those are the
   safety invariants least tolerable to drift. Extract
   `createDeviceScopedRecordStore`, and fold the sample-job record into the
   draft so there is one record per walk-through instead of two describing the
   same devotional.
2. **A shared full-screen layout.** `RecoveryScreen` copies nine style rules
   verbatim from `ErrorBoundary`. A spacing or font change currently lands in
   one screen only.
3. **Never-replay belongs on the step definition.** `onboarding-step-helpers.ts`
   now carries five parallel id sets, and adding a step means remembering all
   of them. Move the properties onto the `ALL_STEPS` entries beside
   `skipIfHasValue`, as one sweep rather than only for the new set.
4. **Freeze the step filter at mount.** `STEPS` derives from a live store
   subscription, so a write to the user record mid-flow can make a step vanish
   under the person walking it. Snapshotting `existingUser` into a ref closes
   that, and unblocks creating the user record early later on.
5. **`ensureRevenueCatConfigured`.** The SDK configures itself at module scope,
   so the storage-locked guard had to be added to that conditional. An
   idempotent function called from app start removes the import-order coupling,
   and lets `hasRevenueCatConfigurationAttemptFailed` stop reporting a
   deliberate skip as a failure.
6. **One `finishOnboarding({ outcome })`.** Three paths now hand-assemble save,
   clear draft, clear sample job and navigate, and only one adopts the sample
   devotional.
7. **Behavioural tests for the onboarding screen.** `onboarding-draft-lifecycle`
   asserts against the screen's source text because the component is too large
   to render in a test. It breaks on any refactor and would pass on wrong
   behaviour. Splitting the flow's logic out of the 3800-line component is the
   real fix.

### Follow-ups from the observability work (2026-09-03)

Recorded, not done. Sentry and the onboarding funnel signal are on
`feat/sentry-and-onboarding-telemetry`.

1. **One source for onboarding step ids.** There are now seven parallel lists:
   `ALL_STEPS` and the `StepId` union in the screen, four id sets in
   `onboarding-step-helpers.ts`, and the telemetry allowlist. A native-free
   `src/lib/onboarding-steps.ts` that the screen and both libs import would
   collapse them. Guarded for now by a test that parses the screen's own block,
   so a renamed step fails CI rather than silently bucketing every abandonment
   as `unknown`.
2. **A shared MMKV record store.** Three single-key stores now repeat the same
   try/catch, TTL and swallow. The reusable core is a thin `safeGet`/`safeSet`/
   `safeRemove`, repeated in nine lib files.
3. **The dead analytics class is a decoy.** `src/lib/analytics.ts` still imports
   `mockFirebaseAnalytics`, and it already has an `ONBOARDING_STARTED` and a
   `trackOnboardingStep`, named exactly what the next engineer will reach for,
   and it silently swallows. Point `AnalyticsService.logEvent` at
   `captureAppEvent` and delete the duplicate constants. Small, and it removes a
   trap. Note that only one component calls `AnalyticsEvents` today, so this
   lights up four events, not the app.
4. **Generalise stale-draft reporting** when a second flow needs it. The
   mechanism is not onboarding-specific; devotional generation has the same
   shape. Do it at the second caller, not before.
5. **A `bootstrap.ts` with an explicit ordered startup.** `initSentry()` sits at
   module scope in the root layout, but import hoisting already ran
   `mmkv-storage` and `revenuecatClient` (which configures itself at module
   scope) before it. Sentry is not listening for import-time failures in those.
6. **Source-scanning tests.** Several onboarding tests assert against the
   screen's source text because the component is too large to render. They break
   on reformatting and would pass on wrong behaviour. Splitting the flow's logic
   out of the 3800-line component is the real fix.

Not deferred, decided: the backend's `hashUidForTelemetry` and the mobile hash
must stay byte-identical. There is no shared package between `app/mobile` and
`backend`, so the duplication is accepted; the mobile side names the constant
and cross-references the backend, and the backend should gain the same comment.

## 4. Release

- 1.1.0 (253) finished on EAS at 03:57 UTC today and an iOS submission
  finished at 04:22 UTC. Review state was not verified here. It carries this
  bug. Recommended: do not release 253 to the store; ship 1.1.1 (254) with
  Lanes 1 to 3 and replace the submission. The ASC
  "Update Review" step from `handoffs/2026-08-28-rejection-fix-resubmission.md`
  applies if 253 is already in review.
- Build: `eas build --platform ios --profile production` then `eas submit`
  (`appVersionSource: remote`, autoIncrement gives 254). Bump `version` to
  1.1.1 in `app.json`, `package.json`, and the iOS project (see
  `617f8c78` for the three files).
- Changelog entry: "Onboarding remembers where you left off. If you closed
  the app before finishing, you pick up at the same step with your answers
  intact."
- Nothing server-side can recover the two users' answers; they were never
  sent. Their sample devotional is on the server under their device id and
  comes back through sync.

## 5. Message for Anthony (interim, before 1.1.1)

"Thanks for the report — this is a bug on our side, not you. The app was
saving your setup only at the very last screen, so closing it before that
point started you over. A fix is being built now. In the meantime, if you go
through setup once more and continue past the subscription screen to the end,
it will stick. Your first devotional is safe on our servers and will come
back."

If he says he started a trial or was charged: he is on the paying variant of
the same bug. Tell him to use **Restore Purchases** on the subscription
screen, which will pick the subscription back up, and check RevenueCat for
his transaction before replying.

## 6. Execution

Three agents ran in parallel with disjoint file ownership, one per lane, with
Lane 4 deferred. Fable orchestrates, reviews each diff, resolves anything an
agent flagged as owned by another lane, runs `/simplify` on the merged
result, and seals. No agent commits or builds.
