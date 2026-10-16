/**
 * The safety net that runs on every bridge after the model writes it, and the
 * sentence and word rules the other app-written prompts share.
 *
 * Banned phrases used to be deleted as raw substrings, case-insensitively,
 * from the middle of the text. That cut words apart: "journeyed" became
 * "ed", "boyfriend," became "boy", and "a season of rest" became "a of rest".
 * Now a phrase counts only as whole words, and a sentence that holds one goes
 * whole. When too little is left to read as a bridge, the result is null and
 * Today shows no bridge, the same state as a failed request.
 */

import { BANNED_PHRASES } from '@/constants/persona';
import { capitalizeGodSlips } from '@/lib/god-capitalization';

/**
 * Crude words the persona forbids. They used to be deleted mid-sentence too,
 * and "freaking" was swapped for "really", which is itself banned. A sentence
 * that holds one now goes whole, like a sentence with a banned phrase.
 */
const CRUDE_PHRASES = ['as hell', 'hell of a', 'damn', 'freaking'];

/** What must remain after a sentence is removed for the rest to read as a bridge. */
const MIN_KEPT_SENTENCES = 2;
const MIN_KEPT_WORDS = 15;

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

/** Every banned phrase, lowercased and longest first, so "season of" is found before "season". */
const BANNED: readonly string[] = [
  ...new Set([...BANNED_PHRASES, ...CRUDE_PHRASES].map((phrase) => phrase.toLowerCase())),
].sort((a, b) => b.length - a.length);

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
 * Two patterns test a sentence for every banned phrase at once. The phrases
 * that end in a letter or digit need the word-end check. The few that end in
 * punctuation ("Friend,", "Can I be honest?") do not.
 */
const BANNED_GATES: readonly RegExp[] = [true, false].flatMap((needsWordEnd) => {
  const bodies = BANNED.filter((phrase) => LETTER_OR_DIGIT_END.test(phrase) === needsWordEnd).map(phraseBody);
  return bodies.length > 0 ? [new RegExp(`${WORD_START}(?:${bodies.join('|')})${needsWordEnd ? WORD_END : ''}`, 'iu')] : [];
});

function holdsBannedPhrase(text: string): boolean {
  return BANNED_GATES.some((gate) => gate.test(text));
}

/** Built on the first call: only tests and logs need to know which phrase matched. */
let phrasePatterns: { phrase: string; pattern: RegExp }[] | null = null;

/** The longest banned phrase `text` holds as whole words, or null. */
export function findBannedPhrase(text: string): string | null {
  if (!holdsBannedPhrase(text)) return null;
  if (!phrasePatterns) {
    phrasePatterns = BANNED.map((phrase) => ({
      phrase,
      pattern: new RegExp(`${WORD_START}${phraseBody(phrase)}${LETTER_OR_DIGIT_END.test(phrase) ? WORD_END : ''}`, 'iu'),
    }));
  }
  return phrasePatterns.find(({ pattern }) => pattern.test(text))?.phrase ?? null;
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
 * Clean a bridge the model wrote: no em dashes, God capitalized where it
 * names God, and no sentence that holds a banned or crude phrase.
 *
 * Returns null when the bridge cannot be shown: it was cut off, or removing
 * the sentences with banned phrases left too little to read as a bridge.
 * Running it twice gives the same result as running it once.
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

  const sentences = splitSentences(cleaned);
  // A reply cut off mid-sentence keeps only its complete sentences.
  if (sentences.length > 1 && !endsSentence(sentences[sentences.length - 1])) {
    sentences.pop();
  }

  const kept = sentences.filter((sentence) => !holdsBannedPhrase(sentence));
  const result = kept.join(' ');
  const removedSome = kept.length < sentences.length;
  if (removedSome && (kept.length < MIN_KEPT_SENTENCES || countWords(result) < MIN_KEPT_WORDS)) return null;
  return isDisplayableBridge(result) ? result : null;
}
