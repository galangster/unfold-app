import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { BreathPrayerGuide } from '../BreathPrayerGuide';

let mockReducedMotion = false;

jest.mock('react-native-reanimated', () => {
  const { View, Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View, Text, createAnimatedComponent: (component: unknown) => component },
    useSharedValue: (value: unknown) => jest.requireActual('react').useRef({ value }).current,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withTiming: (value: unknown) => value,
    withRepeat: (value: unknown) => value,
    cancelAnimation: jest.fn(),
    Easing: { cubic: 'cubic', out: () => 'out', in: () => 'in', inOut: () => 'inOut' },
  };
});

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({
    reducedMotion: mockReducedMotion,
    entering: (anim: unknown) => anim,
    exiting: (anim: unknown) => anim,
  }),
}));

const colors = {
  accent: '#C8A55C',
  background: '#000000',
  text: '#FFFFFF',
  textMuted: '#AAAAAA',
};

const trees: renderer.ReactTestRenderer[] = [];
function createGuide(element: React.ReactElement) {
  const tree = renderer.create(element);
  trees.push(tree);
  return tree;
}

describe('BreathPrayerGuide', () => {
  let appStateListener: ((state: AppStateStatus) => void) | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    AppState.currentState = 'active';
    mockReducedMotion = false;
    appStateListener = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'change') appStateListener = listener;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => {
    act(() => trees.splice(0).forEach((tree) => tree.unmount()));
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('stops on background and does not resume without a new Begin', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = createGuide(
        <BreathPrayerGuide phrase="The LORD is my shepherd" visible colors={colors} />,
      );
    });

    act(() => {
      tree!.root.findByProps({ testID: 'breath-prayer-begin' }).props.onPress();
    });
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('Breathe in');

    act(() => {
      appStateListener?.('background');
    });

    expect(tree!.root.findByProps({ testID: 'breath-prayer-begin' })).toBeTruthy();
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('At your own pace');

    act(() => {
      appStateListener?.('active');
    });

    expect(tree!.root.findByProps({ testID: 'breath-prayer-begin' })).toBeTruthy();
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('At your own pace');
  });

  it('stops when the sheet hides and keeps the phrase available', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = createGuide(
        <BreathPrayerGuide phrase="I shall not want" visible colors={colors} />,
      );
    });
    act(() => {
      tree!.root.findByProps({ testID: 'breath-prayer-begin' }).props.onPress();
    });
    act(() => {
      tree!.update(
        <BreathPrayerGuide phrase="I shall not want" visible={false} colors={colors} />,
      );
    });

    expect(tree!.root.findByProps({ testID: 'breath-prayer-begin' })).toBeTruthy();
    expect(tree!.root.findByProps({ testID: 'breath-prayer-phrase' }).props.children).toBe('I shall not want');
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('At your own pace');
  });

  it('keeps a static ring under reduced motion even after Begin', () => {
    mockReducedMotion = true;
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = createGuide(
        <BreathPrayerGuide phrase="The LORD is my shepherd" visible colors={colors} />,
      );
    });
    act(() => {
      tree!.root.findByProps({ testID: 'breath-prayer-begin' }).props.onPress();
    });

    expect(tree!.root.findByProps({ testID: 'breath-prayer-stop' })).toBeTruthy();
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('At your own pace');
  });
});
