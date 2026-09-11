const mockGetPermissionsAsync = jest.fn();
const mockRequestNotificationPermissions = jest.fn();
const mockRegisterPushToken = jest.fn();
const mockSyncTrialEndingNotification = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: jest.fn(),
}));

jest.mock('@/lib/notifications', () => ({
  requestNotificationPermissions: (...args: unknown[]) => mockRequestNotificationPermissions(...args),
}));

jest.mock('@/lib/push-notifications', () => ({
  registerPushToken: (...args: unknown[]) => mockRegisterPushToken(...args),
}));

jest.mock('@/lib/trial-notification', () => ({
  syncTrialEndingNotification: (...args: unknown[]) => mockSyncTrialEndingNotification(...args),
}));

jest.mock('@/lib/auto-trial-telemetry', () => ({
  trackNotificationPermissionAnswered: jest.fn(),
}));

import { askNotificationPermissionInContext, resetNotificationAskBaseline } from '../notification-ask';
import { runReminderTimeCommit } from '../reminder-time-commit';

describe('G6 reminder time commit', () => {
  it('asks once after the 300 ms settle, then advances', async () => {
    const calls: string[] = [];
    let transitioning = false;

    const result = await runReminderTimeCommit({
      isTransitioning: () => transitioning,
      setTransitioning: (value) => {
        transitioning = value;
        calls.push(`setTransitioning:${value}`);
      },
      select: () => {
        calls.push('select');
      },
      settleDelayMs: 300,
      askPermissionOnce: async () => {
        calls.push('ask');
      },
      advance: () => {
        calls.push('advance');
      },
      wait: async (ms) => {
        calls.push(`wait:${ms}`);
      },
    });

    expect(result).toBe('advanced');
    expect(calls).toEqual([
      'setTransitioning:true',
      'select',
      'wait:300',
      'ask',
      'advance',
      'setTransitioning:false',
    ]);
  });

  it('advances once the permission request resolves even if registerPushToken never settles', async () => {
    resetNotificationAskBaseline();
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestNotificationPermissions.mockResolvedValue(true);
    mockRegisterPushToken.mockReturnValue(new Promise(() => undefined));
    const advance = jest.fn();

    await expect(runReminderTimeCommit({
      isTransitioning: () => false,
      setTransitioning: () => undefined,
      select: () => undefined,
      settleDelayMs: 300,
      askPermissionOnce: async () => {
        await askNotificationPermissionInContext({
          trigger: 'reminder_time',
          registration: 'background',
        });
      },
      advance,
      wait: async () => undefined,
    })).resolves.toBe('advanced');

    expect(advance).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushToken).toHaveBeenCalled();
  });

  it('returns ignored on a second tap while the OS dialog is open', async () => {
    let resolveAsk: () => void = () => undefined;
    let transitioning = false;
    const askPermissionOnce = () => new Promise<void>((resolve) => {
      resolveAsk = resolve;
    });

    const deps = {
      isTransitioning: () => transitioning,
      setTransitioning: (value: boolean) => {
        transitioning = value;
      },
      select: () => undefined,
      settleDelayMs: 300,
      askPermissionOnce,
      advance: jest.fn(),
      wait: async () => undefined,
    };

    const first = runReminderTimeCommit(deps);
    const second = await runReminderTimeCommit(deps);
    expect(second).toBe('ignored');
    resolveAsk();
    await expect(first).resolves.toBe('advanced');
    expect(deps.advance).toHaveBeenCalledTimes(1);
  });

  it('still advances when the ask rejects', async () => {
    const advance = jest.fn();
    await expect(runReminderTimeCommit({
      isTransitioning: () => false,
      setTransitioning: () => undefined,
      select: () => undefined,
      settleDelayMs: 300,
      askPermissionOnce: async () => {
        throw new Error('ask failed');
      },
      advance,
      wait: async () => undefined,
    })).resolves.toBe('advanced');
    expect(advance).toHaveBeenCalledTimes(1);
  });
});
