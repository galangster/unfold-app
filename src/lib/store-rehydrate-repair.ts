/**
 * Pure per-slice rehydration repair.
 *
 * Instead of wiping all state when any one slice is invalid, this module
 * validates each slice independently and resets only the corrupt ones plus
 * their declared dependents. This preserves unrelated user data (especially
 * non-synced slices like journalEntries, checkIns, notes) when an unrelated
 * slice is corrupt (e.g., a failed migration that left usedScriptures as a
 * non-array).
 *
 * Pattern: mirrors creation-gate-policy.ts — pure function, no native imports,
 * extracted so it can be unit-tested without the full zustand store.
 */

type AnyState = Record<string, any>;

const ARRAY_SLICES = [
  'devotionals',
  'journalEntries',
  'bookmarks',
  'highlights',
  'usedScriptures',
  'checkIns',
  'notes',
  'folders',
  'bibleHighlights',
  'bibleReadingHistory',
] as const;

/** Slices that must be reset together when their parent is invalid. */
const DEPENDENTS: Partial<Record<string, string[]>> = {
  devotionals: ['currentDevotionalId', 'resumeContext'],
};

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Element-level shape checks for the highlight slices. A single malformed
 *  record (a sync payload missing `createdAt`, say) used to reach
 *  `new Date(undefined)` in the Library sort and the Remember-This card. */
const ELEMENT_VALIDATORS: Partial<Record<string, (item: any) => boolean>> = {
  highlights: (h) =>
    h != null && typeof h === 'object' && isString(h.id) && isString(h.devotionalId) && isNumber(h.dayNumber) && isString(h.highlightedText) && isString(h.createdAt),
  bibleHighlights: (h) =>
    h != null && typeof h === 'object' && isString(h.id) && isNumber(h.bookId) && isNumber(h.chapter) && isNumber(h.verseStart) && isNumber(h.verseEnd) && isString(h.createdAt),
};

export function repairRehydratedState(
  state: AnyState,
  initial: AnyState,
): { repairedKeys: string[] } {
  const repairedKeys: string[] = [];

  const reset = (key: string) => {
    state[key] = initial[key];
    repairedKeys.push(key);
  };

  for (const key of ARRAY_SLICES) {
    if (!Array.isArray(state[key])) {
      reset(key);
      for (const dep of DEPENDENTS[key] ?? []) reset(dep);
      continue;
    }
    const validate = ELEMENT_VALIDATORS[key];
    if (!validate) continue;
    const kept = state[key].filter(validate);
    if (kept.length !== state[key].length) {
      state[key] = kept;
      repairedKeys.push(key);
    }
  }

  if (state.generationSession == null || typeof state.generationSession !== 'object') {
    reset('generationSession');
  }

  if (!state.user || typeof state.user !== 'object') {
    reset('user');
  }

  return { repairedKeys };
}
