/**
 * The facing page takes the reflection out of the reading flow, and the
 * prayer offers a way to stay with it. See DESIGN.md, accepted 2026-09-14.
 */
import renderer, { act } from 'react-test-renderer';
import { DevotionalContent } from '../DevotionalContent';

const mockInlineReflectionJournal = jest.fn((_props: unknown) => null);

jest.mock('@/lib/bible-api', () => ({
  fetchVerse: jest.fn(async () => null),
  fetchVerseLocal: jest.fn(async () => null),
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
  getReflectionTypography: () => ({ questionFontSize: 17, questionLineHeight: 26 }),
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
jest.mock('../ScriptureVerseBlock', () => ({ ScriptureVerseBlock: () => null }));
jest.mock('../DevotionalWebView', () => ({ DevotionalWebView: () => null }));
jest.mock('../InlineReflectionJournal', () => ({
  InlineReflectionJournal: (props: unknown) => mockInlineReflectionJournal(props),
}));

function day(overrides: Record<string, unknown> = {}) {
  return {
    id: 'day-1',
    dayNumber: 1,
    title: 'Day',
    scriptureReference: 'John 3:16',
    scriptureText: 'Text',
    reflectionQuestions: ['What stayed with you?'],
    closingPrayer: 'Keep me near.',
    isRead: false,
    ...overrides,
  } as never;
}

async function render(element: React.ReactElement) {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(element);
    await Promise.resolve();
  });
  return tree!;
}

const journalProps = { devotionalId: 'devo', dayNumber: 1, onOpenJournal: jest.fn() };

describe('DevotionalContent facing page and prayer session', () => {
  beforeEach(() => mockInlineReflectionJournal.mockClear());

  it('keeps the reflection in the reading flow by default', async () => {
    const tree = await render(<DevotionalContent day={day()} fontSize="medium" {...journalProps} />);
    expect(tree.root.findAllByProps({ testID: 'reading-reflection-section' }).length).toBeGreaterThan(0);
    expect(mockInlineReflectionJournal).toHaveBeenCalled();
  });

  it('omits the reflection section when it sits on the facing page', async () => {
    const tree = await render(
      <DevotionalContent day={day()} fontSize="medium" reflectionPlacement="facing" {...journalProps} />,
    );
    expect(tree.root.findAllByProps({ testID: 'reading-reflection-section' })).toHaveLength(0);
    expect(mockInlineReflectionJournal).not.toHaveBeenCalled();
    expect(tree.root.findAllByProps({ testID: 'reading-prayer-section' }).length).toBeGreaterThan(0);
  });

  it('offers to stay with the prayer when the reader handles it', async () => {
    const onStayWithPrayer = jest.fn();
    const tree = await render(
      <DevotionalContent day={day()} fontSize="medium" onStayWithPrayer={onStayWithPrayer} />,
    );
    const button = tree.root.findByProps({ accessibilityHint: 'Opens this prayer on its own, full screen' });
    act(() => button.props.onPress());
    expect(onStayWithPrayer).toHaveBeenCalledTimes(1);
  });

  it('does not offer the session for a day without a prayer', async () => {
    const tree = await render(
      <DevotionalContent day={day({ closingPrayer: undefined })} fontSize="medium" onStayWithPrayer={jest.fn()} />,
    );
    expect(tree.root.findAllByProps({ accessibilityHint: 'Opens this prayer on its own, full screen' })).toHaveLength(0);
  });
});
