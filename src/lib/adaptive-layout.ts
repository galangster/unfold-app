import { Spacing } from '@/constants/spacing';

/**
 * Window-driven layout measures. Thresholds are available-width and
 * font-scale gates, not device names. Callers must pass live
 * useWindowDimensions values so resize and orientation stay current.
 */

export const ADAPTIVE_REGULAR_MIN_WIDTH = 600;
export const ADAPTIVE_WIDE_MIN_WIDTH = 840;
export const ADAPTIVE_SINGLE_COLUMN_FONT_SCALE = 1.6;
/** Internal reading-column cap. Not an Apple-prescribed width. */
export const ADAPTIVE_READABLE_MEASURE = 672;
export const PRIMARY_SAFE_AREA_EDGES = ['top', 'left', 'right'] as const;
export const ADAPTIVE_CLUSTER_MEASURE = 720;
export const ADAPTIVE_SPLIT_MEASURE = 980;
export const ADAPTIVE_SHEET_MEASURE = 520;
export const ADAPTIVE_DRAWER_MAX_WIDTH = 320;
export const ADAPTIVE_COLUMN_GAP = Spacing['4'];
/**
 * A window wider than it is tall pairs its content from this available
 * width, so an open folding display or a landscape iPad reads as two pages.
 */
export const ADAPTIVE_PAIRED_MIN_WIDTH = 760;
/** A taller-than-wide regular window can stack two panes from this height. */
export const ADAPTIVE_STACKED_MIN_HEIGHT = 800;
/** Smallest pane, measured along the pairing axis. */
export const ADAPTIVE_PANE_MIN = 320;
/**
 * Space between paired panes, centered on the window midline. A folding
 * display bends along that line, so nothing sits in it. Provisional until a
 * native reserved-region inset reaches JavaScript.
 */
export const ADAPTIVE_FOLD_GUTTER = Spacing['10'];

export type AdaptiveColumnCount = 1 | 2;

export type AdaptiveLayout = {
  width: number;
  height: number;
  fontScale: number;
  insetLeft: number;
  insetRight: number;
  insetTop: number;
  insetBottom: number;
  availableWidth: number;
  availableHeight: number;
  gutter: number;
  readableMaxWidth: number;
  clusterMaxWidth: number;
  splitMaxWidth: number;
  sheetMaxWidth: number;
  columnCount: AdaptiveColumnCount;
  columnGap: number;
  usesSplit: boolean;
  isCompact: boolean;
};

export type AdaptiveFrameStyle = {
  width: '100%';
  maxWidth: number;
  alignSelf: 'center';
};

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function resolveAdaptiveLayout(input: {
  width: number;
  height: number;
  fontScale?: number;
  insetLeft?: number;
  insetRight?: number;
  insetTop?: number;
  insetBottom?: number;
}): AdaptiveLayout {
  const width = finiteNonNegative(input.width);
  const height = finiteNonNegative(input.height);
  const fontScale = finitePositive(input.fontScale ?? 1, 1);
  const insetLeft = finiteNonNegative(input.insetLeft ?? 0);
  const insetRight = finiteNonNegative(input.insetRight ?? 0);
  const insetTop = finiteNonNegative(input.insetTop ?? 0);
  const insetBottom = finiteNonNegative(input.insetBottom ?? 0);
  const availableWidth = Math.max(0, width - insetLeft - insetRight);
  const availableHeight = Math.max(0, height - insetTop - insetBottom);
  const isCompact =
    availableWidth < ADAPTIVE_REGULAR_MIN_WIDTH ||
    fontScale >= ADAPTIVE_SINGLE_COLUMN_FONT_SCALE;
  // Window shape, not device orientation: an open iPhone Duo is wider than
  // tall at about 800-870pt, below the 840pt split used for tall windows.
  const usesSplit =
    !isCompact &&
    fontScale < ADAPTIVE_SINGLE_COLUMN_FONT_SCALE &&
    (availableWidth >= ADAPTIVE_WIDE_MIN_WIDTH ||
      (width > height && availableWidth >= ADAPTIVE_PAIRED_MIN_WIDTH));
  const gutter = availableWidth >= ADAPTIVE_WIDE_MIN_WIDTH ? Spacing['8'] : Spacing['6'];

  return {
    width,
    height,
    fontScale,
    insetLeft,
    insetRight,
    insetTop,
    insetBottom,
    availableWidth,
    availableHeight,
    gutter,
    readableMaxWidth: Math.min(availableWidth, ADAPTIVE_READABLE_MEASURE),
    clusterMaxWidth: Math.min(availableWidth, ADAPTIVE_CLUSTER_MEASURE),
    splitMaxWidth: Math.min(availableWidth, ADAPTIVE_SPLIT_MEASURE),
    sheetMaxWidth: Math.min(availableWidth, ADAPTIVE_SHEET_MEASURE),
    columnCount: usesSplit ? 2 : 1,
    columnGap: ADAPTIVE_COLUMN_GAP,
    usesSplit,
    isCompact,
  };
}

export type AdaptivePaneAxis = 'row' | 'column';

/**
 * Two panes that meet on the window midline. Sizes run along the axis:
 * widths for a row, heights for a column. `lead` is the space before the
 * first pane, measured from the safe-area edge.
 */
export type AdaptivePanes = {
  axis: AdaptivePaneAxis;
  lead: number;
  first: number;
  second: number;
  gutter: number;
};

type PaneInput = Pick<
  AdaptiveLayout,
  'width' | 'height' | 'insetLeft' | 'insetRight' | 'insetTop' | 'insetBottom' | 'availableHeight' | 'usesSplit' | 'isCompact'
>;

/**
 * Split a regular window into two panes around its midline. Rows follow
 * `usesSplit`. Columns are opt-in for tall regular windows, such as an open
 * iPhone Duo turned upright or propped like a laptop. Each pane keeps its own
 * outer safe-area inset, so an asymmetric side rail never moves the gutter.
 */
export function resolveAdaptivePanes(
  layout: PaneInput,
  options: { stacked?: boolean } = {},
): AdaptivePanes | null {
  const gutter = ADAPTIVE_FOLD_GUTTER;
  if (layout.usesSplit) {
    const midline = layout.width / 2;
    const half = ADAPTIVE_SPLIT_MEASURE / 2;
    const leadingRoom = Math.min(midline - layout.insetLeft, half);
    const trailingRoom = Math.min(layout.width - midline - layout.insetRight, half);
    const first = leadingRoom - gutter / 2;
    const second = trailingRoom - gutter / 2;
    if (first < ADAPTIVE_PANE_MIN || second < ADAPTIVE_PANE_MIN) return null;
    return { axis: 'row', lead: midline - layout.insetLeft - leadingRoom, first, second, gutter };
  }
  if (
    options.stacked &&
    !layout.isCompact &&
    layout.height > layout.width &&
    layout.availableHeight >= ADAPTIVE_STACKED_MIN_HEIGHT
  ) {
    const midline = layout.height / 2;
    const first = midline - layout.insetTop - gutter / 2;
    const second = layout.height - midline - layout.insetBottom - gutter / 2;
    if (first < ADAPTIVE_PANE_MIN || second < ADAPTIVE_PANE_MIN) return null;
    return { axis: 'column', lead: 0, first, second, gutter };
  }
  return null;
}

export function adaptiveFrameStyle(maxWidth: number): AdaptiveFrameStyle {
  return {
    width: '100%',
    maxWidth: finiteNonNegative(maxWidth),
    alignSelf: 'center',
  };
}

export function adaptiveSafeGutterStyle(insetLeft: number, insetRight: number): {
  paddingLeft: number;
  paddingRight: number;
} {
  return {
    paddingLeft: finiteNonNegative(insetLeft),
    paddingRight: finiteNonNegative(insetRight),
  };
}

export function adaptiveSheetPlacement(layout: Pick<AdaptiveLayout, 'availableWidth' | 'insetLeft' | 'sheetMaxWidth'>): {
  width: number;
  left: number;
} {
  const width = Math.min(layout.availableWidth, layout.sheetMaxWidth);
  const leftover = Math.max(0, layout.availableWidth - width);
  return {
    width,
    left: layout.insetLeft + leftover / 2,
  };
}

export function companionDrawerWidth(windowWidth: number): number {
  return Math.min(finitePositive(windowWidth, 390) * 0.8, ADAPTIVE_DRAWER_MAX_WIDTH);
}

export function companionDrawerClosedTranslate(drawerWidth: number): number {
  return -finitePositive(drawerWidth, ADAPTIVE_DRAWER_MAX_WIDTH);
}

export function chapterSwipeMetrics(windowWidth: number): {
  distanceThreshold: number;
  dragMax: number;
  arrowRevealDistance: number;
} {
  const width = finitePositive(windowWidth, 390);
  const dragMax = width * 0.15;
  return {
    distanceThreshold: width * 0.1,
    dragMax,
    arrowRevealDistance: dragMax * 0.6,
  };
}

export function swipeDismissTranslate(windowWidth: number, direction: number): number {
  const width = finitePositive(windowWidth, 390);
  return direction > 0 ? width : -width;
}

export function adaptiveViewportMaxHeight(viewportHeight: number, fraction: number): number {
  return finiteNonNegative(viewportHeight) * finiteNonNegative(fraction);
}

/**
 * Bound a keyboard-avoiding sheet to the measured parent height.
 * When KeyboardAvoidingView has not laid out yet, use fallbackHeight.
 * Do not add a fixed 200pt spacer on top of native keyboard avoidance.
 */
export function keyboardAdjustedSheetMaxHeight(
  containerHeight: number,
  fallbackHeight = 0,
): number {
  const measured = finiteNonNegative(containerHeight);
  return measured > 0 ? measured : finiteNonNegative(fallbackHeight);
}

export function keyboardAdjustedSheetPaddingBottom(insetBottom: number): number {
  return finiteNonNegative(insetBottom);
}

export function keyboardAdjustedSheetBodyMaxHeight(params: {
  containerHeight: number;
  chromeHeight: number;
  paddingBottom: number;
  fallbackHeight?: number;
}): number {
  const sheetMax = keyboardAdjustedSheetMaxHeight(
    params.containerHeight,
    params.fallbackHeight ?? 0,
  );
  return Math.max(
    0,
    sheetMax - finiteNonNegative(params.chromeHeight) - finiteNonNegative(params.paddingBottom),
  );
}
