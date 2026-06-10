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
