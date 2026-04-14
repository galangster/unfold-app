# Build 75 — Notebook refactor: native read mode, ACK scripture, unified save

## New

- **Native read mode** — notebook notes now render their read view in React Native instead of inside the WebView editor. The WebView only mounts when you actually tap Edit. Scrolling a list of notes is significantly smoother, entering a note feels snappier, and read mode renders instantly.
- **Reliable scripture insertion** — inserting a verse from the scripture search sheet now uses a typed bridge message with an ACK handshake. No more silent drops when the WebView is mid-load; the sheet won't clear until the editor confirms it received the insert.
- **Unified save** — all four places that used to save a note (title blur, body blur, Done button, navigation back) now funnel through a single `saveNote()` command. Fewer race conditions, fewer "did it actually save?" moments.
- **Spring-driven sheet animations** — Create Folder, Move Folder, and Scripture Search sheets use Reanimated `withSpring` running off the JS thread. Entrance and dismiss gestures are noticeably crisper.
- **Virtualized notebook list** — the main notebook screen is now a FlatList with tuned `windowSize` and `removeClippedSubviews`. Scrolling past 50+ notes stays at 60fps where it used to stutter.

## Behind the scenes

- WebView editor lifecycle consolidated around a single `editorReady` boot tick. Dropped 3 sync-to-ref `useEffect`s in favor of render-time assignment. `<br>` whitespace bug in `stripHtml` fixed (notes with line breaks no longer lose spacing). 113/113 notebook test suite green. Net diff: +2388 / −1007 lines, with `NoteEditor.tsx` (735 lines of dead code) fully removed.

## What to Test

- [ ] Open an existing note from the Notebook tab → should render instantly in read mode (title + body visible, no WebView flash)
- [ ] Tap the body of the note → should flip to edit mode, editor mounts, cursor ready
- [ ] Tap **Done** in the top-right → should save and return to read mode with your changes
- [ ] Enter edit mode, exit via Done, re-enter — no stuck state, no white flash
- [ ] From edit mode, tap the scripture search button and insert a verse → scripture callout should appear in the note
- [ ] Insert 2–3 scriptures in a row — all should land, none should silently drop
- [ ] Save a note with multiple scripture inserts → reopen → all scriptures still there
- [ ] Notes with line breaks render correctly in read mode (no collapsed spacing)
- [ ] Notebook list with many notes scrolls smoothly, no frame drops
- [ ] Create a new note via the FAB → opens fresh note-detail in edit mode
- [ ] Long-press or tap a note's menu → Move to folder sheet springs in smoothly
- [ ] Tap + to create a new folder → Create Folder sheet springs in smoothly
- [ ] Scripture search sheet opens/dismisses with spring animation (not duration-based)

## Carried from Build 74

Paywall walkthrough video still applies. If you were testing the three-step paywall flow, keep testing it.
