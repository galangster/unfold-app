/**
 * generateBatch mapped every 429 to "Rate limit exceeded. Please wait a
 * moment and try again." — misleading for the backend's per-device daily AI
 * budget (SPEND_CAP_REACHED), which will not clear in a moment. The budget
 * response now surfaces its own copy with the reset estimate; every other
 * 429 keeps the old copy; neither is retried by generateBatchWithRetry.
 */
import { generateDevotional, type GenerationContext } from '@/lib/devotional-service';

jest.mock('@/lib/api-config', () => ({
  getBackendCandidates: () => ['https://backend.test'],
  getAuthHeaders: async () => ({ 'Content-Type': 'application/json' }),
  PRIMARY_BACKEND_URL: 'https://backend.test',
  sanitizeForPrompt: (s: string | undefined, max: number) => (s ?? '').slice(0, max),
}));

jest.mock('@/lib/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/lib/bug-logger', () => ({
  logBugEvent: jest.fn(),
  logBugError: jest.fn(),
}));

jest.mock('@/lib/report-error', () => ({ reportError: jest.fn() }));

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true, remaining: 5, resetTime: Date.now() + 3_600_000 })),
  incrementRateLimit: jest.fn(async () => undefined),
  getTimeUntilReset: jest.fn(() => '1 hour'),
}));

jest.mock('@/lib/story-service', () => ({
  fetchStoriesForGeneration: jest.fn(async () => []),
  formatStoriesForPrompt: jest.fn(() => ''),
}));

const CONTEXT: GenerationContext = {
  name: 'Test',
  aboutMe: 'A new parent',
  currentSituation: 'Adjusting to big life changes',
  emotionalState: 'tired but hopeful',
  faithImpact: 'praying less than I want to',
  spiritualSeeking: 'peace and consistency',
  readingDuration: 5,
  devotionalLength: 3,
  bibleTranslation: 'NIV' as GenerationContext['bibleTranslation'],
};

const realFetch = global.fetch;

function mockBackend(status: number, body: unknown, headers: Record<string, string> = {}): jest.Mock {
  const fetchMock = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => JSON.stringify(body),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  global.fetch = realFetch;
});

describe('generateDevotional on a 429', () => {
  it('surfaces the daily AI budget copy with the reset estimate and never retries', async () => {
    const fetchMock = mockBackend(
      429,
      {
        error: {
          code: 'SPEND_CAP_REACHED',
          message: 'Daily AI budget used up. Try again in 5400 seconds.',
          retryAfter: 5400,
        },
      },
      { 'retry-after': '5400' },
    );

    await expect(generateDevotional(CONTEXT)).rejects.toThrow(
      "You've used up your daily AI budget. It resets in about 2 hours.",
    );

    // One best-effort arc request plus a single batch attempt: a budget
    // response must not burn the batch retries (each would be another 429).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the existing copy for an ordinary rate limit', async () => {
    mockBackend(429, {
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in 30 seconds.', retryAfter: 30 },
    });

    await expect(generateDevotional(CONTEXT)).rejects.toThrow(
      'Rate limit exceeded. Please wait a moment and try again.',
    );
  });
});
