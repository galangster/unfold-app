/**
 * WR-08 regression: the drill-in chevron must render for folders with
 * subfolders even when the sheet also shows delete affordances — the
 * swipe-move sheet always passes onDeleteFolder, and gating the chevron
 * on it made subfolders permanently unreachable from that surface.
 */
import renderer, { act } from 'react-test-renderer';
import { MoveFolderSheet } from '../MoveFolderSheet';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('phosphor-react-native', () => new Proxy({}, {
  get: (_target, name) => {
    if (name === '__esModule') return true;
    const { View } = require('react-native');
    return (props: Record<string, unknown>) => <View testID={`icon-${String(name)}`} {...props} />;
  },
}));

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }: { children: unknown }) => children,
    Gesture: {
      Pan: () => {
        // Chainable builder: every method returns the same proxy.
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
    useSharedValue: (value: unknown) => ({ value }),
    withDelay: (_d: number, a: unknown) => a,
    withRepeat: (a: unknown) => a,
    withSequence: (...a: unknown[]) => a[a.length - 1],
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    LinearTransition: { springify: () => ({ damping: () => ({ stiffness: () => ({}) }) }) },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View,
}));

jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: new Proxy({}, { get: () => '#888888' }),
  }),
}));

jest.mock('@/components/ui', () => ({
  alpha: (c: string) => c,
  Sheet: ({ children, visible }: { children: unknown; visible: boolean }) => {
    const { View } = require('react-native');
    return visible ? <View testID="sheet">{children}</View> : null;
  },
}));

const FOLDERS = [
  { id: 'parent', name: 'Sermons', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'child', name: '2026', parentId: 'parent', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
] as never[];

describe('MoveFolderSheet (WR-08)', () => {
  it('renders the drill-in chevron when delete affordances are also shown', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <MoveFolderSheet
          visible
          onClose={jest.fn()}
          folders={FOLDERS}
          onSelect={jest.fn()}
          onReorder={jest.fn()}
          onDeleteFolder={jest.fn()}
        />,
      );
    });
    const chevrons = tree!.root.findAllByProps({ accessibilityLabel: 'View subfolders of Sermons' });
    expect(chevrons.length).toBeGreaterThan(0);
    act(() => tree!.unmount());
  });

  it('still renders the chevron in the plain picker (no delete) configuration', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <MoveFolderSheet visible onClose={jest.fn()} folders={FOLDERS} onSelect={jest.fn()} />,
      );
    });
    expect(tree!.root.findAllByProps({ accessibilityLabel: 'View subfolders of Sermons' }).length).toBeGreaterThan(0);
    act(() => tree!.unmount());
  });
});
