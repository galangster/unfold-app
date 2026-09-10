# Handoff: highlighting phases A/B — 2026-09-10

Branch `feat/highlight-phase-a` off `main` (f47a1040). Not pushed. Commits:
- da717c79 phase A: native Highlight menu (+Copy), named picker, UndoToast, document-diff store sync (`reconcileDayHighlights`), analytics.
- 60d96a9b felt-tip highlighter stroke (Nick's choice, option 2 of 4).
- 9563bbd3 phase B items 6+7: self-healing restore, per-font stroke fit, element-level rehydrate validation, `\s` template-escape bug fix.

Brief: `~/Documents/vault-main/projects/unfold/audits/2026-09-09-highlights-and-notes-audit.md` (Plan — Highlighting). Options page: https://claude.ai/code/artifact/2258faa4-b1cb-4c0e-8fe2-08631e677e9c

## Verified
- Simulator iPhone 17 Pro (UDID D5BF1CF9-5835-47AB-A7B0-F644A28D6100), dark mode: single-word Highlight from selection menu → named picker → stroke; Remove → toast → Undo restores; Library count follows.
- Heal pass: browser harness from the app's own document + injected script (recipe: temporary jest test writing `source.html` + `injectedJavaScript`, served from the scratchpad over http; use a function replacement in `String.replace`, never a string — `$'` is special).
- Gates: typecheck clean; lint 0 errors; suites `src/components/reading`, `store-rehydrate-repair`, `store-highlight-reconcile` green (47 tests). Full `verify` not run.

## Open (Phase B remainder)
8. Devotional scripture block highlightable by verse (reuse Bible verse model in `DevotionalContent.tsx` scripture card).
9. Premium gating: Bible reader locks non-yellow (`reader.tsx:1328`), devotional toolbar is open. Needs Nick's decision first.
- Simplify-skip carried: swatch tap uses touchstart/touchend/click triple path (`DevotionalWebView.tsx` handleColorTap); collapse only after a physical-device check. Look Up / Translate are gone in the reader because react-native-webview 13.16.1 custom `menuItems` replace the system menu; a 6-line patch-package on `RNCWebViewImpl.m` (`canPerformAction:` / `editMenuInteraction:`) would restore them.
- Phase C (Journal › Saved segment, reader Highlights sheet) untouched.

## Environment notes
- Metro: `nohup npx expo start --clear < /dev/null &` from the repo. Never `CI=1` (disables reloads silently).
- FlowDeck `-w` needs an absolute workspace path. Deep links: `unfold://reading`, `unfold://my-content?tab=highlights`, `unfold://note-detail?startEditing=true`.
- Scratch http server on :8765 and Metro on :8081 may still be running.

## Next action
Ask Nick for the premium-gating call (all colours free vs yellow-only everywhere), then do item 8, then open one PR for the branch after `bun run verify`.

## Update 2026-09-09 (later session)
- Item 8 done: `ScriptureVerseBlock.tsx` renders the local-DB passage verse by verse and writes `BibleHighlight` records via `planHighlightApplication`. Shared palette in `src/constants/bible-highlight-colors.ts`, verse map in `src/lib/bible-verse-highlight-map.ts`, `toSuperscript` in `src/lib/superscript.ts`.
- Gate: tsc clean, eslint 0 errors, jest 252 suites green; `devotional-webview-font-scale.test.ts` failed on the branch (not on `main`): Phase A added an `expo-clipboard` import and `HIGHLIGHT_COLOR_LABELS` to DevotionalWebView and the test's mocks lagged. Fixed in the test. No `verify` script exists in `package.json`.
- Branch pushed; PR https://github.com/galangster/unfold-app/pull/81 open against `main`.
- Item 9 still needs Nick's call. The new block mirrors the reader (yellow free, others locked). Simulator check of the verse block itself not yet done.

## Item 9 resolved 2026-09-09 (agent call, Nick said "do what you think is best")
Keep both shipped behaviours. Devotional WebView highlights were never gated on `main` and stay all-colours-free. Bible highlights keep yellow-free / others premium; the paywall copy sells extra colours as a Bible-study feature. The new scripture verse block writes Bible highlights, so it inherits the Bible gate. No code change. Reverse by editing `isHighlightColorFree` callers only.

Simulator proof (iPhone 17 Pro, dark, KJV): verse tap → tan selection mark with dark text → colour row; yellow → verse renders yellow; `unfold://reader?bookId=23&chapter=40` shows Isaiah 40:31 highlighted yellow.
