import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, Dimensions, DimensionValue, ActivityIndicator, AccessibilityInfo, Platform, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';
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
  SlideInDown,
  SlideOutDown,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import { BookmarkSimpleIcon, ArrowsClockwiseIcon, CaretDownIcon, BookOpenIcon, CaretLeftIcon, CaretRightIcon, PlayIcon, CheckIcon, UploadSimpleIcon, SunHorizonIcon, TextAaIcon } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Shadow } from '@/constants/shadows';
import { Duration } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, FONT_SIZE_VALUES, READING_FONTS } from '@/lib/store';
import type { FontSize as FontSizePreference } from '@/lib/store';
import { refreshDailyReminder } from '@/lib/notifications';
import { continueGeneratingDays, isFullGenerationActive } from '@/lib/devotional-service';
import { submitGenerationJob } from '@/lib/generation-api';
import { logBugEvent, logBugError } from '@/lib/bug-logger';
import { logger } from '@/lib/logger';
import { CompanionOrb } from '@/components/CompanionOrb';
import { generateBridge } from '@/lib/bridge-service';
import { CompletionCelebration } from '@/components/CompletionCelebration';
// ShareDevotionalModal removed — pull quote share now uses /share-card route
import { DevotionalContent } from '@/components/reading/DevotionalContent';
import { StudyMethodSheet } from '@/components/reading/StudyMethodSheet';
import { createReviewPromptManager } from '@/lib/review-prompt';
import { useGlobalAudioPlayer } from '@/hooks/useGlobalAudioPlayer';
import { useAudioPlayerState } from '@/lib/audio-player-state';
import { ScriptureTapSheet } from '@/components/ScriptureTapSheet';
import { referenceToRoute } from '@/lib/bible-constants';
import { getDefaultVoice, prefetchDevotionalAudio, streamDevotionalAudio, buildTtsText } from '@/lib/tts-service';
import { syncWidgets, startReadingSession, endReadingSession } from '@/lib/widget-bridge';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { PremiumNudgeCard } from '@/components/PremiumNudgeCard';
import { usePremiumNudge } from '@/hooks/usePremiumNudge';
import { alpha } from '@/components/ui';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AUTO_RETRY_MAX_ATTEMPTS = 3;
const AUTO_RETRY_BASE_DELAY_MS = 15000;

function isTransientGenerationError(message: string): boolean {
  const normalized = message.toLowerCase();
  // Rate limit (429) is NOT transient — retrying just burns more quota
  if (normalized.includes('rate limit') || normalized.includes('429')) return false;
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

// ── Thin scroll progress bar pinned directly under the header ────
function ReadingProgressBar({ progress, accentColor }: { progress: SharedValue<number>; accentColor: string }) {
  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, progress.value * 100)}%`,
    opacity: progress.value > 0.005 ? 1 : 0,
  }));
  return (
    <View style={{ height: 2, backgroundColor: 'transparent' }}>
      <Animated.View style={[{ height: 2, borderRadius: 1, backgroundColor: accentColor }, barStyle]} />
    </View>
  );
}

// ── Animated shimmer bar for skeleton loaders ──────────────────
function ShimmerBar({ bg, width, delay }: { bg: string; width: DimensionValue; delay: number }) {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.85, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
    return () => { opacity.value = 0.35; };
  }, [delay]);

  const barStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View style={[barStyle, { height: 12, borderRadius: 6, backgroundColor: bg, width }]} />
  );
}

export default function ReadingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ dayNumber?: string }>();
  const { colors, isDark } = useTheme();
  const scrollViewRef = useRef<KeyboardAwareScrollViewRef>(null);

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
  const { startAudio, stopAudio } = useGlobalAudioPlayer();

  // Premium nudge system (audio teaser on reading screen)
  const { nudge: premiumNudge, onAction: nudgeAction, onDismiss: nudgeDismiss } = usePremiumNudge({ screen: 'reading' });

  const currentDevotional = useUnfoldStore(
    (s) => s.devotionals.find((d) => d.id === currentDevotionalId)
  );

  const requestedDayNumber = parsePositiveInteger(params.dayNumber);

  const [viewingDay, setViewingDay] = useState(() => {
    if (requestedDayNumber) return requestedDayNumber;
    if (!currentDevotional) return 1;
    const target = currentDevotional.currentDay;
    // If the target day has content, use it
    if (currentDevotional.days.some((d) => d.dayNumber === target)) return target;
    // Otherwise fall back to the last available day (so users can re-read, not hit a dead-end)
    return currentDevotional.days.length > 0 ? currentDevotional.days.length : 1;
  });
  // shareModalOpen removed — share now navigates to /share-card route
  const [audioToast, setAudioToast] = useState<{ visible: boolean; message: string } | null>(null);
  const [showReadingSettings, setShowReadingSettings] = useState(false);
  const [showPremiumSheet, setShowPremiumSheet] = useState(false);
  const [premiumFeature, setPremiumFeature] = useState<'audio' | 'series' | 'general'>('audio');
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);
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
  const [bookmarkToast, setBookmarkToast] = useState(false);
  const [selectedStudyMethod, setSelectedStudyMethod] = useState<string | undefined>(undefined);
  const mountedRef = useRef(true);
  const bookmarkToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [studyMethodVisible, setStudyMethodVisible] = useState(false);
  const continuationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoBackgroundKickoffRef = useRef<Record<string, number>>({});
  const autoRetryAttemptsRef = useRef<Record<string, number>>({});
  const autoRetryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const translateX = useSharedValue(0);
  const chevronBounce = useSharedValue(0);
  const contentOpacity = useSharedValue(1);
  const bridgeOpacity = useSharedValue(0);
  const scrollProgress = useSharedValue(0);

  // Bookmark toast auto-dismiss after 2.5s
  useEffect(() => {
    if (bookmarkToast) {
      bookmarkToastTimerRef.current = setTimeout(() => {
        setBookmarkToast(false);
      }, 2500);
    }
    return () => {
      if (bookmarkToastTimerRef.current) {
        clearTimeout(bookmarkToastTimerRef.current);
      }
    };
  }, [bookmarkToast]);

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
    // Strip markdown syntax so we get clean prose, not raw **bold** or *italic*
    const stripped = tomorrowDayData.bodyText
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
      .replace(/^---$/gm, '')
      .trim();
    const firstSentence = stripped.match(/^.+?[.!?]/s);
    return firstSentence ? firstSentence[0].trim() : stripped.slice(0, 130) + '\u2026';
  }, [tomorrowDayData]);

  // Cleanup mounted ref and continuation timer on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (continuationTimerRef.current) clearTimeout(continuationTimerRef.current);
      if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
      if (bookmarkToastTimerRef.current) clearTimeout(bookmarkToastTimerRef.current);
    };
  }, []);

  // Bridge text — personalized transition passage for Day 2+ (premium only)
  useEffect(() => {
    if (!isPremium || viewingDay < 2 || !currentDevotional || !currentDayData || !user) {
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

  // Audio narration disabled — TTS pipeline not yet production-ready
  // useEffect(() => {
  //   if (!isPremium || !currentDayData) return;
  //   const voiceId = user?.preferredVoice || getDefaultVoice();
  //   const fullText = buildTtsText(currentDayData);
  //   prefetchDevotionalAudio(fullText, voiceId);
  // }, [isPremium, currentDayData, user?.preferredVoice]);

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

  // Stop audio when navigating between days
  useEffect(() => {
    const audioDevotionalId = useAudioPlayerState.getState().devotionalId;
    if (audioDevotionalId) {
      stopAudio();
    }
  }, [viewingDay, stopAudio]);

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
      contentOpacity.value = withDelay(140, withTiming(1, { duration: Duration.normal, easing: Easing.in(Easing.ease) }));
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
        quotedText: currentDayData.quotableLine || undefined,
      });
      // Show bookmark toast on save only
      setBookmarkToast(true);
    }
    // Haptic removed — DevotionalContent handles it (Medium weight)
  }, [currentDevotionalId, currentDevotional, viewingDay, currentDayData, bookmarks, addBookmark, removeBookmark]);

  const handlePlayAudio = useCallback(async () => {
    if (!isPremium) {
      setPremiumFeature('audio');
      setShowPremiumSheet(true);
      return;
    }
    if (!currentDayData || isPreparingAudio) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    useUnfoldStore.getState().setHasUsedAudio();

    // Show loading state immediately — play button becomes spinner
    setIsPreparingAudio(true);

    // Show audio player sheet in loading state right away
    const metadata = {
      title: currentDayData?.title ?? 'Devotional',
      seriesTitle: currentDevotional?.title ?? '',
      devotionalId: currentDevotionalId ?? '',
      dayNumber: viewingDay,
    };
    useAudioPlayerState.getState().startAudio('', metadata);

    try {
      const voiceId = user?.preferredVoice || getDefaultVoice();
      const fullText = buildTtsText(currentDayData);
      const result = await streamDevotionalAudio(fullText, voiceId);

      // Start Live Activity only after audio is ready
      startReadingSession({
        devotionalTitle: currentDevotional?.title ?? 'Unfold',
        dayTitle: currentDayData?.title ?? 'Reading',
        dayNumber: viewingDay,
        totalDays: totalDays,
        totalMinutes: user?.readingDuration ?? 5,
        isListening: true,
      });

      // Feed the real audio URL — auto-plays
      startAudio(result.audioUrl, metadata);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'TTS_AUTH_REQUIRED' || msg.includes('401')) {
        logger.warn('[Reading] Audio auth error (token may have expired)');
        setAudioToast({ visible: true, message: 'Audio unavailable — please try again' });
        setTimeout(() => setAudioToast(null), 3000);
      } else {
        logger.error('[Reading] Failed to load audio:', e);
        setAudioToast({ visible: true, message: 'Audio unavailable — try again later' });
        setTimeout(() => setAudioToast(null), 3000);
      }
      // Dismiss the loading sheet on error
      useAudioPlayerState.getState().stopAudio();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsPreparingAudio(false);
    }
  }, [isPremium, currentDayData, currentDevotional, currentDevotionalId, user?.preferredVoice, viewingDay, totalDays, user?.readingDuration, startAudio, isPreparingAudio]);

  const handleStudyMethodPress = useCallback((methodId: string) => {
    // Audio continues playing behind the study method sheet (spec requirement)
    setSelectedStudyMethod(methodId);
    setStudyMethodVisible(true);
  }, []);

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
        translateX.value = withTiming(0, { duration: Duration.normal });
      }),
    [viewingDay, availableDays, handlePrevious, handleNext]
  );

  const handleShare = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigate to share-card route (same design as scripture share)
    const quoteText = currentDayData?.quotableLine || currentDayData?.title || '';
    const dayLabel = currentDayData?.title || '';
    router.push({
      pathname: '/share-card',
      params: {
        text: quoteText,
        reference: dayLabel,
        type: 'quote',
      },
    });
  }, [currentDayData, currentDevotional, viewingDay, router]);

  const handleJournal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // If viewing an unread day, journal for the last completed day instead
    const journalDay = currentDayData?.isRead
      ? viewingDay
      : currentDevotional?.days
          .filter((d) => d.isRead)
          .sort((a, b) => b.dayNumber - a.dayNumber)[0]?.dayNumber ?? viewingDay;
    const journalDayData = currentDevotional?.days.find((d) => d.dayNumber === journalDay);

    if (currentDevotionalId && currentDevotional) {
      setResumeContext({
        route: 'journal',
        devotionalId: currentDevotionalId,
        dayNumber: journalDay,
        devotionalTitle: currentDevotional.title,
        dayTitle: journalDayData?.title ?? currentDayData?.title,
        touchedAt: new Date().toISOString(),
      });
    }

    router.push({
      pathname: '/(tabs)/(today)/journal',
      params: {
        devotionalId: currentDevotionalId ?? '',
        dayNumber: journalDay.toString(),
      },
    });
  }, [currentDevotionalId, currentDevotional, currentDayData, viewingDay, router, setResumeContext]);

  // Memoized scroll handler — tracks progress bar + scroll hint visibility
  const handleScroll = useCallback((e: {
    nativeEvent: {
      contentOffset: { y: number };
      contentSize: { height: number };
      layoutMeasurement: { height: number };
    }
  }) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    const totalHeight = e.nativeEvent.contentSize.height;
    const viewHeight = e.nativeEvent.layoutMeasurement.height;
    const scrollable = totalHeight - viewHeight;
    if (scrollable > 0) {
      scrollProgress.value = withTiming(
        Math.min(1, Math.max(0, offsetY / scrollable)),
        { duration: 80 }
      );
    }
    setShowScrollHint((current) => {
      if (offsetY > 100 && current) return false;
      if (offsetY <= 50 && !current) return true;
      return current;
    });
  }, [scrollProgress]);

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
        ? 'Congratulations! You\'ve completed this devotional series.'
        : `Day ${viewingDay} completed. Great job!`;
      AccessibilityInfo.announceForAccessibility(announcement);

      if (viewingDay < expectedTotal) {
        advanceDay(currentDevotionalId);
        refreshDailyReminder();

        // Progressive mode: fire-and-forget server-side generation for the next day
        if (currentDevotional?.generationMode === 'progressive') {
          submitGenerationJob({
            devotionalId: currentDevotionalId,
            dayNumber: viewingDay + 1,
            jobType: 'day',
          }).catch((err) => {
            console.warn('[day-complete] Failed to submit next-day server job:', err);
          });
        }
      }

      // Phase 5: Evaluate series extension for progressive devotionals completing last day
      // Server-side handles extension evaluation — submit a job for it
      const isProgressiveLastDay = completingLastDay && currentDevotional?.generationMode === 'progressive';
      if (isProgressiveLastDay) {
        submitGenerationJob({
          devotionalId: currentDevotionalId,
          dayNumber: viewingDay,
          jobType: 'extension_eval',
        }).catch(() => {
          // Silent fail — extension is optional
        });
      }

      // Record streak read & sync widgets
      recordStreakRead();
      syncWidgets();

      // Check for review prompt eligibility at high-dopamine moments
      {
        const reviewManager = createReviewPromptManager({
          reviewPromptLastDate,
          reviewPromptCount,
          hasReviewed,
          reviewPromptDaysAtLast,
        });

        // Calculate total days completed across all devotionals
        const totalDaysCompleted = useUnfoldStore.getState().devotionals.reduce((sum, d) =>
          sum + (d.days ?? []).filter(day => day.isRead).length, 0
        );

        const streakCurrent = useUnfoldStore.getState().streakCurrent;

        if (reviewManager.shouldPrompt({
          totalDaysCompleted,
          journalEntryCount: journalEntries.length,
          justCompletedDay: true,
          currentStreak: streakCurrent,
          justCompletedSeries: completingLastDay,
        })) {
          // Delay lets celebration animation play first
          if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
          reviewTimerRef.current = setTimeout(async () => {
            if (!mountedRef.current) return;
            const shown = await reviewManager.showPrompt();
            if (shown) {
              recordReviewPrompt(totalDaysCompleted);
            }
          }, 2000);
        }
      }
    }
  }, [currentDevotionalId, viewingDay, totalDays, user?.devotionalLength, markDayAsRead, advanceDay, clearResumeContext, recordStreakRead, syncWidgets, journalEntries.length, reviewPromptLastDate, reviewPromptCount, hasReviewed, reviewPromptDaysAtLast, recordReviewPrompt]);

  // Phase 5: Handle "Keep Going" from continuation prompt
  // Server-side handles arc extension and next-day generation
  const handleContinueJourney = useCallback(async () => {
    if (!currentDevotionalId || continuationDays <= 0) return;
    setIsExtendingArc(true);
    setExtensionError(false);
    try {
      // Submit server-side arc extension + generation job
      await submitGenerationJob({
        devotionalId: currentDevotionalId,
        dayNumber: continuationDays,
        jobType: 'arc_extension',
      });
      if (!mountedRef.current) return;
      advanceDay(currentDevotionalId);
      setIsPreparingNextDay(true);
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
  }, [currentDevotionalId, continuationDays, advanceDay]);

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
      logger.error('[Reading] Generate more failed:', message);
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

  // Stable primitives for the auto-generate effect — avoids re-triggering on
  // Zustand object reference changes when sync updates create new state objects.
  const devoId = currentDevotional?.id;
  const devoTotalDays = currentDevotional?.totalDays ?? 0;
  const devoDaysCount = currentDevotional?.days?.length ?? 0;

  // Auto-continue generation in the background when Day 1 is ready but remaining days are missing.
  // Includes capped retry with backoff for transient network/service failures.
  useEffect(() => {
    if (!user || !devoId || !isPremium || isGeneratingMore) return;

    const devotionalId = devoId;
    const expectedTotalDays = Math.max(devoTotalDays, user.devotionalLength);
    const needsMoreDays = devoDaysCount < expectedTotalDays;

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
        availableDays: devoDaysCount,
        expectedTotalDays,
      });
      setIsWaitingForConnection(true);
      setAutoRetryNextAt(null);
      setAutoRetrySecondsLeft(null);
      return;
    }

    setIsWaitingForConnection(false);

    const lastKickoffDayCount = autoBackgroundKickoffRef.current[devotionalId];
    if (lastKickoffDayCount === devoDaysCount) return;

    autoBackgroundKickoffRef.current[devotionalId] = devoDaysCount;

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

      if (!isOnline) {
        delete autoBackgroundKickoffRef.current[devotionalId];
        setIsWaitingForConnection(true);
        setAutoRetryNextAt(null);
        setAutoRetrySecondsLeft(null);
        return;
      }

      if (!result.retriable) {
        // Keep the ref so the guard prevents re-entry on next effect cycle
        setAutoRetryNextAt(null);
        setAutoRetrySecondsLeft(null);
        return;
      }

      // Allow re-attempts for retriable errors only
      delete autoBackgroundKickoffRef.current[devotionalId];

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
  }, [user, devoId, devoTotalDays, devoDaysCount, isPremium, isGeneratingMore, generateRemainingDays, autoRetryTick, isOnline]);

  // Early returns after all hooks
  if (!currentDevotional) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontFamily: FontFamily.body, color: colors.textMuted }}>No series found</Text>
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
        // Progressive mode: submit server-side generation job
        if (currentDevotional.generationMode === 'progressive') {
          await submitGenerationJob({
            devotionalId: currentDevotionalId!,
            dayNumber: viewingDay,
            jobType: 'day',
          });
          void logBugEvent('reading-generation', 'manual-retry-progressive-success', {
            viewingDay,
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          // Batch mode: generate all remaining days
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
        }
        // After generation, the store update triggers re-render automatically
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong';
        logger.error('[Reading] Retry generation failed:', msg);
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
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}>
            <TouchableOpacity activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/(today)');
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              accessibilityHint="Return to home screen"
              style={{ padding: Spacing['2'] }}
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
              {isRetrying ? 'Writing...' : 'Still being written'}
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
                  fontSize: FontSize.xs,
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
                  fontSize: FontSize.xs,
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
                style={{ marginTop: Spacing['6'] }}
              />
            )}

            {retryError && !isRetrying && (
              <Text
                style={{
                  fontFamily: FontFamily.ui,
                  fontSize: 13,
                  color: colors.error,
                  textAlign: 'center',
                  marginTop: Spacing['3'],
                }}
              >
                {retryError}
              </Text>
            )}
          </View>

          {/* Bottom buttons - always visible, fixed at bottom */}
          {!isRetrying && (
            <View style={{ paddingHorizontal: Spacing['7'], paddingBottom: Spacing['5'], gap: Spacing['3'] }}>
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
                  borderRadius: Radius.card,
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
                    fontSize: FontSize.base,
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
                    paddingVertical: Spacing['4'],
                    borderRadius: Radius.card,
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
                  paddingHorizontal: Spacing['4'],
                  paddingVertical: 10,
                }}
              >
              {/* Day indicator -- editorial serif typography, left-aligned */}
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text
                    style={{
                      fontFamily: FontFamily.uiMedium,
                      fontSize: FontSize.lg,
                      color: colors.text,
                    }}
                  >
                    Day {viewingDay} of {currentDevotional.totalDays}
                  </Text>
                  {viewingDay === currentDevotional.currentDay && (
                    <View
                      style={{
                        backgroundColor: alpha(colors.accent, 0.13),
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                        marginLeft: 2,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: FontFamily.uiMedium,
                          fontSize: 9,
                          color: colors.accent,
                          letterSpacing: 0.8,
                        }}
                      >
                        TODAY
                      </Text>
                    </View>
                  )}
                </View>

                {/* Right Chevron */}
                {viewingDay < availableDays ? (
                  <CaretRightIcon size={18} color={colors.text} weight="regular" />
                ) : (
                  <View style={{ width: 18 }} />
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
                  style={{ padding: Spacing['2'] }}
                >
                  <BookOpenIcon
                    size={22}
                    color={colors.text}
                    weight="light"
                  />
                </TouchableOpacity>

                {/* Reading Settings (Aa) Button */}
                <TouchableOpacity activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowReadingSettings(true);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Reading settings"
                  accessibilityHint="Adjust font size and reading font"
                  style={{ padding: Spacing['2'] }}
                >
                  <TextAaIcon size={22} color={colors.text} weight="light" />
                </TouchableOpacity>

                {/* Audio Player Button — hidden until TTS pipeline is production-ready */}
              </View>
            </View>

            </View>

            {/* Scroll progress bar — animated thin line below header */}
            <ReadingProgressBar progress={scrollProgress} accentColor={colors.accent} />

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

            {/* Content - Scrollable with day-transition fade + keyboard-aware scrolling */}
            <Animated.View style={[{ flex: 1 }, scrollContentStyle]}>
            <KeyboardAwareScrollView
              ref={scrollViewRef}
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: Spacing['6'],
                paddingTop: Spacing['10'],
                paddingBottom: 300,
              }}
              showsVerticalScrollIndicator={false}
              bounces={true}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              bottomOffset={20}
              extraKeyboardSpace={60}
            >
              {/* Bridge text — personalized transition for Day 2+ */}
              {viewingDay >= 2 && isBridgeLoading && (
                <Animated.View
                  entering={FadeIn.duration(Duration.normal)}
                  style={{
                    marginBottom: Spacing['6'],
                    padding: Spacing['4'],
                    borderRadius: Radius.md,
                    backgroundColor: colors.inputBackground,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  {/* Shimmer skeleton lines */}
                  <View style={{ gap: Spacing['2'] }}>
                    <ShimmerBar bg={colors.buttonBackground} width="90%" delay={0} />
                    <ShimmerBar bg={colors.buttonBackground} width="75%" delay={120} />
                    <ShimmerBar bg={colors.buttonBackground} width="60%" delay={240} />
                  </View>
                </Animated.View>
              )}
              {viewingDay >= 2 && bridgeText && !isBridgeLoading && bridgeText.length > 20 && /[.!?…"']$/.test(bridgeText.trim()) && (
                <Animated.View
                  style={[
                    {
                      marginBottom: Spacing['6'],
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
                      paddingVertical: Spacing['3'],
                      paddingHorizontal: 14,
                      borderRadius: Radius.lg,
                      backgroundColor: alpha(colors.accent, 0.06),
                      borderWidth: 1,
                      borderColor: alpha(colors.accent, 0.13),
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: FontFamily.body,
                        fontSize: FontSize.sm,
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
                onStudyMethodPress={handleStudyMethodPress}
                onQuoteSelected={handleQuoteSelected}
                existingHighlights={currentDayHighlights}
                scrollViewRef={scrollViewRef}
                onScriptureTap={(ref) => {
                  const parsed = referenceToRoute(ref);
                  if (parsed) {
                    router.push({
                      pathname: '/(tabs)/(bible)/reader',
                      params: {
                        bookId: String(parsed.bookId),
                        chapter: String(parsed.chapter),
                        ...(parsed.verse ? { verse: String(parsed.verse) } : {}),
                      },
                    });
                  } else {
                    // Fallback to scripture sheet if reference can't be parsed
                    setScriptureSheetRef(ref);
                  }
                }}
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
                  entering={FadeIn.duration(Duration.slow)}
                  exiting={FadeOut.duration(Duration.slow)}
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
                <Text style={{ fontSize: FontSize.xs, color: colors.textMuted, opacity: 0.25, letterSpacing: 6, marginHorizontal: Spacing['4'] }}>
                  {'···'}
                </Text>
                <View style={{ flex: 1, height: 0.5, backgroundColor: colors.textMuted, opacity: 0.15 }} />
              </View>

              {/* Complete button + Share button row */}
              <Animated.View
                entering={FadeIn.delay(200).duration(400)}
                style={[{ marginTop: Spacing['8'], paddingHorizontal: Spacing['6'] }, completeButtonAnimStyle]}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    gap: Spacing['3'],
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
                          completeButtonScale.value = withSpring(0.96, { damping: 40, stiffness: 400 });
                        }
                      }}
                      onPressOut={() => {
                        completeButtonScale.value = withSpring(1, { damping: 40, stiffness: 400 });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={isCompleted ? 'Day completed' : (isLastDay ? 'Complete Series' : 'Complete Day')}
                      style={{
                        paddingVertical: 18,
                        paddingHorizontal: Spacing['8'],
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: Spacing['2'],
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
                            ? 'Complete Series'
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
                    <View style={{ marginTop: 28, alignItems: 'center', paddingHorizontal: Spacing['5'] }}>
                      <Text
                        style={{
                          fontFamily: FontFamily.body,
                          fontSize: FontSize.sm,
                          color: colors.textMuted,
                          textAlign: 'center',
                          lineHeight: 22,
                          marginBottom: (isWaitingForConnection || autoRetrySecondsLeft !== null) ? Spacing['2'] : Spacing['5'],
                        }}
                      >
                        More days are on the way for this series.
                      </Text>
                      {isWaitingForConnection && !isGeneratingMore && (
                        <Text
                          style={{
                            fontFamily: FontFamily.ui,
                            fontSize: FontSize.xs,
                            color: colors.textSubtle,
                            textAlign: 'center',
                            marginBottom: Spacing['4'],
                          }}
                        >
                          Waiting for connection… we'll retry automatically when you're back online.
                        </Text>
                      )}
                      {!isWaitingForConnection && autoRetrySecondsLeft !== null && !isGeneratingMore && (
                        <Text
                          style={{
                            fontFamily: FontFamily.ui,
                            fontSize: FontSize.xs,
                            color: colors.textSubtle,
                            textAlign: 'center',
                            marginBottom: Spacing['4'],
                          }}
                        >
                          Retrying in {autoRetrySecondsLeft}s{autoRetryAttempt > 0 ? ` · attempt ${autoRetryAttempt}/${AUTO_RETRY_MAX_ATTEMPTS}` : ''}
                        </Text>
                      )}
                      {isGeneratingMore ? (
                          <View style={{ alignItems: 'center', gap: Spacing['3'] }}>
                            <ActivityIndicator color={colors.accent} size="large" />
                            <Text
                              style={{
                                fontFamily: FontFamily.ui,
                                fontSize: FontSize.sm,
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
                              paddingVertical: Spacing['4'],
                              paddingHorizontal: Spacing['8'],
                              borderRadius: Radius.card,
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
                              paddingVertical: Spacing['4'],
                              paddingHorizontal: Spacing['8'],
                              borderRadius: Radius.card,
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
                        marginTop: Spacing['8'],
                        paddingVertical: 18,
                        paddingHorizontal: Spacing['5'],
                        borderRadius: Radius.card,
                        backgroundColor: colors.inputBackground,
                        borderWidth: 1,
                        borderColor: alpha(colors.accent, 0.33),
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], marginBottom: 10 }}>
                        <SunHorizonIcon size={18} color={colors.accent} weight="light" />
                        <Text
                          style={{
                            fontFamily: FontFamily.uiMedium,
                            fontSize: FontSize.xs,
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
                          fontSize: FontSize.xl,
                          color: colors.text,
                          lineHeight: 26,
                          marginBottom: Spacing['2'],
                        }}
                        numberOfLines={2}
                      >
                        {tomorrowDayData.title}
                      </Text>
                      <Text
                        style={{
                          fontFamily: FontFamily.body,
                          fontSize: FontSize.sm,
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
                        marginTop: Spacing['8'],
                        paddingVertical: 18,
                        paddingHorizontal: Spacing['5'],
                        borderRadius: Radius.card,
                        backgroundColor: colors.inputBackground,
                        borderWidth: 1,
                        borderColor: colors.border,
                        alignItems: 'center',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], marginBottom: Spacing['3'] }}>
                        <SunHorizonIcon size={18} color={colors.accent} weight="light" />
                        <Text
                          style={{
                            fontFamily: FontFamily.uiMedium,
                            fontSize: FontSize.xs,
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
                          fontSize: FontSize.sm,
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
            </KeyboardAwareScrollView>
            </Animated.View>
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
        seriesReflectionSummary={
          celebrationType === 'series'
            ? currentDevotional?.days.find((d) => d.dayNumber === viewingDay)?.seriesReflectionSummary
            : undefined
        }
      />

      {/* Phase 5: Continuation Prompt */}
      <Modal visible={showContinuationPrompt} transparent animationType="fade" statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(8, 8, 8, 0.92)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing['8'] }}>
          <View style={{ backgroundColor: colors.backgroundElevated, borderRadius: Radius.xl, padding: Spacing['7'], width: '100%', maxWidth: 340, alignItems: 'center' }}>
            <Text style={{ fontFamily: FontFamily.display, fontSize: 28, color: colors.text, textAlign: 'center', marginBottom: Spacing['3'], letterSpacing: -0.5 }}>
              Your series{'\n'}could continue
            </Text>
            <View style={{ width: 32, height: 1.5, backgroundColor: colors.accent, marginBottom: Spacing['4'], borderRadius: 1 }} />
            <Text style={{ fontFamily: FontFamily.bodyItalic, fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: Spacing['6'] }}>
              {continuationReason}
            </Text>
            {extensionError && (
              <Text style={{ fontFamily: FontFamily.ui, fontSize: 13, color: '#E55', textAlign: 'center', marginBottom: Spacing['3'] }}>
                Something went wrong. Try again?
              </Text>
            )}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleContinueJourney}
              style={{ backgroundColor: colors.accent, borderRadius: Radius.card, paddingVertical: 14, paddingHorizontal: Spacing['8'], width: '100%', alignItems: 'center', marginBottom: Spacing['3'], opacity: isExtendingArc ? 0.7 : 1 }}
              disabled={isExtendingArc}
              accessibilityRole="button"
              accessibilityLabel="Continue your series"
              accessibilityState={{ disabled: isExtendingArc }}
            >
              {isExtendingArc ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ fontFamily: FontFamily.uiSemiBold, fontSize: FontSize.base, color: '#fff' }}>
                  {extensionError ? 'Retry' : `Keep Going \u00B7 ${continuationDays} more days`}
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => {
                if (continuationTimerRef.current) clearTimeout(continuationTimerRef.current);
                setShowContinuationPrompt(false);
                setContinuationDays(0);
                setContinuationReason('');
                setExtensionError(false);
              }}
              style={{ paddingVertical: 10, opacity: isExtendingArc ? 0.5 : 1 }}
              disabled={isExtendingArc}
              accessibilityRole="button"
              accessibilityLabel="Dismiss continuation prompt"
              accessibilityState={{ disabled: isExtendingArc }}
            >
              <Text style={{ fontFamily: FontFamily.ui, fontSize: FontSize.sm, color: colors.textMuted }}>
                I'm good for now
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Share: now navigates to /share-card route */}

      {/* Audio player now rendered by AudioPlayerOverlay in root layout */}

      {/* Premium Toast Notification */}
      {audioToast?.visible && (
        <Animated.View
          entering={FadeIn.duration(Duration.normal)}
          exiting={FadeOut.duration(Duration.normal)}
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

      {showReadingSettings && (
        <DevotionalSettingsSheet
          onClose={() => setShowReadingSettings(false)}
        />
      )}

      {/* Bookmark saved toast */}
      {bookmarkToast && (
        <Animated.View
          entering={SlideInDown.duration(Duration.slow)}
          exiting={SlideOutDown.duration(Duration.normal)}
          style={[
            styles.bookmarkToastContainer,
            { backgroundColor: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(40, 40, 40, 0.95)' },
          ]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <BookmarkSimpleIcon size={16} color={colors.accent} weight="fill" />
          <Text style={styles.bookmarkToastText}>Saved to your library</Text>
          <TouchableOpacity
            onPress={() => {
              setBookmarkToast(false);
              router.push('/(tabs)/(you)/saved');
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="link"
            accessibilityLabel="View saved bookmarks"
          >
            <Text style={[styles.bookmarkToastLink, { color: colors.accent }]}>View</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Study Method Info Sheet */}
      <StudyMethodSheet
        methodId={selectedStudyMethod}
        visible={studyMethodVisible}
        onClose={() => setStudyMethodVisible(false)}
      />
    </View>
  );
}

/* ─── Devotional Reading Settings Sheet ─── */

const FONT_SIZE_OPTIONS: Array<{ label: string; value: FontSizePreference }> = [
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large' },
];

function DevotionalSettingsSheet({ onClose }: { onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const currentFontSize = useUnfoldStore((s) => s.user?.fontSize ?? 'medium');
  const currentReadingFont = useUnfoldStore((s) => s.user?.readingFont ?? 'source-serif');
  const isPremium = useUnfoldStore((s) => s.user?.isPremium ?? false);
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const controlBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const selectedBg = isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.12)';

  return (
    <>
      {/* Overlay */}
      <Animated.View
        entering={FadeIn.duration(Duration.normal)}
        exiting={FadeOut.duration(Duration.fast)}
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.35)',
          zIndex: 99,
        }}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFillObject}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Close settings"
          accessibilityRole="button"
        />
      </Animated.View>

      {/* Settings card */}
      <Animated.View
        entering={FadeIn.duration(Duration.normal)}
        exiting={FadeOut.duration(180)}
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 100,
          zIndex: 100,
          borderRadius: Radius.xl,
          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: isDark ? 0.4 : 0.12,
          shadowRadius: 20,
          elevation: 12,
          paddingBottom: Spacing['5'],
        }}
      >
        {/* Handle */}
        <View style={{ alignItems: 'center', paddingTop: Spacing['3'], paddingBottom: Spacing['2'] }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)', alignSelf: 'center' }} />
        </View>

        {/* Font Size */}
        <View style={{ paddingHorizontal: Spacing['5'], paddingVertical: Spacing['3'], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}>
          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 11, color: colors.textSubtle, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Font Size
          </Text>
          <View style={{ flexDirection: 'row', gap: Spacing['2'] }}>
            {FONT_SIZE_OPTIONS.map((opt) => {
              const isActive = currentFontSize === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateUser({ fontSize: opt.value });
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: isActive ? selectedBg : controlBg,
                    alignItems: 'center',
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel={`${opt.label} font size`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={{
                    fontFamily: isActive ? FontFamily.uiMedium : FontFamily.ui,
                    fontSize: FontSize.sm,
                    color: isActive ? colors.text : colors.textHint,
                  }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Reading Font */}
        <View style={{ paddingHorizontal: Spacing['5'], paddingTop: Spacing['3'] }}>
          <Text style={{ fontFamily: FontFamily.uiMedium, fontSize: 11, color: colors.textSubtle, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Reading Font
          </Text>
          <View style={{ gap: Spacing['1.5'] }}>
            {READING_FONTS.map((font) => {
              const isActive = currentReadingFont === font.id;
              const isLocked = font.id !== 'source-serif' && !isPremium;
              return (
                <TouchableOpacity
                  key={font.id}
                  onPress={() => {
                    if (isLocked) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateUser({ readingFont: font.id });
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    backgroundColor: isActive ? selectedBg : 'transparent',
                    opacity: isLocked ? 0.4 : 1,
                  }}
                  activeOpacity={0.7}
                  accessibilityLabel={`${font.name} font${isLocked ? ', premium' : ''}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={{
                    fontFamily: font.regular,
                    fontSize: FontSize.base,
                    color: isActive ? colors.text : colors.textMuted,
                  }}>
                    {font.name}
                  </Text>
                  {isLocked && (
                    <Text style={{ fontFamily: FontFamily.ui, fontSize: 10, color: colors.accent, letterSpacing: 0.5 }}>
                      PRO
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    bottom: 120,
    left: '10%',
    right: '10%',
    paddingVertical: 10,
    paddingHorizontal: Spacing['4'],
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    ...Shadow.md,
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  bookmarkToastContainer: {
    position: 'absolute',
    bottom: 100,
    left: 24,
    right: 24,
    borderRadius: Radius.card,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2.5'],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 200,
  },
  bookmarkToastText: {
    fontFamily: FontFamily.ui,
    fontSize: FontSize.sm,
    color: '#FFFFFF',
    flex: 1,
  },
  bookmarkToastLink: {
    fontFamily: FontFamily.uiMedium,
    fontSize: FontSize.sm,
  },
});
