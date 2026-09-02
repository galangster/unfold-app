/* eslint-disable no-console -- live smoke: printing the real arc and timing to the terminal is the point */
/**
 * LIVE smoke for the Opus 5 arc pass — hits the PRODUCTION backend.
 *
 * Skipped unless ARC_LIVE_SMOKE=1. Costs one real claude-opus-5 call
 * (~$0.03–0.06) and writes one ai_usage row under the QA device id.
 *
 *   ARC_LIVE_SMOKE=1 ARC_LIVE_SMOKE_DEVICE_ID=$(uuidgen | tr A-Z a-z) \
 *     npx jest src/lib/__tests__/series-arc.live-smoke.test.ts --silent=false
 *
 * This exercises the real prompt, the real proxy (Cloudflare → Railway), and
 * the real thinking-block extraction — everything a dev-build generation
 * would do for the arc, minus the device.
 */

jest.mock('@/lib/api-config', () => ({
  getBackendCandidates: () => ['https://api.unfoldapp.co'],
  getAuthHeaders: async () => ({
    'Content-Type': 'application/json',
    'User-Agent': 'Unfold/1.0.0 (ios; 18)',
    // The device id IS the auth credential — never commit one. Supply a
    // throwaway QA UUID via env when running the live smoke.
    'X-Device-ID': process.env.ARC_LIVE_SMOKE_DEVICE_ID ?? '',
  }),
  PRIMARY_BACKEND_URL: 'https://api.unfoldapp.co',
  sanitizeForPrompt: (s: string | undefined, max: number) => (s ?? '').slice(0, max),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    log: (...a: unknown[]) => console.log(...a),
    warn: (...a: unknown[]) => console.warn(...a),
    error: (...a: unknown[]) => console.error(...a),
  },
}));

jest.mock('@/lib/bug-logger', () => ({
  logBugEvent: jest.fn(),
  logBugError: jest.fn(),
}));

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
}));

import { generateSeriesArc } from '@/lib/devotional-service';
import type { GenerationContext } from '@/lib/devotional-service';

const LIVE = process.env.ARC_LIVE_SMOKE === '1' && !!process.env.ARC_LIVE_SMOKE_DEVICE_ID;

const CONTEXT: GenerationContext = {
  name: 'QA',
  aboutMe: 'A software engineer and new parent balancing shipping deadlines with a newborn at home',
  currentSituation: 'Sleep-deprived, behind at work, and feeling stretched thin between family and career',
  emotionalState: 'anxious but grateful',
  faithImpact: 'Prayer keeps slipping to last place in the day',
  spiritualSeeking: 'a sustainable daily rhythm and reassurance that small faithfulness counts',
  readingDuration: 5,
  devotionalLength: 3,
  bibleTranslation: 'NIV' as GenerationContext['bibleTranslation'],
};

const PERSONA = { primary: 'gentle', secondary: 'narrative', templateSeed: 7 } as Parameters<typeof generateSeriesArc>[1];

(LIVE ? describe : describe.skip)('generateSeriesArc — LIVE against production', () => {
  it('plans a full arc via claude-opus-5 through the real proxy', async () => {
    const started = Date.now();
    const arc = await generateSeriesArc(CONTEXT, PERSONA);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    console.log(`\n[live-smoke] elapsed: ${elapsed}s`);
    console.log('[live-smoke] arc:', JSON.stringify(arc, null, 2));

    expect(arc).not.toBeNull();
    expect(typeof arc!.seriesTitle).toBe('string');
    expect(arc!.seriesTitle.length).toBeGreaterThan(0);
    // A full arc, not the title-only degrade: exactly the requested day count.
    expect(arc!.days).toHaveLength(CONTEXT.devotionalLength);
    expect(arc!.days[0].movement).toBe('opening');
    for (const day of arc!.days) {
      expect(day.title.length).toBeGreaterThan(0);
      expect(day.scriptureReference.length).toBeGreaterThan(0);
      expect(day.theme.length).toBeGreaterThan(0);
    }
  }, 120000);
});
