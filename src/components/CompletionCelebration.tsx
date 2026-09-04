import { useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, Dimensions, StyleSheet, Modal } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { EmberSystem } from '@/components/EmberSystem';
import { formatSeriesCompletionSummary } from '@/lib/series-completion-summary';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Pre-baked completion messages ───────────────────────────────────────────
// God/Jesus-focused: glory goes to Him, not to the reader.
const DAY_MESSAGES = [
  'He is faithful, even when you’re not sure you are.',
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
  'The Spirit helps when you don’t have the words.',
  'His faithfulness reaches to the clouds.',
  'God is not distant. He is here.',
  'The cross says everything about His love.',
  'He gives strength to the weary.',
  'Jesus is the author and the finisher.',
  'God’s kindness leads to real change.',
  'His promises do not expire.',
  'The Lord is near to the brokenhearted.',
  'He makes all things new. Including you.',
  'God speaks. Even in the quiet.',
  'His plans for you are not fragile.',
  'Jesus carried the weight so you don’t have to.',
  'The Father’s love is not performance-based.',
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
  'Jesus is enough. That’s the whole gospel.',
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
  'God doesn’t start things He won’t finish.',
  'Every day of this series, His grace showed up.',
  'The Lord sustained you through all of it.',
  'His faithfulness carried you here.',
  'God gave you this word, day by day.',
  'Christ was in every page of this.',
  'He walked with you through the whole thing.',
  'God’s promises held. Every single day.',
  'The Spirit guided you through it all.',
  'His word will keep working in you\nlong after today.',
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// ─── Main component ─────────────────────────────────────────────────────────
interface CompletionCelebrationProps {
  visible: boolean;
  onDismiss: () => void;
  type: 'day' | 'series';
  message?: string;
  seriesReflectionSummary?: string;
}

export function CompletionCelebration({
  visible,
  onDismiss,
  type,
  message,
  seriesReflectionSummary,
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
      hintOpacity.value = withDelay(1200, withTiming(1, { duration: 800 }));
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
    backgroundColor: colors.background,
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
  const seriesSummaryExcerpt = formatSeriesCompletionSummary(seriesReflectionSummary);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <TouchableOpacity
        activeOpacity={1}
        style={StyleSheet.absoluteFill}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Continue"
        accessibilityHint="Tap anywhere to continue"
      >
        <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>

          {/* Canonical celebration ember field + luminous motes. EmberSystem
              owns reduce motion internally (designed radial still, not null). */}
          <EmberSystem variant="celebration" motes active />

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
                  fontSize: type === 'series' ? 46 : 43,
                  color: colors.text,
                  textAlign: 'left',
                  lineHeight: type === 'series' ? 50 : 47,
                  letterSpacing: -0.45,
                }}
              >
                {title}
              </Text>
            </Animated.View>

            {/* Subtitle */}
            <Animated.View style={[{ marginTop: Spacing['5'] }, subtitleStyle]}>
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 17,
                  color: colors.textMuted,
                  textAlign: 'left',
                  lineHeight: 26,
                }}
              >
                {subtitle}
              </Text>
            </Animated.View>

            {/* Series reflection summary */}
            {type === 'series' && seriesSummaryExcerpt && (
              <Animated.View style={[{ marginTop: Spacing['4'], maxWidth: SCREEN_WIDTH - Spacing['8'] * 2 }, subtitleStyle]}>
                <Text
                  numberOfLines={4}
                  style={{
                    fontFamily: FontFamily.body,
                    fontSize: 16,
                    lineHeight: 24,
                    color: colors.textMuted,
                    textAlign: 'left',
                  }}
                >
                  {seriesSummaryExcerpt}
                </Text>
              </Animated.View>
            )}
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
                color: colors.textHint,
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
