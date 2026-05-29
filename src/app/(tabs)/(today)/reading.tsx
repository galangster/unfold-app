import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAutoHide } from '@/hooks/useAutoHide';
import { View, Text, Dimensions, ActivityIndicator, AccessibilityInfo, Platform, StyleSheet, TouchableOpacity, Keyboard, ScrollView, UIManager, type LayoutChangeEvent } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  runOnJS,
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import { BookmarkSimpleIcon, ArrowsClockwiseIcon, CaretDownIcon, BookOpenIcon, CaretLeftIcon, PlayIcon, CheckIcon, UploadSimpleIcon, SunHorizonIcon, TextAaIcon } from 'phosphor-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { FontFamily, FontSize } from '@/constants/fonts';
import { useUIState } from '@/lib/ui-state';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Shadow } from '@/constants/shadows';
import { Duration, Ease } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore, FONT_SIZE_VALUES, READING_FONTS } from '@/lib/store';
import type { FontSize as FontSizePreference, Highlight, Bookmark } from '@/lib/store';
import { refreshDailyReminder } from '@/lib/notifications';
import { continueGeneratingDays, isFullGenerationActive } from '@/lib/devotional-service';
import { submitGenerationJob, recoverCompletedGenerationResult, ApiError } from '@/lib/generation-api';
import { syncDevotionalDayRead } from '@/lib/devotional-read-sync';
import { pullDevotionalContent } from '@/lib/devotional-sync-pull';
import { applyPulledDevotionalContent } from '@/lib/devotional-pulled-content';
import { isCanonicalProgressiveDevotional, shouldUseLegacyDirectContinuation } from '@/lib/reading-generation-policy';
import {
  getHighestContiguousRenderableDayNumber,
  selectNextRenderableDevotionalDay,
  selectRenderableDevotionalDay,
} from '@/lib/devotional-canonical-days';
import {
  getLockedTodayDayNumber,
  getSelectableDayLimit,
  getTodayReaderDayNumber,
  resolveInitialReadingDayNumber,
} from '@/lib/devotional-day-access';
import { isTransientGenerationError, toFriendlyRemainingDaysGenerationError } from '@/lib/generation-errors';
import { logBugEvent, logBugError } from '@/lib/bug-logger';
import { logger } from '@/lib/logger';
import { CompletionCelebration } from '@/components/CompletionCelebration';
// ShareDevotionalModal removed — pull quote share now uses /share-card route
import { DevotionalContent } from '@/components/reading/DevotionalContent';
import { StudyMethodSheet } from '@/components/reading/StudyMethodSheet';
import { createReviewPromptManager } from '@/lib/review-prompt';
import { useGlobalAudioPlayer } from '@/hooks/useGlobalAudioPlayer';
import { useAudioPlayerState } from '@/lib/audio-player-state';
import { ScriptureTapSheet } from '@/components/ScriptureTapSheet';

import { getDefaultVoice, prefetchDevotionalAudio, streamDevotionalAudio, buildTtsText } from '@/lib/tts-service';
import { syncWidgets, startReadingSession, endReadingSession } from '@/lib/widget-bridge';
import { PremiumFeatureSheet } from '@/components/PremiumFeatureSheet';
import { PremiumNudgeCard } from '@/components/PremiumNudgeCard';
import { usePremiumNudge } from '@/hooks/usePremiumNudge';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { alpha } from '@/components/ui';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AUTO_RETRY_MAX_ATTEMPTS = 3;
const AUTO_RETRY_BASE_DELAY_MS = 15000;
const LIBRARY_TARGET_TOP_INSET = 220;

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

export default function ReadingScreen() {
  console.log('[Reading] RENDER CALLED');
  const router = useRouter();
  const params = useLocalSearchParams<{ dayNumber?: string; devotionalId?: string; highlightId?: string; bookmarkId?: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  // Clear reveal transition flag AFTER reading screen has painted to prevent
  // home screen from flashing behind during the transition handoff.
  useEffect(() => {
    console.log('[Reading] MOUNTED', { dayNumber: params.dayNumber });
    const { revealTransitioning, setRevealTransitioning } = useUIState.getState();
    console.log('[Reading] revealTransitioning was', revealTransitioning);
    if (revealTransitioning) {
      // Delay clearing the flag so the reading screen has time to fully render
      // on top of the home screen before the blank-home fallback disappears.
      const t = setTimeout(() => {
        console.log('[Reading] clearing revealTransitioning flag (delayed)');
        setRevealTransitioning(false);
      }, 650);
      return () => clearTimeout(t);
    }
  }, []);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const readerScrollNativeTargetRef = useRef<number | null>(null);
  const targetScrollRequestIdRef = useRef(0);

  const currentDevotionalId = useUnfoldStore((s) => s.currentDevotionalId);
  const setCurrentDevotional = useUnfoldStore((s) => s.setCurrentDevotional);
  const markDayAsRead = useUnfoldStore((s) => s.markDayAsRead);
  const advanceDay = useUnfoldStore((s) => s.advanceDay);
  const updateDevotionalDays = useUnfoldStore((s) => s.updateDevotionalDays);
  const setResumeContext = useUnfoldStore((s) => s.setResumeContext);
  const clearResumeContext = useUnfoldStore((s) => s.clearResumeContext);
  const user = useUnfoldStore((s) => s.user);
  const addBookmark = useUnfoldStore((s) => s.addBookmark);
  const removeBookmark = useUnfoldStore((s) => s.removeBookmark);
  const addHighlight = useUnfoldStore((s) => s.addHighlight);
  const removeHighlight = useUnfoldStore((s) => s.removeHighlight);
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

  const premiumPolicy = usePremiumAccessPolicy();
  const isPremium = premiumPolicy === 'granted';
  const { startAudio, stopAudio } = useGlobalAudioPlayer();

  // Premium nudge system (audio teaser on reading screen)
  const { nudge: premiumNudge, onAction: nudgeAction, onDismiss: nudgeDismiss } = usePremiumNudge({ screen: 'reading' });

  const devotionals = useUnfoldStore((s) => s.devotionals);

  // Honor ?devotionalId=… so deep links (e.g., from the library) open the
  // correct devotional instead of whatever happens to be current in the store.
  // We resolve the effective devotional locally from the param *immediately*
  // so first-render state (viewingDay) picks the right days. We mirror it to
  // the store from an effect so downstream consumers (audio player, highlight
  // filters) see the right id without mutating Zustand during render.
  const effectiveDevotionalId = params.devotionalId ?? currentDevotionalId;
  useEffect(() => {
    if (params.devotionalId && params.devotionalId !== currentDevotionalId) {
      setCurrentDevotional(params.devotionalId);
    }
  }, [params.devotionalId, currentDevotionalId, setCurrentDevotional]);

  // Derive via useMemo instead of inline .find() in a Zustand selector.
  // .find() inside a selector returns a new reference on every store update,
  // which causes infinite re-renders when used as a useEffect dependency.
  const currentDevotional = useMemo(
    () => devotionals.find((d) => d.id === effectiveDevotionalId),
    [devotionals, effectiveDevotionalId],
  );

  const requestedDayNumber = parsePositiveInteger(params.dayNumber);

  const [viewingDay, setViewingDay] = useState(() => {
    // Read fresh state from the store to ensure the param devotional is used
    // even before the effect-based store sync has flushed.
    const devs = useUnfoldStore.getState().devotionals;
    const d = devs.find((x) => x.id === effectiveDevotionalId);
    return resolveInitialReadingDayNumber(d, requestedDayNumber);
  });
  const lastResolvedRouteKeyRef = useRef<string | null>(null);
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
  const [isCheckingForSyncedDay, setIsCheckingForSyncedDay] = useState(false);
  const [isHydratingMissingDevotional, setIsHydratingMissingDevotional] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isGeneratingMore, setIsGeneratingMore] = useState(false);
  const [autoRetryTick, setAutoRetryTick] = useState(0);
  const [, setAutoRetryAttempt] = useState(0);
  const [autoRetryNextAt, setAutoRetryNextAt] = useState<number | null>(null);
  const [autoRetrySecondsLeft, setAutoRetrySecondsLeft] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isWaitingForConnection, setIsWaitingForConnection] = useState(false);
  const [isPreparingNextDay, setIsPreparingNextDay] = useState(false);
  const [bookmarkToast, setBookmarkToast] = useState(false);
  const [selectedStudyMethod, setSelectedStudyMethod] = useState<string | undefined>(undefined);
  const [targetScrollRequest, setTargetScrollRequest] = useState<{ id: number; y: number } | null>(null);
  const [readerScrollReady, setReaderScrollReady] = useState(0);
  const [readerLayoutVersion, setReaderLayoutVersion] = useState(0);
  const mountedRef = useRef(true);
  const [studyMethodVisible, setStudyMethodVisible] = useState(false);
  const reviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoBackgroundKickoffRef = useRef<Record<string, number>>({});
  const autoRetryAttemptsRef = useRef<Record<string, number>>({});
  const autoRetryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const syncRecoveryAttemptRef = useRef<Record<string, boolean>>({});
  const missingDevotionalHydrationAttemptRef = useRef<Record<string, boolean>>({});

  const translateX = useSharedValue(0);
  const chevronBounce = useSharedValue(0);
  const contentOpacity = useSharedValue(1);
  const scrollProgress = useSharedValue(0);

  // Bookmark toast auto-dismiss after 2.5s
  useAutoHide(bookmarkToast, 2500, useCallback(() => setBookmarkToast(false), []));

  // Button press micro-interaction — spring scale for Complete Day button
  const completeButtonScale = useSharedValue(1);
  const completeButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: completeButtonScale.value }],
  }));

  const fontSize = user?.fontSize ?? 'medium';

  const totalDays = currentDevotional?.totalDays ?? 1;
  const renderableDays = useMemo(
    () => getHighestContiguousRenderableDayNumber(currentDevotional),
    [currentDevotional],
  );
  const selectableDayLimit = useMemo(
    () => getSelectableDayLimit(currentDevotional),
    [currentDevotional],
  );
  const todayReaderDayNumber = useMemo(
    () => getTodayReaderDayNumber(currentDevotional),
    [currentDevotional],
  );
  const lockedTodayDayNumber = useMemo(
    () => getLockedTodayDayNumber(currentDevotional),
    [currentDevotional],
  );
  const availableDays = selectableDayLimit > 0 ? selectableDayLimit : renderableDays;
  const renderableDay = useMemo(
    () => selectRenderableDevotionalDay(currentDevotional, viewingDay),
    [currentDevotional, viewingDay],
  );
  const currentDayData = renderableDay.status === 'ready' ? renderableDay.day : undefined;

  // Reactive bookmark check - fixes the bookmark icon not updating
  const isCurrentDayBookmarked = useMemo(() => {
    if (!currentDevotionalId) return false;
    return bookmarks.some((b) => b.devotionalId === currentDevotionalId && b.dayNumber === viewingDay);
  }, [bookmarks, currentDevotionalId, viewingDay]);

  // Get highlights for current day
  const currentDayHighlights = useMemo(() => {
    if (!effectiveDevotionalId) return [];
    return highlights.filter((h) => h.devotionalId === effectiveDevotionalId && h.dayNumber === viewingDay);
  }, [highlights, effectiveDevotionalId, viewingDay]);

  const targetHighlight = useMemo<Highlight | null>(() => {
    if (!params.highlightId || !effectiveDevotionalId) return null;
    const match = highlights.find((h) => h.id === params.highlightId);
    if (!match) return null;
    if (match.devotionalId !== effectiveDevotionalId || match.dayNumber !== viewingDay) return null;
    return match;
  }, [highlights, params.highlightId, effectiveDevotionalId, viewingDay]);

  const targetBookmark = useMemo<Bookmark | null>(() => {
    if (!params.bookmarkId || !effectiveDevotionalId) return null;
    const match = bookmarks.find((b) => b.id === params.bookmarkId);
    if (!match) return null;
    if (match.devotionalId !== effectiveDevotionalId || match.dayNumber !== viewingDay) return null;
    return match;
  }, [bookmarks, params.bookmarkId, effectiveDevotionalId, viewingDay]);

  const setReaderScrollViewRef = useCallback((node: ScrollView | null) => {
    scrollViewRef.current = node;
    if (node) {
      setReaderScrollReady((version) => version + 1);
    }
  }, []);

  const handleReaderScrollViewLayout = useCallback((event: LayoutChangeEvent) => {
    const target = (event.nativeEvent as { target?: number }).target;
    readerScrollNativeTargetRef.current = typeof target === 'number' ? target : null;
    setReaderScrollReady((version) => version + 1);
  }, []);

  const scrollReaderToY = useCallback((y: number) => {
    const ref = scrollViewRef.current as unknown as Record<string, unknown> | null;
    const proto = ref ? Object.getPrototypeOf(ref) as Record<string, unknown> | null : null;
    const options = { x: 0, y, animated: true };
    const nativeRef = typeof ref?.getNativeScrollRef === 'function'
      ? (ref.getNativeScrollRef as () => unknown)()
      : null;
    const responder = typeof ref?.getScrollResponder === 'function'
      ? (ref.getScrollResponder as () => unknown)()
      : null;
    const inner = (ref?._component ?? ref?._nativeRef ?? ref?._ref ?? null) as Record<string, unknown> | null;

    let method = 'none';
    if (typeof ref?.scrollTo === 'function') {
      (ref.scrollTo as (value: typeof options) => void)(options);
      method = 'direct';
    } else if (typeof proto?.scrollTo === 'function') {
      (proto.scrollTo as (this: unknown, value: typeof options) => void).call(ref, options);
      method = 'proto';
    } else if (nativeRef && typeof (nativeRef as { scrollTo?: unknown }).scrollTo === 'function') {
      ((nativeRef as { scrollTo: (value: typeof options) => void }).scrollTo)(options);
      method = 'native';
    } else if (responder && typeof (responder as { scrollResponderScrollTo?: unknown }).scrollResponderScrollTo === 'function') {
      ((responder as { scrollResponderScrollTo: (value: typeof options) => void }).scrollResponderScrollTo)(options);
      method = 'responder';
    } else if (typeof inner?.scrollTo === 'function') {
      (inner.scrollTo as (value: typeof options) => void)(options);
      method = 'inner';
    } else if (readerScrollNativeTargetRef.current != null) {
      UIManager.dispatchViewManagerCommand(
        readerScrollNativeTargetRef.current,
        'scrollTo',
        [0, y, true],
      );
      return true;
    }

    return method !== 'none';
  }, []);

  const handleTargetHighlightLocated = useCallback((contentY: number) => {
    const y = Math.max(0, contentY - LIBRARY_TARGET_TOP_INSET);
    targetScrollRequestIdRef.current += 1;
    setTargetScrollRequest({
      id: targetScrollRequestIdRef.current,
      y,
    });
  }, []);

  useEffect(() => {
    if (!targetScrollRequest) return;

    // WebView target messages can arrive before the parent ScrollView ref or
    // final content height has committed. Store the requested Y in React state
    // and retry from an effect so each attempt uses the latest mounted ref.
    const delays = [0, 250, 650, 1200, 1800, 2600];
    const timers = delays.map((delay) => setTimeout(() => {
      scrollReaderToY(targetScrollRequest.y);
    }, delay));

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [readerLayoutVersion, readerScrollReady, scrollReaderToY, targetScrollRequest]);
  const expectedDays = Math.max(user?.devotionalLength ?? 0, totalDays);
  // Only show retry banner if this specific series has ungenerated days
  // Compare against totalDays (the series plan), not expectedDays (user preference)
  // Progressive mode generates days one at a time — don't show batch retry banner
  const showIncompleteJourneyRetry = renderableDays < totalDays && currentDevotional?.generationMode !== 'progressive';
  const retryCtaButtonBg = colors.accent;
  const retryCtaButtonText = colors.background;
  const btnText = retryCtaButtonText;
  const retryCtaButtonBorder = colors.border;

  const canGoBack = viewingDay > 1;
  const canGoForward = viewingDay < availableDays;
  const isLastDay = viewingDay === totalDays;
  const isDayCompleted = currentDayData?.isRead ?? false;

  // Tomorrow preview data — next renderable day in the series.
  const tomorrowDayData = useMemo(
    () => selectNextRenderableDevotionalDay(currentDevotional, viewingDay) ?? null,
    [currentDevotional, viewingDay],
  );

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

  // Cleanup mounted ref and timers on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (reviewTimerRef.current) clearTimeout(reviewTimerRef.current);
    };
  }, []);

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

  // Respect deep-linked day number (used by Resume card), but never let a
  // stale route reopen tomorrow after today's reading has already completed.
  // Apply each route dayNumber once; after that, manual swipes own viewingDay.
  useEffect(() => {
    if (!currentDevotional || !requestedDayNumber) return;
    const routeKey = `${effectiveDevotionalId ?? currentDevotional.id}:${requestedDayNumber}`;
    if (lastResolvedRouteKeyRef.current === routeKey) return;
    lastResolvedRouteKeyRef.current = routeKey;

    const resolvedDay = resolveInitialReadingDayNumber(
      currentDevotional,
      requestedDayNumber,
    );
    setViewingDay((current) => (current === resolvedDay ? current : resolvedDay));
  }, [currentDevotional, effectiveDevotionalId, requestedDayNumber]);

  // If currentDay advances to tomorrow while this screen is mounted, keep the
  // reader anchored to today's completed reading instead of exposing tomorrow.
  useEffect(() => {
    if (lockedTodayDayNumber != null && viewingDay > lockedTodayDayNumber) {
      setViewingDay(lockedTodayDayNumber);
    }
  }, [lockedTodayDayNumber, viewingDay]);

  // Persist latest reading context so Home can offer one-tap resume.
  useEffect(() => {
    if (!currentDevotionalId || !currentDevotional) return;

    setResumeContext({
      route: 'reading',
      devotionalId: currentDevotionalId,
      dayNumber: viewingDay,
      devotionalTitle: currentDevotional.title,
      dayTitle: currentDayData?.title,
      // NOTE: Do NOT set touchedAt here. touchedAt is only set by reveal.tsx
      // to trigger the auto-navigate effect in index.tsx. Setting it here
      // causes an infinite loop: reading sets resumeContext → home detects
      // fresh touchedAt → home clears + pushes to reading → loop.
    });
  }, [
    currentDevotionalId,
    currentDevotional?.title,
    currentDayData?.title,
    viewingDay,
    setResumeContext,
  ]);

  const goToDay = useCallback((day: number) => {
    if (day >= 1 && day <= availableDays) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Quick fade out → change day → fade in. Start fade-in only after the
      // fade-out callback runs; assigning a second animation immediately can
      // cancel the callback before setViewingDay fires.
      contentOpacity.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.ease) }, (finished) => {
        if (!finished) return;
        runOnJS(setViewingDay)(day);
        contentOpacity.value = withTiming(1, { duration: Duration.normal, easing: Easing.in(Easing.ease) });
      });
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

  const handleHighlightRemoved = useCallback((event: { text: string; color: string; context: string; serializedRange?: string }) => {
    if (!currentDevotionalId) return;

    // Extract position key "start-end-className" from a rangy serialized range.
    // Format: "start$end$id$className$containerElementId". Ignoring the id
    // field makes matching robust across sessions.
    const posKey = (serialized?: string): string | null => {
      if (!serialized) return null;
      const parts = serialized.split('$');
      if (parts.length < 4) return null;
      return `${parts[0]}-${parts[1]}-${parts[3]}`;
    };

    const eventPosKey = posKey(event.serializedRange);

    // Remove ALL entries that match this position. There may be duplicates
    // in the store from earlier sessions where deserialize was broken and the
    // user re-created the same highlight multiple times. One tap should
    // clean them all up, otherwise a "removed" highlight comes back on reload.
    const matches = currentDayHighlights.filter((h) => {
      if (event.serializedRange && h.serializedRange === event.serializedRange) return true;
      if (eventPosKey && posKey(h.serializedRange) === eventPosKey) return true;
      // Legacy text+color match for highlights missing serializedRange
      if (!h.serializedRange && h.highlightedText === event.text && h.color === event.color) return true;
      return false;
    });

    if (matches.length > 0) {
      matches.forEach((m) => removeHighlight(m.id));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [currentDevotionalId, currentDayHighlights, removeHighlight]);

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const scrollContentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const scrollHintStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: chevronBounce.value }],
  }));

  const dismissKeyboardForSwipe = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX([-20, 20])
      .onStart(() => {
        runOnJS(dismissKeyboardForSwipe)();
      })
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
    [viewingDay, availableDays, handlePrevious, handleNext, dismissKeyboardForSwipe]
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
      });
    }

    router.push({
      pathname: '/(tabs)/(journal)/entry',
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
      target?: number;
    }
  }) => {
    if (typeof e.nativeEvent.target === 'number') {
      readerScrollNativeTargetRef.current = e.nativeEvent.target;
    }
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
      if (currentDevotional && currentDayData) {
        void syncDevotionalDayRead({
          devotional: currentDevotional,
          day: currentDayData,
        }).catch((err) => {
          logger.warn('[reading] Failed to sync read state:', err instanceof Error ? err.message : err);
          void logBugError('reading', err, {
            phase: 'sync-read-state',
            devotionalId: currentDevotionalId,
            dayNumber: viewingDay,
          });
        });
      }

      // Clear resume context since user just completed this day
      clearResumeContext();

      // Use the user's intended devotional length to determine if this is truly the last day
      const expectedTotal = Math.max(totalDays, user?.devotionalLength ?? totalDays);
      const completingLastDay = viewingDay >= expectedTotal;
      if (currentDevotional?.currentDay === viewingDay && viewingDay < expectedTotal) {
        advanceDay(currentDevotionalId);
      }
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
        refreshDailyReminder();
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
  }, [currentDevotionalId, viewingDay, totalDays, user?.devotionalLength, currentDevotional, currentDayData, markDayAsRead, advanceDay, clearResumeContext, recordStreakRead, syncWidgets, journalEntries.length, reviewPromptLastDate, reviewPromptCount, hasReviewed, reviewPromptDaysAtLast, recordReviewPrompt]);

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

    // Progressive/canonical devotionals must never use the legacy direct
    // /api/generate/devotional continuation path. Missing days are recovered
    // by sync pull or queued through /api/jobs/generate-day instead.
    if (!shouldUseLegacyDirectContinuation(currentDevotional)) {
      void logBugEvent('reading-generation', 'legacy-continuation-skipped-canonical', {
        devotionalId: currentDevotional.id,
        generationMode: currentDevotional.generationMode,
        hasSeriesArc: Boolean(currentDevotional.seriesArc),
        hasProgressiveMemory: Boolean(currentDevotional.progressiveMemory),
        hasSeriesStartDate: Boolean(currentDevotional.seriesStartDate),
      });
      return { ok: false, retriable: false };
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
          bibleTranslation: user.bibleTranslation ?? 'BSB',
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

  const recoverSyncedDay = useCallback(async (source: 'auto' | 'manual' = 'manual'): Promise<boolean> => {
    if (!currentDevotional || currentDayData || isCheckingForSyncedDay) return false;

    const attemptKey = `${currentDevotional.id}:${viewingDay}`;
    if (source === 'auto' && syncRecoveryAttemptRef.current[attemptKey]) return false;
    if (source === 'auto') {
      syncRecoveryAttemptRef.current[attemptKey] = true;
    }

    setIsCheckingForSyncedDay(true);
    if (source === 'manual') {
      setRetryError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      const pulled = await pullDevotionalContent(currentDevotional.id);
      applyPulledDevotionalContent({
        devotionalId: currentDevotional.id,
        pulled,
        updateDevotionalDays,
        updateDevotionals: (updater) => {
          useUnfoldStore.setState((state) => ({
            devotionals: updater(state.devotionals),
          }));
        },
      });

      const targetDay = pulled.days.find((day) => day.dayNumber === viewingDay);
      if (targetDay) {
        void logBugEvent('reading-sync-recovery', 'recovered-missing-day-from-sync-pull', {
          devotionalId: currentDevotional.id,
          viewingDay,
          pulledDays: pulled.days.length,
          source,
        });
        if (source === 'manual') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        return true;
      }

      if (isCanonicalProgressiveDevotional(currentDevotional)) {
        const recovered = await recoverCompletedGenerationResult({
          devotionalId: currentDevotional.id,
          dayNumber: viewingDay,
        }).catch(() => null);

        if (recovered?.devotionalDay) {
          updateDevotionalDays(currentDevotional.id, [recovered.devotionalDay], currentDevotional.title);
          void logBugEvent('reading-sync-recovery', 'recovered-missing-day-from-completed-job', {
            devotionalId: currentDevotional.id,
            viewingDay,
            source,
          });
          if (source === 'manual') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          return true;
        }

        try {
          await submitGenerationJob({
            devotionalId: currentDevotional.id,
            dayNumber: viewingDay,
            jobType: 'day',
          });
          void logBugEvent('reading-sync-recovery', 'queued-missing-day-canonical-job', {
            devotionalId: currentDevotional.id,
            viewingDay,
            source,
          });
          if (source === 'manual') {
            setRetryError('We’re preparing this reading. Check back in a moment.');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          return true;
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            const recoveredFromExisting = await recoverCompletedGenerationResult({
              devotionalId: currentDevotional.id,
              dayNumber: viewingDay,
              existingJobId: err.existingJobId,
            }).catch(() => null);

            if (recoveredFromExisting?.devotionalDay) {
              updateDevotionalDays(currentDevotional.id, [recoveredFromExisting.devotionalDay], currentDevotional.title);
              void logBugEvent('reading-sync-recovery', 'recovered-missing-day-from-existing-job', {
                devotionalId: currentDevotional.id,
                viewingDay,
                source,
              });
              if (source === 'manual') {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              return true;
            }
          }
          throw err;
        }
      }

      if (source === 'manual') {
        setRetryError('This reading is still being prepared. Try again in a moment, or prepare the next reading below.');
      }
      return false;
    } catch (err) {
      void logBugError('reading-sync-recovery', err, {
        devotionalId: currentDevotional.id,
        viewingDay,
        source,
      });
      if (source === 'manual') {
        setRetryError('Could not refresh this reading. Please try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return false;
    } finally {
      setIsCheckingForSyncedDay(false);
    }
  }, [currentDevotional, currentDayData, isCheckingForSyncedDay, updateDevotionalDays, viewingDay]);

  useEffect(() => {
    if (!currentDevotional || currentDayData || isCheckingForSyncedDay) return;
    void recoverSyncedDay('auto');
  }, [currentDevotional, currentDayData, isCheckingForSyncedDay, recoverSyncedDay]);

  useEffect(() => {
    const devotionalId = effectiveDevotionalId;
    if (!devotionalId || currentDevotional || isHydratingMissingDevotional) return;
    if (missingDevotionalHydrationAttemptRef.current[devotionalId]) return;

    missingDevotionalHydrationAttemptRef.current[devotionalId] = true;
    let cancelled = false;
    setIsHydratingMissingDevotional(true);

    void (async () => {
      try {
        const pulled = await pullDevotionalContent(devotionalId);
        if (cancelled) return;

        applyPulledDevotionalContent({
          devotionalId,
          pulled,
          updateDevotionalDays,
          updateDevotionals: (updater) => {
            useUnfoldStore.setState((state) => ({
              devotionals: updater(state.devotionals),
            }));
          },
        });
        setCurrentDevotional(devotionalId);

        void logBugEvent('reading-sync-recovery', 'hydrated-missing-devotional-from-sync-pull', {
          devotionalId,
          pulledDays: pulled.days.length,
          hasDevotionalMetadata: Boolean(pulled.devotional),
        });
      } catch (err) {
        void logBugError('reading-sync-recovery', err, {
          phase: 'missing-devotional-hydration',
          devotionalId,
        });
      } finally {
        if (!cancelled) {
          setIsHydratingMissingDevotional(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveDevotionalId, currentDevotional, isHydratingMissingDevotional, setCurrentDevotional, updateDevotionalDays]);

  const fallbackBottomPadding = Math.max(insets.bottom + 96, 112);

  // Early returns after all hooks
  console.log('[Reading] early-return check', {
    hasCurrentDevotional: !!currentDevotional,
    currentDevotionalId,
    hasCurrentDayData: !!currentDayData,
    viewingDay,
  });
  if (!currentDevotional) {
    const shouldShowMissingSeriesRecovery = Boolean(
      effectiveDevotionalId &&
        (isHydratingMissingDevotional || !missingDevotionalHydrationAttemptRef.current[effectiveDevotionalId]),
    );
    console.log('[Reading] RETURNING missing-series state', {
      effectiveDevotionalId,
      shouldShowMissingSeriesRecovery,
      isHydratingMissingDevotional,
    });
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: Spacing['3'] }}>
        {shouldShowMissingSeriesRecovery && <ActivityIndicator color={colors.accent} />}
        <Text style={{ fontFamily: FontFamily.body, color: colors.textMuted }}>
          {shouldShowMissingSeriesRecovery ? 'Loading series…' : 'No series found'}
        </Text>
      </View>
    );
  }

  if (!currentDayData) {
    console.log('[Reading] RETURNING "Reading not ready yet" — currentDayData is null', { viewingDay, daysInSeries: currentDevotional.days.length });
    // Day hasn't been generated yet
    const daysReady = currentDevotional.days.length;

    const handleRetryGeneration = async () => {
      if (!user || isRetrying || isCheckingForSyncedDay) return;
      if (!isOnline) {
        void logBugEvent('reading-generation', 'manual-retry-blocked-offline', {
          viewingDay,
        }, 'warn');
        setRetryError('You appear to be offline. Reconnect and try again.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }

      const synced = await recoverSyncedDay('manual');
      if (synced) return;

      void logBugEvent('reading-generation', 'manual-retry-started', {
        viewingDay,
      });

      setIsRetrying(true);
      setRetryError(null);
      setIsWaitingForConnection(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      try {
        // Progressive/canonical mode: reconcile any completed server-side day before submitting another job
        if (isCanonicalProgressiveDevotional(currentDevotional)) {
          const recovered = await recoverCompletedGenerationResult({
            devotionalId: currentDevotionalId!,
            dayNumber: viewingDay,
          }).catch(() => null);

          if (recovered?.devotionalDay) {
            updateDevotionalDays(currentDevotional.id, [recovered.devotionalDay], currentDevotional.title);
            void logBugEvent('reading-generation', 'manual-retry-progressive-recovered', {
              viewingDay,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return;
          }

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
              bibleTranslation: user.bibleTranslation ?? 'BSB',
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
        if (
          isCanonicalProgressiveDevotional(currentDevotional) &&
          err instanceof ApiError &&
          err.status === 409
        ) {
          const recovered = await recoverCompletedGenerationResult({
            devotionalId: currentDevotionalId!,
            dayNumber: viewingDay,
            existingJobId: err.existingJobId,
          }).catch(() => null);

          if (recovered?.devotionalDay) {
            updateDevotionalDays(currentDevotional.id, [recovered.devotionalDay], currentDevotional.title);
            void logBugEvent('reading-generation', 'manual-retry-progressive-recovered-409', {
              viewingDay,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return;
          }
        }

        const msg = err instanceof Error ? err.message : 'Something went wrong';
        logger.error('[Reading] Retry generation failed:', msg);
        void logBugError('reading-generation', err, {
          viewingDay,
          phase: 'manual-retry',
        });
        setRetryError(toFriendlyRemainingDaysGenerationError(msg));
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
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36, paddingBottom: fallbackBottomPadding * 0.35 }}>
            <Text
              style={{
                fontFamily: FontFamily.display,
                fontSize: 28,
                color: colors.text,
                textAlign: 'center',
                marginBottom: 14,
              }}
            >
              {isRetrying ? 'Preparing...' : isCheckingForSyncedDay ? 'Looking for Day ' + viewingDay + '...' : 'Reading not ready yet'}
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
                ? 'Preparing the rest of this series.\nThis may take a moment.'
                : `Day ${viewingDay} isn't ready yet.\n${daysReady} day${daysReady !== 1 ? 's' : ''} ready so far.`}
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
                Trying again in {autoRetrySecondsLeft}s
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

          {/* Bottom buttons - reserve space above the absolute tab bar */}
          {!isRetrying && (
            <View style={{ paddingHorizontal: Spacing['7'], paddingBottom: fallbackBottomPadding, gap: Spacing['3'] }}>
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => void recoverSyncedDay('manual')}
                disabled={isCheckingForSyncedDay}
                accessibilityRole="button"
                accessibilityLabel={`Check for day ${viewingDay}`}
                accessibilityHint="Fetch the latest devotional day from your account"
                accessibilityState={{ disabled: isCheckingForSyncedDay }}
                style={{
                  backgroundColor: colors.backgroundElevated,
                  paddingVertical: Spacing['4'],
                  borderRadius: Radius.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  opacity: isCheckingForSyncedDay ? 0.65 : 1,
                }}
              >
                {isCheckingForSyncedDay ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <ArrowsClockwiseIcon size={16} color={colors.text} weight="light" />
                )}
                <Text
                  style={{
                    fontFamily: FontFamily.uiSemiBold,
                    fontSize: 15,
                    color: colors.text,
                  }}
                >
                  {isCheckingForSyncedDay ? 'Checking...' : `Check for Day ${viewingDay}`}
                </Text>
              </TouchableOpacity>

              {/* Generate button - secondary recovery if sync has nothing yet */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={handleRetryGeneration}
                disabled={isCheckingForSyncedDay}
                accessibilityRole="button"
                accessibilityLabel="Prepare remaining readings"
                accessibilityHint={`Prepare the remaining ${expectedDays - daysReady} readings in your devotional`}
                accessibilityState={{ disabled: isCheckingForSyncedDay }}
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
                  opacity: isCheckingForSyncedDay ? 0.65 : 1,
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
                  Prepare Remaining Readings
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
              {/* Left: Back button */}
              <TouchableOpacity activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.back();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                style={{ padding: Spacing['2'] }}
              >
                <CaretLeftIcon size={22} color={colors.text} weight="light" />
              </TouchableOpacity>

              {/* Center: Day indicator — tappable, opens day-menu sheet */}
              <TouchableOpacity
                activeOpacity={0.7}
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
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Day ${viewingDay} of ${currentDevotional.totalDays}`}
                accessibilityHint="Opens day selector menu"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.uiMedium,
                    fontSize: FontSize.base,
                    color: colors.text,
                  }}
                >
                  Day {viewingDay} of {currentDevotional.totalDays}
                </Text>
                {viewingDay === todayReaderDayNumber && (
                  <View
                    style={{
                      backgroundColor: alpha(colors.accent, 0.13),
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4,
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
                <CaretDownIcon size={14} color={colors.textMuted} weight="bold" />
              </TouchableOpacity>

              {/* Right: Journal + Reading Settings */}
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
            {/* Content - scrollable with day-transition fade */}
            <Animated.View style={[{ flex: 1 }, scrollContentStyle]}>
            <ScrollView
              ref={setReaderScrollViewRef}
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: Spacing['6'],
                paddingTop: Spacing['10'],
                paddingBottom: 300,
              }}
              showsVerticalScrollIndicator={false}
              bounces={true}
              onLayout={handleReaderScrollViewLayout}
              onScroll={handleScroll}
              onContentSizeChange={() => setReaderLayoutVersion((version) => version + 1)}
              scrollEventThrottle={16}
            >
              <DevotionalContent
                day={currentDayData}
                fontSize={fontSize}
                titleSharedTransitionTag={`devotional-title-${currentDevotional.id}-${viewingDay}`}
                isBookmarked={isCurrentDayBookmarked}
                onToggleBookmark={handleToggleBookmark}
                onStudyMethodPress={handleStudyMethodPress}
                onQuoteSelected={handleQuoteSelected}
                onHighlightRemoved={handleHighlightRemoved}
                existingHighlights={currentDayHighlights}
                targetHighlight={targetHighlight}
                onTargetHighlightLocated={handleTargetHighlightLocated}
                targetBookmark={targetBookmark}
                onTargetBookmarkLocated={handleTargetHighlightLocated}
                scrollViewRef={scrollViewRef}
                onScriptureTap={(ref) => {
                  setScriptureSheetRef(ref);
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
                  entering={reducedMotion ? undefined : FadeIn.duration(Duration.slow).easing(Ease.out)}
                  exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
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
                entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(200).easing(Ease.out)}
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
                        The rest of this series is being prepared.
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
                          Trying again in {autoRetrySecondsLeft}s
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
                              Preparing the rest of this series...
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
                              Prepare Remaining Readings
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
                      entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(300).easing(Ease.out)}
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
                      entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).delay(300).easing(Ease.out)}
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
            </ScrollView>
            </Animated.View>
          </SafeAreaView>
        </Animated.View>
      </GestureDetector>

      {/* Completion Celebration */}
      <CompletionCelebration
        visible={showCelebration}
        onDismiss={() => {
          setShowCelebration(false);
        }}
        type={celebrationType}
        seriesReflectionSummary={
          celebrationType === 'series'
            ? currentDevotional?.days.find((d) => d.dayNumber === viewingDay)?.seriesReflectionSummary
            : undefined
        }
      />

      {/* Share: now navigates to /share-card route */}

      {/* Audio player now rendered by AudioPlayerOverlay in root layout */}

      {/* Premium Toast Notification */}
      {audioToast?.visible && (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
          exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
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

      {/* Bookmark saved toast — entire toast is tappable */}
      {bookmarkToast && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            setBookmarkToast(false);
            router.push({
              pathname: '/(tabs)/(today)/my-content',
              params: { tab: 'bookmarks', from: 'home' },
            });
          }}
          accessibilityRole="link"
          accessibilityLabel="Bookmark saved. Tap to view in your library."
        >
          <Animated.View
            entering={reducedMotion ? undefined : SlideInDown.duration(Duration.slow).easing(Ease.out)}
            exiting={reducedMotion ? undefined : SlideOutDown.duration(Duration.fast).easing(Ease.out)}
            style={[
              styles.bookmarkToastContainer,
              { backgroundColor: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(40, 40, 40, 0.95)' },
            ]}
          >
            <BookmarkSimpleIcon size={16} color={colors.accent} weight="fill" />
            <Text style={styles.bookmarkToastText}>Saved to your library</Text>
            <Text style={[styles.bookmarkToastLink, { color: colors.accent }]}>View</Text>
          </Animated.View>
        </TouchableOpacity>
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
  const reducedMotion = useReducedMotion();
  const currentFontSize = useUnfoldStore((s) => s.user?.fontSize ?? 'medium');
  const currentReadingFont = useUnfoldStore((s) => s.user?.readingFont ?? 'source-serif');
  const premiumPolicy = usePremiumAccessPolicy();
  const isPremium = premiumPolicy === 'granted';
  const updateUser = useUnfoldStore((s) => s.updateUser);

  const controlBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const selectedBg = isDark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.12)';

  return (
    <>
      {/* Overlay */}
      <Animated.View
        entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
        exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
        style={{
          ...StyleSheet.absoluteFill,
          backgroundColor: 'rgba(0,0,0,0.35)',
          zIndex: 99,
        }}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Close settings"
          accessibilityRole="button"
        />
      </Animated.View>

      {/* Settings card */}
      <Animated.View
        entering={reducedMotion ? undefined : FadeIn.duration(Duration.normal).easing(Ease.out)}
        exiting={reducedMotion ? undefined : FadeOut.duration(Duration.fast).easing(Ease.out)}
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
