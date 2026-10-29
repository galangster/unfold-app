import { Platform } from 'react-native';
import type { CompanionMessage } from './companion-chat-store';
import { COMPANION_ERROR_CONNECTION } from './companion-error-copy';

/**
 * Crisis words in the reader's own writing, and the lines that answer them.
 *
 * The word lists and the matching mirror the backend's Companion check
 * (`src/routes/companion.ts` in unfold-backend, PR #137): a phrase counts when
 * it appears in the lowercase text or in a copy with leet-speak and spaced-out
 * letters undone. Keep the two lists in step. Spaced letters give two forms,
 * as in the backend since PR #141: the whole run joined ("s u i c i d e"), and
 * the letters joined in pairs, which keeps spelled-out two-letter words apart
 * ("o f m y" reads "of my"). Since the backend's spelled-phrase fix, an
 * underscore separates letters like a space ("s_u_i_c_i_d_e"), and a phrase
 * also counts when its letters alone appear inside one spelled-out run
 * ("k i l l m y s e l f"). Only spelled runs get that letters-only check,
 * never the whole text.
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

/** The text forms to search, and each spelled-out run as letters alone. */
type Normalized = { forms: string[]; spelledRuns: string[] };

/**
 * Undoes leet speak ("su1c1de") and spaced-out letters ("s u i c i d e").
 * Spaced letters give two forms, because a space can split a word or end one.
 */
function normalize(text: string): Normalized {
  const normalized = text
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
    .replace(/vv/g, 'w')
    // "_" is a word character, so "s_u_i_c_i_d_e" has no word breaks without this.
    .replace(/_/g, ' ');
  // A run of single letters spells one word: "s u i c i d e", "s.u.i.c.i.d.e".
  const spelledRuns: string[] = [];
  const runs = normalized.replace(/\b\w(?:[.\-_\s]+\w\b)+/g, (run) => {
    const joined = run.replace(/[.\-_\s]+/g, '');
    if (/^[a-z]+$/.test(joined)) spelledRuns.push(joined);
    return joined;
  });
  // Joined in pairs, spelled-out two-letter words stay apart: "o f m y" reads "of my".
  let pairs = normalized;
  let prev;
  do {
    prev = pairs;
    pairs = pairs.replace(/\b(\w)[.\-_\s]+(\w)\b/g, '$1$2');
  } while (pairs !== prev);
  return { forms: [runs, pairs].map((form) => form.replace(/\s+/g, ' ').trim()), spelledRuns };
}

/** A phrase as letters alone: "don't want to live" reads "dontwanttolive". */
const compact = (word: string) => word.replace(/[^a-z]/g, '');

export type CrisisMentions = { selfHarm: boolean; abuse: boolean };

export const NO_CRISIS: CrisisMentions = { selfHarm: false, abuse: false };

export function crisisMentions(text: string): CrisisMentions {
  if (!text) return NO_CRISIS;
  const lower = text.replace(APOSTROPHES, "'").toLowerCase();
  const { forms, spelledRuns } = normalize(lower);
  const all = [lower, ...forms];
  // A whole phrase spelled out joins into one run: "k i l l m y s e l f".
  const names = (words: readonly string[]) =>
    words.some((word) => all.some((form) => form.includes(word))
      || spelledRuns.some((run) => run.includes(compact(word))));
  return { selfHarm: names(SELF_HARM_WORDS), abuse: names(ABUSE_WORDS) };
}

export function namesCrisis(mentions: CrisisMentions): boolean {
  return mentions.selfHarm || mentions.abuse;
}

/** The crisis words in everything the reader wrote in a conversation. */
export function conversationCrisis(
  messages: readonly Pick<CompanionMessage, 'role' | 'content'>[],
): CrisisMentions {
  return crisisMentions(messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join('\n'));
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
  // iOS reads the body after "&", Android after "?".
  text741741: Platform.OS === 'ios' ? 'sms:741741&body=HOME' : 'sms:741741?body=HOME',
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

export type CrisisFailure = {
  kind: 'none' | 'lines' | 'reply';
  patch: Partial<CompanionMessage>;
  /** What a screen reader hears about help: the added lines or the crisis reply. */
  spoken: string;
};

/**
 * The patch for a failed reply. In a conversation where the reader named
 * suicide, self-harm or abuse, help cannot wait on the network: a partial
 * reply keeps its error state with the crisis lines added ('lines'), and a
 * failure with no text becomes the crisis reply ('reply'). Both stay
 * interrupted errors, so the reply text shows with Retry under it.
 */
export function crisisFailure(
  messages: readonly CompanionMessage[],
  patch: Partial<CompanionMessage>,
  partial: string,
): CrisisFailure {
  const crisis = conversationCrisis(messages);
  if (!namesCrisis(crisis)) return { kind: 'none', patch, spoken: '' };
  if (partial) {
    return {
      kind: 'lines',
      patch: { ...patch, content: withCrisisLines(partial, crisis.abuse) },
      spoken: withCrisisLines('', crisis.abuse),
    };
  }
  return {
    kind: 'reply',
    patch: {
      content: CRISIS_REPLY,
      status: 'error',
      suggestions: [],
      deepLinks: [],
      interrupted: true,
      // Retry shows only under a non-empty error line. A plain error row
      // stores its error in `content`, which the crisis reply replaces.
      errorCopy: patch.errorCopy || (patch.interrupted ? undefined : patch.content) || COMPANION_ERROR_CONNECTION,
    },
    spoken: CRISIS_REPLY,
  };
}
