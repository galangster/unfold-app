import {
  BOOK_PICKER_GRID_GAP,
  bookPickerChipWidth,
  bookPickerColumnCount,
} from '../book-picker-layout';

describe('book picker layout', () => {
  it('keeps three equal columns at normal phone widths', () => {
    expect(bookPickerColumnCount(343, 1)).toBe(3);
    expect(bookPickerColumnCount(370, 1)).toBe(3);

    const width = bookPickerChipWidth(370, 3);
    expect(width * 3 + BOOK_PICKER_GRID_GAP * 2).toBeCloseTo(370);
  });

  it('uses fewer columns for narrow containers and enlarged text', () => {
    expect(bookPickerColumnCount(288, 1)).toBe(2);
    expect(bookPickerColumnCount(370, 1.18)).toBe(2);
    expect(bookPickerColumnCount(288, 1.18)).toBe(1);
    expect(bookPickerColumnCount(370, 2.5)).toBe(1);
  });

  it('returns one stable width for every item in incomplete rows', () => {
    expect(bookPickerChipWidth(343, 3)).toBeCloseTo((343 - 12) / 3);
    expect(bookPickerChipWidth(288, 2)).toBeCloseTo((288 - 6) / 2);
    expect(bookPickerChipWidth(288, 1)).toBe(288);
  });

  it('fails safely before the grid has a useful measurement', () => {
    expect(bookPickerColumnCount(0, 1)).toBe(1);
    expect(bookPickerColumnCount(Number.NaN, 1)).toBe(1);
    expect(bookPickerChipWidth(0, 1)).toBe(0);
  });
});
