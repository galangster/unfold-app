import {
  ADAPTIVE_CLUSTER_MEASURE,
  ADAPTIVE_READABLE_MEASURE,
  ADAPTIVE_SHEET_MEASURE,
  ADAPTIVE_SPLIT_MEASURE,
  adaptiveFrameStyle,
  adaptiveSafeGutterStyle,
  adaptiveSheetPlacement,
  adaptiveViewportMaxHeight,
  keyboardAdjustedSheetBodyMaxHeight,
  keyboardAdjustedSheetMaxHeight,
  keyboardAdjustedSheetPaddingBottom,
  chapterSwipeMetrics,
  companionDrawerClosedTranslate,
  companionDrawerWidth,
  resolveAdaptiveLayout,
  swipeDismissTranslate,
} from '../adaptive-layout';

describe('resolveAdaptiveLayout', () => {
  it('keeps a 390pt window as a full-width single column', () => {
    const layout = resolveAdaptiveLayout({ width: 390, height: 844, fontScale: 1 });
    expect(layout.isCompact).toBe(true);
    expect(layout.usesSplit).toBe(false);
    expect(layout.columnCount).toBe(1);
    expect(layout.gutter).toBe(24);
    expect(layout.readableMaxWidth).toBe(390);
    expect(layout.clusterMaxWidth).toBe(390);
    expect(layout.sheetMaxWidth).toBe(390);
  });

  it('caps large windows to readable and cluster measures', () => {
    const layout = resolveAdaptiveLayout({ width: 1024, height: 768, fontScale: 1 });
    expect(layout.isCompact).toBe(false);
    expect(layout.usesSplit).toBe(true);
    expect(layout.columnCount).toBe(2);
    expect(layout.gutter).toBe(32);
    expect(layout.readableMaxWidth).toBe(ADAPTIVE_READABLE_MEASURE);
    expect(layout.clusterMaxWidth).toBe(ADAPTIVE_CLUSTER_MEASURE);
    expect(layout.splitMaxWidth).toBe(ADAPTIVE_SPLIT_MEASURE);
    expect(layout.sheetMaxWidth).toBe(ADAPTIVE_SHEET_MEASURE);
  });

  it('returns to one column on a 768pt window and on large type', () => {
    const regularPortrait = resolveAdaptiveLayout({ width: 768, height: 1024, fontScale: 1 });
    expect(regularPortrait.isCompact).toBe(false);
    expect(regularPortrait.usesSplit).toBe(false);
    expect(regularPortrait.columnCount).toBe(1);
    expect(regularPortrait.clusterMaxWidth).toBe(ADAPTIVE_CLUSTER_MEASURE);

    const largeType = resolveAdaptiveLayout({ width: 1024, height: 768, fontScale: 1.6 });
    expect(largeType.isCompact).toBe(true);
    expect(largeType.usesSplit).toBe(false);
    expect(largeType.columnCount).toBe(1);
  });

  it('follows live width after a resize and subtracts safe-area insets', () => {
    const narrow = resolveAdaptiveLayout({ width: 320, height: 568, fontScale: 1 });
    const wide = resolveAdaptiveLayout({ width: 1024, height: 768, fontScale: 1 });
    const inset = resolveAdaptiveLayout({
      width: 1024,
      height: 768,
      fontScale: 1,
      insetLeft: 200,
      insetRight: 200,
    });

    expect(narrow.columnCount).toBe(1);
    expect(narrow.clusterMaxWidth).toBe(320);
    expect(wide.columnCount).toBe(2);
    expect(inset.availableWidth).toBe(624);
    expect(inset.usesSplit).toBe(false);
    expect(inset.clusterMaxWidth).toBe(624);
  });

  it('treats invalid dimensions as empty compact layout', () => {
    const layout = resolveAdaptiveLayout({ width: Number.NaN, height: -10, fontScale: 0 });
    expect(layout.availableWidth).toBe(0);
    expect(layout.columnCount).toBe(1);
    expect(layout.readableMaxWidth).toBe(0);
  });
});

describe('adaptive helpers', () => {
  it('centers a live max-width frame', () => {
    expect(adaptiveFrameStyle(672)).toEqual({
      width: '100%',
      maxWidth: 672,
      alignSelf: 'center',
    });
  });

  it('sizes the companion drawer from current width, never past 320', () => {
    expect(companionDrawerWidth(390)).toBe(312);
    expect(companionDrawerWidth(1024)).toBe(320);
    expect(companionDrawerWidth(320)).toBe(256);
  });

  it('recomputes chapter swipe distances from the bounded reader width', () => {
    const phone = chapterSwipeMetrics(390);
    const boundedWide = chapterSwipeMetrics(ADAPTIVE_READABLE_MEASURE);
    const fullWindow = chapterSwipeMetrics(1024);
    expect(phone.distanceThreshold).toBeCloseTo(39);
    expect(phone.dragMax).toBeCloseTo(58.5);
    expect(boundedWide.distanceThreshold).toBeCloseTo(67.2);
    expect(boundedWide.dragMax).toBeLessThan(fullWindow.dragMax);
  });

  it('centers a sheet inside asymmetric safe areas and keeps a closed drawer offscreen after resize', () => {
    const layout = resolveAdaptiveLayout({
      width: 1024,
      height: 768,
      fontScale: 1,
      insetLeft: 80,
      insetRight: 20,
    });
    const placement = adaptiveSheetPlacement(layout);
    expect(adaptiveSafeGutterStyle(80, 20)).toEqual({ paddingLeft: 80, paddingRight: 20 });
    expect(placement.width).toBe(ADAPTIVE_SHEET_MEASURE);
    expect(placement.left).toBe(80 + (layout.availableWidth - ADAPTIVE_SHEET_MEASURE) / 2);
    expect(placement.left).toBeGreaterThan(80);

    expect(companionDrawerClosedTranslate(312)).toBe(-312);
    expect(companionDrawerClosedTranslate(320)).toBe(-320);
  });

  it('dismisses a sheet off the live window and caps height to the viewport', () => {
    expect(swipeDismissTranslate(390, 1)).toBe(390);
    expect(swipeDismissTranslate(390, -40)).toBe(-390);
    expect(swipeDismissTranslate(1024, 12)).toBe(1024);
    expect(adaptiveViewportMaxHeight(768, 0.85)).toBeCloseTo(652.8);
    expect(adaptiveViewportMaxHeight(1024, 0.7)).toBeCloseTo(716.8);
    expect(adaptiveViewportMaxHeight(Number.NaN, 0.7)).toBe(0);
  });

  it('bounds a keyboard-avoiding sheet to the measured parent, not a 200pt spacer', () => {
    expect(keyboardAdjustedSheetMaxHeight(400, 768)).toBe(400);
    expect(keyboardAdjustedSheetMaxHeight(0, 768)).toBe(768);
    expect(keyboardAdjustedSheetMaxHeight(Number.NaN, 768)).toBe(768);
    expect(keyboardAdjustedSheetPaddingBottom(34)).toBe(34);
    expect(keyboardAdjustedSheetPaddingBottom(-8)).toBe(0);
    expect(
      keyboardAdjustedSheetBodyMaxHeight({
        containerHeight: 360,
        chromeHeight: 72,
        paddingBottom: 34,
        fallbackHeight: 768,
      }),
    ).toBe(254);
    expect(
      keyboardAdjustedSheetBodyMaxHeight({
        containerHeight: 0,
        chromeHeight: 48,
        paddingBottom: 0,
        fallbackHeight: 768,
      }),
    ).toBe(720);
  });
});
