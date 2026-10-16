/**
 * The suggestion chips under a finished companion reply.
 *
 * The server sends a list with every finished reply, and an empty list is a
 * decision, not a gap: a refused turn and the server's crisis reply carry
 * none. The app used to swap every empty list for the same three chips, so a
 * reader in crisis saw "How do I apply this?" under the 988 reply.
 *
 * Now only a reply that carries no list at all (an older server, a malformed
 * frame) borrows chips, and those come from a seeded bag, so the same three
 * do not follow every such reply.
 */
import { pickFromBag } from '@/lib/variation-bag';

/**
 * Chips for a reply that arrived without a list. They are the reader's own
 * words when tapped, and they have to fit under any reply.
 *
 * Twelve in threes: a draw never straddles two laps of the bag, and the
 * bag's guard band (a quarter of the pool, so three) keeps the first draw of
 * a lap clear of the last draw of the lap before. Two consecutive draws
 * therefore never share a chip. Keep the length a multiple of three, and at
 * least twelve.
 */
export const FALLBACK_SUGGESTIONS = [
  'Tell me more',
  'Go a little deeper',
  'Say that another way',
  'Show me a verse for this',
  'Help me pray about this',
  'What would this look like today?',
  'Give me one small step',
  'What does this ask of me?',
  'Where do I start?',
  'What matters most here?',
  'Where is God in this?',
  'Help me think this through',
] as const;

export const FALLBACK_SUGGESTIONS_PER_REPLY = 3;

/**
 * The list a reply carried: undefined when the field is absent or not a
 * list, otherwise its non-blank strings. An empty result stays empty.
 */
export function readSuggestionList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

/**
 * Crisis lines as the companion gives them: 988 with a call or text, the
 * Lifeline by name, the Crisis Text Line, and the domestic violence hotline.
 * A bare "988" is not enough, so a year such as 988 AD does not count.
 */
const CRISIS_LINES: readonly RegExp[] = [
  /\b(?:call|text|dial)\b[^.\n]{0,12}\b988\b/i,
  /\b988\b[\s(]{0,3}(?:suicide|crisis|lifeline)/i,
  /\b741741\b/,
  /\b799-?7233\b/,
  /\bcrisis (?:text )?line\b|\bcrisis lifeline\b/i,
];

/**
 * Whether a reply gives the reader a crisis line. The server sends no chips
 * with its own crisis reply, but a crisis answer the model wrote can still
 * carry them. No chip belongs under a reply that sends the reader to 988.
 */
export function sharesCrisisLine(text: string): boolean {
  return CRISIS_LINES.some((pattern) => pattern.test(text));
}

/**
 * Three fallback chips for one draw. Deterministic in (seed, draw): the same
 * reply always shows the same chips, and consecutive draws share none.
 */
export function fallbackSuggestions(seed: string, draw: number): string[] {
  const chips: string[] = [];
  for (let slot = 0; slot < FALLBACK_SUGGESTIONS_PER_REPLY; slot += 1) {
    const chip = pickFromBag(FALLBACK_SUGGESTIONS, seed, draw * FALLBACK_SUGGESTIONS_PER_REPLY + slot);
    if (chip) chips.push(chip);
  }
  return chips;
}

/**
 * The chips to show under a finished reply.
 *
 * - A reply that gives a crisis line shows none, whatever the server sent.
 * - A list the server sent is final, an empty one included.
 * - Only a reply with no list at all draws from the fallback pool.
 */
export function replySuggestions(
  sent: readonly string[] | undefined,
  replyText: string,
  fallback: { seed: string; draw: number },
): string[] {
  if (sharesCrisisLine(replyText)) return [];
  if (sent) return [...sent];
  return fallbackSuggestions(fallback.seed, fallback.draw);
}
