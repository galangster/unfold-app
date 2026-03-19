# Build 30 — March 18, 2026

**Commit:** eb506f4 | **Branch:** main

---

## New

- **Unified note editor** — Reading and editing a note now happen on the same screen. Tap "Edit" to start writing, tap "Done" to save. No more navigating between two separate screens.
- **Folder chips** — Filter your notes by folder with horizontal scroll pills at the top of the Notebook view.
- **Move to folder** — Long press or use the ··· menu on any note to move it into a folder.
- **Scripture search in editor** — Tap the bookmark icon in the toolbar to search and insert Bible verses as blockquotes while writing.
- **Bible section headings** — Chapter sections now show readable headings (e.g. "The Sermon on the Mount") in the Bible reader.

## Fixed

- **No more white flash** — Screen transitions no longer show a white/pink glow at the edges. All tab layouts now use the correct background color.
- **Segmented control animation** — The Reflections/Notebook tab slider no longer bounces. Clean, fast slide.
- **Note body text loads instantly** — Previously, switching to edit mode showed a blank body for 1-2 seconds. Now content appears immediately because there's no screen transition.
- **Create note button works** — The "+" button on the Notebook screen now navigates directly to the editor (was broken by a redirect loop).

## Improved

- **Archived unused persona files** — Moved experimental persona variants to `_archived/` to keep constants clean.
- **Writing craft prompts trimmed** — Reduced prompt bloat in devotional generation.

---

## What to Test

### Notes (most important)
- [ ] Journal > Notebook > tap "Hey" note — should open in read mode with "Edit" button
- [ ] Tap "Edit" — switches to edit mode on the same screen, no navigation
- [ ] Type something, tap "Done" — saves and switches back to read mode
- [ ] Tap "+" to create a new note — opens blank editor in edit mode
- [ ] Back arrow from empty new note — discards without saving
- [ ] ··· menu — favorite, move to folder, delete (double-tap to confirm)

### Transitions
- [ ] Switch between Reflections and Notebook tabs — smooth slide, no bounce
- [ ] Navigate from Today > reading > back — no white flash at screen edges
- [ ] Navigate from Bible > reader > back — no white flash

### General
- [ ] Evening celebration messages still display correctly
- [ ] Devotional generation works end-to-end
- [ ] Voice input still functions in journal and check-in
