/**
 * Greptile A12 regression: a throw from prepareToRecordAsync()/record() after
 * the session was switched to record mode must hand the session back.
 */
import React from 'react';
import { AppState, TouchableOpacity } from 'react-native';
import * as renderer from 'react-test-renderer';
import { VoiceCheckInSheet } from '../VoiceCheckInSheet';

const { act } = renderer;

const mockRequestPermissions = jest.fn(async () => ({ granted: true }));
const mockSetAudioMode = jest.fn(async (..._args: unknown[]) => undefined);

const mockRecorder = {
  isRecording: false,
  uri: 'file:///check-in.m4a',
  prepareToRecordAsync: jest.fn(async (..._args: unknown[]) => undefined),
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
  };
});
jest.mock('@/components/icons', () => new Proxy({}, {
  get: (_target, name) => (name === '__esModule' ? true : () => null),
}));

jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never);

describe('VoiceCheckInSheet failed start (Greptile A12)', () => {
  beforeEach(() => {
    mockSetAudioMode.mockClear();
    mockRecorder.prepareToRecordAsync.mockReset();
    mockRecorder.record.mockReset();
  });

  it('restores allowsRecording=false when prepareToRecordAsync throws', async () => {
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

    const modes = mockSetAudioMode.mock.calls.map((call) => (call[0] as { allowsRecording: boolean }).allowsRecording);
    expect(modes[0]).toBe(true);
    expect(modes[modes.length - 1]).toBe(false);
    expect(mockRecorder.record).not.toHaveBeenCalled();
  });
});
