/**
 * Greptile A6 regression: the debounce cancels timers, not in-flight fetches,
 * so a slow lookup for an earlier reference could land after the current one.
 */
import renderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { ScriptureSearchSheet } from '../ScriptureSearchSheet';

const mockFetchVerseLocal = jest.fn();
const mockFetchVerse = jest.fn();

jest.mock('@/lib/bible-api', () => ({
  fetchVerse: (...args: unknown[]) => mockFetchVerse(...args),
  fetchVerseLocal: (...args: unknown[]) => mockFetchVerseLocal(...args),
}));

jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('@/components/icons', () => new Proxy({}, {
  get: (_target, name) => {
    if (name === '__esModule') return true;
    return () => null;
  },
}));

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }: { children: unknown }) => children,
    Gesture: {
      Pan: () => {
        const proxy: unknown = new Proxy({}, { get: () => () => proxy });
        return proxy;
      },
    },
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    FadeIn: { duration: () => ({ easing: () => ({}) }) },
    FadeOut: { duration: () => ({ easing: () => ({}) }) },
    Easing: { out: () => 'out', in: () => 'in', inOut: () => 'inOut', cubic: 'cubic' },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => true,
    // Stable identity: the sheet's open effect lists the shared value as a dep.
    useSharedValue: (value: unknown) => require('react').useRef({ value }).current,
    withTiming: (v: unknown) => v,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ isDark: false, colors: new Proxy({}, { get: () => '#888888' }) }),
}));

jest.mock('@/components/ui', () => ({ alpha: (c: string) => c }));

function collectText(node: any): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!node || typeof node !== 'object') return [];
  return collectText(node.children ?? []);
}

describe('ScriptureSearchSheet stale lookups (Greptile A6)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFetchVerseLocal.mockReset();
    mockFetchVerse.mockReset();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the verse for the latest query even when an earlier lookup resolves last', async () => {
    const deferred: Array<(value: unknown) => void> = [];
    mockFetchVerseLocal.mockImplementation(() => new Promise((resolve) => { deferred.push(resolve); }));

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ScriptureSearchSheet visible onClose={jest.fn()} onInsert={jest.fn()} />);
    });
    const input = tree!.root.findByType(TextInput);

    await act(async () => {
      input.props.onChangeText('John 3:16');
      jest.advanceTimersByTime(600);
    });
    await act(async () => {
      input.props.onChangeText('Psalm 23:1');
      jest.advanceTimersByTime(600);
    });
    expect(deferred).toHaveLength(2);

    await act(async () => {
      deferred[1]({ reference: 'Psalm 23:1', text: 'FRESH PSALM TEXT', translation: 'BSB' });
      await Promise.resolve();
    });
    await act(async () => {
      deferred[0]({ reference: 'John 3:16', text: 'STALE JOHN TEXT', translation: 'BSB' });
      await Promise.resolve();
    });

    const text = collectText(tree!.toJSON()).join(' ');
    expect(text).toContain('FRESH PSALM TEXT');
    expect(text).not.toContain('STALE JOHN TEXT');
  });
});
