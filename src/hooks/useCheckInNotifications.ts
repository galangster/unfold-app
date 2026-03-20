import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useUnfoldStore } from '@/lib/store';
import {
  scheduleMiddayCheckIn,
  scheduleEveningWindDown,
  cancelMiddayCheckIn,
  cancelEveningWindDown,
  areNotificationsEnabled,
} from '@/lib/notifications';

/**
 * Manages midday check-in and evening wind-down notification scheduling.
 * Responds to store toggle changes, app foregrounding, and onboarding status.
 * Should be called once in the root layout.
 */
export function useCheckInNotifications() {
  const middayEnabled = useUnfoldStore((s) => s.middayCheckInEnabled);
  const eveningEnabled = useUnfoldStore((s) => s.eveningWindDownEnabled);
  const hasCompletedOnboarding = useUnfoldStore((s) => !!s.user?.hasCompletedOnboarding);

  // Schedule/cancel when toggles change or on mount
  useEffect(() => {
    if (!hasCompletedOnboarding) return;

    let cancelled = false;

    const sync = async () => {
      if (cancelled) return;

      const hasPermission = await areNotificationsEnabled();
      if (!hasPermission || cancelled) return;

      if (middayEnabled) {
        await scheduleMiddayCheckIn();
      } else {
        await cancelMiddayCheckIn();
      }

      if (cancelled) return;

      if (eveningEnabled) {
        await scheduleEveningWindDown();
      } else {
        await cancelEveningWindDown();
      }
    };

    sync();

    return () => { cancelled = true; };
  }, [middayEnabled, eveningEnabled, hasCompletedOnboarding]);

  // Reschedule on app foreground (catches iOS Settings permission changes)
  useEffect(() => {
    if (!hasCompletedOnboarding) return;

    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;

      const hasPermission = await areNotificationsEnabled();
      if (!hasPermission) return;

      if (middayEnabled) await scheduleMiddayCheckIn();
      if (eveningEnabled) await scheduleEveningWindDown();
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [middayEnabled, eveningEnabled, hasCompletedOnboarding]);
}
