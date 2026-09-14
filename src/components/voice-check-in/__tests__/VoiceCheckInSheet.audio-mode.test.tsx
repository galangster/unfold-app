/**
 * Greptile A12 regression: a throw from prepareToRecordAsync()/record() after
 * the session was switched to record mode must hand the session back.
 */
import React from 'react';
import { AppState, TouchableOpacity, type AppStateStatus } from 'react-native';
import * as renderer from 'react-test-renderer';
import { VoiceCheckInSheet } from '../VoiceCheckInSheet';

const { act } = renderer;

const mockRequestPermissions = jest.fn(async () => ({ granted: true }));
const mockSetAudioMode = jest.fn(async (..._args: unknown[]): Promise<void> => undefined);
const mockRecordingLease = {
  configure: jest.fn(async () => true),
  isActive: jest.fn(() => true),
  release: jest.fn(),
};

let mockRecordingInvalidated: (() => void) | undefined;

jest.mock('@/lib/voice-audio-session', () => ({
  acquireVoiceRecordingSession: (onInvalidated: () => void) => {
    mockRecordingInvalidated = onInvalidated;
    return mockRecordingLease;
  },
  acquireVoiceReviewSession: jest.fn(),
}));

const mockRecorder = {
  isRecording: false,
  uri: 'file:///check-in.m4a',
  prepareToRecordAsync: jest.fn(async (..._args: unknown[]): Promise<void> => undefined),
  record: jest.fn(),
  stop: jest.fn(async () => undefined),
  getStatus: jest.fn(() => ({ durationMillis: 0 })),
};
const mockRecorderState = { durationMillis: 0, metering: -60, url: null, isRecording: false };
const mockPlayer = { replace: jest.fn(), pause: jest.fn(), play: jest.fn(), seekTo: jest.fn(async () => undefined) };
const mockPlayerStatus = { currentTime: 0, playing: false, didJustFinish: false, duration: 0 };

jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: () => mockRequestPermissions(),
  setAudioModeAsync: (...args: unknown[]) => mockSetAudioMode(...args),
  useAudioRecorder: () => mockRecorder,
  useAudioRecorderState: () => mockRecorderState,
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockPlayerStatus,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
jest.mock('@/hooks/useGlobalAudioPlayer', () => ({
  pauseForVoiceInput: () => false,
  resumeAfterVoiceInput: async () => undefined,
}));
jest.mock('@/lib/voice-check-ins', () => ({
  VOICE_CHECK_IN_MAX_DURATION_MS: 120_000,
  VoiceCheckInApiError: class VoiceCheckInApiError extends Error {},
  createVoiceCheckInDraft: jest.fn(),
  deleteVoiceCheckIn: jest.fn(async () => undefined),
  discardVoiceCheckInDraft: jest.fn(),
  editVoiceCheckIn: jest.fn(),
  listVoiceCheckIns: jest.fn(async () => []),
  readVoiceCheckInDraft: jest.fn(() => null),
  retryPendingVoiceAudioCleanup: jest.fn(),
  sendVoiceCheckInDraft: jest.fn(),
}));
jest.mock('@/lib/voice-recording', () => ({
  VOICE_RECORDING_OPTIONS: {},
  VOICE_WAVEFORM_BARS: 25,
  buildWaveform: () => [],
  formatRecordingTime: () => '0:00',
  meterToLevel: () => 0,
}));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ isDark: true, colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/components/ui', () => ({ alpha: (color: string) => color }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-reanimated', () => {
  const ReactNative = jest.requireActual('react-native');
  const chainable = () => {
    const anim: Record<string, unknown> = {};
    for (const method of ['duration', 'delay', 'easing', 'springify', 'damping', 'build']) anim[method] = () => anim;
    return anim;
  };
  return {
    __esModule: true,
    default: { View: ReactNative.View, Text: ReactNative.Text, createAnimatedComponent: (c: unknown) => c },
    FadeIn: chainable(),
    FadeInDown: chainable(),
    useReducedMotion: () => true,
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedProps: (factory: () => unknown) => factory(),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withTiming: (value: unknown) => value,
    withRepeat: (value: unknown) => value,
    withDelay: (_delay: unknown, value: unknown) => value,
    cancelAnimation: jest.fn(),
    Easing: { cubic: 'cubic', out: () => 'out', in: () => 'in', inOut: () => 'inOut' },
  };
});

jest.mock('react-native-svg', () => {
  const ReactLib = jest.requireActual('react');
  const ReactNative = jest.requireActual('react-native');
  const Stub = (props: { children?: React.ReactNode }) => ReactLib.createElement(ReactNative.View, props, props.children);
  return { __esModule: true, default: Stub, Path: Stub };
});
jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({
    reducedMotion: true,
    entering: () => undefined,
    exiting: () => undefined,
  }),
}));
jest.mock('@/components/icons', () => new Proxy({}, {
  get: (_target, name) => (name === '__esModule' ? true : () => null),
}));

const mockAppStateListeners: ((state: AppStateStatus) => void)[] = [];
jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
  mockAppStateListeners.push(listener);
  return { remove: jest.fn() };
});

describe('VoiceCheckInSheet failed start (Greptile A12)', () => {
  beforeEach(() => {
    AppState.currentState = 'active';
    mockAppStateListeners.length = 0;
    mockSetAudioMode.mockClear();
    mockRecorder.prepareToRecordAsync.mockReset();
    mockRecorder.record.mockReset();
    mockRecordingLease.configure.mockClear();
    mockRecordingLease.isActive.mockReturnValue(true);
    mockRecordingLease.release.mockClear();
  });

  it('does not start the microphone when interruption invalidates the lease during prepare', async () => {
    let finishPrepare!: () => void;
    mockRecorder.prepareToRecordAsync.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishPrepare = resolve;
        }),
    );

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<VoiceCheckInSheet visible onClose={jest.fn()} />);
      await Promise.resolve();
    });
    const start = tree!.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Start voice check-in recording',
    )[0];
    await act(async () => {
      void start.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalled();

    mockRecordingLease.isActive.mockReturnValue(false);
    await act(async () => {
      finishPrepare();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(mockRecordingLease.release).toHaveBeenCalled();
  });

  it('offers the saved draft when native capture has paused before JS receives interruption', async () => {
    mockRecorder.prepareToRecordAsync.mockResolvedValue(undefined);
    mockRecorder.getStatus.mockReturnValue({ durationMillis: 4_200 });
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<VoiceCheckInSheet visible onClose={jest.fn()} />); });
    const start = tree!.root.findAll((node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Start voice check-in recording')[0];
    await act(async () => { await start.props.onPress(); });
    expect(mockRecorder.record).toHaveBeenCalled();
    mockRecorder.isRecording = false;
    await act(async () => { mockRecordingInvalidated?.(); await Promise.resolve(); });
    const { createVoiceCheckInDraft } = jest.requireMock('@/lib/voice-check-ins');
    expect(createVoiceCheckInDraft).toHaveBeenCalledWith('file:///check-in.m4a', 4_200);
    expect(mockPlayer.replace).toHaveBeenCalledWith('file:///check-in.m4a');
    expect(mockRecordingLease.release).toHaveBeenCalled();
  });

  it.each(['review', 'discard', 'send'] as const)('does not recover a consumed check-in after %s and background', async (action) => {
    const api = jest.requireMock('@/lib/voice-check-ins');
    api.createVoiceCheckInDraft.mockReturnValue({ audioUri: 'file:///check-in.m4a', durationMs: 4_200, status: 'local' });
    api.sendVoiceCheckInDraft.mockResolvedValue({ id: 'saved', transcript: 'Saved transcript', capturedAt: '2026-09-14T00:00:00Z' });
    mockRecorder.prepareToRecordAsync.mockResolvedValue(undefined);
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<VoiceCheckInSheet visible onClose={jest.fn()} />); });
    const button = (label: string) => tree!.root.findAll((node) => node.type === TouchableOpacity && node.props.accessibilityLabel === label)[0];
    await act(async () => { await button('Start voice check-in recording').props.onPress(); });
    await act(async () => { await button('Stop and review recording').props.onPress(); });
    if (action === 'discard') await act(async () => { await button('Discard recording').props.onPress(); });
    if (action === 'send') await act(async () => { await button('Send voice check-in').props.onPress(); });
    api.createVoiceCheckInDraft.mockClear();
    mockPlayer.replace.mockClear();
    mockRecorder.stop.mockClear();
    await act(async () => { mockAppStateListeners.forEach((listener) => listener('background')); await Promise.resolve(); });
    expect(api.createVoiceCheckInDraft).not.toHaveBeenCalled();
    expect(mockPlayer.replace).not.toHaveBeenCalled();
    expect(mockRecorder.stop).not.toHaveBeenCalled();
  });

  it('releases recording ownership when prepareToRecordAsync throws', async () => {
    mockRecorder.prepareToRecordAsync.mockRejectedValue(new Error('recorder busy'));

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<VoiceCheckInSheet visible onClose={jest.fn()} />);
      await Promise.resolve();
    });
    const start = tree!.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Start voice check-in recording',
    )[0];
    await act(async () => {
      await start.props.onPress();
      await Promise.resolve();
    });

    expect(mockRecordingLease.configure).toHaveBeenCalledTimes(1);
    expect(mockRecordingLease.release).toHaveBeenCalledTimes(1);
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });
});
