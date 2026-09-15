/**
 * useActReminderSync — single owner of the act reminder one-shot.
 *
 * Watches the day the reader finished today. When it carries an act and no
 * outcome yet, one local notification is scheduled at the slot the act
 * names; any change (outcome recorded, times edited, day switched, new day)
 * cancels and replans. Passive: never prompts for permission. Mount once in
 * the root layout next to the other notification owners.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { usePremiumAccessPolicy } from '@/hooks/usePremiumAccessPolicy';
import { useUnfoldStore, useHasHydrated } from '@/lib/store';
import { getCurrentDevotional, getDaysReadToday } from '@/lib/home-devotional-state';
import { buildActReminderFingerprint, buildActReminderPlan, type ActReminderPlanInput } from '@/lib/act-reminder';
import { getEffectivePremiumAccessPolicy } from '@/lib/premium-state';
import { areNotificationsEnabled, cancelActReminder, scheduleActReminder } from '@/lib/notifications';
import { logger } from '@/lib/logger';

const DEBOUNCE_MS = 500;

type StoreState = ReturnType<typeof useUnfoldStore.getState>;

export function readActReminderPlanInput(state: StoreState): ActReminderPlanInput & { enabled: boolean } {
  const devotional = getCurrentDevotional(state.devotionals, state.currentDevotionalId);
  return {
    devotional,
    day: getDaysReadToday(devotional)[0] ?? null,
    middayTime: state.middayCheckInTime,
    eveningTime: state.eveningWindDownTime,
    eveningWindDownEnabled: state.eveningWindDownEnabled,
    eveningWindDownByDay: state.eveningWindDownByDay,
    premiumPolicy: getEffectivePremiumAccessPolicy(),
    morningTime: state.user?.reminderTime,
    // Rides on the daily-reminder preference: a reader who switched
    // reminders off asked for silence, not a new kind of nudge.
    enabled: state.user?.dailyReminderEnabled ?? Boolean(state.user?.reminderTime),
  };
}

/**
 * Zustand runs the selector on every store write. Deriving the plan input
 * walks the current devotional's days, so cache the fingerprint on the
 * identities that can change it and skip the walk otherwise.
 */
function createFingerprintSelector(): (state: StoreState) => string {
  let last: { keys: unknown[]; fingerprint: string } | null = null;
  return (state) => {
    const keys = [
      state.devotionals,
      state.currentDevotionalId,
      state.middayCheckInTime,
      state.eveningWindDownTime,
      state.eveningWindDownEnabled,
      state.eveningWindDownByDay,
      state.user?.reminderTime,
      state.user?.dailyReminderEnabled,
      state.user?.isPremium,
    ];
    if (last && last.keys.every((key, index) => Object.is(key, keys[index]))) return last.fingerprint;
    const fingerprint = buildActReminderFingerprint(readActReminderPlanInput(state));
    last = { keys, fingerprint };
    return fingerprint;
  };
}

export function useActReminderSync() {
  const hasHydrated = useHasHydrated();
  const premiumPolicy = usePremiumAccessPolicy();
  const selectorRef = useRef(createFingerprintSelector());
  const storeFingerprint = useUnfoldStore(selectorRef.current);
  const fingerprint = `${storeFingerprint}|${premiumPolicy}`;

  const lastAppliedRef = useRef('');
  const lastAppliedDayRef = useRef('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const latestFingerprintRef = useRef(fingerprint);
  latestFingerprintRef.current = fingerprint;

  async function runSync(reason: 'hydration' | 'fingerprint' | 'foreground'): Promise<void> {
    if (!hasHydrated) return;
    const target = latestFingerprintRef.current;
    const todayStr = new Date().toDateString();
    if (reason !== 'hydration' && target === lastAppliedRef.current && todayStr === lastAppliedDayRef.current) {
      return;
    }
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    try {
      const input = readActReminderPlanInput(useUnfoldStore.getState());
      // Cancel-then-write: every run clears the pending act reminder so a
      // replan never leaves an orphan for a day that changed.
      await cancelActReminder();

      const notificationsEnabled = await areNotificationsEnabled();
      const plan = input.enabled
        ? buildActReminderPlan({ ...input, notificationsEnabled })
        : null;
      if (plan && notificationsEnabled) {
        await scheduleActReminder(plan);
      }
      lastAppliedRef.current = target;
      lastAppliedDayRef.current = todayStr;
      logger.log(`[useActReminderSync] ${plan ? `planned ${plan.slot} at ${plan.fireAt.toISOString()}` : 'nothing to plan'} (reason=${reason})`);
    } catch (error) {
      logger.error('[useActReminderSync] Sync failed:', error);
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void runSync('fingerprint');
      }
    }
  }

  useEffect(() => {
    if (!hasHydrated) return;
    void runSync('hydration');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => void runSync('fingerprint'), DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, fingerprint]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void runSync('foreground');
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);
}
