import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { HomeOnboardingTooltips } from '../HomeOnboardingTooltips';
import { listPendingAnnouncementPages } from '@/lib/feature-announcements';
import { useUnfoldStore, type UserProfile } from '@/lib/store';

const mockValues = new Map<string, string>();

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
jest.mock('@/lib/store', () => {
  const { create } = jest.requireActual('zustand');
  return {
    useUnfoldStore: create((set: (patch: Record<string, unknown>) => void) => ({
      hasSeenHomeTooltips: false,
      setHasSeenHomeTooltips: (seen: boolean) => set({ hasSeenHomeTooltips: seen }),
      user: null,
      companionName: null,
    })),
  };
});
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: true,
    colors: {
      text: '#f5f0eb',
      textMuted: '#aaa',
      textSubtle: '#888',
      accent: '#c8a55c',
      background: '#0a0a0a',
      backgroundElevated: '#141210',
      border: '#333',
    },
  }),
}));
jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Svg: 'Svg',
  Defs: 'Defs',
  Mask: 'Mask',
  Path: 'Path',
  Rect: 'Rect',
}));
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const transition = { duration: () => transition, delay: () => transition, easing: () => transition };
  const curve = () => undefined;
  return {
    __esModule: true,
    default: { View },
    Easing: { cubic: undefined, in: curve, inOut: curve, out: curve },
    FadeIn: transition,
    FadeOut: transition,
    useReducedMotion: () => true,
  };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

const allAvailable = { bookshelf: true, companion: true, music: true, reflection: true };

describe('HomeOnboardingTooltips', () => {
  beforeEach(() => {
    mockValues.clear();
    useUnfoldStore.setState({ hasSeenHomeTooltips: false, user: null, companionName: null });
  });

  it("settles this version's what's new when a new reader finishes the tour", () => {
    render(<HomeOnboardingTooltips />);
    expect(listPendingAnnouncementPages(allAvailable)).toHaveLength(4);

    fireEvent.press(screen.getByLabelText('Got it'));

    expect(useUnfoldStore.getState().hasSeenHomeTooltips).toBe(true);
    expect(listPendingAnnouncementPages(allAvailable)).toEqual([]);
  });

  it('names the Companion tab with the saved name', () => {
    useUnfoldStore.setState({ user: { companionName: 'Selah' } as UserProfile });
    render(<HomeOnboardingTooltips />);

    expect(screen.getByText(/Devotional, Bible, Selah, and Journal/)).toBeTruthy();
  });

  it('says Companion when no name is saved', () => {
    useUnfoldStore.setState({ user: { companionName: '' } as UserProfile, companionName: null });
    render(<HomeOnboardingTooltips />);

    expect(screen.getByText(/Devotional, Bible, Companion, and Journal/)).toBeTruthy();
  });
});
