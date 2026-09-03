jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    __clearMockStorage: () => store.clear(),
  };
});

import {
  saveOnboardingDraft,
  getOnboardingDraft,
  clearOnboardingDraft,
  ONBOARDING_DRAFT_TTL_MS,
  STORE_KEY,
} from '../onboarding-draft-store';
import { mmkvStorage } from '../mmkv-storage';
import type { OnboardingData } from '@/app/onboarding';

// Only the fields the draft round-trip actually asserts on — the store persists
// whatever OnboardingData it is handed, it does not know the shape.
const answers = {
  name: 'Nick',
  aboutMe: 'A dad and a builder.',
  currentSituation: 'Stretched thin.',
  growthGoals: ['prayer'],
  reminderTime: '8:00 AM',
} as unknown as OnboardingData;

beforeEach(() => {
  clearOnboardingDraft();
  jest.clearAllMocks();
});

describe('onboarding-draft-store', () => {
  it('round-trips the answers, step and sample devotional for the same device', () => {
    saveOnboardingDraft({
      deviceId: 'device-A',
      stepId: 'threeStepPaywall',
      data: answers,
      purchasedDuringOnboarding: true,
      sampleDevotionalId: 'dev-1',
      sampleDevotionalDay: { dayNumber: 1, title: 'Begin here' },
    });

    const restored = getOnboardingDraft({ deviceId: 'device-A' });
    expect(restored).not.toBeNull();
    expect(restored?.stepId).toBe('threeStepPaywall');
    expect(restored?.data.name).toBe('Nick');
    expect(restored?.data.aboutMe).toBe('A dad and a builder.');
    expect(restored?.purchasedDuringOnboarding).toBe(true);
    expect(restored?.sampleDevotionalId).toBe('dev-1');
    expect(restored?.sampleDevotionalDay).toEqual({ dayNumber: 1, title: 'Begin here' });
    expect(typeof restored?.savedAt).toBe('number');
  });

  it('defaults the optional fields when they are not supplied', () => {
    saveOnboardingDraft({ deviceId: 'device-A', stepId: 'name', data: answers });

    const restored = getOnboardingDraft({ deviceId: 'device-A' });
    expect(restored?.purchasedDuringOnboarding).toBe(false);
    expect(restored?.sampleDevotionalId).toBeNull();
    expect(restored?.sampleDevotionalDay).toBeNull();
  });

  it('returns null when nothing has been persisted', () => {
    expect(getOnboardingDraft({ deviceId: 'device-A' })).toBeNull();
  });

  it('ignores a record older than the 30-day TTL', () => {
    saveOnboardingDraft({ deviceId: 'device-A', stepId: 'aboutMe', data: answers });

    const wellWithin = getOnboardingDraft({
      deviceId: 'device-A',
      now: Date.now() + ONBOARDING_DRAFT_TTL_MS - 1000,
    });
    expect(wellWithin?.stepId).toBe('aboutMe');

    const expired = getOnboardingDraft({
      deviceId: 'device-A',
      now: Date.now() + ONBOARDING_DRAFT_TTL_MS + 1000,
    });
    expect(expired).toBeNull();
  });

  it('ignores a record written under a different device identity', () => {
    saveOnboardingDraft({ deviceId: 'device-A', stepId: 'aboutMe', data: answers });
    expect(getOnboardingDraft({ deviceId: 'device-B' })).toBeNull();
    expect(getOnboardingDraft({ deviceId: 'device-A' })).not.toBeNull();
  });

  it('returns null for malformed JSON', () => {
    mmkvStorage.setItem(STORE_KEY, '{ not json at all');
    expect(getOnboardingDraft({ deviceId: 'device-A' })).toBeNull();
  });

  it('returns null for a record missing required fields', () => {
    mmkvStorage.setItem(STORE_KEY, JSON.stringify({ deviceId: 'device-A', savedAt: Date.now() }));
    expect(getOnboardingDraft({ deviceId: 'device-A' })).toBeNull();

    mmkvStorage.setItem(
      STORE_KEY,
      JSON.stringify({ deviceId: 'device-A', savedAt: Date.now(), stepId: 'name', data: 'nope' }),
    );
    expect(getOnboardingDraft({ deviceId: 'device-A' })).toBeNull();
  });

  it('clears the record', () => {
    saveOnboardingDraft({ deviceId: 'device-A', stepId: 'aboutMe', data: answers });
    clearOnboardingDraft();
    expect(getOnboardingDraft({ deviceId: 'device-A' })).toBeNull();
  });

  it('never writes an incomplete record', () => {
    saveOnboardingDraft({ deviceId: '', stepId: 'name', data: answers });
    expect(getOnboardingDraft()).toBeNull();

    saveOnboardingDraft({ deviceId: 'device-A', stepId: '', data: answers });
    expect(getOnboardingDraft()).toBeNull();
  });

  it('swallows storage errors on read and write', () => {
    const setItem = mmkvStorage.setItem as jest.Mock;
    const getItem = mmkvStorage.getItem as jest.Mock;
    setItem.mockImplementationOnce(() => {
      throw new Error('MMKV unavailable');
    });
    expect(() =>
      saveOnboardingDraft({ deviceId: 'device-A', stepId: 'name', data: answers }),
    ).not.toThrow();

    getItem.mockImplementationOnce(() => {
      throw new Error('MMKV unavailable');
    });
    expect(getOnboardingDraft({ deviceId: 'device-A' })).toBeNull();
  });
});
