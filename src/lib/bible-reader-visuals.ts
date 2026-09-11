import type { ViewStyle } from 'react-native';

export type BibleTextLine = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BibleOverlayVariant = 'selectedDark' | 'selectedLight';

export const BIBLE_TEXT_OVERLAY_METRICS = {
  horizontalInset: 4,
  minHeight: 20,
  radius: 6,
  topInset: 2,
  bottomExtension: 1,
} as const;

export const BIBLE_SELECTED_OVERLAY_BG = {
  light: 'rgba(78, 68, 54, 0.30)',
  dark: 'rgba(255, 246, 224, 0.72)',
} as const;

const OVERLAY_BG_BY_VARIANT: Record<BibleOverlayVariant, string> = {
  selectedDark: BIBLE_SELECTED_OVERLAY_BG.dark,
  selectedLight: BIBLE_SELECTED_OVERLAY_BG.light,
};

/** Selection mark for one measured line of a verse. */
export function getBibleTextOverlayStyle(line: BibleTextLine, variant: BibleOverlayVariant): ViewStyle {
  const metrics = BIBLE_TEXT_OVERLAY_METRICS;
  return {
    position: 'absolute',
    left: line.x - metrics.horizontalInset,
    top: line.y + metrics.topInset,
    width: line.width + metrics.horizontalInset * 2,
    height: Math.max(metrics.minHeight, line.height - metrics.topInset + metrics.bottomExtension),
    borderRadius: metrics.radius,
    backgroundColor: OVERLAY_BG_BY_VARIANT[variant],
  };
}

/** Horizontal overhang of the highlighter stroke past the glyphs, in px. */
export const HIGHLIGHT_STROKE_INSET = 3;

/** Frame for one line of a saved highlight: the felt-tip band fitted to the
 *  letters (see HIGHLIGHT_STROKE_FIT), not to the line box, so it does not
 *  float high on tall line heights. `fit` is in em of `fontSize`; the band is
 *  centred on the glyphs' vertical midpoint inside the measured line. */
export function getBibleHighlightStrokeStyle(
  line: BibleTextLine,
  fontSize: number,
  fit: { top: number; height: number },
): ViewStyle {
  // RN centres the em box inside the line box; the fit offsets are from the
  // em box top to the tallest ascender.
  const emBoxTop = (line.height - fontSize) / 2;
  return {
    position: 'absolute',
    left: line.x - HIGHLIGHT_STROKE_INSET,
    top: Math.round(line.y + emBoxTop + fit.top * fontSize),
    width: line.width + HIGHLIGHT_STROKE_INSET * 2,
    height: Math.round(fit.height * fontSize),
    borderRadius: 2,
  };
}

export type BibleTabBarTransition = {
  hidden: boolean;
  mode: 'instant';
};

export function nextBibleTabBarStateAfterActions({
  showActions,
  wasScrollHiddenBeforeActions,
}: {
  showActions: boolean;
  wasScrollHiddenBeforeActions: boolean;
}): BibleTabBarTransition {
  if (showActions || wasScrollHiddenBeforeActions) {
    return { hidden: true, mode: 'instant' };
  }

  return { hidden: false, mode: 'instant' };
}
