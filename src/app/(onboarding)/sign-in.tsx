import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { signInWithApple, signInAnonymously } from '@/lib/appleAuth';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Feature benefit item component
interface BenefitItemProps {
  icon: string;
  title: string;
  description: string;
  delay: number;
  colors: ReturnType<typeof useTheme>['colors'];
}

function BenefitItem({ icon, title, description, delay, colors }: BenefitItemProps) {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(-20);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
    translateX.value = withDelay(delay, withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View style={[styles.benefitItem, animatedStyle]}>
      <View style={[styles.benefitIcon, { backgroundColor: colors.inputBackground }]}>
        <Text style={[styles.benefitIconText, { color: colors.accent }]}>{icon}</Text>
      </View>
      <View style={styles.benefitTextContainer}>
        <Text style={[styles.benefitTitle, { color: colors.text, fontFamily: FontFamily.uiSemiBold }]}>
          {title}
        </Text>
        <Text style={[styles.benefitDescription, { color: colors.textMuted, fontFamily: FontFamily.ui }]}>
          {description}
        </Text>
      </View>
    </Animated.View>
  );
}

export default function SignInScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const userProfile = useUnfoldStore((s) => s.user);

  const [isLoading, setIsLoading] = useState(false);
  const [isAppleAvailable, setIsAppleAvailable] = useState(true);

  // Animation values
  const headerOpacity = useSharedValue(0);
  const headerTranslateY = useSharedValue(20);
  const buttonOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(0.95);
  const skipOpacity = useSharedValue(0);
  const sparkleOpacity = useSharedValue(0);
  const sparkleScale = useSharedValue(0.5);

  useEffect(() => {
    // Check if Apple Sign In is available
    AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable);

    // Staggered entrance animations
    headerOpacity.value = withDelay(200, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    headerTranslateY.value = withDelay(200, withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) }));

    buttonOpacity.value = withDelay(600, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    buttonScale.value = withDelay(600, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));

    skipOpacity.value = withDelay(800, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));

    // Sparkle animation (subtle pulse)
    sparkleOpacity.value = withDelay(400, withTiming(1, { duration: 500 }));
    sparkleScale.value = withDelay(400, withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.5)) }));
  }, []);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
    transform: [{ translateY: headerTranslateY.value }],
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ scale: buttonScale.value }],
  }));

  const skipStyle = useAnimatedStyle(() => ({
    opacity: skipOpacity.value,
  }));

  const sparkleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sparkleOpacity.value, [0, 1], [0.6, 1]),
    transform: [{ scale: sparkleScale.value }],
  }));

  const handleAppleSignIn = useCallback(async () => {
    if (isLoading) return;

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const result = await signInWithApple();

      if (result.success && result.user) {
        // Update store with auth info
        updateUser({
          authUserId: result.user.uid,
          authProvider: 'apple',
          authEmail: result.user.email,
          authDisplayName: result.user.displayName,
          hasSeenSignInPrompt: true,
        });

        logger.log('[SignIn] Successfully signed in with Apple', {
          userId: result.user.uid,
        });

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Navigate to home
        router.replace('/(main)/home');
      } else if (result.isCancelled) {
        logger.log('[SignIn] User cancelled Apple Sign In');
        // Stay on screen, user can try again or skip
      } else {
        logger.error('[SignIn] Apple Sign In failed', { error: result.error });
        // Stay on screen, show error handled by the button
      }
    } catch (error) {
      logger.error('[SignIn] Unexpected error during Apple Sign In', { error });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, router, updateUser]);

  const handleContinueAnonymous = useCallback(async () => {
    if (isLoading) return;

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      // Create anonymous user if needed
      const result = await signInAnonymously();

      if (result.success && result.user) {
        const currentCount = userProfile?.signInPromptCount ?? 0;

        updateUser({
          authUserId: result.user.uid,
          authProvider: 'anonymous',
          hasSeenSignInPrompt: true,
          signInPromptCount: currentCount + 1,
        });

        logger.log('[SignIn] Continued anonymously', {
          userId: result.user.uid,
          promptCount: currentCount + 1,
        });
      }

      // Navigate to home
      router.replace('/(main)/home');
    } catch (error) {
      logger.error('[SignIn] Error continuing anonymously', { error });
      // Navigate anyway - the auth hook will handle initialization
      router.replace('/(main)/home');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, router, updateUser, userProfile?.signInPromptCount]);

  const benefits: Omit<BenefitItemProps, 'colors' | 'delay'>[] = [
    {
      icon: '☁️',
      title: 'Sync across devices',
      description: 'Access your devotionals on any iPhone or iPad',
    },
    {
      icon: '🔒',
      title: 'Secure backup',
      description: 'Never lose your progress or journal entries',
    },
    {
      icon: '✨',
      title: 'Seamless experience',
      description: 'Pick up exactly where you left off',
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      {/* Background sparkle effect */}
      <Animated.View style={[styles.sparkleContainer, sparkleStyle]}>
        <View style={[styles.sparkle, { backgroundColor: colors.accent, opacity: 0.15 }]} />
      </Animated.View>

      <View style={styles.content}>
        {/* Header Section */}
        <Animated.View style={[styles.header, headerStyle]}>
          {/* Decorative line */}
          <View style={[styles.topLine, { backgroundColor: colors.accent }]} />

          <Text style={[styles.eyebrow, { color: colors.accent, fontFamily: FontFamily.uiSemiBold }]}>
            Your devotional is ready
          </Text>

          <Text style={[styles.title, { color: colors.text, fontFamily: FontFamily.display }]}>
            Want to keep it{'\n'}forever?
          </Text>

          <Text style={[styles.subtitle, { color: colors.textMuted, fontFamily: FontFamily.body }]}>
            Sign in to preserve your spiritual journey and access it from anywhere.
          </Text>
        </Animated.View>

        {/* Benefits Section */}
        <View style={styles.benefitsContainer}>
          {benefits.map((benefit, index) => (
            <BenefitItem
              key={benefit.title}
              {...benefit}
              delay={400 + index * 150}
              colors={colors}
            />
          ))}
        </View>

        {/* Button Section */}
        <View style={styles.buttonSection}>
          <Animated.View style={buttonStyle}>
            {isAppleAvailable ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            ) : (
              <Pressable
                onPress={handleAppleSignIn}
                disabled={isLoading}
                style={({ pressed }) => [
                  styles.fallbackButton,
                  {
                    backgroundColor: isDark ? '#fff' : '#000',
                    opacity: pressed || isLoading ? 0.8 : 1,
                  },
                ]}
              >
                <Text style={[styles.fallbackButtonText, { color: isDark ? '#000' : '#fff', fontFamily: FontFamily.uiSemiBold }]}>
                  {isLoading ? 'Signing in...' : 'Sign in with Apple'}
                </Text>
              </Pressable>
            )}
          </Animated.View>

          <Animated.View style={skipStyle}>
            <Pressable
              onPress={handleContinueAnonymous}
              disabled={isLoading}
              style={({ pressed }) => [
                styles.skipButton,
                { opacity: pressed || isLoading ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.skipText, { color: colors.textSubtle, fontFamily: FontFamily.ui }]}>
                Continue without signing in
              </Text>
            </Pressable>
          </Animated.View>
        </View>

        {/* Privacy Note */}
        <Animated.View style={[styles.privacyContainer, skipStyle]}>
          <Text style={[styles.privacyText, { color: colors.textHint, fontFamily: FontFamily.ui }]}>
            Your privacy matters. We never share your information.
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sparkleContainer: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  sparkle: {
    width: '100%',
    height: '100%',
    borderRadius: 150,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
  },
  topLine: {
    width: 40,
    height: 3,
    borderRadius: 2,
    marginBottom: 24,
    opacity: 0.8,
  },
  eyebrow: {
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  title: {
    fontSize: 36,
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 44,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  benefitsContainer: {
    gap: 20,
    paddingHorizontal: 8,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitIconText: {
    fontSize: 22,
  },
  benefitTextContainer: {
    flex: 1,
    gap: 2,
  },
  benefitTitle: {
    fontSize: 15,
    letterSpacing: -0.2,
  },
  benefitDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  buttonSection: {
    gap: 12,
  },
  appleButton: {
    width: SCREEN_WIDTH - 56,
    height: 54,
  },
  fallbackButton: {
    width: SCREEN_WIDTH - 56,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackButtonText: {
    fontSize: 16,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 15,
  },
  privacyContainer: {
    alignItems: 'center',
  },
  privacyText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
