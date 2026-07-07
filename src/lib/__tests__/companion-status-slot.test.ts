import {
  computeCompanionStatusSlotHeight,
  SUGGESTION_CHIP_TEXT_LINE_HEIGHT,
  SUGGESTION_CHIP_VERTICAL_PADDING,
  SUGGESTION_CHIP_BORDER_WIDTH,
  SUGGESTION_ROW_VERTICAL_PADDING,
  TYPING_INDICATOR_CONTENT_HEIGHT,
  TYPING_INDICATOR_VERTICAL_PADDING,
} from '../companion-status-slot';

describe('computeCompanionStatusSlotHeight (WR-17)', () => {
  const typingHeight = TYPING_INDICATOR_CONTENT_HEIGHT + 2 * TYPING_INDICATOR_VERTICAL_PADDING;

  const chipsRowHeight = (scale: number) =>
    Math.ceil(SUGGESTION_CHIP_TEXT_LINE_HEIGHT * scale) +
    2 * SUGGESTION_CHIP_VERTICAL_PADDING +
    2 * SUGGESTION_CHIP_BORDER_WIDTH +
    2 * SUGGESTION_ROW_VERTICAL_PADDING;

  it('reserves the chips-row height at default font scale (chips are the taller child)', () => {
    expect(computeCompanionStatusSlotHeight(1)).toBe(54);
    expect(computeCompanionStatusSlotHeight(1)).toBe(chipsRowHeight(1));
    expect(chipsRowHeight(1)).toBeGreaterThan(typingHeight);
  });

  it('grows with the OS font scale so scaled chips never clip', () => {
    expect(computeCompanionStatusSlotHeight(1.5)).toBe(chipsRowHeight(1.5));
    expect(computeCompanionStatusSlotHeight(2)).toBe(chipsRowHeight(2));
    expect(computeCompanionStatusSlotHeight(2)).toBeGreaterThan(computeCompanionStatusSlotHeight(1));
  });

  it('never shrinks below the typing indicator height', () => {
    expect(computeCompanionStatusSlotHeight(0.5)).toBeGreaterThanOrEqual(typingHeight);
  });

  it('falls back to scale 1 for invalid inputs', () => {
    expect(computeCompanionStatusSlotHeight(NaN)).toBe(computeCompanionStatusSlotHeight(1));
    expect(computeCompanionStatusSlotHeight(0)).toBe(computeCompanionStatusSlotHeight(1));
    expect(computeCompanionStatusSlotHeight(-2)).toBe(computeCompanionStatusSlotHeight(1));
  });
});
