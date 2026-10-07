/**
 * UnfoldVerse layout behaviour, family by family. The 'widget' directive
 * compiles the layout to its source string, and the widget extension
 * evaluates that string with the swift-ui views and modifiers as globals.
 * This test does the same in a fresh context, so a layout that reaches for
 * module scope fails here as it would on the Lock Screen.
 */
import vm from 'vm';
import source from '@/widgets/ios/UnfoldVerse';

jest.mock('expo-widgets', () => ({ createWidget: (_name: string, layout: unknown) => layout }));
jest.mock('@expo/ui/swift-ui', () => ({}));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({}));

type Family = 'accessoryInline' | 'accessoryRectangular' | 'accessoryCircular';
type Props = {
  lockLine: string;
  lockReference: string;
  lockDayNumber: number;
  lockDaysRead: number;
  lockReadToday: boolean;
  totalDays: number;
  hasReadToday: boolean;
};
type Node = { type: string; props: { children?: unknown; value?: number; modifiers?: unknown[] } };

const VIEWS = ['HStack', 'VStack', 'ZStack', 'Text', 'Image', 'Gauge', 'AccessoryWidgetBackground'];
const MODIFIERS = [
  'font',
  'foregroundStyle',
  'frame',
  'lineLimit',
  'lineHeight',
  'kerning',
  'minimumScaleFactor',
  'gaugeStyle',
  'accessibilityElement',
  'accessibilityLabel',
  'widgetURL',
];
const runtime: Record<string, unknown> = {
  _jsx: (type: string, props: Node['props']): Node => ({ type, props }),
  _jsxs: (type: string, props: Node['props']): Node => ({ type, props }),
};
for (const view of VIEWS) runtime[view] = view;
for (const name of MODIFIERS) runtime[name] = (...args: unknown[]) => ({ modifier: name, args });
const layout = vm.runInNewContext(`(${String(source)})`, runtime) as (
  props: Props,
  environment: { widgetFamily: Family }
) => Node;

const LINE = 'Come to Me, all you who are weary and burdened, and I will give you rest.';
const NO_VERSE = { lockLine: '', lockReference: '' };
const NO_SERIES = { ...NO_VERSE, lockDayNumber: 0, lockDaysRead: 0, totalDays: 0 };

const render = (family: Family, over: Partial<Props> = {}): Node =>
  layout(
    {
      lockLine: LINE,
      lockReference: 'Matthew 11:28–30',
      lockDayNumber: 4,
      lockDaysRead: 3,
      lockReadToday: false,
      totalDays: 7,
      hasReadToday: false,
      ...over,
    },
    { widgetFamily: family }
  );

/** Every element of `type` in the tree, depth first. */
function findAll(node: unknown, type: string): Node[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type));
  if (node === null || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Node;
  return [...(element.type === type ? [element] : []), ...findAll(element.props.children, type)];
}

const texts = (tree: Node) =>
  findAll(tree, 'Text').map((text) => [text.props.children].flat().join(''));

describe('UnfoldVerse accessoryCircular', () => {
  it('fills the ring with the days the reader has finished', () => {
    const ring = (over: Partial<Props>) => findAll(render('accessoryCircular', over), 'Gauge')[0].props.value;
    expect(ring({ lockDayNumber: 3, lockDaysRead: 2 })).toBeCloseTo(2 / 7);
    expect(ring({ lockDayNumber: 3, lockDaysRead: 3, hasReadToday: true })).toBeCloseTo(3 / 7);
    // The morning after the last day: the series is finished, not 6 of 7.
    expect(ring({ lockDayNumber: 7, lockDaysRead: 7 })).toBe(1);
  });

  it('says whether this series was read today, not whether any series was', () => {
    const spoken = (over: Partial<Props>) =>
      render('accessoryCircular', over).props.modifiers?.find(
        (m) => (m as { modifier: string }).modifier === 'accessibilityLabel'
      );
    expect(spoken({ hasReadToday: true, lockReadToday: false })).toEqual({
      modifier: 'accessibilityLabel',
      args: ['Series day 4 of 7. Not yet read today.'],
    });
    expect(spoken({ hasReadToday: true, lockReadToday: true })).toEqual({
      modifier: 'accessibilityLabel',
      args: ['Series day 4 of 7. Read today.'],
    });
  });

  it('shows the day and the series length inside the ring', () => {
    expect(texts(render('accessoryCircular', { lockDayNumber: 3 }))).toEqual(['3', 'of 7']);
  });

  it('shows a book and no ring when there is no series', () => {
    const tree = render('accessoryCircular', NO_SERIES);
    expect(findAll(tree, 'Gauge')).toHaveLength(0);
    expect(findAll(tree, 'Image')).toHaveLength(1);
  });
});

describe('UnfoldVerse accessoryRectangular', () => {
  it('shows the line over the uppercased reference', () => {
    expect(texts(render('accessoryRectangular'))).toEqual([LINE, 'MATTHEW 11:28–30']);
  });

  it("asks to open today's reading while the series day has no text yet", () => {
    expect(texts(render('accessoryRectangular', NO_VERSE))).toEqual(["Open Unfold for today's reading"]);
  });

  it('asks to start a series when there is none', () => {
    expect(texts(render('accessoryRectangular', NO_SERIES))).toEqual(['Open Unfold to start a series']);
  });
});

describe('UnfoldVerse taps', () => {
  it.each(['accessoryInline', 'accessoryRectangular', 'accessoryCircular'] as const)(
    '%s opens the Today tab',
    (family) => {
      expect(render(family).props.modifiers).toContainEqual({
        modifier: 'widgetURL',
        args: ['unfold://(tabs)/(today)'],
      });
    }
  );
});

describe('UnfoldVerse accessoryInline', () => {
  it('shows the reference, or the app name when there is no verse', () => {
    expect(texts(render('accessoryInline'))).toEqual(['Matthew 11:28–30']);
    expect(texts(render('accessoryInline', NO_VERSE))).toEqual(['Unfold']);
  });
});
