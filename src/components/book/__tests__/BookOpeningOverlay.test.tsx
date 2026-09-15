import React from 'react';
import { act, render } from '@testing-library/react-native';
import { BookOpeningOverlay } from '../BookOpeningOverlay';
import { clearBookOpening, useBookOpening, type BookOpeningSession } from '@/lib/book-opening';

const mockReactions: ((value: boolean, previous: boolean | null) => void)[] = [];
const mockTiming = jest.fn((value: number, _config?: { duration: number }, _finished?: (finished: boolean) => void) => value);
let lastUniforms: { curlProgress?: number; backgroundOpacity?: number; readerFade?: number } | undefined;
jest.mock('@/hooks/useAccessibility', () => ({ useAccessibleAnimation: () => ({ reducedMotion: false }) }));
jest.mock('react-native-screens', () => ({ FullWindowOverlay: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@shopify/react-native-skia', () => {
  const container = ({ children }: { children: React.ReactNode }) => children;
  return {
    Canvas: container, Fill: container,
    Shader: ({ uniforms, children }: { uniforms: unknown; children: React.ReactNode }) => {
      const u = uniforms as { value?: typeof lastUniforms } | typeof lastUniforms | undefined;
      lastUniforms = (u && 'value' in u ? u.value : u) as typeof lastUniforms;
      return children;
    },
    ImageShader: () => null,
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
  lastUniforms = undefined;
  session = {
    id: 'opening-test', image: {}, coverImage: {},
    cover: { id: 'book', title: 'Ordinary Hours', createdAt: '2026-09-14' },
    rect: { x: 40, y: 100, width: 256, height: 358 },
    progress: { value: 0 }, sourceHidden: { value: false }, backdrop: { value: 0 },
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

it('keeps hardcover curl at zero at every progress', () => {
  session.progress.value = 0.9;
  session.sourceHidden.value = true;
  useBookOpening.setState({ session: { ...session } });
  render(<BookOpeningOverlay />);
  expect(lastUniforms?.curlProgress).toBe(0);
  session.progress.value = 1;
  act(() => useBookOpening.setState({ session: { ...session } }));
  expect(lastUniforms?.curlProgress).toBe(0);
});

it('fades the hardcover backdrop with the first 15 percent of progress', () => {
  session.sourceHidden.value = true;
  session.progress.value = 0;
  useBookOpening.setState({ session: { ...session } });
  render(<BookOpeningOverlay />);
  expect(lastUniforms?.backgroundOpacity).toBe(0);
  session.progress.value = 0.075;
  act(() => useBookOpening.setState({ session: { ...session } }));
  expect(lastUniforms?.backgroundOpacity).toBeCloseTo(0.5);
});

it('crossfades the interior only after the reader snapshot arrives', () => {
  render(<BookOpeningOverlay />);
  expect(mockTiming).not.toHaveBeenCalled();
  expect(lastUniforms?.readerFade).toBe(0);
  act(() => useBookOpening.setState({
    session: { ...session, readerImage: { width: () => 390, height: () => 844 } as BookOpeningSession['readerImage'] },
  }));
  expect(mockTiming).toHaveBeenCalledWith(1, { duration: 120 });
});

it('clears the hardcover overlay straight onto the reader when its snapshot is under the board', () => {
  const readerImage = { width: () => 1206, height: () => 2622 } as BookOpeningSession['readerImage'];
  render(<BookOpeningOverlay />);
  act(() => mockReactions[0](true, false));
  act(() => useBookOpening.setState({ session: { ...session, committed: true, readerImage, readerWidth: 1206 } }));
  expect(useBookOpening.getState().session).not.toBeNull();
  act(() => useBookOpening.setState({ session: { ...session, committed: true, readerImage, readerWidth: 1206, readerReady: true } }));
  expect(useBookOpening.getState().session).toBeNull();
  expect(mockTiming).not.toHaveBeenCalledWith(0, expect.objectContaining({ duration: 120 }), expect.any(Function));
  act(() => mockReactions[0](true, false));
  expect(useBookOpening.getState().session).toBeNull();
});

it('fades the hardcover overlay onto the live reader when no snapshot arrived before the turn', () => {
  render(<BookOpeningOverlay />);
  act(() => mockReactions[0](true, false));
  act(() => useBookOpening.setState({ session: { ...session, committed: true, readerReady: true } }));
  expect(useBookOpening.getState().session).not.toBeNull();
  const handoff = mockTiming.mock.calls.find((call) => call[0] === 0 && call[1]?.duration === 120);
  expect(handoff).toBeDefined();
  act(() => handoff?.[2]?.(true));
  expect(useBookOpening.getState().session).toBeNull();
});

it('waits for expansion again after a full drag reverses before committing', () => {
  const readerImage = { width: () => 1206, height: () => 2622 } as BookOpeningSession['readerImage'];
  render(<BookOpeningOverlay />);
  const expansionChanged = mockReactions[0];
  act(() => expansionChanged(true, false));
  act(() => expansionChanged(false, true));
  act(() => useBookOpening.setState({ session: { ...session, committed: true, readerImage, readerWidth: 1206, readerReady: true } }));
  expect(useBookOpening.getState().session).not.toBeNull();
  // Only the interior fade to the snapshot may run here; nothing clears before expansion.
  expect(mockTiming).not.toHaveBeenCalledWith(0, expect.anything(), expect.anything());
  act(() => expansionChanged(true, false));
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
