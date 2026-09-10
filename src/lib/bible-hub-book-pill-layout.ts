/**
 * Bible hub category book-pill geometry (VA-6).
 *
 * Pills render inside `scrollContent` (`paddingHorizontal: Spacing['6']`)
 * with a 6pt wrap gap. The default 402 × fontScale 1.0 hub keeps the
 * existing 3-column basis (30% / 30% / 48% max). Book names have no
 * `maxFontSizeMultiplier`, so they grow with `fontScale`.
 *
 * Assumptions:
 * - Available row width is window width minus Spacing['6'] × 2.
 * - Keep 3 columns at 375pt and 402pt when fontScale is below 1.18
 *   (same compact threshold used on Today cards) so the normal hub
 *   does not change.
 * - 320pt is too narrow for three 13pt names, so it uses 2 columns
 *   even at fontScale 1.0.
 * - fontScale >= 1.18 drops to 2 columns. fontScale >= 2.5, or a
 *   320pt window at enlarged text, uses 1 column.
 * - Callers must omit `numberOfLines` so a name that still exceeds
 *   its pill wraps instead of ellipsizing.
 */

export const BIBLE_HUB_THREE_COLUMN_MIN_WIDTH = 375;
export const BIBLE_HUB_TWO_COLUMN_MIN_WIDTH = 320;
export const BIBLE_HUB_ENLARGED_FONT_SCALE = 1.18;
export const BIBLE_HUB_SINGLE_COLUMN_FONT_SCALE = 2.5;

export function bibleHubBookPillColumnCount(
  windowWidth: number,
  fontScale: number,
): 1 | 2 | 3 {
  const width = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 0;
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;

  if (
    width <= 0 ||
    scale >= BIBLE_HUB_SINGLE_COLUMN_FONT_SCALE ||
    (width <= BIBLE_HUB_TWO_COLUMN_MIN_WIDTH && scale >= BIBLE_HUB_ENLARGED_FONT_SCALE)
  ) {
    return 1;
  }
  if (scale >= BIBLE_HUB_ENLARGED_FONT_SCALE || width < BIBLE_HUB_THREE_COLUMN_MIN_WIDTH) {
    return 2;
  }
  return 3;
}

export function bibleHubBookPillWidthStyle(columns: 1 | 2 | 3): {
  minWidth: `${number}%`;
  flexGrow: number;
  flexBasis: `${number}%`;
  maxWidth: `${number}%`;
} {
  if (columns === 1) {
    return { minWidth: '100%', flexGrow: 1, flexBasis: '100%', maxWidth: '100%' };
  }
  if (columns === 2) {
    return { minWidth: '46%', flexGrow: 1, flexBasis: '46%', maxWidth: '100%' };
  }
  return { minWidth: '30%', flexGrow: 1, flexBasis: '30%', maxWidth: '48%' };
}
