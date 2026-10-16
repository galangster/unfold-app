/**
 * EveningCelebration — "Night Sky"
 *
 * A peaceful, distinct alternative to CompletionCelebration for the
 * evening wind-down flow. Instead of energetic expanding circles and
 * upward-drifting motes, this shows a dark sky filling with twinkling
 * stars and a single gentle message.
 *
 * ANIMATION STORYBOARD
 *
 *   0ms        dark overlay expands from center (600ms)
 *   200ms      first stars begin appearing (staggered over 1800ms)
 *   300ms      stars begin twinkling (continuous, randomized cycles)
 *   2400ms     message text fades in (800ms)
 *   3600ms     dismiss hint appears (600ms)
 *
 * The star field runs on two shared clocks (one-shot intro + repeating phase)
 * rather than one infinite loop per star; each star derives its own fade-in
 * and twinkle from them in its style worklet (see lib/evening-twinkle.ts).
 */

import { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Modal,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import {
  SKY_INTRO_MS,
  SKY_PHASE_PERIOD_MS,
  STAR_APPEAR_DELAY_MAX_MS,
  STAR_APPEAR_DELAY_MIN_MS,
  snapTwinklePeriod,
  starFrame,
} from '@/lib/evening-twinkle';

// ─── Single twinkling star ───────────────────────────────────────────────────
// A star owns no animation: it reads the shared sky clocks and derives its
// fade-in and twinkle from them with its own stable random parameters.
function Star({
  x,
  y,
  size,
  appearDelay,
  twinklePeriod,
  brightness,
  color,
  intro,
  phase,
}: {
  x: number;
  y: number;
  size: number;
  appearDelay: number;
  twinklePeriod: number;
  brightness: number;
  color: string;
  intro: SharedValue<number>;
  phase: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const frame = starFrame(
      intro.value * SKY_INTRO_MS,
      phase.value * SKY_PHASE_PERIOD_MS,
      appearDelay,
      twinklePeriod,
      brightness,
    );
    return {
      opacity: frame.opacity,
      transform: [{ scale: frame.scale }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

// ─── Expanding dark circle ───────────────────────────────────────────────────
function DarkExpansion({ bgColor, width, height }: { bgColor: string; width: number; height: number }) {
  const scale = useSharedValue(0);
  const diagonal = Math.sqrt(width ** 2 + height ** 2);

  useEffect(() => {
    scale.value = withTiming(1, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [scale]);

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    width: diagonal,
    height: diagonal,
    borderRadius: diagonal / 2,
    left: width / 2 - diagonal / 2,
    top: height / 2 - diagonal / 2,
    backgroundColor: bgColor,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={style} />;
}

// ─── Main component ──────────────────────────────────────────────────────────
interface EveningCelebrationProps {
  visible: boolean;
  onDismiss: () => void;
  /** Tonight's line, drawn by the caller (getEveningCelebrationMessage). */
  message: string;
}

export function EveningCelebration({
  visible,
  onDismiss,
  message,
}: EveningCelebrationProps) {
  const { reducedMotion } = useAccessibleAnimation();
  // Live window size: an open or closed folding display resizes the sky.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Evening celebration is ALWAYS rendered with the dark night-sky aesthetic
  // regardless of the user's theme preference. A white "evening" screen with
  // grey stars looked wrong — night is night. These values are hardcoded so
  // the celebration stays thematically consistent for light-mode users too.
  const overlayBg = '#08080F';
  const starColor = '#F5F0EB';
  const messageColor = 'rgba(245, 240, 235, 0.85)';
  const hintColor = 'rgba(245, 240, 235, 0.18)';

  // Generate stars fresh each time celebration shows. Positions are fractions
  // of the window, so a resize moves the sky without reshuffling it.
  const starField = useMemo(() => {
    if (!visible) return [];
    const count = 55;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random(),
      y: Math.random(),
      size: Math.random() * 2.5 + 1.2,
      // Stagger appearance: first stars appear at 200ms, last at ~2000ms
      appearDelay:
        STAR_APPEAR_DELAY_MIN_MS +
        Math.random() * (STAR_APPEAR_DELAY_MAX_MS - STAR_APPEAR_DELAY_MIN_MS),
      // Each star twinkles at its own pace (2-5 seconds per cycle), snapped to
      // a divisor of the shared phase clock so its wrap is invisible
      twinklePeriod: snapTwinklePeriod(2000 + Math.random() * 3000),
      // Brightness varies per star (dimmer ones feel farther away)
      brightness: 0.4 + Math.random() * 0.6,
    }));
  }, [visible]);
  const stars = useMemo(
    () => starField.map((star) => ({
      ...star,
      x: star.x * (windowWidth - 4),
      y: star.y * (windowHeight - 4),
    })),
    [starField, windowWidth, windowHeight],
  );

  // Shared star-field clocks (see lib/evening-twinkle.ts): `intro` counts the
  // first SKY_INTRO_MS once, `phase` cycles forever. Every star derives its
  // own fade-in and twinkle from these two values instead of running a loop.
  const skyIntro = useSharedValue(0);
  const skyPhase = useSharedValue(0);

  useEffect(() => {
    if (!visible || reducedMotion) return;

    skyIntro.value = withTiming(1, { duration: SKY_INTRO_MS, easing: Easing.linear });
    skyPhase.value = withRepeat(
      withTiming(1, { duration: SKY_PHASE_PERIOD_MS, easing: Easing.linear }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(skyIntro);
      cancelAnimation(skyPhase);
      skyIntro.value = 0;
      skyPhase.value = 0;
    };
  }, [visible, reducedMotion, skyIntro, skyPhase]);

  // Text animation values
  const overlayOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const textTranslateY = useSharedValue(10);
  const hintOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);

      if (reducedMotion) {
        overlayOpacity.value = 1;
        textOpacity.value = 1;
        textTranslateY.value = 0;
        hintOpacity.value = 1;
        return;
      }

      // Overlay appears
      overlayOpacity.value = withTiming(1, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      });

      // Message text fades in after stars have populated
      textOpacity.value = withDelay(
        2400,
        withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) })
      );
      textTranslateY.value = withDelay(
        2400,
        withTiming(0, { duration: 800, easing: Easing.out(Easing.cubic) })
      );

      // Dismiss hint
      hintOpacity.value = withDelay(
        3600,
        withTiming(1, { duration: 600 })
      );
    } else {
      overlayOpacity.value = withTiming(0, { duration: Duration.slow });
      textOpacity.value = 0;
      textTranslateY.value = 10;
      hintOpacity.value = 0;
    }
  }, [visible, overlayOpacity, textOpacity, textTranslateY, hintOpacity, reducedMotion]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslateY.value }],
  }));

  const hintStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={onDismiss}>
        <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>

          {/* Expanding dark circle fills the screen */}
          {!reducedMotion && <DarkExpansion bgColor={overlayBg} width={windowWidth} height={windowHeight} />}
          {reducedMotion && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayBg }]} />
          )}

          {/* Twinkling stars */}
          {!reducedMotion && stars.map((s) => (
            <Star
              key={s.id}
              x={s.x}
              y={s.y}
              size={s.size}
              appearDelay={s.appearDelay}
              twinklePeriod={s.twinklePeriod}
              brightness={s.brightness}
              color={starColor}
              intro={skyIntro}
              phase={skyPhase}
            />
          ))}
          {reducedMotion && stars.slice(0, 30).map((s) => (
            <View
              key={s.id}
              style={{
                position: 'absolute',
                left: s.x,
                top: s.y,
                width: s.size,
                height: s.size,
                borderRadius: s.size / 2,
                backgroundColor: starColor,
                opacity: s.brightness * 0.7,
              }}
            />
          ))}

          {/* Single message line — centered */}
          <View style={styles.textContainer}>
            <Animated.View style={textStyle}>
              <Text style={[styles.messageText, { color: messageColor }]}>
                {message}
              </Text>
            </Animated.View>
          </View>

          {/* Dismiss hint */}
          <Animated.View style={[styles.hintContainer, hintStyle]}>
            <Text style={[styles.hintText, { color: hintColor }]}>
              Tap anywhere to continue
            </Text>
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  textContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['12'],
  },
  messageText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize['2xl'],
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  hintContainer: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
  },
  hintText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
  },
});
