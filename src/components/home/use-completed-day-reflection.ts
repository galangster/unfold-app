import { useUnfoldStore, type DevotionalDay } from '@/lib/store';
import { deriveReflectionStatus, type ReflectionStatus } from '@/lib/reflection-status';

export interface CompletedDayReflection {
  freeWriteDraft: string;
  reflectionStatus: ReflectionStatus;
}

/**
 * Journal state for one day of a series, read straight from the store: the
 * day the reader finished today, or the card's current day. In the
 * tomorrow-locked state the card's current day is tomorrow's reading, so the
 * composer for the completed day looks its own entry up through this too.
 */
export function useCompletedDayReflection(
  devotionalId: string,
  completedDay: DevotionalDay | null,
): CompletedDayReflection {
  const completedDayNumber = completedDay?.dayNumber ?? null;
  const entry = useUnfoldStore((state) => (
    completedDayNumber === null ? undefined : state.getJournalEntry(devotionalId, completedDayNumber)
  ));

  return {
    freeWriteDraft: entry?.content ?? '',
    reflectionStatus: deriveReflectionStatus(entry, completedDay?.reflectionQuestions?.length ?? 0),
  };
}
