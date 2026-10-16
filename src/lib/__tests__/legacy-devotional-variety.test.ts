/**
 * The legacy devotional batch: each day's closing style and name use come
 * from the bag on the series' template seed alone, so one batch prompt reads
 * the same on every install. The loose "roughly once every 5 days" name rule
 * is gone from the system prompt, because each day now carries its own mark.
 */
import { ALL_TRAITS } from '@/constants/devotional-personas-v2';
import { buildVarietySchedule, getSystemPrompt } from '@/lib/devotional-service';
import { legacyDevotionalDayShape } from '@/lib/prompt-variety';

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
  getDeviceId: jest.fn(() => 'install-a'),
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

describe('legacy devotional batch', () => {
  it("draws each day's closing and name use from the template seed alone", () => {
    const templateSeed = 4;
    const schedule = buildVarietySchedule(1, 7, 7, ALL_TRAITS[0], ALL_TRAITS[1], templateSeed, 5, 'growing');
    const dayLines = schedule.split('\n').filter((line) => /^Day \d+:/.test(line));
    expect(dayLines).toHaveLength(7);

    dayLines.forEach((line, index) => {
      const day = index + 1;
      const { closing, useName } = legacyDevotionalDayShape(String(templateSeed), day);
      expect(line.startsWith(`Day ${day}:`)).toBe(true);
      expect(line).toContain(`Close with ${closing} style.`);
      expect(line).toContain(
        useName
          ? "Name: the reader's name may appear once in this day, mid-sentence."
          : "Name: leave the reader's name out of this day.",
      );
    });
  });

  it('keeps the loose name rate out of the system prompt', () => {
    expect(getSystemPrompt(0)).not.toContain('roughly once every 5 days');
    expect(getSystemPrompt(0)).not.toContain("The reader's name should appear sparingly");
  });
});
