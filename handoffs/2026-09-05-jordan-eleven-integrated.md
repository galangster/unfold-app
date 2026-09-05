# Handoff: Jordan's eleven items — integrated, gated, pinned, not yet on main

**Date:** 2026-09-05. **Author:** Claude (Fable 5.1) with Nick. **Predecessor:** `handoffs/2026-09-04-jordan-feedback-eleven-items.md`.
**Status:** every code item is fixed, merged onto `integrate/jordan-eleven` in both repos, gated, adversarially reviewed and mutation-pinned. **Nothing is on `main`. Nothing is deployed.** Items 5 and 11 wait on Nick's rulings.

## 0. Read this first

| Repo | Branch | HEAD | Base (`main`) | Gates |
|---|---|---|---|---|
| mobile | `integrate/jordan-eleven` | `4acd6cb2` | `3299ecdf` | tsc 0 · eslint 0 errors · jest **249 suites / 2247 tests** (baseline 236 / 2011) |
| backend | `integrate/jordan-eleven` | `54245d6` | `105b7c2` | tsc 0 · tsc tests 0 · vitest **116 files / 943 tests** (baseline 114 / 908) |

- Merge order followed section 7 of the predecessor exactly: segue-cutoff → paywall-mockup-cutoff → (day-ends-empty) → post-purchase-loop → key-people-multi → go-home-dead → generation-error-false (semantic port) → notify-when-ready → regression pins → simplify.
- The generation-error-false / go-home-dead conflict was resolved semantically, not textually (mobile `09810dc8`): the inflight record lives in `src/lib/inflight-generation-job.ts`, the Today watch in `src/lib/inflight-initial-arc-watch.ts`, and **no wall-clock failure verdict exists anywhere**. Only six consecutive failed status polls end in an "unreachable" state that keeps the record.
- Mobile `main` is two doc commits ahead of `origin/main` (`2649f6cc`, `3299ecdf`); the integrate branch carries them.
- Backend `main` deploys to Railway on push with no gate. Merging the backend PR is a production deploy. Merge backend first, confirm the Railway deploy, then cut the mobile build.

## 1. Item status

| # | Item | State | Where |
|---|---|---|---|
| 1 | Key people, several per relationship | Fixed, reviewed, pinned, simulator proof | `handoffs/proofs/2026-09-05-jordan/item1-key-people-two-friends.png` |
| 2 | "We heard you" hard-edged band | Fixed, reviewed, pinned, simulator proof | `…/item2-we-heard-you-no-band.png` |
| 3 | Paywall mockup cut flat | Fixed incl. the full-drag regression, reviewed, pinned, simulator proof | `…/item3-paywall-mockup-fits.png` |
| 4 | Post-purchase loop (critical) | Fixed, 3-lens review + repair + verify, pinned | **device proof owed** (sandbox Apple ID) |
| 5 | 3-day trial continuation | **Not built — owner rulings needed** (section 4) | — |
| 6 | Go home did nothing | Fixed (focus-effect read, Today watch, failed card), reviewed, pinned | unit + render tests |
| 7 | False "Something went wrong" | Fixed on both sides: backend arc budget floor 12000 / 24000 re-call / truncation guard / budget-sized provider deadline; mobile never fails by clock | backend + mobile tests |
| 8 | No notification when ready | Fixed: failure push for `initial_arc`, denied → Open Settings, failed registration keeps the link, push landing polls the server, stale push → Today | **device proof owed** (physical iPhone) |
| 9 | Review prompt | Already on main (`a13d481a`), ships in 261 | changelog |
| 10 | Day ends with nothing to do | Fixed (option A: composer after a completed day), reviewed, pinned | unit + render tests |
| 11 | Journal asks the same thing three ways | **Not built — owner ruling needed** (section 4) | — |

## 2. Verification receipts

- **Per-lane hardening:** `wf_77cfa346-4af` (44 agents): implementer + 3 adversarial lenses (regression, reader-path, robustness) + repair + independent verify per lane. Every must-fix closed except one narrow residual on item 8 (below).
- **Port + review:** `wf_ec16ade2-f31`: three must-fixes (sample-devotional stale-push false positive, superseded job after Start over, 404 treated as connectivity) closed in mobile `92331712`, verified.
- **Regression pins:** `wf_643f6859-c94`: **37 of 37 symptom statements fail under a hand-applied mutation of the fix** and pass on the tree. New pinning tests: `onboarding-key-people-step.test.ts`, `generating-go-home.test.tsx`, `today-go-home-watch.test.tsx`, additions to `inflight-initial-arc-watch.test.ts` and `compute-devotional-state.test.ts`.
- **Simplify (contract §10):** four reviewers (reuse, simplification, efficiency, altitude); 15 of 18 items applied in mobile `4acd6cb2` and backend `54245d6`. Skipped with reasons in those commit bodies.
- **Simulator:** Debug build via FlowDeck on iPhone 17 Pro from the integrate tree, three captures in `handoffs/proofs/2026-09-05-jordan/`. Items 6 and 10 were not captured (they need a real generation); both have render-level tests.
- Workflow records live under `~/.claude/projects/-Users-galangster-Documents-vault-main-projects-unfold/42858c05-0e3c-4ece-a304-574ac0007cc7/`.

## 3. Known residuals (not blockers)

- Item 8: after Start over, a fresh submission that throws before a job exists deletes the inflight record; a later tap on the old "We hit a snag" push can then land on the superseded job. Needs an owner ruling on whether a superseded marker should survive record deletion.
- Item 7: a job the server no longer knows (404) is now a terminal discard with Start over visible.
- Item 4: nobody has approved the new entitlement-pending wording. The 13 mini at Dynamic Type 130% shrinks the paywall mockup to roughly 300–372pt (item 3); owner call.
- Item 1 behaviour change for the release note: tapping an active chip no longer removes that person; removal is the row's x. At the cap the chip is truly disabled with a caption.
- Simplify follow-ups, deliberately not done in this pass: single owner for the inflight record (MMKV record vs persisted generationSession), driving `generating.tsx` from the Today watch instead of a second poll loop, structured backend error codes instead of substring matching, collapsing `ObservedJobState` to a boolean, an owner discriminant instead of `leftForHome`/`superseded`.

## 4. Rulings only Nick can make

**Item 5 — trial continuation.** Recommended spine: Design 2 (write `devotionalLength` in `onPurchaseSuccess`, reuse Today's `preparing` state) + fixed `TRIAL_CONTINUATION_SERIES_LENGTH = 3` + Design 1 copy. Decide: (a) length fixed at 3 or follows the trial; (b) Day 1 available as soon as generated (two devotionals in one day) or tomorrow; (c) which of the eight dropped steps get a settings home; (d) does the returning-user new-series flow still ask all nine; (e) what `purchaseConfirmation` promises if the sample job failed. Sequence after ruling: this branch already carries post-purchase-loop and go-home-dead, so the feature can start from `integrate/jordan-eleven`; set length before the synchronous draft write in `onPurchaseSuccess`.

**Item 11 — journal.** Decide what the journal is: one entry with an optional structure toggle (option C, large, changes paywall copy at `paywall.tsx:565`) or two peer modes. Then: one or three reflection questions per normal day (option D is backend-only); wordless completion or one action; same-day nudge premium or core; presence exercise yes/no. Worth one message to Jordan: which seven questions did he count.

## 5. Next actions

1. Review the two PRs (links in the session summary). Mobile CI runs typecheck/lint/jest on the PR; backend CI runs on the PR too.
2. Merge backend first (`gh auth switch --user galangster`), confirm Railway deploy SUCCESS.
3. Merge mobile, fast-forward is clean. Then from `app/mobile`: `eas build --profile production`, `eas submit`, `node scripts/set-testflight-changelog.mjs 261` (build number explicit; `app.json` still says 183).
4. Hand build 261 to Jordan with `changelogs/build-261.md` "What to Test": the sandbox purchase and physical-iPhone push recipes are the two proofs this session could not produce.
5. Rule on items 5 and 11; then open those lanes from `integrate/jordan-eleven`.
6. Re-check 1.1.3 (build 259): still WAITING_FOR_REVIEW at 2026-09-04 19:45 PT.
