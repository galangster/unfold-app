# Handoff: Scripture save and highlight, plus the PR #177 follow-through

Written 2026-09-28 by the session "Erased sessions error and scripture bookmarking". Nick approved the recommendations: "do what you recommend".

## Current state

### PR #177: Sentry UNFOLD-MOBILE-N

- PR: galangster/unfold-app#177, "Stop the reader's day check from tripping the sync rate limit".
- Branch: `claude/reader-day-check-2026-09-27`.
- Commits: `2b9013f3` (the fix) and `7d0ff612` (fixes for two Greptile P1 findings).
- Local gates are green on `7d0ff612`: typecheck, lint (0 errors), jest (502 suites, 4,344 tests) and `verify:profiles`.
- CI `verify` and Greptile passed on `2b9013f3`, but Greptile scored it 3/5 with two P1 findings:
  - The generation watch looked up the job inside a rate-limit window.
  - A job already running for a non-current series was no longer watched.
- `7d0ff612` fixes both. Both threads have a reply and are resolved. `@greptile-apps review` was posted on 2026-09-28.
- The commit message says "Fixes UNFOLD-MOBILE-N", so Sentry resolves the issue on merge.
- Root cause, for the record: a paused series opened from the library showed an unbounded "Check for Day N" loop for a day that no job will ever write. Each tap made a forced full sync pull plus `GET /api/jobs/find-day` against the per-user `db-read` limit of 30 requests a minute. Sentry's suspect commit `c3faa3f` did not cause it.
- A simulator capture of the new paused-series state is on Nick's side (sent in the session). It is not attached to the PR yet because this machine has no CLI attachment support.

### This spec

- `docs/superpowers/specs/2026-09-28-scripture-save-and-highlight-design.md` on branch `claude/scripture-save-2026-09-28`.
- The branch holds documents only. It is pushed and has no PR yet.

### Parallel session: the paused-series library label

- Nick started "Stop labeling paused-series days 'Being prepared'" on 2026-09-28. It owns the library label for paused series.
- It was told the reader copy from #177 ("Day N wasn’t prepared" / "This series was paused before Day N. Open Today to keep reading.") and asked to use "Not prepared".
- It must not edit the files that #177 changes.
- Tell it when #177 merges.

### Follow-up chips queued for Nick

- Micah's missing series-complete animation.
- The literal "# Recommendation" heading on the Today recommendation card.

## Live surfaces

- PR #177 is open.
- Two worktrees sit in the old session's scratchpad: `.../scratchpad/wt/mobile` (#177) and `.../scratchpad/wt/scripture` (this branch). They can disappear. Both branches are on origin.
- The simulator (iPhone 17 Pro) is shut down and Metro is stopped.
- The temporary QA route and its allowlist entry were deleted before any commit. The `unfold-metro-429-fix` entry was removed from `.claude/launch.json`.

## Next actions, in order

1. **Finish PR #177.** Read Greptile's re-review on the current head.
   - If confidence is 4/5 or higher, no finding is actionable, and CI is green: squash-merge per the Unfold PR SOP.
   - Otherwise: fix, run the gates, push once, reply and resolve the threads, and post `@greptile-apps review` again.
   - After the merge, message the label session.
2. **Build Scripture slice 1.** After #177 merges, rebase `claude/scripture-save-2026-09-28` onto `origin/main`. Slice 1 edits `reading.tsx`, which #177 also changes.
   - Write behaviour tests first (tdd).
   - Then run the gates, `/simplify` and code-review, and take a simulator capture.
   - Open the PR. The spec and this handoff ride in it.
3. **Slice 2.** Open a backend PR in galangster/unfold-backend first (the columns and the sync mapping). Then open the app PR.
4. **Slices 3 and 4.** One PR each.

## Owner gates

- Slice 1 has none. The decisions are recorded in the spec.
- Customer release notes describe user-facing changes only. See `AGENTS.md` at the unfold root.
