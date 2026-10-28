/**
 * Crisis words in the reader's own writing, and the lines that answer them.
 *
 * The word lists and the matching mirror the backend's Companion check
 * (`src/routes/companion.ts` in unfold-backend, PR #137): a phrase counts when
 * it appears in the lowercase text or in a copy with leet-speak and spaced-out
 * letters undone. Keep the two lists in step.
 */

const SELF_HARM_WORDS = [
  'suicide',
  'kill myself',
  'want to die',
  'end my life',
  'self-harm',
  'cutting myself',
  "don't want to live",
  'better off dead',
  'no reason to live',
  'harm myself',
  'end it all',
  'not worth living',
  'suicidal',
  'self harm',
  'killing myself',
  'take my life',
  'take my own life',
  'end my own life',
] as const;

const ABUSE_WORDS = [
  'hits me',
  'beats me',
  'abuses me',
  'being abused',
  'domestic violence',
  'he hurts me',
  'she hurts me',
  'scared of my partner',
  'afraid to go home',
] as const;

/** Curly and other apostrophes the keyboard can type for "don't". */
const APOSTROPHES = /[‘’ʼ`´＇]| ́/g;

/** Undoes leet speak ("su1c1de") and spaced-out letters ("s u i c i d e"). */
function normalize(text: string): string {
  let normalized = text
    .toLowerCase()
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[0@]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7+]/g, 't')
    .replace(/[4]/g, 'a')
    .replace(/[8]/g, 'b')
    .replace(/[9]/g, 'g')
    .replace(/\b2\b/g, 'to')
    .replace(/ph/g, 'f')
    .replace(/vv/g, 'w');
  let previous;
  do {
    previous = normalized;
    normalized = normalized.replace(/\b(\w)[.\-_\s]+(\w)\b/g, '$1$2');
  } while (normalized !== previous);
  return normalized.replace(/\s+/g, ' ').trim();
}

export type CrisisMentions = { selfHarm: boolean; abuse: boolean };

export const NO_CRISIS: CrisisMentions = { selfHarm: false, abuse: false };

export function crisisMentions(text: string): CrisisMentions {
  if (!text) return NO_CRISIS;
  const lower = text.replace(APOSTROPHES, "'").toLowerCase();
  const normalized = normalize(lower);
  const names = (words: readonly string[]) =>
    words.some((word) => lower.includes(word) || normalized.includes(word));
  return { selfHarm: names(SELF_HARM_WORDS), abuse: names(ABUSE_WORDS) };
}

export function namesCrisis(mentions: CrisisMentions): boolean {
  return mentions.selfHarm || mentions.abuse;
}

export const CRISIS_LINES =
  'If you are thinking about ending your life or harming yourself, please call or text 988 (Suicide and Crisis Lifeline) or text HOME to 741741 (Crisis Text Line).';
export const ABUSE_LINE =
  'If you are not safe at home, call the National Domestic Violence Hotline at 1-800-799-7233.';

/**
 * Appends the crisis lines the text does not already give: 988 and 741741
 * always, and the domestic violence hotline when `abuse` is set.
 */
export function withCrisisLines(text: string, abuse = false): string {
  const missing = [
    /\b988\b/.test(text) && text.includes('741741') ? null : CRISIS_LINES,
    abuse && !text.includes('799-7233') ? ABUSE_LINE : null,
  ].filter((line) => line !== null);
  if (missing.length === 0) return text;
  return text ? `${text}\n\n${missing.join(' ')}` : missing.join(' ');
}

/** Phone and message links the crisis card opens. */
export const CRISIS_LINKS = {
  call988: 'tel:988',
  text741741: 'sms:741741&body=HOME',
  callAbuseHotline: 'tel:18007997233',
} as const;

/**
 * The reply a crisis conversation gets when no reply reaches the device. It
 * mirrors the server's own crisis reply.
 */
export const CRISIS_REPLY =
  "I couldn't send a reply just now, and I don't want to leave you without help. " +
  `${CRISIS_LINES} ${ABUSE_LINE} ` +
  'Please reach out today to a pastor, a counselor, or someone you trust. You do not have to carry this alone.';
