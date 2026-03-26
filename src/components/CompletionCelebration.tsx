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
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { GoldEmberField } from '@/components/home/GoldEmberField';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CENTER_X = SCREEN_WIDTH / 2;
const CENTER_Y = SCREEN_HEIGHT / 2;
const DIAGONAL = Math.sqrt(SCREEN_WIDTH ** 2 + SCREEN_HEIGHT ** 2);

// ─── Pre-baked completion messages ───────────────────────────────────────────
// God/Jesus-focused: glory goes to Him, not to the reader.
const DAY_MESSAGES = [
  'He is faithful, even when you\'re not sure you are.',
  'The word that went out will not return empty.',
  'His mercies are new this morning.',
  'God is closer than your next breath.',
  'Jesus intercedes for you right now.',
  'He who began a good work will finish it.',
  'His grace was here before you were.',
  'The Good Shepherd knows your name.',
  'God does not waste a single word.',
  'Christ in you. The hope of glory.',
  'He is the same yesterday, today, and forever.',
  'The Father sees what is done in secret.',
  'His love is not earned. It just is.',
  'God is doing something you cannot see yet.',
  'Jesus sat with sinners. He sits with you.',
  'The Spirit helps when you don\'t have the words.',
  'His faithfulness reaches to the clouds.',
  'God is not distant. He is here.',
  'The cross says everything about His love.',
  'He gives strength to the weary.',
  'Jesus is the author and the finisher.',
  'God\'s kindness leads to real change.',
  'His promises do not expire.',
  'The Lord is near to the brokenhearted.',
  'He makes all things new. Including you.',
  'God speaks. Even in the quiet.',
  'His plans for you are not fragile.',
  'Jesus carried the weight so you don\'t have to.',
  'The Father\'s love is not performance-based.',
  'God is patient with you. Endlessly so.',
  'His word is a lamp. Not a floodlight. A lamp.',
  'Christ died while you were still figuring it out.',
  'The Spirit is moving, even now.',
  'He does not grow tired or weary.',
  'God knows the end of the story. Rest in that.',
  'Jesus is not ashamed to call you His.',
  'His compassion does not run out.',
  'God is working all things together.',
  'The risen Christ holds everything.',
  'He heals the brokenhearted and binds up wounds.',
  'God is not surprised by where you are.',
  'Jesus is the way. Not a suggestion.',
  'His peace passes understanding for a reason.',
  'The Lord fights for you. Be still.',
  'God remembers His covenant. Always.',
  'Jesus is enough. That\'s the whole gospel.',
  'His love endures forever. That word means forever.',
  'God delights in you. Not in your output.',
  'The grace that saved you sustains you too.',
  'He is the vine. You are connected.',
];

const SERIES_MESSAGES = [
  'He who began this work in you\nwill carry it to completion.',
  'God was faithful through every day of this.',
  'His word accomplished what He sent it to do.',
  'From start to finish, He was with you.',
  'God doesn\'t start things He won\'t finish.',
  'Every day of this series, His grace showed up.',
  'The Lord sustained you through all of it.',
  'His faithfulness carried you here.',
  'God gave you this word, day by day.',
  'Christ was in every page of this.',
  'He walked with you through the whole thing.',
  'God\'s promises held. Every single day.',
  'The Spirit guided you through it all.',
  'His word will keep working in you\nlong after today.',
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
      isAccent: Math.random() > 0.65,
    }));
  }, [visible]);

  // Overlay + content animation values
  const overlayOpacity = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(18);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(14);
  const hintOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (reducedMotion) {
        overlayOpacity.value = 1;
        titleOpacity.value = 1;
        titleTranslateY.value = 0;
        subtitleOpacity.value = 1;
        subtitleTranslateY.value = 0;
        hintOpacity.value = 1;
        return;
      }

      // Background overlay fade in
      overlayOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) });

      // Title rises into view
      titleOpacity.value = withDelay(500, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
      titleTranslateY.value = withDelay(500, withSpring(0, { damping: 20, stiffness: 100 }));

      // Subtitle follows
      subtitleOpacity.value = withDelay(800, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
      subtitleTranslateY.value = withDelay(800, withSpring(0, { damping: 20, stiffness: 100 }));

      // Dismiss hint appears last
      hintOpacity.value = withDelay(2000, withTiming(1, { duration: 800 }));
    } else {
      overlayOpacity.value = withTiming(0, { duration: Duration.slow });
      titleOpacity.value = withTiming(0, { duration: Duration.normal });
      subtitleOpacity.value = withTiming(0, { duration: Duration.normal });
      hintOpacity.value = 0;
      titleTranslateY.value = 18;
      subtitleTranslateY.value = 14;
    }
  }, [visible, overlayOpacity, titleOpacity, titleTranslateY, subtitleOpacity, subtitleTranslateY, hintOpacity, reducedMotion]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    backgroundColor: colors.backgroundPure,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  const hintStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value,
  }));

  if (!visible) return null;

  const title = type === 'series' ? 'Series Complete' : 'Day Complete';

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={onDismiss}>
        <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>

          {/* Ember particles rising from bottom */}
          {!reducedMotion && <GoldEmberField streakLevel={7} active />}

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
              textColor="rgba(255, 255, 255, 0.85)"
              isAccent={m.isAccent}
            />
          ))}

          {/* Content — left aligned */}
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'flex-start',
              paddingHorizontal: Spacing['8'],
            }}
          >
            {/* Title */}
            <Animated.View style={titleStyle}>
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: type === 'series' ? 52 : 48,
                  color: '#F5F0EB',
                  textAlign: 'left',
                  lineHeight: type === 'series' ? 56 : 52,
                  letterSpacing: -1,
                }}
              >
                {title}
              </Text>
            </Animated.View>

            {/* Subtitle */}
            <Animated.View style={[{ marginTop: Spacing['5'] }, subtitleStyle]}>
              <Text
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 17,
                  color: 'rgba(245, 240, 235, 0.55)',
                  textAlign: 'left',
                  lineHeight: 26,
                }}
              >
                {subtitle}
              </Text>
            </Animated.View>
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
