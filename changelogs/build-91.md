# Build 91 - QA round 2 on Build 90

## Fixed

- **Keyboard occlusion now covers the current line, not just one above** - rewrote `ensureCaretVisible()` to use explicit `setContentOffset` with a 60pt bottom safe zone. Previously the caret would land right at the keyboard edge (or one line above). Now the current line sits 60pt above the keyboard top, matching Notes/Bear behavior.
- **H1/H2/H3 toolbar button clears on Enter** - `querySelectionState` now reads `typingAttributes` instead of the previous paragraph when the cursor sits at end-of-string after a newline. The heading chip in the toolbar clears immediately on Enter, not only after you type a character.
- **First bullet point alignment** - bullet marker was sitting at the descender baseline instead of vertically centered with the letter when you created a list with no text yet. Root cause: Proton's empty-paragraph list creation inserts a zero-width space carrying whatever typingAttributes were current. Fix pre-seeds body font + zeroed paragraph spacing before list creation so the invisible placeholder has the right metrics.
- **H1 -> Enter -> Enter -> body inherited heading line-height** - the body line after a heading had extra vertical breathing room because `paragraphSpacingBefore` from the heading style was leaking through. Now every non-list non-codeblock Enter resets paragraphStyle to body defaults (zeroed `paragraphSpacingBefore`, `lineHeightMultiple`, indents).
- **Canvas now rubber-band scrollable in view and edit mode** - `alwaysBounceVertical = true` on the editor scroll view. Short notes can now be dragged/bounced just like Notes. Drag-to-select also works on short content (previously only worked when content overflowed the canvas).

## Known still-open

- **First bullet autocap** - iOS doesn't autocapitalize the first letter of the very first bullet point if you create the list before typing. This is inherent to Proton's zero-width-space-based list implementation (iOS autocap heuristic doesn't treat cursor-at-pos-1 as a sentence start). Minor UX nit. Subsequent bullets autocap correctly.

## What to Test

- [ ] Type enough lines to push current line below the keyboard. Confirm the line you are typing on sits above the keyboard (not hidden behind it, not one line up).
- [ ] Tap H1, type heading, press Enter. Confirm H1 button is no longer highlighted in the toolbar.
- [ ] Same for H2 and H3.
- [ ] Type H1, press Enter, type a body line, press Enter again. Confirm the second body line has normal body spacing (not the bigger heading-line spacing).
- [ ] Create a new note, tap the bullet button with no text. Confirm the bullet marker is vertically centered where the first letter would go (not at the bottom).
- [ ] In a short empty note (or in view mode), drag vertically on the text area. Confirm the canvas rubber-bands (Apple Notes style).
- [ ] Numbered list continuation (regression check - still should work)
- [ ] Bullet list continuation (regression check)
- [ ] Double-Enter exits list and returns to body paragraph style
- [ ] All toolbar buttons: B / I / U / S / H1 / H2 / H3 / bullet / 1. / checkbox / Indent / Outdent / Link / Scripture / Image / Undo / Redo
- [ ] Scripture insert: search, pick verse, gold accent bar renders; round-trip Done/Edit preserves it
- [ ] Drag-to-select still works on long content (regression check from Build 90)
