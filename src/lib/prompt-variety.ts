/**
 * The per-day shape of each prompt the app writes itself: the morning bridge,
 * the evening examen, Go Deeper, and the legacy devotional batch.
 *
 * A reader reported that every devotional prayer ended on the same line. The
 * shared persona fixed the close of every piece ("end with a question or a
 * short sentence") and the name ("once per piece, early"), and the feature
 * prompts gave quoted openers the model copied. So every piece opened and
 * closed the same way. Each feature now draws its opening, its closing, and
 * whether to use the reader's name from the repeat-free bag
 * (lib/variation-bag.ts), and names them in its user message.
 *
 * Each field is salted separately, so two fields drawn for one day move
 * independently. The seed carries the install id, so two readers are on
 * different sequences. A pool's length is part of every reader's sequence:
 * changing it reshuffles the current lap, so keep each length stable.
 */

import type { ClosingStyle } from '@/constants/devotional-personas-v2';
import { drawCopy, type CopyVariation } from '@/lib/variation-bag';

/** One move a prompt can make, as the instruction the model reads. */
export interface PromptMove {
  id: string;
  instruction: string;
}

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

/**
 * How the bridge opens. None starts with the reader's name or a greeting:
 * every bridge used to open "Hey {name}, today's reading is about...". Each
 * one works whether or not the reader checked in yesterday.
 */
export const BRIDGE_OPENINGS: readonly PromptMove[] = [
  { id: 'topic-first', instruction: "Name today's topic plainly in the first few words." },
  { id: 'question', instruction: "Open with a question that today's reading takes up." },
  { id: 'detail', instruction: 'Open with one concrete detail from the passage: a place, an object, or a moment.' },
  { id: 'short-claim', instruction: 'Open with a short, bold statement about the reading, five words or fewer.' },
  { id: 'surprise', instruction: "Open with what is unexpected about the angle today's reading takes." },
  { id: 'mid-thought', instruction: 'Open mid-thought, as if the conversation was already going, with the central tension of the reading.' },
  { id: 'person', instruction: "Open with a person in today's passage and what they did or said, in plain words." },
];

/** How the bridge ends. */
export const BRIDGE_CLOSINGS: readonly PromptMove[] = [
  { id: 'open-question', instruction: 'End with a question the reading raises, and leave it open.' },
  { id: 'plain-statement', instruction: 'End with a plain statement. No question in the last sentence.' },
  { id: 'image', instruction: 'End on one concrete image or detail from the reading.' },
  { id: 'scripture-echo', instruction: "End with a few words that echo today's Scripture, without the reference." },
  { id: 'hand-off', instruction: 'End with one short, low-key line that hands them the reading.' },
  { id: 'tension', instruction: 'End on the tension in the reading, without resolving it.' },
];

/** One morning in three uses the reader's name. Every bridge used to, in its first words. */
export const BRIDGE_NAME_DAYS: readonly boolean[] = [true, false, false];

export interface BridgeShape {
  opening: PromptMove;
  closing: PromptMove;
  useName: boolean;
}

export function bridgeShapeFor(draw: CopyVariation): BridgeShape {
  return {
    opening: drawCopy(BRIDGE_OPENINGS, draw, 'bridge-opening'),
    closing: drawCopy(BRIDGE_CLOSINGS, draw, 'bridge-closing'),
    useName: drawCopy(BRIDGE_NAME_DAYS, draw, 'bridge-name'),
  };
}

// ---------------------------------------------------------------------------
// Evening examen
// ---------------------------------------------------------------------------

/** How the prayer ends: the last sentence of its fifth movement. */
export const EXAMEN_CLOSINGS: readonly PromptMove[] = [
  { id: 'trust', instruction: 'End with one plain sentence of trust about tomorrow.' },
  { id: 'rest', instruction: 'End with a short request for rest tonight.' },
  { id: 'image', instruction: 'End with one image from today, handed back to God.' },
  { id: 'scripture-echo', instruction: "End with a few words that echo today's Scripture, without the reference." },
  { id: 'open-question', instruction: "End with an honest question, left in God's hands." },
  { id: 'surrender', instruction: 'End with one short sentence of surrender.' },
];

/**
 * The line the evening screen prints under the prayer. It was "Amen." every
 * night. Null is a night with no line, when the prayer ends on its fifth
 * movement.
 */
export const EXAMEN_CLOSING_LINES: readonly (string | null)[] = [
  'Amen.',
  'Into your hands, Lord. Amen.',
  'Guard me as I sleep. Amen.',
  'In Jesus’ name, amen.',
  'Let it be so.',
  'Goodnight, Lord.',
  null,
];

export interface ExamenShape {
  closing: PromptMove;
  closingLine: string | null;
}

export function examenShapeFor(draw: CopyVariation): ExamenShape {
  return {
    closing: drawCopy(EXAMEN_CLOSINGS, draw, 'examen-closing'),
    closingLine: drawCopy(EXAMEN_CLOSING_LINES, draw, 'examen-closing-line'),
  };
}

// ---------------------------------------------------------------------------
// Go Deeper
// ---------------------------------------------------------------------------

/**
 * What a Go Deeper prompt can do. A request takes three, in the bag's order.
 * It used to be the same three every time (feeling, life, imagination), each
 * with a quoted opener the model copied.
 *
 * The draw counts requests, not days (lib/go-deeper-prompt.ts). Twelve angles
 * at three a request make one lap of the bag four requests long. The bag holds
 * the last quarter of one lap (three entries, one request's worth) apart from
 * the first quarter of the next, so no angle comes back in the very next
 * request. Keep the length a multiple of three and at least twelve.
 */
export const GO_DEEPER_ANGLES: readonly PromptMove[] = [
  { id: 'feeling', instruction: 'The feeling under their words: ask about the emotion they came close to naming.' },
  { id: 'daily-life', instruction: 'Daily life: connect the reading to one concrete moment coming up in their week.' },
  { id: 'prayer', instruction: 'Prayer: invite them to write a few honest words to God about what they wrote.' },
  { id: 'imagination', instruction: 'Imagination: ask them to picture one scene from the passage and where they stand in it.' },
  { id: 'memory', instruction: 'Memory: ask about an earlier time in their life that this entry calls to mind.' },
  { id: 'resistance', instruction: 'Resistance: ask which part of the reading is hard to accept, and why.' },
  { id: 'unsaid', instruction: 'The unsaid: point to something they circled around and ask what they would add.' },
  { id: 'person', instruction: 'A person: ask who came to mind as they wrote, and what that person should know.' },
  { id: 'next-step', instruction: 'One small step: ask for one specific thing they could do in the next day.' },
  {
    id: 'scripture-phrase',
    instruction: "The passage: set one phrase from today's Scripture beside one phrase of theirs, and ask how the two connect.",
  },
  { id: 'gratitude', instruction: 'Gratitude: ask about one good thing in their entry that they moved past quickly.' },
  { id: 'question-for-god', instruction: 'A question for God: ask what they would ask God about this, if they could ask one thing.' },
];

export const GO_DEEPER_ANGLES_PER_REQUEST = 3;

/**
 * A request's three angles: three consecutive draws, so they never repeat
 * within it. `draw.dayIndex` carries the request's number, not a day.
 */
export function goDeeperAnglesFor(draw: CopyVariation): PromptMove[] {
  const first = draw.dayIndex * GO_DEEPER_ANGLES_PER_REQUEST;
  return Array.from({ length: GO_DEEPER_ANGLES_PER_REQUEST }, (_, offset) =>
    drawCopy(GO_DEEPER_ANGLES, draw, 'go-deeper-angle', first + offset),
  );
}

// ---------------------------------------------------------------------------
// Legacy devotional batch (lib/devotional-service.ts)
// ---------------------------------------------------------------------------

/** The six closing styles the batch prompt rotated through by day number. */
export const LEGACY_DEVOTIONAL_CLOSINGS: readonly ClosingStyle[] = [
  'question',
  'blessing',
  'invitation',
  'warning',
  'reflection',
  'doxology',
];

/** One day in five may carry the reader's name, the rate the batch prompt already asked for. */
export const LEGACY_DEVOTIONAL_NAME_DAYS: readonly boolean[] = [true, false, false, false, false];

export interface LegacyDevotionalDayShape {
  closing: ClosingStyle;
  useName: boolean;
}

/**
 * A series day's closing and name use. It draws on the day number, not the
 * calendar, because a series is read one day after another. Day 1 never
 * carries the name, as the batch prompt has always required.
 */
export function legacyDevotionalDayShape(seed: string, dayNumber: number): LegacyDevotionalDayShape {
  const draw: CopyVariation = { seed, dayIndex: dayNumber };
  return {
    closing: drawCopy(LEGACY_DEVOTIONAL_CLOSINGS, draw, 'devotional-closing'),
    useName: dayNumber > 1 && drawCopy(LEGACY_DEVOTIONAL_NAME_DAYS, draw, 'devotional-name'),
  };
}
