import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions, ActivityIndicator, AccessibilityInfo } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  runOnJS,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import { Home, Bookmark, RefreshCw, ChevronDown, BookOpen } from 'lucide-react-native';
import { SymbolView } from 'expo-symbols';
import { LinearGradient } from 'expo-linear-gradient';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { refreshDailyReminder } from '@/lib/notifications';
import { continueGeneratingDays, isFullGenerationActive } from '@/lib/devotional-service';
import { logBugEvent, logBugError } from '@/lib/bug-logger';
import { CompletionCelebration } from '@/components/CompletionCelebration';
import { ShareDevotionalModal } from '@/components/ShareDevotionalModal';
import { DevotionalContent } from '@/components/reading';
import { createReviewPromptManager } from '@/lib/review-prompt';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AUTO_RETRY_MAX_ATTEMPTS = 3;
const AUTO_RETRY_BASE_DELAY_MS = 15000;

function isTransientGenerationError(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    'network',
    'timeout',
    'timed out',
    'temporarily unavailable',
    'unable to connect',
    'fetch',
    'econn',
    'aborted',
    '503',
    '502',
  ].some((token) => normalized.includes(token));
}

function toFriendlyGenerationError(message: string): string {
  if (isTransientGenerationError(message)) {
    return 'Connection was interrupted while writing. Please try again in a moment.';
  }
  if (message.toLowerCase().includes('content filter')) {
    return 'We hit a temporary writing limitation. Please try generating again.';
  }
  return 'Could not finish writing the remaining days right now. Please try again.';
}

function parsePositiveInteger(value?: string | string[]): number | null {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function ReadingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ dayNumber?: string }>();
  const { colors, isDark } = useTheme();

  const devotionals = useUnfoldStore((s) => s.devotionals);
  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const markDayAsRead = useUnfoldStore((s) => s.markDayAsRead);
  const advanceDay = useUnfoldStore((s) => s.advanceDay);
  const updateDevotionalDays = useUnfoldStore((s) => s.updateDevotionalDays);
  const setResumeContext = useUnfoldStore((s) => s.setResumeContext);
  const clearResumeContext = useUnfoldStore((s) => s.clearResumeContext);
  const user = useUnfoldStore((s) => s.user);
  const addBookmark = useUnfoldStore((s) => s.addBookmark);
  const removeBookmark = useUnfoldStore((s) => s.removeBookmark);
  const addHighlight = useUnfoldStore((s) => s.addHighlight);
  const bookmarks = useUnfoldStore((s) => s.bookmarks);
  const highlights = useUnfoldStore((s) => s.highlights);
  const journalEntries = useUnfoldStore((s) => s.journalEntries);

  // Review prompt state
  const reviewPromptLastDate = useUnfoldStore((s) => s.reviewPromptLastDate);
  const reviewPromptCount = useUnfoldStore((s) => s.reviewPromptCount);
  const hasReviewed = useUnfoldStore((s) => s.hasReviewed);
  const reviewPromptDaysAtLast = useUnfoldStore((s) => s.reviewPromptDaysAtLast);
  const recordReviewPrompt = useUnfoldStore((s) => s.recordReviewPrompt);
  const recordStreakRead = useUnfoldStore((s) => s.recordStreakRead);

  const isPremium = user?.isPremium ?? false;

  const currentDevotional = useMemo(
    () => devotionals.find((d) => d.id === currentDevotionalId),
    [devotionals, currentDevotionalId]
  );

  const requestedDayNumber = parsePositiveInteger(params.dayNumber);

  const [viewingDay, setViewingDay] = useState(() => requestedDayNumber ?? currentDevotional?.currentDay ?? 1);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationType, setCelebrationType] = useState<'day' | 'series'>('day');
  const [showScrollHint, setShowScrollHint] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [autoRetryTick, setAutoRetryTick] = useState(0);
  const [autoRetryAttempt, setAutoRetryAttempt] = useState(0);
  const [autoRetryNextAt, setAutoRetryNextAt] = useState<number | null>(null);
  const [autoRetrySecondsLeft, setAutoRetrySecondsLeft] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isWaitingForConnection, setIsWaitingForConnection] = useState(false);
  const autoBackgroundKickoffRef = useRef<Record<string, number>>({});
  const autoRetryAttemptsRef = useRef<Record<string, number>>({});
  const autoRetryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const translateX = useSharedValue(0);
  const chevronBounce = useSharedValue(0);

  const fontSize = user?.fontSize ?? 'medium';

  const totalDays = currentDevotional?.totalDays ?? 1;
  const availableDays = currentDevotional?.days.length ?? 0;
  const currentDayData = currentDevotional?.days.find((d) => d.dayNumber === viewingDay);

  // Reactive bookmark check - fixes the bookmark icon not updating
  const isCurrentDayBookmarked = useMemo(() => {
    if (!currentDevotionalId) return false;
    return bookmarks.some((b) => b.devotionalId === currentDevotionalId && b.dayNumber === viewingDay);
  }, [bookmarks, currentDevotionalId, viewingDay]);

  // Get highlights for current day
  const currentDayHighlights = useMemo(() => {
    if (!currentDevotionalId) return [];
    return highlights.filter((h) => h.devotionalId === currentDevotionalId && h.dayNumber === viewingDay);
  }, [highlights, currentDevotionalId, viewingDay]);
  const expectedDays = Math.max(user?.devotionalLength ?? 0, totalDays);
  const showIncompleteJourneyRetry = availableDays < expectedDays;
  const retryCtaButtonBg = '#1C1710';
  const retryCtaButtonText = '#FFFFFF';
  const btnText = retryCtaButtonText; // Alias for compatibility
  const retryCtaButtonBorder = isDark ? 'rgba(245, 240, 235, 0.28)' : 'rgba(28, 23, 16, 0.22)';

  const canGoBack = viewingDay > 1;
  const canGoForward = viewingDay < availableDays;
  const isLastDay = viewingDay === totalDays;
  const isDayCompleted = currentDayData?.isRead ?? false;

  // Start the chevron bounce animation
  useEffect(() => {
    chevronBounce.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 600 }),
        withTiming(0, { duration: 600 })
      ),
      -1, // Infinite repeat
      true
    );
  }, []);

  // Network state for offline-aware retry behavior.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);

      void logBugEvent('reading-network', online ? 'network-online' : 'network-offline', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      });

      if (online) {
        // Kick retry loop immediately when connection comes back.
        setIsWaitingForConnection(false);
        setAutoRetryTick((tick) => tick + 1);
      }
    });

    return () => unsubscribe();
  }, []);

  // Countdown UI for scheduled auto-retry.
  // Only tick when the countdown is actually visible to avoid re-rendering
  // the full reading screen every second while user is actively reading.
  useEffect(() => {
    const countdownVisible = !currentDayData || (isCompleted && showIncompleteJourneyRetry);
    if (!autoRetryNextAt || !countdownVisible) return;

    const updateCountdown = () => {
      const seconds = Math.max(0, Math.ceil((autoRetryNextAt - Date.now()) / 1000));
      setAutoRetrySecondsLeft(seconds);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [autoRetryNextAt, currentDayData, isCompleted, showIncompleteJourneyRetry]);

  // Cleanup pending auto-retry timers when leaving screen
  useEffect(() => {
    return () => {
      Object.values(autoRetryTimersRef.current).forEach((timer) => clearTimeout(timer));
      autoRetryTimersRef.current = {};
    };
  }, []);

  // Reset isCompleted when changing days
  useEffect(() => {
    setIsCompleted(isDayCompleted);
  }, [viewingDay, isDayCompleted]);

  // Respect deep-linked day number (used by Resume card)
  useEffect(() => {
    if (requestedDayNumber && requestedDayNumber !== viewingDay) {
      setViewingDay(requestedDayNumber);
    }
  }, [requestedDayNumber, viewingDay]);

  // Persist latest reading context so Home can offer one-tap resume.
  useEffect(() => {
    if (!currentDevotionalId || !currentDevotional) return;

    setResumeContext({
      route: 'reading',
      devotionalId: currentDevotionalId,
      dayNumber: viewingDay,
      devotionalTitle: currentDevotional.title,
      dayTitle: currentDayData?.title,
      touchedAt: new Date().toISOString(),
    });
  }, [
    currentDevotionalId,
    currentDevotional,
    currentDayData?.title,
    viewingDay,
    setResumeContext,
  ]);

  const goToDay = useCallback((day: number) => {
    if (day >= 1 && day <= availableDays) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setViewingDay(day);
    }
  }, [availableDays]);

  const handlePrevious = useCallback(() => {
    if (viewingDay > 1) {
      goToDay(viewingDay - 1);
    }
  }, [viewingDay, goToDay]);

  const handleNext = useCallback(() => {
    if (viewingDay < availableDays) {
      goToDay(viewingDay + 1);
    }
  }, [viewingDay, availableDays, goToDay]);

  const handleToggleBookmark = useCallback(() => {
    if (!currentDevotionalId || !currentDevotional || !currentDayData) return;

    const existingBookmark = bookmarks.find(
      (b) => b.devotionalId === currentDevotionalId && b.dayNumber === viewingDay
    );

    if (existingBookmark) {
      removeBookmark(existingBookmark.id);
    } else {
      addBookmark({
        devotionalId: currentDevotionalId,
        devotionalTitle: currentDevotional.title,
        dayNumber: viewingDay,
        dayTitle: currentDayData.title,
        scriptureReference: currentDayData.scriptureReference,
        scriptureText: currentDayData.scriptureText,
      });
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [currentDevotionalId, currentDevotional, viewingDay, currentDayData, bookmarks, addBookmark, removeBookmark]);

  const handleQuoteSelected = useCallback((quote: { text: string; context: string; serializedRange?: string }) => {
    if (!currentDevotionalId || !currentDevotional || !currentDayData) return;

    addHighlight({
      devotionalId: currentDevotionalId,
      devotionalTitle: currentDevotional.title,
      dayNumber: viewingDay,
      dayTitle: currentDayData.title,
      highlightedText: quote.text,
      serializedRange: quote.serializedRange,
      contextBefore: quote.context.substring(0, 100),
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [currentDevotionalId, currentDevotional, viewingDay, currentDayData, addHighlight]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const scrollHintStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: chevronBounce.value }],
  }));

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX([-20, 20])
      .onUpdate((event) => {
        translateX.value = event.translationX * 0.3;
      })
      .onEnd((event) => {
        const goBack = event.translationX > 80 && viewingDay > 1;
        const goForward = event.translationX < -80 && viewingDay < availableDays;

        if (goBack) {
          runOnJS(handlePrevious)();
        } else if (goForward) {
          runOnJS(handleNext)();
        }
        translateX.value = withTiming(0, { duration: 200 });
      }),
    [viewingDay, availableDays, handlePrevious, handleNext]
  );

  const handleShare = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Share is now free for everyone to encourage viral growth
    setShareModalOpen(true);
  }, []);

  const handleJournal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (currentDevotionalId && currentDevotional) {
      setResumeContext({
        route: 'journal',
        devotionalId: currentDevotionalId,
        dayNumber: viewingDay,
        devotionalTitle: currentDevotional.title,
        dayTitle: currentDayData?.title,
        touchedAt: new Date().toISOString(),
      });
    }

    router.push({
      pathname: '/(main)/journal',
      params: {
        devotionalId: currentDevotionalId ?? '',
        dayNumber: viewingDay.toString(),
      },
    });
  }, [currentDevotionalId, currentDevotional, currentDayData?.title, viewingDay, router, setResumeContext]);

  const handleGoHome = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(main)/home');
  }, [router]);

  // Memoized scroll handler to prevent re-renders during scroll
  // Uses functional setState to avoid dependency on showScrollHint
  const handleScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    // Hide scroll hint after scrolling 100px
    setShowScrollHint((current) => {
      if (offsetY > 100 && current) return false;
      if (offsetY <= 50 && !current) return true;
      return current;
    });
  }, []);

  const handleComplete = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsCompleted(true);

    if (currentDevotionalId) {
      markDayAsRead(currentDevotionalId, viewingDay);

      // Clear resume context since user just completed this day
      clearResumeContext();

      // Use the user's intended devotional length to determine if this is truly the last day
      const expectedTotal = Math.max(totalDays, user?.devotionalLength ?? totalDays);
      const completingLastDay = viewingDay >= expectedTotal;
      setCelebrationType(completingLastDay ? 'series' : 'day');
      setShowCelebration(true);

      // Announce completion to screen reader
      const announcement = completingLastDay
        ? 'Congratulations! You have completed your devotional journey.'
        : `Day ${viewingDay} completed. Great job!`;
      AccessibilityInfo.announceForAccessibility(announcement);

      if (viewingDay < expectedTotal) {
        advanceDay(currentDevotionalId);
        refreshDailyReminder();
      }

      // Record streak read
      recordStreakRead();

      // Check for review prompt eligibility
      const reviewManager = createReviewPromptManager({
        reviewPromptLastDate,
        reviewPromptCount,
        hasReviewed,
        reviewPromptDaysAtLast,
      });

      // Calculate total days completed across all devotionals
      const totalDaysCompleted = devotionals.reduce((sum, d) =>
        sum + d.days.filter(day => day.isRead).length, 0
      );

      if (reviewManager.shouldPrompt({
        totalDaysCompleted,
        journalEntryCount: journalEntries.length,
        justCompletedDay: true,
      })) {
        // Small delay to let celebration show first
        setTimeout(async () => {
          const shown = await reviewManager.showPrompt();
          if (shown) {
            recordReviewPrompt(totalDaysCompleted);
          }
        }, 1500);
      }
    }
  }, [currentDevotionalId, viewingDay, totalDays, user?.devotionalLength, markDayAsRead, advanceDay, clearResumeContext, recordStreakRead, devotionals, journalEntries.length, reviewPromptLastDate, reviewPromptCount, hasReviewed, reviewPromptDaysAtLast, recordReviewPrompt]);

  const generateRemainingDays = useCallback(async (
    options?: { navigateToNextDay?: boolean; withHaptics?: boolean }
  ): Promise<{ ok: boolean; retriable: boolean }> => {
    const navigateToNextDay = options?.navigateToNextDay ?? false;
    const withHaptics = options?.withHaptics ?? false;

    if (!user || !currentDevotional || isGeneratingMore) {
      return { ok: false, retriable: false };
    }

    if (!isOnline) {
      void logBugEvent('reading-generation', 'continue-generation-blocked-offline', {
        devotionalId: currentDevotional.id,
      });
      if (withHaptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      setIsWaitingForConnection(true);
      return { ok: false, retriable: true };
    }

    // If initial full-series generation is still running, don't start a duplicate continuation job.
    if (isFullGenerationActive(currentDevotional.id)) {
      console.log('[Reading] Full generation already active; skipping duplicate continue job.');
      void logBugEvent('reading-generation', 'continue-generation-skipped-full-job-active', {
        devotionalId: currentDevotional.id,
      });
      return { ok: false, retriable: true };
    }

    setIsGeneratingMore(true);

    if (withHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const targetTotalDays = Math.max(currentDevotional.totalDays, user.devotionalLength);
      console.log(`[Reading] Continue generation: current days=${currentDevotional.days.length}, totalDays=${currentDevotional.totalDays}, target=${targetTotalDays}`);
      const fixedDevotional = { ...currentDevotional, totalDays: targetTotalDays };
      const allDays = await continueGeneratingDays(
        fixedDevotional,
        {
          spiritualSeeking: user.spiritualSeeking ?? '',
          readingDuration: user.readingDuration,
          bibleTranslation: user.bibleTranslation ?? 'NIV',
        },
        (day) => {
          const current = useUnfoldStore.getState().devotionals.find((d) => d.id === currentDevotional.id);
          if (current) {
            const updated = [...current.days];
            if (!updated.some((d) => d.dayNumber === day.dayNumber)) {
              updated.push(day);
              updateDevotionalDays(currentDevotional.id, updated);
            }
          }
        }
      );

      updateDevotionalDays(currentDevotional.id, allDays, currentDevotional.title);

      void logBugEvent('reading-generation', 'continue-generation-success', {
        devotionalId: currentDevotional.id,
        beforeDays: currentDevotional.days.length,
        afterDays: allDays.length,
      });

      if (withHaptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      if (navigateToNextDay) {
        const nextDay = currentDevotional.days.length + 1;
        if (allDays.some((d) => d.dayNumber === nextDay)) {
          setViewingDay(nextDay);
        }
      }

      return { ok: true, retriable: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retriable = isTransientGenerationError(message);
      console.error('[Reading] Generate more failed:', message);
      void logBugError('reading-generation', err, {
        devotionalId: currentDevotional.id,
        retriable,
      });
      if (withHaptics) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return { ok: false, retriable };
    } finally {
      setIsGeneratingMore(false);
    }
  }, [user, currentDevotional, isGeneratingMore, isOnline, updateDevotionalDays]);

  // Manual CTA from completion screen
  const handleGenerateMore = useCallback(async () => {
    await generateRemainingDays({ navigateToNextDay: true, withHaptics: true });
  }, [generateRemainingDays]);

  // Auto-continue generation in the background when Day 1 is ready but remaining days are missing.
  // Includes capped retry with backoff for transient network/service failures.
  useEffect(() => {
    if (!user || !currentDevotional || !isPremium || isGeneratingMore) return;

    const devotionalId = currentDevotional.id;
    const expectedTotalDays = Math.max(currentDevotional.totalDays, user.devotionalLength);
    const needsMoreDays = currentDevotional.days.length < expectedTotalDays;

    if (!needsMoreDays) {
      autoRetryAttemptsRef.current[devotionalId] = 0;
      setAutoRetryAttempt(0);
      setAutoRetryNextAt(null);
      setAutoRetrySecondsLeft(null);
      setIsWaitingForConnection(false);
      if (autoRetryTimersRef.current[devotionalId]) {
        clearTimeout(autoRetryTimersRef.current[devotionalId]);
        delete autoRetryTimersRef.current[devotionalId];
      }
      return;
    }

    if (!isOnline) {
      void logBugEvent('reading-generation', 'auto-retry-paused-offline', {
        devotionalId,
        availableDays: currentDevotional.days.length,
        expectedTotalDays,
      });
      setIsWaitingForConnection(true);
      setAutoRetryNextAt(null);
      setAutoRetrySecondsLeft(null);
      return;
    }

    setIsWaitingForConnection(false);

    const lastKickoffDayCount = autoBackgroundKickoffRef.current[devotionalId];
    if (lastKickoffDayCount === currentDevotional.days.length) return;

    autoBackgroundKickoffRef.current[devotionalId] = currentDevotional.days.length;

    void (async () => {
      const result = await generateRemainingDays({ navigateToNextDay: false, withHaptics: false });

      if (result.ok) {
        autoRetryAttemptsRef.current[devotionalId] = 0;
        setAutoRetryAttempt(0);
        setAutoRetryNextAt(null);
        setAutoRetrySecondsLeft(null);
        setIsWaitingForConnection(false);
        return;
      }

      // Allow re-attempts for this day-count checkpoint.
      delete autoBackgroundKickoffRef.current[devotionalId];

      if (!isOnline) {
        setIsWaitingForConnection(true);
        setAutoRetryNextAt(null);
        setAutoRetrySecondsLeft(null);
        return;
      }

      if (!result.retriable) {
        setAutoRetryNextAt(null);
        setAutoRetrySecondsLeft(null);
        return;
      }

      const attempts = (autoRetryAttemptsRef.current[devotionalId] ?? 0) + 1;
      autoRetryAttemptsRef.current[devotionalId] = attempts;

      if (attempts > AUTO_RETRY_MAX_ATTEMPTS) {
        console.log(`[Reading] Auto-retry cap reached for ${devotionalId}; waiting for manual retry.`);
        void logBugEvent('reading-generation', 'auto-retry-cap-reached', {
          devotionalId,
          attempts,
          maxAttempts: AUTO_RETRY_MAX_ATTEMPTS,
        }, 'warn');
        setAutoRetryNextAt(null);
        setAutoRetrySecondsLeft(null);
        return;
      }

      const delayMs = Math.min(AUTO_RETRY_BASE_DELAY_MS * attempts, 60000);
      console.log(`[Reading] Scheduling auto-retry ${attempts}/${AUTO_RETRY_MAX_ATTEMPTS} in ${Math.round(delayMs / 1000)}s`);
      void logBugEvent('reading-generation', 'auto-retry-scheduled', {
        devotionalId,
        attempt: attempts,
        maxAttempts: AUTO_RETRY_MAX_ATTEMPTS,
        delayMs,
      });

      setAutoRetryAttempt(attempts);
      setAutoRetryNextAt(Date.now() + delayMs);
      setAutoRetrySecondsLeft(Math.ceil(delayMs / 1000));

      if (autoRetryTimersRef.current[devotionalId]) {
        clearTimeout(autoRetryTimersRef.current[devotionalId]);
      }

      autoRetryTimersRef.current[devotionalId] = setTimeout(() => {
        setAutoRetryNextAt(null);
        setAutoRetrySecondsLeft(null);
        setAutoRetryTick((tick) => tick + 1);
      }, delayMs);
    })();
  }, [user, currentDevotional, isPremium, isGeneratingMore, generateRemainingDays, autoRetryTick, isOnline]);

  // Early returns after all hooks
  if (!currentDevotional) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontFamily: FontFamily.body, color: colors.textMuted }}>No journey found</Text>
      </View>
    );
  }

  if (!currentDayData) {
    // Day hasn't been generated yet
    const daysReady = currentDevotional.days.length;

    const handleRetryGeneration = async () => {
      if (!user || isRetrying) return;
      if (!isOnline) {
        void logBugEvent('reading-generation', 'manual-retry-blocked-offline', {
          viewingDay,
        }, 'warn');
        setRetryError('You appear to be offline. Reconnect and try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }

      void logBugEvent('reading-generation', 'manual-retry-started', {
        viewingDay,
      });

      setIsRetrying(true);
      setRetryError(null);
      setIsWaitingForConnection(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      try {
        const targetTotalDays = Math.max(currentDevotional.totalDays, user.devotionalLength, viewingDay);
        console.log(`[Reading] Retry: daysReady=${daysReady}, totalDays=${currentDevotional.totalDays}, target=${targetTotalDays}, viewingDay=${viewingDay}`);
        const fixedDevotional = { ...currentDevotional, totalDays: targetTotalDays };
        const allDays = await continueGeneratingDays(
          fixedDevotional,
          {
            spiritualSeeking: user.spiritualSeeking ?? '',
            readingDuration: user.readingDuration,
            bibleTranslation: user.bibleTranslation ?? 'NIV',
          },
          (day) => {
            const current = useUnfoldStore.getState().devotionals.find((d) => d.id === currentDevotional.id);
            if (current) {
              const updated = [...current.days];
              if (!updated.some((d) => d.dayNumber === day.dayNumber)) {
                updated.push(day);
                updateDevotionalDays(currentDevotional.id, updated);
              }
            }
          }
        );
        updateDevotionalDays(currentDevotional.id, allDays, currentDevotional.title);
        void logBugEvent('reading-generation', 'manual-retry-success', {
          viewingDay,
          totalDaysAfterRetry: allDays.length,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // After generation, try viewing the day that was requested
        if (allDays.some((d) => d.dayNumber === viewingDay)) {
          // Force re-render by toggling viewingDay
          setViewingDay(1);
          setTimeout(() => setViewingDay(viewingDay), 50);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong';
        console.error('[Reading] Retry generation failed:', msg);
        void logBugError('reading-generation', err, {
          viewingDay,
          phase: 'manual-retry',
        });
        setRetryError(toFriendlyGenerationError(msg));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setIsRetrying(false);
      }
    };

    // Use shared button colors defined at top level

    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          {/* Back header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(main)/home');
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              accessibilityHint="Return to home screen"
              style={{ padding: 8 }}
            >
              <SymbolView
                name="chevron.left"
                size={24}
                tintColor={colors.textMuted}
                weight="medium"
              />
            </Pressable>
          </View>

          {/* Center content */}
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36 }}>
            <Text
              style={{
                fontFamily: FontFamily.display,
                fontSize: 28,
                color: colors.text,
                textAlign: 'center',
                marginBottom: 14,
              }}
            >
              {isRetrying ? 'Writing...' : 'Not quite ready'}
            </Text>

            <Text
              style={{
                fontFamily: FontFamily.body,
                fontSize: 15,
                color: colors.textMuted,
                textAlign: 'center',
                lineHeight: 24,
              }}
            >
              {isRetrying
                ? 'Generating the remaining days.\nThis may take a moment.'
                : `Day ${viewingDay} hasn't been written yet.\n${daysReady} day${daysReady !== 1 ? 's' : ''} ready so far.`}
            </Text>

            {isWaitingForConnection && !isRetrying && (
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 12,
                  color: colors.textSubtle,
                  textAlign: 'center',
                  marginTop: 10,
                }}
              >
                Waiting for connection… we'll retry automatically when you're back online.
              </Text>
            )}

            {!isWaitingForConnection && autoRetrySecondsLeft !== null && !isRetrying && (
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 12,
                  color: colors.textSubtle,
                  textAlign: 'center',
                  marginTop: 10,
                }}
              >
                Retrying in {autoRetrySecondsLeft}s{autoRetryAttempt > 0 ? ` · attempt ${autoRetryAttempt}/${AUTO_RETRY_MAX_ATTEMPTS}` : ''}
              </Text>
            )}

            {isRetrying && (
              <ActivityIndicator
                color={colors.accent}
                size="large"
                style={{ marginTop: 24 }}
              />
            )}

            {retryError && !isRetrying && (
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 13,
                  color: colors.error,
                  textAlign: 'center',
                  marginTop: 12,
                }}
              >
                {retryError}
              </Text>
            )}
          </View>

          {/* Bottom buttons - always visible, fixed at bottom */}
          {!isRetrying && (
            <View style={{ paddingHorizontal: 28, paddingBottom: 20, gap: 12 }}>
              {/* Generate button - primary CTA, hardcoded colors */}
              <Pressable
                onPress={handleRetryGeneration}
                accessibilityRole="button"
                accessibilityLabel="Generate remaining days"
                accessibilityHint={`Generate the remaining ${expectedDays - daysReady} days of your devotional`}
                accessibilityState={{ disabled: isRetrying }}
                style={({ pressed }) => ({
                  backgroundColor: retryCtaButtonBg,
                  paddingVertical: 18,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: retryCtaButtonBorder,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <RefreshCw size={16} color={btnText} />
                <Text
                  style={{
                    fontFamily: FontFamily.uiSemiBold,
                    fontSize: 16,
                    color: btnText,
                  }}
                >
                  Generate Remaining Days
                </Text>
              </Pressable>

              {/* Go back to last available day - same solid button style */}
              {daysReady > 0 && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setViewingDay(daysReady);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Go back to day ${daysReady}`}
                  accessibilityHint="Return to the last available day"
                  style={({ pressed }) => ({
                    backgroundColor: retryCtaButtonBg,
                    paddingVertical: 16,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: retryCtaButtonBorder,
                    alignItems: 'center',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.uiSemiBold,
                      fontSize: 15,
                      color: btnText,
                    }}
                  >
                    Go back to Day {daysReady}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ flex: 1 }, contentStyle]}>
          <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            {/* Header with blur gradient */}
            <View style={{ position: 'relative' }}>
              <LinearGradient
                colors={[
                  colors.background,
                  `${colors.background}F0`,
                  `${colors.background}80`,
                  'transparent',
                ]}
                locations={[0, 0.4, 0.75, 1]}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 60,
                  zIndex: 1,
                }}
              />
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  position: 'relative',
                  zIndex: 2,
                }}
              >
              <Pressable
                onPress={handleGoHome}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Go home"
                accessibilityHint="Returns to the home screen"
                style={{ padding: 8 }}
              >
                <Home size={22} color={colors.textMuted} />
              </Pressable>

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({
                    pathname: '/(main)/day-menu',
                    params: {
                      devotionalId: currentDevotionalId ?? '',
                      currentDay: viewingDay.toString(),
                    },
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Day ${viewingDay} of ${currentDevotional.totalDays}`}
                accessibilityHint="Opens day selector menu"
                accessibilityValue={{ min: 1, max: currentDevotional.totalDays, now: viewingDay, text: `Day ${viewingDay} of ${currentDevotional.totalDays}` }}
                style={{ padding: 8 }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.mono,
                    fontSize: 12,
                    color: colors.textSubtle,
                    letterSpacing: 1,
                  }}
                >
                  DAY {viewingDay} OF {currentDevotional.totalDays}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (!isPremium) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    router.push('/paywall');
                    return;
                  }
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({
                    pathname: '/(main)/journal',
                    params: {
                      devotionalId: currentDevotionalId,
                      dayNumber: String(viewingDay),
                    },
                  });
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Open journal"
                accessibilityHint={!isPremium ? "Premium feature. Opens upgrade options." : "Write a reflection about today's reading"}
                accessibilityState={{ disabled: !isPremium }}
                style={{ padding: 8 }}
              >
                <BookOpen
                  size={22}
                  color={!isPremium ? colors.textMuted : colors.text}
                  strokeWidth={1.5}
                />
              </Pressable>
            </View>
            </View>

            {/* Content - Scrollable */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 20,
                paddingBottom: 300,
              }}
              showsVerticalScrollIndicator={false}
              bounces={true}
              onScroll={handleScroll}
              scrollEventThrottle={150}
              removeClippedSubviews={true}
            >
              <DevotionalContent
                day={currentDayData}
                fontSize={fontSize}
                titleSharedTransitionTag={`devotional-title-${currentDevotional.id}-${viewingDay}`}
                isBookmarked={isCurrentDayBookmarked}
                onToggleBookmark={handleToggleBookmark}
                onQuoteSelected={handleQuoteSelected}
                existingHighlights={currentDayHighlights}
              />

              {/* Complete button - show if viewing day not yet completed */}
              {!isCompleted && (
                <Animated.View
                  exiting={FadeOut.duration(200)}
                  style={{ marginTop: 48, alignItems: 'center' }}
                >
                  <Pressable
                    onPress={handleComplete}
                    accessibilityRole="button"
                    accessibilityLabel={isLastDay ? "Complete Journey" : "Complete Day"}
                    accessibilityHint={isLastDay ? "Marks your final day as complete and finishes this journey" : "Marks today's reading as complete"}
                    style={({ pressed }) => ({
                      backgroundColor: pressed ? colors.text : colors.buttonBackground,
                      paddingVertical: 18,
                      paddingHorizontal: 48,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: pressed ? colors.text : colors.border,
                    })}
                  >
                    {({ pressed }) => (
                      <Text
                        style={{
                          fontFamily: FontFamily.uiMedium,
                          fontSize: 16,
                          color: pressed ? colors.background : colors.text,
                          textAlign: 'center',
                        }}
                      >
                        {isLastDay ? 'Complete Journey' : 'Complete Day'}
                      </Text>
                    )}
                  </Pressable>
                </Animated.View>
              )}

              {/* Completed indicator */}
              {isCompleted && (
                <Animated.View
                  entering={FadeIn.duration(400)}
                  style={{ marginTop: 48, alignItems: 'center' }}
                >
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: 16,
                      color: colors.textMuted,
                    }}
                  >
                    Day completed
                  </Text>

                  {/* Show retry banner if devotional is incomplete - more days expected than available */}
                  {showIncompleteJourneyRetry && (
                    <View style={{ marginTop: 28, alignItems: 'center', paddingHorizontal: 20 }}>
                      <Text
                        style={{
                          fontFamily: FontFamily.body,
                          fontSize: 14,
                          color: colors.textMuted,
                          textAlign: 'center',
                          lineHeight: 22,
                          marginBottom: (isWaitingForConnection || autoRetrySecondsLeft !== null) ? 8 : 20,
                        }}
                      >
                        Your journey has more days that haven't been written yet.
                      </Text>
                      {isWaitingForConnection && !isGeneratingMore && (
                        <Text
                          style={{
                            fontFamily: FontFamily.ui,
                            fontSize: 12,
                            color: colors.textSubtle,
                            textAlign: 'center',
                            marginBottom: 16,
                          }}
                        >
                          Waiting for connection… we'll retry automatically when you're back online.
                        </Text>
                      )}
                      {!isWaitingForConnection && autoRetrySecondsLeft !== null && !isGeneratingMore && (
                        <Text
                          style={{
                            fontFamily: FontFamily.ui,
                            fontSize: 12,
                            color: colors.textSubtle,
                            textAlign: 'center',
                            marginBottom: 16,
                          }}
                        >
                          Retrying in {autoRetrySecondsLeft}s{autoRetryAttempt > 0 ? ` · attempt ${autoRetryAttempt}/${AUTO_RETRY_MAX_ATTEMPTS}` : ''}
                        </Text>
                      )}
                      {isGeneratingMore ? (
                          <View style={{ alignItems: 'center', gap: 12 }}>
                            <ActivityIndicator color={colors.accent} size="large" />
                            <Text
                              style={{
                                fontFamily: FontFamily.ui,
                                fontSize: 14,
                                color: colors.textMuted,
                              }}
                            >
                              Writing remaining days...
                            </Text>
                          </View>
                        ) : isPremium ? (
                          <Pressable
                            onPress={handleGenerateMore}
                            style={({ pressed }) => ({
                              backgroundColor: retryCtaButtonBg,
                              paddingVertical: 16,
                              paddingHorizontal: 32,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: retryCtaButtonBorder,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 10,
                              opacity: pressed ? 0.85 : 1,
                              minWidth: 240,
                            })}
                          >
                            <RefreshCw size={15} color={retryCtaButtonText} />
                            <Text
                              style={{
                                fontFamily: FontFamily.uiSemiBold,
                                fontSize: 15,
                                color: retryCtaButtonText,
                              }}
                            >
                              Generate Remaining Days
                            </Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              router.push('/paywall');
                            }}
                            style={({ pressed }) => ({
                              backgroundColor: retryCtaButtonBg,
                              paddingVertical: 16,
                              paddingHorizontal: 32,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: retryCtaButtonBorder,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 10,
                              opacity: pressed ? 0.85 : 1,
                              minWidth: 240,
                            })}
                          >
                            <Text
                              style={{
                                fontFamily: FontFamily.uiSemiBold,
                                fontSize: 15,
                                color: retryCtaButtonText,
                              }}
                            >
                              Subscribe to Continue
                            </Text>
                          </Pressable>
                        )}
                      </View>
                  )}
                </Animated.View>
              )}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </GestureDetector>

      {/* Scroll hint - appears above the native toolbar */}
      {showScrollHint && (
        <Animated.View
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(300)}
          style={{
            position: 'absolute',
            bottom: 80,
            left: 0,
            right: 0,
            alignItems: 'center',
          }}
        >
          <Animated.View style={scrollHintStyle}>
            <ChevronDown size={24} color={colors.textSubtle} />
          </Animated.View>
        </Animated.View>
      )}

      {/* Bottom Navigation Toolbar */}
      <View
        style={{
          position: 'absolute',
          bottom: 24,
          left: 0,
          right: 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          paddingHorizontal: 24,
        }}
        pointerEvents="box-none"
      >
        {/* Previous Day Button - Liquid Glass */}
        <Pressable
          onPress={handlePrevious}
          disabled={!canGoBack}
          style={({ pressed }) => ({
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: canGoBack
              ? (isDark ? 'rgba(120, 120, 128, 0.24)' : 'rgba(255, 255, 255, 0.7)')
              : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : (canGoBack ? 1 : 0.4),
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.4 : 0.15,
            shadowRadius: 12,
            elevation: canGoBack ? 6 : 0,
            borderWidth: 1,
            borderColor: canGoBack
              ? (isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.6)')
              : 'transparent',
          })}
        >
          <SymbolView
            name="chevron.left"
            size={20}
            tintColor={colors.text}
            weight="semibold"
          />
        </Pressable>

        {/* Share Button - Liquid Glass */}
        <Pressable
          onPress={handleShare}
          style={({ pressed }) => ({
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: isDark ? 'rgba(120, 120, 128, 0.32)' : 'rgba(255, 255, 255, 0.82)',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isDark ? 0.5 : 0.18,
            shadowRadius: 16,
            elevation: 8,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.7)',
          })}
        >
          <SymbolView
            name="square.and.arrow.up"
            size={24}
            tintColor={colors.text}
            weight="medium"
          />
        </Pressable>

        {/* Next Day Button - Liquid Glass */}
        <Pressable
          onPress={handleNext}
          disabled={!canGoForward}
          style={({ pressed }) => ({
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: canGoForward
              ? (isDark ? 'rgba(120, 120, 128, 0.24)' : 'rgba(255, 255, 255, 0.7)')
              : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : (canGoForward ? 1 : 0.4),
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.4 : 0.15,
            shadowRadius: 12,
            elevation: canGoForward ? 6 : 0,
            borderWidth: 1,
            borderColor: canGoForward
              ? (isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.6)')
              : 'transparent',
          })}
        >
          <SymbolView
            name="chevron.right"
            size={20}
            tintColor={colors.text}
            weight="semibold"
          />
        </Pressable>
      </View>

      {/* Completion Celebration */}
      <CompletionCelebration
        visible={showCelebration}
        onDismiss={() => {
          setShowCelebration(false);
          router.push('/(main)/home');
        }}
        type={celebrationType}
      />

      {/* Share Devotional Modal */}
      <ShareDevotionalModal
        visible={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        day={currentDayData}
        seriesTitle={currentDevotional.title}
      />
    </View>
  );
}
