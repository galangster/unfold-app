import React from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

const renderer = require('react-test-renderer');
const { act } = renderer;

let mockLayout: object = {};
const mockExamen: { movements: { title: string; prayer: string }[]; closingLine: string | null } = {
  movements: [
    { title: 'Gratitude', prayer: 'Thank you for this day.' },
    { title: 'Rest', prayer: 'Keep me through the night.' },
  ],
  closingLine: 'Amen.',
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('react-native-reanimated', () => {
  const chain: object = new Proxy({}, { get: () => () => chain });
  return {
    __esModule: true,
    default: { View: 'Animated.View', ScrollView: 'Animated.ScrollView' },
    FadeIn: chain,
    FadeInDown: chain,
    useSharedValue: (value: unknown) => require('react').useRef({ value }).current,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useAnimatedScrollHandler: (handlers: { onScroll: (event: unknown) => void }) => handlers.onScroll,
    withRepeat: (value: unknown) => value,
    withTiming: (value: unknown) => value,
    withDelay: (_delay: number, value: unknown) => value,
    interpolate: () => 0,
    Easing: { out: () => undefined, in: () => undefined, inOut: () => undefined, bezier: () => undefined, ease: undefined, cubic: undefined },
    useReducedMotion: () => true,
  };
});
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: queryKey[0] === 'examen' ? mockExamen : undefined,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));
jest.mock('@/components/icons', () => new Proxy({}, { get: () => 'Icon' }));
jest.mock('@/components/ambient/AmbientMusicEntry', () => ({ AmbientMusicEntry: 'AmbientMusicEntry' }));
jest.mock('@/components/ambient/AmbientQuietEnding', () => ({ AmbientQuietEnding: 'AmbientQuietEnding' }));
jest.mock('@/lib/ambient-audio-coordination', () => ({ endAmbientReflection: jest.fn() }));
jest.mock('@/lib/ambient-audio-feature', () => ({ isAmbientAudioEnabled: () => false }));
jest.mock('@/lib/ambient-sound-chrome', () => ({ useAmbientPlayerScrollPadding: () => 100 }));
jest.mock('@/hooks/useAdaptiveLayout', () => ({ useAdaptiveLayout: () => mockLayout }));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({
    colors: {
      accent: '#C8A55C',
      background: '#111111',
      text: '#F6EFE3',
      textMuted: '#B8AA96',
      textSubtle: '#8D806D',
      border: '#3A3328',
    },
  }),
}));
jest.mock('@/hooks/useGuardedBack', () => ({ useGuardedBack: () => jest.fn() }));
// A test that needs a reader and a series puts them here and restores it after.
const mockStoreState: {
  user: object | null;
  devotionals: object[];
  currentDevotionalId: string | null;
  checkIns: object[];
  addCheckIn: jest.Mock;
  markEveningWindDownCompleted: jest.Mock;
  beginRitualSession: jest.Mock;
} = {
  user: null,
  devotionals: [],
  currentDevotionalId: null,
  checkIns: [],
  addCheckIn: jest.fn(),
  markEveningWindDownCompleted: jest.fn(),
  beginRitualSession: jest.fn(),
};
jest.mock('@/lib/store', () => {
  const useUnfoldStore = (selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState);
  useUnfoldStore.getState = () => mockStoreState;
  return { useUnfoldStore };
});
jest.mock('@/lib/examen-service', () => ({ generateExamen: jest.fn() }));
jest.mock('@/lib/bible-api', () => ({ fetchVerse: jest.fn() }));
jest.mock('@/components/EveningCelebration', () => ({ EveningCelebration: 'EveningCelebration' }));
jest.mock('@/components/ExclusiveOfferSheet', () => ({ ExclusiveOfferSheet: 'ExclusiveOfferSheet' }));
jest.mock('@/hooks/useCreationGate', () => ({
  useCreationGate: () => ({
    gate: () => true,
    policy: 'granted',
    showExclusiveOffer: false,
    dismissOffer: jest.fn(),
    handleOfferVerifiedExit: jest.fn(),
  }),
}));

const EveningWindDownScreen = require('@/app/(tabs)/(today)/evening-wind-down').default;
const { resolveAdaptiveLayout } = jest.requireActual('@/lib/adaptive-layout');

// Reported iPhone Duo inner display, open and wider than tall.
const duoOpen = resolveAdaptiveLayout({ width: 951, height: 669, insetTop: 24, insetBottom: 20 });
// Reported iPhone Duo inner display, open and turned upright.
const duoUpright = resolveAdaptiveLayout({ width: 669, height: 951, insetTop: 50, insetBottom: 20 });
const phone = resolveAdaptiveLayout({ width: 393, height: 852, insetTop: 59, insetBottom: 34 });

function textOf(node: ReactTestInstance): string {
  return node
    .findAll((child) => typeof child.props.children === 'string')
    .map((child) => child.props.children as string)
    .join('|');
}

function flatStyle(node: ReactTestInstance): Record<string, unknown> {
  const style = node.props.style;
  const list = (Array.isArray(style) ? style : [style]) as Array<Record<string, unknown> | undefined>;
  return Object.assign({}, ...list.filter(Boolean));
}

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => { tree = renderer.create(React.createElement(EveningWindDownScreen)); });
  return tree;
}

describe('Evening wind-down pages', () => {
  it('puts the moon and title on the first page and the prayer and Done on the second', () => {
    mockLayout = duoOpen;
    const tree = render();
    const hero = textOf(tree.root.findByProps({ testID: 'evening-wind-down-hero-page' }));
    const prayer = textOf(tree.root.findByProps({ testID: 'evening-wind-down-prayer-page' }));

    expect(hero).toContain('Evening Wind-Down');
    expect(hero).not.toContain('Goodnight');
    expect(prayer).toContain('Thank you for this day.');
    expect(prayer).toContain('Goodnight');
    expect(prayer).not.toContain('Evening Wind-Down');
  });

  it('keeps both pages mounted when the device opens and closes', () => {
    mockLayout = phone;
    const tree = render();
    const hero = tree.root.findByProps({ testID: 'evening-wind-down-hero-page' });
    const prayer = tree.root.findByProps({ testID: 'evening-wind-down-prayer-page' });

    mockLayout = duoOpen;
    act(() => { tree.update(React.createElement(EveningWindDownScreen)); });
    expect(tree.root.findByProps({ testID: 'evening-wind-down-hero-page' })).toBe(hero);
    expect(tree.root.findByProps({ testID: 'evening-wind-down-prayer-page' })).toBe(prayer);

    mockLayout = phone;
    act(() => { tree.update(React.createElement(EveningWindDownScreen)); });
    expect(tree.root.findByProps({ testID: 'evening-wind-down-prayer-page' })).toBe(prayer);
    expect(textOf(prayer)).toContain('Goodnight');
  });

  it('keeps the moon and title in view while the prayer page scrolls', () => {
    mockLayout = duoOpen;
    const tree = render();
    const hero = () => tree.root.findByProps({ testID: 'evening-wind-down-hero-page' });
    act(() => { tree.root.findByProps({ testID: 'evening-wind-down-scroll' }).props.onScroll({ contentOffset: { y: 180 } }); });
    act(() => { hero().props.onLayout({ nativeEvent: { layout: { height: 300 } } }); });
    expect(flatStyle(hero()).transform).toEqual([{ translateY: 180 }]);
  });

  it('leaves the phone hero in the scroll, with Goodnight after the prayer', () => {
    mockLayout = phone;
    const tree = render();
    const hero = () => tree.root.findByProps({ testID: 'evening-wind-down-hero-page' });
    act(() => { tree.root.findByProps({ testID: 'evening-wind-down-scroll' }).props.onScroll({ contentOffset: { y: 180 } }); });
    act(() => { hero().props.onLayout({ nativeEvent: { layout: { height: 300 } } }); });
    expect(flatStyle(hero()).transform).toEqual([{ translateY: 0 }]);
    expect(tree.root.findAllByProps({ testID: 'evening-wind-down-lower-pane' })).toHaveLength(0);
  });

  it('scrolls the prayer in the upper pane and pins Goodnight in the lower pane of a stacked window', () => {
    mockLayout = phone;
    const tree = render();
    const hero = tree.root.findByProps({ testID: 'evening-wind-down-hero-page' });
    const prayer = tree.root.findByProps({ testID: 'evening-wind-down-prayer-page' });

    mockLayout = duoUpright;
    act(() => { tree.update(React.createElement(EveningWindDownScreen)); });
    expect(tree.root.findByProps({ testID: 'evening-wind-down-hero-page' })).toBe(hero);
    expect(tree.root.findByProps({ testID: 'evening-wind-down-prayer-page' })).toBe(prayer);

    const upper = textOf(tree.root.findByProps({ testID: 'evening-wind-down-scroll' }));
    expect(upper).toContain('Evening Wind-Down');
    expect(upper).toContain('Thank you for this day.');
    expect(upper).not.toContain('Goodnight');

    const lower = tree.root.findByProps({ testID: 'evening-wind-down-lower-pane' });
    expect(textOf(lower)).toContain('Goodnight');
    // The lower pane runs from the fold gutter to the bottom of the window.
    expect(flatStyle(lower).height).toBe(duoUpright.height / 2 + 20);
    expect(flatStyle(lower).justifyContent).toBe('flex-end');
  });

  it('keeps the prayer on screen when midnight passes while it is open', () => {
    mockLayout = phone;
    const saved = { ...mockStoreState };
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 16, 23, 50));
    try {
      Object.assign(mockStoreState, {
        user: { name: 'Alex', currentSituation: '' },
        currentDevotionalId: 'dev-1',
        devotionals: [{
          id: 'dev-1',
          title: 'Rest',
          currentDay: 3,
          totalDays: 7,
          days: [{
            dayNumber: 3,
            title: 'Bread Under the Broom Tree',
            scriptureReference: '1 Kings 19:5',
            isRead: true,
            readAt: new Date(2026, 9, 16, 23, 40).toISOString(),
          }],
        }],
      });
      const tree = render();
      const prayerText = () => textOf(tree.root.findByProps({ testID: 'evening-wind-down-prayer-page' }));
      expect(prayerText()).toContain('Keep me through the night.');

      // Past midnight the day was read yesterday by the live clock. Any
      // re-render, such as a store update, asks the screen again.
      jest.setSystemTime(new Date(2026, 9, 17, 0, 10));
      act(() => { tree.update(React.createElement(EveningWindDownScreen)); });

      expect(prayerText()).toContain('Keep me through the night.');
      expect(prayerText()).not.toContain('Read it now');
    } finally {
      Object.assign(mockStoreState, saved);
      jest.useRealTimers();
    }
  });

  it("prints the night's closing line under the prayer, or no line", () => {
    mockLayout = phone;
    const prayerText = () => textOf(render().root.findByProps({ testID: 'evening-wind-down-prayer-page' }));
    try {
      mockExamen.closingLine = 'Let it be so.';
      expect(prayerText()).toContain('Let it be so.');
      expect(prayerText()).not.toContain('Amen.');

      mockExamen.closingLine = null;
      const withoutLine = prayerText();
      expect(withoutLine).not.toContain('Let it be so.');
      expect(withoutLine).toContain('Keep me through the night.');
    } finally {
      mockExamen.closingLine = 'Amen.';
    }
  });
});
