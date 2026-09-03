/**
 * Tests for the onboarding funnel instrument (ONB-TELEMETRY-1).
 *
 * The bug this exists to catch produced no exception and no log line: people
 * were stranded at the paywall, closed the app, and came back as brand-new
 * installs. The only way that becomes visible is a launch-time report of drafts
 * nobody came back to, so these tests hold the reporting rules — threshold,
 * once-per-draft, bucketing — and, just as hard, hold the privacy line.
 */
jest.mock('@/lib/sentry', () => ({
  addAppBreadcrumb: jest.fn(),
  captureAppEvent: jest.fn(),
}));

jest.mock('../mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    mmkvStorage: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => store.set(key, value)),
      removeItem: jest.fn((key: string) => store.delete(key)),
    },
    getDeviceId: jest.fn(() => 'test-device-id'),
    getSharedEncryptionKey: jest.fn(() => 'test-key'),
    __clearMockStorage: () => store.clear(),
  };
});

import * as fs from 'fs';
import * as path from 'path';
import {
  ABANDONED_MARKER_KEY,
  ONBOARDING_ABANDONED_EVENT,
  ONBOARDING_ABANDONED_THRESHOLD_MS,
  ONBOARDING_COMPLETED_EVENT,
  ONBOARDING_RESUMED_EVENT,
  ONBOARDING_STARTED_EVENT,
  ONBOARDING_STEP_IDS,
  bucketOnboardingAge,
  clearAbandonedOnboardingMarker,
  reportAbandonedOnboarding,
  sanitizeStepId,
  trackOnboardingCompleted,
  trackOnboardingResumed,
  trackOnboardingStarted,
  trackOnboardingStep,
} from '../onboarding-telemetry';
import { addAppBreadcrumb, captureAppEvent } from '@/lib/sentry';
import { mmkvStorage } from '../mmkv-storage';

const capture = captureAppEvent as jest.Mock;
const breadcrumb = addAppBreadcrumb as jest.Mock;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

beforeEach(() => {
  clearAbandonedOnboardingMarker();
  jest.clearAllMocks();
});

describe('the incident signal', () => {
  it('names the step someone was stranded on — threeStepPaywall', () => {
    // This is the whole exercise. A cluster of these on one step is the alarm
    // that would have caught the P0 in hours instead of by a support message.
    expect(reportAbandonedOnboarding('threeStepPaywall', 8 * HOUR)).toBe(true);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(ONBOARDING_ABANDONED_EVENT, {
      step: 'threeStepPaywall',
      age_bucket: '6h',
    });
  });
});

describe('reportAbandonedOnboarding threshold', () => {
  it('reports a draft older than six hours', () => {
    expect(reportAbandonedOnboarding('aboutMe', ONBOARDING_ABANDONED_THRESHOLD_MS)).toBe(true);
    expect(capture).toHaveBeenCalledWith(ONBOARDING_ABANDONED_EVENT, {
      step: 'aboutMe',
      age_bucket: '6h',
    });
  });

  it('reports nothing for a draft younger than the threshold', () => {
    // Someone who paused for coffee is still mid-flow, not abandoned.
    expect(reportAbandonedOnboarding('keyPeople', ONBOARDING_ABANDONED_THRESHOLD_MS - 1)).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    expect(breadcrumb).not.toHaveBeenCalled();
    // A draft below the threshold must not burn the once-per-draft marker.
    expect(mmkvStorage.getItem(ABANDONED_MARKER_KEY)).toBeNull();
  });

  it('reports nothing when the clock ran backwards between launches', () => {
    expect(reportAbandonedOnboarding('threeStepPaywall', -3 * DAY)).toBe(false);
    expect(capture).not.toHaveBeenCalled();
  });
});

describe('reportAbandonedOnboarding fires at most once per draft', () => {
  it('reports on the first launch and stays silent on the second', () => {
    expect(reportAbandonedOnboarding('threeStepPaywall', 2 * DAY)).toBe(true);
    expect(reportAbandonedOnboarding('threeStepPaywall', 2 * DAY + HOUR)).toBe(false);

    // One stranded person must read as one event. Reporting every launch would
    // turn a single user into fifty rows and bury the shape of the problem.
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('reports again once the marker is cleared with the draft', () => {
    expect(reportAbandonedOnboarding('mirrorBack', 9 * HOUR)).toBe(true);

    clearAbandonedOnboardingMarker();
    expect(mmkvStorage.getItem(ABANDONED_MARKER_KEY)).toBeNull();

    expect(reportAbandonedOnboarding('name', 9 * HOUR)).toBe(true);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenLastCalledWith(ONBOARDING_ABANDONED_EVENT, {
      step: 'name',
      age_bucket: '6h',
    });
  });

  it('still reports when the marker read throws', () => {
    (mmkvStorage.getItem as jest.Mock).mockImplementationOnce(() => {
      throw new Error('mmkv unavailable');
    });
    // A storage failure must not be read as "already reported": losing the
    // signal costs more than a duplicate event.
    expect(reportAbandonedOnboarding('readDevotional', 7 * HOUR)).toBe(true);
  });
});

describe('bucketOnboardingAge boundaries', () => {
  it.each([
    [0, 'under6h'],
    [6 * HOUR - 1, 'under6h'],
    [6 * HOUR, '6h'],
    [DAY - 1, '6h'],
    [DAY, '24h'],
    [3 * DAY - 1, '24h'],
    [3 * DAY, '3d'],
    [7 * DAY - 1, '3d'],
    [7 * DAY, '7d'],
    [30 * DAY - 1, '7d'],
    [30 * DAY, 'longer'],
    [365 * DAY, 'longer'],
  ])('buckets %ims as %s', (ageMs, expected) => {
    expect(bucketOnboardingAge(ageMs as number)).toBe(expected);
  });

  it('treats a non-finite age as below the threshold', () => {
    expect(bucketOnboardingAge(Number.NaN)).toBe('under6h');
    expect(bucketOnboardingAge(Number.POSITIVE_INFINITY)).toBe('under6h');
  });
});

describe('funnel events', () => {
  it('reports the start of the funnel with the step that asked for something', () => {
    trackOnboardingStarted('name');
    expect(capture).toHaveBeenCalledWith(ONBOARDING_STARTED_EVENT, { step: 'name' });
  });

  it('leaves a breadcrumb, not an event, for a step change', () => {
    trackOnboardingStep('growthGoals');
    expect(breadcrumb).toHaveBeenCalledWith('onboarding', 'step', { step: 'growthGoals' });
    expect(capture).not.toHaveBeenCalled();
  });

  it('reports a resume with the step left and a bucketed age', () => {
    trackOnboardingResumed('threeStepPaywall', 4 * DAY);
    expect(capture).toHaveBeenCalledWith(ONBOARDING_RESUMED_EVENT, {
      step: 'threeStepPaywall',
      age_bucket: '3d',
    });
  });

  it('reports the generated outcome', () => {
    trackOnboardingCompleted('generated');
    expect(capture).toHaveBeenCalledWith(ONBOARDING_COMPLETED_EVENT, { outcome: 'generated' });
  });

  it('reports the deferred outcome', () => {
    trackOnboardingCompleted('deferred');
    expect(capture).toHaveBeenCalledWith(ONBOARDING_COMPLETED_EVENT, { outcome: 'deferred' });
  });
});

describe('privacy', () => {
  // Realistic shapes of what this app actually holds: a person's name, a family
  // member's name, and free text about a spiritual struggle.
  const userContent = [
    'Anthony',
    'my daughter Mi Young',
    'I have been struggling to pray since my father died.',
    'anon_583f924a-97803',
  ];

  it('never sends anything a person typed, on any call', () => {
    for (const content of userContent) {
      trackOnboardingStarted(content);
      trackOnboardingStep(content);
      trackOnboardingResumed(content, 2 * DAY);
      reportAbandonedOnboarding(content, 2 * DAY);
      clearAbandonedOnboardingMarker();
    }
    trackOnboardingCompleted('generated');
    trackOnboardingCompleted('deferred');

    const payloads = JSON.stringify([capture.mock.calls, breadcrumb.mock.calls]);
    for (const content of userContent) {
      expect(payloads).not.toContain(content);
    }
  });

  it('sends only step ids, bucketed ages and outcomes', () => {
    trackOnboardingStarted('name');
    trackOnboardingResumed('aboutMe', 8 * DAY);
    reportAbandonedOnboarding('threeStepPaywall', 8 * DAY);
    trackOnboardingCompleted('deferred');

    const allowedKeys = new Set(['step', 'age_bucket', 'outcome']);
    const allowedBuckets = new Set(['under6h', '6h', '24h', '3d', '7d', 'longer']);

    for (const [, data] of capture.mock.calls as [string, Record<string, string>][]) {
      for (const [key, value] of Object.entries(data ?? {})) {
        expect(allowedKeys.has(key)).toBe(true);
        if (key === 'age_bucket') expect(allowedBuckets.has(value)).toBe(true);
        if (key === 'outcome') expect(['generated', 'deferred']).toContain(value);
        // Only a step this app actually has, or the safe fallback.
        if (key === 'step') expect([...ONBOARDING_STEP_IDS, 'unknown']).toContain(value);
      }
    }
  });

  it('replaces anything that is not a known step id with "unknown"', () => {
    expect(sanitizeStepId('threeStepPaywall')).toBe('threeStepPaywall');
    expect(sanitizeStepId('I have been struggling to pray.')).toBe('unknown');
    // A first name and the device id both pass a shape check, which is exactly
    // why the guard is an allowlist. The device id is this app's credential.
    expect(sanitizeStepId('Anthony')).toBe('unknown');
    expect(sanitizeStepId('anon_583f924a-97803')).toBe('unknown');
    expect(sanitizeStepId('')).toBe('unknown');
  });

  it('keeps the persisted marker free of user content too', () => {
    reportAbandonedOnboarding('I lost my father in March', 2 * DAY);
    expect(mmkvStorage.getItem(ABANDONED_MARKER_KEY)).not.toContain('father');
  });
});

describe('screen wiring (ONB-TELEMETRY-1)', () => {
  const onboardingSrc = fs.readFileSync(
    path.join(__dirname, '../../app/onboarding.tsx'),
    'utf-8',
  );
  const indexSrc = fs.readFileSync(path.join(__dirname, '../../app/index.tsx'), 'utf-8');

  /** Slices one function body out of the screen source; throws if an anchor moved. */
  function sliceBody(marker: string, endMarker: string): string {
    const start = onboardingSrc.indexOf(marker);
    if (start === -1) throw new Error(`anchor not found: ${marker}`);
    const end = onboardingSrc.indexOf(endMarker, start);
    if (end <= start) throw new Error(`end anchor not found after ${marker}: ${endMarker}`);
    return onboardingSrc.slice(start, end);
  }

  it('reports the generated outcome from proceedToGeneration', () => {
    const body = sliceBody('const proceedToGeneration = useCallback(', '}, [router, saveOnboardingData]);');
    expect(body).toContain("trackOnboardingCompleted('generated')");
    expect(body).toContain('clearAbandonedOnboardingMarker()');
  });

  it('reports the deferred outcome from handleDecideLater', () => {
    const body = sliceBody('const handleDecideLater = useCallback(', 'const completeOnboarding');
    expect(body).toContain("trackOnboardingCompleted('deferred')");
    expect(body).toContain('clearAbandonedOnboardingMarker()');
  });

  it('reports started at the name step and a breadcrumb per step change', () => {
    expect(onboardingSrc).toContain('trackOnboardingStep(currentStepId)');
    expect(onboardingSrc).toContain("if (currentStepId !== 'name' || onboardingStartedRef.current) return;");
    expect(onboardingSrc).toContain('trackOnboardingStarted(currentStepId)');
  });

  it('reports resumed from the restored draft, not a second started', () => {
    expect(onboardingSrc).toContain(
      'trackOnboardingResumed(restoredDraft.stepId, Date.now() - restoredDraft.savedAt)',
    );
    expect(onboardingSrc).toContain('const onboardingStartedRef = useRef(!!restoredDraft)');
  });

  it('keeps the step allowlist in step with the screen it mirrors', () => {
    // Drift here would silently degrade every event to "unknown", so the
    // mirrored list is checked against the screen's own ALL_STEPS block.
    const block = onboardingSrc.slice(
      onboardingSrc.indexOf('const ALL_STEPS'),
      onboardingSrc.indexOf('const ALL_STEP_IDS'),
    );
    const screenStepIds = Array.from(block.matchAll(/\{\s*id: '([a-zA-Z0-9]+)'/g)).map(
      (match) => match[1],
    );
    expect(screenStepIds.length).toBeGreaterThan(0);
    expect([...ONBOARDING_STEP_IDS]).toEqual(screenStepIds);
  });

  it('reports abandonment from the draft the welcome screen already read', () => {
    expect(indexSrc).toContain(
      "import { reportAbandonedOnboarding } from '@/lib/onboarding-telemetry';",
    );
    expect(indexSrc).toContain(
      'reportAbandonedOnboarding(onboardingDraft.stepId, Date.now() - onboardingDraft.savedAt)',
    );
    // One read of the draft, reused — not a second MMKV open on the cold path.
    expect(indexSrc.match(/getOnboardingDraft\(/g)).toHaveLength(1);
  });
});
