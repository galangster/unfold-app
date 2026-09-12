/* eslint-disable import/first */
jest.mock('@/lib/api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://backend.test',
  getBackendCandidates: () => ['https://backend.test'],
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
  sanitizeForPrompt: (value: string | undefined, max: number) => String(value ?? '').slice(0, max),
}));

jest.mock('@/lib/device-credential');

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true, remaining: 5, resetTime: Date.now() + 3_600_000 })),
  incrementRateLimit: jest.fn(async () => undefined),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/mmkv-storage', () => ({
  getSharedEncryptionKey: jest.fn(() => 'test-key'),
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: jest.fn(() => undefined),
    set: jest.fn(),
    clearAll: jest.fn(),
  })),
}));

jest.mock('@/lib/bible-db', () => ({
  getVerseByReference: jest.fn(),
  getBibleDbStatus: jest.fn(),
}));

import { authenticatedFetch } from '@/lib/device-credential';
import { fetchCommentary } from '../bible-api';
import { generateBridge } from '../bridge-service';
import { generateCompanionResponse, generateConversationTitle } from '../companion-service';
import { generateExamen } from '../examen-service';
import { fetchStoriesForGeneration } from '../story-service';

function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** The request left through authenticatedFetch, carrying the caller's abort signal. */
function expectRoutedThrough(url: unknown, method?: 'POST') {
  expect(authenticatedFetch).toHaveBeenCalledWith(
    url,
    expect.objectContaining({
      ...(method ? { method } : {}),
      signal: expect.any(AbortSignal),
    }),
  );
}

beforeEach(() => {
  (authenticatedFetch as jest.Mock).mockClear();
  global.fetch = jest.fn(async () => okJson({})) as unknown as typeof fetch;
});

describe('lib callers use authenticatedFetch', () => {
  it('posts commentary through authenticatedFetch with an abort signal', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(okJson({ commentary: 'God loves the world.' }));

    await fetchCommentary({
      reference: 'John 3:16',
      verseText: 'For God so loved the world.',
      todayTheme: 'love',
      todayTitle: 'Loved',
    });

    expectRoutedThrough('https://backend.test/api/generate-commentary', 'POST');
  });

  it('posts a bridge through authenticatedFetch with an abort signal', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(okJson({ bridgeText: 'Today looks at rest.' }));

    await generateBridge({
      userName: 'Alex',
      todayTheme: 'rest',
      todayScripture: 'Psalm 23:1',
      currentSituation: 'tired',
    }, 'dev-1', 1);

    expectRoutedThrough('https://backend.test/api/generate-bridge', 'POST');
  });

  it('posts an adaptive companion question through authenticatedFetch with an abort signal', async () => {
    await generateCompanionResponse({
      mood: 'Hopeful',
      companionName: null,
      userName: null,
      currentSeriesTheme: null,
      recentCheckIns: [],
      timeOfDay: 'morning',
      context: 'first_time',
    });

    expectRoutedThrough('https://backend.test/api/generate/adaptive-question', 'POST');
  });

  it('posts a companion title through authenticatedFetch with an abort signal', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(okJson({ title: 'A quiet morning' }));

    await generateConversationTitle('hello', 'hi there');

    expectRoutedThrough('https://backend.test/api/companion/title', 'POST');
  });

  it('posts examen through authenticatedFetch with an abort signal', async () => {
    await generateExamen({
      userName: 'Alex',
      todayTheme: 'rest',
      todayScripture: 'Psalm 23:1',
      currentSituation: 'tired',
    }, { devotionalId: 'dev-1', dayNumber: 1 });

    expectRoutedThrough('https://backend.test/api/generate/go-deeper', 'POST');
  });

  it('gets stories through authenticatedFetch with an abort signal', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(okJson({ stories: [] }));

    await fetchStoriesForGeneration(['hope']);

    expectRoutedThrough(expect.stringContaining('https://backend.test/api/stories'));
  });
});
