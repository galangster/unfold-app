/**
 * Unfold Elevation System
 *
 * Theme-aware token hook for card depth. Returns three tiers, each with
 * three sub-objects so consumers can place shadow, background, and a top
 * highlight overlay appropriately around an `overflow: 'hidden'` boundary.
 *
 * Phase 1 callers (TodayCardStack, StreakBox, BentoGrid) consume:
 *   - `shadow` on an outer un-clipped wrapper
 *   - `highlight` as an overlay child inside the clipped inner view
 * The `surface` sub-object is exposed for Phase 2/3 non-glass surfaces.
 */
import { Platform, type ViewStyle } from 'react-native';
import { useTheme } from '@/lib/theme';

export interface ElevationTier {
  shadow: ViewStyle;
  surface: ViewStyle;
  highlight: ViewStyle;
}

export interface ElevationSet {
  flat: ElevationTier;
  raised: ElevationTier;
  floating: ElevationTier;
}

const EMPTY_HIGHLIGHT: ViewStyle = {};

const RAISED_HIGHLIGHT_DARK: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 1,
  backgroundColor: 'rgba(255,255,255,0.06)',
};

const RAISED_HIGHLIGHT_LIGHT: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 1,
  backgroundColor: 'transparent',
};

export function useElevation(): ElevationSet {
  const { colors, isDark } = useTheme();

  // Platform.OS is read at call time so callers in tests can swap the value.
  // Platform.select on Jest's iOS mock always returns the ios branch
  // regardless of Platform.OS, so this hook uses a direct ternary instead.
  const isAndroid = Platform.OS === 'android';

  const raisedShadow: ViewStyle = isAndroid
    ? { elevation: 4 }
    : {
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: isDark ? 4 : 2 },
        shadowOpacity: isDark ? 0.1 : 0.08,
        shadowRadius: isDark ? 16 : 10,
      };

  const floatingShadow: ViewStyle = isAndroid
    ? { elevation: 12 }
    : {
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: isDark ? 6 : 4 },
        shadowOpacity: isDark ? 0.16 : 0.12,
        shadowRadius: isDark ? 24 : 14,
      };

  const raisedHighlight = isDark ? RAISED_HIGHLIGHT_DARK : RAISED_HIGHLIGHT_LIGHT;

  return {
    flat: {
      shadow: {},
      surface: { backgroundColor: colors.background },
      highlight: EMPTY_HIGHLIGHT,
    },
    raised: {
      shadow: raisedShadow,
      surface: { backgroundColor: colors.backgroundElevated },
      highlight: raisedHighlight,
    },
    floating: {
      shadow: floatingShadow,
      surface: { backgroundColor: colors.backgroundElevated },
      highlight: raisedHighlight,
    },
  };
}
