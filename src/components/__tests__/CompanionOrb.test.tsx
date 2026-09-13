/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';
import { TouchableOpacity, View } from 'react-native';

const renderer = require('react-test-renderer');

jest.mock('react-native-reanimated', () => {
  const { View: RNView } = require('react-native');
  const easingFn = () => 0;
  return {
    __esModule: true,
    default: { View: RNView, createAnimatedComponent: (c: unknown) => c },
    Easing: {
      linear: easingFn,
      ease: easingFn,
      bezier: () => easingFn,
      inOut: () => easingFn,
    },
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    interpolate: (value: number) => value,
    cancelAnimation: jest.fn(),
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: (fn: () => unknown) => {
      try {
        return fn();
      } catch {
        return {};
      }
    },
    withTiming: jest.fn((toValue: unknown) => toValue),
    withRepeat: (animation: unknown) => animation,
    withDelay: jest.fn((_delay: number, animation: unknown) => animation),
    withSequence: (...parts: unknown[]) => parts[0],
    useReducedMotion: () => false,
  };
});

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({ reducedMotion: false }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-svg', () => {
  const { View: RNView } = require('react-native');
  const stub = (name: string) => {
    function SvgStub(props: Record<string, unknown>) {
      return <RNView accessibilityLabel={name} {...props} />;
    }
    SvgStub.displayName = name;
    return SvgStub;
  };
  return {
    __esModule: true,
    default: stub('Svg'),
    Svg: stub('Svg'),
    Circle: stub('Circle'),
    ClipPath: stub('ClipPath'),
    Defs: stub('Defs'),
    Ellipse: stub('Ellipse'),
    G: stub('G'),
    LinearGradient: stub('LinearGradient'),
    Path: stub('Path'),
    RadialGradient: stub('RadialGradient'),
    Rect: stub('Rect'),
    Stop: stub('Stop'),
  };
});

import { CompanionOrb } from '../CompanionOrb';
const { cancelAnimation: mockCancelAnimation, withTiming: mockWithTiming } = require('react-native-reanimated');

describe('CompanionOrb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps a stable square frame for rest and thinking', () => {
    let tree: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      tree = renderer.create(
        <CompanionOrb accentColor="#C8A55C" size={32} thinking={false} />,
      );
    });
    expect(tree!.toJSON().props.style).toEqual(
      expect.objectContaining({ width: 32, height: 32 }),
    );

    renderer.act(() => {
      tree.update(<CompanionOrb accentColor="#C8A55C" size={32} thinking />);
    });
    expect(tree!.toJSON().props.style).toEqual(
      expect.objectContaining({ width: 32, height: 32 }),
    );
  });

  it('adds button semantics only when pressable and never labels the orb as AI', () => {
    let decorative: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      decorative = renderer.create(<CompanionOrb accentColor="#C8A55C" size={24} />);
    });
    expect(decorative!.root.findAllByType(TouchableOpacity)).toHaveLength(0);

    const onPress = jest.fn();
    let pressable: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      pressable = renderer.create(
        <CompanionOrb accentColor="#C8A55C" size={32} onPress={onPress} />,
      );
    });
    const button = pressable!.root.findByType(TouchableOpacity);
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe('Companion');
    expect(button.props.accessibilityLabel).not.toMatch(/AI/i);
    renderer.act(() => {
      button.props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps the badge on the shared orb without changing the frame', () => {
    let tree: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      tree = renderer.create(
        <CompanionOrb accentColor="#C8A55C" size={36} showBadge isActive />,
      );
    });
    const badges = tree!.root.findAll(
      (node: { type?: unknown; props?: { style?: { backgroundColor?: string; width?: number } } }) =>
        typeof node.type === 'string' && node.props?.style?.backgroundColor === '#C8A55C' && node.props.style.width === 8,
    );
    expect(badges).toHaveLength(1);
    expect(tree!.toJSON().props.style).toEqual(
      expect.objectContaining({ width: 36, height: 36 }),
    );
  });

  it('accepts isActive without treating it as thinking', () => {
    let tree: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      tree = renderer.create(
        <CompanionOrb accentColor="#C8A55C" size={48} isActive expression="welcome" />,
      );
    });
    expect(tree!.root.findAllByType(View).length).toBeGreaterThan(0);
    expect(tree!.toJSON().props.style).toEqual(
      expect.objectContaining({ width: 48, height: 48 }),
    );
  });

  it('cancels all decorative motion when its screen loses focus', () => {
    let tree: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      tree = renderer.create(<CompanionOrb accentColor="#C8A55C" size={48} active />);
    });
    mockCancelAnimation.mockClear();
    renderer.act(() => {
      tree!.update(<CompanionOrb accentColor="#C8A55C" size={48} active={false} />);
    });
    expect(mockCancelAnimation.mock.calls.length).toBeGreaterThanOrEqual(10);
  });

  it('returns vertical thinking motion to rest before an interrupted reunion', () => {
    let tree: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      tree = renderer.create(<CompanionOrb accentColor="#C8A55C" size={64} thinking />);
    });
    mockWithTiming.mockClear();
    renderer.act(() => {
      tree!.update(<CompanionOrb accentColor="#C8A55C" size={64} thinking={false} />);
    });
    expect(mockWithTiming).toHaveBeenCalledWith(0, expect.objectContaining({ duration: 240 }));
  });

  it('fades turn weight instead of rewinding its phase when thinking interrupts joy', () => {
    let tree: ReturnType<typeof renderer.create>;
    renderer.act(() => {
      tree = renderer.create(<CompanionOrb accentColor="#C8A55C" size={64} idleStyle="joyful" />);
    });
    mockWithTiming.mockClear();
    renderer.act(() => {
      tree!.update(<CompanionOrb accentColor="#C8A55C" size={64} idleStyle="joyful" thinking />);
    });
    expect(mockWithTiming).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ duration: 420 }),
      expect.any(Function),
    );
  });
});
