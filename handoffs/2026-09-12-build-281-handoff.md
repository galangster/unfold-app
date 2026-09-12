# Handoff — build 281, support bugs and the Study tab

**From:** orchestrator session `unfold-ca`, night of 2026-09-12 (UTC).
**To:** Astra.
**Reason for handoff:** the originating session is far past its useful context window. Everything below is the complete state; you do not need that conversation.

---

## 1. Where things stand in one paragraph

Two paying subscribers reported bugs on 2026-09-12. Both are fixed and **merged to main**, along with two other lanes. `main` is at `14b367ff`, full suite green (381 suites, 3309 tests, 0 failures). **Nothing has been submitted to Apple.** 1.1.9 build 280 is still sitting in `WAITING_FOR_REVIEW` and Nick has approved cancelling it so everything ships as one build 281. A fifth "Study" tab is built but uncommitted in a worktree and has never run on a device.

---

## 2. main — what merged tonight

| Commit | PR | What |
|---|---|---|
| `840adebd` | #105 | Wind-down screen had no working exit. Both exits called bare `router.back()`; the evening push uses `router.replace()`, which leaves no history, so `back()` was a silent no-op. Two users were trapped. |
| `53009938` | #106 | Same defect class app-wide. 22 call sites migrated to `useGuardedBack`, 3 hand-rolled guards deleted, eslint rule banning `.back()` outside `src/lib/navigation.ts`. 61 files. |
| `996f2832` | #107 | Notification copy variation. 14 pre-rolled one-shot DATE triggers replace one repeating DAILY trigger, so copy no longer freezes. Plus the Companion note card now shares the notification's body function. |
| `14b367ff` | #108 | Evening wind-down no longer reflects on a reading that never happened. |

Verify each with `git log --oneline origin/main -4`.

**Gates on merged main:** `npx tsc --noEmit` 0 errors; `CI=1 ./node_modules/.bin/jest` 381 suites / 3309 tests / 0 failures.

---

## 3. The two users

**James — Support ID `anon_90c594cf-f57d-4d70-98df-979f426e2d44`**

Hawaii (`Pacific/Honolulu`, correct). Reported the wind-down trap, then: *"Upon opening the App, I am now being greeted by the Day One (of 7) devotional start screen. I don't think I can get back to the screen I was at earlier."*

Diagnosed from production: **no day was ever marked read** (`is_read: false`, `read_at: null`) and his series row has never been updated since creation, while his `sync_users` and `user_generation_config` rows both wrote that day — so his device syncs fine. **Nothing was lost.** He read the text but never completed the day. The evening wind-down had no gate requiring a completed reading, so it produced an examen announced as "based on the reading this morning", and then Today correctly showed him Day One. The app told him his day was done, then told him to start it. That is what #108 fixes.

**Jordan — Support ID `anon_3eb9cb3c-d990-49d4-9ec4-8fd1053bb529`**

Also Hawaii. Independently reproduced the wind-down trap: *"tap good night > tap anywhere > goes back to the evening prayer > try to press the back arrow on the top > nothing happens."* Fixed by #105/#106. His data is clean and his day gating was working correctly.

**Both are owed a reply and neither has had one.** James's message should say plainly that nothing was lost, that the app misled him about finishing the day, and that it is fixed.

---

## 4. Release state — the one thing that needs doing carefully

| Version | Build | State |
|---|---|---|
| 1.1.8 | 279 | `READY_FOR_SALE` — this is what users have |
| 1.1.9 | 280 | **`WAITING_FOR_REVIEW`**, submission `fe21eb5b`, submitted 2026-09-12T01:29Z |

Build 280 was cut from `66abdf65` and contains **none** of tonight's four fixes. It carries B1 (signed device credential), whose enforce flip is 30 days out, so it has no urgency of its own.

**Nick's decision, made explicitly:** pull 280 from review, cut 281 with everything, submit that. Apple reviews one version at a time, so this is required — not optional.

**Sequencing that matters:** do NOT cancel 280 until 281 is built and shows `VALID` in App Store Connect. The queue slot is worth holding until there is something real to replace it with. That was a deliberate decision, not an oversight.

**Release recipe** (from `~/.claude/projects/-Users-galangster-clawd-work-unfold/memory/`):
- `cd app/mobile` first — `eas submit` from the parent fails with "EAS project not configured".
- `eas build --platform ios --profile production` then `eas submit`.
- `appVersionSource: remote` with autoIncrement — `app.json`'s `ios.buildNumber` has been stale at "183" since build 183. Do not "fix" it.
- ASC API key `NW2SL2F4ZN` at `app/mobile/keys/`.
- Apple upload can exceed 10 minutes; run submit in the background.
- `asc review submit` fails its own final check on read lag every time. Finish with `asc review submissions-submit --id <submission> --confirm`.
- ASC app id is **6760814444** (not the 6746827498 in `SupportSection.tsx`, which is the store URL id).

---

## 5. The Study tab — built, uncommitted, unverified

**Worktree:** `/Users/galangster/clawd/work/unfold-study-tab-20260912-wt`, branch `feat/study-tab`, **19 uncommitted files**, based on `840adebd` — **it needs rebasing onto `14b367ff`**, which will conflict with #106's navigation rewrite.

Built by a design-judge-build-verify workflow. Gates at build time: tsc 0, eslint 0 errors, jest 379 suites / 3286 tests / 0 failures.

**What it does:** a fifth visible tab surfacing the series arc. It reuses the existing `(you)/series-detail.tsx` rather than building a second copy of it, adds `src/lib/tab-stack-routes.ts` (a pure resolver replacing hardcoded `(today)` push targets), and registers `(study)` in the deep-link allowlist, the tab bar icon/label switch, `useCrossTabBack`, and the onboarding tooltip geometry.

**Why the first plan was thrown away.** An adversarial audit killed it on facts. Read this before touching the work:
1. The "new arc screen" already exists — `(you)/series-detail.tsx`, 591 lines, already tested, renders exactly the day list with progress and read/current/locked states.
2. `KNOWN_ROUTE_GROUPS` in `deep-link-allowlist.ts` is a **closed set**; `unfold://(tabs)/(study)/…` links are rejected until `(study)` is added. `CROSS_TAB_FROM` likewise needs `'study'`.
3. The tab bar's `renderIcon` ends in `default: return <HouseIcon/>` — registering a `Tabs.Screen` alone ships two adjacent identical house icons.
4. `HomeOnboardingTooltips.tsx` hardcodes `usableWidth / 4`.
5. **Do not remove anything from Today.** "Create Series" *is* the hero in the no-series and just-finished states (`DevotionalCard.tsx` ~207 and ~729). Stripping it empties Today at the two highest-intent moments in the app.
6. Forward navigation in `series-detail.tsx` and `day-menu.tsx` hardcodes `/(tabs)/(today)/reading`, which yanks a Study visitor into the Today stack.

**Three things explicitly NOT verified — no native build was ever made:**
- "Companion" truncating in a 1-of-5 tab slot on a 375pt device at large Dynamic Type.
- The new icon's legibility at 22px beside its four neighbours (named fallback: `PathIcon`).
- The iOS edge-swipe back from a reader launched out of Study.

**My recommendation, which Nick has not accepted or rejected:** ship 281 without the tab, land the tab as its own PR for review, and ship it in 282 after someone runs it on a phone. Tonight a 126-agent review found six defects in a nine-line change of mine; a 22-file navigation restructure with zero device verification in front of Apple, on an app already carrying an August 2026 rejection, is a bad trade. **Nick has said twice that he wants the tab. Treat that as his decision unless he says otherwise — it is his product.**

---

## 6. Open work, ranked

### Fix-forward on already-merged code
1. **`useCheckInNotifications.ts:270`** (LOW, confirmed 3/3). The incomplete-write retry is lost when the fingerprint reverts to an already-stamped value on the same day: refs keep the last *successful* fingerprint, so a toggle-off/toggle-on re-arms the skip gate over a queue that was never repaired. Fix with a sticky `needsRetryRef` rather than inferring failure from unchanged refs.
2. **Companion note card is now hard-truncated to 150 chars with an ellipsis** (LOW). The body moved to `getMiddayCheckInBody`, every branch of which wraps in `truncateNotificationBody` (`MAX_NOTIFICATION_BODY = 150`). Right for a banner, wrong for a card. Nick asked for this parity fix, so check with him before changing the shape of it.

### Never assigned to anyone
3. **Multi-series archiving gap.** 8 production users carry more than one live non-archived series, two of them five. `archived_at` is set on only 17 of 92 series. This is the mechanism by which a user's "current" series can diverge between client and server — the most likely cause of a future "I lost my progress" report.
4. **`America/Chicago` default** hardcoded in two `users.ts` INSERTs (~line 124 push-token, ~line 210 notification-time). One likely stranded user. The sync-push write path is correct and overwrites on every push; only these INSERTs plant the default.
5. **24 of 90 config rows have `stagger_offset_minutes` NULL**, so they are not enrolled in overnight pre-generation and hit the ~2.5min "preparing" wait at morning open.
6. **`share-card.tsx:413`** exits only through `router.dismiss()`. `/share-card` is deep-link allowlisted; `dismiss()` on a non-modal cold start is the same defect class #105/#106 fixed, and `goBackOr` does not cover dismiss.
7. **Settings into the profile screen.** Nick asked for this and it was never started. Note the tab-budget interaction: with the fifth slot spent on Study, `(you)` stays `href: null` behind the avatar, so merging Settings into it is the only remaining way to shorten the path. Two users needed an annotated screenshot to find Support ID tonight.
8. **`checkin-schedule.tsx` DAYS tuple** should import `CHECKIN_DAY_KEYS` from `lib/check-in-schedule.ts`. The screen writes the `byDay` map the scheduler reads and nothing type-checks the spelling.
9. **`Info.plist` line 119 declares the `fetch` background mode**, `app.json` line 27 does not, and no task is registered. Guideline 2.5.4 exposure. Builds 1.1.0–1.1.8 all shipped this and were approved, so it is not urgent — but fold it in with the background-task work below.
10. **Background top-up task for check-ins.** #107's 14 pre-rolled triggers only refill when the app is foregrounded, so a reader who never opens it goes quiet on both check-in slots after 14 days. Deliberate and documented; the morning daily reminder and the server lapse re-entry push still fire. `expo-background-fetch` and `expo-task-manager` are already in `package.json` with zero imports. **Do not "fix" this by raising `PRE_ROLL_DAYS` — Nick confirmed 14 over 21 explicitly**, because 21 pushes pending notifications to ~49 of the iOS 64 cap and the trial-ending notice is the request that gets culled.

### Never done at all
11. **No device verification of any navigation work from tonight.** Four merged PRs, all touching navigation, none run on a simulator. My one attempt failed because the Expo dev client intercepts the `unfold://` scheme on cold start. There is a Metro launch config `unfold-metro-windown-gate` in `.claude/launch.json` pointing at a worktree that may no longer be relevant.

---

## 7. Things that will bite you — learned the hard way tonight

**Pushing.** The remote rejects the default osxkeychain identity (NickMetaDAO, 403). Scope the token per command:
```bash
export GH_TOKEN="$(gh auth token --user galangster)" && git -c credential.helper='!f(){ echo "username=galangster"; echo "password=$GH_TOKEN"; }; f' push origin <branch>
```

**Greptile — three separate traps, all hit tonight:**
- A check run can conclude `success` while its **output text** reads "1 comments added" and a thread is unresolved. Read the output text, not the conclusion.
- `mergeStateStatus: CLEAN` does not account for unresolved review threads unless branch protection requires it.
- **Greptile does not always auto-review a new push.** Verify a Greptile check run *exists* on the head commit — absence reads as success to a naive watch. Re-tag with a top-level `@greptileai review` comment. A clean re-review posts no review object, only the check run reading "N files reviewed, 0 comments added".

```bash
gh api "repos/galangster/unfold-app/commits/$SHA/check-runs" --jq '.check_runs[] | "\(.name): \(.conclusion) | \(.output.summary)"'
```

**A green jest run does not mean the code compiles.** `tsc` caught a screen that did not compile while jest passed 3289 tests, because no suite renders `evening-wind-down.tsx`. Run both, always.

**Run the FULL suite for any shared-navigation change.** 33 test files mock `expo-router` inline with partial routers; there is no central mock. A touched-files gate reported green and CI then failed with 12 failures across two suites.

**In a worktree:** `CI=1 ./node_modules/.bin/jest`. Symlink `node_modules` from `app/mobile` rather than installing.

**Do not work in `/Users/galangster/clawd/work/unfold/app/mobile` if another session might be.** I switched its branch out from under a working session tonight; nothing was lost, but a commit in that window would have landed on main.

**Production database access:**
```bash
cd backend && DB=$(railway variables -s Postgres-9X5K --json | python3 -c "import sys,json;print(json.load(sys.stdin)['DATABASE_PUBLIC_URL'])")
```
Then the `postgres` driver in `backend/node_modules`. Tables: `sync_users`, `sync_devotionals`, `sync_devotional_days`, `user_generation_config` (its user column is `user_id`, not `clerk_user_id`).

**Over half the user base is in Hawaii** — 49 of 90 config rows are `Pacific/Honolulu`, against 17 Los Angeles and 9 New York. Any reasoning about day rollover, notification timing, or "is it still today for this reader" should start from HST, not UTC or a mainland assumption. An evening Hawaii reader is at 07:00–09:00Z the *following* UTC day.

---

## 8. Owner decisions already made — do not relitigate

- **Pull 280, resubmit as one build 281.** Nick chose this over letting 280 finish.
- **He wants the fifth tab.** Reaffirmed after I recommended against it.
- **`PRE_ROLL_DAYS` stays 14**, confirmed by Nick directly.
- **Fix the Companion note card** — done in #107.
- **Settings into the profile tab** — asked for, not started.

## 9. Open question for Nick

Whether the Study tab ships in 281 or 282. He wants the tab; I recommended 282 after device verification. He has not answered that specific question. **Ask before cutting the build.**

---

## 10. Ordered next actions

1. Ask Nick the §9 question.
2. Rebase `feat/study-tab` onto `14b367ff`, resolve the #106 conflicts, run all three gates, commit, push, open a PR, run the Greptile loop.
3. Verify the navigation work on a simulator — this is the largest untouched risk in the build.
4. Reply to James and Jordan.
5. Build 281 via EAS. Wait for `VALID` in ASC.
6. **Only then** cancel submission `fe21eb5b`, attach 281, submit.
7. Fix-forward items 1 and 2 from §6 in a follow-up PR.

---

*Written by the orchestrator session, 2026-09-12. Four PRs merged, two workflows run (126 agents + 8 agents), two peer lanes coordinated and stood down.*
