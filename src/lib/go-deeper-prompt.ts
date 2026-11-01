/**
 * The Go Deeper request: three follow-up prompts for a freewrite journal
 * entry.
 *
 * It used to ask for the same three angles every time (feeling, life,
 * imagination), each steered by a quoted opener, and it never sent the
 * prompts the reader already had. Now each request's three angles come from
 * the bag, each described by what it does, and the reader's recent prompts go
 * with the request so the model does not write them again.
 */

import { buildPromptWithPersona } from '@/constants/persona';
import { sanitizeForPrompt } from '@/lib/api-config';
import { lifecycleTimestampMs } from '@/lib/devotional-lifecycle';
import { avoidList, isString } from '@/lib/prompt-history';
import { goDeeperAnglesFor } from '@/lib/prompt-variety';
import type { JournalEntry } from '@/lib/store';

/** About three requests' worth of earlier prompts. */
const GO_DEEPER_RECENT_LIMIT = 9;

const GO_DEEPER_INSTRUCTIONS = `WHAT YOU'RE DOING: Generate exactly 3 follow-up reflection prompts based on someone's journal entry about their devotional.

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

const GO_DEEPER_SYSTEM_PROMPT = buildPromptWithPersona('brief', GO_DEEPER_INSTRUCTIONS);

/**
 * The entries that hold Go Deeper prompts, newest first. An entry's
 * `updatedAt` moves when its prompts are saved, so an old entry that just got
 * prompts counts as recent. Each timestamp is parsed once.
 *
 * A saved prompt that is not a string, from a malformed reply or a sync row,
 * stays out of the request, which would otherwise throw on it. Its entry
 * still counts as a saved request, so the angles do not move.
 */
function promptedNewestFirst(entries: readonly JournalEntry[]): { prompts: string[]; time: number }[] {
  return entries
    .flatMap((entry) =>
      entry.deeperQuestions?.length
        ? [{
          prompts: entry.deeperQuestions.filter(isString),
          time: lifecycleTimestampMs(entry.updatedAt || entry.createdAt),
        }]
        : [],
    )
    .sort((a, b) => b.time - a.time);
}

function newestPrompts(prompted: readonly { prompts: string[] }[]): string[] {
  const recent: string[] = [];
  for (const { prompts } of prompted) {
    for (const prompt of prompts) {
      if (recent.length >= GO_DEEPER_RECENT_LIMIT) return recent;
      recent.push(prompt);
    }
  }
  return recent;
}

export interface GoDeeperRequestInput {
  devotionalTitle: string;
  dayTitle: string;
  scriptureReference: string;
  entryText: string;
  /** Every journal entry: their saved prompts are the avoid list, and their number is the draw. */
  journalEntries: readonly JournalEntry[];
  /** The install's seed (copySeed). */
  seed: string;
}

export function buildGoDeeperRequest(input: GoDeeperRequestInput): { system: string; userMessage: string } {
  const prompted = promptedNewestFirst(input.journalEntries);
  // The draw counts requests, not days: each saved set of prompts moves the
  // next request on, so two requests in one sitting never share an angle.
  const angles = goDeeperAnglesFor({ seed: input.seed, dayIndex: prompted.length })
    .map((angle, index) => `${index + 1}. ${angle.instruction}`)
    .join('\n');

  const parts = [
    `Devotional: "${sanitizeForPrompt(input.devotionalTitle, 200)}"
Day: "${sanitizeForPrompt(input.dayTitle, 200)}"
Scripture: ${sanitizeForPrompt(input.scriptureReference, 200)}

Their journal entry:
"${sanitizeForPrompt(input.entryText, 2000)}"`,
    `ANGLES FOR THESE THREE PROMPTS:\n${angles}`,
    avoidList('RECENT PROMPTS (do not reuse their wording or their first words):', newestPrompts(prompted), 300),
  ].filter(Boolean);

  return { system: GO_DEEPER_SYSTEM_PROMPT, userMessage: parts.join('\n\n') };
}
