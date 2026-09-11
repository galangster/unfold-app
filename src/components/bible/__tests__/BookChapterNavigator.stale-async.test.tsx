/**
 * Greptile A7 regression: two quick chapter taps resolve their verse-count
 * lookups in any order; only the latest tap may open the verse grid.
 */
import renderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { BookChapterNavigator } from '../BookChapterNavigator';

const mockGetChapterVerseCount = jest.fn();

jest.mock('@/lib/bible-db', () => ({
  getChapterVerseCount: (...args: unknown[]) => mockGetChapterVerseCount(...args),
}));

jest.mock('@/hooks/useBibleSearch', () => ({
  useBibleSearch: () => ({ query: '', setQuery: jest.fn(), results: [], isSearching: false }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ isDark: true, colors: new Proxy({}, { get: () => '#888888' }) }),
}));

jest.mock('@/components/ui', () => ({ alpha: (c: string) => c }));

jest.mock('@/components/icons', () => new Proxy({}, {
  get: (_target, name) => (name === '__esModule' ? true : () => null),
}));

function pressable(root: renderer.ReactTestInstance, accessibilityLabel: string) {
  return root.findAll(
    (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === accessibilityLabel,
  )[0];
}

function countVerseButtons(root: renderer.ReactTestInstance) {
  return root.findAll(
    (node) => node.type === TouchableOpacity && /^Verse \d+/.test(String(node.props.accessibilityLabel ?? '')),
  ).length;
}

describe('BookChapterNavigator chapter selection (Greptile A7)', () => {
  beforeEach(() => {
    mockGetChapterVerseCount.mockReset();
  });

  it('opens the verse grid for the last tapped chapter when lookups resolve out of order', async () => {
    const deferred = new Map<number, (count: number) => void>();
    mockGetChapterVerseCount.mockImplementation(
      (_book: number, chapter: number) => new Promise<number>((resolve) => { deferred.set(chapter, resolve); }),
    );

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <BookChapterNavigator visible currentBookId={43} currentChapter={1} translation="BSB" onSelect={jest.fn()} onClose={jest.fn()} />,
      );
    });
    await act(async () => {
      pressable(tree!.root, 'John, current book').props.onPress();
    });

    await act(async () => {
      void pressable(tree!.root, 'Chapter 2').props.onPress();
      void pressable(tree!.root, 'Chapter 3').props.onPress();
    });
    expect([...deferred.keys()]).toEqual([2, 3]);

    // Chapter 3 answers first, then the stale chapter 2 lookup lands.
    await act(async () => {
      deferred.get(3)!(36);
      await Promise.resolve();
    });
    await act(async () => {
      deferred.get(2)!(25);
      await Promise.resolve();
    });

    expect(pressable(tree!.root, 'Chapter 2')).toBeUndefined();
    expect(countVerseButtons(tree!.root)).toBe(36);
  });

  it('stays on the chapter grid when the verse-count lookup fails', async () => {
    mockGetChapterVerseCount.mockRejectedValue(new Error('db closed'));

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <BookChapterNavigator visible currentBookId={43} currentChapter={1} translation="BSB" onSelect={jest.fn()} onClose={jest.fn()} />,
      );
    });
    await act(async () => {
      pressable(tree!.root, 'John, current book').props.onPress();
    });
    await act(async () => {
      await pressable(tree!.root, 'Chapter 1, current chapter').props.onPress();
    });
    expect(pressable(tree!.root, 'Chapter 1, current chapter')).toBeDefined();
    expect(countVerseButtons(tree!.root)).toBe(0);
  });
});
