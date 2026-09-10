import React from 'react';
import { AppState, TextInput } from 'react-native';

import * as renderer from 'react-test-renderer';
import { OnboardingVoiceAnswerSheet } from '../OnboardingVoiceAnswerSheet';

const { act } = renderer;

const mockRequestPermissions = jest.fn(async () => ({ granted: true }));
const mockSetAudioMode = jest.fn(async (..._args: unknown[]) => undefined);
const mockTranscribe = jest.fn();
const mockDeleteAudio = jest.fn();
const mockPauseForVoiceInput = jest.fn(() => false);
const mockResumeAfterVoiceInput = jest.fn(async (..._args: unknown[]) => undefined);

const mockRecorder = {
  isRecording: false,
  uri: 'file:///about-me.m4a',
  prepareToRecordAsync: jest.fn(async (..._args: unknown[]) => undefined),
  record: jest.fn(() => { mockRecorder.isRecording = true; }),
  stop: jest.fn(async () => { mockRecorder.isRecording = false; }),
  getStatus: jest.fn(() => ({ durationMillis: 4_200 })),
};

const mockRecorderState = {
  durationMillis: 4_200,
  metering: -12,
  url: 'file:///about-me.m4a',
  isRecording: false,
};

const mockPlayer = {
  replace: jest.fn(),
  pause: jest.fn(),
  play: jest.fn(),
  seekTo: jest.fn(async (..._args: unknown[]) => undefined),
};

const mockPlayerStatus = {
  currentTime: 0,
  playing: false,
  didJustFinish: false,
  duration: 4.2,
};

const mockAppStateListeners: ((state: string) => void)[] = [];

jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: { web: {} } },
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
  pauseForVoiceInput: () => mockPauseForVoiceInput(),
  resumeAfterVoiceInput: (shouldResume: boolean) => mockResumeAfterVoiceInput(shouldResume),
}));

jest.mock('@/lib/voice-input', () => ({
  transcribeVoiceInput: (...args: unknown[]) => mockTranscribe(...args),
  deleteLocalVoiceAudio: (...args: unknown[]) => mockDeleteAudio(...args),
  VoiceInputApiError: class VoiceInputApiError extends Error {
    readonly code: string;
    readonly status?: number;
    constructor(code: string, message: string, status?: number) {
      super(message);
      this.code = code;
      this.status = status;
      this.name = 'VoiceInputApiError';
    }
  },
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#C8A55C',
      background: '#0A0A0A',
      backgroundElevated: '#141210',
      text: '#F5F0EB',
      textMuted: 'rgba(245,240,235,0.6)',
      textHint: 'rgba(245,240,235,0.25)',
      error: '#E85D4C',
      border: 'rgba(245,240,235,0.08)',
      borderFocused: 'rgba(245,240,235,0.18)',
      borderStrong: 'rgba(245,240,235,0.28)',
      inputBackground: 'rgba(245,240,235,0.05)',
      success: '#7CB87C',
    },
    isDark: true,
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
    for (const method of ['duration', 'delay', 'easing', 'springify', 'damping', 'build']) {
      anim[method] = () => anim;
    }
    return anim;
  };
  return {
    __esModule: true,
    default: {
      View: ReactNative.View,
      Text: ReactNative.Text,
      createAnimatedComponent: (component: unknown) => component,
    },
    FadeIn: chainable(),
    FadeInDown: chainable(),
    useReducedMotion: () => true,
  };
});

jest.mock('@/components/icons', () => {
  const ReactNative = jest.requireActual('react-native');
  const Icon = () => null;
  return {
    ArrowCounterClockwiseIcon: Icon,
    CheckIcon: Icon,
    MicrophoneIcon: Icon,
    PauseIcon: Icon,
    PlayIcon: Icon,
    StopCircleIcon: Icon,
    TrashIcon: Icon,
    WarningCircleIcon: Icon,
    XIcon: Icon,
    View: ReactNative.View,
  };
});

jest.spyOn(AppState, 'addEventListener').mockImplementation(((event: string, listener: (state: string) => void) => {
  if (event === 'change') mockAppStateListeners.push(listener);
  return { remove: jest.fn() };
}) as typeof AppState.addEventListener);


type TestNode = renderer.ReactTestInstance;

function walk(node: TestNode | string | null | undefined, visit: (node: TestNode) => void) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function flattenText(node: TestNode | string | null | undefined): string {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  return (node.children ?? []).map((child) => flattenText(child)).join('');
}

function findByLabel(root: TestNode, label: string) {
  let found: TestNode | undefined;
  walk(root, (node) => {
    if (!found && node.props?.accessibilityLabel === label) found = node;
  });
  return found;
}

async function renderSheet(props: Record<string, unknown> = {}) {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <OnboardingVoiceAnswerSheet
        visible
        existingText=""
        onClose={jest.fn()}
        onAccept={jest.fn()}
        previewIsDark
        {...props}
      />,
    );
  });
  return tree!;
}

describe('OnboardingVoiceAnswerSheet', () => {
  beforeEach(() => {
    AppState.currentState = 'active';
    mockRequestPermissions.mockReset();
    mockRequestPermissions.mockResolvedValue({ granted: true });
    mockSetAudioMode.mockReset();
    mockSetAudioMode.mockResolvedValue(undefined);
    mockTranscribe.mockReset();
    mockDeleteAudio.mockReset();
    mockPauseForVoiceInput.mockReset();
    mockResumeAfterVoiceInput.mockReset();
    mockRecorder.isRecording = false;
    mockRecorder.prepareToRecordAsync.mockClear();
    mockRecorder.record.mockClear();
    mockRecorder.stop.mockClear();
    mockPlayer.replace.mockClear();
    mockPlayer.pause.mockClear();
    mockAppStateListeners.length = 0;
  });

  it('starts recording once when opened from the microphone button', async () => {
    await renderSheet({ autoStart: true });
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(mockRecorder.record).toHaveBeenCalledTimes(1);
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it('writes the reviewed answer only after Use this answer, not after close', async () => {
    const onAccept = jest.fn();
    const onClose = jest.fn();
    const tree = await renderSheet({
      demoMode: true,
      initialDemoPhase: 'transcript',
      demoTranscript: 'I want quieter mornings.',
      existingText: 'I am a dad.',
      onAccept,
      onClose,
    });

    const firstInput = tree.root.findAllByType(TextInput)[0];
    expect(firstInput.props.value).toBe('I am a dad. I want quieter mornings.');

    await act(async () => {
      findByLabel(tree.root, 'Close voice answer')?.props?.onPress?.();
    });

    expect(onAccept).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(mockDeleteAudio).not.toHaveBeenCalled();

    const accepted = await renderSheet({
      demoMode: true,
      initialDemoPhase: 'transcript',
      demoTranscript: 'I want quieter mornings.',
      existingText: 'I am a dad.',
      onAccept,
      onClose,
    });

    await act(async () => {
      findByLabel(accepted.root, 'Use this answer')?.props?.onPress?.();
    });

    expect(onAccept).toHaveBeenCalledWith('I am a dad. I want quieter mornings.');
  });

  it('preserves existing typed text until explicit acceptance', async () => {
    const onAccept = jest.fn();
    const tree = await renderSheet({
      demoMode: true,
      initialDemoPhase: 'review',
      existingText: 'Keep this typed answer.',
      onAccept,
    });

    await act(async () => {
      findByLabel(tree.root, 'Close voice answer')?.props?.onPress?.();
    });

    expect(onAccept).not.toHaveBeenCalled();
    expect(flattenText(tree.root)).not.toContain('Keep this typed answer.');
  });

  it('shows the full over-limit transcript and disables acceptance', async () => {
    const onAccept = jest.fn();
    const overLimit = `${'I want a quieter morning. '.repeat(120)}`;
    const tree = await renderSheet({
      demoMode: true,
      initialDemoPhase: 'transcript',
      demoTranscript: overLimit,
      onAccept,
    });

    const text = flattenText(tree.root);
    const input = tree.root.findAllByType(TextInput)[0];
    expect(input.props.value).toBe(overLimit);
    expect(text).toContain(`${overLimit.length} / 2000`);
    expect(text).toContain('over the 2000-character limit');

    const useButton = findByLabel(tree.root, 'Use this answer');
    expect(useButton?.props?.disabled).toBe(true);
    expect(useButton?.props?.accessibilityState).toEqual({ disabled: true });

    await act(async () => {
      useButton?.props?.onPress?.();
    });
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('keeps typing available after microphone permission is denied', async () => {
    mockRequestPermissions.mockResolvedValueOnce({ granted: false });
    const onAccept = jest.fn();
    const tree = await renderSheet({ onAccept });

    await act(async () => {
      findByLabel(tree.root, 'Start recording your answer')?.props?.onPress?.();
      await Promise.resolve();
    });

    expect(flattenText(tree.root)).toContain('Microphone unavailable');
    expect(flattenText(tree.root)).toContain('You can still type your answer.');
    expect(onAccept).not.toHaveBeenCalled();
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it('keeps the local recording after a failed transcription so retry can run again', async () => {
    mockTranscribe
      .mockRejectedValueOnce(Object.assign(new Error('Try later.'), { code: 'RATE_LIMITED' }))
      .mockResolvedValueOnce('Recovered transcript.');
    const onAccept = jest.fn();
    const tree = await renderSheet({ onAccept });

    await act(async () => {
      findByLabel(tree.root, 'Start recording your answer')?.props?.onPress?.();
      await Promise.resolve();
    });
    await act(async () => {
      findByLabel(tree.root, 'Stop and review recording')?.props?.onPress?.();
      await Promise.resolve();
    });
    await act(async () => {
      findByLabel(tree.root, 'Transcribe recording')?.props?.onPress?.();
      await Promise.resolve();
    });

    expect(flattenText(tree.root)).toContain('Couldn’t transcribe');
    expect(mockDeleteAudio).not.toHaveBeenCalled();

    await act(async () => {
      findByLabel(tree.root, 'Review recording and retry')?.props?.onPress?.();
    });
    await act(async () => {
      findByLabel(tree.root, 'Transcribe recording')?.props?.onPress?.();
      await Promise.resolve();
    });

    expect(mockTranscribe).toHaveBeenCalledTimes(2);
    expect(tree.root.findAllByType(TextInput)[0].props.value).toBe('Recovered transcript.');
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('stops recording and releases the microphone when closed', async () => {
    const onClose = jest.fn();
    const tree = await renderSheet({ autoStart: true, onClose });
    await act(async () => {
      await findByLabel(tree.root, 'Close voice answer')?.props?.onPress?.();
    });
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenLastCalledWith({ allowsRecording: false, playsInSilentMode: true });
    expect(mockDeleteAudio).toHaveBeenCalledWith('file:///about-me.m4a');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it('stops an in-progress recording when the app is backgrounded', async () => {
    const tree = await renderSheet();

    await act(async () => {
      findByLabel(tree.root, 'Start recording your answer')?.props?.onPress?.();
      await Promise.resolve();
    });
    mockRecorder.isRecording = true;

    await act(async () => {
      mockAppStateListeners.forEach((listener) => listener('background'));
      await Promise.resolve();
    });

    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(findByLabel(tree.root, 'Transcribe recording')).toBeTruthy();
  });

  it('ignores a stale transcription after the sheet is closed', async () => {
    let resolveTranscribe!: (value: string) => void;
    mockTranscribe.mockImplementationOnce(() => new Promise((resolve) => { resolveTranscribe = resolve; }));
    const onAccept = jest.fn();
    const onClose = jest.fn();
    const tree = await renderSheet({ onAccept, onClose });

    await act(async () => {
      findByLabel(tree.root, 'Start recording your answer')?.props?.onPress?.();
      await Promise.resolve();
    });
    await act(async () => {
      findByLabel(tree.root, 'Stop and review recording')?.props?.onPress?.();
      await Promise.resolve();
    });
    await act(async () => {
      findByLabel(tree.root, 'Transcribe recording')?.props?.onPress?.();
    });

    await act(async () => {
      findByLabel(tree.root, 'Close voice answer')?.props?.onPress?.();
      await Promise.resolve();
    });

    await act(async () => {
      resolveTranscribe('Late transcript that must not be used.');
      await Promise.resolve();
    });

    expect(onAccept).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(flattenText(tree.root)).not.toContain('Late transcript that must not be used.');
  });

  it('does not accept whitespace-only reviewed text', async () => {
    const onAccept = jest.fn();
    const tree = await renderSheet({
      demoMode: true,
      initialDemoPhase: 'transcript',
      demoTranscript: '   ',
      onAccept,
    });

    const input = tree.root.findAllByType(TextInput)[0];
    expect(input).toBeTruthy();

    const useButton = findByLabel(tree.root, 'Use this answer');
    expect(useButton?.props?.disabled).toBe(true);

    await act(async () => {
      useButton?.props?.onPress?.();
    });
    expect(onAccept).not.toHaveBeenCalled();
  });

});
