/**
 * Widget Data Bridge
 * Pushes app state (streak, devotional progress, etc.) to iOS widgets
 * and manages Live Activity lifecycle for reading sessions.
 *
 * Widgets run in a separate process and can't access Zustand directly.
 * Data flows: App → Widget.updateTimeline([now, midnight]) → WidgetKit renders
 */
import { logger } from '@/lib/logger';
import UnfoldStreakWidget from '@/widgets/ios/UnfoldStreak';
import UnfoldTodayWidget from '@/widgets/ios/UnfoldToday';
import UnfoldDashboardWidget from '@/widgets/ios/UnfoldDashboard';
import UnfoldReadingSessionActivity from '@/widgets/ios/UnfoldReadingSession';
import { useUnfoldStore } from '@/lib/store';
import type { LiveActivity } from 'expo-widgets';
import { buildWidgetTimelineEntries, getWeeklyProgress } from '@/lib/widget-timeline';

// Track active reading session
let activeReadingSession: LiveActivity<{
  devotionalTitle: string;
  dayTitle: string;
  dayNumber: number;
  totalDays: number;
  elapsedMinutes: number;
  totalMinutes: number;
  isListening: boolean;
  streakCount: number;
}> | null = null;

// ---------------------------------------------------------------------------
// Fingerprint guard (RS10-1)
//
// syncWidgets() is called on every Today useFocusEffect. Pushing new timeline
// entries to WidgetKit has a measurable IPC cost, so we skip the native call
// when nothing material has changed. The fingerprint captures exactly the four
// shared-prop dimensions that affect widget rendering:
//   1. streakCurrent — badge count + streak display
//   2. streakLastReadDate — determines hasReadToday (self-expires at midnight)
//   3. current day id/title — which day the "Today" widget labels
//   4. weeklyProgress — the M-Su "read" indicator dots
//
// The fingerprint is a JSON-stringified plain object of these values. It is
// intentionally NOT a hash — the string compare is cheap and human-readable
// in debugger output.
// ---------------------------------------------------------------------------

let lastWidgetSyncFingerprint: string | null = null;

/** Build the fingerprint string for the current store state. */
function buildSyncFingerprint(now: Date): string {
  const state = useUnfoldStore.getState();
  const devotional = state.getCurrentDevotional();
  const currentDay = devotional?.days?.find((d) => d.dayNumber === devotional.currentDay);

  const hasReadToday = state.streakLastReadDate
    ? new Date(state.streakLastReadDate).toDateString() === now.toDateString()
    : false;

  return JSON.stringify({
    streakCurrent: state.streakCurrent,
    streakLastReadDate: state.streakLastReadDate,
    hasReadToday,
    dayId: devotional ? `${devotional.id}:${devotional.currentDay}` : null,
    dayTitle: currentDay?.title ?? null,
    weeklyProgress: getWeeklyProgress(state.devotionals ?? [], now),
  });
}

/**
 * Reset the last-sync fingerprint. Exported for test isolation only —
 * production code must never call this.
 */
export function resetWidgetSyncFingerprintForTesting(): void {
  lastWidgetSyncFingerprint = null;
}

/**
 * Push current app state to all widgets as a two-entry timeline
 * (now + next midnight) so the "read today" state self-expires at 00:00.
 * Call this whenever streak, devotional, or reading state changes.
 * Skips the native push when the material widget inputs are unchanged
 * since the last successful sync (RS10-1).
 */
export function syncWidgets(): void {
  try {
    const now = new Date();
    const fingerprint = buildSyncFingerprint(now);
    if (fingerprint === lastWidgetSyncFingerprint) return;

    const state = useUnfoldStore.getState();

    const entries = buildWidgetTimelineEntries(
      {
        streakCurrent: state.streakCurrent,
        streakLongest: state.streakLongest,
        streakLastReadDate: state.streakLastReadDate,
        readingDuration: state.user?.readingDuration ?? 5,
        currentDevotional: state.getCurrentDevotional(),
        allDevotionals: state.devotionals ?? [],
      },
      now
    );

    UnfoldStreakWidget.updateTimeline(entries);
    UnfoldTodayWidget.updateTimeline(entries);
    UnfoldDashboardWidget.updateTimeline(entries);

    lastWidgetSyncFingerprint = fingerprint;
  } catch (error) {
    // Widgets may not be configured yet — fail silently
    logger.log('[Widgets] sync error (non-fatal):', error);
  }
}

/**
 * Whether Live Activities are available.
 * Disabled on simulator (hangs indefinitely) and after runtime errors.
 */
let liveActivityDisabled = false;

// Detect simulator — Live Activity .start() is a sync JSI call that hangs on simulator
try {
  // expo-constants or NativeModules can tell us, but the simplest check:
  // __DEV__ + no hardware support is a reasonable proxy
  const { Platform } = require('react-native');
  // Platform.constants.isTesting is set on simulator
  if (__DEV__ && Platform.OS === 'ios') {
    // Check for simulator via model name — simulators have "x86_64" or "arm64" arch
    // but the safest check is whether we're in Expo dev client
    const Constants = require('expo-constants').default;
    if (Constants?.executionEnvironment === 'storeClient' ? false : !Constants?.isDevice) {
      liveActivityDisabled = true;
      logger.log('[Widgets] Live Activities disabled (simulator detected)');
    }
  }
} catch {
  // If detection fails, leave enabled — will catch errors at runtime
}

/**
 * Start a Live Activity for an active reading/listening session.
 */
export function startReadingSession(params: {
  devotionalTitle: string;
  dayTitle: string;
  dayNumber: number;
  totalDays: number;
  totalMinutes: number;
  isListening: boolean;
}): void {
  // Skip on simulator or after previous failures — prevents app freeze
  if (liveActivityDisabled) return;

  // Defer to next tick so UI can update first
  setTimeout(() => {
    try {
      // End existing session if any
      if (activeReadingSession) {
        activeReadingSession.end('immediate').catch(() => {});
        activeReadingSession = null;
      }

      const state = useUnfoldStore.getState();

      activeReadingSession = UnfoldReadingSessionActivity.start({
        ...params,
        elapsedMinutes: 0,
        streakCount: state.streakCurrent,
      });
      logger.log('[Widgets] Live Activity started');
    } catch (error) {
      logger.log('[Widgets] startReadingSession error — disabling:', error);
      liveActivityDisabled = true;
    }
  }, 0);
}

/**
 * Update the reading session Live Activity with new elapsed time.
 */
export function updateReadingSession(elapsedMinutes: number, isListening?: boolean): void {
  if (!activeReadingSession) return;

  try {
    const state = useUnfoldStore.getState();
    const devotional = state.getCurrentDevotional();
    const currentDay = devotional?.days?.find(
      (d) => d.dayNumber === devotional?.currentDay
    );

    activeReadingSession.update({
      devotionalTitle: devotional?.title ?? 'Unfold',
      dayTitle: currentDay?.title ?? 'Reading...',
      dayNumber: devotional?.currentDay ?? 1,
      totalDays: devotional?.totalDays ?? 7,
      elapsedMinutes,
      totalMinutes: state.user?.readingDuration ?? 5,
      isListening: isListening ?? false,
      streakCount: state.streakCurrent,
    });
  } catch (error) {
    logger.log('[Widgets] updateReadingSession error:', error);
  }
}

/**
 * End the reading session Live Activity.
 */
export function endReadingSession(): void {
  if (!activeReadingSession) return;

  try {
    activeReadingSession.end('default').catch(() => {});
    activeReadingSession = null;

    // Also sync widgets to reflect the completed reading
    syncWidgets();
  } catch (error) {
    logger.log('[Widgets] endReadingSession error:', error);
  }
}

/**
 * Check if a reading session Live Activity is currently active.
 */
export function isReadingSessionActive(): boolean {
  return activeReadingSession !== null;
}
