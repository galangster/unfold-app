/**
 * Display-title helpers for the PP Editorial New serif treatment (2026-08).
 *
 * Titles render in their stored casing (Title Case). A terminal period is a
 * deliberate editorial gesture reserved for hero/poster moments where the
 * title stands alone as a declarative statement — not for titles used as
 * labels in lists, cards, or navigation.
 */

/** Append a period unless the title already ends with sentence punctuation.
 * Casing is left untouched. */
export function titleWithPeriod(title: string): string {
  const t = title.trim();
  if (!t) return t;
  return /[.!?…]["')\]]?$/.test(t) ? t : `${t}.`;
}
