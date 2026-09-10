import {
  bibleHubBookPillColumnCount,
  bibleHubBookPillWidthStyle,
} from '../bible-hub-book-pill-layout';

const WIDTHS = [402, 375, 320] as const;
const SCALES = [1, 1.18, 1.64, 2, 2.5, 3] as const;

describe('bible hub book pill columns', () => {
  it('keeps the normal 3-column hub at 402pt and 375pt default text', () => {
    expect(bibleHubBookPillColumnCount(402, 1)).toBe(3);
    expect(bibleHubBookPillColumnCount(375, 1)).toBe(3);
    expect(bibleHubBookPillWidthStyle(3)).toEqual({
      minWidth: '30%',
      flexGrow: 1,
      flexBasis: '30%',
      maxWidth: '48%',
    });
  });

  it('uses 2 columns on 320pt default text and on moderately enlarged text', () => {
    expect(bibleHubBookPillColumnCount(320, 1)).toBe(2);
    expect(bibleHubBookPillColumnCount(402, 1.18)).toBe(2);
    expect(bibleHubBookPillColumnCount(375, 1.64)).toBe(2);
    expect(bibleHubBookPillWidthStyle(2)).toEqual({
      minWidth: '46%',
      flexGrow: 1,
      flexBasis: '46%',
      maxWidth: '100%',
    });
  });

  it('uses 1 column at 320pt enlarged text and at fontScale 2.5 through 3.0', () => {
    expect(bibleHubBookPillColumnCount(320, 1.18)).toBe(1);
    expect(bibleHubBookPillColumnCount(320, 3)).toBe(1);
    expect(bibleHubBookPillColumnCount(402, 2.5)).toBe(1);
    expect(bibleHubBookPillColumnCount(375, 3)).toBe(1);
    expect(bibleHubBookPillWidthStyle(1)).toEqual({
      minWidth: '100%',
      flexGrow: 1,
      flexBasis: '100%',
      maxWidth: '100%',
    });
  });

  it('covers the requested width and scale matrix without forcing 3 columns at large text', () => {
    for (const width of WIDTHS) {
      for (const fontScale of SCALES) {
        const columns = bibleHubBookPillColumnCount(width, fontScale);
        if (fontScale >= 2.5 || (width <= 320 && fontScale >= 1.18)) {
          expect(columns).toBe(1);
        } else if (fontScale >= 1.18 || width < 375) {
          expect(columns).toBe(2);
        } else {
          expect(columns).toBe(3);
        }
      }
    }
  });
});
