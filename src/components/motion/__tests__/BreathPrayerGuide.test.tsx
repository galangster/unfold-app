import React from 'react';
import { AppState, StyleSheet, type AppStateStatus } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { BreathPrayerGuide } from '../BreathPrayerGuide';
import {
  BREATH_BUTTON_CLEARANCE,
  BREATH_RESERVED_SIZE,
} from '@/lib/meaningful-motion';

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

  it('does not repeat the phrase above the circle and keeps it for accessibility', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = createGuide(
        <BreathPrayerGuide phrase="The LORD is my shepherd" visible colors={colors} />,
      );
    });

    expect(tree!.root.findAllByProps({ testID: 'breath-prayer-phrase' })).toHaveLength(0);
    expect(tree!.root.findByProps({ testID: 'breath-prayer-guide' }).props.accessibilityLabel)
      .toContain('The LORD is my shepherd');
  });

  it('reserves peak halo bounds and 24-point button clearance', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = createGuide(
        <BreathPrayerGuide phrase="The LORD is my shepherd" visible colors={colors} />,
      );
    });

    const frame = StyleSheet.flatten(tree!.root.findByProps({ testID: 'breath-prayer-frame' }).props.style);
    expect(frame.width).toBe(BREATH_RESERVED_SIZE);
    expect(frame.height).toBe(BREATH_RESERVED_SIZE);
    expect(tree!.root.findByProps({ testID: 'breath-prayer-halo' })).toBeTruthy();
    expect(tree!.root.findByProps({ testID: 'breath-prayer-ring' })).toBeTruthy();

    const begin = tree!.root.findByProps({ testID: 'breath-prayer-begin' });
    const pressedStyle = begin.props.style;
    const flattened = StyleSheet.flatten(pressedStyle);
    expect(flattened.marginTop).toBe(BREATH_BUTTON_CLEARANCE);
    expect(flattened.borderRadius).toBe(12);
    expect(begin.props.disabled).toBe(false);
    expect(begin.props.accessibilityState).toEqual({ disabled: false });
  });

  it('keeps Begin enabled through press cancellation', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = createGuide(
        <BreathPrayerGuide phrase="The LORD is my shepherd" visible colors={colors} />,
      );
    });

    const begin = tree!.root.findByProps({ testID: 'breath-prayer-begin' });
    act(() => {
      begin.props.onPressIn();
    });
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'breath-prayer-begin' }).props.style).opacity).toBe(0.88);
    act(() => {
      begin.props.onPressOut();
    });

    expect(tree!.root.findByProps({ testID: 'breath-prayer-begin' })).toBeTruthy();
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('At your own pace');
    expect(tree!.root.findByProps({ testID: 'breath-prayer-begin' }).props.disabled).toBe(false);
    expect(StyleSheet.flatten(tree!.root.findByProps({ testID: 'breath-prayer-begin' }).props.style).opacity).toBe(1);
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
    expect(tree!.root.findByProps({ testID: 'breath-prayer-guide' }).props.accessibilityLabel)
      .toContain('I shall not want');
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('At your own pace');
  });

  it('keeps a static halo and untimed cue under reduced motion even after Begin', () => {
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
    expect(tree!.root.findByProps({ testID: 'breath-prayer-stop' }).props.disabled).toBe(false);
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('At your own pace');
    expect(tree!.root.findByProps({ testID: 'breath-prayer-halo' })).toBeTruthy();
  });
});
