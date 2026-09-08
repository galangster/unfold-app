jest.mock('../mmkv-storage', () => {
  const values = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => values.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => values.set(key, value)),
      removeItem: jest.fn((key: string) => values.delete(key)),
    },
  };
});

import {
  clearInitialGenerationRequestId,
  ensureInitialGenerationRequestId,
  INITIAL_GENERATION_REQUEST_ID_KEY,
  readInitialGenerationRequestId,
} from '../initial-generation-request';
import { mmkvStorage } from '../mmkv-storage';

const FIRST_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  jest.clearAllMocks();
  mmkvStorage.removeItem(INITIAL_GENERATION_REQUEST_ID_KEY);
});

it('reuses the persisted request after a lost POST response', () => {
  expect(ensureInitialGenerationRequestId(() => FIRST_ID)).toBe(FIRST_ID);
  expect(ensureInitialGenerationRequestId(() => SECOND_ID)).toBe(FIRST_ID);
});

it('recovers the same request after a simulated app restart', () => {
  mmkvStorage.setItem(INITIAL_GENERATION_REQUEST_ID_KEY, FIRST_ID);
  expect(readInitialGenerationRequestId()).toBe(FIRST_ID);
  expect(ensureInitialGenerationRequestId(() => SECOND_ID)).toBe(FIRST_ID);
});

it('mints a different request for an intentional new series', () => {
  expect(ensureInitialGenerationRequestId(() => FIRST_ID)).toBe(FIRST_ID);
  clearInitialGenerationRequestId();
  expect(ensureInitialGenerationRequestId(() => SECOND_ID)).toBe(SECOND_ID);
});
