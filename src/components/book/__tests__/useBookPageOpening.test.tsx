import { act, renderHook } from '@testing-library/react-native';
import { View } from 'react-native';
import { Colors } from '@/constants/colors';
import { useBookOpening, failBookOverlay, markBookOverlayPresented, bookOpeningProgress, shouldOpenBook } from '@/lib/book-opening';
import { useBookPageOpening } from '../useBookPageOpening';
import type { BookTodayPage } from '@/lib/book-of-seasons';

let mockFocused = true;
let mockReducedMotion = false;
const mockSnapshot = jest.fn();
const mockGestureHandlers: Record<string, (event: { translationX: number; velocityX: number }) => void> = {};
const mockFinishes: ((finished: boolean) => void)[] = [];

jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@/hooks/useAccessibility', () => ({ useAccessibleAnimation: () => ({ reducedMotion: mockReducedMotion }) }));
jest.mock('@shopify/react-native-skia', () => ({ makeImageFromView: (...args: unknown[]) => mockSnapshot(...args) }));
jest.mock('react-native-reanimated', () => ({
  useSharedValue: (value: number) => jest.requireActual('react').useRef({ value }).current,
  useAnimatedStyle: (style: () => unknown) => style(),
  cancelAnimation: jest.fn(),
  runOnJS: (fn: unknown) => fn,
  withTiming: (value: number, _config: unknown, finish: (finished: boolean) => void) => { if (finish) mockFinishes.push(finish); return value; },
  Easing: { bezier: jest.fn() },
}));
jest.mock('react-native-gesture-handler', () => {
  const gesture = new Proxy({}, { get: (_target, key: string) => (handler: typeof mockGestureHandlers[string]) => {
    if (['onStart', 'onUpdate', 'onEnd'].includes(key)) mockGestureHandlers[key] = handler;
    return gesture;
  } });
  return { Gesture: { Pan: () => gesture } };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined),
}));

const page: BookTodayPage = {
  dayNumber: 2, totalDays: 3, title: 'The Middle Hour', contentReady: true,
  completedToday: true, seriesComplete: false, canOpen: true, action: 'read-again', eyebrow: 'today-complete',
};
const cover = { id: 'devo-1', title: 'Ordinary Hours', createdAt: '2026-05-01T00:00:00.000Z' };
function setup(hardcover = false) {
  const view = new View({});
  view.measureInWindow = (callback) => callback(20, 150, 350, 350);
  const pageRef = { current: view };
  const onContinue = jest.fn();
  const hook = renderHook(() => useBookPageOpening({
    pageRef, coverRef: hardcover ? { current: new View({}) } : undefined,
    page, colors: Colors, isDark: true, onContinue, cover: hardcover ? cover : undefined,
  }));
  return { ...hook, onContinue };
}

beforeEach(() => {
  mockFocused = true;
  mockReducedMotion = false;
  mockSnapshot.mockReset().mockResolvedValue({});
  mockFinishes.length = 0;
  useBookOpening.setState({ session: null });
});

it('ignores a second tap during the finish and navigates once', async () => {
  const hook = setup();
  await act(async () => hook.result.current.open());
  const session = useBookOpening.getState().session;
  expect(session?.progress.value).toBe(0);
  act(() => { if (session) markBookOverlayPresented(session.id); });
  expect(session?.progress.value).toBe(1);
  expect(hook.onContinue).not.toHaveBeenCalled();
  await act(async () => hook.result.current.open());
  expect(session?.progress.value).toBe(1);
  expect(mockSnapshot).toHaveBeenCalledTimes(1);
  expect(mockFinishes).toHaveLength(1);
  act(() => mockFinishes[0](true));
  expect(hook.onContinue).toHaveBeenCalledTimes(1);
});

it('cancels an uncommitted opening on source blur', async () => {
  const hook = setup();
  await act(async () => hook.result.current.open());
  const session = useBookOpening.getState().session;
  mockFocused = false;
  hook.rerender({});
  act(() => { if (session) markBookOverlayPresented(session.id); });
  expect(hook.onContinue).not.toHaveBeenCalled();
  expect(useBookOpening.getState().session).toBeNull();
});

it('opens once when the renderer fails before its first frame', async () => {
  const hook = setup();
  await act(async () => hook.result.current.open());
  const session = useBookOpening.getState().session;
  act(() => { if (session) failBookOverlay(session.id); });
  expect(hook.onContinue).toHaveBeenCalledTimes(1);
  expect(useBookOpening.getState().session).toBeNull();
  act(() => { if (session) markBookOverlayPresented(session.id); });
  expect(hook.onContinue).toHaveBeenCalledTimes(1);
});

it('discards a snapshot that returns after source blur', async () => {
  let resolveSnapshot: (value: unknown) => void = () => {};
  mockSnapshot.mockImplementation(() => new Promise((resolve) => { resolveSnapshot = resolve; }));
  const hook = setup();
  await act(async () => hook.result.current.open());
  mockFocused = false;
  hook.rerender({});
  await act(async () => resolveSnapshot({}));
  expect(hook.onContinue).not.toHaveBeenCalled();
  expect(useBookOpening.getState().session).toBeNull();
});

it('does not navigate if the source loses focus during expansion', async () => {
  const hook = setup();
  await act(async () => hook.result.current.open());
  const session = useBookOpening.getState().session;
  act(() => { if (session) markBookOverlayPresented(session.id); });
  mockFocused = false;
  hook.rerender({});
  act(() => mockFinishes[0](true));
  expect(hook.onContinue).not.toHaveBeenCalled();
  expect(useBookOpening.getState().session).toBeNull();
});

it('opens directly with reduced motion and avoids capture', async () => {
  mockReducedMotion = true;
  const hook = setup();
  await act(async () => hook.result.current.open());
  expect(hook.onContinue).toHaveBeenCalledTimes(1);
  await act(async () => hook.result.current.open());
  expect(hook.onContinue).toHaveBeenCalledTimes(1);
  expect(hook.onContinue).toHaveBeenCalledWith(expect.stringContaining('book-opening-'));
  expect(mockSnapshot).not.toHaveBeenCalled();
  expect(useBookOpening.getState().session).toBeNull();
});

it('keeps tap access when capture fails', async () => {
  mockSnapshot.mockRejectedValue(new Error('snapshot unavailable'));
  const hook = setup();
  await act(async () => hook.result.current.open());
  expect(hook.onContinue).toHaveBeenCalledTimes(1);
});

it('clamps reverse drags and overshoot without allowing accidental flicks', () => {
  expect(bookOpeningProgress(30, 320)).toBe(0);
  expect(bookOpeningProgress(-1000, 320)).toBe(1);
  expect(shouldOpenBook(0.07, -2000)).toBe(false);
  expect(shouldOpenBook(0.2, 0)).toBe(false);
  expect(shouldOpenBook(0.2, -700)).toBe(true);
  expect(shouldOpenBook(0.4, 0)).toBe(true);
});


it('keeps the source visible and the fold flat until an early drag can be presented', async () => {
  let resolveSnapshot: (value: unknown) => void = () => {};
  mockSnapshot.mockImplementation(() => new Promise(resolve => { resolveSnapshot = resolve; }));
  const hook = setup();
  await act(async () => mockGestureHandlers.onStart({ translationX: 0, velocityX: 0 }));
  act(() => {
    mockGestureHandlers.onUpdate({ translationX: -240, velocityX: -800 });
    mockGestureHandlers.onEnd({ translationX: -240, velocityX: -800 });
  });
  expect(hook.onContinue).not.toHaveBeenCalled();
  await act(async () => resolveSnapshot({}));
  const session = useBookOpening.getState().session!;
  expect(session.progress.value).toBe(0);
  expect(session.sourceHidden.value).toBe(false);
  act(() => markBookOverlayPresented(session.id));
  expect(session.sourceHidden.value).toBe(true);
  expect(session.progress.value).toBe(1);
  act(() => mockFinishes[0](true));
  expect(hook.onContinue).toHaveBeenCalledTimes(1);
});

it('restores the source after a short drag ends during capture', async () => {
  let resolveSnapshot: (value: unknown) => void = () => {};
  mockSnapshot.mockImplementation(() => new Promise(resolve => { resolveSnapshot = resolve; }));
  const hook = setup();
  await act(async () => mockGestureHandlers.onStart({ translationX: 0, velocityX: 0 }));
  act(() => {
    mockGestureHandlers.onUpdate({ translationX: -30, velocityX: 0 });
    mockGestureHandlers.onEnd({ translationX: -30, velocityX: 0 });
  });
  await act(async () => resolveSnapshot({}));
  const session = useBookOpening.getState().session!;
  act(() => markBookOverlayPresented(session.id));
  act(() => mockFinishes[0](true));
  expect(session.sourceHidden.value).toBe(false);
  expect(useBookOpening.getState().session).toBeNull();
  expect(hook.onContinue).not.toHaveBeenCalled();
});

it('keeps paper sessions free of hardcover data', async () => {
  const hook = setup();
  await act(async () => hook.result.current.open());
  const session = useBookOpening.getState().session;
  expect(session?.cover).toBeUndefined();
  expect(mockSnapshot).toHaveBeenCalledTimes(1);
});

it('keeps the interior and cover separate and waits for the opening before navigation', async () => {
  const coverImage = { source: 'cover' };
  const paperImage = { source: 'paper' };
  mockSnapshot.mockResolvedValueOnce(paperImage).mockResolvedValueOnce(coverImage);
  const hook = setup(true);
  await act(async () => hook.result.current.open());
  const session = useBookOpening.getState().session;
  expect(session?.cover).toEqual(cover);
  expect(mockSnapshot).toHaveBeenCalledTimes(2);
  expect(session?.image).toBe(paperImage);
  expect(session?.coverImage).toBe(coverImage);
  act(() => { if (session) markBookOverlayPresented(session.id); });
  expect(hook.onContinue).not.toHaveBeenCalled();
  expect(useBookOpening.getState().session?.committed).toBe(true);
  act(() => mockFinishes[0](true));
  expect(hook.onContinue).toHaveBeenCalledTimes(1);
  mockFocused = false;
  hook.rerender({});
  expect(session?.sourceHidden.value).toBe(true);
  expect(session?.progress.value).toBe(1);
  expect(hook.onContinue).toHaveBeenCalledTimes(1);
  expect(useBookOpening.getState().session?.sourceHidden.value).toBe(true);
});

it('holds a hardcover drag closed until the overlay can present', async () => {
  const hook = setup(true);
  await act(async () => mockGestureHandlers.onStart({ translationX: 0, velocityX: 0 }));
  act(() => {
    mockGestureHandlers.onUpdate({ translationX: -240, velocityX: -800 });
    mockGestureHandlers.onEnd({ translationX: -240, velocityX: -800 });
  });
  const session = useBookOpening.getState().session!;
  expect(session.cover).toEqual(cover);
  expect(session.progress.value).toBe(0);
  expect(session.sourceHidden.value).toBe(false);
  expect(mockSnapshot).toHaveBeenCalledTimes(2);
  act(() => markBookOverlayPresented(session.id));
  expect(session.sourceHidden.value).toBe(true);
  expect(session.progress.value).toBe(1);
  act(() => mockFinishes[0](true));
  expect(hook.onContinue).toHaveBeenCalledTimes(1);
});

it('navigates after a stalled capture and ignores its late image', async () => {
  jest.useFakeTimers();
  try {
    let resolveSnapshot: (value: unknown) => void = () => {};
    mockSnapshot.mockImplementation(() => new Promise(resolve => { resolveSnapshot = resolve; }));
    const hook = setup();
    await act(async () => hook.result.current.open());
    act(() => jest.advanceTimersByTime(700));
    expect(hook.onContinue).toHaveBeenCalledTimes(1);
    await act(async () => resolveSnapshot({}));
    expect(useBookOpening.getState().session).toBeNull();
    expect(hook.onContinue).toHaveBeenCalledTimes(1);
    hook.unmount();
  } finally {
    jest.useRealTimers();
  }
});
