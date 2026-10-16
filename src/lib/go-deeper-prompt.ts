/**
 * The Go Deeper request: three follow-up prompts for a freewrite journal
 * entry.
 *
 * It used to ask for the same three angles every time (feeling, life,
 * imagination), each steered by a quoted opener, and it never sent the
 * prompts the reader already had. Now the day's three angles come from the
 * bag, each described by what it does, and the reader's recent prompts go
 * with the request so the model does not write them again.
 */

import { PERSONA_BRIEF } from '@/constants/persona';
import { sanitizeForPrompt } from '@/lib/api-config';
import { avoidBlock, uniqueLines } from '@/lib/prompt-history';
import { goDeeperAnglesFor, type PromptDraw } from '@/lib/prompt-variety';
import type { JournalEntry } from '@/lib/store';

/** About three requests' worth of earlier prompts. */
export const GO_DEEPER_RECENT_LIMIT = 9;

const GO_DEEPER_SYSTEM_PROMPT = `${PERSONA_BRIEF}

WHAT YOU'RE DOING: Generate exactly 3 follow-up reflection prompts based on someone's journal entry about their devotional.

QUALITY:
- Each prompt MUST reference something specific from their entry, never generic.
- Read their words: what emotion is underneath? What are they circling around but haven't named?

ANGLES:
- The request names three angles, one for each prompt, in order.
- Each angle says what its prompt does, not how it starts. Write every prompt in your own words.

RULES:
- 1-2 sentences each.
- Never assume you know their situation. Ask, don't tell.
- Start each prompt in a different way. No two prompts begin with the same word.
- Never reuse the wording or the first words of a prompt listed under RECENT PROMPTS.
- Do not use the reader's name.

RESPOND WITH ONLY A JSON ARRAY OF EXACTLY 3 STRINGS. No other text, no markdown wrapping.`;

function entryTime(entry: JournalEntry): number {
  const time = Date.parse(entry.updatedAt || entry.createdAt);
  return Number.isNaN(time) ? 0 : time;
}

/**
 * The reader's most recent Go Deeper prompts, newest entry first. An entry's
 * `updatedAt` moves when its prompts are saved, so an old entry that just got
 * prompts counts as recent.
 */
export function recentGoDeeperPrompts(
  entries: readonly JournalEntry[],
  limit = GO_DEEPER_RECENT_LIMIT,
): string[] {
  return entries
    .filter((entry) => (entry.deeperQuestions?.length ?? 0) > 0)
    .sort((a, b) => entryTime(b) - entryTime(a))
    .flatMap((entry) => entry.deeperQuestions ?? [])
    .slice(0, limit);
}

export interface GoDeeperRequestInput {
  devotionalTitle: string;
  dayTitle: string;
  scriptureReference: string;
  entryText: string;
  /** The reader's earlier prompts, newest first (recentGoDeeperPrompts). */
  recentPrompts: readonly string[];
  draw: PromptDraw;
}

export function buildGoDeeperRequest(input: GoDeeperRequestInput): { system: string; userMessage: string } {
  const angles = goDeeperAnglesFor(input.draw)
    .map((angle, index) => `${index + 1}. ${angle.instruction}`)
    .join('\n');
  const recent = uniqueLines(
    input.recentPrompts.map((prompt) => sanitizeForPrompt(prompt, 300)),
    GO_DEEPER_RECENT_LIMIT,
  );

  const parts = [
    `Devotional: "${sanitizeForPrompt(input.devotionalTitle, 200)}"
Day: "${sanitizeForPrompt(input.dayTitle, 200)}"
Scripture: ${sanitizeForPrompt(input.scriptureReference, 200)}

Their journal entry:
"${sanitizeForPrompt(input.entryText, 2000)}"`,
    `ANGLES FOR THESE THREE PROMPTS:\n${angles}`,
    avoidBlock('RECENT PROMPTS (do not reuse their wording or their first words):', recent),
  ].filter(Boolean);

  return { system: GO_DEEPER_SYSTEM_PROMPT, userMessage: parts.join('\n\n') };
}
