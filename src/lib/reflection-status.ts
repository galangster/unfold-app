import type { JournalEntry } from '@/lib/store';

export type ReflectionStatus = 'empty' | 'started' | 'complete';

/**
 * How far a reader has taken one day's reflection.
 *
 * - `empty`: no journal entry, or one with only whitespace.
 * - `complete`: every reflection question the day carries has an answer.
 * - `started`: anything in between — free-write, SOAP, prayer, or some answers.
 *
 * A day with no reflection questions can never be `complete`; any content on
 * such a day reads as `started`.
 */
export function deriveReflectionStatus(
  entry: JournalEntry | undefined,
  reflectionQuestionCount: number,
): ReflectionStatus {
  if (!entry) return 'empty';

  const hasFreeWrite = entry.content.trim().length > 0;
  const hasSoap = Object.values(entry.soapResponses ?? {}).some((value) => value.trim().length > 0);
  const answeredReflectionCount = (entry.questionResponses ?? [])
    .filter((response) => response.response.trim().length > 0)
    .length;
  const hasPrayer = (entry.prayerRequests ?? []).some((prayer) => prayer.text.trim().length > 0);
  const hasAnyReflection = hasFreeWrite || hasSoap || answeredReflectionCount > 0 || hasPrayer;
  if (!hasAnyReflection) return 'empty';

  if (reflectionQuestionCount > 0 && answeredReflectionCount >= reflectionQuestionCount) {
    return 'complete';
  }

  return 'started';
}
