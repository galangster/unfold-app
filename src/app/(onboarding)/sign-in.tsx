import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, AppState } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  Easing,
  interpolate,
  FadeIn,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useOAuth } from '@clerk/clerk-expo';
import { AppleLogoIcon, GoogleLogoIcon, FacebookLogoIcon, CloudIcon, ShieldIcon, SparkleIcon } from 'phosphor-react-native';
import { useTheme } from '@/lib/theme';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { useUnfoldStore } from '@/lib/store';
import { logger } from '@/lib/logger';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';
import { alpha } from '@/components/ui';

WebBrowser.maybeCompleteAuthSession();

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Feature benefit item component
interface BenefitItemProps {
  icon: React.ReactNode;
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
        {icon}
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
  const { source } = useLocalSearchParams<{ source?: string }>();
  const { colors: themeColors } = useTheme();
  const colors = {
    ...themeColors,
    background: '#0A0A0A',
    inputBackground: '#111214',
    border: '#24262B',
    text: '#F5F5F7',
    textMuted: '#A0A6B1',
    textSubtle: '#8C93A0',
    textHint: '#6F7785',
    accent: themeColors.accent,
    error: '#EF4444',
  };
  const updateUser = useUnfoldStore((s) => s.updateUser);
  const userProfile = useUnfoldStore((s) => s.user);

  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSigningInRef = useRef(false);

  // Reset stuck signing-in state when app returns to foreground
  // (handles case where OAuth sheet X button doesn't resolve the promise)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isSigningInRef.current) {
        setTimeout(() => {
          if (isSigningInRef.current) {
            isSigningInRef.current = false;
            setIsSigningIn(false);
          }
        }, 1000);
      }
    });
    return () => sub.remove();
  }, []);

  // Clerk OAuth hooks
  const { startOAuthFlow: startAppleFlow } = useOAuth({ strategy: 'oauth_apple' });
  const { startOAuthFlow: startGoogleFlow } = useOAuth({ strategy: 'oauth_google' });
  const { startOAuthFlow: startFacebookFlow } = useOAuth({ strategy: 'oauth_facebook' });

  // Animation values
  const headerOpacity = useSharedValue(0);
  const headerTranslateY = useSharedValue(20);
  const buttonOpacity = useSharedValue(0);
  const buttonScale = useSharedValue(0.95);
  const skipOpacity = useSharedValue(0);
  const loadingRotation = useSharedValue(0);

  useEffect(() => {
    // Track sign-in prompt shown
    Analytics.logEvent(AnalyticsEvents.SIGN_IN_PROMPT_SHOWN);

    // Staggered entrance animations
    headerOpacity.value = withDelay(200, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
    headerTranslateY.value = withDelay(200, withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) }));

    buttonOpacity.value = withDelay(400, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    buttonScale.value = withDelay(400, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));

    skipOpacity.value = withDelay(600, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
  }, []);

  // Loading spinner animation
  useEffect(() => {
    if (isSigningIn) {
      loadingRotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      loadingRotation.value = 0;
    }
  }, [isSigningIn]);

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

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${loadingRotation.value}deg` }],
  }));

  const navigateAfterAuth = useCallback(() => {
    // Always dismiss the modal first — router.replace() from inside a
    // fullScreenModal doesn't dismiss the modal, leaving it stuck on screen.
    if (source === 'onboarding') {
      router.back();
    } else if (source === 'settings') {
      // Return to settings — useAuth hook will pick up the new auth state
      router.dismiss();
    } else {
      router.dismiss();
      // Small delay to let the modal animation complete before replacing
      setTimeout(() => router.replace('/(tabs)/(today)'), 150);
    }
  }, [source, router]);

  const handleOAuthSignIn = useCallback(
    async (
      startFlow: typeof startAppleFlow,
      providerName: string,
    ) => {
      if (isSigningIn) return;
      setIsSigningIn(true);
      isSigningInRef.current = true;
      setError(null);

      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Analytics.logEvent(AnalyticsEvents.SIGN_IN_APPLE_TAPPED);

        // Warm up the browser to prevent hangs
        await WebBrowser.warmUpAsync().catch(() => {});

        // Race the OAuth flow against a timeout to prevent app freeze
        const OAUTH_TIMEOUT = 60_000;
        const flowPromise = startFlow({
          redirectUrl: 'unfold://oauth-callback',
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('oauth_timeout')), OAUTH_TIMEOUT),
        );

        const { createdSessionId, setActive } = await Promise.race([
          flowPromise,
          timeoutPromise,
        ]);

        if (createdSessionId && setActive) {
          logger.log(`[SignIn] ${providerName} OAuth succeeded, activating session`);
          await setActive({ session: createdSessionId });

          Analytics.logEvent(AnalyticsEvents.SIGN_IN_SUCCESS, {
            auth_provider: providerName.toLowerCase(),
          });

          // useAuth hook will sync to Zustand + RevenueCat automatically
          updateUser({ hasSeenSignInPrompt: true });

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          navigateAfterAuth();
        } else {
          // OAuth resolved but without a session — user may have cancelled
          // at the consent screen or Clerk couldn't create a session
          logger.warn(`[SignIn] ${providerName} OAuth resolved without session (createdSessionId=${createdSessionId})`);
        }
      } catch (err: any) {
        logger.error(`[SignIn] ${providerName} OAuth error:`, err);

        if (err?.errors?.[0]?.code === 'session_exists') {
          navigateAfterAuth();
          return;
        }

        // User cancelled — silent
        if (
          err?.errors?.[0]?.code === 'user_cancelled' ||
          err?.message?.includes('cancelled') ||
          err?.message?.includes('canceled')
        ) {
          setIsSigningIn(false);
          return;
        }

        if (err?.message === 'oauth_timeout') {
          setError('Sign-in took too long. Please try again.');
          WebBrowser.coolDownAsync().catch(() => {});
          setIsSigningIn(false);
          isSigningInRef.current = false;
          return;
        }

        Analytics.logEvent(AnalyticsEvents.SIGN_IN_ERROR, {
          auth_provider: providerName.toLowerCase(),
          error_type: err?.errors?.[0]?.code || 'unknown',
        });

        setError(
          err?.errors?.[0]?.longMessage ??
            "We couldn't reach our servers. Please check your connection.",
        );
      } finally {
        setIsSigningIn(false);
        isSigningInRef.current = false;
      }
    },
    [isSigningIn, navigateAfterAuth, updateUser],
  );

  const benefits: Omit<BenefitItemProps, 'colors' | 'delay'>[] = [
    {
      icon: <CloudIcon size={20} color={colors.accent} weight="light" />,
      title: 'Sync across devices',
      description: 'Access your devotionals on any iPhone or iPad',
    },
    {
      icon: <ShieldIcon size={20} color={colors.accent} weight="light" />,
      title: 'Secure backup',
      description: 'Never lose your progress or journal entries',
    },
    {
      icon: <SparkleIcon size={20} color={colors.accent} weight="light" />,
      title: 'Seamless experience',
      description: 'Pick up exactly where you left off',
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {/* Close button */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.dismiss();
          }}
          activeOpacity={0.7}
          style={{ position: 'absolute', top: Spacing['2'], right: Spacing['4'], zIndex: 10, padding: Spacing['2'] }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ fontFamily: FontFamily.ui, fontSize: 15, color: colors.textMuted }}>Close</Text>
        </TouchableOpacity>

        {/* Top spacer — pushes header to ~30% from top */}
        <View style={{ flex: 0.35 }} />

        {/* Header Section */}
        <Animated.View style={[styles.header, headerStyle]}>
          <Text style={[styles.title, { color: colors.text, fontFamily: FontFamily.display }]}>
            Sync across all your devices
          </Text>

          <Text style={[styles.subtitle, { color: colors.textMuted, fontFamily: FontFamily.body }]}>
            Sign in to save your devotionals, journal, and reading streak.
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
        {error && (
          <Animated.View
            entering={FadeIn.duration(Duration.slow)}
            style={{
              backgroundColor: colors.error,
              borderRadius: Radius.md,
              padding: Spacing['4'],
              marginBottom: Spacing['4'],
            }}
          >
            <Text
              style={{
                color: '#FFFFFF',
                fontFamily: FontFamily.ui,
                fontSize: FontSize.sm,
                textAlign: 'center',
                lineHeight: 20,
              }}
            >
              {error}
            </Text>
          </Animated.View>
        )}

        {/* OAuth Buttons */}
        <Animated.View style={[styles.buttonSection, buttonStyle]}>
          <View style={styles.authButtons}>
            <TouchableOpacity
              style={[styles.oauthButton, styles.appleButton]}
              onPress={() => handleOAuthSignIn(startAppleFlow, 'Apple')}
              activeOpacity={0.8}
              disabled={isSigningIn}
            >
              <AppleLogoIcon size={24} color="#1F1F1F" weight="fill" />
              <Text style={[styles.oauthButtonText, { color: '#1F1F1F' }]}>
                Sign in with Apple
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.oauthButton, styles.googleButton]}
              onPress={() => handleOAuthSignIn(startGoogleFlow, 'Google')}
              activeOpacity={0.8}
              disabled={isSigningIn}
            >
              <GoogleLogoIcon size={20} color="#1F1F1F" weight="bold" />
              <Text style={[styles.oauthButtonText, { color: '#1F1F1F' }]}>
                Sign in with Google
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.oauthButton, styles.facebookButton]}
              onPress={() => handleOAuthSignIn(startFacebookFlow, 'Facebook')}
              activeOpacity={0.8}
              disabled={isSigningIn}
            >
              <FacebookLogoIcon size={20} color="#FFFFFF" weight="fill" />
              <Text style={[styles.oauthButtonText, { color: '#FFFFFF' }]}>
                Sign in with Facebook
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sign-in is required */}
        </Animated.View>

        {/* Privacy Note */}
        <Animated.View style={[styles.privacyContainer, skipStyle]}>
          <Text style={[styles.privacyText, { color: colors.textHint, fontFamily: FontFamily.ui }]}>
            Your privacy matters. We never share your information.
          </Text>
        </Animated.View>
      </View>

      {/* Loading Overlay */}
      {isSigningIn && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: alpha(colors.background, 0.90),
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
                  borderRadius: Radius['2xl'],
                  borderWidth: 3,
                  borderColor: alpha(colors.accent, 0.19),
                  borderTopColor: colors.accent,
                },
                spinnerStyle,
              ]}
            />
            <Text
              style={{
                marginTop: Spacing['4'],
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
  content: {
    flex: 1,
    paddingHorizontal: Spacing['7'],
    paddingBottom: Spacing['4'],
  },
  header: {
    alignItems: 'flex-start',
    marginBottom: Spacing['10'],
  },
  title: {
    fontSize: FontSize['4xl'],
    textAlign: 'left',
    letterSpacing: -0.5,
    lineHeight: 44,
    marginBottom: Spacing['4'],
  },
  subtitle: {
    fontSize: FontSize.base,
    textAlign: 'left',
    lineHeight: 24,
  },
  benefitsContainer: {
    gap: Spacing['5'],
    paddingHorizontal: Spacing['2'],
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['4'],
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 4,
    marginTop: 'auto' as any,
    marginBottom: Spacing['2'],
  },
  authButtons: {
    gap: 14,
    width: '100%',
  },
  oauthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    paddingHorizontal: Spacing['4'],
    borderRadius: Radius.md,
    gap: 10,
    overflow: 'visible',
  },
  appleButton: {
    backgroundColor: '#FFFFFF',
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
  },
  facebookButton: {
    backgroundColor: '#1877F2',
  },
  oauthButtonText: {
    fontFamily: FontFamily.uiSemiBold,
    fontSize: FontSize.base,
  },
  privacyContainer: {
    alignItems: 'center',
  },
  privacyText: {
    fontSize: FontSize.xs,
    textAlign: 'center',
  },
});
