import { useEffect } from 'react';
import { ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';

const INTENSITY_RANGES = {
  subtle: { minRadius: 4, maxRadius: 8, minOpacity: 0.15, maxOpacity: 0.4 },
  medium: { minRadius: 6, maxRadius: 14, minOpacity: 0.2, maxOpacity: 0.55 },
  strong: { minRadius: 8, maxRadius: 20, minOpacity: 0.25, maxOpacity: 0.65 },
} as const;

interface AccentGlowProps {
  color: string;
  intensity?: 'subtle' | 'medium' | 'strong';
  active?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function AccentGlow({
  color,
  intensity = 'medium',
  active = true,
  children,
  style,
}: AccentGlowProps) {
  const progress = useSharedValue(0);
  const range = INTENSITY_RANGES[intensity];

  useEffect(() => {
    if (active) {
      progress.value = 0;
      progress.value = withRepeat(
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    } else {
      progress.value = withTiming(0, { duration: 400 });
    }
  }, [active, progress]);

  const glowStyle = useAnimatedStyle(() => {
    if (!active && progress.value === 0) {
      return {
        shadowColor: 'transparent',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
      };
    }

    const shadowRadius = interpolate(
      progress.value,
      [0, 1],
      [range.minRadius, range.maxRadius],
    );
    const shadowOpacity = interpolate(
      progress.value,
      [0, 1],
      [range.minOpacity, range.maxOpacity],
    );

    return {
      shadowColor: color,
      shadowOpacity,
      shadowRadius,
      shadowOffset: { width: 0, height: 0 },
    };
  });

  return (
    <Animated.View style={[style, glowStyle]}>
      {children}
    </Animated.View>
  );
}
