/**
 * The suggestion chips under a finished companion reply.
 *
 * The server sends a list with every finished reply, and an empty list is a
 * decision, not a gap: a refused turn and the server's crisis reply carry
 * none. The app used to swap every empty list for the same three chips, so a
 * reader in crisis saw "How do I apply this?" under the 988 reply.
 *
 * When the model gives no list, today's server sends that same fixed trio
 * itself. The app reads the trio as no list, so the trio never shows with
 * either server. A reply with no list (the trio, or a frame without the
 * field) borrows chips from a seeded bag, so the same three do not follow
 * every such reply.
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

/** A list as a key that ignores order and edge spaces. */
const chipsKey = (chips: readonly string[]) => JSON.stringify(chips.map((chip) => chip.trim()).sort());

/** The chips today's server sends in place of a list the model did not give. */
const SERVER_FALLBACK_TRIO = chipsKey(['Tell me more', 'How do I apply this?', 'Help me with a prayer']);

/**
 * The list a reply carried: undefined when the field is absent or not a
 * list, or when it is exactly the server's fixed trio, in any order.
 * Otherwise its non-blank strings. An empty result stays empty.
 */
export function readSuggestionList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
  return chipsKey(list) === SERVER_FALLBACK_TRIO ? undefined : list;
}

/** A word for reaching a line, in any form: "call", "calling", "texted", "contact". */
const REACH = String.raw`\b(?:call|text|dial|phone|chat|contact)\w*`;

/**
 * Crisis lines as a reply can give them, matched loosely on purpose: hiding
 * chips under a reply that did not need it costs little, and a chip under a
 * crisis answer is the harm this module exists to stop.
 *
 * - 988 or 911 with a way to reach it on either side: "call or text 988",
 *   "calling or texting 988", "contact 988", "988 by call or text",
 *   "988 (call or text)". A bare 988, such as the year 988 AD, does not count.
 * - A lifeline, hotline, helpline or crisis line by name: the 988 Lifeline,
 *   the Crisis Text Line, the domestic violence hotline. The metaphor counts
 *   too.
 * - The numbers: 741741 for the Crisis Text Line; 799-7233, 799-SAFE and
 *   88788 for the domestic violence hotline; 273-8255 and 273-TALK, the old
 *   Lifeline number.
 */
const CRISIS_LINES: readonly RegExp[] = [
  new RegExp(String.raw`${REACH}\b[^.\n]{0,40}\b(?:988|911)\b`, 'i'),
  new RegExp(String.raw`\b(?:988|911)\b[^.\n]{0,40}${REACH}`, 'i'),
  /\b(?:life|hot|help)line\b|\bcrisis (?:text )?line\b/i,
  /\b741741\b|\b88788\b/,
  /\b799[-. ]?(?:7233|safe)\b/i,
  /\b273[-. ]?(?:8255|talk)\b/i,
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
 * - Only a reply with no list draws from the fallback pool. `sent` comes
 *   from readSuggestionList, which reads the server's fixed trio as no list.
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
