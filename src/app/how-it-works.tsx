import React, { useState } from 'react';
import { View, Text, Pressable, Dimensions, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  FadeIn,
  FadeInUp,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  id: number;
  title: string;
  subtitle: string;
}

const slides: Slide[] = [
  {
    id: 0,
    title: 'Share where you are',
    subtitle: 'Your story, your struggles, your season. The more you share, the more personal it becomes.',
  },
  {
    id: 1,
    title: 'We listen deeply',
    subtitle: 'Ancient wisdom meets modern AI. Every devotional is crafted uniquely for you.',
  },
  {
    id: 2,
    title: 'Receive daily bread',
    subtitle: 'A fresh devotional every day, written for exactly where you are.',
  },
];

export default function HowItWorksScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [currentSlide, setCurrentSlide] = useState(0);

  const goToNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      router.replace('/onboarding');
    }
  };

  const goToPrevious = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const slide = slides[currentSlide];
  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={goToPrevious} disabled={currentSlide === 0}>
            <Text style={[styles.backText, { color: currentSlide === 0 ? colors.border : colors.textMuted }]}>
              Back
            </Text>
          </Pressable>

          <Pressable onPress={() => router.replace('/onboarding')}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
          </Pressable>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Animated.View
            key={currentSlide}
            entering={FadeInUp.duration(400)}
            style={styles.slideContent}
          >
            <Text style={[styles.title, { color: colors.text }]}>
              {slide.title}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {slide.subtitle}
            </Text>
          </Animated.View>
        </View>

        {/* Bottom */}
        <View style={styles.bottom}>
          {/* Progress dots */}
          <View style={styles.dots}>
            {slides.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor: index === currentSlide ? colors.accent : colors.border,
                    width: index === currentSlide ? 24 : 8,
                  },
                ]}
              />
            ))}
          </View>

          {/* Continue button */}
          <Pressable onPress={goToNext} style={styles.continueButton}>
            {({ pressed }) => (
              <View
                style={[
                  styles.buttonInner,
                  {
                    backgroundColor: colors.accent,
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                <Text style={[styles.buttonText, { color: colors.background }]}>
                  {isLastSlide ? 'Get Started' : 'Continue'}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    height: 60,
  },
  backText: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
  },
  skipText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  slideContent: {
    alignItems: 'center',
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 32,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  bottom: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 16,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  continueButton: {
    width: '100%',
  },
  buttonInner: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 16,
    letterSpacing: 0.3,
  },
});
