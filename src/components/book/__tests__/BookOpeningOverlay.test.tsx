import React from 'react';
import { act, render } from '@testing-library/react-native';
import { BookOpeningOverlay } from '../BookOpeningOverlay';
import { clearBookOpening, useBookOpening, type BookOpeningSession } from '@/lib/book-opening';

const mockReactions: ((value: boolean, previous: boolean | null) => void)[] = [];
const mockTiming = jest.fn((value: number, _config?: { duration: number }, _finished?: (finished: boolean) => void) => value);
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

it('waits for canvas layout without adding a native backdrop over the source', () => {
  jest.useFakeTimers();
  try {
    const view = render(<BookOpeningOverlay />);
    const backdrop = () => view.queryByTestId('book-opening-backdrop', { includeHiddenElements: true });
    act(() => jest.advanceTimersByTime(40));
    expect(session.sourceHidden.value).toBe(false);
    expect(backdrop()).toBeNull();
    act(() => mockReactions[1](true, false));
    act(() => jest.advanceTimersByTime(48));
    expect(session.sourceHidden.value).toBe(true);
    expect(backdrop()).toBeNull();
  } finally { jest.useRealTimers(); }
});

it('keeps the source available when the canvas never becomes ready', () => {
  jest.useFakeTimers();
  try {
    render(<BookOpeningOverlay />);
    act(() => jest.advanceTimersByTime(1000));
    expect(useBookOpening.getState().session?.failed).toBe(true);
    expect(session.sourceHidden.value).toBe(false);
  } finally { jest.useRealTimers(); }
});

it('does not revive an opening cleared while presentation is pending', () => {
  jest.useFakeTimers();
  try {
    render(<BookOpeningOverlay />);
    act(() => mockReactions[1](true, false));
    act(() => clearBookOpening(session.id));
    act(() => jest.advanceTimersByTime(48));
    expect(useBookOpening.getState().session).toBeNull();
    expect(session.sourceHidden.value).toBe(false);
  } finally { jest.useRealTimers(); }
});

it('waits for expansion again after a full drag reverses before committing', () => {
  render(<BookOpeningOverlay />);
  const expansionChanged = mockReactions[0];
  act(() => expansionChanged(true, false));
  act(() => expansionChanged(false, true));
  act(() => useBookOpening.setState({ session: { ...session, committed: true, readerReady: true } }));
  expect(mockTiming).not.toHaveBeenCalled();
  act(() => expansionChanged(true, false));
  expect(mockTiming).toHaveBeenCalledWith(1, { duration: 240 }, expect.any(Function));
});


it('keeps the paper visible until the reader is ready, then reveals beneath the final turn', () => {
  render(<BookOpeningOverlay />);
  act(() => mockReactions[0](true, false));
  act(() => useBookOpening.setState({ session: { ...session, committed: true } }));
  expect(mockTiming).not.toHaveBeenCalled();
  act(() => useBookOpening.setState({ session: { ...session, committed: true, readerReady: true } }));
  expect(mockTiming).toHaveBeenCalledWith(1, { duration: 180 });
  expect(mockTiming).toHaveBeenCalledWith(1, { duration: 240 }, expect.any(Function));
  // The mocked backdrop already reaches its target, but the paper still owns the overlay.
  expect(useBookOpening.getState().session).not.toBeNull();
  const finishCurl = mockTiming.mock.calls.find(([, config]) => config?.duration === 240)?.[2];
  expect(finishCurl).toBeDefined();
  act(() => finishCurl?.(true));
  expect(useBookOpening.getState().session).toBeNull();
});


it('does not restart the legacy paper turn when reader readiness changes', () => {
  const paperSession = { ...session, cover: undefined, coverImage: undefined, committed: true };
  useBookOpening.setState({ session: paperSession });
  render(<BookOpeningOverlay />);
  act(() => mockReactions[0](true, false));
  expect(mockTiming).toHaveBeenCalledTimes(1);
  act(() => useBookOpening.setState({ session: { ...paperSession, readerReady: true } }));
  expect(mockTiming).toHaveBeenCalledTimes(1);
});
