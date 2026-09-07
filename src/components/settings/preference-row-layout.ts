import { Spacing } from '@/constants/spacing';

/**
 * Settings preference-row layout budget (VA-5).
 *
 * Theme, Reading Font, and Font size share one card inside
 * `settings.tsx` (`paddingHorizontal: Spacing['6']`). Each of those
 * rows then applies `padding: Spacing['4']`.
 *
 * This helper does not measure glyphs. It uses window width from
 * `useWindowDimensions` plus those known gutters, then reserves a
 * conservative chip-group width. The rows also wrap against the
 * actual card width so a slightly different chrome width cannot
 * starve a label or push the Reading Font chevron out of the card.
 *
 * Assumptions:
 * - Page gutter is Spacing['6'] on both sides.
 * - Row padding is Spacing['4'] on both sides.
 * - Longest row label is "Font size" (9 characters) at 15pt Inter.
 * - Theme chip group (icon + label × 3, including gaps) is 236pt at
 *   scale 1. Font size chips are the same or narrower.
 * - Average glyph factor 0.52 keeps 402 × fontScale 1.0 on one row
 *   and still stacks before a 15pt label is forced to break a word.
 * - Label/chip scale caps stay 1.4 / 1.2. This policy never lowers
 *   them; it only changes direction and wrapping.
 * - Narrow 320pt windows stack even at fontScale 1.0. 375pt stacks
 *   when the reserved chip group no longer fits beside the label.
 */

export const SETTINGS_PAGE_HORIZONTAL_GUTTER = Spacing['6'] * 2;
export const SETTINGS_PREFERENCE_ROW_PADDING = Spacing['4'] * 2;
export const SETTINGS_PREFERENCE_LABEL_FONT_SIZE = 15;
export const SETTINGS_PREFERENCE_LONGEST_LABEL_CHARS = 9;
export const SETTINGS_PREFERENCE_AVG_GLYPH_FACTOR = 0.52;
export const SETTINGS_PREFERENCE_ROW_GAP = Spacing['2'];
export const SETTINGS_THEME_CHIP_GROUP_WIDTH_AT_SCALE_1 = 236;
export const SETTINGS_PREFERENCE_LABEL_MAX_SCALE = 1.4;
export const SETTINGS_PREFERENCE_CHIP_MAX_SCALE = 1.2;

export function settingsPreferenceContentWidth(windowWidth: number): number {
  const width = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 0;
  return Math.max(0, width - SETTINGS_PAGE_HORIZONTAL_GUTTER - SETTINGS_PREFERENCE_ROW_PADDING);
}

export function settingsPreferenceLabelReserve(fontScale: number): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const applied = Math.min(scale, SETTINGS_PREFERENCE_LABEL_MAX_SCALE);
  return Math.ceil(
    SETTINGS_PREFERENCE_LABEL_FONT_SIZE *
      applied *
      SETTINGS_PREFERENCE_AVG_GLYPH_FACTOR *
      SETTINGS_PREFERENCE_LONGEST_LABEL_CHARS,
  );
}

export function settingsPreferenceChipGroupReserve(fontScale: number): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const applied = Math.min(scale, SETTINGS_PREFERENCE_CHIP_MAX_SCALE);
  return Math.ceil(SETTINGS_THEME_CHIP_GROUP_WIDTH_AT_SCALE_1 * applied);
}

/**
 * Stack Theme / Reading Font / Font size when the reserved label and
 * chip group cannot share one line in the assumed content width.
 */
export function shouldStackSettingsPreferenceRow(
  windowWidth: number,
  fontScale: number,
): boolean {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0 || !Number.isFinite(fontScale) || fontScale <= 0) {
    return true;
  }
  const contentWidth = settingsPreferenceContentWidth(windowWidth);
  const needed =
    settingsPreferenceLabelReserve(fontScale) +
    SETTINGS_PREFERENCE_ROW_GAP +
    settingsPreferenceChipGroupReserve(fontScale);
  return contentWidth < needed;
}
