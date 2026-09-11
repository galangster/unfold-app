import type { CustomerInfo } from 'react-native-purchases';

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockRequestNotificationPermissions = jest.fn();
const mockRegisterPushToken = jest.fn();
const mockSyncTrialEndingNotification = jest.fn();
const mockTrackNotificationPermissionAnswered = jest.fn();
const mockReadTrialEntitlement = jest.fn();
const mockBumpEpoch = jest.fn();
const mockSetLaterEntryNotifyAskPending = jest.fn();

let mockLaterEntryNotifyAskPending = false;
let mockNotificationPermissionEpoch = 0;

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
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
  trackNotificationPermissionAnswered: (...args: unknown[]) =>
    mockTrackNotificationPermissionAnswered(...args),
}));

jest.mock('@/lib/trial-facts', () => ({
  readTrialEntitlement: (...args: unknown[]) => mockReadTrialEntitlement(...args),
}));

jest.mock('@/lib/ui-state', () => ({
  useUIState: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector({
      mockLaterEntryNotifyAskPending,
      mockNotificationPermissionEpoch,
    }),
    {
      getState: () => ({
        mockLaterEntryNotifyAskPending,
        mockNotificationPermissionEpoch,
        bumpNotificationPermissionEpoch: () => {
          mockNotificationPermissionEpoch += 1;
          mockBumpEpoch();
        },
        setLaterEntryNotifyAskPending: (value: boolean) => {
          mockLaterEntryNotifyAskPending = value;
          mockSetLaterEntryNotifyAskPending(value);
        },
      }),
    },
  ),
}));

import {
  askNotificationPermissionInContext,
  onNotificationPermissionMaybeChanged,
  readNotificationPermissionState,
  requestLaterEntryNotifyAsk,
  resetNotificationAskBaseline,
} from '../notification-ask';

describe('G8 notification ask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLaterEntryNotifyAskPending = false;
    mockNotificationPermissionEpoch = 0;
    resetNotificationAskBaseline();
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestNotificationPermissions.mockImplementation(async () => {
      const existing = await mockGetPermissionsAsync();
      if (existing.status === 'granted') return true;
      const next = await mockRequestPermissionsAsync();
      return next.status === 'granted';
    });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockRegisterPushToken.mockResolvedValue('registered');
  });

  it('on grant syncs the trial notice, bumps the epoch, registers, and emits granted with prior_status', async () => {
    await expect(
      askNotificationPermissionInContext({ trigger: 'reminder_time', registration: 'await' }),
    ).resolves.toBe('granted');

    expect(mockSyncTrialEndingNotification).toHaveBeenCalledTimes(1);
    expect(mockBumpEpoch).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushToken).toHaveBeenCalledTimes(1);
    expect(mockTrackNotificationPermissionAnswered).toHaveBeenCalledWith({
      trigger: 'reminder_time',
      result: 'granted',
      prior_status: 'undetermined',
    });
  });

  it('on denial calls none of the grant effects and emits denied', async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });

    await expect(
      askNotificationPermissionInContext({ trigger: 'series_reveal', registration: 'await' }),
    ).resolves.toBe('denied');

    expect(mockSyncTrialEndingNotification).not.toHaveBeenCalled();
    expect(mockBumpEpoch).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
    expect(mockTrackNotificationPermissionAnswered).toHaveBeenCalledWith({
      trigger: 'series_reveal',
      result: 'denied',
      prior_status: 'undetermined',
    });
  });

  it('emits registration_failed when registerPushToken returns failed', async () => {
    mockRegisterPushToken.mockResolvedValue('failed');

    await expect(
      askNotificationPermissionInContext({ trigger: 'generating', registration: 'await' }),
    ).resolves.toBe('registration_failed');

    expect(mockTrackNotificationPermissionAnswered).toHaveBeenCalledWith({
      trigger: 'generating',
      result: 'registration_failed',
      prior_status: 'undetermined',
    });
  });

  it('returns before background registration settles and emits once after it settles', async () => {
    let resolveRegistration: (value: 'registered') => void = () => undefined;
    mockRegisterPushToken.mockReturnValue(new Promise((resolve) => {
      resolveRegistration = resolve;
    }));

    const pending = askNotificationPermissionInContext({
      trigger: 'reminder_time',
      registration: 'background',
    });

    await expect(pending).resolves.toBe('granted');
    expect(mockTrackNotificationPermissionAnswered).not.toHaveBeenCalled();

    resolveRegistration('registered');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockTrackNotificationPermissionAnswered).toHaveBeenCalledTimes(1);
    expect(mockTrackNotificationPermissionAnswered).toHaveBeenCalledWith({
      trigger: 'reminder_time',
      result: 'granted',
      prior_status: 'undetermined',
    });
  });

  it('does not call requestPermissionsAsync when prior status is granted', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });

    await expect(
      askNotificationPermissionInContext({ trigger: 'series_reveal', registration: 'await' }),
    ).resolves.toBe('granted');

    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockTrackNotificationPermissionAnswered).toHaveBeenCalledWith({
      trigger: 'series_reveal',
      result: 'granted',
      prior_status: 'granted',
    });
  });

  it('maps getPermissionsAsync status through readNotificationPermissionState', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'denied' });
    await expect(readNotificationPermissionState()).resolves.toBe('denied');
  });
});

describe('G8b root reconcile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLaterEntryNotifyAskPending = false;
    mockNotificationPermissionEpoch = 0;
    resetNotificationAskBaseline();
    mockRegisterPushToken.mockResolvedValue('registered');
  });

  it('runs one sync and one epoch bump when baseline denied becomes granted, with no register or event', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'denied' });
    await onNotificationPermissionMaybeChanged();
    expect(mockSyncTrialEndingNotification).not.toHaveBeenCalled();

    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
    await onNotificationPermissionMaybeChanged();

    expect(mockSyncTrialEndingNotification).toHaveBeenCalledTimes(1);
    expect(mockBumpEpoch).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
    expect(mockTrackNotificationPermissionAnswered).not.toHaveBeenCalled();
  });

  it('makes no grant calls for granted → granted or a null baseline', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
    await onNotificationPermissionMaybeChanged();
    expect(mockSyncTrialEndingNotification).not.toHaveBeenCalled();
    expect(mockBumpEpoch).not.toHaveBeenCalled();

    await onNotificationPermissionMaybeChanged();
    expect(mockSyncTrialEndingNotification).not.toHaveBeenCalled();
    expect(mockBumpEpoch).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
    expect(mockTrackNotificationPermissionAnswered).not.toHaveBeenCalled();
  });

  it('keeps one sync total when an in-context grant is followed by an AppState reconcile', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestNotificationPermissions.mockResolvedValue(true);
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });

    await askNotificationPermissionInContext({ trigger: 'reminder_time', registration: 'await' });
    expect(mockSyncTrialEndingNotification).toHaveBeenCalledTimes(1);

    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
    await onNotificationPermissionMaybeChanged();

    expect(mockSyncTrialEndingNotification).toHaveBeenCalledTimes(1);
    expect(mockBumpEpoch).toHaveBeenCalledTimes(1);
  });
});

describe('requestLaterEntryNotifyAsk', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLaterEntryNotifyAskPending = false;
    resetNotificationAskBaseline();
  });

  it('sets the flag for a TRIAL entitlement with undetermined permission', async () => {
    mockReadTrialEntitlement.mockReturnValue({ periodType: 'TRIAL' });
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });

    await requestLaterEntryNotifyAsk({ entitlements: { active: {} } } as CustomerInfo);

    expect(mockSetLaterEntryNotifyAskPending).toHaveBeenCalledWith(true);
  });

  it('does not set the flag for a NORMAL entitlement or granted permission', async () => {
    mockReadTrialEntitlement.mockReturnValue({ periodType: 'NORMAL' });
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    await requestLaterEntryNotifyAsk({ entitlements: { active: {} } } as CustomerInfo);
    expect(mockSetLaterEntryNotifyAskPending).not.toHaveBeenCalled();

    mockReadTrialEntitlement.mockReturnValue({ periodType: 'TRIAL' });
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
    await requestLaterEntryNotifyAsk({ entitlements: { active: {} } } as CustomerInfo);
    expect(mockSetLaterEntryNotifyAskPending).not.toHaveBeenCalled();
  });
});
