import React from 'react';
import renderer, { act } from 'react-test-renderer';
import type { ColorTheme } from '@/constants/colors';
import { ShockStat } from '../ShockStat';

jest.mock('react-native-reanimated', () => {
  const native = jest.requireActual('react-native');
  const animation = {
    duration: () => animation,
    easing: () => animation,
    delay: () => animation,
  };
  return {
    __esModule: true,
    default: { View: native.View, Text: native.Text },
    FadeIn: animation,
    Easing: { cubic: 'cubic', in: () => 'in', inOut: () => 'inOut', out: () => 'out' },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: (value: unknown) => value,
    withDelay: (_delay: unknown, value: unknown) => value,
    cancelAnimation: () => undefined,
    useReducedMotion: () => false,
  };
});
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Medium: 'medium', Heavy: 'heavy' },
  impactAsync: jest.fn(),
}));

const colors = { accent: '#C8A55C', textMuted: '#B8AA96' } as unknown as ColorTheme;

// 1.1.18 release smoke (F04): VoiceOver read the typed-in numbers one
// character at a time ("9, 3, %") and joined "deeper" and "relationship".
describe('ShockStat accessibility', () => {
  it('reads each stat as one sentence with normal spaces', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ShockStat colors={colors} />);
    });

    const labels = tree.root
      .findAll((node) => node.props.accessible === true && typeof node.props.accessibilityLabel === 'string', { deep: false })
      .map((node) => node.props.accessibilityLabel);

    expect(labels).toEqual([
      '93% of Christians want a deeper relationship with God.',
      '11% read the Bible daily.',
    ]);
    act(() => tree.unmount());
  });
});
