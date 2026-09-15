import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FeatureAnnouncement } from '../FeatureAnnouncement';
import {
  BOOKSHELF_LIBRARY_ANNOUNCEMENT_ID,
  COMPANION_ANNOUNCEMENT_ID,
  FEATURE_ANNOUNCEMENT_CATALOG,
  FEATURE_ANNOUNCEMENTS_KEY,
  REFLECTION_ANNOUNCEMENT_ID,
  hasSeenAnnouncement,
  listPendingAnnouncementPages,
} from '@/lib/feature-announcements';
import { MUSIC_ANNOUNCEMENT } from '@/lib/music-announcement';
import { acquireAudioSession } from '@/lib/audio-session-registry';
import { createAudioPlayer } from 'expo-audio';

const mockValues = new Map<string, string>();
const mockRelease = jest.fn();
const mockPause = jest.fn();
const mockRemove = jest.fn();
const mockPlay = jest.fn();

jest.mock('@/lib/mmkv-storage', () => ({
  mmkvStorage: {
    getItem: (name: string) => mockValues.get(name) ?? null,
    setItem: (name: string, value: string) => {
      mockValues.set(name, value);
    },
    removeItem: (name: string) => {
      mockValues.delete(name);
    },
  },
}));
jest.mock('../../../../assets/audio/previews/still-waters.m4a', () => 99, { virtual: true });
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({
    volume: 1,
    loop: false,
    currentTime: 0,
    play: mockPlay,
    pause: mockPause,
    remove: mockRemove,
    addListener: () => ({ remove: jest.fn() }),
  })),
}));
jest.mock('@/lib/audio-session-registry', () => ({
  acquireAudioSession: jest.fn(() => ({
    configure: jest.fn(async () => true),
    isActive: () => true,
    release: mockRelease,
  })),
  retryAudioAfterPermanentInterruption: jest.fn(),
}));
jest.mock('@/lib/ambient-audio', () => ({
  stopAmbientSound: jest.fn(),
}));
jest.mock('@/lib/ambient-audio-state', () => ({
  useAmbientAudioState: (select: (state: { timerStatus: string }) => unknown) =>
    select({ timerStatus: 'idle' }),
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
    },
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('react-native-reanimated', () => ({
  useReducedMotion: () => true,
}));
jest.mock('@/components/CompanionOrb', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { CompanionOrb: () => <View testID="companion-orb" /> };
});
jest.mock('@/components/icons', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { BooksIcon: View, PauseIcon: View, PlayIcon: View, XIcon: View };
});

const pages = FEATURE_ANNOUNCEMENT_CATALOG;

function renderAnnouncement(
  props?: Partial<React.ComponentProps<typeof FeatureAnnouncement>>,
) {
  const onClose = jest.fn();
  const onTry = jest.fn(() => true);
  const view = render(
    <FeatureAnnouncement
      visible
      pages={pages}
      actionLabel="Read with music"
      previewAllowed
      onClose={onClose}
      onTry={onTry}
      {...props}
    />,
  );
  return { onClose, onTry, ...view };
}

describe('feature announcement sequence', () => {
  beforeEach(() => {
    mockValues.clear();
    mockRelease.mockClear();
    mockPause.mockClear();
    mockRemove.mockClear();
    mockPlay.mockClear();
    (createAudioPlayer as jest.Mock).mockClear();
    (acquireAudioSession as jest.Mock).mockClear();
  });

  it('records a page as seen when it displays and advances with Next', () => {
    renderAnnouncement();
    expect(screen.getByLabelText('Page 1 of 4')).toBeTruthy();
    expect(screen.getByText('Your new bookshelf.')).toBeTruthy();
    expect(screen.getByText('Find your bookshelf in You, under Past Devotionals. Open a book, swipe its page into your reading, or share its cover.')).toBeTruthy();
    expect(hasSeenAnnouncement(BOOKSHELF_LIBRARY_ANNOUNCEMENT_ID)).toBe(true);
    expect(hasSeenAnnouncement(COMPANION_ANNOUNCEMENT_ID)).toBe(false);
    fireEvent.press(screen.getByLabelText('Next'));
    expect(screen.getByLabelText('Page 2 of 4')).toBeTruthy();
    expect(screen.getByText('Meet your Companion.')).toBeTruthy();
    expect(hasSeenAnnouncement(COMPANION_ANNOUNCEMENT_ID)).toBe(true);
    expect(hasSeenAnnouncement(MUSIC_ANNOUNCEMENT.id)).toBe(false);

    fireEvent.press(screen.getByLabelText('Next'));
    expect(screen.getByLabelText('Page 3 of 4')).toBeTruthy();
    expect(screen.getByText(MUSIC_ANNOUNCEMENT.title)).toBeTruthy();
    expect(hasSeenAnnouncement(MUSIC_ANNOUNCEMENT.id)).toBe(true);
  });

  it('finishes on Done without reopening skipped pages', () => {
    const { onClose } = renderAnnouncement();
    fireEvent.press(screen.getByLabelText('Next'));
    fireEvent.press(screen.getByLabelText('Next'));
    fireEvent.press(screen.getByLabelText('Next'));
    expect(screen.getByText('Move through your reflections.')).toBeTruthy();
    expect(screen.getByText('Use Previous and Next above the keyboard to move between questions. Your draft stays with you as you go.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Done'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hasSeenAnnouncement(REFLECTION_ANNOUNCEMENT_ID)).toBe(true);
    expect(listPendingAnnouncementPages({
      bookshelf: true,
      companion: true,
      music: true,
      reflection: true,
    })).toEqual([]);
  });

  it('dismisses remaining pages when the sequence closes', () => {
    const { onClose } = renderAnnouncement();
    fireEvent.press(screen.getByLabelText('Close announcement'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hasSeenAnnouncement(COMPANION_ANNOUNCEMENT_ID)).toBe(true);
    expect(hasSeenAnnouncement(MUSIC_ANNOUNCEMENT.id)).toBe(true);
    expect(hasSeenAnnouncement(REFLECTION_ANNOUNCEMENT_ID)).toBe(true);
    const stored = JSON.parse(mockValues.get(FEATURE_ANNOUNCEMENTS_KEY) ?? '{}');
    expect(stored[MUSIC_ANNOUNCEMENT.id].status).toBe('dismissed');
    expect(stored[REFLECTION_ANNOUNCEMENT_ID].status).toBe('dismissed');
  });

  it('stops and releases preview audio when leaving the music page', async () => {
    renderAnnouncement({
      pages: pages.filter((page) => page.kind === 'music' || page.kind === 'reflection'),
    });
    fireEvent.press(screen.getByLabelText('Play music preview'));
    await waitFor(() => expect(createAudioPlayer).toHaveBeenCalled());
    expect(acquireAudioSession).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Next'));
    expect(mockPause).toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalled();
    expect(screen.getByText('Move through your reflections.')).toBeTruthy();
    expect(screen.queryByLabelText('Play music preview')).toBeNull();
  });

  it('stops preview when permission is lost and never autoplays', async () => {
    const musicPages = pages.filter((page) => page.kind === 'music');
    const onClose = jest.fn();
    const view = render(
      <FeatureAnnouncement
        visible
        pages={musicPages}
        actionLabel="Read with music"
        previewAllowed
        onClose={onClose}
        onTry={jest.fn(() => true)}
      />,
    );
    fireEvent.press(screen.getByLabelText('Play music preview'));
    await waitFor(() => expect(createAudioPlayer).toHaveBeenCalled());
    view.rerender(
      <FeatureAnnouncement
        visible
        pages={musicPages}
        actionLabel="Read with music"
        previewAllowed={false}
        onClose={onClose}
        onTry={jest.fn(() => true)}
      />,
    );
    expect(mockPause).toHaveBeenCalled();
    expect(mockRemove).toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalled();
    view.rerender(
      <FeatureAnnouncement
        visible
        pages={musicPages}
        actionLabel="Read with music"
        previewAllowed={false}
        onClose={onClose}
        onTry={jest.fn(() => true)}
      />,
    );
    expect(createAudioPlayer).toHaveBeenCalledTimes(1);
  });

  it('lets Try music finish the remaining sequence', () => {
    const { onClose, onTry } = renderAnnouncement({
      pages: pages.filter((page) => page.kind === 'music' || page.kind === 'reflection'),
    });
    fireEvent.press(screen.getByText('Read with music'));
    expect(onTry).toHaveBeenCalledWith(MUSIC_ANNOUNCEMENT.songId);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hasSeenAnnouncement(REFLECTION_ANNOUNCEMENT_ID)).toBe(true);
  });
});
