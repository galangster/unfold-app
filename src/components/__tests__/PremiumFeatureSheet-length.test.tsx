/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from 'react';
import { render } from '@testing-library/react-native';

let mockChapteredSeriesEnabled = false;
jest.mock('@/hooks/useChapteredSeriesEnabled', () => ({
  useChapteredSeriesEnabled: () => mockChapteredSeriesEnabled,
}));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    runOnJS: (fn: unknown) => fn,
    Easing: { out: () => 0, in: () => 0, inOut: () => 0, cubic: 0, quad: 0, linear: 0, bezier: () => 0 },
    withTiming: (v: unknown) => v,
    useReducedMotion: () => true,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    withSpring: (v: unknown) => v,
  };
});
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const pan = () => {
    const gesture: Record<string, unknown> = {};
    for (const method of ['onStart', 'onUpdate', 'onEnd', 'onChange', 'onFinalize', 'enabled', 'activeOffsetY', 'failOffsetX']) {
      gesture[method] = () => gesture;
    }
    return gesture;
  };
  return { Gesture: { Pan: pan }, GestureDetector: ({ children }: { children: unknown }) => children, GestureHandlerRootView: View };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ colors: { accent: '#C8A55C', text: '#F6EFE3', textMuted: '#B8AA96', background: '#111' }, isDark: true }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));

import { PremiumFeatureSheet } from '../PremiumFeatureSheet';

describe('premium length sheet (row 3)', () => {
  afterEach(() => {
    mockChapteredSeriesEnabled = false;
  });

  it('reads the chapters switch for its description', () => {
    expect(render(<PremiumFeatureSheet visible onClose={jest.fn()} feature="devotionalLength" />)
      .getByText('Go deeper with 14-day and 30-day series. Free users can create up to 7-day series.')).toBeTruthy();
    mockChapteredSeriesEnabled = true;
    expect(render(<PremiumFeatureSheet visible onClose={jest.fn()} feature="devotionalLength" />)
      .getByText('Go deeper with 14-day and 4-week series. Free users can create up to 7-day series.')).toBeTruthy();
  });

  it('keeps a fixed description on every other sheet', () => {
    expect(render(<PremiumFeatureSheet visible onClose={jest.fn()} feature="readingDuration" />)
      .getByText('Unlock 30-minute devotionals for a deeper daily experience. Free users get up to 15 minutes.')).toBeTruthy();
  });
});
