import { Spacing } from '@/constants/spacing';
import {
  CATEGORY_LABELS,
  getBookCategory,
  type BibleBookInfo,
} from '@/lib/bible-constants';

export const BIBLE_HUB_OVERVIEW_GAP = 6;
export const BIBLE_HUB_OVERVIEW_MIN_TILE = 44;
export const BIBLE_HUB_OVERVIEW_MAX_COLUMNS = 7;
export const BIBLE_HUB_OVERVIEW_WIDE_MAX_COLUMNS = 12;
export const BIBLE_HUB_OVERVIEW_WIDE_MIN_WIDTH = 600;
export const BIBLE_HUB_OVERVIEW_PADDING = Spacing['6'];
export const BIBLE_HUB_OVERVIEW_TILE_PADDING_X = 2;
export const BIBLE_HUB_OVERVIEW_TILE_BORDER = 1;
export const BIBLE_HUB_SEGMENTED_MIN_HEIGHT = 44;
export const BIBLE_HUB_SEGMENTED_NATIVE_FONT_SIZE = 13;
export const BIBLE_HUB_SEGMENTED_VERTICAL_PADDING = 16;

export type BibleHubOverviewMetrics = {
  columns: number;
  tileWidth: number;
  minTileHeight: number;
  availableWidth: number;
};

export type BibleHubSegmentedMetrics = {
  height: number;
  fontSize: number;
  width: number;
};

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function bibleHubOverviewMetrics(
  windowWidth: number,
  fontScale: number,
): BibleHubOverviewMetrics {
  const width = finitePositive(windowWidth, 0);
  const scale = finitePositive(fontScale, 1);
  const availableWidth = width - BIBLE_HUB_OVERVIEW_PADDING * 2;
  const minTileHeight = Math.max(
    BIBLE_HUB_OVERVIEW_MIN_TILE,
    Math.round(BIBLE_HUB_OVERVIEW_MIN_TILE * scale),
  );

  if (availableWidth <= 0) {
    return {
      columns: 1,
      tileWidth: minTileHeight,
      minTileHeight,
      availableWidth: 0,
    };
  }

  const minTileWidth = Math.max(BIBLE_HUB_OVERVIEW_MIN_TILE, BIBLE_HUB_OVERVIEW_MIN_TILE * scale);
  const rawColumns = Math.floor(
    (availableWidth + BIBLE_HUB_OVERVIEW_GAP) / (minTileWidth + BIBLE_HUB_OVERVIEW_GAP),
  );
  const columnCap =
    availableWidth >= BIBLE_HUB_OVERVIEW_WIDE_MIN_WIDTH
      ? BIBLE_HUB_OVERVIEW_WIDE_MAX_COLUMNS
      : BIBLE_HUB_OVERVIEW_MAX_COLUMNS;
  const columns = Math.max(1, Math.min(columnCap, rawColumns));
  const tileWidth =
    (availableWidth - BIBLE_HUB_OVERVIEW_GAP * (columns - 1)) / columns;

  return { columns, tileWidth, minTileHeight, availableWidth };
}

export function bibleHubSegmentedMetrics(
  fontScale: number,
  windowWidth: number,
): BibleHubSegmentedMetrics {
  const scale = finitePositive(fontScale, 1);
  const width = finitePositive(windowWidth, 0);
  const availableWidth = Math.max(0, width - BIBLE_HUB_OVERVIEW_PADDING * 2);
  const fontSize = Math.round(BIBLE_HUB_SEGMENTED_NATIVE_FONT_SIZE * scale);

  return {
    height: Math.max(BIBLE_HUB_SEGMENTED_MIN_HEIGHT, fontSize + BIBLE_HUB_SEGMENTED_VERTICAL_PADDING),
    fontSize,
    width: Math.min(availableWidth || 148, Math.max(140, Math.round(150 * scale))),
  };
}

export const BIBLE_HUB_HEADER_TITLE_FONT_SIZE = 27;
export const BIBLE_HUB_HEADER_TITLE_CHARS = 5;
export const BIBLE_HUB_HEADER_TITLE_GLYPH_FACTOR = 0.62;
export const BIBLE_HUB_HEADER_PROFILE_WIDTH = 44;
export const BIBLE_HUB_HEADER_GAP = Spacing['3'];

export function bibleHubHeaderTitleReserve(): number {
  return Math.ceil(
    BIBLE_HUB_HEADER_TITLE_FONT_SIZE *
      BIBLE_HUB_HEADER_TITLE_GLYPH_FACTOR *
      BIBLE_HUB_HEADER_TITLE_CHARS,
  );
}

export function bibleHubHeaderTrailingWidth(fontScale: number, contentWidth: number): number {
  const segmented = bibleHubSegmentedMetrics(fontScale, contentWidth);
  return segmented.width + BIBLE_HUB_HEADER_GAP + BIBLE_HUB_HEADER_PROFILE_WIDTH;
}

/**
 * Stack the Bible hub title and trailing controls only when the reserved
 * "Bible" title, row gap, segmented control, and 44pt profile cannot share
 * one nowrap row. Title chrome uses maxFontSizeMultiplier 0; large type
 * still grows the segmented control.
 */
export function shouldStackBibleHubHeader(contentWidth: number, fontScale: number): boolean {
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) return true;
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const inner = Math.max(0, contentWidth - BIBLE_HUB_OVERVIEW_PADDING * 2);
  const needed =
    bibleHubHeaderTitleReserve() +
    BIBLE_HUB_HEADER_GAP +
    bibleHubHeaderTrailingWidth(scale, contentWidth);
  return inner < needed;
}

export function bibleHubBookAccessibilityHint(book: BibleBookInfo): string {
  const category = CATEGORY_LABELS[getBookCategory(book.id)];
  const chapters =
    book.chapterCount === 1 ? '1 chapter' : `${book.chapterCount} chapters`;
  return `${category}, ${chapters}`;
}
