import React from 'react';
import { ScrollView, TextInput, TouchableOpacity } from 'react-native';
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
  KeyboardAvoidingView: jest.requireActual('react-native').View,
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
  // Four pages, as in the app: the companion card goes in after the third,
  // so it is not the last page.
  FEATURE_PAGES: [
    { headline: 'First', body: 'First body', animation: 'dots' },
    { headline: 'Second', body: 'Second body', animation: 'lines' },
    { headline: 'Third', body: 'Third body', animation: 'dots' },
    { headline: 'Fourth', body: 'Fourth body', animation: 'lines' },
  ],
  CardAnimation: (props: unknown) => mockCardAnimation(props),
  AnimatedHeadline: (props: unknown) => mockAnimatedHeadline(props),
  AnimatedBody: (props: unknown) => mockAnimatedBody(props),
}));
jest.mock('@/lib/support-clarity', () => ({
  COMPANION_INTRO_BODY: 'Companion body',
  COMPANION_NAME_LATER_HINT: 'You can change this name later in Profile.',
  COMPANION_NAME_MAX_LENGTH: 30,
}));
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
      companionName=""
      onCompanionNameChange={jest.fn()}
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
    expect(tree.root.findByProps({ accessibilityLabel: 'Step 1 of 5' }).props.accessibilityRole).toBe('text');
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
        companionName=""
        onCompanionNameChange={jest.fn()}
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
        companionName=""
        onCompanionNameChange={jest.fn()}
        companionPersonality={personality}
        onCompanionPersonalityChange={setPersonality}
        currentPage={3}
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
    expect(tree.root.findByProps({ accessibilityLabel: 'Step 4 of 5' })).toBeDefined();
  });

  // 1.1.18 release smoke (F10): since 2026-09-13 onboarding did not ask the
  // reader to name the companion, and every reader got the default name.
  it('asks for the companion name on the companion card only', () => {
    function Harness({ page }: { page: number }) {
      const [name, setName] = React.useState('');
      return <FeatureSummaryCarousel
        colors={colors}
        companionName={name}
        onCompanionNameChange={setName}
        companionPersonality="gentle"
        onCompanionPersonalityChange={jest.fn()}
        currentPage={page}
        onPageChange={jest.fn()}
        onComplete={jest.fn()}
      />;
    }
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<Harness page={0} />); });
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);

    act(() => { tree.update(<Harness page={3} />); });
    const field = tree.root.findByType(TextInput);
    expect(field.props.accessibilityLabel).toBe('Companion name');
    expect(field.props.maxLength).toBe(30);

    act(() => { field.props.onChangeText('Selah'); });
    expect(tree.root.findByType(TextInput).props.value).toBe('Selah');
  });

  // V1 keeps Next above the keyboard, so a reader can tap Next while the name
  // field has focus. The page change unmounts the field and no blur arrives.
  it('scrolls to the name field only while it has focus on the companion page', () => {
    function Harness() {
      const [page, setPage] = React.useState(3);
      return <FeatureSummaryCarousel
        colors={colors}
        companionName=""
        onCompanionNameChange={jest.fn()}
        companionPersonality="gentle"
        onCompanionPersonalityChange={jest.fn()}
        currentPage={page}
        onPageChange={(next) => setPage((prev) => (typeof next === 'function' ? next(prev) : next))}
        onComplete={jest.fn()}
      />;
    }
    let tree!: renderer.ReactTestRenderer;
    act(() => { tree = renderer.create(<Harness />); });
    // The page remounts its scroll view, so the spy is taken again after Next.
    const spyOnScroll = () => jest.spyOn(tree.root.findByType(ScrollView).instance, 'scrollToEnd');
    const companionScroll = spyOnScroll();
    const layout = () => act(() => {
      tree.root.findByType(ScrollView).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 400 } } });
    });

    act(() => { tree.root.findByType(TextInput).props.onFocus(); });
    layout();
    expect(companionScroll).toHaveBeenCalledTimes(1);

    const next = tree.root.findAllByType(TouchableOpacity)
      .find((node) => node.props.accessibilityLabel === 'Next');
    act(() => { next!.props.onPress(); });
    expect(tree.root.findByProps({ accessibilityLabel: 'Step 5 of 5' })).toBeDefined();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);

    const nextPageScroll = spyOnScroll();
    nextPageScroll.mockClear();
    layout();
    layout();
    expect(nextPageScroll).not.toHaveBeenCalled();
  });
});
