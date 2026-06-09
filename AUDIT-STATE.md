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
| 1 System map | DONE | 23 mapper agents over 2 rounds: 52 routes / 95 surfaces / 350 risk notes → `SYSTEM-MAP.md` (commits 9afbe32, 3af4adb). Fragments: `/tmp/unfold-e2e-audit-2026-06/map/` (22 files). Residual gaps assigned: runtime items → Phase 3; backend sweep → BCK finder; OTA/highlights/a11y/Android → respective finders. |
| 2 Static audit (12 dims) | RUNNING | Workflow `wf_0e3dbd0c-bd9`: 12 finders (leads = map §5 + 15 headline risks) → semantic dedupe → 3-lens 2-of-3 adversarial verify (TASTE: single judge) → `/tmp/unfold-e2e-audit-2026-06/findings/LEDGER.md`. Finder caps declared (15/dim + 8 TASTE). |
| 3 Runtime walkthrough | PART A RUNNING | Debug build SUCCESS → installed on iPhone 17 Pro **`E292C8E3-EF98-4FF4-A19F-AD4B91877AB6`** (USER.md's 38CDF1B0 sim DOES NOT EXIST on this machine — fix USER.md at checkpoint). App: `/tmp/unfold-audit-derived-data/Build/Products/Debug-iphonesimulator/Unfold.app`, bundle `com.unfoldapp.ios`. Worktree dirt: `ios/Podfile.lock` checksum-only churn (uncommitted, expected). Metro: background from worktree, prod backend + QA tools env, log `/tmp/unfold-e2e-audit-2026-06/metro.log`. Walkthrough Part A (boot-proof+onboarding, Today×8 states, reader, bible, companion, notebook, you-tab; light+dark per checkpoint) = serialized workflow; Part B (paywall, widgets, notifications, dynamic-type, reduce-motion, offline/slow-net, backgrounding/force-quit) queued after. Evidence: `/tmp/unfold-e2e-audit-2026-06/runtime/`. Runtime findings get re-repro during Phase 4 triage instead of 3-lens verify (screenshot evidence is primary). |
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

## Pre-triaged headline risks (from Phase 1 — feed Phase 2 finders; full list in SYSTEM-MAP.md §5)

1. ~~Build 218 provenance / QA tools in binary~~ **REFUTED for the shipped IPA**: release-gatekeeper session 2026-06-08 inspected `/tmp/unfold-production-app-review-candidate-build218.ipa` (SHA dbb568aa…) — QA markers absent. Latent process hazard remains: eas.json `qa-testflight` profile sets `EXPO_PUBLIC_ENABLE_QA_TOOLS=1` with `distribution:store` → report as process P2.
2. Unguarded `unfold://` scheme — every file route externally reachable, no allowlist/param validation (incl. debug-* routes in QA builds).
3. Widgets: App Groups entitlement deliberately stripped while expo-widgets data path depends on group UserDefaults → possibly stale/blank widgets on device; Live Activity never updated/ended.
4. Premium enforcement client-only; some paths read raw persisted `user.isPremium` bypassing tri-state policy; client rate limits fail open.
5. Midnight/timezone/DST fragility: device-local `toDateString`, fixed-24h math, twin streak paths diverge, server cron co-writes `currentDay` in server time.
6. Notification dual-authority: You-tab toggle vs useCheckInNotifications resurrection; reminder-OFF not persisted; payloads baked stale at schedule time.
7. Data-loss surfaces: rehydrate validation wipes all core arrays on one malformed entry; Bible highlight overlap destroys highlights+notes; single-slot undo; resets leave sensitive caches.
8. Privacy: spiritual profile/journals/chat in MMKV with silent unencrypted fallback; thumbs-feedback POSTs chat content; `hasConsentedToAI` dead code; plaintext bug log.
9. Offline fail-closed lockouts: premium policy 'unknown' indefinitely on offline cold start; onboarding hard paywall dead-ends when offerings fail; free messages burned on failed sends; no sync outbox.
10. E2E verification hollow: 4 testIDs total, both Maestro flows assert stale UI, brittle source-string asserts, onboarding has zero analytics.
11. **App Review 2.5.4**: `UIBackgroundModes: audio` declared while the audio/TTS stack is dark-launched in 218 (play button hidden, prefetch commented out) — unused-background-mode rejection risk.
12. Zero production observability: analytics is a mock (no SDK), no global JS error/unhandled-rejection handler, logger.error silent in release.
13. Journal reflections local-only despite sync-ready schema (unrecoverable on reinstall); journal.tsx has a TDZ `currentDay` use-before-declaration silently disabling SOAP auto-select/hydration on Hermes.
14. Shipped debug/abandoned surfaces deep-linkable: /unfolded visible red debug border + debug share logging; /wallpaper orphaned 549-LOC pipeline; /debug-light-mode ships despite "remove before public release" comment.
15. Android structurally broken if shipped (NOT shipping in 1.0 — P2 context): unguarded iOS-only import chain risks require-time boot crash; no google-services.json; ActionSheetIOS/Alert.prompt no-ops.

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
