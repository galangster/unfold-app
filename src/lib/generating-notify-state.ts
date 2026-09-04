/**
 * Pure decisions behind the "Notify me when it's ready" control on the
 * generating screen. The screen owns the state; these functions own the rule.
 */
import type { PushRegistrationResult } from './push-notifications';

export type NotificationPermission = 'unknown' | 'granted' | 'denied';

/** What the reader's "Notify me" tap ended in. */
export type NotifyRequestOutcome = 'confirmed' | 'denied' | 'registration_failed';

/** Which notification block the generating screen renders. */
export type NotifyControlState =
  | 'none'
  | 'prompt'
  | 'denied'
  | 'registration-failed'
  | 'confirmed'
  | 'granted-note'
  | 'link';

/**
 * A granted permission whose token never reached the backend is not a
 * nudge, so the screen must not promise one. 'skipped' counts as confirmed:
 * it is the simulator / no-project-id path, where nothing is wrong.
 */
export function resolveNotifyRequestOutcome({
  granted,
  registration,
}: {
  granted: boolean;
  registration: PushRegistrationResult | null;
}): NotifyRequestOutcome {
  if (!granted) return 'denied';
  if (registration === 'failed') return 'registration_failed';
  return 'confirmed';
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
  if (outcome === 'denied') return 'denied';
  if (outcome === 'registration_failed') return 'registration-failed';
  if (permission === 'granted') return hasAskedPermission ? 'confirmed' : 'granted-note';
  if (!showNotificationPrompt) return 'link';
  return 'none';
}
