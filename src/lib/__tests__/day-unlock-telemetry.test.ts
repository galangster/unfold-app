/**
 * A ready push for a day the app keeps closed raises one Sentry issue. Only the
 * day number leaves the device.
 */
import { captureAppSignal } from '@/lib/sentry';
import { READY_PUSH_FOR_LOCKED_DAY_EVENT, reportReadyPushForLockedDay } from '../day-unlock-telemetry';

jest.mock('@/lib/sentry', () => ({
  captureAppSignal: jest.fn(),
}));

describe('reportReadyPushForLockedDay', () => {
  beforeEach(() => jest.clearAllMocks());

  it('raises one Sentry signal that carries only the day number', () => {
    reportReadyPushForLockedDay(4);

    expect(captureAppSignal).toHaveBeenCalledTimes(1);
    expect(captureAppSignal).toHaveBeenCalledWith('ready_push_for_locked_day', { day_number: 4 });
  });

  it('keeps the event name stable for alerts', () => {
    expect(READY_PUSH_FOR_LOCKED_DAY_EVENT).toBe('ready_push_for_locked_day');
  });
});
