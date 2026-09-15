import {
  BOOK_OPENING_EXPAND_END,
  BOOK_OPENING_READY_HOLD_MS,
  BOOK_OPENING_TURN_MS,
  HARDCOVER_HINGE_DEGREES,
  bookActionLabel,
  bookOpeningBackdropOpacity,
  bookOpeningCancelDuration,
  bookOpeningExpand,
  bookOpeningTurnDuration,
  bookPlaceLine,
  hardcoverHingeDegrees,
  heroBookSize,
  markBookReaderReady,
  setBookReaderImage,
  useBookOpening,
  type BookOpeningSession,
  markBookTurnStarted,
  hardcoverDragProgress,
  HARDCOVER_DRAG_MAX,
  clearBookOpening,
  BOOK_OPENING_DISPOSE_DELAY_MS,
} from '../book-opening';
import type { BookTodayPage } from '../book-of-seasons';
import type { SkImage } from '@shopify/react-native-skia';

const page: BookTodayPage = {
  dayNumber: 2,
  totalDays: 7,
  title: 'The Middle Hour',
  contentReady: true,
  completedToday: false,
  seriesComplete: false,
  canOpen: true,
  action: 'continue',
  eyebrow: 'today',
};

function session(overrides: Partial<BookOpeningSession> = {}): BookOpeningSession {
  return {
    id: 'opening-1',
    image: {} as SkImage,
    rect: { x: 0, y: 0, width: 100, height: 140 },
    progress: { value: 0 },
    sourceHidden: { value: false },
    paperColor: '#fff',
    presented: true,
    committed: true,
    readerReady: false,
    ...overrides,
  } as BookOpeningSession;
}

beforeEach(() => {
  useBookOpening.setState({ session: null });
});


it('scales cancel duration with cover progress', () => {
  expect(bookOpeningCancelDuration(0)).toBe(80);
  expect(bookOpeningCancelDuration(0.25)).toBe(145);
  expect(bookOpeningCancelDuration(1)).toBe(240);
  expect(bookOpeningCancelDuration(-1)).toBe(80);
  expect(bookOpeningCancelDuration(2)).toBe(240);
});

it('uses a 650 ms full hardcover turn and a 700 ms readiness hold', () => {
  expect(BOOK_OPENING_TURN_MS).toBe(650);
  expect(BOOK_OPENING_READY_HOLD_MS).toBe(1200);
  expect(bookOpeningTurnDuration(0)).toBe(650);
  expect(bookOpeningTurnDuration(0.08)).toBe(650);
  expect(bookOpeningTurnDuration(0.5)).toBe(353);
  expect(bookOpeningTurnDuration(1)).toBe(0);
});

it('fades the hardcover backdrop across the first 15 percent of progress', () => {
  expect(bookOpeningBackdropOpacity(0, true)).toBe(0);
  expect(bookOpeningBackdropOpacity(0.075, true)).toBeCloseTo(0.5);
  expect(bookOpeningBackdropOpacity(0.15, true)).toBe(1);
  expect(bookOpeningBackdropOpacity(1, true)).toBe(1);
  expect(bookOpeningBackdropOpacity(1, false)).toBe(0);
});

it('marks the reader ready only on the committed session', () => {
  useBookOpening.setState({ session: session({ committed: false }) });
  markBookReaderReady('opening-1');
  expect(useBookOpening.getState().session?.readerReady).toBe(false);
  useBookOpening.setState({ session: session() });
  markBookReaderReady('other');
  expect(useBookOpening.getState().session?.readerReady).toBe(false);
  markBookReaderReady('opening-1');
  expect(useBookOpening.getState().session?.readerReady).toBe(true);
});

it('stores the reader snapshot once', () => {
  const first = { id: 'first', width: () => 1206, height: () => 2622 } as unknown as SkImage;
  const second = { id: 'second', width: () => 1206, height: () => 2622 } as unknown as SkImage;
  useBookOpening.setState({ session: session() });
  setBookReaderImage('opening-1', first);
  setBookReaderImage('opening-1', second);
  setBookReaderImage('other', second);
  expect(useBookOpening.getState().session?.readerImage).toBe(first);
});

it('hinges the cover from the left spine and matches shader expansion', () => {
  expect(hardcoverHingeDegrees(0)).toBeCloseTo(0);
  expect(hardcoverHingeDegrees(1)).toBe(HARDCOVER_HINGE_DEGREES);
  expect(hardcoverHingeDegrees(0.5)).toBe(HARDCOVER_HINGE_DEGREES / 2);
  expect(bookOpeningExpand(0)).toBe(0);
  expect(bookOpeningExpand(BOOK_OPENING_EXPAND_END)).toBe(1);
  expect(bookOpeningExpand(1)).toBe(1);
  expect(bookOpeningExpand(BOOK_OPENING_EXPAND_END / 2)).toBeCloseTo(0.5);
});

it('shrinks the hero book on short screens and larger text', () => {
  const phone = heroBookSize(390, 844, 1);
  expect(phone.height / phone.width).toBeCloseTo(1.4, 1);
  const small = heroBookSize(320, 568, 1);
  expect(small.height).toBeLessThan(phone.height);
  expect(small.height).toBeLessThan(568 * 0.44);
  const largeType = heroBookSize(390, 844, 1.6);
  expect(largeType.height).toBeLessThan(phone.height);
});

it('keeps continue copy aligned with the paper page', () => {
  expect(bookActionLabel('continue')).toBe('Continue reading');
  expect(bookActionLabel('read-again')).toBe('Read again');
  expect(bookActionLabel(null)).toBeNull();
  expect(bookPlaceLine(page)).toBeUndefined();
  expect(bookPlaceLine({ ...page, completedToday: true })).toBe('Your next reading will be here tomorrow.');
});

it('stores the reader snapshot only before the turn starts, and marks ready once', () => {
  const progress = { value: 0.08 } as never;
  const session = {
    id: 'opening-store', image: {} as never, rect: { x: 0, y: 0, width: 200, height: 280 },
    progress, sourceHidden: { value: true } as never, backdrop: { value: 1 } as never,
    paperColor: '#fff', presented: true, committed: true, readerReady: false,
    cover: { id: 'book', title: 'Book', createdAt: '2026-09-15' },
  } as BookOpeningSession;
  useBookOpening.setState({ session });
  markBookReaderReady('other');
  expect(useBookOpening.getState().session?.readerReady).toBe(false);
  markBookReaderReady('opening-store');
  expect(useBookOpening.getState().session?.readerReady).toBe(true);
  const image = { width: () => 1206, height: () => 2622 } as never;
  expect(setBookReaderImage('opening-store', image)).toBe(true);
  expect(useBookOpening.getState().session?.readerWidth).toBe(1206);
  expect(setBookReaderImage('opening-store', image)).toBe(false);
  useBookOpening.setState({ session: { ...session, readerImage: undefined, readerWidth: undefined } });
  markBookTurnStarted('opening-store');
  expect(useBookOpening.getState().session?.turnStarted).toBe(true);
  expect(setBookReaderImage('opening-store', image)).toBe(false);
  expect(useBookOpening.getState().session?.readerImage).toBeUndefined();
  useBookOpening.setState({ session: null });
});

it('stops a dragged hardcover short of edge-on with a rubber band beyond the stop', () => {
  expect(HARDCOVER_DRAG_MAX).toBe(0.55);
  expect(hardcoverDragProgress(0)).toBe(0);
  expect(hardcoverDragProgress(0.4)).toBe(0.4);
  expect(hardcoverDragProgress(0.55)).toBe(0.55);
  expect(hardcoverDragProgress(0.75)).toBeCloseTo(0.6);
  expect(hardcoverDragProgress(1)).toBeCloseTo(0.6625);
  expect(hardcoverDragProgress(5)).toBeCloseTo(0.6625);
});

it('disposes every session image two frames after the session clears, and survives a second clear', () => {
  jest.useFakeTimers();
  try {
    const dispose = jest.fn();
    const throwingDispose = jest.fn(() => { throw new Error('already disposed'); });
    const session = {
      id: 'opening-dispose', image: { dispose } as never, coverImage: { dispose: throwingDispose } as never,
      readerImage: { dispose, width: () => 1206 } as never, readerWidth: 1206,
      rect: { x: 0, y: 0, width: 200, height: 280 },
      progress: { value: 1 } as never, sourceHidden: { value: true } as never, backdrop: { value: 1 } as never,
      paperColor: '#fff', presented: true, committed: true, readerReady: true,
      cover: { id: 'book', title: 'Book', createdAt: '2026-09-15' },
    } as BookOpeningSession;
    useBookOpening.setState({ session });
    clearBookOpening('opening-dispose');
    expect(useBookOpening.getState().session).toBeNull();
    expect(dispose).not.toHaveBeenCalled();
    jest.advanceTimersByTime(BOOK_OPENING_DISPOSE_DELAY_MS);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(throwingDispose).toHaveBeenCalledTimes(1);
    clearBookOpening('opening-dispose');
    jest.advanceTimersByTime(BOOK_OPENING_DISPOSE_DELAY_MS);
    expect(dispose).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});
