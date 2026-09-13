import {
  NOTE_MORE_MENU_RIGHT_INSET,
  NOTE_MORE_MENU_TOP_OFFSET,
  NOTE_MORE_MENU_WIDTH,
  noteMoreMenuOverlayPlacement,
  sameNoteHeaderFrame,
} from '../note-more-menu-placement';

describe('noteMoreMenuOverlayPlacement', () => {
  it('keeps the menu header-relative after a centered cluster resize', () => {
    const wide = noteMoreMenuOverlayPlacement({
      headerX: 152,
      headerY: 0,
      headerWidth: 720,
      insetLeft: 0,
      insetTop: 24,
    });
    const narrow = noteMoreMenuOverlayPlacement({
      headerX: 40,
      headerY: 0,
      headerWidth: 600,
      insetLeft: 0,
      insetTop: 24,
    });

    expect(wide).toEqual({
      top: 24 + NOTE_MORE_MENU_TOP_OFFSET,
      left: 152 + 720 - NOTE_MORE_MENU_RIGHT_INSET - NOTE_MORE_MENU_WIDTH,
      width: NOTE_MORE_MENU_WIDTH,
    });
    expect(narrow.top).toBe(wide.top);
    expect(narrow.left).toBe(40 + 600 - NOTE_MORE_MENU_RIGHT_INSET - NOTE_MORE_MENU_WIDTH);
    expect(narrow.left).toBeLessThan(wide.left);
  });

  it('adds live safe-area insets so a full-window overlay matches the header', () => {
    const placement = noteMoreMenuOverlayPlacement({
      headerX: 80,
      headerY: 12,
      headerWidth: 520,
      insetLeft: 20,
      insetTop: 48,
    });

    expect(placement.top).toBe(48 + 12 + NOTE_MORE_MENU_TOP_OFFSET);
    expect(placement.left).toBe(20 + 80 + 520 - NOTE_MORE_MENU_RIGHT_INSET - NOTE_MORE_MENU_WIDTH);
  });

  it('treats invalid header frames as empty so the overlay does not jump', () => {
    expect(
      noteMoreMenuOverlayPlacement({
        headerX: Number.NaN,
        headerY: -8,
        headerWidth: 0,
      }),
    ).toEqual({
      top: NOTE_MORE_MENU_TOP_OFFSET,
      left: -NOTE_MORE_MENU_RIGHT_INSET - NOTE_MORE_MENU_WIDTH,
      width: NOTE_MORE_MENU_WIDTH,
    });
  });

  it('skips header-frame state when onLayout reports the same rectangle', () => {
    const frame = { x: 152, y: 0, width: 720, height: 52 };
    expect(sameNoteHeaderFrame(frame, { ...frame })).toBe(true);
    expect(sameNoteHeaderFrame(frame, { ...frame, width: 600 })).toBe(false);
  });
});
