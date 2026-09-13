import React from 'react';
import { TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { FeatureSummaryCarousel } from '../FeatureSummaryCarousel';
import type { CompanionPersonality } from '@/lib/companion-personality';

let mockReducedMotion = true;
let mockFontScale = 1;
const mockCardAnimation = jest.fn((_props: unknown) => null);
const mockAnimatedHeadline = jest.fn((props: unknown) => React.createElement('AnimatedHeadline', props as object));
const mockAnimatedBody = jest.fn((props: unknown) => React.createElement('AnimatedBody', props as object));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }),
}));

jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 20, left: 0 }),
}));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: jest.requireActual('react-native').View,
}));
jest.mock('react-native-gesture-handler', () => {
  const native = jest.requireActual('react-native');
  return {
    TouchableOpacity: native.TouchableOpacity,
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
  };
});
jest.mock('react-native-reanimated', () => {
  const native = jest.requireActual('react-native');
  const animation = {
    duration: () => animation,
    easing: () => animation,
    delay: () => animation,
  };
  return {
    __esModule: true,
    default: { View: native.View },
    FadeIn: animation,
    FadeOut: animation,
    Easing: {
      cubic: 'cubic',
      in: () => 'in',
      inOut: () => 'inOut',
      out: () => 'out',
    },
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});
jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({ reducedMotion: mockReducedMotion }),
}));
jest.mock('@/components/CompanionOrb', () => ({ CompanionOrb: () => null }));
jest.mock('@/app/how-it-works', () => ({
  FEATURE_PAGES: [
    { headline: 'First', body: 'First body', animation: 'dots' },
    { headline: 'Second', body: 'Second body', animation: 'lines' },
  ],
  CardAnimation: (props: unknown) => mockCardAnimation(props),
  AnimatedHeadline: (props: unknown) => mockAnimatedHeadline(props),
  AnimatedBody: (props: unknown) => mockAnimatedBody(props),
}));
jest.mock('@/lib/support-clarity', () => ({ COMPANION_INTRO_BODY: 'Companion body' }));
jest.mock('@/lib/companion-personality', () => ({
  COMPANION_PERSONALITIES: [
    { value: 'gentle', label: 'Gentle', description: 'A quiet guide' },
    { value: 'encouraging', label: 'Encouraging', description: 'A warm guide' },
  ],
}));

const colors = {
  accent: '#B68B32',
  background: '#FFFDF9',
  border: '#DDD7CE',
  inputBackground: '#F7F3ED',
  text: '#211D18',
  textMuted: '#6C645B',
} as any;

function createCarousel(currentPage = 0, onPageChange = jest.fn()) {
  return renderer.create(
    <FeatureSummaryCarousel
      colors={colors}
      companionPersonality="gentle"
      onCompanionPersonalityChange={jest.fn()}
      currentPage={currentPage}
      onPageChange={onPageChange}
      onComplete={jest.fn()}
    />,
  );
}

describe('FeatureSummaryCarousel accessibility', () => {
  beforeEach(() => {
    mockReducedMotion = true;
    mockFontScale = 1;
    mockCardAnimation.mockClear();
    mockAnimatedHeadline.mockClear();
    mockAnimatedBody.mockClear();
  });

  it('forwards live Reduce Motion and exposes progress and button semantics', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = createCarousel(); });

    expect(mockCardAnimation).toHaveBeenLastCalledWith(expect.objectContaining({ reducedMotion: true }));
    expect(mockAnimatedHeadline).toHaveBeenLastCalledWith(expect.objectContaining({ reducedMotion: true }));
    expect(mockAnimatedBody).toHaveBeenLastCalledWith(expect.objectContaining({ reducedMotion: true }));
    expect(tree.root.findByProps({ accessibilityLabel: 'Step 1 of 3' }).props.accessibilityRole).toBe('text');
    const nextButton = tree.root.findAllByType(TouchableOpacity)
      .find((node) => node.props.accessibilityLabel === 'Next');
    expect(nextButton?.props.accessibilityRole).toBe('button');
  });

  it('remounts shared text leaves when the live font scale changes', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = createCarousel(); });

    const headline = tree.root.findByType('AnimatedHeadline' as any);
    const body = tree.root.findByType('AnimatedBody' as any);

    mockFontScale = 2;
    act(() => { tree.update(
      <FeatureSummaryCarousel
        colors={colors}
        companionPersonality="gentle"
        onCompanionPersonalityChange={jest.fn()}
        currentPage={0}
        onPageChange={jest.fn()}
        onComplete={jest.fn()}
      />,
    ); });

    expect(tree.root.findByType('AnimatedHeadline' as any)).not.toBe(headline);
    expect(tree.root.findByType('AnimatedBody' as any)).not.toBe(body);
  });

  it('keeps the selected personality and its control mounted during a text-size change', () => {
    function Harness() {
      const [personality, setPersonality] = React.useState<CompanionPersonality>('gentle');
      return <FeatureSummaryCarousel
        colors={colors}
        companionPersonality={personality}
        onCompanionPersonalityChange={setPersonality}
        currentPage={2}
        onPageChange={jest.fn()}
        onComplete={jest.fn()}
      />;
    }
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<Harness />); });
    const choices = () => tree.root.findAllByType(TouchableOpacity)
      .filter((node) => node.props.accessibilityRole === 'radio');
    const encouraging = choices()[1];
    act(() => { encouraging.props.onPress(); });

    mockFontScale = 2;
    act(() => { tree.update(<Harness />); });

    expect(choices()[1]).toBe(encouraging);
    expect(choices()[1].props.accessibilityState.checked).toBe(true);
    expect(tree.root.findByProps({ accessibilityLabel: 'Step 3 of 3' })).toBeDefined();
  });

});
