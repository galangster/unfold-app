import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Shadow } from '@/constants/shadows';
import { Duration, Ease } from '@/constants/animations';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
}

export function BridgeShimmer({ colors }: Props) {
  const { reducedMotion, entering } = useAccessibleAnimation();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [shimmer, reducedMotion]);

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.6, 0.3]),
  }));

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.slow).easing(Ease.out))}
      style={{ paddingHorizontal: Spacing['6'], marginTop: Spacing['4'] }}
    >
      <View
        style={{
          borderRadius: Radius.card,
          borderWidth: 1,
          padding: 18,
          backgroundColor: colors.inputBackground,
          borderColor: colors.border,
          ...Shadow.sm,
        }}
      >
        <Animated.View style={shimmerStyle}>
          <View
            style={{
              height: 10,
              width: '85%',
              borderRadius: 5,
              marginBottom: 10,
              backgroundColor: colors.border,
            }}
          />
          <View
            style={{
              height: 10,
              width: '65%',
              borderRadius: 5,
              backgroundColor: colors.border,
            }}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}
