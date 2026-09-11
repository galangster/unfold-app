/* eslint-disable import/first */
jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}));

jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
}));

jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
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
      __store: store,
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    isRecoverySession: jest.fn(() => false),
  };
});

import { computeDevotionalState } from '@/components/home/compute-devotional-state';
import { trackAutoTrialLanded } from '../auto-trial-telemetry';
import {
  AUTO_TRIAL_INTENT_KEY,
  applyAutoTrialProfileOverrides,
  buildRevealGuardKey,
  createAutoTrialIntent,
  hasSupersedingUserSeries,
  isAutoTrialIntentExpired,
  markAutoTrialIntentDismissed,
  parseAutoTrialIntent,
  readAutoTrialIntent,
  reconcileAutoTrialIntentOnLaunch,
  settleLandedAutoTrialSeries,
  transitionAutoTrialIntent,
  type AutoTrialIntentStatus,
  type AutoTrialIntentV1,
  type CreateAutoTrialIntentInput,
} from '../auto-trial-intent';
import { writeInflightGenerationJob } from '../inflight-generation-job';
import { getCurrentDevotional, getHomeDevotionalDayData } from '../home-devotional-state';
import { mmkvStorage } from '../mmkv-storage';
import { useUnfoldStore, type Devotional, type DevotionalDay } from '../store';
import { memoryIntentStorage } from './fixtures/memory-intent-storage';

const REQUEST_ID = '11111111-2222-4333-8444-555555555555';
const INTENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NOW_MS = Date.parse('2026-09-10T17:00:00.000Z');

function validIntent(overrides: Partial<AutoTrialIntentV1> = {}): AutoTrialIntentV1 {
  return {
    version: 1,
    intentId: INTENT_ID,
    deviceId: 'device-1',
    entry: 'onboarding',
    surface: 'onboarding_paywall',
    source: 'purchase',
    simulated: false,
    trialDays: 3,
    purchasedAt: '2026-09-08T17:00:00.000Z',
    expiresAt: '2026-09-11T17:00:00.000Z',
    purchaseLocalDate: '2026-09-08',
    timeZone: 'America/Chicago',
    platform: 'ios',
    isSandbox: false,
    productIdentifier: 'unfold_premium_yearly',
    switchEnabledAtPurchase: true,
    switchFetchedAt: '2026-09-08T17:00:00.000Z',
    requestId: REQUEST_ID,
    status: 'purchased',
    jobId: null,
    devotionalId: null,
    createdAt: '2026-09-08T17:00:00.000Z',
    updatedAt: '2026-09-08T17:00:00.000Z',
    submittedAt: null,
    landedAt: null,
    revealedAt: null,
    completedAt: null,
    dismissedAt: null,
    failedAt: null,
    failureCode: null,
    abandonedAt: null,
    abandonReason: null,
    ...overrides,
  };
}

function createInput(overrides: Partial<CreateAutoTrialIntentInput> = {}): CreateAutoTrialIntentInput {
  return {
    deviceId: 'device-1',
    entry: 'onboarding',
    surface: 'onboarding_paywall',
    source: 'purchase',
    simulated: false,
    trialDays: 3,
    purchasedAt: '2026-09-08T17:00:00.000Z',
    expiresAt: '2026-09-11T17:00:00.000Z',
    timeZone: 'America/Chicago',
    isSandbox: false,
    productIdentifier: 'unfold_premium_yearly',
    switchFetchedAt: '2026-09-08T17:00:00.000Z',
    nowMs: NOW_MS,
    ...overrides,
  };
}

const STATUSES: AutoTrialIntentStatus[] = [
  'purchased',
  'submitted',
  'landed',
  'revealed',
  'completed',
  'failed',
  'abandoned',
];

const ALLOWED_TRANSITIONS = new Set([
  'purchased->submitted',
  'purchased->failed',
  'purchased->abandoned',
  'submitted->submitted',
  'submitted->failed',
  'submitted->landed',
  'submitted->abandoned',
  'landed->revealed',
  'landed->completed',
  'revealed->completed',
  'failed->abandoned',
]);

function day1(devotionalId: string): DevotionalDay {
  return {
    dayNumber: 1,
    title: 'Day 1',
    scriptureReference: 'Psalm 23:1',
    scriptureText: 'The Lord is my shepherd.',
    bodyText: 'Body',
    quotableLine: 'Line',
    isRead: false,
    isRevealed: true,
    devotionalId,
  };
}

function autoSeries(id: string): Devotional {
  return {
    id,
    title: 'Auto series',
    totalDays: 3,
    currentDay: 1,
    days: [day1(id)],
    createdAt: '2026-09-10T12:00:00.000Z',
    seriesStartDate: '2026-09-10T12:00:00.000Z',
    userContext: {
      name: 'Nick',
      aboutMe: 'QA',
      currentSituation: 'Landing',
      emotionalState: 'Focused',
    },
    generationMode: 'progressive',
    seriesArc: {
      totalDaysPlanned: 3,
      overarchingTheme: 'theme',
      narrativeShape: 'shape',
      dayHints: [],
      isOpenEnded: false,
      createdAt: '2026-09-10T12:00:00.000Z',
      seriesKind: 'auto_trial',
    },
  };
}

function clearMmkv() {
  const store = (mmkvStorage as unknown as { __store: Map<string, string> }).__store;
  store.clear();
}

describe('D7 strict parse', () => {
  it('returns null for version 2, trialDays 5, unknown status, non-UUID requestId, missing expiresAt, and bad JSON', () => {
    expect(parseAutoTrialIntent(JSON.stringify({ ...validIntent(), version: 2 }))).toBeNull();
    expect(parseAutoTrialIntent(JSON.stringify({ ...validIntent(), trialDays: 5 }))).toBeNull();
    expect(parseAutoTrialIntent(JSON.stringify({ ...validIntent(), status: 'queued' }))).toBeNull();
    expect(parseAutoTrialIntent(JSON.stringify({ ...validIntent(), requestId: 'not-a-uuid' }))).toBeNull();
    const missingExpires = validIntent() as unknown as Record<string, unknown>;
    delete missingExpires.expiresAt;
    expect(parseAutoTrialIntent(JSON.stringify(missingExpires))).toBeNull();
    expect(parseAutoTrialIntent('{')).toBeNull();
    expect(parseAutoTrialIntent('not-json')).toBeNull();
  });

  it('round-trips a valid v1 record', () => {
    const intent = validIntent();
    expect(parseAutoTrialIntent(JSON.stringify(intent))).toEqual(intent);
  });
});

describe('D8 write-once sync create', () => {
  it('writes before return and refuses a second write for the same deviceId', () => {
    const storage = memoryIntentStorage();
    const created = createAutoTrialIntent(createInput(), storage);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.raw()).toBe(JSON.stringify(created));
    expect(created.deviceId).toBe('device-1');
    expect(created.status).toBe('purchased');

    (storage.setItem as jest.Mock).mockClear();
    const again = createAutoTrialIntent(createInput({ trialDays: 7 }), storage);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(again).toEqual(created);
  });

  it('overwrites when the stored record is for another device or is unparseable', () => {
    const otherDevice = memoryIntentStorage(validIntent({ deviceId: 'device-other' }));
    const created = createAutoTrialIntent(createInput(), otherDevice);
    expect(otherDevice.setItem).toHaveBeenCalled();
    expect(created.deviceId).toBe('device-1');

    const garbage = memoryIntentStorage('{');
    const replaced = createAutoTrialIntent(createInput(), garbage);
    expect(garbage.setItem).toHaveBeenCalled();
    expect(replaced.deviceId).toBe('device-1');
  });
});

describe('D9 transition matrix', () => {
  it('writes every allowed pair, rejects every other pair, and never changes facts or requestId', () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const storage = memoryIntentStorage(validIntent({
          status: from,
          jobId: from === 'purchased' ? null : 'job-1',
          devotionalId: from === 'purchased' ? null : 'devo-1',
          submittedAt: from === 'purchased' ? null : '2026-09-08T18:00:00.000Z',
        }));
        const before = storage.raw();
        const facts = parseAutoTrialIntent(before);
        const result = transitionAutoTrialIntent(
          to,
          {
            jobId: 'job-2',
            devotionalId: from === 'purchased' ? 'devo-1' : undefined,
            failureCode: 'SUBMIT_FAILED',
            abandonReason: 'user_setup_fallback',
          },
          { nowMs: NOW_MS },
          storage,
        );
        const allowed = ALLOWED_TRANSITIONS.has(`${from}->${to}`);
        if (allowed) {
          expect(result).not.toBeNull();
          expect(result?.status).toBe(to);
          expect(result?.updatedAt).toBe(new Date(NOW_MS).toISOString());
          expect(result?.requestId).toBe(facts?.requestId);
          expect(result?.trialDays).toBe(facts?.trialDays);
          expect(result?.purchasedAt).toBe(facts?.purchasedAt);
          expect(result?.expiresAt).toBe(facts?.expiresAt);
          expect(result?.entry).toBe(facts?.entry);
          expect(result?.surface).toBe(facts?.surface);
          expect(result?.source).toBe(facts?.source);
          expect(result?.switchFetchedAt).toBe(facts?.switchFetchedAt);
        } else {
          expect(result).toBeNull();
          expect(storage.raw()).toBe(before);
        }
      }
    }
  });

  it('returns null and writes nothing when devotionalId differs from a stored value', () => {
    const storage = memoryIntentStorage(validIntent({
      status: 'submitted',
      jobId: 'job-1',
      devotionalId: 'server-devo',
      submittedAt: '2026-09-08T18:00:00.000Z',
    }));
    const before = storage.raw();
    expect(transitionAutoTrialIntent(
      'landed',
      { devotionalId: 'other-devo' },
      { nowMs: NOW_MS },
      storage,
    )).toBeNull();
    expect(storage.raw()).toBe(before);
  });

  it('sets dismissedAt once while purchased or submitted', () => {
    const storage = memoryIntentStorage(validIntent());
    const first = markAutoTrialIntentDismissed({ nowMs: NOW_MS }, storage);
    expect(first?.dismissedAt).toBe(new Date(NOW_MS).toISOString());
    const second = markAutoTrialIntentDismissed({ nowMs: NOW_MS + 5_000 }, storage);
    expect(second?.dismissedAt).toBe(first?.dismissedAt);
  });
});

describe('D10 claim adoption', () => {
  it('stores the server devotionalId on submitted and lands that same id', () => {
    const storage = memoryIntentStorage(validIntent());
    const submitted = transitionAutoTrialIntent(
      'submitted',
      { jobId: 'job-server', devotionalId: 'server-devo' },
      { nowMs: NOW_MS },
      storage,
    );
    expect(submitted?.devotionalId).toBe('server-devo');
    expect(submitted?.devotionalId).not.toBe('locally-derived');
    const landed = transitionAutoTrialIntent('landed', { devotionalId: 'server-devo' }, { nowMs: NOW_MS + 1_000 }, storage);
    expect(landed?.status).toBe('landed');
    expect(landed?.devotionalId).toBe('server-devo');
  });
});

describe('D12 profile overrides', () => {
  it('sets devotionalLength from a purchased intent and otherwise returns the same reference', () => {
    const data = { devotionalLength: 14, name: 'Nick' };
    const purchased = applyAutoTrialProfileOverrides(data, validIntent({ status: 'purchased', trialDays: 3 }));
    expect(purchased).toEqual({ devotionalLength: 3, name: 'Nick' });
    expect(purchased).not.toBe(data);

    expect(applyAutoTrialProfileOverrides(data, null)).toBe(data);
    expect(applyAutoTrialProfileOverrides(data, validIntent({ status: 'submitted', trialDays: 3 }))).toBe(data);
  });
});

describe('D14 predicates', () => {
  it('treats sandbox and simulated purchased intents as not expired', () => {
    const expiresAt = new Date(NOW_MS).toISOString();
    expect(isAutoTrialIntentExpired(validIntent({ isSandbox: true, expiresAt }), NOW_MS)).toBe(false);
    expect(isAutoTrialIntentExpired(validIntent({ simulated: true, expiresAt }), NOW_MS)).toBe(false);
    expect(isAutoTrialIntentExpired(validIntent({ expiresAt, status: 'purchased' }), NOW_MS)).toBe(true);
    expect(isAutoTrialIntentExpired(validIntent({ expiresAt, status: 'submitted' }), NOW_MS)).toBe(false);
  });

  it('detects a superseding user series and ignores the intent id, samples, and superseded jobs', () => {
    const intent = validIntent({ jobId: 'job-1', devotionalId: 'auto-1' });
    expect(hasSupersedingUserSeries({
      intent,
      devotionalIds: ['onboarding-sample-user-1'],
      inflightJob: null,
    })).toBe(false);
    expect(hasSupersedingUserSeries({
      intent,
      devotionalIds: ['auto-1'],
      inflightJob: null,
    })).toBe(false);
    expect(hasSupersedingUserSeries({
      intent,
      devotionalIds: ['onboarding-sample-user-1'],
      inflightJob: { jobId: 'old-job', submittedAt: 1, superseded: true },
    })).toBe(false);
    expect(hasSupersedingUserSeries({
      intent,
      devotionalIds: ['onboarding-sample-user-1'],
      inflightJob: { jobId: 'other-job', submittedAt: 1 },
    })).toBe(true);
    expect(hasSupersedingUserSeries({
      intent,
      devotionalIds: ['real-series'],
      inflightJob: null,
    })).toBe(true);
  });
});

describe('D11 reconcile table', () => {
  const intentId = INTENT_ID;

  it('returns none when there is no intent or the current device id is ephemeral', () => {
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: null,
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'none' });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: validIntent(),
      deviceId: 'ephemeral-locked',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'none' });
  });

  it('abandons when the device id changed and the status is not terminal', () => {
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: validIntent({ deviceId: 'old-device' }),
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'abandon', reason: 'identity_changed' });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: validIntent({ deviceId: 'old-device', status: 'completed' }),
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'none' });
  });

  it('abandons an expired purchased intent except sandbox and simulated (IR-20)', () => {
    const expired = validIntent({ expiresAt: new Date(NOW_MS).toISOString() });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: expired,
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'abandon', reason: 'trial_expired_before_submit' });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: { ...expired, isSandbox: true },
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'open_reveal', intentId });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: { ...expired, simulated: true },
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'open_reveal', intentId });
  });

  it('abandons a purchased intent superseded by a real series or another inflight job', () => {
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: validIntent(),
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: ['real-series'],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'abandon', reason: 'superseded_by_user_series' });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: validIntent({ jobId: 'job-1' }),
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: ['onboarding-sample-user-1'],
      inflightJob: { jobId: 'other-job', submittedAt: 1 },
      revealGuardKey: null,
    })).toEqual({ action: 'abandon', reason: 'superseded_by_user_series' });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: validIntent(),
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: ['onboarding-sample-user-1'],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'open_reveal', intentId });
  });

  it('leaves a purchased draft alone and opens reveal after onboarding is complete', () => {
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: validIntent(),
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: false,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'none' });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: validIntent({ dismissedAt: new Date(NOW_MS).toISOString() }),
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'open_reveal', intentId });
  });

  it('marks landed when Day 1 is present, then follows row 7', () => {
    const submitted = validIntent({
      status: 'submitted',
      jobId: 'job-1',
      devotionalId: 'auto-1',
      submittedAt: '2026-09-08T18:00:00.000Z',
    });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: submitted,
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: ['auto-1'],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'mark_landed', then: 'open_reveal' });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: { ...submitted, dismissedAt: new Date(NOW_MS).toISOString() },
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: ['auto-1'],
      inflightJob: { jobId: 'job-1', submittedAt: 1, leftForHome: true },
      revealGuardKey: null,
    })).toEqual({ action: 'mark_landed', then: 'none' });
  });

  it('opens reveal for a dismissed submitted intent with no matching record (T32)', () => {
    const submitted = validIntent({
      status: 'submitted',
      jobId: 'job-1',
      devotionalId: 'auto-1',
      submittedAt: '2026-09-08T18:00:00.000Z',
      dismissedAt: new Date(NOW_MS).toISOString(),
    });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: submitted,
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'open_reveal', intentId });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: submitted,
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: { jobId: 'job-1', submittedAt: 1, leftForHome: true },
      revealGuardKey: null,
    })).toEqual({ action: 'none' });
  });

  it('returns none for a dismissed landed intent and opens reveal for failed', () => {
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: validIntent({
        status: 'landed',
        jobId: 'job-1',
        devotionalId: 'auto-1',
        dismissedAt: new Date(NOW_MS).toISOString(),
      }),
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: ['auto-1'],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'none' });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: validIntent({ status: 'failed', jobId: 'job-1', failureCode: 'MAX_RETRIES_EXCEEDED' }),
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: null,
    })).toEqual({ action: 'open_reveal', intentId });
  });

  it('suppresses open_reveal when the session guard key matches and reopens after a status change', () => {
    const purchased = validIntent();
    const matching = buildRevealGuardKey(purchased, null);
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: purchased,
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: matching,
    })).toEqual({ action: 'none' });
    const failed = validIntent({ status: 'failed', jobId: 'job-1' });
    expect(reconcileAutoTrialIntentOnLaunch({
      intent: failed,
      deviceId: 'device-1',
      nowMs: NOW_MS,
      hasCompletedOnboarding: true,
      landedDevotionalIds: [],
      inflightJob: null,
      revealGuardKey: matching,
    })).toEqual({ action: 'open_reveal', intentId });
  });
});

describe('D15 settleLandedAutoTrialSeries', () => {
  beforeEach(() => {
    clearMmkv();
    useUnfoldStore.getState().reset();
    (trackAutoTrialLanded as jest.Mock).mockClear();
  });

  it('lands a pull-first series once and is a no-op on the second call', () => {
    const autoId = 'auto-1';
    const intent = validIntent({
      status: 'submitted',
      jobId: 'job-1',
      devotionalId: autoId,
      submittedAt: '2026-09-08T18:00:00.000Z',
    });
    mmkvStorage.setItem(AUTO_TRIAL_INTENT_KEY, JSON.stringify(intent));
    writeInflightGenerationJob({ jobId: 'job-1', devotionalId: autoId, submittedAt: NOW_MS, leftForHome: false });
    useUnfoldStore.setState({
      devotionals: [autoSeries(autoId)],
      currentDevotionalId: null,
      generationSession: {
        status: 'running',
        devotionalId: autoId,
        totalDays: 3,
        generatedDayNumbers: [1],
      },
    });

    settleLandedAutoTrialSeries(intent, autoId);
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(autoId);
    expect(mmkvStorage.getItem('inflight-generation-job')).toBeNull();
    expect(readAutoTrialIntent()?.status).toBe('landed');
    expect(trackAutoTrialLanded).toHaveBeenCalledTimes(1);
    expect(useUnfoldStore.getState().generationSession.status).toBe('complete');

    settleLandedAutoTrialSeries(readAutoTrialIntent() ?? intent, autoId);
    expect(trackAutoTrialLanded).toHaveBeenCalledTimes(1);
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(autoId);
    expect(readAutoTrialIntent()?.status).toBe('landed');
  });

  it('repoints Today to unread after a later-entry pull deleted the sample current id', () => {
    const autoId = 'auto-later';
    const intent = validIntent({
      status: 'submitted',
      entry: 'later',
      surface: 'paywall_route',
      jobId: 'job-later',
      devotionalId: autoId,
      submittedAt: '2026-09-08T18:00:00.000Z',
    });
    mmkvStorage.setItem(AUTO_TRIAL_INTENT_KEY, JSON.stringify(intent));
    const series = autoSeries(autoId);
    useUnfoldStore.setState({
      devotionals: [series],
      currentDevotionalId: 'onboarding-sample-user-1',
    });

    settleLandedAutoTrialSeries(intent, autoId);

    const state = useUnfoldStore.getState();
    const current = getCurrentDevotional(state.devotionals, state.currentDevotionalId);
    expect(current?.id).toBe(autoId);
    const currentDayData = getHomeDevotionalDayData(current, new Date('2026-09-10T15:00:00.000Z'));
    const card = computeDevotionalState({
      currentDevotional: current ?? null,
      currentDayData,
      hasReadToday: false,
      dayLabel: 'Today',
      isJourneyComplete: false,
      isPreparing: false,
      premiumPolicy: 'granted',
      daysCompleted: 0,
      totalDays: 3,
      progress: 0,
      tomorrowTeaser: null,
      onContinue: () => {},
      onCreateNew: () => {},
      onOpenBible: () => {},
      onRenewPremium: () => {},
      onReveal: () => {},
      ctaText: 'Begin',
    });
    expect(card.type).toBe('unread');
  });
});
