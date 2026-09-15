function getMockMmkvStore(): Map<string, string> {
  return (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
    .__unfoldMockMmkvStore;
}

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => {
    const mockMmkvStore = new Map<string, string>();
    (globalThis as typeof globalThis & { __unfoldMockMmkvStore: Map<string, string> })
      .__unfoldMockMmkvStore = mockMmkvStore;
    return {
      getString: jest.fn((key: string) => mockMmkvStore.get(key)),
      set: jest.fn((key: string, value: string) => {
        mockMmkvStore.set(key, value);
        return true;
      }),
      delete: jest.fn((key: string) => mockMmkvStore.delete(key)),
    };
  }),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
  v5: jest.fn((value: string) => `uuid-v5:${value}`),
}));

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

import { applyPulledUserData } from '../full-sync-pull';
import {
  AUTO_TRIAL_INTENT_KEY,
  hasSupersedingUserSeries,
  settleLandedAutoTrialSeries,
  type AutoTrialIntentV1,
} from '../auto-trial-intent';
import { isOnboardingFirstReading } from '../auto-trial-series';
import { mmkvStorage } from '../mmkv-storage';
import { runOnboardingCompletion } from '../onboarding-completion';
import { persistOnboardingFirstReading } from '../onboarding-first-reading';
import { useUnfoldStore, type Devotional, type DevotionalDay } from '../store';
import { peekSyncOutbox, replaceSyncOutbox } from '../sync-outbox';

const NOW = '2026-09-14T18:00:00.000Z';
const SAMPLE_ID = 'onboarding-sample-anon_device-1';
const BACKEND_ID = '6f1d2c8a-4b9e-4d21-a7c3-9f0e1b2a3c4d';
const TRIAL_ID = 'auto-trial-1';
const ORIGINAL_TITLE = 'The Name That Found You';
const ORIGINAL_BODY = 'This sentence is the first reading, not the trial series.';

function firstDay(devotionalId: string, overrides: Partial<DevotionalDay> = {}): DevotionalDay {
  return {
    dayNumber: 1,
    title: ORIGINAL_TITLE,
    scriptureReference: 'Isaiah 43:1',
    scriptureText: 'I have called you by name.',
    bodyText: ORIGINAL_BODY,
    quotableLine: 'You were named before you performed.',
    isRead: true,
    readAt: NOW,
    closingPrayer: 'Keep the name you were given.',
    reflectionQuestions: ['What stayed with you?'],
    devotionalId,
    ...overrides,
  };
}

function trialSeries(id = TRIAL_ID): Devotional {
  return {
    id,
    title: 'Trial series',
    totalDays: 3,
    currentDay: 1,
    days: [{
      dayNumber: 1,
      title: 'Trial day 1',
      scriptureReference: 'John 1:1',
      scriptureText: 'In the beginning was the Word.',
      bodyText: 'Trial prose that must not replace the first reading.',
      quotableLine: 'A new series.',
      isRead: false,
      devotionalId: id,
    }],
    createdAt: NOW,
    seriesStartDate: NOW,
    userContext: { name: 'Jared', aboutMe: '', currentSituation: '', emotionalState: '' },
    generationMode: 'progressive',
    seriesArc: {
      totalDaysPlanned: 3,
      overarchingTheme: 'Trial',
      narrativeShape: 'shape',
      dayHints: [],
      isOpenEnded: false,
      createdAt: NOW,
      seriesKind: 'auto_trial',
    },
  };
}

function purchasedIntent(devotionalId: string): AutoTrialIntentV1 {
  return {
    version: 1,
    intentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    deviceId: 'device-1',
    entry: 'onboarding',
    surface: 'onboarding_paywall',
    source: 'purchase',
    simulated: false,
    trialDays: 3,
    purchasedAt: NOW,
    expiresAt: '2026-09-17T18:00:00.000Z',
    purchaseLocalDate: '2026-09-14',
    timeZone: 'America/Chicago',
    platform: 'ios',
    isSandbox: false,
    productIdentifier: 'unfold_premium_yearly',
    switchEnabledAtPurchase: true,
    switchFetchedAt: NOW,
    requestId: '11111111-2222-4333-8444-555555555555',
    status: 'submitted',
    jobId: 'job-1',
    devotionalId,
    createdAt: NOW,
    updatedAt: NOW,
    submittedAt: NOW,
    landedAt: null,
    revealedAt: null,
    completedAt: null,
    dismissedAt: null,
    failedAt: null,
    failureCode: null,
    abandonedAt: null,
    abandonReason: null,
  };
}

function clearStores() {
  getMockMmkvStore()?.clear();
  (mmkvStorage as unknown as { __store: Map<string, string> }).__store.clear();
  useUnfoldStore.getState().reset();
}

describe('first onboarding reading retention', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-14T18:30:00.000Z') });
    clearStores();
  });
  afterEach(() => { jest.useRealTimers(); });

  it('keeps the current first reading when the trial series lands', () => {
    const intent = purchasedIntent(TRIAL_ID);
    mmkvStorage.setItem(AUTO_TRIAL_INTENT_KEY, JSON.stringify(intent));
    useUnfoldStore.getState().addDevotional({
      id: SAMPLE_ID,
      title: 'Your First Devotional',
      totalDays: 1,
      currentDay: 1,
      days: [firstDay(SAMPLE_ID)],
      createdAt: NOW,
      seriesStartDate: NOW,
      userContext: { name: 'Jared', aboutMe: '', currentSituation: '', emotionalState: '' },
      generationMode: 'progressive',
    });
    useUnfoldStore.setState({
      devotionals: [...useUnfoldStore.getState().devotionals, trialSeries()],
      journalEntries: [{
        id: 'journal-first',
        devotionalId: SAMPLE_ID,
        dayNumber: 1,
        content: 'That I was already named.',
        createdAt: NOW,
        updatedAt: NOW,
      }],
    });

    settleLandedAutoTrialSeries(intent, TRIAL_ID);

    const state = useUnfoldStore.getState();
    const retained = state.devotionals.find((row) => row.id === SAMPLE_ID);
    expect(retained?.days[0]?.bodyText).toBe(ORIGINAL_BODY);
    expect(retained?.days[0]?.title).toBe(ORIGINAL_TITLE);
    expect(retained?.days[0]?.closingPrayer).toBe('Keep the name you were given.');
    expect(useUnfoldStore.getState().journalEntries[0]?.content).toBe('That I was already named.');
    expect(retained?.days[0]?.isRead).toBe(true);
    expect(retained?.archivedAt).toBeTruthy();
    expect(isOnboardingFirstReading(retained)).toBe(true);
    expect(state.currentDevotionalId).toBe(TRIAL_ID);
    expect(state.devotionals.find((row) => row.id === TRIAL_ID)?.days[0]?.bodyText).toContain('Trial prose');
  });

  it('retains exact text through immediate persist then trial land, and is a no-op on resume', () => {
    expect(persistOnboardingFirstReading({
      id: BACKEND_ID,
      day: firstDay(BACKEND_ID),
      userContext: { name: 'Jared', aboutMe: 'QA', currentSituation: 'Trial conversion', emotionalState: '' },
      createdAt: NOW,
    })).toBe(true);
    expect(persistOnboardingFirstReading({
      id: BACKEND_ID,
      day: { ...firstDay(BACKEND_ID), bodyText: 'A regenerated replacement.' },
    })).toBe(true);

    const intent = purchasedIntent(TRIAL_ID);
    mmkvStorage.setItem(AUTO_TRIAL_INTENT_KEY, JSON.stringify(intent));
    useUnfoldStore.setState({
      devotionals: [...useUnfoldStore.getState().devotionals, trialSeries()],
    });
    settleLandedAutoTrialSeries(intent, TRIAL_ID);
    settleLandedAutoTrialSeries(intent, TRIAL_ID);

    const retained = useUnfoldStore.getState().devotionals.find((row) => row.id === BACKEND_ID);
    expect(retained?.id).toBe(BACKEND_ID);
    expect(retained?.days[0]?.bodyText).toBe(ORIGINAL_BODY);
    expect(retained?.days[0]?.title).toBe(ORIGINAL_TITLE);
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(TRIAL_ID);
    expect(hasSupersedingUserSeries({
      intent,
      devotionalIds: useUnfoldStore.getState().devotionals.map((row) => row.id),
      inflightJob: null,
      firstReadingIds: useUnfoldStore.getState().devotionals
        .filter(isOnboardingFirstReading)
        .map((row) => row.id),
    })).toBe(false);
  });

  it('keeps a deferred first reading after a later conversion and does not steal Today', () => {
    persistOnboardingFirstReading({ id: SAMPLE_ID, day: firstDay(SAMPLE_ID), createdAt: NOW });
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(SAMPLE_ID);

    const later = purchasedIntent(TRIAL_ID);
    mmkvStorage.setItem(AUTO_TRIAL_INTENT_KEY, JSON.stringify(later));
    useUnfoldStore.getState().addDevotional(trialSeries());
    settleLandedAutoTrialSeries(later, TRIAL_ID);

    const state = useUnfoldStore.getState();
    expect(state.currentDevotionalId).toBe(TRIAL_ID);
    expect(state.devotionals.find((row) => row.id === SAMPLE_ID)?.archivedAt).toBeTruthy();
    persistOnboardingFirstReading({ id: SAMPLE_ID, day: firstDay(SAMPLE_ID) });
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(TRIAL_ID);
  });

  it('writes the first reading before completion flush on immediate and deferred exits', async () => {
    const order: string[] = [];
    const persist = () => {
      order.push('persistFirstReading');
      persistOnboardingFirstReading({ id: SAMPLE_ID, day: firstDay(SAMPLE_ID), createdAt: NOW });
    };
    const deps = {
      retireDraftAutosave: () => order.push('retire'),
      clearSampleJob: () => order.push('clearJob'),
      applyProfileOverrides: () => order.push('overrides'),
      saveProfile: () => order.push('saveProfile'),
      persistFirstReading: persist,
      flushStoreAsync: async () => {
        order.push('flush');
        expect(useUnfoldStore.getState().devotionals.some((row) => row.id === SAMPLE_ID)).toBe(true);
      },
      clearDraft: () => order.push('clearDraft'),
      trackCompleted: () => {
        order.push('track');
        return true;
      },
      navigate: () => order.push('navigate'),
    };

    await runOnboardingCompletion({ started: false }, 'auto_trial', deps);
    expect(order.indexOf('persistFirstReading')).toBeLessThan(order.indexOf('flush'));
    expect(isOnboardingFirstReading(useUnfoldStore.getState().devotionals.find((row) => row.id === SAMPLE_ID))).toBe(true);

    order.length = 0;
    useUnfoldStore.getState().reset();
    await runOnboardingCompletion({ started: false }, 'deferred', deps);
    expect(order.indexOf('persistFirstReading')).toBeLessThan(order.indexOf('flush'));
  });

  it('returns whether the requested reading was saved and leaves another current series in place', () => {
    expect(persistOnboardingFirstReading({ id: '', day: firstDay(SAMPLE_ID) })).toBe(false);
    expect(persistOnboardingFirstReading({ id: SAMPLE_ID, day: firstDay(SAMPLE_ID), createdAt: NOW })).toBe(true);
    expect(persistOnboardingFirstReading({
      id: BACKEND_ID,
      day: firstDay(BACKEND_ID),
    })).toBe(false);
    expect(persistOnboardingFirstReading({
      id: TRIAL_ID,
      day: firstDay(TRIAL_ID),
    })).toBe(false);

    replaceSyncOutbox([]);
    expect(persistOnboardingFirstReading({
      id: SAMPLE_ID,
      day: firstDay(SAMPLE_ID),
      userContext: { name: 'Jared', aboutMe: 'QA', currentSituation: 'Later', emotionalState: '' },
    })).toBe(true);
    const contextWrite = peekSyncOutbox().find((change) => change.table === 'devotionals' && change.id === SAMPLE_ID);
    expect(contextWrite?.data).toMatchObject({
      userContext: { name: 'Jared', aboutMe: 'QA', currentSituation: 'Later' },
      seriesArc: { origin: 'onboarding_first' },
    });
    expect(contextWrite?.clientUpdatedAt && contextWrite.clientUpdatedAt > NOW).toBe(true);

    useUnfoldStore.getState().addDevotional(trialSeries());
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(TRIAL_ID);
    expect(persistOnboardingFirstReading({ id: SAMPLE_ID, day: firstDay(SAMPLE_ID) })).toBe(true);
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(TRIAL_ID);
    expect(persistOnboardingFirstReading({
      id: TRIAL_ID,
      day: firstDay(TRIAL_ID),
    })).toBe(false);
    expect(useUnfoldStore.getState().devotionals.find((row) => row.id === TRIAL_ID)?.days[0]?.bodyText)
      .toContain('Trial prose');

    const ordinary: Devotional = {
      ...trialSeries('one-day-user'),
      title: 'A Quiet Hour',
      totalDays: 1,
      seriesArc: undefined,
      days: [firstDay('one-day-user', { title: 'Ordinary day' })],
    };
    expect(isOnboardingFirstReading(ordinary)).toBe(false);
  });

  it('drops an empty current placeholder when the trial lands and keeps a genuine sample', () => {
    const intent = purchasedIntent(TRIAL_ID);
    mmkvStorage.setItem(AUTO_TRIAL_INTENT_KEY, JSON.stringify(intent));
    useUnfoldStore.setState({
      devotionals: [{
        id: SAMPLE_ID,
        title: 'Your First Devotional',
        totalDays: 1,
        currentDay: 1,
        days: [{
          dayNumber: 1,
          title: '',
          scriptureReference: '',
          scriptureText: '',
          bodyText: '',
          quotableLine: '',
          isRead: false,
          devotionalId: SAMPLE_ID,
        }],
        createdAt: NOW,
        seriesStartDate: NOW,
        userContext: { name: '', aboutMe: '', currentSituation: '', emotionalState: '' },
        generationMode: 'progressive',
      }, trialSeries()],
      currentDevotionalId: SAMPLE_ID,
    });

    settleLandedAutoTrialSeries(intent, TRIAL_ID);

    const state = useUnfoldStore.getState();
    expect(state.devotionals.some((row) => row.id === SAMPLE_ID)).toBe(false);
    expect(state.currentDevotionalId).toBe(TRIAL_ID);
  });

  it('syncs origin onto an already archived first sample without resetting the trial', () => {
    useUnfoldStore.setState({
      devotionals: [{
        id: SAMPLE_ID,
        title: ORIGINAL_TITLE,
        totalDays: 1,
        currentDay: 1,
        days: [firstDay(SAMPLE_ID)],
        createdAt: NOW,
        seriesStartDate: NOW,
        userContext: { name: 'Jared', aboutMe: '', currentSituation: '', emotionalState: '' },
        generationMode: 'progressive',
        archivedAt: NOW,
        archivedStateAt: NOW,
        updatedAt: NOW,
      }, trialSeries()],
      currentDevotionalId: TRIAL_ID,
    });
    replaceSyncOutbox([]);

    useUnfoldStore.getState().retireOnboardingSamples({ keepId: TRIAL_ID });

    const retained = useUnfoldStore.getState().devotionals.find((row) => row.id === SAMPLE_ID);
    expect(retained?.days[0]?.bodyText).toBe(ORIGINAL_BODY);
    expect(retained?.archivedAt).toBeTruthy();
    expect(isOnboardingFirstReading(retained)).toBe(true);
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(TRIAL_ID);
    const queued = peekSyncOutbox().find((change) => change.table === 'devotionals' && change.id === SAMPLE_ID);
    expect(queued?.deleted).toBe(false);
    expect((queued?.data as { seriesArc?: { origin?: string } } | undefined)?.seriesArc?.origin)
      .toBe('onboarding_first');
    expect(queued?.clientUpdatedAt && queued.clientUpdatedAt > NOW).toBe(true);
  });

  it('round-trips a canonical first reading beside the trial and refuses deleted or unmarked samples', () => {
    expect(persistOnboardingFirstReading({
      id: BACKEND_ID,
      day: firstDay(BACKEND_ID),
      userContext: { name: 'Jared', aboutMe: 'QA', currentSituation: 'Trial conversion', emotionalState: '' },
      createdAt: NOW,
    })).toBe(true);

    const queued = peekSyncOutbox().find((change) => change.table === 'devotionals' && change.id === BACKEND_ID);
    expect(queued?.deleted).toBe(false);
    expect(queued?.clientUpdatedAt).toBe('2026-09-14T18:30:00.000Z');
    expect(queued?.data).toMatchObject({
      title: ORIGINAL_TITLE,
      userContext: { name: 'Jared', aboutMe: 'QA', currentSituation: 'Trial conversion' },
      seriesArc: { origin: 'onboarding_first' },
    });
    expect(queued?.data).not.toHaveProperty('bodyText');

    const accepted = peekSyncOutbox();
    replaceSyncOutbox([]);
    useUnfoldStore.getState().reset();

    applyPulledUserData({
      timestamp: '2026-09-14T19:00:00.000Z',
      changes: {
        devotionals: [
          {
            id: BACKEND_ID,
            updatedAt: queued?.clientUpdatedAt ?? NOW,
            deleted: false,
            data: {
              ...(queued?.data ?? {}),
              createdAt: NOW,
              clientUpdatedAt: queued?.clientUpdatedAt ?? NOW,
            },
          },
          {
            id: TRIAL_ID,
            updatedAt: '2026-09-14T19:00:00.000Z',
            deleted: false,
            data: {
              title: 'Trial series',
              totalDays: 3,
              currentDay: 1,
              createdAt: NOW,
              seriesArc: trialSeries().seriesArc,
            },
          },
        ],
        devotional_days: [{
          id: `day-${BACKEND_ID}-1`,
          updatedAt: '2026-09-14T19:00:00.000Z',
          deleted: false,
          data: {
            devotionalId: BACKEND_ID,
            dayNumber: 1,
            title: ORIGINAL_TITLE,
            scriptureReference: 'Isaiah 43:1',
            scriptureText: 'I have called you by name.',
            bodyText: ORIGINAL_BODY,
            quotableLine: 'You were named before you performed.',
            isRead: true,
            readAt: NOW,
          },
        }],
      },
    });

    let state = useUnfoldStore.getState();
    expect(state.devotionals.find((row) => row.id === BACKEND_ID)?.days[0]?.bodyText).toBe(ORIGINAL_BODY);
    expect(isOnboardingFirstReading(state.devotionals.find((row) => row.id === BACKEND_ID))).toBe(true);
    useUnfoldStore.setState({ currentDevotionalId: TRIAL_ID });
    expect(useUnfoldStore.getState().currentDevotionalId).toBe(TRIAL_ID);

    applyPulledUserData({
      timestamp: '2026-09-14T19:05:00.000Z',
      changes: {
        devotionals: [{
          id: SAMPLE_ID,
          updatedAt: '2026-09-14T19:05:00.000Z',
          deleted: false,
          data: { title: 'Stale sample', totalDays: 1, currentDay: 1, createdAt: NOW },
        }],
      },
    });
    expect(useUnfoldStore.getState().devotionals.some((row) => row.id === SAMPLE_ID)).toBe(false);

    applyPulledUserData({
      timestamp: '2026-09-14T19:10:00.000Z',
      changes: {
        devotionals: [{
          id: BACKEND_ID,
          updatedAt: '2026-09-14T19:10:00.000Z',
          deleted: true,
          data: {},
        }],
      },
    });
    expect(accepted.some((change) => change.table === 'devotionals' && change.id === BACKEND_ID)).toBe(true);
    state = useUnfoldStore.getState();
    expect(state.devotionals.some((row) => row.id === BACKEND_ID)).toBe(false);
    expect(state.currentDevotionalId).toBe(TRIAL_ID);
  });
});
