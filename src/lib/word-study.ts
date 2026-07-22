export type StructuredWordStudy = {
  term: string;
  original: string;
  meaning: string;
};

/**
 * The generation backend currently emits `wordStudy` as prose, while older
 * mobile content stored a structured term/original/meaning object. Accept both
 * contracts at runtime so either generation path remains readable.
 */
export type WordStudy = string | StructuredWordStudy;

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function isStructuredWordStudy(value: unknown): value is StructuredWordStudy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return Boolean(
    nonEmptyString(candidate.term)
    && nonEmptyString(candidate.original)
    && nonEmptyString(candidate.meaning),
  );
}

export function normalizeWordStudy(value: unknown): WordStudy | undefined {
  const prose = nonEmptyString(value);
  if (prose) return prose;

  if (!isStructuredWordStudy(value)) {
    return undefined;
  }

  return {
    term: value.term.trim(),
    original: value.original.trim(),
    meaning: value.meaning.trim(),
  };
}
