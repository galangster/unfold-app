# Build 92 - QA round 3 on Build 91

## Fixed (second attempt)

- **Keyboard occlusion safe zone bumped 60pt -> 120pt** - Build 91's 60pt cleared the sim but device chrome (toolbar + accessory bar) still clipped the current line. 120pt keeps a full line gap above the keyboard on device.
- **H1 -> Enter -> body line-height leak REALLY fixed this time** - Build 91's typingAttributes-only reset didn't fix the empty line below a heading because typingAttributes is future-only: the `\n` character that UIKit just inserted carried the H1 paragraphStyle, and since paragraph styles apply to the whole paragraph (the new empty paragraph IS just that `\n`), the empty line rendered with H1 metrics. Now we retroactively patch the just-inserted `\n` via `addAttributes` so the empty paragraph renders with body spacing immediately.
- **Rubber-band scroll REALLY works on short content now** - Build 91's `alwaysBounceVertical = true` did nothing because Proton's `AutogrowingTextView.recalculateHeight` dynamically sets `isScrollEnabled = false` when content fits the viewport. UIKit silently ignores `alwaysBounceVertical` when scrolling is disabled. Fix: set `editor.maxHeight = .infinite` so Proton short-circuits the recalc entirely, and force `isScrollEnabled = true`. Rubber-band + drag-to-select now work on empty notes and short content in both edit and view modes.

## Confirmed fixed from Build 91

- **H1/H2/H3 toolbar chip clears on Enter** - Nick confirmed this works on device.

## Known still-open

- **First bullet autocap** - Proton ZWSP-based lists confuse iOS autocap heuristic at pos 1. Minor.

## What to Test

- [ ] Type H1, press Enter. Confirm the empty line below the heading has normal body spacing (no oversized gap above the caret).
- [ ] Repeat for H2 and H3.
- [ ] Type H1, press Enter, type a body line, press Enter again. Confirm the second body line also has normal body spacing (no residual heading spacing bleed).
- [ ] Type enough lines to push the current line below the keyboard. Confirm the line you are typing on sits comfortably above the keyboard (not hidden, not right at the edge).
- [ ] In a short empty note, drag vertically on the text area. Confirm the canvas rubber-bands (Apple Notes style).
- [ ] In view mode, drag vertically. Confirm rubber-band works.
- [ ] Drag-to-select on short content (fewer lines than viewport).
- [ ] Drag-to-select on long content (regression check).
- [ ] Numbered list continuation (regression check)
- [ ] Bullet list continuation (regression check)
- [ ] Checklist continuation (regression check)
- [ ] Double-Enter exits list and returns to body
- [ ] All toolbar buttons: B / I / U / S / H1 / H2 / H3 / bullet / 1. / checkbox / Indent / Outdent / Link / Scripture / Image / Undo / Redo
- [ ] Scripture insert: search, pick verse, gold accent bar renders; round-trip Done/Edit preserves it
- [ ] First bullet alignment (regression check from Build 91)
