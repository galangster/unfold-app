/**
 * updateUser returns early when there is no user record. The guard is correct
 * — there is nothing to merge into — but the write is silently lost, and the
 * onboarding paywall writes `isPremium: true` before the record exists. This
 * covers the diagnostic that makes that loss visible, and the rule that the
 * diagnostic carries KEYS ONLY: values hold personal data.
 */

import type { PremiumAccessPolicy } from '../premium-access-policy';

type PolicyHolder = typeof globalThis & { __unfoldMockPremiumPolicy?: PremiumAccessPolicy };

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => {
    const mockMmkvStore = new Map<string, string>();
    (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
      .__unfoldMockMmkvStore = mockMmkvStore;
    return {
      getString: jest.fn((key: string) => mockMmkvStore.get(key)),
      set: jest.fn((key: string, value: string) => {
        mockMmkvStore.set(key, value);
        return true;
      }),
      delete: jest.fn((key: string) => mockMmkvStore.delete(key)),
    };
  }),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string) => `uuid-v5:${value}`),
}));

jest.mock('../logger', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(() => Promise.resolve()),
}));

jest.mock('../premium-state', () => ({
  getEffectivePremiumAccessPolicy: () =>
    (globalThis as PolicyHolder).__unfoldMockPremiumPolicy ?? 'unknown',
}));

// eslint-disable-next-line import/first -- store import must run after Jest module mocks are registered.
import { useUnfoldStore, type UserProfile } from '../store';
// eslint-disable-next-line import/first
import { logger } from '../logger';
// eslint-disable-next-line import/first
import { logBugEvent } from '../bug-logger';

const warnMock = logger.warn as jest.Mock;
const logBugEventMock = logBugEvent as jest.Mock;

function warnText(): string {
  return warnMock.mock.calls.map((args: unknown[]) => args.join(' ')).join(' | ');
}

describe('store updateUser dropped-write diagnostic', () => {
  beforeEach(() => {
    useUnfoldStore.setState({ user: null, userUpdatedAt: undefined });
    warnMock.mockClear();
    logBugEventMock.mockClear();
  });

  it('logs a warning naming the dropped keys and changes no state when the user is null', () => {
    useUnfoldStore.getState().updateUser({ isPremium: true, hasCompletedOnboarding: true });

    expect(useUnfoldStore.getState().user).toBeNull();
    expect(useUnfoldStore.getState().userUpdatedAt).toBeUndefined();

    expect(warnMock).toHaveBeenCalledTimes(1);
    const text = warnText();
    expect(text).toContain('updateUser');
    expect(text).toContain('isPremium');
    expect(text).toContain('hasCompletedOnboarding');
  });

  it('records a local bug event carrying the dropped keys', () => {
    useUnfoldStore.getState().updateUser({ isPremium: true });

    expect(logBugEventMock).toHaveBeenCalledTimes(1);
    const [category, , data, level] = logBugEventMock.mock.calls[0];
    expect(category).toBe('store-update-user-dropped');
    expect(data).toEqual({ keys: ['isPremium'] });
    expect(level).toBe('warn');
  });

  it('never puts a dropped value in the diagnostic, only its key', () => {
    useUnfoldStore.getState().updateUser({ name: 'Nick', aboutMe: 'a private sentence' });

    expect(warnText()).toContain('name');
    expect(warnText()).not.toContain('Nick');
    expect(warnText()).not.toContain('a private sentence');

    const [, message, data] = logBugEventMock.mock.calls[0];
    expect(JSON.stringify({ message, data })).not.toContain('Nick');
    expect(JSON.stringify({ message, data })).not.toContain('a private sentence');
  });

  it('stays silent and still writes when a user record exists', () => {
    useUnfoldStore.setState({ user: { name: 'Nick', isPremium: false } as UserProfile });

    useUnfoldStore.getState().updateUser({ isPremium: true });

    expect(useUnfoldStore.getState().user?.isPremium).toBe(true);
    expect(warnMock).not.toHaveBeenCalled();
    expect(logBugEventMock).not.toHaveBeenCalled();
  });
});
