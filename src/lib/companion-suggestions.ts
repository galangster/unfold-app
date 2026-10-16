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
import { drawConsecutive } from '@/lib/variation-bag';

/**
 * Chips for a reply that arrived without a list. They are the reader's own
 * words when tapped, and they have to fit under any reply.
 *
 * Keep the length one that drawsStayApart accepts at three a reply (twelve
 * or more, in threes), so two consecutive replies never share a chip.
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
 * Where a reply without a list draws its chips: the install seed, the
 * conversation (each one is its own sequence), and the reply's place among
 * that conversation's replies.
 */
export interface FallbackChipDraw {
  seed: string;
  conversationId: string;
  replyIndex: number;
}

/**
 * Three fallback chips for one reply. Deterministic in the draw: the same
 * reply always shows the same chips, and consecutive replies share none.
 */
export function fallbackSuggestions({ seed, conversationId, replyIndex }: FallbackChipDraw): string[] {
  return drawConsecutive(
    FALLBACK_SUGGESTIONS,
    { seed, dayIndex: replyIndex },
    `companion-chips|${conversationId}`,
    FALLBACK_SUGGESTIONS_PER_REPLY,
  );
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
  fallback: FallbackChipDraw,
): string[] {
  if (sharesCrisisLine(replyText)) return [];
  if (sent) return [...sent];
  return fallbackSuggestions(fallback);
}
