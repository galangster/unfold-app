import React from 'react';

const renderer = require('react-test-renderer');
const { act } = renderer;
const { TouchableOpacity } = require('react-native');

const mockSpeechHandlers: Record<string, Array<(event?: any) => void>> = {};
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockRequestPermissionsAsync = jest.fn(async () => ({ granted: true }));

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: mockRequestPermissionsAsync,
    start: mockStart,
    stop: mockStop,
  },
  useSpeechRecognitionEvent: (eventName: string, handler: (event?: any) => void) => {
    const React = require('react');

    React.useEffect(() => {
      mockSpeechHandlers[eventName] = mockSpeechHandlers[eventName] || [];
      mockSpeechHandlers[eventName].push(handler);

      return () => {
        const handlers = mockSpeechHandlers[eventName];
        if (!handlers) return;
        const index = handlers.indexOf(handler);
        if (index !== -1) handlers.splice(index, 1);
      };
    }, [eventName, handler]);
  },
}));

const mockPauseForVoiceInput = jest.fn(() => false);
const mockResumeAfterVoiceInput = jest.fn((_shouldResume: boolean) => Promise.resolve());
jest.mock('@/hooks/useGlobalAudioPlayer', () => ({
  pauseForVoiceInput: () => mockPauseForVoiceInput(),
  resumeAfterVoiceInput: (shouldResume: boolean) => mockResumeAfterVoiceInput(shouldResume),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: {
    Error: 'error',
    Success: 'success',
    Warning: 'warning',
  },
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
  },
}));

jest.mock('phosphor-react-native', () => ({
  CheckIcon: () => null,
  MicrophoneIcon: () => null,
  XIcon: () => null,
}));

jest.mock('@/components/ui', () => ({
  alpha: (color: string) => color,
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#D4AF37',
      background: '#000000',
      buttonBackground: '#222222',
      inputBackground: '#111111',
      textMuted: '#999999',
      textSubtle: '#777777',
    },
  }),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: {
      View,
    },
    FadeIn: { duration: () => ({ easing: () => ({}) }) },
    FadeOut: { duration: () => ({ easing: () => ({}) }) },
    Easing: {
      cubic: 'cubic',
      in: () => 'in',
      inOut: () => 'inOut',
      out: () => 'out',
      sin: 'sin',
    },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => true,
    useSharedValue: (value: unknown) => ({ value }),
    withDelay: (_delay: number, animation: unknown) => animation,
    withRepeat: (animation: unknown) => animation,
    withSequence: (...animations: unknown[]) => animations[animations.length - 1],
    withTiming: (value: unknown) => value,
  };
});

const { VoiceInputBar } = require('../VoiceInputBar');

function dispatchSpeechEvent(eventName: string, event?: any) {
  [...(mockSpeechHandlers[eventName] ?? [])].forEach((handler) => handler(event));
}

function findPressablesByLabel(root: any, accessibilityLabel: string) {
  return root
    .findAll((node: any) => node.type === TouchableOpacity && node.props.accessibilityLabel === accessibilityLabel)
    .filter((node: any) => typeof node.props.onPress === 'function');
}

describe('VoiceInputBar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.keys(mockSpeechHandlers).forEach((key) => { delete mockSpeechHandlers[key]; });
    mockStart.mockClear();
    mockStop.mockClear();
    mockRequestPermissionsAsync.mockClear();
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('keeps finalized speech from before a silence restart when accepting dictation', async () => {
    const onChangeText = jest.fn();
    let tree: any;

    await act(async () => {
      tree = renderer.create(<VoiceInputBar value="" onChangeText={onChangeText} />);
    });

    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Tap to speak' }).props.onPress();
      await Promise.resolve();
    });

    act(() => {
      dispatchSpeechEvent('result', {
        isFinal: true,
        results: [{ transcript: 'Sentence one.' }],
      });
    });

    act(() => {
      dispatchSpeechEvent('end');
    });

    expect(mockStart).toHaveBeenCalledTimes(2);

    act(() => {
      dispatchSpeechEvent('result', {
        isFinal: true,
        results: [{ transcript: 'Sentence two.' }],
      });
    });

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Accept voice input' }).props.onPress();
      jest.advanceTimersByTime(250);
    });

    expect(onChangeText).toHaveBeenCalledWith('Sentence one. Sentence two.');
  });

  it('waits for a pending final result before accepting dictation', async () => {
    const onChangeText = jest.fn();
    let tree: any;

    await act(async () => {
      tree = renderer.create(<VoiceInputBar value="" onChangeText={onChangeText} />);
    });

    await act(async () => {
      tree.root.findByProps({ accessibilityLabel: 'Tap to speak' }).props.onPress();
      await Promise.resolve();
    });

    act(() => {
      dispatchSpeechEvent('result', {
        isFinal: false,
        results: [{ transcript: 'Sentence one' }],
      });
    });

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Accept voice input' }).props.onPress();
    });

    act(() => {
      dispatchSpeechEvent('result', {
        isFinal: true,
        results: [{ transcript: 'Sentence one trailing words.' }],
      });
    });

    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(onChangeText).toHaveBeenCalledWith('Sentence one trailing words.');
  });

  it('routes speech only to the most recently started voice input', async () => {
    const onChangeTextA = jest.fn();
    const onChangeTextB = jest.fn();
    let tree: any;

    try {
      await act(async () => {
        tree = renderer.create(
          <>
            <VoiceInputBar value="" onChangeText={onChangeTextA} />
            <VoiceInputBar value="" onChangeText={onChangeTextB} />
          </>,
        );
      });

      await act(async () => {
        await findPressablesByLabel(tree.root, 'Tap to speak')[0].props.onPress();
      });

      act(() => {
        dispatchSpeechEvent('result', {
          isFinal: false,
          results: [{ transcript: 'First field words' }],
        });
      });

      await act(async () => {
        await findPressablesByLabel(tree.root, 'Tap to speak')[0].props.onPress();
      });

      // Handoff commits the first field's in-progress dictation to its own
      // field — spoken words never silently vanish on takeover.
      expect(onChangeTextA).toHaveBeenCalledWith('First field words');

      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(findPressablesByLabel(tree.root, 'Accept voice input')).toHaveLength(1);

      act(() => {
        dispatchSpeechEvent('result', {
          isFinal: true,
          results: [{ transcript: 'Second field only.' }],
        });
      });

      act(() => {
        findPressablesByLabel(tree.root, 'Accept voice input')[0].props.onPress();
        jest.advanceTimersByTime(250);
      });

      expect(onChangeTextB).toHaveBeenCalledWith('Second field only.');

      const remainingAcceptButtons = findPressablesByLabel(tree.root, 'Accept voice input');
      if (remainingAcceptButtons.length > 0) {
        act(() => {
          remainingAcceptButtons[0].props.onPress();
          jest.advanceTimersByTime(250);
        });
      }

      expect(onChangeTextA).toHaveBeenCalledTimes(1);
    } finally {
      if (tree) {
        act(() => {
          tree.unmount();
        });
      }
    }
  });

  it('restarts the shared recognizer at most once when a transferred session ends', async () => {
    const onChangeTextA = jest.fn();
    const onChangeTextB = jest.fn();
    let tree: any;

    try {
      await act(async () => {
        tree = renderer.create(
          <>
            <VoiceInputBar value="" onChangeText={onChangeTextA} />
            <VoiceInputBar value="" onChangeText={onChangeTextB} />
          </>,
        );
      });

      await act(async () => {
        await findPressablesByLabel(tree.root, 'Tap to speak')[0].props.onPress();
      });

      await act(async () => {
        await findPressablesByLabel(tree.root, 'Tap to speak')[0].props.onPress();
      });

      const startsBeforeEnd = mockStart.mock.calls.length;

      act(() => {
        dispatchSpeechEvent('end');
      });

      expect(mockStart).toHaveBeenCalledTimes(startsBeforeEnd + 1);
    } finally {
      if (tree) {
        act(() => {
          tree.unmount();
        });
      }
    }
  });

  it('pauses narration for dictation and resumes it when the session ends', async () => {
    mockPauseForVoiceInput.mockClear();
    mockResumeAfterVoiceInput.mockClear();
    mockPauseForVoiceInput.mockReturnValueOnce(true);
    const onChangeText = jest.fn();
    let tree: any;

    try {
      await act(async () => {
        tree = renderer.create(<VoiceInputBar value="" onChangeText={onChangeText} />);
      });

      await act(async () => {
        await findPressablesByLabel(tree.root, 'Tap to speak')[0].props.onPress();
      });

      expect(mockPauseForVoiceInput).toHaveBeenCalled();
      expect(mockResumeAfterVoiceInput).not.toHaveBeenCalled();

      act(() => {
        dispatchSpeechEvent('result', {
          isFinal: true,
          results: [{ transcript: 'Narration test.' }],
        });
      });

      act(() => {
        findPressablesByLabel(tree.root, 'Accept voice input')[0].props.onPress();
        jest.advanceTimersByTime(250);
      });

      expect(onChangeText).toHaveBeenCalledWith('Narration test.');
      expect(mockResumeAfterVoiceInput).toHaveBeenCalledWith(true);
    } finally {
      if (tree) {
        act(() => {
          tree.unmount();
        });
      }
    }
  });
});
