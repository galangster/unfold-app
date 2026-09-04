# Handoff: cron enrollment on sync, companion reply actions, tool-round fix

Date: 2026-09-04 (afternoon session). Author: Claude (Fable 5.1) with Nick. Scope: `app/mobile` and `backend` (separate git repos). Continues `2026-09-04-daily-loop-and-usability-sweep.md`; its "Open items, ordered" list is the source of the item numbers below.

## State

### Commits
- backend `main` @ `105b7c2`. Chain since `8a2fd93`: `8623db6` vitest timeout 15s → `85dfdf7` enroll every syncing reader in cron (item 2) → `04d299c` feedback reason column + regenerate prompt context (item 3) → `105b7c2` tool-round empty text block fix. All pushed under `galangster`; Railway deploys from `main`.
- mobile `main` @ `50c2476c`. Chain since `c18599a5`: `aed8049d` SYSTEM-MAP retires the deleted debug-seed routes (item 7) → `50c2476c` companion regenerate / save to journal / thumbs-down reasons (item 3). Not in any build; the next build after 259 carries it.

### App Store Connect
- 1.1.3 (build 259) was still WAITING_FOR_REVIEW at the start of this session (submission `e7fdda05-…`, submitted 2026-09-04T16:26Z). Not re-checked since. Item 1 of the prior handoff is untouched. Check with the ASC API (mint the JWT the way `scripts/set-testflight-changelog.mjs` does; `GET /v1/apps/{ascAppId}/appStoreVersions`).

### Railway
- `85dfdf7` deployed SUCCESS on both services at 2026-09-04T17:29Z; boot log shows the launch schema applied and the cron tick running.
- `105b7c2` (carries `04d299c`) deployed SUCCESS on both services at 2026-09-04T17:54:31Z (deployment `3029f191-…`).

### Simulator
- iPhone 17 Pro booted with the Debug dev client; Metro (`unfold-metro` launch config) was stopped at the end of the session. Start it again with `preview_start`, then open `unfold://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`. Note: a full Metro reload lands the sim on the onboarding re-entry screen ("Is there something specific you want to explore?"); `unfold://(tabs)/(today)` returns to Today.

## Decisions taken
- **Item 2, ruled by Nick ("enroll on sync").** The sync-push upsert assigns `stagger_offset_minutes` (shared helper `backend/src/lib/stagger-offset.ts`, COALESCE-guarded so an existing offset never moves). Every syncing reader is now pre-generated overnight; notifications stay gated on `expo_push_token`; the pacing cap bounds a churned reader to one catch-up day. Existing rows fill in on their next push; no migration. Prod at the time: 20 sync_users, 5 enrolled, on-demand day jobs averaged 147s (max 506s).
- **Item 3 shape.** Regenerate rewrites the reply in place under its own id (no deletion, sync sees an update). Save to journal appends to today's entry of the current series and is hidden with no series. Thumbs-down reasons are four chip ids; prompt wording for each lives in `backend/src/lib/companion-prompt.ts` (`REGENERATE_REASON_HINTS`), so no reader-typed text reaches the instruction and wording can change without an app release. The free-quota gate and charge live in one `runWithQuota` wrapper on the Ask screen.
- **Codex.** Nick reported Codex unavailable mid-lane. The run was stopped while the tree held only untracked new files (four pure modules/tests, one backend test); those were audited, kept, and the rest was implemented directly.
- **`/simplify` findings applied:** design-system `Chip` for the reason row, server-owned reason wording, single quota wrapper, merged history filters, reverse loop for the question lookup, stable save handler passed with the message id. **Skipped with reason:** a shared `upsertJournalEntry` across three call sites (differing semantics; belongs with item 4), hoisting static button descriptors (row renders rarely), always-passing the save handler (hidden on purpose without a series), and the duplicated sanitisation in `validateContext` (house style for every field).

## Verified
- Backend: tsc clean; vitest 114 files / 908 tests.
- Mobile: tsc clean; eslint 0 errors on changed files (two pre-existing warnings in `use-companion-chat.ts`); jest 236 suites / 2011 tests.
- Simulator (Metro, current code, prod backend): action row shows copy, share, save to journal, try another reply, thumbs up, thumbs down; thumbs-down opens "What was off?" with four chips; selecting "Too long" highlights it and shows "Try another reply"; the regenerate replaced the reply in place and cleared the feedback; save to journal flipped to the green check.
- Not exercised on a device: the journal entry content itself (unit-tested), sync of `feedbackReason` between devices, the free-tier paywall path on regenerate.
- Tool-round fix, live on `105b7c2`: a regenerate of "Walk me through today's reading" from the simulator ran `get_devotional_day` (round 1) and `search_journey` (round 2) and ended `stop=end_turn`, in=1444 out=370; the reply completed with suggestion chips and no banner.

## Found in prod, fixed
- Every tool-using companion reply (the "Walk me through today's reading" starter chip) died after its first sentence with the banner "Something went wrong. Try again? Your reply may be incomplete." Railway log: Anthropic 400 `text content blocks must be non-empty` on the tool round. Root cause in `backend/src/routes/companion.ts`: text deltas never wrote into the streamed content block, so the assistant turn replayed with the tool result carried `text: ""`. The live-stream test asserted that empty block. Fixed in `105b7c2` with a regression test for a never-filled block.

## Later the same day
- **Build 260 (1.1.4) is in TestFlight.** Release commit `8e8e955b`; EAS build `c69540fc`; submission `f0e76421` FINISHED after ~35 min in Expo's queue; ASC build `05181dca` VALID, uploaded 2026-09-04T12:19 PT; "What to Test" set from `changelogs/build-260.md`. The `iTMSTransporter` fallback from the morning handoff no longer exists (Apple moved it into Transporter.app); install Transporter from the Mac App Store if Expo's queue stalls again.
- **Onboarding review prompt, ruled by Nick:** `a13d481a` fires the native rating sheet the moment the reader completes the first devotional inside onboarding, over the celebration, through the once-per-version helper. Proven on the simulator (dev builds always show it); screenshot saved to `~/Downloads/unfold-review-prompt-20260904-113419.png`. **Not in build 260**; it ships with the next build.
- 1.1.3 (build 259) was still WAITING_FOR_REVIEW at 12:40 PT.

## Open items, ordered
1. When 1.1.3 returns from review: install build 259 on a phone and run the three unverified items from the prior handoff (`changelogs/build-259.md`). If rejected: "Update Review" on the 1.1.3 version page, then Resubmit.
2. Companion polish, both pre-existing: (a) text from consecutive tool rounds is joined with no separator ("for you.Let me try"), fix where `fullText += round.fullText` and the client sink concatenate rounds in `backend/src/routes/companion.ts`; (b) `get_devotional_day` cannot see a series that exists only on the device (the sim's Dev Tools seed), so the companion says it cannot pull up the text; real series sync first, so this is a QA-profile limitation, not a reader-facing one.
3. Cut the next mobile build (1.1.4 / build 260) so the companion actions ship; write `changelogs/build-260.md`.
4. Consolidate the three "did I read today" definitions (streak last-read, current devotional read days, server read rows); fold the shared `upsertJournalEntry` refactor in here.
5. Pre-existing: `use-companion-chat.ts` sends the latest user message twice (the store copy inside the last-10 history plus the explicit final turn). Harmless for the model but doubles that turn's tokens; one-line fix in `runTurn`'s history build, needs a test.
6. Onboarding beat count: watch the funnel once analytics exist; merge the two weakest cinematic beats.
7. Streak-settings calendar and the widget still infer from the count; StreakBox uses real reads.

## Receipts
- Simplify lane reports were returned inline by two review agents (reuse + altitude; simplification + efficiency); findings and dispositions are in the mobile commit message of `50c2476c`.
- Memory notes updated: `~/.claude/projects/-Users-galangster-clawd-work-unfold/memory/unfold-daily-loop-map.md` (cron enrollment ruling, prod facts).
