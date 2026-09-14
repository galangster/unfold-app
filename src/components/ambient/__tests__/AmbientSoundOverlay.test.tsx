import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AmbientSoundOverlay } from '../AmbientSoundOverlay';
import { FeatureAnnouncement } from '../FeatureAnnouncement';
import { canAnnounceFeatures, listPendingAnnouncementPages } from '@/lib/feature-announcements';
import {
  AMBIENT_AUDIO_INITIAL_STATE,
  useAmbientAudioState,
} from '@/lib/ambient-audio-state';
import { useAmbientSoundChrome } from '@/lib/ambient-sound-chrome';
import { setAmbientTimer } from '@/lib/ambient-audio';

jest.mock('expo-router', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/hooks/useAmbientSoundVisibility', () => ({
  useAmbientSoundVisibility: () => ({
    headerVisible: false,
    playerVisible: false,
    todayHome: false,
    inTabs: true,
    keyboardVisible: false,
    appActive: true,
    narrationActive: false,
  }),
}));
jest.mock('@/lib/ambient-audio-feature', () => ({
  isAmbientAudioEnabled: () => true,
}));
jest.mock('@/lib/ambient-audio', () => ({
  initializeAmbientAudio: () => () => undefined,
  interruptAmbientSound: jest.fn(),
  playAmbientSound: jest.fn(),
  setAmbientPlaybackGuard: jest.fn(),
  setAmbientTimer: jest.fn(),
  stopAmbientSound: jest.fn(),
}));
jest.mock('@/lib/ambient-audio-coordination', () => ({
  canStartAmbientPlayback: () => true,
  isAmbientVoiceActive: () => false,
  registerAmbientLifecycle: () => () => undefined,
  subscribeAmbientVoiceActivity: () => () => undefined,
}));
jest.mock('@/lib/feature-announcements', () => ({
  hasSeenAnnouncement: () => true,
  recordAnnouncement: jest.fn(),
  listPendingAnnouncementPages: jest.fn(() => []),
  canAnnounceFeatures: jest.fn(() => false),
  dismissAnnouncementPages: jest.fn(),
}));
jest.mock('@/hooks/usePremiumAccessPolicy', () => ({
  usePremiumAccessPolicy: () => 'denied',
}));
jest.mock('@/lib/qa-tools', () => ({ isQaToolsEnabled: () => false }));
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
jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: {
    getItem: () => null,
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('../AmbientSoundControls', () => ({
  AmbientMusicEntry: () => null,
  AmbientSoundSheet: () => null,
}));
jest.mock('../AmbientSoundPlayer', () => ({
  AmbientSoundPlayer: () => null,
}));
jest.mock('../FeatureAnnouncement', () => ({
  FeatureAnnouncement: jest.fn(() => null),
  MusicAnnouncement: () => null,
}));
jest.mock('@/components/icons', () => {
  const View = jest.requireActual<typeof import('react-native')>('react-native').View;
  return { XIcon: View };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 34, left: 0, right: 0 }),
}));

describe('ambient overlay timer notice', () => {
  beforeEach(() => {
    jest.mocked(listPendingAnnouncementPages).mockReturnValue([]);
    jest.mocked(canAnnounceFeatures).mockReturnValue(false);
    useAmbientAudioState.setState({
      ...AMBIENT_AUDIO_INITIAL_STATE,
      selectedTrackId: 'river-thread',
    });
    useAmbientSoundChrome.setState({
      sheet: null,
      returnFocusRef: null,
      todayReadingAvailable: false,
      playerDockHeight: 0,
    });
    (setAmbientTimer as jest.Mock).mockImplementation((minutes: number) => {
      if (minutes === 0) {
        useAmbientAudioState.setState({
          timerMinutes: 0,
          timerStatus: 'idle',
          remainingSeconds: 0,
          deadline: null,
        });
      }
    });
  });

  it('places the ended-timer notice in the bottom dock and clears reserved height', () => {
    useAmbientAudioState.setState({ timerStatus: 'ended' });
    render(<AmbientSoundOverlay />);

    expect(screen.getByTestId('ambient-bottom-dock')).toBeTruthy();
    const notice = screen.getByTestId('ambient-ended-timer-notice');
    expect(notice).toBeTruthy();

    fireEvent(notice, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 64 } },
    });
    expect(useAmbientSoundChrome.getState().playerDockHeight).toBe(64);

    fireEvent.press(screen.getByLabelText('Dismiss timer notice'));
    expect(setAmbientTimer).toHaveBeenCalledWith(0);
    expect(screen.queryByTestId('ambient-ended-timer-notice')).toBeNull();
    expect(useAmbientSoundChrome.getState().playerDockHeight).toBe(0);
  });

  it('does not reopen this visit when announcement history cannot persist', () => {
    jest.mocked(listPendingAnnouncementPages).mockReturnValue([
      { id: 'bookshelf-v1', kind: 'bookshelf', title: 'Bookshelf', body: 'Your readings.' },
    ]);
    jest.mocked(canAnnounceFeatures).mockImplementation((input) => input.pendingCount > 0);
    render(<AmbientSoundOverlay />);
    const current = () => jest.mocked(FeatureAnnouncement).mock.calls.at(-1)![0];
    expect(current().visible).toBe(true);
    act(() => current().onClose());
    expect(current().visible).toBe(false);
  });
});
