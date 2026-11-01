/**
 * Marks a day's act on this device. Every surface that marks an act calls
 * this, because the order the act's note draws at must be kept first
 * (holdActNoteOrdinal): once the act is marked, the hold does nothing.
 */
import { holdActNoteOrdinal } from '@/lib/copy-variation';
import { useUnfoldStore } from '@/lib/store';

export function markActOutcome(devotionalId: string, dayNumber: number, outcome: 'done' | 'skipped'): void {
  const store = useUnfoldStore.getState();
  holdActNoteOrdinal(store.devotionals, { devotionalId, dayNumber });
  store.setActOutcome(devotionalId, dayNumber, outcome);
}
