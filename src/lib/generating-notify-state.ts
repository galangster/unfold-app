/**
 * Pure decisions behind the "Notify me when it's ready" control on the
 * generating screen. The screen owns the state; these functions own the rule.
 */
import { isLongSeries } from './generation-poll-outcome';
import type { PushRegistrationResult } from './push-notifications';

export type NotificationPermission = 'unknown' | 'granted' | 'denied';

/**
 * What the reader's "Notify me" tap ended in. 'pending' is the token
 * registration itself: the permission is granted but the server holds no
 * token yet, so nothing may promise a nudge until it resolves.
 */
export type NotifyRequestOutcome =
  | 'pending'
  | 'confirmed'
  | 'denied'
  | 'registration_failed'
  | 'registration_unavailable';

/** Which notification block the generating screen renders. */
export type NotifyControlState =
  | 'none'
  | 'prompt'
  | 'pending'
  | 'denied'
  | 'registration-failed'
  | 'registration-unavailable'
  | 'confirmed'
  | 'granted-note'
  | 'link';

/**
 * A granted permission whose token never reached the backend is not a
 * nudge, so the screen must not promise one. A skipped registration is also
 * unavailable: the server has not confirmed that it holds a token.
 */
export function resolveNotifyRequestOutcome({
  granted,
  registration,
}: {
  granted: boolean;
  registration: PushRegistrationResult | null;
}): Exclude<NotifyRequestOutcome, 'pending'> {
  if (!granted) return 'denied';
  if (registration === 'failed') return 'registration_failed';
  if (registration === 'registered') return 'confirmed';
  return 'registration_unavailable';
}

export function getNotifyControlState({
  permission,
  hasAskedPermission,
  showNotificationPrompt,
  isComplete,
  outcome,
}: {
  permission: NotificationPermission;
  hasAskedPermission: boolean;
  showNotificationPrompt: boolean;
  isComplete: boolean;
  outcome: NotifyRequestOutcome | null;
}): NotifyControlState {
  if (isComplete) return 'none';
  if (showNotificationPrompt && permission !== 'granted' && !hasAskedPermission) return 'prompt';
  if (outcome === 'pending') return 'pending';
  if (outcome === 'denied') return 'denied';
  if (outcome === 'registration_failed') return 'registration-failed';
  if (outcome === 'registration_unavailable') return 'registration-unavailable';
  // Only a registered token confirms the nudge. A granted permission on its
  // own promises what the server cannot send while the registration is still
  // in flight, so it renders nothing after an ask and the gentle note before.
  if (outcome === 'confirmed') return 'confirmed';
  if (permission === 'granted') return hasAskedPermission ? 'none' : 'granted-note';
  if (!showNotificationPrompt) return 'link';
  return 'none';
}

/**
 * Where the screen says it will notify the reader. Only a confirmed
 * registration promises a notification, and the screen says it once: a long
 * series says it on the wait line, any other series beside the exit.
 */
export type NotifyPromisePlacement = 'none' | 'wait-line' | 'exit';

export function resolveNotifyPromisePlacement(
  state: NotifyControlState,
  totalDays: number,
): NotifyPromisePlacement {
  if (state !== 'confirmed') return 'none';
  return isLongSeries(totalDays) ? 'wait-line' : 'exit';
}

/** The wait line's second sentence when it carries the promise. */
export const WAIT_LINE_NOTIFY_PROMISE_COPY =
  'You can leave this screen. We\u2019ll let you know when Day 1 is ready.';

/** Copy below the accepted-job exit. */
export function resolveAcceptedGenerationExitCopy(placement: NotifyPromisePlacement): string {
  if (placement === 'exit') {
    return 'We\u2019ll keep writing your first devotional.\nWe\u2019ll notify you when it\u2019s ready.';
  }
  if (placement === 'wait-line') return 'We\u2019ll keep writing your first devotional.';
  return 'We\u2019ll keep writing your first devotional.\nCome back whenever you\u2019re ready.';
}
