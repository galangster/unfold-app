import React, { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { WordRevealText } from '@/components/WordRevealText';


interface Slide {
  id: number;
  title: string;
  subtitle: string;
}

const slides: Slide[] = [
  {
    id: 0,
    title: 'A spiritual experience crafted just\u00A0for\u00A0you',
    subtitle: "The world's most personalized devotional. Every word reflects your story, your\u00A0struggles,\u00A0your\u00A0season.",
  },
  {
    id: 1,
    title: 'Theology meets\u00A0artistry',
    subtitle: 'Trained on profound theology and beautiful writing. Every devotional is uniquely composed with care, precision, and\u00A0spiritual\u00A0depth.',
  },
  {
    id: 2,
    title: 'A rhythm that transforms\u00A0your\u00A0life',
    subtitle: 'Fresh bread every morning, perfectly tuned to where you are. Build a habit of encountering God that lasts\u00A0a\u00A0lifetime.',
  },
];

const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);
const DISSOLVE_OUT = 300;
const DISSOLVE_IN = 400;

export default function HowItWorksScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [currentSlide, setCurrentSlide] = useState(0);
  const isTransitioning = useRef(false);

  // Content dissolve opacity
  const contentOpacity = useSharedValue(1);
  const subtitleOpacity = useSharedValue(0);

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const subtitleAnimStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const handleTitleComplete = useCallback(() => {
    subtitleOpacity.value = withTiming(1, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  // Named callbacks for runOnJS (can't use inline anonymous functions)
  const fadeInContent = useCallback(() => {
    subtitleOpacity.value = 0;
    contentOpacity.value = withTiming(1, {
      duration: DISSOLVE_IN,
      easing: EASE,
    });
    isTransitioning.current = false;
  }, []);

  const navigateToOnboarding = useCallback(() => {
    router.replace('/onboarding');
  }, [router]);

  const goToNext = useCallback(() => {
    if (isTransitioning.current) return;

    if (currentSlide < slides.length - 1) {
      isTransitioning.current = true;
      const nextSlide = currentSlide + 1;

      // Dissolve out, switch slide, dissolve in
      contentOpacity.value = withTiming(0, {
        duration: DISSOLVE_OUT,
        easing: EASE,
      }, (finished) => {
        if (finished) {
          runOnJS(setCurrentSlide)(nextSlide);
          runOnJS(fadeInContent)();
        }
      });
    } else {
      // Last slide — dissolve out then navigate
      isTransitioning.current = true;
      contentOpacity.value = withTiming(0, {
        duration: DISSOLVE_OUT,
        easing: EASE,
      }, (finished) => {
        if (finished) {
          runOnJS(navigateToOnboarding)();
        }
      });
    }
  }, [currentSlide, fadeInContent, navigateToOnboarding]);

  const goToPrevious = useCallback(() => {
    if (isTransitioning.current || currentSlide === 0) return;
    isTransitioning.current = true;
    const prevSlide = currentSlide - 1;

    contentOpacity.value = withTiming(0, {
      duration: DISSOLVE_OUT,
      easing: EASE,
    }, (finished) => {
      if (finished) {
        runOnJS(setCurrentSlide)(prevSlide);
        runOnJS(fadeInContent)();
      }
    });
  }, [currentSlide, fadeInContent]);

  const slide = slides[currentSlide];
  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={goToPrevious} disabled={currentSlide === 0} style={{ opacity: currentSlide === 0 ? 0 : 1 }}>
            <Text style={[styles.backText, { color: colors.textMuted }]}>
              Back
            </Text>
          </Pressable>

          <Pressable onPress={navigateToOnboarding}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
          </Pressable>
        </View>

        {/* Content — wraps in animated dissolve layer */}
        <Animated.View style={[styles.content, contentAnimStyle]}>
          <View key={currentSlide} style={styles.slideContent}>
            <View style={styles.titleWrap}>
              <WordRevealText
                text={slide.title}
                onComplete={handleTitleComplete}
                delay={200}
                wordDelay={120}
                style={{ fontSize: 32, letterSpacing: -0.5, color: colors.text }}
              />
            </View>
            <Animated.Text
              style={[styles.subtitle, { color: colors.textMuted }, subtitleAnimStyle]}
            >
              {slide.subtitle}
            </Animated.Text>
          </View>
        </Animated.View>

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
  titleWrap: {
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
