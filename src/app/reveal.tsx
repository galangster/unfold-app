import { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  FadeIn,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { CaretUp } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { alpha } from '@/components/ui';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Reveal screen — full-screen overlay shown once per day
 * when new devotional content is ready. The user swipes up
 * to begin today's reading.
 */
export default function RevealScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const { devotionalId, dayNumber, seriesTitle, dayTitle, totalDays } =
    useLocalSearchParams<{
      devotionalId: string;
      dayNumber: string;
      seriesTitle: string;
      dayTitle: string;
      totalDays: string;
    }>();

  const setLastRevealShownDate = useUnfoldStore((s) => s.setLastRevealShownDate);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);

  // Mark today as revealed on mount
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setLastRevealShownDate(today);
  }, [setLastRevealShownDate]);

  // Animated chevron — smooth float up and down, NO bounce
  const chevronY = useSharedValue(0);

  useEffect(() => {
    chevronY.value = withRepeat(
      withTiming(-8, {
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [chevronY]);

  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: chevronY.value }],
  }));

  // Navigate to reading screen
  const navigateToReading = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Set the current devotional so the reading screen picks it up
    if (devotionalId) {
      setCurrentDevotional(devotionalId);
    }
    router.replace({
      pathname: '/(tabs)/(today)/reading',
      params: dayNumber ? { dayNumber } : undefined,
    });
  };

  // Swipe-up gesture — threshold of -80 translation triggers navigation
  const panGesture = Gesture.Pan()
    .onEnd((event) => {
      if (event.translationY < -80) {
        runOnJS(navigateToReading)();
      }
    });

  const dayNum = dayNumber ? parseInt(dayNumber, 10) : 1;
  const total = totalDays ? parseInt(totalDays, 10) : 1;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        entering={FadeIn.duration(600)}
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
        accessible
        accessibilityLabel={`New devotional ready: ${seriesTitle ?? 'Series'}, ${dayTitle ?? 'Today'}. Day ${dayNum} of ${total}. Swipe up to begin reading.`}
        accessibilityRole="header"
      >
        {/* Ambient glow effect */}
        <View
          style={[
            styles.ambientGlow,
            {
              backgroundColor: alpha(colors.accent, 0.06),
            },
          ]}
        />

        {/* Main content — centered */}
        <View style={styles.content}>
          {/* Series title eyebrow */}
          <Text
            style={[
              styles.eyebrow,
              { color: colors.textMuted },
            ]}
            numberOfLines={1}
            accessibilityRole="text"
          >
            {(seriesTitle ?? 'YOUR SERIES').toUpperCase()}
          </Text>

          {/* Day title — large display font */}
          <Text
            style={[
              styles.dayTitle,
              { color: colors.text },
            ]}
            numberOfLines={3}
            accessibilityRole="text"
          >
            {dayTitle ?? 'Today\'s Reading'}
          </Text>

          {/* Day counter */}
          <Text
            style={[
              styles.dayCounter,
              { color: colors.textMuted },
            ]}
            accessibilityRole="text"
          >
            {`DAY ${dayNum} OF ${total}`}
          </Text>
        </View>

        {/* Swipe-up prompt — bottom of screen */}
        <View style={styles.swipePrompt}>
          <Animated.View style={chevronAnimatedStyle}>
            <CaretUp
              size={24}
              color={colors.textSubtle}
              weight="light"
            />
          </Animated.View>
          <Text
            style={[
              styles.swipeText,
              { color: colors.textSubtle },
            ]}
          >
            {'Swipe up to begin\ntoday\'s reading'}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  ambientGlow: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_WIDTH * 0.8,
    borderRadius: SCREEN_WIDTH * 0.4,
    alignSelf: 'center',
    top: '30%',
    opacity: 0.7,
  },
  eyebrow: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  dayTitle: {
    fontFamily: FontFamily.display,
    fontSize: 32,
    lineHeight: 40,
    marginBottom: 16,
  },
  dayCounter: {
    fontFamily: FontFamily.ui,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  swipePrompt: {
    alignItems: 'center',
    paddingBottom: 60,
  },
  swipeText: {
    fontFamily: FontFamily.ui,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
});
