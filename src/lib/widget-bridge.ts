/**
 * Widget Data Bridge
 * Pushes app state (streak, devotional progress, etc.) to iOS widgets
 * and manages Live Activity lifecycle for reading sessions.
 *
 * Widgets run in a separate process and can't access Zustand directly.
 * Data flows: App → Widget.updateSnapshot() → WidgetKit renders
 */
import { logger } from '@/lib/logger';
import UnfoldStreakWidget from '@/widgets/ios/UnfoldStreak';
import UnfoldTodayWidget from '@/widgets/ios/UnfoldToday';
import UnfoldDashboardWidget from '@/widgets/ios/UnfoldDashboard';
import UnfoldReadingSessionActivity from '@/widgets/ios/UnfoldReadingSession';
import { useUnfoldStore } from '@/lib/store';
import type { LiveActivity } from 'expo-widgets';

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

/**
 * Push current app state to all widgets.
 * Call this whenever streak, devotional, or reading state changes.
 */
export function syncWidgets(): void {
  try {
    const state = useUnfoldStore.getState();
    const devotional = state.getCurrentDevotional();

    const today = new Date().toDateString();
    const hasReadToday = state.streakLastReadDate
      ? new Date(state.streakLastReadDate).toDateString() === today
      : false;

    // Current day data
    const currentDay = devotional?.days?.find(
      (d) => d.dayNumber === devotional.currentDay
    );
    const nextDay = devotional?.days?.find(
      (d) => d.dayNumber === (devotional?.currentDay ?? 0) + 1
    );

    // Weekly progress: look back 7 days for read status
    const weeklyProgress = getWeeklyProgress(state);

    const sharedProps = {
      streakCount: state.streakCurrent,
      streakLongest: state.streakLongest,
      hasReadToday,
      devotionalTitle: devotional?.title ?? 'Unfold',
      dayTitle: currentDay?.title ?? 'Start your series',
      dayNumber: devotional?.currentDay ?? 0,
      totalDays: devotional?.totalDays ?? 0,
      scriptureReference: currentDay?.scriptureReference ?? '',
      scriptureText: currentDay?.scriptureText ?? '',
      quotableLine: currentDay?.quotableLine ?? '',
      readingMinutes: state.user?.readingDuration ?? 5,
      weeklyProgress,
      nextDayTitle: nextDay?.title ?? '',
    };

    // Update all widgets with current data
    UnfoldStreakWidget.updateSnapshot(sharedProps);
    UnfoldTodayWidget.updateSnapshot(sharedProps);
    UnfoldDashboardWidget.updateSnapshot(sharedProps);
  } catch (error) {
    // Widgets may not be configured yet — fail silently
    logger.log('[Widgets] sync error (non-fatal):', error);
  }
}

/**
 * Build a 7-character string of "0" and "1" for M-Su weekly reading.
 */
function getWeeklyProgress(state: ReturnType<typeof useUnfoldStore.getState>): string {
  const devotional = state.getCurrentDevotional();
  if (!devotional) return '0,0,0,0,0,0,0';

  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const bits: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + mondayOffset + i);
    const dateStr = d.toDateString();

    // Check if any day was read on this date
    const wasRead = (devotional.days ?? []).some(
      (day) => day.readAt && new Date(day.readAt).toDateString() === dateStr
    );
    bits.push(wasRead ? '1' : '0');
  }

  return bits.join(',');
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
