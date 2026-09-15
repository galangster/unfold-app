import React from 'react';
import { AppState } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { buildActReminderFingerprint } from '@/lib/act-reminder';
import { readActReminderPlanInput, useActReminderSync } from '../useActReminderSync';

const ACT =
  'Tonight after your toddler is down, sit in the quiet for two full minutes before picking up your phone.';

const now = new Date(2026, 8, 8, 9, 15, 0);

const day = {
  dayNumber: 4,
  title: 'The Unfinished House',
  scriptureReference: 'Psalm 132:1-5',
  scriptureText: '',
  bodyText: '',
  quotableLine: '',
  isRead: true,
  readAt: new Date(2026, 8, 8, 7, 40, 0).toISOString(),
  act: ACT,
};

const devotional = {
  id: 'dev-1',
  title: 'Building What Lasts',
  totalDays: 7,
  currentDay: 5,
  days: [day],
  createdAt: '',
  userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
  generationMode: 'progressive' as const,
};

const mockScheduleActReminder = jest.fn(async (..._args: unknown[]) => 'act-1');
const mockCancelActReminder = jest.fn(async () => undefined);
const mockAreNotificationsEnabled = jest.fn(async () => true);
let mockPremiumPolicy: 'granted' | 'denied' | 'unknown' = 'granted';

const mockStoreState = {
  devotionals: [devotional],
  currentDevotionalId: 'dev-1',
  middayCheckInTime: '12:30',
  eveningWindDownTime: '20:30',
  eveningWindDownEnabled: false,
  eveningWindDownByDay: null as Record<string, string | null> | null,
  user: {
    reminderTime: '8:00 AM',
    dailyReminderEnabled: true,
    isPremium: true,
  },
};

jest.mock('@/lib/store', () => ({
  useUnfoldStore: Object.assign(
    (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
    { getState: () => mockStoreState },
  ),
  useHasHydrated: () => true,
}));

jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => mockPremiumPolicy,
}));

jest.mock('@/lib/premium-state', () => ({
  getEffectivePremiumAccessPolicy: () => mockPremiumPolicy,
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/notifications', () => ({
  scheduleActReminder: (...args: unknown[]) => mockScheduleActReminder(...args),
  cancelActReminder: () => mockCancelActReminder(),
  areNotificationsEnabled: () => mockAreNotificationsEnabled(),
}));

function Harness() {
  useActReminderSync();
  return null;
}

describe('readActReminderPlanInput', () => {
  it('includes wind-down enablement and time in the plan input and fingerprint', () => {
    mockStoreState.eveningWindDownEnabled = true;
    mockStoreState.eveningWindDownTime = '20:30';
    const input = readActReminderPlanInput(mockStoreState as never);
    expect(input.eveningWindDownEnabled).toBe(true);
    expect(input.eveningTime).toBe('20:30');
    const enabled = buildActReminderFingerprint(input);
    const disabled = buildActReminderFingerprint({ ...input, eveningWindDownEnabled: false });
    expect(enabled).not.toBe(disabled);
  });
});

describe('useActReminderSync wind-down collision', () => {
  let tree: renderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    mockPremiumPolicy = 'granted';
    mockStoreState.eveningWindDownEnabled = false;
    mockStoreState.eveningWindDownByDay = null;
    mockStoreState.eveningWindDownTime = '20:30';
    mockScheduleActReminder.mockReset();
    mockCancelActReminder.mockReset();
    mockAreNotificationsEnabled.mockReset();
    mockScheduleActReminder.mockResolvedValue('act-1');
    mockCancelActReminder.mockResolvedValue(undefined);
    mockAreNotificationsEnabled.mockResolvedValue(true);
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => {
      return { remove: jest.fn() };
    });
  });

  afterEach(async () => {
    await act(async () => {
      tree?.unmount();
    });
    tree = null;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  async function flushScheduled() {
    await act(async () => {
      await Promise.all(
        [...mockScheduleActReminder.mock.results, ...mockCancelActReminder.mock.results].map((result) =>
          Promise.resolve(result.value).catch(() => undefined),
        ),
      );
    });
  }

  async function mountHook() {
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    await flushScheduled();
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await flushScheduled();
  }

  async function flushFingerprint() {
    await act(async () => {
      tree?.update(<Harness />);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    await flushScheduled();
  }

  it('schedules the evening act reminder when wind-down is disabled for that day', async () => {
    mockStoreState.eveningWindDownEnabled = true;
    mockStoreState.eveningWindDownByDay = {
      Mon: '20:30',
      Tue: null,
      Wed: '20:30',
      Thu: '20:30',
      Fri: '20:30',
      Sat: '20:30',
      Sun: '20:30',
    };
    await mountHook();
    expect(mockScheduleActReminder).toHaveBeenCalled();
    expect(mockScheduleActReminder.mock.calls[0][0]).toEqual(
      expect.objectContaining({ slot: 'evening' }),
    );
  });

  it('cancels an already scheduled evening act reminder when wind-down becomes scheduled', async () => {
    await mountHook();
    expect(mockScheduleActReminder).toHaveBeenCalled();
    const scheduledAfterMount = mockScheduleActReminder.mock.calls.length;
    const cancelledAfterMount = mockCancelActReminder.mock.calls.length;

    mockStoreState.eveningWindDownEnabled = true;
    await flushFingerprint();

    expect(mockCancelActReminder.mock.calls.length).toBeGreaterThan(cancelledAfterMount);
    expect(mockScheduleActReminder.mock.calls.length).toBe(scheduledAfterMount);
  });
});
