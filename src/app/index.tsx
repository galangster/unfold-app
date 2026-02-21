import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useEffect, useCallback } from 'react';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { useUnfoldStore } from '@/lib/store';

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useUnfoldStore((s) => s.user);

  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(20);
  const subtitleOpacity = useSharedValue(0);
  const screenOpacity = useSharedValue(1);

  const navigate = useCallback(() => {
    if (user?.hasCompletedOnboarding) {
      router.replace('/(main)/home');
    } else {
      router.replace('/how-it-works');
    }
  }, [user, router]);

  useEffect(() => {
    // Skip for returning users
    if (user?.hasCompletedOnboarding) {
      router.replace('/(main)/home');
      return;
    }

    // Title fade in
    titleOpacity.value = withDelay(
      400,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })
    );
    titleTranslateY.value = withDelay(
      400,
      withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) })
    );

    // Subtitle fade in
    subtitleOpacity.value = withDelay(
      900,
      withTiming(1, { duration: 600 })
    );

    // Auto navigate after showing
    const timer = setTimeout(() => {
      screenOpacity.value = withTiming(0, { duration: 500 }, () => {
        runOnJS(navigate)();
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, [user]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const screenStyle = useAnimatedStyle(() => ({
    opacity: screenOpacity.value,
  }));

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: colors.background }, screenStyle]}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
        <Animated.Text
          style={[
            {
              fontFamily: FontFamily.display,
              fontSize: 56,
              color: colors.text,
              letterSpacing: -1.5,
              marginBottom: 20,
            },
            titleStyle,
          ]}
        >
          Unfold
        </Animated.Text>

        <Animated.Text
          style={[
            {
              fontFamily: FontFamily.bodyItalic,
              fontSize: 16,
              color: colors.textMuted,
              textAlign: 'center',
              lineHeight: 24,
            },
            subtitleStyle,
          ]}
        >
          The world's most personal{'\n'}Bible studies
        </Animated.Text>
      </View>
    </Animated.View>
  );
}
