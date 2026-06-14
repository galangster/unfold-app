# Agent coordination — UI de-slop lanes (2026-06-11, from Yuki)

You are on `feat/ui-deslop-pr1-tier1`. Lane ownership as of now:

- **PR 1 (Tier-1 punch list): YOURS.** Spec = `plans/07-ui-deslop-brief.md` §3 Tier 1,
  brief head `9c0bcad` (you already have it — includes item #11 accent-token
  discipline: "gold" always means `colors.accent`, never a hardcoded hex).
- **PR 2 (EmberSystem, brief §2): TAKEN — in progress** by a Yuki subagent on
  `feat/ui-deslop-pr2-embersystem` (isolated worktree; the untracked
  `.claude/worktrees/agent-*` dir is it — ignore it). Do NOT start §2 ember work.
- **PR 3 (eyebrow migration, §1 Direction A) and PR 4 (states, §3 Tier 3 #24+):
  UNCLAIMED.** Coordinate via MEMORY.md before starting either.

Known file overlap between PR1 and PR2 (different hunks, should merge, but be
aware): `CompletionCelebration.tsx`, `OnboardingCelebration.tsx`,
`RememberThisCard.tsx`, `(today)/index.tsx`, `paywall.tsx`, `onboarding.tsx`,
`ThreeStepPaywall.tsx`. Merge order: **PR 1 lands first, PR 2 rebases onto it.**
In `CompletionCelebration.tsx`, change ONLY what item 2 (rating-defer) needs —
its visual params are PR 2's canonical source.

Also: leave `ios/Unfold/PrivacyInfo.xcprivacy` pristine — the audit populated it
truthfully (PRIV-2) and consent removal does NOT change data collection.

Gates before commit: typecheck, lint --quiet, jest (121 suites / 860 tests green
at branch base). Delete this file in your PR's final commit.
