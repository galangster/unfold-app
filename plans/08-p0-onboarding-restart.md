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
celebration → threeStepPaywall → purchaseConfirmation → themeType →
studySubject → currentSituation → diagnosticRound → spiritualSeeking →
upcomingEvent → readingDuration → devotionalLength → reminderTime → [save + /generating]
```

`threeStepPaywall` (`src/components/onboarding/ThreeStepPaywall.tsx`) has no
exit in a production build other than a purchase. The only skip control is
`Continue for QA`, gated by `isQaToolsEnabled()` (line ~1426). So a user who
reads their sample devotional, hits the paywall, and closes the app has
"finished" in their own mind, but `store.user` is still `null`. On the next
launch `src/app/index.tsx` sees no user, routes to `/onboarding`, and
`getInitialOnboardingStepId()` (`src/lib/onboarding-step-helpers.ts:213`)
starts at `hook` with an empty form. Name is asked again. The same code ships
in 1.0 (build 251, live) and 1.1 (build 253).

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

### Second, latent P0 (not what hit these two users, must still be fixed)

`src/lib/mmkv-storage.ts` reads the MMKV encryption key and the device id
from `expo-secure-store` at JS module init with the library default
`keychainAccessible = WHEN_UNLOCKED`. If that read throws (iOS returns
`errSecInteractionNotAllowed` when the app process is prewarmed or launched
in the background while the device is locked), the app boots into the
throwaway `unfold-store-v2-recovery` namespace, which is cleared on open.
The store hydrates empty, `index.tsx` routes a fully onboarded user to
onboarding, `getDeviceId()` hands out an `ephemeral-` id, and no screen
explains anything (`isRecoverySession()` has no UI consumer). During that
session `useCheckInNotifications` also cancels the real check-in
notifications because `hasCompletedOnboarding` reads false. Symptom is
identical to this report. Keep it in the same release.

### Observability gaps found on the way

- The mobile app has no crash reporter. `bug-logger` writes to local
  AsyncStorage and only uploads on user action.
- `src/lib/analytics.ts` imports `mockFirebaseAnalytics`. There is no funnel
  data anywhere; `onboarding_step_completed` events go nowhere.
- Railway `get-logs` returns the latest deployment only; last night's deploy
  at 02:07–02:08 UTC hid the first ten minutes of device `583f924a`.

## 2. Product decision needed from Nick (blocks nothing below, changes copy)

The paywall is hard. With the fix below, a user who declines the trial still
cannot use the app, but they return to the paywall with their answers and
their sample devotional intact instead of a blank form. Options, cheapest
first:

1. Keep the hard paywall. Resume lands on `threeStepPaywall`. (Default; the
   plan assumes this.)
2. Add a "Not now" on the last paywall page that completes onboarding into a
   free tier (Today tab with the sample series only, series creation gated).
   Needs product copy and the creation-gate policy; not a hotfix.

## 3. Fix plan

Three lanes. Lane 1 is the hotfix and ships as **1.1.1 (build 254)**. Lanes 2
and 3 ride the same release if they land in time; otherwise 1.1.2.
Implementation executor: Codex `gpt-5.6-sol`, reasoning `high`, one lane per
worktree. Fable orchestrates, reviews, runs `/simplify`, and seals.

### Lane 1 — Persist onboarding progress and resume (hotfix)

Files: `src/app/onboarding.tsx`, `src/app/index.tsx`,
`src/lib/onboarding-step-helpers.ts`, new `src/lib/onboarding-draft-store.ts`,
`src/lib/full-reset.ts`, `src/lib/store.ts` (one optional field).

1. **Draft store** (`onboarding-draft-store.ts`, mirror the shape and tests of
   `onboarding-sample-job-store.ts`): MMKV key `onboarding-draft-v1`, record
   `{ deviceId, savedAt, stepId, data, purchasedDuringOnboarding }`. Scope by
   device id, TTL 30 days, swallow storage errors, ignore malformed JSON.
   Persist only the serializable answer fields of `OnboardingData` (no
   refs, no AI text that can be regenerated). Add the key to
   `FULL_RESET_MMKV_KEYS`.
2. **Save on every change** from the `name` step onward: debounce 300 ms on
   `data` and `currentStepId`. Flush synchronously on `AppState` background
   (same pattern as `shouldFlushAutosaveOnAppState`). Clear the draft inside
   `proceedToGeneration()` right after `saveOnboardingData()`.
3. **Resume**: on mount, if a valid draft exists and there is no completed
   user, hydrate `data` from it and pass `draft.stepId` as
   `requestedStepId` to `getInitialOnboardingStepId`. Rules:
   - Resume target is never earlier than the draft step and never a step the
     filter removes; fall back to the nearest surviving earlier step.
   - `devotionalSegue` / `readDevotional`: reuse the persisted sample job
     (24 h TTL) or resubmit; the backend dedups on the deterministic
     `onboarding-sample-<deviceId>` id and the rows are also in the sync pull.
   - If RevenueCat resolves premium on resume (trial started, then quit),
     skip `threeStepPaywall` and `purchaseConfirmation`; land on `themeType`.
   - Resume must not replay `hook`, `solution`, `unfoldIntro`, `shockStat`,
     `growthGraph`, `vulnerabilityValidation`, or the founder note.
4. **Create the user record early.** When the sample is revealed
   (`readDevotional` mount), call `setUser` with the answers so far and
   `hasCompletedOnboarding: false`. This makes `useUserProfileSync` push a
   `sync_users` row (support can see the person), makes the paywall's
   `updateUser({ isPremium: true })` actually persist, and keeps
   `skipIfHasValue` skipping name / aboutMe / reminderTime. Audit every
   `user?.hasCompletedOnboarding` reader for the new "user exists, not
   complete" state: `index.tsx` (must route to onboarding at the draft step,
   not the welcome animation), `useCheckInNotifications`,
   `check-in-notification-sync-policy`, `onboarding-step-helpers`,
   `user-profile-sync`, `bug-logger`, the Today tab creation gate.
5. **index.tsx**: when a draft exists (or a user exists with
   `hasCompletedOnboarding: false`), replace to
   `/onboarding?startAt=<stepId>` without showing the welcome screen.
   `startAt` is honored only at mount today (see
   `getInitialOnboardingStepId`); keep it that way.
6. **Sample devotional hygiene**: after a real series is generated, the store
   may hold both the pulled `onboarding-sample-<deviceId>` devotional and the
   new series. Verify My Content and Today hide or merge the sample; fix if
   they do not.

Acceptance (all must pass before the build):

- Unit: draft store TTL, device scoping, corrupt JSON, clear on completion,
  clear on full reset; `getInitialOnboardingStepId` resume rules including
  the premium skip and the filtered-step fallback.
- Contract test (`src/lib/__tests__/`): `proceedToGeneration` clears the
  draft and writes `hasCompletedOnboarding: true`; the paywall's
  `onPurchaseSuccess` persists `isPremium` when the early user exists.
- Simulator walkthrough on the dev client (recipe in memory
  `unfold-simulator-verification-recipe`): name → … → sample → celebration
  → paywall → force-quit → relaunch → lands on the paywall, name and
  answers intact, no welcome animation; then purchase (sandbox) → completes
  to `/generating`; then a full reset returns to `hook`.
- Repeat the walkthrough quitting at `aboutMe`, `readDevotional`, and
  `themeType`.
- Backend after the walkthrough: `sync_users` row exists for the device
  before the paywall.
- `bun run lint`, `bun run typecheck`, `bun test` green; `/simplify` run on
  the diff.

### Lane 2 — Keychain-locked launches must not look like a fresh install

Files: `src/lib/mmkv-storage.ts`, `src/lib/device-id.ts`,
`src/app/index.tsx`, `src/app/_layout.tsx`, `src/hooks/useCheckInNotifications.ts`,
`src/hooks/useDailyReminderSync.ts`.

1. Store both Keychain items with
   `keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK`. expo-secure-store's
   `set` only updates `kSecValueData` on an existing item, so accessibility
   cannot be changed in place. Migrate by writing new key names
   (`…-encryption-key-v2`, `…-device-id-v2`) with the option, read v2 first
   and fall back to v1, and never delete v1 until a v2 read has succeeded on
   a later launch.
2. Distinguish "Keychain temporarily unavailable" from "key absent":
   `SecureStore.getItem` throws for the former and returns null for the
   latter (`SecureStoreModule.swift:146-168`). Only null may ever mint a new
   key. Keep the existing retry.
3. Recovery-session UX: when `isRecoverySession()` is true, `index.tsx` and
   the root layout render a "Restoring your data — unlock your phone and
   reopen Unfold" screen and never route to onboarding or Today. No
   notification cancellation, no RevenueCat login, no profile sync in that
   session.
4. Tests: `resolveMmkvOpenPlan` rows unchanged; new pure helper for the
   v1→v2 read order; index routing test for the recovery state.

### Lane 3 — See the next one coming

1. Replace `mockFirebaseAnalytics` with a real sink, or add a minimal
   backend endpoint `/api/telemetry/event` (uid, event, step, appVersion,
   ts) and post `onboarding_started`, `onboarding_step_completed`,
   `onboarding_completed`, `devotional_generation_*` to it. Backend: one
   table, one insert, same auth as sync.
2. Add `@sentry/react-native` to the mobile app (native change; the 1.1.1
   build already requires a new binary). DSN already exists on the backend
   side; create a mobile project.
3. Backend: log `[jobs] Created onboarding job` already exists; also log a
   line when a `users` row is first created, so "sample without profile"
   becomes greppable.

## 4. Release

- 1.1.0 (253) finished on EAS at 03:57 UTC today and an iOS submission
  finished at 04:22 UTC. Review state was not verified here. It carries this
  bug. Recommended: do not release 253 to the store; ship 1.1.1 (254) with
  Lane 1 (and Lane 2 if ready) and replace the submission. The ASC
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
through setup once more and continue past the subscription screen, it will
stick. Your first devotional is safe on our servers and will come back."

## 6. Codex brief — Lane 1 (STE, ready to paste)

```
codex exec -m gpt-5.6-sol -c model_reasoning_effort=high --sandbox workspace-write "$(cat <<'EOF'
Repository: app/mobile (Expo SDK 57, expo-router, zustand persist on MMKV, Bun, Jest).
Read plans/08-p0-onboarding-restart.md section 3, Lane 1, before you change code.
Task: persist onboarding progress and resume it after a relaunch.
1. Create src/lib/onboarding-draft-store.ts. Copy the structure of src/lib/onboarding-sample-job-store.ts. Key: onboarding-draft-v1. Record: deviceId, savedAt, stepId, data, purchasedDuringOnboarding. TTL: 30 days. Ignore records for another deviceId. Ignore malformed JSON. Add the key to FULL_RESET_MMKV_KEYS in src/lib/full-reset.ts.
2. In src/app/onboarding.tsx, save the draft 300 ms after each change to data or currentStepId, starting at the name step. Flush on AppState background. Clear the draft in proceedToGeneration after saveOnboardingData.
3. On mount, read the draft. If a draft exists and store.user is not completed, hydrate data from it and pass draft.stepId to getInitialOnboardingStepId as requestedStepId. Never resume to hook, solution, unfoldIntro, shockStat, growthGraph, vulnerabilityValidation, or founderNote. If the target step is filtered out, resume at the nearest earlier surviving step. If RevenueCat reports premium, skip threeStepPaywall and purchaseConfirmation.
4. At readDevotional mount, call setUser with the answers so far and hasCompletedOnboarding: false. Audit every reader of user.hasCompletedOnboarding listed in the plan. index.tsx must route a user with a draft or an incomplete user record to /onboarding?startAt=<stepId> without the welcome animation.
5. Write Jest tests for the draft store, the resume rules in src/lib/onboarding-step-helpers.ts, and a contract test that proceedToGeneration clears the draft.
6. Run: bun run lint, bun run typecheck, bun test. All must pass.
Do not change ThreeStepPaywall behavior. Do not change the backend. Do not touch native code.
Report: files changed, test names added, and the exact commands you ran with their exit codes.
EOF
)" < /dev/null
```
