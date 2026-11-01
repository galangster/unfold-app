/**
 * The Today greeting follows the clock Today passes in. A Today left mounted
 * from the morning into the evening, then into the next morning, shows the
 * greeting for each hour and each local day, not the one it first drew.
 */
import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { GreetingRow } from '../GreetingRow';
import { todayGreeting } from '@/constants/daily-copy';
import { dayIndexFor } from '@/lib/variation-bag';

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const animation: Record<string, unknown> = {};
  animation.duration = () => animation;
  animation.delay = () => animation;
  animation.easing = () => animation;
  return {
    __esModule: true,
    default: { View },
    FadeIn: animation,
    Easing: { out: () => 'out', in: () => 'in', inOut: () => 'inOut', cubic: 'cubic' },
  };
});
jest.mock('@/lib/theme', () => ({ useTheme: () => ({ colors: { text: '#111111', textMuted: '#666666' } }) }));
jest.mock('@/hooks/useAccessibility', () => ({ useAccessibleAnimation: () => ({ entering: (value: unknown) => value }) }));
jest.mock('@/components/StreakDisplay', () => ({ StreakDisplay: () => null }));
jest.mock('@/components/ProfileAvatar', () => ({ ProfileAvatar: () => null }));
jest.mock('@/lib/mmkv-storage', () => ({ getDeviceId: () => 'install-a' }));

type Tree = ReactTestRenderer;

/** The line above the reader's name: the first text the row renders. */
function greetingOf(tree: Tree): string {
  return tree.root.findAllByType(Text)[0].props.children;
}

it('draws a new greeting when Today passes a later hour, and again on the next local day', () => {
  const clocks = [new Date(2026, 9, 16, 7, 30), new Date(2026, 9, 16, 21, 30), new Date(2026, 9, 17, 7, 30)];
  let tree!: Tree;
  act(() => {
    tree = renderer.create(<GreetingRow userName="Sam" now={clocks[0]} onAvatarPress={jest.fn()} />);
  });
  const shown = [greetingOf(tree)];
  for (const now of clocks.slice(1)) {
    act(() => tree.update(<GreetingRow userName="Sam" now={now} onAvatarPress={jest.fn()} />));
    shown.push(greetingOf(tree));
  }
  act(() => tree.unmount());

  expect(shown).toEqual(clocks.map((now) => todayGreeting(now.getHours(), { seed: 'install-a', dayIndex: dayIndexFor(now) })));
  // Morning, night, and the next morning are three different lines.
  expect(new Set(shown).size).toBe(3);
});
