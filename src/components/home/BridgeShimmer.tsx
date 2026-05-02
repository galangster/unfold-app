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
import { Shadow } from '@/constants/shadows';
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
      accessibilityLabel="Companion bridge is being prepared"
      accessibilityValue={{ text: 'Gathering a bridge from yesterday into today' }}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: alpha(colors.backgroundElevated, 0.56),
            borderColor: alpha(colors.accent, 0.12),
            shadowColor: colors.accent,
          },
        ]}
      >
        <View style={styles.orbWrap}>
          <CompanionOrb accentColor={colors.accent} size={28} />
        </View>

        <View style={styles.content}>
          <View style={styles.kickerRow}>
            <View style={[styles.kickerRule, { backgroundColor: colors.accent }]} />
            <Text style={[styles.kicker, { color: colors.accent }]}>Companion bridge</Text>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>Connecting yesterday and today…</Text>
          <Animated.View style={[styles.skeletonGroup, shimmerStyle]}>
            <View style={[styles.skeletonLine, styles.skeletonLong, { backgroundColor: alpha(colors.text, 0.1) }]} />
            <View style={[styles.skeletonLine, styles.skeletonShort, { backgroundColor: alpha(colors.text, 0.075) }]} />
          </Animated.View>
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
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing['3'],
    borderRadius: Radius.xl,
    borderWidth: 1,
    paddingVertical: Spacing['4'],
    paddingHorizontal: Spacing['4'],
    ...Shadow.md,
  },
  orbWrap: {
    paddingTop: Spacing['1'],
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    marginBottom: Spacing['2'],
  },
  kickerRule: {
    width: 18,
    height: 1,
  },
  kicker: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
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
