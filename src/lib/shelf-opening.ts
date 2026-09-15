import { create } from 'zustand';
import type { Devotional } from './store';

export interface ShelfOpening {
  id: string;
  book: Devotional;
  rect: { x: number; y: number; width: number; height: number };
  background: string;
  paperColor: string;
  inkColor: string;
  ready: boolean;
  committed: boolean;
  navigate: (id: string) => void;
}
export const useShelfOpening = create<{ session: ShelfOpening | null }>(() => ({ session: null }));
export function clearShelfOpening(id: string) {
  if (useShelfOpening.getState().session?.id === id) useShelfOpening.setState({ session: null });
}
export function markShelfContentsReady(id: string | undefined) {
  const session = useShelfOpening.getState().session;
  if (session && session.id === id) useShelfOpening.setState({ session: { ...session, ready: true } });
}

