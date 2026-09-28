import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

let mockReducedMotion = false;

jest.mock('react-native-reanimated', () => {
  const ReactActual = jest.requireActual('react');
  const { Text: RNText, View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { Text: RNText, View },
    // Reanimated keeps the FIRST animated style in React props for the life of
    // the component (PropsFilter); later frames exist only on the UI side and
    // survive a React commit only while the props registry still holds them.
    useAnimatedStyle: (updater: () => object) => {
      const first = ReactActual.useRef(null);
      if (first.current === null) first.current = updater();
      return first.current;
    },
    useSharedValue: (value: unknown) => ReactActual.useRef({ value }).current,
    useReducedMotion: () => mockReducedMotion,
    withTiming: (value: unknown) => value,
    withSpring: (value: unknown) => value,
    withDelay: (_delay: unknown, value: unknown) => value,
    withRepeat: (value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    cancelAnimation: () => undefined,
    interpolateColor: (progress: number, _input: number[], output: string[]) => (progress >= 1 ? output[1] : output[0]),
    Easing: { out: () => 0, in: () => 0, inOut: () => 0, cubic: 0, ease: 0, quad: 0, linear: 0, bezier: () => 0 },
  };
});
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('@/lib/theme', () => ({ useTheme: () => ({ colors: { text: '#F6EFE3', accent: '#C8A55C' } }) }));

import { TypewriterText } from '@/components/TypewriterText';

const QUESTION = "What's happening in your life?";
const TEXT_COLOR = '#F6EFE3';

/** Characters a reader can see, read from what React rendered (not UI-thread frames). */
function visibleText(view: ReactTestRenderer) {
  const glyphs = view.root.findAll(
    (node: ReactTestInstance) => node.type === Text && typeof node.props.children === 'string' && /^\S$/.test(node.props.children),
  );
  return glyphs
    .filter((node) => {
      const style = StyleSheet.flatten(node.props.style) ?? {};
      return style.opacity !== 0 && style.color !== 'transparent';
    })
    .map((node) => node.props.children)
    .join('');
}

describe('TypewriterText', () => {
  let view: ReactTestRenderer;

  beforeEach(() => {
    jest.useFakeTimers();
    mockReducedMotion = false;
  });

  afterEach(() => {
    act(() => view?.unmount());
    jest.useRealTimers();
  });

  it('leaves the whole headline visible in React once the reveal settles', () => {
    const onComplete = jest.fn();
    act(() => {
      view = create(<TypewriterText text={QUESTION} onComplete={onComplete} style={{ color: TEXT_COLOR }} />);
    });

    act(() => {
      jest.advanceTimersByTime(QUESTION.length * 20 + 400);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    // A later React commit (typing in the field below, say) re-renders from React
    // props. Nothing may depend on the animation registry to stay visible.
    expect(visibleText(view)).toBe(QUESTION.replace(/\s/g, ''));
  });

  it('shows each character at once under Reduce Motion', () => {
    mockReducedMotion = true;
    act(() => {
      view = create(<TypewriterText text={QUESTION} style={{ color: TEXT_COLOR }} />);
    });

    act(() => {
      jest.advanceTimersByTime(QUESTION.length * 20);
    });
    expect(visibleText(view)).toBe(QUESTION.replace(/\s/g, ''));
  });
});
