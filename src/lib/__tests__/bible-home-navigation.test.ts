/**
 * The Bible tab used to router.replace() into the reader on every mount,
 * so the book grid and search bar (search.tsx) were never reachable. This
 * tests the pure decision of what the tab should do on mount: navigate vs.
 * show the home screen.
 */
import { resolveBibleHomeNavigation } from '../../app/(tabs)/(bible)/index';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getBoolean: jest.fn(() => false),
    set: jest.fn(),
    getString: jest.fn(),
    delete: jest.fn(),
  })),
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View' },
  FadeIn: { duration: () => ({ easing: () => undefined }) },
  FadeInDown: { duration: () => ({ easing: () => undefined }) },
  useReducedMotion: () => true,
  Easing: {
    out: jest.fn((value) => value),
    in: jest.fn((value) => value),
    inOut: jest.fn((value) => value),
    cubic: 'cubic',
  },
}));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ colors: {}, isDark: false }),
}));
jest.mock('@/lib/store', () => ({
  useUnfoldStore: () => () => null,
}));
jest.mock('@/hooks/useBibleDb', () => ({
  useBibleDb: () => ({
    isReady: true,
    isDownloading: false,
    progress: null,
    download: jest.fn(),
    error: null,
  }),
}));
jest.mock('@/components/bible/DownloadBibleSheet', () => ({
  DownloadBibleSheet: () => null,
}));
jest.mock('@/components/ui', () => ({
  alpha: (color: string) => color,
  Sheet: () => null,
}));
jest.mock('@/components/icons', () => ({
  MagnifyingGlassIcon: () => null,
  ClockIcon: () => null,
  CaretRightIcon: () => null,
  XIcon: () => null,
}));

describe('resolveBibleHomeNavigation', () => {
  it('navigates to the saved position on the very first ever open', () => {
    expect(
      resolveBibleHomeNavigation({
        hasSeenHome: false,
        lastPosition: { bookId: 43, chapter: 3 },
      }),
    ).toEqual({ action: 'navigate', bookId: 43, chapter: 3 });
  });

  it('navigates to Genesis 1 on the very first ever open with no saved position', () => {
    expect(
      resolveBibleHomeNavigation({ hasSeenHome: false, lastPosition: null }),
    ).toEqual({ action: 'navigate', bookId: 1, chapter: 1 });
  });

  it('navigates straight to reading for a returning user with a saved position', () => {
    expect(
      resolveBibleHomeNavigation({
        hasSeenHome: true,
        lastPosition: { bookId: 19, chapter: 23 },
      }),
    ).toEqual({ action: 'navigate', bookId: 19, chapter: 23 });
  });

  it('shows the home screen for a returning user with no saved position', () => {
    expect(
      resolveBibleHomeNavigation({ hasSeenHome: true, lastPosition: null }),
    ).toEqual({ action: 'show-home' });
  });
});
