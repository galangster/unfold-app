import React from 'react';
import { act, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { BookOpeningOverlay } from '../BookOpeningOverlay';
import { useBookOpening, type BookOpeningSession } from '@/lib/book-opening';

const mockReactions: Array<(value: boolean, previous: boolean | null) => void> = [];
const mockTiming = jest.fn((value: number) => value);
jest.mock('@/hooks/useAccessibility', () => ({ useAccessibleAnimation: () => ({ reducedMotion: false }) }));
jest.mock('react-native-screens', () => ({ FullWindowOverlay: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@shopify/react-native-skia', () => {
  const container = ({ children }: { children: React.ReactNode }) => children;
  return {
    Canvas: container, Fill: container, Shader: container, ImageShader: () => null,
    Skia: { RuntimeEffect: { Make: () => ({}) }, Color: () => [0, 0, 0, 1] },
  };
});
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  useSharedValue: (value: unknown) => jest.requireActual('react').useRef({ value }).current,
  useDerivedValue: (value: () => unknown) => ({ value: value() }),
  useAnimatedStyle: (style: () => unknown) => style(),
  useAnimatedReaction: (_prepare: unknown, reaction: typeof mockReactions[number]) => { mockReactions.push(reaction); },
  runOnJS: (fn: unknown) => fn,
  withTiming: (...args: unknown[]) => (mockTiming as jest.Mock)(...args),
  withDelay: (_delay: number, value: unknown) => value,
  cancelAnimation: jest.fn(),
}));

let session: BookOpeningSession;
beforeEach(() => {
  mockReactions.length = 0;
  mockTiming.mockClear();
  session = {
    id: 'opening-test', image: {}, coverImage: {},
    cover: { id: 'book', title: 'Ordinary Hours', createdAt: '2026-09-14' },
    rect: { x: 40, y: 100, width: 256, height: 358 },
    progress: { value: 0 }, sourceHidden: { value: false },
    paperColor: '#ffffff', presented: false, committed: false, readerReady: false,
  } as BookOpeningSession;
  useBookOpening.setState({ session });
});

it('keeps the backdrop transparent until the replacement has painted', () => {
  const view = render(<BookOpeningOverlay />);
  const backdrop = () => view.getByTestId('book-opening-backdrop', { includeHiddenElements: true });
  expect(StyleSheet.flatten(backdrop().props.style).opacity).toBe(0);
  act(() => {
    session.sourceHidden.value = true;
    useBookOpening.setState({ session: { ...session, presented: true } });
  });
  expect(StyleSheet.flatten(backdrop().props.style).opacity).toBe(1);
});

it('waits for expansion again after a full drag reverses before committing', () => {
  render(<BookOpeningOverlay />);
  const expansionChanged = mockReactions[0];
  act(() => expansionChanged(true, false));
  act(() => expansionChanged(false, true));
  act(() => useBookOpening.setState({ session: { ...session, committed: true } }));
  expect(mockTiming).not.toHaveBeenCalled();
  act(() => expansionChanged(true, false));
  expect(mockTiming).toHaveBeenCalledWith(1, { duration: 240 }, expect.any(Function));
});
