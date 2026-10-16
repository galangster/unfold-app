/**
 * The safety net that runs on every bridge after the model writes it, and the
 * sentence and word rules the other app-written prompts share.
 *
 * Banned phrases used to be deleted as raw substrings, case-insensitively,
 * from the middle of the text. That cut words apart: "journeyed" became
 * "ed", "boyfriend," became "boy", and "a season of rest" became "a of rest".
 * Removing the one sentence that held a phrase still broke bridges, because
 * a sentence split can be wrong: after an ellipsis, before a dialogue tag,
 * or inside a quotation. Now a phrase counts only as whole words, and a
 * bridge that holds one is dropped whole, never cut. Only Scripture's own
 * words pass inside a quotation (SCRIPTURE_WORDS). Today then shows no
 * bridge, the same state as a failed request.
 */

import { BANNED_PHRASES } from '@/constants/persona';
import { capitalizeGodSlips } from '@/lib/god-capitalization';

/**
 * Crude words the persona forbids. They used to be deleted mid-sentence too,
 * and "freaking" was swapped for "really", which is itself banned. A bridge
 * that holds one is now dropped whole, like a bridge with a banned phrase.
 */
const CRUDE_PHRASES = ['as hell', 'hell of a', 'damn', 'freaking'];

// ---------------------------------------------------------------------------
// Shared text rules
// ---------------------------------------------------------------------------

/** End punctuation, then any closing quotes or brackets: the one rule for where a sentence ends. */
const ENDS_SENTENCE = /[.!?…]["'”’)\]]*$/;

/** True when `text` ends a sentence: "Rest.", "He said, “Eat.”", "(and them.)". */
export function endsSentence(text: string): boolean {
  return ENDS_SENTENCE.test(text.trimEnd());
}

/** The number of words in `text`. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** `text` without any of `characters` at its end. A loop, so a long run costs one pass. */
export function trimTrailing(text: string, characters: string): string {
  let end = text.length;
  while (end > 0 && characters.includes(text[end - 1])) end--;
  return text.slice(0, end);
}

/**
 * Each em dash, with the whitespace around it, becomes ", ", as in the
 * backend. A loop, not /\s*—\s*\/g, which rescans a long whitespace run from
 * each of its positions when no dash follows it.
 */
export function spaceEmDashes(text: string): string {
  let out = '';
  let from = 0;
  for (let dash = text.indexOf('—'); dash >= 0; dash = text.indexOf('—', from)) {
    let start = dash;
    while (start > from && /\s/.test(text[start - 1])) start--;
    let end = dash + 1;
    while (end < text.length && /\s/.test(text[end])) end++;
    out += `${text.slice(from, start)}, `;
    from = end;
  }
  return out + text.slice(from);
}

// ---------------------------------------------------------------------------
// Banned phrases
// ---------------------------------------------------------------------------

const LETTER_OR_DIGIT_END = /[\p{L}\p{N}]$/u;
/** Before a phrase: the start of the text or a character that is not part of a word. */
const WORD_START = '(?:^|[^\\p{L}\\p{N}])';
/** After a phrase that ends in a letter or digit: no letter or digit. */
const WORD_END = '(?![\\p{L}\\p{N}])';

/**
 * "Friend," is banned as the vocative that opens a sentence ("Friend, this
 * one is for you."), so it counts only where a sentence starts, after any
 * opening quotation mark or bracket. "Think of a friend, a sister" keeps its
 * friend.
 */
const SENTENCE_OPENER = 'friend,';
const SENTENCE_OPENER_PATTERN = /(?:^|[.!?…]["'”’)\]]*\s+)["'“‘([]*friend,/iu;

/**
 * Banned words that are also Scripture's own ("the journey is too much for
 * you", "a season for everything", "Truly I tell you"). Inside a quotation
 * they are the passage's words, so they pass there. Every other banned
 * phrase and every crude phrase counts inside quotation marks too.
 */
const SCRIPTURE_WORDS: ReadonlySet<string> = new Set(['journey', 'season', 'season of', 'pour out', 'throne of grace', 'truly']);

/** Every other banned phrase, lowercased and longest first, so "season of" is found before "season". */
const BANNED: readonly string[] = [
  ...new Set([...BANNED_PHRASES, ...CRUDE_PHRASES].map((phrase) => phrase.toLowerCase())),
]
  .filter((phrase) => phrase !== SENTENCE_OPENER)
  .sort((a, b) => b.length - a.length);

/**
 * One phrase as a pattern body. Spaces match any run of whitespace, and a
 * straight apostrophe matches a curly one too, so "Here’s the thing" is
 * caught as well as "Here's the thing". Every phrase starts with a letter.
 */
function phraseBody(phrase: string): string {
  return phrase
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]"))
    .join('\\s+');
}

/**
 * Two patterns test a text for every banned phrase at once, quoted or not, so
 * clean text costs two tests. The phrases that end in a letter or digit need
 * the word-end check. The few that end in punctuation ("Can I be honest?")
 * do not.
 */
const BANNED_GATES: readonly RegExp[] = [true, false].flatMap((needsWordEnd) => {
  const bodies = BANNED.filter((phrase) => LETTER_OR_DIGIT_END.test(phrase) === needsWordEnd).map(phraseBody);
  return bodies.length > 0 ? [new RegExp(`${WORD_START}(?:${bodies.join('|')})${needsWordEnd ? WORD_END : ''}`, 'iu')] : [];
});

function holdsBannedPhrase(text: string): boolean {
  return BANNED_GATES.some((gate) => gate.test(text));
}

/**
 * The spans of `text` inside double quotation marks, the marks included, or
 * none when the marks do not balance. A straight mark opens a quotation only
 * at the start of the text or after a space or an opening bracket, and
 * closes one anywhere else. “ opens and ” closes. Each quotation must close
 * before the next of its kind opens. A span around the whole reply is the
 * model wrapping its own words, not a quotation, so it does not count.
 */
function quotedSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  let straight = -1;
  let curly = -1;
  for (let at = 0; at < text.length; at += 1) {
    const mark = text[at];
    if (mark === '"') {
      if (at === 0 || /[\s([]/.test(text[at - 1])) {
        if (straight >= 0) return [];
        straight = at;
      } else {
        if (straight < 0) return [];
        spans.push([straight, at + 1]);
        straight = -1;
      }
    } else if (mark === '“') {
      if (curly >= 0) return [];
      curly = at;
    } else if (mark === '”') {
      if (curly < 0) return [];
      spans.push([curly, at + 1]);
      curly = -1;
    }
  }
  if (straight >= 0 || curly >= 0) return [];
  const first = text.search(/\S/);
  const last = text.trimEnd().length;
  return spans.filter(([start, end]) => start > first || end < last);
}

/**
 * Built on the first call: each phrase as a pattern that finds every place
 * it occurs. The first group is the character before the phrase, so the
 * phrase starts at the end of that group.
 */
let phrasePatterns: { phrase: string; pattern: RegExp }[] | null = null;

/**
 * The longest banned phrase `text` holds as whole words, or null. A word of
 * SCRIPTURE_WORDS inside a quotation does not count. "Friend," counts only
 * where a sentence starts.
 */
export function findBannedPhrase(text: string): string | null {
  if (holdsBannedPhrase(text)) {
    const spans = quotedSpans(text);
    if (!phrasePatterns) {
      phrasePatterns = BANNED.map((phrase) => ({
        phrase,
        pattern: new RegExp(`(${WORD_START})${phraseBody(phrase)}${LETTER_OR_DIGIT_END.test(phrase) ? WORD_END : ''}`, 'giu'),
      }));
    }
    for (const { phrase, pattern } of phrasePatterns) {
      for (const match of text.matchAll(pattern)) {
        const at = (match.index ?? 0) + match[1].length;
        if (!SCRIPTURE_WORDS.has(phrase) || !spans.some(([start, end]) => at >= start && at < end)) return phrase;
      }
    }
  }
  return SENTENCE_OPENER_PATTERN.test(text) ? SENTENCE_OPENER : null;
}

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

const SENTENCE_PIECE = /[^.!?…]+(?:[.!?…]+["'”’)\]]*)?/g;
/** A period after one of these does not end the sentence: "St. Paul". */
const ABBREVIATION_END = /\b(?:St|Mt|Mr|Mrs|Ms|Dr|Jr|Sr|vs)\.$/;

/**
 * The sentences of `text`, each with its end punctuation and closing quotes.
 * End punctuation closes a sentence only before whitespace or the end of the
 * text, so "3.5" and "e.g" stay inside one sentence.
 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  const piece = new RegExp(SENTENCE_PIECE.source, 'g');
  let openFrom = -1;
  let match: RegExpExecArray | null;
  while ((match = piece.exec(text)) !== null) {
    const from = openFrom >= 0 ? openFrom : match.index;
    const end = match.index + match[0].length;
    const closesHere = end >= text.length || /\s/.test(text[end]);
    // Only this piece can end in an abbreviation, so only this piece is tested.
    if (!closesHere || ABBREVIATION_END.test(match[0].trimEnd())) {
      openFrom = from;
      continue;
    }
    openFrom = -1;
    const trimmed = text.slice(from, end).trim();
    if (trimmed) sentences.push(trimmed);
  }
  if (openFrom >= 0) {
    const rest = text.slice(openFrom).trim();
    if (rest) sentences.push(rest);
  }
  return sentences;
}

/** The first sentence of `text`, or '' for empty text. */
export function firstSentence(text: string): string {
  return splitSentences(text)[0] ?? '';
}

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

/** The bar a bridge must clear before it is cached or shown. Today holds its card to the same bar. */
export function isDisplayableBridge(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 20 && endsSentence(trimmed);
}

/**
 * Clean a bridge the model wrote: no em dashes, and God capitalized where it
 * names God.
 *
 * Returns null when the bridge cannot be shown: it holds a banned or crude
 * phrase (findBannedPhrase), it copied the "[name]" token from its avoid
 * lines, or it was cut off mid-sentence. A bridge is kept whole or dropped
 * whole, never cut, so a sentence split that goes wrong cannot leave half a
 * sentence on Today. Running it twice gives the same result as running it
 * once.
 */
export function sanitizeBridgeText(text: string): string | null {
  const cleaned = capitalizeGodSlips(
    spaceEmDashes(text)
      .replace(/\s+/g, ' ')
      .replace(/,\s*,/g, ',')
      .replace(/,\s*([.!?…])/g, '$1')
      .replace(/^,\s*/, '')
      .trim(),
  );
  if (/\[name\]/i.test(cleaned) || findBannedPhrase(cleaned) !== null) return null;
  return isDisplayableBridge(cleaned) ? cleaned : null;
}
