/** Verse numbers as Unicode superscript digits, e.g. 16 → ¹⁶. */
const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'] as const;

export function toSuperscript(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUPERSCRIPT_DIGITS[parseInt(d, 10)]!)
    .join('');
}
