import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { DrawnCheck } from '../DrawnCheck';

let mockReducedMotion = false;
const mockTiming = jest.fn((value: number) => value);

jest.mock('@/hooks/useAccessibility', () => ({
  useAccessibleAnimation: () => ({ reducedMotion: mockReducedMotion }),
}));
jest.mock('react-native-reanimated', () => {
  const ReactActual = jest.requireActual('react');
  return {
    __esModule: true,
    default: { createAnimatedComponent: (component: unknown) => component },
    useSharedValue: (value: unknown) => ReactActual.useRef({ value }).current,
    useAnimatedProps: (factory: () => unknown) => factory(),
    withTiming: (value: number) => mockTiming(value),
    cancelAnimation: jest.fn(),
    Easing: { cubic: 'cubic', out: () => 'out', in: () => 'in', inOut: () => 'inOut' },
  };
});
jest.mock('react-native-svg', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View, Path: View };
});

beforeEach(() => {
  mockReducedMotion = false;
  mockTiming.mockClear();
});

it('does not replay a saved check when its question or sheet opens again', () => {
  const history = { current: 0 };
  let tree: renderer.ReactTestRenderer;
  const check = (playKey: number) => <DrawnCheck visible color="#C8A55C" playKey={playKey} playedKeyRef={history} />;
  act(() => { tree = renderer.create(check(1)); });
  expect(mockTiming).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
  act(() => { tree = renderer.create(check(1)); });
  expect(mockTiming).toHaveBeenCalledTimes(1);
  act(() => tree.update(check(2)));
  expect(mockTiming).toHaveBeenCalledTimes(2);
  act(() => tree.unmount());
});

it('keeps an already completed check still when Reduce Motion turns off', () => {
  mockReducedMotion = true;
  const history = { current: 0 };
  let tree: renderer.ReactTestRenderer;
  const check = <DrawnCheck visible color="#C8A55C" playKey={1} playedKeyRef={history} />;
  act(() => { tree = renderer.create(check); });
  expect(mockTiming).not.toHaveBeenCalled();
  mockReducedMotion = false;
  act(() => tree.update(<DrawnCheck visible color="#C8A55C" playKey={1} playedKeyRef={history} />));
  expect(mockTiming).not.toHaveBeenCalled();
  act(() => tree.unmount());
});
