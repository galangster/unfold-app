Build 208 is a Phase 1.5 visual fix on top of build 207. On real OLED hardware, build 207's elevation system had the right shape (no strokes, shadow + highlight) but the dark-mode cards barely separated from the near-black canvas. This build adds the missing piece: a neutral 10% white inset outline that defines every card edge in dark mode, plus a brighter top-edge highlight.

What to test:

Dark mode:
- Open the Today tab and confirm the Daily Thread card, Daily Rhythm card, and My Devotionals / My Library tiles all have a visible perimeter against the black canvas.
- The outline should read as ambient light or a subtle glow, not as the accent-tinted stroke that build 205 and earlier had.
- The top edge of each card should have a slightly brighter hairline highlight.
- Confirm the cards still feel "soft" and warm, not harsh or boxed-in.

Light mode:
- Confirm light mode looks unchanged from build 207. Cards should still sit above the canvas via shadow only, no visible outline.

Side-by-side with build 207:
- Easiest way: install 208 over 207. The dark-mode change should be immediately visible.

Sources:
- Outline + highlight bump: 38fac60

App Review build attachment is intentionally unchanged.
