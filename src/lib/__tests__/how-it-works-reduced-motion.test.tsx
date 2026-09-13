import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import HowItWorksScreen, { AnimatedBody, AnimatedHeadline, FEATURE_PAGES } from '@/app/how-it-works';

const mockWithDelay = jest.fn((_delay: number, value: unknown) => value);
let mockFontScale = 1;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }),
}));

jest.mock('react-native-reanimated', () => {
  const ReactActual = jest.requireActual('react');
  const native = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { Text: native.Text, View: native.View },
    Easing: {
      back: () => 'back',
      bezier: () => 'bezier',
      cubic: 'cubic',
      ease: 'ease',
      in: () => 'in',
      inOut: () => 'inOut',
      out: () => 'out',
      quad: 'quad',
    },
    FadeIn: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
    interpolate: jest.fn(),
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (initial: unknown) => ReactActual.useRef({ value: initial }).current,
    withDelay: (delay: number, value: unknown) => mockWithDelay(delay, value),
    withRepeat: jest.fn(),
    withSequence: jest.fn(),
    withTiming: (value: unknown) => value,
  };
});

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: {
    Pan: () => {
      const gesture = {
        activeOffsetX: () => gesture,
        failOffsetY: () => gesture,
        onEnd: () => gesture,
      };
      return gesture;
    },
  },
}));
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  impactAsync: jest.fn(),
}));
jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({ reducedMotion: true }),
}));
jest.mock('@/lib/store', () => ({
  ACCENT_THEMES: [],
  useUnfoldStore: (selector: (state: object) => unknown) => selector({ user: null }),
}));

it('renders shared feature text without scheduling delayed motion when Reduce Motion is enabled', () => {
  mockWithDelay.mockClear();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <>
        <AnimatedHeadline text="A steady welcome" color="#111" pageKey={0} reducedMotion />
        <AnimatedBody text="The body is visible immediately." color="#333" pageKey={0} reducedMotion />
      </>,
    );
  });

  expect(mockWithDelay).not.toHaveBeenCalled();
  expect(tree.toJSON()).not.toBeNull();
});

it('keeps route state mounted while live font changes remount text and expose control semantics', () => {
  mockFontScale = 1;
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<HowItWorksScreen />); });
  act(() => { tree.root.findByProps({ accessibilityLabel: 'Continue' }).props.onPress(); });

  const headline = tree.root.findByProps({ accessibilityLabel: FEATURE_PAGES[1].headline });
  const scroll = tree.root.findByType(ScrollView);
  const skip = tree.root.findByProps({ accessibilityLabel: 'Skip introduction' });

  expect(headline.props.accessibilityRole).toBe('header');
  expect(headline.findAllByProps({ importantForAccessibility: 'no' }).length).toBeGreaterThan(0);
  expect(StyleSheet.flatten(skip.props.style)).toEqual(expect.objectContaining({ minWidth: 44, minHeight: 44 }));
  expect(skip.props.accessibilityRole).toBe('button');
  expect(tree.root.findByProps({ accessibilityLabel: 'Continue' }).props.accessibilityRole).toBe('button');
  expect(tree.root.findByProps({ accessibilityLabel: `Step 2 of ${FEATURE_PAGES.length}` }).props.accessibilityRole).toBe('text');

  mockFontScale = 2;
  act(() => { tree.update(<HowItWorksScreen />); });

  expect(tree.root.findByType(ScrollView)).toBe(scroll);
  expect(tree.root.findByProps({ accessibilityLabel: FEATURE_PAGES[1].headline })).not.toBe(headline);
  expect(tree.root.findByProps({ accessibilityLabel: `Step 2 of ${FEATURE_PAGES.length}` })).toBeDefined();
  expect(tree.root.findByProps({ accessibilityLabel: 'Skip introduction' })).toBe(skip);
});
