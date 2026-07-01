jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getDeviceId: jest.fn(() => 'test-device'),
    __clearMockStorage: () => store.clear(),
  };
});

import {
  buildUserProfileSyncChange,
  buildUserProfileSyncData,
  buildUserProfileSyncId,
  syncUserProfileToBackend,
} from '../user-profile-sync';
import { drainSyncOutbox, peekSyncOutbox, resetDrainStateForTesting } from '../sync-outbox';
import { mmkvStorage } from '../mmkv-storage';
import type { UserProfile } from '../store';

const baseUser: UserProfile = {
  name: 'Nick',
  aboutMe: 'Building Unfold',
  personaTraits: [],
  currentSituation: 'launch week',
  emotionalState: '',
  faithImpact: '',
  spiritualSeeking: 'trusting God with the outcome',
  readingDuration: 15,
  devotionalLength: 7,
  reminderTime: '8:00 AM',
  dailyReminderEnabled: true,
  hasCompletedOnboarding: true,
  hasCompletedStyleOnboarding: true,
  isPremium: true,
  fontSize: 'medium',
  writingStyle: {
    tone: 'poetic',
    depth: 'theological',
    faithBackground: 'mature',
    lifeStage: 'building',
  },
  bibleTranslation: 'BSB',
  themeMode: 'dark',
  accentTheme: 'gold',
  readingFont: 'source-serif',
  preferredVoice: 'arman',
  selectedTheme: 'rest',
  selectedType: 'personal',
  relationshipWithGod: 'ups-and-downs',
  bibleFrequency: 'few-times-week',
  growthGoals: ['prayer', 'scripture'],
  obstacles: ['busy'],
};

beforeEach(() => {
  jest.clearAllMocks();
  (mmkvStorage as any).__clearMockStorage?.();
  resetDrainStateForTesting();
});

describe('user profile sync payloads', () => {
  it('stores generation-writing preferences under sync_users.settings', () => {
    const data = buildUserProfileSyncData(baseUser);

    expect(data).toMatchObject({
      name: 'Nick',
      aboutMe: 'Building Unfold',
      currentSituation: 'launch week',
      spiritualSeeking: 'trusting God with the outcome',
      relationshipWithGod: 'ups-and-downs',
      bibleFrequency: 'few-times-week',
      growthGoals: ['prayer', 'scripture'],
      obstacles: ['busy'],
      settings: {
        writingStyle: {
          tone: 'poetic',
          depth: 'theological',
          faithBackground: 'mature',
          lifeStage: 'building',
        },
        readingDuration: 15,
        devotionalLength: 7,
        dailyReminderEnabled: true,
        bibleTranslation: 'BSB',
        selectedTheme: 'rest',
        selectedType: 'personal',
      },
    });

    // These are local/server-owned or non-column fields and must not be sent as
    // top-level sync_users columns where the backend would drop or ignore them.
    expect(data).not.toHaveProperty('writingStyle');
    expect(data).not.toHaveProperty('isPremium');
    expect(data).not.toHaveProperty('faithImpact');
  });

  it('uses a stable per-device sync_users id', () => {
    expect(buildUserProfileSyncId('device-123')).toBe('user-profile-device-123');
    expect(buildUserProfileSyncChange(baseUser, '2026-05-06T20:00:00.000Z', 'device-123')).toMatchObject({
      table: 'users',
      id: 'user-profile-device-123',
      clientUpdatedAt: '2026-05-06T20:00:00.000Z',
      deleted: false,
    });
  });

  it('enqueues the profile push when the direct network call fails, then drains it later', async () => {
    const mockFetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ status: 'accepted' }] }),
      });
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(syncUserProfileToBackend(baseUser, '2026-05-06T20:00:00.000Z')).rejects.toThrow('offline');

    expect(peekSyncOutbox()).toHaveLength(1);
    expect(peekSyncOutbox()[0]).toMatchObject({
      table: 'users',
      id: 'user-profile-test-device',
      clientUpdatedAt: '2026-05-06T20:00:00.000Z',
    });

    await drainSyncOutbox();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(peekSyncOutbox()).toHaveLength(0);
  });
});
