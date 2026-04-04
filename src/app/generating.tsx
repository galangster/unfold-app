import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, AppState, AppStateStatus, AccessibilityInfo, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withDelay,
  Easing,
  FadeIn,
  FadeInUp,
  FadeOut,
  interpolate,
  cancelAnimation,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BellIcon, BookOpenTextIcon } from 'phosphor-react-native';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, type Devotional, type DevotionalDay } from '@/lib/store';
import { submitGenerationJob, pollJobStatus, retryJob } from '@/lib/generation-api';

import {
  requestNotificationPermissions,
  areNotificationsEnabled,
} from '@/lib/notifications';
import { logBugEvent, logBugError } from '@/lib/bug-logger';
import { logger } from '@/lib/logger';
import { mmkvStorage } from '@/lib/mmkv-storage';

// MMKV key for persisting in-flight generation job across app kills
const INFLIGHT_KEY = 'inflight-generation-job';
// Maximum time to poll before giving up (10 minutes)
const MAX_POLL_DURATION_MS = 10 * 60 * 1000;

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

// Polling interval for server job status (ms)
const POLL_INTERVAL_MS = 3000;

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
  const { reducedMotion, entering, exiting } = useAccessibleAnimation();

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

  const hasConsentedToAI = useUnfoldStore((s) => s.hasConsentedToAI);
  const user = useUnfoldStore((s) => s.user);
  const addDevotional = useUnfoldStore((s) => s.addDevotional);
  const addUsedScriptures = useUnfoldStore((s) => s.addUsedScriptures);
  const addGeneratedDay = useUnfoldStore((s) => s.addGeneratedDay);
  const startGenerationSession = useUnfoldStore((s) => s.startGenerationSession);
  const updateGenerationSessionProgress = useUnfoldStore((s) => s.updateGenerationSessionProgress);
  const completeGenerationSession = useUnfoldStore((s) => s.completeGenerationSession);
  const failGenerationSession = useUnfoldStore((s) => s.failGenerationSession);
  const clearGenerationSession = useUnfoldStore((s) => s.clearGenerationSession);
  // Safety guard: redirect if AI consent is missing
  useEffect(() => {
    if (!hasConsentedToAI) {
      router.replace('/onboarding');
    }
  }, [hasConsentedToAI, router]);

  const [isComplete, setIsComplete] = useState(false);
  const [devotionalTitle, setDevotionalTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(true);

  // Job polling state
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const pollingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobSubmittedRef = useRef(false);

  // Track when polling started for max-duration timeout
  const pollStartTime = useRef(Date.now());

  // Track whether we are auto-retrying after returning from background
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Announce to screen readers when generation is complete
  useEffect(() => {
    if (isComplete && devotionalTitle) {
      AccessibilityInfo.announceForAccessibility(`Your devotional "${devotionalTitle}" is ready. Begin reading.`);
    }
  }, [isComplete, devotionalTitle]);

  const [currentSeriesTitle, setCurrentSeriesTitle] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(true);
  const notificationPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prevent swipe-back during generation, re-enable on error
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !!error });
  }, [navigation, error]);

  // Block deep-link / external navigation while generation is in progress.
  useEffect(() => {
    if (!isGenerating) return;

    const unsubscribe = navigation.addListener('beforeRemove' as never, (e: { data: { action: { type: string } }; preventDefault: () => void }) => {
      const actionType = e.data.action.type;
      // Allow programmatic REPLACE that we trigger ourselves
      if (actionType === 'REPLACE') return;
      // Block external navigation (deep links typically use NAVIGATE or RESET)
      logger.warn('[generating] Blocked external navigation during generation, action:', actionType);
      e.preventDefault();
    });

    return unsubscribe;
  }, [navigation, isGenerating]);

  // Notification state
  const [notificationPermission, setNotificationPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [hasAskedPermission, setHasAskedPermission] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

  // Sample preview state -- shows after a short delay to give users something to read
  const [showSamplePreview, setShowSamplePreview] = useState(false);

  // Rotating message state
  const [messageIndex, setMessageIndex] = useState(0);

  const devotionalLength = user?.devotionalLength ?? 7;

  // Ripple animation -- rings expand outward from center
  const ripple0 = useSharedValue(0);
  const ripple1 = useSharedValue(0);
  const ripple2 = useSharedValue(0);

  // Rotate through waiting messages
  useEffect(() => {
    if (!isGenerating || isComplete) return;
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % WAITING_MESSAGES.length);
    }, MESSAGE_CYCLE_MS);
    return () => clearInterval(interval);
  }, [isGenerating, isComplete]);

  // Show sample preview after a delay (only during initial loading, before complete)
  useEffect(() => {
    if (isComplete || !isGenerating) return;
    const timer = setTimeout(() => {
      setShowSamplePreview(true);
    }, SAMPLE_PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isComplete, isGenerating]);

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

  // Background notification state
  const [wasInBackground, setWasInBackground] = useState(false);
  const [pendingNotification, setPendingNotification] = useState<{ title: string } | null>(null);

  // Local notifications removed — server push handles delivery.
  // Clear pending state if generation completes.
  useEffect(() => {
    if (pendingNotification && wasInBackground) {
      setPendingNotification(null);
    }
  }, [pendingNotification, wasInBackground]);

  // ========== AppState: resume polling on foreground ==========
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        setWasInBackground(true);
        // Stop polling while backgrounded to save resources
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        pollingRef.current = false;
        return;
      }

      // Returning to foreground
      if (nextAppState === 'active') {
        // If we have a pending job and we're not already done/errored, do a single poll
        const currentJobId = pendingJobId;
        if (currentJobId && !isComplete && !error && !pollingRef.current) {
          logger.log('[generating] Returned to foreground with pending job, resuming poll');
          startPolling(currentJobId);
        }
      }
    });

    return () => subscription.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJobId, isComplete, error]);

  // Ripple animations -- staggered rings expanding outward (skip if reduced motion)
  useEffect(() => {
    if (reducedMotion) return;

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
  }, [reducedMotion]);

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

  // Core dot -- gentle pulse
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

  // ========== GENERATION COMPLETE HANDLER ==========

  const handleGenerationComplete = useCallback((result: {
    devotionalDay: DevotionalDay;
    seriesTitle?: string;
    totalDays?: number;
    arc?: import('@/lib/store').SeriesArc;
    devotionalId?: string;
  }) => {
    const devotionalId = result.devotionalId ?? `devotional-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const seriesTitle = result.seriesTitle ?? 'Your Devotional';
    const totalDays = result.totalDays ?? devotionalLength;
    const day1 = result.devotionalDay;

    // Check if this devotional already exists in the store (e.g., from a retry)
    const existingDevotional = useUnfoldStore.getState().devotionals.find((d) => d.id === devotionalId);

    if (existingDevotional) {
      // Devotional shell already exists -- just add the day
      addGeneratedDay(devotionalId, day1);
    } else {
      // Create the full devotional shell with Day 1
      const newDevotional: Devotional = {
        id: devotionalId,
        title: seriesTitle,
        totalDays,
        currentDay: 1,
        days: [day1],
        createdAt: new Date().toISOString(),
        seriesStartDate: new Date().toISOString(),
        userContext: {
          name: user?.name ?? '',
          aboutMe: user?.aboutMe ?? '',
          currentSituation: user?.currentSituation ?? '',
          emotionalState: user?.emotionalState ?? '',
        },
        themeCategory: user?.selectedTheme,
        devotionalType: user?.selectedType || 'personal',
        studySubject: user?.selectedStudySubject,
        generationMode: 'progressive',
        seriesArc: result.arc,
        progressiveMemory: { fullDays: [], summaries: [], narrative: null },
      };
      addDevotional(newDevotional);
    }

    // Track scripture usage
    if (day1.scriptureReference) {
      const book = day1.scriptureReference.split(/\s+\d/)[0].trim();
      addUsedScriptures([{
        reference: day1.scriptureReference,
        book,
        usedAt: new Date().toISOString(),
        devotionalId,
      }]);
    }

    // Clear inflight job from MMKV — generation succeeded
    mmkvStorage.removeItem(INFLIGHT_KEY);

    // Update session and UI state
    completeGenerationSession({ title: seriesTitle });
    setDevotionalTitle(seriesTitle);
    setCurrentSeriesTitle(seriesTitle);
    setPendingNotification({ title: seriesTitle });
    setIsGenerating(false);
    setIsComplete(true);
    setIsReconnecting(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    void logBugEvent('generation', 'server-generation-complete', {
      devotionalId,
      title: seriesTitle,
      dayTitle: day1.title,
    });
  }, [user, devotionalLength, addDevotional, addGeneratedDay, addUsedScriptures, completeGenerationSession]);

  // ========== POLLING LOGIC ==========

  const startPolling = useCallback((jobId: string) => {
    if (pollingRef.current) return;
    pollingRef.current = true;

    const poll = async () => {
      // Check max poll duration timeout
      if (Date.now() - pollStartTime.current > MAX_POLL_DURATION_MS) {
        pollingRef.current = false;
        const timeoutMsg = 'Generation is taking longer than expected. Please try again.';
        logger.warn('[generating] Poll timeout reached after 10 minutes');
        mmkvStorage.removeItem(INFLIGHT_KEY);
        failGenerationSession(timeoutMsg);
        setIsGenerating(false);
        setIsReconnecting(false);
        setError(timeoutMsg);
        setCanRetry(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      try {
        const status = await pollJobStatus(jobId);

        if (status.status === 'complete' && status.result) {
          pollingRef.current = false;
          handleGenerationComplete(status.result);
          return;
        }

        if (status.status === 'failed') {
          pollingRef.current = false;
          const errorMsg = status.error ?? 'Generation failed on server';
          logger.error('[generating] Server job failed:', errorMsg);
          Sentry.captureMessage(`Server generation job failed: ${errorMsg}`, {
            level: 'error',
            extra: { jobId },
          });
          mmkvStorage.removeItem(INFLIGHT_KEY);
          failGenerationSession(errorMsg);
          void logBugError('generation', new Error(errorMsg), { jobId, phase: 'server-poll' });
          setIsGenerating(false);
          setIsReconnecting(false);
          setError(errorMsg);
          setCanRetry(status.canRetry !== false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          return;
        }

        // Still pending or processing -- poll again
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        // Network error during polling -- keep trying a few times
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn('[generating] Poll error (will retry):', errorMsg);

        // Keep polling on transient errors -- the server job is still running
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS * 2);
      }
    };

    poll();
  }, [handleGenerationComplete, failGenerationSession]);

  // ========== JOB SUBMISSION ==========

  useEffect(() => {
    if (!user || jobSubmittedRef.current) return;
    jobSubmittedRef.current = true;

    // Check MMKV for an inflight job from a previous session (app-kill recovery)
    const raw = mmkvStorage.getItem(INFLIGHT_KEY) as string | null;
    if (raw) {
      try {
        const inflight = JSON.parse(raw) as { jobId: string; devotionalId?: string; submittedAt: number };
        // Only resume if not expired (15 min)
        if (Date.now() - inflight.submittedAt < 15 * 60 * 1000) {
          logger.log('[generating] Resuming inflight job from MMKV:', inflight.jobId);
          setPendingJobId(inflight.jobId);
          pollStartTime.current = inflight.submittedAt;
          startPolling(inflight.jobId);
          return;
        }
        // Expired — clear and submit fresh
        mmkvStorage.removeItem(INFLIGHT_KEY);
      } catch {
        mmkvStorage.removeItem(INFLIGHT_KEY);
      }
    }

    const submitJob = async () => {
      const devotionalId = `devotional-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      void logBugEvent('generation', 'server-generation-start', { devotionalId });

      startGenerationSession({ devotionalId, totalDays: user.devotionalLength });

      try {
        const { jobId } = await submitGenerationJob({
          devotionalId,
          dayNumber: 1,
          jobType: 'initial_arc',
          userContext: {
            name: user.name,
            aboutMe: user.aboutMe,
            situation: user.currentSituation,
            emotion: user.emotionalState,
            seeking: user.spiritualSeeking,
            themeCategory: user.selectedTheme ?? '',
            devotionalType: user.selectedType ?? 'personal',
            studySubject: user.selectedStudySubject,
            readingDuration: user.readingDuration,
            devotionalLength: user.devotionalLength,
            bibleTranslation: user.bibleTranslation ?? 'BSB',
            writingStyle: user.writingStyle as unknown as Record<string, string> | undefined,
          },
        });

        logger.log('[generating] Job submitted:', jobId);
        setPendingJobId(jobId);
        setIsReconnecting(false);
        updateGenerationSessionProgress({ title: 'Generating...' });

        // Persist inflight job to MMKV for app-kill recovery
        mmkvStorage.setItem(INFLIGHT_KEY, JSON.stringify({
          jobId,
          devotionalId,
          submittedAt: Date.now(),
        }));

        // Reset poll start time and start polling
        pollStartTime.current = Date.now();
        startPolling(jobId);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('[generating] Job submission failed:', errorMessage);
        Sentry.captureException(err, {
          tags: { phase: 'server-job-submission' },
          extra: { devotionalId, devotionalLength: user.devotionalLength },
        });
        mmkvStorage.removeItem(INFLIGHT_KEY);
        failGenerationSession(errorMessage);
        void logBugError('generation', err, { devotionalId, phase: 'server-job-submission' });
        setIsGenerating(false);
        setIsReconnecting(false);
        setError(errorMessage);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    };

    submitJob();

    return () => {
      // Cleanup polling timer on unmount
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      pollingRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ========== HANDLERS ==========

  const [isNavigating, setIsNavigating] = useState(false);

  const handleBeginReading = () => {
    if (isNavigating) return;
    setIsNavigating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace('/(tabs)/(today)/reading');
  };

  const handleRetry = async () => {
    if (isGenerating) return;
    void logBugEvent('generation', 'generation-user-retry', { pendingJobId });

    // Stop any existing polling
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollingRef.current = false;

    setError(null);
    setIsReconnecting(true);
    setIsGenerating(true);

    // Reset poll start time for retry
    pollStartTime.current = Date.now();

    try {
      if (pendingJobId) {
        // Retry existing job on the server
        const { jobId } = await retryJob(pendingJobId);
        logger.log('[generating] Job retried:', jobId);
        setPendingJobId(jobId);
        // Update MMKV with new jobId
        mmkvStorage.setItem(INFLIGHT_KEY, JSON.stringify({
          jobId,
          submittedAt: Date.now(),
        }));
        startPolling(jobId);
      } else {
        // No job ID -- resubmit from scratch
        jobSubmittedRef.current = false;
        clearGenerationSession();
        // Force re-run of the submission effect by resetting the ref
        // The useEffect watching `user` will pick this up since we reset the ref
        // We need a small state change to trigger re-evaluation
        setIsReconnecting(false);
        setIsGenerating(true);
        // Re-trigger submission
        if (user) {
          const devotionalId = `devotional-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          startGenerationSession({ devotionalId, totalDays: user.devotionalLength });

          const { jobId } = await submitGenerationJob({
            devotionalId,
            dayNumber: 1,
            jobType: 'initial_arc',
            userContext: {
              name: user.name,
              aboutMe: user.aboutMe,
              situation: user.currentSituation,
              emotion: user.emotionalState,
              seeking: user.spiritualSeeking,
              themeCategory: user.selectedTheme ?? '',
              devotionalType: user.selectedType ?? 'personal',
              studySubject: user.selectedStudySubject,
              readingDuration: user.readingDuration,
              devotionalLength: user.devotionalLength,
              bibleTranslation: user.bibleTranslation ?? 'BSB',
              writingStyle: user.writingStyle as unknown as Record<string, string> | undefined,
            },
          });

          logger.log('[generating] Re-submitted job:', jobId);
          setPendingJobId(jobId);
          // Persist inflight job to MMKV
          mmkvStorage.setItem(INFLIGHT_KEY, JSON.stringify({
            jobId,
            devotionalId,
            submittedAt: Date.now(),
          }));
          startPolling(jobId);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('[generating] Retry failed:', errorMessage);
      mmkvStorage.removeItem(INFLIGHT_KEY);
      failGenerationSession(errorMessage);
      setIsGenerating(false);
      setIsReconnecting(false);
      setError(errorMessage);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleRetryFromOnboarding = () => {
    if (isGenerating) return;
    void logBugEvent('generation', 'generation-restart-onboarding');
    // Cleanup
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollingRef.current = false;
    mmkvStorage.removeItem(INFLIGHT_KEY);
    clearGenerationSession();
    setError(null);
    router.replace('/onboarding');
  };

  const handleGoHome = () => {
    if (isGenerating) return;
    void logBugEvent('generation', 'generation-abandoned-go-home');
    // Cleanup
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollingRef.current = false;
    mmkvStorage.removeItem(INFLIGHT_KEY);
    clearGenerationSession();
    router.replace('/(tabs)/(today)');
  };

  // ========== RENDER: ERROR STATE ==========

  if (error) {
    const displayError = toFriendlyGenerationError(error);
    const isConnectionError = displayError.toLowerCase().includes('connection');
    return (
      <View style={genStyles.transparentFlex}>
        <SafeAreaView style={genStyles.errorSafeArea}>
          {/* Error icon */}
          <View style={genStyles.errorIcon}>
            <Text style={genStyles.errorIconText}>{'  '}</Text>
          </View>

          <Text style={[genStyles.errorTitle, { color: colors.text }]}>
            {isConnectionError ? 'Lost\u00A0connection' : 'Something went\u00A0wrong'}
          </Text>
          <Text style={[genStyles.errorMessage, { color: colors.textMuted }]}>
            {displayError}
          </Text>

          {canRetry && (
            <TouchableOpacity activeOpacity={0.7}
              onPress={handleRetry}
              disabled={isGenerating}
              accessibilityState={{ disabled: isGenerating }}
              accessibilityLabel="Try again"
              accessibilityRole="button"
              style={[genStyles.retryButton, { backgroundColor: colors.buttonBackground, opacity: isGenerating ? 0.6 : 1 }]}
            >
              <Text style={[genStyles.retryButtonText, { color: colors.background }]}>
                Try again
              </Text>
            </TouchableOpacity>
          )}

          {!isConnectionError && (
            <TouchableOpacity activeOpacity={0.7}
              onPress={handleRetryFromOnboarding}
              disabled={isGenerating}
              accessibilityState={{ disabled: isGenerating }}
              accessibilityLabel="Start over with new answers"
              accessibilityRole="button"
              style={[genStyles.startOverButton, { opacity: isGenerating ? 0.6 : 1 }]}
            >
              <Text style={[genStyles.startOverText, { color: colors.textSubtle }]}>
                Start over with new answers
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity activeOpacity={0.7}
            onPress={handleGoHome}
            disabled={isGenerating}
            accessibilityState={{ disabled: isGenerating }}
            accessibilityLabel="Go home"
            accessibilityRole="button"
            style={[genStyles.startOverButton, { opacity: isGenerating ? 0.6 : 1, marginTop: Spacing['2'] }]}
          >
            <Text style={[genStyles.startOverText, { color: colors.textSubtle }]}>
              Go home
            </Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  // ========== RENDER: COMPLETE STATE ==========

  if (isComplete) {
    return (
      <View style={{ flex: 1, backgroundColor: 'transparent' }}>
        <SafeAreaView style={{ flex: 1, justifyContent: 'space-between' }} edges={['top', 'bottom']}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-start', paddingHorizontal: Spacing['8'] }}>
            <Animated.View entering={entering(FadeIn.duration(600).delay(100))} style={{ marginBottom: Spacing['7'] }}>
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 13,
                  color: colors.textSubtle,
                  textAlign: 'left',
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                }}
              >
                Your {user?.devotionalLength}-day series
              </Text>
            </Animated.View>

            <Animated.View entering={entering(FadeIn.duration(1000).delay(400))}>
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 44,
                  color: colors.text,
                  textAlign: 'left',
                  lineHeight: 54,
                }}
              >
                {devotionalTitle}
              </Text>
            </Animated.View>

            {/* Decorative accent line */}
            <Animated.View
              entering={entering(FadeIn.duration(600).delay(800))}
              style={{
                width: 40,
                height: 2,
                backgroundColor: colors.accent,
                marginTop: Spacing['10'],
                marginBottom: Spacing['10'],
                borderRadius: 1,
              }}
            />

            <Animated.Text
              entering={entering(FadeIn.duration(600).delay(1000))}
              style={{
                fontFamily: FontFamily.bodyItalic,
                fontSize: FontSize.base,
                color: colors.textSubtle,
                textAlign: 'left',
                lineHeight: 24,
              }}
            >
              {'Crafted with care,\nready when\u00A0you\u00A0are.'}
            </Animated.Text>
          </View>

          <View style={{ paddingHorizontal: Spacing['6'], paddingBottom: Spacing['4'] }}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={handleBeginReading}
              disabled={isNavigating}
              accessibilityState={{ disabled: isNavigating }}
              accessibilityLabel="Begin Day 1"
              accessibilityRole="button"
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
            </TouchableOpacity>
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
            paddingHorizontal: Spacing['8'],
            paddingBottom: Spacing['10'],
          }}
          showsVerticalScrollIndicator={false}
        >

          {/* Water ripple -- rings expanding from center (or simple spinner if reduced motion) */}
          {reducedMotion ? (
            <View style={genStyles.rippleContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : (
            <View style={genStyles.rippleContainer}>
              <Animated.View
                style={[genStyles.rippleRing, { borderWidth: 1.5, borderColor: colors.accent }, rippleStyle0]}
              />
              <Animated.View
                style={[genStyles.rippleRing, { borderWidth: 1, borderColor: colors.accent }, rippleStyle1]}
              />
              <Animated.View
                style={[genStyles.rippleRing, { borderWidth: 0.5, borderColor: colors.accent }, rippleStyle2]}
              />
              <Animated.View
                style={[genStyles.coreDot, { backgroundColor: colors.accent }, coreStyle]}
              />
            </View>
          )}

          {/* Rotating contemplative message -- swapped for reconnecting msg when auto-retrying */}
          <View style={{ height: 28, justifyContent: 'center', marginBottom: Spacing['3'] }}>
            {isReconnecting ? (
              <Animated.Text
                key="reconnecting"
                entering={entering(FadeIn.duration(600))}
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 17,
                  color: colors.text,
                  textAlign: 'center',
                }}
              >
                {'Reconnecting\u2026'}
              </Animated.Text>
            ) : (
              <Animated.Text
                key={messageIndex}
                entering={entering(FadeIn.duration(600))}
                exiting={exiting(FadeOut.duration(Duration.slow))}
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 17,
                  color: colors.text,
                  textAlign: 'center',
                }}
              >
                {WAITING_MESSAGES[messageIndex]}
              </Animated.Text>
            )}
          </View>

          {/* Series title reveal -- shows when server returns title from arc */}
          {currentSeriesTitle && (
            <Animated.View
              entering={entering(FadeIn.duration(800))}
              style={{ alignItems: 'center', marginBottom: Spacing['3'] }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: FontSize['3xl'],
                  color: colors.text,
                  textAlign: 'center',
                  lineHeight: 40,
                }}
              >
                {currentSeriesTitle}
              </Text>
            </Animated.View>
          )}

          {/* Notification prompt -- appears after a delay */}
          {showNotificationPrompt && notificationPermission !== 'granted' && !hasAskedPermission && !isComplete && (
            <Animated.View
              entering={entering(FadeInUp.duration(500))}
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
                  borderRadius: Radius.lg,
                  paddingVertical: Spacing['4'],
                  paddingHorizontal: Spacing['5'],
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

              <View style={{ flexDirection: 'row', gap: Spacing['3'], marginTop: 14 }}>
                <TouchableOpacity activeOpacity={0.7}
                  onPress={handleRequestNotifications}
                  accessibilityLabel="Notify me when ready"
                  accessibilityRole="button"
                  style={{
                    backgroundColor: colors.buttonBackground,
                    paddingVertical: Spacing['3'],
                    paddingHorizontal: Spacing['6'],
                    borderRadius: Radius.full,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: FontSize.sm,
                      color: colors.background,
                    }}
                  >
                    Notify me
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.7}
                  onPress={handleDismissNotificationPrompt}
                  accessibilityLabel="I'll wait"
                  accessibilityRole="button"
                  style={{
                    paddingVertical: Spacing['3'],
                    paddingHorizontal: Spacing['5'],
                    borderRadius: Radius.full,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: FontSize.sm,
                      color: colors.textMuted,
                    }}
                  >
                    I'll wait
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {/* After enabling notifications */}
          {notificationPermission === 'granted' && hasAskedPermission && (
            <Animated.View
              entering={entering(FadeIn.duration(400))}
              style={{
                marginTop: Spacing['10'],
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: Spacing['4'],
                paddingVertical: 10,
                backgroundColor: colors.inputBackground,
                borderRadius: Radius.xl,
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
                  marginLeft: Spacing['2'],
                }}
              >
                {"We\u2019ll let you know when it\u2019s\u00A0ready"}
              </Text>
            </Animated.View>
          )}

          {/* Already had notifications -- gentle note */}
          {notificationPermission === 'granted' && !hasAskedPermission && !isComplete && (
            <Animated.View
              entering={entering(FadeIn.duration(600).delay(4000))}
              style={{ marginTop: Spacing['10'] }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: FontSize.sm,
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
          {showSamplePreview && !isComplete && isGenerating && (
            <Animated.View
              entering={entering(FadeIn.duration(800))}
              style={{
                marginTop: Spacing['12'],
                width: '100%',
                alignItems: 'center',
              }}
            >
              {/* Label */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginBottom: Spacing['4'],
                }}
              >
                <BookOpenTextIcon
                  size={16}
                  color={colors.accent}
                  weight="light"
                  style={{ marginRight: Spacing['2'] }}
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
                  borderRadius: Radius.lg,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: Spacing['6'],
                }}
              >
                {/* Scripture reference */}
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: FontSize.xs,
                    color: colors.accent,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    marginBottom: Spacing['2'],
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
                    marginBottom: Spacing['4'],
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
                    marginBottom: Spacing['4'],
                  }}
                />

                {/* Devotional paragraphs */}
                {SAMPLE_PREVIEW.paragraphs.map((paragraph, index) => (
                  <Text
                    key={`${paragraph.slice(0, 20)}-${index}`}
                    style={{
                      fontFamily: FontFamily.body,
                      fontSize: 15,
                      color: colors.text,
                      lineHeight: 24,
                      marginBottom: index < SAMPLE_PREVIEW.paragraphs.length - 1 ? Spacing['3'] : Spacing['5'],
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
                    borderRadius: Radius.md,
                    padding: Spacing['4'],
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
                      marginBottom: Spacing['2'],
                    }}
                  >
                    REFLECT
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.bodyItalic,
                      fontSize: FontSize.sm,
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
                entering={entering(FadeIn.duration(600).delay(400))}
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 13,
                  color: colors.textSubtle,
                  textAlign: 'center',
                  marginTop: Spacing['4'],
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

const genStyles = StyleSheet.create({
  transparentFlex: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  errorSafeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['8'],
  },
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(200, 165, 92, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200, 165, 92, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing['7'],
  },
  errorIconText: {
    fontSize: 28,
  },
  errorTitle: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    textAlign: 'center',
    marginBottom: Spacing['3'],
  },
  errorMessage: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    textAlign: 'center',
    marginBottom: Spacing['10'],
    lineHeight: 24,
    paddingHorizontal: Spacing['2'],
  },
  retryButton: {
    paddingVertical: 18,
    paddingHorizontal: Spacing['12'],
    borderRadius: Radius.full,
  },
  retryButtonText: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.base,
  },
  startOverButton: {
    paddingVertical: Spacing['4'],
    marginTop: Spacing['2'],
  },
  startOverText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
  },
  rippleContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing['12'],
  },
  rippleRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  coreDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
