import React from 'react';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockSpeechHandlers: Record<string, (event?: any) => void> = {};
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
    mockSpeechHandlers[eventName] = handler;
  },
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
      mockSpeechHandlers.result({
        isFinal: true,
        results: [{ transcript: 'Sentence one.' }],
      });
    });

    act(() => {
      mockSpeechHandlers.end();
    });

    expect(mockStart).toHaveBeenCalledTimes(2);

    act(() => {
      mockSpeechHandlers.result({
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
      mockSpeechHandlers.result({
        isFinal: false,
        results: [{ transcript: 'Sentence one' }],
      });
    });

    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Accept voice input' }).props.onPress();
    });

    act(() => {
      mockSpeechHandlers.result({
        isFinal: true,
        results: [{ transcript: 'Sentence one trailing words.' }],
      });
    });

    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(onChangeText).toHaveBeenCalledWith('Sentence one trailing words.');
  });
});
