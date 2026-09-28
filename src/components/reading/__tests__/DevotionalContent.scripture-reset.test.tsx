/**
 * Greptile A8 regression: when the day's scripture reference changes, the
 * previous passage must not keep rendering under the new reference while
 * (or after, if it fails) the new fetch runs.
 */
import renderer, { act } from 'react-test-renderer';
import { DevotionalContent } from '../DevotionalContent';

const mockFetchVerseLocal = jest.fn();
const mockFetchVerse = jest.fn();
const mockDevotionalWebView = jest.fn((_props: unknown) => null);
const mockInlineReflectionJournal = jest.fn((_props: unknown) => null);

jest.mock('@/lib/bible-api', () => ({
  fetchVerse: (...args: unknown[]) => mockFetchVerse(...args),
  fetchVerseLocal: (...args: unknown[]) => mockFetchVerseLocal(...args),
}));

jest.mock('@/lib/store', () => ({
  FONT_SIZE_VALUES: { medium: { scripture: 18, body: 17, title: 28 } },
  useUnfoldStore: (selector: (state: unknown) => unknown) =>
    selector({ bibleReaderSettings: { translation: 'BSB' }, user: {} }),
}));

jest.mock('@/lib/useReadingFont', () => ({
  useReadingFont: () => ({ body: 'Body', bodyItalic: 'BodyItalic', display: 'Display', displayItalic: 'DisplayItalic' }),
}));
jest.mock('@/lib/reflection-typography', () => ({
  getReflectionTypography: () => ({ fontSize: 17, lineHeight: 26 }),
}));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ isDark: true, colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/components/icons', () => new Proxy({}, {
  get: (_target, name) => (name === '__esModule' ? true : () => null),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { out: () => 'out', in: () => 'in', inOut: () => 'inOut', cubic: 'cubic' },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => false,
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (v: unknown) => v,
    withDelay: (_d: number, a: unknown) => a,
    withSpring: (v: unknown) => v,
  };
});
jest.mock('../ScriptureVerseBlock', () => {
  const { Text } = require('react-native');
  return {
    ScriptureVerseBlock: ({ passage }: { passage: Array<{ text: string }> }) => (
      <Text testID="versed-scripture">{passage.map((v) => v.text).join(' ')}</Text>
    ),
  };
});
jest.mock('../DevotionalWebView', () => ({
  DevotionalWebView: (props: unknown) => mockDevotionalWebView(props),
}));
jest.mock('../InlineReflectionJournal', () => ({
  InlineReflectionJournal: (props: unknown) => mockInlineReflectionJournal(props),
}));

function collectText(node: any): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!node || typeof node !== 'object') return [];
  return collectText(node.children ?? []);
}

function day(overrides: Record<string, unknown>) {
  return {
    id: 'day-1',
    dayNumber: 1,
    title: 'Day',
    scriptureReference: 'John 3:16',
    scriptureText: 'AIFALLBACK',
    reflection: '',
    prayer: '',
    isRead: false,
    ...overrides,
  } as never;
}

describe('DevotionalContent versed scripture (Greptile A8)', () => {
  beforeEach(() => {
    mockFetchVerseLocal.mockReset();
    mockFetchVerse.mockReset();
    mockDevotionalWebView.mockClear();
    mockInlineReflectionJournal.mockClear();
  });

  it('drops the previous passage when the reference changes and the new fetch fails', async () => {
    mockFetchVerseLocal.mockImplementation(async (reference: string) => {
      if (reference === 'John 3:16') {
        return { reference, translation: 'BSB', text: 'OLDPASSAGE', passage: [{ verse: 16, text: 'OLDPASSAGE' }] };
      }
      throw new Error('db closed');
    });

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<DevotionalContent day={day({})} fontSize="medium" />);
      await Promise.resolve();
    });
    expect(collectText(tree!.toJSON()).join(' ')).toContain('OLDPASSAGE');

    await act(async () => {
      tree!.update(<DevotionalContent day={day({ scriptureReference: 'Psalm 23:1', scriptureText: 'NEWAITEXT' })} fontSize="medium" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = collectText(tree!.toJSON()).join(' ');
    expect(text).not.toContain('OLDPASSAGE');
    expect(text).toContain('NEWAITEXT');
  });

  it('passes the displayed passage text and translation to the Scripture bookmark control', async () => {
    mockFetchVerseLocal.mockResolvedValue({
      reference: 'John 3:16',
      translation: 'BSB',
      text: 'For God so loved the displayed world.',
      passage: [{ verse: 16, text: 'For God so loved the displayed world.' }],
    });
    const onToggleBookmark = jest.fn();

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DevotionalContent
          day={day({ scriptureText: 'Generated fallback text' })}
          fontSize="medium"
          onToggleBookmark={onToggleBookmark}
        />,
      );
      await Promise.resolve();
    });

    const bookmarkControl = tree!.root.findByProps({ accessibilityLabel: 'Save John 3:16' });
    expect(bookmarkControl.props.accessibilityState).toEqual({ selected: false });
    act(() => bookmarkControl.props.onPress());
    expect(onToggleBookmark).toHaveBeenCalledWith({
      reference: 'John 3:16',
      text: 'For God so loved the displayed world.',
      translation: 'BSB',
    });
  });

  it('keeps a Saved Scripture target on the main block when its reference matches canonically', async () => {
    mockFetchVerseLocal.mockResolvedValue(null);
    mockFetchVerse.mockResolvedValue(null);
    const onScriptureTap = jest.fn();
    const onTargetBookmarkLocated = jest.fn();

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DevotionalContent
          day={day({ scriptureReference: 'John 3:16' })}
          fontSize="medium"
          targetBookmark={{
            id: 'main-bookmark',
            devotionalId: 'devotional-1',
            devotionalTitle: 'The Gift',
            dayNumber: 1,
            dayTitle: 'Loved First',
            scriptureReference: ' john  3:16 ',
            scriptureText: 'Saved main passage.',
            savedAt: '2026-09-28T00:00:00.000Z',
          }}
          onScriptureTap={onScriptureTap}
          onTargetBookmarkLocated={onTargetBookmarkLocated}
        />,
      );
      await Promise.resolve();
    });

    act(() => tree!.root.findByProps({ testID: 'reading-scripture-section' }).props.onLayout({
      nativeEvent: { layout: { y: 320 } },
    }));
    expect(onTargetBookmarkLocated).toHaveBeenCalledWith(320);
    expect(onScriptureTap).not.toHaveBeenCalled();
  });

  it('navigates to a saved main passage in the reader current translation', async () => {
    mockFetchVerseLocal.mockResolvedValue({
      reference: 'John 3:16',
      translation: 'BSB',
      text: 'Current BSB passage.',
      passage: [{ verse: 16, text: 'Current BSB passage.' }],
    });
    const onTargetBookmarkLocated = jest.fn();

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DevotionalContent
          day={day({ scriptureReference: 'John 3:16', scriptureText: 'Generated passage.' })}
          fontSize="medium"
          targetBookmark={{
            id: 'main-kjv-bookmark',
            devotionalId: 'devotional-1',
            devotionalTitle: 'The Gift',
            dayNumber: 1,
            dayTitle: 'Loved First',
            kind: 'scripture',
            key: 'John 3:16',
            scriptureReference: 'John 3:16',
            scriptureText: 'Saved KJV passage.',
            translation: 'KJV',
            savedAt: '2026-09-28T00:00:00.000Z',
          }}
          onTargetBookmarkLocated={onTargetBookmarkLocated}
        />,
      );
      await Promise.resolve();
    });

    act(() => tree!.root.findByProps({ testID: 'reading-scripture-section' }).props.onLayout({
      nativeEvent: { layout: { y: 320 } },
    }));

    const text = collectText(tree!.toJSON()).join(' ');
    expect(mockFetchVerseLocal).toHaveBeenCalledWith('John 3:16', 'BSB');
    expect(text).toContain('Current BSB passage.');
    expect(text).not.toContain('Saved KJV passage.');
    expect(onTargetBookmarkLocated).toHaveBeenCalledWith(320);
  });

  it('opens a Saved Related Scripture target with its saved text and translation', async () => {
    mockFetchVerseLocal.mockResolvedValue(null);
    mockFetchVerse.mockResolvedValue(null);
    const onScriptureTap = jest.fn();

    await act(async () => {
      renderer.create(
        <DevotionalContent
          day={day({
            scriptureReference: 'John 3:16',
            crossReferences: [{ reference: 'Romans 8:28', text: 'Current generated related text.' }],
          })}
          fontSize="medium"
          targetBookmark={{
            id: 'related-bookmark',
            devotionalId: 'devotional-1',
            devotionalTitle: 'The Gift',
            dayNumber: 1,
            dayTitle: 'Loved First',
            scriptureReference: 'Romans 8:28',
            scriptureText: 'Saved related passage in KJV.',
            translation: 'KJV',
            savedAt: '2026-09-28T00:00:00.000Z',
          }}
          onScriptureTap={onScriptureTap}
        />,
      );
      await Promise.resolve();
    });

    expect(onScriptureTap).toHaveBeenCalledWith('Romans 8:28', {
      text: 'Saved related passage in KJV.',
      translation: 'KJV',
    });
  });

  it('signals reflection remeasurement after the WebView height commit', async () => {
    mockFetchVerseLocal.mockResolvedValue(null);
    mockFetchVerse.mockResolvedValue(null);
    let committedFrame: FrameRequestCallback | null = null;
    const requestAnimationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        committedFrame = callback;
        return 1;
      });

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DevotionalContent
          day={day({ reflectionQuestions: ['First', 'Later'] })}
          fontSize="medium"
          devotionalId="devotional"
          dayNumber={1}
          onOpenJournal={jest.fn()}
          layoutGeneration={4}
        />
      );
      await Promise.resolve();
    });

    const initialReflectionProps = mockInlineReflectionJournal.mock.calls.at(-1)?.[0] as {
      layoutCommitSignal: number;
    };
    const webViewProps = mockDevotionalWebView.mock.calls.at(-1)?.[0] as {
      onLayoutGenerationCommitted: (generation: number) => void;
    };

    act(() => webViewProps.onLayoutGenerationCommitted(4));
    expect(mockInlineReflectionJournal.mock.calls.at(-1)?.[0]).toBe(initialReflectionProps);
    act(() => committedFrame?.(0));

    const committedReflectionProps = mockInlineReflectionJournal.mock.calls.at(-1)?.[0] as {
      layoutCommitSignal: number;
    };
    expect(committedReflectionProps.layoutCommitSignal).toBe(
      initialReflectionProps.layoutCommitSignal + 1,
    );

    act(() => tree!.unmount());
    requestAnimationFrameSpy.mockRestore();
  });

  it('reports ending section positions directly before and after a reading reflow', async () => {
    mockFetchVerseLocal.mockResolvedValue(null);
    mockFetchVerse.mockResolvedValue(null);
    const onSectionLayout = jest.fn();
    const readingDay = day({
      reflectionQuestions: ['What stayed with you?'],
      act: 'Take a quiet moment.',
      closingPrayer: 'Help me stay present.',
    });
    let tree: renderer.ReactTestRenderer;
    const renderReading = (generation: number) => (
      <DevotionalContent
        day={readingDay}
        fontSize="medium"
        layoutGeneration={generation}
        onSectionLayout={onSectionLayout}
      />
    );
    await act(async () => {
      tree = renderer.create(renderReading(1));
    });

    for (const generation of [1, 2]) {
      act(() => tree!.update(renderReading(generation)));
      for (const [index, section] of ['reflection', 'act', 'prayer'].entries()) {
        const y = (index + 1) * 400 * generation;
        act(() => {
          tree!.root.findByProps({ testID: `reading-${section}-section` }).props.onLayout({
            nativeEvent: { layout: { x: 0, y, width: 354, height: 200 } },
          });
        });
        expect(onSectionLayout).toHaveBeenCalledWith(section, y, generation);
      }
    }
    act(() => tree!.unmount());
  });
});
