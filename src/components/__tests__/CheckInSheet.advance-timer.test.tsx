/**
 * Greptile A10 regression: the 300ms auto-advance timers were never retained,
 * so a close/reopen inside that window advanced the freshly reset sheet.
 */
import React from 'react';
import { TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { CheckInSheet } from '../CheckInSheet';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('@/components/icons', () => new Proxy({}, {
  get: (_target, name) => (name === '__esModule' ? true : () => null),
}));
jest.mock('@/components/VoiceInputBar', () => ({ VoiceInputBar: () => null }));
jest.mock('@/components/ui', () => ({ alpha: (c: string) => c }));
jest.mock('@/lib/theme', () => ({
  useTheme: () => ({ isDark: true, colors: new Proxy({}, { get: () => '#888888' }) }),
}));
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const chainable = () => {
    const anim: Record<string, unknown> = {};
    for (const method of ['duration', 'delay', 'easing', 'springify', 'damping', 'build']) anim[method] = () => anim;
    return anim;
  };
  return {
    __esModule: true,
    default: { View },
    FadeIn: chainable(),
    SlideInDown: chainable(),
    SlideOutDown: chainable(),
    Easing: { out: () => 'out', in: () => 'in', inOut: () => 'inOut', cubic: 'cubic' },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useReducedMotion: () => true,
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (v: unknown) => v,
    withDelay: (_d: number, a: unknown) => a,
    interpolate: (v: number) => v,
  };
});

function collectText(node: any): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!node || typeof node !== 'object') return [];
  return collectText(node.children ?? []);
}

const props = {
  onClose: jest.fn(),
  onComplete: jest.fn(),
  question: 'What are you carrying today?',
  devotionalId: 'd1',
  dayNumber: 1,
};

describe('CheckInSheet auto-advance timer (Greptile A10)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('stays on the mood step when the sheet is closed and reopened inside the advance window', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<CheckInSheet {...props} visible />);
    });
    const mood = tree!.root.findAll(
      (node) => node.type === TouchableOpacity && node.props.accessibilityLabel === 'Struggling',
    )[0];
    await act(async () => {
      mood.props.onPress();
    });
    await act(async () => {
      tree!.update(<CheckInSheet {...props} visible={false} />);
    });
    await act(async () => {
      tree!.update(<CheckInSheet {...props} visible />);
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });

    const text = collectText(tree!.toJSON()).join(' ');
    expect(text).toContain('How are you today?');
    expect(text).not.toContain(props.question);
  });

});
