import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { Analytics, AnalyticsEvents } from '@/lib/analytics';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideUpAnim = useRef(new Animated.Value(40)).current;
  const buttonScale1 = useRef(new Animated.Value(0.9)).current;
  const buttonScale2 = useRef(new Animated.Value(0.9)).current;
  const brandIconScale = useRef(new Animated.Value(0)).current;
  const brandIconRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animations - staggered for drama
    Animated.sequence([
      // First the icon pops in with rotation
      Animated.spring(brandIconScale, {
        toValue: 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.timing(brandIconRotate, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      // Then content fades in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(slideUpAnim, {
          toValue: 0,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
      ]),
      // Then buttons spring in
      Animated.spring(buttonScale1, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(buttonScale2, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Track screen view
    Analytics.logEvent(AnalyticsEvents.ONBOARDING_STARTED, { screen: 'welcome' });
  }, []);

  // Icon rotation interpolation
  const iconRotation = brandIconRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['-180deg', '0deg'],
  });

  const handleQuickStart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Analytics.logEvent(AnalyticsEvents.ONBOARDING_STARTED, { mode: 'quick' });
    router.push({
      pathname: '/style-onboarding',
      params: { mode: 'quick' },
    });
  };

  const handlePersonalize = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Analytics.logEvent(AnalyticsEvents.ONBOARDING_STARTED, { mode: 'full' });
    router.push({
      pathname: '/style-onboarding',
      params: { mode: 'full' },
    });
  };

  const handleSignIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Analytics.logEvent('welcome_sign_in_selected');
    router.push('/sign-in');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <LinearGradient
        colors={isDark ? [colors.background, '#161412', colors.background] : [colors.background, '#f5f3f0', colors.background]}
        style={styles.gradient}
      >
        <SafeAreaView style={styles.safeArea}>
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideUpAnim }],
              },
            ]}
          >
            {/* Logo/Brand */}
            <View style={styles.brandContainer}>
              <Animated.Text 
                style={[
                  styles.brandIcon, 
                  { 
                    color: colors.accent,
                    transform: [
                      { scale: brandIconScale },
                      { rotate: iconRotation },
                    ],
                  }
                ]}
              >
                ✦
              </Animated.Text>
              <Text style={[styles.brandName, { color: colors.text, fontFamily: FontFamily.display }]}>
                Unfold
              </Text>
              <Text style={[styles.tagline, { color: colors.textSubtle, fontFamily: FontFamily.body }]}>
                Daily devotionals that meet you where you are
              </Text>
            </View>

            {/* Main Options */}
            <View style={styles.optionsContainer}>
              {/* Quick Start - Primary */}
              <Animated.View
                style={[
                  styles.buttonWrapper,
                  { transform: [{ scale: buttonScale1 }] },
                ]}
              >
                <TouchableOpacity
                  style={styles.quickStartButton}
                  onPress={handleQuickStart}
                  activeOpacity={0.85}
                  onPressIn={() => {
                    Animated.spring(buttonScale1, {
                      toValue: 0.96,
                      friction: 8,
                      tension: 400,
                      useNativeDriver: true,
                    }).start();
                  }}
                  onPressOut={() => {
                    Animated.spring(buttonScale1, {
                      toValue: 1,
                      friction: 8,
                      tension: 400,
                      useNativeDriver: true,
                    }).start();
                  }}
                >
                  <LinearGradient
                    colors={['#C8A55C', '#B8944F']}
                    style={styles.quickStartGradient}
                  >
                    <Text style={[styles.quickStartTitle, { fontFamily: FontFamily.uiSemiBold }]}>
                      Quick Start
                    </Text>
                    <Text style={[styles.quickStartSubtitle, { fontFamily: FontFamily.body }]}>
                      Begin in 30 seconds
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>

              {/* Personalize - Secondary */}
              <Animated.View
                style={[
                  styles.buttonWrapper,
                  { transform: [{ scale: buttonScale2 }] },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.personalizeButton,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.02)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                    },
                  ]}
                  onPress={handlePersonalize}
                  activeOpacity={0.85}
                  onPressIn={() => {
                    Animated.spring(buttonScale2, {
                      toValue: 0.96,
                      friction: 8,
                      tension: 400,
                      useNativeDriver: true,
                    }).start();
                  }}
                  onPressOut={() => {
                    Animated.spring(buttonScale2, {
                      toValue: 1,
                      friction: 8,
                      tension: 400,
                      useNativeDriver: true,
                    }).start();
                  }}
                >
                  <Text style={[styles.personalizeTitle, { color: colors.text, fontFamily: FontFamily.uiSemiBold }]}>
                    Personalize
                  </Text>
                  <Text style={[styles.personalizeSubtitle, { color: colors.textSubtle, fontFamily: FontFamily.body }]}>
                    2 minutes for a tailored experience
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </View>

            {/* Sign In Link */}
            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: colors.textMuted, fontFamily: FontFamily.body }]}>
                Already have an account?
              </Text>
              <TouchableOpacity onPress={handleSignIn}>
                <Text style={[styles.signInText, { color: colors.accent, fontFamily: FontFamily.uiSemiBold }]}>
                  Sign In
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    paddingVertical: 60,
  },
  brandContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  brandIcon: {
    fontSize: 56,
    marginBottom: 20,
    textShadowColor: 'rgba(200, 165, 92, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  brandName: {
    fontSize: 48,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 26,
    maxWidth: 280,
    opacity: 0.85,
  },
  optionsContainer: {
    gap: 14,
  },
  buttonWrapper: {
    width: '100%',
  },
  quickStartButton: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#C8A55C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  quickStartGradient: {
    paddingVertical: 22,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  quickStartTitle: {
    fontSize: 18,
    color: '#1a1a2e',
    marginBottom: 5,
    letterSpacing: 0.3,
  },
  quickStartSubtitle: {
    fontSize: 13,
    color: 'rgba(26, 26, 46, 0.65)',
  },
  personalizeButton: {
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 32,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  personalizeTitle: {
    fontSize: 18,
    marginBottom: 5,
    letterSpacing: 0.3,
  },
  personalizeSubtitle: {
    fontSize: 13,
    opacity: 0.8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    fontSize: 14,
    opacity: 0.7,
  },
  signInText: {
    fontSize: 14,
  },
});
