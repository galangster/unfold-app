/**
 * The one checker for every new line of app copy: the daily copy, the
 * app-written prompts, and the copy fixes all call it, so a rule added here
 * checks every lane. A line breaks a rule when it holds a persona banned
 * phrase, a crude phrase, stock empathy or another companion tell, a dash,
 * an exclamation mark, an emoji, stray spaces, or a mention of AI.
 *
 * A phrase matches as the bridge's safety net matches it
 * (lib/bridge-text.ts): as whole words, so "deeper" is not "deeply", with
 * any run of whitespace between words (a no-break space too), and with a
 * straight apostrophe matching a curly one.
 */
import { BANNED_PHRASES } from '@/constants/persona';
import { CRUDE_PHRASES, bannedPhrasePattern } from '@/lib/bridge-text';

/** Tells from the companion's and the bridge's lists that the persona list does not hold. */
const EXTRA_PHRASES = [
  'good question',
  'great question',
  'this is a safe place',
  'this is a safe space',
  "it's okay to feel",
  "there's no judgment",
  'i hear you',
  "i'm here for you",
  'thank you for sharing',
  "that's valid",
  'i want you to know',
  'sitting with',
  'wrestling with',
];

/** Each watched phrase once, whatever its case, with its pattern built once. */
const WATCHED: readonly { phrase: string; pattern: RegExp }[] = [
  ...new Map(
    [...BANNED_PHRASES, ...CRUDE_PHRASES, ...EXTRA_PHRASES].map((phrase) => [phrase.toLowerCase(), phrase]),
  ).values(),
].map((phrase) => ({ phrase, pattern: bannedPhrasePattern(phrase) }));

/** Every rule `line` breaks. An empty list means the line is clean. */
export function copyRuleBreaks(line: string): string[] {
  const breaks = WATCHED.filter(({ pattern }) => pattern.test(line)).map(({ phrase }) => phrase);
  if (line.includes('—')) breaks.push('em dash');
  if (line.includes('–')) breaks.push('en dash');
  if (line.includes('!')) breaks.push('exclamation mark');
  if (/\p{Extended_Pictographic}/u.test(line)) breaks.push('emoji');
  if (line !== line.trim() || / {2}/.test(line)) breaks.push('stray spaces');
  if (/\bAI\b/.test(line) || /artificial intelligence|language model|chatbot/i.test(line)) breaks.push('AI mention');
  return breaks;
}

/** Fails with the line and the rules it breaks, so a new entry that breaks a rule names itself. */
export function expectCopyRules(line: string): void {
  const breaks = copyRuleBreaks(line);
  if (breaks.length > 0) throw new Error(`"${line}" breaks: ${breaks.join(', ')}`);
}
