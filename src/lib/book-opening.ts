import { create } from 'zustand';
import type { SharedValue } from 'react-native-reanimated';
import type { SkImage } from '@shopify/react-native-skia';
import type { BookTodayPage } from './book-of-seasons';
import type { Devotional } from './store';

export const BOOK_OPENING_EXPAND_END = 0.82;
export const HARDCOVER_HINGE_DEGREES = -112;
export const HARDCOVER_PAPER_EXPOSE = 0.32;
export const BOOK_COVER_ASPECT = 1.4;

export type BookOpeningCover = Pick<Devotional, 'id' | 'title' | 'createdAt' | 'seriesStartDate'>;

export function bookOpeningProgress(translationX: number, width: number): number {
  'worklet';
  return Math.max(0, Math.min(1, -translationX / Math.max(1, width * 0.82)));
}

export function shouldOpenBook(progress: number, velocityX: number): boolean {
  'worklet';
  return progress >= 0.4 || (progress >= 0.08 && velocityX < -650);
}

/** Matches the page-curl shader's smoothstep(0.0, 0.82, progress). */
export function bookOpeningExpand(progress: number): number {
  'worklet';
  const t = Math.max(0, Math.min(1, progress / BOOK_OPENING_EXPAND_END));
  return t * t * (3 - 2 * t);
}

export function hardcoverHingeDegrees(progress: number): number {
  'worklet';
  return HARDCOVER_HINGE_DEGREES * Math.max(0, Math.min(1, progress));
}

export function hardcoverPaperCurlProgress(progress: number): number {
  'worklet';
  if (progress <= HARDCOVER_PAPER_EXPOSE) return 0;
  return Math.max(0, Math.min(1, (progress - HARDCOVER_PAPER_EXPOSE) / (1 - HARDCOVER_PAPER_EXPOSE)));
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
  paperColor: string;
  presented: boolean;
  failed?: boolean;
  onPresented?: () => void;
  committed: boolean;
  readerReady: boolean;
  cover?: BookOpeningCover;
  coverImage?: SkImage;
}

export const useBookOpening = create<{ session: BookOpeningSession | null }>(() => ({ session: null }));

export function clearBookOpening(id: string): void {
  const session = useBookOpening.getState().session;
  if (session?.id === id) {
    session.sourceHidden.value = false;
    useBookOpening.setState({ session: null });
  }
}

export function markBookReaderReady(id: string | undefined): void {
  const session = useBookOpening.getState().session;
  if (session && session.id === id && session.committed) {
    useBookOpening.setState({ session: { ...session, readerReady: true } });
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
