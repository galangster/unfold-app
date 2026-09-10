# Handoff: highlighting Phase C, deferred items, then a TestFlight build and App Store review submission

Written 2026-09-10 after PR #81 merged into `main` (merge commit `92bc950a`).
Nick's instruction: do everything autonomously, then build the app and submit it for review with all the new changes.

## State on `main`
- Highlighting phases A and B are merged: native Highlight menu (+Copy), named picker, UndoToast, document-diff store sync, felt-tip stroke, self-healing restore, per-font stroke fit, devotional scripture block highlightable by verse (`src/components/reading/ScriptureVerseBlock.tsx`).
- Item 9 (colour gating) resolved with no code change: devotional WebView highlights are all-colours-free; Bible highlights and the verse block keep yellow free, other colours premium. Reverse only by editing `isHighlightColorFree` callers.
- Notifications phases 0–3 (PRs #77–#80) and release 1.1.7 (build 276 changelog) are also on `main` and unreleased to the App Store as far as this handoff knows. Confirm on ASC before choosing the version string.
- Gates on `main`: `tsc --noEmit` clean, eslint 0 errors, jest 308 suites green. There is no `bun run verify` script in `package.json`; CI's `verify` job runs typecheck, lint and jest on pull requests only.
- Brief: `~/Documents/vault-main/projects/unfold/audits/2026-09-09-highlights-and-notes-audit.md` (Plan — Highlighting, items 10–12). Prior handoff: `handoffs/2026-09-10-highlights-phase-b.md`.

## Work to do, in order

### 1. Phase C (audit items 10–12)
10. **Journal › Saved segment.** Journal tab gets three segments: Reflections · Notebook · Saved. Saved = devotional highlights + Bible highlights + bookmarks + Bible notes, with a two-axis filter (Source: Devotional | Bible; Type: Highlights | Notes | Bookmarks). Swipe-to-delete with Undo (reuse `UndoToast`). Remove the Journal tab inside Library (`src/app/(tabs)/(you)/my-content.tsx` duplicates the Journal tab). Keep the Today bento tile but point it at Journal › Saved and rename it "Saved". Data helpers already exist: `src/lib/saved-highlights.ts` (`buildSavedHighlights`, `toDevotionalSavedItem`, `toBibleSavedItem`).
11. **Reader-level Highlights sheet** behind the existing book icon on the reading screen (`src/app/(tabs)/(today)/reading.tsx`): Contents / Highlights / Notes for this devotional. Tapping a highlight scrolls to it (`targetHighlight` + `onTargetHighlightLocated` props on `DevotionalContent` already do the locate).
12. **Remember-This draws from Bible highlights too**, and marker-sweep rendering in dark mode.

Each item: one branch, one PR, CI green, merge, then next. Keep the `Sheet` primitive from `@/components/ui` and the existing Journal segment control. Run `/simplify` on each diff before commit (review the diff directly; do not fan out audit agents).

### 2. Deferred items (do after Phase C, skip if either costs more than an hour)
- Restore Look Up / Translate in the reader selection menu. react-native-webview 13.16.1 custom `menuItems` replace the iOS system menu. A ~6-line patch-package on `RNCWebViewImpl.m` (`canPerformAction:` / `editMenuInteraction:`) restores them.
- Collapse the swatch tap's touchstart/touchend/click triple path in `DevotionalWebView.tsx` (`handleColorTap`) only after a physical-device check. Without a device, leave it.

### 3. Release: build, TestFlight, App Store review
Follow the recipe in the memory file `unfold-testflight-local-build-recipe.md` and `unfold-testflight-version-and-build-numbers.md` (`~/.claude/projects/-Users-galangster-Documents-vault-main-projects-unfold/memory/`). Summary:
1. Query ASC `apps/6760814444/appStoreVersions`. If 1.1.7 is READY_FOR_SALE or already submitted, bump to 1.1.8 in all five places: `app.json`, `package.json`, `ios/Unfold/Info.plist`, `ios/ExpoWidgetsTarget/Info.plist`, `MARKETING_VERSION` (4 occurrences) in `ios/Unfold.xcodeproj/project.pbxproj`. Commit via a PR (PR #76 is the pattern).
2. Build locally once: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 eas build --platform ios --profile production --local --non-interactive --output <ipa>` from `app/mobile`. Export `SENTRY_AUTH_TOKEN` from `~/.config/unfold/sentry-build-token-*.txt` if present, else `SENTRY_ALLOW_FAILURE=true` (Nick approved this for 267 and 275). Do not abort and restart: every start burns an EAS build number. `expo-doctor` non-zero exit at the end is non-blocking.
3. Read `CFBundleVersion` from the IPA; write `changelogs/build-<N>.md` (see `changelogs/build-276.md` and `scripts/generate-changelog.sh`). Cover: highlighting A/B/C, notifications 0–3, anything else merged since the last changelog.
4. `eas submit --platform ios --profile production --path <ipa> --non-interactive` (needs `keys/AuthKey_NW2SL2F4ZN.p8` in `app/mobile/keys`; symlink into a worktree, never copy).
5. `node scripts/set-testflight-changelog.mjs <N>`; rerun if Apple processing outlasts its poll window.
6. **App Store review submission.** Try the ASC API: create or reuse the appStoreVersion for the version string, attach the processed build, set release notes from the changelog, then create the `appStoreVersionSubmissions` (or review submission) resource. Note from memory: the auto-mode classifier has denied `asc` *write* commands before. If any write is denied, stop there, report exactly which call was denied, and hand the final "Submit for Review" click to Nick in App Store Connect with the build number and notes ready.

Git accounts: `gh auth switch --user galangster` does not persist across Bash calls. Put the switch and the push in one invocation with `git -c credential.helper='!gh auth git-credential' push`. Merging to `main` is normally Nick's; for this run Nick asked for full autonomy, so merge your own PRs once CI is green.

## Environment notes
- Simulator iPhone 17 Pro UDID `D5BF1CF9-5835-47AB-A7B0-F644A28D6100`. Use `flowdeck` (xcrun/simctl are hook-blocked). Metro: `nohup npx expo start --clear < /dev/null &`, never `CI=1`. Dev client URL: `unfold://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`. Deep links: `unfold://reading`, `unfold://reader?bookId=23&chapter=40`, `unfold://my-content?tab=highlights`.
- `pod install` needs `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`; revert `ios/Podfile.lock` and `project.pbxproj` churn before committing.
- Never `git add -A` in a lane worktree (node_modules symlink trap).

## Stop conditions
- Two unchanged or failed results on any step: stop and report.
- Any ASC write denied: stop the release at that step and report.
- Do not force-push or rebase shared branches.
