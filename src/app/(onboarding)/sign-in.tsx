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
  FadeIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/lib/theme';
import { FontFamily } from '@/constants/fonts';
import { signInWithApple, signInAnonymously } from '@/lib/appleAuth';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Animation values
  const headerOpacity = useSharedValue(0);
  const headerTranslateY = useSharedValue(20);
  const buttonOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(0.95);
  const skipOpacity = useSharedValue(0);
  const sparkleOpacity = useSharedValue(0);
  const sparkleScale = useSharedValue(0.5);
  const loadingRotation = useSharedValue(0);

  useEffect(() => {
    // Check if Apple Sign In is available
    AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable);

    // Track sign-in prompt shown
    Analytics.logEvent(AnalyticsEvents.SIGN_IN_PROMPT_SHOWN);

    // Staggered entrance animations
    headerOpacity.value = withDelay(200, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    headerTranslateY.value = withDelay(200, withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) }));

    buttonOpacity.value = withDelay(400, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    buttonScale.value = withDelay(400, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));

    skipOpacity.value = withDelay(600, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));

    // Sparkle animation (subtle pulse)
    sparkleOpacity.value = withDelay(400, withTiming(1, { duration: 500 }));
    sparkleScale.value = withDelay(400, withTiming(1, { duration: 500, easing: Easing.out(Easing.back(1.5)) }));
  }, []);

  // Loading spinner animation
  useEffect(() => {
    if (isLoading) {
      loadingRotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      loadingRotation.value = 0;
    }
  }, [isLoading]);

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

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${loadingRotation.value}deg` }],
  }));

  const handleAppleSignIn = useCallback(async () => {
    if (isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Track Apple Sign In tapped
    Analytics.logEvent(AnalyticsEvents.SIGN_IN_APPLE_TAPPED);

    try {
      const result = await signInWithApple();

      if (result.success && result.user) {
        // Track successful sign in
        Analytics.logEvent(AnalyticsEvents.SIGN_IN_SUCCESS, {
          auth_provider: 'apple',
        });
        Analytics.setUserId(result.user.uid);
        Analytics.setUserProperty('auth_provider', 'apple');

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
        // Track error
        Analytics.logEvent(AnalyticsEvents.SIGN_IN_ERROR, {
          auth_provider: 'apple',
          error_type: result.error || 'unknown',
        });

        logger.error('[SignIn] Apple Sign In failed', { error: result.error });
        
        // Show user-friendly error message
        let friendlyError = 'Unable to sign in. Please try again.';
        if (result.error?.includes('network')) {
          friendlyError = 'Network error. Check your connection and try again.';
        } else if (result.error?.includes('credential') || result.error?.includes('already')) {
          friendlyError = 'This Apple account is already linked to another user.';
        } else if (result.error?.includes('unavailable')) {
          friendlyError = 'Apple Sign In is currently unavailable. Please try again later.';
        }
        setErrorMessage(friendlyError);
      }
    } catch (error) {
      logger.error('[SignIn] Unexpected error during Apple Sign In', { error });
      setErrorMessage('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, router, updateUser]);

  const handleContinueAnonymous = useCallback(async () => {
    if (isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Track skip tapped
    Analytics.logEvent(AnalyticsEvents.SIGN_IN_SKIPPED);

    try {
      // Create anonymous user if needed
      const result = await signInAnonymously();

      if (result.success && result.user) {
        // Track anonymous sign in
        Analytics.logEvent(AnalyticsEvents.SIGN_IN_SUCCESS, {
          auth_provider: 'anonymous',
        });
        Analytics.setUserId(result.user.uid);
        Analytics.setUserProperty('auth_provider', 'anonymous');

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

        // Navigate to home
        router.replace('/(main)/home');
      } else {
        // Track error
        Analytics.logEvent(AnalyticsEvents.SIGN_IN_ERROR, {
          auth_provider: 'anonymous',
          error_type: result.error || 'unknown',
        });

        // Show error for anonymous sign-in failure
        logger.error('[SignIn] Anonymous sign in failed', { error: result.error });
        setErrorMessage('Unable to continue. Please try again.');
      }
    } catch (error) {
      Analytics.logEvent(AnalyticsEvents.SIGN_IN_ERROR, {
        auth_provider: 'anonymous',
        error_type: 'exception',
      });

      logger.error('[SignIn] Error continuing anonymously', { error });
      setErrorMessage('Something went wrong. Please try again.');
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

        {/* Error Message */}
        {errorMessage && (
          <Animated.View
            entering={FadeIn.duration(300)}
            style={{
              backgroundColor: colors.error + '15',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                color: colors.error,
                fontFamily: FontFamily.ui,
                fontSize: 14,
                textAlign: 'center',
                lineHeight: 20,
              }}
            >
              {errorMessage}
            </Text>
          </Animated.View>
        )}

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

      {/* Loading Overlay */}
      {isLoading && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.background + 'E6',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <Animated.View
              style={[
                {
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  borderWidth: 3,
                  borderColor: colors.accent + '30',
                  borderTopColor: colors.accent,
                },
                spinnerStyle,
              ]}
            />
            <Text
              style={{
                marginTop: 16,
                fontFamily: FontFamily.uiMedium,
                fontSize: 15,
                color: colors.textSubtle,
              }}
            >
              Signing in...
            </Text>
          </View>
        </View>
      )}
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
