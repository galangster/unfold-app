# Tech Debt Audit — Unfold Mobile

Generated: 2026-04-25
Scope: simplification-focused audit for release-critical Unfold mobile flows on branch `all-recent-changes-testflight`.

## Executive summary

- The biggest simplification risk is not one bad abstraction; it is several release-critical god screens owning routing, network recovery, state mutation, UI rendering, and purchase/editor orchestration at once.
- `src/app/onboarding.tsx`, `src/app/(tabs)/(today)/reading.tsx`, `src/app/(tabs)/(journal)/note-detail.tsx`, and `src/lib/store.ts` are the highest-value debt centers because they are both large and high-churn.
- The safest first simplification is **not** extracting whole screens. Start with small pure helpers that remove duplicated branch logic while preserving behavior.
- Paywall routing duplication in `src/app/paywall.tsx` is the cleanest first code target: low blast radius, visible release flow, and easy to verify.
- Devotional sync/recovery logic is release-critical and has duplicated metadata application between Today and Reading. It should be consolidated behind tested helper/action boundaries before more fixes pile up.
- Journal note detail mixes native editor, TenTap fallback, autosave, explicit save, toolbar handlers, scripture insertion, and platform branching in one file. Simplify only at seams with existing tests first.
- `src/lib/store.ts` is acting as multiple domain stores plus an inline migration registry. Do not split it wholesale; first extract migration logic with snapshot tests or add narrow store actions for existing duplicated mutations.
- Onboarding is the largest and highest-churn file. It needs staged extraction by screen family, not a rewrite.
- Several scary-looking areas are intentionally load-bearing right now, especially the dual native/TenTap editor path and the central persisted store version. Leave those alone until helper-level seams are stable.
- Recommended first increment: paywall finish/close routing helper, then devotional pulled-content metadata helper, then transient error helpers, then Journal note snapshot persistence helper.

## Architectural mental model

Unfold mobile is an Expo / React Native iOS-first app. The app is organized around route files under `src/app`, shared state in a persisted Zustand store under `src/lib/store.ts`, domain services under `src/lib`, and a custom native rich-text editor module under `modules/unfold-editor`. The release-critical tester path currently flows through onboarding/paywall/generating, Today/devotional generation and sync, Bible/reading, Journal/notebook/native editor, and TestFlight/App Store Connect deployment scripts.

The architecture is pragmatic and product-speed oriented: screens often own local UI state, service calls, store mutations, navigation decisions, and recovery/fallback behavior directly. That has helped ship fast, but high-churn release areas now have too much responsibility in single files. The safest path is incremental extraction of stable pure helpers/actions at duplicated seams, backed by focused tests and simulator/FlowDeck verification when editor/native code is involved.

## Findings table

| ID | Category | File:Line | Severity | Effort | Description | Recommendation |
|----|----------|-----------|----------|--------|-------------|----------------|
| F001 | Architectural decay | `src/app/onboarding.tsx:467` | High | L | `OnboardingScreen` is a giant route component that owns step flow, purchase state, paywall sheet, generation setup, and many render branches. | Extract one screen family at a time after locking behavior with focused tests/smoke QA; do not rewrite the whole file. |
| F002 | Architectural decay | `src/app/onboarding.tsx:1340` | High | L | `renderInput()` starts a very large switch-like render region and extends through many unrelated onboarding screens. | Split stable screen groups into small components with typed props, starting with the least stateful screens. |
| F003 | Architectural decay | `src/app/onboarding.tsx:2940` | Medium | M | Main return layout contains multiple mode/exclusion decisions inline, making it hard to reason about which chrome appears for each step. | Extract a pure layout-mode selector and test representative steps. |
| F004 | Consistency rot | `src/app/onboarding.tsx:520-560` | Medium | M | Onboarding owns RevenueCat offering/trial fetch logic that resembles standalone paywall behavior. | Move shared paywall offering/trial state into a narrow hook only after confirming both flows require identical behavior. |
| F005 | Dead/unreachable code | `src/app/onboarding.tsx:565-566` | Medium | S | Premium gate state exists near onboarding purchase logic, but the audited option-lock branch is effectively disabled. | Confirm product intent; if obsolete, remove the gate in a tiny behavior-preserving cleanup. |
| F006 | Dead/unreachable code | `src/app/onboarding.tsx:2250-2253` | Medium | S | `isLockedOption = false` makes the adjacent gated branch non-functional. | Either delete the unused gate or restore intended gating behind a product decision. |
| F007 | Architectural decay | `src/app/onboarding.tsx:2860-2902` | Medium | M | Inline `ThreeStepPaywall` rendering inside onboarding increases coupling between discovery flow and subscription UI. | Keep current behavior, but isolate the props/adaptor between onboarding state and paywall component. |
| F008 | Consistency rot | `src/app/paywall.tsx:49-50` | Medium | S | Standalone paywall has multiple source branches for onboarding/onboarding_early routing. | Normalize source interpretation into a tiny helper with tests for return destinations. |
| F009 | Consistency rot | `src/app/paywall.tsx:144-156` | High | S | Purchase success routing duplicates logic also used by restore and close paths. | Extract `finishPaywallFlow(source, options)` or equivalent single routing helper. |
| F010 | Consistency rot | `src/app/paywall.tsx:192-202` | High | S | Restore success routing repeats purchase success navigation with slight branch drift risk. | Reuse the same finish helper used by purchase success. |
| F011 | Consistency rot | `src/app/paywall.tsx:226-242` | High | S | Close routing duplicates the same source-based navigation decision tree. | Consolidate close/purchase/restore destination selection without changing timing/analytics. |
| F012 | Architectural decay | `src/components/onboarding/ThreeStepPaywall.tsx:1142-1192` | Medium | M | Paywall purchase/restore orchestration exists in a large component separate from standalone paywall orchestration. | Audit shared purchase/restore behavior after routing helper lands; extract only if both flows stay aligned. |
| F013 | Architectural decay | `src/app/(tabs)/(today)/reading.tsx:143` | High | L | Reading screen owns many responsibilities: day resolution, sync recovery, generation, retry UI, read completion, and rendering. | Do not split whole screen first; extract tested domain helpers/actions from duplicated seams. |
| F014 | Architectural decay | `src/app/(tabs)/(today)/reading.tsx:875-967` | High | M | `generateRemainingDays` style logic is embedded in the screen despite similar generation continuation logic in services. | Move common continuation decision logic into `devotional-service` or a pure helper with tests. |
| F015 | Consistency rot | `src/app/(tabs)/(today)/reading.tsx:1233-1261` | High | M | Missing-day retry path duplicates generation/recovery decisions from other Reading paths. | Route retry through a single recovery-before-generation function. |
| F016 | Consistency rot | `src/lib/devotional-service.ts:1696-1817` | High | M | Devotional service continuation logic overlaps with screen-owned retry/generate behavior. | Define one source of truth for continuation/generate-remaining-days decisions. |
| F017 | Consistency rot | `src/app/(tabs)/(today)/index.tsx:246-279` | High | M | Today/Home applies sync pull and metadata locally. | Share pulled-content application with Reading via a store action or pure helper. |
| F018 | Consistency rot | `src/app/(tabs)/(today)/reading.tsx:1104-1120` | High | M | Reading sync recovery applies similar pulled devotional metadata directly. | Consolidate metadata application and add tests covering Day N recovery. |
| F019 | Type/contract debt | `src/lib/devotional-sync-pull.ts:137-152` | Medium | S | Pull response mapping is a critical boundary; application of mapped data is split across consumers. | Keep mapping here, but add a single application helper/action so consumers do not mutate shape independently. |
| F020 | Error handling | `src/app/(tabs)/(today)/reading.tsx:70-96` | Medium | S | Transient/retryable error detection lives in Reading. | Extract `isTransientNetworkError` / `toFriendlyGenerationError` into tested shared helper. |
| F021 | Error handling | `src/lib/devotional-service.ts:1406-1416` | Medium | S | Service-level retry/error helpers overlap with screen-level error classification. | Unify names and behavior in one helper module with table-driven tests. |
| F022 | Architectural decay | `src/app/(tabs)/(today)/index.tsx:305-321` | Medium | M | Today/Home derives devotional state through dense inline screen logic. | Extract selectors for visible devotional/day state and test edge cases. |
| F023 | Architectural decay | `src/app/(tabs)/(today)/index.tsx:615-657` | Medium | M | Home fallback/ready-state UI decisions are embedded in the route component. | Move pure state classification out before touching UI layout. |
| F024 | Architectural decay | `src/app/(tabs)/(journal)/note-detail.tsx:215-221` | High | L | Note detail initializes and branches between native editor and TenTap fallback in the same large route. | Avoid adapter rewrite now; first extract shared persistence/scripture helpers. |
| F025 | Consistency rot | `src/app/(tabs)/(journal)/note-detail.tsx:563-608` | High | S | Autosave builds note persistence payloads separately from explicit save. | Extract `upsertNoteSnapshot` into `src/lib/note-detail-editor.ts` and reuse from both paths. |
| F026 | Consistency rot | `src/app/(tabs)/(journal)/note-detail.tsx:616-659` | High | S | Explicit save duplicates autosave snapshot construction and update/add branching. | Share the same persistence helper; verify existing note-detail editor tests. |
| F027 | Consistency rot | `src/app/(tabs)/(journal)/note-detail.tsx:491-508` | Medium | M | Native scripture insertion path is separate from TenTap insertion path. | Extract/test common scripture block construction before attempting editor adapter changes. |
| F028 | Type/contract debt | `src/app/(tabs)/(journal)/note-detail.tsx:128-129` | Low | S | `buildEditorCSS(colors: any, isEditing: boolean)` uses `any` at a UI styling boundary. | Replace with the project color type if easily available; otherwise defer behind larger editor cleanup. |
| F029 | Architectural decay | `src/app/(tabs)/(journal)/index.tsx:486` | Medium | L | Journal hub component is large and owns folders, reflections, notebook sections, delete sheets, and undo behavior. | Decompose only after note-detail release bugs settle; start with folder delete helper if needed. |
| F030 | Consistency rot | `src/app/(tabs)/(journal)/index.tsx:861-930` | Medium | M | Folder delete with undo logic appears separately from sheet delete flow. | Extract one delete-with-undo command helper if future bugs touch this area. |
| F031 | Consistency rot | `src/app/(tabs)/(journal)/index.tsx:1704-1732` | Medium | M | MoveFolderSheet delete handling duplicates folder deletion semantics. | Reuse the same folder delete helper; verify undo/toast behavior. |
| F032 | Architectural decay | `src/lib/store.ts:495` | High | L | `UnfoldState` combines devotional, notes, preferences, generation, sync, and UI-ish state in one persisted store. | Do not split wholesale; add narrow domain actions first and extract migrations separately. |
| F033 | Consistency rot | `src/lib/store.ts:921-939` | High | M | `markDayAsRead` owns local read state while remote read-completion sync is triggered by consumers. | Consider a store action/service boundary that updates local + queues remote sync from one call site. |
| F034 | Consistency rot | `src/lib/store.ts:961-972` | Medium | M | `advanceDay` is local state only while backend current-day state is handled elsewhere. | Document/centralize ownership of current-day transitions to avoid future drift. |
| F035 | Architectural decay | `src/lib/store.ts:1813` | High | M | Persist version and migration logic are inline in the large store file. | Extract migration steps to `src/lib/store-migrations.ts` without changing version/key; add snapshot tests. |
| F036 | Architectural decay | `src/lib/store.ts:1815` | High | M | Inline migration block is long and mixes historical cleanup with live state definitions. | Move migration helpers out and keep the persist config declarative. |
| F037 | Documentation drift | `src/lib/store.ts:2223-2235` | Low | S | Removed/historical fields are still represented in migration cleanup deep inside the store. | Keep cleanup, but relocate into named migration steps so intent is explicit. |
| F038 | Type/contract debt | repo heuristic | Medium | M | Sweep found 105 `as any`-style usages and 23 eslint disables across the repo. | Do not bulk-fix; address only when touching nearby code or at trust boundaries. |
| F039 | Observability | repo heuristic | Low | M | Sweep found 79 `console.*` calls. Some are probably development logs, but release-critical screens should not grow ad-hoc logging. | Replace only noisy/release-path logs with existing observability pattern when touched. |
| F040 | Test debt | high-churn files | High | M | Highest-churn screens (`onboarding.tsx`, Today, Reading, paywall, store) have complex behavior that is hard to verify by screen tests alone. | Add small pure helper tests for each simplification seam before/while extracting. |

## Top 5 if you fix nothing else, fix these

1. **F009–F011 — Consolidate `src/app/paywall.tsx` finish/close routing**
   - Why first: small, high confidence, release-critical, and low blast radius.
   - Diff sketch: add a pure helper near the top or in `src/lib/paywall-routing.ts` that maps `source` + outcome to the destination/action. Reuse it in purchase success, restore success, and close handlers.
   - Verification: focused unit tests if helper is exported, `bun run typecheck`, `git diff --check`, simulator smoke for standalone paywall close/purchase/restore routes if feasible.

2. **F017–F019 — Create one pulled devotional content application helper/action**
   - Why: recent Day 2/TestFlight bug class came from local/backend devotional state drift; duplicated metadata application increases recurrence risk.
   - Diff sketch: move “apply pulled devotional day + metadata/current day” into a pure helper or store action used by Today and Reading.
   - Verification: focused Jest tests for Day N pulled content, existing sync-pull/read-sync tests, typecheck, diff check.

3. **F020–F021 — Extract transient generation error helpers**
   - Why: cheap cleanup that reduces retry/fallback drift between Reading and devotional-service.
   - Diff sketch: create `src/lib/transient-errors.ts` or domain-specific `devotional-errors.ts` with table-driven tests.
   - Verification: new helper tests, existing devotional tests, typecheck.

4. **F025–F026 — Extract Journal note snapshot persistence helper**
   - Why: direct simplification in a recent bug-heavy screen, but avoids native editor internals.
   - Diff sketch: add/reuse `upsertNoteSnapshot` in `src/lib/note-detail-editor.ts`; call it from autosave and explicit save paths.
   - Verification: extend `src/lib/__tests__/note-detail-editor.test.ts`, typecheck, diff check, simulator note create/edit smoke.

5. **F035–F036 — Extract store migrations without changing persisted version/key**
   - Why: store migration debt is high-risk if left inline, but can be improved safely with snapshot tests.
   - Diff sketch: move migration functions to `src/lib/store-migrations.ts`, keep `version: 36` and persist key unchanged.
   - Verification: snapshot tests for representative old states, typecheck, diff check. No behavior change.

## Quick wins

- [ ] F009–F011: Paywall source/destination helper for purchase/restore/close routing.
- [ ] F020–F021: Shared transient/rate-limit/friendly generation error helper with table tests.
- [ ] F025–F026: Shared Journal note snapshot persistence helper.
- [ ] F028: Replace `colors: any` in `buildEditorCSS` if the app color type is readily accessible.
- [ ] F005–F006: Remove or document unreachable premium gate after product confirmation.
- [ ] F017–F019: Shared pulled devotional content application helper/action.

## Things that look bad but are actually fine

- The dual native-editor/TenTap branching in `src/app/(tabs)/(journal)/note-detail.tsx:215-221` looks like an obvious adapter extraction target, but it is release-sensitive and supports iOS native behavior plus fallback behavior. Do not start there.
- The central persisted store in `src/lib/store.ts:1813` looks like it should be split into many stores, but changing persisted keys/version boundaries is risky. Start by extracting migrations/actions, not by splitting persistence.
- Large onboarding file size in `src/app/onboarding.tsx:467` is real debt, but a wholesale rewrite would be more dangerous than the current debt. Extract one screen family at a time only after helper-level seams are stable.
- `modules/unfold-editor/ios/UnfoldEditorController.swift` is large and high-risk, but recent list/backspace/occlusion fixes made targeted changes with FlowDeck verification. Avoid broad Swift cleanup unless a native editor bug forces it.
- `as any` usage across the repo is a smell, but bulk type-purity work would distract from release bugs. Fix `any` only at active seams or API/trust boundaries.

## Open questions for the maintainer

- Is the onboarding premium gate around locked options intentionally disabled for launch, or is it stale code that should be removed?
- Should standalone paywall close behavior always return users to the previous route, or should onboarding sources always route into the generating/discovery flow?
- Should local devotional read/current-day state ever update without an immediate remote sync attempt, or should one service/action own local + remote transitions?
- Is TenTap still a long-term supported fallback for Journal, or can the app eventually become iOS-native-editor-only?
- Are store migration tests already expected somewhere, or should a new `store-migrations` test file become the canonical safety net?

## Recommended incremental simplification order

1. Paywall routing helper (`src/app/paywall.tsx`) — smallest safe cleanup.
2. Devotional pulled-content application helper/action — highest release-bug prevention value.
3. Transient generation error helper — cheap consistency win.
4. Journal note snapshot persistence helper — simplifies recent editor surface without touching native code.
5. Store migration extraction — medium risk, good long-term payoff.
6. Onboarding family extraction — high payoff, but only after lower-risk helpers prove the pattern.

## Verification baseline for each increment

- Focused tests for the helper/action touched.
- `bun run typecheck`.
- `git diff --check`.
- FlowDeck iOS build if native/editor files are touched.
- Simulator or visual QA for UI/editor/paywall flow changes when feasible.
