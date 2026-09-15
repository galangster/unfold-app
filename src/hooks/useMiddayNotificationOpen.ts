import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { triggerUserDataPull } from '@/lib/full-sync-pull';
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
 * Waits for hydration, focus, access, and any missing-series sync.
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
  const [missingSeriesSyncSettled, setMissingSeriesSyncSettled] = useState(false);
  const resolvedFocus = readFocusParam(focus);

  useEffect(() => {
    if (resolvedFocus !== 'midday') {
      setMissingSeriesSyncSettled(false);
      return;
    }
    if (!hasHydrated || !isTodayFocused || currentDevotionalId || policy !== 'granted' || consumedRef.current) {
      return;
    }

    // Reuse the startup pull in flight. A hydrated store can still be empty
    // while remote restoration is applying the user's current series.
    let cancelled = false;
    void triggerUserDataPull('midday-notification').then(() => {
      if (!cancelled) setMissingSeriesSyncSettled(true);
    });
    return () => { cancelled = true; };
  }, [currentDevotionalId, hasHydrated, isTodayFocused, policy, resolvedFocus]);

  useEffect(() => {
    if (resolvedFocus !== 'midday') {
      consumedRef.current = false;
      return;
    }

    if (!isTodayFocused || !hasHydrated || policy === 'unknown') {
      return;
    }
    if (policy === 'granted' && !currentDevotionalId && !missingSeriesSyncSettled) return;

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
    resolvedFocus,
    gate,
    hasCompletedMiddayCheckIn,
    hasHydrated,
    isTodayFocused,
    missingSeriesSyncSettled,
    openCheckIn,
    policy,
  ]);
}
