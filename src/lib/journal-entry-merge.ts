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
  // The newer list already holds every older response: keep it as it is.
  if (existing.every((qr) => incoming.some((candidate) => (
    candidate.question === qr.question && mergeText(qr.response, candidate.response) === candidate.response
  )))) return incoming;
  const merged = existing.map((qr) => ({ ...qr }));
  for (const candidate of incoming) {
    const match = merged.find((qr) => qr.question === candidate.question);
    if (match) match.response = mergeText(match.response, candidate.response);
    else merged.push({ ...candidate });
  }
  return merged;
}

/**
 * Pairs each older prayer with a distinct newer one: by id first, then by
 * text. No newer prayer stands for two older ones, so a merge keeps every
 * prayer's own id.
 */
function pairPrayers(existing: PrayerRequest[], incoming: PrayerRequest[]): Map<PrayerRequest, PrayerRequest> {
  const pairs = new Map<PrayerRequest, PrayerRequest>();
  const taken = new Set<PrayerRequest>();
  const matchers = [
    (left: PrayerRequest, right: PrayerRequest) => left.id === right.id,
    (left: PrayerRequest, right: PrayerRequest) => left.text.trim() === right.text.trim(),
  ];
  for (const matches of matchers) {
    for (const prayer of existing) {
      if (pairs.has(prayer)) continue;
      const newer = incoming.find((candidate) => !taken.has(candidate) && matches(prayer, candidate));
      if (!newer) continue;
      pairs.set(prayer, newer);
      taken.add(newer);
    }
  }
  return pairs;
}

function mergePrayerRequests(
  existing: PrayerRequest[] | undefined,
  incoming: PrayerRequest[] | undefined,
): PrayerRequest[] | undefined {
  if (!existing?.length) return incoming;
  if (!incoming?.length) return existing;
  const pairs = pairPrayers(existing, incoming);
  // The newer list already holds every older prayer: keep it as it is.
  if (pairs.size === existing.length) return incoming;
  // A prayer in both keeps the newer entry's copy, so an answer marked later
  // stays marked.
  const merged = existing.map((prayer) => pairs.get(prayer) ?? prayer);
  const paired = new Set(pairs.values());
  for (const prayer of incoming) if (!paired.has(prayer)) merged.push(prayer);
  return merged;
}

function mergeStringList(
  existing: string[] | undefined,
  incoming: string[] | undefined,
): string[] | undefined {
  if (!existing?.length) return incoming;
  if (!incoming?.length) return existing;
  // The newer list already holds every older value: keep it, order included.
  if (existing.every((value) => incoming.includes(value))) return incoming;
  const merged = [...existing];
  for (const value of incoming) if (!merged.includes(value)) merged.push(value);
  return merged;
}

/**
 * Rebase an unsaved draft onto text a merge changed under it. `base` is the
 * text the draft was edited from and `merged` is that text after the merge.
 * The draft's edits take the base's place inside the merged text, so text
 * the merge brought in survives the next save. A field with no edits takes
 * the merged text. When the base cannot be found, the draft follows the
 * merged text, so nothing is dropped.
 */
export function rebaseJournalDraft(base: string, merged: string, draft: string): string {
  if (merged === base) return draft;
  if (draft === base) return merged;
  const at = base.trim() ? merged.indexOf(base) : -1;
  if (at >= 0) return `${merged.slice(0, at)}${draft}${merged.slice(at + base.length)}`;
  if (!merged.trim()) return draft;
  if (!draft.trim()) return merged;
  return `${merged}\n\n${draft}`;
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

const TEXT_FIELDS = ['content', 'soapResponses', 'questionResponses'] as const;

function addsNoTextTo(base: JournalEntry, incoming: JournalEntry): boolean {
  const merged = mergePair(base, incoming);
  return TEXT_FIELDS.every((field) => JSON.stringify(merged[field] ?? null) === JSON.stringify(base[field] ?? null));
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
    const id = canonicalJournalEntryId(group[0].devotionalId, group[0].dayNumber);
    const ordered = [...group].sort(byUpdatedAtAscending);
    const [oldest, ...rest] = ordered;
    const folded = rest.reduce(mergePair, oldest);
    // A row whose text the day's entry already holds stays out of the text
    // fold: folding it with the other rows first could join texts the entry
    // holds apart, and the joined text would be added again. Every row still
    // counts for the newest mode and prayer state, the lists and the dates.
    const canonical = group.find((entry) => entry.id === id);
    const [firstText, ...restText] = canonical
      ? ordered.filter((entry) => entry === canonical || !addsNoTextTo(canonical, entry))
      : ordered;
    const text = restText.reduce(mergePair, firstText);
    merged.push({
      ...folded,
      id,
      content: text.content,
      soapResponses: text.soapResponses,
      questionResponses: text.questionResponses,
    });
  }
  return merged;
}
