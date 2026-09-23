import React from 'react';
import * as renderer from 'react-test-renderer';

import type { ColorTheme } from '@/constants/colors';
import { VoiceAnswerButton } from '../VoiceAnswerButton';

const { act } = renderer;

let mockReducedMotion = false;
const mockCancelAnimation = jest.fn();

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({ reducedMotion: mockReducedMotion }),
}));

jest.mock('react-native-reanimated', () => {
  const ReactNative = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View: ReactNative.View },
    cancelAnimation: (...args: unknown[]) => mockCancelAnimation(...args),
    Easing: { linear: 'linear' },
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: number) => ({ value }),
    withDelay: (_delay: number, value: unknown) => value,
    withSequence: (...values: unknown[]) => values.at(-1),
    withTiming: (value: number) => value,
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: (props: object) => {
    const ReactActual = jest.requireActual('react');
    const ReactNative = jest.requireActual('react-native');
    return ReactActual.createElement(ReactNative.View, props);
  },
}));

jest.mock('@/components/icons', () => ({ MicrophoneIcon: () => null }));
jest.mock('@/components/ui', () => ({ alpha: (color: string) => color }));

const colors = {
  accent: '#C8A55C',
  background: '#0A0A0A',
  text: '#F5F0EB',
  textMuted: '#A09B96',
} as ColorTheme;

describe('VoiceAnswerButton', () => {
  beforeEach(() => {
    mockReducedMotion = false;
    mockCancelAnimation.mockClear();
  });

  it('removes and cancels the shine when reduced motion changes while mounted', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<VoiceAnswerButton colors={colors} onPress={jest.fn()} />);
    });
    const shine = () => tree.root.findAll((node) => node.props.accessibilityElementsHidden === true);
    expect(shine().length).toBeGreaterThan(0);

    mockReducedMotion = true;
    await act(async () => {
      tree.update(<VoiceAnswerButton colors={colors} onPress={jest.fn()} />);
    });

    expect(shine()).toHaveLength(0);
    expect(mockCancelAnimation).toHaveBeenCalled();
    await act(async () => tree.unmount());
  });
});
