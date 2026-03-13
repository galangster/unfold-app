import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import BottomSheet from '@gorhom/bottom-sheet';
import { View, Text, ScrollView, Dimensions, ActivityIndicator, AccessibilityInfo, Platform, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  withDelay,
  runOnJS,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import { HouseIcon, BookmarkSimpleIcon, ArrowsClockwiseIcon, CaretDownIcon, BookOpenIcon, CaretLeftIcon, CaretRightIcon, PlayIcon, CheckIcon, UploadSimpleIcon, SunHorizonIcon } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { FontFamily } from '@/constants/fonts';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { refreshDailyReminder } from '@/lib/notifications';
import { continueGeneratingDays, isFullGenerationActive } from '@/lib/devotional-service';
import { triggerNextDayGeneration, evaluateSeriesExtension, generateArcExtension } from '@/lib/progressive-generation';
import { logBugEvent, logBugError } from '@/lib/bug-logger';
import { CompanionOrb } from '@/components/CompanionOrb';
import { generateBridge } from '@/lib/bridge-service';
import { CompletionCelebration } from '@/components/CompletionCelebration';
import { ShareDevotionalModal } from '@/components/ShareDevotionalModal';
import { DevotionalContent } from '@/components/reading/DevotionalContent';
import { createReviewPromptManager } from '@/lib/review-prompt';
import { AudioPlayer } from '@/components/AudioPlayerBottomSheet';
import { ScriptureTapSheet } from '@/components/ScriptureTapSheet';
import { getDefaultVoice, prefetchDevotionalAudio } from '@/lib/cartesia';
import { syncWidgets, startReadingSession, endReadingSession } from '@/lib/widget-bridge';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { PremiumNudgeCard } from '@/components/PremiumNudgeCard';
import { usePremiumNudge } from '@/hooks/usePremiumNudge';

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

  // Premium nudge system (audio teaser on reading screen)
  const { nudge: premiumNudge, onAction: nudgeAction, onDismiss: nudgeDismiss } = usePremiumNudge({ screen: 'reading' });

  const currentDevotional = useMemo(
    () => devotionals.find((d) => d.id === currentDevotionalId),
    [devotionals, currentDevotionalId]
  );

  const requestedDayNumber = parsePositiveInteger(params.dayNumber);

  const [viewingDay, setViewingDay] = useState(() => requestedDayNumber ?? currentDevotional?.currentDay ?? 1);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [isAudioPlayerVisible, setIsAudioPlayerVisible] = useState(false);
  const [audioToast, setAudioToast] = useState<{ visible: boolean; message: string } | null>(null);
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);
  const [premiumFeature, setPremiumFeature] = useState<'audio' | 'series' | 'general'>('audio');
  const audioPlayerRef = useRef<BottomSheet>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [scriptureSheetRef, setScriptureSheetRef] = useState<string | null>(null);
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
  const [isPreparingNextDay, setIsPreparingNextDay] = useState(false);
  const [showContinuationPrompt, setShowContinuationPrompt] = useState(false);
  const [continuationReason, setContinuationReason] = useState('');
  const [continuationDays, setContinuationDays] = useState(0);
  const [isExtendingArc, setIsExtendingArc] = useState(false);
  const [extensionError, setExtensionError] = useState(false);
  const [bridgeText, setBridgeText] = useState<string | null>(null);
  const [isBridgeLoading, setIsBridgeLoading] = useState(false);
  const mountedRef = useRef(true);
  const continuationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoBackgroundKickoffRef = useRef<Record<string, number>>({});
  const autoRetryAttemptsRef = useRef<Record<string, number>>({});
  const autoRetryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const translateX = useSharedValue(0);
  const chevronBounce = useSharedValue(0);
  const contentOpacity = useSharedValue(1);
  const bridgeOpacity = useSharedValue(0);

  // Button press micro-interaction — spring scale for Complete Day button
  const completeButtonScale = useSharedValue(1);
  const completeButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: completeButtonScale.value }],
  }));

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
  // Only show retry banner if this specific series has ungenerated days
  // Compare against totalDays (the series plan), not expectedDays (user preference)
  // Progressive mode generates days one at a time — don't show batch retry banner
  const showIncompleteJourneyRetry = availableDays < totalDays && currentDevotional?.generationMode !== 'progressive';
  const retryCtaButtonBg = colors.accent;
  const retryCtaButtonText = colors.background;
  const btnText = retryCtaButtonText;
  const retryCtaButtonBorder = colors.border;

  const canGoBack = viewingDay > 1;
  const canGoForward = viewingDay < availableDays;
  const isLastDay = viewingDay === totalDays;
  const isDayCompleted = currentDayData?.isRead ?? false;

  // Tomorrow preview data — next day in the series (0-indexed lookup)
  const tomorrowDayData = useMemo(() => {
    if (!currentDevotional) return null;
    // viewingDay is 1-indexed, so currentDevotional.days[viewingDay] is the next day
    return currentDevotional.days.find((d) => d.dayNumber === viewingDay + 1) ?? null;
  }, [currentDevotional, viewingDay]);

  const tomorrowTeaser = useMemo(() => {
    if (!tomorrowDayData?.bodyText) return null;
    // Extract first sentence as a teaser
    const firstSentence = tomorrowDayData.bodyText.match(/^[^.!?]+[.!?]/);
    return firstSentence ? firstSentence[0].trim() : tomorrowDayData.bodyText.slice(0, 120).trim() + '...';
  }, [tomorrowDayData]);

  // Cleanup mounted ref and continuation timer on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (continuationTimerRef.current) clearTimeout(continuationTimerRef.current);
    };
  }, []);

  // Bridge text — personalized transition passage for Day 2+
  useEffect(() => {
    if (viewingDay < 2 || !currentDevotional || !currentDayData || !user) {
      setBridgeText(null);
      setIsBridgeLoading(false);
      return;
    }

    let cancelled = false;
    setIsBridgeLoading(true);
    bridgeOpacity.value = 0;

    // Find yesterday's check-in if available
    const checkIns = useUnfoldStore.getState().checkIns;
    const yesterdayCheckIn = checkIns.find(
      (c) => c.devotionalId === currentDevotional.id && c.dayNumber === viewingDay - 1
    );

    void generateBridge(
      {
        userName: user.name,
        yesterdayCheckIn: yesterdayCheckIn
          ? { mood: yesterdayCheckIn.mood, moodLabel: yesterdayCheckIn.moodLabel, chipAnswer: yesterdayCheckIn.chipAnswer, freeText: yesterdayCheckIn.freeText }
          : undefined,
        todayTheme: currentDayData.title,
        todayScripture: `${currentDayData.scriptureReference}: ${currentDayData.scriptureText}`,
        currentSituation: user.currentSituation ?? '',
      },
      currentDevotional.id,
      viewingDay
    ).then((text) => {
      if (cancelled) return;
      setBridgeText(text);
      setIsBridgeLoading(false);
      if (text) {
        bridgeOpacity.value = withTiming(1, { duration: 400 });
      }
    });

    return () => { cancelled = true; };
  }, [viewingDay, currentDevotional?.id, currentDayData?.title, user?.name]);

  const bridgeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bridgeOpacity.value,
  }));

  // Prefetch audio while user reads — by the time they tap play, it's cached
  useEffect(() => {
    if (!isPremium || !currentDayData) return;
    const voiceId = user?.preferredVoice || getDefaultVoice();
    const fullText = `${currentDayData.bodyText}\n\n${currentDayData.scriptureReference}: ${currentDayData.scriptureText}`;
    prefetchDevotionalAudio(fullText, voiceId);
  }, [isPremium, currentDayData, user?.preferredVoice]);

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

  // Stop audio and close player when navigating between days
  useEffect(() => {
    if (isAudioPlayerVisible) {
      setIsAudioPlayerVisible(false);
      endReadingSession();
    }
  }, [viewingDay]);

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
      // Quick fade out → change day → fade in
      contentOpacity.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.ease) }, () => {
        runOnJS(setViewingDay)(day);
      });
      contentOpacity.value = withDelay(140, withTiming(1, { duration: 250, easing: Easing.in(Easing.ease) }));
    }
  }, [availableDays, contentOpacity]);

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

  const handleQuoteSelected = useCallback((quote: { text: string; context: string; serializedRange?: string; color?: string }) => {
    if (!currentDevotionalId || !currentDevotional || !currentDayData) return;

    addHighlight({
      devotionalId: currentDevotionalId,
      devotionalTitle: currentDevotional.title,
      dayNumber: viewingDay,
      dayTitle: currentDayData.title,
      highlightedText: quote.text,
      serializedRange: quote.serializedRange,
      color: (quote.color as import('@/lib/store').HighlightColor) || 'yellow',
      contextBefore: quote.context.substring(0, 100),
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [currentDevotionalId, currentDevotional, viewingDay, currentDayData, addHighlight]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const scrollContentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
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
        } else {
          // Rubber-band snap back with subtle haptic
          runOnJS(Haptics.selectionAsync)();
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
      pathname: '/(tabs)/(today)/journal',
      params: {
        devotionalId: currentDevotionalId ?? '',
        dayNumber: viewingDay.toString(),
      },
    });
  }, [currentDevotionalId, currentDevotional, currentDayData?.title, viewingDay, router, setResumeContext]);

  const handleGoHome = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/(today)');
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

      // Set flag for premium nudge system when series completes
      if (completingLastDay && currentDevotional?.title) {
        useUnfoldStore.getState().justCompletedSeriesTitle = null; // clear first
        useUnfoldStore.setState({ justCompletedSeriesTitle: currentDevotional.title });
      }

      // Announce completion to screen reader
      const announcement = completingLastDay
        ? 'Congratulations! You have completed your devotional journey.'
        : `Day ${viewingDay} completed. Great job!`;
      AccessibilityInfo.announceForAccessibility(announcement);

      if (viewingDay < expectedTotal) {
        advanceDay(currentDevotionalId);
        refreshDailyReminder();

        // Progressive mode: trigger next-day generation immediately
        if (currentDevotional?.generationMode === 'progressive') {
          setIsPreparingNextDay(true);
          triggerNextDayGeneration(currentDevotionalId, viewingDay)
            .finally(() => setIsPreparingNextDay(false));
        }
      }

      // Phase 5: Evaluate series extension for progressive devotionals completing last day
      const isProgressiveLastDay = completingLastDay && currentDevotional?.generationMode === 'progressive';
      if (isProgressiveLastDay) {
        // Run evaluation in background during celebration — result shows after dismissal
        evaluateSeriesExtension(currentDevotionalId).then((result) => {
          if (!mountedRef.current) return; // Guard against unmount
          if (result.shouldExtend && result.suggestedDays > 0) {
            setContinuationReason(result.reason);
            setContinuationDays(result.suggestedDays);
            // Don't show yet — wait for celebration dismiss
          }
        }).catch(() => {
          // Silent fail — extension is optional
        });
      }

      // Record streak read & sync widgets
      recordStreakRead();
      syncWidgets();

      // Check for review prompt eligibility — skip when continuation prompt is pending
      if (!isProgressiveLastDay) {
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
      } // end if (!isProgressiveLastDay)
    }
  }, [currentDevotionalId, viewingDay, totalDays, user?.devotionalLength, markDayAsRead, advanceDay, clearResumeContext, recordStreakRead, devotionals, journalEntries.length, reviewPromptLastDate, reviewPromptCount, hasReviewed, reviewPromptDaysAtLast, recordReviewPrompt]);

  // Phase 5: Handle "Keep Going" from continuation prompt
  const handleContinueJourney = useCallback(async () => {
    if (!currentDevotionalId || continuationDays <= 0) return;
    setIsExtendingArc(true);
    setExtensionError(false);
    try {
      const newHints = await generateArcExtension(currentDevotionalId, continuationDays);
      if (!mountedRef.current) return;
      useUnfoldStore.getState().extendSeriesArc(currentDevotionalId, newHints, continuationDays);
      // Advance to next day and trigger generation
      advanceDay(currentDevotionalId);
      // Read the completed day from store (not the stale closure) so triggerNext generates the right day
      const completedDay = useUnfoldStore.getState().devotionals.find(
        (d) => d.id === currentDevotionalId
      )?.currentDay ?? viewingDay;
      setIsPreparingNextDay(true);
      triggerNextDayGeneration(currentDevotionalId, completedDay - 1)
        .finally(() => { if (mountedRef.current) setIsPreparingNextDay(false); });
      setShowContinuationPrompt(false);
      setContinuationDays(0);
      setContinuationReason('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      if (!mountedRef.current) return;
      logBugError('progressive-gen', err instanceof Error ? err : new Error(String(err)), {
        action: 'continue-journey',
        devotionalId: currentDevotionalId,
      });
      // Show error state — user can retry or dismiss
      setExtensionError(true);
    } finally {
      if (mountedRef.current) setIsExtendingArc(false);
    }
  }, [currentDevotionalId, continuationDays, viewingDay, advanceDay]);

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
      const fixedDevotional = { ...currentDevotional, totalDays: targetTotalDays };
      const allDays = await continueGeneratingDays(
        fixedDevotional,
        {
          spiritualSeeking: user.spiritualSeeking ?? '',
          readingDuration: user.readingDuration,
          bibleTranslation: user.bibleTranslation ?? 'WEB',
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
        const fixedDevotional = { ...currentDevotional, totalDays: targetTotalDays };
        const allDays = await continueGeneratingDays(
          fixedDevotional,
          {
            spiritualSeeking: user.spiritualSeeking ?? '',
            readingDuration: user.readingDuration,
            bibleTranslation: user.bibleTranslation ?? 'WEB',
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
        // After generation, the store update triggers re-render automatically
        // No need to force re-render — currentDayData will update via useMemo
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
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
          {/* Back header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/(today)');
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              accessibilityHint="Return to home screen"
              style={{ padding: 8 }}
            >
              <CaretLeftIcon size={24} color={colors.textMuted} weight="light" />
            </TouchableOpacity>
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
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleRetryGeneration}
                accessibilityRole="button"
                accessibilityLabel="Generate remaining days"
                accessibilityHint={`Generate the remaining ${expectedDays - daysReady} days of your devotional`}
                accessibilityState={{ disabled: isRetrying }}
                style={{
                  backgroundColor: retryCtaButtonBg,
                  paddingVertical: 18,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: retryCtaButtonBorder,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  opacity: 1,
                }}
              >
                <ArrowsClockwiseIcon size={16} color={btnText} weight="light" />
                <Text
                  style={{
                    fontFamily: FontFamily.uiSemiBold,
                    fontSize: 16,
                    color: btnText,
                  }}
                >
                  Generate Remaining Days
                </Text>
              </TouchableOpacity>

              {/* Go back to last available day - same solid button style */}
              {daysReady > 0 && (
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setViewingDay(daysReady);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Go back to day ${daysReady}`}
                  accessibilityHint="Return to the last available day"
                  style={{
                    backgroundColor: retryCtaButtonBg,
                    paddingVertical: 16,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: retryCtaButtonBorder,
                    alignItems: 'center',
                    opacity: 1,
                  }}
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
                </TouchableOpacity>
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
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
            {/* Header */}
            <View style={{ backgroundColor: colors.background }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                }}
              >
              {/* Home button */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleGoHome}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Go home"
                accessibilityHint="Returns to the home screen"
                style={{ padding: 8 }}
              >
                <HouseIcon size={22} color={colors.textMuted} weight="light" />
              </TouchableOpacity>

              {/* Day indicator -- editorial serif typography */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({
                    pathname: '/(tabs)/(today)/day-menu',
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
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 4,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                {/* Left Chevron */}
                {viewingDay > 1 ? (
                  <CaretLeftIcon size={14} color={colors.textSubtle} weight="bold" />
                ) : (
                  <View style={{ width: 14 }} />
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.display,
                      fontSize: 18,
                      color: colors.text,
                      letterSpacing: 0.5,
                    }}
                  >
                    Day {viewingDay}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 12,
                      color: colors.textHint,
                    }}
                  >
                    of {currentDevotional.totalDays}
                  </Text>
                  {viewingDay === currentDevotional.currentDay && (
                    <View
                      style={{
                        backgroundColor: colors.accent + '20',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                        marginLeft: 2,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FontFamily.mono,
                          fontSize: 9,
                          color: colors.accent,
                          letterSpacing: 0.5,
                        }}
                      >
                        TODAY
                      </Text>
                    </View>
                  )}
                </View>

                {/* Right Chevron */}
                {viewingDay < availableDays ? (
                  <CaretRightIcon size={14} color={colors.textSubtle} weight="bold" />
                ) : (
                  <View style={{ width: 14 }} />
                )}
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                {/* Journal button */}
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({
                      pathname: '/(tabs)/(today)/journal',
                      params: {
                        devotionalId: currentDevotionalId,
                        dayNumber: String(viewingDay),
                      },
                    });
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Open journal"
                  accessibilityHint="Write a reflection about today's reading"
                  style={{ padding: 8 }}
                >
                  <BookOpenIcon
                    size={22}
                    color={colors.text}
                    weight="light"
                  />
                </TouchableOpacity>

                {/* Audio Player Button */}
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (!isPremium) {
                      setPremiumFeature('audio');
                      setShowPremiumSheet(true);
                      return;
                    }
                    if (!isAudioPlayerVisible) {
                      setIsAudioPlayerVisible(true);
                      // Track that user has used audio (for premium nudge system)
                      useUnfoldStore.getState().setHasUsedAudio();
                      startReadingSession({
                        devotionalTitle: currentDevotional?.title ?? 'Unfold',
                        dayTitle: currentDayData?.title ?? 'Reading',
                        dayNumber: viewingDay,
                        totalDays: totalDays,
                        totalMinutes: user?.readingDuration ?? 5,
                        isListening: true,
                      });
                      setTimeout(() => {
                        audioPlayerRef.current?.expand();
                      }, 50);
                    } else {
                      audioPlayerRef.current?.expand();
                    }
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Listen to devotional"
                  accessibilityHint={isPremium ? "Play audio version of today's reading" : "Premium feature. Upgrade to listen."}
                  style={{ padding: 8 }}
                >
                  <PlayIcon
                    size={22}
                    color={colors.text}
                    weight="fill"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Progress bar -- thin line showing position in series */}
            <View
              style={{
                height: 2,
                backgroundColor: colors.border,
                marginHorizontal: 24,
                borderRadius: 1,
                overflow: 'hidden',
              }}
            >
              <Animated.View
                style={{
                  height: 2,
                  borderRadius: 1,
                  backgroundColor: colors.accent,
                  width: `${(viewingDay / currentDevotional.totalDays) * 100}%`,
                  opacity: 0.7,
                }}
              />
            </View>
            </View>

            {/* Premium nudge banner — audio teaser */}
            {premiumNudge && (
              <PremiumNudgeCard
                type={premiumNudge.type}
                message={premiumNudge.message}
                cta={premiumNudge.cta}
                premiumFeature={premiumNudge.premiumFeature}
                onAction={nudgeAction}
                onDismiss={nudgeDismiss}
                variant="banner"
              />
            )}

            {/* Content - Scrollable with day-transition fade */}
            <Animated.ScrollView
              style={[{ flex: 1 }, scrollContentStyle]}
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 40,
                paddingBottom: 300,
              }}
              showsVerticalScrollIndicator={false}
              bounces={true}
              onScroll={handleScroll}
              scrollEventThrottle={150}
              removeClippedSubviews={true}
            >
              {/* Bridge text — personalized transition for Day 2+ */}
              {viewingDay >= 2 && isBridgeLoading && (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  style={{
                    marginBottom: 24,
                    padding: 16,
                    borderRadius: 12,
                    backgroundColor: colors.inputBackground,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  {/* Shimmer skeleton lines */}
                  <View style={{ gap: 8 }}>
                    <View style={{ height: 12, borderRadius: 6, backgroundColor: colors.buttonBackground, width: '90%' }} />
                    <View style={{ height: 12, borderRadius: 6, backgroundColor: colors.buttonBackground, width: '75%' }} />
                    <View style={{ height: 12, borderRadius: 6, backgroundColor: colors.buttonBackground, width: '60%' }} />
                  </View>
                </Animated.View>
              )}
              {viewingDay >= 2 && bridgeText && !isBridgeLoading && bridgeText.length > 20 && /[.!?…"']$/.test(bridgeText.trim()) && (
                <Animated.View
                  style={[
                    {
                      marginBottom: 24,
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 10,
                    },
                    bridgeAnimatedStyle,
                  ]}
                >
                  <View style={{ marginTop: 10 }}>
                    <CompanionOrb accentColor={colors.accent} size={24} />
                  </View>
                  <View
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: 16,
                      backgroundColor: colors.accent + '10',
                      borderWidth: 1,
                      borderColor: colors.accent + '20',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.body,
                        fontSize: 14,
                        lineHeight: 22,
                        color: colors.text,
                      }}
                    >
                      {bridgeText}
                    </Text>
                  </View>
                </Animated.View>
              )}

              <DevotionalContent
                day={currentDayData}
                fontSize={fontSize}
                titleSharedTransitionTag={`devotional-title-${currentDevotional.id}-${viewingDay}`}
                isBookmarked={isCurrentDayBookmarked}
                onToggleBookmark={handleToggleBookmark}
                onQuoteSelected={handleQuoteSelected}
                existingHighlights={currentDayHighlights}
                onScriptureTap={(ref) => setScriptureSheetRef(ref)}
                devotionalId={currentDevotionalId ?? ''}
                dayNumber={viewingDay}
                onOpenJournal={(focusQuestion) => {
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
                    pathname: '/(tabs)/(today)/journal',
                    params: {
                      devotionalId: currentDevotionalId ?? '',
                      dayNumber: viewingDay.toString(),
                      ...(focusQuestion != null ? { focusQuestion: String(focusQuestion) } : {}),
                    },
                  });
                }}
              />

              {/* Chevron at top of content area - invites scroll */}
              {showScrollHint && (
                <Animated.View
                  entering={FadeIn.duration(300)}
                  exiting={FadeOut.duration(300)}
                  style={{
                    alignItems: 'center',
                    marginTop: 20,
                    marginBottom: 10,
                  }}
                >
                  <Animated.View style={scrollHintStyle}>
                    <CaretDownIcon size={28} color={colors.accent} weight="light" />
                  </Animated.View>
                </Animated.View>
              )}

              {/* Section divider before complete button */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 48,
                  marginBottom: 8,
                  paddingHorizontal: 40,
                }}
              >
                <View style={{ flex: 1, height: 0.5, backgroundColor: colors.textMuted, opacity: 0.15 }} />
                <Text style={{ fontSize: 12, color: colors.textMuted, opacity: 0.25, letterSpacing: 6, marginHorizontal: 16 }}>
                  {'···'}
                </Text>
                <View style={{ flex: 1, height: 0.5, backgroundColor: colors.textMuted, opacity: 0.15 }} />
              </View>

              {/* Complete button + Share button row */}
              <Animated.View
                entering={FadeIn.delay(200).duration(400)}
                style={[{ marginTop: 32, paddingHorizontal: 24 }, completeButtonAnimStyle]}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  {/* Complete Day / Day Completed — View wrapper guarantees pill renders */}
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: isCompleted ? 'transparent' : colors.accent,
                      borderWidth: 1.5,
                      borderColor: colors.accent,
                      borderRadius: 28,
                      overflow: 'hidden',
                    }}
                  >
                    <TouchableOpacity activeOpacity={0.7}
                      onPress={!isCompleted ? handleComplete : undefined}
                      onPressIn={() => {
                        if (!isCompleted) {
                          completeButtonScale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
                        }
                      }}
                      onPressOut={() => {
                        completeButtonScale.value = withSpring(1, { damping: 15, stiffness: 400 });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={isCompleted ? 'Day completed' : (isLastDay ? 'Complete Journey' : 'Complete Day')}
                      style={{
                        paddingVertical: 18,
                        paddingHorizontal: 32,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 8,
                      }}
                    >
                      {isCompleted && (
                        <CheckIcon size={18} color={colors.accent} weight="bold" />
                      )}
                      <Text
                        style={{
                          fontFamily: FontFamily.uiSemiBold,
                          fontSize: 17,
                          color: isCompleted ? colors.accent : '#ffffff',
                          textAlign: 'center',
                          letterSpacing: 0.5,
                        }}
                      >
                        {isCompleted
                          ? 'Day Completed'
                          : isLastDay
                            ? 'Complete Journey'
                            : 'Complete Day'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Share — small icon circle */}
                  <TouchableOpacity
                    activeOpacity={0.6}
                    onPress={handleShare}
                    accessibilityRole="button"
                    accessibilityLabel="Share devotional"
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: colors.inputBackground,
                      borderWidth: 1,
                      borderColor: colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <UploadSimpleIcon size={20} color={colors.textMuted} weight="light" />
                  </TouchableOpacity>
                </View>

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
                          <TouchableOpacity activeOpacity={0.7}
                            onPress={handleGenerateMore}
                            style={{
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
                              opacity: 1,
                              minWidth: 240,
                            }}
                          >
                            <ArrowsClockwiseIcon size={15} color={retryCtaButtonText} weight="light" />
                            <Text
                              style={{
                                fontFamily: FontFamily.uiSemiBold,
                                fontSize: 15,
                                color: retryCtaButtonText,
                              }}
                            >
                              Generate Remaining Days
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity activeOpacity={0.7}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                              setPremiumFeature('series');
                              setShowPremiumSheet(true);
                            }}
                            style={{
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
                              opacity: 1,
                              minWidth: 240,
                            }}
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
                          </TouchableOpacity>
                        )}
                      </View>
                  )}

                  {/* Tomorrow Preview — shown after completing today's reading */}
                  {isCompleted && !showCelebration && tomorrowDayData && tomorrowTeaser && (
                    <Animated.View
                      entering={FadeIn.delay(300).duration(400)}
                      style={{
                        marginTop: 32,
                        paddingVertical: 18,
                        paddingHorizontal: 20,
                        borderRadius: 14,
                        backgroundColor: colors.inputBackground,
                        borderWidth: 1.5,
                        borderColor: colors.accent,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <SunHorizonIcon size={18} color={colors.accent} weight="light" />
                        <Text
                          style={{
                            fontFamily: FontFamily.uiMedium,
                            fontSize: 12,
                            color: colors.accent,
                            letterSpacing: 1,
                            textTransform: 'uppercase',
                          }}
                        >
                          Tomorrow
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontFamily: FontFamily.display,
                          fontSize: 20,
                          color: colors.text,
                          lineHeight: 26,
                          marginBottom: 8,
                        }}
                        numberOfLines={2}
                      >
                        {tomorrowDayData.title}
                      </Text>
                      <Text
                        style={{
                          fontFamily: FontFamily.body,
                          fontSize: 14,
                          color: colors.textMuted,
                          lineHeight: 21,
                        }}
                        numberOfLines={3}
                      >
                        {tomorrowTeaser}
                      </Text>
                    </Animated.View>
                  )}

                  {/* Preparing Tomorrow — progressive mode, next day being generated */}
                  {isCompleted && !showCelebration && !tomorrowDayData && isPreparingNextDay && (
                    <Animated.View
                      entering={FadeIn.delay(300).duration(400)}
                      style={{
                        marginTop: 32,
                        paddingVertical: 18,
                        paddingHorizontal: 20,
                        borderRadius: 14,
                        backgroundColor: colors.inputBackground,
                        borderWidth: 1,
                        borderColor: colors.border,
                        alignItems: 'center',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <SunHorizonIcon size={18} color={colors.accent} weight="light" />
                        <Text
                          style={{
                            fontFamily: FontFamily.uiMedium,
                            fontSize: 12,
                            color: colors.accent,
                            letterSpacing: 1,
                            textTransform: 'uppercase',
                          }}
                        >
                          Tomorrow
                        </Text>
                      </View>
                      <ActivityIndicator color={colors.accent} size="small" style={{ marginBottom: 10 }} />
                      <Text
                        style={{
                          fontFamily: FontFamily.bodyItalic,
                          fontSize: 14,
                          color: colors.textMuted,
                          textAlign: 'center',
                          lineHeight: 21,
                        }}
                      >
                        {'Preparing your next reading\u2026'}
                      </Text>
                    </Animated.View>
                  )}
              </Animated.View>
            </Animated.ScrollView>
          </SafeAreaView>
        </Animated.View>
      </GestureDetector>

      {/* Completion Celebration */}
      <CompletionCelebration
        visible={showCelebration}
        onDismiss={() => {
          setShowCelebration(false);
          // Show continuation prompt if extension was evaluated during celebration
          if (continuationDays > 0 && continuationReason) {
            continuationTimerRef.current = setTimeout(() => {
              if (mountedRef.current) setShowContinuationPrompt(true);
            }, 400);
          }
        }}
        type={celebrationType}
      />

      {/* Phase 5: Continuation Prompt */}
      <Modal visible={showContinuationPrompt} transparent animationType="fade" statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(8, 8, 8, 0.92)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 20, padding: 28, width: '100%', maxWidth: 340, alignItems: 'center' }}>
            <Text style={{ fontFamily: FontFamily.display, fontSize: 28, color: colors.text, textAlign: 'center', marginBottom: 12, letterSpacing: -0.5 }}>
              Your journey{'\n'}could continue
            </Text>
            <View style={{ width: 32, height: 1.5, backgroundColor: colors.accent, marginBottom: 16, borderRadius: 1 }} />
            <Text style={{ fontFamily: FontFamily.bodyItalic, fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
              {continuationReason}
            </Text>
            {extensionError && (
              <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: '#E55', textAlign: 'center', marginBottom: 12 }}>
                Something went wrong. Try again?
              </Text>
            )}
            <Pressable
              onPress={handleContinueJourney}
              style={{ backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center', marginBottom: 12, opacity: isExtendingArc ? 0.7 : 1 }}
              disabled={isExtendingArc}
            >
              {isExtendingArc ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: 16, color: '#fff' }}>
                  {extensionError ? 'Retry' : `Keep Going \u00B7 ${continuationDays} more days`}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setShowContinuationPrompt(false);
                setContinuationDays(0);
                setContinuationReason('');
                setExtensionError(false);
              }}
              style={{ paddingVertical: 10 }}
              disabled={isExtendingArc}
            >
              <Text style={{ fontFamily: FontFamily.ui, fontSize: 14, color: colors.textSecondary }}>
                I'm good for now
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Share Devotional Modal */}
      <ShareDevotionalModal
        visible={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        day={currentDayData}
        seriesTitle={currentDevotional.title}
      />

      {/* Audio Player Bottom Sheet */}
      {isPremium && isAudioPlayerVisible && currentDayData && (
        <AudioPlayer
          ref={audioPlayerRef}
          title={currentDayData.title}
          subtitle={`Day ${viewingDay} of ${currentDevotional.totalDays}`}
          content={currentDayData.bodyText}
          scriptureReference={currentDayData.scriptureReference}
          scriptureText={currentDayData.scriptureText}
          voiceId={user?.preferredVoice || getDefaultVoice()}
          isPremium={isPremium}
          onClose={() => {
            setIsAudioPlayerVisible(false);
            endReadingSession();
          }}
        />
      )}

      {/* Premium Toast Notification */}
      {audioToast?.visible && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={[
            styles.toastContainer,
            { backgroundColor: isDark ? 'rgba(40, 40, 40, 0.95)' : 'rgba(60, 60, 60, 0.95)' }
          ]}
        >
          <Text style={styles.toastText}>{audioToast.message}</Text>
        </Animated.View>
      )}

      {/* Scripture Tap Sheet */}
      <ScriptureTapSheet
        visible={!!scriptureSheetRef}
        onClose={() => setScriptureSheetRef(null)}
        reference={scriptureSheetRef ?? ''}
        devotionalId={currentDevotional.id}
        dayNumber={viewingDay}
        dayTitle={currentDayData?.title}
        devotionalTitle={currentDevotional.title}
      />

      <PremiumFeatureSheet
        visible={showPremiumSheet}
        onClose={() => setShowPremiumSheet(false)}
        feature={premiumFeature}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    bottom: 120,
    left: '10%',
    right: '10%',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});
