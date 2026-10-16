/**
 * The safety net that runs on every bridge after the model writes it.
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

const LETTER_OR_DIGIT_START = /^[\p{L}\p{N}]/u;
const LETTER_OR_DIGIT_END = /[\p{L}\p{N}]$/u;

/**
 * One phrase as a pattern that matches whole words only. Spaces match any
 * run of whitespace, and a straight apostrophe matches a curly one too, so
 * "Here’s the thing" is caught as well as "Here's the thing".
 */
function wholePhrasePattern(phrase: string): RegExp {
  const body = phrase
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]"))
    .join('\\s+');
  const head = LETTER_OR_DIGIT_START.test(phrase) ? '(?:^|[^\\p{L}\\p{N}])' : '';
  const tail = LETTER_OR_DIGIT_END.test(phrase) ? '(?![\\p{L}\\p{N}])' : '';
  return new RegExp(`${head}${body}${tail}`, 'iu');
}

/** Every banned phrase, longest first, so "season of" is found before "season". */
const BANNED_PATTERNS: readonly { phrase: string; pattern: RegExp }[] = [
  ...new Set([...BANNED_PHRASES, ...CRUDE_PHRASES].map((phrase) => phrase.toLowerCase())),
]
  .sort((a, b) => b.length - a.length)
  .map((phrase) => ({ phrase, pattern: wholePhrasePattern(phrase) }));

/** The longest banned phrase `text` holds as whole words, or null. */
export function findBannedPhrase(text: string): string | null {
  return BANNED_PATTERNS.find(({ pattern }) => pattern.test(text))?.phrase ?? null;
}

const SENTENCE_PIECE = /[^.!?…]+(?:[.!?…]+["'”’)\]]*)?/g;
const ENDS_SENTENCE = /[.!?…]["'”’)\]]*$/;
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
    const sentence = text.slice(from, end);
    const closesHere = end >= text.length || /\s/.test(text[end]);
    if (!closesHere || ABBREVIATION_END.test(sentence.trimEnd())) {
      openFrom = from;
      continue;
    }
    openFrom = -1;
    const trimmed = sentence.trim();
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

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * The bar Today holds a bridge to before it shows one, and the bar the cache
 * holds it to before it stores one.
 */
export function isDisplayableBridge(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 20 && /[.!?…"']$/.test(trimmed);
}

/**
 * Clean a bridge the model wrote: no em dashes, God capitalized where it
 * names God, and no sentence that holds a banned or crude phrase.
 *
 * Returns null when the bridge cannot be shown: it was cut off, or removing
 * the sentences with banned phrases left too little to read as a bridge.
 * Running it twice gives the same result as running it once, so a cached
 * bridge can pass through it again on the way out.
 */
export function sanitizeBridgeText(text: string): string | null {
  const cleaned = capitalizeGodSlips(
    text
      // Em dashes read as awkward pauses in text-to-speech.
      .replace(/\s*—\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .replace(/,\s*,/g, ',')
      .replace(/,\s*([.!?…])/g, '$1')
      .replace(/^,\s*/, '')
      .trim(),
  );

  const sentences = splitSentences(cleaned);
  // A reply cut off mid-sentence keeps only its complete sentences.
  if (sentences.length > 1 && !ENDS_SENTENCE.test(sentences[sentences.length - 1])) {
    sentences.pop();
  }

  const kept = sentences.filter((sentence) => findBannedPhrase(sentence) === null);
  if (kept.length < sentences.length) {
    const rest = kept.join(' ');
    if (kept.length < MIN_KEPT_SENTENCES || wordCount(rest) < MIN_KEPT_WORDS) return null;
  }

  const result = kept.join(' ');
  return isDisplayableBridge(result) ? result : null;
}
