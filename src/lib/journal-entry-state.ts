import type { DevotionalDay, JournalEntry, JournalMode, SoapResponses } from '@/lib/store';

/**
 * Pure derivations for the journal entry screen's local state.
 * Kept out of the component so the useState lazy initializers cannot close
 * over component consts declared after them (Hermes silently reads undefined
 * across a temporal dead zone; TDZ-enforcing engines crash).
 */

/**
 * The entry screen only ever renders the free-write field or the SOAP
 * fields — "guided" is a legacy mode with no matching UI. A persisted or
 * synced "guided" value (or any other unrecognised value) must not reach
 * the screen: normalise it to "freewrite" here, at the source, rather than
 * at every render site.
 */
export function resolveInitialJournalMode(
  existingEntry: Pick<JournalEntry, 'journalMode'> | undefined,
  currentDay: Pick<DevotionalDay, 'studyMethod'> | undefined,
): Exclude<JournalMode, 'guided'> {
  const normalizedPersisted = normalizeJournalMode(existingEntry?.journalMode);
  if (normalizedPersisted) return normalizedPersisted;
  if (currentDay?.studyMethod === 'soap_journal') return 'soap';
  return 'freewrite';
}

/**
 * Persisted answers keyed by question text — the store's own key. The editor
 * renders either the day's reflection questions or the AI prompts, so an
 * index into one list says nothing about the other.
 */
export function buildInitialQuestionResponses(
  existingEntry: Pick<JournalEntry, 'questionResponses'> | undefined,
): Map<string, string> {
  const initial = new Map<string, string>();
  for (const qr of existingEntry?.questionResponses ?? []) {
    initial.set(qr.question, qr.response);
  }
  return initial;
}

/**
 * Normalises a raw (possibly synced) journal-mode value the same way
 * resolveInitialJournalMode does: "guided" and anything unrecognised become
 * "freewrite" so no screen has to guard against a mode it can't render.
 * Returns undefined for an absent value, so callers can still fall back to
 * the study-method suggestion.
 */
export function normalizeJournalMode(value: unknown): Exclude<JournalMode, 'guided'> | undefined {
  if (value === undefined) return undefined;
  return value === 'soap' ? 'soap' : 'freewrite';
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

export const EMPTY_SOAP_RESPONSES: SoapResponses = {
  scripture: '',
  observation: '',
  application: '',
  prayer: '',
};

/**
 * The shape the screens read without guards: every SOAP field a string.
 * Anything that carries no string field at all — undefined, the `{}` a sync
 * pull produced for a NULL soap_responses column, arrays, primitives —
 * normalises to undefined; a partial object is filled out to four fields.
 */
export function normalizeSoapResponses(value: unknown): SoapResponses | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const normalized: SoapResponses = { ...EMPTY_SOAP_RESPONSES };
  let hasField = false;
  for (const field of SOAP_FIELDS) {
    const fieldValue = record[field];
    if (typeof fieldValue === 'string') {
      normalized[field] = fieldValue;
      hasField = true;
    }
  }
  return hasField ? normalized : undefined;
}

export type JournalCloseAction = 'back' | 'replace-journal-hub';

/**
 * Where Done/Skip should take the user.
 *
 * The same screen is mounted twice: under (today)/journal for the Today flow
 * (close pops back to wherever it was opened from) and, via re-export, under
 * (journal)/entry for the Journal tab. The hub pushes the entry on top of
 * itself, so popping is the right close there too — it keeps the hub's
 * state and never stacks a second hub. Only when the entry is the first
 * route of the Journal stack (cold-start deep link) would a pop bubble up to
 * the tab navigator and land on the Today tab; that case replaces the entry
 * with the hub instead.
 *
 * Decide from `useSegments()` (keeps route groups), never `usePathname()`
 * (strips them: the Journal-tab mount reports '/entry').
 */
export function resolveJournalCloseAction({
  segments,
  stackIndex,
}: {
  segments: readonly string[];
  /** Index of the focused route in the enclosing stack; 0 = first route. */
  stackIndex: number;
}): JournalCloseAction {
  const isJournalTabEntry =
    segments.includes('(journal)') && segments[segments.length - 1] === 'entry';
  if (isJournalTabEntry && stackIndex <= 0) return 'replace-journal-hub';
  return 'back';
}
