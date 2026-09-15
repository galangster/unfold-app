import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import type { PremiumAccessPolicy } from '@/lib/premium-access-policy';

function readFocusParam(focus: string | string[] | undefined): string | undefined {
  return Array.isArray(focus) ? focus[0] : focus;
}

export type MiddayNotificationOpenInput = {
  focus?: string | string[];
  hasHydrated: boolean;
  isTodayFocused: boolean;
  policy: PremiumAccessPolicy;
  currentDevotionalId: string | null | undefined;
  hasCompletedMiddayCheckIn: boolean;
  gate: () => boolean;
  openCheckIn: () => void;
  clearFocus: () => void;
};

/**
 * Opens Today's existing midday CheckInSheet from a notification
 * `focus=midday` route param. The ordinary midday card still ends at 17:00.
 *
 * Waits for store hydration, Today focus, and a resolved premium policy.
 * Consumes the param once so closing the sheet, rerenders, or a later
 * Today visit cannot reopen it. A later independent tap can set it again.
 * A leftover param after a series switch is dropped, not reopened.
 */
export function useMiddayNotificationOpen({
  focus,
  hasHydrated,
  isTodayFocused,
  policy,
  currentDevotionalId,
  hasCompletedMiddayCheckIn,
  gate,
  openCheckIn,
  clearFocus,
}: MiddayNotificationOpenInput): void {
  const consumedRef = useRef(false);

  useEffect(() => {
    const resolvedFocus = readFocusParam(focus);
    if (resolvedFocus !== 'midday') {
      consumedRef.current = false;
      return;
    }

    if (!isTodayFocused || !hasHydrated || policy === 'unknown') {
      return;
    }

    if (consumedRef.current) return;

    consumedRef.current = true;
    clearFocus();

    if (!gate()) return;

    if (!currentDevotionalId) {
      Alert.alert('No series found', 'Start a series to check in.');
      return;
    }

    if (hasCompletedMiddayCheckIn) {
      Alert.alert('Checked in', 'Your midday reflection is already saved.');
      return;
    }

    openCheckIn();
  }, [
    clearFocus,
    currentDevotionalId,
    focus,
    gate,
    hasCompletedMiddayCheckIn,
    hasHydrated,
    isTodayFocused,
    openCheckIn,
    policy,
  ]);
}
