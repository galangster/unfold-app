import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import Animated, { FadeIn, FadeOut, FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  SpeakerHighIcon,
  SunIcon,
  PencilSimpleIcon,
  BookmarkSimpleIcon,
} from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';

interface FeatureSlide {
  id: string;
  iconKey: 'audio' | 'streak' | 'journal' | 'highlights';
  title: string;
  description: string;
}

const FEATURE_SLIDES: FeatureSlide[] = [
  {
    id: 'audio',
    iconKey: 'audio',
    title: 'Listen to Your Devotional',
    description:
      "Each day\u2019s reading is narrated by a beautiful AI voice. Listen while you commute, cook, or rest.",
  },
  {
    id: 'streaks',
    iconKey: 'streak',
    title: 'Build a Daily Rhythm',
    description:
      "Read each day to grow your streak. Small steps, every day \u2014 that\u2019s how transformation happens.",
  },
  {
    id: 'journal',
    iconKey: 'journal',
    title: 'Reflect & Go Deeper',
    description:
      "Journal your thoughts after each reading. Tap \u2018Go Deeper\u2019 for AI-powered prompts that meet you where you are.",
  },
  {
    id: 'highlights',
    iconKey: 'highlights',
    title: 'Save What Matters',
    description:
      'Highlight meaningful passages and export your entire journey as a beautifully formatted PDF.',
  },
];

function SlideIcon({
  iconKey,
  color,
  size,
}: {
  iconKey: FeatureSlide['iconKey'];
  color: string;
  size: number;
}) {
  switch (iconKey) {
    case 'audio':
      return <SpeakerHighIcon size={size} color={color} weight="light" />;
    case 'streak':
      return <SunIcon size={size} color={color} weight="light" />;
    case 'journal':
      return <PencilSimpleIcon size={size} color={color} weight="light" />;
    case 'highlights':
      return <BookmarkSimpleIcon size={size} color={color} weight="light" />;
  }
}

export function FeatureOnboarding() {
  const { colors, isDark } = useTheme();
  const hasSeenFeatureOnboarding = useUnfoldStore((s) => s.hasSeenFeatureOnboarding);
  const setHasSeenFeatureOnboarding = useUnfoldStore((s) => s.setHasSeenFeatureOnboarding);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const dismiss = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsVisible(false);
    setHasSeenFeatureOnboarding(true);
  }, [setHasSeenFeatureOnboarding]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentIndex < FEATURE_SLIDES.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      dismiss();
    }
  }, [currentIndex, dismiss]);

  if (hasSeenFeatureOnboarding || !isVisible) {
    return null;
  }

  const slide = FEATURE_SLIDES[currentIndex];
  const isLastSlide = currentIndex === FEATURE_SLIDES.length - 1;

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      exiting={FadeOut.duration(300)}
      style={[styles.overlay, { backgroundColor: colors.background }]}
    >
      {/* Skip button — top right, hidden on last slide */}
      {!isLastSlide && (
        <View style={styles.skipContainer}>
          <Pressable
            onPress={dismiss}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Skip feature tour"
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <Text
              style={{
                fontFamily: FontFamily.ui,
                fontSize: 14,
                color: colors.textSubtle,
              }}
            >
              Skip
            </Text>
          </Pressable>
        </View>
      )}

      {/* Current slide content — keyed by id for fresh animation on change */}
      <Animated.View
        key={slide.id}
        entering={FadeIn.duration(300)}
        style={styles.slideSection}
      >
        {/* Icon circle */}
        <Animated.View
          entering={FadeInUp.duration(500).delay(100)}
          style={[
            styles.iconCircle,
            {
              backgroundColor: isDark
                ? 'rgba(245, 240, 235, 0.06)'
                : 'rgba(28, 23, 16, 0.04)',
            },
          ]}
        >
          <SlideIcon iconKey={slide.iconKey} color={colors.accent} size={48} />
        </Animated.View>

        {/* Title */}
        <Text
          style={[
            styles.title,
            { fontFamily: FontFamily.display, color: colors.text },
          ]}
        >
          {slide.title}
        </Text>

        {/* Description */}
        <Text
          style={[
            styles.description,
            { fontFamily: FontFamily.body, color: colors.textMuted },
          ]}
        >
          {slide.description}
        </Text>
      </Animated.View>

      {/* Bottom section: dots + button */}
      <View style={styles.bottomSection}>
        {/* Dot indicators */}
        <View style={styles.dotsRow}>
          {FEATURE_SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    index === currentIndex
                      ? colors.accent
                      : isDark
                        ? 'rgba(245, 240, 235, 0.15)'
                        : 'rgba(28, 23, 16, 0.12)',
                  width: index === currentIndex ? 20 : 6,
                },
              ]}
            />
          ))}
        </View>

        {/* Action button */}
        <Pressable
          onPress={handleNext}
          accessibilityRole="button"
          accessibilityLabel={isLastSlide ? 'Get Started' : 'Next feature'}
          style={({ pressed }) => ({
            opacity: pressed ? 0.85 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          })}
        >
          <View
            style={[styles.button, { backgroundColor: colors.accent }]}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiSemiBold,
                fontSize: 16,
                color: '#FFFFFF',
                letterSpacing: 0.3,
              }}
            >
              {isLastSlide ? 'Get Started' : 'Next'}
            </Text>
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  skipContainer: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
  },
  slideSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: 8,
  },
  bottomSection: {
    paddingBottom: 120,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 32,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 64,
    borderRadius: 14,
    alignItems: 'center',
    minWidth: 220,
  },
});
