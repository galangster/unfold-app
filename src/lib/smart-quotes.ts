/**
 * smartQuotes — convert straight quotes/apostrophes to typographic quotes.
 *
 * Idempotent: already-curly text passes through unchanged, so it is safe to
 * call on every render and on partially-converted strings.
 *
 * Streaming-safe: opening/closing orientation is decided ONLY by the character
 * to the LEFT of each quote, so re-running on a growing streamed buffer never
 * flips a decision made for an earlier chunk (output for any prefix is a
 * prefix of the output for the full string). Sole exception: the decade rule
 * ('90s) uses right context and may settle one chunk later.
 *
 * Display-only. Never apply at store/sync/API time: stored content must stay
 * byte-identical for model history, cloud sync, and text-match relocation.
 */
const HAS_STRAIGHT_QUOTE = /['"]/;

export function smartQuotes(text: string): string {
  if (!text || !HAS_STRAIGHT_QUOTE.test(text)) return text;
  return (
    text
      // decade abbreviations: '90s — claim before the opening-single rule
      .replace(/'(?=\d\ds\b)/g, '’')
      // opening single: at start or after whitespace / opening bracket /
      // opening double quote / dash
      .replace(/(^|[\s([{“—–-])'/g, '$1‘')
      // every remaining single is an apostrophe or a closer
      .replace(/'/g, '’')
      // opening double: at start or after whitespace / opening bracket /
      // opening single quote / dash
      .replace(/(^|[\s([{‘—–-])"/g, '$1“')
      // every remaining double closes
      .replace(/"/g, '”')
  );
}
