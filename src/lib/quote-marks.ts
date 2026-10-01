/**
 * The quote marks the reader knows, and which of them opens a quotation. The
 * share text (selection-share) and the Scripture quotations of the devotional
 * text (devotional-text-html) read quotations with this one rule.
 */

/** Straight ", curly “ and ”, and the low opening mark „. */
export const QUOTE_MARKS = '"“”„';

export function isQuoteMark(c: string): boolean {
  return c.length === 1 && QUOTE_MARKS.includes(c);
}

/**
 * Whether the character at `i` is a quote mark that opens a quotation. “ and
 * „ open and ” closes. A straight " opens at the start of the text and after
 * white space, an opening bracket, or a dash, and closes anywhere else.
 */
export function opensQuotation(text: string, i: number): boolean {
  const c = text.charAt(i);
  if (c === '“' || c === '„') return true;
  if (c !== '"') return false;
  return i === 0 || /[\s([—–-]/.test(text.charAt(i - 1));
}

/** Whether the character at `i` is a quote mark that closes a quotation. */
export function closesQuotation(text: string, i: number): boolean {
  return isQuoteMark(text.charAt(i)) && !opensQuotation(text, i);
}
