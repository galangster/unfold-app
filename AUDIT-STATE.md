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

## SCOPE EXPANSION (Nick, 2026-06-10): Backend E2E track

Full backend + Railway audit added (overrides original §1 "skim only"): repo map + Railway infra readback, route-by-route finders, **endpoint-by-endpoint mobile↔server contract matrix** ("relationship must be perfect"), lean verify, fixes STAGED on `audit/backend-e2e-2026-06` (worktree `~/clawd/work/unfold-backend-audit`, base `78d9051` = Railway prod commit, both services). Decisions: stage fixes (not report-only); full unbiased sweep. Hard gates: read-only prod (Railway readback/logs/metrics/targeted read-only DB queries OK per precedent), NO deploy/migrations/load-tests — deploy is Nick's gate. BE- findings merge into the unified ledger/report. Backend checkout at work/unfold/backend is on stale dirty RC branch — never touch it.

## Backend track status

| B-Phase | Status | Notes |
|---|---|---|
| B1 Map | DONE | 6 readers + synthesis (12 min, ~740k tok). `BACKEND-MAP.md` committed on backend branch: 34 routes, topology, matrix skeleton. 8 headline risks; standouts: dead cron premium gate (is_premium has NO writer — explains the May-25 Day-10 race: client-fallback generation is the ONLY working path), is_premium sync-push self-grant hole (not in SERVER_MANAGED_COLUMNS), bug-report stub returns fake success, dedup index log-only catch, unauth adaptive-question route w/ spoofable IP limit, in-process limiters × replicas. COUNTER-EVIDENCE noted for verify: push DID deliver May-25 (anonymous Expo works) → "push fully non-functional" claim overstated; MODE api-vs-all conflict → resolve via Railway config. |
| B2 Find+Matrix+Verify | **DONE** | 53 found → **42 CONFIRMED / 11 refuted**; matrix: 31 routes, **18 drift/risk/mobile-only**. P0 = BJOB-1 dead cron gate (empirically reconciled w/ May-25 trace). P1s: BSEC-1/BDAT-1 is_premium self-grant; BJOB-2/BINF-1 dual-worker MODE=all (RESOLVED: it IS all); BINF-3 gate unconditional (no env flag — map corrected); BSEC-2 100k-char client system prompts; BCOST-2 onboarding dedup bypass. Verify pass honest: EXPO_ACCESS_TOKEN downgraded P2 (anon push works — counter-evidence honored). Full results: tasks/w9aihyc4c.output. |
| B3 Fix loop | PLANS RUNNING | Backend plan in `wf_8ebb1210-4c5` (frontier plan-writers). Then sonnet executors stage fixes + Vitest on branch; NO deploy (Nick gate). |

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 Baseline | DONE | worktree ✅, deps ✅, gates ✅ (see below), Discord tag-ping sent ✅ |
| 1 System map | DONE | 23 mapper agents over 2 rounds: 52 routes / 95 surfaces / 350 risk notes → `SYSTEM-MAP.md` (commits 9afbe32, 3af4adb). Fragments: `/tmp/unfold-e2e-audit-2026-06/map/` (22 files). Residual gaps assigned: runtime items → Phase 3; backend sweep → BCK finder; OTA/highlights/a11y/Android → respective finders. |
| 2 Static audit (12 dims) | **DONE** | 152 found → 141 canonical → **129 CONFIRMED (P0=1, P1=23, P2=105)** + 8 TASTE kept; 11 refuted (lean: NAT-6, BCK-7; 3-lens: 9 ids). Ledger: `/tmp/unfold-e2e-audit-2026-06/findings/LEDGER.md` — **regenerated deterministically via python** after haiku ledger writer fabricated totals (lesson: arithmetic/merge tasks get NO model — script them). **THE P0 = NAT-1: `plugins/withRemoveAppGroups.js` strips App Groups entitlement → all 3 widgets can never show data on physical devices (simulator masks it); native fix → requires build 219 if unintentional. Check git blame + vault decisions before fixing — plugin name suggests deliberate provisioning workaround.** Lean-verify efficiency: 76 findings, 78 agents, ~2.7M tokens, 20 min, 0 failures. |
| 3 Runtime walkthrough | A DONE (7/7) + PART B RUNNING | **A2 complete: 38 findings, 10 P0/P1** → `findings/RUNTIME.md`. Embers VERIFIED working (RT-TODAY-1 ✅). P1 cluster needing Phase-4 re-repro through NORMAL nav (QA env had 429 pollution + seed-nav artifacts): RT-READER-1 (reader never unmounts, 200+ renders, corrupts session), RT-READER-2 (Aa prefs button dead behind Refreshing overlay), RT-READER-3 (Today CTA dead after reader exit + a11y label mismatch), RT-READER-4 (Complete Day button overlaps tab bar), RT-NOTEBOOK-4 (formatting toolbar absent). RT-YOU-1 "P0" (DEV TOOLS panel) = QA-env artifact, verify gating then downgrade. RT-YOU-2/3 = runtime confirmation of notification dual-authority P1s. **Part B DONE: 29 findings, 9 P0/P1** (appended to RUNTIME.md). Headliners: RT-PAYWALL-1 P1 (NO close button — VoiceOver dead-end), RT-PAYWALL-2 P1 ($59.99/yr never displayed — Guideline 3.1.2 risk), RT-WIDGETS-1 P0 (NAT-1 mechanism forensically confirmed: group plist in app's OWN container, Shared/AppGroup empty), RT-WIDGETS-2 P0→likely sim/iOS-beta artifact (Nick's device HAS widgets installed — downgrade w/ counter-evidence), RT-WIDGETS-3/4/5 P1 (no deep links, hardcoded dark palette, stale .atEnd timeline — 219 scope w/ NAT-1), RT-NOTIF-3 P1 (cold-start permission prompt — check overlap w/ plan-02 FIX-12/NET-15 before re-fixing), RT-DYN-1 P1 (XXL Dynamic Type fragments You-tab labels). **Phase 3 COMPLETE (both parts, all segments).** |
| 3b (superseded) | — | Onboarding segment COMPLETE (run `wf_148f2f44-c0d`, cached for resume): **11 findings (RT-ONB-1..11), 2 P1s** — name truncation 'Quinn'→'Qu' propagating into server AI content (RT-ONB-1); "story stays on device" privacy copy contradicted by server generation (RT-ONB-2). Also: StoreKit rating prompt mid-onboarding (RT-ONB-3), paywall subscribe silent no-op without RC packages (RT-ONB-4), keyboard-controller worklet warnings ×25, BibleAPI 404 on 'Psalm 46:10 (BSB)'. 63+ screenshots in `/tmp/unfold-e2e-audit-2026-06/runtime/onboarding/`. Segments 2-7 (today-states, reader, bible, companion, notebook, you-tab) died on spend cap — RESUME AFTER Phase 2 verify completes (serialized burn). NOTE: RevenueCat NOT initialized in Debug/Metro env (no keys) — paywall runtime checks limited; flag in report. | Debug build SUCCESS → installed on iPhone 17 Pro **`E292C8E3-EF98-4FF4-A19F-AD4B91877AB6`** (USER.md's 38CDF1B0 sim DOES NOT EXIST on this machine — fix USER.md at checkpoint). App: `/tmp/unfold-audit-derived-data/Build/Products/Debug-iphonesimulator/Unfold.app`, bundle `com.unfoldapp.ios`. Worktree dirt: `ios/Podfile.lock` checksum-only churn (uncommitted, expected). Metro: background from worktree, prod backend + QA tools env, log `/tmp/unfold-e2e-audit-2026-06/metro.log`. Walkthrough Part A (boot-proof+onboarding, Today×8 states, reader, bible, companion, notebook, you-tab; light+dark per checkpoint) = serialized workflow; Part B (paywall, widgets, notifications, dynamic-type, reduce-motion, offline/slow-net, backgrounding/force-quit) queued after. Evidence: `/tmp/unfold-e2e-audit-2026-06/runtime/`. Runtime findings get re-repro during Phase 4 triage instead of 3-lens verify (screenshot evidence is primary). |
| 4 Fix loop | ROUND 1 DONE; REVIEW+VERIFY RUNNING | `wf_8ebb1210-4c5`: 4 frontier plan-writers → `plans/01-streak-engine-and-journal.md`, `02-data-integrity-networking.md`, `03-a11y-ux-onboarding.md` (mobile worktree) + `01-backend-p0-p1.md` (backend worktree). Improve-skill format (self-contained, failing-test specs, verification gates, STOP conditions). Plans DONE (committed 707bb7c mobile / fde956d backend): 32 fixes, 12 product decisions (recommendations implemented; register Discord-pinged to Nick). ROUND-1 EXECUTION DONE: mobile 16 commits (25/26 fixes; full Jest 108 suites/723 tests green, was 91/609 baseline; typecheck+lint clean). Backend 6 commits (6/6; vitest 26 files/116 tests, was 21/85; tsc clean). ONLY BLOCK: plan-02 FIX-8 (DAT-2 journal sync push-backup) hit its staging STOP gate — deferred to round 2 with QA-user round-trip verification (check backend sync.ts accepts personal tables first). NOW RUNNING: postfix gate script (b1nvpjtb0) + review/verify workflow `wf_5e28e86b-247` (3 frontier reviewers: mobile regressions REVM-, backend REVB-, plan conformance REVC-; then sonnet runtime verify-fixes + reader-cluster normal-nav re-repro). Round-2 executors HELD until runtime verify completes (no hot-reload mid-walkthrough). |
| 5 Re-sweep until dry | pending | needs 2 consecutive clean rounds. QUEUE before re-sweep: (a) executor completion → full suites both branches; (b) /code-review high per batch; (c) runtime verification pass on FIXED app (fix-proof screenshots, contract §2.3) + reader-cluster re-repro via NORMAL nav (RT-READER-1..4, RT-NOTEBOOK-4, RT-YOU-1 gating check) — sim free, Metro hot-reloads fixed code; (d) round-2 plans RUNNING `wf_e0d13706-8a0` → plans/04 (celebration+paywall+dyntype+notif-residual) + plans/05 (widgets 219 native incl. NAT-1). Reader cluster still needs re-repro before planning. |
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

## DECISION AUTHORITY (Nick, 2026-06-10): "do whatever you think is best. you can make decisions here."
Product/design decisions are MINE now (recommendations implemented without re-asking). STILL NICK-GATED (hard rules unchanged): backend deploy, Railway env change (MODE=api), build 219 cut/TestFlight upload path, dev-portal/EAS credential mutations, App Review submission. Decided under this grant: COR-7/8 celebration = once per calendar day on streak day-flip; paywall gets close button + visible annual price; widget 219 batch = App-Groups fix + deep links + appearance palette + timeline policy.

## EXECUTION POLICY (Nick directive 2026-06-10, per github.com/shadcn/improve pattern)

Token efficiency mandate — same output quality, much cheaper. Advisor/executor split:
- **Frontier model (me / default)**: judgment that compounds — triage, fix PLANS (self-contained: exact files, code excerpts, verification gates with expected outputs, hard out-of-scope/STOP conditions), escalation verdicts, final report, codex interface.
- **sonnet executors**: verification passes (single-agent 3-lens + escalate valve, NOT 3 separate agents), walkthrough segments (checklists are the plan), fix implementation from plans, re-sweep finders (tightly scoped leads).
- **haiku executors**: mechanical writing (ledgers, report assembly from JSON), probes.
- Hard agent tool-call caps in prompts; read cited ranges only; serialize giant fan-outs (one big workflow at a time). If spend cap trips: PAUSE + Discord ping, no auto-retry.

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

## P0 triage (NAT-1, 2026-06-10)

Strip is from `1e155db` "fix: remove App Groups entitlement that blocks IPA build" — deliberate WORKAROUND (provisioning profile lacks capability), not a documented product tradeoff (vault grep: nothing). **DEVICE-CONFIRMED by Nick 2026-06-10: all home-screen widgets are blank on his physical iPhone running 218.** Verdict-leaning: **CUT 219** (blank widgets = App Review 2.1 rejection material + bad UX). Phase 4: stage code fix on branch (remove plugin, configure correct app group verified against widget-bridge suite id); signing: try EAS credentials capability-sync first (may auto-add App Groups at next build) before manual portal step; Nick gate = approve cutting 219 (+ portal action only if EAS sync can't).

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
