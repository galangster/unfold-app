import { useEffect, useRef } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Ember particle component
function EmberParticle({
  delay,
  startX,
  size,
  duration,
}: {
  delay: number;
  startX: number;
  size: number;
  duration: number;
}) {
  const translateY = useSharedValue(SCREEN_HEIGHT + 50);
  const translateX = useSharedValue(startX);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withTiming(-100, { duration, easing: Easing.linear }),
        -1,
        false
      )
    );

    translateX.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(startX - 30, { duration: duration * 0.3, easing: Easing.sin }),
          withTiming(startX + 30, { duration: duration * 0.4, easing: Easing.sin }),
          withTiming(startX, { duration: duration * 0.3, easing: Easing.sin })
        ),
        -1,
        true
      )
    );

    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(0.8, { duration: duration * 0.1 }),
          withTiming(0.6, { duration: duration * 0.7 }),
          withTiming(0, { duration: duration * 0.2 })
        ),
        -1,
        false
      )
    );

    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.3, { duration: 0 }),
          withTiming(1, { duration: duration * 0.15 }),
          withTiming(0.8, { duration: duration * 0.6 }),
          withTiming(0.2, { duration: duration * 0.25 })
        ),
        -1,
        false
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#C8A55C',
          shadowColor: '#C8A55C',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: size,
        },
        animatedStyle,
      ]}
    />
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(30);
  const subtitleOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(0.9);

  useEffect(() => {
    // Staggered entrance animations
    titleOpacity.value = withDelay(300, withTiming(1, { duration: 800 }));
    titleTranslateY.value = withDelay(300, withTiming(0, { duration: 800 }));
    subtitleOpacity.value = withDelay(600, withTiming(1, { duration: 800 }));
    buttonOpacity.value = withDelay(900, withTiming(1, { duration: 600 }));
    buttonScale.value = withDelay(900, withTiming(1, { duration: 600 }));
  }, []);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ scale: buttonScale.value }],
  }));

  const handleGetStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(onboarding)/preferences');
  };

  // Generate ember particles
  const particles = Array.from({ length: 25 }, (_, i) => ({
    id: i,
    delay: Math.random() * 5000,
    startX: Math.random() * SCREEN_WIDTH,
    size: 2 + Math.random() * 4,
    duration: 8000 + Math.random() * 7000,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Ember Particles Background */}
      <View style={{ position: 'absolute', width: '100%', height: '100%' }}>
        {particles.map((particle) => (
          <EmberParticle key={particle.id} {...particle} />
        ))}
      </View>

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 }}>
          {/* App Name */}
          <Animated.View style={[{ alignItems: 'center', marginBottom: 24 }, titleStyle]}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 20,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 32,
                shadowColor: colors.accent,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.3,
                shadowRadius: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 36,
                  color: isDark ? '#000' : '#fff',
                }}
              >
                U
              </Text>
            </View>

            <Text
              style={{
                fontFamily: FontFamily.display,
                fontSize: 42,
                color: colors.text,
                letterSpacing: -1,
                marginBottom: 16,
              }}
            >
              Unfold
            </Text>

            <View
              style={{
                width: 40,
                height: 2,
                backgroundColor: colors.accent,
                borderRadius: 1,
                opacity: 0.6,
              }}
            />
          </Animated.View>

          {/* Tagline */}
          <Animated.View style={[{ alignItems: 'center', marginBottom: 48 }, subtitleStyle]}>
            <Text
              style={{
                fontFamily: FontFamily.bodyItalic,
                fontSize: 20,
                color: colors.textMuted,
                textAlign: 'center',
                lineHeight: 30,
              }}
            >
              Personalized daily devotionals{'\n'}crafted for your spiritual journey
            </Text>
          </Animated.View>

          {/* CTA Button */}
          <Animated.View style={buttonStyle}>
            <Pressable
              onPress={handleGetStarted}
              style={({ pressed }) => ({
                backgroundColor: colors.accent,
                paddingVertical: 18,
                paddingHorizontal: 48,
                borderRadius: 16,
                opacity: pressed ? 0.9 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
                shadowColor: colors.accent,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.3,
                shadowRadius: 12,
              })}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiSemiBold,
                  fontSize: 17,
                  color: isDark ? '#000' : '#fff',
                  letterSpacing: 0.3,
                }}
              >
                Get Started
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.push('/(main)/home')}
              style={{ marginTop: 20, padding: 8 }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 14,
                  color: colors.textMuted,
                }}
              >
                I already have an account
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}
