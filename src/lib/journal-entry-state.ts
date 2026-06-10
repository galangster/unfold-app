import type { DevotionalDay, JournalEntry, JournalMode, SoapResponses } from '@/lib/store';

/**
 * Pure derivations for the journal entry screen's local state.
 * Kept out of the component so the useState lazy initializers cannot close
 * over component consts declared after them (Hermes silently reads undefined
 * across a temporal dead zone; TDZ-enforcing engines crash).
 */

export function resolveInitialJournalMode(
  existingEntry: Pick<JournalEntry, 'journalMode'> | undefined,
  currentDay: Pick<DevotionalDay, 'studyMethod'> | undefined,
): JournalMode {
  if (existingEntry?.journalMode) return existingEntry.journalMode;
  if (currentDay?.studyMethod === 'soap_journal') return 'soap';
  return 'freewrite';
}

export function buildInitialQuestionResponses(
  existingEntry: Pick<JournalEntry, 'questionResponses'> | undefined,
  currentDay: Pick<DevotionalDay, 'reflectionQuestions'> | undefined,
): Map<number, string> {
  const initial = new Map<number, string>();
  if (!existingEntry?.questionResponses) return initial;
  const allQuestions = currentDay?.reflectionQuestions ?? [];
  for (const qr of existingEntry.questionResponses) {
    const idx = allQuestions.findIndex((q) => q === qr.question);
    if (idx >= 0) initial.set(idx, qr.response);
  }
  return initial;
}

export const SOAP_FIELDS = ['scripture', 'observation', 'application', 'prayer'] as const;

/**
 * Fields whose local value differs from the persisted value — INCLUDING
 * fields the user cleared to empty. Flush paths must write exactly these so
 * a deletion made inside the debounce window is not resurrected (COR-6).
 */
export function diffSoapWrites(
  local: SoapResponses,
  persisted: SoapResponses | undefined,
): { field: keyof SoapResponses; value: string }[] {
  const writes: { field: keyof SoapResponses; value: string }[] = [];
  for (const field of SOAP_FIELDS) {
    const localValue = local[field] ?? '';
    if ((persisted?.[field] ?? '') !== localValue) {
      writes.push({ field, value: localValue });
    }
  }
  return writes;
}
