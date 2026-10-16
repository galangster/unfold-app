/**
 * The rules every new line of app copy follows: no persona banned phrase,
 * no stock empathy, no "sitting with" or "wrestling with", no em dash, no
 * exclamation mark, and no mention of AI. A phrase counts as whole words,
 * so "deeper" is not "deeply".
 */
import { BANNED_PHRASES } from '@/constants/persona';

const STOCK_EMPATHY = [
  'good question',
  'great question',
  'this is a safe place',
  'this is a safe space',
  "it's okay to feel",
  "there's no judgment",
  'i hear you',
  "i'm here for you",
  'thank you for sharing',
];

const WATCHED_PHRASES = [...BANNED_PHRASES, ...STOCK_EMPATHY, 'sitting with', 'wrestling with'];

/** `phrase` as whole words; a straight apostrophe also matches a curly one. */
function holdsPhrase(text: string, phrase: string): boolean {
  const body = phrase
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]"))
    .join('\\s+');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

/** Every rule `line` breaks. An empty list means the line is clean. */
export function copyRuleBreaks(line: string): string[] {
  const breaks = WATCHED_PHRASES.filter((phrase) => holdsPhrase(line, phrase));
  if (line.includes('—')) breaks.push('em dash');
  if (line.includes('!')) breaks.push('exclamation mark');
  if (/\bAI\b|artificial intelligence|language model|chatbot/i.test(line)) breaks.push('AI mention');
  return breaks;
}
