import { BIBLE_BOOKS } from '../bible-constants';
import {
  BIBLE_HUB_OVERVIEW_MIN_TILE,
  BIBLE_HUB_OVERVIEW_TILE_BORDER,
  BIBLE_HUB_OVERVIEW_TILE_PADDING_X,
  BIBLE_HUB_SEGMENTED_MIN_HEIGHT,
  BIBLE_HUB_SEGMENTED_NATIVE_FONT_SIZE,
  BIBLE_HUB_SEGMENTED_VERTICAL_PADDING,
  bibleHubBookAccessibilityHint,
  bibleHubOverviewMetrics,
  bibleHubSegmentedMetrics,
} from '../bible-hub-overview-layout';

const WIDTHS = [320, 375, 402, 768] as const;
const SCALES = [1, 1.18, 1.64, 3] as const;

describe('bible hub compact overview geometry', () => {
  it('fits seven columns at 402pt and default fontScale with ~45pt tiles', () => {
    const metrics = bibleHubOverviewMetrics(402, 1);
    expect(metrics.columns).toBe(7);
    expect(metrics.tileWidth).toBeCloseTo(45.43, 2);
    expect(
      metrics.tileWidth - BIBLE_HUB_OVERVIEW_TILE_PADDING_X * 2 - BIBLE_HUB_OVERVIEW_TILE_BORDER * 2,
    ).toBeCloseTo(39.43, 2);
    expect(metrics.tileWidth).toBeGreaterThanOrEqual(BIBLE_HUB_OVERVIEW_MIN_TILE);
    expect(metrics.minTileHeight).toBe(44);
  });

  it('keeps every tile at least 44pt and reduces columns as text grows', () => {
    for (const width of WIDTHS) {
      for (const fontScale of SCALES) {
        const metrics = bibleHubOverviewMetrics(width, fontScale);
        expect(metrics.columns).toBeGreaterThanOrEqual(1);
        expect(metrics.columns).toBeLessThanOrEqual(7);
        expect(metrics.tileWidth).toBeGreaterThanOrEqual(BIBLE_HUB_OVERVIEW_MIN_TILE);
        expect(metrics.minTileHeight).toBeGreaterThanOrEqual(BIBLE_HUB_OVERVIEW_MIN_TILE);
        expect(metrics.minTileHeight).toBe(Math.max(44, Math.round(44 * fontScale)));
      }
    }
  });

  it('caps tablet columns at seven and leaves leftover tiles unstretched', () => {
    const phone = bibleHubOverviewMetrics(402, 1);
    const tablet = bibleHubOverviewMetrics(768, 1);
    expect(tablet.columns).toBe(7);
    expect(tablet.tileWidth).toBeGreaterThan(phone.tileWidth);
    expect(tablet.tileWidth * tablet.columns + 6 * (tablet.columns - 1)).toBeCloseTo(
      tablet.availableWidth,
      5,
    );
  });

  it('sizes the control from title size plus padding, never below 44pt', () => {
    const defaultControl = bibleHubSegmentedMetrics(1, 402);
    expect(defaultControl.fontSize).toBe(BIBLE_HUB_SEGMENTED_NATIVE_FONT_SIZE);
    expect(defaultControl.height).toBe(BIBLE_HUB_SEGMENTED_MIN_HEIGHT);
    const large = bibleHubSegmentedMetrics(3, 320);
    expect(large.fontSize).toBe(39);
    expect(large.height).toBe(39 + BIBLE_HUB_SEGMENTED_VERTICAL_PADDING);
    expect(large.height).toBeGreaterThanOrEqual(BIBLE_HUB_SEGMENTED_MIN_HEIGHT);
    expect(large.width).toBeLessThanOrEqual(320 - 48);
  });

  it('names category and chapter count in book hints, including one-chapter books', () => {
    const genesis = BIBLE_BOOKS.find((book) => book.name === 'Genesis');
    const obadiah = BIBLE_BOOKS.find((book) => book.name === 'Obadiah');
    expect(bibleHubBookAccessibilityHint(genesis!)).toBe('Law, 50 chapters');
    expect(bibleHubBookAccessibilityHint(obadiah!)).toBe('Minor Prophets, 1 chapter');
  });
});
