/**
 * "Stay with this prayer" (DESIGN.md, the reflection desk, accepted
 * 2026-09-14): one text, full screen, kept awake, closed with Done. The focus
 * parameter picks the prayer or the day's passage; paired panes face the
 * other text beside it.
 */
import renderer, { act } from 'react-test-renderer';

const mockDismiss = jest.fn();
const mockActivate = jest.fn((_tag?: string) => Promise.resolve());
const mockDeactivate = jest.fn((_tag?: string) => Promise.resolve());
const mockWindow = { width: 390, height: 844, insetTop: 47, insetBottom: 34, insetLeft: 0, insetRight: 0 };
const mockParams: { devotionalId: string; dayNumber: string; focus?: string } = { devotionalId: 'devo', dayNumber: '2' };

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ canDismiss: () => true, dismiss: mockDismiss, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: (tag?: string) => mockActivate(tag),
  deactivateKeepAwake: (tag?: string) => mockDeactivate(tag),
}));
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
        {
          id: 'd2',
          dayNumber: 2,
          title: 'Room to breathe',
          closingPrayer: 'Teach me to rest in you.',
          scriptureText: 'Come to me, all who are weary.',
          scriptureReference: 'Matthew 11:28',
        },
        { id: 'd3', dayNumber: 3, title: 'Prayer only', closingPrayer: 'Keep me near.' },
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
import { StyleSheet } from 'react-native';
// eslint-disable-next-line import/first
import StayScreen from '@/app/stay';

const KEEP_AWAKE_MS = 15 * 60 * 1000;
const OPEN_DUO = { width: 951, height: 669, insetTop: 24, insetBottom: 20 };
// Reported content area of an open Duo held upright.
const UPRIGHT_DUO = { width: 669, height: 703, insetTop: 0, insetBottom: 0 };

type Node = renderer.ReactTestInstance;

function text(node: Node): string {
  const children = node.props.children;
  const list = Array.isArray(children) ? children : [children];
  return list.map((child) => (typeof child === 'string' ? child : '')).join('');
}

function style(node: Node): Record<string, unknown> {
  return StyleSheet.flatten(node.props.style) as Record<string, unknown>;
}

const mounted: renderer.ReactTestRenderer[] = [];

function render() {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<StayScreen />);
  });
  mounted.push(tree!);
  return tree!;
}

/** The first host node with this testID. */
function host(tree: renderer.ReactTestRenderer, testID: string): Node {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID)[0];
}

function hosts(tree: renderer.ReactTestRenderer, testID: string): Node[] {
  return tree.root.findAll((node) => typeof node.type === 'string' && node.props.testID === testID);
}

/** 'first' or 'second': the FacingPanes slot that holds the node, or null in one column. */
function paneOf(node: Node): 'first' | 'second' | null {
  let current: Node | null = node;
  while (current?.parent) {
    if (current.parent.props.testID === 'stay-panes' && typeof current.parent.type === 'string') {
      return current.parent.children.indexOf(current) === 0 ? 'first' : 'second';
    }
    current = current.parent;
  }
  return null;
}

function hasText(tree: renderer.ReactTestRenderer, value: string): Node | undefined {
  return tree.root.findAll((node) => typeof node.type === 'string' && text(node) === value)[0];
}

describe('StayScreen', () => {
  beforeEach(() => {
    mockDismiss.mockClear();
    mockActivate.mockClear();
    mockDeactivate.mockClear();
    Object.assign(mockWindow, { width: 390, height: 844, insetTop: 47, insetBottom: 34 });
    mockParams.dayNumber = '2';
    delete mockParams.focus;
  });

  afterEach(() => {
    act(() => {
      mounted.splice(0).forEach((tree) => tree.unmount());
    });
    jest.useRealTimers();
  });

  it('shows the prayer for the requested day by default', () => {
    const tree = render();
    expect(text(host(tree, 'stay-prayer'))).toContain('Teach me to rest');
    expect(style(host(tree, 'stay-prayer')).fontSize).toBe(25);
    expect(hasText(tree, 'Room to breathe')).toBeDefined();
    expect(hosts(tree, 'stay-passage')).toHaveLength(0);
  });

  it('returns to the reader on Done', () => {
    const tree = render();
    act(() => tree.root.findByProps({ testID: 'stay-done' }).props.onPress());
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it('focuses the passage and its reference in one column', () => {
    mockParams.focus = 'passage';
    const tree = render();
    expect(text(host(tree, 'stay-passage'))).toContain('Come to me');
    expect(style(host(tree, 'stay-passage')).fontSize).toBe(25);
    expect(hasText(tree, 'Matthew 11:28')).toBeDefined();
    expect(hosts(tree, 'stay-prayer')).toHaveLength(0);
  });

  it('faces the prayer with the passage, the title and Done on an open Duo', () => {
    Object.assign(mockWindow, OPEN_DUO);
    const tree = render();
    expect(paneOf(host(tree, 'stay-prayer'))).toBe('first');
    expect(paneOf(host(tree, 'stay-passage'))).toBe('second');
    expect(paneOf(host(tree, 'stay-done'))).toBe('second');
    expect(paneOf(hasText(tree, 'Room to breathe')!)).toBe('second');
    expect(paneOf(hasText(tree, 'Matthew 11:28')!)).toBe('second');
    expect(style(host(tree, 'stay-prayer')).fontSize).toBe(25);
    expect(style(host(tree, 'stay-passage')).fontSize).toBe(21);
  });

  it('puts a focused passage on the first page and the prayer on the second', () => {
    Object.assign(mockWindow, OPEN_DUO);
    mockParams.focus = 'passage';
    const tree = render();
    expect(paneOf(host(tree, 'stay-passage'))).toBe('first');
    expect(paneOf(hasText(tree, 'Matthew 11:28')!)).toBe('first');
    expect(paneOf(host(tree, 'stay-prayer'))).toBe('second');
    expect(style(host(tree, 'stay-passage')).fontSize).toBe(25);
    expect(style(host(tree, 'stay-prayer')).fontSize).toBe(21);
  });

  it('puts the focused text at the top of a stacked upright Duo', () => {
    Object.assign(mockWindow, UPRIGHT_DUO);
    const tree = render();
    expect(paneOf(host(tree, 'stay-prayer'))).toBe('first');
    expect(paneOf(host(tree, 'stay-passage'))).toBe('second');
    expect(paneOf(host(tree, 'stay-done'))).toBe('second');
  });

  it('leaves only the title and Done on the second page when the other text is missing', () => {
    Object.assign(mockWindow, OPEN_DUO);
    mockParams.dayNumber = '3';
    const tree = render();
    expect(paneOf(host(tree, 'stay-prayer'))).toBe('first');
    expect(hosts(tree, 'stay-passage')).toHaveLength(0);
    expect(paneOf(hasText(tree, 'Prayer only')!)).toBe('second');
    expect(paneOf(host(tree, 'stay-done'))).toBe('second');
  });

  it('left-aligns the title, the facing text and the reference', () => {
    Object.assign(mockWindow, OPEN_DUO);
    const tree = render();
    for (const node of [hasText(tree, 'Room to breathe')!, host(tree, 'stay-passage'), hasText(tree, 'Matthew 11:28')!]) {
      expect(style(node).textAlign).toBeUndefined();
    }
  });

  describe('keep-awake', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    function touch(tree: renderer.ReactTestRenderer) {
      act(() => host(tree, 'stay-screen').props.onTouchStart());
    }

    function advance(ms: number) {
      act(() => {
        jest.advanceTimersByTime(ms);
      });
    }

    it('holds the screen awake for 15 minutes, then lets it sleep', () => {
      render();
      expect(mockActivate).toHaveBeenCalledTimes(1);
      const tag = mockActivate.mock.calls[0][0];
      expect(tag).toEqual(expect.any(String));

      advance(KEEP_AWAKE_MS - 1);
      expect(mockDeactivate).not.toHaveBeenCalled();
      advance(1);
      expect(mockDeactivate).toHaveBeenCalledWith(tag);
    });

    it('restarts the 15 minutes on any touch', () => {
      const tree = render();
      advance(10 * 60 * 1000);
      touch(tree);
      expect(mockActivate).toHaveBeenCalledTimes(1);

      advance(KEEP_AWAKE_MS - 1);
      expect(mockDeactivate).not.toHaveBeenCalled();
      advance(1);
      expect(mockDeactivate).toHaveBeenCalledTimes(1);

      // A touch after the screen was released holds it again.
      touch(tree);
      expect(mockActivate).toHaveBeenCalledTimes(2);
    });

    it('releases the hold on unmount', () => {
      const tree = render();
      act(() => tree.unmount());
      mounted.splice(mounted.indexOf(tree), 1);
      expect(mockDeactivate).toHaveBeenCalledTimes(1);
      advance(KEEP_AWAKE_MS);
      expect(mockDeactivate).toHaveBeenCalledTimes(1);
    });
  });
});
