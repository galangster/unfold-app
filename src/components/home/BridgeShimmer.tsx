import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Radius } from '@/constants/radius';
import { Duration, Ease } from '@/constants/animations';
import { alpha } from '@/components/ui';
import { TodayCompanionBubble } from '@/components/home/TodayCompanionBubble';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
}

const LOADING_TEXT = 'Companion is gathering a thread for today…';

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
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.34, 0.7, 0.34]),
  }));

  return (
    <Animated.View
      entering={entering(FadeIn.duration(Duration.slow).easing(Ease.out))}
      accessibilityRole="progressbar"
      accessibilityLabel="Companion is gathering a thought for today"
      accessibilityValue={{ text: 'Preparing' }}
    >
      <TodayCompanionBubble colors={colors} text={LOADING_TEXT}>
        <Text style={[styles.title, { color: colors.text }]}>{LOADING_TEXT}</Text>
        <Animated.View style={[styles.skeletonGroup, shimmerStyle]}>
          <View style={[styles.skeletonLine, styles.skeletonLong, { backgroundColor: alpha(colors.text, 0.1) }]} />
          <View style={[styles.skeletonLine, styles.skeletonShort, { backgroundColor: alpha(colors.text, 0.075) }]} />
        </Animated.View>
      </TodayCompanionBubble>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: Spacing['3'],
  },
  skeletonGroup: {
    gap: Spacing['2'],
  },
  skeletonLine: {
    height: 9,
    borderRadius: Radius.full,
  },
  skeletonLong: {
    width: '84%',
  },
  skeletonShort: {
    width: '58%',
  },
});
