export const BOOK_PICKER_GRID_GAP = 6;
export const BOOK_PICKER_THREE_COLUMN_MIN_WIDTH = 340;
export const BOOK_PICKER_TWO_COLUMN_MIN_WIDTH = 280;
export const BOOK_PICKER_ENLARGED_FONT_SCALE = 1.18;
export const BOOK_PICKER_SINGLE_COLUMN_FONT_SCALE = 2.5;

export type BookPickerColumnCount = 1 | 2 | 3;

/** Choose columns from the grid's measured width, not the device width. */
export function bookPickerColumnCount(
  containerWidth: number,
  fontScale: number,
): BookPickerColumnCount {
  const width = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 0;
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;

  if (
    width <= 0
    || scale >= BOOK_PICKER_SINGLE_COLUMN_FONT_SCALE
    || (width < BOOK_PICKER_THREE_COLUMN_MIN_WIDTH && scale >= BOOK_PICKER_ENLARGED_FONT_SCALE)
    || width < BOOK_PICKER_TWO_COLUMN_MIN_WIDTH
  ) {
    return 1;
  }
  if (scale >= BOOK_PICKER_ENLARGED_FONT_SCALE || width < BOOK_PICKER_THREE_COLUMN_MIN_WIDTH) {
    return 2;
  }
  return 3;
}

/** Give every chip the same width, including chips in an incomplete final row. */
export function bookPickerChipWidth(
  containerWidth: number,
  columns: BookPickerColumnCount,
): number {
  const width = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 0;
  if (width === 0) return 0;
  return Math.max(0, (width - BOOK_PICKER_GRID_GAP * (columns - 1)) / columns);
}
