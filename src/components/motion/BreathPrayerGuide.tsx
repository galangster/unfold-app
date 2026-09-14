import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { alpha } from '@/components/ui/utils/alpha';
import { Ease } from '@/constants/animations';
import { FontFamily } from '@/constants/fonts';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { useAppForegrounded } from '@/hooks/useAppForegrounded';
import {
  BREATH_BUTTON_CLEARANCE,
  BREATH_HALF_MS,
  BREATH_PEAK_SCALE,
  BREATH_RESERVED_SIZE,
  BREATH_RING_SIZES,
  breathCueFromPhaseDelta,
  type BreathCue,
} from '@/lib/meaningful-motion';

const RING_OPACITIES = [0.5, 0.68, 0.86] as const;

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
  const [pressed, setPressed] = useState(false);
  const [cue, setCue] = useState<BreathCue>('in');
  const scale = useSharedValue(1);
  const cuePhase = useSharedValue(1);
  const motionLive = useSharedValue(0);
  const active = userStarted && appActive && visible;
  const animateRings = active && !reducedMotion;
  const trimmedPhrase = phrase.trim();

  useEffect(() => {
    if (!visible || !appActive) {
      setPressed(false);
      setUserStarted(false);
    }
  }, [appActive, visible]);

  useEffect(() => {
    if (!animateRings) {
      motionLive.value = 0;
      cancelAnimation(scale);
      scale.value = 1;
      cuePhase.value = 1;
      return;
    }

    motionLive.value = 1;
    cuePhase.value = 1;
    scale.value = 1;
    scale.value = withRepeat(
      withTiming(BREATH_PEAK_SCALE, { duration: BREATH_HALF_MS, easing: Ease.inOut }),
      -1,
      true,
    );
    return () => {
      motionLive.value = 0;
      cancelAnimation(scale);
    };
  }, [animateRings, cuePhase, motionLive, scale]);

  useEffect(() => {
    if (!active || reducedMotion) {
      setCue('in');
    }
  }, [active, reducedMotion]);

  useAnimatedReaction(
    () => scale.value,
    (current, previous) => {
      if (motionLive.value !== 1) return;
      const nextCue = breathCueFromPhaseDelta(current, previous);
      if (nextCue == null) return;
      const nextPhase = nextCue === 'in' ? 1 : 0;
      if (cuePhase.value === nextPhase) return;
      cuePhase.value = nextPhase;
      runOnJS(setCue)(nextCue);
    },
  );

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const cueLabel = !active
    ? 'Tap to begin'
    : reducedMotion
      ? 'At your own pace'
      : cue === 'in'
        ? 'Breathe in'
        : 'Breathe out';
  const toggleLabel = active
    ? `Pause the optional breath guide${trimmedPhrase ? `. ${trimmedPhrase}` : ''}`
    : `Begin the optional breath guide${trimmedPhrase ? `. ${trimmedPhrase}` : ''}`;

  return (
    <View
      testID="breath-prayer-guide"
      accessible={false}
      style={styles.root}
    >
      <Pressable
        testID="breath-prayer-toggle"
        accessibilityRole="button"
        accessibilityState={{ disabled: false, selected: active }}
        accessibilityLabel={toggleLabel}
        accessibilityValue={{ text: cueLabel }}
        accessibilityHint={
          active
            ? 'Pauses the guide. You can still continue the practice.'
            : 'Starts an optional breathing pace. You can pause at any time.'
        }
        disabled={false}
        onPress={() => setUserStarted((current) => !current)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={[styles.control, { opacity: pressed ? 0.88 : 1 }]}
      >
        <View
          testID="breath-prayer-frame"
          pointerEvents="none"
          style={styles.frame}
        >
          {BREATH_RING_SIZES.map((size, index) => (
            <Animated.View
              key={size}
              pointerEvents="none"
              accessible={false}
              testID="breath-prayer-ring"
              style={[
                styles.ring,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderColor: alpha(colors.accent, RING_OPACITIES[index]),
                },
                ringStyle,
              ]}
            />
          ))}
          <View pointerEvents="none" style={styles.cueBlock}>
            <Text
              testID="breath-prayer-cue"
              accessible={false}
              style={[styles.cue, { color: colors.textMuted }]}
            >
              {cueLabel}
            </Text>
            <Text
              testID="breath-prayer-hint"
              accessible={false}
              style={[styles.hint, { color: colors.textMuted }]}
            >
              {active ? 'Tap to pause' : ' '}
            </Text>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  control: {
    width: BREATH_RESERVED_SIZE,
    height: BREATH_RESERVED_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: BREATH_BUTTON_CLEARANCE,
  },
  frame: {
    width: BREATH_RESERVED_SIZE,
    height: BREATH_RESERVED_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
  },
  cueBlock: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    width: '100%',
  },
  cue: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  hint: {
    fontFamily: FontFamily.ui,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 2,
    minHeight: 16,
  },
});
