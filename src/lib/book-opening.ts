import { create } from 'zustand';
import type { SharedValue } from 'react-native-reanimated';
import type { SkImage } from '@shopify/react-native-skia';
import type { BookTodayPage } from './book-of-seasons';

export function bookOpeningProgress(translationX: number, width: number): number {
  'worklet';
  return Math.max(0, Math.min(1, -translationX / Math.max(1, width * 0.82)));
}

export function shouldOpenBook(progress: number, velocityX: number): boolean {
  'worklet';
  return progress >= 0.4 || (progress >= 0.08 && velocityX < -650);
}

export function bookDayCaption(page: BookTodayPage): string {
  return page.totalDays > 0 ? `Day ${page.dayNumber} of ${page.totalDays}` : 'Your next reading';
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
