/**
 * The companion's greeting is drawn per local day. An Ask tab left mounted
 * overnight greets with the next day's line after local midnight.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { CompanionEmptyState } from '../CompanionEmptyState';
import { companionGreeting } from '@/constants/daily-copy';
import { dayIndexFor } from '@/lib/variation-bag';

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const animation: Record<string, unknown> = {};
  animation.duration = () => animation;
  animation.easing = () => animation;
  return {
    __esModule: true,
    default: { View },
    FadeOut: animation,
    Easing: { out: () => 'out', in: () => 'in', inOut: () => 'inOut', cubic: 'cubic' },
    useReducedMotion: () => true,
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: (value: number) => value,
    withDelay: (_delay: number, value: number) => value,
  };
});
jest.mock('@/components/icons', () => new Proxy({}, {
  get: (_target, name) => (name === '__esModule' ? true : () => null),
}));
jest.mock('@/lib/theme', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#888888' }) }) }));
jest.mock('@/lib/store', () => ({
  useUnfoldStore: (selector: (state: unknown) => unknown) => selector({ user: { name: 'Sam' }, devotionals: [] }),
}));
jest.mock('@/lib/mmkv-storage', () => ({ getDeviceId: () => 'install-a' }));

type Tree = ReactTestRenderer;

const greetingOn = (date: Date) => companionGreeting('Sam', { seed: 'install-a', dayIndex: dayIndexFor(date) });

it('greets with the next day’s line after local midnight on a mounted Ask tab', () => {
  jest.useFakeTimers({ now: new Date(2026, 9, 16, 23, 59, 50) });
  let tree: Tree | undefined;
  try {
    act(() => {
      tree = renderer.create(<CompanionEmptyState onSelectStarter={jest.fn()} />);
    });
    const texts = () => tree!.root.findAllByType(Text).map((node) => node.props.children);
    expect(texts()).toContain(greetingOn(new Date(2026, 9, 16)));

    act(() => {
      jest.advanceTimersByTime(20_000);
    });

    expect(texts()).toContain(greetingOn(new Date(2026, 9, 17)));
    expect(texts()).not.toContain(greetingOn(new Date(2026, 9, 16)));
  } finally {
    act(() => tree?.unmount());
    jest.useRealTimers();
  }
});
