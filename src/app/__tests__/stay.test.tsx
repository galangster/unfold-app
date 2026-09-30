/**
 * "Stay with this prayer" (DESIGN.md, the reflection desk, accepted
 * 2026-09-14): one prayer, full screen, kept awake, closed with Done.
 */
import renderer, { act } from 'react-test-renderer';

const mockDismiss = jest.fn();
const mockKeepAwake = jest.fn();
const mockWindow = { width: 390, height: 844, insetTop: 47, insetBottom: 34, insetLeft: 0, insetRight: 0 };
const mockParams = { devotionalId: 'devo', dayNumber: '2' };

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ canDismiss: () => true, dismiss: mockDismiss, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => mockKeepAwake() }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chain: Record<string, unknown> = {};
  chain.duration = () => chain;
  chain.easing = () => chain;
  return {
    __esModule: true,
    default: { View },
    FadeIn: chain,
    Easing: { cubic: 'cubic', ease: 'ease', out: () => 'out', in: () => 'in', inOut: () => 'inOut', bezier: () => 'bezier' },
    useReducedMotion: () => false,
  };
});
jest.mock('@/hooks/useAdaptiveLayout', () => ({
  useAdaptiveLayout: () => jest.requireActual('@/lib/adaptive-layout').resolveAdaptiveLayout(mockWindow),
}));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ isDark: false, colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('@/lib/useReadingFont', () => ({ useReadingFont: () => ({ body: 'Body' }) }));
jest.mock('@/lib/store', () => ({
  FONT_SIZE_VALUES: { medium: { scripture: 21, body: 17, title: 32 } },
  useUnfoldStore: (selector: (state: unknown) => unknown) => selector({
    user: { fontSize: 'medium' },
    devotionals: [{
      id: 'devo',
      days: [
        { id: 'd1', dayNumber: 1, title: 'First', closingPrayer: 'Not this one.' },
        { id: 'd2', dayNumber: 2, title: 'Room to breathe', closingPrayer: 'Teach me to rest in you.' },
      ],
    }],
  }),
}));
jest.mock('@/lib/devotional-canonical-days', () => ({
  selectRenderableDevotionalDay: (devotional: { days: Array<{ dayNumber: number }> } | undefined, dayNumber: number) => {
    const day = devotional?.days.find((candidate) => candidate.dayNumber === dayNumber);
    return day ? { status: 'ready', day } : { status: 'missing' };
  },
}));

// eslint-disable-next-line import/first
import StayScreen from '../stay';

type Node = {
  type: unknown;
  props: Record<string, unknown>;
  parent: Node | null;
  findAllByProps: (props: Record<string, unknown>) => Node[];
  findByProps: (props: Record<string, unknown>) => Node;
};

function text(node: Node | string): string {
  if (typeof node === 'string') return node;
  const children = node.props.children;
  const list = Array.isArray(children) ? children : [children];
  return list.map((child) => (typeof child === 'string' ? child : '')).join('');
}

function render() {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<StayScreen />);
  });
  return tree!;
}

/** The pane View that FacingPanes gives each child, or null in one column. */
function paneOf(node: Node): Node | null {
  let current: Node | null = node;
  while (current) {
    if (current.props.testID !== 'stay-panes' && current.parent?.props.testID === 'stay-panes') return current;
    current = current.parent;
  }
  return null;
}

describe('StayScreen', () => {
  beforeEach(() => {
    mockDismiss.mockClear();
    mockKeepAwake.mockClear();
    Object.assign(mockWindow, { width: 390, height: 844, insetTop: 47, insetBottom: 34 });
  });

  it('shows the prayer for the requested day and keeps the screen awake', () => {
    const tree = render();
    const prayer = tree.root.findByProps({ testID: 'stay-prayer' }) as unknown as Node;
    expect(text(prayer)).toContain('Teach me to rest');
    expect(tree.root.findAllByProps({ children: 'Room to breathe' }).length).toBeGreaterThan(0);
    expect(mockKeepAwake).toHaveBeenCalled();
  });

  it('returns to the reader on Done', () => {
    const tree = render();
    const done = tree.root.findByProps({ testID: 'stay-done' });
    act(() => done.props.onPress());
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it('puts the prayer and Done on facing pages of an open Duo', () => {
    Object.assign(mockWindow, { width: 951, height: 669, insetTop: 24, insetBottom: 20 });
    const tree = render();
    const prayerPane = paneOf(tree.root.findByProps({ testID: 'stay-prayer' }) as unknown as Node);
    const donePane = paneOf(tree.root.findByProps({ testID: 'stay-done' }) as unknown as Node);
    expect(prayerPane).not.toBeNull();
    expect(donePane).not.toBeNull();
    expect(prayerPane).not.toBe(donePane);
  });
});
