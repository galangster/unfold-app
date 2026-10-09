import { normalizeSoapResponses, SOAP_FIELDS } from './journal-entry-state';
import type { JournalEntry, PrayerRequest, SoapResponses } from './store';
import { compositeId } from './sync-ids';

/**
 * One journal entry per (devotionalId, dayNumber).
 *
 * Entry ids used to be random per device, so the same day written on two
 * devices produced two server rows; every day-keyed lookup is a first-match
 * `find`, so the second entry stayed invisible locally while still syncing.
 * Deriving the id from the day makes both devices write the same row.
 */
export function canonicalJournalEntryId(devotionalId: string, dayNumber: number): string {
  return compositeId(devotionalId, dayNumber);
}

function dayKey(entry: Pick<JournalEntry, 'devotionalId' | 'dayNumber'>): string {
  return `${entry.devotionalId}|${entry.dayNumber}`;
}

/** Oldest first; an entry without a timestamp sorts as oldest. */
function byUpdatedAtAscending(a: JournalEntry, b: JournalEntry): number {
  return (a.updatedAt ?? a.createdAt ?? '').localeCompare(b.updatedAt ?? b.createdAt ?? '');
}

/**
 * Join two versions of one text field without losing either. Identical or
 * contained text collapses; genuinely different text is kept in chronological
 * order separated by a blank line, because a merge must never silently delete
 * something the user wrote.
 */
function mergeText(existing: string, incoming: string): string {
  const older = existing.trim();
  const newer = incoming.trim();
  if (!newer) return existing;
  if (!older) return incoming;
  if (older === newer || older.includes(newer)) return existing;
  if (newer.includes(older)) return incoming;
  return `${existing}\n\n${incoming}`;
}

function mergeSoap(
  existing: SoapResponses | undefined,
  incoming: SoapResponses | undefined,
): SoapResponses | undefined {
  const older = normalizeSoapResponses(existing);
  const newer = normalizeSoapResponses(incoming);
  if (!older) return newer;
  if (!newer) return older;
  const merged = { ...older };
  for (const field of SOAP_FIELDS) {
    merged[field] = mergeText(older[field], newer[field]);
  }
  return merged;
}

function mergeQuestionResponses(
  existing: JournalEntry['questionResponses'],
  incoming: JournalEntry['questionResponses'],
): JournalEntry['questionResponses'] {
  if (!existing?.length) return incoming;
  if (!incoming?.length) return existing;
  const merged = existing.map((qr) => ({ ...qr }));
  for (const candidate of incoming) {
    const match = merged.find((qr) => qr.question === candidate.question);
    if (match) match.response = mergeText(match.response, candidate.response);
    else merged.push({ ...candidate });
  }
  return merged;
}

function mergePrayerRequests(
  existing: PrayerRequest[] | undefined,
  incoming: PrayerRequest[] | undefined,
): PrayerRequest[] | undefined {
  if (!existing?.length) return incoming;
  if (!incoming?.length) return existing;
  const merged = [...existing];
  for (const prayer of incoming) {
    if (merged.some((p) => p.id === prayer.id || p.text.trim() === prayer.text.trim())) continue;
    merged.push(prayer);
  }
  return merged;
}

function mergeStringList(
  existing: string[] | undefined,
  incoming: string[] | undefined,
): string[] | undefined {
  if (!existing?.length) return incoming;
  if (!incoming?.length) return existing;
  const merged = [...existing];
  for (const value of incoming) if (!merged.includes(value)) merged.push(value);
  return merged;
}

/** Fold `incoming` (the newer entry) into `base`, losing no user text. */
function mergePair(base: JournalEntry, incoming: JournalEntry): JournalEntry {
  return {
    ...base,
    content: mergeText(base.content ?? '', incoming.content ?? ''),
    journalMode: incoming.journalMode ?? base.journalMode,
    soapResponses: mergeSoap(base.soapResponses, incoming.soapResponses),
    questionResponses: mergeQuestionResponses(base.questionResponses, incoming.questionResponses),
    prayerRequests: mergePrayerRequests(base.prayerRequests, incoming.prayerRequests),
    deeperQuestions: mergeStringList(base.deeperQuestions, incoming.deeperQuestions),
    createdAt: [base.createdAt, incoming.createdAt].filter(Boolean).sort()[0] ?? base.createdAt,
    updatedAt: [base.updatedAt, incoming.updatedAt].filter(Boolean).sort().pop() ?? base.updatedAt,
  };
}

/**
 * Collapse every (devotionalId, dayNumber) group to a single entry under the
 * canonical id. Entries fold oldest-first so surviving text reads in
 * chronological order, and nothing a user wrote is dropped. The order of each
 * day's first occurrence is preserved.
 */
export function mergeJournalEntryDuplicates(entries: JournalEntry[]): JournalEntry[] {
  const groups = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    if (!entry) continue;
    const key = dayKey(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }

  const merged: JournalEntry[] = [];
  for (const group of groups.values()) {
    const [oldest, ...rest] = [...group].sort(byUpdatedAtAscending);
    const folded = rest.reduce(mergePair, oldest);
    merged.push({ ...folded, id: canonicalJournalEntryId(folded.devotionalId, folded.dayNumber) });
  }
  return merged;
}
