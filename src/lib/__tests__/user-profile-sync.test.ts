jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../mmkv-storage', () => ({
  getDeviceId: jest.fn(() => 'test-device'),
}));

import {
  buildUserProfileSyncChange,
  buildUserProfileSyncData,
  buildUserProfileSyncId,
} from '../user-profile-sync';
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
});
