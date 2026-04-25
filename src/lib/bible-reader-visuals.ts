import type { ViewStyle } from 'react-native';

export type BibleTextLine = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BibleOverlayVariant = 'saved' | 'selectedDark' | 'selectedLight';

export const BIBLE_TEXT_OVERLAY_METRICS = {
  horizontalInset: 1,
  height: 8,
  bottomInset: 8,
  radius: 3,
} as const;

export const BIBLE_SELECTED_OVERLAY_BG = {
  light: 'rgba(78, 68, 54, 0.12)',
  dark: 'rgba(225, 220, 210, 0.34)',
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
  const { horizontalInset, height, bottomInset, radius } = BIBLE_TEXT_OVERLAY_METRICS;
  const overlayHeight = Math.min(height, Math.max(1, line.height - bottomInset));
  const style: ViewStyle = {
    position: 'absolute',
    left: line.x - horizontalInset,
    top: line.y + Math.max(0, line.height - bottomInset - overlayHeight),
    width: line.width + horizontalInset * 2,
    height: overlayHeight,
    borderRadius: radius,
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
