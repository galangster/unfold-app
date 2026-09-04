# Handoff: Jordan's feedback — eleven items, seven lanes, nothing merged

**Date:** 2026-09-04 (evening). **Author:** Claude (Fable 5.1) with Nick.
**Predecessor:** `handoffs/2026-09-04-cron-enrollment-companion-actions.md`.
**Status:** a 69-agent workflow diagnosed and fixed seven of Jordan's items, then the
session hit its token limit mid-flight. **Nothing is merged. No lane was reviewed.**

---

## 0. Read this first — the three facts that change what you do

1. **Nothing is on `main`.** Mobile `main` is `5fcb0edf`. Backend `main` is `105b7c2`.
   Both are clean and in sync with `origin`. Seven `fix/jordan-*` branches exist locally
   in both repos. None has a remote tracking branch.

2. **Every lane is now committed.** This was true as of 2026-09-04 evening; earlier text in
   this file described two lanes as having no commit, and that is no longer the case.
   All ten lane worktrees are clean and every branch is ahead of its main.

   | Lane | New commit | Note |
   |---|---|---|
   | `generation-error-false` | mobile `2235947e`, backend `0e69da2` | **backend is INERT — see item 7** |
   | `notify-when-ready` | mobile `6e534745`, backend `23526a9` | includes the two formerly untracked modules |
   | `key-people-multi` | mobile `e206940c` (now 2 commits) | the repair round answering two failing reviewers |

   Being committed is not being ready. **Five of seven lanes still have no adversarial
   review and no gate run.** The commit messages record that per lane.

3. **No lane received adversarial review, except three.** The session limit killed the
   reviewers mid-run. A recorded `review FAIL (0/0)` means *zero reviewers returned*, not
   *the fix was refuted*. Likewise `repaired: true` in the workflow JSON records that a
   repair round was **dispatched**, not that anything was repaired. Do not read those fields
   as verdicts. Only `segue-cutoff` (2 reviewers, both pass), `key-people-multi`
   (3 reviewers, 1 pass / 2 fail) and `paywall-mockup-cutoff` (1 reviewer, fail) were judged.

### Backups already exist. Use them if `/private/tmp` is gone.

All lane work was exported to `/Users/galangster/clawd/work/unfold/jordan-lane-patches/`
before the commits in fact 2 were made. Twelve patch files, all non-empty. Every
uncommitted patch was verified with `git apply --check` against current `main` and applies
clean. **The patches now duplicate work that lives in commits**, so they are a redundant
second copy rather than the only copy. Keep them until the lanes merge.

```bash
ls -la /Users/galangster/clawd/work/unfold/jordan-lane-patches
```

The two formerly untracked modules in `notify-when-ready` — `generating-notify-state.ts`
and `__tests__/generating-notify-state.test.ts` — are now **inside commit `6e534745`**, so
a normal merge carries them. Verbatim copies also sit at
`jordan-lane-patches/untracked/notify-when-ready/mobile/src/lib/` as a fallback. If you ever
fall back to `git apply` of the patch instead of the commit, that patch will not create
them; copy them by hand.

### Worktree paths

Root for all seven lanes:

```
/private/tmp/claude-501/-Users-galangster-clawd-work-unfold/d7e349e2-1bf4-496b-a15a-2e6b0eb9094b/scratchpad/wt/<lane>/{mobile,backend}
```

macOS may clear `/private/tmp`. The parent repos survive; committed lane work survives;
**uncommitted lane work does not.** After the directory is gone, clean the stale
registrations:

```bash
git -C /Users/galangster/clawd/work/unfold/app/mobile worktree prune
git -C /Users/galangster/clawd/work/unfold/backend worktree prune
```

Never run `git worktree remove` on a lane that still holds uncommitted work.

---

## 1. Where the items came from

Nick pasted his full iMessage thread with Jordan, a tester on App Store build 1.1.0.
Nick's instruction: "all of his feedback absolutely needs to get fixed, bar none."

Items 1-9 were worked by workflow run `wf_a261d4d2-f10` (69 agents, 24 min, 4.66M tokens,
status `completed`). Items 10 and 11 came from a later screenshot of the same thread and
are diagnosed but untouched.

Workflow record: `/Users/galangster/.claude/projects/-Users-galangster-clawd-work-unfold/d7e349e2-1bf4-496b-a15a-2e6b0eb9094b/workflows/wf_a261d4d2-f10.json`
Per-agent journal: same directory, `subagents/workflows/wf_a261d4d2-f10/journal.jsonl`

**Warning about that JSON.** Its per-lane `branch`, `commits` and `gates` fields are `null`
for lanes that demonstrably did commit, because the agents that would have filled them
died. Trust `git`, and trust the journal. Do not trust that JSON's bookkeeping fields.

---

## 2. The eleven items at a glance

| # | Item | Branch | Committed | Reviewed | Ready |
|---|---|---|---|---|---|
| 1 | Key people: one person per relationship | `fix/jordan-key-people-multi` | mobile `4aac4179` + `e206940c`, backend `71b93aa` | 1 pass / 2 fail; repair unreviewed | No |
| 2 | "We heard you" hard-edged empty panel | `fix/jordan-segue-cutoff` | `d7b5ec83` | 2 pass | **Closest** |
| 3 | Paywall phone mockup cut flat | `fix/jordan-paywall-mockup-cutoff` | `d1ed7809` | 1 fail, 2 must-fix open | No |
| 4 | Post-purchase loop (critical) | `fix/jordan-post-purchase-loop` | `a1c58560` | none | No |
| 5 | 3-day trial continuation (feature) | — | none | — | Design only |
| 6 | "Go home" link does nothing | `fix/jordan-go-home-dead` | `add0c7ab` | none | No |
| 7 | False "Something went wrong" | `fix/jordan-generation-error-false` | mobile `2235947e`, backend `0e69da2` | none | No — **backend inert** |
| 8 | No notification when ready | `fix/jordan-notify-when-ready` | mobile `6e534745`, backend `23526a9` | none | No |
| 9 | Review prompt after first devotional | — | on `main` `a13d481a` | confirmed | **Done** |
| 10 | Day ends with nothing to do (new) | — | none | — | Diagnosed |
| 11 | Journal asks the same thing 3 ways (new) | — | none | — | Diagnosed |

---

## 3. Lane dossiers

### Item 2 — `segue-cutoff` · `d7b5ec83` · the one that is nearly done

**Jordan saw:** a faint hard-edged band under the spinner on the "We heard you." screen.

**Root cause.** The screen is the onboarding `mirrorBack` step, not `DevotionalSegue.tsx`.
Its loading branch (`onboarding.tsx:3172-3190`) and ready branch (`:3193-3203`) each mount
`<EmberSystem variant="ambient" count={10} intensity={0.7}>` inside a box with
`minHeight: 380` that ends mid-screen. `EmberSystem` always paints a bottom glow
`LinearGradient` anchored to `bottom: 0` with `height: params.glowHeight`, inside a
container with `overflow: 'hidden'`. `getTierForCount` (`ember-system.ts:116-127`) uses a
strict `<`, so count 10 ties down to the count-8 tier (`glowOpacity: 0.05, glowHeight: 180`).
Intensity multiplies that to 0.035. A 3.5%-alpha gold ramp on near-black quantises into two
or three 8-bit steps, and the gradient clips flat at the box edge. Result: an empty
skeleton card with two embers in it.

**The fix.** An opt-in `glow` flag, default `true`.
- `ember-system.ts`: adds `glow?: boolean` to `ResolveEmberParamsInput`, and a three-line
  block at `:197-201` — `if (input.glow === false) { glowOpacity = 0; }`. It zeroes only
  `glowOpacity` and leaves `glowHeight` at 180, so the still-poster anchor math is
  byte-identical.
- `EmberSystem.tsx`: adds the prop, destructures with `glow = true` at `:448`, threads it
  into `resolveEmberParams` and its `useMemo` deps. No render code changed — both paths
  already gate the gradient on `glowOpacity > 0`.
- `onboarding.tsx`: passes `glow={false}` on exactly two mounts, `:3180` and `:3201`.
  The other six `EmberSystem` mounts are untouched.

**Diff:** +161 / −2 across 5 files, of which +138 is tests.

**Gates (independently re-run by a reviewer):** tsc exit 0. eslint 0 errors, 41 pre-existing
`array-type` warnings. Jest 15 suites / 179 tests passed.

**Review:** two reviewers, both **pass**, zero must-fix. Four non-blocking nits, the
notable one being that `EmberSystem.tsx:550-551` hard-routes `variant === 'celebration'`
to `getCelebrationStillGlow()` and therefore ignores `glow={false}` on the reduce-motion
still poster. No current mount hits that path, but a test claims the opt-out is
"variant-independent", which is only true at the resolver level.

**Only open item:** simulator visual proof. The implementer could not run it because
`xcrun` was blocked in the sandbox.

**Merge risk:** minimal. Two inserted lines in `onboarding.tsx` at 3180 and 3201. Its other
three files are touched by no other lane. **Merge this first.**

**Do not** reuse `glow={false}` on the paywall or `ThreeStepPaywall` mounts for item 3.
Those are full-screen and their glow correctly anchors at the screen edge.

---

### Item 1 — `key-people-multi` · mobile `4aac4179` + `e206940c`, backend `71b93aa`

**Jordan wanted:** two friends, each with a name. He got one row per relationship.

**Root cause.** The step used the relationship label as row identity.
`toggleRelationship` (`onboarding.tsx:2863-2876`) ran
`prev.keyPeople.filter((p) => p.relationship !== relationship)` when a chip was already
active, so a second "Friend" tap **deleted** the first friend. Three more sites shared the
assumption: `updatePersonName` matched by relationship (`:2878-2885`), chip active state
used `.some()` on relationship (`:2891`), and rows rendered with `key={person.relationship}`
(`:2918`). No "add another" affordance existed.

The data model was never the limit. The store, the generation request builder,
`shapeKeyPeople`, the backend validator (`jobs.ts:227-245`, array of up to 5 with **no**
uniqueness check) and both prompt builders already accept duplicate relationships.
The diagnosis proved main is not already fixed: the keyPeople block is byte-identical
between App Store build 1.1.0 (`69e42ed0`) and `main`.

**The fix.** `onboarding-step-helpers.ts` gains a `KeyPersonRow = { id, name, relationship }`
type, the pure helpers `withKeyPersonIds` / `addKeyPerson` / `removeKeyPerson` /
`renameKeyPerson` / `keyPersonRowLabel` / `keyPersonChipLabel`, and the constants
`KEY_PEOPLE_MAX_COUNT = 5` and `KEY_PERSON_NAME_MAX_LENGTH`. Row ids are minted as
`kp-<module-load-time base36>-<seq>`. In `onboarding.tsx`, `toggleRelationship` becomes
`addPerson` which always appends; `removePerson` deletes by id; each row owns an x control
with a 44pt hit area; rows read "Friend 1" / "Friend 2" only while a relationship repeats;
the chip reads "Friend · 2" (U+00B7) at count 2. The new row autofocuses.

`shapeKeyPeople` is deliberately unchanged and still strips the id, so the persisted
profile and the generation payload keep the `{ name, relationship }[]` shape the backend
validates. Drafts written by 1.1.x carry rows with no id and are normalised by
`withKeyPersonIds` in the lazy `useState` initialiser at `onboarding.tsx:658`.

**THE REPAIR ROUND — now commit `e206940c`.** Three mobile files, +67 / −12 on top of
`4aac4179`. It answers the two failing reviewers:
- `consumeAutofocus` (`:2902-2904`) plus `onFocus` (`:2967`) clears the autofocus ref once
  the row takes focus. Without it, Continue then Back re-opens the keyboard on a finished
  step. This was reviewer must-fix 1, raised independently by two reviewers.
- The label logic moves into the tested helpers `keyPersonRowLabel` / `keyPersonChipLabel`.
  This was reviewer must-fix 2.
- Adds `accessibilityState={{ disabled: maxPeopleReached }}` and a count to the chip label.
- Adds two test cases.

It **extends** `4aac4179`; it does not supersede it. The repair agent died before
committing, so `e206940c` was made separately and has never been reviewed.

**Gates:** recorded against `4aac4179` / `71b93aa` **only**, never re-run after the repair.
Mobile tsc 0, eslint 33 pre-existing warnings, Jest 11 suites / 164 tests.
Backend vitest 114 files / 909 tests. The repair adds a **new cross-module import**
(`import { INPUT_LIMITS } from './validation'` into a file that previously had zero
imports), so the gates genuinely need re-running.

**Review:** reviewer 1 pass. Reviewers 2 and 3 **fail**, with the two must-fixes above.
Reviewer 3's second must-fix — a simulator capture — is **still open**.

**Open risks:**
- Behaviour change worth a release note: tapping an active chip no longer removes that
  person. Removal is only the row's x control.
- `accessibilityState={{ disabled: maxPeopleReached }}` was added, but the chip is not
  actually disabled at the cap — it still fires a warning haptic. VoiceOver will announce
  "dimmed" for a control that responds. Confirm the intent.
- `backend/src/lib/generation/arc-generator.ts:79-86` builds the initial-arc key-people line
  with the same plain filter/map/join and has **no** duplicate-relationship test. Only the
  day prompt in `prompts.ts` is guarded.
- `KEY_PERSON_ID_RUN = Date.now().toString(36)` evaluates once per module load. Two
  processes in the same millisecond could mint colliding ids. Exposure is small, not zero.

---

### Item 3 — `paywall-mockup-cutoff` · `d1ed7809` · one reviewer failed it

**Jordan saw:** the phone mockup on paywall Screen 1 cut flat at the bottom.

**Root cause.** The mockup was sized from window width only.
`ThreeStepPaywall.tsx:113` sets `DEVICE_BEZEL_WIDTH = SCREEN_WIDTH * 0.62`, and
`deviceInner` applies `aspectRatio: 9/19.5` (`:1641`), so bezel height is always about
1.343 × screen width: 504pt on a 13 mini, 540pt on a 17, 591pt on a 17 Pro Max.
The page area between the header and the CTA block is smaller on **every** supported
iPhone (about 516 / 569 / 651pt). The bezel bottom therefore lands 26-75pt below the page
area and `screen1Root: { flex: 1, overflow: 'hidden' }` (`:1576`) clips it in a straight
line. The comment at `:449` calls the clip intentional. Dynamic Type makes it worse.

**The fix.** A new pure module `src/lib/paywall-mockup-size.ts` exports `computeMockupSize`,
which derives height from the measured wrapper rather than from width, floors at 260pt, and
reports `overflows`. `ThreeStepPaywall.tsx` replaces the module constant with
`MOCKUP_TOP_PADDING` / `MOCKUP_BOTTOM_CLEARANCE` (both `Spacing['4']` = 16pt), adds
`wrapperLayout` state and an `onLayout` handler, sets explicit width and height on the
bezel, and drops `aspectRatio` for `height: '100%'`. The bottom gradient now renders only
when `overflows` is true and derives its stops from `alpha(colors.background, …)` instead of
hardcoded grey. The Screen 1 headline gets `maxFontSizeMultiplier={1.3}`.

**Gates:** tsc 0 (reproduced by the reviewer). eslint 7 pre-existing warnings.
Jest 9 suites / 75 tests.

**Review — one reviewer, verdict FAIL, two must-fix, repair never ran:**
- **Must-fix 1 is a real regression path.** `MAX_DRAG = 60` and
  `dragY = raw * (1 - |raw|/120)` with `raw = translationY * 0.4` give a downward peak of
  +30pt. `MOCKUP_BOTTOM_CLEARANCE` is 16pt and `screen1Root` is still `overflow: 'hidden'`.
  **A full downward pull reproduces Jordan's exact flat cut, by up to 14pt.** The repair:
  hoist `MAX_DRAG` to module scope, set `MOCKUP_BOTTOM_CLEARANCE >= MAX_DRAG / 2`, and add
  a test pinning that relation.
- **Must-fix 2:** capture the named visual proof, and either replace the undocumented page-area
  numbers 516 / 569 / 651 in the helper test with measured wrapper heights or relabel those
  rows as synthetic.

**Owner decision open.** The clipped phone was an intentional cinematic composition. On a
13 mini at Dynamic Type 130% the mockup now shrinks to roughly 300-372pt tall.
Nick has not signed off on that shrink.

**Other risks:** the overflow-and-fade branch never fires on a supported iPhone, so the
theme-derived fade is unit-tested only. `styles.screen1Gradient.height` is still a hardcoded
240pt while the floor frame is 260pt. A stale comment still describes an 80px / 500ms
entrance that no longer exists.

---

### Item 4 — `post-purchase-loop` · `a1c58560` · CRITICAL, and completely unreviewed

**Jordan saw:** after Start Free Trial the paywall returned as "Unlock Premium". Only
Restore Purchases got him through.

**Root cause — three separate branches of a completed purchase never reach the one exit
that advances onboarding.** `ThreeStepPaywall.tsx:1248-1293` runs `purchasePackage`, then
`resolvePurchaseOutcome`, and only `kind === 'success'` calls `onPurchaseSuccess()`.

1. **Entitlement lag.** `refreshCustomerInfoIfPremiumMissing` (`revenuecatClient.ts:136-178`)
   polls only at 0 / 750 / 1500 ms. A trial grant landing after 2.25 s makes
   `paywall-guardrails.ts:54-72` return an error whose copy literally says
   "Please tap Restore purchases".
2. **Client timeout.** `PURCHASE_TIMEOUT_MS = 60_000` fires while Apple still completes the
   transaction, and `:1270-1279` folds it into the generic "Something went wrong".
   The standalone `paywall.tsx:324-331` handles timeout separately; the onboarding paywall
   did not.
3. **Success ordering.** `await syncTrialEndingNotification()` at `:1285` runs **before**
   `onPurchaseSuccess()` and calls `getCustomerInfo()` with no timeout, so a hang or
   rejection blocks the advance.

The late entitlement then reaches the app only through `useRevenueCatSync.ts:48-59` calling
`updateUser({isPremium})` — a **dropped write** during first onboarding, because
`store.user` is null until `onboarding.tsx:1315` (`store.ts:896-904` documents this drop).

The "Unlock Premium" wording is the tell that `purchasedDuringOnboarding` was never
persisted: it was written only inside `onPurchaseSuccess`, the draft write is debounced
300 ms / 1.5 s, and `onboarding-step-helpers.ts:480-486` skips the paywall on resume only
when that flag is true.

**The fix (4 source + 4 test files, mobile only).**
- `paywall-guardrails.ts:99-160` adds `PAYWALL_PURCHASE_TIMEOUT_MESSAGE`,
  `PAYWALL_ENTITLEMENT_PENDING_MESSAGE`, and the pure
  `resolveOnboardingPurchaseAdvance({result, hasAdvanced})` returning
  `advance | noop | cancelled | wait_for_entitlement | error`. `advance` still requires a
  real entitlement. The old `resolvePurchaseOutcome` is untouched, so `paywall.tsx` is
  unaffected.
- `revenuecatClient.ts:96-97, 149-213` adds `POST_PURCHASE_ENTITLEMENT_WAIT_MS = 10_000`,
  `ENTITLEMENT_WAIT_POLL_INTERVAL_MS = 2_000` and `waitForUnfoldPremiumEntitlement`, which
  registers the SDK listener, polls every 2 s, always removes the listener, and never
  rejects. `refreshCustomerInfoIfPremiumMissing` gains `options.extendedWaitMs` defaulting
  to 0, so **restore keeps its old 2.25 s behaviour**. `purchasePackage` catches
  `RevenueCatTimeoutError` and waits up to 10 s for the grant.
- `ThreeStepPaywall.tsx:1253-1293` adds `advancedRef` and a single `advanceOnce()` exit
  shared by purchase, restore, the exclusive offer and a late entitlement. It calls
  `onPurchaseSuccess()` **first**, then fires `syncTrialEndingNotification()` fire-and-forget.
- `onboarding.tsx:3889-3910` writes `saveOnboardingDraft({stepId:'purchaseConfirmation',
  purchasedDuringOnboarding:true, …})` **synchronously** before `advanceToNextStep`.

**Gates (self-reported by the implementer, never independently re-run):** tsc 0,
eslint 0 errors / 39 pre-existing warnings, Jest 23 suites / 247 tests.

**Review: NONE. This is the single most important fact in this lane.** All three lens agents
and the repair agent died. `reviewPass: false` here is an artifact of empty verdicts, not a
refutation. Zero must-fix items were raised because nobody looked. **Treat this code as
unreviewed, not as reviewed-and-cleared.**

**Open risks:**
- Purchase latency grows. A purchase whose customerInfo lacks the entitlement now spins
  ~2.25 s plus up to 10 s. A purchase that hits the 60 s timeout can spin up to 70 s.
- The `wait_for_entitlement` branch fires an **error** haptic and renders pending copy
  through the same `purchaseError` slot, so a successful purchase shows error-styled
  treatment for up to 10 s.
- `awaitingEntitlement` has no bounded UI deadline. If the grant never arrives the pending
  message stays and the listener stays registered until unmount.
- `purchasePackage` is shared with `paywall.tsx` and `ExclusiveOfferSheet`. The extended
  wait changes their timing too. Nobody confirmed that is wanted.
- The entitlement-missing copy changed. No owner approved the new wording.

**Device proof is mandatory and cannot be faked.** The simulator cannot grant a RevenueCat
entitlement and the app has no injection hook for a mocked purchase. You need a real Apple
sandbox account that has never used the trial, or a StoreKit configuration file. Full
10-step recipe is in the dossier; the essential steps are: complete a sandbox purchase and
confirm the screen advances **without any Restore tap**; force-quit within 2 s of the
transition and confirm the resume never shows the paywall again; repeat with Network Link
Conditioner on a very slow profile to push the grant past 2.25 s and confirm the pending
copy appears and then self-advances inside 10 s; confirm "Unlock Premium" never appears
after a completed purchase; confirm Restore on an empty account still answers in ~3 s.

---

### Item 6 — `go-home-dead` · `add0c7ab` · restructures a shared surface

**Jordan saw:** "Go home — we'll keep writing" appeared to do nothing.

**Root cause — the link was never dead.** `generating.tsx:1214-1217` really does call
`router.replace('/(tabs)/(today)')`, and the `beforeRemove` guard lets a REPLACE through.
Today then bounced him straight back: its mount effect (`(today)/index.tsx:258-285`) read
the MMKV key `inflight-generation-job`, found the record, saw `submittedAt` under 15
minutes, and called `router.replace('/generating')`. Net effect: one frame on Today, then
back to the ripple. Today could not tell "the reader chose to leave" from "the app died
mid-generation". The error-state Go home removed the record, which is why Jordan's later
Go home from the **error** screen worked.

**The fix.** The MMKV record gains a `leftForHome` marker written on the way out. The key
string is unchanged, so `full-reset.ts:88` still wipes it. Today redirects only for an
**unmarked** active record. For a marked record it keeps the record, renders the Preparing
card for day 1 with no devotional in the store, and watches the job through the new
`useInflightInitialArcWatch` hook. `applyInitialArcResult` in the new
`src/lib/initial-arc-result.ts` is the store side of `handleGenerationComplete`, moved out
of `generating.tsx` so both screens land a result identically. `planGoHomeFromGenerating`
takes the notification permission state as input and **deliberately ignores it**, so no
permission prompt can sit between the tap and the navigation.

**Diff:** 11 files, 4 new modules plus a new hook, +1272 / −158.

**Gates:** tsc 0. eslint 18 pre-existing warnings, 0 in the new files. Jest 14 suites /
166 tests.

**Review: NONE.** All three reviewers and the repair agent died on the session limit.

**Open risks:**
- Today's watch starts from a **mount-time read**. If `/generating` sits on top of an
  already-mounted Today (`RecommendedSeriesCard` pushes rather than replaces), the replace
  back may not remount Today and the read may not re-run. **This is an open code question
  and should be answered before merge.**
- The watch is gated on `isTodayFocused`. If the reader leaves the Today tab for a long
  time, polling stops while the 10-minute budget keeps running from `submittedAt`, so a
  slow job can time out unwatched and clear the record.
- A submission that fails after the reader left leaves Today on the empty state with a
  failed session and no visible error.
- `/simplify` — required by the runtime efficiency contract section 10 — is **not recorded**
  for this lane.

---

### Item 7 — `generation-error-false` · mobile `2235947e`, backend `0e69da2` · backend is inert

**Jordan saw:** "Something went wrong" after about ten minutes, though he believed the
series existed.

**Root cause — the job genuinely failed. The premise is wrong, and that matters.**
In `backend/src/lib/generation/arc-generator.ts` the Opus arc call (`:790`) and the Sonnet
degrade call (`:804`) both set `maxTokens: Math.min(8000, 4000 + totalDays * 100)`, which is
**7000** for a 30-day plan. Opus 5 thinks by default, and thinking shares `max_tokens` with
the visible JSON. All **nine** production arc calls for job `7e8b59bc` returned **exactly
7000** output tokens and the JSON was cut mid-array every time.

`callAI` does return `stopReason` (declared `ai-client.ts:442`, assigned `:539`), but
arc-generator ignores it and parses the truncated text, throwing
`Arc generation: JSON parse failed -- Expected ',' or ']' after array element in JSON at
position 5011`. Both the worker auto-retry and the manual retry route re-run identical
input, so every retry failed identically.

Production facts: job `7e8b59bc`, uid `anon_3eb9cb3c-d990-49d4-9ec4-8fd1053bb529`, created
2026-09-04T19:01:22Z, 3 automatic + 2 manual attempts, permanently failed 19:30:59Z, zero
`sync_devotional_days` rows. The series that later "worked" was a **different** job,
`9a5b510e`, submitted fresh at 20:15:01Z with `devotionalLength: 7`, completed in 127 s.

`day-generator.ts:903-919` **already carries the identical fix for this defect class** — a
12000 floor with the same "live runs hit the ceiling exactly at 7000" note. arc-generator
never received it.

A separate latent client defect is the acceptance target: `generating.tsx:48` defines
`MAX_POLL_DURATION_MS = 10 * 60 * 1000` and `:451-462` declares failure **by wall clock with
no final server poll**, while the AppState handler stops polling on background but never
pauses `pollStartTime`. A return after ten minutes errors instantly on a job still running.

**State of the work.**
- **Mobile looks COMPLETE and coherent.** +533 / −48 across 6 files. `generation-poll-outcome.ts`
  gains 155 lines of pure decision helpers — `evaluateGenerationDeadline` (time alone yields
  `long-running`, never an error; only 6 consecutive failed status requests yield
  `network-error`), `shiftPollStart`, `resolveGenerationRetryAction`, `resolveGoHomeCleanup`,
  `isInflightRecordExpired`, `resolveInflightResume`. `generating.tsx` deletes
  `MAX_POLL_DURATION_MS` and the wall-clock block, adds a soft "Still writing — taking a
  little longer" line, shifts `pollStartTime` forward on foreground, and routes Try again so
  it never duplicates a series. `(today)/index.tsx` replaces the blind 15-minute check with
  a real `pollJobStatus` call. `generation-errors.ts` adds a JSON-parse branch.
  16 new test cases.
- **BACKEND IS HALF-WRITTEN AND FUNCTIONALLY INERT.** The implement agent died mid-`Edit`
  at 202,557 tokens. It inserted a 52-line block at `arc-generator.ts:681-732` defining
  `ARC_MAX_TOKENS_FLOOR = 12000`, `ARC_MAX_TOKENS_RETRY_CEILING = 24000`, `getArcMaxTokens`
  and `requestArcText` — **and never wired any of it in.** The live call sites at `:838-846`,
  `:852-860` and `:1084-1090` still pass the defective
  `Math.min(8000, 4000 + totalDays * 100)`. `getArcMaxTokens` and `requestArcText` are dead
  exports. **Merged as-is, Jordan's exact incident reproduces on the next 30-day plan.**
  No backend test was written; the planned `arc-generator-model.test.ts` does not exist.

**Gates: NEVER RUN.** Not tsc, not eslint, not jest, not vitest, in either repo.

**Review: NONE.** All three verify agents and the repair agent were killed with **zero tool
calls**. Only the diagnosis agent completed, at 144,996 tokens, backed by direct production
DB reads.

**Wiring hazard to respect.** `arc-generator.ts:837-861` wraps the Opus `callAI` in a
try/catch that degrades to `claude-sonnet-5` on a retryable provider error. `requestArcText`
contains no such degrade, so a naive substitution either loses the Sonnet fallback or
double-wraps it. The Sonnet path must get the same budget and the same truncation guard.
Also confirm the `callAI` options object actually carries `endpoint`, or `requestArcText`'s
`console.warn` prints `undefined`. And the full-regen call at `:1088` keeps the same 7000
cap — fix it too, or a regen of a long series truncates the same way.

**Cost coupling.** Raising the arc budget to 12000+ makes a 30-day attempt slower
(~3-4 min, up from ~2.5 min). **The mobile long-running change MUST ship in the same
release,** or clients on build 254 and any unpatched client start showing timeout copy for
large plans.

**Known loose end inside the lane:** `handleRetry`'s catch block still calls
`mmkvStorage.removeItem(INFLIGHT_KEY)` unconditionally, which contradicts the `keepInflight`
principle the rest of the lane adopts.

---

### Item 8 — `notify-when-ready` · mobile `6e534745`, backend `23526a9` · code reads as finished

**Jordan saw:** he tapped "Notify me when it's ready" and never got a notification.

**Root cause — the permanent-failure path sends nothing.** `backend/src/lib/worker.ts:883-885`
only logs. The only push call on main lives in `persistJobSuccess` (`:503-527`).
Production logs confirm his token registered correctly: `POST /api/users/push-token` landed
at 19:02:40Z, 68 s after the job was created. The worker then failed the job three times
and marked it permanently failed at 19:09:13Z. **Nothing was ever sent because the series
never completed.** The deferral hypothesis is ruled out — `initial_arc` and `onboarding`
carry priority 10, and the preferred-time gate only runs when `skipTimeCheck` is false.

A second, client-side defect compounds it: `generating.tsx:325-337` called
`void registerPushToken()` and discarded the result, and the confirmation block keyed only
on `granted`. So a **denied** permission silently re-rendered the identical "Notify me when
it's ready" link with no message and no path to Settings, and a failed token POST still
promised a nudge. There is no local-notification fallback.

**The fix.**
- Backend `push-notifications.ts` gains `sendGenerationFailedNotification`, sending an
  ungated Expo message titled "We hit a snag" with body "We couldn't finish your devotional.
  Tap to try again." and `data.type = "generation_failed"`. `worker.ts:892-900` calls it from
  the permanent-failure branch, guarded by the new `isReaderWaitingJob(job.jobType)` so only
  `initial_arc` and `onboarding` push. Fire-and-forget, so a push failure never breaks the
  failure-state write. Adds `resolveCompletionPushTiming({jobType, priority})` so a
  reader-waiting job skips the preferred-time gate on its job type alone rather than
  depending on a scheduling knob. Token lookup and Expo-token validation extract into a
  shared `findPushConfig`; `sendPush` is re-signatured to `(db, userId, pushToken, message)`.
- Mobile `registerPushToken` changes from `Promise<void>` to
  `Promise<'registered' | 'skipped' | 'failed'>`. A new pure module
  `src/lib/generating-notify-state.ts` turns that result plus the permission answer into one
  of seven `NotifyControlState` values, and `generating.tsx` replaces four ad-hoc render
  conditions with it — adding a **denied** block with an "Open Settings" button wired to
  `Linking.openSettings()`, and a **registration-failed** block that keeps the link visible
  so the reader can retry. An `AppState` listener re-checks permission on return from
  Settings. `push-notification-helpers.ts` routes a tapped `generation_failed` push to
  `/generating`.

**Diff:** mobile 4 modified + **2 untracked new files**, +154. Backend 7 modified, +336 / −55.

**The edits look finished, not mid-edit.** Verified by reading the files, not only the diff:
every `NotifyControlState` value has a matching render branch, both `sendPush` call sites
match the new signature, and every icon/spacing token the new styles use is already imported.
The two suites that only stub the module were updated so the new import does not break them
— which is what a finished pass looks like.

**Gates: NEVER RUN.** 22 new test cases across five suites have never executed once, and
three backend suites now depend on a `vi.importActual` pattern that has never run.

**Review: NONE.** Implement, all three verifiers and the repair agent all errored.

**Weakest link, flagged by the dossier:** a tapped `generation_failed` push routes to
`{ pathname: '/generating' }` **with no params**. `generating.tsx` has no
`useLocalSearchParams` call, so it ignores the `devotionalId` and `jobId` the push carries
and must resume from MMKV. `generating.tsx` clears that key in eleven places. If it was
already cleared, the reader lands on a generating screen with nothing to resume.
**This path is unverified and needs device proof.**

**Simulator cannot prove this lane.** `push-notifications.ts:107` returns `'skipped'` when
`!Device.isDevice`, so the confirmed state is reached vacuously. You need a physical iPhone.

---

## 4. Item 5 — the 3-day trial continuation (feature, no code)

**The idea, from Nick's own conversation with Jordan.** Today a new reader answers the
onboarding questionnaire, hits the paywall, starts a trial, and is then made to answer a
**second** set of questions. Remove that second questionnaire. Build a 3-day continuation
series straight from the answers they already gave.

**Recovery status: the panel ran, the judge did not.** Three design agents finished
(`design:1`, `design:2`, `design:3`). `design:judge` **errored** at 185,791 tokens on the
session limit. There is **no judge verdict, no scores, no synthesis.** The recommendation
below is the recovery agent's own pick, grounded in code it read — not a recovered verdict.
No worktree and no code exist. `implement:trial-continuation` also failed.

**Where all three designs agree.** Drop the same eight steps, keep `purchaseConfirmation`
and `reminderTime`, keep the sample as its own 1-day devotional, and add an optional
`continuation` block to the existing `initial_arc` job.

**Where they differ.**
- **Design 1 (product-first)** owns the reader experience and rewrites the copy in detail.
  It replaces the generic `/generating` preview with a card quoting the reader's own first
  devotional, and adds a bespoke Today `'writing'` state.
- **Design 2 (minimal-change)** writes `devotionalLength` in `onPurchaseSuccess` rather than
  in `proceedToGeneration`, which means `generating.tsx` needs **no length change at all** —
  it already reads `user.devotionalLength` in four places. It reuses the existing
  `'preparing'` Today state instead of adding one.
- **Design 3 (robustness-first)** mints the `devotionalId` client-side before the first
  submit, making a resubmit after app-kill idempotent, and adds a full recovery ladder. It
  is the only design that solves "the reader must stay in the app". It fixes the length at a
  constant and explicitly rejects deriving it from the paywall's `tDays`, because `tDays`
  sits inside a render branch and falls back to 3 when RevenueCat gives no intro price.

**Recommendation.** Take **Design 2 as the spine**. Graft on Design 3's fixed
`TRIAL_CONTINUATION_SERIES_LENGTH = 3` and Design 1's copy for `purchaseConfirmation` and
`reminderTime`. Defer Design 3's client-minted id and recovery ladder to a separate lane —
they belong with `go-home-dead` and `notify-when-ready`.

**The decisive evidence for the whole feature.** The sample devotional Jordan liked was
**already generated from pre-paywall answers only**.
`buildOnboardingSampleGenerationRequest` fires at the `aspiration` step, at which point
`currentSituation` and `spiritualSeeking` are both still `''`. The second questionnaire has
never contributed anything to the devotional the reader actually responded to.

**Nine steps run after `purchaseConfirmation` today** (`onboarding.tsx` `ALL_STEPS` at 328):
`themeType` 414, `studySubject` 416, `currentSituation` 418, `diagnosticRound` 421,
`spiritualSeeking` 423, `upcomingEvent` 425, `readingDuration` 426, `devotionalLength` 427,
`reminderTime` 428.

`getFilteredOnboardingSteps` (`onboarding-step-helpers.ts:175-211`) removes a step in only
three cases, and `RETURNING_USER_ONLY_SKIPS` applies **only when
`existingUser?.hasCompletedOnboarding` is true**. A first-run buyer has no profile, so
**no post-purchase step is skipped for them today.**

**Do the pre-paywall answers satisfy the generator? Yes, with one gap and one override.**
`GenerationContext` requires `name`, `aboutMe`, `currentSituation`, `emotionalState`,
`spiritualSeeking`, `readingDuration`, `devotionalLength`, `bibleTranslation`.
- `currentSituation` — **the only real gap.** Arrives as `''`. The arc prompt renders
  `Walking through: ` empty at `arc-generator.ts:730`.
- `spiritualSeeking` — satisfied by fallback. `saveOnboardingData` writes
  `data.spiritualSeeking || data.aspiration`, and `aspiration` is pre-paywall and asks the
  identical question.
- `emotionalState` — always `''` today anyway. Not a regression.
- `devotionalLength` — defaults to **7**. **Must be forced to 3.**
- `bibleTranslation` — defaults to `'BSB'`; never asked.

**Files to change.** Mobile: `onboarding-step-helpers.ts` (new skip set, the length
constant, `purchasedDuringOnboarding` in the selection context, resume-step handling),
`onboarding.tsx` (pass the flag into both `getFilteredOnboardingSteps` calls and the `STEPS`
memo deps; set `devotionalLength: 3` in `onPurchaseSuccess`; copy; `proceedToGeneration`
passes `continueFrom`), `generation-api.ts` (`continuation` on `InitialArcUserContext`,
`buildContinuationFromSampleDay`), `generating.tsx` (read `continueFrom`, pass
`continuation` at both submit sites, persist it in the inflight record),
`(today)/index.tsx` and `compute-devotional-state.ts` (early `'preparing'` branch), and a
"Reading length" row in the You tab. Backend: `jobs.ts` (validate and clamp `continuation`),
`types.ts` (the type), `arc-generator.ts` (`buildContinuationSection`), `index.ts` (append
the sample's scripture to the used list), `prompts.ts` (day-1 reader-context line).
No route signature changes; `jobs.ts:872-874` already spreads unknown keys through.

**Sequencing.** Land `post-purchase-loop` first — it rewrites the exact body of
`onPurchaseSuccess` and persists `dataRef.current` into the draft at purchase time, so this
feature must set `devotionalLength: 3` **before** that draft write. Correct merged order
inside the handler: set length → write draft → `setPurchasedDuringOnboarding` →
`updateUser` → `advanceToNextStep`. After `key-people-multi` merges, `onboarding.tsx` line
numbers drift by +8 / +7 / +9 / +13 / +23 / +37; `onPurchaseSuccess` moves 3891 → 3928.
**Re-anchor by symbol, never by line.**

**Top risks the designs flagged.**
1. The Today card is unreachable until `go-home-dead` ships — Today's resume effect bounces
   the reader back for any inflight record under 15 minutes old.
2. After the purchase the current devotional is the read sample, with
   `daysCompleted 1 === totalDays 1`, so `computeDevotionalState` returns
   `'journey-complete'`, whose CTA opens `/onboarding?startAt=themeType` — **the exact
   interview this feature removes.** The new branch must sit **before** that check.
3. Both prompt insertions must be byte-identical no-ops when `continuation` is absent.
   Snapshot-test it, or every existing series changes.
4. The sample's passage is not in `used_scriptures`. Without appending it, Day 1 can reuse it.

**Open questions only Nick can rule on:** is the length fixed at 3 or does it follow the
trial? Does Day 1 land today or tomorrow (today means two devotionals in one calendar day)?
Which dropped preferences get a settings home, and which are simply dropped? Should the
returning-user new-series flow still ask all nine? What exactly does the
`purchaseConfirmation` copy promise if the sample job failed? And confirm the landing
sequence `post-purchase-loop` → `go-home-dead` → `trial-continuation`.

---

## 5. Item 9 — review prompt · already done

Jordan asked whether the app was meant to prompt for an App Store review. **It is, and it
already does, twice.** `review-prompt.ts:131` returns true on the first day completion and
`reading.tsx:948-960` defers the native sheet until the celebration is dismissed. Separately,
commit `a13d481a` on `main` fires the rating sheet the moment a reader completes the first
devotional **inside onboarding**. That commit is **not in build 260**; it ships with the next
build, and `changelogs/build-261.md` must mention it. No work is owed here.

---

## 6. Items 10 and 11 — the new reports from the continued thread

Nick continued the conversation with Jordan. Two more items, verbatim:

> **Jordan:** "I completed the first day, but there's nothing that prompts me."
> **Nick:** "Like what to do next kinda stuff?"
> **Jordan:** "Yah in terms of the loop." … "Did you want it to prompt the user to review the app?"
> **Nick:** "I do think it might be helpful to give someone something to do/nudge them to do a journal entry. Maybe we could do a 5 min meditation/practicing presence exercise."
> **Jordan:** "There were prompts in my devotional. So I did journal. But you can select SOAP in the beginning of the devotional, answer the prompts, and answer the 7 general questions too. May be good to simplify somehow based on user preference or your choice on what you want the app to be."
> **Jordan:** "Oh I guess SOAP and the 7 questions are the same thing."
> **Nick:** "If its confusing to you it'll be confusing to others lol"

### Item 10 — the day ends with nothing to do

**This is close to a plain bug, not a missing feature.**

Someone already built exactly the affordance Jordan is asking for. `InlineReflectComposer`
is a write-in-place field with autosave and a draft prefill, whose own header comment says
"The field IS the invitation: after finishing a reading the primary action is to write, in
place." It is attached to the `'complete-today'` state.

But `compute-devotional-state.ts` tests **`'tomorrow-locked'` first** (branch 5 at
`:199-215`) and `'complete-today'` second (`:217-233`). A reader who finishes day 1 of a
multi-day series always satisfies the earlier condition. The two states carry different
payloads: `'complete-today'` carries `reflectionStatus` / `freeWriteDraft` /
`onSaveFreeWrite`; `'tomorrow-locked'` carries none of them. `DevotionalCard.tsx:642-643`
gates `showInlineComposer` on `'complete-today'`. **So the composer never renders after day
1.** What Jordan got instead was a locked-tomorrow teaser and a small text link,
"Reflect on today →".

The rest compounds it. Two consecutive celebration overlays fire — `CompletionCelebration`
then `StreakCelebration` — and **neither has a single button**. The only Today stack card a
first-time reader sees is the Day-1 review card, which asks him to rate the reading rather
than do anything with it. The two same-day nudges that do exist, the midday and evening
check-in cards and their notifications, are **premium-gated** (`(today)/index.tsx:906-915`,
`useCheckInNotifications.ts:1-10`). So the readers most in need of a reason to come back —
new and trial readers — get nothing.

**Options, with honest tradeoffs:**
- **A. Fix the state routing** so the composer actually appears. Either give
  `'tomorrow-locked'` the reflect payload, or keep a just-completed day in
  `'complete-today'` for the rest of the calendar day. *Small — one state file, one card
  component, plus tests.* Uses a component that already exists and is already polished.
- **B. Give the completion celebration one action button.** *Small to medium.* But that
  component is deliberately wordless, `COORDINATION-PR-LANES.md` names it the canonical
  visual source for the EmberSystem lane, and it stacks awkwardly with the review sheet that
  already fires on its dismissal.
- **E. Ungate the same-day check-in** for non-premium and trial readers. *Small — one
  condition.* Directly fills the empty afternoon, but weakens the paywall's most concrete
  daily benefit. Commercial call, not an engineering one.
- **F. Build the 5-minute presence exercise.** *Large.* The most on-brand answer, but it
  adds a sixth surface to a journal that already has too many — see item 11.

**Recommendation: ship A now.** It is the cheapest fix in the list, it answers the literal
complaint with existing code, and it has the highest chance of being the whole answer.
Option A does **not** touch `(today)/index.tsx`, which is another reason to do it first —
`go-home-dead` and `generation-error-false` both edit that file.
**Do not build F yet.** A presence exercise on top of the current journal makes item 11 worse.

### Item 11 — the journal asks the same thing three ways

**Answer Jordan's question definitively: SOAP and the "7 questions" are not the same object,
but they do write into one entry — and the name genuinely collides.**

A normal day ships **three** reflection questions from `backend/src/lib/generation/prompts.ts:881`
("The HARD QUESTION", "Question 2", "Question 3"). Only contemplative interlude days ship one.
Those three questions and the day's single `JournalEntry` are then reachable from **four**
separate surfaces:

1. **Inside the reading** — `DevotionalContent.tsx:372-386` renders `InlineReflectionJournal`
   with the day's questions, its own inputs and its own link to the full journal.
   This is Jordan's "There were prompts in my devotional."
2. **On the home hero** — `InlineReflectComposer`, free-write only, `'complete-today'` only
   (and therefore invisible to him — see item 10).
3. **The full journal screen** (`journal.tsx`, 1738 lines) — a two-tab **Free Write / SOAP**
   mode selector. SOAP renders four labelled fields. Free Write renders one open field plus,
   on some paths, a question list. A **"Go Deeper"** button generates **three more** AI
   prompts on top, with its own "N of M complete" counter. A separate prayer-requests
   section sits below both.
4. **The Journal tab hub** — its own "N more reflections to explore" counter over the same
   questions.

Premium adds more: the Examen adds five first-person movements to the same day.

**The name collision is what actually stopped him.** "SOAP" is both a Bible-study method the
generator assigns to a day **and** a journal tab the reader can pick.
`journal-entry-state.ts:23` switches the tab based on the generated method — so a reader who
chose nothing sees the app "select SOAP" for them and reasonably concludes it is a setting
they made at the start. His own correction is him discovering that surfaces he thought were
separate tasks share one entry. That discovery should not require a second guess.

**Options:**
- **C. Collapse the journal to one surface.** Retire the Free Write / SOAP tab pair; make
  structure an optional toggle inside one entry rather than a peer mode; show one question
  list per day; rename so "SOAP" only ever means the study method. *Large.* This is the only
  option that answers what Jordan actually asked. It also removes a feature the paywall
  sells — `paywall.tsx:565` advertises "40+ study methods — Lectio Divina, SOAP, verse
  mapping + guided prompts" — so it needs a copy decision too.
- **D. Cut the question count at the source** — move a normal day from three reflection
  questions to one, matching the interlude shape. *Small — one prompt string at
  `prompts.ts:881`, backend-only, deploys without an app release.* But it only affects newly
  generated days, so Jordan would not see it on his current series.

**Recommendation: answer C before writing any more code.** Jordan's actual sentence is
"May be good to simplify somehow based on user preference or your choice on what you want
the app to be." That is not a bug report. It is a request for a product decision, and only
Nick can make it. Every other option is downstream: D is pointless if C removes the question
list, F adds a sixth surface, and B is a different answer to the same question about how
loud the completion moment should be.

**Open questions for Nick on items 10 and 11:**
1. What do you want the journal to **be**? One entry with an optional structure toggle, or
   two genuine peer modes? Every other journal decision follows from this.
2. Should a normal day carry one reflection question or three?
3. Should the completion moment stay wordless, or carry one action?
4. Is a same-day nudge a premium hook or part of the core loop?
5. Does the 5-minute presence exercise ship? Generated per day, or a fixed practice? Does it
   replace a journal surface or add one?
6. If SOAP is demoted in the journal UI, does the paywall copy change?
7. **Worth one message back to Jordan:** which seven questions did he count? The code has 3
   reflection questions, 4 SOAP fields, 3 Go Deeper prompts and a prayer list. "7" most
   plausibly means the 3 questions plus the 4 SOAP fields — confirming it tells you exactly
   which screen lost him.

---

## 7. Merge order — the plan

Four files carry three lanes each. Merge the isolated lanes first, establish each contested
file once, and **run the mobile gates after every single merge**. Verify each merge by
diffstat, never by exit code — two branches are no-ops.

| File | Lanes that touch it |
|---|---|
| `src/app/onboarding.tsx` | `key-people-multi` (committed **and** uncommitted), `post-purchase-loop`, `segue-cutoff` |
| `src/app/generating.tsx` | `generation-error-false` (uncommitted), `go-home-dead` (committed), `notify-when-ready` (uncommitted) |
| `src/components/onboarding/ThreeStepPaywall.tsx` | `paywall-mockup-cutoff`, `post-purchase-loop` |
| `src/components/__tests__/ThreeStepPaywall.test.tsx` | `paywall-mockup-cutoff`, `post-purchase-loop` |
| `src/app/(tabs)/(today)/index.tsx` | `generation-error-false` (uncommitted), `go-home-dead` (committed) |

**Step 0 is done.** All three lanes that held uncommitted work were committed on
2026-09-04 evening — see section 0, fact 2. Nothing is at risk of a rebase or a conflicted
merge any more.

Merge in this order:

1. **`segue-cutoff`** — two lines in `onboarding.tsx`, its other files are uncontested.
2. **`paywall-mockup-cutoff`** — establishes `ThreeStepPaywall.tsx` first.
   Close must-fix 1 before or immediately after: `MOCKUP_BOTTOM_CLEARANCE >= MAX_DRAG / 2`.
3. **`post-purchase-loop`** — resolves against both `onboarding.tsx` and `ThreeStepPaywall.tsx`.
4. **`key-people-multi`** — commit its repair first, then merge mobile and backend.
5. **`go-home-dead`** — establishes `generating.tsx` and `(today)/index.tsx`.
6. **`generation-error-false`** — commit, then **port onto** `go-home-dead`'s module boundary.
7. **`notify-when-ready`** — commit, copy the two untracked files, merge last.

### The two conflicts that need a human decision, not a merge tool

**`ThreeStepPaywall.tsx` import block** — `paywall-mockup-cutoff` inserts
`import { computeMockupSize }` two lines above the paywall-guardrails import block that
`post-purchase-loop` rewrites. Inside git's 3-line context, so a conflict is near-certain.
There is also a semantic hazard: `paywall-mockup-cutoff` keeps `resolvePurchaseOutcome` in
its import list, and `post-purchase-loop` removes the only remaining use of it in that file.
A naive union merge leaves an unused import and fails tsc `noUnusedLocals`.
**Resolution:** keep `computeMockupSize`, `addCustomerInfoUpdateListener`,
`hasUnfoldPremiumEntitlement` and `resolveOnboardingPurchaseAdvance`; **drop**
`resolvePurchaseOutcome`. Their body hunks do not overlap.

**`generating.tsx` / `(today)/index.tsx` — `go-home-dead` vs `generation-error-false` is
SEMANTIC, not textual, and this is the single hardest decision in the whole set.**
`add0c7ab` deletes `INFLIGHT_KEY` and `MAX_POLL_DURATION_MS` and moves the record into two
new modules. `generation-error-false` instead keeps `INFLIGHT_KEY` inline and writes to it
in four places. Worse, **`go-home-dead` reintroduces the exact wall-clock verdict that
`generation-error-false` exists to remove**: `inflight-initial-arc-watch.ts:15` defines
`INITIAL_ARC_MAX_POLL_DURATION_MS = 10 * 60 * 1000` and `:85` returns a failed outcome on
that timer.
**Do not merge both diffs textually.** Merge `go-home-dead` first, then port
`generation-error-false`'s decision helpers onto its module boundary — move
`evaluateGenerationDeadline` into `inflight-initial-arc-watch.ts` and delete that file's
failing wall-clock branch.

There is also a hard textual conflict in the `generating.tsx` import block between
`notify-when-ready` and `go-home-dead` on main lines 39-42, where `go-home-dead` deletes the
`mmkvStorage` import that `notify-when-ready`'s `/generating` resume path depends on. Keep
both sides, then **re-verify the failed-job resume on the merged tree, not on either lane
alone.**

**Backend has zero cross-lane collisions.** `arc-generator.ts` belongs to
`generation-error-false`; `push-notifications.ts` and `worker.ts` belong to
`notify-when-ready`; `key-people-multi` adds one test file.

### One App Review regression to never reintroduce

`ThreeStepPaywall.tsx` carries history. Guideline 3.1.2(c) rejected build 250 because the
yearly plan showed `$5.83/mo` more prominently than the billed `$69.99/yr`. Commit `37acae4`
fixed it. **Do not let a paywall conflict resolution restore a calculated per-month price as
the primary figure.** That is a resubmission-level regression.

---

## 8. Operational facts

### Release state

| Version | Build | State | Confidence |
|---|---|---|---|
| 1.1.0 | 253 | **Live on the App Store.** iTunes lookup for app `6760814444` returns 1.1.0, released 2026-09-03T20:13:17Z | verified live |
| 1.1.3 | 259 | **WAITING_FOR_REVIEW.** Version id `bedd9fe4-63f4-42d0-bcaf-b32386786305`, submission `e7fdda05-…`, submitted 2026-09-04T16:26Z, release type AFTER_APPROVAL | last checked 12:40 PT — **re-check first** |
| 1.1.4 | 260 | **TestFlight only**, never submitted to App Review. ASC build `05181dca` VALID | handoff record |

1.1.1 and 1.1.2 do not exist as separate store versions.

**`app.json` says `version: 1.1.4` (line 5) and `buildNumber: 183` (line 16). The build
number is stale and cosmetic.** `eas.json` sets `appVersionSource: "remote"` and the
production profile sets `autoIncrement: true`. EAS assigns it. **Do not edit `app.json`.**
Keep version 1.1.4, let EAS assign **261**, and write `changelogs/build-261.md`.
Bump to 1.1.5 only if Nick decides 1.1.4 goes to App Review first.

Changelog convention: `changelogs/build-<ascBuildNumber>.md`, 97 files, numbers not
contiguous. Each carries a `## What to Test` checklist that becomes the TestFlight note.

### Gate commands — both repos use `bun` (both hold `bun.lock`)

```bash
# mobile, from /Users/galangster/clawd/work/unfold/app/mobile
bun run typecheck        # tsc --noEmit
bun run lint             # eslint src scripts/*.mjs …
bun run test             # jest --passWithNoTests
bun run verify:release   # chains verify:profiles, verify:changed, verify:smoke
```

```bash
# backend, from /Users/galangster/clawd/work/unfold/backend
bun run typecheck        # tsc --noEmit -p .
bun run typecheck:tests  # tsc --noEmit -p tsconfig.test.json
bun run test             # vitest run
```

**Never run `bun test` in the mobile repo.** That invokes bun's own runner, which cannot
parse React Native's Flow-typed sources and fails on every file. Always `bun run test`.
The backend has **no** lint script and **no** release-verification script. Do not invent one.

**Baseline counts before any Jordan lane merges** (recorded 2026-09-04):
backend vitest **114 files / 908 tests**; mobile jest **236 suites / 2011 tests**;
both typechecks clean. Merging seven lanes adds tests, so counts rise.
**Treat any drop as a failure.**

### Git accounts — this will bite you

`gh` is currently active as **`NickMetaDAO`**, which **cannot push** to either repo.
Both belong to `galangster`.

```bash
gh auth switch --user galangster    # before any push
gh auth switch --user NickMetaDAO   # after the push
```

Remotes: mobile `https://github.com/galangster/unfold-app.git`,
backend `https://github.com/galangster/unfold-backend.git`.
No `fix/jordan-*` branch has a remote tracking branch; all seven are local only.

### TestFlight

`eas.json` profiles: `development` (internal), `preview` (internal), `qa-testflight`
(store, **sets `EXPO_PUBLIC_ENABLE_QA_TOOLS=1`**), `production` (store).
**Use `production`.** `SYSTEM-MAP.md:388` records that confusing the two profiles was a
past incident.

```bash
eas build --profile production          # must run from app/mobile
eas submit                              # must run from app/mobile
node scripts/set-testflight-changelog.mjs 261
```

**Always pass the build number to the changelog script explicitly.** With no argument it
reads `app.json`'s stale `183` and targets the wrong ASC build. The script mints an ES256
JWT with `node:crypto`, reads credentials from `eas.json` at `submit.production.ios`, needs
`./keys/AuthKey_NW2SL2F4ZN.p8` (present, 257 bytes, mode 600, gitignored), and rejects a
changelog body over 4000 characters.

**Correction to an earlier handoff:** the recovery agent grepped every markdown file in the
repo for `--local`, "local build" and "local archive" and found **zero matches**. The
proven path recorded for build 260 is an **EAS cloud build plus Expo's submit queue** (about
35 minutes). Ask Nick before assuming a local-archive workflow exists. The `iTMSTransporter`
fallback no longer exists; install Transporter from the Mac App Store if the queue stalls.

| Identifier | Value |
|---|---|
| ASC app id | `6760814444` |
| ASC API key id / issuer | `NW2SL2F4ZN` / `52f4e617-a4b3-4cee-bcd0-23f8e653d7b5` |
| Bundle id / widget | `com.unfoldapp.ios` / `com.unfoldapp.ios.widgets` |
| EAS project / owner / slug | `7f3bd89f-5b75-421d-81d3-3097787c984b` / `0xgala` / `unfold-app` |
| Backend URL | `https://api.unfoldapp.co` |
| Railway project | `62fdf682-99dd-429f-b42b-df85d40460c9` |

Do not use ASC key `38BW73P7M5` — its `.p8` is not on this machine.

---

## 9. Traps a fresh agent will fall into

1. **`git log main..fix/jordan-notify-when-ready` prints nothing, and the branch holds the
   largest backend diff in the set.** Same for `generation-error-false`. Merging either is a
   silent no-op that reports success.
2. **`key-people-multi` looks finished because it has a commit.** It also has uncommitted
   repair work answering two failing reviewers. Merging the branch drops it.
3. **`reviewPass: false` and `repaired: true` in the workflow JSON are bookkeeping, not
   verdicts.** Five of seven lanes were never reviewed at all.
4. **The backend deploys to Railway from `main` with no check gate.** A backend push ships
   to production immediately, before the app that consumes it. Push backend first, confirm
   the Railway deploy is SUCCESS, then cut the mobile build. This matters most for
   `generation-error-false`, where the backend fix must land **with** the mobile
   long-running change or unpatched clients start showing timeout copy on large plans.
5. **`main` already carries one unshipped feature commit**, `a13d481a` (onboarding review
   prompt). It is not in build 260. `build-261.md` must mention it.
6. **Expo Doctor will produce two expected warnings.** `ios/` and `android/` are committed
   (bare workflow), so Doctor complains that native directories coexist with config plugins;
   and `app.json`'s buildNumber 183 trails TestFlight 260. Both are noise.
   **Never run `expo prebuild`** — it would overwrite the committed Xcode project, which
   carries hand-driven Sentry source-map and debug-symbol upload phases. Treat any *new*
   Doctor finding as real.
7. **`eas submit` fails outside `app/mobile`.**
8. **The ASC API `PATCH /v1/reviewSubmissions … submitted:true` returns 409 after a
   rejection.** Use the "Update Review" button on the ASC version page, then Resubmit. A
   prior session lost over four hours to this. Also: an ASC write can return HTTP 500 and
   still have succeeded — re-read the version state before retrying any ASC write.
9. **Only one flaky test is on record and it is already fixed** — backend vitest cold
   parallel runs timed out at the 5 s default; `8623db6` raised `testTimeout` to 15 s. If a
   backend suite times out, check that commit is in your branch before blaming your change.
   No mobile jest flake is recorded. Two pre-existing eslint **warnings** live in
   `src/hooks/use-companion-chat.ts` and are not a gate failure.
10. **A full Metro reload lands the simulator on the onboarding re-entry screen.** Use
    `unfold://(tabs)/(today)` to get back. QA seeding is Settings → Dev Tools →
    "Test Reveal Screen (Dev)" / "Seed Real Devotional + Reveal (Dev)"; the old
    `unfold://debug-seed-*` routes are deleted.
11. **The `unfold-metro` launch config serves the canonical repo, which is `main`.** A
    screenshot taken without repointing Metro proves `main`, not your fix. Start Metro from
    the worktree, or merge first and then capture.
12. **`xcrun` was blocked in the prior workflow's sandbox.** That is why **no lane in the
    entire run produced simulator proof.** Every visual and device claim in this handoff is
    unproven.

---

## 10. Ordered next actions

1. ~~Commit the three lanes with uncommitted work.~~ **Done** — `2235947e` / `0e69da2`,
   `6e534745` / `23526a9`, `e206940c`. All worktrees clean, all branches ahead of main.
2. **Re-check whether 1.1.3 (build 259) came back from review.** Mint the ASC JWT the way
   `scripts/set-testflight-changelog.mjs` does and
   `GET /v1/apps/6760814444/appStoreVersions`. If rejected: "Update Review" on the version
   page, then Resubmit.
3. **Wire the backend half of `generation-error-false`.** It is currently inert and is the
   only thing that actually fixes Jordan's reported failure. Replace the `maxTokens` at
   `arc-generator.ts:842`, `:856` **and `:1088`** with `getArcMaxTokens(totalDays)`, route
   through `requestArcText`, preserve the Sonnet degrade path, and write
   `backend/src/lib/__tests__/arc-generator-model.test.ts`.
4. **Run the gates on every lane.** Five of seven have never seen tsc, eslint, jest or
   vitest at all.
5. **Get real adversarial review** on the five unreviewed lanes, and close
   `paywall-mockup-cutoff`'s must-fix 1 (the drag still reproduces Jordan's flat cut).
6. **Run `/simplify`** on each lane's diff — the runtime efficiency contract section 10
   requires it before seal and it is recorded for none of them.
7. **Merge in the order in section 7**, gating after each.
8. **Take it to a device.** `post-purchase-loop` needs a sandbox Apple ID.
   `notify-when-ready` needs a physical iPhone. Neither can be proven on a simulator.
9. **Cut build 261**, write `changelogs/build-261.md` covering all seven lanes plus
   `a13d481a`, and get it to Jordan.
10. **Then, separately:** get Nick's rulings on item 11 (what the journal should be) and
    item 5 (trial length, day-1 timing, landing sequence), ship item 10 option A, and open
    the trial-continuation lane.

---

## 11. Receipts

- **Prior run:** `wf_a261d4d2-f10`, 69 agents, 24.2 min, 4,661,838 tokens, status
  `completed`. Record and journal under
  `~/.claude/projects/-Users-galangster-clawd-work-unfold/d7e349e2-1bf4-496b-a15a-2e6b0eb9094b/`.
- **Dossier run:** `wf_2a101392-9c4`, 11 agents, 1,246,450 tokens. Seven lane dossiers plus
  the items 10/11 diagnosis. Four agents in that run received a malformed prompt (an
  un-joined array reached the agent as the literal string `[object]`); one recovered on its
  own by reading the session transcript, three did not.
- **Gap-fill run:** `wf_2c218958-fbc`, 2 agents, 290,972 tokens. Recovered the
  trial-continuation design panel and established the operational facts in section 8.
- **Patch backups:** `/Users/galangster/clawd/work/unfold/jordan-lane-patches/`, 12 patch
  files plus 2 untracked modules. All four uncommitted patches verified with
  `git apply --check` against current `main`.
- **Committed in this session:** this handoff (`2649f6cc`, mobile main), and the five lane
  commits listed in section 0 fact 2 (on their own branches, not on main).
- **Not done in this session:** no branch was merged, no gate was run, no lane code was
  edited, and **nothing was pushed**. Mobile main is 1 commit ahead of origin (the handoff);
  backend main is level.

---

## 12. Opener for the next session

```
Read app/mobile/handoffs/2026-09-04-jordan-feedback-eleven-items.md first, in full.

Unfold has eleven items from tester Jordan. Seven have fix lanes in worktrees under
/private/tmp; NOTHING is merged; mobile main is 5fcb0edf plus one handoff commit, and
backend main is 105b7c2. Every lane is now committed on its own branch and every worktree
is clean, but five of seven lanes have had no adversarial review and no gate run at all.
Patch backups are at ~/clawd/work/unfold/jordan-lane-patches if /private/tmp is gone.

Section 10 action 1 is already done. Start at action 2, and work section 10 in order.
The highest-value single fix is action 3: the backend half of generation-error-false is
committed but INERT, and it is the only thing that actually fixes what Jordan reported.

Do not trust the reviewPass/repaired fields in the old workflow JSON — five of seven lanes
were never reviewed. Do not merge generation-error-false and go-home-dead textually; the
conflict is semantic and section 7 explains it.

Both repos belong to the galangster GitHub account: run `gh auth switch --user galangster`
before any push and switch back to NickMetaDAO after. The backend deploys to Railway from
main with no gate, so a backend push ships to production immediately.

Ask me before ruling on item 5 (trial length, day-1 timing) or item 11 (what the journal
should be) — those are mine to decide.
```
