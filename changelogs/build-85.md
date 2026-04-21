# Build 85 — Editor QA fixes from Build 83: bullets, keyboard parity, H1/H2/H3 split, caret tracking

## Fixed

- **Bullet + Enter preserves the marker** — Pressing Enter on a bulleted line no longer drops the `•` on the new empty line. The `continueListOnNewLine` path now carries the list attributes and paragraph style forward instead of only keeping them on lines with content.
- **Indent/outdent works on an empty bullet line** — The `Tab` / `Shift+Tab` buttons were dead immediately after Enter because the new paragraph had no list attribute to indent. Fixed as part of the marker-preservation patch.
- **Title keyboard appearance matches the body** — The title field used to show the system light keyboard while the body showed a dark one (and vice versa in light mode). The title TextInput now reads the theme and passes `keyboardAppearance` explicitly.
- **Bullet toggle clears instead of nesting** — Tapping the bullet button when the cursor was already in a bullet list was nesting the list instead of toggling off. The toolbar handlers now pull the live selection state from the native editor before deciding to set vs. clear. Applies to bullets, numbered lists, checklists, and heading toggles.
- **H1 / H2 / H3 are now three separate buttons** — The single "H" button cycled H1 → H2 → H3 → Body which was hard to use. The toolbar now shows `H₁ H₂ H₃` and each button is a direct toggle.
- **Caret stays visible above the keyboard** — When typing past the visible area, the cursor no longer slides behind the keyboard. The native editor now scrolls the caret into view on every text change and selection change, not only when the keyboard first appears.

## Known issues

- **Live numbered counter may drift during typing** (e.g. show `1, 2, 2` instead of `1, 2, 3` while actively editing). The persisted HTML is correct and the counter renders properly after Done → Edit. Tracked for Build 86.

## What to Test

- [ ] Create a new note → tap **+** → verify title is focused AND keyboard appearance matches theme (dark mode → dark keyboard, light mode → light keyboard)
- [ ] Toggle dark ↔ light mode in Settings → reopen a note → keyboard appearance should follow on both title and body
- [ ] Start a bullet list → type three lines → press Enter on a fourth line with text → confirm the `•` appears on the new line
- [ ] On that empty bulleted line, tap Indent → bullet should indent; Outdent → should outdent or exit the list
- [ ] With cursor inside a bullet, tap the bullet button once → list should clear (not nest)
- [ ] Same test for numbered list and checklist buttons
- [ ] Tap H₁ → paragraph becomes H1; tap H₁ again → back to body. Repeat for H₂, H₃.
- [ ] Type a long note (30+ lines) → confirm the cursor is always visible, never hidden behind the keyboard
- [ ] Tap-to-reposition the cursor near the bottom of a long note → cursor should scroll into view if it was offscreen
- [ ] Scripture insert still works: scripture search → pick verse → gold accent bar renders
- [ ] Round-trip: Done → Edit again → all formatting preserved
