/**
 * The one-line verse excerpt that the UnfoldVerse Lock Screen widget shows.
 *
 * Pure and side-effect free: widget-timeline.ts calls it for the "now" and
 * the "midnight" entries, so both entries share one helper. Widget bodies
 * cannot import module code (see the runtime contract in UnfoldStreak.tsx),
 * which is why the line is derived here and shipped as a timeline prop.
 */

const OPEN_QUOTE = '“';
const CLOSE_QUOTE = '”';
const ELLIPSIS = '…';

/** Inclusive length band of a sentence that fits the Lock Screen whole. */
const MIN_LINE = 28;
const MAX_LINE = 84;
/** A cut keeps at most this many characters, ellipsis included. */
const CUT_LIMIT = 80;

/**
 * One sentence: everything up to a run of . ! or ? (plus closing quotes or
 * brackets) that a space or the end of the text follows. A trailing
 * fragment without a mark is the last sentence. No lookbehind (Hermes).
 */
const SENTENCE = /\S.*?(?:[.!?]+[”’"')\]]*(?=\s|$)|$)/g;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Removes every curly double quote that has no partner in `text`. */
function dropUnpairedQuotes(text: string): string {
  const unpaired = new Set<number>();
  const open: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === OPEN_QUOTE) {
      open.push(i);
    } else if (text[i] === CLOSE_QUOTE && open.pop() === undefined) {
      unpaired.add(i);
    }
  }
  open.forEach((i) => unpaired.add(i));
  if (unpaired.size === 0) return text;
  // split('') keeps UTF-16 indexes aligned with text[i] above.
  return text
    .split('')
    .filter((_, i) => !unpaired.has(i))
    .join('');
}

/** Shortens an over-long sentence to at most CUT_LIMIT characters with "…". */
function cutSentence(sentence: string): string {
  // Marks and spaces at index <= 79 leave at most 79 characters before the "…".
  const head = sentence.slice(0, CUT_LIMIT);
  const clause = Math.max(head.lastIndexOf(';'), head.lastIndexOf(','), head.lastIndexOf('—'));
  const space = head.lastIndexOf(' ');
  // A clause cut that leaves a fragment shorter than a fitting line loses to the word cut.
  const end = clause >= MIN_LINE ? clause : space > 0 ? space : CUT_LIMIT - 1;
  return `${sentence.slice(0, end).replace(/[\s,;:–—-]+$/, '')}${ELLIPSIS}`;
}

/**
 * The first sentence of `text` that is 28 to 84 characters long. Otherwise
 * the first sentence, cut at its last clause mark (; , —) or word break
 * within 80 characters. A short first sentence stays whole. Curly double
 * quotes without a partner are removed, in the text and in the line.
 */
export function deriveLockLine(text: string): string {
  const clean = collapseWhitespace(dropUnpairedQuotes(text));
  if (clean === '') return '';

  const sentences = clean.match(SENTENCE) ?? [clean];
  const first = sentences[0];
  const line =
    sentences.find((s) => s.length >= MIN_LINE && s.length <= MAX_LINE) ??
    (first.length <= MAX_LINE ? first : cutSentence(first));

  return collapseWhitespace(dropUnpairedQuotes(line));
}
