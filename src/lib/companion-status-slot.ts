/**
 * Companion status-slot sizing (WR-17).
 *
 * The typing indicator and suggestion chips live between the message list and
 * the input bar. Mounting/unmounting them used to resize that band, lurching
 * the whole conversation up and down. The screen instead reserves ONE
 * fixed-height slot that hosts either child; these constants make the slot
 * height deterministic across font scales.
 *
 * Dependency-free so the UI components and unit tests share one source of
 * truth (companion-limits.ts precedent).
 */

/** CompanionOrb size inside the typing indicator row (does not font-scale). */
export const TYPING_INDICATOR_CONTENT_HEIGHT = 28;
/** Vertical padding around the typing indicator inside the slot. */
export const TYPING_INDICATOR_VERTICAL_PADDING = 8;

/** Explicit chip text line height — set on the chip <Text> so chip height is
 * deterministic instead of falling back to font-metric defaults. Scales with
 * the OS font scale like fontSize does. */
export const SUGGESTION_CHIP_TEXT_LINE_HEIGHT = 20;
/** paddingVertical on each chip touchable (Spacing['2']). */
export const SUGGESTION_CHIP_VERTICAL_PADDING = 8;
export const SUGGESTION_CHIP_BORDER_WIDTH = 1;
/** paddingVertical on the chips row wrapper (Spacing['2']). */
export const SUGGESTION_ROW_VERTICAL_PADDING = 8;

/**
 * Height of the always-mounted status slot: whichever of the two children is
 * taller at the current font scale, so neither ever resizes the band.
 */
export function computeCompanionStatusSlotHeight(fontScale: number): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;

  const typingHeight =
    TYPING_INDICATOR_CONTENT_HEIGHT + 2 * TYPING_INDICATOR_VERTICAL_PADDING;

  const chipHeight =
    Math.ceil(SUGGESTION_CHIP_TEXT_LINE_HEIGHT * scale) +
    2 * SUGGESTION_CHIP_VERTICAL_PADDING +
    2 * SUGGESTION_CHIP_BORDER_WIDTH;
  const chipsRowHeight = chipHeight + 2 * SUGGESTION_ROW_VERTICAL_PADDING;

  return Math.max(typingHeight, chipsRowHeight);
}
