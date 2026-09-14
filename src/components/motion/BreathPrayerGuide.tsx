import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useId, useState } from 'react';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { alpha } from '@/components/ui/utils/alpha';
import { Ease } from '@/constants/animations';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Typography } from '@/constants/typography';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { useAppForegrounded } from '@/hooks/useAppForegrounded';
import {
  BREATH_BUTTON_CLEARANCE,
  BREATH_HALF_MS,
  BREATH_INNER_RING_SIZE,
  BREATH_PEAK_SCALE,
  BREATH_RESERVED_SIZE,
  BREATH_RING_SIZE,
} from '@/lib/meaningful-motion';

interface BreathPrayerGuideProps {
  phrase?: string;
  visible?: boolean;
  colors: {
    accent: string;
    background: string;
    text: string;
    textMuted: string;
  };
}

export function BreathPrayerGuide({
  phrase = '',
  visible = true,
  colors,
}: BreathPrayerGuideProps) {
  const haloId = useId();
  const { reducedMotion } = useAccessibleAnimation();
  const appActive = useAppForegrounded();
  const [userStarted, setUserStarted] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [cue, setCue] = useState<'in' | 'out'>('in');
  const scale = useSharedValue(1);
  const active = userStarted && appActive && visible;
  const animateHalo = active && !reducedMotion;
  const trimmedPhrase = phrase.trim();

  useEffect(() => {
    if (!visible || !appActive) {
      setPressed(false);
      setUserStarted(false);
    }
  }, [appActive, visible]);

  useEffect(() => {
    if (!animateHalo) {
      cancelAnimation(scale);
      scale.value = 1;
      return;
    }

    scale.value = 1;
    scale.value = withRepeat(
      withTiming(BREATH_PEAK_SCALE, { duration: BREATH_HALF_MS, easing: Ease.inOut }),
      -1,
      true,
    );
    return () => cancelAnimation(scale);
  }, [animateHalo, scale]);

  useEffect(() => {
    if (!active || reducedMotion) {
      setCue('in');
      return;
    }

    setCue('in');
    const timer = setInterval(() => {
      setCue((current) => (current === 'in' ? 'out' : 'in'));
    }, BREATH_HALF_MS);
    return () => clearInterval(timer);
  }, [active, reducedMotion]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const cueLabel = !active || reducedMotion ? 'At your own pace' : cue === 'in' ? 'Breathe in' : 'Breathe out';
  const accessibilityLabel = trimmedPhrase
    ? `Optional breath guide. ${trimmedPhrase}`
    : 'Optional breath guide';

  return (
    <View
      testID="breath-prayer-guide"
      accessibilityLabel={accessibilityLabel}
      style={styles.root}
    >
      <View
        testID="breath-prayer-frame"
        style={styles.frame}
      >
        <Animated.View
          pointerEvents="none"
          accessible={false}
          testID="breath-prayer-halo"
          style={[styles.halo, haloStyle]}
        >
          <Svg width={BREATH_RING_SIZE} height={BREATH_RING_SIZE} pointerEvents="none" accessible={false}>
            <Defs>
              <RadialGradient id={haloId} cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={colors.accent} stopOpacity={0.06} />
                <Stop offset="48%" stopColor={colors.accent} stopOpacity={0.18} />
                <Stop offset="74%" stopColor={colors.accent} stopOpacity={0.13} />
                <Stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={BREATH_RING_SIZE / 2} cy={BREATH_RING_SIZE / 2} r={BREATH_RING_SIZE / 2} fill={`url(#${haloId})`} />
          </Svg>
        </Animated.View>
        <View
          pointerEvents="none"
          accessible={false}
          testID="breath-prayer-ring"
          style={[
            styles.innerRing,
            { borderColor: alpha(colors.accent, 0.55) },
          ]}
        />
        <Text
          testID="breath-prayer-cue"
          style={[styles.cue, { color: colors.textMuted }]}
        >
          {cueLabel}
        </Text>
      </View>

      <Pressable
        testID={active ? 'breath-prayer-stop' : 'breath-prayer-begin'}
        accessibilityRole="button"
        accessibilityState={{ disabled: false }}
        accessibilityLabel={active ? 'Stop the optional breath guide' : 'Begin the optional breath guide'}
        accessibilityHint={active ? 'Stops the guide. You can still continue the practice.' : 'Starts an optional breathing pace. You can stop at any time.'}
        disabled={false}
        onPress={() => setUserStarted((current) => !current)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={[
          styles.button,
          {
            backgroundColor: colors.accent,
            opacity: pressed ? 0.88 : 1,
          },
        ]}
      >
        <Text style={[Typography.uiSm, { color: colors.background, fontFamily: FontFamily.uiSemiBold }]}>
          {active ? 'Stop' : 'Begin'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  frame: {
    width: BREATH_RESERVED_SIZE,
    height: BREATH_RESERVED_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    width: BREATH_RING_SIZE,
    height: BREATH_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRing: {
    position: 'absolute',
    width: BREATH_INNER_RING_SIZE,
    height: BREATH_INNER_RING_SIZE,
    borderRadius: BREATH_INNER_RING_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cue: {
    position: 'absolute',
    fontFamily: FontFamily.ui,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  button: {
    minHeight: 44,
    minWidth: 44,
    width: '100%',
    marginTop: BREATH_BUTTON_CLEARANCE,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
});
