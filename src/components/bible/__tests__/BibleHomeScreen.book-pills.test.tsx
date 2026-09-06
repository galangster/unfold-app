import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { OT_BOOKS } from '@/lib/bible-constants';
import { bibleHubBookPillColumnCount, bibleHubBookPillWidthStyle } from '@/lib/bible-hub-book-pill-layout';

const renderer = require('react-test-renderer');
const { act } = renderer;

const mockBibleWindow = { width: 402, height: 874, scale: 3, fontScale: 1 };
const mockRouter = { push: jest.fn(), replace: jest.fn() };

jest.spyOn(require('react-native'), 'useWindowDimensions').mockImplementation(() => ({
  ...mockBibleWindow,
}));

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getBoolean: jest.fn(() => true),
    set: jest.fn(),
    getString: jest.fn(),
    delete: jest.fn(),
  })),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    FadeIn: { duration: () => ({ easing: () => undefined }) },
    FadeInDown: { duration: () => ({ easing: () => undefined }) },
    useReducedMotion: () => true,
    Easing: {
      out: jest.fn((value) => value),
      in: jest.fn((value) => value),
      inOut: jest.fn((value) => value),
      cubic: 'cubic',
    },
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      background: '#0B0A09',
      backgroundElevated: '#141210',
      text: '#F5F0EB',
      textSubtle: 'rgba(245,240,235,0.4)',
      textHint: 'rgba(245,240,235,0.25)',
      accent: '#C8A55C',
    },
    isDark: true,
  }),
}));

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: { getLastBiblePosition: () => null }) => unknown) =>
    selector({ getLastBiblePosition: () => null }),
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

jest.mock('@/components/icons', () =>
  new Proxy({}, { get: (_target, prop) => (typeof prop === 'string' ? prop : undefined) }),
);

jest.mock('@/constants/shadows', () => ({
  elevated: () => ({}),
}));

import BibleHomeScreen from '../../../app/(tabs)/(bible)/index';

const TRUNCATED_IN_AUDIT = [
  'Genesis',
  'Leviticus',
  'Deuteronomy',
  '1 Samuel',
  '2 Samuel',
  '1 Chronicles',
  '2 Chronicles',
  'Nehemiah',
];

function createHome() {
  let tree: { root: any; unmount: () => void };
  act(() => {
    tree = renderer.create(<BibleHomeScreen />);
  });
  return tree!;
}

function flatten(style: unknown) {
  return StyleSheet.flatten(style) as Record<string, unknown>;
}

describe('Bible hub category book pills', () => {
  beforeEach(() => {
    mockRouter.push.mockReset();
    mockRouter.replace.mockReset();
    mockBibleWindow.width = 402;
    mockBibleWindow.fontScale = 1;
  });

  it('renders complete book names without a line cap at 402pt default text', () => {
    const tree = createHome();
    expect(tree.root.findAllByType(Text).some((node: { props: { children?: unknown } }) => node.props.children === 'Law')).toBe(true);
    expect(tree.root.findAllByType(Text).some((node: { props: { children?: unknown } }) => node.props.children === 'History')).toBe(true);

    for (const name of TRUNCATED_IN_AUDIT) {
      const pill = tree.root.findByProps({ accessibilityLabel: name, accessibilityRole: 'button' });
      expect(pill.props.accessibilityState).toEqual({ selected: false });
      const label = pill.findAllByType(Text)[0];
      expect(label.props.children).toBe(name);
      expect(label.props.numberOfLines).toBeUndefined();
      expect(flatten(pill.props.style)).toEqual(expect.objectContaining(bibleHubBookPillWidthStyle(3)));
    }
  });

  it('widens pills at 320/375pt and through fontScale 3.0 so names stay complete', () => {
    const cases = [
      { width: 320, fontScale: 1 },
      { width: 375, fontScale: 1.18 },
      { width: 402, fontScale: 1.64 },
      { width: 320, fontScale: 3 },
      { width: 375, fontScale: 3 },
      { width: 402, fontScale: 3 },
    ];

    for (const { width, fontScale } of cases) {
      mockBibleWindow.width = width;
      mockBibleWindow.fontScale = fontScale;
      const tree = createHome();
      const expected = bibleHubBookPillWidthStyle(bibleHubBookPillColumnCount(width, fontScale));
      expect(expected.maxWidth === '48%').toBe(false);

      for (const name of TRUNCATED_IN_AUDIT) {
        const pill = tree.root.findByProps({ accessibilityLabel: name, accessibilityRole: 'button' });
        const label = pill.findAllByType(Text)[0];
        expect(label.props.children).toBe(name);
        expect(label.props.numberOfLines).toBeUndefined();
        expect(flatten(pill.props.style)).toEqual(expect.objectContaining(expected));
      }
      act(() => {
        tree.unmount();
      });
    }
  });

  it('opens the chapter picker for Genesis and routes Obadiah to chapter 1', () => {
    const tree = createHome();
    const genesis = tree.root.findByProps({ accessibilityLabel: 'Genesis', accessibilityRole: 'button' });
    act(() => {
      genesis.props.onPress();
    });
    expect(tree.root.findByProps({ accessibilityLabel: 'Genesis', accessibilityRole: 'button' }).props.accessibilityState).toEqual({
      selected: true,
    });
    expect(tree.root.findAllByType(Text).some((node: { props: { children?: unknown } }) => node.props.children === 'Genesis')).toBe(true);
    expect(mockRouter.push).not.toHaveBeenCalled();

    const obadiah = OT_BOOKS.find((book) => book.name === 'Obadiah');
    expect(obadiah?.chapterCount).toBe(1);
    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Obadiah', accessibilityRole: 'button' }).props.onPress();
    });
    expect(mockRouter.push).toHaveBeenCalledWith(`/(tabs)/(bible)/reader?bookId=${obadiah!.id}&chapter=1`);
  });
});
