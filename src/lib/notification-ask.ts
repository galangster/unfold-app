import * as Notifications from 'expo-notifications';
import type { CustomerInfo } from 'react-native-purchases';
import { trackNotificationPermissionAnswered } from '@/lib/auto-trial-telemetry';
import { requestNotificationPermissions } from '@/lib/notifications';
import { registerPushToken } from '@/lib/push-notifications';
import { readTrialEntitlement } from '@/lib/trial-facts';
import { syncTrialEndingNotification } from '@/lib/trial-notification';
import { useUIState } from '@/lib/ui-state';

export type NotificationPermissionState = 'granted' | 'undetermined' | 'denied';
export type NotificationAskTrigger =
  | 'reminder_time'
  | 'series_reveal'
  | 'generating'
  | 'later_entry_fallback';

type PermissionBaseline = 'granted' | 'not_granted';

let lastKnownPermission: PermissionBaseline | null = null;

function mapPermissionStatus(status: string): NotificationPermissionState {
  if (status === 'granted') return 'granted';
  if (status === 'undetermined') return 'undetermined';
  return 'denied';
}

function baselineFromState(state: NotificationPermissionState): PermissionBaseline {
  return state === 'granted' ? 'granted' : 'not_granted';
}

export function resetNotificationAskBaseline(): void {
  lastKnownPermission = null;
}

export async function readNotificationPermissionState(): Promise<NotificationPermissionState> {
  const { status } = await Notifications.getPermissionsAsync();
  return mapPermissionStatus(status);
}

function emitAnswered(
  trigger: NotificationAskTrigger,
  result: 'granted' | 'denied' | 'registration_failed',
  priorStatus: NotificationPermissionState,
): void {
  trackNotificationPermissionAnswered({
    trigger,
    result,
    prior_status: priorStatus,
  });
}

export async function askNotificationPermissionInContext(o: {
  trigger: NotificationAskTrigger;
  registration: 'await' | 'background';
}): Promise<'granted' | 'denied' | 'registration_failed'> {
  const priorStatus = await readNotificationPermissionState();
  const granted = await requestNotificationPermissions();
  lastKnownPermission = granted ? 'granted' : 'not_granted';

  if (!granted) {
    emitAnswered(o.trigger, 'denied', priorStatus);
    return 'denied';
  }

  void syncTrialEndingNotification();
  useUIState.getState().bumpNotificationPermissionEpoch();

  if (o.registration === 'background') {
    void registerPushToken().then(
      (result) => {
        emitAnswered(
          o.trigger,
          result === 'failed' ? 'registration_failed' : 'granted',
          priorStatus,
        );
      },
      () => {
        emitAnswered(o.trigger, 'registration_failed', priorStatus);
      },
    );
    return 'granted';
  }

  try {
    const result = await registerPushToken();
    if (result === 'failed') {
      emitAnswered(o.trigger, 'registration_failed', priorStatus);
      return 'registration_failed';
    }
    emitAnswered(o.trigger, 'granted', priorStatus);
    return 'granted';
  } catch {
    emitAnswered(o.trigger, 'registration_failed', priorStatus);
    return 'registration_failed';
  }
}

export async function onNotificationPermissionMaybeChanged(): Promise<void> {
  try {
    const state = await readNotificationPermissionState();
    const next = baselineFromState(state);
    if (lastKnownPermission === 'not_granted' && state === 'granted') {
      void syncTrialEndingNotification();
      useUIState.getState().bumpNotificationPermissionEpoch();
    }
    lastKnownPermission = next;
  } catch {
    // A read that throws changes nothing.
  }
}

export async function requestLaterEntryNotifyAsk(customerInfo: CustomerInfo): Promise<void> {
  try {
    if (readTrialEntitlement(customerInfo)?.periodType !== 'TRIAL') return;
    const permission = await readNotificationPermissionState();
    if (permission !== 'undetermined') return;
    useUIState.getState().setLaterEntryNotifyAskPending(true);
  } catch {
    // Never throws.
  }
}
