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
  const usesSplit =
    !isCompact &&
    availableWidth >= ADAPTIVE_WIDE_MIN_WIDTH &&
    fontScale < ADAPTIVE_SINGLE_COLUMN_FONT_SCALE;
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
