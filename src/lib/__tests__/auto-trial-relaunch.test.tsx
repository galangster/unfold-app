/* eslint-disable import/first */
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
}));

jest.mock('../check-in-flush', () => ({
  flushCheckInToServer: jest.fn(async () => 'sent'),
}));

jest.mock('../auto-trial-telemetry', () => ({
  trackAutoTrialLanded: jest.fn(),
  trackAutoTrialAbandoned: jest.fn(),
}));

jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
      }),
    },
    getDeviceId: jest.fn(() => 'qa-fixture-device'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});

import { reconcileAutoTrialIntentOnLaunch } from '../auto-trial-intent';
import { buildTrialSeriesSeed } from '../dev-seed';
import { resolveGeneratingEntry } from '../generating-entry';
import {
  readInflightGenerationJob,
  writeInflightGenerationJob,
} from '../inflight-generation-job';
import { reduceSeriesReveal } from '../series-reveal-machine';
import { useUnfoldStore } from '../store';

const NOW = new Date(2026, 8, 11, 15, 30, 0);

describe('H12 exhausted auto-trial relaunch', () => {
  beforeEach(() => {
    useUnfoldStore.setState({
      devotionals: [],
      currentDevotionalId: null,
      generationSession: {
        status: 'error',
        devotionalId: 'stale-devo',
        totalDays: 0,
        generatedDayNumbers: [],
        error: 'persisted session error',
      },
    });
  });

  it('reopens the generating screen, never series-reveal, and does not POST', () => {
    const seed = buildTrialSeriesSeed({ state: 'reveal-exhausted', now: NOW });
    const intent = seed.intent!;
    writeInflightGenerationJob({
      jobId: 'stale-job',
      devotionalId: 'stale-devo',
      submittedAt: NOW.getTime() - 60_000,
    });

    const launch = reconcileAutoTrialIntentOnLaunch({
      intent,
      deviceId: intent.deviceId,
      nowMs: NOW.getTime(),
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: readInflightGenerationJob(),
      revealGuardKey: null,
    });
    expect(launch).toEqual({ action: 'open_reveal', intentId: intent.intentId });

    const entry = resolveGeneratingEntry({
      inflight: readInflightGenerationJob(),
      params: {},
      sessionDevotionalId: useUnfoldStore.getState().generationSession.devotionalId,
      autoTrialIntent: intent,
    });
    expect(entry).toEqual({ kind: 'auto-trial-handoff', intentId: intent.intentId });
    expect(entry.kind).not.toBe('resume');
    expect(entry.kind).not.toBe('submit');

    const mounted = reduceSeriesReveal({ kind: 'resolving' }, {
      type: 'mounted',
      intent,
      paramIntentId: intent.intentId,
      hasCompletedOnboarding: true,
      day1Landed: false,
      expired: false,
      supersededByUserSeries: false,
    });
    expect(mounted.state.kind).toBe('retry_exhausted');
    expect(mounted.effects.some((effect) => (
      effect.type === 'submit' || effect.type === 'poll' || effect.type === 'retry_job'
    ))).toBe(false);
    expect(mounted.effects.some((effect) => (
      effect.type === 'redirect' && 'to' in effect && String(effect.to).includes('series-reveal')
    ))).toBe(false);
  });
});
