import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, AppState, AppStateStatus, AccessibilityInfo } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  Easing,
  FadeIn,
  FadeInUp,
  interpolate,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Bell } from 'lucide-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, DevotionalDay, Devotional } from '@/lib/store';
import {
  generateDevotional,
  createDevotionalFromGenerated,
  OnDayGeneratedCallback,
  extractScripturesFromDevotional,
  markFullGenerationActive,
  markFullGenerationInactive,
} from '@/lib/devotional-service';

import {
  requestNotificationPermissions,
  areNotificationsEnabled,
  sendDevotionalReadyNotification,
  sendDay1ReadyNotification,
} from '@/lib/notifications';
import { logBugEvent, logBugError } from '@/lib/bug-logger';

// Estimate time based on devotional length and reading duration
function getTimeEstimate(days: number, readingDuration: number): string {
  if (readingDuration === 30) {
    if (days <= 3) return 'about a minute';
    if (days <= 7) return '2-3 minutes';
    if (days <= 14) return '4-6 minutes';
    return '8-12 minutes';
  }
  if (readingDuration === 15) {
    if (days <= 3) return 'about a minute';
    if (days <= 7) return '1-2 minutes';
    if (days <= 14) return '3-4 minutes';
    return '5-7 minutes';
  }
  // 5-minute devotionals
  if (days <= 3) return 'about a minute';
  if (days <= 7) return '1-2 minutes';
  if (days <= 14) return '2-3 minutes';
  return '3-5 minutes';
}

function toFriendlyGenerationError(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();

  if (
    normalized.includes('unable to connect') ||
    normalized.includes('network') ||
    normalized.includes('internet') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out')
  ) {
    return "We couldn’t reach the writing service. Check connection and try again.";
  }

  if (normalized.includes('content filter')) {
    return 'We hit a temporary writing limit. Try again with the same answers.';
  }

  return 'We couldn’t finish creating this devotional right now. Please try again.';
}

// Number of ripple rings
const RIPPLE_COUNT = 3;
const RIPPLE_DURATION = 2400;

export default function GeneratingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useUnfoldStore((s) => s.user);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const addDevotional = useUnfoldStore((s) => s.addDevotional);
  const updateDevotionalDays = useUnfoldStore((s) => s.updateDevotionalDays);
  const addUsedScriptures = useUnfoldStore((s) => s.addUsedScriptures);
  const getRecentScriptures = useUnfoldStore((s) => s.getRecentScriptures);
  const generationSession = useUnfoldStore((s) => s.generationSession);
  const startGenerationSession = useUnfoldStore((s) => s.startGenerationSession);
  const updateGenerationSessionProgress = useUnfoldStore((s) => s.updateGenerationSessionProgress);
  const completeGenerationSession = useUnfoldStore((s) => s.completeGenerationSession);
  const failGenerationSession = useUnfoldStore((s) => s.failGenerationSession);
  const clearGenerationSession = useUnfoldStore((s) => s.clearGenerationSession);

  const [isComplete, setIsComplete] = useState(false);
  const [devotionalTitle, setDevotionalTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Announce to screen readers when generation is complete
  useEffect(() => {
    if (isComplete && devotionalTitle) {
      AccessibilityInfo.announceForAccessibility(`Your devotional "${devotionalTitle}" is ready. Begin reading.`);
    }
  }, [isComplete, devotionalTitle]);

  // Progressive loading state
  const [generatedDays, setGeneratedDays] = useState<DevotionalDay[]>([]);
  const [currentSeriesTitle, setCurrentSeriesTitle] = useState<string>('');
  const [canStartReading, setCanStartReading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(true);
  const partialDevotionalRef = useRef<Devotional | null>(null);
  const generationInFlightRef = useRef(false);
  const notificationPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Notification state
  const [notificationPermission, setNotificationPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [hasAskedPermission, setHasAskedPermission] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

  const devotionalLength = user?.devotionalLength ?? 7;
  const readingDuration = user?.readingDuration ?? 15;
  const timeEstimate = getTimeEstimate(devotionalLength, readingDuration);

  // Ripple animation values - staggered for continuous ripple effect
  const ripple1 = useSharedValue(0);
  const ripple2 = useSharedValue(0);
  const ripple3 = useSharedValue(0);

  // Check notification permission on mount — always show the prompt during generation
  useEffect(() => {
    const checkPermission = async () => {
      const enabled = await areNotificationsEnabled();
      setNotificationPermission(enabled ? 'granted' : 'denied');

      // Always show notification prompt after a short delay if not yet granted
      if (!enabled) {
        notificationPromptTimerRef.current = setTimeout(() => {
          setShowNotificationPrompt(true);
        }, 3000);
      }
    };
    checkPermission();

    return () => {
      if (notificationPromptTimerRef.current) {
        clearTimeout(notificationPromptTimerRef.current);
        notificationPromptTimerRef.current = null;
      }
    };
  }, []);

  // Handle app state changes (for background notification)
  const [wasInBackground, setWasInBackground] = useState(false);
  const [pendingNotification, setPendingNotification] = useState<{ title: string } | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        setWasInBackground(true);
      }
    });

    return () => subscription.remove();
  }, []);

  // Send notification if user left app and devotional completed
  useEffect(() => {
    if (pendingNotification && wasInBackground) {
      sendDevotionalReadyNotification(pendingNotification.title);
      setPendingNotification(null);
    }
  }, [pendingNotification, wasInBackground]);

  // Send Day 1 ready notification when first day becomes available
  // Always send this notification regardless of background state
  useEffect(() => {
    if (canStartReading && currentSeriesTitle) {
      console.log('[Generation] Day 1 is ready, sending notification...');
      sendDay1ReadyNotification(currentSeriesTitle);
    }
  }, [canStartReading, currentSeriesTitle]);

  // Ripple animations - staggered to create continuous water ripple effect
  useEffect(() => {
    // First ripple starts immediately
    ripple1.value = withRepeat(
      withTiming(1, { duration: RIPPLE_DURATION, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );

    // Second ripple starts after 1/3 of the duration
    ripple2.value = withDelay(
      RIPPLE_DURATION / 3,
      withRepeat(
        withTiming(1, { duration: RIPPLE_DURATION, easing: Easing.out(Easing.ease) }),
        -1,
        false
      )
    );

    // Third ripple starts after 2/3 of the duration
    ripple3.value = withDelay(
      (RIPPLE_DURATION / 3) * 2,
      withRepeat(
        withTiming(1, { duration: RIPPLE_DURATION, easing: Easing.out(Easing.ease) }),
        -1,
        false
      )
    );

    return () => {
      cancelAnimation(ripple1);
      cancelAnimation(ripple2);
      cancelAnimation(ripple3);
    };
  }, []);

  // Ripple animated styles
  const ripple1Style = useAnimatedStyle(() => ({
    opacity: interpolate(ripple1.value, [0, 0.3, 1], [0.4, 0.25, 0]),
    transform: [{ scale: interpolate(ripple1.value, [0, 1], [0.3, 1.8]) }],
  }));

  const ripple2Style = useAnimatedStyle(() => ({
    opacity: interpolate(ripple2.value, [0, 0.3, 1], [0.4, 0.25, 0]),
    transform: [{ scale: interpolate(ripple2.value, [0, 1], [0.3, 1.8]) }],
  }));

  const ripple3Style = useAnimatedStyle(() => ({
    opacity: interpolate(ripple3.value, [0, 0.3, 1], [0.4, 0.25, 0]),
    transform: [{ scale: interpolate(ripple3.value, [0, 1], [0.3, 1.8]) }],
  }));

  const handleRequestNotifications = async () => {
    if (notificationPromptTimerRef.current) {
      clearTimeout(notificationPromptTimerRef.current);
      notificationPromptTimerRef.current = null;
    }

    setHasAskedPermission(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const granted = await requestNotificationPermissions();
    setNotificationPermission(granted ? 'granted' : 'denied');
    setShowNotificationPrompt(false);
  };

  const handleDismissNotificationPrompt = () => {
    if (notificationPromptTimerRef.current) {
      clearTimeout(notificationPromptTimerRef.current);
      notificationPromptTimerRef.current = null;
    }

    setHasAskedPermission(true);
    setShowNotificationPrompt(false);
  };

  useEffect(() => {
    if (!user || generationInFlightRef.current) return;

    generationInFlightRef.current = true;

    const hasRecoverableSession = generationSession.status === 'running' && !!generationSession.devotionalId;

    // Reuse persisted devotionalId when recovering from a restart; otherwise start fresh.
    const devotionalId = hasRecoverableSession && generationSession.devotionalId
      ? generationSession.devotionalId
      : `devotional-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    void logBugEvent('generation', 'generation-start', {
      devotionalId,
      retryCount,
      hasRecoverableSession,
      sessionStatus: generationSession.status,
    });

    const existingDevotional = devotionals.find((d) => d.id === devotionalId);
    let devotionalAddedToStore = Boolean(existingDevotional);

    // Track all days accumulated so far for store updates.
    // Seed from persisted devotional so progress survives app restarts.
    const accumulatedDays: DevotionalDay[] = existingDevotional ? [...existingDevotional.days] : [];

    if (existingDevotional) {
      partialDevotionalRef.current = existingDevotional;
      setGeneratedDays(existingDevotional.days);
      setCurrentSeriesTitle(existingDevotional.title);
      setCanStartReading(existingDevotional.days.length > 0);
      updateGenerationSessionProgress({
        dayNumbers: existingDevotional.days.map((d) => d.dayNumber),
        title: existingDevotional.title,
      });
      void logBugEvent('generation', 'generation-recovered-existing-devotional', {
        devotionalId,
        existingDays: existingDevotional.days.length,
      });
    }

    if (!hasRecoverableSession) {
      startGenerationSession({ devotionalId, totalDays: user.devotionalLength });
      void logBugEvent('generation', 'generation-session-created', {
        devotionalId,
        totalDays: user.devotionalLength,
      });
    }

    const generate = async () => {
      markFullGenerationActive(devotionalId);
      try {
        // Get previously used scriptures to ensure variety
        const recentScriptures = getRecentScriptures(100);
        const previouslyUsedReferences = recentScriptures.map(s => s.reference);

        // Progressive loading callback — fires after each batch completes
        const onDayGenerated: OnDayGeneratedCallback = (day, dayIndex, seriesTitle) => {
          // Avoid duplicates in our accumulated days
          if (!accumulatedDays.some(d => d.dayNumber === day.dayNumber)) {
            accumulatedDays.push(day);
          }

          updateGenerationSessionProgress({
            dayNumber: day.dayNumber,
            ...(seriesTitle ? { title: seriesTitle } : {}),
          });

          void logBugEvent('generation', 'generation-day-produced', {
            devotionalId,
            dayNumber: day.dayNumber,
            currentCount: accumulatedDays.length,
          });

          // Update local UI state
          setGeneratedDays(prev => {
            if (prev.some(d => d.dayNumber === day.dayNumber)) return prev;
            return [...prev, day];
          });

          if (seriesTitle) {
            setCurrentSeriesTitle(seriesTitle);
          }

          // After first batch arrives, create the devotional in the store immediately
          if (!devotionalAddedToStore && seriesTitle) {
            devotionalAddedToStore = true;
            const partialDevotional: Devotional = {
              id: devotionalId,
              title: seriesTitle,
              totalDays: user.devotionalLength,
              currentDay: 1,
              days: [...accumulatedDays],
              createdAt: new Date().toISOString(),
              userContext: {
                name: user.name,
                aboutMe: user.aboutMe,
                currentSituation: user.currentSituation,
                emotionalState: user.emotionalState,
              },
              themeCategory: user.selectedThemes[0],
              devotionalType: user.selectedType || 'personal',
              studySubject: user.selectedStudySubject,
            };
            addDevotional(partialDevotional);
            partialDevotionalRef.current = partialDevotional;
            setCanStartReading(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } else if (devotionalAddedToStore) {
            // Subsequent batches — update the existing devotional with all days so far
            updateDevotionalDays(devotionalId, [...accumulatedDays], undefined);
          }
        };

        const generated = await generateDevotional(
          {
            name: user.name,
            aboutMe: user.aboutMe,
            currentSituation: user.currentSituation,
            emotionalState: user.emotionalState,
            spiritualSeeking: user.spiritualSeeking,
            readingDuration: user.readingDuration,
            devotionalLength: user.devotionalLength,
            bibleTranslation: user.bibleTranslation ?? 'NIV',
            previouslyUsedScriptures: previouslyUsedReferences,
            themeCategory: user.selectedThemes[0],
            devotionalType: user.selectedType,
            studySubject: user.selectedStudySubject,
          },
          () => {},
          onDayGenerated
        );

        // Final update — ensure all days are in the store with the final title
        if (devotionalAddedToStore) {
          updateDevotionalDays(devotionalId, generated.days, generated.title);
        } else {
          // Edge case: no onDayGenerated callback fired (shouldn't happen, but safe fallback)
          const devotional = createDevotionalFromGenerated(generated, {
            name: user.name,
            aboutMe: user.aboutMe,
            currentSituation: user.currentSituation,
            emotionalState: user.emotionalState,
            spiritualSeeking: user.spiritualSeeking,
            readingDuration: user.readingDuration,
            devotionalLength: user.devotionalLength,
            bibleTranslation: user.bibleTranslation ?? 'NIV',
            previouslyUsedScriptures: previouslyUsedReferences,
            themeCategory: user.selectedThemes[0],
            devotionalType: user.selectedType,
            studySubject: user.selectedStudySubject,
          });
          devotional.id = devotionalId;
          addDevotional(devotional);
        }

        // Extract and save scriptures for future variety
        const finalDevotional: Devotional = {
          id: devotionalId,
          title: generated.title,
          totalDays: generated.days.length,
          currentDay: 1,
          days: generated.days,
          createdAt: new Date().toISOString(),
          userContext: {
            name: user.name,
            aboutMe: user.aboutMe,
            currentSituation: user.currentSituation,
            emotionalState: user.emotionalState,
          },
        };
        const newScriptures = extractScripturesFromDevotional(finalDevotional);
        addUsedScriptures(newScriptures);

        setDevotionalTitle(generated.title);
        completeGenerationSession({ title: generated.title });

        void logBugEvent('generation', 'generation-complete', {
          devotionalId,
          title: generated.title,
          totalGeneratedDays: generated.days.length,
        });

        // Set pending notification for if user left app
        setPendingNotification({ title: generated.title });

        setIsGenerating(false);
        setIsComplete(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error('Generation failed:', errorMessage);
        failGenerationSession(errorMessage);
        void logBugError('generation', err, {
          devotionalId,
          phase: 'full-series-generation',
        });
        setError(errorMessage);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        markFullGenerationInactive(devotionalId);
        generationInFlightRef.current = false;
      }
    };

    generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, retryCount]);

  const [isNavigating, setIsNavigating] = useState(false);

  const handleBeginReading = () => {
    // Prevent double-tap
    if (isNavigating) return;

    setIsNavigating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Check if user should see sign-in prompt
    // Show sign-in if:
    // 1. User hasn't seen sign-in prompt before
    // 2. User is not already authenticated with Apple
    const shouldShowSignIn =
      !user?.hasSeenSignInPrompt &&
      user?.authProvider !== 'apple';

    if (shouldShowSignIn) {
      router.replace('/(onboarding)/sign-in');
    } else {
      router.replace('/(main)/home');
    }
  };

  const handleStartReadingEarly = () => {
    // Prevent double-tap
    if (!canStartReading) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Devotional is already in the store from progressive loading — just navigate
    router.replace('/(main)/reading');
  };

  const handleRetry = () => {
    // Prevent double-tap
    if (isGenerating) return;

    void logBugEvent('generation', 'generation-user-retry');
    clearGenerationSession();
    setError(null);
    setGeneratedDays([]);
    setCurrentSeriesTitle('');
    setCanStartReading(false);
    setIsGenerating(true);
    setRetryCount(prev => prev + 1);
  };

  const handleRetryFromOnboarding = () => {
    // Prevent double-tap
    if (isGenerating) return;

    void logBugEvent('generation', 'generation-restart-onboarding');
    clearGenerationSession();
    setError(null);
    router.replace('/onboarding');
  };

  if (error) {
    const displayError = toFriendlyGenerationError(error);
    const isConnectionError = displayError.toLowerCase().includes('connection');
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 28,
              color: colors.text,
              textAlign: 'center',
              marginBottom: 12,
            }}
          >
            {isConnectionError ? 'Lost connection' : 'Something went wrong'}
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.body,
              fontSize: 16,
              color: colors.textMuted,
              textAlign: 'center',
              marginBottom: 32,
              lineHeight: 24,
            }}
          >
            {displayError}
          </Text>
          <Pressable
            onPress={handleRetry}
            disabled={isGenerating}
            accessibilityState={{ disabled: isGenerating }}
            style={({ pressed }) => ({
              backgroundColor: pressed ? colors.buttonBackgroundPressed : colors.buttonBackground,
              paddingVertical: 16,
              paddingHorizontal: 32,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: isGenerating ? 0.6 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 16,
                color: colors.text,
              }}
            >
              Try again
            </Text>
          </Pressable>
          {!isConnectionError && (
            <Pressable
              onPress={handleRetryFromOnboarding}
              disabled={isGenerating}
              accessibilityState={{ disabled: isGenerating }}
              style={{ paddingVertical: 16, marginTop: 8, opacity: isGenerating ? 0.6 : 1 }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 14,
                  color: colors.textSubtle,
                }}
              >
                Start over with new answers
              </Text>
            </Pressable>
          )}
        </SafeAreaView>
      </View>
    );
  }

  if (isComplete) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 }}>
            <Animated.View entering={FadeIn.duration(600).delay(100)} style={{ marginBottom: 24 }}>
              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 15,
                  color: colors.textMuted,
                  textAlign: 'center',
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                }}
              >
                Your {user?.devotionalLength}-day journey
              </Text>
            </Animated.View>

            <Animated.View entering={FadeIn.duration(800).delay(300)}>
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 44,
                  color: colors.text,
                  textAlign: 'center',
                  lineHeight: 54,
                }}
              >
                {devotionalTitle}
              </Text>
            </Animated.View>

            {/* Decorative line */}
            <Animated.View
              entering={FadeIn.duration(600).delay(600)}
              style={{
                width: 48,
                height: 2,
                backgroundColor: colors.accent,
                marginTop: 36,
                marginBottom: 36,
                borderRadius: 1,
              }}
            />

            <Animated.Text
              entering={FadeIn.duration(600).delay(800)}
              style={{
                fontFamily: FontFamily.bodyItalic,
                fontSize: 16,
                color: colors.textSubtle,
                textAlign: 'center',
                lineHeight: 24,
              }}
            >
              Crafted with care, ready when you are.
            </Animated.Text>
          </View>

          <Animated.View
            entering={FadeIn.duration(600).delay(1000)}
            style={{ paddingHorizontal: 24, paddingBottom: 40 }}
          >
            <Pressable
              onPress={handleBeginReading}
              disabled={isNavigating}
              accessibilityState={{ disabled: isNavigating }}
              style={({ pressed }) => ({
                backgroundColor: pressed ? colors.buttonBackgroundPressed : colors.buttonBackground,
                paddingVertical: 20,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isNavigating ? 0.6 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 17,
                  color: colors.text,
                  textAlign: 'center',
                }}
              >
                Begin Day 1
              </Text>
            </Pressable>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          {/* Ripple effect container */}
          <View style={{ width: 160, height: 160, justifyContent: 'center', alignItems: 'center', marginBottom: 40 }}>
            {/* Ripple rings */}
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  borderWidth: 1,
                  borderColor: colors.textMuted,
                },
                ripple1Style,
              ]}
            />
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  borderWidth: 1,
                  borderColor: colors.textMuted,
                },
                ripple2Style,
              ]}
            />
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  borderWidth: 1,
                  borderColor: colors.textMuted,
                },
                ripple3Style,
              ]}
            />

            {/* Center dot */}
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors.accent,
              }}
            />
          </View>

          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 24,
              color: colors.text,
              textAlign: 'center',
              marginBottom: 12,
            }}
          >
            {generatedDays.length === 0 ? 'Preparing Day 1' : 'Creating your devotionals'}
          </Text>

          <Text
            style={{
              fontFamily: FontFamily.body,
              fontSize: 15,
              color: colors.textMuted,
              textAlign: 'center',
              lineHeight: 22,
            }}
          >
            {generatedDays.length === 0 ? 'Your first day will be ready shortly' : `This takes ${timeEstimate}`}
          </Text>

          {/* Progress indicator showing days generated */}
          {generatedDays.length > 0 && (
            <Animated.View
              entering={FadeInUp.duration(400)}
              style={{
                marginTop: 28,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.mono,
                  fontSize: 12,
                  color: colors.textSubtle,
                  letterSpacing: 1,
                }}
              >
                {generatedDays.length} of {devotionalLength} days ready
              </Text>

              {/* Progress bar */}
              <View
                style={{
                  width: 200,
                  height: 3,
                  backgroundColor: colors.border,
                  borderRadius: 1.5,
                  marginTop: 12,
                  overflow: 'hidden',
                }}
              >
                <Animated.View
                  style={{
                    width: `${(generatedDays.length / devotionalLength) * 100}%`,
                    height: '100%',
                    backgroundColor: colors.accent,
                    borderRadius: 1.5,
                  }}
                />
              </View>
            </Animated.View>
          )}

          {/* Notification prompt — shown during generation */}
          {showNotificationPrompt && notificationPermission !== 'granted' && !hasAskedPermission && (
            <Animated.View
              entering={FadeInUp.duration(500)}
              style={{
                marginTop: 48,
                width: '100%',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.inputBackground,
                  borderWidth: 1,
                  borderColor: colors.border,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <Bell size={17} color={colors.accent} />
              </View>

              <Text
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 16,
                  color: colors.text,
                  textAlign: 'center',
                  lineHeight: 24,
                  marginBottom: 6,
                }}
              >
                You don't have to wait here
              </Text>

              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 14,
                  color: colors.textMuted,
                  textAlign: 'center',
                  lineHeight: 21,
                  marginBottom: 24,
                  paddingHorizontal: 8,
                }}
              >
                We'll send you a quiet notification when your devotional is ready.
              </Text>

              <Pressable
                onPress={handleRequestNotifications}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.buttonBackgroundPressed : colors.buttonBackground,
                  paddingVertical: 14,
                  paddingHorizontal: 32,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: 12,
                })}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 15,
                    color: colors.text,
                    textAlign: 'center',
                  }}
                >
                  Notify me when it's ready
                </Text>
              </Pressable>

              <Pressable
                onPress={handleDismissNotificationPrompt}
                style={{ paddingVertical: 8 }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 13,
                    color: colors.textSubtle,
                    textAlign: 'center',
                  }}
                >
                  I'll wait
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {/* After enabling notifications — gentle reassurance */}
          {notificationPermission === 'granted' && hasAskedPermission && (
            <Animated.View
              entering={FadeIn.duration(400)}
              style={{
                marginTop: 40,
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  backgroundColor: colors.inputBackground,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Bell size={14} color={colors.accent} />
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: 13,
                    color: colors.textMuted,
                    marginLeft: 8,
                  }}
                >
                  We'll let you know when it's ready
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Already had notifications — just show the leave message */}
          {notificationPermission === 'granted' && !hasAskedPermission && !canStartReading && (
            <Animated.View
              entering={FadeIn.duration(600).delay(3000)}
              style={{
                marginTop: 40,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 14,
                  color: colors.textSubtle,
                  textAlign: 'center',
                  lineHeight: 21,
                }}
              >
                Feel free to step away — we'll notify you when it's done.
              </Text>
            </Animated.View>
          )}
        </View>

        {/* Start reading early - prominent CTA at bottom */}
        {canStartReading && isGenerating && (
          <Animated.View
            entering={FadeInUp.duration(500).delay(200)}
            style={{
              paddingHorizontal: 24,
              paddingBottom: 40,
              paddingTop: 16,
            }}
          >
            {currentSeriesTitle ? (
              <Animated.Text
                entering={FadeIn.duration(400)}
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 22,
                  color: colors.text,
                  textAlign: 'center',
                  marginBottom: 20,
                  lineHeight: 30,
                }}
              >
                {currentSeriesTitle}
              </Animated.Text>
            ) : null}

            <Pressable
              onPress={handleStartReadingEarly}
              disabled={!canStartReading}
              accessibilityState={{ disabled: !canStartReading }}
              style={({ pressed }) => ({
                backgroundColor: pressed ? colors.buttonBackgroundPressed : colors.buttonBackground,
                paddingVertical: 20,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: !canStartReading ? 0.6 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 17,
                  color: colors.text,
                  textAlign: 'center',
                }}
              >
                Start Reading Now
              </Text>
            </Pressable>

            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: 14,
                color: colors.textSubtle,
                marginTop: 14,
                textAlign: 'center',
                lineHeight: 20,
              }}
            >
              Day 1 is ready — the rest will keep loading as you read.
            </Text>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}
