import {
  ADAPTIVE_CLUSTER_MEASURE,
  ADAPTIVE_READABLE_MEASURE,
  ADAPTIVE_SHEET_MEASURE,
  ADAPTIVE_SPLIT_MEASURE,
  ADAPTIVE_FOLD_GUTTER,
  ADAPTIVE_PANE_MIN,
  ADAPTIVE_STACKED_MIN_HEIGHT,
  adaptivePaneLane,
  resolveAdaptivePanes,
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

describe('facing panes', () => {
  // iPhone Duo sizes are reported from the Xcode 27.1 beta simulator, not published by Apple.
  it('keeps the closed outer display as one compact column beside its side rail', () => {
    const outer = resolveAdaptiveLayout({ width: 466, height: 678, fontScale: 1, insetRight: 80 });
    expect(outer.isCompact).toBe(true);
    expect(outer.usesSplit).toBe(false);
    expect(resolveAdaptivePanes(outer, { stacked: true })).toBeNull();
  });

  it('pairs an open, wider-than-tall display below the 840pt split and centers the gutter on the fold', () => {
    const inner = resolveAdaptiveLayout({ width: 951, height: 669, fontScale: 1, insetLeft: 68, insetRight: 80 });
    expect(inner.availableWidth).toBe(803);
    expect(inner.usesSplit).toBe(true);

    const panes = resolveAdaptivePanes(inner);
    expect(panes).toEqual({ axis: 'row', lead: 0, first: 387.5, second: 375.5, gutter: ADAPTIVE_FOLD_GUTTER });
    const gutterCenter = inner.insetLeft + panes!.lead + panes!.first + panes!.gutter / 2;
    expect(gutterCenter).toBe(inner.width / 2);
  });

  it('stacks an open display turned upright only when the caller opts in', () => {
    const upright = resolveAdaptiveLayout({ width: 669, height: 951, fontScale: 1, insetTop: 50, insetBottom: 20 });
    expect(upright.isCompact).toBe(false);
    expect(upright.usesSplit).toBe(false);
    expect(resolveAdaptivePanes(upright)).toBeNull();
    expect(resolveAdaptivePanes(upright, { stacked: true })).toEqual({
      axis: 'column',
      lead: 0,
      first: 405.5,
      second: 435.5,
      gutter: ADAPTIVE_FOLD_GUTTER,
    });
  });

  it('caps wide windows to the split measure around the midline', () => {
    const wide = resolveAdaptiveLayout({ width: 1366, height: 1024, fontScale: 1 });
    expect(resolveAdaptivePanes(wide)).toEqual({ axis: 'row', lead: 193, first: 470, second: 470, gutter: ADAPTIVE_FOLD_GUTTER });
  });

  it('never pairs at large text sizes or in short windows', () => {
    const largeType = resolveAdaptiveLayout({ width: 951, height: 669, fontScale: 1.6 });
    expect(resolveAdaptivePanes(largeType, { stacked: true })).toBeNull();

    const shortUpright = resolveAdaptiveLayout({ width: 620, height: 670, fontScale: 1 });
    expect(resolveAdaptivePanes(shortUpright, { stacked: true })).toBeNull();
  });

  it('stacks the upright Duo content area and lets the pane-size guard decide', () => {
    expect(ADAPTIVE_STACKED_MIN_HEIGHT).toBe(ADAPTIVE_PANE_MIN * 2 + ADAPTIVE_FOLD_GUTTER);
    expect(ADAPTIVE_STACKED_MIN_HEIGHT).toBe(680);

    const content = resolveAdaptiveLayout({ width: 669, height: 703, fontScale: 1 });
    expect(resolveAdaptivePanes(content, { stacked: true })).toEqual({
      axis: 'column',
      lead: 0,
      first: 331.5,
      second: 331.5,
      gutter: ADAPTIVE_FOLD_GUTTER,
    });

    // Tall enough overall, but the top inset leaves the upper pane under 320pt.
    const inset = resolveAdaptiveLayout({ width: 669, height: 740, fontScale: 1, insetTop: 50 });
    expect(inset.availableHeight).toBeGreaterThanOrEqual(ADAPTIVE_STACKED_MIN_HEIGHT);
    expect(resolveAdaptivePanes(inset, { stacked: true })).toBeNull();
  });
});

describe('pane lane', () => {
  it('floats a control in the safe area, or in the second page of an open display', () => {
    const phone = resolveAdaptiveLayout({ width: 390, height: 844, fontScale: 1 });
    expect(adaptivePaneLane(phone, resolveAdaptivePanes(phone), { margin: 16 })).toEqual({ left: 16, width: 358 });

    const inner = resolveAdaptiveLayout({ width: 951, height: 669, fontScale: 1, insetLeft: 68, insetRight: 80 });
    const lane = adaptivePaneLane(inner, resolveAdaptivePanes(inner));
    expect(lane.left).toBeGreaterThan(inner.width / 2);
    expect(lane).toEqual({ left: 495.5, width: 375.5 });

    const docked = adaptivePaneLane(inner, resolveAdaptivePanes(inner), { margin: 16, maxWidth: 300 });
    expect(docked.width).toBe(300);
    expect(docked.left + docked.width / 2).toBe(lane.left + lane.width / 2);
  });

  it('floats a control in the first page of an open display on request', () => {
    const inner = resolveAdaptiveLayout({ width: 951, height: 669, fontScale: 1, insetLeft: 68, insetRight: 80 });
    const lane = adaptivePaneLane(inner, resolveAdaptivePanes(inner), { pane: 'first' });
    expect(lane).toEqual({ left: 68, width: 387.5 });
    expect(lane.left + lane.width).toBeLessThan(inner.width / 2);

    const wide = resolveAdaptiveLayout({ width: 1366, height: 1024, fontScale: 1 });
    expect(adaptivePaneLane(wide, resolveAdaptivePanes(wide), { pane: 'first', margin: 16 })).toEqual({ left: 209, width: 438 });

    const phone = resolveAdaptiveLayout({ width: 390, height: 844, fontScale: 1 });
    expect(adaptivePaneLane(phone, resolveAdaptivePanes(phone), { pane: 'first' })).toEqual({ left: 0, width: 390 });
  });

  it('ignores stacked panes, which leave the full width to floating controls', () => {
    const upright = resolveAdaptiveLayout({ width: 669, height: 951, fontScale: 1, insetTop: 50, insetBottom: 20 });
    expect(adaptivePaneLane(upright, resolveAdaptivePanes(upright, { stacked: true }))).toEqual({ left: 0, width: 669 });
  });
});
