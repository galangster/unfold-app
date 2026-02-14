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
  const slideUpAnim = useRef(new Animated.Value(30)).current;
  const buttonScale1 = useRef(new Animated.Value(0.9)).current;
  const buttonScale2 = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    // Entrance animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideUpAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();

    // Button animations with delay
    Animated.sequence([
      Animated.delay(400),
      Animated.spring(buttonScale1, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(550),
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
        colors={isDark ? [colors.background, '#1a1a1e', colors.background] : [colors.background, '#f8f6f3', colors.background]}
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
              <Text style={[styles.brandIcon, { color: colors.accent }]}>✦</Text>
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
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={['#C8A55C', '#B8944F']}
                    style={styles.quickStartGradient}
                  >
                    <Text style={[styles.quickStartTitle, { fontFamily: FontFamily.semibold }]}>
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
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.03)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
                    },
                  ]}
                  onPress={handlePersonalize}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.personalizeTitle, { color: colors.text, fontFamily: FontFamily.semibold }]}>
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
                <Text style={[styles.signInText, { color: colors.accent, fontFamily: FontFamily.semibold }]}>
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
    paddingHorizontal: 32,
    justifyContent: 'space-between',
    paddingVertical: 60,
  },
  brandContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  brandIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  brandName: {
    fontSize: 42,
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 24,
    maxWidth: 280,
  },
  optionsContainer: {
    gap: 16,
  },
  buttonWrapper: {
    width: '100%',
  },
  quickStartButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#C8A55C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  quickStartGradient: {
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  quickStartTitle: {
    fontSize: 18,
    color: '#1a1a2e',
    marginBottom: 4,
  },
  quickStartSubtitle: {
    fontSize: 13,
    color: 'rgba(26, 26, 46, 0.7)',
  },
  personalizeButton: {
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    borderWidth: 1,
  },
  personalizeTitle: {
    fontSize: 18,
    marginBottom: 4,
  },
  personalizeSubtitle: {
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    fontSize: 14,
  },
  signInText: {
    fontSize: 14,
  },
});
