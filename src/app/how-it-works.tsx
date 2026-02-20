import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Dimensions, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
  interpolate,
  useAnimatedGestureHandler,
  runOnJS,
} from 'react-native-reanimated';
import { PanGestureHandler } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { GoldEmberField } from '@/components/GoldEmberField';
import { User, Sparkles, BookOpen } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  id: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  illustration: React.ReactNode;
}

// Animated illustration components
function ShareIllustration({ colors, isDark }: { colors: any; isDark: boolean }) {
  const pulse = useSharedValue(0);
  
  React.useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.3, 0.7]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.1]) }],
  }));

  return (
    <View style={styles.illustrationContainer}>
      {/* Central circle with pulse */}
      <Animated.View
        style={[
          styles.illustrationGlow,
          {
            backgroundColor: isDark 
              ? 'rgba(200, 165, 92, 0.2)' 
              : 'rgba(154, 123, 60, 0.15)',
          },
          glowStyle,
        ]}
      />
      <View style={[styles.illustrationCenter, { backgroundColor: colors.inputBackground }]}>
        <User size={40} color={colors.accent} strokeWidth={1.5} />
      </View>
      
      {/* Orbiting dots */}
      {[0, 1, 2].map((i) => (
        <OrbitingDot key={i} index={i} colors={colors} />
      ))}
    </View>
  );
}

function OrbitingDot({ index, colors }: { index: number; colors: any }) {
  const rotation = useSharedValue(0);
  
  React.useEffect(() => {
    rotation.value = withDelay(
      index * 1000,
      withRepeat(
        withTiming(360, { duration: 6000, easing: Easing.linear }),
        -1,
        false
      )
    );
  }, [index]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const dotStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${-rotation.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.orbitRing,
        {
          width: 100 + index * 30,
          height: 100 + index * 30,
        },
        animatedStyle,
      ]}
    >
      <Animated.View
        style={[
          styles.orbitDot,
          {
            backgroundColor: index === 1 ? colors.accent : colors.textMuted,
            top: -4,
            left: '50%',
            marginLeft: -4,
          },
          dotStyle,
        ]}
      />
    </Animated.View>
  );
}

function ListenIllustration({ colors, isDark }: { colors: any; isDark: boolean }) {
  const wave1 = useSharedValue(0);
  const wave2 = useSharedValue(0);
  const wave3 = useSharedValue(0);

  React.useEffect(() => {
    wave1.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    wave2.value = withDelay(200, withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    ));
    wave3.value = withDelay(400, withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    ));
  }, []);

  const wave1Style = useAnimatedStyle(() => ({
    opacity: interpolate(wave1.value, [0, 1], [0.2, 0.6]),
    transform: [{ scale: interpolate(wave1.value, [0, 1], [1, 1.3]) }],
  }));

  const wave2Style = useAnimatedStyle(() => ({
    opacity: interpolate(wave2.value, [0, 1], [0.2, 0.5]),
    transform: [{ scale: interpolate(wave2.value, [0, 1], [1, 1.2]) }],
  }));

  const wave3Style = useAnimatedStyle(() => ({
    opacity: interpolate(wave3.value, [0, 1], [0.2, 0.4]),
    transform: [{ scale: interpolate(wave3.value, [0, 1], [1, 1.1]) }],
  }));

  return (
    <View style={styles.illustrationContainer}>
      <Animated.View
        style={[
          styles.waveRing,
          { borderColor: colors.accent },
          wave3Style,
        ]}
      />
      <Animated.View
        style={[
          styles.waveRing,
          { borderColor: colors.accent },
          wave2Style,
        ]}
      />
      <Animated.View
        style={[
          styles.waveRing,
          { borderColor: colors.accent },
          wave1Style,
        ]}
      />
      <View style={[styles.illustrationCenter, { backgroundColor: colors.inputBackground }]}>
        <Sparkles size={40} color={colors.accent} strokeWidth={1.5} />
      </View>
    </View>
  );
}

function ReceiveIllustration({ colors }: { colors: any }) {
  const progress = useSharedValue(0);

  React.useEffect(() => {
    progress.value = withDelay(
      500,
      withRepeat(
        withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    );
  }, []);

  const pageStyle = useAnimatedStyle(() => ({
    transform: [
      { rotateY: `${interpolate(progress.value, [0, 1], [0, -15])}deg` },
      { perspective: 1000 },
    ],
  }));

  return (
    <View style={styles.illustrationContainer}>
      {/* Book/pages */}
      <Animated.View style={[styles.bookContainer, pageStyle]}>
        <View style={[styles.bookPage, { backgroundColor: colors.inputBackground }]}>
          {/* Lines representing text */}
          {[0, 1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[
                styles.bookLine,
                {
                  backgroundColor: colors.textMuted,
                  width: 60 + Math.random() * 20,
                  marginTop: i === 0 ? 0 : 8,
                },
              ]}
            />
          ))}
        </View>
        <View style={[styles.bookSpine, { backgroundColor: colors.accent }]} />
      </Animated.View>
      
      {/* Floating accent */}
      <View style={[styles.illustrationCenter, { backgroundColor: colors.inputBackground, position: 'absolute' }]}>
        <BookOpen size={40} color={colors.accent} strokeWidth={1.5} />
      </View>
    </View>
  );
}

export default function HowItWorksScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [currentSlide, setCurrentSlide] = useState(0);
  const translateX = useSharedValue(0);

  const slides: Slide[] = [
    {
      id: 0,
      title: 'Share where you are',
      subtitle: 'Your story, your struggles, your season.\nThe more you share, the more personal it becomes.',
      icon: <User size={24} color={colors.accent} />,
      illustration: <ShareIllustration colors={colors} isDark={isDark} />,
    },
    {
      id: 1,
      title: 'We listen deeply',
      subtitle: 'Ancient wisdom meets modern AI.\nEvery devotional is crafted uniquely for you.',
      icon: <Sparkles size={24} color={colors.accent} />,
      illustration: <ListenIllustration colors={colors} isDark={isDark} />,
    },
    {
      id: 2,
      title: 'Receive daily bread',
      subtitle: 'A fresh devotional every day,\nwritten for exactly where you are.',
      icon: <BookOpen size={24} color={colors.accent} />,
      illustration: <ReceiveIllustration colors={colors} />,
    },
  ];

  const goToNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (currentSlide < slides.length - 1) {
      translateX.value = withTiming(-(currentSlide + 1) * SCREEN_WIDTH, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      }, () => {
        runOnJS(setCurrentSlide)(currentSlide + 1);
      });
    } else {
      // Navigate to onboarding
      router.replace('/onboarding');
    }
  }, [currentSlide, slides.length, router, translateX]);

  const goToPrevious = useCallback(() => {
    if (currentSlide > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      translateX.value = withTiming(-(currentSlide - 1) * SCREEN_WIDTH, {
        duration: 400,
        easing: Easing.out(Easing.cubic),
      }, () => {
        runOnJS(setCurrentSlide)(currentSlide - 1);
      });
    }
  }, [currentSlide, translateX]);

  const onGestureEvent = useAnimatedGestureHandler({
    onStart: (_, ctx: any) => {
      ctx.startX = translateX.value;
    },
    onActive: (event, ctx) => {
      translateX.value = ctx.startX + event.translationX;
    },
    onEnd: (event) => {
      const threshold = SCREEN_WIDTH * 0.2;
      
      if (event.velocityX > 500 || event.translationX > threshold) {
        // Swipe right - go back
        if (currentSlide > 0) {
          translateX.value = withTiming(-(currentSlide - 1) * SCREEN_WIDTH, {
            duration: 300,
            easing: Easing.out(Easing.cubic),
          }, () => {
            runOnJS(setCurrentSlide)(currentSlide - 1);
          });
        } else {
          translateX.value = withTiming(0, { duration: 200 });
        }
      } else if (event.velocityX < -500 || event.translationX < -threshold) {
        // Swipe left - go forward
        if (currentSlide < slides.length - 1) {
          translateX.value = withTiming(-(currentSlide + 1) * SCREEN_WIDTH, {
            duration: 300,
            easing: Easing.out(Easing.cubic),
          }, () => {
            runOnJS(setCurrentSlide)(currentSlide + 1);
          });
        } else {
          // Last slide, navigate to onboarding
          translateX.value = withTiming(-currentSlide * SCREEN_WIDTH, { duration: 200 }, () => {
            runOnJS(router.replace)('/onboarding');
          });
        }
      } else {
        // Snap back
        translateX.value = withTiming(-currentSlide * SCREEN_WIDTH, { duration: 200 });
      }
    },
  });

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const canGoBack = currentSlide > 0;
  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} >
      <GoldEmberField density="low" active={true} />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={goToPrevious}
            disabled={!canGoBack}
            style={[styles.backButton, { opacity: canGoBack ? 1 : 0 }]}
          >
            <Text style={[styles.backText, { color: colors.textMuted }]}>Back</Text>
          </Pressable>

          <Pressable onPress={() => router.replace('/onboarding')}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
          </Pressable>
        </View>

        {/* Carousel */}
        <PanGestureHandler onGestureEvent={onGestureEvent}>
          <Animated.View style={[styles.carousel, containerStyle]}>
            {slides.map((slide) => (
              <View key={slide.id} style={styles.slide}>
                <View style={styles.illustrationWrapper}>
                  {slide.illustration}
                </View>

                <View style={styles.textContainer}>
                  <Text style={[styles.title, { color: colors.text }]}>
                    {slide.title}
                  </Text>
                  <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                    {slide.subtitle}
                  </Text>
                </View>
              </View>
            ))}
          </Animated.View>
        </PanGestureHandler>

        {/* Bottom controls */}
        <View style={styles.bottom}>
          {/* Progress dots */}
          <View style={styles.dots}>
            {slides.map((slide, index) => (
              <View
                key={slide.id}
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
  backButton: {
    paddingVertical: 8,
  },
  backText: {
    fontFamily: FontFamily.ui,
    fontSize: 15,
  },
  skipText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: 15,
  },
  carousel: {
    flex: 1,
    flexDirection: 'row',
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: 40,
    justifyContent: 'center',
  },
  illustrationWrapper: {
    height: 220,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 48,
  },
  illustrationContainer: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  illustrationCenter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  illustrationGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  orbitRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(200, 165, 92, 0.2)',
    borderRadius: 999,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  orbitDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  waveRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
  },
  bookContainer: {
    position: 'absolute',
    width: 100,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookPage: {
    width: 80,
    height: 100,
    borderRadius: 4,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bookSpine: {
    position: 'absolute',
    left: '50%',
    width: 3,
    height: 100,
    marginLeft: -1.5,
    borderRadius: 1.5,
  },
  bookLine: {
    height: 3,
    borderRadius: 1.5,
  },
  textContainer: {
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
