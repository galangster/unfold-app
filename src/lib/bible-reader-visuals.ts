import type { ViewStyle } from 'react-native';

export type BibleTextLine = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BibleOverlayVariant = 'saved' | 'selectedDark' | 'selectedLight';

export const BIBLE_TEXT_OVERLAY_METRICS = {
  horizontalInset: 3,
  height: 18,
  bottomInset: 4,
  radius: 6,
  savedHorizontalInset: 2,
  savedHeightRatio: 0.82,
  savedBottomInsetRatio: 0.1,
  savedRadius: 2,
} as const;

export const BIBLE_SELECTED_OVERLAY_BG = {
  light: 'rgba(78, 68, 54, 0.30)',
  dark: 'rgba(255, 246, 224, 0.72)',
} as const;

const OVERLAY_BG_BY_VARIANT: Record<BibleOverlayVariant, string | undefined> = {
  saved: undefined,
  selectedDark: BIBLE_SELECTED_OVERLAY_BG.dark,
  selectedLight: BIBLE_SELECTED_OVERLAY_BG.light,
};

export function getBibleTextOverlayStyle(
  line: BibleTextLine,
  variant: BibleOverlayVariant = 'saved',
): ViewStyle {
  const metrics = BIBLE_TEXT_OVERLAY_METRICS;
  const isSaved = variant === 'saved';
  const horizontalInset = isSaved ? metrics.savedHorizontalInset : metrics.horizontalInset;
  const bottomInset = isSaved
    ? Math.max(2, line.height * metrics.savedBottomInsetRatio)
    : metrics.bottomInset;
  const overlayHeight = isSaved
    ? Math.min(line.height, Math.max(metrics.height, line.height * metrics.savedHeightRatio))
    : Math.min(metrics.height, Math.max(1, line.height - bottomInset));
  const style: ViewStyle = {
    position: 'absolute',
    left: line.x - horizontalInset,
    top: line.y + Math.max(0, line.height - bottomInset - overlayHeight),
    width: line.width + horizontalInset * 2,
    height: overlayHeight,
    borderRadius: isSaved ? metrics.savedRadius : metrics.radius,
  };

  const backgroundColor = OVERLAY_BG_BY_VARIANT[variant];
  if (backgroundColor) {
    style.backgroundColor = backgroundColor;
  }

  return style;
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
