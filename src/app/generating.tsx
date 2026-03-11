import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, AppState, AppStateStatus, AccessibilityInfo, Dimensions, ScrollView } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
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
  FadeOut,
  interpolate,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BellIcon, BookOpenTextIcon } from 'phosphor-react-native';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, DevotionalDay, Devotional, SeriesPersonaRecord } from '@/lib/store';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Sample devotional content shown as a preview while generating
const SAMPLE_PREVIEW = {
  themeTitle: 'Learning to Trust Again',
  scripture: 'Psalm 56:3\u20134',
  paragraphs: [
    'Trust is a choice we make before we feel it. It\u2019s saying, \u201CI don\u2019t know what You\u2019re doing, God, but I know who You are.\u201D',
    'Every devotional you receive will meet you where you are \u2014 not with platitudes, but with words that feel like they were written by someone who actually knows your story.',
  ],
  reflectionQuestion: 'What\u2019s one area of your life where you\u2019re being invited to trust before you understand?',
};

// Delay before showing the sample preview card (ms)
const SAMPLE_PREVIEW_DELAY_MS = 5000;

// Contemplative messages shown while generating
const WAITING_MESSAGES = [
  'Reading your story',
  'Choosing scripture',
  'Finding the right words',
  'Weaving your\u00A0narrative',
  'Crafting something\u00A0personal',
];

function toFriendlyGenerationError(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();

  if (
    normalized.includes('unable to connect') ||
    normalized.includes('network') ||
    normalized.includes('internet') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out')
  ) {
    return "We couldn\u2019t reach the writing service. Check your connection and\u00A0try\u00A0again.";
  }

  if (normalized.includes('content filter')) {
    return 'We hit a temporary writing limit. Try again with the\u00A0same\u00A0answers.';
  }

  if (normalized.includes('output_truncated') || normalized.includes('truncated')) {
    return 'The devotional was too long to generate in one go. Tap retry\u00A0\u2014\u00A0we\u2019ll break it into\u00A0smaller\u00A0pieces.';
  }

  return 'We couldn\u2019t finish creating this devotional right now. Please\u00A0try\u00A0again.';
}

// Ripple animation
const RIPPLE_DURATION = 2800;
const RIPPLE_COUNT = 3;
const RIPPLE_STAGGER = 900;
const MESSAGE_CYCLE_MS = 3800;

export default function GeneratingScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors: themeColors } = useTheme();

  // Prevent swipe-back during generation
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
  }, [navigation]);
  const colors = {
    ...themeColors,
    background: '#0A0A0A',
    cardBackground: '#111214',
    inputBackground: '#111214',
    border: '#24262B',
    text: '#F5F5F7',
    textMuted: '#A0A6B1',
    textSubtle: '#7D8592',
    buttonBackground: themeColors.accent,
    buttonBackgroundPressed: themeColors.accent,
  };
  const user = useUnfoldStore((s) => s.user);
  const devotionals = useUnfoldStore((s) => s.devotionals);
  const addDevotional = useUnfoldStore((s) => s.addDevotional);
  const updateDevotionalDays = useUnfoldStore((s) => s.updateDevotionalDays);
  const addUsedScriptures = useUnfoldStore((s) => s.addUsedScriptures);
  const getRecentScriptures = useUnfoldStore((s) => s.getRecentScriptures);
  const seriesPersonaHistory = useUnfoldStore((s) => s.seriesPersonaHistory);
  const addSeriesPersonaRecord = useUnfoldStore((s) => s.addSeriesPersonaRecord);
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

  // Sample preview state — shows after a short delay to give users something to read
  const [showSamplePreview, setShowSamplePreview] = useState(false);

  // Rotating message state
  const [messageIndex, setMessageIndex] = useState(0);

  const devotionalLength = user?.devotionalLength ?? 7;

  // Ripple animation — rings expand outward from center
  const ripple0 = useSharedValue(0);
  const ripple1 = useSharedValue(0);
  const ripple2 = useSharedValue(0);

  // Rotate through waiting messages
  useEffect(() => {
    if (!isGenerating || canStartReading) return;
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % WAITING_MESSAGES.length);
    }, MESSAGE_CYCLE_MS);
    return () => clearInterval(interval);
  }, [isGenerating, canStartReading]);

  // Show sample preview after a delay (only during initial loading, before Day 1 is ready)
  useEffect(() => {
    if (canStartReading || !isGenerating) return;
    const timer = setTimeout(() => {
      setShowSamplePreview(true);
    }, SAMPLE_PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [canStartReading, isGenerating]);

  // Check notification permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      const enabled = await areNotificationsEnabled();
      setNotificationPermission(enabled ? 'granted' : 'denied');

      if (!enabled) {
        notificationPromptTimerRef.current = setTimeout(() => {
          setShowNotificationPrompt(true);
        }, 6000);
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

  useEffect(() => {
    if (pendingNotification && wasInBackground) {
      sendDevotionalReadyNotification(pendingNotification.title);
      setPendingNotification(null);
    }
  }, [pendingNotification, wasInBackground]);

  useEffect(() => {
    if (canStartReading && currentSeriesTitle) {
      sendDay1ReadyNotification(currentSeriesTitle);
    }
  }, [canStartReading, currentSeriesTitle]);

  // Ripple animations — staggered rings expanding outward
  useEffect(() => {
    const startRipple = (sv: typeof ripple0, delay: number) => {
      sv.value = withDelay(
        delay,
        withRepeat(
          withTiming(1, { duration: RIPPLE_DURATION, easing: Easing.out(Easing.cubic) }),
          -1,
          false
        )
      );
    };

    startRipple(ripple0, 0);
    startRipple(ripple1, RIPPLE_STAGGER);
    startRipple(ripple2, RIPPLE_STAGGER * 2);

    return () => {
      cancelAnimation(ripple0);
      cancelAnimation(ripple1);
      cancelAnimation(ripple2);
    };
  }, []);

  // Each ripple: starts small at center, expands outward, fades as it grows
  const rippleStyle0 = useAnimatedStyle(() => ({
    opacity: interpolate(ripple0.value, [0, 0.3, 1], [0.25, 0.15, 0]),
    transform: [{ scale: interpolate(ripple0.value, [0, 1], [0.1, 1]) }],
  }));

  const rippleStyle1 = useAnimatedStyle(() => ({
    opacity: interpolate(ripple1.value, [0, 0.3, 1], [0.25, 0.15, 0]),
    transform: [{ scale: interpolate(ripple1.value, [0, 1], [0.1, 1]) }],
  }));

  const rippleStyle2 = useAnimatedStyle(() => ({
    opacity: interpolate(ripple2.value, [0, 0.3, 1], [0.25, 0.15, 0]),
    transform: [{ scale: interpolate(ripple2.value, [0, 1], [0.1, 1]) }],
  }));

  // Core dot — gentle pulse
  const coreStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ripple0.value, [0, 0.5, 1], [0.6, 1, 0.6]),
    transform: [{ scale: interpolate(ripple0.value, [0, 0.5, 1], [0.9, 1.1, 0.9]) }],
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

  // ========== GENERATION LOGIC (unchanged) ==========

  useEffect(() => {
    if (!user || generationInFlightRef.current) return;

    generationInFlightRef.current = true;

    const hasRecoverableSession = generationSession.status === 'running' && !!generationSession.devotionalId;

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
        const recentScriptures = getRecentScriptures(200);
        const previouslyUsedReferences = recentScriptures.map(s => s.reference);

        const onDayGenerated: OnDayGeneratedCallback = (day, dayIndex, seriesTitle) => {
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

          setGeneratedDays(prev => {
            if (prev.some(d => d.dayNumber === day.dayNumber)) return prev;
            return [...prev, day];
          });

          if (seriesTitle) {
            setCurrentSeriesTitle(seriesTitle);
          }

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
              themeCategory: user.selectedTheme,
              devotionalType: user.selectedType || 'personal',
              studySubject: user.selectedStudySubject,
            };
            addDevotional(partialDevotional);
            partialDevotionalRef.current = partialDevotional;
            setCanStartReading(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } else if (devotionalAddedToStore) {
            updateDevotionalDays(devotionalId, [...accumulatedDays], undefined);
          }
        };

        // Extract previous series titles for de-duplication (last 10 to keep prompt concise)
        const previousSeriesTitles = devotionals
          .map(d => d.title)
          .filter((t): t is string => Boolean(t))
          .slice(-10);

        const generated = await generateDevotional(
          {
            name: user.name,
            aboutMe: user.aboutMe,
            currentSituation: user.currentSituation,
            emotionalState: user.emotionalState,
            spiritualSeeking: user.spiritualSeeking,
            readingDuration: user.readingDuration,
            devotionalLength: user.devotionalLength,
            bibleTranslation: user.bibleTranslation ?? 'WEB',
            previouslyUsedScriptures: previouslyUsedReferences,
            usedScriptureHistory: recentScriptures,
            themeCategory: user.selectedTheme,
            devotionalType: user.selectedType,
            studySubject: user.selectedStudySubject,
            writingStyle: user.writingStyle,
            seriesPersonaHistory,
            previousSeriesTitles,
          },
          () => {},
          onDayGenerated
        );

        if (devotionalAddedToStore) {
          updateDevotionalDays(devotionalId, generated.days, generated.title);
        } else {
          const devotional = createDevotionalFromGenerated(generated, {
            name: user.name,
            aboutMe: user.aboutMe,
            currentSituation: user.currentSituation,
            emotionalState: user.emotionalState,
            spiritualSeeking: user.spiritualSeeking,
            readingDuration: user.readingDuration,
            devotionalLength: user.devotionalLength,
            bibleTranslation: user.bibleTranslation ?? 'WEB',
            previouslyUsedScriptures: previouslyUsedReferences,
            themeCategory: user.selectedTheme,
            devotionalType: user.selectedType,
            studySubject: user.selectedStudySubject,
          });
          devotional.id = devotionalId;
          addDevotional(devotional);
        }

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

        // Record persona traits for cross-series freshness tracking
        if (generated.resolvedPersona) {
          addSeriesPersonaRecord({
            devotionalId,
            primaryTrait: generated.resolvedPersona.primary,
            secondaryTrait: generated.resolvedPersona.secondary,
            templateSeed: generated.resolvedPersona.templateSeed,
            createdAt: new Date().toISOString(),
          });
        }

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
        setIsGenerating(false);
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

  // ========== HANDLERS ==========

  const [isNavigating, setIsNavigating] = useState(false);

  const handleBeginReading = () => {
    if (isNavigating) return;
    setIsNavigating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let shouldShowSignIn = false;
    try {
      require('@react-native-firebase/auth');
      shouldShowSignIn =
        !user?.hasSeenSignInPrompt &&
        user?.authProvider !== 'apple';
    } catch {
      shouldShowSignIn = false;
    }

    if (shouldShowSignIn) {
      router.replace('/(onboarding)/sign-in');
    } else {
      router.replace('/(tabs)/(today)');
    }
  };

  const handleStartReadingEarly = () => {
    if (!canStartReading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace('/(tabs)/(today)/reading');
  };

  const handleRetry = () => {
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
    if (isGenerating) return;
    void logBugEvent('generation', 'generation-restart-onboarding');
    clearGenerationSession();
    setError(null);
    router.replace('/onboarding');
  };

  // ========== RENDER: ERROR STATE ==========

  if (error) {
    const displayError = toFriendlyGenerationError(error);
    const isConnectionError = displayError.toLowerCase().includes('connection');
    return (
      <View style={{ flex: 1, backgroundColor: 'transparent' }}>
        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          {/* Error icon */}
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: 'rgba(200, 165, 92, 0.08)',
              borderWidth: 1,
              borderColor: 'rgba(200, 165, 92, 0.15)',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 28,
            }}
          >
            <Text style={{ fontSize: 28 }}>{'  '}</Text>
          </View>

          <Text
            style={{
              fontFamily: FontFamily.display,
              fontSize: 28,
              color: colors.text,
              textAlign: 'center',
              marginBottom: 12,
            }}
          >
            {isConnectionError ? 'Lost\u00A0connection' : 'Something went\u00A0wrong'}
          </Text>
          <Text
            style={{
              fontFamily: FontFamily.body,
              fontSize: 16,
              color: colors.textMuted,
              textAlign: 'center',
              marginBottom: 40,
              lineHeight: 24,
              paddingHorizontal: 8,
            }}
          >
            {displayError}
          </Text>

          <Pressable
            onPress={handleRetry}
            disabled={isGenerating}
            accessibilityState={{ disabled: isGenerating }}
            style={{
              backgroundColor: colors.buttonBackground,
              paddingVertical: 18,
              paddingHorizontal: 48,
              borderRadius: 999,
              opacity: isGenerating ? 0.6 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: FontFamily.uiMedium,
                fontSize: 16,
                color: colors.background,
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

  // ========== RENDER: COMPLETE STATE ==========

  if (isComplete) {
    return (
      <View style={{ flex: 1, backgroundColor: 'transparent' }}>
        <SafeAreaView style={{ flex: 1, justifyContent: 'space-between' }} edges={['top', 'bottom']}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 }}>
            <Animated.View entering={FadeIn.duration(600).delay(100)} style={{ marginBottom: 28 }}>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 13,
                  color: colors.textSubtle,
                  textAlign: 'center',
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                }}
              >
                Your {user?.devotionalLength}-day journey
              </Text>
            </Animated.View>

            <Animated.View entering={FadeIn.duration(1000).delay(400)}>
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

            {/* Decorative accent line */}
            <Animated.View
              entering={FadeIn.duration(600).delay(800)}
              style={{
                width: 40,
                height: 2,
                backgroundColor: colors.accent,
                marginTop: 40,
                marginBottom: 40,
                borderRadius: 1,
              }}
            />

            <Animated.Text
              entering={FadeIn.duration(600).delay(1000)}
              style={{
                fontFamily: FontFamily.bodyItalic,
                fontSize: 16,
                color: colors.textSubtle,
                textAlign: 'center',
                lineHeight: 24,
              }}
            >
              {'Crafted with care,\nready when\u00A0you\u00A0are.'}
            </Animated.Text>
          </View>

          <View style={{ paddingHorizontal: 24, paddingBottom: 16 }}>
            <Pressable
              onPress={handleBeginReading}
              disabled={isNavigating}
              accessibilityState={{ disabled: isNavigating }}
              style={{
                backgroundColor: colors.accent,
                paddingVertical: 20,
                borderRadius: 28,
                opacity: isNavigating ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.uiMedium,
                  fontSize: 17,
                  color: colors.background,
                  textAlign: 'center',
                }}
              >
                Begin Day 1
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ========== RENDER: LOADING / GENERATING STATE ==========

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 32,
            paddingBottom: 40,
          }}
          showsVerticalScrollIndicator={false}
        >

          {/* Water ripple — rings expanding from center */}
          <View style={{ width: 200, height: 200, justifyContent: 'center', alignItems: 'center', marginBottom: 48 }}>
            {/* Ripple ring 0 */}
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: 180,
                  height: 180,
                  borderRadius: 90,
                  borderWidth: 1.5,
                  borderColor: colors.accent,
                },
                rippleStyle0,
              ]}
            />
            {/* Ripple ring 1 */}
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: 180,
                  height: 180,
                  borderRadius: 90,
                  borderWidth: 1,
                  borderColor: colors.accent,
                },
                rippleStyle1,
              ]}
            />
            {/* Ripple ring 2 */}
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  width: 180,
                  height: 180,
                  borderRadius: 90,
                  borderWidth: 0.5,
                  borderColor: colors.accent,
                },
                rippleStyle2,
              ]}
            />
            {/* Core dot */}
            <Animated.View
              style={[
                {
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.accent,
                },
                coreStyle,
              ]}
            />
          </View>

          {/* Rotating contemplative message */}
          {!canStartReading && (
            <View style={{ height: 28, justifyContent: 'center', marginBottom: 12 }}>
              <Animated.Text
                key={messageIndex}
                entering={FadeIn.duration(600)}
                exiting={FadeOut.duration(300)}
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 17,
                  color: colors.text,
                  textAlign: 'center',
                }}
              >
                {WAITING_MESSAGES[messageIndex]}
              </Animated.Text>
            </View>
          )}

          {/* Series title reveal when Day 1 is ready */}
          {canStartReading && currentSeriesTitle && (
            <Animated.View
              entering={FadeIn.duration(800)}
              style={{ alignItems: 'center', marginBottom: 12 }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 30,
                  color: colors.text,
                  textAlign: 'center',
                  lineHeight: 40,
                }}
              >
                {currentSeriesTitle}
              </Text>
            </Animated.View>
          )}

          {/* Day progress dots */}
          {generatedDays.length > 0 && (
            <Animated.View
              entering={FadeIn.duration(400)}
              style={{
                flexDirection: 'row',
                gap: 6,
                marginTop: 20,
                alignItems: 'center',
              }}
            >
              {Array.from({ length: devotionalLength }).map((_, i) => {
                const isReady = i < generatedDays.length;
                return (
                  <View
                    key={i}
                    style={{
                      width: isReady ? 8 : 6,
                      height: isReady ? 8 : 6,
                      borderRadius: 4,
                      backgroundColor: isReady ? colors.accent : colors.border,
                    }}
                  />
                );
              })}
            </Animated.View>
          )}

          {/* Start reading early — appears when Day 1 is ready */}
          {canStartReading && isGenerating && (
            <View style={{ width: '100%', alignItems: 'center', marginTop: 48 }}>
              <Pressable
                onPress={handleStartReadingEarly}
                style={{
                  backgroundColor: colors.accent,
                  paddingVertical: 18,
                  paddingHorizontal: 48,
                  borderRadius: 28,
                }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 17,
                    color: colors.background,
                    textAlign: 'center',
                  }}
                >
                  Start Reading Now
                </Text>
              </Pressable>

              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 13,
                  color: colors.textSubtle,
                  marginTop: 16,
                  textAlign: 'center',
                  lineHeight: 18,
                }}
              >
                {'The rest will keep loading as\u00A0you\u00A0read.'}
              </Text>
            </View>
          )}

          {/* Notification prompt — appears after a delay */}
          {showNotificationPrompt && notificationPermission !== 'granted' && !hasAskedPermission && !canStartReading && (
            <Animated.View
              entering={FadeInUp.duration(500)}
              style={{
                marginTop: 56,
                width: '100%',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.inputBackground,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 16,
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  width: '100%',
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: 'rgba(200, 165, 92, 0.1)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 14,
                  }}
                >
                  <BellIcon size={16} color={colors.accent} weight="light" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 15,
                      color: colors.text,
                      marginBottom: 3,
                    }}
                  >
                    {"You don\u2019t have to\u00A0wait"}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: 13,
                      color: colors.textMuted,
                      lineHeight: 18,
                    }}
                  >
                    {"We\u2019ll nudge you when it\u2019s\u00A0ready."}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
                <Pressable
                  onPress={handleRequestNotifications}
                  style={{
                    backgroundColor: colors.buttonBackground,
                    paddingVertical: 12,
                    paddingHorizontal: 24,
                    borderRadius: 999,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 14,
                      color: colors.background,
                    }}
                  >
                    Notify me
                  </Text>
                </Pressable>

                <Pressable
                  onPress={handleDismissNotificationPrompt}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 20,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 14,
                      color: colors.textMuted,
                    }}
                  >
                    I'll wait
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          )}

          {/* After enabling notifications */}
          {notificationPermission === 'granted' && hasAskedPermission && (
            <Animated.View
              entering={FadeIn.duration(400)}
              style={{
                marginTop: 40,
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
              <BellIcon size={14} color={colors.accent} weight="light" />
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 13,
                  color: colors.textMuted,
                  marginLeft: 8,
                }}
              >
                {"We\u2019ll let you know when it\u2019s\u00A0ready"}
              </Text>
            </Animated.View>
          )}

          {/* Already had notifications — gentle note */}
          {notificationPermission === 'granted' && !hasAskedPermission && !canStartReading && (
            <Animated.View
              entering={FadeIn.duration(600).delay(4000)}
              style={{ marginTop: 40 }}
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
                {'Feel free to step away \u2014 we\u2019ll\u00A0notify\u00A0you.'}
              </Text>
            </Animated.View>
          )}

          {/* ========== SAMPLE DEVOTIONAL PREVIEW ========== */}
          {/* Shows after a delay to give users a taste of the devotional format */}
          {showSamplePreview && !canStartReading && isGenerating && (
            <Animated.View
              entering={FadeIn.duration(800)}
              style={{
                marginTop: 48,
                width: '100%',
                alignItems: 'center',
              }}
            >
              {/* Label */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <BookOpenTextIcon
                  size={16}
                  color={colors.accent}
                  weight="light"
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 13,
                    color: colors.textSubtle,
                    letterSpacing: 0.5,
                  }}
                >
                  {"Here\u2019s a taste of what yours will feel\u00A0like"}
                </Text>
              </View>

              {/* Preview card */}
              <View
                style={{
                  width: '100%',
                  backgroundColor: colors.cardBackground,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 24,
                }}
              >
                {/* Scripture reference */}
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: 12,
                    color: colors.accent,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  {SAMPLE_PREVIEW.scripture}
                </Text>

                {/* Theme title */}
                <Text
                  style={{
                    fontFamily: FontFamily.display,
                    fontSize: 22,
                    color: colors.text,
                    marginBottom: 16,
                    lineHeight: 30,
                  }}
                >
                  {SAMPLE_PREVIEW.themeTitle}
                </Text>

                {/* Divider */}
                <View
                  style={{
                    height: 1,
                    backgroundColor: colors.border,
                    marginBottom: 16,
                  }}
                />

                {/* Devotional paragraphs */}
                {SAMPLE_PREVIEW.paragraphs.map((paragraph, index) => (
                  <Text
                    key={index}
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: 15,
                      color: colors.text,
                      lineHeight: 24,
                      marginBottom: index < SAMPLE_PREVIEW.paragraphs.length - 1 ? 12 : 20,
                      opacity: 0.9,
                    }}
                  >
                    {paragraph}
                  </Text>
                ))}

                {/* Reflection question */}
                <View
                  style={{
                    backgroundColor: 'rgba(200, 165, 92, 0.06)',
                    borderRadius: 12,
                    padding: 16,
                    borderLeftWidth: 3,
                    borderLeftColor: colors.accent,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 11,
                      color: colors.accent,
                      letterSpacing: 1.5,
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}
                  >
                    REFLECT
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.bodyItalic,
                      fontSize: 14,
                      color: colors.textMuted,
                      lineHeight: 22,
                    }}
                  >
                    {SAMPLE_PREVIEW.reflectionQuestion}
                  </Text>
                </View>
              </View>

              {/* Reassurance note below card */}
              <Animated.Text
                entering={FadeIn.duration(600).delay(400)}
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 13,
                  color: colors.textSubtle,
                  textAlign: 'center',
                  marginTop: 16,
                  lineHeight: 20,
                }}
              >
                {'Yours will be written just for\u00A0you.'}
              </Animated.Text>
            </Animated.View>
          )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
