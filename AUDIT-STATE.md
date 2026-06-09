# AUDIT-STATE — Unfold E2E audit (build 218)

> Resumable state for the audit loop. Read this first on every wake. Delete before any merge.
> Master prompt: `~/Desktop/unfold-e2e-audit-prompt.md`. Goal contract = §2 of that prompt.

## Ground truth

- Baseline commit: `9f36ef6` ("docs(testflight): add build 218 changelog") = build 218 source. `main` == `origin/main` == `9f36ef6`, clean.
- **Tag `build-218` does NOT exist** (local or remote; tags stop at build-215). Nick pinged on Discord 2026-06-09; source commit corroborated via changelog commit + MEMORY/ASC records. Proceeding per §8 (continue what's unblocked).
- Worktree: `/Users/galangster/clawd/work/unfold-audit`, branch `audit/e2e-build218-2026-06`.
- Repo layout reality: `app/mobile` is its own git root (NOT a monorepo root with `work/unfold`); `backend/` separate git history at `/Users/galangster/clawd/work/unfold/backend` (read-only for this audit). Outer `~/clawd` repo is the spike-commit hazard (`1c54f9fd`, dirty) — never touch.
- Evidence dir: `/tmp/unfold-e2e-audit-2026-06/`
- Simulator: iPhone 17 Pro `38CDF1B0-50AB-49C3-A079-5FAB16918FA2` (per USER.md)

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 Baseline | DONE | worktree ✅, deps ✅, gates ✅ (see below), Discord tag-ping sent ✅ |
| 1 System map | IN PROGRESS | Workflow fan-out launched; fragments → `/tmp/unfold-e2e-audit-2026-06/map/`, synthesized map → `SYSTEM-MAP.md` in worktree |
| 2 Static audit (12 dims) | pending | |
| 3 Runtime walkthrough | pending | |
| 4 Fix loop | pending | |
| 5 Re-sweep until dry | pending | needs 2 consecutive clean rounds |
| 6 Final gates + report | pending | |

## Baseline gate results (2026-06-09, logs: /tmp/unfold-e2e-audit-2026-06/baseline-gates/)

- typecheck: PASS
- lint: PASS (0 errors)
- verify:profiles: PASS
- verify:changed: PASS
- full Jest (runInBand): PASS — **91 suites / 609 tests** (known did-not-exit open-handle warning)
- verify:release (prod api.unfoldapp.co): PASS
- expo install --check: FAIL — **registry drift, not repo regression**: 20 expo packages each exactly 1 patch behind versions published after the 218 cut (expo 56.0.8→~56.0.9 etc.)
- expo-doctor: **19/21** — the known non-CNG warning + the same package-version drift as above (was 20/21 at cut time). Accepted as baseline; do NOT `expo install --fix` (mutates shipped source; gotcha `expo-install-fix-destabilizes-monorepo`). Patch-bump rec goes in the §7 upgrade roadmap / folds into 219 if we cut one.

## Finding ledger

Schema: `{id, dimension, severity(P0/P1/P2/TASTE), file:line, claim, evidence, proposed_fix, confidence, status(new/verified/refuted/fixed/deferred), verdicts, commit}`

(empty — populated by Phase 2/3)

### Seen-ledger (dedupe key: file + root-cause; includes refuted)

(empty)

## Known-acceptable (never report)

companion message spacing; Lottie bell on Android; first-bullet autocap (ZWSP); numbered-list live-typing drift (self-heals); Jest open-handle warning; expo-doctor 20/21 non-CNG warning.

## Hard gates (NEVER)

No App Review submit/release/phased-release/external-beta mutation. No subscription/RevenueCat/ASC mutation (readback OK). No push to origin/main; no merge (audit-branch push encouraged). No Railway/backend deploy, prod DB writes, or admin mutations; prod API only via normal app flows under fresh anonymous QA user. Vault writes only via vault-safe-edit.sh.

## Re-sweep dry counter

0 / 2 consecutive clean rounds.

## Wake log

- 2026-06-09 (session 1): Phase 0 — worktree created, deps installed, gates launched, tag discrepancy escalated.
