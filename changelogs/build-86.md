# Build 86 — Editor strip-down to spike parity

## Fixed

- **Numbered list Enter continuation** — Starting `1. one` and pressing Enter now produces `2.`, `3.`, etc. The `react-native-keyboard-controller` library was silently swapping itself as every focused text view's delegate, which made Proton's identity check bail out before reaching the Enter-handling branch. The guard now type-checks against our own text view class, which survives the swap.
- **Drag-to-select restored** — The line-decoration overlay (blockquote bars, code-block backgrounds, checklist tap zone) is now inside the editor's own scroll view and ignores touches outside the leftmost 32pt marker zone. iOS 16+ drag-to-select works again.
- **Keyboard avoidance simplified** — Replaced a stack of manual `UIKeyboardWillShow/Hide` observers with a single `keyboardLayoutGuide.topAnchor` constraint. Fewer moving parts, correct behavior when the keyboard animates in/out.

## Under the hood

- `UnfoldEditorController` trimmed from 1158 → 796 lines. Removed: `shouldHandle` Enter intercept, textDidChange backup observer, checklist tap gesture, `ensureCaretVisible`, `extendBlockMarkers`, `textChangeGeneration` guard. All commands (bold/italic/underline/strike, H1-H3, lists, indent/outdent, link, scripture, image, undo/redo) are unchanged.
- Vendored Proton guard change: `textView.delegate === self` → `textView is RichTextView` in 5 sites across `RichTextViewContext` and `RichTextEditorContext`.

## What to Test

- [ ] Start a numbered list → type a line → Enter → confirm `2.` appears → type another line → Enter → confirm `3.` appears
- [ ] Same for bullet list: `•` markers continue on every Enter
- [ ] Same for checklist: unchecked boxes continue on every Enter
- [ ] Double-Enter on an empty list item exits the list and returns to body paragraph style
- [ ] Tap-and-hold drag to select text across multiple lines (the iOS text-selection loupe should appear)
- [ ] Type a long note past the keyboard → caret stays visible, keyboard doesn't cover active line
- [ ] Tap the leftmost edge of a checklist item (where the box is) → toggles the check state
- [ ] Tap anywhere else on a checklist line → places cursor normally
- [ ] Scripture insert: search → pick verse → gold accent bar renders; round-trip Done → Edit preserves it
- [ ] All toolbar buttons: B / I / U / S / H₁ / H₂ / H₃ / • / 1. / ☑ / Indent / Outdent / Link / Scripture / Image / Undo / Redo
- [ ] Dark/light mode: keyboard appearance matches theme on both title and body
