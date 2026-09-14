import React from 'react';
import { AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { REVEAL_REPRESENTATIVE_TIME, buildRevealPalette } from '@/lib/reveal-gradient-palette';

import { useFrameCallback } from 'react-native-reanimated';
import { RevealGradient } from '@/components/reveal/RevealGradient';

const mockFrameCallback = { setActive: jest.fn() };
const mockSharedValues: { value: unknown }[] = [];

jest.mock('react-native-reanimated', () => ({
  useSharedValue: (initial: unknown) => {
    const { useRef } = jest.requireActual<typeof import('react')>('react');
    const ref = useRef<{ value: unknown } | null>(null);
    if (!ref.current) {
      ref.current = { value: initial };
      mockSharedValues.push(ref.current);
    }
    return ref.current;
  },
  useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
  useFrameCallback: jest.fn(() => mockFrameCallback),
}));

jest.mock('@shopify/react-native-skia', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Canvas: View, Fill: View, Group: View, Blur: View, Shader: View };
});
jest.mock('@/components/reveal/reveal-gradient-shader', () => ({ getRevealRuntimeEffect: () => ({}) }));

const required = { variant: 'prism' as const, accent: '#C8A55C', background: '#0A0A0A', isDark: true };

describe('RevealGradient lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
    mockSharedValues.length = 0;
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  });

  it('starts disabled, then gates the clock on focus and live reduced motion', () => {
    const tree = render(<RevealGradient {...required} />);
    expect(useFrameCallback).toHaveBeenCalledWith(expect.any(Function), false);
    expect(mockFrameCallback.setActive).toHaveBeenLastCalledWith(true);
    tree.rerender(<RevealGradient {...required} active={false} />);
    expect(mockFrameCallback.setActive).toHaveBeenLastCalledWith(false);
    tree.rerender(<RevealGradient {...required} reducedMotion />);
    expect(mockFrameCallback.setActive).toHaveBeenLastCalledWith(false);
    expect(mockSharedValues[0].value).toBe(REVEAL_REPRESENTATIVE_TIME);
    tree.rerender(<RevealGradient {...required} />);
    expect(mockFrameCallback.setActive).toHaveBeenLastCalledWith(true);
    tree.unmount();
    expect(mockFrameCallback.setActive).toHaveBeenLastCalledWith(false);
  });

  it('stops on background and removes the listener on unmount', () => {
    let notify: (state: 'background' | 'active') => void = () => undefined;
    const remove = jest.fn();
    const add = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      notify = listener;
      return { remove };
    });
    const tree = render(<RevealGradient {...required} />);
    act(() => notify('background'));
    expect(mockFrameCallback.setActive).toHaveBeenLastCalledWith(false);
    act(() => notify('active'));
    expect(mockFrameCallback.setActive).toHaveBeenLastCalledWith(true);
    tree.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    add.mockClear();
  });

  it('retints the existing clock when the accent changes', () => {
    const tree = render(<RevealGradient {...required} />);
    const time = mockSharedValues[0];
    time.value = 3.5;
    const count = mockSharedValues.length;
    tree.rerender(<RevealGradient {...required} accent="#9B8EC4" />);
    expect(mockSharedValues.length).toBe(count);
    expect(time.value).toBe(3.5);
    expect(mockSharedValues.at(-1)?.value).toEqual(buildRevealPalette('#9B8EC4', '#0A0A0A', true));
  });

  it('presents about 30 updates per second on a 60Hz display', () => {
    render(<RevealGradient {...required} />);
    const callback = jest.mocked(useFrameCallback).mock.calls[0][0];
    const time = mockSharedValues[0];
    let current = time.value;
    let updates = 0;
    Object.defineProperty(time, 'value', {
      get: () => current,
      set: (value: unknown) => { current = value; updates += 1; },
    });
    for (let index = 0; index < 60; index += 1) {
      callback({ timestamp: 1000 + index * 1000 / 60, timeSincePreviousFrame: index === 0 ? null : 1000 / 60, timeSinceFirstFrame: index * 1000 / 60 });
    }
    expect(updates).toBeGreaterThanOrEqual(29);
    expect(updates).toBeLessThanOrEqual(31);
  });
});
