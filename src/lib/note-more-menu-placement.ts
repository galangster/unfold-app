/**
 * Header-relative placement for the note more-menu when it lives in a
 * full-window overlay. The menu keeps the same offset it had as a child
 * of the header cluster (`top: 56`, `right: 16`, width 240).
 */

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export const NOTE_MORE_MENU_WIDTH = 240;
export const NOTE_MORE_MENU_TOP_OFFSET = 56;
export const NOTE_MORE_MENU_RIGHT_INSET = 16;

export type NoteHeaderFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function noteMoreMenuOverlayPlacement(params: {
  headerX: number;
  headerY: number;
  headerWidth: number;
  insetLeft?: number;
  insetTop?: number;
}): { top: number; left: number; width: number } {
  const headerX = finiteNonNegative(params.headerX);
  const headerY = finiteNonNegative(params.headerY);
  const headerWidth = finiteNonNegative(params.headerWidth);
  const insetLeft = finiteNonNegative(params.insetLeft ?? 0);
  const insetTop = finiteNonNegative(params.insetTop ?? 0);

  return {
    top: insetTop + headerY + NOTE_MORE_MENU_TOP_OFFSET,
    left:
      insetLeft +
      headerX +
      headerWidth -
      NOTE_MORE_MENU_RIGHT_INSET -
      NOTE_MORE_MENU_WIDTH,
    width: NOTE_MORE_MENU_WIDTH,
  };
}

export function sameNoteHeaderFrame(
  previous: NoteHeaderFrame,
  next: NoteHeaderFrame,
): boolean {
  return (
    previous.x === next.x &&
    previous.y === next.y &&
    previous.width === next.width &&
    previous.height === next.height
  );
}
