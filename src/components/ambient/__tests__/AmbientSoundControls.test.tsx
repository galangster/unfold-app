import React from 'react';
import { Alert } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { AmbientMusicEntry } from '../AmbientMusicEntry';
import { AmbientSoundSheet } from '../AmbientSoundControls';
import {
  useAmbientAudioState,
  AMBIENT_AUDIO_INITIAL_STATE,
} from '@/lib/ambient-audio-state';
import {
  beginAmbientVoiceInterruption,
  endAmbientVoiceInterruption,
} from '@/lib/ambient-audio-coordination';
import {
  pauseAmbientSound,
  playAmbientSound,
  previewAmbientVolume,
  setAmbientTimer,
  setAmbientVolume,
} from '@/lib/ambient-audio';

jest.mock('expo-router', () => ({ useIsFocused: () => true }));

const mockStopNarration = jest.fn();
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (component: unknown) => component },
    useReducedMotion: () => false,
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: (factory: () => unknown) => {
      try {
        return factory();
      } catch {
        return {};
      }
    },
    withTiming: (value: unknown, _config?: unknown, callback?: (finished: boolean) => void) => {
      callback?.(true);
      return value;
    },
    withSpring: (value: unknown) => value,
    cancelAnimation: jest.fn(),
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    Easing: { out: (easing: unknown) => easing, in: (easing: unknown) => easing, inOut: (easing: unknown) => easing, cubic: (value: number) => value },
  };
});
jest.mock('@/hooks/useGlobalAudioPlayer', () => ({
  useGlobalAudioPlayer: () => ({ stopAudio: mockStopNarration }),
  invalidateNarrationAudioSession: jest.fn(),
}));
jest.mock('@/lib/ambient-audio', () => ({
  pauseAmbientSound: jest.fn(),
  playAmbientSound: jest.fn(),
  previewAmbientVolume: jest.fn(),
  setAmbientTimer: jest.fn(),
  setAmbientVolume: jest.fn(),
  stopAmbientSound: jest.fn(),
}));
jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: {
    getItem: () => null,
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('@/lib/ambient-audio-catalog', () => ({
  AMBIENT_TRACKS: [
    { id: 'river-thread', title: 'Still Waters', duration: 195, source: 1 },
    { id: 'silent-warmth', title: 'Under Your Wings', duration: 120, source: 2 },
  ],
  formatTrackDuration: (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
  isAmbientTrackId: (value: unknown) =>
    ['river-thread', 'silent-warmth'].includes(String(value)),
}));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      background: '#0a0a0a',
      backgroundElevated: '#141210',
      text: '#f5f0eb',
      textMuted: '#aaa',
      accent: '#c8a55c',
      border: '#333',
      borderFocused: '#444',
      borderStrong: '#555',
    },
  }),
}));
jest.mock('@react-native-community/slider', () => {
  const ReactLib = require('react') as typeof import('react');
  const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: ({
      onValueChange,
      onSlidingComplete,
    }: {
      onValueChange?: (value: number) => void;
      onSlidingComplete?: (value: number) => void;
    }) =>
      ReactLib.createElement(
        ReactLib.Fragment,
        null,
        ReactLib.createElement(Pressable, {
          testID: 'ambient-volume-drag',
          onPress: () => onValueChange?.(0.4),
        }),
        ReactLib.createElement(Pressable, {
          testID: 'ambient-volume-commit',
          onPress: () => onSlidingComplete?.(0.4),
        }),
      ),
  };
});
jest.mock('@/components/icons', () => {
  const View = jest.requireActual<typeof import('react-native')>('react-native').View;
  return {
    CaretLeftIcon: View,
    CaretRightIcon: View,
    CheckIcon: View,
    ClockIcon: View,
    MusicNotesIcon: View,
    PauseIcon: View,
    PlayIcon: View,
    SpeakerHighIcon: View,
  };
});
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }),
}));

describe('native sound controls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAmbientAudioState.setState({
      ...AMBIENT_AUDIO_INITIAL_STATE,
      selectedTrackId: 'river-thread',
    });
    endAmbientVoiceInterruption();
  });

  it('offers music from the top entry without starting playback', () => {
    render(<AmbientMusicEntry />);
    expect(playAmbientSound).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Open music'));
    expect(playAmbientSound).not.toHaveBeenCalled();
  });

  it('stops narration before a deliberate sound choice', () => {
    render(<AmbientSoundSheet visible onClose={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Play Still Waters'));
    expect(mockStopNarration).toHaveBeenCalledTimes(1);
    expect(playAmbientSound).toHaveBeenCalledWith('river-thread');
  });

  it('pauses the selected track without starting another audio session', () => {
    useAmbientAudioState.setState({
      hasUsed: true,
      selectedTrackId: 'river-thread',
      status: 'playing',
    });
    render(<AmbientSoundSheet visible onClose={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Pause Still Waters'));
    expect(pauseAmbientSound).toHaveBeenCalledTimes(1);
    expect(playAmbientSound).not.toHaveBeenCalled();
  });

  it('keeps recording ownership when someone attempts playback', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    beginAmbientVoiceInterruption();
    render(<AmbientSoundSheet visible onClose={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Play Under Your Wings'));
    expect(alert).toHaveBeenCalledWith('Recording in progress', expect.any(String));
    expect(playAmbientSound).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('starts the chosen timer from the timer panel', () => {
    render(<AmbientSoundSheet visible onClose={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Timer. Off'));
    fireEvent.press(screen.getByLabelText('15 minutes'));
    fireEvent.press(screen.getByText('Start timer'));
    expect(setAmbientTimer).toHaveBeenCalledWith(15);
  });

  it('dismisses through the native sheet close path', async () => {
    const close = jest.fn();
    render(<AmbientSoundSheet visible onClose={close} />);
    fireEvent.press(screen.getByText('Done'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it('reserves the header timer slot before a countdown starts', () => {
    render(<AmbientMusicEntry />);
    expect(screen.getByTestId('ambient-timer-countdown-slot')).toHaveTextContent('30:00');
    expect(screen.getByLabelText('Set a timer')).toBeTruthy();
  });

  it('keeps a local volume draft until the slider settles', () => {
    render(<AmbientSoundSheet visible onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('ambient-volume-drag'));
    expect(previewAmbientVolume).toHaveBeenCalledWith(0.4);
    expect(setAmbientVolume).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('ambient-volume-commit'));
    expect(setAmbientVolume).toHaveBeenCalledWith(0.4);
  });

  it('restores the saved volume when a drag ends by closing the sheet', () => {
    const savedVolume = useAmbientAudioState.getState().volume;
    const { unmount } = render(<AmbientSoundSheet visible onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('ambient-volume-drag'));
    unmount();
    expect(previewAmbientVolume).toHaveBeenLastCalledWith(savedVolume);
    expect(setAmbientVolume).not.toHaveBeenCalled();
  });
});
