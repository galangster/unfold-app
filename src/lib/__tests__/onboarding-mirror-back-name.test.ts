/**
 * The onboarding mirror-back fallback names the reader as they entered their
 * name. Two of its lines used to lowercase it mid-sentence, so "Anna Lee"
 * read as "anna lee". The onboarding screen's own fallback had the same line.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateMirrorBackText } from '@/lib/devotional-service';

jest.mock('@/lib/api-config', () => ({
  getBackendCandidates: () => ['https://backend.test'],
  getAuthHeaders: async () => ({ 'Content-Type': 'application/json' }),
  PRIMARY_BACKEND_URL: 'https://backend.test',
  sanitizeForPrompt: (s: string | undefined, max: number) => (s ?? '').slice(0, max),
}));

jest.mock('@/lib/device-credential');

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

// A spent rate limit sends the request straight to the local fallback.
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: false, remaining: 0, resetTime: Date.now() + 3_600_000 })),
  incrementRateLimit: jest.fn(async () => undefined),
  getTimeUntilReset: jest.fn(() => '1 hour'),
}));

jest.mock('@/lib/story-service', () => ({
  fetchStoriesForGeneration: jest.fn(async () => []),
  formatStoriesForPrompt: jest.fn(() => ''),
}));

describe('the mirror-back fallback keeps the name as entered (APP-35)', () => {
  // The fallback picks between two lines; the second holds the name mid-sentence.
  beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0.99));
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [
      'a situation and a hope',
      { currentSituation: 'Starting a new job', spiritualSeeking: 'peace' },
      "Between where you are and where you're reaching, Anna Lee, God is already at work.",
    ],
    [
      'a situation only',
      { currentSituation: 'Starting a new job' },
      "What you shared took courage, Anna Lee, and it's exactly the right place to begin.",
    ],
  ])('names the reader as entered after %s', async (_label, answers, reflection) => {
    const { content, source } = await generateMirrorBackText({ ...answers, name: 'Anna Lee' });
    expect(source).toBe('fallback');
    expect(content.reflection).toBe(reflection);
  });

  it('reads cleanly without a name', async () => {
    const { content } = await generateMirrorBackText({
      currentSituation: 'Starting a new job',
      spiritualSeeking: 'peace',
    });
    expect(content.reflection).toBe(
      "Between where you are and where you're reaching, God is already at work.",
    );
  });

  it('keeps the name as entered in the onboarding screen fallback too', () => {
    const screen = readFileSync(join(__dirname, '../../app/onboarding.tsx'), 'utf8');
    expect(screen).not.toMatch(/nameClause\.toLowerCase\(\)/);
    expect(screen).toContain("where you're reaching, ${nameClause}God is already at");
  });
});
