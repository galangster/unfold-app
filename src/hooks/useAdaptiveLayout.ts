import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveAdaptiveLayout, type AdaptiveLayout } from '@/lib/adaptive-layout';

export function useAdaptiveLayout(): AdaptiveLayout {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return useMemo(
    () =>
      resolveAdaptiveLayout({
        width,
        height,
        fontScale,
        insetLeft: insets.left,
        insetRight: insets.right,
        insetTop: insets.top,
        insetBottom: insets.bottom,
      }),
    [width, height, fontScale, insets.left, insets.right, insets.top, insets.bottom],
  );
}
