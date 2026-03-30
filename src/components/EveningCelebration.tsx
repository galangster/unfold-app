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
 */

import { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  Modal,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DIAGONAL = Math.sqrt(SCREEN_WIDTH ** 2 + SCREEN_HEIGHT ** 2);

// ─── Evening messages (sans-serif, single line) ──────────────────────────────
const EVENING_MESSAGES = [
  'God is near tonight.',
  'His mercy is new every morning.',
  'He watches while you rest.',
  'Jesus carries what you cannot.',
  'God\u2019s faithfulness outlasts the day.',
  'He is working even now.',
  'The Lord gives sleep\u00A0to\u00A0those\u00A0He\u00A0loves.',
  'His peace has no expiration.',
  'God holds tomorrow already.',
  'Christ\u2019s grace covers tonight.',
  'He is the same, yesterday and forever.',
  'The Good Shepherd doesn\u2019t sleep.',
  'His love is the last word tonight.',
  'God finishes what He starts.',
  'Rest in what He has done.',
  'His presence fills the quiet.',
  'God\u2019s promises don\u2019t expire overnight.',
  'He who began a good work will complete it.',
  'The Father never looks away.',
  'His compassions never fail.',
  'God\u2019s grace is wider than today.',
  'He knit this day together for you.',
  'Jesus intercedes while you sleep.',
  'The Spirit prays what words cannot.',
  'His arm is not too short to reach you.',
  'God is writing a story through your life.',
  'He is making all things new.',
  'The cross already said everything.',
  'His kingdom comes while the world sleeps.',
  'God\u2019s love never had a beginning.',
  'He calls you by name.',
  'Christ is risen. That changes tonight.',
  'The Word became flesh for nights like this.',
  'His light shines in the darkness.',
  'God\u2019s ear is turned toward you.',
  'He is closer than your next breath.',
  'The Father runs toward you, not away.',
  'Jesus knows this exact feeling.',
  'His hand holds what yours released.',
  'God is sovereign over your sleep.',
  'He chose you before the world began.',
  'The Shepherd leads beside still waters.',
  'His grace is sufficient. Even now.',
  'God delights in you tonight.',
  'He numbers your days and fills them.',
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// ─── Single twinkling star ───────────────────────────────────────────────────
function Star({
  x,
  y,
  size,
  appearDelay,
  twinkleDuration,
  brightness,
}: {
  x: number;
  y: number;
  size: number;
  appearDelay: number;
  twinkleDuration: number;
  brightness: number;
}) {
  const appear = useSharedValue(0);
  const twinkle = useSharedValue(brightness);

  useEffect(() => {
    // Fade in
    appear.value = withDelay(
      appearDelay,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) })
    );
    // Continuous twinkle after appearing
    twinkle.value = withDelay(
      appearDelay + 400,
      withRepeat(
        withSequence(
          withTiming(brightness * 0.25, {
            duration: twinkleDuration * 0.4,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(brightness, {
            duration: twinkleDuration * 0.6,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        true,
      )
    );
  }, [appear, twinkle, appearDelay, twinkleDuration, brightness]);

  const style = useAnimatedStyle(() => ({
    opacity: appear.value * twinkle.value,
    transform: [
      { scale: interpolate(twinkle.value, [brightness * 0.25, brightness], [0.7, 1.0]) },
    ],
  }));

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
          backgroundColor: '#F5F0EB',
        },
        style,
      ]}
    />
  );
}

// ─── Expanding dark circle ───────────────────────────────────────────────────
function DarkExpansion() {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [scale]);

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    width: DIAGONAL,
    height: DIAGONAL,
    borderRadius: DIAGONAL / 2,
    left: SCREEN_WIDTH / 2 - DIAGONAL / 2,
    top: SCREEN_HEIGHT / 2 - DIAGONAL / 2,
    backgroundColor: '#08080F',
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={style} />;
}

// ─── Main component ──────────────────────────────────────────────────────────
interface EveningCelebrationProps {
  visible: boolean;
  onDismiss: () => void;
  message?: string;
}

export function EveningCelebration({
  visible,
  onDismiss,
  message,
}: EveningCelebrationProps) {
  const { reducedMotion } = useAccessibleAnimation();

  const subtitle = useMemo(() => {
    if (message) return message;
    return pickRandom(EVENING_MESSAGES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, message]);

  // Generate stars fresh each time celebration shows
  const stars = useMemo(() => {
    if (!visible) return [];
    const count = 55;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * (SCREEN_WIDTH - 4),
      y: Math.random() * (SCREEN_HEIGHT - 4),
      size: Math.random() * 2.5 + 1.2,
      // Stagger appearance: first stars appear at 200ms, last at ~2000ms
      appearDelay: 200 + Math.random() * 1800,
      // Each star twinkles at its own pace (2-5 seconds per cycle)
      twinkleDuration: 2000 + Math.random() * 3000,
      // Brightness varies per star (dimmer ones feel farther away)
      brightness: 0.4 + Math.random() * 0.6,
    }));
  }, [visible]);

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
          {!reducedMotion && <DarkExpansion />}
          {reducedMotion && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#08080F' }]} />
          )}

          {/* Twinkling stars */}
          {!reducedMotion && stars.map((s) => (
            <Star
              key={s.id}
              x={s.x}
              y={s.y}
              size={s.size}
              appearDelay={s.appearDelay}
              twinkleDuration={s.twinkleDuration}
              brightness={s.brightness}
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
                backgroundColor: '#F5F0EB',
                opacity: s.brightness * 0.7,
              }}
            />
          ))}

          {/* Single message line — centered */}
          <View style={styles.textContainer}>
            <Animated.View style={textStyle}>
              <Text style={styles.messageText}>
                {subtitle}
              </Text>
            </Animated.View>
          </View>

          {/* Dismiss hint */}
          <Animated.View style={[styles.hintContainer, hintStyle]}>
            <Text style={styles.hintText}>
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
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['12'],
  },
  messageText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize['2xl'],
    color: 'rgba(245, 240, 235, 0.85)',
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
    color: 'rgba(245, 240, 235, 0.18)',
  },
});
