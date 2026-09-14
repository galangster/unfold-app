import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Ease } from '@/constants/animations';
import { FontFamily } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Typography } from '@/constants/typography';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { useAppForegrounded } from '@/hooks/useAppForegrounded';
import {
  BREATH_HALF_MS,
  BREATH_PEAK_SCALE,
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
  const { reducedMotion } = useAccessibleAnimation();
  const appActive = useAppForegrounded();
  const [userStarted, setUserStarted] = useState(false);
  const [cue, setCue] = useState<'in' | 'out'>('in');
  const scale = useSharedValue(1);
  const active = userStarted && appActive && visible;
  const animateRing = active && !reducedMotion;

  useEffect(() => {
    if (!visible || !appActive) {
      setUserStarted(false);
    }
  }, [appActive, visible]);

  useEffect(() => {
    if (!animateRing) {
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
  }, [animateRing, scale]);

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

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const cueLabel = !active || reducedMotion ? 'At your own pace' : cue === 'in' ? 'Breathe in' : 'Breathe out';

  return (
    <View testID="breath-prayer-guide" style={{ alignItems: 'center', gap: Spacing['3'] }}>
      {phrase ? (
        <Text
          testID="breath-prayer-phrase"
          style={{
            fontFamily: FontFamily.bodyItalic,
            fontSize: 18,
            lineHeight: 30,
            color: colors.text,
            textAlign: 'center',
          }}
        >
          {phrase}
        </Text>
      ) : null}

      <Animated.View
        testID="breath-prayer-ring"
        style={[
          {
            width: 168,
            height: 168,
            borderRadius: 84,
            borderWidth: 1,
            borderColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          },
          ringStyle,
        ]}
      >
        <Text
          testID="breath-prayer-cue"
          style={{
            fontFamily: FontFamily.ui,
            fontSize: 13,
            color: colors.textMuted,
            textAlign: 'center',
          }}
        >
          {cueLabel}
        </Text>
      </Animated.View>

      <TouchableOpacity
        testID={active ? 'breath-prayer-stop' : 'breath-prayer-begin'}
        accessibilityRole="button"
        accessibilityLabel={active ? 'Stop the optional breath guide' : 'Begin the optional breath guide'}
        accessibilityHint={active ? 'Stops the guide. You can still continue the practice.' : 'Starts an optional breathing pace. You can stop at any time.'}
        onPress={() => setUserStarted((current) => !current)}
        style={{
          minHeight: 44,
          minWidth: 44,
          width: '100%',
          borderRadius: Radius.full,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: Spacing['5'],
          paddingVertical: Spacing['3'],
        }}
      >
        <Text style={[Typography.uiSm, { color: colors.background, fontFamily: FontFamily.uiSemiBold }]}>
          {active ? 'Stop' : 'Begin'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
