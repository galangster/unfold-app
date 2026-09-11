import { applyAutoTrialProfileOverrides, type AutoTrialIntentV1 } from '../auto-trial-intent';
import { runOnboardingCompletion } from '../onboarding-completion';

jest.mock('@/constants/animations', () => ({
  Duration: { normal: 220 },
  Ease: { out: jest.fn() },
}));

jest.mock('@react-native-community/netinfo', () => ({ addEventListener: jest.fn(() => jest.fn()) }));

jest.mock('../api-config', () => ({
  PRIMARY_BACKEND_URL: 'https://example.test',
  getAuthHeaders: jest.fn(async () => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('../bug-logger', () => ({
  logBugError: jest.fn(),
  logBugEvent: jest.fn(),
}));
jest.mock('../logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '' }, Directory: jest.fn() }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', nativeBuildVersion: '1' }));

const INTENT: AutoTrialIntentV1 = {
  version: 1,
  intentId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
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
  requestId: '11111111-2222-4333-8444-555555555555',
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
};

function createDeps() {
  const order: string[] = [];
  let profile = { devotionalLength: 7 };
  return {
    order,
    getProfile: () => profile,
    deps: {
      retireDraftAutosave: () => {
        order.push('retireDraftAutosave');
      },
      clearSampleJob: () => {
        order.push('clearSampleJob');
      },
      applyProfileOverrides: () => {
        order.push('applyProfileOverrides');
        profile = applyAutoTrialProfileOverrides(profile, INTENT);
      },
      saveProfile: () => {
        order.push(`saveProfile:${profile.devotionalLength}`);
      },
      addDeferredSample: () => {
        order.push('addDeferredSample');
      },
      flushStoreAsync: async () => {
        order.push('flushStoreAsync');
      },
      clearDraft: () => {
        order.push('clearDraft');
      },
      trackCompleted: (outcome: 'generated' | 'deferred' | 'auto_trial') => {
        order.push(`trackCompleted:${outcome}`);
        return true;
      },
      navigate: (target: unknown) => {
        order.push(`navigate:${JSON.stringify(target)}`);
      },
    },
  };
}

describe('G4 onboarding completion order and guard', () => {
  it('runs the auto order with overrides before save, flush before clearDraft, and reveal navigation', async () => {
    const { order, deps } = createDeps();
    const state = { started: false };

    await expect(runOnboardingCompletion(state, 'auto_trial', deps)).resolves.toBe(true);

    expect(order).toEqual([
      'retireDraftAutosave',
      'clearSampleJob',
      'applyProfileOverrides',
      'saveProfile:3',
      'flushStoreAsync',
      'clearDraft',
      'trackCompleted:auto_trial',
      'navigate:"/generating"',
    ]);
    expect(state.started).toBe(true);
  });

  it('navigates generated to /generating and deferred to Today after adding the sample', async () => {
    const generated = createDeps();
    await expect(
      runOnboardingCompletion({ started: false }, 'generated', generated.deps),
    ).resolves.toBe(true);
    expect(generated.order).toEqual([
      'retireDraftAutosave',
      'clearSampleJob',
      'saveProfile:7',
      'flushStoreAsync',
      'clearDraft',
      'trackCompleted:generated',
      'navigate:"/generating"',
    ]);

    const deferred = createDeps();
    await expect(
      runOnboardingCompletion({ started: false }, 'deferred', deferred.deps),
    ).resolves.toBe(true);
    expect(deferred.order).toEqual([
      'retireDraftAutosave',
      'clearSampleJob',
      'saveProfile:7',
      'addDeferredSample',
      'flushStoreAsync',
      'clearDraft',
      'trackCompleted:deferred',
      'navigate:"/(tabs)/(today)"',
    ]);
  });

  it('returns false and runs nothing on a second call', async () => {
    const { order, deps } = createDeps();
    const state = { started: false };

    await expect(runOnboardingCompletion(state, 'auto_trial', deps)).resolves.toBe(true);
    const afterFirst = [...order];
    await expect(runOnboardingCompletion(state, 'auto_trial', deps)).resolves.toBe(false);
    expect(order).toEqual(afterFirst);
  });
});
