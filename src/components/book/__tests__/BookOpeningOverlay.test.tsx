import React from 'react';
import { act, render } from '@testing-library/react-native';
import { BookOpeningOverlay } from '../BookOpeningOverlay';
import { useBookOpening, type BookOpeningSession } from '@/lib/book-opening';

const mockReactions: ((value: boolean, previous: boolean | null) => void)[] = [];
const mockTiming = jest.fn((value: number) => value);
const mockCanvasSnapshot = jest.fn(() => Promise.resolve({ dispose: jest.fn() }));
jest.mock('@/hooks/useAccessibility', () => ({ useAccessibleAnimation: () => ({ reducedMotion: false }) }));
jest.mock('react-native-screens', () => ({ FullWindowOverlay: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@shopify/react-native-skia', () => {
  const container = ({ children }: { children: React.ReactNode }) => children;
  return {
    Canvas: container, Fill: container, Shader: container, ImageShader: () => null,
    useCanvasRef: () => jest.requireActual('react').useRef({ makeImageSnapshotAsync: () => mockCanvasSnapshot() }),
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
  mockCanvasSnapshot.mockReset().mockResolvedValue({ dispose: jest.fn() });
  session = {
    id: 'opening-test', image: {}, coverImage: {},
    cover: { id: 'book', title: 'Ordinary Hours', createdAt: '2026-09-14' },
    rect: { x: 40, y: 100, width: 256, height: 358 },
    progress: { value: 0 }, sourceHidden: { value: false },
    paperColor: '#ffffff', presented: false, committed: false, readerReady: false,
  } as BookOpeningSession;
  useBookOpening.setState({ session });
});

it('confirms a renderer frame without inserting a native backdrop over the source', async () => {
  jest.useFakeTimers();
  try {
    let finishFrame!: () => void;
    mockCanvasSnapshot.mockImplementationOnce(() => new Promise(resolve => {
      finishFrame = () => resolve({ dispose: jest.fn() });
    }));
    const view = render(<BookOpeningOverlay />);
    const backdrop = () => view.queryByTestId('book-opening-backdrop', { includeHiddenElements: true });
    await act(async () => mockReactions[1](true, false));
    act(() => jest.advanceTimersByTime(40));
    expect(session.sourceHidden.value).toBe(false);
    expect(backdrop()).toBeNull();
    await act(async () => finishFrame());
    act(() => jest.advanceTimersByTime(48));
    expect(session.sourceHidden.value).toBe(true);
    expect(backdrop()).toBeNull();
  } finally { jest.useRealTimers(); }
});

it('keeps the source visible when renderer confirmation fails', async () => {
  mockCanvasSnapshot.mockRejectedValueOnce(new Error('Renderer unavailable'));
  render(<BookOpeningOverlay />);
  await act(async () => mockReactions[1](true, false));
  expect(useBookOpening.getState().session?.failed).toBe(true);
  expect(session.sourceHidden.value).toBe(false);
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
