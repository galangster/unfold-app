import { parseScriptureReferences, type ScriptureRef } from '@/lib/scripture-parser';

/** The day's own passage, so a quotation of it counts as Scripture. */
export interface DayScripture {
  scriptureReference?: string;
  scriptureText?: string;
}

/** A quotation that names its passage: [start, end) covers both quote marks. */
export interface ScriptureQuote {
  start: number;
  end: number;
  reference: string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isOpeningQuote(text: string, i: number): boolean {
  const c = text.charAt(i);
  return c === '\u201C' || (c === '"' && (i === 0 || /[\s([\u2014\u2013-]/.test(text.charAt(i - 1))));
}

function isClosingQuote(text: string, i: number): boolean {
  const c = text.charAt(i);
  return c === '\u201D' || (c === '"' && !isOpeningQuote(text, i));
}

/** Pairs of quote marks [open, close] with no other quote mark between them. */
function quotationMarks(text: string): [number, number][] {
  const pairs: [number, number][] = [];
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    if (isOpeningQuote(text, i)) open = i;
    else if (open >= 0 && isClosingQuote(text, i)) {
      pairs.push([open, i]);
      open = -1;
    }
  }
  return pairs;
}

function matchKey(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Scripture in the devotional text is a quotation that names its passage:
 * a Scripture reference right after (or right before) the quote marks, or
 * words from the day's own passage. Everything else is prose.
 */
export function findScriptureQuotes(
  text: string,
  refs: readonly ScriptureRef[],
  day: DayScripture,
): ScriptureQuote[] {
  const dayKey = day.scriptureReference ? matchKey(day.scriptureText || '') : '';
  // The characters between a quotation and a reference, as the reader shows
  // them (without markdown asterisks).
  const gap = (from: number, to: number) => text.slice(from, to).replace(/\*/g, '');
  const quotes: ScriptureQuote[] = [];
  for (const [open, close] of quotationMarks(text)) {
    // The citation after a quotation names it, even when the one before it
    // ends a citation of its own. A reference before the quotation names it
    // only inside the same sentence: '(Matthew 11:28). “…”' is a new one.
    const named = refs.find((ref) =>
      ref.startIndex > close && /^[\s,.;:([\u2014\u2013-]{0,6}$/.test(gap(close + 1, ref.startIndex)))
      ?? refs.find((ref) =>
        ref.endIndex <= open && /^[\s,;:)\]\u2014\u2013-]{0,4}$/.test(gap(ref.endIndex, open)));
    const quoted = matchKey(text.slice(open + 1, close));
    const reference = named?.reference
      ?? (dayKey && quoted.length >= 12 && dayKey.includes(quoted) ? day.scriptureReference : '');
    if (reference) quotes.push({ start: open, end: close + 1, reference });
  }
  return quotes;
}

// Private-use marks for a quotation's edges while inline markdown runs.
const QUOTE_OPEN = '\uE000';
const QUOTE_CLOSE = '\uE001';

/** Inline markdown on escaped HTML: `*` survives escaping unchanged. */
function applyInlineMarkdown(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="devotional-emphasis">$1</em>');
}

/**
 * Turns the quotation marks into `<span class="scripture-quote">` where the
 * emphasis nests around or inside them. A quotation that emphasis crosses
 * stays prose, so the markup is always well formed.
 */
function wrapScriptureQuotes(html: string, quotes: readonly ScriptureQuote[]): string {
  const openTags: number[] = [];
  let nextTag = 0;
  let quote = -1;
  let openedAt = '';
  const kept = new Set<number>();
  for (const token of html.matchAll(/<\/?(?:strong|em)\b[^>]*>|[\uE000\uE001]/g)) {
    const t = token[0];
    if (t === QUOTE_OPEN) {
      quote += 1;
      openedAt = openTags.join(',');
    } else if (t === QUOTE_CLOSE) {
      if (openTags.join(',') === openedAt) kept.add(quote);
    } else if (t.startsWith('</')) {
      openTags.pop();
    } else {
      openTags.push(nextTag++);
    }
  }
  let index = -1;
  return html.replace(/[\uE000\uE001]/g, (mark) => {
    if (mark === QUOTE_OPEN) index += 1;
    if (!kept.has(index)) return '';
    return mark === QUOTE_OPEN
      ? `<span class="scripture-quote" data-ref="${escapeHtml(quotes[index].reference)}">`
      : '</span>';
  });
}

/**
 * One paragraph of devotional text as HTML: escaped, with tappable Scripture
 * references, Scripture quotations wrapped for the selection bar, and inline
 * markdown. The wrappers add no text, so stored highlight offsets stay valid.
 */
export function renderDevotionalInline(text: string, day: DayScripture): string {
  // The quote-edge marks can also be in the text itself: those go in as
  // character references, so the only raw marks are the edges.
  const escapeText = (value: string) =>
    escapeHtml(value).replace(/[\uE000\uE001]/g, (mark) => `&#x${mark.charCodeAt(0).toString(16)};`);
  const refs = parseScriptureReferences(text);
  const quotes = findScriptureQuotes(text, refs, day);
  // Each edge replaces text[at, end) with its html.
  const edges = [
    ...quotes.flatMap((q) => [
      { at: q.start, end: q.start, html: QUOTE_OPEN },
      { at: q.end, end: q.end, html: QUOTE_CLOSE },
    ]),
    ...refs.map((ref) => ({
      at: ref.startIndex,
      end: ref.endIndex,
      html: `<span class="scripture-ref" data-ref="${escapeHtml(ref.reference)}">${escapeHtml(ref.reference)}</span>`,
    })),
  ].sort((a, b) => a.at - b.at);
  let html = '';
  let at = 0;
  for (const edge of edges) {
    html += escapeText(text.slice(at, edge.at)) + edge.html;
    at = edge.end;
  }
  return wrapScriptureQuotes(applyInlineMarkdown(html + escapeText(text.slice(at))), quotes);
}
