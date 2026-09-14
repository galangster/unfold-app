import React from 'react';
import { AppState, TextInput, TouchableOpacity } from 'react-native';
import * as renderer from 'react-test-renderer';
import { VoiceCheckInSheet } from '../VoiceCheckInSheet';
import type { VoiceCheckInDraft, SavedVoiceCheckIn } from '@/lib/voice-check-ins';

const { act } = renderer;

const mockSendVoiceCheckInDraft = jest.fn();
const mockListVoiceCheckIns = jest.fn(async (): Promise<SavedVoiceCheckIn[]> => []);
const mockPlayer = { replace: jest.fn(), pause: jest.fn(), play: jest.fn(), seekTo: jest.fn() };
const mockReadVoiceCheckInDraft = jest.fn((): VoiceCheckInDraft | null => ({
  version: 1 as const,
  idempotencyKey: 'draft-1',
  audioUri: 'file:///check-in.m4a',
  durationMs: 3000,
  capturedAt: '2026-09-13T12:00:00.000Z',
  status: 'ready' as const,
}));

jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: async () => ({ granted: true }),
  setAudioModeAsync: async () => undefined,
  useAudioRecorder: () => ({
    isRecording: false,
    uri: 'file:///check-in.m4a',
    prepareToRecordAsync: jest.fn(),
    record: jest.fn(),
    stop: jest.fn(),
    getStatus: jest.fn(() => ({ durationMillis: 3000 })),
  }),
  useAudioRecorderState: () => ({ durationMillis: 3000, metering: -60, url: null, isRecording: false }),
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => ({ currentTime: 0, playing: false, didJustFinish: false, duration: 0 }),
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
  listVoiceCheckIns: () => mockListVoiceCheckIns(),
  readVoiceCheckInDraft: () => mockReadVoiceCheckInDraft(),
  retryPendingVoiceAudioCleanup: jest.fn(),
  sendVoiceCheckInDraft: (...args: unknown[]) => mockSendVoiceCheckInDraft(...args),
}));
jest.mock('@/lib/voice-recording', () => ({
  VOICE_RECORDING_OPTIONS: {},
  VOICE_WAVEFORM_BARS: 25,
  buildWaveform: () => [0.2, 0.4, 0.3],
  formatRecordingTime: () => '0:03',
  meterToLevel: () => 0,
}));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: new Proxy({}, { get: () => '#888888' }),
  }),
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
    useReducedMotion: () => false,
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
    reducedMotion: false,
    entering: (anim: unknown) => anim,
    exiting: (anim: unknown) => anim,
  }),
}));
jest.mock('@/components/icons', () => new Proxy({}, {
  get: (_target, name) => (name === '__esModule' ? true : () => null),
}));

jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never);

const savedNote = {
  id: 'saved-1',
  status: 'ready' as const,
  transcript: 'I named what I was carrying.',
  durationMs: 3000,
  capturedAt: '2026-09-13T12:00:00.000Z',
  createdAt: '2026-09-13T12:00:01.000Z',
  updatedAt: '2026-09-13T12:00:01.000Z',
};

describe('VoiceCheckInSheet save motion', () => {
  beforeEach(() => {
    AppState.currentState = 'active';
    mockSendVoiceCheckInDraft.mockReset();
    mockListVoiceCheckIns.mockReset().mockResolvedValue([]);
    mockReadVoiceCheckInDraft.mockReturnValue({
      version: 1,
      idempotencyKey: 'draft-1',
      audioUri: 'file:///check-in.m4a',
      durationMs: 3000,
      capturedAt: '2026-09-13T12:00:00.000Z',
      status: 'ready',
    });
  });

  it('shows processing bars during send and draws a check only after the draft is saved', async () => {
    let resolveSend: ((value: typeof savedNote) => void) | undefined;
    mockSendVoiceCheckInDraft.mockImplementation(
      () => new Promise((resolve) => { resolveSend = resolve; }),
    );

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<VoiceCheckInSheet visible onClose={jest.fn()} />);
      await Promise.resolve();
    });

    const send = tree!.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Send voice check-in',
    )[0];
    await act(async () => {
      send.props.onPress();
      await Promise.resolve();
    });

    expect(tree!.root.findByProps({ testID: 'voice-processing-bars' })).toBeTruthy();
    expect(tree!.root.findAllByProps({ testID: 'voice-save-check-draw' })).toHaveLength(0);
    expect(tree!.root.findAll((node) => node.props?.accessibilityLabel === 'Recording 0:03')).toHaveLength(0);

    await act(async () => {
      resolveSend?.(savedNote);
      await Promise.resolve();
    });

    expect(mockSendVoiceCheckInDraft).toHaveBeenCalledTimes(1);
    expect(tree!.root.findByProps({ testID: 'voice-save-check-draw' })).toBeTruthy();
    expect(tree!.root.findAllByProps({ testID: 'voice-processing-bars' })).toHaveLength(0);
  });

  it('opens cached history with a static check and does not send again', async () => {
    mockReadVoiceCheckInDraft.mockReturnValue(null);
    mockListVoiceCheckIns.mockResolvedValue([savedNote]);

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<VoiceCheckInSheet visible onClose={jest.fn()} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const history = tree!.root.findAll(
      (node) => node.type === TouchableOpacity && String(node.props.accessibilityLabel ?? '').startsWith('Open voice check-in'),
    )[0];
    await act(async () => {
      history.props.onPress();
    });

    expect(mockSendVoiceCheckInDraft).not.toHaveBeenCalled();
    expect(tree!.root.findByProps({ testID: 'voice-save-check-static' })).toBeTruthy();
    expect(tree!.root.findAllByProps({ testID: 'voice-save-check-draw' })).toHaveLength(0);
    expect(tree!.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('keeps the recording after a send failure and does not show a saved check', async () => {
    mockSendVoiceCheckInDraft.mockRejectedValue(new Error('network down'));

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<VoiceCheckInSheet visible onClose={jest.fn()} />);
      await Promise.resolve();
    });

    const send = tree!.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Send voice check-in',
    )[0];
    await act(async () => {
      send.props.onPress();
      await Promise.resolve();
    });

    expect(tree!.root.findAllByProps({ testID: 'voice-save-check-draw' })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ testID: 'voice-save-check-static' })).toHaveLength(0);
    expect(tree!.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Try sending again',
    ).length).toBeGreaterThan(0);
  });
});
