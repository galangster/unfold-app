/**
 * Greptile A8 regression: when the day's scripture reference changes, the
 * previous passage must not keep rendering under the new reference while
 * (or after, if it fails) the new fetch runs.
 */
import renderer, { act } from 'react-test-renderer';
import { DevotionalContent } from '../DevotionalContent';

const mockFetchVerseLocal = jest.fn();
const mockFetchVerse = jest.fn();

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
jest.mock('../DevotionalWebView', () => ({ DevotionalWebView: () => null }));
jest.mock('../InlineReflectionJournal', () => ({ InlineReflectionJournal: () => null }));

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
});
