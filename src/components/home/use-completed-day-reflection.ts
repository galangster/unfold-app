import { useUnfoldStore, type DevotionalDay } from '@/lib/store';
import { deriveReflectionStatus, type ReflectionStatus } from '@/lib/reflection-status';

export interface CompletedDayReflection {
  freeWriteDraft: string;
  reflectionStatus: ReflectionStatus;
}

/**
 * Journal state for the day the reader finished today, read straight from
 * the store. The Today screen keys its reflect props on the card's current
 * day, which in the tomorrow-locked state is tomorrow's reading — so the
 * composer for the completed day has to look its own entry up.
 */
export function useCompletedDayReflection(
  devotionalId: string,
  completedDay: DevotionalDay | null,
): CompletedDayReflection {
  const completedDayNumber = completedDay?.dayNumber ?? null;
  const entry = useUnfoldStore((state) => (
    completedDayNumber === null
      ? undefined
      : state.journalEntries.find(
          (journalEntry) => journalEntry.devotionalId === devotionalId && journalEntry.dayNumber === completedDayNumber,
        )
  ));

  return {
    freeWriteDraft: entry?.content ?? '',
    reflectionStatus: deriveReflectionStatus(entry, completedDay?.reflectionQuestions?.length ?? 0),
  };
}
