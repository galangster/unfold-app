/**
 * generateSeriesArc — the Opus arc-planning pass.
 *
 * The arc call is strictly best-effort: any failure (HTTP error, backend
 * error field, malformed JSON, wrong day count) must degrade gracefully —
 * either to a title-only arc or to null — and never throw, because
 * generateDevotional awaits it before any writing batch runs.
 */

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

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
}));

import { generateSeriesArc, type SeriesArc } from '@/lib/devotional-service';
import type { GenerationContext } from '@/lib/devotional-service';

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

const PERSONA = { primary: 'gentle', secondary: 'narrative', templateSeed: 1 } as Parameters<typeof generateSeriesArc>[1];

function arcJson(days: number): string {
  return JSON.stringify({
    seriesTitle: 'Roots Below the Frost',
    throughLine: 'From exhaustion toward quiet trust.',
    days: Array.from({ length: days }, (_, i) => ({
      dayNumber: i + 1,
      title: `Day Title ${i + 1}`,
      scriptureReference: `Isaiah ${40 + i}:31`,
      theme: `theme ${i + 1}`,
      movement: i === 0 ? 'opening' : i === days - 1 ? 'resolution' : 'deepening',
    })),
  });
}

function mockBackendResponse(body: unknown, status = 200): void {
  global.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  })) as unknown as typeof fetch;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('generateSeriesArc', () => {
  it('returns a full arc from a well-formed response and sends claude-opus-5', async () => {
    mockBackendResponse({ content: [{ text: arcJson(3) }] });

    const arc = await generateSeriesArc(CONTEXT, PERSONA);

    expect(arc).not.toBeNull();
    expect(arc!.seriesTitle).toBe('Roots Below the Frost');
    expect(arc!.days).toHaveLength(3);
    expect(arc!.days[2].movement).toBe('resolution');

    const payload = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string
    );
    expect(payload.model).toBe('claude-opus-5');
    expect(payload.max_tokens).toBeLessThanOrEqual(4000);
  });

  it('recovers JSON wrapped in prose/fences', async () => {
    mockBackendResponse({ content: [{ text: `Here is the plan:\n\n${arcJson(3)}\n\nHope this helps!` }] });

    const arc = await generateSeriesArc(CONTEXT, PERSONA);
    expect(arc?.seriesTitle).toBe('Roots Below the Frost');
    expect(arc?.days).toHaveLength(3);
  });

  it('degrades to a title-only arc when the day outline has the wrong length', async () => {
    mockBackendResponse({ content: [{ text: arcJson(5) }] }); // context asks for 3

    const arc = await generateSeriesArc(CONTEXT, PERSONA);
    expect(arc).not.toBeNull();
    expect(arc!.seriesTitle).toBe('Roots Below the Frost');
    expect(arc!.days).toHaveLength(0);
  });

  it('returns null on a non-200 backend response (e.g. model rejected)', async () => {
    mockBackendResponse('model not allowed', 400);
    await expect(generateSeriesArc(CONTEXT, PERSONA)).resolves.toBeNull();
  });

  it('returns null when the backend returns 200 with an error field', async () => {
    mockBackendResponse({ error: 'upstream failure' });
    await expect(generateSeriesArc(CONTEXT, PERSONA)).resolves.toBeNull();
  });

  it('returns null on unparseable content', async () => {
    mockBackendResponse({ content: [{ text: 'sorry, I cannot produce JSON today' }] });
    await expect(generateSeriesArc(CONTEXT, PERSONA)).resolves.toBeNull();
  });

  it('returns null (never throws) on network failure', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network request failed');
    }) as unknown as typeof fetch;

    await expect(generateSeriesArc(CONTEXT, PERSONA)).resolves.toBeNull();
  });

  it('returns null when seriesTitle is missing or empty', async () => {
    mockBackendResponse({ content: [{ text: JSON.stringify({ seriesTitle: '  ', throughLine: 'x', days: [] }) }] });
    await expect(generateSeriesArc(CONTEXT, PERSONA)).resolves.toBeNull();
  });

  it('renumbers days defensively when the model misnumbers them', async () => {
    const bad = JSON.parse(arcJson(3)) as SeriesArc;
    // dayNumber wrong type — validator tolerates it and renumbers
    (bad.days[1] as unknown as { dayNumber: unknown }).dayNumber = undefined;
    mockBackendResponse({ content: [{ text: JSON.stringify(bad) }] });

    const arc = await generateSeriesArc(CONTEXT, PERSONA);
    expect(arc?.days.map(d => d.dayNumber)).toEqual([1, 2, 3]);
  });
});
