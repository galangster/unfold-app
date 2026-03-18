import { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Dimensions, StyleSheet, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  withSpring,
  withRepeat,
  Easing,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CENTER_X = SCREEN_WIDTH / 2;
const CENTER_Y = SCREEN_HEIGHT / 2;
const DIAGONAL = Math.sqrt(SCREEN_WIDTH ** 2 + SCREEN_HEIGHT ** 2);

// ─── Pre-baked completion messages ───────────────────────────────────────────
const DAY_MESSAGES = [
  'You showed up. That matters.',
  'Another seed planted.',
  'Still waters run deep.',
  'Grace met you here today.',
  'Sit with this one a while.',
  'You gave that your attention. It counts.',
  'Faithfulness looks like this.',
  'You chose to be present.',
  'Slow growth is still growth.',
  'Did you feel that shift?',
  'You showed up. Most people don\'t.',
  'Be still and know.',
  'You chose the harder thing today.',
  'Another day, another layer deeper.',
  'You made space for what matters.',
  'One fewer distraction. One more truth.',
  'You made today count.',
  'This was meant for you.',
  'Carry this one with you.',
  'Rest in what you just received.',
  'You are being shaped by this.',
  'You chose depth. That takes guts.',
  'One more day closer.',
  'You did something most people skip.',
  'Your future self will thank you for this.',
  'That was time well spent.',
  'You chose substance over noise.',
  'Growth happens in the ordinary days.',
  'You were faithful today.',
  'You carved out space for what lasts.',
  'Another brick in the foundation.',
  'You are building something.',
  'You just invested in your soul.',
  'You were here. That\'s the whole thing.',
  'You made today count.',
  'That was between you and God.',
  'Your heart is a little wider now.',
  'You honored the process.',
  'Steady and sure. That\'s you.',
  'Keep going. It\'s working.',
  'You chose the better portion today.',
  'There\'s no shortcut to depth. You know that.',
];

const SERIES_MESSAGES = [
  'You walked the whole road.',
  'Every single day. You did that.',
  'First step to finish line.\nWell done.',
  'This is part of you now.',
  'You stuck with it. Not everyone does.',
  'Complete. And it wasn\'t easy.',
  'Look how far you\'ve come.',
  'That commitment was no small thing.',
  'Finished. Every last day.',
  'You gave this everything.',
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// ─── Ripple ring that expands from center ────────────────────────────────────
function RippleRing({ delay, maxRadius, accentColor }: { delay: number; maxRadius: number; accentColor: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.cubic) })
    );
  }, [delay, progress]);

  const style = useAnimatedStyle(() => {
    const size = interpolate(progress.value, [0, 1], [0, maxRadius * 2]);
    const opacity = interpolate(progress.value, [0, 0.15, 0.7, 1], [0, 0.25, 0.08, 0]);
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      opacity,
      borderWidth: 1.5,
      borderColor: accentColor,
      position: 'absolute' as const,
      left: CENTER_X - size / 2,
      top: CENTER_Y - size / 2,
    };
  });

  return <Animated.View style={style} />;
}

// ─── Expanding circle that fills the screen ─────────────────────────────────
function ExpandingCircle({ accentColor, onExpandComplete }: { accentColor: string; onExpandComplete?: () => void }) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0.8);

  useEffect(() => {
    // Start small and expand to fill screen
    scale.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished && onExpandComplete) {
        runOnJS(onExpandComplete)();
      }
    });
    
    // Fade out slightly as it fills
    opacity.value = withSequence(
      withTiming(0.6, { duration: 400 }),
      withTiming(0.25, { duration: 800 })
    );
  }, [scale, opacity, onExpandComplete]);

  const style = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    width: DIAGONAL,
    height: DIAGONAL,
    borderRadius: DIAGONAL / 2,
    left: CENTER_X - DIAGONAL / 2,
    top: CENTER_Y - DIAGONAL / 2,
    backgroundColor: accentColor,
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={style} />;
}

// ─── Luminous mote that drifts upward with organic sway ─────────────────────
function LuminousMote({
  startX,
  startY,
  size,
  delay,
  drift,
  accentColor,
  textColor,
  isAccent,
}: {
  startX: number;
  startY: number;
  size: number;
  delay: number;
  drift: number;
  accentColor: string;
  textColor: string;
  isAccent: boolean;
}) {
  const progress = useSharedValue(0);
  const sway = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 3200 + Math.random() * 800, easing: Easing.out(Easing.quad) })
    );
    sway.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 1600 + Math.random() * 600, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      )
    );
  }, [delay, progress, sway]);

  const style = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 0.08, 0.3, 0.75, 1], [0, 0.9, 0.7, 0.3, 0]);
    const translateY = interpolate(progress.value, [0, 1], [0, -(SCREEN_HEIGHT * 0.35 + drift)]);
    const translateX = interpolate(sway.value, [0, 1], [-12, 12]);
    const s = interpolate(progress.value, [0, 0.15, 0.6, 1], [0.2, 1, 0.8, 0.3]);
    return {
      opacity,
      transform: [{ translateY }, { translateX }, { scale: s }],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: startX - size / 2,
          top: startY,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: isAccent ? accentColor : textColor,
        },
        style,
      ]}
    />
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
interface CompletionCelebrationProps {
  visible: boolean;
  onDismiss: () => void;
  type: 'day' | 'series';
  message?: string;
}

export function CompletionCelebration({
  visible,
  onDismiss,
  type,
  message,
}: CompletionCelebrationProps) {
  const { colors } = useTheme();
  const { reducedMotion } = useAccessibleAnimation();

  // Pick a random message on each render when visible
  const subtitle = useMemo(() => {
    if (message) return message;
    if (type === 'series') return pickRandom(SERIES_MESSAGES);
    return pickRandom(DAY_MESSAGES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, type, message]);

  // Generate motes fresh each time celebration shows
  const motes = useMemo(() => {
    if (!visible) return [];
    return Array.from({ length: 18 }, (_, i) => ({
      id: i,
      // Cluster motes around center with some spread
      startX: CENTER_X + (Math.random() - 0.5) * SCREEN_WIDTH * 0.6,
      startY: CENTER_Y + (Math.random() - 0.3) * SCREEN_HEIGHT * 0.15,
      size: Math.random() * 4.5 + 2,
      delay: 200 + Math.random() * 700,
      drift: Math.random() * 80,
      isAccent: Math.random() > 0.35,
    }));
  }, [visible]);

  // Overlay + content animation values
  const overlayOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(18);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(14);
  const lineWidth = useSharedValue(0);
  const hintOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (reducedMotion) {
        // Show everything immediately — no staggered animations
        overlayOpacity.value = 1;
        lineWidth.value = 48;
        titleOpacity.value = 1;
        titleTranslateY.value = 0;
        subtitleOpacity.value = 1;
        subtitleTranslateY.value = 0;
        hintOpacity.value = 1;
        return;
      }

      // Background overlay fade in
      overlayOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });

      // Accent lines grow from center
      lineWidth.value = withDelay(600, withTiming(48, { duration: 600, easing: Easing.out(Easing.cubic) }));

      // Title rises into view
      titleOpacity.value = withDelay(700, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
      titleTranslateY.value = withDelay(700, withSpring(0, { damping: 20, stiffness: 100 }));

      // Subtitle follows
      subtitleOpacity.value = withDelay(1000, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
      subtitleTranslateY.value = withDelay(1000, withSpring(0, { damping: 20, stiffness: 100 }));

      // Dismiss hint appears last
      hintOpacity.value = withDelay(2200, withTiming(1, { duration: 800 }));
    } else {
      overlayOpacity.value = withTiming(0, { duration: 300 });
      titleOpacity.value = withTiming(0, { duration: 200 });
      subtitleOpacity.value = withTiming(0, { duration: 200 });
      lineWidth.value = 0;
      hintOpacity.value = 0;
      titleTranslateY.value = 18;
      subtitleTranslateY.value = 14;
    }
  }, [visible, overlayOpacity, titleOpacity, titleTranslateY, subtitleOpacity, subtitleTranslateY, lineWidth, hintOpacity, reducedMotion]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    backgroundColor: 'rgba(8, 8, 8, 0.96)',
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  const lineStyle = useAnimatedStyle(() => ({
    width: lineWidth.value,
  }));

  const hintStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value,
  }));

  if (!visible) return null;

  const title = type === 'series' ? 'Journey\nComplete' : 'Day\nComplete';

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={onDismiss}>
        <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>

          {/* Expanding circle that fills the screen (skip if reduced motion) */}
          {!reducedMotion && <ExpandingCircle accentColor={colors.accent} />}

          {/* Expanding ripple rings (skip if reduced motion) */}
          {!reducedMotion && (
            <>
              <RippleRing delay={200} maxRadius={SCREEN_WIDTH * 0.4} accentColor={colors.accent} />
              <RippleRing delay={450} maxRadius={SCREEN_WIDTH * 0.65} accentColor={colors.accent} />
            </>
          )}

          {/* Luminous motes drifting upward (skip if reduced motion) */}
          {!reducedMotion && motes.map((m) => (
            <LuminousMote
              key={m.id}
              startX={m.startX}
              startY={m.startY}
              size={m.size}
              delay={m.delay}
              drift={m.drift}
              accentColor={colors.accent}
              textColor="rgba(245, 240, 235, 0.7)"
              isAccent={m.isAccent}
            />
          ))}

          {/* Content */}
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 48,
            }}
          >
            {/* Top accent line */}
            <Animated.View
              style={[
                {
                  height: 1.5,
                  backgroundColor: colors.accent,
                  marginBottom: 36,
                  borderRadius: 1,
                },
                lineStyle,
              ]}
            />

            {/* Title */}
            <Animated.View style={titleStyle}>
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: type === 'series' ? 52 : 48,
                  color: '#F5F0EB',
                  textAlign: 'center',
                  lineHeight: type === 'series' ? 56 : 52,
                  letterSpacing: -1,
                }}
              >
                {title}
              </Text>
            </Animated.View>

            {/* Subtitle */}
            <Animated.View style={[{ marginTop: 20 }, subtitleStyle]}>
              <Text
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 17,
                  color: 'rgba(245, 240, 235, 0.55)',
                  textAlign: 'center',
                  lineHeight: 26,
                }}
              >
                {subtitle}
              </Text>
            </Animated.View>

            {/* Bottom accent line */}
            <Animated.View
              style={[
                {
                  height: 1.5,
                  backgroundColor: colors.accent,
                  marginTop: 36,
                  borderRadius: 1,
                },
                lineStyle,
              ]}
            />
          </View>

          {/* Dismiss hint */}
          <Animated.View
            style={[
              {
                position: 'absolute',
                bottom: 80,
                alignSelf: 'center',
              },
              hintStyle,
            ]}
          >
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 13,
                color: 'rgba(245, 240, 235, 0.2)',
              }}
            >
              Tap anywhere to continue
            </Text>
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}
