/**
 * The message the iOS share sheet receives when a reader shares a selection
 * from the devotional reader. Pure: the reader passes what it knows, and each
 * part whose data is missing drops out.
 *
 * Prose:
 *   “<selected text>”
 *
 *   Excerpt from <series title>, Day <n>: <day title>
 *   Shared from Unfold · https://unfoldapp.co
 *
 * Scripture (YouVersion style):
 *   “<selected text>”
 *   <reference>
 *
 *   Shared from Unfold · https://unfoldapp.co
 *
 * The link lives only in the message text, so the caller passes no `url`.
 */

import { closesQuotation, isQuoteMark, opensQuotation, QUOTE_MARKS } from '@/lib/quote-marks';

export const UNFOLD_SHARE_LINE = 'Shared from Unfold · https://unfoldapp.co';

export interface SelectionShareInput {
  /** The selected text as the reader returned it. */
  text: string;
  /** Set when the selection sits inside a Scripture passage. */
  scriptureReference?: string | null;
  seriesTitle?: string | null;
  dayNumber?: number | null;
  dayTitle?: string | null;
}

function collapse(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** How many quotations are still open at the end of `text`. */
function openQuotations(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (isQuoteMark(text.charAt(i))) depth = Math.max(0, depth + (opensQuotation(text, i) ? 1 : -1));
  }
  return depth;
}

/** The index of the mark that closes the quotation opening at 0, or -1. */
function closingMark(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (!isQuoteMark(text.charAt(i))) continue;
    depth += opensQuotation(text, i) ? 1 : -1;
    if (depth === 0) return i;
  }
  return -1;
}

/** Quote marks at the end of the text, before an optional , ; or : */
const TRAILING_QUOTE_MARKS = new RegExp(`\\s*[${QUOTE_MARKS}]+[,;:]?$`);

/**
 * Removes the quote marks the selection already carries, so the wrapping
 * quotes never double them, and never leaves a mark without its pair:
 * - A quotation that wraps the whole selection loses both marks.
 * - A leading mark goes when nothing in the selection closes it. It stays
 *   when its quotation closes inside (`“Come,” he said.`).
 * - A trailing mark goes when nothing in the selection opens it. It stays
 *   when it closes a quote that opens inside (`He said “go”`).
 */
export function unwrapQuotes(text: string): string {
  let t = text.trim();
  if (opensQuotation(t, 0)) {
    const close = closingMark(t);
    // A trailing , ; or : belongs to the sentence the words came from.
    if (close >= 0 && /^\s*[,;:]?$/.test(t.slice(close + 1))) return t.slice(1, close).trim();
    if (close < 0) t = t.slice(1).trim();
  } else {
    // Marks that close a quotation opened before the selection.
    while (closesQuotation(t, 0)) t = t.slice(1).trimStart();
  }
  const trailing = t.match(TRAILING_QUOTE_MARKS);
  if (trailing && openQuotations(t.slice(0, trailing.index)) === 0) t = t.slice(0, trailing.index);
  return t.trim();
}

function excerptSource({ seriesTitle, dayNumber, dayTitle }: SelectionShareInput): string {
  const series = collapse(seriesTitle);
  const title = collapse(dayTitle);
  const day = typeof dayNumber === 'number' && Number.isInteger(dayNumber) && dayNumber > 0 ? `Day ${dayNumber}` : '';
  const dayPart = day && title ? `${day}: ${title}` : day || title;
  return [series, dayPart].filter(Boolean).join(', ');
}

/** Returns '' when the selection holds no text, so the caller shares nothing. */
export function formatSelectionShareText(input: SelectionShareInput): string {
  const body = unwrapQuotes(collapse(input.text));
  if (!body) return '';
  const quote = `“${body}”`;

  const reference = collapse(input.scriptureReference);
  if (reference) return [quote, reference, '', UNFOLD_SHARE_LINE].join('\n');

  const source = excerptSource(input);
  return [quote, '', ...(source ? [`Excerpt from ${source}`] : []), UNFOLD_SHARE_LINE].join('\n');
}
