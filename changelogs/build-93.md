# Build 93 - editor fixes after Build 92 device QA

## Fixed

- **Heading Enter reset now uses explicit heading block identity** - replaced the fragile `pointSize >= 18` heading heuristic with explicit heading block markers and handled heading Enter deterministically. H1 and H3 both reset to body correctly in sim verification, and the heading text no longer shows the last-letter demotion bug.
- **Body paragraph spacing resets after heading Enter** - after pressing Enter from a heading, the next line now renders with normal body paragraph spacing instead of inheriting heading line height.
- **Keyboard occlusion safe zone bumped 120pt -> 200pt** - the current typing line sits higher above the keyboard, reducing clipping on device.
- **Note title doubled from 24pt -> 48pt** - the Instrument Serif title now reads like a true display title in both edit and read-only note detail screens.
- **Title line height tuned for the larger size** - added a taller line height so the 48pt serif title does not clip.

## What to Test

- [ ] Type H1, press Enter, then type a body line. Confirm the heading stays intact and the new line is normal body text.
- [ ] Repeat for H2 and H3.
- [ ] Confirm the first body line after a heading does not keep oversized heading spacing.
- [ ] Type enough lines to push the caret down. Confirm the active line sits comfortably above the keyboard.
- [ ] Create a new note and verify the title looks large in edit mode.
- [ ] Save the note and verify the title still looks large in read-only mode.
- [ ] Try a long title and confirm it wraps cleanly without clipping.
- [ ] Regression: list continuation still works.
- [ ] Regression: double-Enter exits a list and returns to body.
- [ ] Regression: code block Enter still behaves like code block Enter.
