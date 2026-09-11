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

function onPermissionBecameGranted(): void {
  void syncTrialEndingNotification();
  useUIState.getState().bumpNotificationPermissionEpoch();
}

export function resetNotificationAskBaseline(): void {
  lastKnownPermission = null;
}

export async function readNotificationPermissionState(): Promise<NotificationPermissionState> {
  const { status } = await Notifications.getPermissionsAsync();
  return mapPermissionStatus(status);
}

export async function askNotificationPermissionInContext(o: {
  trigger: NotificationAskTrigger;
  registration: 'await' | 'background';
}): Promise<'granted' | 'denied' | 'registration_failed'> {
  const priorStatus = await readNotificationPermissionState();
  const granted = await requestNotificationPermissions();
  lastKnownPermission = granted ? 'granted' : 'not_granted';

  if (!granted) {
    trackNotificationPermissionAnswered({
      trigger: o.trigger,
      result: 'denied',
      prior_status: priorStatus,
    });
    return 'denied';
  }

  onPermissionBecameGranted();

  if (o.registration === 'background') {
    void registerPushToken().then(
      (result) => {
        trackNotificationPermissionAnswered({
          trigger: o.trigger,
          result: result === 'failed' ? 'registration_failed' : 'granted',
          prior_status: priorStatus,
        });
      },
      () => {
        trackNotificationPermissionAnswered({
          trigger: o.trigger,
          result: 'registration_failed',
          prior_status: priorStatus,
        });
      },
    );
    return 'granted';
  }

  try {
    const result = await registerPushToken();
    if (result === 'failed') {
      trackNotificationPermissionAnswered({
        trigger: o.trigger,
        result: 'registration_failed',
        prior_status: priorStatus,
      });
      return 'registration_failed';
    }
    trackNotificationPermissionAnswered({
      trigger: o.trigger,
      result: 'granted',
      prior_status: priorStatus,
    });
    return 'granted';
  } catch {
    trackNotificationPermissionAnswered({
      trigger: o.trigger,
      result: 'registration_failed',
      prior_status: priorStatus,
    });
    return 'registration_failed';
  }
}

export async function onNotificationPermissionMaybeChanged(): Promise<void> {
  try {
    const state = await readNotificationPermissionState();
    if (lastKnownPermission === 'not_granted' && state === 'granted') {
      onPermissionBecameGranted();
    }
    lastKnownPermission = baselineFromState(state);
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
