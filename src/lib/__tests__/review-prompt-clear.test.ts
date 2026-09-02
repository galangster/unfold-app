/* eslint-disable import/first */
/**
 * P3-4 item 3 — the once-per-version review-prompt marker is cleared by the
 * full reset and the clear is best-effort.
 */
jest.mock('expo-store-review', () => ({
  isAvailableAsync: jest.fn(async () => false),
  requestReview: jest.fn(async () => undefined),
}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '183',
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearReviewPromptState, REVIEW_PROMPT_VERSION_STORAGE_KEY } from '../review-prompt';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});

describe('clearReviewPromptState', () => {
  it('removes the persisted version marker', async () => {
    expect(REVIEW_PROMPT_VERSION_STORAGE_KEY).toBe('@unfold_review_prompt_version');
    await AsyncStorage.setItem(REVIEW_PROMPT_VERSION_STORAGE_KEY, '1.0.0 (183)');

    await clearReviewPromptState();

    expect(await AsyncStorage.getItem(REVIEW_PROMPT_VERSION_STORAGE_KEY)).toBeNull();
  });

  it('swallows storage failures', async () => {
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('disk'));

    await expect(clearReviewPromptState()).resolves.toBeUndefined();
  });
});
