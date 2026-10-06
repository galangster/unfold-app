/**
 * Day-unlock telemetry: the instrument that makes a push-versus-lock gap visible.
 *
 * A "ready" push that names a day the pacing lock holds until the next local
 * day throws nothing and breaks nothing. The reader sees Today say Tomorrow and
 * concludes the app is broken. Only a reader's report would ever show that the
 * server and the app disagreed (docs/day-unlock-contract.md). This is the Sentry
 * issue that says a release or a server change reopened the gap.
 *
 * This call adds only the day number: no reader writing or identifiers.
 * The Sentry event also retains the context allowed by captureAppSignal,
 * including device, release, and breadcrumb information.
 */
import { captureAppSignal } from '@/lib/sentry';

/** Event name. A stable string: alerts key off it. */
export const READY_PUSH_FOR_LOCKED_DAY_EVENT = 'ready_push_for_locked_day';

export function reportReadyPushForLockedDay(dayNumber: number): void {
  captureAppSignal(READY_PUSH_FOR_LOCKED_DAY_EVENT, { day_number: dayNumber });
}
