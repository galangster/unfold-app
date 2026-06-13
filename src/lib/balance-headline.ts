/**
 * balanceHeadline — prevent single-word widows on multi-line display titles.
 *
 * React Native has no cross-platform text-balance primitive (`textBreakStrategy`
 * is Android-only). Instead we bind the final two words of a headline with a
 * non-breaking space (U+00A0) so the last word can never wrap onto a line by
 * itself ("When the Path Is / Quiet" → the last word stays attached to its
 * neighbour).
 *
 * Only acts when the headline has 3+ words: with 1–2 words there is nothing to
 * orphan, and binding a 2-word title would defeat its own wrapping. Multiple
 * runs of whitespace collapse to a single space except the bound pair.
 *
 * Idempotent: re-running on already-bound text leaves it unchanged, so it is
 * safe to call on every render.
 *
 * Display-only. Never apply at store/sync/API time: stored content must stay
 * byte-identical for model history, cloud sync, and text-match relocation.
 */
const NBSP = '\u00A0';

export function balanceHeadline(text: string): string {
  if (!text) return text;

  // Tokenize on any run of plain spaces/tabs AND on an existing bound NBSP, so a
  // second pass re-derives the same true last two words (idempotent). Newlines
  // in the source are intentional breaks and are left untouched.
  const words = text.split(/[ \t\u00A0]+/).filter((word) => word.length > 0);
  if (words.length < 3) return words.join(' ');

  const lead = words.slice(0, -2).join(' ');
  const tail = words.slice(-2).join(NBSP);
  return `${lead} ${tail}`;
}
