import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, AppState, AppStateStatus, AccessibilityInfo, Dimensions, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Sentry from '@sentry/react-native';
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
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, DevotionalDay, Devotional, SeriesPersonaRecord, type ProgressiveMemory } from '@/lib/store';
import {
  generateDevotional,
  createDevotionalFromGenerated,
  OnDayGeneratedCallback,
  extractScripturesFromDevotional,
  markFullGenerationActive,
  markFullGenerationInactive,
  resolvePersonaForGeneration,
  type GenerationContext,
} from '@/lib/devotional-service';
import { generateSeriesArc, generateProgressiveDay } from '@/lib/progressive-generation';

import {
  requestNotificationPermissions,
  areNotificationsEnabled,
  sendDevotionalReadyNotification,
  sendDay1ReadyNotification,
} from '@/lib/notifications';
import { logBugEvent, logBugError } from '@/lib/bug-logger';
import { logger } from '@/lib/logger';

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
  const { reducedMotion, entering, exiting } = useAccessibleAnimation();

  // Prevent swipe-back during generation, re-enable on error
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !!error });
  }, [navigation, error]);

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
  const setProgressiveGeneration = useUnfoldStore((s) => s.setProgressiveGeneration);
  const addGeneratedDay = useUnfoldStore((s) => s.addGeneratedDay);

  // Safety guard: redirect if AI consent is missing
  useEffect(() => {
    if (!hasConsentedToAI) {
      router.replace('/onboarding');
    }
  }, [hasConsentedToAI, router]);

  const [isComplete, setIsComplete] = useState(false);
  const [devotionalTitle, setDevotionalTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Track whether we are auto-retrying after returning from background
  const [isReconnecting, setIsReconnecting] = useState(false);
  // Track background entry timestamp to know if errors happened while backgrounded
  const backgroundedAtRef = useRef<number | null>(null);

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
  const [isProgressiveMode, setIsProgressiveMode] = useState(false);
  const notificationPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Block deep-link / external navigation while generation is in progress.
  // Our own router.replace() calls dispatch a REPLACE action which we allow;
  // deep links dispatch NAVIGATE or RESET — those are blocked while generating.
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

  // Handle app state changes — foreground recovery + background notification
  const [wasInBackground, setWasInBackground] = useState(false);
  const [pendingNotification, setPendingNotification] = useState<{ title: string } | null>(null);
  // Keep a ref to latest state values so the AppState callback can read them
  // without stale closures triggering extra re-renders.
  const latestStateRef = useRef({
    isGenerating: true,
    isComplete: false,
    error: null as string | null,
    generationInFlight: false,
  });
  useEffect(() => {
    latestStateRef.current = {
      isGenerating,
      isComplete,
      error,
      generationInFlight: generationInFlightRef.current,
    };
  }, [isGenerating, isComplete, error]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Record when we went to background so we can tell if an error
        // happened while the app was suspended
        backgroundedAtRef.current = Date.now();
        setWasInBackground(true);
        return;
      }

      // ---- Returning to foreground ----
      if (nextAppState === 'active' && backgroundedAtRef.current !== null) {
        const bgDuration = Date.now() - backgroundedAtRef.current;
        backgroundedAtRef.current = null;

        logger.log(`[generating] Returned from background after ${Math.round(bgDuration / 1000)}s`);

        // 1) Check if generation already completed while we were away
        //    (the devotional with Day 1 may have landed in the store before
        //    iOS suspended the JS thread)
        const currentSession = useUnfoldStore.getState().generationSession;
        if (currentSession.status === 'complete' || currentSession.status === 'running') {
          const devId = currentSession.devotionalId;
          if (devId) {
            const existing = useUnfoldStore.getState().devotionals.find(
              (d) => d.id === devId && d.days.some((day) => day.dayNumber === 1),
            );
            if (existing) {
              // Generation finished! Transition straight to complete.
              logger.log('[generating] Devotional already complete in store after background return');
              setDevotionalTitle(existing.title);
              setCurrentSeriesTitle(existing.title);
              setGeneratedDays(existing.days);
              setIsGenerating(false);
              setIsComplete(true);
              setError(null);
              setIsReconnecting(false);
              generationInFlightRef.current = false;
              if (currentSession.status !== 'complete') {
                completeGenerationSession({ title: existing.title });
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              return;
            }
          }
        }

        // 2) If we came back and there's an error state, auto-retry transparently.
        //    The user sees "Reconnecting..." instead of the error wall.
        const { error: currentError, isComplete: alreadyComplete, isGenerating: stillGenerating } = latestStateRef.current;
        if (currentError && !alreadyComplete) {
          logger.log('[generating] Error detected on foreground return — auto-retrying');
          setIsReconnecting(true);
          setError(null);
          setGeneratedDays([]);
          setCurrentSeriesTitle('');
          setCanStartReading(false);
          setIsGenerating(true);
          generationInFlightRef.current = false; // Reset so the effect can re-run
          clearGenerationSession();
          // Small delay to let state settle, then trigger retry
          setTimeout(() => {
            setRetryCount((prev) => prev + 1);
          }, 300);
          return;
        }

        // 3) If generation is supposedly still running but the ref says the
        //    async work is no longer in-flight (JS thread was suspended mid-fetch,
        //    promise was silently dropped), restart it.
        if (stillGenerating && !alreadyComplete && !currentError && !generationInFlightRef.current && bgDuration > 5000) {
          logger.log('[generating] Generation appears stalled after background — restarting');
          setIsReconnecting(true);
          setGeneratedDays([]);
          setCurrentSeriesTitle('');
          setCanStartReading(false);
          setIsGenerating(true);
          clearGenerationSession();
          setTimeout(() => {
            setRetryCount((prev) => prev + 1);
          }, 300);
          return;
        }

        // 4) The fetch promise is technically still in-flight but may be hung
        //    (iOS killed the TCP socket while JS was suspended). Set a watchdog:
        //    if nothing changes after 8 seconds, force a restart.
        if (stillGenerating && !alreadyComplete && !currentError && generationInFlightRef.current && bgDuration > 10000) {
          logger.log('[generating] In-flight request may be hung after long background — starting watchdog');
          setTimeout(() => {
            const snap = latestStateRef.current;
            // If still generating with no error and no completion after 8s, it's hung
            if (snap.isGenerating && !snap.isComplete && !snap.error) {
              logger.log('[generating] Watchdog: request confirmed hung — forcing restart');
              setIsReconnecting(true);
              setError(null);
              setGeneratedDays([]);
              setCurrentSeriesTitle('');
              setCanStartReading(false);
              setIsGenerating(true);
              generationInFlightRef.current = false;
              clearGenerationSession();
              setTimeout(() => {
                setRetryCount((prev) => prev + 1);
              }, 300);
            }
          }, 8000);
        }
      }
    });

    return () => subscription.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Ripple animations — staggered rings expanding outward (skip if reduced motion)
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

      // Progressive recovery: if Day 1 already exists, skip generation entirely
      if (existingDevotional.generationMode === 'progressive' && existingDevotional.days.some(d => d.dayNumber === 1)) {
        setIsProgressiveMode(true);
        setDevotionalTitle(existingDevotional.title);
        setCurrentSeriesTitle(existingDevotional.title);
        setGeneratedDays(existingDevotional.days);
        completeGenerationSession({ title: existingDevotional.title });
        setIsGenerating(false);
        setIsComplete(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        generationInFlightRef.current = false;
        return;
      }
    }

    if (!hasRecoverableSession) {
      startGenerationSession({ devotionalId, totalDays: user.devotionalLength });
      void logBugEvent('generation', 'generation-session-created', {
        devotionalId,
        totalDays: user.devotionalLength,
      });
    }

    const generate = async () => {
      // Determine generation mode: new devotionals use progressive, recovery continues existing mode
      const useProgressive = existingDevotional
        ? existingDevotional.generationMode === 'progressive'
        : true;
      setIsProgressiveMode(useProgressive);

      if (useProgressive) {
        // === PROGRESSIVE MODE: Generate arc + Day 1 only ===
        try {
          const recentScriptures = getRecentScriptures(200);
          const previousSeriesTitles = devotionals
            .map(d => d.title)
            .filter((t): t is string => Boolean(t))
            .slice(-10);

          const context: GenerationContext = {
            name: user.name,
            aboutMe: user.aboutMe,
            currentSituation: user.currentSituation,
            emotionalState: user.emotionalState,
            spiritualSeeking: user.spiritualSeeking,
            readingDuration: user.readingDuration,
            devotionalLength: user.devotionalLength,
            bibleTranslation: user.bibleTranslation ?? 'WEB',
            usedScriptureHistory: recentScriptures,
            themeCategory: user.selectedTheme,
            devotionalType: user.selectedType,
            studySubject: user.selectedStudySubject,
            writingStyle: user.writingStyle,
            seriesPersonaHistory,
            previousSeriesTitles,
          };

          // Step 1: Generate series arc (~2s via Grok)
          void logBugEvent('generation', 'progressive-arc-start', { devotionalId });
          const { arc, title: seriesTitle } = await generateSeriesArc(context, recentScriptures);
          // If this was a reconnect retry, clear the reconnecting flag now that
          // we've confirmed the network is alive again.
          setIsReconnecting(false);
          setCurrentSeriesTitle(seriesTitle);
          updateGenerationSessionProgress({ title: seriesTitle });

          // Step 2: Resolve persona for voice/style
          const persona = resolvePersonaForGeneration(context);

          // Step 3: Create devotional shell in store (no days yet)
          const progressiveDevotional: Devotional = {
            id: devotionalId,
            title: seriesTitle,
            totalDays: user.devotionalLength,
            currentDay: 1,
            days: [],
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
            generationMode: 'progressive',
            seriesArc: arc,
            progressiveMemory: { fullDays: [], summaries: [], narrative: null },
          };
          addDevotional(progressiveDevotional);
          devotionalAddedToStore = true;

          // Step 4: Generate Day 1 (~10-15s via Claude Sonnet)
          void logBugEvent('generation', 'progressive-day1-start', { devotionalId });
          const emptyMemory: ProgressiveMemory = { fullDays: [], summaries: [], narrative: null };
          const day1 = await generateProgressiveDay(
            devotionalId, 1, arc, emptyMemory, context, recentScriptures, persona,
          );

          // Step 5: Store Day 1
          addGeneratedDay(devotionalId, day1);
          setGeneratedDays([day1]);

          // Step 6: Track scripture usage
          if (day1.scriptureReference) {
            const book = day1.scriptureReference.split(/\s+\d/)[0].trim();
            addUsedScriptures([{
              reference: day1.scriptureReference,
              book,
              usedAt: new Date().toISOString(),
              devotionalId,
            }]);
          }

          // Step 7: Record persona for cross-series freshness
          addSeriesPersonaRecord({
            devotionalId,
            primaryTrait: persona.primary,
            secondaryTrait: persona.secondary,
            templateSeed: persona.templateSeed,
            createdAt: new Date().toISOString(),
          });

          // Step 8: Update progressive generation state
          setProgressiveGeneration({
            devotionalId,
            isArcGenerated: true,
            currentDayGeneration: {
              dayNumber: 1,
              status: 'ready',
              completedAt: new Date().toISOString(),
              retryCount: 0,
            },
          });

          setDevotionalTitle(seriesTitle);
          completeGenerationSession({ title: seriesTitle });
          setPendingNotification({ title: seriesTitle });
          setIsGenerating(false);
          setIsComplete(true);
          setIsReconnecting(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          void logBugEvent('generation', 'progressive-generation-complete', {
            devotionalId,
            title: seriesTitle,
            dayTitle: day1.title,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          logger.error('Progressive generation failed:', errorMessage);
          Sentry.captureException(err, {
            tags: { phase: 'progressive-generation' },
            extra: { devotionalId, devotionalLength: user.devotionalLength },
          });
          failGenerationSession(errorMessage);
          void logBugError('generation', err, {
            devotionalId,
            phase: 'progressive-generation',
          });
          setIsGenerating(false);
          setIsReconnecting(false);
          setError(errorMessage);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
          generationInFlightRef.current = false;
        }
        return;
      }

      // === BATCH MODE (legacy / recovery) ===
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
              generationMode: 'batch',
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
          generationMode: 'batch',
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
        setIsReconnecting(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Generation failed:', errorMessage);
        failGenerationSession(errorMessage);
        void logBugError('generation', err, {
          devotionalId,
          phase: 'full-series-generation',
        });
        setIsGenerating(false);
        setIsReconnecting(false);
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

    const shouldShowSignIn =
      !user?.hasSeenSignInPrompt &&
      user?.authProvider === 'guest';

    if (shouldShowSignIn) {
      router.replace('/(onboarding)/sign-in?source=generating');
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
    setIsReconnecting(false);
    setGeneratedDays([]);
    setCurrentSeriesTitle('');
    setCanStartReading(false);
    setIsGenerating(true);
    generationInFlightRef.current = false; // Ensure stale guard is cleared
    setRetryCount(prev => prev + 1);
  };

  const handleRetryFromOnboarding = () => {
    if (isGenerating) return;
    void logBugEvent('generation', 'generation-restart-onboarding');
    clearGenerationSession();
    setError(null);
    router.replace('/onboarding');
  };

  const handleGoHome = () => {
    if (isGenerating) return;
    void logBugEvent('generation', 'generation-abandoned-go-home');
    clearGenerationSession();
    markFullGenerationInactive();
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

          <TouchableOpacity activeOpacity={0.7}
            onPress={handleRetry}
            disabled={isGenerating}
            accessibilityState={{ disabled: isGenerating }}
            style={[genStyles.retryButton, { backgroundColor: colors.buttonBackground, opacity: isGenerating ? 0.6 : 1 }]}
          >
            <Text style={[genStyles.retryButtonText, { color: colors.background }]}>
              Try again
            </Text>
          </TouchableOpacity>

          {!isConnectionError && (
            <TouchableOpacity activeOpacity={0.7}
              onPress={handleRetryFromOnboarding}
              disabled={isGenerating}
              accessibilityState={{ disabled: isGenerating }}
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

          {/* Water ripple — rings expanding from center (or simple spinner if reduced motion) */}
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

          {/* Rotating contemplative message — swapped for reconnecting msg when auto-retrying */}
          {!canStartReading && (
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
          )}

          {/* Series title reveal — in progressive mode shows when arc completes, in batch when Day 1 ready */}
          {currentSeriesTitle && (canStartReading || isProgressiveMode) && (
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

          {/* Day progress dots — batch mode only (progressive generates 1 day) */}
          {generatedDays.length > 0 && !isProgressiveMode && (
            <Animated.View
              entering={entering(FadeIn.duration(400))}
              style={genStyles.progressDotsRow}
            >
              {Array.from({ length: devotionalLength }).map((_, i) => {
                const isReady = i < generatedDays.length;
                return (
                  <View
                    key={i}
                    style={[
                      isReady ? genStyles.progressDotReady : genStyles.progressDotPending,
                      { backgroundColor: isReady ? colors.accent : colors.border },
                    ]}
                  />
                );
              })}
            </Animated.View>
          )}

          {/* Start reading early — batch mode only (progressive goes straight to complete) */}
          {canStartReading && isGenerating && !isProgressiveMode && (
            <View style={{ width: '100%', alignItems: 'center', marginTop: Spacing['12'] }}>
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleStartReadingEarly}
                style={{
                  backgroundColor: colors.accent,
                  paddingVertical: 18,
                  paddingHorizontal: Spacing['12'],
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
              </TouchableOpacity>

              <Text
                style={{
                  fontFamily: FontFamily.body,
                  fontSize: 13,
                  color: colors.textSubtle,
                  marginTop: Spacing['4'],
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

          {/* Already had notifications — gentle note */}
          {notificationPermission === 'granted' && !hasAskedPermission && !canStartReading && (
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
          {showSamplePreview && !canStartReading && isGenerating && (
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
  progressDotsRow: {
    flexDirection: 'row',
    gap: Spacing['1.5'],
    marginTop: Spacing['5'],
    alignItems: 'center',
  },
  progressDotReady: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressDotPending: {
    width: 6,
    height: 6,
    borderRadius: 4,
  },
});
