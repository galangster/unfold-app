import React, { useEffect, useMemo } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withRepeat,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { SunIcon, SparkleIcon } from 'phosphor-react-native';
import { FontFamily, FontSize } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Spacing } from '@/constants/spacing';
import { Duration, Ease } from '@/constants/animations';
import { AccentGlow } from './AccentGlow';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

interface StreakCelebrationProps {
  streak: number;
  onComplete?: () => void;
}

/** Milestone thresholds mapped to their display labels */
const MILESTONE_LABELS: Record<number, string> = {
  7: '1 Week!',
  14: '2 Weeks!',
  30: '1 Month!',
  60: '2 Months!',
  100: '100 Days!',
  365: '1 Year!',
};

const MILESTONE_KEYS = Object.keys(MILESTONE_LABELS).map(Number);

/** Returns a scale multiplier for how "big" the celebration should be */
function getMilestoneScale(streak: number): number {
  if (streak >= 365) return 1.4;
  if (streak >= 100) return 1.3;
  if (streak >= 60) return 1.2;
  if (streak >= 30) return 1.15;
  if (streak >= 14) return 1.1;
  if (streak >= 7) return 1.05;
  return 1;
}

/** Sparkle particle positioned around the center */
const SparkleParticle = React.memo(function SparkleParticle({
  angle,
  distance,
  delay,
  size,
  color,
}: {
  angle: number;
  distance: number;
  delay: number;
  size: number;
  color: string;
}) {
  const particleOpacity = useSharedValue(0);
  const particleScale = useSharedValue(0.3);
  const particleTranslateX = useSharedValue(0);
  const particleTranslateY = useSharedValue(0);

  const radians = (angle * Math.PI) / 180;
  const targetX = Math.cos(radians) * distance;
  const targetY = Math.sin(radians) * distance;

  useEffect(() => {
    // Fade in + move outward
    particleOpacity.value = withDelay(
      delay,
      withSequence(
        withTiming(1, { duration: 200 }),
        withDelay(600, withTiming(0, { duration: 400 }))
      )
    );
    particleScale.value = withDelay(
      delay,
      withSequence(
        withSpring(1, { damping: 20, stiffness: 90 }),
        withDelay(400, withTiming(0.2, { duration: 400 }))
      )
    );
    particleTranslateX.value = withDelay(
      delay,
      withTiming(targetX, { duration: 800, easing: Easing.out(Easing.cubic) })
    );
    particleTranslateY.value = withDelay(
      delay,
      withTiming(targetY, { duration: 800, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: particleOpacity.value,
    transform: [
      { translateX: particleTranslateX.value },
      { translateY: particleTranslateY.value },
      { scale: particleScale.value },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          alignSelf: 'center',
        },
        animatedStyle,
      ]}
    >
      <SparkleIcon size={size} color={color} weight="fill" />
    </Animated.View>
  );
});

export function StreakCelebration({ streak, onComplete }: StreakCelebrationProps) {
  const { colors } = useTheme();
  const { reducedMotion, entering } = useAccessibleAnimation();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  const isMilestone = MILESTONE_KEYS.includes(streak);
  const milestoneLabel = MILESTONE_LABELS[streak];
  const milestoneScale = getMilestoneScale(streak);

  // Longer hold time for bigger milestones
  const holdDuration = isMilestone ? 2200 : 1700;

  useEffect(() => {
    if (reducedMotion) {
      // Show immediately, then dismiss after hold
      opacity.value = 1;
      scale.value = milestoneScale;
      opacity.value = withDelay(
        holdDuration,
        withTiming(0, { duration: Duration.slow }, (finished) => {
          if (finished && onComplete) {
            runOnJS(onComplete)();
          }
        }),
      );
      return;
    }
    // Fade in
    opacity.value = withTiming(1, { duration: Duration.normal });
    // Critically-damped scale — no bounce
    scale.value = withSpring(milestoneScale, { damping: 20, stiffness: 90 });
    // After hold, fade out and call onComplete
    opacity.value = withDelay(
      holdDuration,
      withTiming(0, { duration: Duration.slow }, (finished) => {
        if (finished && onComplete) {
          runOnJS(onComplete)();
        }
      }),
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Generate sparkle particles for milestones (skip if reduced motion)
  const sparkleParticles = useMemo(() => {
    if (!isMilestone || reducedMotion) return null;

    // More particles for bigger milestones
    let particleCount: number;
    if (streak >= 365) particleCount = 16;
    else if (streak >= 100) particleCount = 14;
    else if (streak >= 60) particleCount = 12;
    else if (streak >= 30) particleCount = 10;
    else if (streak >= 14) particleCount = 8;
    else particleCount = 6;

    const particles = [];
    const angleStep = 360 / particleCount;

    for (let i = 0; i < particleCount; i++) {
      const angle = angleStep * i + (i % 2 === 0 ? 0 : angleStep / 2);
      const distance = 50 + (i % 3) * 20;
      const size = i % 3 === 0 ? 20 : i % 3 === 1 ? 16 : 12;
      const delay = 100 + i * 50;

      particles.push(
        <SparkleParticle
          key={i}
          angle={angle}
          distance={distance}
          delay={delay}
          size={size}
          color={colors.accent}
        />
      );
    }
    return particles;
  }, [isMilestone, streak, colors.accent, reducedMotion]);

  // Fire icon size scales with milestone significance
  const fireSize = isMilestone ? 60 + (milestoneScale - 1) * 60 : 50;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100,
          pointerEvents: 'none',
        },
        containerStyle,
      ]}
    >
      <Animated.View
        style={[
          { alignItems: 'center' },
          innerStyle,
        ]}
      >
        {isMilestone ? (
          <View style={{ alignItems: 'center' }}>
            {/* Radiating sparkle particles */}
            <View style={{ position: 'relative', justifyContent: 'center', alignItems: 'center' }}>
              {sparkleParticles}
              <View style={{ flexDirection: 'row', gap: Spacing['2'], alignItems: 'center' }}>
                <SparkleIcon size={40} color={colors.accent} weight="light" />
                <SunIcon size={fireSize} color={colors.accent} weight="fill" />
                <SparkleIcon size={40} color={colors.accent} weight="light" />
              </View>
            </View>
            <AccentGlow color={colors.accent} intensity="strong" active={isMilestone}>
              <Animated.Text
                entering={entering(FadeIn.duration(Duration.normal).easing(Ease.out).delay(200))}
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 32 + (milestoneScale - 1) * 20,
                  color: colors.accent,
                  marginTop: Spacing['4'],
                  textAlign: 'center',
                }}
              >
                {milestoneLabel}
              </Animated.Text>
            </AccentGlow>
            <Animated.Text
              entering={entering(FadeIn.duration(Duration.normal).easing(Ease.out).delay(400))}
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: FontSize.sm,
                color: colors.textMuted,
                marginTop: 6,
              }}
            >
              {streak}-day streak
            </Animated.Text>
          </View>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <SunIcon size={50} color={colors.accent} weight="fill" />
            <Animated.Text
              entering={entering(FadeIn.duration(Duration.normal).easing(Ease.out).delay(200))}
              style={{
                fontFamily: FontFamily.display,
                fontSize: 28,
                color: colors.accent,
                marginTop: Spacing['3'],
              }}
            >
              +1
            </Animated.Text>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}
