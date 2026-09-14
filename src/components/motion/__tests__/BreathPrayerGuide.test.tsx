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
    useAnimatedReaction: jest.fn(),
    runOnJS: (fn: unknown) => fn,
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

function toggle(tree: renderer.ReactTestRenderer) {
  return tree.root.findByProps({ testID: 'breath-prayer-toggle' });
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
    expect(toggle(tree!).props.accessibilityLabel).toContain('The LORD is my shepherd');
  });

  it('makes the reserved circle the start and pause control', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = createGuide(
        <BreathPrayerGuide phrase="The LORD is my shepherd" visible colors={colors} />,
      );
    });

    const frame = StyleSheet.flatten(tree!.root.findByProps({ testID: 'breath-prayer-frame' }).props.style);
    const control = StyleSheet.flatten(toggle(tree!).props.style);
    expect(frame.width).toBe(BREATH_RESERVED_SIZE);
    expect(frame.height).toBe(BREATH_RESERVED_SIZE);
    expect(control.width).toBe(BREATH_RESERVED_SIZE);
    expect(control.height).toBe(BREATH_RESERVED_SIZE);
    expect(control.marginBottom).toBe(BREATH_BUTTON_CLEARANCE);
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'breath-prayer-ring')).toHaveLength(3);
    expect(tree!.root.findAllByProps({ testID: 'breath-prayer-begin' })).toHaveLength(0);
    expect(tree!.root.findAllByProps({ testID: 'breath-prayer-stop' })).toHaveLength(0);
    expect(toggle(tree!).props.accessibilityRole).toBe('button');
    expect(toggle(tree!).props.disabled).toBe(false);
    expect(toggle(tree!).props.accessibilityState).toEqual({ disabled: false, selected: false });
    expect(toggle(tree!).props.accessibilityLabel).toContain('Begin the optional breath guide');
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('Tap to begin');
  });

  it('toggles from the circle and keeps a stable press target', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = createGuide(
        <BreathPrayerGuide phrase="The LORD is my shepherd" visible colors={colors} />,
      );
    });

    act(() => {
      toggle(tree!).props.onPressIn();
    });
    expect(StyleSheet.flatten(toggle(tree!).props.style).opacity).toBe(0.88);
    act(() => {
      toggle(tree!).props.onPressOut();
      toggle(tree!).props.onPress();
    });

    expect(toggle(tree!).props.accessibilityState).toEqual({ disabled: false, selected: true });
    expect(toggle(tree!).props.accessibilityLabel).toContain('Pause the optional breath guide');
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('Breathe in');
    expect(tree!.root.findByProps({ testID: 'breath-prayer-hint' }).props.children).toBe('Tap to pause');
    expect(StyleSheet.flatten(toggle(tree!).props.style).width).toBe(BREATH_RESERVED_SIZE);
    expect(StyleSheet.flatten(toggle(tree!).props.style).opacity).toBe(1);

    act(() => {
      toggle(tree!).props.onPress();
    });

    expect(toggle(tree!).props.accessibilityState).toEqual({ disabled: false, selected: false });
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('Tap to begin');
    expect(tree!.root.findByProps({ testID: 'breath-prayer-hint' }).props.children).toBe(' ');
  });

  it('cancels on background and does not resume without a new tap', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = createGuide(
        <BreathPrayerGuide phrase="The LORD is my shepherd" visible colors={colors} />,
      );
    });

    act(() => {
      toggle(tree!).props.onPress();
    });
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('Breathe in');

    act(() => {
      appStateListener?.('background');
    });

    expect(toggle(tree!).props.accessibilityState.selected).toBe(false);
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('Tap to begin');

    act(() => {
      appStateListener?.('active');
    });

    expect(toggle(tree!).props.accessibilityState.selected).toBe(false);
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('Tap to begin');
  });

  it('cancels when the sheet hides and keeps the phrase available', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = createGuide(
        <BreathPrayerGuide phrase="I shall not want" visible colors={colors} />,
      );
    });
    act(() => {
      toggle(tree!).props.onPress();
    });
    act(() => {
      tree!.update(
        <BreathPrayerGuide phrase="I shall not want" visible={false} colors={colors} />,
      );
    });

    expect(toggle(tree!).props.accessibilityState.selected).toBe(false);
    expect(toggle(tree!).props.accessibilityLabel)
      .toContain('I shall not want');
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('Tap to begin');
  });

  it('keeps static rings and an own-pace pause control under reduced motion', () => {
    mockReducedMotion = true;
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = createGuide(
        <BreathPrayerGuide phrase="The LORD is my shepherd" visible colors={colors} />,
      );
    });
    act(() => {
      toggle(tree!).props.onPress();
    });

    expect(toggle(tree!).props.accessibilityState.selected).toBe(true);
    expect(toggle(tree!).props.disabled).toBe(false);
    expect(toggle(tree!).props.accessibilityLabel).toContain('Pause the optional breath guide');
    expect(tree!.root.findByProps({ testID: 'breath-prayer-cue' }).props.children).toBe('At your own pace');
    expect(tree!.root.findByProps({ testID: 'breath-prayer-hint' }).props.children).toBe('Tap to pause');
    expect(tree!.root.findAll((node) => typeof node.type === 'string' && node.props.testID === 'breath-prayer-ring')).toHaveLength(3);
  });
});
