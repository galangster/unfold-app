import { useState, useEffect, useRef, useCallback, type ComponentProps, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, AppState, AppStateStatus, AccessibilityInfo, ScrollView, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { BellIcon, BookOpenTextIcon, WarningCircleIcon } from '@/components/icons';
import { useAccessibleAnimation } from '@/hooks/useAccessibility';
import { FontFamily, FontSize } from '@/constants/fonts';
import { Radius } from '@/constants/radius';
import { Spacing } from '@/constants/spacing';
import { Duration } from '@/constants/animations';
import { useTheme } from '@/lib/theme';
import { useUnfoldStore } from '@/lib/store';
import { submitGenerationJob, pollJobStatus, retryJob, recoverCompletedGenerationResult, buildInitialArcUserContext } from '@/lib/generation-api';
import {
  clearInflightGenerationJob,
  markInflightJobLeftForHome,
  readInflightGenerationJob,
  supersedeInflightGenerationJob,
  writeInflightGenerationJob,
  GENERATING_SESSION_TITLE_PLACEHOLDER,
} from '@/lib/inflight-generation-job';
import {
  INITIAL_ARC_INVALID_RESULT_MESSAGE,
  INITIAL_ARC_JOB_NOT_FOUND_MESSAGE,
  INITIAL_ARC_UNKNOWN_STATUS_MESSAGE,
  INITIAL_ARC_UNREACHABLE_MESSAGE,
} from '@/lib/inflight-initial-arc-watch';
import { applyInitialArcResult, requireCanonicalDevotionalId, type InitialArcResult } from '@/lib/initial-arc-result';
import {
  classifyPollFailure,
  countConsecutiveNetworkErrors,
  evaluateGenerationDeadline,
  evaluateGenerationPoll,
  getNextPollDelayMs,
  resolveGenerationRetryAction,
  resolveGenerationSubmitFailure,
  resolveGoHomeCleanup,
  resolveRetryFailureCleanup,
  shiftPollStart,
  MAX_CONSECUTIVE_POLL_NETWORK_ERRORS,
  type GenerationDeadlineDecision,
  type ObservedJobState,
} from '@/lib/generation-poll-outcome';
import { toFriendlyOnboardingGenerationError } from '@/lib/generation-errors';

import {
  requestNotificationPermissions,
  areNotificationsEnabled,
} from '@/lib/notifications';
import { registerPushToken } from '@/lib/push-notifications';
import {
  getNotifyControlState,
  resolveNotifyRequestOutcome,
  type NotifyControlState,
  type NotifyRequestOutcome,
} from '@/lib/generating-notify-state';
import { resolveGeneratingEntry } from '@/lib/generating-entry';
import { logBugEvent, logBugError } from '@/lib/bug-logger';
import { logger } from '@/lib/logger';
import { Typography } from '@/constants/typography';

// Soft copy once a job outlives LONG_RUNNING_AFTER_MS. Time alone is never a
// failure: the server decides, and polling continues at the slow tier.
const LONG_RUNNING_MESSAGE = 'Still writing — taking a little longer';
// Grace period to wait for the persisted user to hydrate before erroring out
// instead of sitting on an infinite spinner.
const NO_USER_GRACE_MS = 5000;

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

// Ripple animation
const RIPPLE_DURATION = 2800;
const RIPPLE_COUNT = 3;
const RIPPLE_STAGGER = 900;
const MESSAGE_CYCLE_MS = 3800;

/** Copy for the nudge notes under the notify control: one tree, three states. */
const NOTIFY_NOTE_COPY: Record<Extract<NotifyControlState, 'pending' | 'denied' | 'registration-failed'>, string> = {
  pending: 'Setting up your nudge\u2026',
  denied: 'Notifications are off for Unfold. Turn them on in Settings and we\u2019ll nudge you when it\u2019s\u00A0ready.',
  'registration-failed': 'We couldn\u2019t set up the nudge. Check your connection and tap Notify me\u00A0again.',
};

type NotifyNoteColors = { inputBackground: string; border: string; textMuted: string; textSubtle: string };

/**
 * A bordered note under the notify control: an icon (the bell unless given)
 * beside muted copy, with optional content — the Settings link — below it.
 */
function NotifyNote({
  entering,
  colors,
  text,
  icon,
  centered = false,
  gap,
  children,
}: {
  entering: ComponentProps<typeof Animated.View>['entering'];
  colors: NotifyNoteColors;
  text: string;
  icon?: ReactNode;
  /** Centre the icon on the text (the spinner) instead of top-aligning it. */
  centered?: boolean;
  gap?: number;
  children?: ReactNode;
}) {
  return (
    <Animated.View
      entering={entering}
      style={{ marginTop: Spacing['10'], width: '100%', alignItems: 'center', ...(gap === undefined ? {} : { gap }) }}
    >
      <View
        style={[
          genStyles.notifyNote,
          { ...(centered ? { alignItems: 'center' as const } : {}), backgroundColor: colors.inputBackground, borderColor: colors.border },
        ]}
      >
        {icon ?? <BellIcon size={14} color={colors.textSubtle} weight="light" />}
        <Text style={[genStyles.notifyNoteText, { color: colors.textMuted }]}>{text}</Text>
      </View>
      {children}
    </Animated.View>
  );
}

export default function GeneratingScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  // Set only by a tapped generation_failed push, which names the job that died.
  const params = useLocalSearchParams<{ jobId?: string; devotionalId?: string }>();
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

  const user = useUnfoldStore((s) => s.user);
  const startGenerationSession = useUnfoldStore((s) => s.startGenerationSession);
  const updateGenerationSessionProgress = useUnfoldStore((s) => s.updateGenerationSessionProgress);
  const failGenerationSession = useUnfoldStore((s) => s.failGenerationSession);
  const clearGenerationSession = useUnfoldStore((s) => s.clearGenerationSession);

  const [isComplete, setIsComplete] = useState(false);
  const [devotionalTitle, setDevotionalTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(true);

  // Job polling state
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const pollingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Incremented by every startPolling; a poll whose request was in flight when
  // polling stopped (background, unmount, retry) sees a newer run and exits
  // instead of re-arming a second timer chain next to the current one.
  const pollRunRef = useRef(0);
  const jobSubmittedRef = useRef(false);
  // Set by "Go home — we'll keep writing". A job that resolves after the
  // reader left (a submission, a retry, an adopted job) persists its record
  // already marked for Today and does not start a poll loop on a screen
  // nobody is looking at.
  const leftForHomeRef = useRef(false);

  // Persist the job the server just returned — submitted, retried or adopted.
  // After "Go home — we'll keep writing" the record carries the marker so
  // Today keeps it and watches it instead of bouncing back here. One writer,
  // so no path can drop the marker; startPolling refuses the loop once Today
  // owns the watch.
  const recordJob = useCallback((jobId: string, devotionalId: string | undefined): void => {
    writeInflightGenerationJob({
      jobId,
      devotionalId,
      submittedAt: Date.now(),
      leftForHome: leftForHomeRef.current,
    });
  }, []);
  // Consecutive unrecognized job statuses — bounded so we don't poll forever
  // against a status we don't understand.
  const unknownStatusCountRef = useRef(0);
  // Consecutive failed status requests — the only client-side give-up.
  const consecutiveNetworkErrorsRef = useRef(0);
  // The server's last word on the current job; drives retry / leave decisions.
  const observedJobStateRef = useRef<ObservedJobState>('unobserved');
  // When the app left the foreground; background time is not polling time.
  const backgroundedAtRef = useRef<number | null>(null);
  // Soft "still writing" state past LONG_RUNNING_AFTER_MS (never an error).
  const [isLongRunning, setIsLongRunning] = useState(false);

  // Track when polling started for the long-running threshold and poll cadence
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

  // Prevent swipe-back during generation; re-enable on error.
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
  // How the reader's "Notify me" tap ended; null until they tap.
  const [notifyOutcome, setNotifyOutcome] = useState<NotifyRequestOutcome | null>(null);

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

      if (enabled) {
        // "Feel free to step away — we'll notify you" must be backed by a
        // token the server holds, so the note waits for the registration and
        // a failed one says so instead of promising. The session dedupe makes
        // the common case free.
        setNotifyOutcome('pending');
        const registration = await registerPushToken();
        setNotifyOutcome(registration === 'failed' ? 'registration_failed' : null);
      } else {
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
        if (backgroundedAtRef.current === null) backgroundedAtRef.current = Date.now();
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
        // Background time does not count toward the long-running threshold —
        // the first foreground poll asks the server before any decision.
        if (backgroundedAtRef.current !== null) {
          pollStartTime.current = shiftPollStart(pollStartTime.current, backgroundedAtRef.current, Date.now());
          backgroundedAtRef.current = null;
        }
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
    setNotifyOutcome(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const granted = await requestNotificationPermissions();
    setNotificationPermission(granted ? 'granted' : 'denied');
    setShowNotificationPrompt(false);
    // Nothing promises a nudge until the token reaches the server. The
    // registration can stall for tens of seconds on a bad network, and a
    // reader told to step away during it would never get the push.
    if (granted) setNotifyOutcome('pending');
    const registration = granted ? await registerPushToken() : null;
    setNotifyOutcome(resolveNotifyRequestOutcome({ granted, registration }));
  };

  const handleOpenNotificationSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void Linking.openSettings();
  };

  // Back from Settings: pick up a permission the reader just switched on.
  // Back from anywhere after a failed registration: try the token once more.
  useEffect(() => {
    if (notifyOutcome !== 'denied' && notifyOutcome !== 'registration_failed') return;
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState !== 'active') return;
      void (async () => {
        if (!(await areNotificationsEnabled())) return;
        setNotificationPermission('granted');
        setNotifyOutcome('pending');
        const registration = await registerPushToken();
        setNotifyOutcome(resolveNotifyRequestOutcome({ granted: true, registration }));
      })();
    });
    return () => subscription.remove();
  }, [notifyOutcome]);

  const notifyControl = getNotifyControlState({
    permission: notificationPermission,
    hasAskedPermission,
    showNotificationPrompt,
    isComplete,
    outcome: notifyOutcome,
  });

  const handleDismissNotificationPrompt = () => {
    if (notificationPromptTimerRef.current) {
      clearTimeout(notificationPromptTimerRef.current);
      notificationPromptTimerRef.current = null;
    }

    setHasAskedPermission(true);
    setShowNotificationPrompt(false);
  };

  // ========== GENERATION COMPLETE HANDLER ==========

  const handleGenerationComplete = useCallback((result: InitialArcResult) => {
    // Store, scripture bookkeeping, in-flight record and session are landed by
    // the shared helper (Today lands the same job the same way after "Go home").
    const { devotionalId, seriesTitle, day1 } = applyInitialArcResult(result, { user, devotionalLength });

    // Update UI state
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
  }, [user, devotionalLength]);

  // ========== POLLING LOGIC ==========

  const startPolling = useCallback((jobId: string) => {
    // After "Go home — we'll keep writing" Today owns the watch. A job that
    // resolves on this unmounted screen — a submission, a retry, an adopted
    // job — has recorded itself for Today and must not poll here too.
    if (leftForHomeRef.current) {
      logger.log('[generating] Job resolved after the reader went home; Today owns the watch:', jobId);
      return;
    }
    if (pollingRef.current) return;
    pollingRef.current = true;
    const run = ++pollRunRef.current;
    unknownStatusCountRef.current = 0;
    consecutiveNetworkErrorsRef.current = 0;
    observedJobStateRef.current = 'unobserved';

    // Shared terminal-failure exit: stop polling and surface the error state
    // with a retry path (instead of an infinite spinner). The inflight record
    // is cleared only on a server verdict; a client-side network give-up keeps
    // it so Today can resume a job the server may still be running.
    const failTerminal = (
      message: string,
      phase: string,
      cause?: unknown,
      options: { keepInflight?: boolean } = {},
    ) => {
      pollingRef.current = false;
      logger.error(`[generating] ${phase}:`, message);
      if (!options.keepInflight) clearInflightGenerationJob();
      failGenerationSession(message);
      void logBugError('generation', cause instanceof Error ? cause : new Error(message), { jobId, phase });
      setIsGenerating(false);
      setIsReconnecting(false);
      setError(message);
      setCanRetry(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    };

    // Liveness check. Time alone never fails the job: past the threshold the
    // UI softens to "still writing" and polling continues at the slow tier.
    // Only a run of failed status requests ends the wait client-side; a
    // server 'failed' status stays authoritative via evaluateGenerationPoll.
    const assessDeadline = (): GenerationDeadlineDecision => {
      const decision = evaluateGenerationDeadline({
        elapsedMs: Date.now() - pollStartTime.current,
        consecutiveNetworkErrors: consecutiveNetworkErrorsRef.current,
      });
      setIsLongRunning(decision === 'long-running');
      return decision;
    };

    const poll = async () => {
      assessDeadline();

      try {
        const status = await pollJobStatus(jobId);
        // Polling stopped (or restarted) while this request was in flight:
        // the response belongs to a chain that no longer exists.
        if (!pollingRef.current || pollRunRef.current !== run) return;
        consecutiveNetworkErrorsRef.current = countConsecutiveNetworkErrors(consecutiveNetworkErrorsRef.current, true);
        const { outcome, consecutiveUnknown } = evaluateGenerationPoll({
          status: status.status,
          result: status.result,
          error: status.error,
          canRetry: status.canRetry,
          fallbackDevotionalId: useUnfoldStore.getState().generationSession.devotionalId,
          dayNumber: 1,
          priorConsecutiveUnknown: unknownStatusCountRef.current,
        });
        unknownStatusCountRef.current = consecutiveUnknown;

        switch (outcome.kind) {
          case 'complete':
            observedJobStateRef.current = 'complete';
            pollingRef.current = false;
            handleGenerationComplete(outcome.result);
            return;

          case 'invalid-result':
            // Complete-without-result OR an unreconcilable result: terminal, not
            // a re-poll loop.
            observedJobStateRef.current = 'invalid-result';
            failTerminal(INITIAL_ARC_INVALID_RESULT_MESSAGE, 'server-poll-invalid-result');
            return;

          case 'failed': {
            // The server's verdict — the only thing that fails a job.
            observedJobStateRef.current = 'failed';
            pollingRef.current = false;
            const errorMsg = outcome.error;
            logger.error('[generating] Server job failed:', errorMsg);
            clearInflightGenerationJob();
            failGenerationSession(errorMsg);
            void logBugError('generation', new Error(errorMsg), { jobId, phase: 'server-poll' });
            setIsGenerating(false);
            setIsReconnecting(false);
            setError(errorMsg);
            setCanRetry(outcome.canRetry);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
          }

          case 'unknown-terminal':
            observedJobStateRef.current = 'unknown-terminal';
            failTerminal(INITIAL_ARC_UNKNOWN_STATUS_MESSAGE, 'server-poll-unknown-status');
            return;

          case 'waiting':
          case 'unknown-retry':
          default:
            // Still pending / processing (or a tolerated unknown) -- poll again.
            // Cadence escalates with the job's age (3s -> 5s -> 8s, jittered
            // after the first minute); pollStartTime resets per job.
            observedJobStateRef.current = 'alive';
            pollTimerRef.current = setTimeout(poll, getNextPollDelayMs(Date.now() - pollStartTime.current));
            return;
        }
      } catch (err) {
        if (!pollingRef.current || pollRunRef.current !== run) return;
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (classifyPollFailure(err) === 'job-gone') {
          // The server answered and does not hold this job (404: a deleted
          // row, another environment or device id; 400: an id it cannot
          // parse). A verdict, not connectivity: the record is dropped and no
          // job is pending, so Try again submits fresh and Go home clears the
          // session, instead of keeping a record nothing will ever resolve.
          observedJobStateRef.current = 'unknown-terminal';
          setPendingJobId(null);
          failTerminal(INITIAL_ARC_JOB_NOT_FOUND_MESSAGE, 'server-poll-not-found', err);
          return;
        }
        consecutiveNetworkErrorsRef.current = countConsecutiveNetworkErrors(consecutiveNetworkErrorsRef.current, false);
        if (assessDeadline() === 'network-error') {
          // We cannot reach the server; that is not a verdict on the job, so
          // the inflight record survives for "Try again" (re-poll) and Today.
          failTerminal(INITIAL_ARC_UNREACHABLE_MESSAGE, 'server-poll-unreachable', err, { keepInflight: true });
          return;
        }
        logger.warn(
          `[generating] Poll error ${consecutiveNetworkErrorsRef.current}/${MAX_CONSECUTIVE_POLL_NETWORK_ERRORS} (will retry):`,
          errorMsg,
        );

        // Keep polling on transient errors -- the server job is still running
        // (doubled cadence, as before)
        pollTimerRef.current = setTimeout(poll, getNextPollDelayMs(Date.now() - pollStartTime.current) * 2);
      }
    };

    poll();
  }, [handleGenerationComplete, failGenerationSession]);

  // ========== JOB SUBMISSION ==========

  useEffect(() => {
    if (!user) {
      // The persisted user normally hydrates within a frame. If it never
      // arrives, don't sit on an infinite spinner — the network give-up lives
      // inside poll(), which never starts here. Surface the error state after a
      // short grace so the user still gets a retry / go-home path.
      const graceTimer = setTimeout(() => {
        if (jobSubmittedRef.current) return;
        logger.warn('[generating] No user after grace period — showing error state');
        setIsGenerating(false);
        setIsReconnecting(false);
        setError('We couldn’t load your details. Please try again.');
        setCanRetry(true);
      }, NO_USER_GRACE_MS);
      return () => clearTimeout(graceTimer);
    }

    if (jobSubmittedRef.current) return;
    jobSubmittedRef.current = true;

    // Resume an in-flight job (app-kill recovery, or a record the reader once
    // left for Today — this screen owns the wait whenever it is on screen),
    // land on the job a failure push named, send a stale push home, or submit
    // fresh. The record carries no expiry: the first poll asks the server,
    // which alone decides the job's fate.
    // A push is judged stale against the generation session and the series
    // already in the store, never against currentDevotionalId: onboarding's
    // sample and a finished journey are "current" too, and read as moved on.
    const { generationSession, devotionals } = useUnfoldStore.getState();
    const entry = resolveGeneratingEntry({
      inflight: readInflightGenerationJob(),
      params: { jobId: params.jobId, devotionalId: params.devotionalId },
      sessionDevotionalId: generationSession.devotionalId,
      landedDevotionalIds: devotionals.map((devotional) => devotional.id),
    });
    if (entry.kind === 'resume') {
      const { inflight } = entry;
      logger.log('[generating] Resuming inflight job from MMKV:', inflight.jobId);
      if (inflight.devotionalId) {
        startGenerationSession({ devotionalId: inflight.devotionalId, totalDays: user.devotionalLength });
      }
      setPendingJobId(inflight.jobId);
      pollStartTime.current = inflight.submittedAt;
      startPolling(inflight.jobId);
      return;
    }

    if (entry.kind === 'stale-push') {
      // "We hit a snag" outlived the job it names: iOS keeps the push after
      // Start over already wrote a new series, or another job is in flight.
      // Try again on the old job would resurrect a superseded series, so
      // Today reconciles whatever is current or in flight instead.
      logger.log('[generating] Ignoring a failure push for a superseded job:', entry.jobId);
      void logBugEvent('generation', 'generation-failed-push-stale', { jobId: entry.jobId });
      router.replace('/(tabs)/(today)');
      return;
    }

    if (entry.kind === 'poll-from-push') {
      // The push named a job and every terminal exit clears the inflight
      // record, so poll that job by id instead of submitting a duplicate. The
      // push is not the verdict: iOS keeps it in Notification Center after a
      // retry or a fresh start already resolved the job, so the server's
      // status decides. A failed job lands with the server's error text and
      // retry budget, a complete one opens the devotional, a re-queued one
      // keeps waiting. Asserting failure here made Try again 409-loop on a
      // complete job and resurrect a superseded one.
      logger.log('[generating] Polling the job a failure push named:', entry.jobId);
      void logBugEvent('generation', 'generation-failed-push-landing', { jobId: entry.jobId });
      if (entry.devotionalId) {
        startGenerationSession({ devotionalId: entry.devotionalId, totalDays: user.devotionalLength });
      }
      setPendingJobId(entry.jobId);
      pollStartTime.current = Date.now();
      startPolling(entry.jobId);
      return;
    }

    const submitJob = async () => {
      try {
        void logBugEvent('generation', 'server-generation-start', { jobType: 'initial_arc' });

        const { jobId, devotionalId: submittedDevotionalId } = await submitGenerationJob({
          dayNumber: 1,
          jobType: 'initial_arc',
          userContext: buildInitialArcUserContext(user),
        });

        const devotionalId = requireCanonicalDevotionalId(submittedDevotionalId, 'initial devotional job submission');

        // Persist inflight job to MMKV for app-kill recovery. Written before
        // the session starts so Today, which re-reads the record when the
        // session changes, never sees the session without the record.
        recordJob(jobId, devotionalId);
        startGenerationSession({ devotionalId, totalDays: user.devotionalLength });
        logger.log('[generating] Job submitted:', jobId);

        setPendingJobId(jobId);
        setIsReconnecting(false);
        updateGenerationSessionProgress({ title: GENERATING_SESSION_TITLE_PLACEHOLDER });

        // Reset poll start time and start polling
        pollStartTime.current = Date.now();
        startPolling(jobId);
      } catch (err) {
        const failure = resolveGenerationSubmitFailure(err);
        if (failure.kind === 'adopt-existing') {
          // The server already has a job for this user/day. Adopt it instead of
          // dead-ending on an error that would resubmit from scratch on retry.
          const existingJobId = failure.jobId;
          logger.log('[generating] Submission reports an existing job; adopting it:', existingJobId);
          void logBugEvent('generation', 'generation-adopt-existing-job', { existingJobId });
          const sessionDevotionalId = useUnfoldStore.getState().generationSession.devotionalId;
          try {
            // The completed result may already be available — recover it directly.
            const recovered = sessionDevotionalId
              ? await recoverCompletedGenerationResult({
                  devotionalId: sessionDevotionalId,
                  dayNumber: 1,
                  existingJobId,
                })
              : null;
            if (recovered) {
              handleGenerationComplete(recovered);
              return;
            }
          } catch (recoverErr) {
            logger.warn('[generating] Existing-job recovery failed; will poll instead:', recoverErr);
          }
          // Not ready yet (or no known devotionalId) — poll the existing job.
          recordJob(existingJobId, sessionDevotionalId ?? undefined);
          setPendingJobId(existingJobId);
          setIsReconnecting(false);
          pollStartTime.current = Date.now();
          startPolling(existingJobId);
          return;
        }

        const errorMessage = failure.message;
        logger.error('[generating] Job submission failed:', errorMessage);
        clearInflightGenerationJob();
        failGenerationSession(errorMessage);
        void logBugError('generation', err, { jobType: 'initial_arc', phase: 'server-job-submission' });
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

    // Never create a duplicate series: with a known job the server's last word
    // on it decides between re-polling (client lost contact) and POST /retry
    // (server verdict). Only with no job at all do we submit, and the server
    // dedups that too (active-job 200 / completed-day 409 + existingJobId).
    const action = resolveGenerationRetryAction({ pendingJobId, observedState: observedJobStateRef.current });

    try {
      if (action.kind === 'resume-poll') {
        // The give-up kept the record, so nothing is written here; the
        // session moves off the failure while the same job is asked again.
        logger.log('[generating] Re-polling job after a client-side give-up:', action.jobId);
        updateGenerationSessionProgress({});
        startPolling(action.jobId);
      } else if (action.kind === 'retry-existing') {
        // Retry existing job on the server
        const { jobId } = await retryJob(action.jobId);
        logger.log('[generating] Job retried:', jobId);
        recordJob(jobId, useUnfoldStore.getState().generationSession.devotionalId ?? undefined);
        // The session sat on the failure while the job is running again.
        // Moving it back to running is also what tells Today, which re-reads
        // the record when the session moves, to swap the failed card for the
        // preparing one when the reader already went home.
        updateGenerationSessionProgress({ title: GENERATING_SESSION_TITLE_PLACEHOLDER });
        setPendingJobId(jobId);
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
          // Same builder as the primary path — a retried generation must not
          // silently lose the personalization fields (review finding: this
          // branch was missed in the buildInitialArcUserContext refactor).
          const { jobId, devotionalId: submittedDevotionalId } = await submitGenerationJob({
            dayNumber: 1,
            jobType: 'initial_arc',
            userContext: buildInitialArcUserContext(user),
          });

          const devotionalId = requireCanonicalDevotionalId(submittedDevotionalId, 'retry initial devotional job submission');
          // Record before the session starts, as on first submission.
          recordJob(jobId, devotionalId);
          startGenerationSession({ devotionalId, totalDays: user.devotionalLength });
          logger.log('[generating] Re-submitted job:', jobId);
          setPendingJobId(jobId);
          startPolling(jobId);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error('[generating] Retry failed:', errorMessage);
      // A failed retry request is not a verdict on the job: keep the record
      // for a known job so Today can resume it; clear it only with no job.
      if (resolveRetryFailureCleanup(action) === 'clear') clearInflightGenerationJob();
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
    // The job is abandoned, not finished: the record stays, marked superseded,
    // so the "We hit a snag" push iOS keeps for it cannot poll it back to life
    // and re-run the answers the reader just walked away from. The fresh
    // submission's own write replaces it.
    supersedeInflightGenerationJob(pendingJobId);
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
    const cleanup = resolveGoHomeCleanup({ pendingJobId, observedState: observedJobStateRef.current });
    if (cleanup === 'clear') {
      clearInflightGenerationJob();
      clearGenerationSession();
    } else {
      // We only lost contact with the server; it may still own this job.
      // Keep the record, marked for Today so it watches the job from there
      // instead of reading app-kill recovery and bouncing back here, and move
      // the session off the failure the reader just left so Today shows the
      // preparing card while it asks the server itself.
      markInflightJobLeftForHome();
      updateGenerationSessionProgress({});
      logger.log('[generating] Leaving with a possibly live job in flight:', pendingJobId);
    }
    router.replace('/(tabs)/(today)');
  };

  // "Go home — we'll keep writing" (waiting state). The record stays, marked
  // leftForHome, so the server job keeps running and Today shows the
  // preparing card and watches it instead of bouncing back here. Nothing is
  // awaited and no permission prompt sits on this path: the tap must always
  // leave this screen.
  const handleLeaveForHome = () => {
    leftForHomeRef.current = true;
    const record = markInflightJobLeftForHome();
    void logBugEvent('generation', 'generation-left-for-home', {
      jobId: record?.jobId ?? pendingJobId,
      notificationPermission,
      hasAskedPermission,
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace('/(tabs)/(today)');
  };

  // ========== RENDER: ERROR STATE ==========

  if (error) {
    const displayError = toFriendlyOnboardingGenerationError(error);
    const isConnectionError = displayError.toLowerCase().includes('connection');
    return (
      <View style={genStyles.transparentFlex}>
        <SafeAreaView style={genStyles.errorSafeArea}>
          {/* Error icon */}
          <View style={genStyles.errorIcon}>
            <WarningCircleIcon size={28} color={colors.accent} weight="light" />
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
                  ...Typography.cardMeta,
                  color: colors.textSubtle,
                  textAlign: 'left',
                }}
              >
                Your {user?.devotionalLength}-day series
              </Text>
            </Animated.View>

            <Animated.View entering={entering(FadeIn.duration(1000).delay(400))}>
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 39,
                  color: colors.text,
                  textAlign: 'left',
                  lineHeight: 48,
                  letterSpacing: -0.4,
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

          {/* Rotating contemplative message -- swapped for reconnecting msg when
              auto-retrying, or for the soft "still writing" line once the job
              outlives the long-running threshold (never an error). */}
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
            ) : isLongRunning ? (
              <Animated.Text
                key="long-running"
                entering={entering(FadeIn.duration(600))}
                accessibilityLiveRegion="polite"
                numberOfLines={1}
                style={{
                  fontFamily: FontFamily.bodyItalic,
                  fontSize: 17,
                  color: colors.text,
                  textAlign: 'center',
                }}
              >
                {LONG_RUNNING_MESSAGE}
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

          {/* Series title reveal -- shows when server returns title from arc.
              Ternary, not `&&`: the empty-string default would otherwise be
              emitted as a bare text node inside this View. */}
          {currentSeriesTitle ? (
            <Animated.View
              entering={entering(FadeIn.duration(800))}
              style={{ alignItems: 'center', marginBottom: Spacing['3'] }}
            >
              <Text
                style={{
                  fontFamily: FontFamily.display,
                  fontSize: 27,
                  color: colors.text,
                  textAlign: 'center',
                  lineHeight: 36,
                  letterSpacing: -0.15,
                }}
              >
                {currentSeriesTitle}
              </Text>
            </Animated.View>
          ) : null}

          {/* Notification prompt -- appears after a delay */}
          {notifyControl === 'prompt' && (
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

          {/* Token registration in flight -- nothing promises a nudge yet. The
              entrance delay hides the state when the session dedupe resolves it
              within a frame. */}
          {notifyControl === 'pending' && (
            <NotifyNote
              entering={entering(FadeIn.duration(400).delay(300))}
              colors={colors}
              centered
              icon={<ActivityIndicator size="small" color={colors.textSubtle} />}
              text={NOTIFY_NOTE_COPY.pending}
            />
          )}

          {/* After enabling notifications */}
          {notifyControl === 'confirmed' && (
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

          {/* Permission denied -- say so, and point at Settings */}
          {notifyControl === 'denied' && (
            <NotifyNote entering={entering(FadeIn.duration(400))} colors={colors} gap={Spacing['3']} text={NOTIFY_NOTE_COPY.denied}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleOpenNotificationSettings}
                accessibilityRole="button"
                accessibilityLabel="Open Settings to turn on notifications"
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: FontSize.sm,
                    color: colors.textMuted,
                    textDecorationLine: 'underline',
                  }}
                >
                  Open Settings
                </Text>
              </TouchableOpacity>
            </NotifyNote>
          )}

          {/* Permission granted but the token never reached the server */}
          {notifyControl === 'registration-failed' && (
            <NotifyNote entering={entering(FadeIn.duration(400))} colors={colors} text={NOTIFY_NOTE_COPY['registration-failed']} />
          )}

          {/* Already had notifications -- gentle note */}
          {notifyControl === 'granted-note' && (
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

          {/* ========== GO HOME \u2014 the waiting state must never be a dead end ========== */}
          {/* Dino (build 245): after "I'll wait" there was no way back. Leaving is
              fully safe \u2014 the job is persisted to MMKV and continues server-side;
              Today shows the preparing card and watches the job until it lands.
              Jordan (1.1.0): the record is marked leftForHome on the way out,
              otherwise Today read it as app-kill recovery and bounced straight
              back here, which looked like a dead link. */}
          {isGenerating && !isComplete && (
            <Animated.View
              entering={entering(FadeIn.duration(600).delay(1200))}
              style={{ marginTop: Spacing['8'], alignItems: 'center', gap: Spacing['3'] }}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleLeaveForHome}
                accessibilityRole="button"
                accessibilityLabel="Go home while your devotional is prepared"
                hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
              >
                <Text
                  style={{
                    fontFamily: FontFamily.ui,
                    fontSize: FontSize.sm,
                    color: colors.textMuted,
                    textDecorationLine: 'underline',
                  }}
                >
                  {'Go home \u2014 we\u2019ll keep\u00A0writing'}
                </Text>
              </TouchableOpacity>

              {/* Second chance at the ready-notification for "I'll wait" users.
                  Hidden while the main notification prompt above is already
                  showing its own Notify me control, so the two never duplicate.
                  Kept after a failed registration so the reader can retry. */}
              {(notifyControl === 'link' || notifyControl === 'registration-failed') && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleRequestNotifications}
                  accessibilityRole="button"
                  accessibilityLabel="Notify me when ready"
                  hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <BellIcon size={13} color={colors.textSubtle} weight="light" />
                  <Text
                    style={{
                      fontFamily: FontFamily.ui,
                      fontSize: 13,
                      color: colors.textSubtle,
                    }}
                  >
                    Notify me when it&apos;s ready
                  </Text>
                </TouchableOpacity>
              )}
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
                    ...Typography.cardMeta,
                    color: colors.accent,
                    marginBottom: Spacing['2'],
                  }}
                >
                  {SAMPLE_PREVIEW.scripture}
                </Text>

                {/* Theme title */}
                <Text
                  style={{
                    fontFamily: FontFamily.display,
                    fontSize: 20,
                    color: colors.text,
                    marginBottom: Spacing['4'],
                    lineHeight: 27,
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

                {/* Reflection question — hairline-framed wash, matching the
                    reader's blockquote treatment (no left sliver) */}
                <View
                  style={{
                    backgroundColor: 'rgba(200, 165, 92, 0.06)',
                    borderRadius: Radius.md,
                    paddingVertical: Spacing['4'],
                    paddingHorizontal: Spacing['5'],
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: 'rgba(200, 165, 92, 0.22)',
                  }}
                >
                  <Text
                    style={{
                      ...Typography.cardMeta,
                      color: colors.accent,
                      marginBottom: Spacing['2'],
                    }}
                  >
                    Reflect
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
  notifyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: Spacing['4'],
    paddingVertical: 10,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  notifyNoteText: {
    flex: 1,
    fontFamily: FontFamily.ui,
    fontSize: 13,
    lineHeight: 18,
    marginLeft: Spacing['2'],
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
  errorTitle: {
    fontFamily: FontFamily.display,
    fontSize: 25,
    letterSpacing: -0.15,
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
