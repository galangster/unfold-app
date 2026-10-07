import { Alert, type AlertButton } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';

import { useStartNewSeries } from '../useStartNewSeries';

const calls: string[] = [];
const mockReplace = jest.fn((href: unknown) => { calls.push(`replace ${JSON.stringify(href)}`); });
const mockArchive = jest.fn(() => { calls.push('archive'); });
const mockAbandon = jest.fn(() => { calls.push('abandon intent'); });
const mockGate = jest.fn(() => true);
let mockRequestId: string | null;
let mockInflight: { jobId: string; submittedAt: number; leftForHome?: boolean; superseded?: boolean } | null;
let mockState: {
  user: { hasCompletedOnboarding: boolean } | null;
  devotionals: { id: string; days: unknown[] }[];
  currentDevotionalId: string | null;
  generationSession: { status: string };
  archiveCurrentDevotional: () => void;
};

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@/lib/store', () => ({ useUnfoldStore: { getState: () => mockState } }));
jest.mock('@/lib/inflight-generation-job', () => ({ readInflightGenerationJob: () => mockInflight }));
jest.mock('@/lib/initial-generation-request', () => ({ readInitialGenerationRequestId: () => mockRequestId }));
jest.mock('@/lib/auto-trial-intent', () => ({
  readAutoTrialIntent: () => null,
  abandonPurchasedIntentBeforeNewSeries: () => mockAbandon(),
}));

const NEW_SERIES_INTAKE = { pathname: '/onboarding', params: { startAt: 'themeType', flow: 'newSeries' } };

function start() {
  const { result } = renderHook(() => useStartNewSeries(mockGate));
  act(() => result.current());
}

function lastAlertButton(text: string): AlertButton {
  const buttons = (jest.mocked(Alert.alert).mock.lastCall?.[2] ?? []) as AlertButton[];
  const button = buttons.find((candidate) => candidate.text === text);
  if (!button) throw new Error(`No "${text}" button`);
  return button;
}

describe('useStartNewSeries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    calls.length = 0;
    mockGate.mockReturnValue(true);
    mockRequestId = null;
    mockInflight = null;
    mockState = {
      user: { hasCompletedOnboarding: true },
      devotionals: [],
      currentDevotionalId: null,
      generationSession: { status: 'idle' },
      archiveCurrentDevotional: mockArchive,
    };
  });

  it('opens the new-series intake at its theme step when no series is current', () => {
    start();
    expect(mockGate).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(calls).toEqual(['abandon intent', `replace ${JSON.stringify(NEW_SERIES_INTAKE)}`]);
  });

  it('stops when the creation gate declines', () => {
    mockGate.mockReturnValue(false);
    start();
    expect(calls).toEqual([]);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('asks before ending the current series and archives it only on Continue', () => {
    mockState.devotionals = [{ id: 'series-1', days: [{}] }];
    mockState.currentDevotionalId = 'series-1';
    start();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Start a new series?',
      'Starting a new series will end your current one.',
      expect.any(Array),
    );
    expect(lastAlertButton('Cancel').style).toBe('cancel');
    expect(calls).toEqual([]);

    act(() => lastAlertButton('Continue').onPress?.());
    expect(calls).toEqual(['archive', 'abandon intent', `replace ${JSON.stringify(NEW_SERIES_INTAKE)}`]);
  });

  it('resumes a first series that is still being prepared instead of starting another', () => {
    mockRequestId = 'initial-request-1';
    mockState.generationSession = { status: 'generating' };
    start();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(calls).toEqual([`replace ${JSON.stringify('/generating')}`]);
  });

  it('resumes a series that is still generating instead of starting the intake over it', () => {
    mockInflight = { jobId: 'job-1', submittedAt: 1, leftForHome: true };
    mockState.devotionals = [{ id: 'series-1', days: [{}] }];
    mockState.currentDevotionalId = 'series-1';
    start();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(calls).toEqual([`replace ${JSON.stringify('/generating')}`]);
  });

  it('still starts the intake over a superseded job', () => {
    mockInflight = { jobId: 'job-1', submittedAt: 1, superseded: true };
    start();
    expect(calls).toEqual(['abandon intent', `replace ${JSON.stringify(NEW_SERIES_INTAKE)}`]);
  });

  it('sends a reader who has not finished onboarding to onboarding, before any gate', () => {
    mockState.user = null;
    start();
    expect(mockGate).not.toHaveBeenCalled();
    expect(calls).toEqual([`replace ${JSON.stringify('/onboarding')}`]);
  });
});
