import React from 'react';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

const renderer = require('react-test-renderer');
const { act } = renderer;

let mockLayout: object = {};
const mockExamen = {
  movements: [
    { title: 'Gratitude', prayer: 'Thank you for this day.' },
    { title: 'Rest', prayer: 'Keep me through the night.' },
  ],
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
    default: { View: 'Animated.View' },
    FadeIn: chain,
    FadeInDown: chain,
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: (factory: () => unknown) => factory(),
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
jest.mock('@/lib/store', () => {
  const state = {
    user: null,
    devotionals: [],
    currentDevotionalId: null,
    checkIns: [],
    addCheckIn: jest.fn(),
    markEveningWindDownCompleted: jest.fn(),
    beginRitualSession: jest.fn(),
  };
  const useUnfoldStore = (selector: (s: typeof state) => unknown) => selector(state);
  useUnfoldStore.getState = () => state;
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
const phone = resolveAdaptiveLayout({ width: 393, height: 852, insetTop: 59, insetBottom: 34 });

function textOf(node: ReactTestInstance): string {
  return node
    .findAll((child) => typeof child.props.children === 'string')
    .map((child) => child.props.children as string)
    .join('|');
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
});
