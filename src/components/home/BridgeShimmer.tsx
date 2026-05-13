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
import { CompanionOrb } from '@/components/CompanionOrb';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import type { ColorTheme } from '@/constants/colors';

interface Props {
  colors: ColorTheme;
}

export function BridgeShimmer({ colors }: Props) {
  const { reducedMotion, entering } = useAccessibleAnimation();
  const shimmer = useSharedValue(0);
  const bubbleColor = alpha(colors.accent, 0.06);
  const bubbleBorder = alpha(colors.accent, 0.13);

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
      style={styles.wrapper}
      accessibilityRole="progressbar"
      accessibilityLabel="Companion is gathering a thought for today"
      accessibilityValue={{ text: 'Preparing' }}
    >
      <View style={styles.row}>
        <View style={styles.orbWrap}>
          <CompanionOrb accentColor={colors.accent} size={24} />
        </View>

        <View style={styles.bubbleWrap}>
          <View
            style={[
              styles.bubble,
              {
                backgroundColor: bubbleColor,
                borderColor: bubbleBorder,
              },
            ]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.bubbleTail,
                {
                  backgroundColor: bubbleColor,
                  borderColor: bubbleBorder,
                },
              ]}
            />
            <Text style={[styles.title, { color: colors.text }]}>Companion is gathering a thread for today…</Text>
            <Animated.View style={[styles.skeletonGroup, shimmerStyle]}>
              <View style={[styles.skeletonLine, styles.skeletonLong, { backgroundColor: alpha(colors.text, 0.1) }]} />
              <View style={[styles.skeletonLine, styles.skeletonShort, { backgroundColor: alpha(colors.text, 0.075) }]} />
            </Animated.View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: Spacing['6'],
    marginTop: Spacing['3'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing['2.5'],
  },
  orbWrap: {
    marginTop: Spacing['2'],
  },
  bubbleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  bubble: {
    position: 'relative',
    overflow: 'visible',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: Radius.lg,
    borderTopLeftRadius: Radius.sm,
    borderWidth: 1,
    paddingVertical: Spacing['3'],
    paddingHorizontal: Spacing['3.5'],
  },
  bubbleTail: {
    position: 'absolute',
    left: -5,
    top: 15,
    width: 10,
    height: 10,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    transform: [{ rotate: '45deg' }],
  },
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
