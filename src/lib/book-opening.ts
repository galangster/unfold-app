import { create } from 'zustand';
import type { SharedValue } from 'react-native-reanimated';
import type { SkImage } from '@shopify/react-native-skia';
import type { BookTodayPage } from './book-of-seasons';
import type { Devotional } from './store';

export const BOOK_OPENING_EXPAND_END = 0.82;
export const HARDCOVER_HINGE_DEGREES = -112;
export const BOOK_COVER_ASPECT = 1.4;
export const BOOK_OPENING_TURN_MS = 650;
/** On commit the cover cracks open to this pose at once, so the press is answered before the reader is ready. */
export const BOOK_OPENING_PRESS_PROGRESS = 0.08;
export const BOOK_OPENING_PRESS_MS = 120;
/** After the press pose the cover keeps creeping open this far while the reader prepares, so the hold reads as motion, not a stall. */
export const BOOK_OPENING_CREEP_PROGRESS = 0.18;
export const BOOK_OPENING_CREEP_MS = 1080;
/** A cold reader mount can exceed a second on slow devices; past this the turn proceeds without the snapshot. */
export const BOOK_OPENING_READY_HOLD_MS = 1200;
export const BOOK_OPENING_INTERIOR_FADE_MS = 120;
export const BOOK_OPENING_BACKDROP_FADE = 0.15;
/** On commit the paper backdrop covers the tab before the reader mounts behind the overlay. */
export const BOOK_OPENING_BACKDROP_MS = 100;
/** Without a reader snapshot the overlay fades onto the live reader instead of popping. */
export const BOOK_OPENING_HANDOFF_MS = 120;

function clamp01(value: number): number {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

export type BookOpeningCover = Pick<Devotional, 'id' | 'title' | 'createdAt' | 'seriesStartDate'>;

export function bookOpeningProgress(translationX: number, width: number): number {
  'worklet';
  return clamp01(-translationX / Math.max(1, width * 0.82));
}

/** A drag can lift the hardcover this far; past it the cover rubber-bands, and it snaps open on release. */
export const HARDCOVER_DRAG_MAX = 0.55;
const HARDCOVER_DRAG_BAND = 0.15;

/**
 * Keeps a dragged hardcover short of edge-on, so the sheet under it is still
 * covered when the reader snapshot lands. Beyond the stop the cover follows
 * the finger at a quarter of its motion, up to a small band.
 */
export function hardcoverDragProgress(raw: number): number {
  'worklet';
  const p = clamp01(raw);
  if (p <= HARDCOVER_DRAG_MAX) return p;
  return Math.min(HARDCOVER_DRAG_MAX + HARDCOVER_DRAG_BAND, HARDCOVER_DRAG_MAX + (p - HARDCOVER_DRAG_MAX) * 0.25);
}

export function shouldOpenBook(progress: number, velocityX: number): boolean {
  'worklet';
  return progress >= 0.4 || (progress >= 0.08 && velocityX < -650);
}

/** Matches the page-curl shader's smoothstep(0.0, 0.82, progress). */
export function bookOpeningExpand(progress: number): number {
  'worklet';
  const t = clamp01(progress / BOOK_OPENING_EXPAND_END);
  return t * t * (3 - 2 * t);
}

export function hardcoverHingeDegrees(progress: number): number {
  'worklet';
  return HARDCOVER_HINGE_DEGREES * clamp01(progress);
}


export function bookOpeningCancelDuration(progress: number): number {
  'worklet';
  return Math.min(240, 80 + 260 * clamp01(progress));
}

export function bookOpeningTurnDuration(progress: number): number {
  'worklet';
  // A turn from the press pose lasts the full BOOK_OPENING_TURN_MS; a drag that already opened further finishes proportionally sooner.
  const from = Math.max(BOOK_OPENING_PRESS_PROGRESS, clamp01(progress));
  return Math.round(BOOK_OPENING_TURN_MS * (1 - from) / (1 - BOOK_OPENING_PRESS_PROGRESS));
}

export function bookOpeningBackdropOpacity(progress: number, sourceHidden: boolean): number {
  'worklet';
  if (!sourceHidden) return 0;
  return clamp01(progress / BOOK_OPENING_BACKDROP_FADE);
}

export function heroBookSize(
  windowWidth: number,
  windowHeight: number,
  fontScale = 1,
): { width: number; height: number } {
  const width = Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 320;
  const height = Number.isFinite(windowHeight) && windowHeight > 0 ? windowHeight : 640;
  const scale = Math.min(Math.max(fontScale, 1), 1.75);
  const maxWidth = Math.min(width * 0.64, 256);
  const maxHeight = Math.min(height * (0.43 / scale), 360);
  let bookWidth = Math.max(128, maxWidth);
  let bookHeight = bookWidth * BOOK_COVER_ASPECT;
  if (bookHeight > maxHeight) {
    bookHeight = Math.max(176, maxHeight);
    bookWidth = bookHeight / BOOK_COVER_ASPECT;
  }
  return { width: Math.round(bookWidth), height: Math.round(bookHeight) };
}

export function bookDayCaption(page: BookTodayPage): string {
  return page.totalDays > 0 ? `Day ${page.dayNumber} of ${page.totalDays}` : 'Your next reading';
}

export function bookPlaceLine(page: BookTodayPage): string | undefined {
  if (page.seriesComplete) return 'You can return to any page.';
  if (page.completedToday) return 'Your next reading will be here tomorrow.';
  if (!page.contentReady) return 'This page is still being prepared.';
  return undefined;
}

export function bookActionLabel(action: BookTodayPage['action']): string | null {
  if (action === 'continue') return 'Continue reading';
  if (action === 'read-again') return 'Read again';
  return null;
}

export interface BookOpeningSession {
  id: string;
  image: SkImage;
  rect: { x: number; y: number; width: number; height: number };
  progress: SharedValue<number>;
  sourceHidden: SharedValue<boolean>;
  /** Paper cover over the source screen once a hardcover commit pushes the reader. */
  backdrop: SharedValue<number>;
  paperColor: string;
  presented: boolean;
  failed?: boolean;
  onPresented?: () => void;
  committed: boolean;
  readerReady: boolean;
  /** Snapshot of the ready reader drawn under the board; only ever set before the turn starts. */
  readerImage?: SkImage;
  readerWidth?: number;
  turnStarted?: boolean;
  cover?: BookOpeningCover;
  coverImage?: SkImage;
}

export const useBookOpening = create<{ session: BookOpeningSession | null }>(() => ({ session: null }));

/** Frees a session's native snapshots once the Canvas that drew them has unmounted. Safe to call twice. */
function disposeSessionImages(session: BookOpeningSession): void {
  for (const image of [session.image, session.coverImage, session.readerImage]) {
    try {
      if (image && typeof image.dispose === 'function') image.dispose();
    } catch {
      // Already disposed by a concurrent clear; nothing to free.
    }
  }
}

/** Two frames: the overlay unmounts on this store update, and Skia may still be drawing the last frame. */
export const BOOK_OPENING_DISPOSE_DELAY_MS = 40;

export function clearBookOpening(id: string): void {
  const session = useBookOpening.getState().session;
  if (session?.id === id) {
    session.sourceHidden.value = false;
    useBookOpening.setState({ session: null });
    setTimeout(() => disposeSessionImages(session), BOOK_OPENING_DISPOSE_DELAY_MS);
  }
}

export function markBookReaderReady(id: string | undefined): void {
  const session = useBookOpening.getState().session;
  if (session && session.id === id && session.committed && !session.readerReady) {
    useBookOpening.setState({ session: { ...session, readerReady: true } });
  }
}

/** Stores the reader snapshot for the interior. Returns false when the session moved on or the turn already started. */
export function setBookReaderImage(id: string, image: SkImage): boolean {
  const session = useBookOpening.getState().session;
  if (!session || session.id !== id || session.readerImage || session.turnStarted) return false;
  useBookOpening.setState({ session: { ...session, readerImage: image, readerWidth: image.width() } });
  return true;
}

export function markBookTurnStarted(id: string): void {
  const session = useBookOpening.getState().session;
  if (session?.id === id && !session.turnStarted) {
    useBookOpening.setState({ session: { ...session, turnStarted: true } });
  }
}

export function markBookOverlayPresented(id: string): void {
  const session = useBookOpening.getState().session;
  if (session?.id === id && !session.presented && !session.failed) {
    session.sourceHidden.value = true;
    useBookOpening.setState({ session: { ...session, presented: true, onPresented: undefined } });
    session.onPresented?.();
  }
}

export function failBookOverlay(id: string): void {
  const session = useBookOpening.getState().session;
  if (session?.id === id && !session.presented && !session.failed) {
    useBookOpening.setState({ session: { ...session, failed: true, onPresented: undefined } });
    session.onPresented?.();
  }
}
