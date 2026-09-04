# Handoff: daily-loop fixes, usability sweep, 1.1.3 in review

Date: 2026-09-04. Author: Claude (Fable 5.1) with Nick. Scope: `app/mobile` and `backend` (separate git repos; the parent folder is not a repo).

## State

### Commits
- backend `main` @ `8a2fd93` — read-chain clamp on pushed `currentDay`, no double morning push. Live on Railway (both `unfold-backend` and `keen-joy`, deploy SUCCESS 2026-09-04T02:48Z).
- mobile `main` @ `5fe7d7df`. Chain since the last release you knew: `0e902697` daily-loop fixes (build 257) → `892bac93` three merged usability lanes → `41617f02` review pass → `23c66fdf` build 258 → `b9f67cb0` 1.1.3 build 259 → `5fe7d7df` Dev Tools seed fix (not in any build; dev-only).

### App Store Connect
- Version `1.1.3` (ASC version id `bedd9fe4-63f4-42d0-bcaf-b32386786305`) is **WAITING_FOR_REVIEW** with build 259 (build id `63f70295-b5c5-4279-9ee5-1f08520bd4b4`). Review submission `e7fdda05-7939-4b88-969d-11208e259646`.
- 1.1.1 (build 254) was removed from review at Nick's instruction on 2026-09-04; that version row was relabeled 1.1.3, so there is no separate 1.1.1 or 1.1.2 store version.
- Builds 257, 258, 259 are all processed in TestFlight. Marketing version 1.1.2 for 257/258, 1.1.3 for 259.
- Release notes are set on the en-US localization (`33b00b3b-2e5c-4087-afb3-1fa704e02102`).

### Live surfaces
- Railway project `62fdf682-99dd-429f-b42b-df85d40460c9`, prod env `28973e5f-…`, deploys from `main` with no check gate.
- The usability audit page: https://claude.ai/code/artifact/8e587419-1a9e-439c-a21a-f54fc8bb768b (65 findings, 62 fixed).
- Simulator: iPhone 17 Pro is booted with the Debug dev client; Metro is stopped. The sim profile now holds the seeded "Quiet Path Series" as the current devotional.

### Machine facts
- gh CLI holds two accounts. Both Unfold repos belong to `galangster`; switch with `gh auth switch --user galangster` before push or PR, and back to `NickMetaDAO` after.
- ASC API key copied to `~/.appstoreconnect/private_keys/AuthKey_NW2SL2F4ZN.p8` for Transporter. Delete if unwanted.
- `eas submit` must run from `app/mobile`; from elsewhere it fails with "EAS project not configured". Expo's submit queue was degraded today and held an upload for an hour; `/Applications/Xcode.app/Contents/Developer/usr/bin/iTMSTransporter -m upload -assetFile <ipa> -apiKey NW2SL2F4ZN -apiIssuer 52f4e617-a4b3-4cee-bcd0-23f8e653d7b5` is the fallback.
- `SYSTEM-MAP.md` still lists `unfold://debug-seed-*` routes that no longer exist. Use Settings → Dev Tools → "Test Reveal Screen (Dev)" (seeds if needed) or "Seed Real Devotional + Reveal (Dev)".

## Verified
- Backend: tsc clean, vitest 898 tests / 113 files.
- Mobile: tsc clean, jest 1999 tests, eslint 0 errors on the changed files.
- On the simulator (Metro, current code): onboarding progress bar; Bible home reachable on second open with full book names and Continue card; Settings Writing Style caption and relabeled reset row; Reveal button opens the reader; day picker shows locked days with unlock captions.
- Not seen on a device: the locked-day toast on a forward swipe; the tomorrow-locked hero after completing a day; the day-picker pulse on a locked tap. Unit-tested only.

## Decisions taken
- Overnight server push is skipped when the app has a local daily reminder (`sync_users.settings`); readers without a reminder keep the deferred push.
- Server clamps a pushed progressive `currentDay` to `MAX(read day) + 1`.
- Readers who decline notifications are still not enrolled in cron pre-generation (main leaves `stagger_offset_minutes` NULL on the sync-push upsert). One line flips that. Owner decision.
- Dropped from the sweep as features, not defects: companion "regenerate reply" and "save reply to journal".

## Open items, ordered
1. When 1.1.3 returns from review: install build 259 on a phone and run the first three unverified items above (checklist in `changelogs/build-259.md`). If rejected: the "Update Review" button on the 1.1.3 version page, then Resubmit; the API `PATCH reviewSubmissions … submitted:true` 409s after a rejection.
2. Decide on cron enrollment for no-notification readers (backend `src/routes/sync.ts`, the `userGenerationConfig` upsert).
3. Companion: regenerate reply; save reply to journal. Feedback loop on thumbs-down.
4. Consolidate the three "did I read today" definitions (streak last-read, current devotional read days, server read rows).
5. Onboarding beat count: watch the Sentry funnel now that the progress bar exists; merge the two weakest cinematic beats.
6. Streak-settings calendar and the widget still infer from the count; StreakBox now uses real reads.
7. Retire the stale seed routes in `SYSTEM-MAP.md`; raise vitest `testTimeout` in the backend config (cold parallel runs time out at 5s and pass on rerun).

## Receipts
- Audit artifact: see Live surfaces.
- Lane briefs used for the sweep: were in this session's scratchpad (`lanes/lane-{a,b,c}.md`); the outcomes are the three `fix(ux):` commits merged in `892bac93`.
- Memory notes: `~/.claude/projects/-Users-galangster-clawd-work-unfold/memory/unfold-daily-loop-map.md` and `unfold-simulator-verification-recipe.md` (updated 2026-09-04).
