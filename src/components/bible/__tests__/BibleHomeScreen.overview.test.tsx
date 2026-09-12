jest.mock('@/components/ProfileEntryButton', () => ({ ProfileEntryButton: () => null }));

import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { StyleSheet, Text } from 'react-native';
import { DarkColors, LightColors } from '@/constants/colors';
import { BIBLE_BOOKS, CATEGORY_LABELS, getBookCategory } from '@/lib/bible-constants';
import {
  BIBLE_HUB_INK_BLACK,
  BIBLE_HUB_INK_WHITE,
  BIBLE_HUB_MIN_TEXT_CONTRAST,
  bibleHubBookChrome,
  bibleHubCategoryText,
  bibleHubContrastInk,
  contrastRatio,
} from '@/lib/bible-hub-category-palette';
import {
  BIBLE_HUB_OVERVIEW_TILE_BORDER,
  BIBLE_HUB_OVERVIEW_TILE_PADDING_X,
  bibleHubBookAccessibilityHint,
  bibleHubOverviewMetrics,
} from '@/lib/bible-hub-overview-layout';
import { BIBLE_HUB_VIEW_STORAGE_KEY } from '@/lib/bible-hub-view-preference';
import BibleHomeScreen from '../../../app/(tabs)/(bible)/index';

const renderer = jest.requireActual('react-test-renderer');
const { act } = renderer;

const mockBibleWindow = { width: 402, height: 874, scale: 3, fontScale: 1 };
const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockThemeState = { isDark: true, accent: DarkColors.accent };
const mockBibleDbState = { isReady: true };
const mockStoreState = {
  lastPosition: null as { bookId: number; chapter: number; bookName: string; verse?: number } | null,
};

jest.spyOn(jest.requireActual('react-native'), 'useWindowDimensions').mockImplementation(() => ({
  ...mockBibleWindow,
}));

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@react-native-segmented-control/segmented-control', () => {
  const ReactActual = jest.requireActual('react');
  const { Text, TouchableOpacity, View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: {
      values: string[];
      selectedIndex?: number;
      onValueChange?: (value: string) => void;
      style?: unknown;
      fontStyle?: { fontSize?: number; color?: string };
      activeFontStyle?: { fontSize?: number; color?: string };
      tintColor?: string;
    }) =>
      ReactActual.createElement(
        View,
        {
          style: props.style,
          testID: 'bible-hub-view-control',
          tintColor: props.tintColor,
          fontStyle: props.fontStyle,
          activeFontStyle: props.activeFontStyle,
        },
        props.values.map((value: string, index: number) =>
          ReactActual.createElement(
            TouchableOpacity,
            {
              key: value,
              accessibilityRole: 'button',
              accessibilityLabel: value,
              accessibilityState: { selected: props.selectedIndex === index },
              onPress: () => props.onValueChange?.(value),
            },
            ReactActual.createElement(
              Text,
              {
                style: [
                  { fontSize: props.fontStyle?.fontSize, color: props.fontStyle?.color },
                  props.selectedIndex === index
                    ? { fontSize: props.activeFontStyle?.fontSize, color: props.activeFontStyle?.color }
                    : null,
                ],
              },
              value,
            ),
          ),
        ),
      ),
  };
});

jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string | boolean>();
  (globalThis as typeof globalThis & { __bibleHomeMeta: Map<string, string | boolean> }).__bibleHomeMeta = store;
  return {
    MMKV: jest.fn().mockImplementation(() => ({
      getBoolean: (key: string) => {
        const value = store.get(key);
        return typeof value === 'boolean' ? value : true;
      },
      getString: (key: string) => {
        const value = store.get(key);
        return typeof value === 'string' ? value : undefined;
      },
      set: (key: string, value: string | boolean) => {
        store.set(key, value);
      },
      delete: (key: string) => {
        store.delete(key);
      },
    })),
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
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
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

jest.mock('@/lib/theme', () => {
  const { DarkColors: dark, LightColors: light } = jest.requireActual('@/constants/colors');
  return {
    useTheme: () => {
      const base = mockThemeState.isDark ? dark : light;
      return {
        colors: { ...base, accent: mockThemeState.accent },
        isDark: mockThemeState.isDark,
      };
    },
  };
});

jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: { bibleReadingHistory: NonNullable<typeof mockStoreState.lastPosition>[] }) => unknown) =>
    selector({ bibleReadingHistory: mockStoreState.lastPosition ? [mockStoreState.lastPosition] : [] }),
}));

jest.mock('@/hooks/useBibleDb', () => ({
  useBibleDb: () => ({
    isReady: mockBibleDbState.isReady,
    isDownloading: false,
    progress: null,
    download: jest.fn(),
    error: null,
  }),
}));

jest.mock('@/components/bible/DownloadBibleSheet', () => ({
  DownloadBibleSheet: () => {
    const { Text } = jest.requireActual('react-native');
    return <Text>Download the Bible</Text>;
  },
}));

jest.mock('@/components/ui', () => ({
  alpha: jest.requireActual('@/components/ui/utils/alpha').alpha,
  Sheet: () => null,
}));

jest.mock('@/components/icons', () =>
  new Proxy({}, { get: (_target, prop) => (typeof prop === 'string' ? prop : undefined) }),
);

jest.mock('@/constants/shadows', () => ({
  elevated: () => ({}),
}));

function bibleHomeMeta() {
  return (globalThis as typeof globalThis & { __bibleHomeMeta: Map<string, string | boolean> }).__bibleHomeMeta;
}

function createHome() {
  let tree: { root: any; unmount: () => void; update: (element: React.ReactElement) => void };
  act(() => {
    tree = renderer.create(<BibleHomeScreen />);
  });
  return tree!;
}

function flatten(style: unknown) {
  return StyleSheet.flatten(style) as Record<string, unknown>;
}

const BOOK_NAMES = new Set(BIBLE_BOOKS.map((book) => book.name));

function bookTarget(tree: { root: any }, name: string) {
  return tree.root.findByProps({ accessibilityLabel: name, accessibilityRole: 'button' });
}

function renderedBookNames(tree: { root: any }): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const node of tree.root.findAll((candidate: { props?: { accessibilityRole?: string; accessibilityLabel?: string; onPress?: unknown } }) => (
    candidate.props?.accessibilityRole === 'button'
    && typeof candidate.props.onPress === 'function'
    && typeof candidate.props.accessibilityLabel === 'string'
    && BOOK_NAMES.has(candidate.props.accessibilityLabel)
  ))) {
    const name = node.props.accessibilityLabel as string;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function accentThemeFills(): { id: string; fill: string; mode: 'dark' | 'light' }[] {
  const source = fs.readFileSync(path.join(__dirname, '../../../lib/store.ts'), 'utf8');
  const block = source.slice(
    source.indexOf('export const ACCENT_THEMES'),
    source.indexOf('export const READING_FONTS'),
  );
  return [...block.matchAll(/\{ id: '([^']+)', name: '[^']+', dark: '(#[0-9A-Fa-f]{6})', light: '(#[0-9A-Fa-f]{6})' \}/g)]
    .flatMap((match) => [
      { id: match[1], fill: match[2], mode: 'dark' as const },
      { id: match[1], fill: match[3], mode: 'light' as const },
    ]);
}

function selectView(tree: { root: any }, label: 'Grid' | 'Names') {
  act(() => {
    tree.root.findByProps({ accessibilityLabel: label, accessibilityRole: 'button' }).props.onPress();
  });
}

describe('Bible hub overview restoration', () => {
  beforeEach(() => {
    mockRouter.push.mockReset();
    mockRouter.replace.mockReset();
    mockBibleWindow.width = 402;
    mockBibleWindow.fontScale = 1;
    mockThemeState.isDark = true;
    mockThemeState.accent = DarkColors.accent;
    mockBibleDbState.isReady = true;
    mockStoreState.lastPosition = null;
    bibleHomeMeta().clear();
  });

  it('renders all 66 canonical targets in Grid by default with full accessible names', () => {
    const tree = createHome();
    const names = renderedBookNames(tree);
    expect(names).toEqual(BIBLE_BOOKS.map((book) => book.name));
    expect(names).toHaveLength(66);
    expect(tree.root.findByProps({ accessibilityLabel: 'Grid' }).props.accessibilityState.selected).toBe(true);
    expect(tree.root.findByProps({ accessibilityLabel: 'Names' }).props.accessibilityState.selected).toBe(false);

    for (const book of BIBLE_BOOKS) {
      const pill = bookTarget(tree, book.name);
      const label = pill.findAllByType(Text)[0];
      expect(label.props.children).toBe(book.abbreviation);
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.maxFontSizeMultiplier).toBe(0);
      expect(pill.props.accessibilityHint).toBe(bibleHubBookAccessibilityHint(book));
      expect(pill.props.accessibilityState).toEqual({ selected: false });
      const style = flatten(pill.props.style);
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
      expect(style.flexGrow).toBe(0);
    }

    expect(tree.root.findAllByType(Text).some((node: { props: { children?: unknown } }) => node.props.children === '1Thess')).toBe(true);
    expect(bibleHomeMeta().get(BIBLE_HUB_VIEW_STORAGE_KEY)).toBeUndefined();
  });

  it('keeps category groups and full names in Names, then persists that choice across remount', () => {
    const tree = createHome();
    selectView(tree, 'Names');
    expect(bibleHomeMeta().get(BIBLE_HUB_VIEW_STORAGE_KEY)).toBe('names');
    expect(renderedBookNames(tree)).toEqual(BIBLE_BOOKS.map((book) => book.name));
    expect(tree.root.findAllByType(Text).some((node: { props: { children?: unknown } }) => node.props.children === 'Law')).toBe(true);
    expect(tree.root.findAllByType(Text).some((node: { props: { children?: unknown } }) => node.props.children === CATEGORY_LABELS.paulineEpistles)).toBe(true);

    const genesis = bookTarget(tree, 'Genesis');
    expect(genesis.findAllByType(Text)[0].props.children).toBe('Genesis');
    expect(genesis.findAllByType(Text)[0].props.numberOfLines).toBeUndefined();
    expect(flatten(genesis.props.style).minHeight).toBeGreaterThanOrEqual(44);

    act(() => {
      tree.unmount();
    });
    const remounted = createHome();
    expect(bookTarget(remounted, 'Genesis').findAllByType(Text)[0].props.children).toBe('Genesis');
    expect(remounted.root.findByProps({ accessibilityLabel: 'Names' }).props.accessibilityState.selected).toBe(true);
    expect(renderedBookNames(remounted)).toEqual(BIBLE_BOOKS.map((book) => book.name));

    selectView(remounted, 'Grid');
    expect(bibleHomeMeta().get(BIBLE_HUB_VIEW_STORAGE_KEY)).toBe('grid');
    expect(bookTarget(remounted, 'Genesis').findAllByType(Text)[0].props.children).toBe('Gen');
    expect(renderedBookNames(remounted)).toEqual(BIBLE_BOOKS.map((book) => book.name));
    act(() => {
      remounted.unmount();
    });
    const gridAgain = createHome();
    expect(gridAgain.root.findByProps({ accessibilityLabel: 'Grid' }).props.accessibilityState.selected).toBe(true);
    expect(bookTarget(gridAgain, 'Genesis').findAllByType(Text)[0].props.children).toBe('Gen');
    expect(renderedBookNames(gridAgain)).toEqual(BIBLE_BOOKS.map((book) => book.name));
  });

  it('treats an invalid saved preference as Grid and does not rewrite it on mount', () => {
    bibleHomeMeta().set(BIBLE_HUB_VIEW_STORAGE_KEY, 'cards');
    const tree = createHome();
    expect(bookTarget(tree, 'Genesis').findAllByType(Text)[0].props.children).toBe('Gen');
    expect(bibleHomeMeta().get(BIBLE_HUB_VIEW_STORAGE_KEY)).toBe('cards');
    selectView(tree, 'Grid');
    expect(bibleHomeMeta().get(BIBLE_HUB_VIEW_STORAGE_KEY)).toBe('cards');
  });

  it('applies theme category colors and selected accent chrome in both views', () => {
    const tree = createHome();
    const genesis = bookTarget(tree, 'Genesis');
    const acts = bookTarget(tree, 'Acts');
    const expectedGenesis = bibleHubBookChrome({
      category: getBookCategory(1),
      isDark: true,
      isSelected: false,
      background: DarkColors.background,
      accent: DarkColors.accent,
      text: DarkColors.text,
    });
    const expectedActs = bibleHubBookChrome({
      category: getBookCategory(44),
      isDark: true,
      isSelected: false,
      background: DarkColors.background,
      accent: DarkColors.accent,
      text: DarkColors.text,
    });
    expect(flatten(genesis.props.style).backgroundColor).toBe(expectedGenesis.backgroundColor);
    expect(flatten(genesis.findAllByType(Text)[0].props.style).color).toBe(expectedGenesis.color);
    expect(flatten(acts.findAllByType(Text)[0].props.style).color).toBe(expectedActs.color);
    expect(expectedGenesis.color).toBe(bibleHubCategoryText('pentateuch', true));
    expect(expectedActs.color).toBe(bibleHubCategoryText('acts', true));

    act(() => {
      genesis.props.onPress();
    });
    const selected = bookTarget(tree, 'Genesis');
    expect(selected.props.accessibilityState).toEqual({ selected: true });
    expect(flatten(selected.props.style).borderColor).toBe(DarkColors.accent);
    expect(flatten(selected.findAllByType(Text)[0].props.style).color).toBe(DarkColors.accent);

    act(() => {
      tree.unmount();
    });

    mockThemeState.isDark = false;
    const lightNames = createHome();
    selectView(lightNames, 'Names');
    const lightGenesis = bookTarget(lightNames, 'Genesis');
    expect(flatten(lightGenesis.findAllByType(Text)[0].props.style).color).toBe(
      bibleHubCategoryText('pentateuch', false),
    );
    expect(flatten(lightGenesis.props.style).minHeight).toBeGreaterThanOrEqual(44);
  });

  it('uses contrast-checked black or white ink on the native selected title for every accent', () => {
    const fills = accentThemeFills();
    expect(fills).toHaveLength(14);

    for (const { fill, mode } of fills) {
      mockThemeState.isDark = mode === 'dark';
      mockThemeState.accent = fill;
      const tree = createHome();
      const control = tree.root.findByProps({ testID: 'bible-hub-view-control' });
      expect(control.props.tintColor).toBe(fill);
      expect(control.props.activeFontStyle.color).toBe(bibleHubContrastInk(fill));
      expect([BIBLE_HUB_INK_BLACK, BIBLE_HUB_INK_WHITE]).toContain(control.props.activeFontStyle.color);
      const otherInk = control.props.activeFontStyle.color === BIBLE_HUB_INK_BLACK
        ? BIBLE_HUB_INK_WHITE
        : BIBLE_HUB_INK_BLACK;
      expect(contrastRatio(control.props.activeFontStyle.color, control.props.tintColor)).toBeGreaterThanOrEqual(
        BIBLE_HUB_MIN_TEXT_CONTRAST,
      );
      expect(contrastRatio(control.props.activeFontStyle.color, fill)).toBeGreaterThanOrEqual(
        contrastRatio(otherInk, fill),
      );
      const selectedTitle = tree.root.findByProps({ accessibilityLabel: 'Grid' }).findAllByType(Text)[0];
      expect(StyleSheet.flatten(selectedTitle.props.style).color).toBe(control.props.activeFontStyle.color);
      act(() => {
        tree.unmount();
      });
    }
  });

  it('uses light-theme ink for selected text so accent fills stay at 4.5:1', () => {
    mockThemeState.isDark = false;
    mockThemeState.accent = LightColors.accent;
    const tree = createHome();
    act(() => {
      bookTarget(tree, 'Genesis').props.onPress();
    });
    const selected = bookTarget(tree, 'Genesis');
    const chrome = bibleHubBookChrome({
      category: getBookCategory(1),
      isDark: false,
      isSelected: true,
      background: LightColors.background,
      accent: LightColors.accent,
      text: LightColors.text,
    });
    expect(flatten(selected.findAllByType(Text)[0].props.style).color).toBe(LightColors.text);
    expect(flatten(selected.props.style).backgroundColor).toBe(chrome.backgroundColor);
    expect(flatten(selected.props.style).borderColor).toBe(LightColors.accent);
  });

  it('opens Genesis chapters and routes one-chapter Obadiah in both views', () => {
    for (const view of ['Grid', 'Names'] as const) {
      mockRouter.push.mockReset();
      const tree = createHome();
      if (view === 'Names') selectView(tree, 'Names');

      act(() => {
        bookTarget(tree, 'Genesis').props.onPress();
      });
      expect(bookTarget(tree, 'Genesis').props.accessibilityState).toEqual({ selected: true });
      expect(mockRouter.push).not.toHaveBeenCalled();
      act(() => {
        tree.root.findByProps({ accessibilityLabel: 'Chapter 3', accessibilityRole: 'button' }).props.onPress();
      });
      expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/(bible)/reader?bookId=1&chapter=3&verse=1');

      act(() => {
        bookTarget(tree, 'Obadiah').props.onPress();
      });
      expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/(bible)/reader?bookId=31&chapter=1&verse=1');
      act(() => {
        tree.unmount();
      });
    }
  });

  it('routes search and continue reading from the hub', () => {
    mockStoreState.lastPosition = { bookId: 43, chapter: 3, bookName: 'John', verse: 16 };
    const tree = createHome();
    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Search the Bible' }).props.onPress();
    });
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/(bible)/search');
    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Continue reading John 3' }).props.onPress();
    });
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/(bible)/reader?bookId=43&chapter=3&verse=16');
  });

  it('updates the continue route when reading history changes while the hub is mounted', () => {
    mockStoreState.lastPosition = { bookId: 43, chapter: 3, bookName: 'John', verse: 2 };
    const tree = createHome();

    mockStoreState.lastPosition = { bookId: 24, chapter: 16, bookName: 'Jeremiah', verse: 18 };
    act(() => {
      tree.update(<BibleHomeScreen />);
    });
    act(() => {
      tree.root.findByProps({ accessibilityLabel: 'Continue reading Jeremiah 16' }).props.onPress();
    });

    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/(bible)/reader?bookId=24&chapter=16&verse=18');
  });

  it('keeps first-open reader redirect and the download sheet off the book grid', () => {
    bibleHomeMeta().set('hasSeenBibleHome', false);
    const firstOpen = createHome();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/(bible)/reader?bookId=1&chapter=1&verse=1');
    expect(firstOpen.root.findAllByProps({ accessibilityLabel: 'Genesis' })).toHaveLength(0);
    act(() => {
      firstOpen.unmount();
    });

    mockRouter.replace.mockReset();
    bibleHomeMeta().clear();
    mockBibleDbState.isReady = false;
    const downloading = createHome();
    expect(downloading.root.findAllByType(Text).some((node: { props: { children?: unknown } }) => node.props.children === 'Download the Bible')).toBe(true);
    expect(downloading.root.findAllByProps({ accessibilityLabel: 'Genesis' })).toHaveLength(0);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('computes compact tiles from width, padding, 6pt gaps, and fontScale', () => {
    const cases = [
      { width: 320, fontScale: 1 },
      { width: 375, fontScale: 1.18 },
      { width: 402, fontScale: 1.64 },
      { width: 768, fontScale: 3 },
    ];

    for (const { width, fontScale } of cases) {
      mockBibleWindow.width = width;
      mockBibleWindow.fontScale = fontScale;
      const tree = createHome();
      const expected = bibleHubOverviewMetrics(width, fontScale);
      const tile = flatten(bookTarget(tree, 'Genesis').props.style);
      expect(tile.width).toBe(expected.tileWidth);
      expect(tile.paddingHorizontal).toBe(BIBLE_HUB_OVERVIEW_TILE_PADDING_X);
      expect(tile.borderWidth).toBe(BIBLE_HUB_OVERVIEW_TILE_BORDER);
      expect(tile.minHeight).toBe(expected.minTileHeight);
      expect(tile.minWidth).toBeGreaterThanOrEqual(44);
      expect(tile.minHeight).toBeGreaterThanOrEqual(44);
      expect(flatten(tree.root.findByProps({ accessibilityLabel: 'Grid' }).findAllByType(Text)[0].props.style).fontSize).toBe(
        Math.round(13 * fontScale),
      );
      expect(flatten(tree.root.findByProps({ testID: 'bible-hub-view-control' }).props.style).height).toBeGreaterThanOrEqual(44);
      expect(flatten(tree.root.findByProps({ testID: 'bible-hub-view-control' }).props.style).minHeight).toBe(44);
      act(() => {
        tree.unmount();
      });
    }
  });
});
